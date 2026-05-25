# Bench study orchestrator: expose the per-trial turn cap as a CLI flag

## User stories

- As an operator running the bench, I want a `--turn-cap=<int>` CLI flag on `bench/study.mjs`, so that I can lower the per-trial turn budget for a run without editing a constant in the source.
- As an operator who has observed that the 14B model converges by turn 15 and then wastes the remaining budget, I want to run with `--turn-cap=15` while leaving the near-pre-registered default of 35 untouched for everyone else.

## Context

`runStudy` already resolves a per-trial `turn_cap` (default `STUDY_DEFAULT_TURN_CAP = 35`, override-able) and threads the resolved value into `dispatchTrial` / `dispatchMultiAgentTrial` / `dispatchEditTrial`, which forward it to the provider (`bench/providers/openai-compatible.js` reads `options.turn_cap ?? DEFAULT_TURN_CAP`). The plumbing from `runStudy` down to the provider is complete (see `doc/specs/2026-05-12-bench-study-no-stubs-turncap.spec.md` B2).

What is missing is the *CLI surface*: `parseArgs` does not recognize `--turn-cap`, and `main()` never forwards it to `runStudy`. So today the only way to change the cap is to pass `turn_cap` programmatically or edit the constant.

The 2026-05-23 data on `Qwen/Qwen2.5-Coder-14B-Instruct` shows no trial improves its hidden-test score after turn 15 — roughly 20 turns of every trial are wasted budget. Exposing the flag lets a run set `--turn-cap=15` without a source edit.

The **default MUST stay 35** (a near-pre-registered value). The flag is an override, not a redefinition.

## Behaviors

### B1: parseArgs recognizes --turn-cap=<int> and yields its integer value
∵ **IF** `parseArgs(['--turn-cap=15'])` is called (the CLI argument parser exported from `study.mjs`)
↦ **WHEN** it returns the parsed-options object
∴ **THEN** the object carries the parsed turn cap as the integer `15` (under a `turn_cap` key), so `main()` can forward it to `runStudy`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../../study.mjs';

test('B1: parseArgs reads --turn-cap=15 as the integer 15', () => {
  const parsed = parseArgs(['--turn-cap=15']);
  assert.strictEqual(parsed.turn_cap, 15);
});
```

### B2: absent --turn-cap leaves the default at 35
∵ **IF** `parseArgs([])` is called with no `--turn-cap` flag, AND the study's default turn cap constant is inspected
↦ **WHEN** the parsed object and the exported default are examined
∴ **THEN** `parseArgs` reports no explicit turn cap (a nullish `turn_cap`), AND the exported `STUDY_DEFAULT_TURN_CAP` is exactly `35` — confirming the near-pre-registered default is unchanged. The dry-run plan with no override exposes the same `35`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, STUDY_DEFAULT_TURN_CAP, runStudy } from '../../study.mjs';

test('B2: no --turn-cap → parser reports none, default stays 35', async () => {
  const parsed = parseArgs([]);
  assert.ok(parsed.turn_cap === null || parsed.turn_cap === undefined,
    `absent --turn-cap must leave turn_cap nullish, got ${parsed.turn_cap}`);

  assert.strictEqual(STUDY_DEFAULT_TURN_CAP, 35,
    'the near-pre-registered default turn cap must stay 35');

  const plan = await runStudy({
    run_id: 'test-b2-turncap-cli-default',
    tasks: ['slugify'],
    conditions: ['dtdd'],
    trials: 1,
    dry_run: true,
  });
  assert.strictEqual(plan.turn_cap, 35,
    `dry-run plan with no override must expose 35, got ${plan.turn_cap}`);
});
```

### B3: a non-integer, zero, or negative --turn-cap is rejected
∵ **IF** `node bench/study.mjs` is invoked with a malformed `--turn-cap` (non-integer like `abc`, or `0`, or a negative like `-5`)
↦ **WHEN** the CLI parses and validates arguments
∴ **THEN** the CLI exits non-zero with a message naming the offending flag (matching `/turn-cap|turn cap/i`), the same way `--trials` and `--topology` validation fail fast — rather than silently coercing to `NaN` / a non-positive cap and dispatching trials with a meaningless budget

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('B3: malformed --turn-cap exits non-zero with a useful error', () => {
  for (const bad of ['abc', '0', '-5']) {
    const res = spawnSync('node', ['bench/study.mjs',
      '--run-id=test-cli-turncap-bad',
      '--tasks=slugify',
      '--conditions=dtdd',
      '--trials=1',
      `--turn-cap=${bad}`,
      '--dry-run',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notStrictEqual(res.status, 0,
      `--turn-cap=${bad} should exit non-zero, got ${res.status}`);
    assert.match(
      (res.stderr || '') + (res.stdout || ''),
      /turn-cap|turn cap/i,
      `error for --turn-cap=${bad} should name the flag`,
    );
  }
});
```

## Red-team check

Decision under test: expose `runStudy`'s already-resolved per-trial `turn_cap` as a `--turn-cap=<int>` CLI flag, default unchanged at 35.

Top three reasons this might not be the right call:

1. **A CLI flag invites accidental misuse — someone runs the real Stage-2 matrix with a too-low cap and silently truncates implementations.** Mitigation: the default is unchanged at 35, so the only way to lower it is an explicit, logged `--turn-cap` argument. The dry-run plan exposes the resolved cap, so an operator can confirm the value before spending budget. Acceptable.
2. **The 14B "converges by turn 15" observation may not generalize — other models or other tasks might need the full 35.** Mitigation: the flag is per-run, not a default change. A run that needs 35 simply omits the flag. This is exactly why we are not lowering the default. Not load-bearing.
3. **Exposing `parseArgs` / `STUDY_DEFAULT_TURN_CAP` widens the module's public surface for a test.** Mitigation: `study.mjs` already exports `composePrompt`, `runStudy`, `planPhase2`, `scoreTrialAndUpdateMeta`; these two additions are in keeping with that convention and let the behavior be tested without a subprocess for the happy path. Acceptable.

Verdict: **PROCEED.** Three behaviors; a CLI flag over existing plumbing; default explicitly held at 35.

## Handoff

After testflow wires this spec into `bench/package.json`'s pretest pipeline, an implementer makes the failing tests pass by: (a) adding a `--turn-cap=<int>` case to `parseArgs` in `bench/study.mjs` (parse with `Number.parseInt`, validate positive integer, reject otherwise); (b) documenting it in `printUsage`; (c) forwarding `parsed.turn_cap` into the `runStudy` call in `main()` (default `STUDY_DEFAULT_TURN_CAP` when absent); (d) exporting `parseArgs` and `STUDY_DEFAULT_TURN_CAP`. No change to the default (35) and no change to the existing `runStudy` → provider plumbing.
