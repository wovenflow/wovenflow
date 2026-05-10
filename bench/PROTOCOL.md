# DTDD prompting-style benchmark — pre-registration

**Version:** 1
**Date:** 2026-05-10
**Spec:** `doc/specs/2026-05-10-dtdd-bench.spec.md`
**Research doc:** `doc/research/dtdd-bench.md`
**Status:** Stage-1 pre-registration. No model calls have been made against this protocol. Stage 2 begins when this document is locked at a tagged commit and all prerequisites (style cards blind-authored, tasks added with provenance, predicates published) are in place.

This document is the contract between us and external readers. By publishing it before any data collection, we commit to running the analysis it specifies and reporting whatever result emerges — including null and negative results. The harness enforces this through `B10` (refuses to start with a dirty tree) and `B1` (pins the protocol SHA into every run's metadata).

## 1. Background and rationale

The wovenflow plugin proposes Doc-Test-Driven Development (DTDD): a feature's design and tests live in one `.spec.md` file, with prose ∵IF/↦WHEN/∴THEN behaviors and inline test fences. The methodology synthesizes literate programming (Knuth), doctest (Peters), and BDD (North). Whether this synthesis adds measurable value over its constituents — particularly when LLMs author code — is an open empirical question.

Prior art establishes the question's shape (see `doc/research/dtdd-bench.md`):

- The **SANER 2026 registered report** on Spec-Driven Code Generation studies one quadrant of our factorial — single-agent spec-driven vs unstructured. Our protocol complements rather than duplicates by adding the multi-agent factor and the four-style cross.
- The **Tests as Prompt / WebApp1K** benchmark establishes the TDD-only condition.
- The **TDD Governance for Multi-Agent Code Generation** paper covers multi-agent + workflow-style; we extend with the prose-contract dimension.
- The **2508.15503 LLM-evaluation guidelines** anchor our methodology choices.

This protocol pre-registers a 4×2 factorial comparison of prompting styles across single-agent and multi-agent topologies on small coding tasks, scoring on hidden-test pass rate, self-test pass rate, and self-test coverage of hidden cases.

## 2. Hypotheses

All hypotheses are pre-specified with directions and minimum effect sizes. We commit to publishing the result for each, regardless of direction or significance.

### H1 (primary — generalization)

DTDD prompting produces code with higher hidden-test pass rate than TDD-only prompting, on the same task, in the single-agent topology.

**Effect size threshold:** mean hidden-test pass rate under DTDD exceeds that under TDD-only by **≥0.10 absolute** with **non-overlapping 95% CIs**.

**Falsified if:** the difference is < 0.10, the CIs overlap, or DTDD scores lower.

### H2 (methodology metric — coverage of edge cases)

DTDD prompting produces tests that cover more hidden-case labels than TDD-only prompting.

**Effect size threshold:** mean self-test coverage of hidden cases under DTDD exceeds that under TDD-only by **≥0.15 absolute** with non-overlapping 95% CIs.

**Falsified if:** the difference is < 0.15, the CIs overlap, or DTDD covers fewer labels.

H2 is the cleanest test of the "structured prose forces edge-case thinking" claim that motivates wovenflow.

### H3 (multi-agent compounding)

The DTDD advantage on hidden-test pass rate is larger in multi-agent than single-agent.

**Effect size threshold:** the interaction effect `(DTDD_multi − TDD_multi) − (DTDD_single − TDD_single)` is **> 0 with 95% CI excluding zero**.

**Falsified if:** the interaction effect is ≤ 0 or its CI includes zero.

H3 is the load-bearing claim for wovenflow's main differentiator (`.spec.md` as canonical source of truth across subagents).

### Secondary outcomes (reported, no pre-specified threshold)

- Token cost per condition (mean and 95% CI)
- Wall-clock time per condition
- Methodology compliance rate per style (from the human-graded sample)
- Per-task heatmap of hidden-test pass rate
- Comparison of DTDD against `plan-then-test` and `freeform` (exploratory)

## 3. Method

### 3.1 Tasks (N = 10)

Tasks are small, well-bounded coding problems with provenance documented per `B9`. To be added under `bench/tasks/` before Stage 2 begins. Each task has:

- `intent.md` — one paragraph describing what the function should do (no implementation, no edge cases enumerated)
- `hidden_tests/` — held-out test suite covering edge-case labels (`empty-input`, `unicode`, `off-by-one`, `negative`, `large-input`, `null`, `type-coercion`, plus task-specific labels)
- `hidden_tests/labels.json` — manifest enumerating the labels this task uses
- `coverage_predicates/<label>.js` — semantic predicates (blind-authored from the label spec, not from agent outputs)
- `provenance.md` — declares source: `livecodebench-post-2025-cutoff` | `hand-written` | `other-with-justification`. Tasks sourced from public benchmarks pre-dating the model's training cutoff are explicitly excluded to mitigate contamination.

Planned task domains (final list locks at Stage-2 start):

1. Slugify with Unicode + collapse whitespace
2. Semver parse with prerelease and build metadata
3. Throttle (function rate-limiter) with leading + trailing edges
4. Deep-equal across primitives, arrays, objects, cycles
5. Group-by with custom key extractor
6. Paginate (offset/limit + total + edge boundaries)
7. Normalize whitespace (preserving paragraph breaks)
8. Parse CLI flags (single-dash, double-dash, `--key=value`, multi-value)
9. Time-window (sliding-window aggregator with TTL)
10. Dedupe preserving first-occurrence order

This list is provisional. The locked task list at Stage-2 start is the binding one; any change requires a new pre-registration version.

### 3.2 Conditions

**Styles (4):** TDD, DTDD, plan-then-test, freeform.

Style cards live at `bench/styles/<style>.md` and are **blind-authored** by an LLM that is given only `bench/styles/AUTHORING.md` (which describes each style in equal length and specificity, without naming wovenflow or DTDD as the methodology under test). The author LLM does not see this protocol.

**Topologies (2):** single-agent, multi-agent.

The multi-agent topology helper at `bench/topology/multi.md` is **constant across all four styles**. Where a style legitimately requires asymmetric handling (e.g., DTDD's `.spec.md` as canonical source under test), the asymmetry is documented in the style card and called out here as a methodology-driven choice — not a hidden confound.

**Cells:** 4 styles × 2 topologies = 8 cells.

### 3.3 Procedure

For each cell, **N = 10 independent trials per task × 10 tasks = 100 trials per cell**. Total trials: 800.

Per-trial procedure (enforced by `B2` and `B3`):

1. Fresh per-trial git worktree branched from a clean commit.
2. Style card injected as system prompt; no other harness modifications between styles.
3. Multi-agent topology helper injected when `topology=multi`; identical helper for all styles.
4. Stop condition: agent declares `done` OR `turn-cap` (20 turns) OR `time-cap` (15 minutes wall-clock per trial).
5. All artifacts captured to `bench/results/<run-id>/<trial-id>/`: `source/`, `tests/`, `conversation.jsonl`, `meta.json`.

**Randomization.** Trials run in random order (seed = 42, mulberry32). Order is logged. No within-cell randomization is needed since trials are independent.

**Trial isolation.** Each trial is a fresh conversation, fresh worktree, no shared state. Per `B3`, the harness writes outputs only after the trial completes — no streaming side effects to other trials.

**Pre-registration enforcement.** Per `B10`, runs refuse to start with a dirty tree (`bench/PROTOCOL.md`, `bench/styles/`, `bench/tasks/`, harness source). Every run's metadata pins the protocol commit SHA.

### 3.4 Model

- **Model ID:** Claude Sonnet 4.6 (`claude-sonnet-4-6`).
- **Temperature:** 0.7. Real users get stochastic outputs; evaluating at 0.7 captures realistic variance. N=10 per cell averages over the variance.
- **Max tokens per turn:** model default.
- **Tool access:** the standard Claude Code tool set (Read / Write / Edit / Bash). No DTDD-specific tools auto-injected.

The model is pinned. If the underlying API changes the model's behavior (e.g., a silent point-update), the protocol's external validity is bounded to the snapshot in use during the run window. We log the model version string returned by the API per trial.

**Open-LLM baseline (deferred).** The 2508.15503 guidelines recommend an open-LLM baseline. We acknowledge this and defer to a follow-up run; the primary report flags the absence as a limitation.

### 3.5 Scoring

Three primary scoring functions (specified by `B4`, `B5`, `B6` of the spec; implementation in `bench/scorer.js`):

- **Hidden-test pass rate:** held-out test suite per task; sandboxed from source; static-leak check rejects any source that references `hidden_tests/`.
- **Self-test pass rate:** the agent's own tests against the agent's own source. Sanity check; failure here flags trials where the agent reported done with red tests.
- **Self-test coverage of hidden cases:** for each label the hidden suite uses, a blind-authored semantic predicate (per `B6`) inspects the agent's tests and returns true if at least one of them asserts on that label. Per-label coverage is the count of true predicates / total labels.

Coverage predicates are committed to `bench/tasks/<task>/coverage_predicates/<label>.js` and **published as part of the bench repo** so external reviewers can read, contest, and re-score. Target inter-rater agreement: **≥0.80 per-task** (not aggregate) when re-authored by an independent third party on a sample. Aggregate alone hides single-task failures behind averaging across robust tasks; per-task is the reportable threshold.

When a task fails the per-task threshold (per `bench/kappa-pre-check/FINDINGS.md`), the bench report flags the affected labels as **low-confidence coverage** rather than dropping the task; the headline self-test-coverage metric is also reported with low-confidence labels excluded as a sensitivity analysis. The pre-check process surfaces the labels needing care; predicate authors can do additional rounds (3+ raters, take majority) or the bench can document the limitation.

### 3.6 Methodology compliance verification

Per `B7`. After all trials complete:

1. **Stratified sample.** ≥30 trials per style, drawn proportionally across tasks (seed-deterministic via `sampleForGrading`).
2. **Human grading.** 2-3 raters independently rate each sampled trial as `compliant` or `non-compliant` against the style's methodology, citing specific evidence from the conversation log. Rubric in `bench/grading-rubric.md` (to be drafted before Stage 2).
3. **Aggregation.** Per-trial verdict is the majority. Per-style compliance rate is the mean. Inter-rater agreement is reported as Fleiss' kappa (the multi-rater generalization of Cohen's kappa).
4. **Reporting.** Per-style results are broken down by `compliant` vs `non-compliant` within the sample so readers can see whether a style's score is dragged by instruction-following failures.

LLM grading is explicitly avoided — the empirical-SE-with-LLMs guidelines warn against models judging peer outputs from the same family.

## 4. Statistical analysis plan

### 4.1 Primary analyses

For each hypothesis (H1, H2, H3), the primary analysis is a paired-by-task comparison of cell means, with bootstrap 95% CIs (10,000 resamples per cell). The hypothesis is supported only if the pre-specified effect-size threshold is met **and** the CI condition is satisfied.

### 4.2 Multiple-comparison correction

Three pre-registered hypotheses → Bonferroni correction: alpha = 0.05 / 3 = 0.0167. CIs widen to 98.33% accordingly. The three secondary comparisons (DTDD vs plan-then-test, DTDD vs freeform, plan-then-test vs freeform) use uncorrected 95% CIs and are reported as exploratory.

### 4.3 Per-task analyses

Per-task hidden-test pass rate by style is reported as a heatmap. Per-task statistical tests are not pre-specified; the per-task data is exploratory and used to identify which tasks drive the aggregate effect.

### 4.4 Compliance-stratified analyses

Aggregate metrics are reported in three forms: (a) all trials, (b) compliant-sample only, (c) non-compliant-sample only. The headline result is (b); (a) and (c) are reported for transparency.

### 4.5 Sensitivity analyses (pre-specified)

- **Drop the lowest-coverage task** (the task where all four styles score below 0.30 on hidden-pass, if any) and re-run primary analyses. Robust if effect persists.
- **Drop the highest-coverage task** likewise. Robust if effect persists.
- **Compliance-only re-analysis** for each hypothesis using the compliant-sample-only data.

## 5. Reproducibility commitments

- Model ID, temperature, seed, and protocol SHA are logged per run (`B1`, `B10`).
- Raw conversation logs (`conversation.jsonl`) and produced artifacts (`source/`, `tests/`) are checked in for every trial.
- All scoring code, semantic predicates, and style cards are checked in.
- The run-id deterministically maps to a results directory; no overwrites.
- Re-running the same protocol with the same seed against the same model snapshot should reproduce results within stochastic-decoding tolerance (N=10 averages dampen this).

## 6. Roles and authorship

| Role | Owner |
|---|---|
| Spec author (orchestrator) | This document's author |
| Style card author (blind LLM) | A separate Claude session given only `bench/styles/AUTHORING.md` |
| Coverage predicate author (blind LLM) | A separate Claude session given only the label specifications |
| Compliance grader | 2-3 humans (rubric in `bench/grading-rubric.md`) |
| Bench harness implementer | Done; subflow phase complete |
| Bench runner | The orchestrator at Stage-2 start |

The spec author **does not** write the style cards or the coverage predicates. Doing so would author both sides of the comparison and is the central bias attack the protocol is designed to prevent.

## 7. Limitations (acknowledged in advance)

1. **External validity.** 10 small toy tasks ≠ real software development. The result speaks to small-task generalization, not "DTDD works in production." A FeatureBench-class follow-up is implied but out of scope here.
2. **Statistical power.** N=100 per cell is enough for confidence intervals on aggregate metrics, not enough for fine-grained per-task or per-cell-per-task analysis. Effect sizes < 5% absolute will not be detectable.
3. **Model-snapshot validity.** Results bind to the Claude Sonnet 4.6 snapshot in the run window. Replication on later snapshots is encouraged.
4. **Self-coverage metric novelty.** The metric is novel and not yet widely used; reviewers may legitimately contest the predicates.
5. **Open-LLM baseline absent.** Recommended by 2508.15503; deferred to a follow-up.
6. **Researcher position.** The orchestrator authored the methodology under test. Mitigations: blind authoring of style cards and predicates; pre-registration; commitment to publish all results.

## 8. Pre-commitments

- We will publish the result for each of H1, H2, H3 regardless of direction or significance.
- We will publish the raw per-trial logs.
- We will publish all style cards and coverage predicates at Stage-2 start (before any data collection), so external auditors can contest them ex ante.
- We will report any deviations from this protocol explicitly.
- If the protocol's design is substantively criticized post-hoc, we will publish the criticism alongside the result and respond.
- We will tag this document at the commit it locks at; that tag is the binding pre-registration. Subsequent versions are explicit amendments.
- All bench artifacts — protocol, style cards, topology helper, tasks, hidden tests, predicates, raw logs, and reports — are licensed under the repo's existing MIT license (see `LICENSE` at the repo root). No separate license decision applies.

## 9. Prerequisites status

- [x] Style cards authored at `bench/styles/{tdd,dtdd,plan,freeform}.md` per `bench/styles/AUTHORING.md`
- [x] Multi-agent topology helper authored at `bench/topology/multi.md`
- [x] 10 tasks added under `bench/tasks/<task>/` with `intent.md`, `hidden_tests/`, `coverage_predicates/`, and `provenance.md`
- [x] Grading rubric drafted at `bench/grading-rubric.md`
- [x] Inter-rater agreement pre-check on coverage predicates — sampled 3 tasks; results in `bench/kappa-pre-check/`. Per-task agreement: slugify 100%, deep-equal 100%, throttle initially 71% (failed ≥0.80 threshold). After third independent rater (`rater-c`) for throttle, low-confidence labels documented per the §3.5 amendment. See `bench/kappa-pre-check/FINDINGS.md` for the full reading.
- [x] Stage-2 commitment tag — see git tag `stage-2-pre-registered-2026-05-10`

## 9a. Known limitations carried into Stage 2

These are documented in advance per the pre-registration commitment to publish all results regardless of direction:

- **Throttle's timing-shape labels** (`burst-coalesced`, `post-window-fires-immediately`, `passes-arguments`, `preserves-this`, `single-call`) are inherently hard to detect via static text inspection of agent-produced tests. The kappa pre-check showed both initial raters' predicates struggled. The bench reports these labels with a low-confidence flag and excludes them from the headline self-test-coverage metric in a sensitivity analysis. Future work could replace text-inspection predicates with sandboxed-execution probes for timing labels.
- **Open-LLM baseline absent.** Per §3.4. Deferred.
- **Predicate-authoring took N=2 raters per task plus a third pass for throttle.** A more rigorous protocol would use ≥3 raters per task with adversarial fixture banks; the lightweight pre-check is enough for a directional preprint but not a peer-reviewed claim.

## 10. Schedule (provisional)

| Milestone | Target |
|---|---|
| Style cards blind-authored | within 1 week of pre-reg lock |
| 10 tasks added with provenance | within 2 weeks |
| Grading rubric drafted | within 2 weeks |
| Predicate kappa pre-check | within 3 weeks |
| Stage-2 lock + bench run | within 4 weeks |
| Compliance grading | within 6 weeks |
| Report published | within 8 weeks |

## 11. Citations

See `doc/research/dtdd-bench.md` for the full reference list.

Key references this protocol's methodology choices follow:

1. *Guidelines for Empirical Studies in Software Engineering involving Large Language Models* — arxiv 2508.15503
2. *Understanding Specification-Driven Code Generation with LLMs* (SANER 2026 Stage-1 Registered Report) — arxiv 2601.03878
3. *Tests as Prompt: A Test-Driven-Development Benchmark* — arxiv 2505.09027
4. *TDD Governance for Multi-Agent Code Generation via Prompt Engineering* — arxiv 2604.26615
5. *Spec-Driven Development: From Code to Contract in the Age of AI Coding Assistants* — arxiv 2602.00180
