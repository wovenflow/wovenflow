---
name: setup
description: Interactive workflow setup for projects adopting wovenflow. Detects any existing workflow in CLAUDE.md, walks through each phase of the development cycle (claim → ... → close out) suggesting skills or helping craft custom ones, then writes the settled workflow back to CLAUDE.md. Run once at adoption, re-run to revise.
---

# Wovenflow Setup

Interactive workflow wizard. Configures a project's development cycle around wovenflow's three core skills (`designflow`, `testflow`, `subflow`) and helps the user pick or build companion skills for the surrounding phases.

## When to use

- A project is adopting wovenflow as its core methodology and needs a workflow defined
- An existing wovenflow project wants to revise its workflow (re-run setup to amend)
- A maintainer wants to formalize an ad-hoc workflow into something a new contributor can read

## Output

A "Standard workstream" section in the project's `CLAUDE.md` describing the full 10-phase cycle, with a specific skill named for each phase. Re-running this skill detects the existing section and offers to update it.

## The 10 phases (canonical shape)

| # | Phase | Job | Default in wovenflow |
|---|---|---|---|
| 1 | Claim | Pick up an issue or task; mark in-progress | varies — see catalog |
| 2 | Clarify & challenge | Pressure-test the issue's premise; brainstorm | `gstack:office-hours` |
| 3 | Survey outside context | Surface real references — papers, prior systems, design patterns, library options, conventions — before designing | `wovenflow:researchflow` |
| 4 | Design | Write the prose `.spec.md` | **`wovenflow:designflow`** |
| 5 | Test | Insert inline test blocks alongside each behavior | **`wovenflow:testflow`** |
| 6 | Build | Subagents implement; tests turn green | **`wovenflow:subflow`** |
| 7 | Verify | Cleanup + review | varies — see catalog |
| 8 | Ship | PR / merge / deploy | varies — see catalog |
| 9 | Post-ship | Update docs, capture learnings | `gstack:document-release` |
| 10 | Close out | Session hygiene | varies — see catalog |

Phase 3 is wovenflow's `researchflow`. Phases 4, 5, 6 are wovenflow's DTDD core (`designflow` / `testflow` / `subflow`). The rest are user's choice — this wizard helps make the choice.

## Skill catalog (per phase, with canonical URLs)

Each option below is what the wizard surfaces in `AskUserQuestion` menus. URLs link to the canonical source for installation or documentation.

### How to install

Plugins use the standard Claude Code install pattern:

```
/plugin install <name>@<marketplace>
```

For marketplaces beyond the default `claude-plugins-official`, add the marketplace first:

```
/plugin marketplace add <url-or-path>
```

Marketplaces referenced in this catalog:

