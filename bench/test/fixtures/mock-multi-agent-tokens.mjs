// Mock multi-agent provider for B7: returns deterministic per-call token
// counts so the test can verify meta.json's top-level tokens equal
// orchestrator + sum(subagents), and that each subagent record carries the
// shape {id, tokens_input, tokens_output, stop_reason, files_written}.
//
// Orchestrator: 200 in / 100 out.
// S1: 30 in / 15 out, writes index.js (1 file).
// S2: 40 in / 20 out, writes utils.js (1 file).
// Top-level expected: 270 in / 135 out.

export async function runTrial({ role, subagent_id, system_prompt, user_message }) {
  if (role === 'orchestrator') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[orchestrator] dispatching S1, S2' },
      ],
      source_files: {},
      test_files: {},
      tokens_input: 200,
      tokens_output: 100,
      stop_reason: 'done',
      model_id: 'mock-multi-tokens',
      subagent_dispatches: [
        { id: 'S1', system_prompt: 'sub', user_message: 'b1', tools: [] },
        { id: 'S2', system_prompt: 'sub', user_message: 'b2', tools: [] },
      ],
    };
  }
  if (subagent_id === 'S1') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[S1] done' },
      ],
      source_files: { 'index.js': '// S1\nexport function f() {}\n' },
      test_files: {},
      tokens_input: 30,
      tokens_output: 15,
      stop_reason: 'done',
      model_id: 'mock-multi-tokens',
    };
  }
  // S2
  return {
    conversation: [
      { role: 'system', content: system_prompt ?? '' },
      { role: 'user', content: user_message ?? '' },
      { role: 'assistant', content: '[S2] done' },
    ],
    source_files: { 'utils.js': '// S2\nexport function g() {}\n' },
    test_files: {},
    tokens_input: 40,
    tokens_output: 20,
    stop_reason: 'done',
    model_id: 'mock-multi-tokens',
  };
}
