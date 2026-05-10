// Anthropic provider adapter for the bench runner.
//
// Wraps the Anthropic SDK's messages.create call shape behind a uniform
// runTrial() interface. Used when BENCH_PROVIDER is unset or set to
// "anthropic" — the protocol's primary baseline (Claude).
//
// runTrial() returns:
//   {
//     conversation: [{role, content, ...}, ...],
//     source_files: { "<rel-path>": "<contents>", ... },
//     test_files:   { "<rel-path>": "<contents>", ... },
//     tokens_input: number,
//     tokens_output: number,
//     stop_reason: 'done' | 'turn-cap' | 'time-cap' | 'error',
//     model_id: string  // resolved id captured from API response when available
//   }
//
// The bench's unit tests inject mock providers via {script} so this module's
// real Anthropic call path is not exercised during test runs. The real path
// uses dynamic import of @anthropic-ai/sdk so missing-dependency errors don't
// surface unless someone actually picks the Anthropic provider for a live run.

import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_TURN_CAP = 20;
const DEFAULT_WALL_CLOCK_MS = 15 * 60 * 1000; // 15 minutes

export async function runTrial({
  system_prompt = '',
  user_message = '',
  tools = [],
  options = {},
  signal,
}) {
  const turnCap = options.turn_cap ?? DEFAULT_TURN_CAP;
  const wallClockMs = options.wall_clock_cap_ms ?? DEFAULT_WALL_CLOCK_MS;
  const modelId = options.model_id || 'claude-sonnet-4-6';
  const apiKey = options.api_key || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      'anthropic provider: ANTHROPIC_API_KEY is not set. ' +
        'Live Anthropic dispatch requires an API key in the environment.',
    );
  }

  // Lazy import the SDK so test runs (which inject mock providers) don't
  // have to install @anthropic-ai/sdk just to keep the harness importable.
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch (err) {
    throw new Error(
      'anthropic provider: @anthropic-ai/sdk is not installed. ' +
        'Run `npm install @anthropic-ai/sdk` to enable live Anthropic dispatch. ' +
        `Underlying error: ${err.message}`,
    );
  }

  const client = new Anthropic({ apiKey });
  const startedAt = Date.now();

  const conversation = [];
  if (system_prompt) {
    conversation.push({ role: 'system', content: system_prompt });
  }
  conversation.push({ role: 'user', content: user_message });

  let tokensIn = 0;
  let tokensOut = 0;
  let resolvedModelId = modelId;
  const sourceFiles = {};
  const testFiles = {};

  let stopReason = 'turn-cap';

  for (let turn = 0; turn < turnCap; turn += 1) {
    if (signal?.aborted) {
      stopReason = 'time-cap';
      break;
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed >= wallClockMs) {
      stopReason = 'time-cap';
      break;
    }

    let response;
    try {
      // Use messages.stream so we can react to abort signals mid-flight.
      const stream = client.messages.stream(
        {
          model: modelId,
          max_tokens: 4096,
          system: system_prompt || undefined,
          tools: tools.length > 0 ? tools : undefined,
          messages: conversation
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content })),
        },
        { signal },
      );
      response = await stream.finalMessage();
    } catch (err) {
      if (err && err.name === 'AbortError') {
        stopReason = 'time-cap';
        break;
      }
      stopReason = 'error';
      conversation.push({
        role: 'system',
        content: `[anthropic error] ${err && err.message}`,
      });
      break;
    }

    if (response.usage) {
      tokensIn += response.usage.input_tokens || 0;
      tokensOut += response.usage.output_tokens || 0;
    }
    if (response.model) resolvedModelId = response.model;

    conversation.push({
      role: 'assistant',
      content: response.content,
      stop_reason: response.stop_reason,
    });

    // Translate any tool_use blocks into source/test artifact writes when the
    // tool is one of the bench's expected file-write tools. Anything else is
    // a no-op at the bench level — the agent is free to use them but we don't
    // capture their effects here. Tool I/O semantics are deferred to the live
    // harness; mock-driven unit tests don't exercise this path.
    if (Array.isArray(response.content)) {
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const { name, input } = block;
          if (name === 'write_source' && input?.path && input?.content) {
            sourceFiles[input.path] = String(input.content);
          } else if (name === 'write_test' && input?.path && input?.content) {
            testFiles[input.path] = String(input.content);
          }
        }
      }
    }

    if (response.stop_reason === 'end_turn') {
      stopReason = 'done';
      break;
    }
    if (response.stop_reason === 'tool_use') {
      // Synthesize a tool-result user turn so the loop continues.
      conversation.push({ role: 'user', content: '[tool results applied]' });
      continue;
    }
    if (response.stop_reason === 'max_tokens') {
      conversation.push({ role: 'user', content: '[continue]' });
      continue;
    }
    // Any other stop_reason: treat as done so we don't loop forever on novel
    // values introduced by future SDK versions.
    stopReason = 'done';
    break;
  }

  return {
    conversation,
    source_files: sourceFiles,
    test_files: testFiles,
    tokens_input: tokensIn,
    tokens_output: tokensOut,
    stop_reason: stopReason,
    model_id: resolvedModelId,
  };
}

// Exposed for tests that want to verify the anthropic adapter is shaped the
// way the runner expects without actually invoking the SDK.
export const __DEFAULTS__ = {
  turn_cap: DEFAULT_TURN_CAP,
  wall_clock_cap_ms: DEFAULT_WALL_CLOCK_MS,
};

// Re-export delay so tests can reach into the module if they need to. Not
// part of the public contract.
export const __delay__ = delay;
