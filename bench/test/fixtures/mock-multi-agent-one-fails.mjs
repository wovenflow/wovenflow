// Mock multi-agent provider for B8: orchestrator dispatches three subagents;
// the second one throws. Trial must not abort. meta.json should record
// subagent_count=3, subagent_errors=1, the failed record carries an error
// string, and surviving subagents' files end up in source/.

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
      model_id: 'mock-multi-one-fails',
      subagent_dispatches: [
        { id: 'S1', system_prompt: 'sub', user_message: 'b1', tools: [] },
        { id: 'S2', system_prompt: 'sub', user_message: 'b2', tools: [] },
        { id: 'S3', system_prompt: 'sub', user_message: 'b3', tools: [] },
      ],
    };
  }
  if (subagent_id === 'S2') {
    throw new Error('mock S2 failure: simulated provider exception');
  }
  // S1 and S3 each write a file so source/ ends up non-empty.
  const filename = `${subagent_id.toLowerCase()}.js`;
  return {
    conversation: [
      { role: 'system', content: system_prompt ?? '' },
      { role: 'user', content: user_message ?? '' },
      { role: 'assistant', content: `[${subagent_id}] wrote ${filename}` },
    ],
    source_files: { [filename]: `// ${subagent_id}\nexport function ${subagent_id.toLowerCase()}() {}\n` },
    test_files: {},
    tokens_input: 10,
    tokens_output: 5,
    stop_reason: 'done',
    model_id: 'mock-multi-one-fails',
  };
}
