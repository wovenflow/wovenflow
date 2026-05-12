# dispatchEditTrial: accept system_prompt + tools from caller

## User stories

- As the bench operator, I want Phase 2 trials to receive the same composed `system_prompt` + `tools` that Phase 1 trials receive (style card + tool-usage directives + write_source/write_test function definitions), so that the Phase 2 fresh agent can actually invoke tools to write its updated source rather than being handed an empty tool array and a placeholder system prompt.

## Context

The 2026-05-12 smoke against `Qwen/Qwen3.6-35B-A3B-FP8` produced **Phase 1: 8/8 hidden_pass** but **Phase 2 / Phase 2-WD: 0/1** (file-failed-to-load — no source written). Root cause: `dispatchEditTrial` in `bench/runner.js` (lines 1086-1088 of the current main) hardcodes:

```js
system_prompt: `phase: ${phase}\ntask: ${task_id}\nname: ${name}`,  // placeholder
user_message: userMessage,
tools: [],                                                            // empty!
```

— so the Phase 2 agent has no write tools. `runStudy` calls `dispatchEditTrial({phase1_trial_dir, task_id, include_original_description, run_id, turn_cap})` but doesn't pass any prompt content; the harness's defaults take over and the agent can't write files.

This spec adds the missing pass-through: `dispatchEditTrial` accepts optional `system_prompt` and `tools` options, and `runStudy` composes them via the existing `composePrompt` and forwards them.

## Behaviors

### B1: dispatchEditTrial accepts and forwards `system_prompt` and `tools`
∵ **IF** `dispatchEditTrial` is called with `system_prompt` and `tools` options provided in the options bag (non-dry-run, valid Phase 1 trial dir, etc.)
↦ **WHEN** the live dispatch path runs (`mod.runTrial(...)`)
∴ **THEN** the provider's `runTrial` receives those exact `system_prompt` and `tools` values (not the placeholder `phase: ... task: ... name: ...` and not `[]`). When `system_prompt` / `tools` are absent in the call, the existing placeholder behavior is preserved (back-compat). The result returned by `dispatchEditTrial` is unchanged in shape

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchEditTrial } from '../../runner.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('B1: dispatchEditTrial forwards system_prompt and tools to provider', async () => {
  // Synthesize a Phase 1 trial dir with the minimum that passes invariants.
  const repo = process.cwd();
  const phase1Root = mkdtempSync(path.join(tmpdir(), 'b1-edit-passthrough-'));
  const phase1Dir = path.join(phase1Root, 'slugify-dtdd-single-0');
  mkdirSync(path.join(phase1Dir, 'source'), { recursive: true });
  mkdirSync(path.join(phase1Dir, 'tests'), { recursive: true });
  writeFileSync(path.join(phase1Dir, 'source', 'index.js'), 'export function slugify(s){return s.toLowerCase()}');

  // Capture what the provider's runTrial sees.
  const captured = {};
  const fakeProviderModule = {
    runTrial: async (args) => {
      captured.system_prompt = args.system_prompt;
      captured.tools = args.tools;
      return {
        conversation: [{role:'system', content: args.system_prompt}],
        source_files: { 'index.js': 'export function slugify(s){return s.toLowerCase()}' },
        test_files: {},
        tokens_input: 1, tokens_output: 1,
        stop_reason: 'done',
        model_id: 'mock',
      };
    },
  };

  // Inject the fake provider via the provider script path; resolveProvider supports script: fields.
  const fakeScript = path.join(phase1Root, 'fake-provider.mjs');
  writeFileSync(
    fakeScript,
    `export async function runTrial(args){ ` +
    `  const fs = await import('node:fs'); ` +
    `  fs.writeFileSync(${JSON.stringify(path.join(phase1Root, 'captured.json'))}, JSON.stringify({system_prompt: args.system_prompt, tools: args.tools, tools_len: (args.tools||[]).length})); ` +
    `  return { conversation: [], source_files: {'index.js':'export function slugify(s){return s}'}, test_files: {}, tokens_input:1, tokens_output:1, stop_reason:'done', model_id:'mock' }; ` +
    `}`,
  );

  const customSystemPrompt = '# Custom system prompt for Phase 2\nThis is the composed prompt the orchestrator passes.';
  const customTools = [
    { type: 'function', function: { name: 'write_source', description: 'd', parameters: { type: 'object', properties: { path: {type:'string'}, content: {type:'string'} }, required: ['path','content'] } } },
    { type: 'function', function: { name: 'write_test',   description: 'd', parameters: { type: 'object', properties: { path: {type:'string'}, content: {type:'string'} }, required: ['path','content'] } } },
  ];

  try {
    await dispatchEditTrial({
      phase1_trial_dir: phase1Dir,
      task_id: 'slugify',
      include_original_description: false,
      run_id: 'b1-passthrough',
      system_prompt: customSystemPrompt,
      tools: customTools,
      provider: {
        name: 'openai-compatible',
        script: fakeScript,
        endpoint_url: 'http://fake',
        model_id: 'fake',
        protocol_variant: 'openai-chat-completions',
      },
    });

    const fs = await import('node:fs');
    const captured = JSON.parse(fs.readFileSync(path.join(phase1Root, 'captured.json'), 'utf8'));
    assert.strictEqual(captured.system_prompt, customSystemPrompt, 'provider must receive the caller-supplied system_prompt');
    assert.strictEqual(captured.tools_len, 2, 'provider must receive the caller-supplied tools (length 2)');
  } finally {
    rmSync(phase1Root, { recursive: true, force: true });
  }
});
```

### B2: runStudy composes Phase 2 prompts via composePrompt and forwards them
∵ **IF** `runStudy` is invoked in dry-run mode with concrete tasks and conditions
↦ **WHEN** it returns the plan
∴ **THEN** the plan includes a `phase2_prompt_composer` indicator (boolean or descriptor) confirming that the live-mode runStudy WILL compose Phase 2 prompts via composePrompt. Specifically: the plan has a top-level field `phase2_inherits_prompt_from_phase1: true`. (We only assert that the orchestrator commits to passing prompts through. The actual live integration is tested via B1 above plus the end-to-end smoke; we don't need to dispatch real Phase 1 to validate the plan.)

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStudy } from '../../study.mjs';

test('B2: runStudy dry-run plan declares phase2_inherits_prompt_from_phase1', async () => {
  const plan = await runStudy({
    run_id: 'b2-phase2-prompt-passthrough',
    tasks: ['slugify'],
    conditions: ['dtdd'],
    trials: 1,
    dry_run: true,
  });
  assert.strictEqual(plan.phase2_inherits_prompt_from_phase1, true,
    'plan must declare that Phase 2 inherits the composed prompt from Phase 1');
});
```

