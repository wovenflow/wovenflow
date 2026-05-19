---
name: flowtune
description: Workflow self-tuning. Reviews the current session for friction signals — skipped phases, repeated manual additions, override patterns, missing-skill complaints — and proposes specific updates to CLAUDE.md's Standard workstream section so future sessions have the right defaults. Wraps claude-md-management:claude-md-improver when available; otherwise edits CLAUDE.md directly. Run periodically — wrap-up offers it when friction was observed.
---

# Flowtune (workflow self-tuning)

Workflows drift. The `Standard workstream` section in `CLAUDE.md` captures what *should* happen each cycle, but the way you actually work diverges — you skip phases that don't apply, you add steps the documented flow doesn't mention, you override "default" skill choices repeatedly. Without periodic tuning, the workflow doc becomes a museum piece nobody follows.

`flowtune` is the self-tuning loop. It reads the session for friction signals, proposes specific edits to the Standard workstream, and writes them back after user confirmation.

## When to use

- **Wrap-up offers it** when this session surfaced friction (repeated manual additions, skipped phases, override patterns)
- **Periodically** (weekly / per major milestone) regardless, to surface drift you might not have noticed
- **When onboarding** a new contributor reveals the doc doesn't match reality
- **When a "Recommended"** skill choice keeps getting overridden

Skip when the session was routine and the workflow worked as documented.

## Steps

### 1. Read the documented workflow

Open `<repo>/CLAUDE.md`. Find the section header matching `## Standard workstream` (or `## Workflow`, `## Development workflow` — whatever the project calls it). Read its current state.

If no such section exists, suggest running `wovenflow:setup` first instead — flowtune is for *tuning* an existing workflow, not authoring one from scratch.

### 2. Survey session signals

Look for friction patterns in this session:

- **Skipped phases** — were any phases bypassed? Was the bypass intentional (e.g., a docs-only change correctly skipping Phase 5 design) or a sign the phase doesn't fit?
- **Manual additions** — did you run steps that aren't in the documented flow? *("I always run `gstack:simplify` before verify, but the workflow doesn't mention it.")*
- **Override patterns** — was a "Recommended" skill choice consistently passed over for a different one?
- **Missing-skill complaints** — did anyone say "we should have a skill for X" or build something custom that filled an obvious gap?
- **Phase reordering** — did phases happen out of documented order? Was the reorder ad hoc or a real signal?
- **Verify chain** — if `verify` proposed a chain (per its run-time survey), was the user override the same in 2+ recent sessions?

Sources: `git log` for the session, the conversation transcript (where available), and the orchestrator's memory of decisions. If no signals surface, exit cleanly — the workflow is working.

### 3. Propose specific edits

For each signal, propose a concrete edit to the Standard workstream. Examples:

- *"Phase 7's verify chain consistently includes `gstack:simplify` as the first auxiliary skill. Propose adding it as a documented default in Phase 7's catalog entry."*
- *"Phase 5 (design — `wovenflow:designflow`) was skipped in 3 of last 5 sessions because changes were too small. Propose noting designflow is optional for changes under ~50 lines."*
- *"User overrode `gstack:office-hours` for Phase 2 with `superpowers:brainstorming` four times. Propose flipping the documented default."*
- *"Phase 8 (Ship) was always direct push, never PR. Propose marking `ship-direct` as the project default and demoting `ship-pr` to a 'when collaborators arrive' note."*

Show each proposed edit as a diff against the current Standard workstream — old vs new, line by line.

### 4. Confirm and apply

Use `AskUserQuestion` for each proposed edit. Options:

- **Apply** — update `CLAUDE.md`
- **Skip** — leave as-is, signal noted but not actioned
- **Modify** — user names the alternative wording

For applied edits, write back to `CLAUDE.md`:

