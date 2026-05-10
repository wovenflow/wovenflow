# Bench provider extension spec

Extends the DTDD bench harness (`doc/specs/2026-05-10-dtdd-bench.spec.md`) with **live LLM dispatch** and a **pluggable provider** so the bench can run against either Claude (the protocol's primary) or a local open-weights coding model served via an OpenAI-compatible endpoint (the open-LLM baseline per `bench/PROTOCOL.md` §3.4).

The current harness's `dispatchTrial` (B2 of the main bench spec) returns dispatch metadata in dry-run mode but does not yet make real LLM calls. This spec adds the live path and the provider abstraction together — both are needed for any actual run.

## User stories

- **As the bench operator**, I want to run a real trial against Claude with a single env-free invocation so the protocol's primary baseline is reproducible without me re-wiring code.
- **As an external reproducer**, I want to run the same trial against a local open-weights model with no API spend so the protocol's open-LLM baseline is feasible at any future point with electricity-only cost.
- **As a reviewer**, I want every trial's metadata to record which provider, endpoint, and model produced it so per-provider results can be stratified in the final report.
- **As an extender**, I want the provider abstraction shaped so adding a third provider (e.g., a hosted Llama service) is mostly a per-provider config change, not a runner rewrite.

## Behaviors

### B1: dispatchTrial supports a live mode that captures real LLM output
∵ **IF** `dispatchTrial` is called with `dry_run: false` and the resolved provider config is well-formed
↦ **WHEN** the trial runs to completion
∴ **THEN** the runner makes real LLM calls per the resolved provider, records the full conversation as `bench/results/<run-id>/<trial-id>/conversation.jsonl`, writes any agent-produced source under `source/`, writes any agent-produced tests under `tests/`, and returns the trial-id with stop-reason metadata

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dispatchTrial } from '../bench/runner.js';

test('B1: live trial captures conversation and writes source + tests dirs', async () => {
  const result = await dispatchTrial({
    task_id: 'slugify',
    style: 'tdd',
    topology: 'single',
    trial_index: 0,
    dry_run: false,
    provider: { name: 'mock', script: 'bench/test/fixtures/mock-provider-completes.mjs' },
    run_id: 'b1-test',
  });
  const trialDir = `bench/results/b1-test/${result.trial_id}`;
  assert.ok(fs.existsSync(`${trialDir}/conversation.jsonl`), 'conversation.jsonl missing');
  assert.ok(fs.existsSync(`${trialDir}/source`), 'source/ missing');
  assert.ok(fs.existsSync(`${trialDir}/tests`), 'tests/ missing');
  const meta = JSON.parse(fs.readFileSync(`${trialDir}/meta.json`, 'utf8'));
  assert.ok(['done', 'turn-cap', 'time-cap', 'error'].includes(meta.stop_reason));
});
```

### B2: Provider selection routes via BENCH_PROVIDER + BENCH_PROVIDER_PROTOCOL env vars
∵ **IF** the env var `BENCH_PROVIDER` is unset or set to `"anthropic"`
↦ **WHEN** a live trial dispatches
∴ **THEN** the runner uses the Anthropic SDK with `model_id` from the protocol's run config and the standard Claude Code tool surface

∵ **IF** `BENCH_PROVIDER` is set to `"openai-compatible"` AND `BENCH_PROVIDER_URL` and `BENCH_PROVIDER_MODEL` are both set AND `BENCH_PROVIDER_PROTOCOL` is set to `"openai-chat-completions"` (the v1 default; further variants like `"ollama-native"`, `"llama-cpp-grammar"`, etc. are reserved for future adapter additions)
↦ **WHEN** a live trial dispatches
∴ **THEN** the runner POSTs chat-completion requests to `<BENCH_PROVIDER_URL>/chat/completions` with `BENCH_PROVIDER_MODEL` as the model id, using the protocol-variant's expected function-calling shape; returns the same trial-id and metadata shape

∵ **IF** `BENCH_PROVIDER` is set to an unrecognized value, OR `openai-compatible` is selected with any of `BENCH_PROVIDER_URL` / `BENCH_PROVIDER_MODEL` / `BENCH_PROVIDER_PROTOCOL` missing or unsupported
↦ **WHEN** the runner attempts to resolve the provider
∴ **THEN** it throws `ProviderConfigError` with the missing-or-invalid field named, before dispatching any trial

The `BENCH_PROVIDER_PROTOCOL` env var is the deliberate honesty mechanism. "OpenAI-compatible" is aspirational across local-server backends — Ollama, llama.cpp server, vLLM, and LM Studio each return tool calls in slightly different shapes. The variant string forces the operator to name which they're using and lets the runner pick the right adapter. Initial implementation supports only `openai-chat-completions`; additional variants land as separate adapter modules.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProvider, ProviderConfigError } from '../bench/runner.js';

test('B2: unset BENCH_PROVIDER resolves to anthropic with protocol model_id', () => {
  const r = resolveProvider({ env: {}, protocol_model_id: 'claude-sonnet-4-6' });
  assert.equal(r.name, 'anthropic');
  assert.equal(r.model_id, 'claude-sonnet-4-6');
});

test('B2: openai-compatible requires URL, MODEL, and PROTOCOL', () => {
  const r = resolveProvider({
    env: {
      BENCH_PROVIDER: 'openai-compatible',
      BENCH_PROVIDER_URL: 'http://localhost:11434/v1',
      BENCH_PROVIDER_MODEL: 'qwen2.5-coder:32b',
      BENCH_PROVIDER_PROTOCOL: 'openai-chat-completions',
    },
  });
  assert.equal(r.name, 'openai-compatible');
  assert.equal(r.endpoint_url, 'http://localhost:11434/v1');
  assert.equal(r.model_id, 'qwen2.5-coder:32b');
  assert.equal(r.protocol_variant, 'openai-chat-completions');
});

test('B2: unrecognized BENCH_PROVIDER throws ProviderConfigError', () => {
  assert.throws(
    () => resolveProvider({ env: { BENCH_PROVIDER: 'cohere-experimental' } }),
    ProviderConfigError,
  );
});

test('B2: openai-compatible without BENCH_PROVIDER_PROTOCOL throws', () => {
  assert.throws(
    () => resolveProvider({
      env: {
        BENCH_PROVIDER: 'openai-compatible',
        BENCH_PROVIDER_URL: 'http://localhost:11434/v1',
        BENCH_PROVIDER_MODEL: 'qwen2.5-coder:32b',
      },
    }),
    /BENCH_PROVIDER_PROTOCOL/,
  );
});
```

