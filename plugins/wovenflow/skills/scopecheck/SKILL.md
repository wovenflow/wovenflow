---
name: scopecheck
description: Coverage-based scope check — verifies every line of code committed in a feature branch is exercised by at least one test. Code without test coverage is by-construction not required by any spec behavior, so it is over-implementation. Runs after subflow merges, before verify; flags uncovered lines and proposes either removal or new behaviors+tests to formalize the legitimate additions. Reusable directly via `/wovenflow:scopecheck` against any spec + diff range.
---

# Scopecheck (over-implementation guardrail)

DTDD's contract is that every behavior in the `.spec.md` has a test, and every test corresponds to a behavior. The implementer subagents satisfy the tests by writing minimal code. If the implementation went beyond what was specified, the extra code does not trace back to any behavior — and, by construction, has no test exercising it.

This skill enforces that property by **measuring coverage**: any line of code in the diff that is not exercised by at least one test is over-implementation. The skill flags those lines and proposes the resolution: remove the code, or write a new behavior + test if the addition turned out to be necessary.

## When to use

- **Phase 7 (verify)** — **canonical home.** The verify template runs scopecheck after the coverage audit, before adversarial review. Verify already owns the coverage tooling; scopecheck plugs into the existing pipeline naturally and keeps subflow focused on "make tests pass."
- **End of Phase 6 (subflow), optionally** — projects that want a tighter feedback loop can invoke scopecheck as subflow's final step before declaring the build phase complete. This catches scope creep at the build moment instead of at the verify gate. Trades subflow simplicity for earlier signal; pick per project.
- **Pre-merge on a PR** — when reviewing an integration branch about to land on main.
- **Refactor cycles** — after a refactor pass, confirm no new logic snuck in beyond what the refactor's `.spec.md` describes.
- **Directly invoked** as `/wovenflow:scopecheck <spec> <base..head>` to run an audit at any point.

Skip when the work has no `.spec.md` (e.g., one-off scripts, tooling experiments). The skill requires a spec to compare against.

## Inputs

| Input | Description |
|---|---|
| **Spec file** | Path to the `.spec.md` whose behaviors govern this scope. |
| **Diff range** | Git range like `<base>..HEAD` covering the implementation under review. Default: `<orchestrator-branch-base>..HEAD` (the full feature branch). |
| **Coverage command** | The project's coverage command (e.g., `npm run coverage`, `pytest --cov`, `cargo tarpaulin`). The skill detects from `package.json`/`pyproject.toml`/`Cargo.toml` if not given. |
| **Project root** | Working directory where the coverage command runs. |

## Procedure

### 1. Run the coverage command

Run the project's coverage command from project root. Capture the coverage report (LCOV, JSON, or whichever format the tool produces). The skill is runner-agnostic — it parses whatever the project already emits.

If the coverage command fails, **stop and report**. Don't proceed against partial data.

### 2. Compute the diff line set

Extract the set of `(file, line)` tuples added or modified in the diff range:

```bash
git diff --unified=0 <base>..HEAD -- '*.{ts,js,py,rs,go,rb,...}' | <parse to (file, line) pairs>
```

Exclude:

