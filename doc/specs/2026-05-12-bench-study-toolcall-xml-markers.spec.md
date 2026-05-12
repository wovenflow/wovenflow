# Bench study orchestrator: instruct `<tool_call>` XML markers

## User stories

- As an operator running the bench against Qwen2.5-family models served via Ollama (or any inference layer using Qwen's official chat template), I want the orchestrator's tool-usage prompt to explicitly instruct the model to wrap function calls in `<tool_call>...</tool_call>` XML tags, so that the inference server's parser extracts them into structured `tool_calls` rather than leaving them in `content` where downstream tooling can't see them.

## Context

The 2026-05-12 smoke against `qwen2.5-coder:7b` (via Ollama; Ollama reports `tools` capability for this model) produced a real, runnable slugify implementation — but emitted as a bare JSON object inside the `content` field, not as structured `tool_calls`. Qwen2.5-Coder's official tokenizer chat template defines tool calls via `<tool_call>...</tool_call>` XML markers (per the model card and the tokenizer_config.json in the HF cache); the model wasn't following its own template under our composed prompt.

Adding an explicit directive to use the `<tool_call>` markers gives the model a literal pattern to follow and makes the format the parser expects unambiguous. This complements (does not replace) the existing fenced-`` ```json `` fallback in `bench/providers/openai-compatible.js` — if the model honors the directive, structured `tool_calls` will be non-empty and the fallback won't fire.

## Behaviors

### B1: TOOL_USAGE_INSTRUCTIONS instructs `<tool_call>` XML wrapping
∵ **IF** `composePrompt({condition, task_id, repo_root})` is called
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `system_prompt` contains, in its tool-usage section, an instruction to wrap function calls in `<tool_call>...</tool_call>` XML tags. The literal substrings `<tool_call>` AND `</tool_call>` both appear, positioned after the first `write_source` mention. The exact wording is an implementation detail; the test asserts the presence of the XML-tag literals within the tool-usage region

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composePrompt } from '../../study.mjs';

test('B1: system_prompt instructs <tool_call> XML markers', () => {
  for (const condition of ['baseline', 'tdd', 'dtdd']) {
    const result = composePrompt({ condition, task_id: 'slugify', repo_root: process.cwd() });
    const sp = result.system_prompt;
    const wsIdx = sp.indexOf('write_source');
    assert.ok(wsIdx >= 0, `[${condition}] system_prompt must mention write_source`);
    assert.ok(sp.includes('<tool_call>'), `[${condition}] system_prompt must mention <tool_call>`);
    assert.ok(sp.includes('</tool_call>'), `[${condition}] system_prompt must mention </tool_call>`);
    assert.ok(
      sp.indexOf('<tool_call>') > wsIdx,
      `[${condition}] the <tool_call> directive should sit in the tool-usage section`,
    );
  }
});
```

## Red-team check

Decision: add a `<tool_call>` XML-wrapping directive to `TOOL_USAGE_INSTRUCTIONS`.

Top three reasons this might not be the right call:

1. **It's Qwen-specific.** Other model families (Llama, Mistral) use different tool-call grammars; instructing `<tool_call>` for them is wrong. Mitigation: many open-weights models (Hermes, Qwen3-Coder, Mistral with some templates, internlm) actually use the same `<tool_call>...</tool_call>` convention because it was popularized by Hermes and Qwen and is the most common modern format. For models that use a different format (raw OpenAI JSON), the structured `tool_calls` path of the openai-compatible parser usually catches them anyway. The directive at worst becomes a harmless hint the model ignores. Not load-bearing.
2. **The model might still produce inconsistent output.** Qwen models have already shown they don't always follow their own chat template's tool-call format. Adding the directive doesn't guarantee compliance. Mitigation: this is a "make the most-likely-to-work format explicit" pass — if it fails, the existing fenced-`` ```json `` fallback in `bench/providers/openai-compatible.js` still catches one of the model's common alternates. Defense in depth, not single-point dependency. Acceptable.
3. **Adding more prompt noise dilutes the DTDD methodology guidance.** The system_prompt is already long with style card + tool usage + ESM directive + no-stub directive. Mitigation: the `<tool_call>` directive is two lines — one instruction + one example. Format consistency is a precondition for any methodology to show up in the data, so this is upstream of the noise concern. Acceptable.

Verdict: **PROCEED.** Single behavior; small prompt addition; targeted at the specific failure mode observed (bare JSON content unrecovered by parser).

## Handoff

After testflow wires this spec into pretest, subflow adds the `<tool_call>` directive to `TOOL_USAGE_INSTRUCTIONS` in `bench/study.mjs` and makes B1 green.
