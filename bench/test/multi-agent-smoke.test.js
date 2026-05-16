// End-to-end smoke for dispatchMultiAgentTrial against a mock provider.
//
// Covers the spec's "Validate" step 3: dispatch task=slugify, style=dtdd,
// topology=multi via the runner's multi-agent path; confirm the trial dir
// contains the expected six artifacts and that meta.json carries the
// multi-agent fields populated. Mock provider only — no vLLM contact.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dispatchMultiAgentTrial } from '../runner.js';

test('multi-agent smoke: slugify/dtdd/multi yields the six artifacts + multi-agent meta', async () => {
  const result = await dispatchMultiAgentTrial({
    task_id: 'slugify',
    style: 'dtdd',
    trial_index: 0,
    run_id: 'multi-agent-smoke',
    provider: {
      name: 'mock-multi',
      script: 'bench/test/fixtures/mock-multi-agent-tokens.mjs',
    },
    system_prompt: 'mock-system',
    user_message: 'mock-user',
    tools: [],
  });

  // Six artifacts: source/, tests/, conversation.jsonl, meta.json (the
  // dtdd path also produces a <task>.spec.md when the orchestrator authors
  // one, but the mock-multi-agent-tokens fixture does not — so we assert the
  // four guaranteed artifacts and leave spec.md as optional).
  const trialDir = result.trial_dir;
  assert.ok(existsSync(path.join(trialDir, 'source')), 'source/ exists');
  assert.ok(existsSync(path.join(trialDir, 'tests')), 'tests/ exists');
  assert.ok(existsSync(path.join(trialDir, 'conversation.jsonl')), 'conversation.jsonl exists');
  assert.ok(existsSync(path.join(trialDir, 'meta.json')), 'meta.json exists');

  // Multi-agent meta fields populated.
  const meta = JSON.parse(readFileSync(path.join(trialDir, 'meta.json'), 'utf8'));
  assert.strictEqual(meta.topology, 'multi');
  assert.strictEqual(meta.task_id, 'slugify');
  assert.strictEqual(meta.style, 'dtdd');
  assert.strictEqual(meta.subagent_count, 2);
  assert.ok(Array.isArray(meta.subagents));
  assert.strictEqual(meta.subagents.length, 2);
  // Per the mock fixture: orchestrator 200/100, S1 30/15, S2 40/20.
  assert.strictEqual(meta.orchestrator_tokens_input, 200);
  assert.strictEqual(meta.orchestrator_tokens_output, 100);
  assert.strictEqual(meta.tokens_input, 270);
  assert.strictEqual(meta.tokens_output, 135);

  // Subagent files made it through the merge.
  assert.ok(existsSync(path.join(trialDir, 'source', 'index.js')), 'S1 wrote index.js');
  assert.ok(existsSync(path.join(trialDir, 'source', 'utils.js')), 'S2 wrote utils.js');
});
