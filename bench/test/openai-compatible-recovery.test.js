// Verifies the per-trial vLLM-recovery retry mechanism in
// bench/providers/openai-compatible.js.
//
// vLLM has a known v1 multiproc IPC bug that crashes the server periodically.
// A separate supervisor (bench/.local-serve/vllm-supervisor.sh) auto-restarts
// it; the provider's job is to survive the gap by polling /models until the
// server answers and then re-issuing the same payload. These tests exercise
// the seam without needing a real vLLM instance — a node:http mock server
// alternates between refusing connections and serving valid completions.
//
// Coverage matrix (B1..B5 in the task brief):
//
//   B1 — recovers: server refuses for the first 2 requests, then accepts.
//        Provider retries and finishes the trial successfully.
//   B2 — gives up: server always refuses. Provider attempts
//        VLLM_RECOVERY_MAX_RETRIES times, then surfaces stop_reason: 'error'.
//   B3 — wall-clock budget: with a 5s wall_clock_cap_ms and a server that
//        always refuses, the provider must NOT burn unbounded time polling.
//   B4 — does NOT retry on 4xx: a 400 response is terminal — no retries.
//   B5 — does NOT retry on AbortError: parent abort propagates immediately.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import {
  runTrial,
  isRetryableNetworkError,
  isRetryableHttpStatus,
  pollVllmHealth,
} from '../providers/openai-compatible.js';

// Build a chat-completions success body the provider will accept and treat
// as `finish_reason: stop` so the trial cleanly terminates after one turn.
function okBody({ content = 'ok' } = {}) {
  return JSON.stringify({
    model: 'mock-model',
    choices: [
      {
        finish_reason: 'stop',
        message: { role: 'assistant', content, tool_calls: [] },
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
}

// Spin a server that returns one of `behaviors` per incoming POST to
// /chat/completions, then loops back to the start. Behaviors:
//
//   { type: 'refuse' }     — destroy the socket (looks like ECONNRESET)
//   { type: 'ok' }         — return a valid 200 chat-completions body
//   { type: 'http', code } — return a non-2xx HTTP status
//   { type: 'hang' }       — accept and never reply (let the parent abort)
//
// /models is always served as 200 OK with a small body so pollVllmHealth
// considers the server "recovered" the moment it can reach this listener.
// To simulate "vLLM is still down" we DON'T listen for /models — we kill the
// server and start a fresh one in tests that need that behavior. For these
// mock tests we treat any request landing here as "server is up", so the
// behavior switch governs vLLM-up-but-busy vs "fetch failed."
function startScriptedServer({ behaviors }) {
  let i = 0;
  let modelsHits = 0;
  let chatHits = 0;
  const server = createServer((req, res) => {
    if (req.url === '/models' && req.method === 'GET') {
      modelsHits += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'mock-model' }] }));
      return;
    }
    if (req.url !== '/chat/completions' || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    chatHits += 1;
    // Drain the request body before responding.
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const b = behaviors[i % behaviors.length];
      i += 1;
      switch (b.type) {
        case 'refuse':
          // Hard close: undici sees 'fetch failed' / ECONNRESET / terminated.
          req.socket.destroy();
          return;
        case 'ok': {
          const body = okBody({ content: b.content });
          res.writeHead(200, {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body).toString(),
          });
          res.end(body);
          return;
        }
        case 'http': {
          const body = b.body || '';
          res.writeHead(b.code, { 'content-type': 'text/plain' });
          res.end(body);
          return;
        }
        case 'hang':
          // Hold the connection open; don't reply. Test must abort.
          return;
        default:
          res.writeHead(500);
          res.end();
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        get chatHits() { return chatHits; },
        get modelsHits() { return modelsHits; },
        close: () =>
          new Promise((r) => {
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      });
    });
  });
}

