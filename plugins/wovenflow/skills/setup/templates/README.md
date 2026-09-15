# Wovenflow scaffold templates

These are starting points that `setup` materializes into a project's `.claude/skills/<name>/SKILL.md` after the wizard collects the user's answers. They are not activatable skills themselves.

## Template syntax

- `{{VAR}}` — replaced with the user's answer for that variable. Unset vars become empty string.
- `{{IF VAR}}...{{ENDIF}}` — kept if `VAR` is non-empty, dropped otherwise. **Nesting is supported** — resolve from the innermost IF outward, then do the `{{VAR}}` pass last. The `web-dashboard/serve.mjs.tmpl` template uses nested IFs (e.g., `PANEL_COMMITS` wrapping a `COMMITS_BRANCH` filter), so the wizard's substitution helper must walk inside-out, not naive non-greedy regex.
- Numbered steps (`### 1. Title`, `### 2. Title`) are renumbered sequentially after IF blocks are resolved.

The `setup` wizard performs the substitution before writing the file. Reference implementation (used in `tests/setup-web-dashboard-template.spec.md`):

```js
function substitute(tmpl, vars) {
  let out = tmpl;
  const innermostIf = /\{\{IF (\w+)\}\}((?:(?!\{\{IF )[\s\S])*?)\{\{ENDIF\}\}/;
  while (innermostIf.test(out)) {
    out = out.replace(innermostIf, (_, name, body) => (vars[name] ? body : ''));
  }
  return out.replace(/\{\{(\w+)\}\}/g, (_, name) => (name in vars ? String(vars[name]) : ''));
}
```

## Templates

| File | Materializes to | Purpose |
|---|---|---|
| `claim-github.md.tmpl` | `.claude/skills/claim/SKILL.md` | Pick up a GitHub issue (Phase 1 of the workstream) |
| `claim-tasks.md.tmpl` | `.claude/skills/claim/SKILL.md` | Pick up a task from a `tasks.md` file (Phase 1, alternative source) |
| `tasks.md.tmpl` | `<repo>/tasks.md` | Starter task tracker — **an index**: one row per task with status, owner, priority and a one-line hook pointing into `{{TASKS_DIR}}` (only when the user picks the `tasks.md` claim variant) |
| `tasks-doc.md.tmpl` | `<repo>/{{TASKS_DIR}}/<id>-<slug>.md` | The long form behind one task row — what it is and why, what constrains it, a working log appended oldest-first with `tasks note`, and links to what it produced. Created for **every** task by `tasks add`, because a task needs somewhere to write before there is anything to write |
| `records.py.tmpl` | `<repo>/scripts/records.py` | **One interface to every record** — findings, prior work, claims, sessions and `tasks.md`. `status` / `lint` / `show` / `add` / `tasks …`. Skills call `records.py add finding …` instead of hand-editing, and `records.py lint` exits non-zero on an unsourced entry so it can gate the test suite. Records disabled at setup (empty `*_FILE`) drop out of it automatically. |
| `tasks.py.tmpl` | `<repo>/scripts/tasks.py` | Compatibility shim forwarding to `records.py tasks`, so the existing `tasks.py set <id> --status …` call sites in `claim-tasks`, `wrap-up` and `startup` keep working unchanged. Idempotent — re-applying the same value is a no-op. |
| `startup.md.tmpl` | `.claude/skills/startup/SKILL.md` | Session bootstrap: sync, instruction-diff, architecture refresh, identify task |
| `wrap-up.md.tmpl` | `.claude/skills/wrap-up/SKILL.md` | Session close-out: dangling commits, status reconciliation, next-task suggestion |
| `verify.md.tmpl` | `.claude/skills/verify/SKILL.md` | Phase 7 verification gate: tests, coverage audit, UI/manual walkthrough, adversarial review |
| `ship-pr.md.tmpl` | `.claude/skills/ship-pr/SKILL.md` | Phase 8 ship via pull request: push branch, `gh pr create`, mark task in-review |
| `ship-direct.md.tmpl` | `.claude/skills/ship-direct/SKILL.md` | Phase 8 ship without PR: confirm scope with user, push to `{{MAIN_BRANCH}}`, mark task done. For solo / non-GitHub workflows. |
| `prior-work.md.tmpl` | `<repo>/PRIOR-WORK.md` | Capped one-line index of external prior work, written by `researchflow` step 10 and read at every startup. Points into `PRIOR_WORK_DIR`, where the reading itself lives. |
| `claims.md.tmpl` | `<repo>/{{CLAIMS_FILE}}` | Capped claim index — novelty and evidence in separate columns, an evidence cell citing a commit and a novelty cell citing what was searched |
| `claims-doc.md.tmpl` | `<repo>/{{CLAIMS_DIR}}/<id>-<slug>.md` | The argument behind one claim row, including *what would sink it* |
| `researcher.md.tmpl` | `.claude/skills/researchflow/researchers/<NAME>.md` | Phase 3 custom researcher profile: field-specific steps and integrity gates layered on top of the base researchflow. |
| `web-dashboard/serve.mjs.tmpl` + `index.html.tmpl` + `panels/*.mjs.tmpl` + `README.md` | `<repo>/web/serve.mjs` and `<repo>/web/index.html` | Cross-cutting concern (Step 4.X): tailored project dashboard. Wizard asks which panels to include; only those `{{IF PANEL_*}}` blocks survive substitution. See `web-dashboard/README.md` for the full panel catalog and per-panel variables. |

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
| `TASKS_HELPER` | Invocation for the `tasks.py` shim | `scripts/tasks.py` |
| `TASKS_DIR` | Directory holding one doc per task — the long form behind each row | `docs/tasks` |
| `RECORDS_HELPER` | Invocation for the `records.py` helper — the one interface to every record. Keep it in the same directory as `TASKS_HELPER`; the shim looks there first | `scripts/records.py` |
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

