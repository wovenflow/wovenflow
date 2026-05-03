---
name: researchflow
description: Pre-design phase. Searches the web (and other sources) for outside verification — real papers, prior systems, design patterns, library options, established conventions — and produces an outside-context document that becomes input to wovenflow:designflow. Runs before Phase 4 (Design) when external context should inform the design.
---

# Researchflow (pre-design outside-context phase)

The design phase rarely starts cold — for any non-trivial decision, something already exists in the world that's worth grounding the design in. `researchflow` is the explicit phase that surfaces that outside context before the orchestrator drafts a `.spec.md`.

"Research" reads colloquially. The skill applies to:

- **Academic research projects** — relevant papers, prior experimental systems
- **UI / UX work** — established design patterns, comparable products, accessibility conventions
- **Architecture decisions** — prior systems solving the same problem, well-known trade-offs
- **Library or framework selection** — concrete options with their tradeoffs and adoption signals
- **API or protocol design** — RFCs, industry conventions, similar systems' interfaces
- **Naming and ergonomics** — how the ecosystem names things; what users expect

The shape is the same in every case: surface 3-5 concrete external references with links, identify what's similar/different, hand off to design.

## When to use

- The decision space is wide and external context narrows it (most non-trivial work)
- Choosing among multiple plausible approaches and the choice depends on what's been tried
- Entering a domain where conventions or prior work matters (security, accessibility, ML, distributed systems)
- Before invoking `wovenflow:designflow`

Skip when: the work is mechanical (rename a variable, fix a typo), the domain is well-understood by the team, or external references would be noise.

## Output

A markdown document at `doc/research/<feature>.md` (or appended as a "Prior art" section to the eventual `.spec.md`) with:

- The question being decided (1 paragraph) — what design choice or scope are we informing?
- 3-5 concrete external references with link, type, and 2-line summary each (**real and verifiable**; no vague gestures)
- A "what's similar / what's different" section identifying how this work relates to the references
- A short paragraph naming what's novel about this work, if anything

This document is input context for `wovenflow:designflow`. The design phase reads it and writes the spec informed by what's already known.

## Steps the orchestrator follows

### 1. State the question

Walk the user through naming the design question in one paragraph. Concrete, scoped — not "improve the system."

For research: a falsifiable hypothesis. For UI: "How should users do X?" For architecture: "How do we structure Y given constraints Z?" For library choice: "We need a library that does X with constraints Y."

### 2. Surface real references (3-5)

Use web search, official docs, GitHub, design-pattern catalogs, scholar tools, or domain knowledge to find 3-5 *concrete* references relevant to the question. For each:

- **Name** (paper title, project name, pattern name, library name — whatever fits)
- **Type** (paper / system / pattern / library / RFC / etc.)
- **Authors / maintainers / source** (if relevant)
- **URL** (arxiv, GitHub, official docs, RFC link, MDN, etc. — a stable link, not "google it")
- **2-line summary** of what the reference actually says or does

**Hard rule:** if you can't link to a real reference, don't list it. "There's research on this" or "the literature suggests" or "common pattern" without a link is a tell that the orchestrator hasn't actually found anything. Better to list 2 real items than 5 vague gestures.

### 3. (Optional) List prior systems or tools (2-3)

When the references in step 2 were mostly papers / patterns / specs, also enumerate concrete prior systems that *implement* the relevant ideas. For each:

- Name + URL (GitHub, project page, vendor docs)
- 1-line takeaway: what does it do that matters here?
- 1-line gap: what doesn't it do — sets up where this work fits

Skip this step when step 2 already produced concrete systems.

### 4. Identify similarities and differences

For each major reference, name how this work relates:

- **Similar to:** which problem-shape, which mechanism, which constraint
- **Different in:** which scale, which domain, which integration point, which user

Then a short paragraph: what's novel about this work, if anything?

- Not "we're doing it better" — name the specific novelty (mechanism, scale, domain, integration)
- If nothing is specifically novel, that's important information: this work may be replication / consolidation / engineering rather than research, which changes the shape of what `designflow` writes

### 5. Save the document

`doc/research/<feature>.md` (or wherever the project's research artifacts live). Commit it.

### 6. Hand off to designflow

The next phase (`wovenflow:designflow`) reads this document as context when drafting the `.spec.md`. Behaviors in the spec should reflect what the references teach — don't re-derive what's known; address the actual gaps.

## Output template

```markdown
# Outside context for <feature>

## Question

<one paragraph; concrete and scoped>

## References

1. **<name>** *(type: paper | system | pattern | library | RFC | …)* — <authors / maintainers, if relevant>. [link](<url>)
   <2-line summary of what this reference actually says or does>

2. **<name>** *(type: …)* — …

## Prior systems (optional)

- **<name>** — [link](<url>). <one-line takeaway>. *Doesn't:* <one-line gap>.
- **<name>** — …

## Similarities and differences

- **Similar to <ref>:** <how>
- **Different from <ref>:** <how>

## What's novel about this work

<short paragraph; name the specific novelty — mechanism, scale, domain, integration, etc. — or honestly note that the work is replication / consolidation / engineering>
```

## Integration with the wovenflow core

| Phase | Skill | Reads from researchflow |
|---|---|---|
| 3 (this skill) | `wovenflow:researchflow` | — (produces the outside-context doc) |
| 4 | `wovenflow:designflow` | Reads the outside-context doc when drafting `.spec.md`. Behaviors reflect what's known. |
| 5 | `wovenflow:testflow` | — (operates on the `.spec.md`) |
| 6 | `wovenflow:subflow` | — |

## Anti-patterns

- **Listing references you haven't actually checked.** Name + URL is the floor; the 2-line summary must reflect what the reference actually says, not a guess from the title.
- **Vague gestures.** "There's research on this," "common pattern," "industry standard" — without a link, these are noise. Surface concrete items or say nothing.
- **Treating researchflow as a literature review or full design audit.** It's a *targeted* outside-context survey for this specific decision. 3-5 references is the budget — don't sprawl.
- **Running this for mechanical work.** Renaming a variable, fixing a typo, applying a known pattern in a known place — no outside context needed. Use this when the design choice genuinely depends on what others have tried.
- **Skipping when there's "nothing novel."** "No one has done exactly this" almost always means there's adjacent prior art — methods, tools, formulations. List those.
