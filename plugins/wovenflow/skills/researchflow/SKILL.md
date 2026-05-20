---
name: researchflow
description: Pre-design phase. Bridges the gap between the agent's training cutoff and current reality — searches the web for real papers, prior systems, design patterns, current library versions, current API shapes, RFCs, and ecosystem conventions — and produces an outside-context document that becomes input to wovenflow:designflow. Composes one or more researcher profiles (academic, competitive-landscape, etc.) for field-specific rigor.
---

# Researchflow (pre-design outside-context phase)

The agent's knowledge has a training cutoff. For any decision touching libraries, APIs, papers, design patterns, or domain practice, what the agent "knows" may be months or years stale. Library versions advance, APIs deprecate, new RFCs ratify, design conventions evolve, papers get superseded. `researchflow` is the explicit phase that bridges the cutoff-to-current-day gap with web search before the spec gets written.

The design phase rarely starts cold — for any non-trivial decision, something already exists in the world that's worth grounding the design in. The skill surfaces that outside context before the orchestrator drafts a `.spec.md`.

## Researcher profiles

A single project can need several specialist lenses on the same question — academic rigor, competitive intelligence, market sizing, UI prior art. `researchflow` runs **one or more researcher profiles** per invocation. Each profile contributes its own steps and output sections; shared steps (state the question, save the doc) run once.

### Built-in profiles

Built-in profiles ship at `plugins/wovenflow/skills/researchflow/researchers/`:

- **`academic`** — hypothesis framing, citation integrity, replication planning, conflicts and contributions disclosure, data/code availability. For papers, preprints, technical reports, and any work whose output is a claim about the world.
- **`competitive-landscape`** — competitor set, source diversity, capability matrix, recency check, bias disclosure. For build-vs-buy, positioning, differentiation, and feature-parity work.

More profiles can be added to the same directory; each is a single markdown file with frontmatter describing when it applies and the specialized steps it adds.

### Project-local profiles

Project-specific profiles live at `<repo>/.claude/skills/researchflow/researchers/<name>.md` and are discovered alongside the built-ins at run time. Use the `setup` wizard's "Craft custom researcher" path to materialize a fresh profile from `setup/templates/researcher.md.tmpl`.

### Picking profiles

The project's `Standard workstream` section in `CLAUDE.md` names the default profiles for Phase 3. At invocation, `researchflow` reads that default and applies it; the user can override per-call by naming a different profile set. Profiles compose — pick as many as the question genuinely needs (typically 1-3).

If no profiles are configured, `researchflow` runs in **generalist mode**: the base steps below, no specialized rigor on top.

## When to use

- The decision space is wide and external context narrows it (most non-trivial work)
- Choosing among multiple plausible approaches and the choice depends on what's been tried
- Entering a domain where conventions or prior work matters (security, accessibility, ML, distributed systems)
- Before invoking `wovenflow:designflow`
- **Any phase, mid-task, when a hard decision surfaces that the spec doesn't pin down** — an unfamiliar API, a design fork with non-obvious tradeoffs, a "which approach" question where guessing risks rework. `researchflow` is not only a pre-design gate; invoke it whenever you're about to guess on something consequential, including while building or reviewing. The output can be a short scratch survey rather than a full `doc/research/` document when the question is narrow.

Skip when: the work is mechanical (rename a variable, fix a typo), the domain is well-understood by the team, or external references would be noise.

## Output

A markdown document at `doc/research/<feature>.md` with:

- The question being decided
- 3-5 concrete external references with link, type, and 2-line summary each (**real and verifiable**; no vague gestures)
- Per-profile sections — each loaded profile contributes its own structured section (hypothesis framing for `academic`, capability matrix for `competitive-landscape`, etc.)
- Similarities / differences and what's novel about this work

This document is input context for `wovenflow:designflow`. The design phase reads it and writes the spec informed by what's already known.

## Steps the orchestrator follows

### 0. Load profiles

Resolve the profile set:

1. Read the project's `Standard workstream` section in `CLAUDE.md`; look for a `Phase 3` line naming profiles (e.g., `wovenflow:researchflow [academic, competitive-landscape]`)
2. If the user named profiles in the invocation, those override the project default
3. Discover the named profiles in `plugins/wovenflow/skills/researchflow/researchers/` (built-in) and `<repo>/.claude/skills/researchflow/researchers/` (project-local)
4. Read each profile's frontmatter and step list

