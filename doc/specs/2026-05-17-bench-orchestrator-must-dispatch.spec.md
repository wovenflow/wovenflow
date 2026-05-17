# Bench multi-agent orchestrator: must dispatch + path validation + violation tracking

## User stories

- As the bench protocol author, I want the multi-agent orchestrator's instructions to compel it to dispatch at least one implementer subagent (rather than directly calling `write_source` / `write_test` itself), so that `topology='multi'` trials actually exercise the multi-agent shape they are supposed to measure — instead of degenerating into "orchestrator wearing a single-agent hat with a worse prompt."
- As a study analyst, I want any orchestrator that nonetheless writes a non-spec.md file via `write_source` to leave a record in `meta.json.orchestrator_violations[]`, so that the violation is visible post-hoc and the trial can be excluded from headline analysis without re-running the whole cell.
- As the harness maintainer, I want `write_source` / `write_test` to reject obviously malformed paths (absolute, `..`-containing, leading `bench/`, or a literal directory-name like `bench`) at parse time, so that an orchestrator (or subagent) that tries to write into the wrong tree gets a clear, immediate error rather than producing a trial dir with files under `source/bench/tasks/<task>/intent.md` that no scorer can match.

## Context

The 2026-05-16 multi-topology pilot (`bench/results/pilot-20260516T235613-multi/`) showed multi-agent dramatically underperforming single-agent on 8 of 9 study cells:

| cell | single hidden_pass | multi hidden_pass |
|---|---|---|
| baseline-p2wd | 97.4% | 0.0% |
| tdd-p2wd | 89.7% | 0.0% |

The driver: the orchestrator's `composeMultiAgentPrompt` instructions explicitly permitted direct `write_source` / `write_test` calls ("You may also call `write_source` and `write_test` yourself to produce orchestrator-level artifacts..."). Open-weights coder models read this permissively. Result: 27 multi-agent phase-trials averaged `subagent_count ≈ 1.0` (well below the 1-6 range the topology spec anticipates), and several trials had `subagent_count: 0` — the orchestrator implemented the entire task itself in turn 1, never dispatching anyone.

A worse symptom: at least one trial (`slugify-baseline-multi-2/phase-2-wd`) recorded the orchestrator calling `write_source({path: "bench/tasks/slugify/intent.md", ...})` and `write_source({path: "bench/styles/baseline.md", ...})` — paths leaking the harness's internal tree into the trial's `source/` dir. The current path handling is permissive: any string becomes a `path.join(sourceDir, relPath)`, producing nested `source/bench/tasks/...` directories that the scorer cannot interpret.

This spec addresses both the prompt-level cause (orchestrator told it may directly implement) and the harness-level defense (path validation, violation observability).

## Behaviors

### B1: orchestrator user_message contains a `MUST dispatch at least one` directive
∵ **IF** `composeMultiAgentPrompt({condition, task_id, repo_root})` from `bench/study.mjs` is called for any v2 condition (`baseline`, `tdd`, `dtdd`)
↦ **WHEN** the returned `orchestrator_user_message` is inspected
∴ **THEN** it contains, verbatim, the substring `MUST dispatch at least one` AND the substring `You are the coordinator, not the implementer`. The directive sits in the orchestrator's user_message (not in the methodology-neutral system_prompt) so the multi.md topology helper stays neutral.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeMultiAgentPrompt } from '../../study.mjs';

