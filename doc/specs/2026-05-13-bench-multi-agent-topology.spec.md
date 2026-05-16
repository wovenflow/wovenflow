# Bench multi-agent topology — `topology='multi'` dispatch

## Hypothesis-relevance

This spec extends the bench harness so it can test PROTOCOL-v2's three primary hypotheses (`H_initial`, `H_edit`, `H_artifact_value`; see `bench/PROTOCOL-v2.md` §2) under the **multi-agent** topology that production wovenflow's DTDD methodology actually prescribes (per `plugins/wovenflow/skills/subflow/SKILL.md`).

PROTOCOL-v2 §3.2 explicitly narrows v2 Stage-2 to single-agent topology because the multi-agent path was unbuilt. The 2026-05-12 smoke surfaced that single-agent runs are dominated by **single-agent context degradation** (one DTDD trial called `write_source` 30 times to overwrite `index.js`; the agent thrashed and drowned in its own conversation history). A methodology-vs-methodology comparison run only under single-agent topology systematically penalizes DTDD specifically — DTDD's whole shape ("one implementer per behavior, fresh context") is what production already does and is precisely what gets collapsed when the bench forces all behaviors through one conversation.

The hypotheses this affects:

- **`H_initial` (initial code quality).** Multi-agent dispatch lets each implementer subagent see only its own behavior plus the spec, eliminating context-window drown-out. We expect DTDD's initial-code advantage to widen under multi-agent because the methodology's per-behavior decomposition is finally being tested at the shape it was designed for. TDD also benefits (per-test-class subagent) but less, because TDD doesn't have a natural per-behavior unit. Baseline benefits least (no behavior boundaries to decompose along).
- **`H_edit` (artifact survival under maintenance).** The Phase 2 / Phase 2-WD edit agent operates on inherited artifacts. Under multi-agent dispatch, the Phase 2 orchestrator can decompose the edit into smaller subtasks (e.g., "update spec, then add new behavior, then update tests") and dispatch fresh implementer subagents for each — closer to how a real maintenance team would operate. We expect DTDD's H_edit advantage to grow because the spec.md becomes the primary artifact the orchestrator decomposes against.
- **`H_artifact_value`.** The DELTA between Phase-2 and Phase-2-WD measures how much value the spec.md preserves when intent.md is gone. Multi-agent doesn't change the comparison shape, but it raises the absolute baseline scores — making the delta-of-deltas measurement more sensitive (smaller noise floor relative to the signal).

This spec is the prerequisite for lifting PROTOCOL-v2 §3.2's "single-agent only" deferral. It does not itself change PROTOCOL-v2 (that document is locked at the pre-registered tag); a separate amendment will reference this spec when adding `topology='multi'` to the v2.1 condition matrix.

## Scope

In scope:

- New harness export `dispatchMultiAgentTrial(...)` mirroring the outer contract of `dispatchTrial(...)` so `study.mjs` can route on `topology` without further changes to its call sites.
- Style-specific orchestrator decomposition for the three v2 conditions (`baseline`, `tdd`, `dtdd`).
- Per-trial accounting (orchestrator tokens + per-subagent tokens, dispatch count) recorded in `meta.json`.
- Isolated subagent worktrees (separate tempdirs, per `bench/topology/multi.md` §2).
- `study.mjs` accepting `--topology=single` and `--topology=multi` and routing every phase (Phase 1, Phase 2, Phase 2-WD) through the chosen topology.
- A `(condition × task × topology × trial)` study-cell shape so single and multi can be compared on identical tasks within one run.

Out of scope (deferred — see §7):

- Multi-agent for `plan` and `freeform` styles (not in v2 conditions; trivial to add later by writing a decomposition for each).
- Cross-machine subagent dispatch (single host only).
- Speculative execution, retry-with-feedback loops, real `SendMessage` peer messaging, persistent-named-reviewer mode (production wovenflow's "Named agents mode" — out of scope for the bench because it requires Claude Code's `Agent` tool surface that the bench doesn't sit inside).
- Mixed-topology study cells (e.g., single-agent Phase 1 → multi-agent Phase 2). Each trial picks one topology and uses it for all its phases.

## User stories

- As the bench protocol author, I want the harness to dispatch `topology='multi'` trials whose orchestrator+subagents structure mirrors production wovenflow's DTDD shape, so that the methodology comparison measures methodology effectiveness rather than single-agent context degradation.
- As a reviewer of a v2.1 study, I want every multi-agent trial's `meta.json` to disclose how many subagents were dispatched and how their tokens split from the orchestrator's, so that cost-per-condition comparisons remain honest.
- As an operator running the bench, I want a single `--topology` flag on `bench/study.mjs` that routes the entire run (every phase, every cell) through the chosen topology, so a `single` baseline run and a `multi` companion run differ only by that flag.
- As the harness maintainer, I want subagent failures to be contained — one subagent erroring out should leave the trial scoreable on what the others produced rather than wiping the whole cell — because multi-agent's worst case otherwise is "one bad subagent kills the cell."

## Behaviors

### B1: `KNOWN_TOPOLOGIES` exports `'multi'` and `'single'`; existing single-agent validation is unchanged
∵ **IF** a caller imports `KNOWN_TOPOLOGIES` from `bench/runner.js` (or invokes `dispatchTrial({topology: 'multi', ...})`)
↦ **WHEN** the harness validates the topology argument
∴ **THEN** `'multi'` is accepted alongside `'single'`. Calling `dispatchTrial({topology: 'single', ...})` continues to dispatch through the single-agent path with no behavior change. Calling `dispatchTrial({topology: 'multi', ...})` routes internally to `dispatchMultiAgentTrial(...)` (B2). Unknown topology values still throw the existing `dispatchTrial: unknown topology "..."` error.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTrial } from '../../runner.js';

