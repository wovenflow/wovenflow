---
name: designflow
description: Design phase of DTDD (Doc-Test-Driven Development). Use when starting a new feature or bug fix. Produces a .spec.md with user stories and if/when/then behaviors — prose only, no test code yet. The testflow skill follows.
---

# Designflow (DTDD Design phase)

First of three phases in a Doc-Test-Driven Development cycle. Produce one `.spec.md` file in `doc/specs/` containing:

- **User stories** — the why (for the user)
- **Architecture changes** — the why (for the system shape), when the feature changes it
- **Behaviors** as ∵ IF / ↦ WHEN / ∴ THEN triplets — the what

No test code at this stage. No implementation. Just prose that captures the design clearly enough that the **testflow** skill can lock it down by inserting executable tests for each behavior.

## Clause symbols

Each behavior's three clauses are prefixed with a logic symbol that conveys what the clause does. Same semantics as BDD's Given/When/Then; the symbols make the structure pop when scanning a spec full of behaviors.

| Symbol | Meaning | Clause |
|---|---|---|
| **∵** | "because" / "since" | the precondition |
| **↦** | "maps to" / transition | the event or action |
| **∴** | "therefore" | the expected outcome |

## File shape

````markdown
# <Feature> spec

## User stories

- As a <persona>, I want <goal>, so that <benefit>
- ...

## Architecture changes

<!-- Omit this section entirely when the feature changes no architecture.
     When present, one entry per decision — see "The Architecture changes
     section" below. -->

- **<change in one line>.** <why — what forced it, what was rejected, what
  it unlocks>. Updates `ARCHITECTURE.md` <section>.

## Behaviors

### B1: <short name>
∵ **IF** <precondition>
↦ **WHEN** <event>
∴ **THEN** <expected outcome>

### B2: <short name>
∵ **IF** ...
↦ **WHEN** ...
∴ **THEN** ...
````

## The Architecture changes section

Behaviors capture **what the system does**. They do not reliably capture **why the system is shaped the way it is**. When a feature changes the project's architecture — a new layer, a changed data flow, a swapped dependency, a new cross-cutting mechanism, a relaxed or tightened invariant — that decision needs a home, and a behavior triplet is the wrong shape for it.

The `## Architecture changes` section is that home. It is where the **rationale** lives — the *why* behind the structural change. It pairs with `ARCHITECTURE.md`, which carries **current state**: the spec explains why the state changed; `ARCHITECTURE.md` describes what the state now is.

Each entry:

- **Names the change** in one line.
- **Explains the why** — what forced it, what alternatives were considered and rejected, what it unlocks. This is the part that has nowhere else to live: git history carries the diff, `ARCHITECTURE.md` carries the result, but the *reasoning* only survives if it's written here.
- **Points at the `ARCHITECTURE.md` update** it implies — which section gets rewritten to reflect the new state.

Example:

````markdown
## Architecture changes

