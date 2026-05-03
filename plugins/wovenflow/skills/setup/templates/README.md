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
| `startup.md.tmpl` | `.claude/skills/startup/SKILL.md` | Session bootstrap: sync, instruction-diff, ADR scan, identify task |
| `wrap-up.md.tmpl` | `.claude/skills/wrap-up/SKILL.md` | Session close-out: dangling commits, status reconciliation, next-task suggestion |
| `pre-pr.md.tmpl` | `.claude/skills/pre-pr/SKILL.md` | Verification gate: tests, coverage audit, UI walkthrough, adversarial review |

## Variable reference

Common across multiple templates:

| Variable | Meaning | Example |
|---|---|---|
| `MAIN_BRANCH` | Default integration branch | `main` |
| `INSTRUCTION_FILE` | The orchestrator-reading instruction file | `CLAUDE.md` |
| `ADR_LOCATION` | Directory of architecture decision records, or empty | `doc/adr/` |
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
| `STATUS_READY` | Status value: ready | `ready` |
| `STATUS_IN_PROGRESS` | Status value: in progress | `in-progress` |
| `STATUS_IN_REVIEW` | Status value: in review | `in-review` |
| `STATUS_DONE` | Status value: done | `done` |

`pre-pr`-specific:

| Variable | Meaning | Example |
|---|---|---|
| `TEST_CMD` | Command to run the test suite | `npm test` |
| `UI_TEST_TOOL` | Tool name for UI walkthrough, or empty | `Playwright`, `bexoe-pw` |
| `COVERAGE_CMD` | Command to print coverage, or empty | `npm run coverage` |

`startup`-specific:

| Variable | Meaning | Example |
|---|---|---|
| `INFRA_LAUNCH` | Project-specific bootstrap command(s), or empty | `./scripts/dev-up.sh` |
