// Mock multi-agent provider for B5 of
// doc/specs/2026-05-17-bench-orchestrator-must-dispatch.spec.md.
//
// Orchestrator: simulates the pilot's observed failure mode — emits a
// write_source with a leading `bench/` prefix that the provider must
// reject via validateArtifactPath. The rejected path is supplied via the
// provider's `path_rejections` field (as the live provider does); the
// orchestrator does NOT include the rejected file in source_files (the
// provider would have dropped it). The orchestrator also dispatches one
// subagent that writes a real index.js, so the trial has some real source
// output to confirm the rest of the pipeline still works.
//
// Subagent S1: writes index.js.

export async function runTrial({ role, subagent_id, system_prompt, user_message }) {
  if (role === 'orchestrator') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[orchestrator] tried write_source on bench/tasks/.../intent.md; rejected by validator' },
      ],
      // No files written via write_source (the validator rejected the bad
      // path and the provider dropped the call from sourceFiles).
      source_files: {},
      test_files: {},
      tokens_input: 100,
      tokens_output: 50,
      stop_reason: 'done',
      model_id: 'mock-orch-rejected-paths',
      // Simulate the provider's rejection record.
      path_rejections: [
        {
          tool: 'write_source',
          path: 'bench/tasks/slugify/intent.md',
          reason: 'write_source/write_test: path "bench/tasks/slugify/intent.md" rejected (leading "bench/" prefix leaks harness tree; must be relative to source/, no traversal, no leading directory prefix)',
        },
      ],
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
    model_id: 'mock-orch-rejected-paths',
  };
}
