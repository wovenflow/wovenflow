# Wovenflow repo — orchestrator notes

## Repo layout

This repo contains two distinct artifacts that happen to live together:

- **The plugin** — everything under `plugins/wovenflow/`, plus `.claude-plugin/marketplace.json` and the README sections that describe the plugin to users. This is what gets distributed via `/plugin install wovenflow@wovenflow`.
- **The DTDD prompting-style benchmark** — everything under `bench/`, `doc/specs/2026-05-10-dtdd-bench.spec.md`, and `doc/research/dtdd-bench.md`. This is research infrastructure for evaluating the methodology. It is NOT shipped to plugin users.

## Version-bump rule

**Only bump `package.json` and `.claude-plugin/marketplace.json` versions when the change touches the plugin surface.**

Plugin surface = anything users would see after `/plugin install`:

- `plugins/wovenflow/skills/**`
- `plugins/wovenflow/**` other than dev-only files
- `.claude-plugin/marketplace.json` plugin description / metadata
- `README.md` sections that document the plugin's behavior

NOT plugin surface — do not bump version for changes to:

- `bench/**` (the benchmark harness)
- `doc/specs/**`, `doc/research/**` (research artifacts)
- `tests/**` (wovenflow self-tests; these test plugin behavior but bumping for test-only changes adds noise)
- `CLAUDE.md`, `LICENSE`, repo-root README sections that aren't plugin docs
- `package.json` script changes that don't affect plugin runtime
- `.gitignore`

If a single commit changes both plugin and non-plugin files, bump for the plugin part. If a commit is purely non-plugin, leave the version alone.

The version reflects what plugin users see. It is not a session counter.

## Test commands

- `npm test` — wovenflow's own self-tests (the extractor, run-suite, run-behavior). 5 tests.
- `npm test --prefix bench` — bench harness self-tests extracted from `doc/specs/2026-05-10-dtdd-bench.spec.md`. 18 tests.

Both should be green before any commit.

## Subagent dispatch

Per the user's global `~/.claude/CLAUDE.md`, application code is written by subagents, not the orchestrator. That includes both plugin code (`plugins/wovenflow/`) and bench code (`bench/`). Direct orchestrator edits are reserved for meta-config: this `CLAUDE.md`, skill `SKILL.md` files, hooks, settings.json, and similar surface that governs how the orchestrator and subagents behave.

Documentation artifacts (`doc/research/**`, `doc/specs/**`, `bench/PROTOCOL.md`, `bench/styles/AUTHORING.md`, `bench/topology/AUTHORING.md`, `bench/grading-rubric.md`, task `intent.md` and `provenance.md` files) are orchestrator-authored — they're documentation, not application code.

## Bench prerequisites still open before Stage-2 run

Tracked in `bench/PROTOCOL.md` §9. As of last checkpoint:

- ✅ Style cards (`bench/styles/*.md`)
- ✅ Multi-agent topology helper (`bench/topology/multi.md`)
- ✅ 10 tasks under `bench/tasks/`
- ⏭ Grading rubric at `bench/grading-rubric.md`
- ⏭ Inter-rater kappa pre-check on coverage predicates
- ⏭ Stage-2 commitment tag on the locked protocol commit

When all are checked, the bench can be run for real (it will spend model budget).