### B3: Trial metadata records provider info
∵ **IF** any trial completes under any provider
↦ **WHEN** the runner writes `meta.json` per `B3` of the main bench spec
∴ **THEN** `meta.json` additionally includes `provider` (string: `"anthropic"` or `"openai-compatible"`), `endpoint_url` (string or null — null for Anthropic), and `model_id` (the resolved id at trial time, captured from the API response when available so silent point-updates are visible)

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dispatchTrial } from '../bench/runner.js';

test('B3: meta.json records provider, endpoint_url, model_id', async () => {
  const result = await dispatchTrial({
    task_id: 'slugify',
    style: 'tdd',
    topology: 'single',
    trial_index: 0,
    dry_run: false,
    provider: {
      name: 'openai-compatible',
      endpoint_url: 'http://localhost:11434/v1',
      model_id: 'qwen2.5-coder:32b',
      script: 'bench/test/fixtures/mock-provider-completes.mjs',
    },
    run_id: 'b3-test',
  });
  const meta = JSON.parse(
    fs.readFileSync(`bench/results/b3-test/${result.trial_id}/meta.json`, 'utf8'),
  );
  assert.equal(meta.provider, 'openai-compatible');
  assert.equal(meta.endpoint_url, 'http://localhost:11434/v1');
  assert.equal(meta.model_id, 'qwen2.5-coder:32b');
});
```

### B4: When multiple providers are present, the reporter renders one report per provider plus an index
∵ **IF** a run's trial directory contains trials from more than one distinct provider
↦ **WHEN** `generateReport` runs (B8 of the main bench spec)
∴ **THEN** it produces `bench/results/<run-id>/report-<provider>.md` for each provider in the run (each report shaped exactly like the single-provider report from the main bench spec) plus `bench/results/<run-id>/index.md` linking to each per-provider report and naming every `(provider, endpoint_url, model_id)` triple seen

If only one provider's trials are present, the report shape is unchanged from the main bench spec — `report.md` is produced as before.

Cross-provider analysis (e.g., "did DTDD's effect size differ between Claude and the local model?") is an explicit follow-up artifact authored separately, not built into the reporter. The reporter's job is per-provider clarity; cross-provider comparison is a downstream concern.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateReport } from '../bench/reporter.js';

test('B4: multi-provider run produces per-provider reports + index', async () => {
  await generateReport({ run_dir: 'bench/test/fixtures/run-multi-provider/' });
  const dir = 'bench/test/fixtures/run-multi-provider/';
  assert.ok(fs.existsSync(`${dir}/report-anthropic.md`), 'report-anthropic.md missing');
  assert.ok(fs.existsSync(`${dir}/report-openai-compatible.md`), 'report-openai-compatible.md missing');
  assert.ok(fs.existsSync(`${dir}/index.md`), 'index.md missing');
  const index = fs.readFileSync(`${dir}/index.md`, 'utf8');
  assert.match(index, /report-anthropic\.md/);
  assert.match(index, /report-openai-compatible\.md/);
});

test('B4: single-provider run produces single report.md, no index', async () => {
  const path = await generateReport({ run_dir: 'bench/test/fixtures/run-scored/' });
  assert.match(path, /report\.md$/);
});
```

