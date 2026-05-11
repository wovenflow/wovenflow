# Bench Phase 2 extension spec

Extends the DTDD bench harness (per `doc/specs/2026-05-10-dtdd-bench.spec.md` and the provider extension at `doc/specs/2026-05-10-bench-provider.spec.md`) with the Phase 2 dispatch + scoring infrastructure that the v2 (artifact-survival) study requires. Reads `doc/research/dtdd-bench-v2.md` and `bench/PROTOCOL-v2.md` for context.

The v2 study runs each task as two (or three) phases per trial:

- **Phase 1** — initial implementation under a methodology condition (Baseline / TDD / DTDD), graded on the original hidden tests
- **Phase 2** — a fresh agent makes an additive edit (`edit.md`) against the Phase 1 artifacts, **without** the original `intent.md`. Graded on `hidden_tests_after_edit/`, which extends the original suite with assertions for the new behavior.
- **Phase 2-WD** — control arm; same as Phase 2 but the fresh agent also sees `intent.md`. Difference between Phase 2 and Phase 2-WD per condition isolates `H_artifact_value`.

The existing harness implements Phase 1 (B1-B10 of the main bench spec, plus provider extension B1-B5). v2 needs three additions: a way to score against an alternate hidden-tests subdirectory, a way to nest phase-specific results under a single trial-id, and a way to dispatch a fresh agent against an existing Phase 1 trial's artifacts.

## User stories

- **As the bench operator running v2**, I want to score Phase 2 trials against `hidden_tests_after_edit/` (which extends the original suite with new-behavior assertions) without losing the ability to score Phase 1 trials against the unmodified `hidden_tests/`, so both H_initial and H_edit can be measured cleanly.
- **As the bench operator**, I want each trial's `phase-1/`, `phase-2/`, and `phase-2-wd/` artifacts collected under one trial directory so per-trial analysis can compare phases side-by-side without cross-directory bookkeeping.
- **As the bench operator**, I want to dispatch a Phase 2 agent against a completed Phase 1 trial's artifacts (and optionally the original `intent.md` for the WD control arm) so the edit task runs under the same harness contract as Phase 1 — same provider abstraction, same stop conditions, same metadata shape.
- **As an external reviewer**, I want Phase 1 trials produced by the existing harness (and the v1 study artifacts already in `bench/results/`) to remain readable and scorable without modification, so v1's Stage-2-lockable run remains valid.

## Behaviors

### B1: scoreHidden accepts an optional hidden_tests_subdir parameter
∵ **IF** the bench's `scoreHidden({task_id, source_dir, ...})` is invoked with an additional optional `hidden_tests_subdir` argument naming a subdirectory under `bench/tasks/<task_id>/` (e.g., `"hidden_tests_after_edit"` for Phase 2 scoring, defaulting to `"hidden_tests"` when omitted)
↦ **WHEN** the scorer runs the held-out suite against the produced source
∴ **THEN** it runs the test files under `bench/tasks/<task_id>/<hidden_tests_subdir>/` instead of the default `hidden_tests/`, applies a path-scoped static-leak check (rejects sources that reference the **exact path string** of the active hidden-tests directory for this call — `bench/tasks/<task_id>/hidden_tests/` for default scoring, `bench/tasks/<task_id>/hidden_tests_after_edit/` for the v2 alternate — bare references to the substring `hidden_tests` without surrounding path context do **not** trip the check), preserves the existing return shape (`{pass_count, total_count, per_test, runtime_errors}`), and throws the same `HiddenTestLeakError` shape on leak

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreHidden, HiddenTestLeakError } from '../bench/scorer.js';

test('B1: hidden_tests_subdir routes scoring to the named alternate suite', async () => {
  const result = await scoreHidden({
    task_id: 'slugify',
    source_dir: 'bench/test/fixtures/source-clean/',
    hidden_tests_subdir: 'hidden_tests_after_edit',
  });
  assert.equal(typeof result.pass_count, 'number');
  assert.equal(typeof result.total_count, 'number');
  assert.ok(result.pass_count <= result.total_count);
  assert.ok(result.per_test && typeof result.per_test === 'object');
});

test('B1: omitting hidden_tests_subdir preserves v1 default behavior (hidden_tests/)', async () => {
  const result = await scoreHidden({
    task_id: 'slugify',
    source_dir: 'bench/test/fixtures/source-clean/',
  });
  assert.equal(typeof result.pass_count, 'number');
  assert.equal(typeof result.total_count, 'number');
});

