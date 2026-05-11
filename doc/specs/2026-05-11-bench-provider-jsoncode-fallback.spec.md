# OpenAI-compatible provider: JSON-code-block tool-call fallback

## User stories

- As an operator running the bench against local open-weights models (Qwen2.5-Coder-14B, DeepSeek-Coder, similar), I want the harness to extract tool calls even when the model emits them as `` ```json `` code blocks inside `content` rather than as structured `tool_calls`, so that capable-but-format-inconsistent models can still produce scoreable trials.
- As the bench protocol author, I want this fallback to be transparent — preferring structured `tool_calls` when present, only falling back when they're absent — so that the data shape downstream is identical regardless of how the model emitted the call.
- As a future maintainer, I want the fallback to be conservative — only extracting clearly-shaped objects, ignoring malformed JSON, never inventing arguments — so that this extractor never silently corrupts a trial.

## Context

The bench's `openai-compatible` provider (`bench/providers/openai-compatible.js`) currently extracts tool calls by reading `message.tool_calls` from each assistant turn (lines 191-209). For models that follow the OpenAI tool-call structure or vLLM's parser-supported formats (Hermes XML, Qwen3 XML, etc.), this works.

Empirical observation from the 2026-05-11 orchestrator smoke against `Qwen/Qwen2.5-Coder-14B-Instruct`: the model emits valid `write_source` and `write_test` invocations as JSON code blocks inside the assistant message `content`, not as structured `tool_calls`. The slugify code it produced was correct on inspection — the harness simply never extracted it. No available vLLM parser (`hermes`, `qwen3coder`, `mistral`, etc.) matches this output shape, because they expect `<tool_call>` / `<tools>` XML markers that this model doesn't reliably produce.

This spec adds a JSON-code-block fallback to the provider. Scope: extraction-only; no change to upstream tool routing or downstream file-writing semantics. The fallback is internal to `bench/providers/openai-compatible.js`.

## Behaviors

### B1: Empty `tool_calls` + JSON code block in content → extracted as tool calls
∵ **IF** an assistant response has `message.tool_calls` empty (undefined, null, or `[]`) AND `message.content` contains one or more fenced `` ```json `` blocks each parsing to an object with string `name` and object `arguments` fields
↦ **WHEN** the openai-compatible provider processes the response
∴ **THEN** each such JSON object is extracted and treated identically to a structured `tool_calls` entry (same `write_source` / `write_test` name dispatch, same `args.path` / `args.content` extraction into `sourceFiles` / `testFiles`). The synthesized tool turn (`{ role: 'tool', content: '[tool results applied]' }`) is pushed exactly as in the structured-tool-call path. Multiple blocks in one assistant turn extract in document order

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTrial } from '../../providers/openai-compatible.js';

