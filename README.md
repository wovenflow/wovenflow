# wovenflow

BDD + TDD + Doctest (literate programming) = DTDD

This project is intended as a suggested methodology and not just a workflow tool. Please consider the methodology and tooling separately. One or both may work for you.

## Why use wovenflow

You need a contract with your agents.

Single line prompts do not inspire agents to write clean code. Writing long prompts is time consuming. Precision is hard when you are trying to move fast and get things done. Language is not naturally explicit. If you are not examining every line of code, how do you know what it is doing? 

In the industry, we have found solutions to these kinds of problems when we work with humans. With humans, we often spec + build and then test + document. I can trust my engineers to do this well because they do not have wildly jagged intelligence. You have probably found normal workflow does not work well with your BFF agent. It will fail even harder with a swarm of agents. What I am proposing here is a repurposing of old tools that used to work well but were hard to sustain in practice with humans: BDD + TDD + DocTest. 

We need a contract with our datacenter of geniuses that is readable, extendable, and executable. I am suggesting a document that captures behaviors explicity in markdown and then encodes them in test even more explicitly. This md becomes contract, spec, test, and documentation. It will remain fresh because the tests will fail when the product no longer supports the behavior described directly above it. Each behavior is nuclear which makes it handy for splitting among multiple agents. Both the English and code capture the intent. Most importantly, I find it easier to scan these documents to check that what I wanted is going to be accomplished. I provide some general direction at the start and then I just have to verify that the spec encodes what I wanted. 

If you have felt like your project did not work well with other plugin style workflow helpers, I am hoping you might have fewer issues with wovenflow because most of the phases in the workflow are not hardcoded. The /setup is built just to walk you through creating your own workflow that still embodies the spirit of wovenflow. It will hopefully help you surface skills from other plugins that might be a good fit for what you are working on and help you author a skill that fits your style. In my personal time I work on both product style projets and pretraining research experiments. Those are very different workflows but both fit within this tooling. 

## What it is

A Claude Code plugin for **Doc-Test-Driven Development (DTDD)** — TDD where intent and tests are woven into a single `.spec.md` file per feature. The subagents implment one feature at a time acording to the spec and test to ensure intent is preserved and token churn is minimized during definition and execution. There is a setup skill that will help you generate a full workflow that matches your project's needs and includes wovenflow at the core. 

`wovenflow` is the plugin (the tool); `DTDD` is the methodology (the practice). 

The methodology in one paragraph:

> A feature's design and its tests live in the same markdown file (`<feature>.spec.md`). Prose describes the behaviors as `If` / `When` / `Then` triplets; an inline `typescript` test block sits alongside each behavior. A bundled extractor reads the markdown at pretest time and produces derived `.test.ts` files for whatever runner the project already uses (`node:test`, Mocha, Vitest, Jest). The orchestrator (a human or LLM) authors the spec; subagents implement the production code that turns the failing tests green.

## Skills

Eight skills cover the cycle:

