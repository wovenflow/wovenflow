# Outside context for the DTDD bench v2 (artifact-survival study)

## Profiles applied

`academic`

## Question

We are designing a benchmark that compares three coding methodologies (Baseline, TDD, DTDD) on both (1) initial implementation quality and (2) artifact value for a downstream maintenance edit performed by a fresh agent that does **not** see the original task description. The research question this prior-art survey targets: **who has already implemented benchmarks or controlled studies that look like ours — methodology-stratified, fresh-agent edit-without-original-spec, and/or AI-artifact-value-for-downstream-work — and what do their setups tell us about whether ours is well-designed?**

## References

1. **Understanding Specification-Driven Code Generation with LLMs: An Empirical Study Design** *(type: paper, SANER 2026 Stage-1 Registered Report)* — Authors not available in the search results we have. [arxiv 2601.03878](https://arxiv.org/abs/2601.03878)
   The closest existing comparable to v2. Stage-1 registered RCT comparing a spec-driven TDD-inspired LLM workflow vs unstructured prompting via a VS Code extension (CURRANTE) on LiveCodeBench. Stores artifacts as TOML specs, test versions, and function versions with content hashes for reproducibility. Tests initial-code-quality framing only — no maintenance/edit phase, no fresh-agent-without-description control.

2. **SWE-bench Pro** *(type: benchmark)* — Scale AI. [Scale leaderboard](https://labs.scale.com/leaderboard/swe_bench_pro_public) | [Technical paper](https://static.scale.com/uploads/654197dc94d34f66c0f5184e/SWEAP_Eval_Scale%20%289%29.pdf)
   1,865 problems sourced from 41 actively maintained repositories, partitioned into public (11 repos), held-out (12), and commercial (18) sets. The agent is given an existing codebase plus an issue and must produce a patch — structurally the closest pre-existing benchmark to v2's Phase 2 setup ("edit existing code with a brief, no original spec"). But SWE-bench Pro is a *capability* benchmark (which model is best?), not a *methodology* benchmark (which prompting style produces the best artifacts to inherit?).

3. **Echoes of AI: Investigating the Downstream Effects of AI Assistants on Software Maintainability** *(type: paper, empirical study)* — [arxiv 2507.00788](https://arxiv.org/abs/2507.00788)
   Empirical evidence that AI-generated code has measurable downstream maintenance cost: more likely to be revisited within 30 and 90 days, higher touch frequency, more participating authors, greater accumulated churn, longer stabilization time. Directly relevant adversarial prior for v2 — it raises the possibility that *more* AI-produced artifacts (DTDD vs Baseline) may *worsen* downstream maintenance rather than help, depending on whether the artifacts encode useful design intent or just additional noise to maintain.

4. **When AGENTS.md Backfires: ETH Zurich study on LLM-generated context files** *(type: empirical study, third-party summary)* — [notchrisgroves.com summary](https://notchrisgroves.com/when-agents-md-backfires/)
   Sharper adversarial finding: LLM-generated context files **reduce task success rates** and raise inference cost by ~20% in the ETH Zurich evaluation. Distinguishes "correctly scoped and reliably relevant" context from "broadly assembled and autonomously applied." If LLM-authored `.spec.md` files end up in the latter category for v2's edit phase, H_edit and H_artifact_value may fail in a publishable way. The bench should be ready for this direction.

5. **Artifact validity under varying agent configurations in LLM-assisted software development: A comparative analysis** *(type: paper, comparative empirical study, journal)* — [ScienceDirect 2026](https://www.sciencedirect.com/science/article/abs/pii/S095058492600011X)
   Compares three orchestration strategies — Task-Specialized, Phase-Specialized, Process-Generalist — for artifact validity. Different question than v2's methodology comparison, but the same framing: empirical comparison of "which configuration produces better artifacts" rather than "which model is more capable." Adjacent prior art for a methodology-stratified study design.

## Prior systems

- **SWE-bench (original + Verified + Pro)** — [github](https://github.com/swe-bench/SWE-bench) | [verified](https://www.swebench.com/verified.html). Real GitHub-issues-to-patches benchmark on existing codebases. *Doesn't:* control for methodology; treats each model as a fixed configuration.
- **RepoBench** — repository-level autocompletion with three interconnected tasks. *Doesn't:* test the edit-with-inherited-artifacts setup; focused on completion within an existing repo state.
- **CodeSpecBench** — [arxiv 2604.12268](https://arxiv.org/abs/2604.12268). Executable-behavioral-specification generation benchmark; tests whether LLMs can produce executable preconditions/postconditions. Result: model performance drops sharply on this vs solution generation. *Doesn't:* compare methodologies for producing the *implementation* alongside the spec; only the spec-generation step.
- **LiveCodeBench** — competitive-programming problems released after model training cutoffs to mitigate contamination. *Doesn't:* address edit / maintenance / inherit-artifact scenarios; pure initial-generation contest problems.
- **Repository-Level Spec-Driven Engineering** — [arxiv 2605.02455](https://arxiv.org/abs/2605.02455). Multi-model (Claude Sonnet 4.5, Qwen3 Coder 480B, GPT 5.1, GPT 5 Nano, Llama 3.2 3B). Repo-level. Tests spec-driven engineering specifically. *Doesn't:* include a Baseline (no methodology) condition or a maintenance phase; focused on initial generation across model classes.

## Similarities and differences

- **Similar to ref 1 (SANER 2026 RCT):** same family of question (does structured methodology improve LLM code-gen?), same registered-report shape, overlapping metric (hidden-test pass on initial implementation).
- **Different from ref 1:** v2 adds a second phase that grades artifact survival under a fresh-agent maintenance edit; v2 also adds an explicit no-methodology Baseline condition (ref 1's comparator is "unstructured prompting" which is similar but the comparison shape is binary not three-way); v2 drops the multi-agent factor.
- **Similar to ref 2 (SWE-bench Pro):** both grade an agent's ability to make a targeted edit to an existing codebase against held-out tests.
- **Different from ref 2:** SWE-bench Pro is a capability ladder (rank models by patch-resolution rate). v2 holds the model constant and varies what artifacts the editing agent inherits — model-class-stratified within each cell, methodology-stratified across cells. SWE-bench Pro problems also come *with* the original issue description; v2 deliberately strips it for Phase 2.
- **Similar to refs 3 and 4:** both surface empirical evidence that AI-generated artifacts can have negative downstream effects (longer stabilization, lower task success). Same problem space.
- **Different from refs 3 and 4:** ref 3 measures real-project maintenance in commit-history data, no controlled methodology variation. Ref 4 tests user-authored context files, not AI-authored methodology artifacts. v2 controls the methodology that produced the artifacts and tests downstream value in a controlled edit task.
- **Similar to ref 5 (ScienceDirect artifact-validity comparison):** same methodology-stratified framing — "which configuration produces better artifacts" rather than "which model is better."
- **Different from ref 5:** ref 5 compares orchestration strategies (Task-Specialized / Phase-Specialized / Process-Generalist); v2 compares prompting methodologies (Baseline / TDD / DTDD) within a fixed orchestration. Different layer of the stack.

## What's novel about this work

Three specific novelties that ground v2 against the prior art:

1. **The fresh-agent edit-without-original-description setup operationalizes "artifact survival" in a way none of the surveyed prior art does.** SANER 2026 (ref 1) stops at initial generation. SWE-bench Pro includes the original issue. Echoes of AI (ref 3) measures real-world maintenance but doesn't vary methodology. The control arm (Phase 2-WD: same edit, but the agent *does* see the original description) is what isolates artifact value from the methodology's general effect — and that arm appears in none of the surveyed comparators.

2. **The three-condition gradient with an explicit Baseline.** Most prior comparisons are binary: methodology X vs unstructured. v2's Baseline / TDD / DTDD gradient asks "does adding tests-first help?" and "does adding prose-then-tests help beyond tests-first?" — measuring the marginal value of each structural step. Prior art mostly tests "does any structure help" not "which structures help how much."

3. **Pre-registered falsifiable thresholds for each hypothesis.** v2 follows the registered-report shape that ref 1 uses, but goes further: each of H_initial, H_edit, and H_artifact_value carries an absolute effect-size threshold below which the hypothesis is falsified, plus Bonferroni correction. Most empirical SE papers report descriptive statistics; v2's commitment to threshold-falsification before data collection is the rigor move.

What is **not** novel:

- Registered-report methodology (refs 1 and the broader empirical SE community already use this).
- Fresh-agent dispatch (used in subagent dispatch generally; "fresh agent" doesn't make the benchmark novel by itself).
- Hidden-test grading (standard since HumanEval).
- The methodologies themselves — TDD, BDD, spec-driven are old. v2 inherits them; doesn't claim to invent.

## Hypothesis and framing

Per `academic` profile A1. Three pre-specified hypotheses, all falsifiable:

| Hypothesis | Framing | Direction predicted | Falsification threshold |
|---|---|---|---|
| H_initial | DTDD's prose contract forces enumeration of behaviors the loose intent doesn't name → better initial hidden-pass | DTDD > TDD > Baseline | DTDD − Baseline < 0.15 absolute OR DTDD − TDD < 0.05 OR CIs overlap |
| H_edit | DTDD's spec.md preserves design intent that helps a fresh agent's edit → better post-edit hidden-pass | DTDD > TDD > Baseline | DTDD − Baseline < 0.20 absolute OR DTDD − TDD < 0.10 OR CIs overlap |
| H_artifact_value | The "with-description vs without-description" Phase 2 delta is smaller for DTDD (i.e., its spec.md preserves what intent.md gave) | DTDD-delta < Baseline-delta | DTDD-delta ≥ Baseline-delta − 0.10 OR DTDD-delta is larger |

Confirmatory framing — all three are pre-registered with directions before any data collection. Exploratory findings (anything not in this list) are flagged as such in the final report.

**Adversarial alternative.** Refs 3 and 4 suggest a real possibility that AI-authored methodology artifacts could *hurt* downstream maintenance. If so, H_edit and H_artifact_value will falsify in the unexpected direction (DTDD < Baseline). The protocol commits to publishing this as a legitimate result — that finding would itself be informative about the limits of structured AI artifacts.

## Citation integrity log

Per `academic` profile A2.

| Ref | DOI / arxiv ID resolves? | Abstract read? | Venue / type | Verification level |
|---|---|---|---|---|
| 1 (SANER 2026 RR) | arxiv 2601.03878 — verified via search hit | yes (search summary) | SANER 2026 Continuity Acceptance | high — directly comparable comparator |
| 2 (SWE-bench Pro) | Scale-internal PDF + leaderboard page | yes (summary) | industrial / benchmark release | high — public artifact |
| 3 (Echoes of AI) | arxiv 2507.00788 — verified via search hit | yes (summary, key findings only) | preprint | medium — preprint, hasn't been read in full |
| 4 (AGENTS.md ETH study) | only via third-party summary (notchrisgroves.com) | **no — primary not located** | unknown ETH Zurich study | **low — flag as third-party-only citation; locate primary before final publication** |
| 5 (Artifact validity ScienceDirect) | DOI behind paywall, abstract via search snippet | yes (abstract only) | journal article | medium — abstract level only |

**Hard rule per A2:** ref 4's primary source is not directly verified. The protocol commits to either locating the primary ETH Zurich study before any v2 publication, or downgrading the reference to "ETH Zurich communicated this finding informally" with appropriate caveat. The bench is not contaminated by the inability to verify ref 4; it just means the adversarial-direction-is-plausible claim is weaker than fully cited.

No hallucinated cites — every reference was returned by a real web search with a stable link.

## Replication plan

Per `academic` profile A3.

- **Sample size:** 5 tasks × 3 conditions × 10 trials per cell × 2 phases (+ Phase 2-WD control arm) = ~450 trials. N=10 per cell is small but enough for bootstrap CIs on aggregate metrics; effect sizes < 5% absolute will not be detectable.
- **Power justification:** the H_edit threshold (≥0.20 absolute over Baseline) is well above the detectable floor given N=10 per cell. H_initial (≥0.15) and H_artifact_value (≥0.10 delta-of-deltas) are detectable with overlapping but distinguishable CIs.
- **Replicability checklist:**
  - Model + version pinned (per PROTOCOL-v2 §3.4): one of Claude Sonnet 4.6 or a local Qwen2.5-Coder-14B/32B via BENCH_PROVIDER=openai-compatible.
  - Temperature pinned at 0.7.
  - Random seed pinned for stratified sampling.
  - All conversation logs archived per trial.
  - Protocol SHA pinned in run metadata (B10 of the bench spec).
- **Pre-registration:** PROTOCOL-v2.md will be tagged at a clean commit when the remaining two implementation prerequisites land (Phase 2 dispatch + scoreHidden subdir). That tag is the binding registration per the bench's B10 dirty-tree refusal.

## Conflicts and contributions

Per `academic` profile A4.

**Funding:** none. Personal-time research.

**Competing interests:** the orchestrator (this document's author) is also the author of the methodology under test (DTDD via the wovenflow plugin). This is the central bias risk. Mitigations:

- All style cards blind-authored by a separate LLM (per `bench/styles/AUTHORING.md`).
- All edit prompts blind-authored by separate LLMs (per `bench/tasks/<task>/edit.md` commits).
- All coverage predicates blind-authored by separate LLMs, with kappa pre-check (per `bench/kappa-pre-check/`).
- Pre-registered falsifiable thresholds — the orchestrator cannot move goalposts after seeing data.
- Methodology compliance is graded by ≥2 humans against the published rubric (`bench/grading-rubric.md`).

**Contribution attribution (CRediT):**

| Role | Owner |
|---|---|
| Conceptualization | Orchestrator |
| Methodology | Orchestrator; blind-authored substrate from LLM subagents |
| Software (bench harness) | Implementer subagents per the spec |
| Validation | Pre-registered protocol; future external reviewers |
| Formal analysis | Orchestrator (TBD when results land) |
| Investigation | Orchestrator + dispatched bench trials |
| Resources | Personal compute (or future local-GPU run) |
| Data curation | Orchestrator |
| Writing | Orchestrator |
| Supervision | None — sole researcher |
| Funding acquisition | N/A |

**AI assistance disclosure:** Claude Code (Sonnet 4.6 / Opus 4.7) was used throughout for protocol drafting, dispatching subagents that authored blinded components (style cards, predicates, edit prompts), running smoke tests, and writing this research doc. The methodology under test (DTDD) is being evaluated *on* a class of models that includes the one drafting this document — a circularity that future reviewers will flag and that the bench is designed to defend against via blinding.

## Data and code availability

Per `academic` profile A5.

- **Data** — all per-trial conversation logs, source artifacts, test artifacts, and meta.json files will be archived under `bench/results/<run-id>/` for every run, committed to the wovenflow repo (a public GitHub repo). No private data.
- **Code** — the bench harness, all style cards, all edit prompts, all coverage predicates, and the grading rubric are all in the wovenflow public repo. Predicates are blind-authored and published before Stage-2 lock so external auditors can contest them ex ante.
- **License** — MIT (per the repo's `LICENSE`; pre-committed in PROTOCOL.md §8 and PROTOCOL-v2.md by inheritance).
- **Reproducibility commitment** — the binding Stage-2-v2 tag is on a commit where the protocol, style cards, predicates, edit prompts, hidden tests, and harness are all present and clean. Per the bench harness's B10 protocol-SHA pinning, every run records the SHA at run start, so external replicators can `git checkout <sha>` and re-run.
