// Mock multi-agent provider for B3 negative case of
// doc/specs/2026-05-17-bench-orchestrator-must-dispatch.spec.md.
//
// Orchestrator: writes a DTDD spec.md file (allowed — orchestrator-level
// methodology artifact) and dispatches one subagent. The runner must NOT
// record an orchestrator_violations entry for the spec.md.
//
// Subagent S1: writes index.js.

export async function runTrial({ role, subagent_id, system_prompt, user_message }) {
  if (role === 'orchestrator') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[orchestrator] writing slugify.spec.md and dispatching S1' },
      ],
      // Only a *.spec.md — allowed for the DTDD orchestrator.
      source_files: { 'slugify.spec.md': '# slugify spec\n' },
      test_files: {},
      tokens_input: 100,
      tokens_output: 50,
      stop_reason: 'done',
      model_id: 'mock-orch-spec-only',
      path_rejections: [],
      subagent_dispatches: [
        { id: 'S1', system_prompt: 'sub', user_message: 'b1', tools: [] },
      ],
    };
  }
  return {
    conversation: [
      { role: 'system', content: system_prompt ?? '' },
      { role: 'user', content: user_message ?? '' },
      { role: 'assistant', content: `[${subagent_id}] writing index.js` },
    ],
    source_files: { 'index.js': '// S1\nmodule.exports = {};\n' },
    test_files: {},
    tokens_input: 20,
    tokens_output: 10,
    stop_reason: 'done',
    model_id: 'mock-orch-spec-only',
  };
}