| Skill | Phase | Job |
|---|---|---|
| `wovenflow:researchflow` | Phase 3 — Survey outside context | Bridge the agent's training-cutoff gap to current reality. Surface real papers, prior systems, design patterns, current library versions, current API shapes, RFCs, and ecosystem conventions before drafting the spec. Composes one or more researcher profiles (academic, competitive-landscape, custom). |
| `wovenflow:designflow` | Phase 4 — Design | Write a `.spec.md` with user stories + if/when/then behaviors — prose only, no code. Last step invokes `wovenflow:redteam` against the spec before locking. |
| `wovenflow:testflow` | Phase 5 — Test | Insert inline test blocks alongside each behavior. Bundled `extract.mjs` produces derived `.test.ts` files at pretest time. Runner-agnostic — works with `node:test`, Mocha, Vitest, Jest. |
| `wovenflow:subflow` | Phase 6 — Build | Dispatch implementer subagents per behavior, with spec-compliance and code-quality review. Three modes: Team mode (when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set — persistent named teammates, mid-flight messaging, shared task list), Parallel mode (one-shot dispatch into per-behavior worktrees), Sequential mode (rare fallback). Final step invokes `wovenflow:scopecheck` to enforce no over-implementation. |
| `wovenflow:scopecheck` | Subflow final step + cross-phase audit | Coverage-based over-implementation guardrail. Runs the project's coverage command, intersects with the feature-branch diff; any committed line not exercised by a test is by-construction not required by any behavior. Verdicts: CLEAN / VIOLATIONS / AMBIGUOUS / BLOCKED. On VIOLATIONS, proposes per-region: remove (scope creep) or formalize (draft a new behavior + test). |
| `wovenflow:redteam` | Cross-phase decision gate | Adversarial-question runner — "list the top three reasons this is not the right call." Invocable before any commit-shaped artifact gets locked: pre-spec save, pre-verify approval, pre-merge, pre-direction-lock. Forces specific, artifact-rooted, steel-manned objections; banned generic vibes (over-engineering, scope creep) without anchoring evidence. |
| `wovenflow:setup` | Workflow wizard | Interactive walk-through to define a project's full 10-phase development cycle (claim → … → close-out), suggesting existing skills or materializing wovenflow's bundled scaffold templates (`claim`, `startup`, `verify`, `ship-pr`, `ship-direct`, `wrap-up`, `researcher`, `tasks.py`) for the universal patterns. Writes the settled workflow to the project's `CLAUDE.md`. |
| `wovenflow:flowtune` | Workflow self-tuning | Reviews the session for friction signals — skipped phases, repeated manual additions, override patterns, missing-skill complaints — and proposes specific updates to `CLAUDE.md`'s Standard workstream so future sessions have the right defaults. Wrap-up offers it when friction was observed. |

## The full cycle

`wovenflow:setup` configures a 10-phase development cycle. Phases 3-6 are wovenflow's core (`researchflow`, `designflow`, `testflow`, `subflow`); the surrounding phases pair with companion skills the wizard surfaces from a per-phase catalog or scaffolds from bundled templates.

