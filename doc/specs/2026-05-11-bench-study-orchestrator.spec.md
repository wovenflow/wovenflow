# Bench study orchestrator + Baseline condition

## User stories

- As the bench protocol author, I want a deterministic script that drives the v2 Stage-2 matrix end-to-end against any configured provider, so that running the study reduces to one command invocation.
- As a reviewer of the v2 study, I want each trial's score (Phase 1, Phase 2, Phase 2-WD) recorded alongside its conversation log, so that downstream analysis can reproduce per-cell aggregates from disk without recomputing.
- As the bench harness maintainer, I want Baseline to be a first-class condition — not a freeform alias — so that the experimental contrast between "no methodology" and "methodology X" is honest and the harness rejects the protocol's condition name unambiguously.
- As an operator running the bench, I want a CLI that accepts `--run-id`, `--tasks`, `--conditions`, and `--trials` flags, so that a smoke run (1 trial × 1 task × 1 condition) and a full run (10 trials × 5 tasks × 3 conditions) use the same code path and differ only by arguments.

## Scope

This spec defines the **minimum surface** required to drive a real v2 Stage-2 run end-to-end. Specifically out of scope (deferred to a follow-up spec):

- Per-run report generation with heatmaps and per-cell pass-rate tables
- Bootstrap 95% CIs (computed during analysis, not at trial time)
- Methodology compliance grading sample selection (post-run analysis)
- Provider-specific tool-loop variants (e.g., Anthropic native tools vs OpenAI function-calls — current `openai-compatible.js` already handles the OpenAI shape)

In scope:

- Baseline condition in `KNOWN_STYLES`
- Prompt + tool composition logic per condition
- Trial iteration over (condition, task, trial_index)
- Phase 2 + Phase 2-WD dispatch per successful Phase 1
- Per-trial scoring with hidden_pass recorded in `meta.json`
- Minimal CLI at `bench/study.mjs`

## Behaviors

### B1: Baseline condition is a recognized style
∵ **IF** a caller invokes `dispatchTrial({style: 'baseline', task_id, topology, trial_index, dry_run: true})` with otherwise-valid parameters
↦ **WHEN** the harness validates the style argument
∴ **THEN** the call returns the dry-run prepared invocation without throwing the "unknown style" error; `KNOWN_STYLES` (exported or internal) accepts `'baseline'` alongside `tdd`, `dtdd`, `plan`, `freeform`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTrial } from '../../runner.js';

test('B1: dispatchTrial accepts style: "baseline"', () => {
  const result = dispatchTrial({
    task_id: 'slugify',
    style: 'baseline',
    topology: 'single',
    trial_index: 0,
    dry_run: true,
  });
  assert.strictEqual(result.style, 'baseline');
  assert.match(result.worktree_path, /slugify-baseline-single-0$/);
});
```

### B2: Prompt composer includes style card content when condition has one
∵ **IF** a study orchestrator function `composePrompt({condition: 'dtdd', task_id, repo_root})` is called for a condition whose style card exists at `bench/styles/<condition>.md`
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `system_prompt` contains the verbatim content of `bench/styles/<condition>.md` followed by tool-usage instructions (the exact instructions are an implementation detail; the verbatim style card content must be present in the output string and the orchestrator must not paraphrase it)

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composePrompt } from '../../study.mjs';

test('B2: composePrompt includes style card content for dtdd', () => {
  const dtddCard = readFileSync('bench/styles/dtdd.md', 'utf8').trim();
  const result = composePrompt({
    condition: 'dtdd',
    task_id: 'slugify',
    repo_root: process.cwd(),
  });
  assert.ok(result.system_prompt.includes(dtddCard),
    'system_prompt must contain verbatim dtdd style card content');
});
```

### B3: Prompt composer omits style card for Baseline
∵ **IF** `composePrompt({condition: 'baseline', task_id, repo_root})` is called
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `system_prompt` does NOT contain the content of any file under `bench/styles/`; it contains only the tool-usage instructions and any condition-agnostic preamble. The orchestrator must not silently fall back to `bench/styles/freeform.md` — Baseline is the genuine null

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { composePrompt } from '../../study.mjs';

