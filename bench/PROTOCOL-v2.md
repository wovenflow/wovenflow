# DTDD prompting-style benchmark — protocol v2 (artifact-survival study)

**Version:** v2
**Date:** 2026-05-11
**Status:** Stage-1 pre-registration. No model calls have been made against this protocol.
**Relationship to v1:** `PROTOCOL.md` (the Stage-1 lock tagged `stage-2-pre-registered-2026-05-10`) measures one quadrant — "does DTDD produce better initial code than alternatives on hidden tests." This v2 protocol replaces that frame with a sharper experimental design that measures both **initial code quality** and **artifact survival under maintenance**. v1 is not deprecated; the work it locked (style cards, tasks, predicates, harness) is reused here. The hypotheses, conditions, and procedure differ.

## 1. Background and rationale

The v1 protocol's three hypotheses (H1/H2/H3) target initial code quality. The Claude smoke test (2026-05-10) and the local-model smoke test (Qwen2.5-Coder-1.5B and -14B, 2026-05-10) surfaced two real problems:

1. **Slugify is ceiling-bound at Claude/14B-class capability.** Both TDD and DTDD hit 100% hidden-test pass; no methodology can demonstrate effect on a task whose simple regex implementation generalizes. The original task set has more such tasks (`dedupe-ordered`, `group-by`, `normalize-whitespace`).

2. **DTDD's actual value proposition isn't fully captured by initial-code-quality metrics.** The methodology's central claim is that the prose-contract-with-inline-tests artifact (`*.spec.md`) preserves design intent through future maintenance — that a fresh agent working on a year-old codebase has more to work with under DTDD than under TDD (tests-only) or Baseline (code-only). The v1 protocol cannot test this.

v2 tests both questions: does the methodology change the initial output, AND does the methodology produce artifacts that better survive a subsequent maintenance edit by a fresh agent that does not see the original task description.

## 2. Hypotheses

All hypotheses are pre-specified with falsifiable effect-size thresholds. Per the protocol's pre-commitments, results are published regardless of direction.

### H_initial (DTDD produces better initial code)

DTDD's structured prose contract makes the agent enumerate behaviors and edge cases the loose description didn't name, producing code with higher hidden-test pass rate than the Baseline (loose description only) and TDD (tests-first, no prose) conditions.

**Effect size threshold:** mean hidden-test pass rate under DTDD exceeds Baseline by ≥0.15 absolute with non-overlapping 95% CIs. DTDD also exceeds TDD by ≥0.05 absolute. Falsified if either threshold is not met.

### H_edit (DTDD's artifacts survive a maintenance edit better)

A fresh agent making an additive edit to existing code — without access to the original task description — performs better when the artifacts it inherits include a DTDD `.spec.md` than when it inherits only tests (TDD) or only code (Baseline).

**Effect size threshold:** mean post-edit hidden-test pass rate (original behaviors + new) under DTDD exceeds Baseline by ≥0.20 absolute with non-overlapping 95% CIs. DTDD also exceeds TDD by ≥0.10 absolute. Falsified if either threshold is not met.

### H_artifact_value (the spec.md adds value beyond the original description being available)

The DELTA between "Phase 2 with original description available" and "Phase 2 without original description" is smaller under DTDD than under TDD or Baseline. In plain English: when the original description is lost, DTDD's spec.md preserves more of the necessary context than tests-only or code-only.

**Effect size threshold:** the delta (DTDD without-description minus DTDD with-description) is smaller in absolute terms than the corresponding delta for Baseline by ≥0.10. Falsified if the deltas are equal or DTDD's delta is larger.

### Secondary outcomes (reported, no pre-specified threshold)