test('B1: orchestrator user_message compels dispatch', () => {
  for (const condition of ['baseline', 'tdd', 'dtdd']) {
    const composed = composeMultiAgentPrompt({
      condition,
      task_id: 'slugify',
      repo_root: process.cwd(),
    });
    const um = composed.orchestrator_user_message;
    assert.ok(
      um.includes('MUST dispatch at least one'),
      `[${condition}] orchestrator_user_message must contain "MUST dispatch at least one"`,
    );
    assert.ok(
      um.includes('You are the coordinator, not the implementer'),
      `[${condition}] orchestrator_user_message must contain the coordinator-not-implementer line`,
    );
  }
});
```

### B2: orchestrator user_message restricts `write_source` usage and forbids `write_test`
∵ **IF** the same `composeMultiAgentPrompt(...)` call as B1
↦ **WHEN** the returned `orchestrator_user_message` is inspected
∴ **THEN** it contains the substring `write_source` AND the substring `spec.md` in a sentence that scopes orchestrator `write_source` to `<task>.spec.md` only (DTDD). It also contains the substring `write_test` AND the substring `never call it from the orchestrator turn` (or equivalent wording matching the regex `/never call (it|write_test) from the orchestrator/i`). It mentions `orchestrator_violations` so the model is told the harness records violations.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeMultiAgentPrompt } from '../../study.mjs';

test('B2: orchestrator user_message restricts write_source to spec.md and forbids write_test', () => {
  for (const condition of ['baseline', 'tdd', 'dtdd']) {
    const composed = composeMultiAgentPrompt({
      condition,
      task_id: 'slugify',
      repo_root: process.cwd(),
    });
    const um = composed.orchestrator_user_message;
    // write_source is scoped to spec.md authoring
    assert.ok(um.includes('write_source'), `[${condition}] mentions write_source`);
    assert.ok(um.includes('spec.md'), `[${condition}] mentions spec.md`);
    // write_test is forbidden from the orchestrator turn
    assert.ok(um.includes('write_test'), `[${condition}] mentions write_test`);
    assert.ok(
      /never call (it|write_test) from the orchestrator/i.test(um),
      `[${condition}] forbids write_test from the orchestrator turn`,
    );
    // The model is told the harness logs violations
    assert.ok(
      um.includes('orchestrator_violations'),
      `[${condition}] mentions the orchestrator_violations meta field`,
    );
  }
});
```

### B3: multi-agent trial whose orchestrator calls `write_source` with a non-spec.md path records the call in `meta.json.orchestrator_violations[]`
∵ **IF** `dispatchMultiAgentTrial(...)` runs with a provider whose orchestrator returns `source_files: { "index.js": "..." }` (a non-spec.md path) AND also dispatches one subagent
↦ **WHEN** the trial completes and `meta.json` is written
∴ **THEN** `meta.json` contains an array field `orchestrator_violations` with one entry of shape `{ tool: 'write_source', path: 'index.js', reason: <string> }`. The trial still completes (the file is still merged — this is observability, not enforcement). A trial whose orchestrator wrote ONLY `*.spec.md` paths produces NO `orchestrator_violations` field (or an empty array — the test accepts both as "no violations").

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { dispatchMultiAgentTrial } from '../../runner.js';

test('B3: orchestrator non-spec.md write_source is recorded in orchestrator_violations', async () => {
  const result = await dispatchMultiAgentTrial({
    task_id: 'slugify',
    style: 'baseline',
    trial_index: 0,
    run_id: 'orch-violation-smoke',
    provider: {
      name: 'mock-orch-violation',
      script: 'bench/test/fixtures/mock-orch-violation.mjs',
    },
    system_prompt: 'mock-system',
    user_message: 'mock-user',
    tools: [],
  });

  const meta = JSON.parse(readFileSync(path.join(result.trial_dir, 'meta.json'), 'utf8'));
  assert.ok(Array.isArray(meta.orchestrator_violations), 'orchestrator_violations is an array');
  assert.strictEqual(meta.orchestrator_violations.length, 1, 'one violation recorded');
  const v = meta.orchestrator_violations[0];
  assert.strictEqual(v.tool, 'write_source');
  assert.strictEqual(v.path, 'index.js');
  assert.ok(typeof v.reason === 'string' && v.reason.length > 0, 'reason is a string');
  // The trial still completed and merged the file
  assert.strictEqual(meta.subagent_count, 1, 'one subagent dispatched');
});