test('B3: composePrompt omits any style card content for baseline', () => {
  const result = composePrompt({
    condition: 'baseline',
    task_id: 'slugify',
    repo_root: process.cwd(),
  });
  for (const file of readdirSync('bench/styles')) {
    if (!file.endsWith('.md') || file === 'AUTHORING.md') continue;
    const cardContent = readFileSync(`bench/styles/${file}`, 'utf8').trim();
    const firstParagraph = cardContent.split('\n\n').find(p => p.trim().length > 80);
    if (firstParagraph) {
      assert.ok(!result.system_prompt.includes(firstParagraph),
        `Baseline system_prompt must not include content from ${file}`);
    }
  }
});
```

### B4: User message contains the task's intent.md verbatim
∵ **IF** `composePrompt({condition: <any>, task_id, repo_root})` is called for a task that has `bench/tasks/<task_id>/intent.md`
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `user_message` contains the verbatim content of `bench/tasks/<task_id>/intent.md`. The orchestrator must not summarize or rewrite the intent

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composePrompt } from '../../study.mjs';

test('B4: composePrompt user_message contains intent.md verbatim', () => {
  const intent = readFileSync('bench/tasks/slugify/intent.md', 'utf8').trim();
  const result = composePrompt({
    condition: 'tdd',
    task_id: 'slugify',
    repo_root: process.cwd(),
  });
  assert.ok(result.user_message.includes(intent),
    'user_message must contain verbatim intent.md content');
});
```

### B5: Tools array contains write_source, write_test, and run_tests in OpenAI function-call shape
∵ **IF** `composePrompt({condition: <any>, task_id, repo_root})` is called
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `tools` is an array of exactly three function definitions matching the OpenAI tool-call schema: `{type: "function", function: {name: "write_source", description: <string>, parameters: {type: "object", properties: {path: {type: "string"}, content: {type: "string"}}, required: ["path", "content"]}}}`, the analogous shape for `write_test`, and a `run_tests` tool whose `parameters` object has an optional `test_path` string property (no `required` list). Names must match exactly (the bench's openai-compatible provider matches `fn.name === 'write_source'` literally).

The `run_tests` tool was added post-lock to give the agent a feedback loop on its own tests — a DTDD trial was observed shipping tests that asserted `/Invalid semver string/` against an impl that threw `'Invalid semantic version: ...'`, a mismatch the agent could not have caught without an in-trial test runner. The tool executes the agent's in-memory `write_test` files against its `write_source` files in a sandbox tempdir (never against `bench/tasks/<task>/hidden_tests/`). Its presence is methodologically neutral — calling it is optional and does not change the trial outcome.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composePrompt } from '../../study.mjs';

test('B5: composePrompt tools array has write_source, write_test, and run_tests in OpenAI shape', () => {
  const result = composePrompt({
    condition: 'dtdd',
    task_id: 'slugify',
    repo_root: process.cwd(),
  });
  assert.strictEqual(result.tools.length, 3);
  const names = result.tools.map(t => t.function.name).sort();
  assert.deepStrictEqual(names, ['run_tests', 'write_source', 'write_test']);
  // write_source / write_test share the path+content shape.
  for (const tool of result.tools) {
    assert.strictEqual(tool.type, 'function');
    assert.ok(typeof tool.function.description === 'string' && tool.function.description.length > 0);
    assert.strictEqual(tool.function.parameters.type, 'object');
    if (tool.function.name === 'write_source' || tool.function.name === 'write_test') {
      assert.deepStrictEqual(tool.function.parameters.required, ['path', 'content']);
      assert.strictEqual(tool.function.parameters.properties.path.type, 'string');
      assert.strictEqual(tool.function.parameters.properties.content.type, 'string');
    } else if (tool.function.name === 'run_tests') {
      // run_tests has only an optional test_path string parameter.
      assert.strictEqual(tool.function.parameters.properties.test_path.type, 'string');
      // No `required` list (test_path is optional).
      assert.ok(
        tool.function.parameters.required === undefined ||
          tool.function.parameters.required.length === 0,
      );
    }
  }
});
```

### B6: Per-cell trial loop plans (conditions × tasks × trials) Phase 1 entries
∵ **IF** the orchestrator's `runStudy({run_id, tasks, conditions, trials, dry_run: true})` is called with concrete arrays of tasks and conditions and a positive integer `trials`
↦ **WHEN** it completes the dry-run planning phase
∴ **THEN** the returned plan's `phase1_planned` array has exactly `tasks.length × conditions.length × trials` entries; each entry has `task_id`, `condition`, and `trial_index` fields with values drawn from the input arrays and `0 ≤ trial_index < trials`. Trial-id strings follow the harness's existing `${task}-${condition}-single-${index}` shape. `'single'` topology is hardcoded — multi-agent topology is out of scope for v2

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStudy } from '../../study.mjs';

test('B6: runStudy dry-run plans tasks × conditions × trials Phase 1 entries', async () => {
  const plan = await runStudy({
    run_id: 'test-b6-plan',
    tasks: ['slugify', 'throttle'],
    conditions: ['baseline', 'tdd', 'dtdd'],
    trials: 2,
    dry_run: true,
  });
  assert.strictEqual(plan.phase1_planned.length, 12); // 2 × 3 × 2
  for (const entry of plan.phase1_planned) {
    assert.ok(['slugify', 'throttle'].includes(entry.task_id));
    assert.ok(['baseline', 'tdd', 'dtdd'].includes(entry.condition));
    assert.ok(Number.isInteger(entry.trial_index) && entry.trial_index >= 0 && entry.trial_index < 2);
    assert.match(entry.trial_id, /^(slugify|throttle)-(baseline|tdd|dtdd)-single-[01]$/);
  }
});
```

### B7: Phase 2 + Phase 2-WD planning fires for each non-empty Phase 1 trial; empties go to skipped.jsonl
∵ **IF** the orchestrator's `planPhase2({run_id, run_dir, phase1_trial_dirs})` is called with a list of completed Phase 1 trial directories, where some have a non-empty `source/` and some have an empty `source/`
↦ **WHEN** it returns the Phase 2 plan
∴ **THEN** for each trial with non-empty `source/`, the plan contains exactly two entries (one with `include_original_description: false` for Phase 2, one with `include_original_description: true` for Phase 2-WD). For each trial with empty `source/`, the plan contains zero Phase 2 entries and one `skipped` entry with `{trial_id, reason: "empty-source"}`. The plan is purely descriptive (no `dispatchEditTrial` calls fire from `planPhase2`); execution happens separately

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planPhase2 } from '../../study.mjs';

