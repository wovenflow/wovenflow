// Mock OpenAI-compatible-shape provider that never declares done. Used by
// the B5 turn-cap test alongside mock-anthropic-loop to verify identical
// observable stop-reason behavior across providers.
//
// Per spec B5, the OpenAI-compatible enforcement uses "turn cap is counted
// per HTTP round-trip; wall-clock cap is enforced via AbortController on the
// in-flight fetch." This mock simulates that round-trip pattern — it loops
// up to turnCap iterations and never sets finish_reason: 'stop', so the
// runner stops the trial at the cap.

export async function runTrial({ system_prompt, user_message, signal, options = {} }) {
  const turnCap = options.turn_cap ?? 20;
  const conversation = [];
  if (system_prompt) {
    conversation.push({ role: 'system', content: system_prompt });
  }
  conversation.push({ role: 'user', content: user_message ?? '' });

  let turnsRun = 0;
  for (let i = 0; i < turnCap; i += 1) {
    if (signal?.aborted) {
      return {
        conversation,
        source_files: {},
        test_files: {},
        tokens_input: 10 * turnsRun,
        tokens_output: 5 * turnsRun,
        stop_reason: 'time-cap',
        model_id: 'mock-openai-loop',
      };
    }
    conversation.push({
      role: 'assistant',
      content: `[mock-openai-loop turn ${i + 1}/${turnCap}] still working`,
      finish_reason: 'tool_calls',
      tool_calls: [{ id: `call-${i}`, type: 'function', function: { name: 'noop', arguments: '{}' } }],
    });
    conversation.push({ role: 'tool', tool_call_id: `call-${i}`, content: '[mock tool result]' });
    turnsRun += 1;
  }

  return {
    conversation,
    source_files: {},
    test_files: {},
    tokens_input: 10 * turnsRun,
    tokens_output: 5 * turnsRun,
    stop_reason: 'turn-cap',
    model_id: 'mock-openai-loop',
  };
}