`web-dashboard`-specific:

| Variable | Meaning | Example |
|---|---|---|
| `PROJECT_NAME` | Used in `<title>`, headings, umbrella URL slug | `wovenflow` |
| `FINDINGS_FILE` | Capped findings index, read by `startup` every session | `FINDINGS.md` |
| `SESSIONS_FILE` | Append-only session ledger, never read at startup | `SESSIONS.md` |
| `FINDINGS_CAP` | Line cap on `FINDINGS_FILE`, enforced by `records.py lint` rather than by eye. A number caps it; **empty disables the cap entirely**, and the `over-cap` rule, the budget column in `records.py status` and the cap prose in `startup`/`wrap-up` all strip out together. Default `60`, and the default is deliberate: an uncapped index reliably grows past the point of being loadable, after which nothing reads it. The counter-argument, from a real project that switched it off: a hard cap makes a still-true entry compete for space against a newer one, which prunes exactly the records that stop a wrong turn being retaken. Neither answer is free | `60` |
| `PRIOR_WORK_FILE` | Capped index of external prior work; empty to disable the mechanism | `PRIOR-WORK.md` |
| `PRIOR_WORK_DIR` | Folder the index points into, where research documents live | `doc/research` |
| `PRIOR_WORK_CAP` | Line cap on `PRIOR_WORK_FILE`; **empty disables it**, same as `FINDINGS_CAP`. Over the cap, **group** sources into one topic doc rather than deleting — an entry per paper turns the index into a bibliography, and a bibliography does not get loaded. Grouping is the right move with or without a cap; the cap is only what forces it | `40` |
| `CLAIMS_CAP` | Line cap on `CLAIMS_FILE`; **empty disables it**. Over the cap, move a row's reasoning into `CLAIMS_DIR` and leave the row pointing at it | `50` |
| `FORGE_URL` | Repo web base; commits render as `{{FORGE_URL}}/commit/<sha>`, branches as `{{FORGE_URL}}/src/branch/<name>` | `https://github.com/org/repo` |
| `INTERVAL_S` | Seconds between data.json writes / browser polls | `5` |
| `PORT` | Standalone HTTP port (`--serve`) | `8082` |
| `UMBRELLA_PATH` | Absolute path to umbrella web root; empty for standalone-only | `/home/will/web` |
| `PANELS_LIST` | Comma-separated panel names — appears in the file header for traceability | `tests,git,commits,specs` |
| `PANEL_TESTS` / `PANEL_SPECS` / `PANEL_COMMITS` / `PANEL_SUBAGENTS` / `PANEL_GIT` / `PANEL_TASKS` / `PANEL_COMMAND` / `PANEL_PROCESSES` / `PANEL_BENCH` / `PANEL_TIMESERIES` / `PANEL_BAR` / `PANEL_SPARKLINE` | Per-panel `{{IF …}}` flags. Set non-empty (e.g. `"1"`) to include that panel; leave empty to strip it. | `1` |
| `TESTS_CMD` / `TESTS_INTERVAL_S` | Test-runner command + cache TTL (avoid re-running every tick) | `npm test` / `60` |
| `SPECS_DIR` | Where spec.md files live | `doc/specs` |
| `COMMITS_LIMIT` / `COMMITS_BRANCH` | Number of commits / optional branch filter | `10` / `` |
| `TASKS_FILE` / `TASKS_LABELS` | tasks.md path / GitHub Issue label filter | `tasks.md` / `agent` |
| `COMMAND_CMD` / `COMMAND_LABEL` / `COMMAND_INTERVAL_S` / `COMMAND_REGEX` | Custom shell-command panel | `npm run health` / `Health` / `30` / `Score:\s*(\S+)` |
| `PROCESSES_PATTERNS` | Comma-separated substrings to match in `ps -eo args` | `vite,postgres` |
| `TIMESERIES_SOURCE` / `TIMESERIES_X` / `TIMESERIES_Y` | JSONL or CSV file + key/column names for the line chart | `metrics.jsonl` / `commit` / `pass_rate` |
| `BAR_SOURCE` / `BAR_X_LABEL` / `BAR_Y_LABEL` | JSON file + axis labels | `coverage.json` / `module` / `coverage %` |
| `SPARKLINE_SOURCE` / `SPARKLINE_Y` / `SPARKLINE_LABEL` | JSONL source + key + display label | `tokens.jsonl` / `tokens` / `Tokens/session` |