- Test files (paths matching the project's test glob)
- The `.spec.md` itself
- Generated files (output dirs, build artifacts)
- Configuration files (package.json, tsconfig.json, etc.) unless the project explicitly tracks them

### 3. Cross-reference diff with coverage

For each diff line, check whether the coverage report marks it as covered (executed by at least one test).

Three buckets:

- **Covered** — line is in the diff AND in the coverage report as executed → in scope, no flag.
- **Uncovered** — line is in the diff AND in the coverage report but marked unexecuted → flag as candidate scope creep.
- **Untrackable** — line is in the diff but absent from the coverage report (e.g., type-only declarations in TypeScript, comments, JSX, decorators that the coverage tool doesn't instrument) → flag as ambiguous; surface but don't escalate.

### 4. Group flags by region

A single uncovered region (a contiguous block of uncovered lines, or a function-level uncovered cluster) is one flag, not N flags. Collapse line-level flags into:

- File path
- Line range
- The smallest enclosing function or block name (parsed from the source)
- A 5-line excerpt of the uncovered code

### 5. Verdict

| Verdict | Meaning |
|---|---|
| **CLEAN** | No uncovered regions in the diff. Every committed line is exercised by a test. |
| **VIOLATIONS** | One or more uncovered regions. List them with the file:line ranges and excerpts. Propose resolution per region (see Step 6). |
| **AMBIGUOUS** | Only untrackable regions (e.g., TypeScript type-only code that the coverage tool doesn't instrument). Surface but do not block. |
| **BLOCKED** | Coverage command failed; cannot evaluate. |

### 6. Resolution proposals (on VIOLATIONS)

For each uncovered region, propose one of two resolutions:

- **Remove**: the code is scope creep — it doesn't trace to any behavior in the spec. Remove it, re-run the test suite, confirm green.
- **Formalize**: the code is genuinely needed but was added without a corresponding behavior. The fix is to add a behavior to the `.spec.md` describing what this code is for, add a test fence verifying it, and verify the existing code passes the new test. **Propose the new behavior** in the report — author it as draft prose, e.g.:

  > Suggested new behavior:
  > ```
  > ### B<n>: <short name derived from the function/block>
  > ∵ **IF** <inferred precondition from the code>
  > ↦ **WHEN** <inferred event>
  > ∴ **THEN** <inferred outcome>
  > ```
  > Add this to `<spec file>` and run testflow to insert a test fence.

The orchestrator (or a human reviewer) decides per region: remove or formalize. Don't auto-apply either.

### 7. Output

Append (or save as a sibling file) a structured report:

```markdown
## Scope check (YYYY-MM-DD)

**Spec:** `<spec file>`
**Diff range:** `<base>..<head>`
**Coverage tool:** `<command>`

### Uncovered regions

1. **`<file>:<line-range>`** in `<enclosing function>`
   ```
   <5-line excerpt>
   ```
   *Suggested resolution:* <Remove | Formalize as new behavior>
   <If Formalize: draft behavior prose>

2. ...

### Verdict

**<CLEAN | VIOLATIONS | AMBIGUOUS | BLOCKED>**

<paragraph: what should happen next>
```

## Integration with verify (canonical)

The verify template (`bench/setup/templates/verify.md.tmpl`) runs scopecheck right after the coverage audit step. Verify owns the project's coverage command anyway; scopecheck reuses it. If the verdict is VIOLATIONS:

- Verify does not approve the change; the orchestrator reads the scopecheck report and decides per region (remove or formalize).
- Apply the decisions (delete the scope-creep code, or add the new behavior + test that formalizes a legitimate addition), then re-run scopecheck.
- Loop until CLEAN (or AMBIGUOUS) before continuing to the rest of the verify chain.

This is the canonical wiring — verify is where coverage already runs, and the over-implementation rule is a verify-gate concern.

## Integration with subflow (optional)

Some projects want a tighter feedback loop and invoke scopecheck at the **end of subflow** rather than at verify. The trade is: catching scope creep at the build moment vs at the verify gate. Subflow stays simpler if scopecheck lives in verify; subflow gives faster signal if scopecheck runs there too.

If a project chooses the subflow-final integration, the loop shape is identical (subflow does not declare DONE on VIOLATIONS open). This is supported but not required.

## Why coverage instead of diff-vs-spec text comparison

A diff-vs-spec text comparison would try to parse the spec and the diff, find code without a behavior reference, and flag it. That approach is fuzzy: how do you trace a helper function back to a behavior? What about shared utilities? AST analysis quickly becomes brittle.

Coverage gives a sharper rule: tests are the spec's enforcement mechanism. If a line isn't covered, no test exercises it; if no test exercises it, no behavior required it. The implication is one-way (uncovered → over-implementation), but it's defensible and automatable.

The exception is untrackable code (type-only declarations, decorators, etc.) — those need human judgment, which Step 4 surfaces explicitly.

## Involvement gates

Scopecheck exposes three user-involvement gates, one per verdict shape:

| Gate | Fires when |
|---|---|
| `scopecheck_clean` | The verdict is CLEAN — every committed line is exercised by at least one test. The orchestrator is about to confirm and continue. |
| `scopecheck_violations` | The verdict is VIOLATIONS — there are uncovered lines and the per-region resolution proposals (remove vs formalize) are ready to apply. |
| `scopecheck_ambiguous_or_blocked` | The verdict is AMBIGUOUS (coverage-tool blind spot) or BLOCKED (coverage command failed). The orchestrator needs a human call on how to proceed. |

Before invoking `AskUserQuestion` at any of these, consult `.wovenflow.yml` at the repo root (see the mode-to-gate table in the plugin README). On `auto`, pick the `(Recommended)` option and append a record to `.wovenflow-decisions.log`:

```json
{"ts":"<iso>","skill":"scopecheck","gate":"<gate>","chosen":"<option>","reason":"<one-line>"}
```

On `ask`, prompt the user as normal.

Defaults (read the spec table for the full picture):

- `scopecheck_clean` is `auto` under `minimal` and `standard` (CLEAN is a positive verdict; no decision to make), `ask` only under `maximal`.
- `scopecheck_violations` is `auto` under `minimal` (orchestrator applies the proposed resolutions), `ask` under `standard` and `maximal` (each violation is a real choice between remove vs formalize and the user usually wants in).
- `scopecheck_ambiguous_or_blocked` is `ask` under all three modes — these verdicts are by definition the cases where the orchestrator does not have the information to decide.

## Anti-patterns

- **Adding tests to satisfy scopecheck.** If the code is genuinely scope creep, the right fix is to remove it, not to write a fig-leaf test. Tests added to silence scopecheck without a corresponding behavior are dishonest — they make the rule unenforceable. Reviewers should catch this.
- **Skipping scopecheck "because the change is small."** Small changes accumulate. The skill is cheap to run; run it.
- **Overriding VIOLATIONS without reading the report.** The verdict has line-level evidence. Read it before declaring "this is fine."
- **Claiming AMBIGUOUS to dodge the rule.** AMBIGUOUS is reserved for genuine coverage-tool blind spots (TypeScript types, etc.). If the code is real logic and untracked, it's a coverage-tool gap to fix, not a license to ship uncovered code.
- **Running scopecheck before subflow merges back.** The skill compares a feature-branch diff against the spec; it doesn't make sense per-behavior in mid-build. Run it after merge.

## Integration with other wovenflow skills

| Skill | Relationship |
|---|---|
| `wovenflow:designflow` | Authors the `.spec.md` whose behaviors define scope. |
| `wovenflow:testflow` | Inserts the inline tests that scopecheck's coverage measurement depends on. |
| `wovenflow:subflow` | Invokes scopecheck as its final step before declaring the build phase complete. |
| `wovenflow:redteam` | Adversarial decision-quality gate; runs at different transitions. Scopecheck is mechanical; redteam is judgmental. They're complementary. |
| Project `verify` skill | Scopecheck runs at the start of the verify chain in projects that integrate it that way. |
