// Verifies the undici dispatcher installed by bench/providers/_fetch-config.mjs
// actually controls the fetch body timeout, and that the default dispatcher
// is generous enough to outlast realistic vLLM response delays.
//
// Background: Node's built-in fetch (undici) defaults to bodyTimeout=300_000ms
// (5 min). When vLLM takes longer than that on a single request — common at
// 64K+ contexts — undici throws `fetch failed` and the bench logs
// `stop_reason: error`. The fix installs a global undici Agent with
// bodyTimeout=30 min so the bench's own wall-clock cap is the real budget.
//
// Strategy
// --------
// We can't wait 5 minutes in CI. Instead we exercise the dispatcher seam:
//
//   1. Spin a tiny node:http server that delays writing the body chunk.
//   2. Install a dispatcher with a tiny bodyTimeout (e.g. 200ms). The
//      1500ms body delay must trigger undici's bodyTimeout — runTrial
//      returns stop_reason: 'error' with a fetch-error breadcrumb.
//   3. Restore the bench default dispatcher (30-min bodyTimeout) and re-run
//      against the same delayed server with a shorter delay. runTrial
//      returns stop_reason: 'done'.
//
// If step 2 returns 'done', the dispatcher isn't being honored. If step 3
// returns 'error', the default dispatcher isn't being installed. Both are
// regressions on the fix.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { runTrial } from '../providers/openai-compatible.js';
import {
  installDispatcher,
  restoreOriginalDispatcher,
  buildBenchAgent,
  applyDefaultDispatcher,
} from '../providers/_fetch-config.mjs';

// Spin an http server that returns a valid OpenAI chat-completions response
// after `bodyDelayMs` ms (delay applied between flushing headers and writing
// the body — exercising undici's bodyTimeout, not headersTimeout).
function startDelayedServer({ bodyDelayMs }) {
  const server = createServer((req, res) => {
    const bodyChunks = [];
    req.on('data', (c) => bodyChunks.push(c));
    req.on('end', () => {
      const responseBody = JSON.stringify({
        model: 'mock-model',
        choices: [
          {
            finish_reason: 'stop',
            message: { role: 'assistant', content: 'ok', tool_calls: [] },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
      // Flush headers immediately, delay body — this hits bodyTimeout.
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(responseBody).toString(),
      });
      res.flushHeaders();
      setTimeout(() => {
        res.end(responseBody);
      }, bodyDelayMs);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((r) => {
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      });
    });
  });
}

test('openai-compatible: tight global bodyTimeout surfaces fetch error', async () => {
  // Server holds the body open for 1500ms. Dispatcher bodyTimeout=200ms must
  // fire well before then. Wide margins on both sides avoid CI flakes.
  const { url, close } = await startDelayedServer({ bodyDelayMs: 1500 });
  try {
    installDispatcher(buildBenchAgent({ bodyTimeoutMs: 200, headersTimeoutMs: 5_000 }));
    const result = await runTrial({
      system_prompt: '',
      user_message: 'hi',
      tools: [],
      options: {
        endpoint_url: url,
        model_id: 'mock-model',
        protocol_variant: 'openai-chat-completions',
        wall_clock_cap_ms: 60_000,
        turn_cap: 1,
      },
    });
    assert.equal(
      result.stop_reason,
      'error',
      'expected stop_reason "error" when undici bodyTimeout fires before body arrives',
    );
    const last = result.conversation.at(-1);
    assert.equal(last.role, 'system');
    // bodyTimeout may fire either before headers are observed (fetch rejects)
    // or after fetch resolves but before the body finishes (response.json
    // throws). Both paths set stop_reason: 'error' and tag the conversation
    // with the underlying error message — accept either breadcrumb.
    assert.match(
      last.content,
      /openai-compatible (fetch error|JSON parse error)/,
      'expected the fetch-error or JSON-parse-error breadcrumb in the conversation tail',
    );
    assert.match(
      last.content,
      /terminated|Body Timeout|fetch failed/i,
      'expected the breadcrumb to mention the underlying timeout/termination',
    );
  } finally {
    restoreOriginalDispatcher();
    applyDefaultDispatcher();
    await close();
  }
});

test('openai-compatible: bench default dispatcher comfortably outlasts a slow body', async () => {
  // The default Agent installed by _fetch-config.mjs has a 30-min bodyTimeout.
  // A 300ms body delay is several orders of magnitude under that — must succeed.
  const { url, close } = await startDelayedServer({ bodyDelayMs: 300 });
  try {
    // Make sure the default dispatcher is in place (in case a prior test
    // swapped it and didn't restore for some reason).
    restoreOriginalDispatcher();
    applyDefaultDispatcher();
    const result = await runTrial({
      system_prompt: '',
      user_message: 'hi',
      tools: [],
      options: {
        endpoint_url: url,
        model_id: 'mock-model',
        protocol_variant: 'openai-chat-completions',
        wall_clock_cap_ms: 60_000,
        turn_cap: 1,
      },
    });
    assert.equal(
      result.stop_reason,
      'done',
      'default dispatcher should comfortably outlast a 300ms body delay',
    );
    assert.equal(result.tokens_input, 1);
    assert.equal(result.tokens_output, 1);
  } finally {
    await close();
  }
});
