# Bench provider: preserve OpenAI tool-call / tool_call_id pairing across multi-turn

## User stories

- As the bench operator, I want the provider's multi-turn conversation to satisfy the OpenAI tool-call contract — every assistant turn that emits `tool_calls` is followed by exactly one `role:'tool'` message per call, each tagged with the corresponding `tool_call_id` — so that strict chat templates (qwen3-coder's, in particular) can re-tokenize the conversation without hitting a parse failure that aborts the trial mid-stream.

## Context

`bench/providers/openai-compatible.js` does two things that diverge from the OpenAI tool-call spec:

1. `toModelMessages(conversation)` emits only `{ role, content }` — it drops `tool_calls` from assistant turns and would also drop `tool_call_id` from tool turns (none is set today). So when the model is re-shown the prior conversation, the assistant's tool-call history is gone; the model only sees an empty assistant turn followed by a `[tool] [tool results applied]` message and has no way to reconstruct what was called.

2. The per-turn loop pushes exactly **one aggregated** `role:'tool'` turn regardless of how many `tool_calls` the assistant emitted, and never sets `tool_call_id`. OpenAI's spec — and the chat templates of strict tool-call models — require one tool message **per** tool_call, each tagged with the source call's id.

Observed live in `bench/results/ollama-smoke1-20260523T004052/slugify-dtdd-single-0/` (qwen3-coder:30b via ollama at `http://127.0.0.1:11434/v1`): the first turn produces a clean `write_test` tool_call (`call_py90xtl2`), the bench applies it and pushes `{ role: 'tool', content: '[tool results applied]' }` with no `tool_call_id`. On the next request, ollama's qwen3-coder template renders the conversation, the model generates a response, and ollama's `qwen3coder.go:64` parser fails with `error=EOF` — returning HTTP 500. The bench records `stop_reason: "error"`, `wall_clock_ms: 9392`, and skips Phase 2 (`empty-source`).

A direct hand-built probe with the same model, same endpoint, identical tools, but with a properly-formed `{ role:'tool', tool_call_id:'call_lxpexere', content:'...' }` message returns cleanly in ~1.2 s with structured `tool_calls`. The diagnosis is unambiguous: it is not the model, the endpoint, or the network — it is the missing `tool_call_id` (and missing `assistant.tool_calls` carry-through) that breaks qwen3-coder's chat template.

vLLM with the same model wrapper tolerated the missing fields because its chat-template normalizer was lenient; ollama's qwen3-coder parser is strict. Fixing this brings the provider into conformance with the OpenAI spec, removes a benchmark-blocking failure mode for ollama-served models, and is methodology-neutral (applies to every condition and topology).

## Behaviors

### B1: `toModelMessages` preserves `tool_calls` on assistant turns

∵ **IF** `toModelMessages(conversation)` is called with an assistant turn that has a `tool_calls` array
↦ **WHEN** the function returns
∴ **THEN** the corresponding result entry carries the same `tool_calls` array (object-equal, not stringified) alongside `role` and `content`. Assistant turns without `tool_calls` continue to emit only `{ role, content }` (no spurious key).

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toModelMessages } from '../../providers/openai-compatible.js';

