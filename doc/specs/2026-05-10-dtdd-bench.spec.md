# DTDD prompting-style benchmark spec

Bench harness for a pre-registered factorial study comparing DTDD prompting against TDD, plan-then-test, and free-form across single-agent and multi-agent topologies. Reads `doc/research/dtdd-bench.md` for prior art and validity context.

## User stories

- **As a researcher comparing prompting styles**, I want a reproducible bench harness so I can run pre-registered trials and report defensible findings rather than vibes.
- **As a methodology author defending DTDD**, I want a contamination-controlled comparison with blind-authored style cards so the result cannot be dismissed as researcher bias or benchmark leakage.
- **As an external reviewer**, I want pre-registration, raw conversation logs, automated compliance verification, and protocol-version pinning so I can audit any claim end-to-end.
- **As a wovenflow CI maintainer**, I want a small subset of the bench to run cheaply on each release so we can detect regressions in DTDD's relative position over time as the underlying model evolves.
- **As a future extender**, I want adding a fifth workflow style or a third topology to be a localized change so the harness ages well.

## Behaviors

### B1: Run is configured by a single pre-registered protocol file
∵ **IF** the bench is invoked with `--protocol <path>` referencing a file conforming to the protocol schema (tasks, styles, topologies, model id, N trials per cell, temperature, stop conditions, seed)
↦ **WHEN** the runner starts
∴ **THEN** it parses the protocol, validates that every required field is present and well-typed, captures the protocol's git commit SHA into the run metadata, and prints the loaded configuration before dispatching any trial — refusing to dispatch if validation fails

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProtocol, ProtocolValidationError } from '../bench/runner.js';

test('B1: loads valid protocol file with required fields and pins commit SHA', () => {
  const result = loadProtocol('bench/test/fixtures/valid-protocol.json');
  for (const field of ['tasks', 'styles', 'topologies', 'model_id', 'n_trials_per_cell', 'temperature', 'stop_conditions', 'seed']) {
    assert.ok(field in result.config, `missing required field: ${field}`);
  }
  assert.match(result.metadata.protocol_sha, /^[0-9a-f]{40}$/, 'protocol_sha must be a full git SHA');
});

test('B1: refuses to dispatch when a required protocol field is missing', () => {
  assert.throws(
    () => loadProtocol('bench/test/fixtures/protocol-missing-styles.json'),
    ProtocolValidationError,
  );
});
```

### B2: Each trial is dispatched with the right style card and topology, otherwise identical
∵ **IF** a trial is queued with (task_id, style, topology, trial_index)
↦ **WHEN** the runner dispatches it
∴ **THEN** it injects the style card from `bench/styles/<style>.md` as the system prompt, sets the working directory to a fresh per-trial worktree branched from a clean commit, and dispatches either a single agent (`topology=single`) or an orchestrator + per-task subagents (`topology=multi`)

The multi-agent topology helper is fully specified at `bench/topology/multi.md` and is **constant across all four styles**. That specification names: (a) the decomposition rule the orchestrator uses to split a task into subtasks, (b) the synchronization points (when subagents must report back), (c) the clarification routing protocol (how a subagent surfaces ambiguity), (d) the stop condition. Where a style's methodology legitimately requires asymmetric handling (e.g., DTDD's `.spec.md` as canonical source under test), the asymmetry is documented in the style card and called out as a methodology-driven choice in the protocol — not a hidden confound. The bench rejects topology configs that introduce style-specific wiring outside the style card.

No DTDD-specific tooling is auto-injected (no `extract.mjs` or `worktree.mjs` from wovenflow). If a style's agent chooses to invoke such tools, that's a methodology choice the agent is making — not a harness asymmetry.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTrial } from '../bench/runner.js';

test('B2: injects the named style card as system prompt and uses the constant multi-agent helper', async () => {
  const dispatched = await dispatchTrial({
    task_id: 'slugify',
    style: 'dtdd',
    topology: 'multi',
    trial_index: 0,
    dry_run: true,
  });
  assert.equal(dispatched.style_card_path, 'bench/styles/dtdd.md');
  assert.equal(dispatched.topology_helper_path, 'bench/topology/multi.md');
  assert.match(dispatched.worktree_path, /\/bench\/worktrees\/slugify-dtdd-multi-0$/);
});

test('B2: refuses topology configs that introduce style-specific wiring outside the style card', () => {
  assert.throws(
    () => dispatchTrial({
      task_id: 'slugify',
      style: 'tdd',
      topology: 'multi',
      trial_index: 0,
      dry_run: true,
      topology_helper_path: 'bench/topology/multi-tdd-only.md',
    }),
    /style-specific topology wiring rejected/,
  );
});
```

