---
name: academic
applies_to: research
description: Researcher profile for academic / scientific projects. Adds rigor steps for hypothesis framing, citation integrity, replication planning, and contribution disclosure on top of the base researchflow.
---

# Academic researcher profile

The base researchflow surveys "what already exists." For academic and scientific work, that's not enough — the design phase is downstream of decisions that determine whether the resulting work is *trustworthy*: how the hypothesis is framed before data is seen, whether claims rest on real (not hallucinated) cites, whether the experimental setup will produce a result that replicates.

This profile adds those rigor steps. Use it when the project's outputs are claims about the world, not just code that ships.

## When to apply

- The project produces a paper, preprint, technical report, or experimental result
- Decisions hinge on hypothesis-driven evidence (not just "what works")
- The output will be cited or reviewed by a research community
- Replicability of the result matters more than ergonomics

Skip this profile and use a generalist or engineering profile for: tooling, infrastructure, refactors, or applied work that doesn't claim to advance knowledge.

## Researcher mindset

Three things separate research from advocacy in this context:

1. **Frame before you fish.** Decide what counts as a positive result *before* you've seen the data. Anything decided after seeing data is exploratory and must be labeled exploratory.
2. **Cite what's real.** Every reference resolves to a real DOI, arxiv ID, or stable URL. The summary reflects the paper's actual claim, not a guess from the title. LLMs hallucinate plausible-sounding cites; that's the failure mode this profile is built to prevent.
3. **Plan for replication.** The experimental setup should be specifiable in enough detail that a third party could re-run it. If the design doesn't have that property, the design phase needs to fix it before code starts.

## Steps (run in addition to base researchflow)

### A1. Frame the hypothesis (before searching for references)

State explicitly:

- **Confirmatory or exploratory?** Confirmatory work tests a hypothesis decided in advance; exploratory work surveys for patterns. Both are valid; mixing them silently is not.
- **Hypothesis (if confirmatory):** the falsifiable claim, in one sentence. State the predicted direction.
- **Population / scope:** what entities, conditions, time period, or domain does the claim cover?
- **Success and falsification criteria:** what observation would confirm? What would falsify? Be specific enough that a reviewer couldn't read either outcome as the predicted one.

If the work is exploratory, write that explicitly: "This is an exploratory survey; specific findings will be flagged as candidates for follow-up confirmatory work." This protects against post-hoc HARKing (Hypothesizing After Results are Known).

### A2. Citation integrity gate (during the references step of the base flow)

For every reference surfaced:

- **Verify the DOI / arxiv ID / stable identifier resolves** — open the link; confirm the title and authors match the agent's summary
- **Confirm the claim attributed to the reference is actually in the paper** — read the abstract minimum; for load-bearing cites, read the relevant section
- **Note the venue and year** — peer-reviewed venue, preprint server, blog, or unpublished are different epistemic weights; the doc records which

If a reference can't be verified, **drop it**. A short list of real references is better than a padded list with hallucinated entries. Hallucinated citations are the single biggest LLM failure mode in academic work; this gate is non-negotiable.

### A3. Replication and statistical-power check

If the design will produce empirical results:

- **Sample size and power justification** — is the planned N large enough to detect the effect size of interest? Reference a power-analysis method explicitly (G*Power, simr, domain-standard rules-of-thumb)
- **Replicability checklist** — is the setup specified in enough detail that a third party could re-run it? Code, data, environment, random seeds, hyperparameter ranges
- **Pre-registration** — for confirmatory work, consider whether to pre-register the hypothesis and analysis plan (OSF, AsPredicted, ClinicalTrials.gov as fits the field). Note the registration ID in the research doc if one exists

### A4. Conflicts and contributions

- **Funding sources** — list the funding that supports this work
- **Competing interests** — list any non-financial conflicts (advocacy positions, author relationships to vendors / systems being evaluated, prior public stances on the question)
- **Contribution attribution** — for collaborative work, name who did what (CRediT taxonomy: conceptualization, methodology, software, validation, formal analysis, investigation, resources, data curation, writing, visualization, supervision, project administration, funding acquisition)
- **AI assistance disclosure** — name LLM tools used and what they did. The default expectation in many venues is now explicit disclosure

### A5. Data and code availability

- **Data** — public repository (Zenodo, OSF, Dryad, domain-specific archive), restricted access (specify the access mechanism), or not shared (justify why)
- **Code** — public repo, archived release with DOI, or embargoed
- **License** — for both data and code

If any answer is "not yet decided," flag it explicitly so designflow can build the resolution into the spec rather than leaving it to ship-time.

### A6. Peer-review pitfall scan (final pass before locking the design)