test('B1: JSON code block in content extracts as tool call when tool_calls empty', async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: '```json\n{"name": "write_source", "arguments": {"path": "index.js", "content": "export function double(x) { return x * 2; }"}}\n```',
              tool_calls: [],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 30 },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: { role: 'assistant', content: 'done' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    };
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const result = await runTrial({
      system_prompt: '',
      user_message: 'go',
      tools: [{ type: 'function', function: { name: 'write_source', description: '', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } }],
      options: { turn_cap: 4, wall_clock_cap_ms: 30000, grace_ms: 1000, endpoint_url: 'http://x/v1', model_id: 'm' },
    });
    assert.deepStrictEqual(result.source_files, {
      'index.js': 'export function double(x) { return x * 2; }',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

### B2: Non-empty `tool_calls` → fallback NOT triggered
∵ **IF** an assistant response has `message.tool_calls` non-empty (at least one entry with a `function.name` matching `write_source` or `write_test`) AND `message.content` also contains a JSON code block of a tool-call shape
↦ **WHEN** the openai-compatible provider processes the response
∴ **THEN** ONLY the structured `tool_calls` entries are used; the JSON code blocks in `content` are NOT also extracted. This prevents double-counting when a model emits both. The structured path is canonical

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTrial } from '../../providers/openai-compatible.js';

test('B2: structured tool_calls present preempts JSON-code-block fallback', async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: '```json\n{"name": "write_source", "arguments": {"path": "fallback.js", "content": "FROM_CONTENT"}}\n```',
              tool_calls: [{
                id: 'c1',
                type: 'function',
                function: { name: 'write_source', arguments: JSON.stringify({ path: 'structured.js', content: 'FROM_STRUCTURED' }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 30 },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    };
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const result = await runTrial({
      system_prompt: '',
      user_message: 'go',
      tools: [{ type: 'function', function: { name: 'write_source', description: '', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } }],
      options: { turn_cap: 4, wall_clock_cap_ms: 30000, grace_ms: 1000, endpoint_url: 'http://x/v1', model_id: 'm' },
    });
    assert.deepStrictEqual(result.source_files, { 'structured.js': 'FROM_STRUCTURED' });
    assert.ok(!('fallback.js' in result.source_files));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

### B3: Malformed or non-tool-call JSON in content → silently ignored
∵ **IF** an assistant response has `message.tool_calls` empty AND `message.content` contains a `` ```json `` code block that EITHER fails to parse as JSON, OR parses to an object that lacks string `name` or object `arguments`, OR parses to an object whose `name` doesn't match a known tool (`write_source`, `write_test`)
↦ **WHEN** the openai-compatible provider processes the response
∴ **THEN** no extraction happens for that block; the trial continues without error; nothing is added to `sourceFiles` or `testFiles`. The provider does NOT throw or push a synthetic error turn for malformed JSON — silent skip is the correct behavior because the model may legitimately include illustrative JSON examples in prose. Multiple blocks in one content are evaluated independently: a well-formed block is still extracted even if a sibling block is malformed

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTrial } from '../../providers/openai-compatible.js';

test('B3: malformed or non-tool JSON is silently skipped; well-formed siblings still extract', async () => {
  let callCount = 0;
  const content = [
    '```json',
    '{ this is not valid JSON',
    '```',
    '',
    '```json',
    '{"name": "unknown_tool", "arguments": {"x": 1}}',
    '```',
    '',
    '```json',
    '{"name": "write_test", "arguments": {"path": "spec.js", "content": "test(\'x\', () => {});"}}',
    '```',
  ].join('\n');
  const mockFetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content, tool_calls: [] }, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 10, completion_tokens: 30 },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    };
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const result = await runTrial({
      system_prompt: '',
      user_message: 'go',
      tools: [{ type: 'function', function: { name: 'write_test', description: '', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } }],
      options: { turn_cap: 4, wall_clock_cap_ms: 30000, grace_ms: 1000, endpoint_url: 'http://x/v1', model_id: 'm' },
    });
    assert.deepStrictEqual(result.test_files, { 'spec.js': "test('x', () => {});" });
    assert.strictEqual(Object.keys(result.source_files).length, 0);
    assert.strictEqual(result.stop_reason, 'done');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

## Red-team check

Decision: extend `bench/providers/openai-compatible.js` with a JSON-code-block fallback extractor when structured `tool_calls` is absent. Three behaviors define the contract.

Stakes: this code path is read by every trial. A bug here corrupts data for the entire v2 Stage-2 run. The fallback is also a sustained maintenance commitment — the more model-output-shapes we extract, the more brittle the boundary becomes.

Top three reasons this might not be the right call:

1. **The fallback could mask a real prompt problem.** If a future model emits JSON code blocks because we didn't prompt it well, the fallback hides that signal. Mitigation: log a warning to the trial's conversation when fallback fires (so operators can see "this trial used fallback extraction" and investigate). The fallback firing IS data, not invisible. Not load-bearing for the immediate goal.

2. **Format-detection edge cases (e.g., JSON-shaped strings that aren't tool calls).** A model writing "here's an example: `{\"name\": ...}`" in prose could be mis-extracted. Mitigation: B3's strict requirements (must be in a `` ```json `` fenced block, must parse, must have `name` matching a known tool, must have object `arguments`) make false positives unlikely. The fallback only fires when `tool_calls` is empty AND content contains an unambiguous tool-call-shaped block. Acceptable risk.

3. **This is a workaround for a model bug, not a fix for the underlying issue.** Qwen2.5-Coder's training inconsistency is the root cause. Adding a fallback to extract its idiosyncratic output is technical debt — every future model with a different idiosyncrasy might need its own fallback. Mitigation: the JSON-in-fenced-block format is widely emitted by capable models (it's the ChatGPT-style "tool call as content"), so this fallback is generally useful, not single-model-specific. We accept the technical debt because the alternative is excluding local-model providers from the bench. Not load-bearing.

Verdict: **PROCEED.** All three objections are real but addressable; none requires reshaping the spec before testflow.

## Handoff

After testflow inserts these test fences and wires the spec into `bench/package.json`'s pretest pipeline, `wovenflow:subflow` will dispatch an implementer to make the failing tests pass — extending `bench/providers/openai-compatible.js` with the fallback extractor + tests.