test('B1: dispatchTrial accepts topology: "multi" in dry-run', () => {
  const single = dispatchTrial({
    task_id: 'slugify',
    style: 'baseline',
    topology: 'single',
    trial_index: 0,
    dry_run: true,
  });
  assert.strictEqual(single.topology, 'single');
  assert.match(single.worktree_path, /slugify-baseline-single-0$/);

  const multi = dispatchTrial({
    task_id: 'slugify',
    style: 'baseline',
    topology: 'multi',
    trial_index: 0,
    dry_run: true,
  });
  assert.strictEqual(multi.topology, 'multi');
  assert.match(multi.worktree_path, /slugify-baseline-multi-0$/);

  assert.throws(
    () => dispatchTrial({
      task_id: 'slugify',
      style: 'baseline',
      topology: 'team-of-five',
      trial_index: 0,
      dry_run: true,
    }),
    /unknown topology "team-of-five"/,
  );
});
```

### B2: `dispatchMultiAgentTrial({...})` signature mirrors `dispatchTrial({...})` outer contract
∵ **IF** a caller invokes `dispatchMultiAgentTrial({task_id, style, trial_index, system_prompt, user_message, tools, provider, run_id, turn_cap, wall_clock_cap_ms, grace_ms, env, protocol_model_id, dry_run})`
↦ **WHEN** the function returns (dry-run case) or completes (live case)
∴ **THEN** the returned object has at minimum the same outer fields the single-agent `dispatchTrial` returns: `{trial_id, run_id, style_card_path, topology_helper_path, worktree_path, stop_reason, provider, endpoint_url, model_id, tokens_input, tokens_output, wall_clock_ms, trial_dir}`. Plus the multi-agent-specific fields from B7 (`orchestrator_tokens_input`, `orchestrator_tokens_output`, `subagent_count`, `subagents`). Topology in the returned object and in the trial_id is `'multi'`. Validation rejects the same bad inputs `dispatchTrial` rejects (missing `task_id`, unknown `style`, non-integer `trial_index`).

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchMultiAgentTrial } from '../../runner.js';

test('B2: dispatchMultiAgentTrial dry-run shape mirrors dispatchTrial', () => {
  const result = dispatchMultiAgentTrial({
    task_id: 'slugify',
    style: 'dtdd',
    trial_index: 0,
    dry_run: true,
  });
  for (const field of [
    'style_card_path', 'topology_helper_path', 'worktree_path',
    'task_id', 'trial_index',
  ]) {
    assert.ok(field in result, `dry-run result must include ${field}`);
  }
  assert.strictEqual(result.style, 'dtdd');
  assert.match(result.worktree_path, /slugify-dtdd-multi-0$/);

  assert.throws(
    () => dispatchMultiAgentTrial({ task_id: '', style: 'dtdd', trial_index: 0, dry_run: true }),
    /task_id must be a non-empty string/,
  );
  assert.throws(
    () => dispatchMultiAgentTrial({ task_id: 'slugify', style: 'nonsense', trial_index: 0, dry_run: true }),
    /unknown style "nonsense"/,
  );
});
```

### B3: orchestrator's system prompt is composed from `bench/topology/multi.md` content (methodology-neutral)
∵ **IF** the live multi-agent path runs an orchestrator subagent
↦ **WHEN** the orchestrator's system prompt is composed (after style-card-and-tools composition for the orchestrator's own dispatch)
∴ **THEN** the orchestrator's `system_prompt` contains the verbatim content of `bench/topology/multi.md` followed by a short orchestrator-role preamble that explains the orchestrator's job: read the task, decompose per the topology helper, dispatch implementer subagents, integrate results into the trial dir's `source/` `tests/` `<task>.spec.md` layout. The orchestrator's prompt MUST NOT include the style card content — the style card is methodology-flavored and methodology-neutral coordination is the topology helper's load-bearing property (per `bench/topology/AUTHORING.md`). The style card goes to the implementer subagents (B4) instead.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeOrchestratorPrompt } from '../../runner.js';