test('B7: planPhase2 routes non-empty trials to P2 + P2-WD; empties to skipped', () => {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'b7-'));
  const t1 = path.join(tmpRoot, 'slugify-dtdd-single-0');
  mkdirSync(path.join(t1, 'source'), { recursive: true });
  writeFileSync(path.join(t1, 'source', 'index.js'), 'export function slugify(){return "";}');
  const t2 = path.join(tmpRoot, 'slugify-dtdd-single-1');
  mkdirSync(path.join(t2, 'source'), { recursive: true });
  // t2 source/ is empty

  const plan = planPhase2({
    run_id: 'test-b7',
    run_dir: tmpRoot,
    phase1_trial_dirs: [t1, t2],
  });
  assert.strictEqual(plan.phase2_planned.length, 2);
  assert.strictEqual(plan.skipped.length, 1);
  assert.strictEqual(plan.skipped[0].reason, 'empty-source');
  assert.match(plan.skipped[0].trial_id, /slugify-dtdd-single-1$/);
  const includes = plan.phase2_planned.map(p => p.include_original_description).sort();
  assert.deepStrictEqual(includes, [false, true]);

  rmSync(tmpRoot, { recursive: true, force: true });
});
```

### B8: Each trial's meta.json records hidden_pass against the appropriate suite
∵ **IF** the orchestrator's `scoreTrialAndUpdateMeta({trial_dir, task_id, phase})` is called for a completed trial whose `source/` contains a passing implementation and whose `meta.json` exists
↦ **WHEN** it scores the trial
∴ **THEN** the `meta.json` is updated to include `hidden_pass: {pass_count: <int>, total_count: <int>}`. For `phase: 'phase-1'`, scoring is against `bench/tasks/<task>/hidden_tests/`; for `phase: 'phase-2'` or `'phase-2-wd'`, against `bench/tasks/<task>/hidden_tests_after_edit/`. Scoring errors (`HiddenTestLeakError`, missing test files) are recorded as `hidden_pass: {error: <message>}` rather than masked as zero

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scoreTrialAndUpdateMeta } from '../../study.mjs';

test('B8: scoreTrialAndUpdateMeta writes hidden_pass into meta.json for phase-1', async () => {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'b8-'));
  const trialDir = path.join(tmpRoot, 'slugify-dtdd-single-0');
  mkdirSync(path.join(trialDir, 'source'), { recursive: true });
  writeFileSync(
    path.join(trialDir, 'source', 'index.js'),
    "export function slugify(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}",
  );
  writeFileSync(path.join(trialDir, 'meta.json'), JSON.stringify({
    trial_id: 'slugify-dtdd-single-0',
    task_id: 'slugify',
  }));

  await scoreTrialAndUpdateMeta({
    trial_dir: trialDir,
    task_id: 'slugify',
    phase: 'phase-1',
  });

  const meta = JSON.parse(readFileSync(path.join(trialDir, 'meta.json'), 'utf8'));
  assert.ok(meta.hidden_pass, 'hidden_pass field must be present');
  assert.ok(Number.isInteger(meta.hidden_pass.pass_count));
  assert.ok(Number.isInteger(meta.hidden_pass.total_count));
  assert.ok(meta.hidden_pass.total_count > 0);

  rmSync(tmpRoot, { recursive: true, force: true });
});
```