test('B1: path-scoped static-leak check matches the EXACT active hidden-tests path', async () => {
  await assert.rejects(
    scoreHidden({
      task_id: 'slugify',
      source_dir: 'bench/test/fixtures/source-leak-exact-after-edit/',
      hidden_tests_subdir: 'hidden_tests_after_edit',
    }),
    HiddenTestLeakError,
  );
});

test('B1: path-scoped static-leak check does NOT trip on bare substring "hidden_tests"', async () => {
  const result = await scoreHidden({
    task_id: 'slugify',
    source_dir: 'bench/test/fixtures/source-mentions-hidden-tests-incidentally/',
    hidden_tests_subdir: 'hidden_tests_after_edit',
  });
  assert.equal(typeof result.pass_count, 'number');
});
```

### B2: Trial directory layout supports phase-scoped subdirs
∵ **IF** `captureTrial({run_id, trial_id, fixture, phase})` is invoked with an optional `phase` argument naming a subdirectory under the trial directory (one of `"phase-1"`, `"phase-2"`, `"phase-2-wd"`, with `phase: undefined` preserving the existing single-level layout for back-compat with v1 trials)
↦ **WHEN** the runner records the trial output
∴ **THEN** when `phase` is set, all six artifacts from main-spec B3 (`source/`, `tests/`, `conversation.jsonl`, `meta.json` with tokens/time/stop_reason, and the produced trial dir layout) are written under `bench/results/<run_id>/<trial_id>/<phase>/` instead of `bench/results/<run_id>/<trial_id>/`. The trial-id itself is shared across the trial's phases so per-trial joins are mechanical. When `phase` is undefined, the existing flat layout is preserved.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { captureTrial } from '../bench/runner.js';

test('B2: phase: "phase-1" writes artifacts under <trial-id>/phase-1/', async () => {
  const trialDir = await captureTrial({
    run_id: 'b2-test',
    trial_id: 'slugify-tdd-single-0',
    fixture: 'bench/test/fixtures/completed-trial.json',
    phase: 'phase-1',
  });
  assert.ok(fs.existsSync(`${trialDir}/source`), 'phase-1/source/ missing');
  assert.ok(fs.existsSync(`${trialDir}/tests`), 'phase-1/tests/ missing');
  assert.ok(fs.existsSync(`${trialDir}/conversation.jsonl`), 'phase-1/conversation.jsonl missing');
  assert.ok(fs.existsSync(`${trialDir}/meta.json`), 'phase-1/meta.json missing');
  assert.match(trialDir, /\/phase-1$/);
});

test('B2: phase: "phase-2" writes artifacts under <trial-id>/phase-2/ sibling of phase-1', async () => {
  const trialDir = await captureTrial({
    run_id: 'b2-test',
    trial_id: 'slugify-tdd-single-0',
    fixture: 'bench/test/fixtures/completed-edit-trial.json',
    phase: 'phase-2',
  });
  assert.match(trialDir, /\/phase-2$/);
  // Sibling of phase-1 with the same trial_id
  assert.ok(fs.existsSync(trialDir.replace(/phase-2$/, 'phase-1')));
});

test('B2: phase: undefined preserves the v1 flat layout (no phase subdir)', async () => {
  const trialDir = await captureTrial({
    run_id: 'b2-flat-test',
    trial_id: 'slugify-tdd-single-0',
    fixture: 'bench/test/fixtures/completed-trial.json',
  });
  assert.doesNotMatch(trialDir, /\/phase-/);
  assert.ok(fs.existsSync(`${trialDir}/source`));
});
```

### B3: dispatchEditTrial spawns a fresh agent against Phase 1 artifacts
∵ **IF** `dispatchEditTrial({phase1_trial_dir, task_id, include_original_description, dry_run})` is invoked, where `phase1_trial_dir` points at a completed Phase 1 trial directory (containing `source/`, optionally `tests/` and a `*.spec.md`, and `meta.json`), `task_id` names the task whose `edit.md` will drive the edit, and `include_original_description` is a boolean (`false` for Phase 2, `true` for Phase 2-WD)
↦ **WHEN** the runner dispatches it
↦ **WHEN** the runner dispatches the Phase 2 agent it MUST satisfy all three fresh-agent invariants:
  (a) the Phase 2 agent uses a `name` parameter distinct from any Phase 1 agent's name — convention: `edit-<phase1_trial_id>` (or `edit-wd-<phase1_trial_id>` for the WD arm) — never reusing a Phase 1 name;
  (b) the Phase 2 agent's working directory is a **fresh worktree** freshly populated by **copying** the Phase 1 trial's `source/`, `tests/` (if any), and `*.spec.md` (if any) into it — never the Phase 1 worktree itself;
  (c) the Phase 2 agent's input context **does not include** the Phase 1 agent's `conversation.jsonl`, `meta.json`, or any other run-state artifact — only the produced artifacts and the edit/intent prompts.