### B5: Stop conditions apply identically across providers, with named per-provider enforcement mechanisms
∵ **IF** a live trial is running under any provider
↦ **WHEN** the agent declares done, OR the turn cap (20 turns) is reached, OR the wall-clock cap (15 minutes) is reached, OR the provider returns a fatal error
∴ **THEN** the runner stops the trial and records `stop_reason` in `meta.json` as one of `done` / `turn-cap` / `time-cap` / `error` — the same observable enforcement regardless of provider, computed by the runner

Per-provider enforcement mechanism (documented because cross-provider sameness is non-trivial):

- **Anthropic provider:** turn cap is counted by the runner per dispatched message; wall-clock cap is enforced via streaming-callback cancellation on the in-flight `messages.create` call.
- **OpenAI-compatible provider:** turn cap is counted per HTTP round-trip; wall-clock cap is enforced via `AbortController` on the in-flight `fetch`. Local model inference can be slow; if the provider does not respect the abort within a 30-second grace period, the runner force-terminates the trial as `error` with reason `"provider abort timeout"`.

Both mechanisms are unit-tested with mock providers so the spec's "identical observable behavior" claim is verifiable.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dispatchTrial } from '../bench/runner.js';

test('B5: turn cap stops trial at 20 turns regardless of provider', async () => {
  for (const provider of ['mock-anthropic-loop', 'mock-openai-loop']) {
    const result = await dispatchTrial({
      task_id: 'slugify',
      style: 'tdd',
      topology: 'single',
      trial_index: 0,
      dry_run: false,
      provider: { name: provider, script: `bench/test/fixtures/${provider}.mjs` },
      run_id: `b5-turn-${provider}`,
    });
    const meta = JSON.parse(
      fs.readFileSync(`bench/results/b5-turn-${provider}/${result.trial_id}/meta.json`, 'utf8'),
    );
    assert.equal(meta.stop_reason, 'turn-cap', `${provider} did not stop at turn cap`);
  }
});