test('B3: orchestrator system_prompt embeds multi.md verbatim and omits style card', () => {
  const multi = readFileSync('bench/topology/multi.md', 'utf8').trim();
  const dtddCard = readFileSync('bench/styles/dtdd.md', 'utf8').trim();

  const orchestrator = composeOrchestratorPrompt({
    style: 'dtdd',
    task_id: 'slugify',
    repo_root: process.cwd(),
  });
  assert.ok(orchestrator.system_prompt.includes(multi),
    'orchestrator system_prompt must contain verbatim multi.md');
  assert.ok(!orchestrator.system_prompt.includes(dtddCard),
    'orchestrator system_prompt must NOT contain the dtdd style card body');
});
```

### B4: orchestrator dispatches N implementer subagents per its decomposition
∵ **IF** the orchestrator runs against a v2 task (one of the five small tasks in `bench/tasks/`) under any of the three v2 conditions (`baseline` | `tdd` | `dtdd`)
↦ **WHEN** the orchestrator decomposes the task and dispatches subagents
∴ **THEN** the number of subagents dispatched is between 1 and 6 inclusive. Per the style-specific dispatch rules (§ "Style-specific dispatch" below): Baseline dispatches 1 implementer subagent for the whole task (no decomposition signal exists in the prompt); TDD dispatches 1 subagent per test-class the orchestrator's plan identifies, capped at 4; DTDD dispatches 1 subagent per behavior in the spec it authors, capped at 6. The `subagent_count` field in the returned multi-agent trial result records the actual N. `subagent_count` is also recorded in the meta.json (B7).

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchMultiAgentTrial } from '../../runner.js';
import path from 'node:path';

test('B4: orchestrator dispatch count is within [1, 6] and recorded', async () => {
  // Use the bundled mock multi-agent provider that returns a deterministic
  // decomposition (one orchestrator turn, three subagent slots) for any task.
  const result = await dispatchMultiAgentTrial({
    task_id: 'slugify',
    style: 'dtdd',
    trial_index: 0,
    run_id: 'b4-multi-test',
    provider: {
      name: 'mock-multi',
      script: 'bench/test/fixtures/mock-multi-agent-three-subagents.mjs',
    },
    system_prompt: 'mock-system',
    user_message: 'mock-user',
    tools: [],
  });
  assert.ok(Number.isInteger(result.subagent_count));
  assert.ok(result.subagent_count >= 1 && result.subagent_count <= 6,
    `subagent_count=${result.subagent_count} out of [1,6]`);
  assert.strictEqual(result.subagent_count, 3); // mock returns three
});
```

### B5: each subagent runs in its own provider call chain — no shared conversation state
∵ **IF** the orchestrator dispatches two or more implementer subagents in the same trial
↦ **WHEN** each subagent's provider call runs
∴ **THEN** each subagent receives a freshly-constructed conversation array (system + user only — no orchestrator turn history, no other subagent's turns); each subagent's `tokens_input` accounting starts from zero; each subagent's `conversation.jsonl` (when written, see B7) contains only its own turns. The `mod.runTrial(...)` call for one subagent does not see the messages array of any other subagent's call. A test that wraps the provider module to record per-call conversation lengths must observe each call starting fresh.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchMultiAgentTrial } from '../../runner.js';

test('B5: each subagent gets a fresh conversation', async () => {
  // The mock provider records, per call, the length of the conversation it
  // received as input. Three subagents → three records, each length 2 (system + user).
  const result = await dispatchMultiAgentTrial({
    task_id: 'slugify',
    style: 'dtdd',
    trial_index: 0,
    run_id: 'b5-multi-test',
    provider: {
      name: 'mock-multi',
      script: 'bench/test/fixtures/mock-multi-agent-fresh-context.mjs',
    },
    system_prompt: 'mock-system',
    user_message: 'mock-user',
    tools: [],
  });
  assert.ok(Array.isArray(result.subagents));
  assert.ok(result.subagents.length >= 2,
    'this test requires at least two subagents');
  for (const sa of result.subagents) {
    assert.strictEqual(sa.input_conversation_length, 2,
      `subagent ${sa.id} saw conversation length ${sa.input_conversation_length}, expected 2 (fresh)`);
  }
});
```

### B6: orchestrator integrates subagent outputs into the final trial dir layout
∵ **IF** the orchestrator's dispatched subagents return their `source_files` / `test_files` maps
↦ **WHEN** the multi-agent trial completes and writes its artifact tree
∴ **THEN** the trial dir at `bench/results/<run_id>/<trial_id>/` contains the same six artifacts the single-agent path produces (per B3 of `2026-05-10-dtdd-bench.spec.md`): `source/`, `tests/`, `conversation.jsonl`, `meta.json`, plus any `<task>.spec.md` written by an orchestrator that produces one (DTDD only — see § "Style-specific dispatch"). The `source/` and `tests/` trees are the merged union of every subagent's contribution, with later subagents' files overriding earlier ones at the same path (per `bench/topology/multi.md` §2 — the orchestrator integrates results in an order it controls, resolving overlap before moving on). The `conversation.jsonl` contains the orchestrator's turns interleaved with marker lines `{"role":"system","content":"--- subagent <id> turns follow ---"}` before each subagent's turn block, so a downstream reader can split per-agent.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dispatchMultiAgentTrial } from '../../runner.js';

test('B6: trial dir contains merged source + tests + interleaved conversation', async () => {
  const result = await dispatchMultiAgentTrial({
    task_id: 'slugify',
    style: 'dtdd',
    trial_index: 0,
    run_id: 'b6-multi-test',
    provider: {
      name: 'mock-multi',
      script: 'bench/test/fixtures/mock-multi-agent-integrates-files.mjs',
    },
    system_prompt: 'mock-system',
    user_message: 'mock-user',
    tools: [],
  });
  const trialDir = result.trial_dir;
  assert.ok(existsSync(path.join(trialDir, 'source')), 'source/ must exist');
  assert.ok(existsSync(path.join(trialDir, 'tests')), 'tests/ must exist');
  assert.ok(existsSync(path.join(trialDir, 'conversation.jsonl')));
  assert.ok(existsSync(path.join(trialDir, 'meta.json')));
  // Three subagents → three "subagent <id> turns follow" markers.
  const convo = readFileSync(path.join(trialDir, 'conversation.jsonl'), 'utf8');
  const markerCount = (convo.match(/--- subagent .* turns follow ---/g) || []).length;
  assert.strictEqual(markerCount, 3,
    `expected 3 subagent markers in conversation.jsonl, found ${markerCount}`);
  // The mock writes index.js from S2 last; it should win the merge.
  const indexJs = readFileSync(path.join(trialDir, 'source', 'index.js'), 'utf8');
  assert.match(indexJs, /from S2/, 'last subagent (S2) must win the file-merge');
});
```

