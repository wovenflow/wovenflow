// Mock OpenAI-compatible-shape provider that responds *slowly*. Used by B5's
// wall-clock cap test (wall_clock_cap_ms: 100). The mock awaits a delay that
// exceeds the cap; the runner aborts via AbortController and the trial's
// meta.json stop_reason becomes 'time-cap' (or 'error' if the abort lands
// outside the 30s grace window — both are acceptable per the spec test).

export async function runTrial({ system_prompt, user_message, signal, options = {} }) {
  const conversation = [];
  if (system_prompt) {
    conversation.push({ role: 'system', content: system_prompt });
  }
  conversation.push({ role: 'user', content: user_message ?? '' });

  // Pick a delay that comfortably exceeds the typical cap used in tests
  // (100ms) but doesn't make the test suite hang if something goes wrong.
  const sleepMs = options.slow_response_ms ?? 5_000;

  await new Promise((resolve, reject) => {
    if (signal?.aborted) {
      // Honour an already-aborted signal immediately.
      conversation.push({ role: 'system', content: '[mock-openai-slow] aborted before request' });
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      conversation.push({ role: 'assistant', content: '[mock-openai-slow] late response' });
      resolve();
    }, sleepMs);
    const onAbort = () => {
      cleanup();
      conversation.push({ role: 'system', content: '[mock-openai-slow] aborted by runner' });
      resolve();
    };
    function cleanup() {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });

  // If we got here via abort, the runner's wall-clock fired and we return a
  // time-cap result. If we got here via timeout (no abort), return done — but
  // the test expects either time-cap or error so this branch shouldn't fire
  // under the test's 100ms cap.
  if (signal?.aborted) {
    return {
      conversation,
      source_files: {},
      test_files: {},
      tokens_input: 0,
      tokens_output: 0,
      stop_reason: 'time-cap',
      model_id: 'mock-openai-slow',
    };
  }
  return {
    conversation,
    source_files: {},
    test_files: {},
    tokens_input: 0,
    tokens_output: 0,
    stop_reason: 'done',
    model_id: 'mock-openai-slow',
  };
}