test('B5: wall-clock cap stops slow OpenAI-compatible trial as time-cap or error within grace window', async () => {
  const result = await dispatchTrial({
    task_id: 'slugify',
    style: 'tdd',
    topology: 'single',
    trial_index: 0,
    dry_run: false,
    provider: { name: 'mock-openai-slow', script: 'bench/test/fixtures/mock-openai-slow.mjs' },
    wall_clock_cap_ms: 100, // shrunk for the test
    run_id: 'b5-time',
  });
  const meta = JSON.parse(
    fs.readFileSync(`bench/results/b5-time/${result.trial_id}/meta.json`, 'utf8'),
  );
  assert.ok(['time-cap', 'error'].includes(meta.stop_reason), `stop_reason was ${meta.stop_reason}`);
});
```

## Where it lives

- This spec: `doc/specs/2026-05-10-bench-provider.spec.md`
- Source extensions:
  - `bench/runner.js` — extended `dispatchTrial` with live mode + provider routing
  - `bench/providers/anthropic.js` — Anthropic SDK adapter
  - `bench/providers/openai-compatible.js` — HTTP adapter for OpenAI-compatible endpoints
  - `bench/reporter.js` — extended `generateReport` with provider stratification
- New error type: `ProviderConfigError` exported from `bench/runner.js` alongside `ProtocolValidationError`

## Rules

- **No DTDD-specific tooling auto-injected by either provider.** B2 of the main bench spec rules apply; the provider abstraction does not change them.
- **Provider tool support is best-effort with documented gaps.** Local open-weights models have varying function-calling quality. Where a provider cannot reliably emit a tool call the bench would otherwise expect, the runner records the gap in `meta.json` under `provider_tool_gaps` rather than failing the trial. The bench's report flags any run with non-empty tool gaps as having reduced cross-provider comparability.
- **Trial isolation is per-trial regardless of provider.** Each trial gets a fresh worktree per the main bench spec; the provider abstraction does not change worktree mechanics.

## Handoff to testflow

Once the prose is locked **and** the red-team check returns PROCEED, invoke `testflow` to insert inline test fences alongside each behavior.

## Red-team check (2026-05-10, after one revision pass)

**Decision under test:** If we proceed, this project commits to extending the bench harness with live LLM dispatch and a two-provider abstraction (Anthropic + OpenAI-compatible) along the contract above, before any actual bench run.

**Stakes:** ~3-5 implementer-subagent dispatches; the abstraction shape is load-bearing for future protocol amendments. If wrong, the harness re-spec's later — manageable. If implementation cuts corners on provider-tool-support, cross-provider comparison becomes unreliable.

### Pass 1 (revised here)

The first red-team pass surfaced three objections that drove revisions to B2, B4, and B5:

- **Objection 1 (cross-provider stop-condition enforcement was hand-wavy):** B5 now documents per-provider enforcement explicitly — Anthropic via streaming-callback cancellation, OpenAI-compatible via `AbortController` with a 30s grace period before force-termination as `error`. Mock-provider unit tests verify identical observable behavior.
- **Objection 2 (single `openai-compatible` value papered over real server-variant heterogeneity):** B2 now requires a `BENCH_PROVIDER_PROTOCOL` env var naming the variant. Initial implementation supports only `"openai-chat-completions"`; further variants land as separate adapter modules. Spec is now honest about the heterogeneity.
- **Objection 3 (per-style × per-provider stratified table was too heavy a reporter change):** B4 now renders one report.md per provider plus an index file when multiple providers are present. Cross-provider comparison is an explicit follow-up artifact, not built into the reporter.

### Pass 2

After the revisions above, the spec is re-examined.

1. **B6 / "tool gaps" rule under "Rules" section is implicit; should be promoted to a behavior or removed.** *(severity: worth-noting, confidence: medium, angle: approach)*
   The Rules section says: "Where a provider cannot reliably emit a tool call the bench would otherwise expect, the runner records the gap in `meta.json` under `provider_tool_gaps`." That's contract material — it shapes how trials are interpreted later — but it's not testable from any of B1-B5. Either promote it to a behavior (B6) with a test, or move it to PROTOCOL.md as a known-limitation policy. Ambiguous half-rules that feel binding but aren't tested are a smell. Anchored to: the "Rules" section's `provider_tool_gaps` line.

2. **The spec doesn't say which side dictates the model_id when both the protocol and the env vars carry one.** *(severity: worth-noting, confidence: high, angle: coupling)*
   PROTOCOL.md §3.4 names `claude-sonnet-4-6` as the protocol's model_id. B2 says the Anthropic provider uses "`model_id` from the protocol's run config." But what about the OpenAI-compatible path — does `BENCH_PROVIDER_MODEL` override the protocol, or does the protocol override the env var? Most plausibly, the env var wins for that provider (because the protocol's model_id is Claude-specific), but the spec should say so explicitly. Anchored to: B2's silent treatment of the protocol vs env-var precedence.

3. **B4's "one report per provider" is right, but the index file's contract is underspecified.** *(severity: minor, confidence: medium, angle: audience)*
   What goes in `index.md`? Just links? Or a high-level summary table? Implementers will guess; a spec-locked answer prevents drift. Suggest: minimum is a bulleted list naming each provider + its triple + a relative link. Reporter implementer can extend, but the floor is fixed. Anchored to: B4's `index.md linking to each per-provider report and naming every (provider, endpoint_url, model_id) triple seen`.

### Verdict

**PROCEED** — All three pass-2 objections are non-load-bearing; they map to small clarifications that can land in implementation without spec revisions:

- Objection 1 → move the `provider_tool_gaps` line out of Rules and into PROTOCOL.md as a documented limitation; or add a B6 behavior. The implementer should make the call when implementing B3 (since `meta.json` shape is at stake there).
- Objection 2 → resolve via implementation: per-provider model_id wins over protocol model_id when env vars are set; document in the implementer's commit message and the harness README.
- Objection 3 → reporter implementer fixes a minimum index.md shape (bulleted list + triples + relative links) per the spec's hint.

Hand off to **testflow** to insert inline test fences alongside each behavior.
