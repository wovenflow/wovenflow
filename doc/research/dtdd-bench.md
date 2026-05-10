# Outside context for the DTDD prompting-style benchmark

## Question

Is the proposed benchmark — comparing `{TDD, DTDD, plan-then-test, free-form}` workflow prompts × `{single-agent, multi-agent}` topologies on small coding tasks, scoring on hidden-test pass rate, self-test pass rate, and self-test coverage of hidden cases — scientifically valid given current empirical practice in LLM-for-code research, and what prior work on agentic coding benchmarks and spec-driven evaluation should inform its design?

## References

1. **Understanding Specification-Driven Code Generation with LLMs: An Empirical Study Design** *(type: paper, Stage 1 Registered Report, SANER 2026)* — [link](https://arxiv.org/abs/2601.03878)
   Directly comparable prior art. Pre-registered RCT comparing a specification-driven, TDD-inspired LLM workflow against unstructured prompting on LiveCodeBench problems via a VS Code extension (CURRANTE). Measures pass rate, all-pass completion, time-to-pass, iteration behaviors. Stage-1 acceptance with Continuity Acceptance score for Stage 2 — the registered-report shape is the gold standard for our class of claim.

2. **Guidelines for Empirical Studies in Software Engineering involving Large Language Models** *(type: paper, methodology guidelines)* — [link](https://arxiv.org/abs/2508.15503)
   The current consensus methodology checklist. Eight rules: declare LLM usage and role; report model versions/configs/customizations; document the tool architecture beyond the model; disclose prompts and interaction logs; validate LLM outputs with humans; include an open-LLM baseline; use suitable baselines/benchmarks/metrics; articulate limitations and mitigations. Should anchor our pre-registration document.

3. **Tests as Prompt: A Test-Driven-Development Benchmark for LLM Code Generation (WebApp1K)** *(type: benchmark + paper)* — [link](https://arxiv.org/abs/2505.09027)
   Establishes the "tests-as-prompt" framing — tests serve as both prompt and verification. Finds instruction-following and in-context learning are the critical capabilities for TDD success, surpassing general coding proficiency. Relevant baseline for what a pure-TDD condition should expect.

4. **TDD Governance for Multi-Agent Code Generation via Prompt Engineering** *(type: paper)* — [link](https://arxiv.org/html/2604.26615)
   Multi-agent + TDD specifically. Studies how TDD constraints govern multi-agent code-gen. The closest prior work to our multi-agent × workflow-style factor; we should reproduce or contrast their setup.

5. **AgentCoder: Multi-Agent Code Generation with Effective Testing and Self-optimisation** *(type: paper, multi-agent framework)* — [link](https://arxiv.org/abs/2312.13010)
   Reports 91.5% pass@1 on standard benchmarks with GPT-4 and lower token overhead than MetaGPT (138.2K), ChatDev (183.7K), and AgentVerse (149.2K). Establishes token cost as a primary differentiator in multi-agent evaluations — we should include it.

6. **Code in Harmony: Evaluating Multi-Agent Frameworks** *(type: survey / evaluation)* — [link](https://openreview.net/pdf?id=URUMBfrHFy)
   Performance + design comparison across MetaGPT, ChatDev, AutoGen. Finding: lower-ranked frameworks suffer from inefficiencies or coordination problems — "multiple agents communicating freely in natural language without a clear plan can lead to confusion about responsibilities." This is the prior-art articulation of the drift problem DTDD claims to solve.

7. **Spec-Driven Development: From Code to Contract in the Age of AI Coding Assistants** *(type: paper, methodology survey)* — [link](https://arxiv.org/html/2602.00180v1)
   Comprehensive synthesis of spec-driven approaches: treats specifications, not code, as the primary artifact and the source of truth. Frames code as generated/verified secondary artifact. This is the lineage DTDD sits in, with the wovenflow contribution being the literate-programming twist (prose + tests in one file).

## Prior systems

- **FeatureBench** — [link](https://arxiv.org/abs/2602.10975). Feature-level agentic coding benchmark with test-driven task extraction and execution-based evaluation. *Doesn't:* compare prompting styles or multi-agent topologies; one-style-per-task evaluation.
- **ABC-Bench** — [link](https://arxiv.org/abs/2601.11077). Backend coding benchmark; full lifecycle from repo exploration to containerized service deployment. *Doesn't:* isolate workflow-style effects; measures end-to-end agent capability.
- **CURRANTE** (VS Code extension from ref 1) — fine-grained interaction logging tool for LLM-assisted code-gen experiments. Records pass rate, all-pass completion, time-to-pass, iteration behaviors. *Doesn't:* support multi-agent topologies in its current form; built around single-agent IDE workflows. Conceptually our bench could be a CURRANTE-style data collector for the multi-agent extension.
- **LiveCodeBench** — community problem dataset used by ref 1 and others, designed to mitigate contamination by sourcing recent problems. Should be considered as a task source for our bench.

## Dependency currency

The bench infrastructure has minimal third-party dependencies:

- **Claude API / SDK** — bench dispatches via the `Agent` tool / Anthropic SDK. Pin to a specific model ID per ref 2's reproducibility guidance. Latest Sonnet (4.6) and Opus (4.7) IDs noted in environment.
- **Node `node:test`** — wovenflow already uses this; available in Node 22+. No version drift risk.
- **`extract.mjs`** (wovenflow's testflow) — local. Used here only for the DTDD condition; provides test extraction symmetric with how a real wovenflow project runs.

No external dependencies need version-pinning beyond the model itself. The reproducibility risk per refs 2 and the related "Reflections on Reproducibility of Commercial LLM Performance" work is **the model**, not the surrounding code.

## Similarities and differences

- **Similar to ref 1 (SANER 2026 spec-driven study):** same family of question (does a structured spec-driven workflow improve LLM code generation?), same registered-report-shaped methodology, overlapping metric set (pass rate, time-to-pass).
- **Different from ref 1:** they study a *single* spec-driven workflow against unstructured prompting in an IDE; we study a *factorial* of four workflow styles × two agent topologies, focused on multi-agent drift specifically. Our bench complements theirs rather than replicating.
- **Similar to ref 3 (Tests as Prompt / WebApp1K):** the TDD-only condition is essentially their setup. Their finding (instruction-following dominates over coding proficiency) is something our results need to be interpreted against.
- **Different from ref 3:** they evaluate one prompting style in isolation; we evaluate four in a controlled comparison.
- **Similar to ref 4 (TDD Governance for Multi-Agent):** same concern — does test-first discipline govern multi-agent code-gen? — and same multi-agent factor.
- **Different from ref 4:** we add the prose-contract dimension (DTDD vs TDD) and the no-method baseline, isolating *which part* of structured workflow matters: tests alone, or tests + prose.
- **Similar to ref 6 (Code in Harmony):** explicit recognition of multi-agent coordination problems; framing of "drift" as a measurable failure mode.
- **Different from ref 6:** they compare frameworks holistically (MetaGPT / ChatDev / AutoGen each as a fixed system); we hold the framework constant and vary only the workflow-style instructions, isolating prompt-level methodology effect.

## What's novel about this work

Three distinct contributions, ordered by strength of claim:

1. **Self-test coverage of hidden cases as a methodology metric.** Prior work (refs 3, 4, "TGen") measures whether code passes tests. We additionally measure whether the agent's *own* tests cover edge cases the agent wasn't shown — i.e., does the prompted workflow guide the agent to think about cases the user didn't enumerate? This is the cleanest measurable expression of the "structured prose forces edge-case thinking" claim, and I don't find it explicitly tested in the surveyed literature.

2. **Factorial workflow-style × topology evaluation.** Prior multi-agent benchmarks (refs 4, 5, 6) compare frameworks; prior workflow studies (refs 1, 3, 7) compare prompting styles in single-agent settings. The factorial cross of these two — *which workflow style works best at which topology* — is the contribution. The expected interaction effect (DTDD's spec-as-canonical-source advantage compounding in multi-agent) is the falsifiable claim.

3. **DTDD as a synthesis to evaluate against its constituents.** Wovenflow's framing is BDD + TDD + Doctest. The bench evaluates DTDD against each constituent in isolation (TDD-only, plan-then-test ≈ BDD-spec-first, free-form ≈ no-doctest), isolating which property of the synthesis carries weight.

What is **not** novel: the bench shape itself (refs 1, 3, 4 use comparable shapes); the metrics (pass-at-k variants are standard); the multi-agent angle (well-established).

## Validity assessment of the proposed bench

The user explicitly asked: *does the test bench make sense and is it scientifically valid?* Assessed against ref 2's eight guidelines and the threats surfaced by the surveyed literature:

| Guideline / threat | Status | Mitigation needed |
|---|---|---|
| Declare LLM usage and role | OK | Pre-registration document names model, role, autonomy level for each condition. |
| Report model versions, configs, customizations | OK | Pin one model ID; one temperature; document any tool overrides. Single Anthropic API; no fine-tuning. |
| Document tool architecture beyond the model | OK | Bench harness is checked into `bench/`; full source is the architecture documentation. |
| Disclose prompts and interaction logs | OK | All four style cards committed; per-trial JSON logs of full conversation saved. |
| Validate LLM outputs with humans | **PARTIAL** | Hidden-test pass rate is automated. Self-test coverage scoring is automated. We should additionally human-grade a sample (≥30 trials) to validate the automated scoring matches human judgment. |
| Include an open-LLM baseline | **OPEN** | Ref 2 explicitly recommends this. Optional but adds a lot of credibility. Llama-3.x or Qwen-2.5-coder run on the same protocol as a comparison point. ~2× the cost. |
| Use suitable baselines, benchmarks, metrics | **AT RISK** | Tasks must not be from public benchmarks the model has seen during training (ref: 32.8% of LLM-SE papers address contamination per the systematic review). Either (a) write fresh tasks or (b) use LiveCodeBench post-2025 problems. **Resolve before any LLM call.** |
| Articulate limitations and mitigations | OK | This document is part of that articulation. |

| Validity threat | Severity | Mitigation |
|---|---|---|
| **Data contamination** | High | Use task sources known-clean (LiveCodeBench post-cutoff problems, fresh hand-written tasks). Document source per task. |
| **Researcher bias (we test our own methodology)** | High | Have an LLM blind to project name write all four style cards from a fixed methodology spec. Pre-register before running. Commit results regardless of direction. |
| **Methodology non-compliance** (agents not following the prompted style) | Medium | Add an automated post-hoc compliance check (did TDD agent commit tests before code? did DTDD agent produce a `.spec.md`?). Report compliance rate per style as a first-class result. Trials with non-compliance are kept and reported, not silently dropped. |
| **Statistical power** at N=5 trials/cell | Medium | 50 trials per workflow style is enough for a directional claim with confidence intervals. Not enough for fine-grained per-task analysis. State this explicitly. Increase to N=10-20 if first results show small effects. |
| **External validity** (10 small tasks ≠ real software) | High | Be explicit that the result speaks to *small-task generalization*, not real-world DTDD effectiveness. The latter would need a follow-up study with FeatureBench-class tasks. |
| **Reproducibility under model evolution** | Medium-High | Pin model ID, seed where possible, archive raw logs, accept that the result is valid only for the model snapshot used. State this. |
| **Multi-agent harness fairness** | Medium | The orchestrator-subagent dispatch must be identical across workflow styles — only the per-style instructions change. No DTDD-specific helpers (no `worktree.mjs`, no extraction-at-pretest). Verify by code review of the harness before running. |
| **Self-test coverage metric is novel and unvalidated** | Medium | Compute it alongside the standard metrics. If it correlates trivially with hidden-test pass rate, it's redundant; if it diverges, it's the methodology contribution. Either outcome is reportable. |

**Overall verdict on validity:** the bench shape is scientifically defensible *if* four conditions are met before running:

1. **Pre-register** (`bench/PROTOCOL.md`) the tasks, hidden tests, style cards, scoring, and stop conditions before any LLM call. Commit to publishing whatever the result is.
2. **Resolve task contamination** by using known-fresh tasks (LiveCodeBench post-cutoff or hand-written from scratch).
3. **Have a third party (or a blind LLM) write the four style cards** from a fixed methodology specification, so we don't author the conditions we're comparing.
4. **Add a compliance verifier** that checks each trial actually followed the prompted methodology.

Without these four, the bench produces signal but the result will be defensibly criticized as researcher-biased. With them, this is a publishable preprint.

The factorial design is correct. The metrics are correct (with self-test coverage as the novel one). The sample size (200-400 trials) is enough for directional claims. The honest limitation is external validity — small toy tasks vs real software — which we should foreground rather than hide.

## Recommended next step (handoff to designflow)

`bench/PROTOCOL.md` is the right next artifact, written as a Stage-1-registered-report-shaped pre-registration:

- Hypotheses (H1: DTDD > TDD on hidden-test pass rate; H2: DTDD > all on self-test coverage of hidden cases; H3: DTDD-multi-agent > TDD-multi-agent by larger margin than single-agent counterparts)
- Tasks + hidden test specifications
- Style cards (authored by a blind LLM from a methodology spec)
- Procedure, stop conditions, randomization
- Scoring functions
- Compliance-verification rules
- Statistical analysis plan
- Pre-commitment to publish all results

That document should be locked before the bench runner is implemented.
