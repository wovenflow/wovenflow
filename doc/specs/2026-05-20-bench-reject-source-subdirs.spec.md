# Bench provider: reject subdirectory paths in `write_source` / `write_test`

## User stories

- As the bench operator, I want `write_source` / `write_test` to reject any path that places a file in a subdirectory (anything containing a `/` or `\` after the existing absolute/traversal/prefix checks), so that the model is steered to a flat source layout with `index.js` at the root. The hidden suite imports exactly `<sourceDir>/index.js`; when the model buries its implementation in a subdirectory, that import fails and the trial scores a misleading load failure instead of its true behavioral score.

## Context

The hidden test for each task resolves the agent's submission with a fixed entrypoint: `const mod = await import(sourceDir + '/index.js')` (`bench/tasks/slugify/hidden_tests_after_edit/slugify.test.js:11`). The tasks are single-module exercises; the expected layout is `index.js` at the source root, optionally alongside flat helper files (ES module sibling imports resolve fine at the root).

Observed in the clean re-pilot `bench/results/repilot-20260520T153944-*`, three Phase-2 cells scored `0/1` (the load-failure signature: `total_count: 1` is a single file-level subtest failure, not one real test) purely because the model organized its code into a subdirectory:

- `slugify-dtdd-multi-0/phase-2`: only `src/slugify.js` written, no root `index.js` → `import('index.js')` throws `ERR_MODULE_NOT_FOUND`.
- `slugify-dtdd-multi-1/phase-2`: root `index.js` re-exports `./slugify.js`, but the real implementation is at `src/index.js`; `./slugify.js` does not exist → import throws.

This clusters on the spec-heavy `dtdd` condition and the no-description Phase-2 arm (the benchmark's central test condition): with no prose description and a methodology that emphasizes structure, the model leans into "real project layout" (subdirectories, split modules, re-export shims). The rigid `index.js`-at-root loader then mis-scores valid ESM as a load failure.

This is the same class of harness gap as the existing path-traversal rejection (`validateArtifactPath`) and the CommonJS-content rejection (`validateArtifactContent`): locally-reasonable model output that the harness should catch at write time, surface as a tool-result rejection, and let the model retry — rather than silently scoring it `0/1`.

**Behavior change to a previously-tested contract.** `validateArtifactPath` previously *accepted* subdirectory paths (the docstring listed `lib/util.js` as valid, and `doc/specs/2026-05-11-...`/`2026-05-17-bench-orchestrator-must-dispatch.spec.md` B4 asserted `lib/util.js` and `a/b/c.js` as `{ ok: true }`). That B4 test is updated in the same change to move those paths to the rejected set. The acceptance of subdirectories was an implementation default, not a pre-registered scientific choice; tightening it to a flat-only contract fixes a mis-scoring bug without touching the locked study design (conditions, tasks, scoring predicates, hypotheses), consistent with the prior CJS-rejection and mid-conversation-system harness fixes.

This validation is methodology-neutral (applies to all conditions and topologies).

## Behaviors

### B1: `validateArtifactPath` accepts flat filenames at the source root
∵ **IF** `validateArtifactPath(p)` is called with a flat filename that has no directory separator (e.g. `index.js`, `slugify.js`, `slugify.spec.md`, `index.test.js`, `helper.mjs`)
↦ **WHEN** validation runs
∴ **THEN** it returns `{ ok: true }`. Flat helper files at the root remain valid — the flat-only contract forbids subdirectories, not multiple files.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifactPath } from '../../providers/openai-compatible.js';

test('B1: validateArtifactPath accepts flat root filenames', () => {
  for (const good of ['index.js', 'slugify.js', 'slugify.spec.md', 'index.test.js', 'helper.mjs']) {
    assert.deepStrictEqual(validateArtifactPath(good), { ok: true }, `"${good}" should be accepted`);
  }
});
```

### B2: `validateArtifactPath` rejects subdirectory paths
∵ **IF** `validateArtifactPath(p)` is called with a path that places a file in a subdirectory — one interior separator (`src/index.js`, `lib/util.js`) or several (`a/b/c.js`), using `/` or `\`
↦ **WHEN** validation runs
∴ **THEN** it returns `{ ok: false, reason: <string> }` where `reason` contains the word `rejected`, cites the offending path, and names `index.js` as the required flat entrypoint (so the model knows to retry at the root).

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifactPath } from '../../providers/openai-compatible.js';

test('B2: validateArtifactPath rejects subdirectory paths', () => {
  for (const bad of ['src/index.js', 'lib/util.js', 'a/b/c.js', 'src\\index.js']) {
    const r = validateArtifactPath(bad);
    assert.strictEqual(r.ok, false, `subdirectory path "${bad}" should be rejected`);
    assert.ok(r.reason.includes('rejected'), `reason mentions "rejected" for "${bad}"`);
    assert.ok(r.reason.includes(bad), `reason cites the offending path "${bad}"`);
    assert.ok(r.reason.includes('index.js'), `reason names index.js as the required entrypoint for "${bad}"`);
  }
});
```

### B3: subdirectory rejection composes with the existing checks
∵ **IF** `validateArtifactPath(p)` is called with paths that the prior contract already rejected (absolute, traversal, harness-prefix, bare directory name, empty)
↦ **WHEN** validation runs
∴ **THEN** those still return `{ ok: false }` with their existing, more-specific reasons taking precedence (the subdirectory check runs after them), and flat root filenames still pass — i.e. adding the subdirectory rule does not regress or broaden the established rejections.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifactPath } from '../../providers/openai-compatible.js';