- If [`claude-md-management:claude-md-improver`](https://github.com/anthropics/claude-plugins-official) is installed, dispatch it with the proposed edits — it knows the file conventions and merges cleanly.
- Otherwise edit `CLAUDE.md` directly using string anchors (the section header is the natural anchor).

### 5. Commit

```
git add CLAUDE.md
git commit -m "docs: tune workflow per session signals"
```

Per the project's land-path rule (some projects push docs directly to main, others require PR — check `CLAUDE.md`). For most projects, doc-only changes go straight to main.

### 6. Suggest a re-run if scope exceeds surgical edits

If the proposed edits would significantly change the workflow shape (adding/removing phases, restructuring the cycle), surgical edits aren't enough. Suggest re-running `wovenflow:setup` instead — that re-walks the wizard and writes a coherent Standard workstream from scratch. Surgical tuning is for incremental drift; re-setup is for restructuring.

## Retune involvement (`.wovenflow.yml`)

Flowtune is also the natural home for retuning the user-involvement-cadence setting (`.wovenflow.yml`). The same friction-signals pass that surfaces workflow drift also surfaces involvement-mode drift.

### Friction signals that suggest a mode change

- **"Just do it" / "stop asking me"** — the user repeatedly told the orchestrator to skip a prompt at a specific gate. Strong signal that gate should flip from `ask` to `auto` (or the whole mode should drop a level — `maximal → standard`, `standard → minimal`).
- **"Wait, ask me first"** — the orchestrator auto-decided and the user pushed back. Strong signal that gate should flip from `auto` to `ask` (or the whole mode should climb — `minimal → standard`, `standard → maximal`).
- **Override pattern at one gate** — three or more recent sessions show the user overriding the same gate's decision in the same direction. Surgical flip of that gate via `custom` mode is the right move; don't bump the whole mode for one gate.
- **Auto-decision-log mismatches** — entries in `.wovenflow-decisions.log` where the user later said the orchestrator picked wrong. If the same gate keeps mis-deciding, flip it to `ask`.

### Procedure

1. Read `.wovenflow.yml` if present (or note that it's missing and the user is on the `standard` default).
2. Read `.wovenflow-decisions.log` if present — the per-session list of auto-decided gates is the audit trail for "did we get this right?"
3. Survey the session transcript for the friction signals above.
4. Propose a specific edit:
   - "Flip `redteam_findings` to `auto` (you said 'just do it' three times after we asked at this gate)" — surgical change, switch to `custom` mode if not already there.
   - "Drop from `maximal` to `standard` (you accepted the recommendation at every scopecheck-clean prompt this session)" — broader change, replace the mode line.
5. Confirm with `AskUserQuestion`:
   - **Apply** — write the new `.wovenflow.yml`
   - **Skip** — leave as-is
   - **Modify** — user names a different change
6. If applied, show the resulting file content before writing.

Flowtune authors `.wovenflow.yml` here using the same schema setup uses; this is the only other skill (besides setup) that writes to that file. Other skills only ever *read* it.

### Skip when

- The session was routine and no involvement-related friction surfaced
- The user explicitly invoked the workflow with one-off overrides (those aren't drift — they're explicit per-session choices)
- The user's current mode is `maximal` and they accepted every prompt — that's the system working as configured, not drift

## Anti-patterns

- **Tuning every session.** Most sessions don't surface signals worth acting on. Only tune when patterns are clear (3+ occurrences usually).
- **Tuning silently.** Every edit must be confirmed. Workflow doc changes affect future sessions; no surprises.
- **Adding to the workflow without questioning.** Sometimes the right answer is *removing* a phase, not adding a skill. Stay open to subtraction.
- **Ignoring overrides.** If a "Recommended" skill is consistently overridden, that's data — not noise. The recommendation is wrong, not the user.
- **Tuning into a coherence-loss.** Make sure the post-edit Standard workstream still reads as a coherent cycle. If it starts feeling like a list of historical incidents, re-run `setup`.

## Integration

- **`wrap-up`** — when wrap-up notices friction signals during close-out, it offers to invoke flowtune as an optional step.
- **`claude-md-management:claude-md-improver`** — flowtune wraps this when installed (it knows CLAUDE.md format conventions). Without it, flowtune edits directly using string anchors.
- **`setup`** — flowtune defers to setup when proposed edits exceed surgical scope (re-walk the wizard, regenerate the workstream coherently).
- **`gstack:retro`** / **`gstack:learn`** — these capture *insights* across sessions. Flowtune actions those insights into workflow doc changes. Insight (retro/learn) → action (flowtune) is the pairing.
