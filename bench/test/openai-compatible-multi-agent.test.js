// Live multi-agent dispatch through the openai-compatible provider.
//
// Spec: doc/specs/2026-05-13-bench-multi-agent-topology.spec.md
//   B4 / B5 / B6 — orchestrator decomposition, fresh subagent contexts,
//   merged trial dir.
//
// Strategy
// --------
// Spin a tiny node:http server that mocks vLLM's /chat/completions endpoint.
// The mock inspects the request body to decide which response shape to return:
//
//   - Orchestrator turn (sees `dispatch_subagent` in tools[]) → returns two
//     `dispatch_subagent` tool calls.
//   - Subagent turn (no `dispatch_subagent` in tools[]) → returns a single
//     `write_source` tool call.
//
// Tests assert:
//   1. Orchestrator parses dispatch_subagent into subagent_dispatches[].
//   2. Subagent role strips dispatch_subagent from the request body even when
//      the runner accidentally passes it.
//   3. composeMultiAgentPrompt inlines the style card body in user_message
//      (Option B style-card injection — no read_file tool needed).
//   4. End-to-end: dispatchMultiAgentTrial with a mock vLLM behind the
//      openai-compatible provider produces the expected six trial-dir
//      artifacts and meta.json multi-agent fields.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { runTrial } from '../providers/openai-compatible.js';
import { dispatchMultiAgentTrial } from '../runner.js';
import { composeMultiAgentPrompt } from '../study.mjs';

// --- helpers ---------------------------------------------------------------

// A vLLM-shaped chat-completions mock. The `route` callback receives the
// parsed request body and returns the response body to send back. Keeping
// route logic per-test keeps each test's intent local.
function startMockVllm({ route }) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad json' }));
        return;
      }
      requests.push(body);
      const responseBody = route(body, requests.length - 1);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () =>
          new Promise((r) => {
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      });
    });
  });
}