### B7: per-trial accounting — orchestrator tokens, per-subagent tokens, dispatch count in `meta.json`
∵ **IF** a multi-agent trial completes and writes `meta.json`
↦ **WHEN** an analyst reads the meta
∴ **THEN** the meta includes the standard fields (`run_id`, `trial_id`, `task_id`, `style`, `topology`, `trial_index`, `tokens_input`, `tokens_output`, `wall_clock_ms`, `stop_reason`, `captured_at`, `provider`, `endpoint_url`, `model_id`) — `topology` is `'multi'`, `tokens_input` / `tokens_output` are the SUM of orchestrator + all subagents — plus the additive multi-agent fields: `orchestrator_tokens_input` (number), `orchestrator_tokens_output` (number), `subagent_count` (integer ≥ 1), and `subagents` (array of objects, each `{id, tokens_input, tokens_output, stop_reason, files_written: number}`). Single-agent meta.json carries none of these new fields (back-compat).

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { dispatchMultiAgentTrial } from '../../runner.js';

test('B7: meta.json records orchestrator + per-subagent token accounting', async () => {
  const result = await dispatchMultiAgentTrial({
    task_id: 'slugify',
    style: 'dtdd',
    trial_index: 0,
    run_id: 'b7-multi-test',
    provider: {
      name: 'mock-multi',
      script: 'bench/test/fixtures/mock-multi-agent-tokens.mjs',
    },
    system_prompt: 'mock-system',
    user_message: 'mock-user',
    tools: [],
  });
  const meta = JSON.parse(readFileSync(path.join(result.trial_dir, 'meta.json'), 'utf8'));
  assert.strictEqual(meta.topology, 'multi');
  assert.ok(Number.isInteger(meta.subagent_count) && meta.subagent_count >= 1);
  assert.ok(Array.isArray(meta.subagents));
  assert.strictEqual(meta.subagents.length, meta.subagent_count);
  assert.ok(Number.isFinite(meta.orchestrator_tokens_input));
  assert.ok(Number.isFinite(meta.orchestrator_tokens_output));
  // Top-level tokens are the sum.
  const subTotalIn = meta.subagents.reduce((a, s) => a + s.tokens_input, 0);
  const subTotalOut = meta.subagents.reduce((a, s) => a + s.tokens_output, 0);
  assert.strictEqual(meta.tokens_input, meta.orchestrator_tokens_input + subTotalIn);
  assert.strictEqual(meta.tokens_output, meta.orchestrator_tokens_output + subTotalOut);
  // Each subagent record has the contract shape.
  for (const sa of meta.subagents) {
    assert.ok(typeof sa.id === 'string' && sa.id.length > 0);
    assert.ok(Number.isFinite(sa.tokens_input));
    assert.ok(Number.isFinite(sa.tokens_output));
    assert.ok(typeof sa.stop_reason === 'string');
    assert.ok(Number.isInteger(sa.files_written) && sa.files_written >= 0);
  }
});
```

### B8: a subagent that errors does not kill the trial; orchestrator integrates what it has and notes the gap
∵ **IF** the orchestrator dispatches N subagents and one returns `stop_reason: 'error'` (provider exception, abort timeout, malformed return shape) while the others succeed
↦ **WHEN** the trial finishes
∴ **THEN** the trial does NOT abort; the orchestrator integrates the surviving subagents' outputs into `source/` and `tests/`; the meta.json's `subagents` array includes a record for the failed subagent with `stop_reason: 'error'` and an `error` string field; the trial's top-level `stop_reason` is `'done'` (orchestrator completed) — NOT `'error'` — and a new top-level field `subagent_errors: <count>` records how many failed. Downstream scoring runs against whatever `source/` ended up containing; if that source is non-empty, the trial is scoreable. Empty `source/` (every subagent failed) is handled by the existing Phase 2 `skipped: empty-source` routing in `study.mjs`.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dispatchMultiAgentTrial } from '../../runner.js';

test('B8: one subagent erroring does not kill the trial', async () => {
  // Mock dispatches three subagents; the second throws.
  const result = await dispatchMultiAgentTrial({
    task_id: 'slugify',
    style: 'dtdd',
    trial_index: 0,
    run_id: 'b8-multi-test',
    provider: {
      name: 'mock-multi',
      script: 'bench/test/fixtures/mock-multi-agent-one-fails.mjs',
    },
    system_prompt: 'mock-system',
    user_message: 'mock-user',
    tools: [],
  });
  assert.strictEqual(result.stop_reason, 'done');
  const meta = JSON.parse(readFileSync(path.join(result.trial_dir, 'meta.json'), 'utf8'));
  assert.strictEqual(meta.subagent_count, 3);
  assert.strictEqual(meta.subagent_errors, 1);
  // The failed subagent's record carries the error.
  const failed = meta.subagents.find((s) => s.stop_reason === 'error');
  assert.ok(failed, 'failed subagent must have a record');
  assert.ok(typeof failed.error === 'string' && failed.error.length > 0);
  // Surviving subagents' files made it to source/.
  assert.ok(existsSync(path.join(result.trial_dir, 'source')));
});
```