| # | Phase | Job | Default | Alternatives the setup wizard surfaces |
|---|---|---|---|---|
| 0 | Session bootstrap | Sync worktree, surface instruction-file changes, refresh architecture context, identify task | `wovenflow:setup` startup template | Browse Session Lifecycle category on buildwithclaude.com; none (cold-start projects). `gstack:context-restore` *supplements* the startup template (loads prior session's thinking after the sync) when paired with `gstack:context-save` in Phase 10 — it is not a substitute. |
| 1 | Claim | Pick up an issue or task; mark in-progress | `wovenflow:setup` claim template (GitHub Issues or `tasks.md` + bundled `tasks.py` helper) | `atlassian@claude-plugins-official`; `linear@claude-plugins-official`; `asana@claude-plugins-official`; `notion@claude-plugins-official`; `gh issue` CLI; Claude Code's TodoWrite; craft custom via `skill-creator` |
| 2 | Clarify and challenge | Pressure-test the issue's premise; brainstorm before locking design | `gstack:office-hours` | `superpowers:brainstorming`; `compound-engineering:ce-brainstorm`; `compound-engineering:ce-ideate`; `great_cto` (7 SDLC subagents); `gstack:design-shotgun` (UI variants); craft custom via `skill-creator` |
| 3 | Survey outside context | Surface real references via composable researcher profiles (academic, competitive-landscape, custom) | **`wovenflow:researchflow`** + profiles | Custom researcher profile materialized from `researcher.md.tmpl` (security, clinical, data-science, hardware, etc.); skip when work is mechanical |
| 4 | Design | Write the prose `.spec.md` with user stories + if/when/then behaviors; red-team check before locking | **`wovenflow:designflow`** + **`wovenflow:redteam`** | None recommended — overriding the DTDD core means you're not using wovenflow |
| 5 | Test | Insert inline test blocks alongside each behavior; bundled extractor produces derived test files at pretest time | **`wovenflow:testflow`** | None recommended — overriding the DTDD core means you're not using wovenflow |
| 6 | Build | Dispatch implementer subagents per behavior; spec-compliance + code-quality review (Team / Parallel / Sequential modes) | **`wovenflow:subflow`** | `superpowers:subagent-driven-development` (fallback for non-DTDD work, no `.spec.md`); `compound-engineering:ce-work` (fallback for the Compound Engineering plan-first methodology); `ruvnet/claude-flow` (heavyweight alternative for swarm-shaped work — different methodology, not a drop-in) |
| 7 | Verify | Cleanup + review chain (tests, coverage, UI walk-through, adversarial review) | `wovenflow:setup` verify template | `gstack:simplify`; `gstack:codex review`; `gstack:design-review`; `gstack:health`; `gstack:qa`; `gstack:benchmark`; `gstack:cso`; `wovenflow:redteam`; `compound-engineering:ce-code-review`; `compound-engineering:ce-debug`; `test-writer-fixer`; Browse Code Quality category; off-template skill via `skill-creator` |
| 8 | Ship | Land the verified work via PR or direct push | `wovenflow:setup` ship-pr or ship-direct template | `gstack:ship`; `gstack:land-and-deploy`; Browse Git & Version Control category (`commit`, `create-pr`); off-template skill via `skill-creator` |
| 9 | Post-ship | Update docs, capture learnings | `gstack:document-release` | `gstack:retro`; `gstack:learn`; `compound-engineering:ce-compound` (structured learnings-for-reuse); `compound-engineering:ce-product-pulse` (post-ship usage / perf report); `claude-md-management:claude-md-improver`; Browse Documentation category |
| 10 | Close out | Session hygiene; persist state for the next session | `wovenflow:setup` wrap-up template | Off-template skill via `skill-creator`. `gstack:context-save` *supplements* the wrap-up template (saves a structured checkpoint of the session's thinking for the next session's `gstack:context-restore`) — it is not a substitute for the dangling-commit audit, status reconciliation, and next-task reservation. |

Bold rows are wovenflow's DTDD core. The other phases use companion skills the wizard surfaces from a per-phase catalog (gstack, superpowers, `claude-plugins-official`, community marketplaces) or scaffold templates wovenflow ships for the universal patterns. See `plugins/wovenflow/skills/setup/SKILL.md` for the full catalog.

Phase 3 is **multi-profile** — a single research pass can run `academic` + `competitive-landscape` together when the question genuinely needs both. Custom researchers (security, clinical, data-science, etc.) materialize from `researcher.md.tmpl` into `<repo>/.claude/skills/researchflow/researchers/`. The `setup` wizard's Phase 3 step handles profile selection (multi-select) and walks through "Craft custom researcher" when none of the built-ins fit.

## Install

```sh
/plugin marketplace add https://github.com/wovenflow/wovenflow
/plugin install wovenflow@wovenflow
/wovenflow:setup
```

(Or as a directory source if you've cloned this repo: `/plugin marketplace add /path/to/wovenflow`.)

## Quick start

In a project that has a test runner (Mocha, Vitest, Jest, or Node's built-in `node:test`):

1. Run `/wovenflow:setup` to define your project's workflow. Pick `wovenflow:designflow / testflow / subflow` for Phases 4-6 (the DTDD core); pick or craft skills for the other phases.
2. *(Optional, when external context matters)* Run `/wovenflow:researchflow` to ground the design in current libraries / APIs / patterns / papers before drafting the spec.
3. Run `/wovenflow:designflow` to draft a `.spec.md` for your first feature.
4. Run `/wovenflow:testflow` to insert inline tests.
5. Wire `pretest` in your `package.json` so `npm test` extracts and runs the spec tests.
6. Run `/wovenflow:subflow` to dispatch implementer subagents in parallel.

## Why woven

In most agentic workflows, it is easy to end up with many distributed sources of truth for any one feature. The goal of DTDD is to keep the definition and intent for any one feature in one place. This makes it easy to know what needs to be updated or replaced in the case of a change. Documentation stays fresh because it is conjoined to the test that enforces it. This solution also does not overspecify implementation for a sub-agent. We are not writing the code twice. 

## License

MIT — see [`LICENSE`](LICENSE).

## Acknowledgments

- Donald Knuth — literate programming
- Doctest (Python) — tests-in-docstrings precedent
- Cucumber / SpecFlow / BDD ecosystem — Gherkin-flavored if/when/then
- The Claude Code plugin ecosystem — distribution mechanism
