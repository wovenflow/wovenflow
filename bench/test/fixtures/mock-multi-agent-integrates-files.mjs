// Mock multi-agent provider for B6: orchestrator dispatches three subagents,
// each writing files; the trial dir merges them and the conversation.jsonl
// contains exactly three "subagent <id> turns follow" markers.
//
// S1 writes index.js with content "from S1".
// S2 writes index.js with content "from S2" (later in dispatch order — wins).
// S3 writes a tests/ file.

export async function runTrial({ role, subagent_id, system_prompt, user_message }) {
  if (role === 'orchestrator') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[orchestrator] decomposed into S1, S2, S3' },
      ],
      source_files: {},
      test_files: {},
      tokens_input: 100,
      tokens_output: 50,
      stop_reason: 'done',
      model_id: 'mock-multi-integrates-files',
      subagent_dispatches: [
        { id: 'S1', system_prompt: 'sub-system', user_message: 'write index.js v1', tools: [] },
        { id: 'S2', system_prompt: 'sub-system', user_message: 'overwrite index.js v2', tools: [] },
        { id: 'S3', system_prompt: 'sub-system', user_message: 'write tests', tools: [] },
      ],
    };
  }

  if (subagent_id === 'S1') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[S1] wrote index.js (from S1)' },
      ],
      source_files: { 'index.js': '// from S1\nexport function fn() { return 1; }\n' },
      test_files: {},
      tokens_input: 10,
      tokens_output: 5,
      stop_reason: 'done',
      model_id: 'mock-multi-integrates-files',
    };
  }
  if (subagent_id === 'S2') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[S2] overwrote index.js (from S2)' },
      ],
      source_files: { 'index.js': '// from S2 (overrides S1)\nexport function fn() { return 2; }\n' },
      test_files: {},
      tokens_input: 10,
      tokens_output: 5,
      stop_reason: 'done',
      model_id: 'mock-multi-integrates-files',
    };
  }
  // S3
  return {
    conversation: [
      { role: 'system', content: system_prompt ?? '' },
      { role: 'user', content: user_message ?? '' },
      { role: 'assistant', content: '[S3] wrote tests' },
    ],
    source_files: {},
    test_files: {
      'index.test.js':
        "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { fn } from '../source/index.js';\ntest('fn', () => assert.equal(typeof fn, 'function'));\n",
    },
    tokens_input: 10,
    tokens_output: 5,
    stop_reason: 'done',
    model_id: 'mock-multi-integrates-files',
  };
}