### B3: Trial output is captured before any scoring
∵ **IF** a trial completes — agent declares done OR turn limit reached OR wall-clock cap reached
↦ **WHEN** the runner records the trial
∴ **THEN** it captures into `bench/results/<run-id>/<trial-id>/`: (a) the produced source code as `source/`, (b) any tests the agent wrote as `tests/`, (c) the full conversation log as `conversation.jsonl`, (d) tokens consumed (input + output, per turn), (e) wall-clock time, (f) the stop reason (`done` / `turn-cap` / `time-cap` / `error`)

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { captureTrial } from '../bench/runner.js';

test('B3: writes all six required artifacts under the trial directory and locks before scoring', async () => {
  const trialDir = await captureTrial({
    run_id: 'test-run-001',
    trial_id: 'slugify-dtdd-multi-0',
    fixture: 'bench/test/fixtures/completed-trial.json',
  });
  assert.ok(fs.existsSync(`${trialDir}/source`), 'source/ missing');
  assert.ok(fs.existsSync(`${trialDir}/tests`), 'tests/ missing');
  assert.ok(fs.existsSync(`${trialDir}/conversation.jsonl`), 'conversation.jsonl missing');
  const meta = JSON.parse(fs.readFileSync(`${trialDir}/meta.json`, 'utf8'));
  assert.ok(typeof meta.tokens_input === 'number');
  assert.ok(typeof meta.tokens_output === 'number');
  assert.ok(typeof meta.wall_clock_ms === 'number');
  assert.ok(['done', 'turn-cap', 'time-cap', 'error'].includes(meta.stop_reason));
});
```

### B4: Hidden-test pass rate is computed against truly held-out tests
∵ **IF** a trial has produced source code and the task has a hidden test suite at `bench/tasks/<task-id>/hidden_tests/`
↦ **WHEN** the scorer runs the hidden suite against the produced source in an isolated environment
∴ **THEN** it records pass count, total count, the per-test pass/fail map, and any runtime errors; **the produced source code is sandboxed from accessing or importing anything from the hidden-tests directory at any point during the trial or scoring** — verified by static check (no path references to `hidden_tests/` in source) and runtime check (filesystem permission denial on the hidden-tests path)

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreHidden, HiddenTestLeakError } from '../bench/scorer.js';

test('B4: returns pass/total/per-test map and never lets source see hidden-tests dir', async () => {
  const result = await scoreHidden({
    task_id: 'slugify',
    source_dir: 'bench/test/fixtures/source-clean/',
  });
  assert.equal(typeof result.pass_count, 'number');
  assert.equal(typeof result.total_count, 'number');
  assert.ok(result.pass_count <= result.total_count);
  assert.ok(result.per_test && typeof result.per_test === 'object');
});

test('B4: rejects source that statically references the hidden-tests directory', async () => {
  await assert.rejects(
    scoreHidden({
      task_id: 'slugify',
      source_dir: 'bench/test/fixtures/source-leak/',
    }),
    HiddenTestLeakError,
  );
});
```

### B5: Self-test pass rate is computed and reported separately
∵ **IF** a trial produced both source code and tests
↦ **WHEN** the scorer runs the agent's own tests against the agent's own source
∴ **THEN** it records pass count, total count, test count, lines-of-test (parsimony signal), and a flag for whether all the agent's tests pass — failure here means the agent reported done with red tests, which is a methodology-compliance issue worth surfacing

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSelf } from '../bench/scorer.js';