∴ **THEN** the agent receives, as input context: the Phase 1 source files, any tests the Phase 1 agent wrote, any `.spec.md` it wrote, and `bench/tasks/<task_id>/edit.md` as the edit prompt. Additionally passes `bench/tasks/<task_id>/intent.md` when and only when `include_original_description` is true. Dispatches via the same provider routing as `dispatchTrial` (per provider-extension B2), enforces the same stop conditions (per provider-extension B5), and writes the trial output to `phase-2/` (when `include_original_description` is false) or `phase-2-wd/` (when true) under the original trial directory via the B2 phase-scoped layout. A harness-side unit test verifies invariants (a), (b), and (c) on every `dispatchEditTrial` call — if any invariant is violated, the call throws before any model call is made.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dispatchEditTrial } from '../bench/runner.js';

test('B3: Phase 2 dispatch routes to phase-2/ when include_original_description is false', async () => {
  const result = await dispatchEditTrial({
    phase1_trial_dir: 'bench/test/fixtures/phase1-completed-trial/',
    task_id: 'slugify',
    include_original_description: false,
    dry_run: true,
  });
  assert.match(result.trial_dir, /\/phase-2$/);
  assert.ok(result.name.startsWith('edit-'));
});

test('B3: Phase 2-WD dispatch routes to phase-2-wd/ when include_original_description is true', async () => {
  const result = await dispatchEditTrial({
    phase1_trial_dir: 'bench/test/fixtures/phase1-completed-trial/',
    task_id: 'slugify',
    include_original_description: true,
    dry_run: true,
  });
  assert.match(result.trial_dir, /\/phase-2-wd$/);
});

test('B3: invariant (a) — Phase 2 name distinct from any Phase 1 name', async () => {
  const result = await dispatchEditTrial({
    phase1_trial_dir: 'bench/test/fixtures/phase1-completed-trial/',
    task_id: 'slugify',
    include_original_description: false,
    dry_run: true,
  });
  assert.ok(!result.name.startsWith('impl-'), `expected distinct name; got ${result.name}`);
});

test('B3: invariant (b) — Phase 2 worktree is fresh, NOT the Phase 1 worktree', async () => {
  const phase1Dir = 'bench/test/fixtures/phase1-completed-trial/';
  const result = await dispatchEditTrial({
    phase1_trial_dir: phase1Dir,
    task_id: 'slugify',
    include_original_description: false,
    dry_run: true,
  });
  assert.notEqual(
    fs.realpathSync(result.worktree_path),
    fs.realpathSync(phase1Dir),
    'Phase 2 worktree must not be the Phase 1 worktree',
  );
});

test('B3: invariant (c) — Phase 2 input context excludes Phase 1 conversation.jsonl and meta.json', async () => {
  const result = await dispatchEditTrial({
    phase1_trial_dir: 'bench/test/fixtures/phase1-completed-trial/',
    task_id: 'slugify',
    include_original_description: false,
    dry_run: true,
  });
  // dry_run echoes the resolved input set; runtime files copied to the worktree
  // must include source/, tests/, edit.md but NOT conversation.jsonl or meta.json
  assert.ok(result.input_context_files.includes('source/index.js') || result.input_context_files.some(f => f.startsWith('source/')));
  assert.ok(result.input_context_files.some(f => f === 'edit.md' || f.endsWith('/edit.md')));
  assert.ok(!result.input_context_files.includes('conversation.jsonl'));
  assert.ok(!result.input_context_files.includes('meta.json'));
});

test('B3: invariant violation throws BEFORE any model call', async () => {
  // Fixture has the Phase 1 conversation.jsonl forcibly placed where the
  // Phase 2 input-context resolver would pick it up — invariant (c) check
  // must fire and throw.
  await assert.rejects(
    dispatchEditTrial({
      phase1_trial_dir: 'bench/test/fixtures/phase1-corrupted-with-conversation-in-source/',
      task_id: 'slugify',
      include_original_description: false,
      dry_run: false, // would call a model if the guard didn't fire
    }),
    /invariant/i,
  );
});