Read the in-progress research doc and proposed design **as a hostile peer reviewer**. For each item below, ask: "Would a reviewer flag this paper for X?" The items are drawn from empirical studies of what peer reviewers actually catch (Schroter et al. 2008, *J R Soc Med* — categorized major and minor errors detected in a controlled trial of reviewer training), the Munafò et al. 2017 *Nature Human Behaviour* "Manifesto for reproducible science," and Clarivate's editorial guidance on flaws to look out for in peer review. Citations at the end of this profile.

Mark each item PASS / FAIL / N/A. Any FAIL is a finding to raise before the design phase locks. N/A is acceptable only if the item is genuinely outside the work's scope (e.g., "intention-to-treat" doesn't apply to a non-clinical study); state the reason briefly.

Some items deliberately overlap with A1–A5 — this is the integration scan that catches what slipped through the earlier steps.

#### Framing and design

- [ ] **Confirmatory work is labeled confirmatory; exploratory work is labeled exploratory.** If the framing shifted after seeing pilot data, that's HARKing (Hypothesizing After Results are Known). Re-label honestly.
- [ ] **Study design is appropriate for the stated aim.** A loose between-subjects survey can't establish causation; a single-arm pre/post can't show that an effect exceeds regression to the mean. Mismatch between aim and design is the most frequently cited reviewer rejection cause.
- [ ] **Prior work is engaged, not just listed.** The doc says *what previous studies found and why this one adds something*, not just "the topic has been studied" (Schroter major #1: poor justification for conducting the study).
- [ ] **Deviations from standard / best-practice methods are explained.** Domain has a default analytic pipeline? If you're not using it, say why. Silent deviation reads as either ignorance or methodological convenience (Clarivate #2).

#### Sampling and statistical power

- [ ] **A sample-size or power justification exists.** Cite the power-analysis method (G*Power, simr, simulation), the assumed effect size, and the alpha/power targets. "We collected as many as we could" is not a justification (Schroter major #3).
- [ ] **The planned N can plausibly detect the effect size of interest.** If the minimum detectable effect from your N is implausibly large (e.g., "we can detect d=2.0" for a phenomenon usually d=0.2), the study is structurally underpowered.
- [ ] **Randomization or selection is unbiased.** If randomizing, the mechanism (RNG seed, software, manual draws) is named. Schroter major #2: randomization by family name or day of week is biased and routinely caught.
- [ ] **Outcome measures have documented reliability and validity.** If using an instrument, cite its psychometric properties. If novel, justify why and report any internal-consistency checks (Schroter major #4).

#### Analysis discipline

- [ ] **The analysis plan was specified before the data was inspected.** Pre-registration covers this; otherwise the plan is in the research doc, dated, before data collection begins.
- [ ] **Analytic flexibility is constrained.** Multiple comparisons are corrected (Bonferroni, Holm, FDR — pick one, state which). Robustness checks are pre-specified, not invented after seeing the result. P-hacking and the "garden of forking paths" are reviewer-catch staples (Munafò).
- [ ] **Missing data handling is specified up front.** What counts as missing? How are missing entries treated (listwise deletion, multiple imputation, MICE, EM)? Silent omission of missingness is a top reviewer red flag.
- [ ] **For trials: intention-to-treat applies where appropriate.** Per-protocol analyses without an ITT companion get caught. State which is primary and why (Schroter major #5).
- [ ] **The chosen statistical test matches the data structure.** Hierarchical / clustered data warrants multilevel models; repeated measures warrant within-subject tests. A linear model on count data with a long right tail is the kind of mismatch reviewers flag immediately.

#### Interpretation

- [ ] **Conclusions stay within the evidence.** "Our results show X causes Y" requires a design that can establish causation; "associated with" is the honest weaker form for observational work (Schroter major #7 / Clarivate #3 — over-interpretation / #5 — lack of supporting evidence).
- [ ] **Generalization is bounded to the studied population.** A WEIRD-sample (Western, Educated, Industrialized, Rich, Democratic) effect is a WEIRD-sample effect. State the scope explicitly; reviewers will narrow it for you if you don't.
- [ ] **Effect sizes (with CIs) are reported, not just p-values.** A statistically significant but tiny effect is a different claim than a large one; the paper should make that distinction explicit. P-value-only reporting is consistently flagged.
- [ ] **Correlational evidence is not described in causal language.** "Children who eat breakfast perform better" ≠ "breakfast improves performance." Word choice gets caught.
- [ ] **Discussion stays in scope.** Speculative implications presented as findings, policy recommendations from a small pilot — Clarivate #4 covers commenting beyond what the data supports.

#### Reporting consistency

- [ ] **Numbers in the abstract, results, and tables agree.** Schroter major #8 (abstract vs results) and minor #3 (text vs tables) — discrepancies undermine reviewer trust in the entire paper. Audit before submission.
- [ ] **Denominators are consistent and traceable.** A participant count of 60 in one section and 58 in another, with no flow diagram explaining the drop, gets flagged (Schroter major #9).
- [ ] **Participant flow is documented.** Inclusions, exclusions, dropouts, withdrawals. CONSORT-style flow diagrams are the field standard for trials; analogous flow descriptions apply to other designs.
- [ ] **Response / completion rates are addressed.** A low response rate without analysis of non-response bias is a structural threat to external validity (Schroter major #6).
- [ ] **Observer / Hawthorne / demand effects are discussed where they apply.** Participants behaving differently because they know they're being observed is a real confound; saying nothing about it is itself a finding for the reviewer (Schroter minor #5).
- [ ] **Ethics approval, IRB clearance, or equivalent is stated.** Standard expectation in human-subjects work (Schroter minor #1). For non-human-subjects work, state explicitly that approval was not required.

#### Reproducibility and transparency

- [ ] **Pre-registration exists or its absence is justified.** For confirmatory work in fields with pre-registration infrastructure (OSF, AsPredicted, ClinicalTrials.gov), unregistered confirmatory work invites suspicion. State the registration ID or explain why none.
- [ ] **Code, data, and environment are recoverable.** Random seeds pinned. Hyperparameters specified. Library versions captured. A third party with the inputs can reproduce the outputs. A5 of this profile is the home for this attestation; verify it's actually filled in.
- [ ] **Selective reporting is precluded.** If the paper has 8 hypotheses and reports only the 3 that "worked," the other 5 should appear (supplement, appendix, or explicit text). Internal publication bias is Munafò's central concern.
- [ ] **Conflicts of interest and AI assistance are disclosed.** A4 covers this; verify it's present in the doc, not just intended.

#### How to apply

Walk the checklist linearly. Don't skip. For each FAIL, decide:

- **Fix now** (before lock) — revise the design / spec to address it. Most items fall here.
- **Defer with explicit caveat** — note the limitation in the paper's "Threats to validity" section so reviewers see it preempted rather than catching it.
- **Accept the rejection risk** — only if the cost of fixing exceeds the value of the work, and the limitation is foundational rather than fixable.

The output of this scan is a **Peer-review pitfall log** section in the research doc enumerating findings and dispositions.

## Output schema additions

Add these sections to the research doc:

- `## Hypothesis and framing` (from A1)
- `## Citation integrity log` (from A2 — for each reference: verified DOI? abstract read? venue type?)
- `## Replication plan` (from A3)
- `## Conflicts and contributions` (from A4)
- `## Data and code availability` (from A5)
- `## Peer-review pitfall log` (from A6 — per-item PASS / FAIL / N/A with brief disposition for each FAIL)

## References for the A6 checklist

- Schroter, S., Black, N., Evans, S., Godlee, F., Osorio, L., & Smith, R. (2008). What errors do peer reviewers detect, and does training improve their ability to detect them? *Journal of the Royal Society of Medicine*, 101(10), 507–514. [https://pmc.ncbi.nlm.nih.gov/articles/PMC2586872/](https://pmc.ncbi.nlm.nih.gov/articles/PMC2586872/)
- Munafò, M. R., Nosek, B. A., Bishop, D. V. M., Button, K. S., Chambers, C. D., Percie du Sert, N., Simonsohn, U., Wagenmakers, E.-J., Ware, J. J., & Ioannidis, J. P. A. (2017). A manifesto for reproducible science. *Nature Human Behaviour*, 1, 0021. [https://www.nature.com/articles/s41562-016-0021](https://www.nature.com/articles/s41562-016-0021)
- Clarivate (n.d.). *6 Common Flaws To Look Out For in Peer Review.* [https://clarivate.com/academia-government/blog/6-common-flaws-to-look-out-for-in-peer-review/](https://clarivate.com/academia-government/blog/6-common-flaws-to-look-out-for-in-peer-review/)

## Anti-patterns

- **Hallucinated cites.** "There's a 2023 paper that shows X" without a verified DOI is the default LLM failure here. The A2 gate is the antidote; apply it ruthlessly.
- **Confirmatory-after-the-fact.** "Our hypothesis was X" written after the result is known. If the hypothesis is updating based on data, the work is exploratory; label it.
- **Citation laundering.** Citing paper A because paper B cited it, without reading A. The "summary reflects what the paper says" requirement forces actually reading the relevant passage.
- **Skipping pre-registration "because it slows me down."** Pre-registration is the cheapest credibility upgrade in research; the only cost is committing to a plan before you fish.
- **Calling exploratory work confirmatory.** Both modes are valid; misrepresenting which one this is poisons the field.
- **Treating A6 as ceremonial.** A reviewer-mindset scan that always returns PASS is the same as no scan. If a walk through the checklist produces no FAILs, that's signal to be skeptical of the walk, not the design.
