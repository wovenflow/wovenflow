---
name: researchflow
description: Pre-design phase for research-coded projects. Surfaces 3-5 real papers (title + URL + 2-line summary) plus prior systems/tools, identifies what's novel, and produces a prior-art document that becomes input to wovenflow:designflow. Runs before Phase 3 (Design).
---

# Researchflow (pre-design prior-art phase)

For research-coded projects, the design phase doesn't start cold — there's almost always relevant prior work. `researchflow` is the explicit phase that surfaces it before the orchestrator drafts a `.spec.md`.

## When to use

- Starting work on a research feature or experiment
- The work is in a domain where prior art (papers, systems, tools, known approaches) is likely to exist and matters
- Before invoking `wovenflow:designflow`

For straightforward feature work in a known domain, skip this skill and go straight to `designflow`. Use it when you're entering territory where literature should inform the design.

## Output

A markdown document at `doc/research/<feature>.md` (or appended as a "Prior art" section to the eventual `.spec.md`) with:

- The research question / hypothesis (1 paragraph)
- 3-5 relevant papers (title + URL + 2-line summary each — **real papers only**; no abstract "literature" gestures)
- 2-3 prior systems / tools / projects in the same space (with links and 1-line takeaways)
- A "what's novel" section identifying how this work differs from prior art

This document is input context for `wovenflow:designflow`. The design phase reads it and writes the spec informed by what's already known.

## Steps the orchestrator follows

### 1. State the question

Walk the user through naming the research question or hypothesis in one paragraph. Concrete, falsifiable, scoped — not "improve the system."

### 2. Surface real papers (3-5)

Use web search, scholar tools, or domain knowledge to find 3-5 *actual* papers relevant to the question. For each:

- **Title** (full, accurate)
- **Authors + year** (if known)
- **URL** (arxiv, journal link, or a stable archive — not "google it")
- **2-line summary** of what the paper actually contributes

**Hard rule:** if you can't link to a real paper, don't list it. "There's research on this" or "the literature suggests" is a tell that the orchestrator hasn't actually found anything. Better to list 2 real papers than 5 vague references.

### 3. List prior systems / tools (2-3)

For each:

- Name + URL (GitHub, project page, or vendor)
- 1-line takeaway: what does it do that matters here?
- 1-line of what it doesn't do (sets up the gap)

### 4. Identify what's novel

A short paragraph: how does the proposed work differ from the prior art?

- Not "we're doing it better" — name what's actually new (mechanism, scale, domain, integration, etc.)
- If you can't name something specifically novel, that's important information: maybe the work is replication / consolidation / engineering, not research

### 5. Save the document

`doc/research/<feature>.md` (or wherever the project's research artifacts live). Commit it.

### 6. Hand off to designflow

The next phase (`wovenflow:designflow`) reads this document as context when drafting the `.spec.md`. The behaviors in the spec should reflect what the prior art teaches: don't re-derive what's known; do address gaps.

## Output template

```markdown
# Prior art for <feature>

## Research question

<one paragraph; concrete and falsifiable>

## Relevant papers

1. **<full title>** — <authors, year>. [link](<url>)
   <2-line summary of what this paper actually contributes>

2. **<title>** — ...

## Prior systems and tools

- **<name>** — [link](<url>). <one-line takeaway>. *Doesn't:* <one-line gap>.
- **<name>** — ...

## What's novel about this work

<short paragraph; name the specific novelty — mechanism, scale, domain, integration, etc.>
```

## Integration with the wovenflow core

| Phase | Skill | Reads from researchflow |
|---|---|---|
| 2.5 (this skill) | `wovenflow:researchflow` | — (produces the prior-art doc) |
| 3 | `wovenflow:designflow` | Reads the prior-art doc as context when drafting `.spec.md`. Behaviors should reflect what's known. |
| 4 | `wovenflow:testflow` | — (operates on the `.spec.md`) |
| 5 | `wovenflow:subflow` | — |

## Anti-patterns

- **Listing papers you haven't read.** A title and URL is the floor; the 2-line summary should reflect the actual paper, not a guess.
- **Vague "the literature suggests" gestures.** Surface concrete papers or say nothing.
- **Treating researchflow as a literature review.** It's a *targeted* prior-art survey for this specific feature. 3-5 papers is the budget — don't sprawl into a survey paper.
- **Skipping when the work is genuinely novel.** Even if "no one has done exactly this," there's almost always adjacent prior art — methods, tools, formulations. List those.
- **Running this for non-research work.** Routine feature implementation in a well-understood domain doesn't need researchflow. Use it when the prior art genuinely matters.