- **Provider dispatch becomes pluggable.** The harness assumed a single
  hardcoded Anthropic client. Supporting a local open-weights baseline
  requires routing by a `BENCH_PROVIDER` env var. Rejected: a second
  hardcoded code path (doesn't generalize past two providers). Updates
  `ARCHITECTURE.md` §"Trial dispatch" to describe the provider-resolution
  layer.
````

**The split:** `ARCHITECTURE.md` is current state — hand-written, deliberately tedious, matklad-style. The spec's Architecture changes section is the decision record — the diff and the reasoning. After the spec locks, the `ARCHITECTURE.md` update named in each entry gets applied (by the implementer during build, or by the orchestrator at post-ship) so current-state stays current. The spec is durable; re-reading it later answers "why is it like this?"

**When to omit it:** most small features and bug fixes change no architecture — leave the section out entirely. Do not pad it with restated behaviors. If you're tempted to write "the architecture change is that we added behavior B3," there is no architecture change — B3 already covers it. The section exists only for decisions that outlive any single behavior.

## Involvement gates

Designflow exposes one user-involvement gate:

| Gate | Fires when |
|---|---|
| `design_doc_ready` | The spec is fully drafted, the red-team check returned PROCEED, and the orchestrator is about to hand off to `testflow`. |

Before invoking `AskUserQuestion` at this gate, consult `.wovenflow.yml` at the repo root (see the mode-to-gate table in the plugin README). If the resolved value is `auto`, pick the `(Recommended)` option (proceed to testflow) and append a record to `.wovenflow-decisions.log`:

```json
{"ts":"<iso>","skill":"designflow","gate":"design_doc_ready","chosen":"proceed","reason":"<one-line>"}
```

If the resolved value is `ask`, proceed with the normal interactive prompt.

Under every documented mode (`minimal`, `standard`, `maximal`) the default for `design_doc_ready` is `ask` — this gate is the canonical "show the user the spec before locking" checkpoint and is intentionally not auto-resolvable except via `custom` mode override.

## Where it lives

- `doc/specs/YYYY-MM-DD-<feature>.spec.md` for top-level project specs
- Or alongside the source it specs (e.g., `src/foo/foo.spec.md` or `extensions/foo/foo.spec.md`)

## When to use

- Starting a feature or bug fix, after the issue is claimed and any clarify/challenge work is done, before any code.
- Captures design output durably without implementation detail.

## Bug-fix mode

Bug fixes go through designflow too — the failing record is the failing test, the corrected behavior is the spec. Don't bypass the pipeline because the work feels "mechanical." Five things differ from feature design and need explicit handling.

### 1. Triage before specifying

Failure logs go stale fast. A bucket built from yesterday's scan can have moved on — records now fail at a different stage, or already pass after an unrelated fix landed. Before writing a behavior:

- Replay 3-5 records from the bucket against the current code state.
- If most no longer hit the original error, the bucket is stale. Re-derive it from a fresh scan, or abandon.
- If the bucket is real, count: how many records actually reproduce? That's the addressable size — and the implementer's before/after target.

Don't write a behavior for a stale bucket. The implementer subagent will discover staleness during reproduction, but you'll have spent design effort on phantom work.

### 2. One error, often N bugs

A single error message can be produced by multiple distinct root causes. `'NoneType' is not iterable` might be: a runtime op returning None where a sequence was expected; a user-defined function call resolution failure; a different control-flow path that legitimately raises.

Before specifying, decompose the bucket by likely root cause. Each root cause is its own behavior. One over-broad behavior produces an implementer that touches too much and a reviewer that can't tell what's in scope.

### 3. Acceptance criteria are record IDs

Bug-fix specs name concrete failing records as part of the contract. Implementers report before/after counts; reviewers verify against the named records.

```markdown
### B1: list.pop(idx) routes to a polymorphic dict_mut_pop op

∵ **IF** source code calls `xs.pop(idx)` where `xs` is a list
↦ **WHEN** the compiler lowers and the runtime executes
∴ **THEN** `dict_mut_pop` dispatches on receiver type and returns
   `xs` with index `idx` removed

Failing records that should pass after this fix:
- `runs/<scan>/failures.jsonl` entries matching
  error_msg = "'list' object has no attribute 'items'"
- Representative subset: pid=894 case 0, pid=1006 case 0,
  pid=4625 case 0 (full bucket is N records at design time)
```

### 4. Some buckets are design-required, not mechanical

Investigation can reveal that fixing a bucket requires architectural change out of proportion to its record yield (e.g., a 1-record bucket gated on implementing a whole exception model). Spec accordingly:

- Write a **proposal** under `doc/plans/<date>-<topic>.md` instead of a behavior. Document the design, the cost, and the records gated.
- Don't dispatch an implementer. A proposal is deferring with full context preserved, not a failure.

### 5. The investigation often is the design

For features, design starts from "what should this do?" — product thinking. For bugs, design often starts from "trace the failing record through the code, find the wrong line." That's investigation, not ideation.

It's fine to spec a behavior whose precondition you only fully understood after reading 200 lines of source. The investigation isn't wasted — it *is* the design step. Capture what you learned in the ∵ IF clause precisely, including any non-obvious context that constrains the fix.

## Rules

- **No code blocks at this stage.** The next skill (`testflow`) inserts them.
- **One ∵ IF / ↦ WHEN / ∴ THEN per behavior.** If you can't capture it that way, the behavior is too big — split it.
- **Behaviors are independent.** If B2 depends on B1's outcome, encode that in B2's ∵ IF precondition explicitly.
- **User stories describe what the user wants and why** — not how the system implements it.
- **Architecture changes describe why the system shape changed** — the rationale only. Current state goes in `ARCHITECTURE.md`; each entry names the `ARCHITECTURE.md` section it updates. Omit the section when nothing architectural changed.

## Red-team check before locking

Before saving the spec as the final draft, run `wovenflow:redteam` against it:

- **Artifact:** the in-progress `.spec.md`
- **Decision under test:** "If we proceed, this project commits to building feature `<name>` as <N> behaviors per this spec."
- **Stakes:** one line on what the cost of being wrong is — at minimum, "Phase 5 (testflow) and Phase 6 (subflow) cost will be sunk if we have to revise the direction after this."

Possible verdicts:

- **PROCEED** — the redteam surfaced three real objections, none load-bearing. Append the redteam block to the spec (as a `## Red-team check` section near the end) and continue to handoff. The objections become design context for the testflow + subflow phases.
- **REVISE** — at least one load-bearing objection. Update the spec to address it, then re-run redteam. Don't proceed to testflow on a spec with an open load-bearing objection.
- **PAUSE** — at least one load-bearing objection that the spec alone can't resolve. Return to Phase 2 (clarify-and-challenge) or Phase 3 (researchflow) with the specific question the redteam surfaced. Re-enter designflow when the upstream question is answered.

Skip the redteam check only when the spec is for clearly-mechanical work (small bug fix, single behavior, well-understood pattern). When in doubt, run it — it's a 2-5 minute pass.

## Handoff to testflow

Once the prose is locked **and** the red-team check returns PROCEED, invoke `testflow` to insert `test('...', () => {})` blocks alongside each behavior. The same `.spec.md` file is appended to; both phases produce one artifact.

## Anti-patterns

- **Implementation in user stories.** "The system queries the cache and returns..." → describe the behavior, not the algorithm.
- **Conflating multiple behaviors.** "If X, when Y or Z, then either A or B" → split into two behaviors.
- **Adding test blocks now.** Defer to `testflow`. Iterate prose first; insert tests when the design is locked.