test('B5: reports pass count, test count, lines-of-test, and all-pass flag', async () => {
  const result = await scoreSelf({
    source_dir: 'bench/test/fixtures/source-clean/',
    tests_dir: 'bench/test/fixtures/tests-with-some-failing/',
  });
  assert.equal(typeof result.pass_count, 'number');
  assert.equal(typeof result.total_count, 'number');
  assert.equal(typeof result.test_count, 'number');
  assert.equal(typeof result.lines_of_test, 'number');
  assert.equal(typeof result.all_pass, 'boolean');
  assert.equal(result.all_pass, result.pass_count === result.total_count);
});
```

### B6: Self-test coverage of hidden cases is computed (the novel metric)
∵ **IF** a trial produced tests and the task's hidden-test suite has labeled cases (each hidden test tagged with edge-case categories like `empty-input`, `unicode`, `off-by-one`, `negative`, `large-input`, `null`, `type-coercion`)
↦ **WHEN** the coverage scorer compares the agent's tests against the hidden labels
∴ **THEN** for each hidden-test label it records whether at least one of the agent's tests asserts on the same labeled case, scored by a semantic predicate per task

The per-task semantic predicates are authored under blinding to remove the obvious researcher-bias attack: predicates are written by a person (or LLM) who sees only the labels and a generic spec of what each label means, never the produced tests with their style tag. Each predicate is committed to `bench/tasks/<task-id>/coverage_predicates/` and is **published as part of the bench repo** so external reviewers can read, contest, and re-score. The bench refuses to start if any task lacks coverage predicates for every label its hidden tests use.

Predicates inspect AST or text and return boolean per label — never literal-text match, which over-counts. If the predicate library produces low inter-rater agreement when re-authored by an independent third party (target ≥0.80 Cohen's kappa on a sample), the metric is reported as low-confidence and the predicates are revised before the headline result is published.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCoverage, MissingPredicatesError } from '../bench/scorer.js';

test('B6: returns per-label boolean coverage map using blind-authored predicates', async () => {
  const result = await scoreCoverage({
    task_id: 'slugify',
    tests_dir: 'bench/test/fixtures/tests-with-edge-cases/',
  });
  assert.ok(result.per_label && typeof result.per_label === 'object');
  for (const label of ['empty-input', 'whitespace-only', 'unicode-non-ascii']) {
    assert.equal(typeof result.per_label[label], 'boolean', `missing label ${label}`);
  }
  assert.equal(result.predicates_path, 'bench/tasks/slugify/coverage_predicates/');
});

test('B6: refuses to score when a task is missing a predicate for a label its hidden tests use', async () => {
  await assert.rejects(
    scoreCoverage({
      task_id: 'task-with-incomplete-predicates',
      tests_dir: 'bench/test/fixtures/tests-empty/',
    }),
    MissingPredicatesError,
  );
});
```

### B7: Methodology compliance is verified by a human-graded stratified sample
∵ **IF** a run has completed all trials under all styles
↦ **WHEN** the compliance grader is invoked on a stratified sample of ≥30 trials per style (proportional across tasks)
∴ **THEN** 2-3 human graders independently rate each sampled trial as `compliant` or `non-compliant` against the style's methodology, citing specific evidence from the conversation log; per-trial verdict is the majority; per-style compliance rate, inter-rater agreement (Cohen's kappa), and disagreement examples are all reported

The grading rubric per style:
- **TDD:** test artifact exists in the trial AND the conversation shows the agent intentionally writing tests as a primary planning step (not "I'll write a test for this" tossed in mid-implementation).
- **DTDD:** a `.spec.md`-shaped artifact (prose ∵IF/↦WHEN/∴THEN behaviors plus inline test fences) was produced AND referenced as the source of truth in the conversation.
- **Plan-then-test:** a plan markdown artifact (not a source file) was produced before any source.
- **Free-form:** always compliant.

