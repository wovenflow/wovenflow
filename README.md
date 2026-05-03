# wovenflow

A Claude Code plugin for **Doc-Test-Driven Development (DTDD)** — TDD where intent and tests are woven into a single `.spec.md` file per feature. The subagents implment one feature at a time acording to the spec and test to ensure intent is preserved and token churn is minimized during definition and execution. There is a setup skill that will help you generate a full workflow that matches your project's needs and includes wovenflow at the core. 

## What it is

`wovenflow` is the plugin (the tool); `DTDD` is the methodology (the practice). 

The methodology in one paragraph:

> A feature's design and its tests live in the same markdown file (`<feature>.spec.md`). Prose describes the behaviors as `If` / `When` / `Then` triplets; an inline `typescript` test block sits alongside each behavior. A bundled extractor reads the markdown at pretest time and produces derived `.test.ts` files for whatever runner the project already uses (`node:test`, Mocha, Vitest, Jest). The orchestrator (a human or LLM) authors the spec; subagents implement the production code that turns the failing tests green.

## Skills

Four skills cover the cycle:

| Skill | Phase | Job |
|---|---|---|
| `wovenflow:designflow` | Design | Write a `.spec.md` with user stories + if/when/then behaviors — prose only, no code |
| `wovenflow:testflow` | Test | Insert inline mocha-style test blocks alongside each behavior. Bundled `extract.mjs` produces derived `.test.ts` files at pretest time. |
| `wovenflow:subflow` | Build | Dispatch implementer subagents per behavior with spec-compliance and code-quality review. Bundled `run-suite.mjs` and `run-behavior.mjs` for ad-hoc test runs. Subagents reference `.spec.md` by file path — never paste-text. |
| `wovenflow:setup` | Workflow wizard | Interactive walk-through to define a project's full development cycle (claim → … → close-out), suggesting existing skills or helping craft custom ones. Writes the settled workflow to the project's `CLAUDE.md`. |

## Install

```sh
/plugin marketplace add https://github.com/wovenflow/wovenflow
/plugin install wovenflow@wovenflow
```

(Or as a directory source if you've cloned this repo: `/plugin marketplace add /path/to/wovenflow`.)

## Quick start

In a project that has a test runner (Mocha, Vitest, Jest, or Node's built-in `node:test`):

1. Run `/wovenflow:setup` to define your project's workflow. Pick `wovenflow:designflow / testflow / subflow` for Phases 3-5; pick or craft skills for the other phases.
2. Run `/wovenflow:designflow` to draft a `.spec.md` for your first feature.
3. Run `/wovenflow:testflow` to insert inline tests.
4. Wire `pretest` in your `package.json` so `npm test` extracts and runs the spec tests.
5. Run `/wovenflow:subflow` to dispatch implementer subagents.

## Why woven

In most agentic workflows, it is easy to end up with many distributed sources of truth for any one feature. The goal of DTDD is to keep the definition and intent for any one feature in one place. This makes it easy to know what needs to be updated or replaced in the case of a change. Documentation stays fresh because it is conjoined to the test that enforces it. This solution also does not overspecify implementation for a sub-agent. We are not writing the code twice. 

## License

MIT — see [`LICENSE`](LICENSE).

## Acknowledgments

- Donald Knuth — literate programming
- Doctest (Python) — tests-in-docstrings precedent
- Cucumber / SpecFlow / BDD ecosystem — Gherkin-flavored if/when/then
- The Claude Code plugin ecosystem — distribution mechanism
