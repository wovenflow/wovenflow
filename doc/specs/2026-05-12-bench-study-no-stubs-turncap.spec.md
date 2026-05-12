# Bench study orchestrator: forbid stub implementations + raise turn cap

## User stories

- As an operator running the bench against models forced to call a tool every turn (`tool_choice="required"`), I want the orchestrator's prompt to explicitly forbid placeholder implementations, so that a model doesn't satisfy the "must call a tool" constraint by writing a `// TODO` stub instead of refusing or completing the work.
- As an operator running the multi-step DTDD workflow (spec → tests → implementation), I want the per-trial turn budget to be generous enough that a model can finish the implementation rather than hitting the cap mid-workflow.

## Context

The 2026-05-12 smoke against `Qwen/Qwen2.5-Coder-14B-Instruct` (`tool_choice="required"`, default `turn_cap=20`) produced a Phase 1 `source/index.js` of:

```js
export function slugify(input) {
  // TODO: Implement the slugify function
}
```

— a complete-but-empty function. `stop_reason` was `turn-cap`; output was 1819 tokens over 20 turns (~90 tokens/turn), suggesting the model spent its budget on many small `write_test` calls and then placed a stub `write_source` on the last turn rather than implementing the body. All 8 hidden tests ran and failed (`hidden_pass: 0/8` — the harness and scorer are correct; the model output is the problem).

Two fixes:

1. **Prompt directive against stubs.** `TOOL_USAGE_INSTRUCTIONS` (composed into every `system_prompt`) must forbid `// TODO` stubs, placeholder comments, and `throw new Error("not implemented")`-style bodies.
2. **Higher turn cap.** `runStudy` should pass a turn cap higher than the provider default of 20 — enough headroom for the spec → tests → implementation workflow — and accept an override.

## Behaviors

### B1: TOOL_USAGE_INSTRUCTIONS forbids stub implementations
∵ **IF** `composePrompt({condition, task_id, repo_root})` is called
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `system_prompt` contains, in its tool-usage section, directives against placeholder implementations: the literal substring `TODO` appears (in a prohibition — "do not write TODO stubs" or similar), AND the literal substring `not implemented` appears (in a prohibition against `throw new Error("not implemented")`-style bodies). The wording is an implementation detail; the test asserts the presence of these substrings within the tool-usage region (after the first `write_source` mention)

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composePrompt } from '../../study.mjs';

test('B1: system_prompt forbids TODO stubs and not-implemented throws', () => {
  for (const condition of ['baseline', 'tdd', 'dtdd']) {
    const result = composePrompt({ condition, task_id: 'slugify', repo_root: process.cwd() });
    const sp = result.system_prompt;
    const wsIdx = sp.indexOf('write_source');
    assert.ok(wsIdx >= 0, `[${condition}] system_prompt must mention write_source`);
    assert.ok(sp.includes('TODO'), `[${condition}] system_prompt must mention TODO (in a prohibition)`);
    assert.ok(
      sp.includes('not implemented'),
      `[${condition}] system_prompt must mention "not implemented" (in a prohibition)`,
    );
    assert.ok(
      sp.indexOf('TODO') > wsIdx,
      `[${condition}] the no-stubs directive should sit in the tool-usage section`,
    );
  }
});
```

### B2: runStudy resolves a turn cap above the provider default and exposes it
∵ **IF** `runStudy({run_id, tasks, conditions, trials, dry_run: true})` is called WITHOUT an explicit `turn_cap` option, OR is called WITH a `turn_cap` option
↦ **WHEN** it returns the dry-run plan
∴ **THEN** the plan includes a `turn_cap` field: when no override was passed, its value is a positive integer strictly greater than 20 (the provider default — chosen to give the spec → tests → implementation workflow headroom); when an override was passed, the field equals the override. (The live path passes this same resolved value to `dispatchTrial` and `dispatchEditTrial`, but only the dry-run plan's exposed value is asserted here)

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStudy } from '../../study.mjs';

test('B2: runStudy dry-run plan exposes a turn_cap > 20 by default; honors override', async () => {
  const planDefault = await runStudy({
    run_id: 'test-b2-turncap-default',
    tasks: ['slugify'],
    conditions: ['dtdd'],
    trials: 1,
    dry_run: true,
  });
  assert.ok(Number.isInteger(planDefault.turn_cap), 'plan must include integer turn_cap');
  assert.ok(planDefault.turn_cap > 20, `default turn_cap must exceed 20, got ${planDefault.turn_cap}`);

  const planOverride = await runStudy({
    run_id: 'test-b2-turncap-override',
    tasks: ['slugify'],
    conditions: ['dtdd'],
    trials: 1,
    turn_cap: 42,
    dry_run: true,
  });
  assert.strictEqual(planOverride.turn_cap, 42, 'explicit turn_cap override must be honored');
});
```

## Red-team check

Decision: forbid stub implementations in the prompt; raise the default turn cap in `runStudy`.

Top three reasons this might not be the right call:

1. **A stub-forbidding directive can't make an incapable model capable.** If a model genuinely can't implement slugify, telling it not to stub just makes it produce wrong code instead of empty code — arguably worse for the metric. Mitigation: the bench measures hidden-test pass rate; wrong code scores 0/8 same as a stub. The directive at least prevents the trivially-uninformative "stub on the last turn" outcome and gives a model that *can* implement the task the explicit nudge to do so. Not load-bearing.
2. **A higher turn cap costs more tokens per trial.** 30-40 turns × N trials × tokens-per-turn adds up across 450 trials. Mitigation: most trials should finish well before the cap; the cap is a ceiling, not a target. The token cost of one extra cap-hitting trial is small relative to the cost of *every* trial truncating mid-implementation. Acceptable.
3. **Hard-coding a turn-cap number in `runStudy` duplicates the provider's `DEFAULT_TURN_CAP`.** Two places now name a default. Mitigation: they serve different layers — the provider default is the floor for any caller; `runStudy`'s default is the study-workflow-tuned value. Document the relationship in a comment. Acceptable.

Verdict: **PROCEED.** Two behaviors; small additions; both targeted at the specific failure mode (stub-on-last-turn after exhausting the turn budget).

## Handoff

After testflow wires this spec into pretest, subflow: (a) adds the no-stubs directive to `TOOL_USAGE_INSTRUCTIONS` in `bench/study.mjs`; (b) adds a `turn_cap` resolution to `runStudy` — default `> 20`, override-able, exposed in the dry-run plan, threaded into `dispatchTrial` / `dispatchEditTrial` on the live path.