test('B3: subdirectory rejection composes with existing checks', () => {
  // Existing rejections still fire.
  for (const bad of ['/etc/passwd', '../escape.js', 'bench/tasks/x/intent.md', 'bench', '']) {
    assert.strictEqual(validateArtifactPath(bad).ok, false, `"${bad}" should still be rejected`);
  }
  // Harness-prefix path keeps its specific reason (precedence over the generic subdir reason).
  const pref = validateArtifactPath('bench/tasks/x/intent.md');
  assert.ok(pref.reason.includes('bench/'), 'harness-prefix reason takes precedence');
  // Flat root file still accepted.
  assert.deepStrictEqual(validateArtifactPath('index.js'), { ok: true });
});
```

## Red-team check

Decision: extend `validateArtifactPath` to reject any path containing a directory separator (after the existing checks), surfacing the rejection so the model retries with a flat `index.js`.

Top three reasons this might not be the right call:

1. **It removes a capability some future task might need (a genuinely multi-directory submission).** True, but no current task is shaped that way — every hidden suite imports exactly `<sourceDir>/index.js`, and the tasks are single-module exercises. If a future task needs nested modules, the hidden-test loader would also have to change; the flat-only contract and the loader are two ends of the same assumption, and they should change together. Until then, flat-only matches reality and the rejection message documents the contract.

2. **It changes a previously-tested behavior (B4 asserted subdirectories were accepted), which could look like moving the goalposts.** The acceptance was an implementation default, not a pre-registered design decision; the locked study design (conditions, tasks, predicates, hypotheses) is untouched. The change is documented here and B4 is updated in the same commit, mirroring the prior CJS-rejection and mid-conversation-system harness fixes that also tightened harness behavior post-tag to stop mis-scoring valid model output. The methodology-compliance signal is preserved: rejected paths are recorded in `path_rejections[]`.

3. **The model could thrash, repeatedly writing `src/...` and getting rejected until turn-cap.** Possible, but the rejection reason explicitly names `index.js` at the root as the fix, which is the kind of concrete tool-result feedback fine-tuned coder models act on. If empirical thrashing emerges, the reason text can be strengthened or the prompt's tool instructions can state the flat-only contract up front. Worth measuring before pre-emptively softening.

Verdict: **PROCEED.** One added check at the end of an existing validator, flat helper files still allowed, existing rejections keep precedence, and the fix removes a fake-`0/1` failure mode from the benchmark's central no-description arm.

## Handoff

After testflow inserts these test fences into `bench/out/spec-tests/`, the implementer:

- Extends `validateArtifactPath` in `bench/providers/openai-compatible.js`: after the existing absolute / `..` / prefix / bare-name / empty checks pass, if the remaining path contains a `/` or `\`, return `{ ok: false, reason }` where the reason includes `rejected`, the offending path, and names `index.js` as the required flat entrypoint (e.g. `... rejected (subdirectory paths not supported; write a flat file at the source root — the entrypoint must be index.js)`).
- Confirms the existing call sites (native + JSON-fallback `write_source`/`write_test`, and the orchestrator dispatch path validation) need no change — they already consume `validateArtifactPath`'s `{ ok, reason }` and push to `path_rejections[]` on failure.
- Verifies the updated B4 test in `doc/specs/2026-05-17-bench-orchestrator-must-dispatch.spec.md` (subdirectory paths moved to the rejected set) is green alongside B1–B3 here.

After all behaviors are green, no further work — this is a harness-only fix. `bench/` is not plugin surface; no version bump.
