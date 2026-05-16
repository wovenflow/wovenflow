// Mock multi-agent provider for B4: orchestrator dispatches three subagents.
// On the orchestrator call, returns an empty conversation plus three
// subagent_dispatches. On each subagent call, returns a trivial completion.

export async function runTrial({ role, subagent_id, system_prompt, user_message }) {
  if (role === 'orchestrator') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[orchestrator] dispatching three subagents' },
      ],
      source_files: {},
      test_files: {},
      tokens_input: 100,
      tokens_output: 50,
      stop_reason: 'done',
      model_id: 'mock-multi-three-subagents',
      subagent_dispatches: [
        { id: 'S1', system_prompt: 'sub-system', user_message: 'brief 1', tools: [] },
        { id: 'S2', system_prompt: 'sub-system', user_message: 'brief 2', tools: [] },
        { id: 'S3', system_prompt: 'sub-system', user_message: 'brief 3', tools: [] },
      ],
    };
  }
  // Subagent role.
  return {
    conversation: [
      { role: 'system', content: system_prompt ?? '' },
      { role: 'user', content: user_message ?? '' },
      { role: 'assistant', content: `[subagent ${subagent_id}] done` },
    ],
    source_files: {},
    test_files: {},
    tokens_input: 10,
    tokens_output: 5,
    stop_reason: 'done',
    model_id: 'mock-multi-three-subagents',
  };
}
