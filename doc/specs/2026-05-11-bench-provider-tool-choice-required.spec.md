# OpenAI-compatible provider: tool_choice="required" when tools provided

## User stories

- As an operator running the bench against local open-weights models with variable tool-call adherence, I want the harness to force the model to invoke a tool every turn (rather than letting it choose) when tools are provided, so that trials produce extractable file-writes deterministically.

## Context

The 2026-05-11 smokes against `Qwen/Qwen2.5-Coder-14B-Instruct` revealed that the model — when given `tool_choice: "auto"` (the OpenAI default) — sometimes emits zero tool calls and instead writes prose describing the design. Per the OpenAI API spec, `tool_choice: "required"` instructs the model to invoke one of the provided tools rather than emitting a natural-language response. vLLM supports this directive (`--enable-auto-tool-choice` enables both `"auto"` and `"required"`).

This spec adds one provider-level behavior: when the harness calls `runTrial` with a non-empty `tools` array, the request body sent to the model server includes `tool_choice: "required"`. When `tools` is empty, the field is omitted (so the existing tool-less code path is unaffected).

## Behaviors

### B1: Non-empty `tools` → request body includes `tool_choice: "required"`
∵ **IF** `runTrial` is invoked with a non-empty `tools` array
↦ **WHEN** the openai-compatible provider builds the POST body for `/chat/completions`
∴ **THEN** the body includes `tool_choice: "required"` (literal string `"required"`, not an object). When `tools` is empty or undefined, the body omits the `tool_choice` field entirely

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTrial } from '../../providers/openai-compatible.js';

test('B1: non-empty tools sets tool_choice="required"; empty tools omits the field', async () => {
  const captured = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    captured.push(JSON.parse(opts.body));
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    };
  };
  try {
    await runTrial({
      system_prompt: '',
      user_message: 'go',
      tools: [{ type: 'function', function: { name: 'write_source', description: '', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } }],
      options: { turn_cap: 1, wall_clock_cap_ms: 30000, grace_ms: 1000, endpoint_url: 'http://x/v1', model_id: 'm' },
    });
    assert.strictEqual(captured[0].tool_choice, 'required', 'tools non-empty → tool_choice="required"');

    captured.length = 0;
    await runTrial({
      system_prompt: '',
      user_message: 'go',
      tools: [],
      options: { turn_cap: 1, wall_clock_cap_ms: 30000, grace_ms: 1000, endpoint_url: 'http://x/v1', model_id: 'm' },
    });
    assert.ok(!('tool_choice' in captured[0]), 'tools empty → tool_choice omitted');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

## Red-team check

Decision: send `tool_choice: "required"` when tools are provided, for every trial.

Top three reasons this might not be the right call:

1. **Forced tool use could mask whether a methodology condition genuinely produces code via tools.** If the Baseline condition "should" produce no tools but we force it to, we've changed what we're measuring. Mitigation: the harness defines `tools` per request; if a future condition wants no-tool-use, it would pass `tools: []` and this gate would correctly omit `tool_choice`. The current orchestrator always passes write_source/write_test, so the behavior is consistent across conditions. Not load-bearing.
2. **Some models may emit lower-quality output under forced tool use.** A model that would have written better code in a 5-turn back-and-forth could be cornered into a worse single-call response. Mitigation: the bench measures hidden-test pass rate, which captures this if it happens; we're not biasing toward a specific output style, just requiring SOME tool to be invoked. Acceptable.
3. **`tool_choice: "required"` is OpenAI-spec but not universally implemented.** Some openai-compatible servers may reject the field or interpret it differently. Mitigation: vLLM supports it explicitly per the `--enable-auto-tool-choice` flag (which enables both "auto" and "required"). If a future server doesn't, we'll see an explicit HTTP 400 in the conversation log — visible, not silent. Acceptable.

Verdict: **PROCEED.** Single behavior; one-line implementation; targeted at the specific failure mode observed.

## Handoff

After testflow wires this spec into pretest, subflow makes B1 green by adding `tool_choice: tools.length > 0 ? 'required' : undefined` to the request body in `bench/providers/openai-compatible.js`.