- Token cost per condition (initial + edit phases combined)
- Wall-clock time per condition
- Self-test coverage of hidden labels (carried over from v1's H2 framing)
- Scope-drift on edit (did Phase 2 touch code outside the edit's intended scope?)
- Per-task heatmaps

## 3. Method

### 3.1 Tasks (N = 5 for v1, expanding to 10 if v1 results warrant)

Tasks are drawn from the v1 set, filtered for **edge-case headroom on Claude/14B-class models**. Tasks where simple regex / Set / Map natively generalizes are excluded — slugify, dedupe-ordered, group-by, normalize-whitespace are out for v1. Initial task set:

1. `semver-parse` — prerelease + build metadata + leading zeros + invalid shapes
2. `throttle` — timing edges, this-binding, burst coalescing
3. `deep-equal` — cyclic refs, NaN, type mismatch
4. `paginate` — offset boundaries, hasMore flag, negative offset
5. `parse-cli-flags` — combined short flags, repeated flags, boolean variants

Each task is reused from v1 with no changes to `intent.md`, `hidden_tests/`, or `coverage_predicates/`. New per-task artifacts added for v2:

- `edit.md` — one-paragraph additive edit prompt, blind-authored from `intent.md` (see §3.5)
- `hidden_tests_after_edit/` — extended hidden test suite covering both the original behaviors (regression check) and the newly-added behavior (correctness check)

### 3.2 Conditions

Three conditions, single-agent topology only. Multi-agent dropped from v2 (the multi-agent hypothesis H3 is deferred; v1's multi-agent topology helper sits unused).

| Condition | Phase 1 prompt | Phase 1 artifacts |
|---|---|---|
| **Baseline** | `intent.md` only — no style card | Code (`source/`) only |
| **TDD** | `intent.md` + `bench/styles/tdd.md` | Code + tests (`source/` + `tests/`) |
| **DTDD** | `intent.md` + `bench/styles/dtdd.md` | Code + tests + spec.md (`source/` + `tests/` + `<task>.spec.md`) |

The style cards are unchanged from v1 (blind-authored per `bench/styles/AUTHORING.md`). Baseline has no style card — just the loose description and instructions to implement.

### 3.3 Procedure

**Phase 1 — Initial implementation.**

1. Fresh per-trial worktree branched from a clean commit.
2. Style card (if any) + `intent.md` injected as agent input.
3. Agent dispatched per the bench harness's `dispatchTrial({dry_run: false})` (B1 of bench-provider spec) with single-agent topology.
4. Stop conditions per B5: 20 turns OR 15 minutes wall-clock OR agent declares done.
5. Phase 1 artifacts captured to `bench/results/<run-id>/<trial-id>/phase-1/`.

**Phase 2 — Maintenance edit.**

1. Fresh agent (no memory of Phase 1).
2. Inputs:
   - All Phase 1 artifacts for this trial (source, tests if any, spec.md if any)
   - `edit.md` for this task — the additive edit prompt
   - **NOT** included: `intent.md` (the original task description)
3. Agent dispatched as Phase 1 except for the input set.
4. Phase 2 artifacts captured to `bench/results/<run-id>/<trial-id>/phase-2/`.

**Phase 2-WD (Phase 2 With Description) — control arm for H_artifact_value.**

Same as Phase 2 but the original `intent.md` IS included alongside the Phase 1 artifacts. The delta (Phase 2 score minus Phase 2-WD score) per condition measures how much value the original description added on top of whatever the methodology's artifacts preserve. H_artifact_value tests whether this delta is smaller for DTDD than for Baseline.

**Trial structure.** Per (condition, task) cell: N=10 Phase 1 trials. Per Phase 1 trial, one Phase 2 trial and one Phase 2-WD trial (both running fresh agents from the same Phase 1 artifacts). Total per cell = 30 trials × 5 tasks × 3 conditions = 450 trials. Plus or minus depending on Phase 2 trial structure decisions.

### 3.4 Model

- **Model ID:** TBD — primary candidates are Claude Sonnet 4.6 (matches v1) or a local Qwen2.5-Coder-14B/32B via `BENCH_PROVIDER=openai-compatible`. The local-model path costs $0 and is the realistic Stage-2 environment per v1 PROTOCOL.md §3.4 (planned, via local model).
- **Temperature:** 0.7. Same as v1.
- **Max tokens per turn:** model default.

Pinned at Stage-2 lock. If the protocol is run on both Claude and a local model, results are reported per-model with no cross-model comparison (per v1 §B4 of the bench-provider spec).

### 3.5 Edit prompt authoring (blind LLM)

`edit.md` for each task is authored by a clean subagent given **only** the task's `intent.md`. The subagent's brief asks it to propose one realistic additive extension a user might request after the initial implementation lands. Same isolation pattern as the style cards and predicates.

Constraints on `edit.md`:

- The edit is **additive** (per the locked design choice). The original behaviors continue to work; the edit adds a new behavior on top.
- The edit is **describable in one paragraph** matching the `intent.md`'s shape.
- The edit must be **testable** — the new behavior must be hidden-test-able with assertions on inputs/outputs.

After authoring, the orchestrator extends `hidden_tests_after_edit/` to cover the new behavior plus all original behaviors. The extension may reuse the original `hidden_tests/` plus add ≥3 new assertions for the edit's new behavior.

### 3.6 Scoring

Phase 1 scoring (unchanged from v1):

- **Hidden-test pass rate** — `scoreHidden({task_id, source_dir: phase-1/source/})`
- **Self-test pass rate** — `scoreSelf` (TDD and DTDD only; Baseline has no tests)
- **Self-coverage of hidden labels** — `scoreCoverage` (TDD and DTDD only)

Phase 2 scoring (new):

- **Post-edit hidden-test pass rate** — `scoreHidden({task_id, source_dir: phase-2/source/, hidden_tests_subdir: 'hidden_tests_after_edit'})`. Requires extending B4 of the bench spec to accept a non-default hidden-tests subdir.
- **Regression check** — `scoreHidden` against the *original* `hidden_tests/` on the Phase 2 source. The post-edit code must not break any previously-passing test. Reported separately as `regression_pass_rate`.
- **Scope drift** — diff between Phase 1 source and Phase 2 source, count of lines changed outside the edit's intended scope. Heuristic; flagged but not in primary metric.

`H_artifact_value` is computed as: for each (condition, task), the difference between Phase 2-WD's post-edit pass rate and Phase 2's post-edit pass rate. Smaller difference = methodology's artifacts preserved more of what `intent.md` provided.

### 3.7 Methodology compliance verification

Per v1 `B7`: human-graded stratified sample. The Phase 1 rubric (per `bench/grading-rubric.md`) applies. Baseline is automatically compliant (no methodology to follow). TDD and DTDD use the existing rubric criteria.

For Phase 2, an additional rubric line: "Did the edit agent respect the methodology of the inherited artifacts?" — for example, did the DTDD edit agent update the spec.md alongside the code, or did it let the spec.md drift? Drift is a methodology failure for DTDD specifically.

## 4. Statistical analysis plan

Per-condition aggregates with bootstrap 95% CIs (10,000 resamples). Bonferroni correction across H_initial, H_edit, H_artifact_value (alpha = 0.05 / 3 = 0.0167; 98.33% CIs).

Per-task heatmaps reported. Per-cell breakdowns by Phase 1 compliance (compliant trials only vs all trials).

Sensitivity analyses:

- Drop the hardest task (lowest Phase 1 hidden-pass across all three conditions) and re-run primary analyses.
- Drop the easiest task likewise.
- Compliance-only re-analysis using compliant-sample trials only.

## 5. Reproducibility

Same as v1 PROTOCOL.md §5. Model ID pinned, temperature pinned, seed pinned, raw conversation logs archived per trial, protocol SHA captured in run metadata per B10 of the bench spec.

## 6. Roles and authorship

| Role | Owner |
|---|---|
| Protocol author (orchestrator) | This document's author |
| Style card author (blind LLM) | Inherited from v1 — same `bench/styles/{tdd,dtdd}.md` |
| Coverage predicate author (blind LLM) | Inherited from v1 |
| **Edit prompt author (blind LLM)** | A separate Claude session given only the task's `intent.md` |
| **Extended-hidden-tests author** | Orchestrator extends `hidden_tests_after_edit/` after the edit prompt is locked; new assertions are blind to which condition's agent will see them |
| Compliance grader | 2-3 humans per v1 §3.6 |
| Bench harness implementer | Already in place from v1 |
| Bench runner | The orchestrator at Stage-2 start |

## 7. Limitations (acknowledged in advance)

1. **N=5 tasks is small.** v2 results are directional; a full study would expand to ≥10 tasks. v1's task set provides the candidate pool.
2. **Statistical power.** N=10 trials per cell × 5 tasks × 3 conditions × 2 phases (+ Phase 2-WD control arm) is enough for confidence intervals on aggregate metrics. Effect sizes < 5% absolute may not be detectable.
3. **Single model class per run.** Cross-model comparisons are reported in separate analyses, not built into the primary hypothesis tests.
4. **Edit prompts are blind-authored but still represent one author's view of "realistic edits."** Robustness check: re-author edits with a second blind subagent on a sample and verify hypothesis tests agree. Deferred to a follow-up.
5. **Phase 2-WD control arm depends on the agent honestly using the original description when it's available.** If the agent ignores the description and relies on the artifacts anyway, the H_artifact_value delta will collapse. Mitigation: the methodology-compliance grader inspects Phase 2-WD trials for whether the agent referenced the original description in its conversation log.
6. **Test quality is measured via simple metrics in v1.** Mutation testing would be the gold standard for whether the test suite actually catches bugs; deferred to v2-followup.
7. **Multi-agent factor (H3 from v1) is deferred entirely.** Single-agent topology only.

## 8. Pre-commitments

- We publish the result for each of H_initial, H_edit, H_artifact_value regardless of direction or significance.
- We publish the raw per-trial logs.
- We publish all style cards, edit prompts, and coverage predicates at Stage-2 start.
- We report any deviations from this protocol explicitly.
- We tag this document at the commit it locks at; that tag is the binding v2 pre-registration. Subsequent versions are explicit amendments.
- All bench artifacts are MIT-licensed per the repo's existing LICENSE.

## 9. Prerequisites for Stage-2 v2 run

- [x] Style cards (inherited from v1)
- [x] 5 tasks under `bench/tasks/` with `intent.md`, `hidden_tests/`, `coverage_predicates/`, `provenance.md` (inherited from v1)
- [x] Grading rubric (inherited from v1; Phase 2 addendum drafted in §3.7 above)
- [x] Coverage predicate inter-rater check (inherited from v1's kappa pre-check)
- [x] **`edit.md` per task — blind-authored from `intent.md` only** (commits `1220d57`, `e5dfa81` for slugify)
- [x] **`hidden_tests_after_edit/` per task — extends `hidden_tests/` with new-behavior assertions** (commits `abec799`, `e5dfa81` for slugify)
- [x] **Phase 2 dispatch logic in the bench harness — takes a Phase 1 trial dir, runs a fresh agent against the trial's artifacts + edit prompt (optionally + original description for the WD control arm)** (commits `e5dfa81` + `07cd8fd` review-fix; spec at `doc/specs/2026-05-11-bench-phase2.spec.md`)
- [x] **`scoreHidden` extended to accept a non-default hidden-tests subdir for the post-edit suite** (commit `e5dfa81`)
- [x] Stage-2 v2 commitment tag on the locked v2 protocol commit — `stage-2-v2-pre-registered-2026-05-11`

## 10. Relationship to v1

v1's Stage-2 pre-registration tag (`stage-2-pre-registered-2026-05-10`) remains valid for the v1 study should anyone want to run it. The harness commits, task set, style cards, topology helper, predicates, grading rubric, and kappa pre-check are all reused unchanged.

v2 is a **separate study with its own protocol and its own tag**. It is not an amendment to v1. The two studies test overlapping but distinct hypotheses; results are reported in separate documents. If someone runs v1 and v2 both, the resulting artifacts coexist in `bench/results/` under separate run-ids.

## 11. Citations

Same prior art as v1 (see `doc/research/dtdd-bench.md`). One added reference relevant specifically to the maintenance/edit framing:

- **"Code in Harmony" multi-agent eval** (v1 ref 6) — articulates the drift problem that motivates DTDD's spec-as-canonical-source. v2's H_edit is the artifact-survival analog: not drift across concurrent agents, but drift across sequential edit cycles.

A formal v2-specific prior-art survey is folded into this protocol document; if it grows, it moves to `doc/research/dtdd-bench-v2.md`.
