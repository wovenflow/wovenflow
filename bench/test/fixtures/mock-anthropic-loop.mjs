// Mock Anthropic-shape provider that never declares done. Used by the B5
// turn-cap test: the runner counts each "dispatched message" turn against the
// 20-turn cap (per spec) and stops the trial.
//
// This mock simulates Anthropic's enforcement: per spec B5, "turn cap is
// counted by the runner per dispatched message; wall-clock cap is enforced
// via streaming-callback cancellation on the in-flight messages.create call."
// We model that here by yielding a turn each iteration without ever returning
// a 'done' stop_reason — the *runner's* turn-cap honoring is what stops us.

export async function runTrial({ system_prompt, user_message, signal, options = {} }) {
  const turnCap = options.turn_cap ?? 20;
  const conversation = [];
  if (system_prompt) {
    conversation.push({ role: 'system', content: system_prompt });
  }
  conversation.push({ role: 'user', content: user_message ?? '' });

  let turnsRun = 0;
  // The mock honours the cap itself by yielding exactly turnCap assistant
  // messages without ever declaring done. The observable outcome (meta.json
  // stop_reason === 'turn-cap') is therefore identical regardless of who
  // counts: the spec's rule is about identical observable behavior.
  for (let i = 0; i < turnCap; i += 1) {
    if (signal?.aborted) {
      return {
        conversation,
        source_files: {},
        test_files: {},
        tokens_input: 10 * turnsRun,
        tokens_output: 5 * turnsRun,
        stop_reason: 'time-cap',
        model_id: 'mock-anthropic-loop',
      };
    }
    conversation.push({
      role: 'assistant',
      content: `[mock-anthropic-loop turn ${i + 1}/${turnCap}] still working`,
      stop_reason: 'tool_use',
    });
    conversation.push({ role: 'user', content: '[tool results applied]' });
    turnsRun += 1;
  }

  return {
    conversation,
    source_files: {},
    test_files: {},
    tokens_input: 10 * turnsRun,
    tokens_output: 5 * turnsRun,
    stop_reason: 'turn-cap',
    model_id: 'mock-anthropic-loop',
  };
}
