---
name: testflow
description: Test phase of DTDD (Doc-Test-Driven Development). Use after designflow. Inserts inline test blocks alongside each if/when/then behavior in a .spec.md. Bundled extractor produces derived test files at pretest time. Multi-language: typescript, javascript, python, rust, ruby, go.
---

# Testflow (DTDD Test phase)

Second of three phases in a Doc-Test-Driven Development cycle. The `.spec.md` from `designflow` gets test code inserted alongside each behavior. Same file; appended content.

## File shape (after this phase)

Each behavior gets a fenced test block immediately after its `Then`. The fence language tells the extractor which blocks belong to the test suite. Test code is copied verbatim — the extractor does not transform it.

### TypeScript example

````markdown
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
````

### Python example

````markdown
### B1: <name>
**If** <precondition>
**When** <event>
**Then** <expected outcome>

```python
def test_b1_name():
    # arrange (the If)
    # act (the When)
    # assert (the Then)
```
````

The shape is the same in every supported language; only the fence label and the test-syntax differ.

## Language and runner support

The extractor copies blocks unchanged for whichever language the project uses. Pick the test runner the project already has — the extractor stays neutral within each language.

| `--lang` | Fence label | Output filename pattern | Common runners |
|---|---|---|---|
| `typescript` (default) | ```` ```typescript ```` | `<base>.test.ts` | `node:test`, Mocha, Vitest, Jest |
| `javascript` | ```` ```javascript ```` | `<base>.test.js` | same as TS |
| `python` | ```` ```python ```` | `test_<base>.py` (dots sanitized to `_` for pytest module compatibility) | pytest, unittest |
| `rust` | ```` ```rust ```` | `<base>_test.rs` | `cargo test` |
| `ruby` | ```` ```ruby ```` | `<base>_test.rb` | RSpec, Minitest |
| `go` | ```` ```go ```` | `<base>_test.go` | `go test` |

## Bundled extractor

`extract.mjs` lives next to this `SKILL.md`. CLI:

```
node extract.mjs <input-glob-or-file> <output-dir> [--lang LANG]
```

The default `--lang` is `typescript` (backward-compatible with pre-multi-language wovenflow).

### Wiring it in — TypeScript / JavaScript

Add to `package.json`. The `pretest` lifecycle hook runs automatically before any `npm test`:

```json
"scripts": {
  "pretest": "node <plugin-path>/skills/testflow/extract.mjs 'doc/specs/**/*.spec.md' out/spec-tests/",
  "test": "tsc -p ./ && mocha 'out/test/*.test.js' 'out/spec-tests/*.test.js'"
}
```

### Wiring it in — Python

Python doesn't have a single universal pretest hook. Pick whichever your project already uses:

**Option A: `conftest.py` at the test-root** (works with plain pytest, no extra deps):

```python
# conftest.py
import subprocess
from pathlib import Path

def pytest_configure(config):
    plugin = Path("/path/to/wovenflow/plugins/wovenflow/skills/testflow/extract.mjs")
    subprocess.run(
        ["node", str(plugin), "doc/specs/**/*.spec.md", "out/spec-tests/", "--lang", "python"],
        check=True,
    )
```

Then point pytest at `out/spec-tests/` — e.g. in `pyproject.toml`:

```toml
[tool.pytest.ini_options]
testpaths = ["tests", "out/spec-tests"]
```

**Option B: Makefile / justfile** (when CI / dev already invokes `make test`):

```makefile
test: extract-specs
	pytest tests out/spec-tests

extract-specs:
	node /path/to/wovenflow/plugins/wovenflow/skills/testflow/extract.mjs 'doc/specs/**/*.spec.md' out/spec-tests/ --lang python
```

**Option C: Poetry / uv script** (when the project uses one of those):

```toml
[tool.poetry.scripts]
extract-specs = "scripts.extract_specs:main"

# scripts/extract_specs.py
import subprocess
subprocess.run(["node", "/path/to/extract.mjs", ..., "--lang", "python"], check=True)
```

Then run `poetry run extract-specs && pytest` (or wire it into a Poetry/uv task that does both).

### Wiring it in — Rust / Go / Ruby

Same pattern: invoke `extract.mjs --lang <lang>` before the test runner. For Rust, add it as a `cargo` build-script step or a `Makefile` target. For Go, a `go generate` directive. For Ruby, a Rake task.

The extractor itself is Node.js only (one extractor, all languages). Most dev environments already have Node available; if not, install it once.

## Rules

- **Source of truth is the `.spec.md`.** Derived test files live in the output directory (gitignored), recreated every pretest.
- **Test code is verbatim.** Whatever the markdown contains is what runs. No formatting, no module rewriting.
- **Subagents implement only.** The orchestrator writes the spec (prose + tests); subagents write production code to make tests pass. Subagents never edit the `.spec.md`.
- **Iron Law (from `superpowers:test-driven-development`):** no production code without a failing test first. The orchestrator's spec fails when extracted; a subagent makes it pass.
- **Phase order matters.** `designflow` before `testflow`. Don't write tests for behaviors whose prose isn't settled.

## Anti-patterns

- **Editing derived test files** — overwritten every pretest. Edit the `.spec.md`.
- **Implementation code in the `.spec.md`** — only test code. Implementation lives in source files.
- **Subagent rewriting tests to make them pass** — if the spec is wrong, raise it back. Don't quietly weaken the contract.
- **Adding new behaviors here** — those belong in `designflow`. The test phase inserts tests for already-drafted behaviors.
- **Mixing fence languages within one spec** — pick the project's primary test language and stick to it. The extractor only emits blocks matching `--lang`; fences in other languages are silently dropped.