test('B3: include_original_description=true puts intent.md into Phase 2 input context', async () => {
  const wd = await dispatchEditTrial({
    phase1_trial_dir: 'bench/test/fixtures/phase1-completed-trial/',
    task_id: 'slugify',
    include_original_description: true,
    dry_run: true,
  });
  assert.ok(wd.input_context_files.some(f => f === 'intent.md' || f.endsWith('/intent.md')));

  const noWd = await dispatchEditTrial({
    phase1_trial_dir: 'bench/test/fixtures/phase1-completed-trial/',
    task_id: 'slugify',
    include_original_description: false,
    dry_run: true,
  });
  assert.ok(!noWd.input_context_files.some(f => f === 'intent.md' || f.endsWith('/intent.md')));
});
```

### B4: Phase 2 metadata captures the link to Phase 1
∵ **IF** a Phase 2 (or Phase 2-WD) trial completes
↦ **WHEN** the runner writes the phase-scoped `meta.json`
∴ **THEN** the Phase 2 `meta.json` additionally includes `phase` (string: `"phase-2"` or `"phase-2-wd"`), `phase1_trial_dir` (relative path to the parent Phase 1 trial), `edit_prompt_path` (relative path to the `edit.md` used), and `included_original_description` (boolean), so downstream analysis can join Phase 1 and Phase 2 results without inferring the linkage from directory structure

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dispatchEditTrial } from '../bench/runner.js';

test('B4: Phase 2 meta.json includes phase, phase1_trial_dir, edit_prompt_path, included_original_description', async () => {
  const result = await dispatchEditTrial({
    phase1_trial_dir: 'bench/test/fixtures/phase1-completed-trial/',
    task_id: 'slugify',
    include_original_description: false,
    dry_run: false,
    provider: { name: 'mock', script: 'bench/test/fixtures/mock-provider-completes.mjs' },
  });
  const meta = JSON.parse(fs.readFileSync(`${result.trial_dir}/meta.json`, 'utf8'));
  assert.equal(meta.phase, 'phase-2');
  assert.ok(typeof meta.phase1_trial_dir === 'string' && meta.phase1_trial_dir.length > 0);
  assert.ok(meta.edit_prompt_path.endsWith('/edit.md'));
  assert.equal(meta.included_original_description, false);
});

test('B4: Phase 2-WD meta.json sets included_original_description=true and phase=phase-2-wd', async () => {
  const result = await dispatchEditTrial({
    phase1_trial_dir: 'bench/test/fixtures/phase1-completed-trial/',
    task_id: 'slugify',
    include_original_description: true,
    dry_run: false,
    provider: { name: 'mock', script: 'bench/test/fixtures/mock-provider-completes.mjs' },
  });
  const meta = JSON.parse(fs.readFileSync(`${result.trial_dir}/meta.json`, 'utf8'));
  assert.equal(meta.phase, 'phase-2-wd');
  assert.equal(meta.included_original_description, true);
});
```

## Where it lives

- This spec: `doc/specs/2026-05-11-bench-phase2.spec.md`
- Source extensions:
  - `bench/scorer.js` — extended `scoreHidden` with the optional `hidden_tests_subdir` parameter
  - `bench/runner.js` — extended `captureTrial` with the `phase` parameter; new `dispatchEditTrial` export
- New error shapes: none. Existing `ProviderConfigError`, `HiddenTestLeakError` etc. carry over.

## Rules

- **Back-compat with v1 trials is non-negotiable.** `scoreHidden` without `hidden_tests_subdir` runs against `hidden_tests/` exactly as before. `captureTrial` without `phase` writes to the flat layout exactly as before. v1 Stage-2-locked artifacts under `bench/results/` from the existing harness must remain scorable.
- **Phase 2 is a separate dispatch, not a continuation.** Per PROTOCOL-v2 §3.3, the Phase 2 agent is fresh — no memory of Phase 1. Implementation does not pass any Phase 1 conversation log to the Phase 2 agent; it passes only the artifacts the Phase 1 agent left behind.
- **Phase 2-WD vs Phase 2 differs in exactly one input.** The only difference between the two dispatches is whether `intent.md` is included alongside the Phase 1 artifacts. The edit prompt, model, temperature, stop conditions, and Phase 1 artifact set are identical. Confounding this is a publication risk per PROTOCOL-v2 §3.3.
- **Phase 2 hidden-test-pass scoring uses the extended suite.** The Phase 2 trial is graded with `scoreHidden({task_id, source_dir: <phase-2>/source/, hidden_tests_subdir: "hidden_tests_after_edit"})`. A separate `scoreHidden` call against the default `hidden_tests/` checks for regression on the original behaviors.

## Handoff to testflow

Once the prose is locked **and** the red-team check returns PROCEED, invoke `testflow` to insert `test('...', () => {})` blocks alongside each behavior.

## Red-team check (2026-05-11, after one revision pass)