## Red-team check

Decision: extend `dispatchEditTrial` with optional `system_prompt` and `tools` pass-through; wire `runStudy` to populate them via `composePrompt`.

Top three reasons this might not be the right call:

1. **The Phase 2 agent receives the EXACT same style card as Phase 1, but Phase 2 is a different cognitive task (editing inherited code, not implementing from scratch).** A DTDD-styled Phase 2 prompt may still be optimal (the methodology says: update the spec.md alongside the code), but a TDD-styled Phase 2 may need different framing (the inherited tests should be extended, not rewritten). Mitigation: the bench's PROTOCOL-v2.md §3.2 explicitly inherits the style card across phases; this is methodologically correct per the pre-registration. If a future amendment splits "phase-1 prompt" from "phase-2 prompt" per condition, that's a separate spec. Not load-bearing.
2. **Adding two new options to dispatchEditTrial's signature expands an already-large function.** Mitigation: both are optional with back-compat defaults; tests verify both paths. The signature grows by two strings; the function body grows by zero lines once you swap `tools: []` for `tools: tools ?? []` and `systemPrompt = ...` for `systemPrompt = system_prompt ?? ...`. Acceptable.
3. **B2's "phase2_inherits_prompt_from_phase1: true" flag is a synthetic assertion — it doesn't prove the live path actually composes correctly.** Mitigation: B1 directly asserts the provider sees the caller-supplied `system_prompt` and `tools`; B2 just asserts the orchestrator's commitment to using that path. The end-to-end correctness is verified by the live smoke (Phase 2 non-empty source/ scoring >0). Acceptable.

Verdict: **PROCEED.** Both behaviors are small, both have direct assertions, both target the specific live-smoke failure.

## Handoff

After testflow wires this spec into pretest, subflow: (a) extends `dispatchEditTrial` in `bench/runner.js` to accept `system_prompt` and `tools` options with back-compat defaults; (b) updates `runStudy` in `bench/study.mjs` to call `composePrompt` for each Phase 2 entry and forward `system_prompt` + `tools` (plus exposes the `phase2_inherits_prompt_from_phase1: true` flag in the dry-run plan).
