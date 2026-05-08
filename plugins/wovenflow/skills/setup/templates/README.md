# Wovenflow scaffold templates

These are starting points that `setup` materializes into a project's `.claude/skills/<name>/SKILL.md` after the wizard collects the user's answers. They are not activatable skills themselves.

## Template syntax

- `{{VAR}}` — replaced with the user's answer for that variable.
- `{{IF VAR}}...{{ENDIF}}` — kept if `VAR` is non-empty, dropped otherwise.
- Numbered steps (`### 1. Title`, `### 2. Title`) are renumbered sequentially after IF blocks are resolved.

The `setup` wizard performs the substitution before writing the file.

## Templates

| File | Materializes to | Purpose |
|---|---|---|
| `claim-github.md.tmpl` | `.claude/skills/claim/SKILL.md` | Pick up a GitHub issue (Phase 1 of the workstream) |
| `claim-tasks.md.tmpl` | `.claude/skills/claim/SKILL.md` | Pick up a task from a `tasks.md` file (Phase 1, alternative source) |
| `tasks.md.tmpl` | `<repo>/tasks.md` | Starter task tracker file (only when the user picks the `tasks.md` claim variant) |
| `tasks.py.tmpl` | `<repo>/scripts/tasks.py` | Reference Python helper that parses and updates `tasks.md` programmatically. Skills (`claim-tasks`, `wrap-up`, `startup`) invoke `tasks.py set <id> --status …` instead of editing markdown by hand. Idempotent — re-applying the same value is a no-op. |
| `startup.md.tmpl` | `.claude/skills/startup/SKILL.md` | Session bootstrap: sync, instruction-diff, architecture refresh, identify task |
| `wrap-up.md.tmpl` | `.claude/skills/wrap-up/SKILL.md` | Session close-out: dangling commits, status reconciliation, next-task suggestion |
| `verify.md.tmpl` | `.claude/skills/verify/SKILL.md` | Phase 7 verification gate: tests, coverage audit, UI/manual walkthrough, adversarial review |
| `ship-pr.md.tmpl` | `.claude/skills/ship/SKILL.md` | Phase 8 ship via pull request: push branch, `gh pr create`, mark task in-review |
| `ship-direct.md.tmpl` | `.claude/skills/ship/SKILL.md` | Phase 8 ship without PR: confirm scope with user, push to `{{MAIN_BRANCH}}`, mark task done. For solo / non-GitHub workflows. |
| `researcher.md.tmpl` | `.claude/skills/researchflow/researchers/<NAME>.md` | Phase 3 custom researcher profile: field-specific steps and integrity gates layered on top of the base researchflow. |

## Variable reference

Common across multiple templates:

| Variable | Meaning | Example |
|---|---|---|
| `MAIN_BRANCH` | Default integration branch | `main` |
| `INSTRUCTION_FILE` | The orchestrator-reading instruction file | `CLAUDE.md` |
| `ARCH_DOC` | Filename for architecture docs (single root + optional per-folder); empty to disable | `ARCHITECTURE.md` |
| `TASK_SOURCE` | `github` or `tasks` | `github` |

GitHub-specific:

| Variable | Meaning | Example |
|---|---|---|
| `AGENT_LABEL` | Per-agent label (or empty) | `bex0` |
| `LABEL_READY` | Status: ready to claim | `ready` |
| `LABEL_IN_PROGRESS` | Status: actively worked | `in-progress` |
| `LABEL_IN_REVIEW` | Status: PR open | `in-review` |

`tasks.md`-specific:

| Variable | Meaning | Example |
|---|---|---|
| `TASKS_FILE` | Path to the task tracker file | `tasks.md` |
| `TASKS_HELPER` | Invocation for the `tasks.py` helper | `scripts/tasks.py` |
| `STATUS_READY` | Status value: ready | `ready` |
| `STATUS_IN_PROGRESS` | Status value: in progress | `in-progress` |
| `STATUS_IN_REVIEW` | Status value: in review | `in-review` |
| `STATUS_DONE` | Status value: done | `done` |

`verify`-specific:

| Variable | Meaning | Example |
|---|---|---|
| `TEST_CMD` | Command to run the test suite | `npm test`, `pytest`, `cargo test` |
| `UI_TEST_TOOL` | Tool name for UI walkthrough, or empty | `Playwright`, `bexoe-pw` |
| `COVERAGE_CMD` | Command to print coverage, or empty | `npm run coverage`, `pytest --cov` |

`startup`-specific:

| Variable | Meaning | Example |
|---|---|---|
| `INFRA_LAUNCH` | Project-specific bootstrap command(s), or empty | `./scripts/dev-up.sh` |

`researcher`-specific:

| Variable | Meaning | Example |
|---|---|---|
| `NAME` | Profile slug; becomes filename | `security`, `clinical`, `data-science` |
| `FIELD` | Display name for the field | `Security research`, `Clinical research` |
| `DESCRIPTION_TAIL` | Frontmatter description sentence after the standard prefix | `Adds threat-model and CVE-database checks on top of the base researchflow.` |
| `INTRO_PARAGRAPH` | One-paragraph intro: why this profile exists, what it adds | — |
| `WHEN_TO_APPLY` | Bullet list of triggers for picking this profile | — |
| `WHEN_TO_SKIP` | One-line "skip when …" | — |
| `MINDSET_INTRO` | One-sentence framing for the mindset list | — |
| `MINDSET_PRINCIPLES` | 2-4 numbered mindset rules | — |
| `STEPS` | Specialized step list with IDs (e.g., `S1`, `S2`, …) | — |
| `OUTPUT_SCHEMA_SECTIONS` | Bulleted list of `## Section` headers each step contributes | — |
| `ANTI_PATTERNS` | Bulleted list of failure modes to avoid in this field | — |