**Decision under test:** If we proceed, this project commits to extending the bench harness with the four behaviors above (`scoreHidden` subdir param, phase-scoped trial layout, `dispatchEditTrial`, Phase 2 metadata), targeting the v2 study's Phase 1 + Phase 2 + Phase 2-WD dispatch shape, before the v2 Stage-2 commitment tag.

**Stakes:** ~1-2 implementer-subagent dispatches; the layout choices are load-bearing for how Phase 1/2 results join in analysis. If wrong, the harness re-spec's later — manageable. If the implementation cuts corners on "Phase 2 agent has no memory of Phase 1," the H_edit and H_artifact_value claims become unfalsifiable.

### Pass 1 (revised here)

The first red-team pass surfaced three objections that drove revisions to B1 and B3:

- **Objection 1 (static-leak check brittleness):** B1 rewritten — the leak check now matches the **exact path string** of the active hidden-tests directory for the call (e.g., `bench/tasks/<task_id>/hidden_tests/`), not the bare substring `hidden_tests`. Source files referencing the substring incidentally don't trip the check.
- **Objection 3 (fresh-agent enforcement easy to violate by accident):** B3 extended with three explicit invariants — distinct `name`, fresh worktree freshly populated by copy from Phase 1 artifacts (not the worktree itself), and no Phase 1 `conversation.jsonl` or run-state artifacts in Phase 2 input. A harness-side unit test verifies the invariants at every `dispatchEditTrial` call and throws before any model call if any fails. Methodology fidelity becomes implementation-enforced.
- **Objection 2 (two trial-directory shapes):** non-load-bearing; recorded below as a v2-followup. Don't block.

### Pass 2

After the revisions above, the spec is re-examined.

1. **B2's back-compat decision still ships two layouts indefinitely without a deprecation plan.** *(severity: worth-noting, confidence: high, angle: cost)*
   Carried over from pass 1's objection 2. Not load-bearing for the v2 run, but worth committing to in writing now so future maintainers know the intent. Resolution: add a v2-followup note (below) that pins the deprecation path. After v2 results land and v1's Stage-2-locked artifacts are either replicated or archived, migrate the v1 trial directories to phase-scoped layout in a single sweep and drop the flat-layout code path. The cost of supporting two layouts is bounded if we name the end.

2. **B3's "harness-side unit test verifies invariants" is sound but doesn't say where the test lives or how it runs.** *(severity: worth-noting, confidence: medium, angle: approach)*
   The invariant check needs to run **before any model call** (per B3's "throws before any model call is made"). That places it in `dispatchEditTrial`'s entry path, not in the bench's existing test suite. The spec should say so explicitly — the implementer should add a runtime guard inside `dispatchEditTrial` that runs the three invariant checks (name distinctness, worktree freshness, no Phase 1 run-state in input) before issuing the dispatch, throwing a descriptive error if any check fails. The test in `testflow` confirms the guard fires on a fixture trial dir that violates an invariant. Implementation note, not a spec change.

3. **The Phase 1 trial's `*.spec.md` could be absent (Baseline and TDD don't produce one) but B3's wording lists it as if the agent always inherits it.** *(severity: minor, confidence: high, angle: failure mode)*
   B3 says "passes that agent the Phase 1 artifacts as input context (source files, any tests the Phase 1 agent wrote, any `.spec.md` it wrote)." The "any" parenthesis already handles this — Baseline trials have no `*.spec.md`, TDD trials have no `*.spec.md`, only DTDD trials do. The Phase 2 agent receives whatever exists in the Phase 1 trial dir; missing artifacts are just absent from the input context. The wording is technically correct but worth confirming the implementer doesn't add a check that throws when `*.spec.md` is missing — it should be treated as "no spec.md to inherit" not "trial corrupt." Implementation note.

### Verdict

**PROCEED** — All three pass-2 objections are non-load-bearing; they map to implementation notes and a follow-up cleanup, not spec revisions.

- Objection 1 → recorded as v2-followup below.
- Objection 2 → implementer adds the invariant check inline in `dispatchEditTrial`'s entry path; testflow asserts the guard fires.
- Objection 3 → implementer treats absent `*.spec.md` as normal (Baseline/TDD case), not as a corrupt trial.

Hand off to **testflow** to insert inline test fences alongside each behavior.

## v2-followups (non-blocking)

- **Trial layout deprecation.** Once v2 results land and v1's Stage-2-locked artifacts under `bench/results/` are either replicated under v2's framework or archived, migrate the flat v1 trial directories to phase-scoped layout in a single sweep (each becomes a `phase-1/` subdir under the trial directory) and remove the flat-layout code path in `captureTrial`. Bench harness then supports one layout. Tracked here so future maintainers don't keep paying the two-layout cost without an end.

