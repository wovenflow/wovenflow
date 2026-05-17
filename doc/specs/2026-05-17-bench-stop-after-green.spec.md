# Bench study orchestrator: stop-after-green instruction in tool-usage prompt

## User stories

- As an operator running the bench against open-weights coder models, I want the orchestrator's tool-usage prompt to tell the model to stop emitting tool calls once `run_tests` reports a green run, so that trials with already-working code don't burn the rest of their turn budget on no-op iteration (re-running `run_tests`, shuffling fences) until they hit `turn-cap`.

## Context

The 2026-05-16 single-topology pilot (`bench/results/pilot-20260516T235613-single/`) showed 71% of trials terminating with `stop_reason: turn-cap`, while the average `hidden_pass` on those capped trials was 91.6% — strong signal that the model frequently has working code well before the cap and then thrashes past convergence.

The canonical example is `slugify-dtdd-single-1` Phase-2-WD (conversation log: `bench/results/pilot-20260516T235613-single/slugify-dtdd-single-1/phase-2-wd/conversation.jsonl`). At turn ~10 the trial's `run_tests` call returned `[run_tests] 19/19 passed`. The model then continued for ~25 more turns — no further `write_source` or `write_test` mutations, just repeated `run_tests` calls and small fence-shuffling — until it hit `turn-cap` at turn 35.

The harness already ends the trial as `stop_reason: 'done'` when an assistant turn emits zero tool calls. What's missing is the model knowing that this is the intended termination path on green. A short, explicit directive in `TOOL_USAGE_INSTRUCTIONS` — methodology-neutral, applied to every condition including Baseline — addresses this.

This change does NOT make `run_tests` mandatory: the model may also legitimately stop without ever calling `run_tests` (e.g. if it judges its work complete on inspection). And it does NOT block a final non-tool-call assistant turn used by some methodologies (DTDD) to declare done in prose — that turn produces zero tool calls and so is the termination event itself.

## Behaviors

### B1: TOOL_USAGE_INSTRUCTIONS instructs stop-after-green termination
∵ **IF** `composePrompt({condition, task_id, repo_root})` is called
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `system_prompt` contains, in its tool-usage section, a directive that the model should stop emitting tool calls once `run_tests` reports all tests passing: the literal substring `run_tests` AND the literal substring `passing` both appear in a sentence describing the stop condition; the literal substring `zero tool calls` appears (describing the harness's termination trigger). The exact wording is an implementation detail; the test asserts the presence of these substrings within the tool-usage region (after the first `write_source` mention)

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composePrompt } from '../../study.mjs';

test('B1: system_prompt instructs stop-after-green termination', () => {
  for (const condition of ['baseline', 'tdd', 'dtdd']) {
    const result = composePrompt({ condition, task_id: 'slugify', repo_root: process.cwd() });
    const sp = result.system_prompt;
    const wsIdx = sp.indexOf('write_source');
    assert.ok(wsIdx >= 0, `[${condition}] system_prompt must mention write_source`);
    assert.ok(sp.includes('run_tests'), `[${condition}] system_prompt must mention run_tests`);
    assert.ok(sp.includes('passing'), `[${condition}] system_prompt must mention "passing" (stop condition)`);
    assert.ok(
      sp.includes('zero tool calls'),
      `[${condition}] system_prompt must mention "zero tool calls" (the harness termination trigger)`,
    );
    // The stop-after-green directive should sit in the tool-usage region,
    // i.e. somewhere after the first mention of write_source.
    assert.ok(
      sp.indexOf('zero tool calls') > wsIdx,
      `[${condition}] the stop-after-green directive should sit in the tool-usage section`,
    );
  }
});
```

## Red-team check

Decision: add a stop-after-green directive to `TOOL_USAGE_INSTRUCTIONS`.

Top three reasons this might not be the right call:

1. **It might bias the model toward premature stopping.** A model could over-interpret "stop when green" and skip legitimately useful additional work — e.g. refactoring duplicate logic, adding edge-case tests it hadn't gotten to. Mitigation: the directive explicitly conditions on "AND you have no further write_source / write_test edits in mind" — it's a permission to stop, not a command. The pilot's failure mode is the opposite (idle re-running with zero edits in mind), which is exactly what this targets. The bench's metric is hidden-test pass rate; refactoring that doesn't change hidden_pass scores the same. Acceptable.
2. **It conflates "tests pass" with "task done".** Author-written tests can be wrong (incomplete coverage, false greens), and the hidden test suite is the ground truth. Telling the model "tests pass = stop" could lock in a green-by-undertesting trial. Mitigation: this is a property of the bench design, not this directive — the model never sees hidden tests under any condition. A model that wants to add more tests is free to do so before stopping; the directive only fires once the model itself has run out of edits. Not load-bearing.
3. **Methodology-neutral placement might hide style-specific stop conditions.** DTDD's "declare done" turn is genuinely different from Baseline's "I'm out of ideas" stop. Putting both under one directive flattens that distinction. Mitigation: from the harness's perspective they're the same event (zero tool calls in an assistant turn). The style cards remain free to add methodology-specific guidance about *how* to know you're done; this directive is purely about *what to do* once you've decided you are. Acceptable.

Verdict: **PROCEED.** Single behavior; short prompt addition (one or two sentences); targeted at the specific failure mode observed (idle re-running past convergence until turn-cap).

## Handoff

After testflow wires this spec into pretest, subflow adds the stop-after-green directive to `TOOL_USAGE_INSTRUCTIONS` in `bench/study.mjs` and makes B1 green. The directive must be methodology-neutral (lives in the tool-usage prelude, not in any style card under `bench/styles/`).