Why human-graded and not deterministic: an automated rule like "test file mentioned strictly before source" produces too many false positives (mention without commit) and false negatives (same-turn writes with ambiguous ordering). Asking an LLM to grade peer outputs introduces a model-judging-its-own-family validity threat the literature explicitly warns against (per the surveyed empirical-SE guidelines).

Trials outside the sample are reported with their automated-only metrics (hidden-pass, self-pass, self-coverage, tokens, time); the report makes the sample-vs-full distinction explicit. Per-style results are broken down by `compliant` vs `non-compliant` within the sample so readers can see whether a style's score is dragged by instruction-following failures.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleForGrading, aggregateGrading } from '../bench/grader.js';

test('B7: stratified sample includes ≥30 trials per style across all tasks', () => {
  const sample = sampleForGrading({
    run_dir: 'bench/test/fixtures/run-200-trials/',
    sample_size_per_style: 30,
    seed: 42,
  });
  const counts = {};
  for (const trial of sample) counts[trial.style] = (counts[trial.style] || 0) + 1;
  for (const style of ['tdd', 'dtdd', 'plan', 'freeform']) {
    assert.ok((counts[style] || 0) >= 30, `style ${style} has ${counts[style]} < 30`);
  }
});

test('B7: aggregation reports majority verdict, per-style compliance rate, and Cohen kappa', () => {
  const result = aggregateGrading({
    grades_path: 'bench/test/fixtures/grades-3-raters.json',
  });
  for (const style of ['tdd', 'dtdd', 'plan', 'freeform']) {
    assert.equal(typeof result.compliance_rate[style], 'number');
  }
  assert.equal(typeof result.cohens_kappa, 'number');
  assert.ok(Array.isArray(result.disagreements));
});
```

### B8: Run aggregation produces a stable, reviewer-readable report
∵ **IF** all trials in a run have completed and been scored
↦ **WHEN** the reporter is invoked
∴ **THEN** it produces `bench/results/<run-id>/report.md` containing: (1) run metadata (protocol SHA, model id, temperature, seed, total trials, total cost), (2) per-style aggregate table with mean and 95% confidence interval for each metric (hidden-test pass rate, self-test pass rate, self-test coverage of hidden cases, tokens, time, compliance rate), (3) per-task heatmap showing each (task × style) cell, (4) per-cell breakdown by `compliant` vs `non-compliant`, (5) a raw-data appendix with relative links to every per-trial directory

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateReport } from '../bench/reporter.js';

test('B8: report.md contains all five required sections with metadata and CIs', async () => {
  const reportPath = await generateReport({ run_dir: 'bench/test/fixtures/run-scored/' });
  const md = fs.readFileSync(reportPath, 'utf8');
  for (const heading of [
    '## Run metadata',
    '## Per-style aggregates',
    '## Per-task heatmap',
    '## Compliant vs non-compliant',
    '## Raw data',
  ]) {
    assert.ok(md.includes(heading), `missing section: ${heading}`);
  }
  assert.match(md, /protocol_sha:\s*[0-9a-f]{40}/, 'metadata must pin protocol SHA');
  assert.match(md, /95% CI/, 'aggregates must include 95% CI');
});
```

### B9: Tasks declare their provenance and contamination status
∵ **IF** a task is added under `bench/tasks/<task-id>/`
↦ **WHEN** the bench validates tasks before runtime
∴ **THEN** it requires a `bench/tasks/<task-id>/provenance.md` declaring (a) source: `livecodebench-post-2025-cutoff` | `hand-written` | `other-with-justification`, (b) the model-cutoff date the source was published after (if applicable), (c) any URLs the task or hidden tests are derived from. The bench refuses to start if any task lacks provenance, and surfaces contamination risk per task in the report

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTasks, MissingProvenanceError } from '../bench/validator.js';