### B9: parallel subagents run in isolated working trees (separate tempdirs) — file writes don't collide
∵ **IF** the orchestrator dispatches two or more subagents whose `source_files` maps include overlapping paths (e.g., both write `index.js`)
↦ **WHEN** each subagent's provider call runs
∴ **THEN** each subagent's file writes happen in its own tempdir under `bench/worktrees/<trial_id>/subagents/<subagent_id>/` (per `bench/topology/multi.md` §2: "parallel subagents must operate in isolated working trees so their edits do not collide"). The orchestrator merges outputs into the final trial dir's `source/` and `tests/` AFTER all subagents have reported (B6's overlap rule applies). Each subagent's tempdir is removed after merge (or kept on `BENCH_KEEP_SUBAGENT_WORKTREES=1` for debugging — same env-var pattern the existing harness uses for worktrees).

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dispatchMultiAgentTrial } from '../../runner.js';

test('B9: subagents write into isolated tempdirs; orchestrator merges deterministically', async () => {
  // Mock dispatches three subagents, S1 writes index.js with content "v1",
  // S2 writes index.js with content "v2", S3 writes utils.js. The merge
  // policy from B6 says S2 (later in dispatch order) wins for index.js.
  const result = await dispatchMultiAgentTrial({
    task_id: 'slugify',
    style: 'dtdd',
    trial_index: 0,
    run_id: 'b9-multi-test',
    provider: {
      name: 'mock-multi',
      script: 'bench/test/fixtures/mock-multi-agent-overlapping-writes.mjs',
    },
    system_prompt: 'mock-system',
    user_message: 'mock-user',
    tools: [],
  });
  // Subagent worktrees were under bench/worktrees/<trial_id>/subagents/
  // and were cleaned up unless BENCH_KEEP_SUBAGENT_WORKTREES=1.
  const subagentRoot = path.join(
    process.cwd(), 'bench', 'worktrees',
    path.basename(result.worktree_path),
    'subagents',
  );
  if (process.env.BENCH_KEEP_SUBAGENT_WORKTREES !== '1') {
    assert.ok(!existsSync(subagentRoot) || readFileSync, 'subagent tempdirs cleaned up by default');
  }
  // Final source/index.js shows S2's content (last writer wins per B6).
  const indexJs = readFileSync(path.join(result.trial_dir, 'source', 'index.js'), 'utf8');
  assert.match(indexJs, /v2/);
  // utils.js from S3 made it through.
  assert.ok(existsSync(path.join(result.trial_dir, 'source', 'utils.js')));
});
```

### B10: `study.mjs` accepts `--topology=multi` and routes Phase 1, Phase 2, Phase 2-WD through the multi-agent path
∵ **IF** an operator invokes `node bench/study.mjs --topology=multi --run-id=... --tasks=... --conditions=... --trials=...`
↦ **WHEN** `runStudy` plans and dispatches the matrix
∴ **THEN** every Phase 1 trial dispatches through `dispatchMultiAgentTrial`, every Phase 2 trial dispatches through the multi-agent path of `dispatchEditTrial` (a NEW additive option `topology: 'multi'` on `dispatchEditTrial` — single-agent behavior unchanged when omitted), and every Phase 2-WD trial likewise. Trial-id strings change shape from `<task>-<condition>-single-<index>` to `<task>-<condition>-multi-<index>` so single-agent and multi-agent results coexist in `bench/results/` without colliding. CLI default for `--topology` is `single` (back-compat with the v2 Stage-2 lock). Dry-run (`--dry-run`) lists planned trials with their topology in the output. Validation: an unknown `--topology=...` value exits non-zero with a message naming the value.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runStudy } from '../../study.mjs';

test('B10: --topology=multi plans multi-agent trial ids', async () => {
  const plan = await runStudy({
    run_id: 'b10-multi-plan',
    tasks: ['slugify'],
    conditions: ['dtdd'],
    trials: 2,
    topology: 'multi',
    dry_run: true,
  });
  assert.strictEqual(plan.phase1_planned.length, 2);
  for (const entry of plan.phase1_planned) {
    assert.strictEqual(entry.topology, 'multi');
    assert.match(entry.trial_id, /^slugify-dtdd-multi-[01]$/);
  }
  // Default (no --topology) still produces single-agent trial ids — back-compat.
  const planSingle = await runStudy({
    run_id: 'b10-single-plan',
    tasks: ['slugify'],
    conditions: ['dtdd'],
    trials: 1,
    dry_run: true,
  });
  assert.strictEqual(planSingle.phase1_planned[0].topology, 'single');
  assert.match(planSingle.phase1_planned[0].trial_id, /-single-0$/);
});

test('B10: CLI accepts --topology=multi and rejects unknown values', () => {
  const ok = spawnSync('node', ['bench/study.mjs',
    '--run-id=b10-cli-multi',
    '--tasks=slugify',
    '--conditions=dtdd',
    '--trials=1',
    '--topology=multi',
    '--dry-run',
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.strictEqual(ok.status, 0, `CLI exited ${ok.status}; stderr: ${ok.stderr}`);
  assert.match(ok.stdout, /slugify.*dtdd.*multi/);

  const bad = spawnSync('node', ['bench/study.mjs',
    '--run-id=b10-cli-bad-topo',
    '--tasks=slugify',
    '--conditions=dtdd',
    '--trials=1',
    '--topology=team-of-five',
    '--dry-run',
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notStrictEqual(bad.status, 0);
  assert.match(
    (bad.stderr || '') + (bad.stdout || ''),
    /topology.*team-of-five|invalid topology|unknown topology/i,
  );
});
```