| Marketplace | How to add |
|---|---|
| `claude-plugins-official` | default — no `marketplace add` needed |
| `wovenflow` | `/plugin marketplace add https://github.com/wovenflow/wovenflow` |
| `gstack` | install via [garrytan/gstack](https://github.com/garrytan/gstack) (npm-based installer) or via the [Ahacad/gstack](https://github.com/Ahacad/gstack) Claude Code plugin wrapper |
| Community plugins (great_cto, test-writer-fixer, etc.) | discover via [awesome-claude-plugins](https://github.com/ComposioHQ/awesome-claude-plugins); each entry's repo README has its own marketplace-add and install commands |
| Local / project-private marketplaces | `/plugin marketplace add /path/to/local/marketplace` (directory source) |

For options below that don't link to a clean repo URL, the awesome-list discovery page acts as the canonical-install path: find the plugin entry, follow its README's install steps.

### Session bootstrap *(per-session, runs before Phase 1)*

**Job:** Sync the worktree with the integration branch, surface instruction-file changes, refresh architecture context, identify the task to work on. Runs at the start of every session — not part of the 10-phase feature cycle.

- [**`wovenflow:setup` startup template (Recommended)**](https://github.com/wovenflow/wovenflow) — wizard materializes `startup.md.tmpl` into `<repo>/.claude/skills/startup/SKILL.md`. Parameterized for main branch, instruction file, architecture-doc filename, and project-specific bootstrap commands.
- [**`gstack:context-restore`**](https://github.com/garrytan/gstack) — pairs with `gstack:context-save` from Phase 10; restores prior session's thinking
- [**Browse Session Lifecycle category**](https://buildwithclaude.com/) — other startup-flavored skills
- **None** — fine for projects where each session can start cold without an explicit bootstrap

### Phase 1 — Claim

**Job:** Pick up an issue or task; mark in-progress.

- [**`wovenflow:setup` claim template (Recommended)**](https://github.com/wovenflow/wovenflow) — wizard materializes `claim-github.md.tmpl` (GitHub Issues) or `claim-tasks.md.tmpl` (`tasks.md` tracker, ships a starter table with id/status/priority/owner/notes) into `<repo>/.claude/skills/claim/SKILL.md`. Includes architecture refresh, label or table management, and plan-comment posting.
- [**`atlassian@claude-plugins-official`**](https://claude.com/plugins/atlassian) — Jira / Confluence / Compass integration via Atlassian's official MCP server
- [**`linear@claude-plugins-official`**](https://github.com/anthropics/claude-plugins-official) — Linear issue tracker integration (search the official directory for the Linear plugin entry)
- [**`asana@claude-plugins-official`**](https://github.com/anthropics/claude-plugins-official) — Asana task integration
- [**`notion@claude-plugins-official`**](https://github.com/anthropics/claude-plugins-official) — Notion docs/databases integration
- [**`gh issue` CLI**](https://cli.github.com/manual/gh_issue) — plain GitHub CLI, no plugin needed
- [**TodoWrite**](https://docs.claude.com/en/docs/claude-code) — Claude Code built-in task surface for projects without an external tracker
- [**Browse claudemarketplaces.com**](https://claudemarketplaces.com/) or [**buildwithclaude.com**](https://buildwithclaude.com/) — discover other claim / triage skills
- **"Craft custom"** via [`skill-creator`](https://github.com/anthropics/claude-plugins-official) — fallback if none of the above (and the wovenflow templates) fit

### Phase 2 — Clarify and challenge

**Job:** Pressure-test the issue's premise; brainstorm before locking design.

- [**`gstack:office-hours`**](https://github.com/garrytan/gstack) — six forcing questions (demand reality, status quo, narrowest wedge, observation, future-fit). Default for most projects.
- [**`superpowers:brainstorming`**](https://github.com/obra/superpowers) — exploratory requirements brainstorming for fuzzier problems
- [**`compound-engineering:ce-brainstorm`**](https://github.com/EveryInc/compound-engineering-plugin) — interactive requirements gathering, part of the Compound Engineering plan-first methodology
- [**`compound-engineering:ce-ideate`**](https://github.com/EveryInc/compound-engineering-plugin) — generate and evaluate big-picture ideas before committing to a direction
- [**`great_cto`**](https://github.com/ComposioHQ/awesome-claude-plugins) — 7 SDLC subagents (tech-lead, senior-dev, qa-engineer, security-officer, devops, l3-support, project-auditor); useful when scope warrants architectural critique alongside ideation. Discover via the awesome-list.
- [**`gstack:design-shotgun`**](https://github.com/garrytan/gstack) — UI-coded ideation: generate multiple design variants and compare
- [**Browse marketplaces**](https://claudemarketplaces.com/) — other ideation / discovery skills
- **"Craft custom"** via [`skill-creator`](https://github.com/anthropics/claude-plugins-official)

### Phase 3 — Survey outside context

**Job:** Surface 3-5 concrete external references — academic papers, prior systems, established design patterns, library options, RFCs, ecosystem conventions — before designing. Applies to UI work (existing design patterns), architecture decisions (prior systems), library choice (concrete options), API design (RFCs / industry conventions), academic research (papers + prior experimental systems), and competitive / market work (vendor capabilities, segment sizing).

- [**`wovenflow:researchflow`** + researcher profiles](https://github.com/wovenflow/wovenflow) `(Recommended)` — pre-design outside-context surface. Composes one or more researcher profiles per invocation; each profile adds field-specific steps and integrity gates on top of the base flow. Produces `doc/research/<feature>.md`.
- **"Craft custom researcher"** — projects with domain-specific discovery patterns (security research with CVE databases, data-science with benchmark datasets, hardware with datasheet review). Materializes `setup/templates/researcher.md.tmpl` into `<repo>/.claude/skills/researchflow/researchers/<name>.md`.

**Profile sub-selection (multi-select):** when `wovenflow:researchflow` is picked, run a follow-up `AskUserQuestion` (`multiSelect: true`) to choose the project's default profile set. The chosen profiles are written into the `Standard workstream` section's Phase 3 line as `wovenflow:researchflow [profile, profile, ...]`. Surface the long tail using the same tiered + free-text fallback as Step 2:

| Slot | Content |
|---|---|
| 1 | **`academic`** — hypothesis framing, citation integrity (verify DOIs, no hallucinated cites), replication planning, conflicts and contributions, data/code availability. For papers, preprints, technical reports, work whose output is a claim about the world. |
| 2 | **`competitive-landscape`** — competitor set, source diversity, capability matrix, recency check, bias disclosure. For build-vs-buy, positioning, differentiation, feature-parity work. |
| 3 | **Use existing project-local researcher** if `<repo>/.claude/skills/researchflow/researchers/` has any, else **Craft custom researcher** |
| 4 | **Show full catalog of profiles** — agent prints every profile in `plugins/wovenflow/skills/researchflow/researchers/` plus any `<repo>/.claude/skills/researchflow/researchers/<name>.md`; user replies in free text with a comma-separated set |

Multi-select is fine — projects often need 2-3 profiles (e.g., academic + competitive for a research-product paper). If the user picks none, `researchflow` runs in generalist mode (the base steps without specialized rigor).

Skip the whole phase when the work is mechanical, the domain is well-understood, or external references would be noise.

### Phase 4 — Design (Wovenflow core)

**Job:** Write the prose `.spec.md` with user stories + if/when/then behaviors.

- [**`wovenflow:designflow`**](https://github.com/wovenflow/wovenflow) — **default**. The canonical DTDD design phase. Includes a built-in red-team check (`wovenflow:redteam`) as the last step before locking the spec.

Override only if you're explicitly using a different methodology. If you override all of Phases 3-5, you're not using wovenflow — pick a different plugin.

### Phase 5 — Test (Wovenflow core)

**Job:** Insert inline test blocks alongside each behavior; bundled extractor produces derived test files at pre-test time.

- [**`wovenflow:testflow`**](https://github.com/wovenflow/wovenflow) — **default**. After wiring the extractor into the project's pre-test hook (npm `pretest`, pytest `conftest.py`, Makefile target, etc.), follow `testflow`'s "Verify the wiring fires" recipe once: deliberately modify a spec test, run the pipeline, confirm the change reaches the test runner. Catches typos, missing exec bits, wrong fence labels, and output-dir-not-in-discovery-path before they hide regressions in real work.

### Phase 6 — Build (Wovenflow core)

**Job:** Dispatch implementer subagents per behavior; spec-compliance + code-quality review.

- [**`wovenflow:subflow`**](https://github.com/wovenflow/wovenflow) — **default**. DTDD-native dispatcher; subagents read `.spec.md` by file path.
- [**`superpowers:subagent-driven-development`**](https://github.com/obra/superpowers) — fallback for non-DTDD work (no `.spec.md`)
- [**`compound-engineering:ce-work`**](https://github.com/EveryInc/compound-engineering-plugin) — fallback for projects following Compound Engineering's plan-first methodology instead of DTDD; executes plans with task tracking

### Phase 7 — Verify

**Job:** Cleanup + review before shipping.

- [**`gstack:simplify`**](https://github.com/garrytan/gstack) — code reuse / quality / efficiency pass
- [**`gstack:codex review`**](https://github.com/garrytan/gstack) — independent diff review via OpenAI Codex CLI
- [**`gstack:design-review`**](https://github.com/garrytan/gstack) — UI polish / visual audit (skip for non-UI changes)
- [**`gstack:health`**](https://github.com/garrytan/gstack) — repo health / quality scorecard
- [**`gstack:qa`**](https://github.com/garrytan/gstack) — exploratory QA against the running app
- [**`compound-engineering:ce-code-review`**](https://github.com/EveryInc/compound-engineering-plugin) — multi-agent pre-merge code review pass
- [**`compound-engineering:ce-debug`**](https://github.com/EveryInc/compound-engineering-plugin) — systematic root-cause investigation when verification surfaces a failure
- [**`test-writer-fixer`**](https://github.com/ComposioHQ/awesome-claude-plugins) — generate / repair unit tests for legacy code (community plugin; discover via awesome-list)
- [**Browse Code Quality category**](https://buildwithclaude.com/) — discover debugger, security audit, performance, and other review-flavored skills
- [**`wovenflow:setup` verify template (Recommended)**](https://github.com/wovenflow/wovenflow) — wizard materializes `verify.md.tmpl` into `<repo>/.claude/skills/verify/SKILL.md`. Parameterized for test command, UI testing tool, and coverage command. Independent of how the project ships — pairs with `ship-pr` or `ship-direct`. Step 1 surveys the change and proposes a verification chain at run time (lists every installed verify-flavored skill — gstack:simplify, codex review, design-review, qa, health, benchmark, cso, etc. — marks each applies/skip per the diff, recommends a subset, and confirms with the user before dispatching). Then runs the gate (tests, coverage audit, criterion walkthrough, adversarial review, user re-test).
- [**`wovenflow:redteam`**](https://github.com/wovenflow/wovenflow) — optional decision-quality gate inside the verify chain. Runs against the proposed verify chain itself (or against the change as a whole) with the question "list the top three reasons shipping this as-is is not the right call." Useful for architecturally significant changes; skip for mechanical work.
- **Off-template verification skill** — for projects whose verification gate doesn't fit the wovenflow template, craft via [`skill-creator`](https://github.com/anthropics/claude-plugins-official).

### Phase 8 — Ship

**Job:** Land the verified work — via PR review or direct push.

- [**`wovenflow:setup` ship-pr template (Recommended for PR-based projects)**](https://github.com/wovenflow/wovenflow) — wizard materializes `ship-pr.md.tmpl` into `<repo>/.claude/skills/ship/SKILL.md`. Pushes the branch, opens a PR with title + body derived from the issue/task, marks the task in-review, hands off to CI and reviewers.
- [**`wovenflow:setup` ship-direct template (Recommended for solo / non-GitHub projects)**](https://github.com/wovenflow/wovenflow) — wizard materializes `ship-direct.md.tmpl` into `<repo>/.claude/skills/ship/SKILL.md`. Confirms scope with the user (the human-review step PRs would force), pushes to `{{MAIN_BRANCH}}`, marks the task done. For solo work, research projects, internal tooling, anywhere PR ceremony is overhead-not-value.
- [**`gstack:ship`**](https://github.com/garrytan/gstack) — gstack's canonical ship flow (test, review diff, version bump, commit, push, PR)
- [**`gstack:land-and-deploy`**](https://github.com/garrytan/gstack) — picks up after `/ship` to merge + verify deploy
- [**Browse Git & Version Control category**](https://buildwithclaude.com/) — `commit` (smart messages), `create-pr`, and other PR-automation skills
- **Off-template ship skill** — for projects with mandatory review hooks (e.g., a Bexoe-style `/pr` wrapper) or unusual deploy gates, craft via [`skill-creator`](https://github.com/anthropics/claude-plugins-official).

### Phase 9 — Post-ship

**Job:** Update docs, capture learnings.

- [**`gstack:document-release`**](https://github.com/garrytan/gstack) — sync docs with what shipped
- [**`gstack:retro`**](https://github.com/garrytan/gstack) — periodic retro across recent shipped work
- [**`gstack:learn`**](https://github.com/garrytan/gstack) — capture a single insight worth keeping
- [**`compound-engineering:ce-compound`**](https://github.com/EveryInc/compound-engineering-plugin) — document learnings for reuse so each unit of work makes the next easier (parallels `gstack:learn` but with a structured re-use focus)
- [**`compound-engineering:ce-product-pulse`**](https://github.com/EveryInc/compound-engineering-plugin) — time-windowed usage and performance reports against what just shipped
- [**`claude-md-management:claude-md-improver`**](https://github.com/anthropics/claude-plugins-official) — audit + update `CLAUDE.md` to reflect the latest project state
- [**Browse Documentation category**](https://buildwithclaude.com/) — auto-generators, changelog tooling, etc.

### Phase 10 — Close out

**Job:** Session hygiene; persist state for the next session.

- [**`gstack:context-save`**](https://github.com/garrytan/gstack) — save thinking + state for the next session
- [**`wovenflow:setup` wrap-up template (Recommended for project-local wrap-up)**](https://github.com/wovenflow/wovenflow) — wizard materializes `wrap-up.md.tmpl` into `<repo>/.claude/skills/wrap-up/SKILL.md`. Audits dangling commits, reconciles task status (GitHub or `tasks.md`), saves a session checkpoint, and surfaces 2-3 candidate next tasks.
- **Off-template wrap-up skill** — for projects whose close-out doesn't fit the wovenflow template, craft via [`skill-creator`](https://github.com/anthropics/claude-plugins-official).

## Wovenflow-shipped scaffold templates

For the universal patterns of the cycle, wovenflow ships fill-in templates that materialize into a project's `.claude/skills/<name>/SKILL.md`. These are the canonical "Craft custom" path for these phases — robust and parameterized, not bare-bones starting points.

| Template | Materializes to | When to use |
|---|---|---|
| `claim-github.md.tmpl` | `<repo>/.claude/skills/claim/SKILL.md` | Project tracks work in GitHub Issues |
| `claim-tasks.md.tmpl` | `<repo>/.claude/skills/claim/SKILL.md` | Project tracks work in a `tasks.md` file |
| `tasks.md.tmpl` | `<repo>/tasks.md` | Starter task tracker (only when `claim-tasks` is picked and the file doesn't already exist) |
| `tasks.py.tmpl` | `<repo>/scripts/tasks.py` | Reference Python helper for `tasks.md` projects (only when `claim-tasks` is picked). Skills invoke `tasks.py set <id> --status …` instead of editing markdown directly — atomic, idempotent, no prose-parsing. |
| `startup.md.tmpl` | `<repo>/.claude/skills/startup/SKILL.md` | Session bootstrap (pre-Phase 1) — sync, instruction diff, architecture refresh, identify task |
| `verify.md.tmpl` | `<repo>/.claude/skills/verify/SKILL.md` | Verification gate (Phase 7) — tests, coverage audit, UI/manual walkthrough, adversarial review |
| `ship-pr.md.tmpl` | `<repo>/.claude/skills/ship/SKILL.md` | Ship via pull request (Phase 8) — push, `gh pr create`, mark task in-review |
| `ship-direct.md.tmpl` | `<repo>/.claude/skills/ship/SKILL.md` | Ship without PR (Phase 8) — confirm scope with user, push to `{{MAIN_BRANCH}}`, mark task done. For solo / non-GitHub projects. |
| `wrap-up.md.tmpl` | `<repo>/.claude/skills/wrap-up/SKILL.md` | Session close-out (Phase 10) — dangling-commit audit, status reconciliation, next-task claim |
| `researcher.md.tmpl` | `<repo>/.claude/skills/researchflow/researchers/<name>.md` | Custom researcher profile (Phase 3) — field-specific steps and integrity gates layered on top of base researchflow. Wizard fills name, field, when-to-apply, mindset, steps, output schema, anti-patterns. |

All templates live at `plugins/wovenflow/skills/setup/templates/`. Variable reference and template syntax (substitution + conditional blocks) are documented in `templates/README.md`.

The wizard's Step 3 (Craft custom skills) uses these templates when applicable; for phases without a wovenflow template, it falls back to `skill-creator:skill-creator`.

## Cross-cutting concerns

These aren't phase-bound — they're project-level decisions the wizard asks about *after* the phase walk-through.

- **MCP server building** — projects exposing internal tools via MCP. Discover via [awesome-claude-plugins](https://github.com/ComposioHQ/awesome-claude-plugins) (`mcp-builder` and similar).
- **Hooks configuration** — pre-commit, session-start, pre-push automation. Configure via [`update-config` (Claude Code settings)](https://docs.claude.com/en/docs/claude-code) and `.claude/hooks/`.
- **Experimental Agent Teams** — set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `~/.claude/settings.json` (or `.claude/settings.json`) under `env`. Exposes `TeamCreate` / `TeamDelete` / `SendMessage` tools, which give `wovenflow:subflow`'s parallel dispatch richer coordination primitives — direct messaging between orchestrator and implementer subagents on `NEEDS_CONTEXT`, instead of round-tripping through the orchestrator. Subflow works without it; recommended when behaviors frequently surface clarifying questions mid-flight. Use `update-config` to set, or edit `settings.json` directly. The wizard should ask about this when `wovenflow:subflow` is selected for Phase 6.
- **Memory management** — `~/.claude/projects/<slug>/memory/` feedback memories that shape orchestrator behavior across sessions. Pair with [`claude-md-management:revise-claude-md`](https://github.com/anthropics/claude-plugins-official) for keeping `CLAUDE.md` current.
- **Skill authoring** — for crafting new project-local skills (or contributing back to a marketplace), use [`skill-creator:skill-creator`](https://github.com/anthropics/claude-plugins-official) or [`superpowers:writing-skills`](https://github.com/obra/superpowers).
- **Backend architecture** — for greenfield architectural decisions, browse [Backend & Architecture category](https://buildwithclaude.com/) on the marketplace.
- **Frontend / design system** — for projects with significant UI surface, [`gstack:design-consultation`](https://github.com/garrytan/gstack) creates a `DESIGN.md` source-of-truth; community plugins like `theme-factory` and `artifacts-builder` help with implementation.

## Alternative cycles

The 10 phases above are the **feature cycle**. Most mature projects have other distinct cycles. The wizard asks at the end: *"Configure additional cycles?"*

### Bug fix cycle

Same shape as the feature cycle, but tighter. Some projects add a triage step (Phase 0): classify, prioritize, decide hotfix vs. regular feature work.

- Triage: project-local skill or [`gstack:investigate`](https://github.com/garrytan/gstack) for root-cause analysis before patching
- Phases 1-9 follow the feature cycle, often with a smaller `.spec.md` (one or two behaviors)

### Hotfix / incident response cycle

Abbreviated for production emergencies. Skip Phase 2 (no time to brainstorm), often skip Phase 5 (write the test alongside the fix, not before — pragmatic violation of TDD when the ETA matters), pair with a postmortem cycle.

- [`gstack:investigate`](https://github.com/garrytan/gstack) for root cause
- [`gstack:careful`](https://github.com/garrytan/gstack) for high-stakes edits
- After ship, run a postmortem (see below)

### Refactor cycle

Same shape as the feature cycle — but the `.spec.md` describes the *current* behavior we're preserving, and Phase 6's job is to make the implementation cleaner without breaking the spec. Tests pass before AND after.

- All wovenflow Phases 3-5 apply unchanged
- Phase 7 emphasizes regression testing

### Architectural change cycle

For changes that affect the project's load-bearing architecture (data flow, layering, key abstractions, baseline dependencies). Sits within Phase 2 or Phase 4 of the feature cycle but produces an *update to the architecture doc* rather than a new file.

- Update `<repo>/ARCHITECTURE.md` (or the relevant per-folder doc) to reflect the new state
- Capture the rationale in the commit message — git history carries the *why*; the doc carries current state
- After the architecture doc reflects the new state, the feature cycle proceeds normally with the updated doc as ratified context

Convention: matklad-style [`ARCHITECTURE.md`](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html) at root — short, hand-written, intentionally tedious. Names files/modules by name (not links — they go stale). Optional per-folder `ARCHITECTURE.md` for components with their own internal conventions.

For projects that prefer plural append-only ADR files (`doc/adr/NNNN-*.md`, [adr.github.io](https://adr.github.io/) format), that pattern is still viable — common at cloud scale where the "decision history" matters as much as current state. The wovenflow templates default to single-doc, but you can adapt them.

### Postmortem cycle

Triggered by incidents (paired with hotfix cycle). Distinct from `/retro`.

- [`gstack:retro`](https://github.com/garrytan/gstack) is for periodic team retrospectives across recent work
- Postmortems are incident-triggered: timeline, root cause, what went well, what didn't, action items
- Often crafted as a project-local skill via [`skill-creator`](https://github.com/anthropics/claude-plugins-official)

## How the wizard runs (orchestrator behavior)

### Step 1 — Detect existing workflow

Before asking anything, read the project's `CLAUDE.md` (search the worktree root, typically `<repo>/CLAUDE.md`). Look for a section header matching any of:

- `## Standard workstream`
- `## Workflow`
- `## Development workflow`
- `## Standard workflow`

If found:
1. Parse the section: identify each phase header (`### Phase N — <name>`) and the skill named at the top of that phase
2. Note the current choices as the *defaults* for the wizard
3. Tell the user: "Detected an existing workflow in `CLAUDE.md`. I'll walk through each phase with the current choice as the default — accept to keep, override to change."

If not found:
1. Tell the user: "No existing workflow found in `CLAUDE.md`. I'll walk through each phase from scratch."
2. Use wovenflow's recommended defaults (see Skill catalog above)

### Step 1.5 — Pick wizard mode

Before walking phases, ask once:

`AskUserQuestion`:
- Question: "How interactive should the wizard be?"
- Options:
  1. **Interactive — ask me at each phase** `(Recommended)` — full per-phase menu with structured options
  2. **Auto — let the model pick per phase** — the agent picks the best fit for each phase from the catalog, using project signals (language, GitHub vs tasks.md, UI vs no-UI, existing tooling) and defaulting to the wovenflow recommendation; logs each pick as it goes; no per-phase prompts

Persist the chosen mode in the wizard's working state for the rest of the run. In Auto mode, log each phase's choice as the wizard proceeds: `Phase N — <name>: picked <skill> (auto)`. Show all picks together at the end and confirm with one yes/no before writing CLAUDE.md.

### Step 2 — Walk through each phase

For each of the 10 phases (plus optional 2.5 if research-coded):

**If wizard mode is Auto:** the agent picks from the per-phase catalog in this SKILL.md without prompting. Default to the wovenflow recommendation; deviate only when project signals make a different option clearly better (e.g., `claim-tasks` template over `claim-github` when there's no GitHub remote; `ship-direct` template over `ship-pr` for a solo repo with no PR history). Log the pick and continue. Skip the AskUserQuestion below entirely.

**If wizard mode is Interactive:** run an `AskUserQuestion`.

Question text: `"For Phase N — <name> (<job>), which skill plays this role?"`

The AskUserQuestion 4-option cap shapes the menu. Use the **tiered + free-text fallback** pattern:

| Slot | Content |
|---|---|
| 1 | **Recommended** — the wovenflow default for this phase from the catalog, labeled `(Recommended)` |
| 2 | **Strongest alternative** — second-best catalog option for this phase (the agent picks based on project signals: language, existing tooling, GitHub vs tasks.md, UI vs no-UI, etc.) |
| 3 | **Use existing custom skill** if `<repo>/.claude/skills/<phase>/SKILL.md` exists; otherwise **Craft a new custom skill** for this phase |
| 4 | **Show full catalog** — when picked, the agent prints the full per-phase catalog from this SKILL.md as plain text (one line per option: skill name, marketplace, one-line summary, install URL) and the user replies in free text with their pick: a skill name, "craft custom", "browse marketplace", or "none" |

**Surfacing rule:** every option in slots 1-2 (and the printed catalog from slot 4) is sourced from the **per-phase catalog in this SKILL.md** — never filtered by the currently-loaded skill list. Surface uninstalled options too; if the user picks one that isn't installed, run install-on-pick below.

**Install-on-pick:** if the user picks a skill that isn't loaded:
1. Look up its plugin and marketplace from the catalog entry
2. Tell the user: `"That skill ships in <plugin> from <marketplace>, not enabled. Install now? (Y / pick another)"`
3. On `Y`: run `/plugin marketplace add <url>` (if the marketplace isn't already added) then `/plugin install <plugin>@<marketplace>`. Then continue to Step 3 if the chosen path is "craft custom", or proceed to the next phase otherwise.

For Phases 4, 5, 6 (the DTDD core: design / test / build): the wovenflow skills are the default in both modes. In Interactive mode the user CAN override — flag it: "You're overriding wovenflow's core skill for this phase. Are you sure?" In Auto mode, never override these three.

### Step 3 — Craft custom skills (when chosen)

If the user picks "craft a new custom skill" for any phase, prefer a wovenflow-shipped template. Fall back to `skill-creator` only when no template applies.

#### 3a. Check for a wovenflow template

Templates live at `plugins/wovenflow/skills/setup/templates/`. The mappings:

| Phase | Template |
|---|---|
| Session bootstrap (pre-Phase 1) | `startup.md.tmpl` |
| Phase 1 (Claim) | `claim-github.md.tmpl` (GitHub Issues) or `claim-tasks.md.tmpl` (`tasks.md`) |
| Phase 3 (Survey outside context, custom researcher) | `researcher.md.tmpl` |
| Phase 7 (Verify) | `verify.md.tmpl` |
| Phase 8 (Ship) | `ship-pr.md.tmpl` (PR-based) or `ship-direct.md.tmpl` (solo / no-PR) |
| Phase 10 (Close out) | `wrap-up.md.tmpl` |

If a template matches, follow 3b. Otherwise skip to 3c.

#### 3b. Materialize a wovenflow template

1. Ask the user for the variables the template needs (full reference: `plugins/wovenflow/skills/setup/templates/README.md`). Group sensibly into `AskUserQuestion` calls (1-4 questions per call). Common variables:
   - **Project basics:** main branch (`main` / `master` / `trunk`), instruction file (`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`), architecture-doc filename (default `ARCHITECTURE.md`, empty to disable). Per-folder `ARCHITECTURE.md` files are optional — agents read them on-demand when working in those folders.
   - **For `claim`:** task source (`github` or `tasks`); for GitHub — agent label (optional), status labels (`ready`/`in-progress`/`in-review`); for `tasks.md` — file path, status values, priority values
   - **For `verify`:** test command (e.g. `npm test`, `pytest`, `cargo test`), UI testing tool (e.g. `Playwright`, or empty for non-UI), coverage command (or empty)
   - **For `ship`:** ship mode (`pr` or `direct`); pick `ship-pr` for projects shipping through PR review, `ship-direct` for solo / non-GitHub / no-PR projects
   - **For `startup`:** project-specific bootstrap command (or empty)
   - **For `researcher`:** profile slug (`security`, `clinical`, `data-science`, etc.), display field name, when-to-apply paragraph, when-to-skip line, 2-4 mindset principles, specialized step list, output-schema sections, anti-patterns. Step IDs follow the convention `<letter><number>` where the letter is the profile slug's first letter (e.g., `S1` / `S2` / `S3` for security)

2. Substitute placeholders:
   - `{{VAR}}` → the user's answer
   - `{{IF VAR}}...{{ENDIF}}` → keep block if `VAR` is non-empty, drop otherwise
   - Renumber `### N. Title` step headers sequentially after IF blocks resolve so step numbering stays clean

3. Show the materialized content to the user and confirm before writing.

4. Write to `<repo>/.claude/skills/<name>/SKILL.md`.

5. **Special case for `claim-tasks`:** if `<repo>/<TASKS_FILE>` doesn't exist, also materialize `tasks.md.tmpl` to that path with the same variables. The project starts with a usable task tracker. Always materialize `tasks.py.tmpl` to `<repo>/<TASKS_HELPER>` (default: `scripts/tasks.py`) and `chmod +x` it — `claim-tasks`, `wrap-up`, and `startup` all invoke this helper. Default `TASKS_HELPER=scripts/tasks.py`; ask the user only if they want it elsewhere.

#### 3c. Fall back to skill-creator (no template available)

For phases outside the wovenflow template set (Phase 2 clarify-and-challenge, custom phases, etc.):

1. Invoke [`skill-creator:skill-creator`](https://github.com/anthropics/claude-plugins-official) (or `superpowers:writing-skills`) to scaffold a fresh SKILL.md
2. Walk the user through:
   - **Name** (default: `<phase-name>` slugified)
   - **Description** (~25 words; what it does, when to invoke)
   - **Body** — what the orchestrator should do when this skill fires
   - **Inputs** and **outputs**
3. Save to `<repo>/.claude/skills/<phase-skill-name>/SKILL.md`; confirm with user.

### Step 4 — Walk through cross-cutting concerns

After the 10 phases, ask about each cross-cutting concern (see "Cross-cutting concerns" above). For each:

- "Does this project use MCP? Y/N → if yes, suggest mcp-builder or similar"
- "Configure hooks? Y/N → use `update-config`"
- "Seed memory feedback files? Y/N → walk through `claude-md-management`"
- Etc.

These don't affect the workflow doc — they're tracked separately (in `~/.claude/settings.json`, hooks files, memory dir).

### Step 5 — Ask about alternative cycles

Ask: *"Does this project have other cycles besides feature work? (bug fix, hotfix, refactor, architectural change, postmortem)"* If yes, walk through each chosen cycle and configure its skills the same way (or note it as a documented variation in CLAUDE.md).

### Step 6 — Synthesize the workflow

After all phases (and optional alternative cycles) have chosen skills, build the `## Standard workstream` markdown section:

- One sub-section per phase, with header `### Phase N — <name>`
- Step-numbered bullets (sequential 1-N across all phases — no number reuse)
- Mention the chosen skill prominently for each phase
- Include the standard "If a step finds blockers, back up and fix" closing paragraph
- Match the format in the "Output template" below

### Step 7 — Write to CLAUDE.md

If the project already had a workflow section:
1. Show a diff (old vs new)
2. Confirm with user: "Replace the existing workflow section?" (Yes / Show me again / Cancel)
3. On Yes: replace in place, preserve everything else in CLAUDE.md

If no existing section but CLAUDE.md exists:
1. Append the new workflow section at the end of CLAUDE.md
2. Confirm with user before writing

If no CLAUDE.md at all:
1. Create CLAUDE.md with just the workflow section
2. Suggest the user add other CLAUDE.md content (project description, code style, etc.) separately

### Step 8 — Commit

After the file is written:

1. Stage CLAUDE.md and any newly created `.claude/skills/<phase>/SKILL.md` files
2. Commit with a clear message: `docs: setup wovenflow workflow (X phases)` or `docs: revise wovenflow workflow`
3. Honor the project's land-path rule. Some projects allow non-product changes to push directly to main; others require feature branch + PR for everything. Use whichever the project's CLAUDE.md (or local convention) specifies.

## Reconciling existing workflows

If the project already has a workflow but it doesn't fit the 10-phase shape (e.g., a 6-phase research project, or a custom flow), reconcile gently:

1. Show the user the gap: "Your current workflow has Phases A, B, C. Wovenflow's recommended shape has Phases 1-9 mapped: ..."
2. Ask: "Adopt the 10-phase shape and re-map?" or "Keep your existing shape and just slot wovenflow's design/test/build into Phases X, Y, Z?"
3. Honor the user's choice; don't force the 10-phase shape if they already have something coherent

The skill is opinionated about *wovenflow's place in the cycle* (Phases 3-5) but neutral about the surrounding phase count.

## Output template (canonical 10-phase shape)

This is the canonical structure the wizard produces:

```markdown
## Standard workstream

A typical work cycle starts from <claim source — e.g., GitHub issues, tasks.md, etc.>. The phases below interleave wovenflow (Phase 3 outside-context survey; Phases 4-6 the DTDD core) with companion skills for surrounding work.

### Phase 1 — Claim

1. **<chosen skill>** — <what it does in this project>

### Phase 2 — Clarify and challenge

2. **<chosen skill>** — <what it does>
3. <optional secondary skill>

### Phase 3 — Survey outside context

4. **`wovenflow:researchflow`** — surface 3-5 concrete external references (papers, prior systems, design patterns, library options, conventions) into `doc/research/<feature>.md` before drafting the spec. Skip when work is mechanical or external context is noise.

### Phase 4 — Design

4. **`wovenflow:designflow`** — write the `.spec.md` with user stories + if/when/then behaviors. Save to `doc/specs/YYYY-MM-DD-<feature>.spec.md`.

### Phase 5 — Test

5. **`wovenflow:testflow`** — insert inline `test('...', () => {})` blocks alongside each behavior. The bundled extractor produces derived `.test.ts` at pretest time.

### Phase 6 — Build

6. **`wovenflow:subflow`** — dispatch implementer subagents per behavior; spec-compliance + code-quality review per behavior.

[... etc through Phase 10 ...]

If a step finds blockers, back up and fix before continuing. The workstream is a happy path, not a forced march — skip phases that don't apply, but don't skip Phase 1 (Claim), Phase 7 (Verify), or Phase 10 (Close out).
```

## Re-running the wizard

The skill is idempotent: re-run it any time to revise the workflow. The detect-existing step (Step 1) preserves prior choices as defaults so the user only changes what they want to change.

## Anti-patterns

- **Overriding wovenflow's core skills (Phases 3-5) without reason.** They're the methodology. If you're overriding all three, you're not really using wovenflow — start a different plugin.
- **Skipping Step 1 (detect existing).** Always read the existing workflow first; otherwise you'll generate redundant or conflicting CLAUDE.md content.
- **Writing custom skills inside the wovenflow plugin.** Project-local custom skills go in `<repo>/.claude/skills/`, not in the wovenflow plugin directory. Wovenflow skills are project-agnostic.
- **Forcing the 10-phase shape on a project that has a working 6-phase or 7-phase workflow.** Reconcile, don't bulldoze.
- **Filtering the menu by currently-loaded skills.** The per-phase catalog is the source of truth — surface every option, regardless of what's installed. When the user picks an uninstalled one, run the install-on-pick flow in Step 2.
- **Listing skills not in the catalog.** Every option must resolve to a verified entry in the per-phase catalog above. New options go in the catalog first; the menu pulls from there.

## Marketplace discovery

If the catalog above doesn't have what you need, browse:

- [**claudemarketplaces.com**](https://claudemarketplaces.com/) — voted/commented community directory
- [**buildwithclaude.com**](https://buildwithclaude.com/) — 500+ plugins/skills/hooks indexed by category
- [**`anthropics/claude-plugins-official`**](https://github.com/anthropics/claude-plugins-official) — Anthropic-managed catalog
- [**`ComposioHQ/awesome-claude-plugins`**](https://github.com/ComposioHQ/awesome-claude-plugins) — curated awesome-list
- [**`travisvn/awesome-claude-skills`**](https://github.com/travisvn/awesome-claude-skills) — broader skills catalog (cross-IDE)
- [**`garrytan/gstack`**](https://github.com/garrytan/gstack) — Garry Tan's full Claude Code stack (28 skills)
- [**`obra/superpowers`**](https://github.com/obra/superpowers) — TDD, debugging, planning, collaboration discipline (upstream of `superpowers@claude-plugins-official`)