### B9: CLI accepts --run-id, --tasks, --conditions, --trials with documented defaults
∵ **IF** `node bench/study.mjs` is invoked with command-line flags
↦ **WHEN** the CLI parses arguments and dispatches to `runStudy`
∴ **THEN** it accepts the following:
  - `--run-id=<string>` (required when not in dry-run; the bench/results subdirectory name)
  - `--tasks=<comma-sep>` (defaults to the five v2 tasks: `slugify,semver-parse,throttle,deep-equal,group-by`)
  - `--conditions=<comma-sep>` (defaults to `baseline,tdd,dtdd`; any value not in that set causes the CLI to exit non-zero with a useful error)
  - `--trials=<positive-int>` (defaults to 1 for smoke; the full v2 lock-time matrix uses 10)
  - `--dry-run` (boolean; if set, prints the planned trial matrix and exits without dispatching)
  Provider configuration is read from environment per the existing harness convention (`BENCH_PROVIDER`, `BENCH_PROVIDER_URL`, `BENCH_PROVIDER_MODEL`, `BENCH_PROVIDER_PROTOCOL`). The CLI does NOT introduce new provider-config flags

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('B9: CLI dry-run lists planned matrix; bad conditions exit non-zero', () => {
  const ok = spawnSync('node', ['bench/study.mjs',
    '--run-id=test-cli',
    '--tasks=slugify',
    '--conditions=baseline,tdd',
    '--trials=1',
    '--dry-run',
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.strictEqual(ok.status, 0, `CLI exited ${ok.status}; stderr: ${ok.stderr}`);
  assert.match(ok.stdout, /slugify.*baseline/);
  assert.match(ok.stdout, /slugify.*tdd/);

  const bad = spawnSync('node', ['bench/study.mjs',
    '--run-id=test-cli-bad',
    '--conditions=nonsense',
    '--trials=1',
    '--dry-run',
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notStrictEqual(bad.status, 0);
  assert.match(
    (bad.stderr || '') + (bad.stdout || ''),
    /condition.*nonsense|invalid condition|unknown condition/i,
  );
});
```

## Red-team check

Decision under test: if we proceed, the project commits to building `bench/study.mjs` + extending `KNOWN_STYLES` per the nine behaviors above, as the unblocker for the v2 Stage-2 run.

Stakes: Phase 7 (testflow) and Phase 8 (subflow) costs are sunk if the spec needs major revision after lock. Larger stake: the actual Stage-2 run depends on this orchestrator being correct; a bug in prompt composition or tool-call extraction silently degrades all 450 trials.

Top three reasons this might not be the right call:

1. **Coupling Baseline-condition + study orchestrator in one spec may produce a subflow PR larger than the reviewer can effectively check.** Nine behaviors is at the upper edge of what one subflow run cleanly handles. Mitigation: subflow's named-agents mode lets reviewers persist across behaviors; if the spec proves too large at testflow time, split into two sequential specs (Baseline first as a 1-behavior spec, orchestrator as the remaining 8). Not a load-bearing objection unless review bandwidth is genuinely scarce.

2. **The tool-shape contract in B5 hard-codes the OpenAI function-call schema, but the Anthropic provider uses a different native tool shape.** If we later run v2 against Claude in addition to the local model, the prompt composer would need to branch by provider. Mitigation: scope is currently local-model-via-openai-compatible per the smoke. If Claude becomes a target, a provider-aware tool-shape adapter is a small additive change. Not load-bearing for the immediate goal.

3. **The trial-id naming in B6 (`<task>-<condition>-single-<trial_index>`) repurposes the slot the harness internally calls `style` to hold the v2 `condition`.** This is mostly a documentation concern: the harness's `dispatchTrial({style: 'baseline'})` accepts the string and writes the artifact dir accordingly, but internal code and meta.json fields still use the name `style` for what the protocol calls `condition`. Mitigation: keep the harness-internal name `style` for backwards compatibility with v1, document the mapping in the orchestrator's README; the protocol's analysis-time code reads the meta.json field by name regardless of label. Not load-bearing.

Verdict: **PROCEED.** All three objections are real but addressable; none requires reshaping the spec before testflow.

## Handoff

After testflow inserts these test fences and wires the spec into `bench/package.json`'s pretest pipeline, `wovenflow:subflow` will dispatch an implementer to make the failing tests pass — extending `bench/runner.js` (B1), adding `bench/study.mjs` (B2-B9), and any test fixtures the tests reference.