If no profiles are configured, run the base steps below in generalist mode.

### 1. State the question

Walk the user through naming the design question in one paragraph. Concrete, scoped — not "improve the system."

For research: a falsifiable hypothesis. For UI: "How should users do X?" For architecture: "How do we structure Y given constraints Z?" For library choice: "We need a library that does X with constraints Y."

This step runs once even when multiple profiles are loaded; profiles refine the question framing in their own steps.

### 2. Run profile-prelude steps

For each loaded profile, run its "before searching" steps (typically labeled `*1` — `A1` for academic, `C1` for competitive, etc.). These steps frame what the search will look for: hypothesis framing for academic, competitor-set scoping for competitive, etc.

Profiles run in declaration order. Their outputs accumulate into the research doc as separate sections.

### 3. Surface real references (3-5)

Use web search, official docs, GitHub, design-pattern catalogs, scholar tools, or domain knowledge to find 3-5 *concrete* references relevant to the question. For each:

- **Name** (paper title, project name, pattern name, library name — whatever fits)
- **Type** (paper / system / pattern / library / RFC / etc.)
- **Authors / maintainers / source** (if relevant)
- **URL** (arxiv, GitHub, official docs, RFC link, MDN, etc. — a stable link, not "google it")
- **2-line summary** of what the reference actually says or does

**Hard rule:** if you can't link to a real reference, don't list it. "There's research on this" or "the literature suggests" or "common pattern" without a link is a tell that the orchestrator hasn't actually found anything. Better to list 2 real items than 5 vague gestures.

Loaded profiles apply their integrity gates here as the references are surfaced — `academic` verifies DOIs, `competitive-landscape` checks source diversity, etc. A reference that fails an active profile's gate is dropped, not padded.

### 4. (Optional) List prior systems or tools (2-3)

When step 3 produced mostly papers / patterns / specs, also enumerate concrete prior systems that *implement* the relevant ideas. For each:

- Name + URL (GitHub, project page, vendor docs)
- 1-line takeaway: what does it do that matters here?
- 1-line gap: what doesn't it do — sets up where this work fits

Skip when step 3 already produced concrete systems.

### 5. Check dependency currency (when third-party touchpoints exist)

For any library, framework, or API the design will rely on, verify the *current* state. The agent's training data is months-to-years stale on these specifically — versions advance, APIs deprecate, breaking changes ship.

For each dependency:

- **Current stable version** (per official package registry or GitHub releases)
- **Last release date** (signal of activity / abandonment)
- **Recent breaking changes** (scan changelog for the last 1-2 major versions)
- **Active deprecation warnings** (anything marked deprecated; planned removals)

Sources: official changelogs, release notes, `npm view <pkg>`, `pip index versions <pkg>`, `cargo info <pkg>`, GitHub Releases pages — **not** blog summaries or third-party tutorials (those lag the source-of-truth).

If a library or API has changed materially since the agent's training cutoff, capture that explicitly. The design must target the *current* shape, not the agent's recollection. A spec that compiles against last year's API is a spec that ships broken.

Skip when the design is pure-internal (no third-party touchpoints).

### 6. Run profile-specific analysis steps

Each loaded profile contributes its analysis steps here:

- `academic` adds replication planning (A3), conflicts and contributions (A4), data/code availability (A5)
- `competitive-landscape` adds capability matrix (C3), recency check (C4), bias disclosure (C5)
- Custom profiles add whatever steps their author defined

Steps run in profile-declaration order. Each produces its own section in the output doc.

### 7. Identify similarities and differences

For each major reference, name how this work relates:

- **Similar to:** which problem-shape, which mechanism, which constraint
- **Different in:** which scale, which domain, which integration point, which user

Then a short paragraph: what's novel about this work, if anything?

- Not "we're doing it better" — name the specific novelty (mechanism, scale, domain, integration)
- If nothing is specifically novel, that's important information: this work may be replication / consolidation / engineering rather than research, which changes the shape of what `designflow` writes

### 8. Save the document