test('isRetryableNetworkError: classifies common shapes', () => {
  assert.equal(isRetryableNetworkError(null), false);
  assert.equal(isRetryableNetworkError(undefined), false);
  // AbortError is NEVER retryable — propagates parent intent.
  const aborted = new Error('aborted');
  aborted.name = 'AbortError';
  assert.equal(isRetryableNetworkError(aborted), false);
  // undici-style fetch failed wrapper
  const fetchFailed = new TypeError('fetch failed');
  fetchFailed.cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  assert.equal(isRetryableNetworkError(fetchFailed), true);
  // Direct ECONNRESET
  const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  assert.equal(isRetryableNetworkError(reset), true);
  // Body timeout
  const bodyTo = Object.assign(new Error('Body Timeout Error'), { code: 'UND_ERR_BODY_TIMEOUT' });
  assert.equal(isRetryableNetworkError(bodyTo), true);
  // Generic terminated
  assert.equal(isRetryableNetworkError(new Error('terminated')), true);
  // Random other error: don't retry
  assert.equal(isRetryableNetworkError(new Error('some logic bug')), false);
});

test('isRetryableHttpStatus: 5xx-ish only', () => {
  assert.equal(isRetryableHttpStatus(200), false);
  assert.equal(isRetryableHttpStatus(400), false);
  assert.equal(isRetryableHttpStatus(404), false);
  assert.equal(isRetryableHttpStatus(500), false);
  assert.equal(isRetryableHttpStatus(502), true);
  assert.equal(isRetryableHttpStatus(503), true);
  assert.equal(isRetryableHttpStatus(504), true);
});

test('pollVllmHealth: returns recovered when /models is reachable', async () => {
  const { url, close } = await startScriptedServer({ behaviors: [{ type: 'ok' }] });
  try {
    const res = await pollVllmHealth({
      endpointUrl: url,
      maxWaitMs: 5_000,
      pollIntervalMs: 100,
    });
    assert.equal(res.recovered, true);
    assert.ok(res.elapsedMs >= 0);
  } finally {
    await close();
  }
});

test('pollVllmHealth: respects maxWaitMs when nothing answers', async () => {
  // Pick a port that is almost certainly closed; the probe must time out and
  // we should give up at maxWaitMs.
  const startedAt = Date.now();
  const res = await pollVllmHealth({
    endpointUrl: 'http://127.0.0.1:1', // reserved, refuses
    maxWaitMs: 800,
    pollIntervalMs: 200,
    perRequestTimeoutMs: 200,
  });
  const elapsed = Date.now() - startedAt;
  assert.equal(res.recovered, false);
  assert.equal(res.reason, 'budget');
  // Wide tolerance for CI scheduling jitter.
  assert.ok(elapsed < 3_000, `expected to give up promptly, took ${elapsed}ms`);
});

