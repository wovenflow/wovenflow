# Bench study orchestrator: ESM-syntax instruction in tool-usage prompt

## User stories

- As an operator running the bench against models that may default to CommonJS, I want the orchestrator's tool-usage prompt to instruct the model to emit ES module syntax (`export`), so that the produced `source/` files load under the bench's `"type": "module"` package and the hidden tests can import them.

## Context

The 2026-05-11 smoke against `Qwen/Qwen2.5-Coder-14B-Instruct` produced a `source/index.js` with `module.exports = slugify;`. Because trial dirs live under `bench/` (whose `package.json` declares `"type": "module"`), Node treats `.js` files as ESM, and `module` is undefined — the file throws `ReferenceError: module is not defined in ES module scope` at import time. The hidden test (`await import(sourceDir + '/index.js')`) fails before any `test(...)` registers, so the trial scores `total_count: 1` (one file-level subtest failure) instead of `8/8`.

Fix: the orchestrator's `TOOL_USAGE_INSTRUCTIONS` (in `bench/study.mjs`, composed into every trial's `system_prompt`) must explicitly instruct ES module syntax and forbid CommonJS.

## Behaviors

### B1: composePrompt's system_prompt instructs ESM and forbids CommonJS
∵ **IF** `composePrompt({condition, task_id, repo_root})` is called for any condition that has a tool-usage section (i.e. every condition — the tool-usage block is condition-agnostic)
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `system_prompt` contains, in its tool-usage section: (a) a directive to use ES module syntax — the literal substring `export` appears in a sentence instructing the model how to expose functions; (b) an explicit prohibition of CommonJS — the literal substrings `module.exports` and `require(` both appear, in a sentence telling the model NOT to use them. The exact wording is an implementation detail; the test asserts the presence of these directive substrings

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composePrompt } from '../../study.mjs';

test('B1: system_prompt instructs ESM syntax and forbids CommonJS', () => {
  for (const condition of ['baseline', 'tdd', 'dtdd']) {
    const result = composePrompt({ condition, task_id: 'slugify', repo_root: process.cwd() });
    const sp = result.system_prompt;
    assert.ok(sp.includes('export'), `[${condition}] system_prompt must instruct \`export\` usage`);
    assert.ok(
      sp.includes('module.exports'),
      `[${condition}] system_prompt must mention module.exports (in a prohibition)`,
    );
    assert.ok(
      sp.includes('require('),
      `[${condition}] system_prompt must mention require( (in a prohibition)`,
    );
    // Sanity: the prohibition and the directive should be in the tool-usage region,
    // i.e. somewhere after the first mention of write_source.
    const wsIdx = sp.indexOf('write_source');
    assert.ok(wsIdx >= 0, `[${condition}] system_prompt must mention write_source`);
    assert.ok(
      sp.indexOf('module.exports') > wsIdx && sp.indexOf('export') !== -1,
      `[${condition}] the ESM directive should sit in the tool-usage section`,
    );
  }
});
```

## Red-team check

Decision: add an ESM-syntax directive to the orchestrator's tool-usage prompt block.

Top three reasons this might not be the right call:

1. **It hard-codes a JavaScript-specific assumption into the orchestrator.** If the bench ever runs non-JS tasks, the directive is wrong. Mitigation: the bench is currently JS-only (all tasks under `bench/tasks/` are JS; the extractor's default `--lang` is JS). When/if other languages land, the tool-usage block becomes per-language anyway. Not load-bearing for the immediate goal.
2. **The model might ignore the directive.** A model that defaults hard to CJS may write `module.exports` regardless. Mitigation: this is the cheapest fix to try first; if it doesn't move the needle, the harness-side fix (drop `{"type":"module"}` package.json into trial dirs) is the fallback. The directive at least removes prompt-side ambiguity. Acceptable.
3. **It adds noise to an already-long prompt.** The DTDD style card is verbose; adding more constraints risks the model losing the thread. Mitigation: the directive is two sentences, placed adjacent to the existing `write_source` description. Minimal addition. Acceptable.

Verdict: **PROCEED.** Single behavior; small prompt addition targeted at the specific failure mode observed in the smoke.

## Handoff

After testflow wires this spec into pretest, subflow adds the ESM directive to `TOOL_USAGE_INSTRUCTIONS` in `bench/study.mjs` and makes B1 green.