`doc/research/<feature>.md` (or wherever the project's research artifacts live). Commit it.

### 9. Hand off to designflow

The next phase (`wovenflow:designflow`) reads this document as context when drafting the `.spec.md`. Behaviors in the spec should reflect what the references and profile analyses teach — don't re-derive what's known; address the actual gaps.

## Output template

```markdown
# Outside context for <feature>

## Profiles applied

<list — e.g., `academic`, `competitive-landscape`>

## Question

<one paragraph; concrete and scoped>

## References

1. **<name>** *(type: paper | system | pattern | library | RFC | …)* — <authors / maintainers, if relevant>. [link](<url>)
   <2-line summary of what this reference actually says or does>

2. **<name>** *(type: …)* — …

## Prior systems (optional)

- **<name>** — [link](<url>). <one-line takeaway>. *Doesn't:* <one-line gap>.

## Dependency currency (when third-party touchpoints exist)

- **<library/API name>** — current stable: `<version>` (released `<date>`). Recent breaking changes: <one line>. Deprecations: <one line>. Source: [link to official changelog].

## Similarities and differences

- **Similar to <ref>:** <how>
- **Different from <ref>:** <how>

## What's novel about this work

<short paragraph>

<!-- Per-profile sections appear below, contributed by each loaded profile -->

## Hypothesis and framing

<from the academic profile, if loaded>

## Citation integrity log

<from the academic profile>

## Replication plan

<from the academic profile>

## Conflicts and contributions

<from the academic profile>

## Data and code availability

<from the academic profile>

## Competitor set

<from the competitive-landscape profile, if loaded>

## Source-class log

<from the competitive-landscape profile>

## Capability matrix

<from the competitive-landscape profile>

## Recency check

<from the competitive-landscape profile>

## Bias and conflicts

<from the competitive-landscape profile>
```

## Integration with the wovenflow core

| Phase | Skill | Reads from researchflow |
|---|---|---|
| 3 (this skill) | `wovenflow:researchflow` | — (produces the outside-context doc) |
| 4 | `wovenflow:designflow` | Reads the outside-context doc when drafting `.spec.md`. Behaviors reflect what's known. |
| 5 | `wovenflow:testflow` | — (operates on the `.spec.md`) |
| 6 | `wovenflow:subflow` | — |

## Involvement gates

Researchflow exposes one user-involvement gate:

| Gate | Fires when |
|---|---|
| `open_question_from_subagent` | A researcher profile (academic, competitive-landscape, or a custom one) needs a confirm-before-fetch decision: paywalled content the user may not want to pay for, ambiguous source class, citations whose DOI lookup fails and need human re-verification, an unexpected source set the profile wants to broaden into. |

Before invoking `AskUserQuestion` at this gate, consult `.wovenflow.yml` at the repo root (see the mode-to-gate table in the plugin README). On `auto`, pick the `(Recommended)` option and append a record to `.wovenflow-decisions.log`:

```json
{"ts":"<iso>","skill":"researchflow","gate":"open_question_from_subagent","chosen":"<option>","reason":"<one-line>"}
```

On `ask`, prompt the user as normal.

Under all three documented modes (`minimal`, `standard`, `maximal`) this gate defaults to `ask` — researcher-surfaced open questions are typically high-leverage and the user usually wants in. Override to `auto` only under `custom` mode and only after deciding you trust the recommended option for those question shapes.

## Anti-patterns

- **Listing references you haven't actually checked.** Name + URL is the floor; the 2-line summary must reflect what the reference actually says, not a guess from the title.
- **Vague gestures.** "There's research on this," "common pattern," "industry standard" — without a link, these are noise. Surface concrete items or say nothing.
- **Trusting the agent's recollection of library versions or API shapes.** That recollection is, by construction, at the training cutoff. Always verify against an official source for any dependency the design will touch.
- **Treating researchflow as a literature review or full design audit.** It's a *targeted* outside-context survey for this specific decision. 3-5 references is the budget — don't sprawl.
- **Running this for mechanical work.** Renaming a variable, fixing a typo, applying a known pattern in a known place — no outside context needed.
- **Skipping when there's "nothing novel."** "No one has done exactly this" almost always means there's adjacent prior art — methods, tools, formulations. List those.
- **Loading profiles that don't apply.** A profile costs steps and rigor; loading `academic` for a "pick a date library" decision is bureaucracy theater. Pick profiles that match the actual question.
- **Inventing project-local profiles for one-off needs.** Profiles encode patterns the project will reuse. For a single specialized question, the base flow plus an ad-hoc note in the doc is enough.