test('B9: refuses to start when any task lacks provenance.md', () => {
  assert.throws(
    () => validateTasks({
      tasks_dir: 'bench/test/fixtures/tasks-missing-provenance/',
    }),
    MissingProvenanceError,
  );
});

test('B9: returns per-task contamination metadata when all provenance is valid', () => {
  const result = validateTasks({
    tasks_dir: 'bench/test/fixtures/tasks-with-provenance/',
  });
  assert.ok(Array.isArray(result.tasks));
  for (const task of result.tasks) {
    assert.ok(['livecodebench-post-2025-cutoff', 'hand-written', 'other-with-justification'].includes(task.source));
    assert.equal(typeof task.contamination_risk, 'string');
  }
});
```

### B10: A run cannot start if the protocol or harness has uncommitted changes
∵ **IF** the working tree contains uncommitted changes to `bench/PROTOCOL.md`, `bench/styles/`, `bench/tasks/`, or any harness source under `bench/`
↦ **WHEN** the runner is invoked
∴ **THEN** it refuses to start unless `--allow-dirty` is passed, prints the dirty paths and a one-line explanation that pre-registered runs require a clean commit so the protocol SHA in the run metadata is meaningful

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPreregistration, DirtyTreeError } from '../bench/validator.js';

test('B10: refuses to start when bench/ has uncommitted changes and --allow-dirty is not passed', () => {
  assert.throws(
    () => checkPreregistration({
      bench_dir: 'bench/test/fixtures/dirty-tree/',
      allow_dirty: false,
    }),
    DirtyTreeError,
  );
});

test('B10: proceeds with --allow-dirty but records the dirty paths in metadata', () => {
  const result = checkPreregistration({
    bench_dir: 'bench/test/fixtures/dirty-tree/',
    allow_dirty: true,
  });
  assert.ok(Array.isArray(result.dirty_paths));
  assert.ok(result.dirty_paths.length > 0);
  assert.equal(result.allow_dirty, true);
});

test('B10: clean tree captures protocol SHA and proceeds without --allow-dirty', () => {
  const result = checkPreregistration({
    bench_dir: 'bench/test/fixtures/clean-tree/',
    allow_dirty: false,
  });
  assert.match(result.protocol_sha, /^[0-9a-f]{40}$/);
  assert.equal(result.dirty_paths.length, 0);
});
```

## Where it lives

- This spec: `doc/specs/2026-05-10-dtdd-bench.spec.md`
- Source: `bench/` (harness implementation)
- Pre-registration: `bench/PROTOCOL.md` (separate methodology-document artifact, derived from this spec)
- Style cards: `bench/styles/{tdd,dtdd,plan,freeform}.md` (authored by a blind LLM from a fixed methodology spec)
- Tasks: `bench/tasks/<task-id>/` (with `intent.md`, `hidden_tests/`, `provenance.md`)
- Results: `bench/results/<run-id>/`

## Rules

- **No DTDD-specific tooling in the harness path.** `extract.mjs` and `worktree.mjs` may be used by the DTDD condition's *agent* if it chooses to invoke them, but the harness itself never injects them. Other styles must have equivalent tools available, or none.
- **Pre-registration is procedural, not optional.** B10 enforces it.
- **Compliance failures are reported, not hidden.** B7 forces honesty about whether the comparison is fair within each cell.
- **Self-test coverage is the methodology metric.** B6 is the novel claim from researchflow; report it prominently.

## Handoff to testflow

Once this spec is locked and the red-team check returns PROCEED, invoke `testflow` to insert inline test fences alongside each behavior. The harness is implementable in TypeScript or Python; pick the one matching wovenflow's existing extract.mjs ecosystem (TypeScript / `node:test`).

## Red-team check (2026-05-10, after one revision pass)

**Decision under test:** If we proceed, this project commits to building a 10-behavior bench harness in TypeScript that runs a 4×2 factorial pre-registered comparison of prompting styles, with the goal of producing a publishable directional finding about whether DTDD's prose-contract methodology generalizes beyond visible tests.

