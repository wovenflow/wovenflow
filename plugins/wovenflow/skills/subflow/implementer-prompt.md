# Implementer Subagent Prompt Template (wovenflow:subflow)

Use this template when dispatching an implementer subagent for one DTDD behavior. The implementer reads the canonical `.spec.md` directly — paste-text is **not** part of this template.

```
Task tool (general-purpose):
  description: "Implement <behavior-id> from <spec-filename>"
  prompt: |
    You are implementing one behavior from a Doc-Test-Driven Development (DTDD) spec.

    ## Read the spec

    Open this file:

      <SPEC_FILE_ABSOLUTE_PATH>

    Locate behavior **<BEHAVIOR_ID>** (e.g., B1). Read:

    - Its If / When / Then triplet (the contract)
    - Its inline `typescript` test block (the assertions you must satisfy)
    - The user stories at the top of the file (the why)
    - The other behaviors in the file (related context — they may share interfaces or invariants)

    The spec file is the canonical source of truth. Do **not** rely on any paste-text in this prompt; read the file.

    ## Your job

    Write production code in this project's source tree so the test for **<BEHAVIOR_ID>** passes when `npm test` runs (the pretest hook extracts the spec into runnable tests automatically — you don't run the extractor manually).

    Constraints:

    - **Do not modify the .spec.md.** The orchestrator authored that contract; you implement against it.
    - **Do not modify other behaviors' tests.** Don't break adjacent contracts.
    - **No file structure is prescribed.** The spec deliberately doesn't dictate where code lives. Read neighboring source files in the project; match their conventions; place new code where it fits.

    ## TDD discipline

    The test for **<BEHAVIOR_ID>** is already failing — the orchestrator wrote it; pretest extraction makes it runnable; you are at the RED moment. Your job is GREEN: write the minimal production code that makes the test pass.

    Iron Law (inherited from `superpowers:test-driven-development`): no production code without a failing test first. The failing test is already there. **Do not** write additional tests yourself — the spec is the orchestrator's.

    Refactor only after green. Don't over-engineer; YAGNI applies.

    ## Working directory

      <REPO_WORKING_DIR>

    ## Before you begin — ask clarifying questions

    If anything is unclear, ask. Examples:

    - The behavior's contract has ambiguity (e.g., what does "X is valid" mean precisely?)
    - The test seems to expect something the prose doesn't describe
    - You can't tell where new code should live in the codebase

    Don't guess. The orchestrator can answer.

    ## When you're done

    Verify, then commit, then report.

    1. Run `npm test`. The test for `<BEHAVIOR_ID>` must pass. Other tests must still pass (no regressions).
    2. Self-review: did you add code unrelated to `<BEHAVIOR_ID>`'s contract? Remove it.
    3. Commit. Reference the spec and behavior in the commit message:

       `<concise summary>: implement <BEHAVIOR_ID> per <spec-filename>`

    4. Report your status (canonical values below) plus:
       - One paragraph summarizing what you implemented (which files, which functions)
       - Test pass count
       - Any concerns

    ## Status reporting (canonical)

    Report exactly one of:

    - **DONE** — implemented, all spec tests pass, no concerns.
    - **DONE_WITH_CONCERNS** — implemented and tests pass, but flag worth raising (file getting large, pattern smells, an ambiguity you papered over with a sensible default). Include the concerns in your report.
    - **NEEDS_CONTEXT** — can't proceed without more information. Ask a specific question. Do not guess.
    - **BLOCKED** — fundamental issue (the spec contradicts itself; the contract requires architectural change beyond this behavior's scope; another behavior's implementation conflicts with this one). Do not work around it; describe the issue clearly so the orchestrator can decide.

    Never report DONE if tests fail. Never report DONE if you modified the .spec.md.
```