test('B1: toModelMessages preserves tool_calls on assistant turns', () => {
  const tc = [
    { id: 'call_abc', type: 'function', function: { name: 'write_source', arguments: '{"path":"index.js","content":"x"}' } },
  ];
  const convo = [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'task' },
    { role: 'assistant', content: '', tool_calls: tc, finish_reason: 'tool_calls' },
    { role: 'tool', content: '[tool results applied]', tool_call_id: 'call_abc' },
    { role: 'assistant', content: 'plain text reply' },
  ];
  const out = toModelMessages(convo);
  // assistant-with-tool_calls carries them through
  assert.strictEqual(out[2].role, 'assistant');
  assert.deepStrictEqual(out[2].tool_calls, tc);
  // finish_reason is provider bookkeeping, not part of the OpenAI request shape
  assert.strictEqual('finish_reason' in out[2], false);
  // assistant without tool_calls is unchanged shape
  assert.deepStrictEqual(out[4], { role: 'assistant', content: 'plain text reply' });
  assert.strictEqual('tool_calls' in out[4], false);
});
```

### B2: `toModelMessages` preserves `tool_call_id` on tool turns

∵ **IF** `toModelMessages(conversation)` is called with a `role:'tool'` turn that has a `tool_call_id`
↦ **WHEN** the function returns
∴ **THEN** the corresponding result entry carries `tool_call_id` alongside `role` and `content`. Tool turns without `tool_call_id` continue to emit only `{ role, content }`.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toModelMessages } from '../../providers/openai-compatible.js';

test('B2: toModelMessages preserves tool_call_id on tool turns', () => {
  const convo = [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'task' },
    { role: 'tool', content: 'first', tool_call_id: 'call_1' },
    { role: 'tool', content: 'second' }, // no id — left as-is
  ];
  const out = toModelMessages(convo);
  assert.strictEqual(out[2].role, 'tool');
  assert.strictEqual(out[2].tool_call_id, 'call_1');
  assert.strictEqual(out[3].role, 'tool');
  assert.strictEqual('tool_call_id' in out[3], false);
});
```

### B3: per-turn loop emits one tool message per `tool_calls[i].id`

∵ **IF** the model's response contains an assistant message with two structured `tool_calls` (e.g. `write_source` + `run_tests`, each with distinct `id`s)
↦ **WHEN** the provider processes that turn
∴ **THEN** exactly two `role:'tool'` turns are pushed to `conversation` immediately after the assistant turn, in the same order as the `tool_calls` array, each carrying the source call's `tool_call_id`. No aggregated single tool message is emitted, and `toModelMessages(conversation)` exposes both tool turns to the model with their `tool_call_id` set.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTrial, toModelMessages } from '../../providers/openai-compatible.js';