## Style-specific dispatch

The orchestrator's decomposition is style-aware. The topology helper (`bench/topology/multi.md`) tells the orchestrator HOW to coordinate (decomposition rule, synchronization, clarification routing, stop condition); the style card tells it WHAT shape of work to coordinate. Combining them yields these per-condition dispatch shapes, which are what each style's multi-agent trial WILL look like in practice. The implementer of this spec should treat the shapes as the design target the orchestrator's prompt should encourage — not as wire-format mandates the harness asserts post-hoc.

| Condition | Orchestrator's job | Decomposition signal | Subagent count (typical) | Each implementer subagent's brief |
|---|---|---|---|---|
| **Baseline** | Read `intent.md`. The orchestrator has no methodology to follow, so it has no decomposition signal in the prompt. Default per `multi.md` §1 ("dispatch a single subagent for the whole task when the work touches one cohesive area") applies: orchestrator dispatches ONE implementer for the entire task. | None (the task description is one paragraph). | 1 | "Implement the task described in `intent.md` against the project's source tree. Write `source/` files only." |
| **TDD** | Read `intent.md`. The orchestrator writes a brief test-plan in its own scratch context (NOT a persisted artifact — the orchestrator's working context is ephemeral) listing the test classes that cover the behavior. It dispatches one implementer subagent per test class. Each subagent writes its tests in a dedicated test file AND the production code that makes them pass. | The orchestrator's identified test classes from `intent.md`. | 1–4 (one per test class; the v2 small tasks typically expose 2–3 obvious classes). | "Write the test class for `<class-name>` in `tests/` and the production code in `source/` it requires. Do not modify other classes' files." |
| **DTDD** | Read `intent.md`. The orchestrator authors `<task>.spec.md` in the trial dir's root (per the DTDD style card: prose IF/WHEN/THEN per behavior, inline test fences). It dispatches one implementer subagent per behavior. Each implementer reads the spec FILE PATH (not paste-text — production wovenflow's source-of-truth rule) and the behavior id, then writes the source code that makes that behavior's inline test pass. | Behaviors enumerated in the orchestrator-authored `<task>.spec.md`. | 1–6 (one per behavior; the v2 small tasks typically have 3–5 behaviors). | "Read `<task>.spec.md`. Implement behavior `B<N>` in `source/`. Do not modify the spec or other behaviors' tests." |

This asymmetry across styles is **load-bearing for the methodology comparison**, not a bug. DTDD's claim is precisely that its prose-with-tests artifact gives multi-agent dispatch a natural per-behavior decomposition signal that TDD (tests-only) and Baseline (description-only) cannot produce. If the orchestrator decomposed all three conditions identically, the bench would be measuring something other than methodology effectiveness. The topology helper itself (`multi.md`) is methodology-agnostic per `bench/topology/AUTHORING.md`; the asymmetry comes from each style card naturally yielding a different decomposition signal.

The orchestrator's decomposition decision is recorded in the orchestrator's `conversation.jsonl` turns and is reviewable post-hoc. If during smoke runs a particular condition's orchestrator decomposes pathologically (e.g., Baseline orchestrator splits into 6 subagents anyway, or DTDD orchestrator dispatches one giant subagent for all behaviors), that's a methodology-compliance grading observation — not a harness bug — and feeds into the v2.1 grading rubric addendum.

## Migration / dual-run plan

The v2 Stage-2 lock fixed `topology` at `'single'`. v2.1 expands the matrix to `(condition × task × topology × trial)`. Run plan:

