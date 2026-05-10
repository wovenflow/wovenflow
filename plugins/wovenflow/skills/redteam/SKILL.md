---
name: redteam
description: Adversarial-question runner. Forces explicit objections to a load-bearing decision before it gets locked in — "list the top three reasons this is not the right call." Reusable at any commit point: pre-spec save, pre-verify approval, pre-merge, pre-direction-lock. Fast, structured, opinionated about what counts as a real objection vs boilerplate.
---

# Redteam (adversarial check)

A 2-5 minute structured red-team pass over a load-bearing artifact (a spec, a research doc, a verify chain proposal, a PR diff, an architecture decision, a roadmap claim). The orchestrator surfaces the top three reasons the decision might be wrong — specific, artifact-rooted, steel-manned — and judges whether any are load-bearing enough to pause.

The goal is not pessimism. The goal is making implicit objections explicit while reversal is still cheap.

## When to use

- **Before locking a `.spec.md`** (last step in `wovenflow:designflow`)
- **Before approving a verify chain** (optional step in the project's `verify` skill)
- **Before merging an architecturally significant PR** (alongside or inside the project's review skill)
- **Before committing to a direction in `researchflow`** (after references are gathered, before handoff to design)
- **Any moment the orchestrator is about to commit** — explicitly invokable as `/wovenflow:redteam <artifact-path>`

Skip when the decision is mechanical, low-stakes, or trivially reversible.

## Inputs

- **Artifact** — a file path (preferred) or pasted content. The thing being decided. The skill reads it; it does not just react to a one-line summary.
- **Decision under test (one sentence)** — what is the artifact committing the project to? Examples:
  - "Lock the spec for feature X with these 5 behaviors"
  - "Adopt library Y for the date layer"
  - "Approve this PR as-is and ship to main"
- **Stakes (one line, optional)** — what's the cost of being wrong, and how reversible is it? Higher stakes get a sharper red-team.

## Steps the orchestrator follows

### 1. Read the artifact

Open the artifact and read it in full. Don't skim. The objections must be rooted in what it actually says, not in a summary or the orchestrator's prior beliefs about the topic.

### 2. State the decision in one sentence

Write the decision under test as a single sentence beginning with "If we proceed, this project commits to ...". Concrete, scoped. If you can't write the decision in one sentence, the artifact isn't ready for a red-team — it's ready for clarification.

### 3. Generate the top three objections

For each of three objections:

- **Name the objection in one line** ("This couples X and Y in a way that will break Z")
- **Anchor it to the artifact** — quote or reference the specific clause / behavior / section / line that is the source. Generic objections without an artifact anchor are banned.
- **Steel-man it.** Argue the strongest version of the objection a hostile reviewer would make, not a strawman. If the steel-manned form is weak, that itself is signal that the objection isn't real.
- **Estimate severity:** load-bearing (would change the decision if true), worth-noting (would shape the next phase), or minor (filed and move on).
- **Estimate confidence:** high / medium / low — how sure are you that this objection holds, given the evidence in the artifact?

Banned objection patterns (these are noise unless rooted in a specific clause):

- "It's over-engineered" — point at the specific complexity that's not paying for itself
- "Scope creep risk" — name the specific behavior or section that's outside the stated goal
- "This adds technical debt" — name the specific debt and what it blocks
- "Maintainability concerns" — name the specific maintenance burden and who pays it
- "Performance might suffer" — name the specific path and the magnitude

These objections may all be valid. The rule is they must be specific. If you can't make them specific, you don't have an objection — you have a vibe.

### 4. Generate three from different angles

The three objections must come from different angles. Repeating the same concern with different framing is one objection, not three. Useful angles:

- **Premise** — is the problem framed correctly? Are we solving the right thing?
- **Approach** — given the framing, is this the right mechanism?
- **Coupling** — what does this lock the project into that it doesn't want to be locked into?
- **Cost** — is the cost (time, complexity, dependency surface, attention) justified by the upside?
- **Reversibility** — if this turns out to be wrong, how expensive is it to undo?
- **Audience / fit** — does this match how the actual users / contributors / reviewers will engage with it?
- **Failure mode** — what's the specific scenario where this hurts?

Pick three different angles unless one angle has multiple distinct objections that genuinely matter more than diversifying.

### 5. Judge

For each objection, ask:

- **Is it load-bearing?** If true, would the decision change?
- **Is the evidence in the artifact sufficient to settle it?** Or do we need more research / clarification?

Then write a one-paragraph verdict:

- **PROCEED** — three real objections surfaced, none are load-bearing, document them and continue
- **REVISE** — at least one load-bearing objection; the artifact needs to address it before commit (specify what to change)
- **PAUSE** — at least one load-bearing objection that the artifact alone can't settle; need to return to an earlier phase (research, clarification, brainstorming) before commit

### 6. Write the output

Append (or save as a sibling file, depending on the integration site):

```markdown
## Red-team check (YYYY-MM-DD)

**Decision under test:** <one sentence>

**Stakes:** <one line, if provided>

### Top three objections

1. **<one-line objection>** *(severity: <load-bearing | worth-noting | minor>, confidence: <high | medium | low>, angle: <premise | approach | coupling | cost | reversibility | audience | failure-mode>)*
   <2-3 sentences arguing the strongest version. Anchored to: <clause / behavior / section reference>.>

2. **<one-line objection>** *(...)*
   <...>

3. **<one-line objection>** *(...)*
   <...>

### Verdict

**<PROCEED | REVISE | PAUSE>** — <one paragraph>

<If REVISE: what specifically should change before re-checking?>
<If PAUSE: which earlier phase to return to, and what question to answer there?>
```

## Output template

The block above. Save it inline in the artifact (e.g., as a section in the `.spec.md`) or as a sibling file (`<artifact>.redteam.md`), depending on what the calling skill instructs.

## Integration sites

- **`wovenflow:designflow`** — last step before saving the spec. PROCEED → save; REVISE → loop back to revise the spec; PAUSE → return to Phase 2 (clarify) or Phase 3 (research).
- **Project `verify` skill** — optional step before approving the verify chain. PROCEED → continue to ship; REVISE → fix the gap; PAUSE → return to design or build.
- **Project review / `ship` skill** — optional check on architecturally significant PRs.
- **`wovenflow:researchflow`** — optional last step after the references and per-profile sections are filled in, before handoff to design.

When invoked from another skill, the calling skill provides the artifact, the decision sentence, and the stakes; the redteam skill returns the structured output and the verdict.

## When invoked directly

`/wovenflow:redteam <artifact-path>` runs the same flow. The orchestrator asks the user (via `AskUserQuestion`) for the decision sentence and (optionally) the stakes if not derivable from the artifact, then runs steps 1-6 above.

## Anti-patterns

- **Generic objections (over-engineering, complexity, scope creep) without an artifact anchor.** Step 3's banned list is non-negotiable. Generic objections are vibes, not evidence.
- **Three objections that are the same concern phrased differently.** Step 4 forces angle diversity. If two of the three collapse to one, find a third.
- **Strawmanning.** Argue the strongest version of the objection. If a steel-manned version is weak, the objection wasn't real — say so and find a real one.
- **Padding to hit "three."** If the artifact only has two real objections, list two and say so. Inventing a third weakens the signal-to-noise.
- **Treating PROCEED as approval of the artifact.** PROCEED means "no load-bearing objections surfaced in this pass." It is not a verify, a code review, or a sign-off. It's a decision-quality gate.
- **Running redteam on mechanical work.** Renaming a variable, fixing a typo, applying a known pattern — no decision is being committed to. Skip.
- **Running redteam to seek validation.** The skill is most valuable when the orchestrator genuinely doesn't know what the objections are. If the orchestrator already has a target verdict ("I want PROCEED" / "I want REVISE"), the result is theater. Run it before forming the conclusion, not after.
- **Skipping the artifact read.** The whole skill collapses into boilerplate without the read. The objections must be specific to what the artifact says.

## Why three

Three is enough to force angle diversity (one objection might be wrong; three force exploration of the space). Fewer than three permits motivated reasoning ("I can think of one minor concern, ship it"). More than three pads — the marginal fourth and fifth objections are typically rephrasings of the first three.

If a question genuinely has more than three load-bearing objections, the artifact needs more work before it's ready for a red-team — return to an earlier phase.

## Why this skill, not just an inline step

The "list the top three reasons this is wrong" move is a *pattern*, not a designflow-specific step. It applies before any commit-shaped artifact gets locked: spec, research direction, verify chain proposal, architecturally significant PR, roadmap claim, alternative-cycle definition. Pulling it out as a skill keeps each phase skill focused on its job and lets users invoke red-team mode at any decision point — including ones the wovenflow phase model doesn't enumerate.
