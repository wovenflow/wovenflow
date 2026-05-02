---
name: testflow
description: Test phase of DTDD (Doc-Test-Driven Development). Use after designflow. Inserts inline test blocks alongside each if/when/then behavior in a .spec.md. Bundled extractor produces derived .test.ts files at pretest time, runner-agnostic.
---

# Testflow (DTDD Test phase)

Second of three phases in a Doc-Test-Driven Development cycle. The `.spec.md` from `designflow` gets test code inserted alongside each behavior. Same file; appended content.

## File shape (after this phase)

````markdown
# <Feature> spec

## Behaviors

### B1: <name>
**If** <precondition>
**When** <event>
**Then** <expected outcome>

```typescript
test('B1: <name>', () => {
  // arrange (the If)
  // act (the When)
  // assert (the Then)
});
```

### B2: <name>
**If** ...
**When** ...
**Then** ...

```typescript
test('B2: <name>', () => {
  // ...
});
```
````

Each behavior gets a `typescript`-fenced test block immediately after its `Then`. Test code is copied verbatim — the extractor does not transform it.

## Runner-agnostic syntax

The extractor copies typescript blocks unchanged. Any runner that accepts `test('name', fn)` syntax works:

- **`node:test`** (Node 18+ built-in) — recommended for plugins; zero deps
- **Mocha** (TDD interface) — Bexoe's existing extension test pattern
- **Vitest**, **Jest** — supported via their respective `test` / `it` exports

Pick whatever the project already uses; the extractor stays neutral.

## Bundled extractor

`extract.mjs` lives next to this SKILL.md. CLI:

```
node extract.mjs <input-glob-or-file> <output-dir>
```

Wire it into the project's `package.json`:

```json
"scripts": {
  "pretest": "node <plugin-path>/skills/testflow/extract.mjs 'doc/specs/**/*.spec.md' out/spec-tests/",
  "test": "tsc -p ./ && mocha 'out/test/*.test.js' 'out/spec-tests/*.test.js'"
}
```

`pretest` is an npm lifecycle hook — runs automatically before any `npm test` (CI, IDE, command-line).

## Rules

- **Source of truth is the `.spec.md`.** Derived `.test.ts` files live in `out/spec-tests/` (gitignored), recreated every pretest.
- **Test code is verbatim.** Whatever the markdown contains is what runs. No formatting, no module rewriting.
- **Subagents implement only.** The orchestrator writes the spec (prose + tests); subagents write production code to make tests pass. Subagents never edit the `.spec.md`.
- **Iron Law (from `superpowers:test-driven-development`):** no production code without a failing test first. The orchestrator's spec fails when extracted; a subagent makes it pass.
- **Phase order matters.** `designflow` before `testflow`. Don't write tests for behaviors whose prose isn't settled.

## Anti-patterns

- **Editing derived `.test.ts` files** — overwritten every pretest. Edit the `.spec.md`.
- **Implementation code in the `.spec.md`** — only test code. Implementation lives in source files.
- **Subagent rewriting tests to make them pass** — if the spec is wrong, raise it back. Don't quietly weaken the contract.
- **Adding new behaviors here** — those belong in `designflow`. The test phase inserts tests for already-drafted behaviors.
