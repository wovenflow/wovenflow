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

## Output schema additions

Add these sections to the research doc:

- `## Hypothesis and framing` (from A1)
- `## Citation integrity log` (from A2 — for each reference: verified DOI? abstract read? venue type?)
- `## Replication plan` (from A3)
- `## Conflicts and contributions` (from A4)
- `## Data and code availability` (from A5)

## Anti-patterns

- **Hallucinated cites.** "There's a 2023 paper that shows X" without a verified DOI is the default LLM failure here. The A2 gate is the antidote; apply it ruthlessly.
- **Confirmatory-after-the-fact.** "Our hypothesis was X" written after the result is known. If the hypothesis is updating based on data, the work is exploratory; label it.
- **Citation laundering.** Citing paper A because paper B cited it, without reading A. The "summary reflects what the paper says" requirement forces actually reading the relevant passage.
- **Skipping pre-registration "because it slows me down."** Pre-registration is the cheapest credibility upgrade in research; the only cost is committing to a plan before you fish.
- **Calling exploratory work confirmatory.** Both modes are valid; misrepresenting which one this is poisons the field.
