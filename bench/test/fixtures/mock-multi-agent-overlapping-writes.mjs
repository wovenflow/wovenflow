// Mock multi-agent provider for B9: orchestrator dispatches three subagents
// whose source_files maps include overlapping paths. S1 and S2 both write
// index.js; S3 writes utils.js. Per the merge policy in B6 and B9,
// last-writer-wins in dispatch order — S2's index.js content survives.

export async function runTrial({ role, subagent_id, system_prompt, user_message }) {
  if (role === 'orchestrator') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[orchestrator] dispatching S1, S2, S3' },
      ],
      source_files: {},
      test_files: {},
      tokens_input: 100,
      tokens_output: 50,
      stop_reason: 'done',
      model_id: 'mock-multi-overlapping-writes',
      subagent_dispatches: [
        { id: 'S1', system_prompt: 'sub', user_message: 'write index.js v1', tools: [] },
        { id: 'S2', system_prompt: 'sub', user_message: 'overwrite index.js v2', tools: [] },
        { id: 'S3', system_prompt: 'sub', user_message: 'write utils.js', tools: [] },
      ],
    };
  }
  if (subagent_id === 'S1') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[S1] wrote index.js v1' },
      ],
      source_files: { 'index.js': '// v1\nexport function f() { return 1; }\n' },
      test_files: {},
      tokens_input: 10,
      tokens_output: 5,
      stop_reason: 'done',
      model_id: 'mock-multi-overlapping-writes',
    };
  }
  if (subagent_id === 'S2') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[S2] wrote index.js v2 (overrides S1)' },
      ],
      source_files: { 'index.js': '// v2\nexport function f() { return 2; }\n' },
      test_files: {},
      tokens_input: 10,
      tokens_output: 5,
      stop_reason: 'done',
      model_id: 'mock-multi-overlapping-writes',
    };
  }
  // S3
  return {
    conversation: [
      { role: 'system', content: system_prompt ?? '' },
      { role: 'user', content: user_message ?? '' },
      { role: 'assistant', content: '[S3] wrote utils.js' },
    ],
    source_files: { 'utils.js': '// utils\nexport function g() { return 3; }\n' },
    test_files: {},
    tokens_input: 10,
    tokens_output: 5,
    stop_reason: 'done',
    model_id: 'mock-multi-overlapping-writes',
  };
}