**Stakes:** ~1-2 weeks of build time; ~$30-150 of model spend per full run; a public claim about DTDD's effectiveness whose direction we cannot pre-determine. If the result is null or negative, we publish that. If the bench design has a flaw, the published result is wrong AND the methodology paper around it is wrong.

### Pass 1 (revised here)

The first red-team pass surfaced three objections that drove revisions to B2, B6, and B7. Summary:

- **Objection 1 (compliance verifier was too brittle):** B7 rewritten — human-graded stratified sample, 2-3 raters, Cohen's kappa reported, LLM grading explicitly avoided.
- **Objection 2 (coverage predicates were experimenter-authored):** B6 rewritten — predicates authored under blinding, published in the repo, ≥0.80 inter-rater kappa target on independent re-authoring.
- **Objection 3 (multi-agent harness was underspecified):** B2 extended — multi-agent topology helper fully specified at `bench/topology/multi.md`, constant across styles, with documented asymmetries called out as methodology-driven choices in the protocol rather than hidden confounds.

### Pass 2

After the revisions above, the spec is re-examined.

1. **The bench produces a directional finding, not a definitive one — and the README should foreground that.** *(severity: worth-noting, confidence: high, angle: audience)*
   N=5 trials per cell × 10 tasks gives ~50 trials per style — enough for confidence intervals on aggregate metrics, not enough for fine-grained per-task or per-style-per-task analysis. A reader looking at "DTDD beats TDD by 8% on hidden-test pass" with overlapping CIs may take it as definitive. The fix is presentational — the report (B8) should print effect-size CIs prominently and label the result "directional preprint, not peer-reviewed claim." Anchored to: B8's report contents. Not load-bearing for the spec; load-bearing for honest publication.

2. **Wall-clock and token cost (B3, B8) are reported but not explicitly used as decision metrics — and they should at least be candidates.** *(severity: minor, confidence: medium, angle: cost)*
   Tokens consumed per task per style is a real outcome measure (DTDD might produce better code at 2× the tokens, which changes the value proposition for users). The spec captures the data but doesn't elevate it to a primary metric. Worth elevating to "secondary metric reported alongside hidden-pass" rather than appendix-only. Fix: B8's aggregate table already includes tokens and time; making them prominent rather than buried is a reporter-implementation choice, not a spec change. Anchored to: B8.

3. **The bench validates DTDD against TDD/plan/free-form, but the strongest TDD baseline (e.g., something from the WebApp1K paper's prompt template) is not specified — risk of strawman TDD.** *(severity: worth-noting, confidence: medium, angle: approach)*
   B2 says the style cards are blind-authored from a methodology spec, which addresses some of this. But "what is the right TDD prompt to compare against" is itself a methodology choice that affects results. If the blind author writes a thin TDD card and a thick DTDD card, the comparison is unfair. The fix is in the style-card authoring: specify a target word count and structural-equivalence requirement so every style card is similar in length, specificity, and authorial care. Not strictly a spec change; it's a constraint on `bench/styles/<style>.md` authoring that the protocol document should pin. Anchored to: B2's reference to style cards.

### Verdict

**PROCEED** — Three objections this pass, none load-bearing. Each maps to the protocol document or report-implementation choices rather than spec revisions:

- Objection 1 → `bench/PROTOCOL.md` should explicitly state "directional preprint, not peer-reviewed."
- Objection 2 → B8 implementation should foreground tokens and time as secondary metrics (no spec change).
- Objection 3 → `bench/styles/AUTHORING.md` should pin word-count and structural-equivalence requirements for all four style cards (the blind author works to that spec).

Hand off to **testflow** to insert inline test fences alongside each behavior. The harness implementation (subflow) follows once tests fail red.

The handoff also includes drafting `bench/PROTOCOL.md` as a separate registered-report-shaped artifact derived from this spec. PROTOCOL.md is for human reviewers (registered-report shape: hypotheses, procedure, statistical analysis plan, pre-commitment to publish all results); the spec is the executable contract for the harness code. Both artifacts come from the same intent, encoded for different audiences.