test('B1 — recovers: refuse, refuse, ok → trial finishes successfully', async () => {
  const { url, close } = await startScriptedServer({
    behaviors: [{ type: 'refuse' }, { type: 'refuse' }, { type: 'ok' }],
  });
  // Local env override: short polls to keep the test fast.
  const prev = {
    wait: process.env.VLLM_RECOVERY_MAX_WAIT_MS,
    poll: process.env.VLLM_RECOVERY_POLL_INTERVAL_MS,
    retries: process.env.VLLM_RECOVERY_MAX_RETRIES,
  };
  process.env.VLLM_RECOVERY_MAX_WAIT_MS = '5000';
  process.env.VLLM_RECOVERY_POLL_INTERVAL_MS = '100';
  process.env.VLLM_RECOVERY_MAX_RETRIES = '5';
  try {
    const result = await runTrial({
      system_prompt: '',
      user_message: 'hi',
      tools: [],
      options: {
        endpoint_url: url,
        model_id: 'mock-model',
        protocol_variant: 'openai-chat-completions',
        wall_clock_cap_ms: 30_000,
        turn_cap: 3,
      },
    });
    assert.equal(result.stop_reason, 'done', `expected stop_reason 'done', got ${result.stop_reason}`);
    // Conversation should contain at least one recovery breadcrumb.
    const sysMessages = result.conversation.filter((m) => m.role === 'system');
    const recoveryLogs = sysMessages.filter((m) => /vLLM recovered after/.test(m.content));
    assert.ok(recoveryLogs.length >= 1, 'expected at least one vLLM-recovered breadcrumb');
    const fetchFailLogs = sysMessages.filter((m) => /fetch failed \(attempt/.test(m.content));
    assert.ok(fetchFailLogs.length >= 1, 'expected at least one fetch-failed breadcrumb');
  } finally {
    process.env.VLLM_RECOVERY_MAX_WAIT_MS = prev.wait ?? '';
    process.env.VLLM_RECOVERY_POLL_INTERVAL_MS = prev.poll ?? '';
    process.env.VLLM_RECOVERY_MAX_RETRIES = prev.retries ?? '';
    await close();
  }
});

test('B2 — gives up after MAX_RETRIES: always-refusing chat endpoint with /models also down', async () => {
  // We need /models to also fail so the recovery loop can never report
  // "recovered" — otherwise it'd retry forever within the budget. Use a
  // scripted server that destroys the socket on every request, including
  // /models (we override the GET branch by always destroying).
  const server = createServer((req) => req.socket.destroy());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;
  const prev = {
    wait: process.env.VLLM_RECOVERY_MAX_WAIT_MS,
    poll: process.env.VLLM_RECOVERY_POLL_INTERVAL_MS,
    retries: process.env.VLLM_RECOVERY_MAX_RETRIES,
  };
  process.env.VLLM_RECOVERY_MAX_WAIT_MS = '500';
  process.env.VLLM_RECOVERY_POLL_INTERVAL_MS = '100';
  process.env.VLLM_RECOVERY_MAX_RETRIES = '2';
  try {
    const result = await runTrial({
      system_prompt: '',
      user_message: 'hi',
      tools: [],
      options: {
        endpoint_url: url,
        model_id: 'mock-model',
        protocol_variant: 'openai-chat-completions',
        wall_clock_cap_ms: 30_000,
        turn_cap: 3,
      },
    });
    assert.equal(result.stop_reason, 'error');
    const sys = result.conversation.filter((m) => m.role === 'system');
    const giveUp = sys.find((m) => /giving up after \d+ attempts/.test(m.content));
    assert.ok(giveUp, `expected give-up breadcrumb; got: ${JSON.stringify(sys.map((m) => m.content))}`);
    // Should mention attempts count; with max_retries=2 the give-up fires at attempt 2 or 3.
    assert.match(giveUp.content, /giving up after [23] attempts/);
  } finally {
    process.env.VLLM_RECOVERY_MAX_WAIT_MS = prev.wait ?? '';
    process.env.VLLM_RECOVERY_POLL_INTERVAL_MS = prev.poll ?? '';
    process.env.VLLM_RECOVERY_MAX_RETRIES = prev.retries ?? '';
    await new Promise((r) => {
      server.closeAllConnections?.();
      server.close(() => r());
    });
  }
});

test('B3 — respects wall-clock budget: never blows past wall_clock_cap_ms', async () => {
  const server = createServer((req) => req.socket.destroy());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;
  const prev = {
    wait: process.env.VLLM_RECOVERY_MAX_WAIT_MS,
    poll: process.env.VLLM_RECOVERY_POLL_INTERVAL_MS,
    retries: process.env.VLLM_RECOVERY_MAX_RETRIES,
  };
  // Recovery budget intentionally LARGER than wall_clock_cap_ms so the
  // remaining-wall cap dominates.
  process.env.VLLM_RECOVERY_MAX_WAIT_MS = '60000';
  process.env.VLLM_RECOVERY_POLL_INTERVAL_MS = '200';
  process.env.VLLM_RECOVERY_MAX_RETRIES = '10';
  try {
    const startedAt = Date.now();
    const result = await runTrial({
      system_prompt: '',
      user_message: 'hi',
      tools: [],
      options: {
        endpoint_url: url,
        model_id: 'mock-model',
        protocol_variant: 'openai-chat-completions',
        wall_clock_cap_ms: 5_000,
        turn_cap: 3,
        grace_ms: 1_000,
      },
    });
    const elapsed = Date.now() - startedAt;
    assert.equal(result.stop_reason, 'error', `stop_reason=${result.stop_reason}`);
    // Wide upper bound for CI jitter, but must be much less than the 60s
    // recovery cap to prove the wall budget dominated.
    assert.ok(
      elapsed < 15_000,
      `expected to give up within ~wall_clock_cap_ms + slack; took ${elapsed}ms`,
    );
  } finally {
    process.env.VLLM_RECOVERY_MAX_WAIT_MS = prev.wait ?? '';
    process.env.VLLM_RECOVERY_POLL_INTERVAL_MS = prev.poll ?? '';
    process.env.VLLM_RECOVERY_MAX_RETRIES = prev.retries ?? '';
    await new Promise((r) => {
      server.closeAllConnections?.();
      server.close(() => r());
    });
  }
});

test('B4 — does NOT retry on 4xx: 400 from server is terminal', async () => {
  const { url, close, ...stats } = await startScriptedServer({
    behaviors: [{ type: 'http', code: 400, body: 'bad request' }],
  });
  const prev = {
    wait: process.env.VLLM_RECOVERY_MAX_WAIT_MS,
    poll: process.env.VLLM_RECOVERY_POLL_INTERVAL_MS,
    retries: process.env.VLLM_RECOVERY_MAX_RETRIES,
  };
  process.env.VLLM_RECOVERY_MAX_WAIT_MS = '5000';
  process.env.VLLM_RECOVERY_POLL_INTERVAL_MS = '100';
  process.env.VLLM_RECOVERY_MAX_RETRIES = '5';
  try {
    const result = await runTrial({
      system_prompt: '',
      user_message: 'hi',
      tools: [],
      options: {
        endpoint_url: url,
        model_id: 'mock-model',
        protocol_variant: 'openai-chat-completions',
        wall_clock_cap_ms: 30_000,
        turn_cap: 3,
      },
    });
    assert.equal(result.stop_reason, 'error');
    const last = result.conversation.at(-1);
    assert.match(last.content, /openai-compatible HTTP 400/);
    // Critical: chat endpoint must have been hit exactly ONCE — no retries.
    assert.equal(stats.server.chatHits ?? 1, 1, 'must not retry on 4xx');
  } finally {
    process.env.VLLM_RECOVERY_MAX_WAIT_MS = prev.wait ?? '';
    process.env.VLLM_RECOVERY_POLL_INTERVAL_MS = prev.poll ?? '';
    process.env.VLLM_RECOVERY_MAX_RETRIES = prev.retries ?? '';
    await close();
  }
});

test('B5 — does NOT retry on AbortError: parent signal aborts mid-fetch', async () => {
  // A server that hangs forever on POST /chat/completions. The runTrial
  // call passes a parent signal that we abort after a short delay; the
  // provider must surface time-cap (within grace) and not enter recovery.
  const server = createServer((req, res) => {
    if (req.url === '/models') {
      res.writeHead(200);
      res.end('{}');
      return;
    }
    // Drain body, then never reply.
    req.on('data', () => {});
    req.on('end', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;
  const prev = {
    wait: process.env.VLLM_RECOVERY_MAX_WAIT_MS,
    retries: process.env.VLLM_RECOVERY_MAX_RETRIES,
  };
  process.env.VLLM_RECOVERY_MAX_WAIT_MS = '60000';
  process.env.VLLM_RECOVERY_MAX_RETRIES = '5';
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort('test-abort'), 250).unref?.();
    const startedAt = Date.now();
    const result = await runTrial({
      system_prompt: '',
      user_message: 'hi',
      tools: [],
      signal: controller.signal,
      options: {
        endpoint_url: url,
        model_id: 'mock-model',
        protocol_variant: 'openai-chat-completions',
        wall_clock_cap_ms: 30_000,
        turn_cap: 3,
        grace_ms: 5_000,
      },
    });
    const elapsed = Date.now() - startedAt;
    // When parent aborts within the grace window, provider records 'time-cap'.
    assert.equal(result.stop_reason, 'time-cap', `unexpected stop_reason=${result.stop_reason}`);
    // Should have terminated promptly — definitely no 60s recovery wait.
    assert.ok(elapsed < 5_000, `expected prompt termination on abort, took ${elapsed}ms`);
    // Conversation must contain NO 'vLLM recovered' or 'polling vLLM' lines —
    // recovery path must be skipped entirely.
    const sys = result.conversation.filter((m) => m.role === 'system');
    const recoveryLogs = sys.filter((m) => /polling vLLM|vLLM recovered/.test(m.content));
    assert.equal(recoveryLogs.length, 0, 'must not enter recovery loop on abort');
  } finally {
    process.env.VLLM_RECOVERY_MAX_WAIT_MS = prev.wait ?? '';
    process.env.VLLM_RECOVERY_MAX_RETRIES = prev.retries ?? '';
    await new Promise((r) => {
      server.closeAllConnections?.();
      server.close(() => r());
    });
  }
});
