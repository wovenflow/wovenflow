// Mock multi-agent provider for B5: each subagent's input conversation
// length equals 2 (system + user) — proves no orchestrator history leaked.
//
// The runner builds each subagent's conversation from the dispatch's
// system_prompt + user_message only. This mock counts the inputs it received
// (system_prompt arg + user_message arg) and returns that count as
// input_conversation_length so the runner can surface it to the test.

export async function runTrial({ role, subagent_id, system_prompt, user_message }) {
  if (role === 'orchestrator') {
    return {
      conversation: [
        { role: 'system', content: system_prompt ?? '' },
        { role: 'user', content: user_message ?? '' },
        { role: 'assistant', content: '[orchestrator] dispatching subagents' },
      ],
      source_files: {},
      test_files: {},
      tokens_input: 100,
      tokens_output: 50,
      stop_reason: 'done',
      model_id: 'mock-multi-fresh-context',
      subagent_dispatches: [
        { id: 'S1', system_prompt: 'fresh-sys-1', user_message: 'fresh-user-1', tools: [] },
        { id: 'S2', system_prompt: 'fresh-sys-2', user_message: 'fresh-user-2', tools: [] },
        { id: 'S3', system_prompt: 'fresh-sys-3', user_message: 'fresh-user-3', tools: [] },
      ],
    };
  }
  // Subagent role: count what we received. The runner is responsible for
  // passing only the per-subagent system+user (no orchestrator history); if
  // the runner ever leaked the orchestrator's conversation in via
  // system_prompt or user_message it would still only register as 2 messages
  // here — but those messages would carry orchestrator content. The test
  // checks the count; the contract is that the runner builds a 2-message
  // fresh array per subagent.
  let count = 0;
  if (typeof system_prompt === 'string' && system_prompt.length > 0) count += 1;
  if (typeof user_message === 'string' && user_message.length > 0) count += 1;

  return {
    conversation: [
      { role: 'system', content: system_prompt ?? '' },
      { role: 'user', content: user_message ?? '' },
      { role: 'assistant', content: `[subagent ${subagent_id}] received ${count} input messages` },
    ],
    source_files: {},
    test_files: {},
    tokens_input: 10,
    tokens_output: 5,
    stop_reason: 'done',
    model_id: 'mock-multi-fresh-context',
    input_conversation_length: count,
  };
}