test('B3: per-turn loop emits one tool message per assistant tool_call', async () => {
  // Single mock turn: assistant emits write_source + run_tests with distinct ids.
  let calls = 0;
  const provider = {
    async fetch(url, init) {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              usage: { prompt_tokens: 10, completion_tokens: 5 },
              choices: [
                {
                  finish_reason: 'tool_calls',
                  message: {
                    role: 'assistant',
                    content: '',
                    tool_calls: [
                      {
                        id: 'call_write_1',
                        type: 'function',
                        function: {
                          name: 'write_source',
                          arguments: JSON.stringify({ path: 'index.js', content: 'export default () => 1\n' }),
                        },
                      },
                      {
                        id: 'call_run_2',
                        type: 'function',
                        function: { name: 'run_tests', arguments: '{}' },
                      },
                    ],
                  },
                },
              ],
            };
          },
          async text() { return ''; },
        };
      }
      // Stop the loop after the first turn so the test stays cheap.
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            usage: { prompt_tokens: 1, completion_tokens: 1 },
            choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'done' } }],
          };
        },
        async text() { return ''; },
      };
    },
  };

  const result = await runTrial({
    endpoint_url: 'http://mock/v1',
    model_id: 'mock',
    protocol_variant: 'openai-chat-completions',
    system_prompt: 'SYS',
    user_message: 'task',
    tools: [
      { type: 'function', function: { name: 'write_source', description: 'w', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
      { type: 'function', function: { name: 'run_tests', description: 'r', parameters: { type: 'object', properties: {} } } },
    ],
    _injectedFetch: provider.fetch,
  });

  // Find the assistant tool_calls turn and the tool replies that follow it.
  const convo = result.conversation;
  const aIdx = convo.findIndex((t) => t.role === 'assistant' && Array.isArray(t.tool_calls) && t.tool_calls.length === 2);
  assert.ok(aIdx >= 0, 'assistant tool_calls turn must be present');
  const replies = convo.slice(aIdx + 1, aIdx + 3);
  assert.strictEqual(replies.length, 2);
  assert.strictEqual(replies[0].role, 'tool');
  assert.strictEqual(replies[0].tool_call_id, 'call_write_1');
  assert.strictEqual(replies[1].role, 'tool');
  assert.strictEqual(replies[1].tool_call_id, 'call_run_2');

  // And toModelMessages surfaces them to the model with the ids intact.
  const msgs = toModelMessages(convo);
  const toolMsgs = msgs.filter((m) => m.role === 'tool');
  assert.strictEqual(toolMsgs.length, 2);
  assert.deepStrictEqual(
    toolMsgs.map((m) => m.tool_call_id),
    ['call_write_1', 'call_run_2'],
  );
});
```

### B4: fallback (JSON-code-block) tool calls also emit per-call tool messages

∵ **IF** the model emits no structured `tool_calls` but the JSON-code-block fallback (per `2026-05-11-bench-provider-jsoncode-fallback.spec.md`) extracts N tool calls from the assistant's `content`
↦ **WHEN** the provider processes that turn
∴ **THEN** the loop synthesizes one `tool_call_id` per extracted call (deterministic, e.g. `call_fallback_${turnIndex}_${i}`) and emits one `role:'tool'` turn per call carrying that id, so the model still receives a spec-compliant pairing — and the synthetic id is also attached to the assistant turn's `tool_calls` field so the pairing survives `toModelMessages`.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTrial, toModelMessages } from '../../providers/openai-compatible.js';

test('B4: JSON-code-block fallback emits per-call tool messages with synthetic ids', async () => {
  let calls = 0;
  const fenced = [
    '```json',
    JSON.stringify({ name: 'write_source', arguments: { path: 'index.js', content: 'export default () => 1\n' } }),
    '```',
    '',
    '```json',
    JSON.stringify({ name: 'run_tests', arguments: {} }),
    '```',
  ].join('\n');
  const provider = {
    async fetch() {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              usage: { prompt_tokens: 10, completion_tokens: 5 },
              choices: [
                { finish_reason: 'stop', message: { role: 'assistant', content: fenced } },
              ],
            };
          },
          async text() { return ''; },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            usage: { prompt_tokens: 1, completion_tokens: 1 },
            choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'done' } }],
          };
        },
        async text() { return ''; },
      };
    },
  };
  const result = await runTrial({
    endpoint_url: 'http://mock/v1',
    model_id: 'mock',
    protocol_variant: 'openai-chat-completions',
    system_prompt: 'SYS',
    user_message: 'task',
    tools: [
      { type: 'function', function: { name: 'write_source', description: 'w', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
      { type: 'function', function: { name: 'run_tests', description: 'r', parameters: { type: 'object', properties: {} } } },
    ],
    _injectedFetch: provider.fetch,
  });

  const convo = result.conversation;
  const aIdx = convo.findIndex((t) => t.role === 'assistant' && Array.isArray(t.tool_calls) && t.tool_calls.length === 2);
  assert.ok(aIdx >= 0, 'assistant turn must have synthesized tool_calls for the fallback path');
  const ids = convo[aIdx].tool_calls.map((c) => c.id);
  assert.strictEqual(ids[0].length > 0, true);
  assert.strictEqual(ids[1].length > 0, true);
  assert.notStrictEqual(ids[0], ids[1]);

  const replies = convo.slice(aIdx + 1, aIdx + 3);
  assert.strictEqual(replies.length, 2);
  assert.strictEqual(replies[0].role, 'tool');
  assert.strictEqual(replies[0].tool_call_id, ids[0]);
  assert.strictEqual(replies[1].role, 'tool');
  assert.strictEqual(replies[1].tool_call_id, ids[1]);

  // The model would see two tool messages with ids attached.
  const msgs = toModelMessages(convo);
  const toolIds = msgs.filter((m) => m.role === 'tool').map((m) => m.tool_call_id);
  assert.deepStrictEqual(toolIds, ids);
});
```

## Red-team check

Decision: extend `toModelMessages` to pass `assistant.tool_calls` and `tool.tool_call_id` through, and refactor both the structured-path and JSON-fence-fallback paths to emit one `role:'tool'` turn per assistant tool_call carrying the source `tool_call_id` (synthesizing ids for the fallback path).

Top three reasons this might not be the right call:

1. **It's a larger refactor than the prior harness fixes.** True — but it's the minimum to make ollama-served models usable, and it brings the provider into conformance with the documented OpenAI Chat Completions tool-call protocol that the harness already claims to speak. The change is fully covered by new test fences B1–B4 + every existing spec test still passes (prior tests assert `{role, content}` shapes; the new optional fields are conditional). No behavioral regression for the previously-tested deepStrictEqual shapes.

2. **Per-call tool messages change the "aggregated test results in one message" convenience.** True — and a deliberate trade. The aggregate was a harness convenience, not a methodology requirement; the model now sees results at the granularity at which they were produced (one `run_tests` call → one tool message). This is also closer to how production agents consume tool results. Rejection lines remain visible: each per-call tool message carries the rejection note for *its* call (the call that triggered the rejection), so the model can still self-correct.

3. **Fallback-path synthetic ids might collide or look unprincipled.** The collision is bounded — ids are scoped to a single conversation, and a deterministic template (`call_fallback_${turnIndex}_${callIndex}`) cannot collide. "Unprincipled" only if the provider gave us real ids; it didn't (fallback fires when there are no structured `tool_calls`), so synthesizing them is the only way to satisfy the spec-compliant pairing. The synthetic ids are real strings in the conversation history; the model never has to interpret them — only ollama's template uses them for routing.

Verdict: **PROCEED.** Small change in shape, large change in correctness; directly unblocks the bench's last untested path; documented red-team trade-offs are bounded.

## Handoff

After testflow inserts these test fences into `bench/out/spec-tests/`, the implementer:

- Updates `toModelMessages` in `bench/providers/openai-compatible.js` to:
  - copy `tool_calls` onto the result entry when the source turn (assistant role) has a non-empty `tool_calls` array;
  - copy `tool_call_id` onto the result entry when the source turn (tool role) has it;
  - keep the existing diagnostic-drop and "drop non-leading system" behavior intact;
  - never emit `finish_reason` (provider bookkeeping, not part of the OpenAI request shape).
- In the structured-`tool_calls` branch of the per-turn loop (around line 980): replace the single aggregated `pushTurn({ role: 'tool', content: toolContent })` with a loop over `structuredCalls` that pushes one `{ role: 'tool', content: <per-call content>, tool_call_id: call.id }` per call, in iteration order. Per-call content rule: the rejection line for the call's rejection if it had one (path or content), or the `run_tests` result for that call if it was a `run_tests` call, or the existing `[tool results applied]` placeholder for an accepted `write_*` call. (Tracking which call yielded which outcome only requires extending the existing per-call iteration to remember the result alongside the call.)
- In the JSON-fence-fallback branch (around line 1060): before pushing the assistant turn or the tool messages, synthesize a `tool_call_id` per extracted call (deterministic template `call_fallback_${turnIndex}_${i}` where `turnIndex` is monotonic across the trial), attach those ids to a synthesized `tool_calls` array on the assistant turn, and emit one `{ role: 'tool', content: <per-call content>, tool_call_id: <synthetic> }` per call. The existing rejection / `run_tests` content logic carries over per call, same as the structured path.
- Wires `doc/specs/2026-05-23-bench-provider-tool-call-id-pairing.spec.md` into `bench/package.json`'s `pretest` script alongside the other spec extractions.
- Confirms `npm test --prefix bench` is green (all extracted spec tests + B1–B4 here).
- Confirms `npm test` (the wovenflow self-tests) is unchanged-green.

After all behaviors are green, no further work — this is a harness-only fix. `bench/` is not plugin surface; no version bump.
