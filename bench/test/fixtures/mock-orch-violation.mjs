// Mock multi-agent provider for B3 of
// doc/specs/2026-05-17-bench-orchestrator-must-dispatch.spec.md.
//
// Orchestrator: writes a non-spec.md source file directly via write_source
// AND dispatches one subagent. The runner must record the orchestrator's
// direct write to meta.json.orchestrator_violations[] (methodology
// violation: orchestrator wrote non-spec.md content) while still completing
// the trial.
//
// Subagent S1: writes utils.js (no violation; subagents may write anything).

export async function runTrial({ role, subagent_id, system_prompt, user_message }) {
  if (role === 'orchestrator') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[orchestrator] writing index.js and dispatching S1' },
      ],
      // Non-spec.md path — this is the methodology violation the runner
      // should record in orchestrator_violations[].
      source_files: { 'index.js': '// orch-direct\nmodule.exports = {};\n' },
      test_files: {},
      tokens_input: 100,
      tokens_output: 50,
      stop_reason: 'done',
      model_id: 'mock-orch-violation',
      // No path_rejections — the path "index.js" passes validateArtifactPath.
      // The violation is methodology-level, not path-level.
      path_rejections: [],
      subagent_dispatches: [
        { id: 'S1', system_prompt: 'sub', user_message: 'b1', tools: [] },
      ],
    };
  }
  // S1: write a different file so the trial has subagent output too.
  return {
    conversation: [
      { role: 'system', content: system_prompt ?? '' },
      { role: 'user', content: user_message ?? '' },
      { role: 'assistant', content: `[${subagent_id}] writing utils.js` },
    ],
    source_files: { 'utils.js': '// S1\nmodule.exports = {};\n' },
    test_files: {},
    tokens_input: 20,
    tokens_output: 10,
    stop_reason: 'done',
    model_id: 'mock-orch-violation',
  };
}