test('B3: orchestrator that wrote only spec.md produces no orchestrator_violations', async () => {
  const result = await dispatchMultiAgentTrial({
    task_id: 'slugify',
    style: 'dtdd',
    trial_index: 0,
    run_id: 'orch-violation-spec-only',
    provider: {
      name: 'mock-orch-spec-only',
      script: 'bench/test/fixtures/mock-orch-spec-only.mjs',
    },
    system_prompt: 'mock-system',
    user_message: 'mock-user',
    tools: [],
  });

  const meta = JSON.parse(readFileSync(path.join(result.trial_dir, 'meta.json'), 'utf8'));
  // Either absent or empty array — both count as "no violations"
  const violations = meta.orchestrator_violations ?? [];
  assert.strictEqual(violations.length, 0, 'no violations when orchestrator wrote only spec.md');
});
```

### B4: `write_source` / `write_test` reject malformed paths (absolute, traversal, leading-dir, literal directory)
∵ **IF** the provider's content-fallback path-validation helper `validateArtifactPath(path)` (exported from `bench/providers/openai-compatible.js`) is called with one of: an absolute path, a path containing `..`, a path with a leading `bench/` or `tests/` prefix, a literal directory name like `bench`, or the empty string
↦ **WHEN** validation runs
∴ **THEN** the helper returns `{ ok: false, reason: <string> }` where `reason` includes the word `rejected` and the offending path. For valid paths (e.g. `index.js`, `lib/util.js`, `slugify.spec.md`), it returns `{ ok: true }`.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifactPath } from '../../providers/openai-compatible.js';

test('B4: validateArtifactPath rejects malformed paths', () => {
  // Absolute paths
  for (const bad of ['/etc/passwd', '/tmp/x.js', '\\windows\\path']) {
    const r = validateArtifactPath(bad);
    assert.strictEqual(r.ok, false, `absolute path "${bad}" should be rejected`);
    assert.ok(r.reason.includes('rejected'), `reason mentions "rejected" for "${bad}"`);
    assert.ok(r.reason.includes(bad), `reason cites the offending path "${bad}"`);
  }
  // Path traversal
  for (const bad of ['../escape.js', 'foo/../bar.js', '..']) {
    const r = validateArtifactPath(bad);
    assert.strictEqual(r.ok, false, `traversal path "${bad}" should be rejected`);
    assert.ok(r.reason.includes('rejected'), `reason mentions "rejected" for "${bad}"`);
  }
  // Leading directory prefix that leaks the harness tree
  for (const bad of ['bench/tasks/slugify/intent.md', 'bench/styles/baseline.md', 'tests/foo.js']) {
    const r = validateArtifactPath(bad);
    assert.strictEqual(r.ok, false, `prefixed path "${bad}" should be rejected`);
    assert.ok(r.reason.includes('rejected'), `reason mentions "rejected" for "${bad}"`);
  }
  // Literal directory name (no extension)
  for (const bad of ['bench', 'tests', 'source']) {
    const r = validateArtifactPath(bad);
    assert.strictEqual(r.ok, false, `bare directory name "${bad}" should be rejected`);
    assert.ok(r.reason.includes('rejected'), `reason mentions "rejected" for "${bad}"`);
  }
  // Empty
  {
    const r = validateArtifactPath('');
    assert.strictEqual(r.ok, false, 'empty path rejected');
  }
  // Valid relative paths
  for (const good of ['index.js', 'lib/util.js', 'slugify.spec.md', 'index.test.js', 'a/b/c.js']) {
    const r = validateArtifactPath(good);
    assert.strictEqual(r.ok, true, `valid path "${good}" should be accepted (got ${JSON.stringify(r)})`);
  }
});
```

### B5: provider drops `write_source` / `write_test` calls with rejected paths and the runner does not surface them as source/test files
∵ **IF** a provider's orchestrator response includes a `write_source` call with `path: "bench/tasks/x/intent.md"` (rejected by B4)
↦ **WHEN** the runner completes the trial and writes `source/`
∴ **THEN** the rejected file does NOT appear under `source/` (no nested `source/bench/...` tree is created), and the trial still completes with whatever the subagent produced. The rejection is recorded in `meta.json.orchestrator_violations[]` with shape `{tool, path, reason}` so the operator can audit it.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dispatchMultiAgentTrial } from '../../runner.js';

