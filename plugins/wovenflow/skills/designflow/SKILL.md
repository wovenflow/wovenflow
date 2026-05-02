---
name: designflow
description: Design phase of DTDD (Doc-Test-Driven Development). Use when starting a new feature or bug fix. Produces a .spec.md with user stories and if/when/then behaviors — prose only, no test code yet. The testflow skill follows.
---

# Designflow (DTDD Design phase)

First of three phases in a Doc-Test-Driven Development cycle. Produce one `.spec.md` file in `doc/specs/` containing:

- **User stories** — the why
- **Behaviors** as `If` / `When` / `Then` triplets — the what

No test code at this stage. No implementation. Just prose that captures the design clearly enough that the **testflow** skill can lock it down by inserting executable tests for each behavior.

## File shape

````markdown
# <Feature> spec

## User stories

- As a <persona>, I want <goal>, so that <benefit>
- ...

## Behaviors

### B1: <short name>
**If** <precondition>
**When** <event>
**Then** <expected outcome>

### B2: <short name>
**If** ...
**When** ...
**Then** ...
````

## Where it lives

- `doc/specs/YYYY-MM-DD-<feature>.spec.md` for top-level project specs
- Or alongside the source it specs (e.g., `src/foo/foo.spec.md` or `extensions/foo/foo.spec.md`)

## When to use

- Starting a feature or bug fix, after the issue is claimed and any clarify/challenge work is done, before any code.
- Captures design output durably without implementation detail.

## Rules

- **No code blocks at this stage.** The next skill (`testflow`) inserts them.
- **One If/When/Then per behavior.** If you can't capture it that way, the behavior is too big — split it.
- **Behaviors are independent.** If B2 depends on B1's outcome, encode that in B2's "If" precondition explicitly.
- **User stories describe what the user wants and why** — not how the system implements it.

## Handoff to testflow

Once the prose is locked, invoke `testflow` to insert `test('...', () => {})` blocks alongside each behavior. The same `.spec.md` file is appended to; both phases produce one artifact.

## Anti-patterns

- **Implementation in user stories.** "The system queries the cache and returns..." → describe the behavior, not the algorithm.
- **Conflating multiple behaviors.** "If X, when Y or Z, then either A or B" → split into two behaviors.
- **Adding test blocks now.** Defer to `testflow`. Iterate prose first; insert tests when the design is locked.