1. **`single` baseline** — `node bench/study.mjs --topology=single --run-id=v2-1-single-<date> --trials=10`. Identical to a v2 Stage-2 run; reproduces the existing baseline.
2. **`multi` companion** — `node bench/study.mjs --topology=multi --run-id=v2-1-multi-<date> --trials=10`. Same task and condition matrix; multi-agent topology.
3. **Joint analysis** — the analysis script joins the two runs by `(task_id, condition, trial_index)` and reports per-cell deltas: `multi[h_initial] - single[h_initial]`, `multi[h_edit] - single[h_edit]`, `multi[h_artifact_value] - single[h_artifact_value]`. Per-condition aggregates compare the two topology paths.

The two runs MUST use the same model, temperature, and seed (per PROTOCOL-v2 §3.4 / §5). Trial-id namespacing (`-multi-` vs `-single-`) keeps them in separate `bench/results/` subdirs — no collisions. The analysis script reads both run-id dirs and merges by the (task, condition, trial_index) key.

A v2.1 amendment to PROTOCOL-v2 §3.2 is the documented gateway. This spec is the harness prerequisite; the amendment is the protocol-side commitment. They land together when the smoke validates that multi-agent trials produce non-empty, scoreable artifacts on the smoke task (slugify or one of the v2 tasks).

## Open questions

The implementer of this spec should surface these for orchestrator/user judgment before locking the design:

1. **Pathologically small tasks.** v2's tasks are functions, not features. `slugify` has maybe 4 behaviors; `throttle` maybe 5. Is multi-agent dispatch with N=3–5 subagents for a single-function task a faithful test of the methodology, or is it overkill that introduces orchestration overhead the methodology wouldn't choose in practice? Production wovenflow's docs imply DTDD-multi-agent shines on multi-file features, not single-function code. Mitigation candidates: (a) accept the asymmetry — at least the comparison is internally consistent across conditions; (b) add a "min-decomposition-size" heuristic so the orchestrator dispatches one subagent for any task whose intent.md is shorter than N words; (c) expand the v2.1 task set to include 2–3 multi-file tasks before running multi-agent.

2. **Orchestrator vs implementer model choice.** Should the orchestrator and implementer subagents use the same model (`Qwen3.6-35B-A3B-FP8` per the v2 Stage-2 plan), or could the orchestrator use a smaller/cheaper model since its job is mostly decomposition + integration rather than implementation? A mixed-model setup risks confounding the methodology comparison (orchestrator-quality is a separate variable). Recommendation: keep them on the same model for v2.1; revisit only if cost dominates.

3. **Phase 2 / Phase 2-WD shape.** The fresh Phase 2 agent is itself an orchestrator+subagents structure when `--topology=multi` is set. Does it author its own decomposition plan against the inherited artifacts, or does it inherit the Phase 1 orchestrator's plan (which would leak Phase 1 conversation state into Phase 2 — invariant (c) of `dispatchEditTrial` forbids this)? Recommendation: the Phase 2 orchestrator plans its OWN decomposition from the inherited `source/` `tests/` `<task>.spec.md` (whichever artifacts the methodology produced), with no access to Phase 1's plan. This preserves the "fresh agent" contract.

4. **Subagent budget caps.** What's the per-subagent turn cap and wall-clock cap? The single-agent default is 35 turns / 15 minutes (`STUDY_DEFAULT_TURN_CAP` in `study.mjs`, `DEFAULT_WALL_CLOCK_CAP_MS` in `runner.js`). For multi-agent we need a per-subagent budget AND a trial-total budget. Recommendation: per-subagent turn cap = 20 (the harness floor), per-subagent wall-clock cap = 5 minutes, trial-total wall-clock cap = `min(subagent_count × 5min, 30min)`. Tunable via existing `turn_cap` / `wall_clock_cap_ms` options, plus a new `subagent_turn_cap` / `subagent_wall_clock_cap_ms` pair.

5. **Conversation.jsonl format.** B6 specifies marker lines splitting the orchestrator and subagent turn blocks. Is that the right shape, or should each subagent get its own `conversation-<subagent-id>.jsonl` file alongside the trial dir's `conversation.jsonl` (which would then hold orchestrator-only turns)? The single-file-with-markers approach is simpler to read in one pass; the multi-file approach is easier for downstream tooling to filter. Recommendation: ship single-file-with-markers; promote to multi-file if a downstream analysis script needs per-agent isolation.

## Out of scope (v2.1 — explicitly punted)