test('B5: rejected orchestrator write_source paths are dropped and recorded', async () => {
  const result = await dispatchMultiAgentTrial({
    task_id: 'slugify',
    style: 'baseline',
    trial_index: 0,
    run_id: 'orch-path-rejection-smoke',
    provider: {
      name: 'mock-orch-rejected-paths',
      script: 'bench/test/fixtures/mock-orch-rejected-paths.mjs',
    },
    system_prompt: 'mock-system',
    user_message: 'mock-user',
    tools: [],
  });

  // No leakage into source/ tree
  assert.ok(
    !existsSync(path.join(result.trial_dir, 'source', 'bench')),
    'no nested source/bench/ tree was created',
  );
  // Subagent file still present
  assert.ok(
    existsSync(path.join(result.trial_dir, 'source', 'index.js')),
    'subagent-authored index.js still merged',
  );
  // Violation logged
  const meta = JSON.parse(readFileSync(path.join(result.trial_dir, 'meta.json'), 'utf8'));
  assert.ok(Array.isArray(meta.orchestrator_violations));
  assert.ok(meta.orchestrator_violations.length >= 1, 'at least one violation recorded');
  const hadRejectedPath = meta.orchestrator_violations.some(
    (v) => v.tool === 'write_source' && v.path.startsWith('bench/') && /rejected/i.test(v.reason),
  );
  assert.ok(hadRejectedPath, 'a rejected-path violation is recorded');
});
```

## Red-team check

Decision: enforce orchestrator-MUST-dispatch via prompt + violation observability + path validation.

Top three reasons this might not be the right call:

1. **The prompt directive might be ignored by smaller models.** Open-weights coder models with weaker instruction-following could still bypass the "MUST dispatch" line and call `write_source` directly. The directive then becomes a placebo. Mitigation: that's exactly what B3+B5 address — the harness now records the bypass to `orchestrator_violations[]` and the path-validation drops files written to obviously wrong paths. Analysis can filter trials where `orchestrator_violations.length > 0` as off-protocol. The directive isn't load-bearing alone; it raises the rate of compliance and the violation tracker measures the residual.
2. **Path validation might break legitimate orchestrator-authored spec.md.** A DTDD orchestrator writing `slugify.spec.md` must not be rejected. Mitigation: B4's allowed list includes `slugify.spec.md` and any non-prefixed `.md`. Only paths with leading `bench/`, `tests/`, `..`, or absolute roots are rejected. A spec.md authored under the task name at the trial root is preserved. The literal-directory-name rejection (`bench`, `tests`, `source`) catches the typo-class bug where the model meant to pass a path but only passed a directory.
3. **Soft enforcement (record + still complete) might let bad trials pollute the headline numbers.** A multi-agent trial with `subagent_count: 0` and `orchestrator_violations.length > 5` is essentially a single-agent trial in disguise; including it in multi vs single comparisons biases the result. Mitigation: that filtering is a downstream-analysis concern — the harness records the data the analyst needs to make that call. Hard-blocking the trial mid-run risks losing the conversation we need to debug why the orchestrator bypassed; soft enforcement preserves it. The grader / reporter can opt into `orchestrator_violations.length > 0 => off-protocol` filtering as a follow-up.

Verdict: **PROCEED.** Four behaviors, narrow surface (prompt addition + validator helper + meta field), targeted at a measured pathology (8/9 cells regression under multi). Validation helper is exported so future provider modules can reuse it.

## Handoff

After testflow wires this spec into pretest, subflow edits `bench/study.mjs`'s `composeMultiAgentPrompt` to add the MUST-dispatch directive (B1, B2), adds `validateArtifactPath` to `bench/providers/openai-compatible.js` and gates `write_source` / `write_test` on it (B4, B5), and wires `orchestrator_violations[]` into `bench/runner.js`'s `runMultiAgentTrial` meta-write path (B3, B5). Two new mock fixtures live under `bench/test/fixtures/`: `mock-orch-violation.mjs` (orchestrator emits one non-spec.md write_source + dispatches one subagent) and `mock-orch-rejected-paths.mjs` (orchestrator emits one rejected-path write_source + dispatches one subagent that writes `index.js`). The change is methodology-neutral; the topology helper `bench/topology/multi.md` is not touched, and no style card is modified.
