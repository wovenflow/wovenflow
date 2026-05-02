---
name: setup
description: Interactive workflow setup for projects adopting wovenflow. Detects any existing workflow in CLAUDE.md, walks through each phase of the development cycle (claim → ... → close out) suggesting skills or helping craft custom ones, then writes the settled workflow back to CLAUDE.md. Run once at adoption, re-run to revise.
---

# Docflow Setup

Interactive workflow wizard. Configures a project's development cycle around wovenflow's three core skills (`designflow`, `testflow`, `subflow`) and helps the user pick or build companion skills for the surrounding phases.

## When to use

- A project is adopting wovenflow as its core methodology and needs a workflow defined
- An existing wovenflow project wants to revise its workflow (re-run setup to amend)
- A maintainer wants to formalize an ad-hoc workflow into something a new contributor can read

## Output

A "Standard workstream" section in the project's `CLAUDE.md` describing the full 9-phase cycle, with a specific skill named for each phase. Re-running this skill detects the existing section and offers to update it.

## The 9 phases (canonical shape)

| # | Phase | Job | Default in wovenflow |
|---|---|---|---|
| 1 | Claim | Pick up an issue or task; mark in-progress | `research-workflow:claim`, plain `gh issue` commands, or a project-local claim skill |
| 2 | Clarify & challenge | Pressure-test the issue's premise; brainstorm | `gstack:office-hours`, `superpowers:brainstorming` |
| 2.5 | (research only) Survey prior art | Surface real papers + prior systems before designing | `research-workflow:researchflow` |
| 3 | Design | Write the prose `.spec.md` | **`wovenflow:designflow`** |
| 4 | Test | Insert inline test blocks alongside each behavior | **`wovenflow:testflow`** |
| 5 | Build | Subagents implement; tests turn green | **`wovenflow:subflow`** |
| 6 | Verify | Cleanup + review | `gstack:simplify`, `gstack:codex review`, `gstack:design-review`, `gstack:health`, `gstack:qa`, or a project-local pre-PR skill |
| 7 | Ship | PR / merge / deploy | `gstack:ship`, `gstack:land-and-deploy`, or a project-local PR-creation skill |
| 8 | Post-ship | Update docs, capture learnings | `gstack:document-release`, `gstack:retro`, `gstack:learn` |
| 9 | Close out | Session hygiene | `research-workflow:wrap-up`, `gstack:context-save`, or a project-local wrap-up skill |

Phases 3, 4, 5 are owned by wovenflow itself. The rest are user's choice — this wizard helps make the choice.

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
3. Tell the user: "Detected an existing 9-phase workflow in `CLAUDE.md`. I'll walk through each phase with the current choice as the default — accept to keep, override to change."

If not found:
1. Tell the user: "No existing workflow found in `CLAUDE.md`. I'll walk through each phase from scratch."
2. Use wovenflow's recommended defaults

### Step 2 — Walk through each phase

For each of the 9 phases (plus optional 2.5 if the project is research-coded), run an `AskUserQuestion`:

Question text: `"For Phase N — <name> (<job>), which skill plays this role?"`

Options (always include these slots; populate from the loaded skills list):
1. **Recommended skill for this phase** (e.g., `gstack:office-hours` for Phase 2) — labeled `(Recommended)` if it's the wovenflow default
2. **Other available skills** that could fit this phase (filter by name keywords / description match)
3. **"Use existing custom skill"** — if the project already has a `.claude/skills/<phase>/SKILL.md`, offer it
4. **"Craft a new custom skill"** — walks through skill creation for this phase
5. **"None / handle this phase manually"** — explicit no-skill option (fine for tiny phases)

If the user picks an existing skill that isn't loaded:
- Detect the missing plugin
- Tell the user: "That skill ships in `<plugin>` which isn't enabled. Run `/plugin install <plugin>@<marketplace>` to install, or pick another."
- Re-prompt

For Phases 3, 4, 5: the wovenflow skills are the recommended default. The user CAN override (e.g., to use a different methodology), but that's the meaningful choice — flag it clearly: "You're overriding wovenflow's core skill for this phase. Are you sure?"

### Step 3 — Craft custom skills (when chosen)

If the user picks "craft a new custom skill" for any phase:

1. Invoke `skill-creator:skill-creator` (or its current equivalent) to scaffold a new SKILL.md
2. Save it to `<repo>/.claude/skills/<phase-skill-name>/SKILL.md`
3. Walk the user through:
   - **Name** of the skill (default: `<phase-name>` slugified)
   - **Description** (~25 words; what it does, when to invoke)
   - **Body** — what the orchestrator should do when this skill fires. The wizard offers a template specific to the phase:
     - Phase 1 (Claim) template: "Identify the task, mark it in-progress, post a marker..."
     - Phase 2 template: "Walk through the [user's chosen] forcing questions..."
     - Etc.
   - **Inputs** the skill expects
   - **Outputs** the skill produces