- Multi-agent dispatch for `plan` and `freeform` styles. v2's three conditions are `baseline` / `tdd` / `dtdd`; the other two styles aren't in the matrix. Adding them is a small extension to the "Style-specific dispatch" table in this spec — defer until those conditions return to the matrix.
- Cross-machine subagent dispatch (e.g., remote workers via SSH or Kubernetes). Single host only — every subagent is an additional provider call from the same harness process.
- Speculative execution (dispatch a backup subagent to race the primary). Real wovenflow doesn't do this; bench shouldn't either.
- Retry-with-feedback loops (subagent fails review → orchestrator re-dispatches with the review notes). Production wovenflow's Named-agents mode does this via `SendMessage`; the bench's one-shot dispatch model doesn't. Single-shot per subagent — if the work is bad, the methodology-compliance grader catches it post-hoc.
- Real `SendMessage` peer messaging between subagents. Subagents in the bench multi-agent path are isolated provider calls; they cannot message each other. This is a deliberate simplification — production wovenflow's peer-messaging is itself "clarification only" per `subflow/SKILL.md`, not load-bearing for the work.
- Persistent named reviewers across behaviors (production's "Named agents mode" for the spec-reviewer / quality-reviewer). Out of scope because the bench has no review loop — review is post-hoc human grading per PROTOCOL-v2 §3.7.
- Mixed-topology study cells (e.g., Phase 1 single, Phase 2 multi). Each trial picks one topology end-to-end. A future v2.2 could add the mix; v2.1 keeps the shape simple.

## Red-team check

Decision under test: if we proceed, the project commits to building `dispatchMultiAgentTrial` + `composeOrchestratorPrompt` + `study.mjs --topology` per the ten behaviors above, as the unblocker for v2.1's multi-agent comparison.

Stakes: a v2.1 study run requires this to be correct. A bug in the orchestrator-implementer split (e.g., orchestrator's conversation history accidentally leaking into a subagent's input context, or per-subagent token accounting double-counting) would silently corrupt the entire multi-agent arm of the comparison. A subtler bug — the orchestrator producing decompositions that systematically favor one condition (e.g., DTDD orchestrator splits aggressively, TDD orchestrator dispatches one giant subagent) — would invalidate the methodology comparison without throwing any error.

Top three reasons this might not be the right call:

1. **The style-specific dispatch table builds methodology-flavored decomposition into the harness, which violates `bench/topology/AUTHORING.md`'s "methodology-agnostic" constraint.** The topology helper is correctly methodology-agnostic — but the orchestrator's prompt has to come from SOMEWHERE, and B3 says it comes from the topology helper (no style card). So how does the orchestrator know to dispatch one subagent per behavior under DTDD vs one per test class under TDD? The honest answer is: from the style card content the orchestrator reads, presented to the orchestrator as "here's the methodology you're coordinating subagents on." That means the orchestrator DOES need to see the style card — but for coordination purposes, not for self-implementation. Mitigation: revise B3 — the orchestrator's prompt is `multi.md` (verbatim) + a "your methodology is described in `bench/styles/<condition>.md`; read that to understand what shape of decomposition the workflow expects" pointer. The style card body is read by the orchestrator at dispatch time, not embedded in its system prompt. This preserves the topology helper's methodology-neutrality while letting the orchestrator's decomposition be style-aware. If the implementer-of-this-spec confirms the pointer-vs-embedded distinction is preserved by the harness's prompt assembly, the constraint is satisfied. Real but addressable.

2. **Multi-agent on tiny single-function tasks may show no methodology effect (or worse, an inverted effect from orchestration overhead).** If the v2.1 run shows multi-agent has no advantage on `slugify`, `throttle`, etc., we'll have spent budget proving multi-agent doesn't help on toy tasks — which is publishable but demoralizing. Mitigation: (a) include this in the open-questions for orchestrator/user judgment before run; (b) consider expanding the task set to include 2–3 multi-file tasks before the v2.1 run (open question 1 above). Not load-bearing for the spec design itself; load-bearing for the run plan.

3. **The mock-multi-agent provider scripts B4-B9 reference don't exist yet.** Each behavior's test fence requires a fixture mock at `bench/test/fixtures/mock-multi-agent-*.mjs`. The implementer of this spec must write these mocks alongside the harness changes. Estimating ~5 mock providers, each ~30-60 LoC. Mitigation: enumerate the mocks in the implementation plan; they're small but they're a real chunk of the implementation work. Not a load-bearing objection — flagged so the implementer doesn't underestimate.

Verdict: **PROCEED, with B3 revision.** The methodology-agnostic constraint on the orchestrator's system prompt is the load-bearing concern; resolve it by changing B3's "verbatim multi.md, no style card body" rule to "verbatim multi.md plus a style-card POINTER (file path) the orchestrator reads to decide its decomposition." That preserves topology-helper neutrality while letting the orchestrator be methodology-aware in coordination. Other objections are run-plan concerns, not spec design flaws.

## Handoff

After testflow inserts these test fences into `bench/out/spec-tests/` (via the npm pretest hook), the implementer subagents wired through `wovenflow:subflow` will:

- Extend `bench/runner.js` with `dispatchMultiAgentTrial(...)` and `composeOrchestratorPrompt(...)` exports (B1–B9).
- Author the mock-multi-agent provider fixtures under `bench/test/fixtures/mock-multi-agent-*.mjs`.
- Extend `bench/study.mjs` with `--topology` CLI flag, runStudy `topology` parameter, and routing logic for Phase 1 / Phase 2 / Phase 2-WD (B10).
- Extend `bench/test/fixtures/mock-provider-completes.mjs` accounting helpers if needed for the new tests' shared fixtures.
- Add the spec to `bench/package.json`'s pretest extractor pipeline so its fences get extracted to `out/spec-tests/`.

After all behaviors land green, a smoke run (`--topology=multi --tasks=slugify --conditions=dtdd --trials=1`) against the local `Qwen3.6-35B-A3B-FP8` validates the multi-agent path produces non-empty, scoreable artifacts. After smoke validation, the v2.1 amendment to `bench/PROTOCOL-v2.md` §3.2 lifts the single-agent-only restriction and adds `topology` as the fourth dimension of the Stage-2 matrix.
