---
name: designflow
description: Design phase of DTDD (Doc-Test-Driven Development). Use when starting a new feature or bug fix. Produces a .spec.md with user stories and if/when/then behaviors — prose only, no test code yet. The testflow skill follows.
---

# Designflow (DTDD Design phase)

First of three phases in a Doc-Test-Driven Development cycle. Produce one `.spec.md` file in `doc/specs/` containing:

- **User stories** — the why
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

## Handoff to testflow

Once the prose is locked, invoke `testflow` to insert `test('...', () => {})` blocks alongside each behavior. The same `.spec.md` file is appended to; both phases produce one artifact.

## Anti-patterns

- **Implementation in user stories.** "The system queries the cache and returns..." → describe the behavior, not the algorithm.
- **Conflating multiple behaviors.** "If X, when Y or Z, then either A or B" → split into two behaviors.
- **Adding test blocks now.** Defer to `testflow`. Iterate prose first; insert tests when the design is locked.