4. Confirm with user; commit the new SKILL.md to the project's `.claude/skills/` directory

### Step 4 — Synthesize the workflow

After all 9 phases (plus 2.5 if applicable) have a chosen skill, build the `## Standard workstream` markdown section:

- One sub-section per phase, with header `### Phase N — <name>`
- Step-numbered bullets (sequential 1-N across all phases — no number reuse)
- Mention the chosen skill prominently for each phase
- Include the standard "If a step finds blockers, back up and fix" closing paragraph
- Match the format already documented in this skill's example below

### Step 5 — Write to CLAUDE.md

If the project already had a workflow section:
1. Show a diff (old vs new) using your built-in diff display
2. Confirm with user: "Replace the existing workflow section?" (Yes / Show me again / Cancel)
3. On Yes: replace in place, preserve everything else in CLAUDE.md

If no existing section but CLAUDE.md exists:
1. Append the new workflow section at the end of CLAUDE.md
2. Confirm with user before writing

If no CLAUDE.md at all:
1. Create CLAUDE.md with just the workflow section
2. Suggest the user add other CLAUDE.md content (project description, code style, etc.) separately

### Step 6 — Commit

After the file is written:

1. Stage CLAUDE.md and any newly created `.claude/skills/<phase>/SKILL.md` files
2. Commit with a clear message: `docs: setup wovenflow workflow (X phases)` or `docs: revise wovenflow workflow`
3. Honor the project's land-path rule. Some projects allow non-product changes to push directly to main; others require feature branch + PR for everything. Use whichever the project's CLAUDE.md (or local convention) specifies.

## Reconciling existing workflows

If the project already has a workflow but it doesn't fit the 9-phase shape (e.g., a 6-phase research-workflow project, or a custom flow), reconcile gently:

1. Show the user the gap: "Your current workflow has Phases A, B, C. Docflow's recommended shape has Phases 1-9 mapped: ..."
2. Ask: "Adopt the 9-phase shape and re-map?" or "Keep your existing shape and just slot wovenflow's design/test/build into Phases X, Y, Z?"
3. Honor the user's choice; don't force the 9-phase shape if they already have something coherent

The skill is opinionated about *wovenflow's place in the cycle* (Phases 3-5) but neutral about the surrounding phase count.

## Output template (canonical 9-phase shape)

This is the canonical structure the wizard produces:

```markdown
## Standard workstream

A typical work cycle starts from <claim source — e.g., GitHub issues, tasks.md, etc.>. The phases below interleave wovenflow (Phases 3-5; the DTDD core) with companion skills for surrounding work.

### Phase 1 — Claim

1. **<chosen skill>** — <what it does in this project>

### Phase 2 — Clarify and challenge

2. **<chosen skill>** — <what it does>
3. <optional secondary skill>

### Phase 3 — Design

4. **`wovenflow:designflow`** — write the `.spec.md` with user stories + if/when/then behaviors. Save to `doc/specs/YYYY-MM-DD-<feature>.spec.md`.

### Phase 4 — Test

5. **`wovenflow:testflow`** — insert inline `test('...', () => {})` blocks alongside each behavior. The bundled extractor produces derived `.test.ts` at pretest time.

### Phase 5 — Build

6. **`wovenflow:subflow`** — dispatch implementer subagents per behavior; spec-compliance + code-quality review per behavior.

[... etc through Phase 9 ...]

If a step finds blockers, back up and fix before continuing. The workstream is a happy path, not a forced march — skip phases that don't apply, but don't skip Phase 1 (Claim), Phase 6 (Verify), or Phase 9 (Close out).
```

## Re-running the wizard

The skill is idempotent: re-run it any time to revise the workflow. The detect-existing step (Step 1) preserves prior choices as defaults so the user only changes what they want to change.

## Anti-patterns

- **Overriding wovenflow's core skills (Phases 3-5) without reason.** They're the methodology. If you're overriding all three, you're not really using wovenflow — start a different plugin.
- **Skipping Step 1 (detect existing).** Always read the existing workflow first; otherwise you'll generate redundant or conflicting CLAUDE.md content.
- **Writing custom skills inside the wovenflow plugin.** Project-local custom skills go in `<repo>/.claude/skills/`, not in the wovenflow plugin directory. Docflow skills are project-agnostic.
- **Forcing the 9-phase shape on a project that has a working 6-phase or 7-phase workflow.** Reconcile, don't bulldoze.