// Build a vLLM-style chat-completions response with structured tool_calls.
function chatCompletionResponse({
  toolCalls = [],
  content = '',
  finishReason = 'stop',
  promptTokens = 10,
  completionTokens = 5,
} = {}) {
  return {
    model: 'mock-model',
    choices: [
      {
        finish_reason: finishReason,
        message: {
          role: 'assistant',
          content,
          tool_calls: toolCalls.map((c, i) => ({
            id: `call_${i}`,
            type: 'function',
            function: {
              name: c.name,
              arguments: JSON.stringify(c.arguments),
            },
          })),
        },
      },
    ],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

// Has the request advertised a tool with this name in tools[]?
function requestAdvertisesTool(reqBody, toolName) {
  if (!Array.isArray(reqBody?.tools)) return false;
  return reqBody.tools.some((t) => t?.function?.name === toolName);
}

// --- tests -----------------------------------------------------------------

test('B4: orchestrator parses dispatch_subagent tool calls into subagent_dispatches', async () => {
  // The mock returns two dispatch_subagent calls when called by the
  // orchestrator. The provider must surface them as a subagent_dispatches
  // array on its return shape.
  const { url, close, requests } = await startMockVllm({
    route: (body) => {
      if (requestAdvertisesTool(body, 'dispatch_subagent')) {
        return chatCompletionResponse({
          toolCalls: [
            {
              name: 'dispatch_subagent',
              arguments: {
                subagent_id: 'S1',
                brief: 'Implement the parser',
                artifacts_to_produce: ['source/parser.js'],
              },
            },
            {
              name: 'dispatch_subagent',
              arguments: {
                subagent_id: 'S2',
                brief: 'Implement the formatter',
                artifacts_to_produce: ['source/formatter.js', 'tests/formatter.test.js'],
              },
            },
          ],
        });
      }
      // Subagent path — should not happen in this test, but be safe.
      return chatCompletionResponse({ toolCalls: [], content: 'ok' });
    },
  });

  try {
    const result = await runTrial({
      role: 'orchestrator',
      system_prompt: 'orchestrator-system',
      user_message: 'decompose this',
      tools: [
        {
          type: 'function',
          function: {
            name: 'dispatch_subagent',
            description: 'Dispatch an implementer subagent.',
            parameters: {
              type: 'object',
              properties: {
                subagent_id: { type: 'string' },
                brief: { type: 'string' },
                artifacts_to_produce: { type: 'array', items: { type: 'string' } },
              },
              required: ['subagent_id', 'brief'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'write_source',
            description: 'Write a source file.',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' }, content: { type: 'string' } },
              required: ['path', 'content'],
            },
          },
        },
      ],
      options: {
        endpoint_url: url,
        model_id: 'mock-model',
        protocol_variant: 'openai-chat-completions',
        wall_clock_cap_ms: 30_000,
        turn_cap: 5,
      },
    });

    assert.ok(Array.isArray(result.subagent_dispatches), 'subagent_dispatches must be an array');
    assert.strictEqual(result.subagent_dispatches.length, 2);
    assert.strictEqual(result.subagent_dispatches[0].id, 'S1');
    assert.strictEqual(result.subagent_dispatches[0].user_message, 'Implement the parser');
    assert.deepStrictEqual(
      result.subagent_dispatches[0].artifacts_to_produce,
      ['source/parser.js'],
    );
    assert.strictEqual(result.subagent_dispatches[1].id, 'S2');
    assert.strictEqual(result.subagent_dispatches[1].user_message, 'Implement the formatter');
    assert.strictEqual(result.stop_reason, 'done');
    // Orchestrator stopped after one turn (saw dispatch and broke out).
    assert.strictEqual(requests.length, 1, 'orchestrator should issue exactly one request before yielding to runner');
  } finally {
    await close();
  }
});

test('subagent role strips dispatch_subagent from request body even if passed in tools', async () => {
  // Even if a caller incorrectly passes dispatch_subagent in the subagent's
  // tools[] array, the provider must filter it out before sending the
  // request — subagents must never be able to dispatch their own subagents.
  //
  // Mock returns write_source on the first call, then no-op stop on subsequent
  // calls (tool_choice='required' means each turn must include a tool, so the
  // provider keeps looping past the synthesized tool-result; the mock yields
  // an empty tool_calls list to signal completion).
  const { url, close, requests } = await startMockVllm({
    route: (_body, callIndex) => {
      if (callIndex === 0) {
        return chatCompletionResponse({
          toolCalls: [
            { name: 'write_source', arguments: { path: 'index.js', content: 'export {};' } },
          ],
          finishReason: 'tool_calls',
        });
      }
      return chatCompletionResponse({
        toolCalls: [],
        content: 'done',
        finishReason: 'stop',
      });
    },
  });

  try {
    const result = await runTrial({
      role: 'subagent',
      subagent_id: 'S1',
      system_prompt: 'sub-system',
      user_message: 'do the work',
      tools: [
        // Caller mistakenly passes dispatch_subagent — provider must strip it.
        {
          type: 'function',
          function: {
            name: 'dispatch_subagent',
            description: 'should be stripped',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
        {
          type: 'function',
          function: {
            name: 'write_source',
            description: 'Write a source file.',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' }, content: { type: 'string' } },
              required: ['path', 'content'],
            },
          },
        },
      ],
      options: {
        endpoint_url: url,
        model_id: 'mock-model',
        protocol_variant: 'openai-chat-completions',
        wall_clock_cap_ms: 30_000,
        turn_cap: 2,
      },
    });

    assert.strictEqual(result.stop_reason, 'done');
    assert.deepStrictEqual(result.source_files, { 'index.js': 'export {};' });
    // Verify the wire on EVERY request: tools[] omits dispatch_subagent for
    // subagent calls. (The provider may issue 1 or 2 requests depending on
    // how the loop terminates against the mock; both are valid — the load-
    // bearing assertion is "no dispatch_subagent on any subagent request.")
    assert.ok(requests.length >= 1);
    for (const req of requests) {
      assert.ok(
        !requestAdvertisesTool(req, 'dispatch_subagent'),
        'subagent request body must NOT advertise dispatch_subagent in tools[]',
      );
      assert.ok(
        requestAdvertisesTool(req, 'write_source'),
        'subagent request body must still advertise write_source',
      );
    }
    // Subagent role must not surface subagent_dispatches in the response.
    assert.strictEqual(result.subagent_dispatches, undefined);
  } finally {
    await close();
  }
});

test('Option B: composeMultiAgentPrompt inlines style-card body in orchestrator user_message', () => {
  // The B3 strategy is to pre-read the style card and inject it into the
  // orchestrator's user_message — sidestepping the need for a read_file
  // tool. This test verifies the contract: the orchestrator's user_message
  // contains the verbatim style-card body for non-baseline conditions.
  const repoRoot = process.cwd();
  const dtddCard = readFileSync(
    path.join(repoRoot, 'bench', 'styles', 'dtdd.md'),
    'utf8',
  ).trim();

  const composed = composeMultiAgentPrompt({
    condition: 'dtdd',
    task_id: 'slugify',
    repo_root: repoRoot,
  });

  assert.ok(
    composed.orchestrator_user_message.includes(dtddCard),
    'orchestrator user_message must inline the dtdd style-card body',
  );
  // The orchestrator's system_prompt MUST NOT contain the style-card body
  // (B3 / red-team resolution: topology helper stays methodology-neutral).
  assert.ok(
    !composed.orchestrator_system_prompt.includes(dtddCard),
    'orchestrator system_prompt must NOT contain the style-card body',
  );
  // Subagent prompt is the standard single-agent composition (style card +
  // tool-usage instructions + ESM/no-stub directives).
  assert.ok(
    composed.subagent_system_prompt.includes(dtddCard),
    'subagent system_prompt must contain the style-card body',
  );
  // Orchestrator tools include dispatch_subagent + write_source/write_test/run_tests.
  // run_tests was added post-lock so both orchestrator and subagents can verify
  // their own tests against their own source mid-trial.
  const orchToolNames = composed.orchestrator_tools.map((t) => t.function.name);
  assert.deepStrictEqual(
    orchToolNames.sort(),
    ['dispatch_subagent', 'run_tests', 'write_source', 'write_test'],
  );
  // Subagent tools omit dispatch_subagent but include run_tests.
  const subToolNames = composed.subagent_tools.map((t) => t.function.name);
  assert.deepStrictEqual(subToolNames.sort(), ['run_tests', 'write_source', 'write_test']);
});

test('Option B: composeMultiAgentPrompt user_message has no inline card body for baseline', () => {
  // Baseline has no style card — the orchestrator should still get a coherent
  // user_message (intent + an explicit "no methodology" note) so the
  // orchestrator's prompt assembly is robust to the missing-card case.
  const composed = composeMultiAgentPrompt({
    condition: 'baseline',
    task_id: 'slugify',
    repo_root: process.cwd(),
  });
  assert.ok(composed.orchestrator_user_message.length > 0);
  assert.match(composed.orchestrator_user_message, /no methodology|no specific methodology/i);
});

test('end-to-end: dispatchMultiAgentTrial with mock vLLM produces source/, tests/, meta.json with multi-agent fields', async () => {
  // Simulate the full live-vLLM flow without hitting real vLLM. The mock
  // distinguishes orchestrator vs subagent calls by inspecting whether
  // dispatch_subagent appears in tools[]. Two subagents — S1 writes
  // source/index.js, S2 writes tests/index.test.js.
  // Per-subagent call counters so each subagent stops after its first
  // tool-call turn (the synthesized tool-result loop would otherwise re-fetch
  // until turn-cap with the mock returning the same call repeatedly).
  const subagentCallCounts = new Map();
  const { url, close } = await startMockVllm({
    route: (body) => {
      if (requestAdvertisesTool(body, 'dispatch_subagent')) {
        // Orchestrator turn: dispatch two subagents.
        return chatCompletionResponse({
          toolCalls: [
            {
              name: 'dispatch_subagent',
              arguments: {
                subagent_id: 'S1',
                brief: 'Write source/index.js with slugify implementation',
              },
            },
            {
              name: 'dispatch_subagent',
              arguments: {
                subagent_id: 'S2',
                brief: 'Write tests/index.test.js covering edge cases',
              },
            },
          ],
          promptTokens: 200,
          completionTokens: 50,
        });
      }
      // Subagent turn: figure out which subagent by inspecting the user
      // message (the brief). S1 writes source, S2 writes tests. After the
      // first tool-call turn for each subagent, return an empty tool_calls
      // stop response so the subagent loop completes.
      const lastUser = body.messages?.findLast?.((m) => m.role === 'user');
      const brief = lastUser?.content ?? '';
      const subagentKey = brief.includes('source/index.js') ? 'S1' : 'S2';
      const seen = subagentCallCounts.get(subagentKey) ?? 0;
      subagentCallCounts.set(subagentKey, seen + 1);
      if (seen > 0) {
        return chatCompletionResponse({
          toolCalls: [],
          content: 'done',
          finishReason: 'stop',
          promptTokens: 0,
          completionTokens: 0,
        });
      }
      return chatCompletionResponse({
        toolCalls:
          subagentKey === 'S1'
            ? [
                {
                  name: 'write_source',
                  arguments: {
                    path: 'index.js',
                    content: 'export function slugify(s) { return String(s).toLowerCase(); }',
                  },
                },
              ]
            : [
                {
                  name: 'write_test',
                  arguments: {
                    path: 'index.test.js',
                    content:
                      'import { test } from "node:test";\nimport { slugify } from "../source/index.js";\ntest("slugify", () => slugify("Hi"));',
                  },
                },
              ],
        promptTokens: 30,
        completionTokens: 15,
        finishReason: 'tool_calls',
      });
    },
  });

  // Use a temp dir so we don't pollute bench/results/ for the test.
  const tmpRunId = `test-multi-${Date.now()}`;

  try {
    const result = await dispatchMultiAgentTrial({
      task_id: 'slugify',
      style: 'dtdd',
      trial_index: 0,
      run_id: tmpRunId,
      provider: {
        name: 'openai-compatible',
        endpoint_url: url,
        model_id: 'mock-model',
        protocol_variant: 'openai-chat-completions',
      },
      // Pre-compose so the test exercises the full study.mjs → runner →
      // provider chain. (composeMultiAgentPrompt is the function study.mjs
      // calls before dispatchMultiAgentTrial.)
      ...(() => {
        const composed = composeMultiAgentPrompt({
          condition: 'dtdd',
          task_id: 'slugify',
          repo_root: process.cwd(),
        });
        return {
          system_prompt: composed.orchestrator_system_prompt,
          user_message: composed.orchestrator_user_message,
          tools: composed.orchestrator_tools,
          subagent_system_prompt: composed.subagent_system_prompt,
          subagent_tools: composed.subagent_tools,
        };
      })(),
    });

    // Trial dir contains the four guaranteed artifacts.
    const trialDir = result.trial_dir;
    assert.ok(existsSync(path.join(trialDir, 'source')), 'source/ must exist');
    assert.ok(existsSync(path.join(trialDir, 'tests')), 'tests/ must exist');
    assert.ok(existsSync(path.join(trialDir, 'conversation.jsonl')), 'conversation.jsonl must exist');
    assert.ok(existsSync(path.join(trialDir, 'meta.json')), 'meta.json must exist');

    // Subagent files merged into the final trial dir.
    assert.ok(
      existsSync(path.join(trialDir, 'source', 'index.js')),
      'S1 wrote source/index.js',
    );
    assert.ok(
      existsSync(path.join(trialDir, 'tests', 'index.test.js')),
      'S2 wrote tests/index.test.js',
    );

    // meta.json carries the multi-agent fields populated.
    const meta = JSON.parse(readFileSync(path.join(trialDir, 'meta.json'), 'utf8'));
    assert.strictEqual(meta.topology, 'multi');
    assert.strictEqual(meta.style, 'dtdd');
    assert.strictEqual(meta.subagent_count, 2);
    assert.strictEqual(meta.subagents.length, 2);
    assert.strictEqual(meta.orchestrator_tokens_input, 200);
    assert.strictEqual(meta.orchestrator_tokens_output, 50);
    // Each subagent contributed 30 in / 15 out.
    assert.strictEqual(meta.tokens_input, 200 + 30 + 30);
    assert.strictEqual(meta.tokens_output, 50 + 15 + 15);
    // No subagent errors.
    assert.ok(!meta.subagent_errors);
  } finally {
    await close();
    // Clean up the test-only run dir.
    const runDir = path.resolve(process.cwd(), 'bench', 'results', tmpRunId);
    rmSync(runDir, { recursive: true, force: true });
    const worktreeDir = path.resolve(process.cwd(), 'bench', 'worktrees', `slugify-dtdd-multi-0`);
    rmSync(worktreeDir, { recursive: true, force: true });
  }
});
