# Code Quality Reviewer Prompt Template (wovenflow:subflow)

Dispatch this reviewer **only after** spec-compliance review approves. Spec compliance comes first; there's no point reviewing the cleanliness of code that doesn't satisfy the contract.

This template wraps `superpowers:requesting-code-review` — use that skill's framework for the actual review. This template only fills in the inputs and adds the DTDD-specific quality concerns.

```
Task tool (general-purpose):
  Use the framework at: superpowers:requesting-code-review

  WHAT_WAS_IMPLEMENTED: |
    Implementation of behavior <BEHAVIOR_ID> from <SPEC_FILE_ABSOLUTE_PATH>.
    Read that file's behavior <BEHAVIOR_ID> for the contract; read the diff
    for what was implemented.

  PLAN_OR_REQUIREMENTS: |
    The contract is behavior <BEHAVIOR_ID> in <SPEC_FILE_ABSOLUTE_PATH> —
    its If/When/Then triplet plus the inline test block. Open the file
    and locate the H3 section by id.

  BASE_SHA: <BASE_SHA>
  HEAD_SHA: <HEAD_SHA>
  DESCRIPTION: <one-line summary of what was implemented>

  WORKING_DIR: <REPO_WORKING_DIR>

  # Named agents mode inputs (fill in when spawning as a persistent named reviewer)
  SUBAGENT_NAME: quality-reviewer    # spawned via Agent({ name: "quality-reviewer", ... })
  ORCHESTRATOR_NAME: <ORCHESTRATOR_NAME>  # typically "orchestrator"
```

## Named agents mode (only if the above inputs are filled in)

If `SUBAGENT_NAME` is filled in, you are a **persistent named reviewer** addressable by `SendMessage`. You stay alive across all behaviors in this subflow run; the orchestrator sends you a fresh review pointer each time spec-compliance review approves. Differences:

- **The orchestrator's `SendMessage` carries the pointer.** Each message tells you the worktree path, the implementer's `BASE_SHA..HEAD_SHA`, and a one-line summary. Read those, then review in that worktree.
- **Reply with the verdict via `SendMessage`, not return message:**
  - APPROVED: `SendMessage({ to: "<ORCHESTRATOR_NAME>", summary: "B<N> quality APPROVED", message: "APPROVED" })`
  - Issues: `SendMessage({ to: "<ORCHESTRATOR_NAME>", summary: "B<N> quality issues", message: "Critical: ...; Important: ...; Minor: ..." })`. The orchestrator forwards the issue list to `impl-B<N>`; you do not message the implementer directly unless instructed.
- **Build pattern memory across behaviors.** Repeated smells across B1, B3, B5 are worth surfacing as a project-level concern, not just a per-behavior issue.
- **After reporting, idle.** Don't poll; the next `SendMessage` wakes you.
- **Don't originate `shutdown` messages** — the orchestrator manages teardown.

## In addition to standard code-quality concerns

The reviewer should check these DTDD-specific concerns:

- **One responsibility per file.** Did the implementer add a clear, well-defined interface, or did they smear logic across files? New files should have one clear job.
- **Project patterns.** The DTDD spec deliberately doesn't prescribe file structure — placement was the implementer's judgment. Verify the placement matches existing project patterns; flag if a new file feels misplaced.
- **No drift from canonical sources.** The implementer should read the `.spec.md` for the contract; they should not have copied test code into other files. If they did, that's drift.
- **File size growth.** New files reasonably sized? Existing files significantly grown? Flag size issues this change contributed (don't relitigate pre-existing size).
- **No spec modification.** The implementer must not have touched the `.spec.md`. Verify by checking the diff; if `.spec.md` is in it, that's a critical issue (spec compliance should already have caught it, but verify).
- **No shortcuts or placeholders.** Spec-compliance is the first line on this; you are the second. Re-scan the diff for `TODO` / `FIXME` / `XXX` / `HACK` on the contract path, `throw "not implemented"` calls reachable from the contract, stub returns hardcoded to the test fixture, commented-out "real impl goes here," empty bodies that pass only because tests don't assert side effects, and mocks/fakes in production code. Each is a Critical-severity issue. There is no follow-up phase to fill these in.

## Reviewer returns

Per `superpowers:requesting-code-review`'s usual output: Strengths, Issues (Critical / Important / Minor), Assessment.

## Severity rules for DTDD context

- **Critical** — must fix before completion. Examples: spec was modified; production code drifts from spec; behavior's contract isn't actually met (spec compliance should have caught this, but the code-quality reviewer is the second line); `TODO` / `FIXME` / `not implemented` placeholders or test-fixture-hardcoded stubs on the contract path.
- **Important** — must fix before completion. Examples: file responsibility is unclear; new code doesn't match project patterns; the behavior's implementation creates a regression risk.
- **Minor** — can be deferred to a follow-up issue. Examples: variable naming; comment quality; refactoring opportunity in adjacent code.

The orchestrator decides whether minor issues block completion. Default: minor issues are filed as follow-up, not blockers.
