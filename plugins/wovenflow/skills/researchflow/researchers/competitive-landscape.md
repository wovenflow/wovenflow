---
name: competitive-landscape
applies_to: research
description: Researcher profile for competitive intelligence — who else does this, what they actually do, and where the real differentiation is. Adds source-bias and anti-cherry-picking gates on top of the base researchflow.
---

# Competitive-landscape researcher profile

The base researchflow surfaces references. For competitive work, those references are typically vendor websites, product documentation, pricing pages, and review sites — sources with strong, well-known biases. Vendor copy describes the product the marketing team wants to sell, not the product the engineering team built. This profile adds the gates that keep the analysis honest.

Use it for product strategy, build-vs-buy decisions, positioning work, or any situation where understanding what competitors actually do (versus claim) shapes the design.

## When to apply

- Build-vs-buy decisions
- Differentiation and positioning
- Estimating where the bar is in a market
- Build prioritization driven by feature parity
- Pricing or packaging decisions

Skip when the project is in a domain with no real competitors, or competitive position has no bearing on the design choices being made.

## Researcher mindset

Three habits separate competitive intelligence from competitive cargo-culting:

1. **Vendor copy is not ground truth.** It's a primary source about *what the vendor wants to sell*, not about what the product actually does. Treat it as input data, not as fact.
2. **Look for what isn't said.** Marketing emphasizes the product's strongest dimensions and quietly elides the weakest. The gap between the feature list and a real capability matrix is where the truth lives.
3. **Distinguish real differentiators from marketing differentiators.** A real differentiator is something you can verify and that would change a buyer's choice. A marketing differentiator is a phrase the legal team approved.

## Steps (run in addition to base researchflow)

### C1. Identify the actual competitor set (before searching)

State explicitly:

- **Direct competitors** — products solving the same problem for the same buyer
- **Indirect competitors** — products solving an adjacent problem the same buyer might pick instead (DIY, status quo, internal tooling)
- **Out-of-scope** — names that come up but are clearly different category; note why they don't belong

Aim for 3-5 direct + 1-2 indirect. More than that signals the problem definition is too broad.

### C2. Source diversity gate (during the references step of the base flow)

For each competitor, surface references from at least two source classes:

- **First-party** — vendor website, official docs, pricing page, product changelog. Bias: maximum. Use for capabilities, pricing, positioning *as claimed*.
- **Independent review or benchmark** — third-party review site, benchmark study, comparison piece by a non-vendor. Bias: medium. Use to triangulate capability claims.
- **User-generated** — Reddit, HN, Stack Overflow, app-store reviews, G2, Capterra. Bias: vocal minority. Use for failure modes and friction the vendor doesn't surface.

If a competitor only has first-party sources, mark the entry as "first-party-only" and downgrade confidence in any capability claim about it.

### C3. Capability matrix (replaces the base flow's similarities/differences step for competitive work)

Build a 2D matrix: competitors × capability axes. Capability axes come from the design questions, **not** from competitor marketing categories.

For each cell:

- ✅ Verified (independent source confirms)
- ⚠️ Claimed (vendor says so; not independently verified)
- ❌ Verified absent
- ? Unknown

The shape of the gaps in this matrix is where the design's positioning lives.

### C4. Recency and asymmetric-update check

Vendor copy goes stale. For each competitor:

- **Last release / pricing change** — when did the public surface last update? Stale copy suggests maintenance mode or attention shifted elsewhere
- **Last independent review or benchmark** — same question for third-party material; old benchmarks may not reflect the current product

Flag any claim that depends on data older than 12 months.

### C5. Source-bias and conflict disclosure

Disclose:

- **Commercial relationship** between this project's authors / sponsors and any competitor (current customer, prior customer, partner, ex-employer)
- **Stated competitor positioning** — name each competitor's claimed positioning in their own words; don't paraphrase into a strawman
- **Author bias acknowledgment** — what's the author's prior take on this category, and how might it shape the analysis?

## Output schema additions

Add to the research doc:

- `## Competitor set` (from C1)
- `## Source-class log` (from C2 — for each competitor, what classes of sources back the claims about it)
- `## Capability matrix` (from C3)
- `## Recency check` (from C4)
- `## Bias and conflicts` (from C5)

## Anti-patterns

- **Citing only vendor websites.** "Per Acme's homepage, Acme is the leader in X" is data about Acme's marketing, not data about Acme's product.
- **Cherry-picking the weakest competitor.** Comparing only against the worst option in the category to make the work look strong; reviewers and customers see through it.
- **Strawmanning competitors.** Describing a competitor's product in terms that competitor wouldn't recognize. Use their own positioning words; argue against the strongest version.
- **Treating "no public info" as "doesn't exist."** Some competitors are deliberately quiet. Reach out, ask users, look at job listings; absence of public signal isn't absence of capability.
- **Locking in conclusions before the matrix is filled.** If you've already decided where the gap is, the analysis becomes a justification exercise. Build the matrix first; let it shape the conclusion.
