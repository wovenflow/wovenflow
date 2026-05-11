// OpenAI-compatible provider adapter for the bench runner.
//
// POSTs to <endpoint_url>/chat/completions per the openai-chat-completions
// protocol variant. Other variants (ollama-native, llama-cpp-grammar, etc.)
// are reserved for future adapters and throw ProviderConfigError when
// resolved — see runner.js's resolveProvider.
//
// runTrial() shape matches anthropic.js so the runner is provider-agnostic.

import { ProviderConfigError } from './errors.js';

const DEFAULT_TURN_CAP = 20;
const DEFAULT_WALL_CLOCK_MS = 15 * 60 * 1000;
const DEFAULT_GRACE_MS = 30 * 1000;

// Matches fenced ```json ... ``` code blocks. The opening fence may have
// trailing whitespace before the newline; the body is captured non-greedily up
// to the closing ``` fence.
const JSON_FENCE_RE = /```json[ \t]*\r?\n([\s\S]*?)\r?\n```/g;

const KNOWN_TOOL_NAMES = new Set(['write_source', 'write_test']);

// Scan an assistant `content` string for fenced ```json blocks and return one
// `{ name, arguments }` object per block whose body parses as JSON, has a
// string `name` matching a known tool, and an object `arguments` field.
// Malformed or non-tool-call blocks are silently skipped — the model may
// legitimately include illustrative JSON in prose. See B3 of
// doc/specs/2026-05-11-bench-provider-jsoncode-fallback.spec.md.
export function extractJsonCodeBlockToolCalls(content) {
  if (typeof content !== 'string' || content.length === 0) return [];
  const out = [];
  JSON_FENCE_RE.lastIndex = 0;
  let match;
  while ((match = JSON_FENCE_RE.exec(content)) !== null) {
    const body = match[1];
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      continue;
    }
    if (typeof parsed.name !== 'string' || !KNOWN_TOOL_NAMES.has(parsed.name)) {
      continue;
    }
    if (
      parsed.arguments === null ||
      typeof parsed.arguments !== 'object' ||
      Array.isArray(parsed.arguments)
    ) {
      continue;
    }
    out.push({ name: parsed.name, arguments: parsed.arguments });
  }
  return out;
}

function assertSupportedVariant(variant) {
  if (variant !== 'openai-chat-completions') {
    throw new ProviderConfigError(
      `openai-compatible: protocol variant "${variant}" is not implemented in this build. ` +
        `Only "openai-chat-completions" is supported. ` +
        `Variants like "ollama-native" and "llama-cpp-grammar" are reserved for future adapter modules.`,
    );
  }
}

export async function runTrial({
  system_prompt = '',
  user_message = '',
  tools = [],
  options = {},
  signal,
}) {
  assertSupportedVariant(options.protocol_variant || 'openai-chat-completions');

  const turnCap = options.turn_cap ?? DEFAULT_TURN_CAP;
  const wallClockMs = options.wall_clock_cap_ms ?? DEFAULT_WALL_CLOCK_MS;
  const graceMs = options.grace_ms ?? DEFAULT_GRACE_MS;
  const endpointUrl = options.endpoint_url;
  const modelId = options.model_id;

  if (!endpointUrl) {
    throw new ProviderConfigError(
      'openai-compatible: endpoint_url is required',
    );
  }
  if (!modelId) {
    throw new ProviderConfigError(
      'openai-compatible: model_id is required',
    );
  }

  const conversation = [];
  if (system_prompt) {
    conversation.push({ role: 'system', content: system_prompt });
  }
  conversation.push({ role: 'user', content: user_message });

  const sourceFiles = {};
  const testFiles = {};
  let tokensIn = 0;
  let tokensOut = 0;
  let resolvedModelId = modelId;

  let stopReason = 'turn-cap';
  const startedAt = Date.now();

  const url = endpointUrl.replace(/\/+$/, '') + '/chat/completions';

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

    // Per-request abort: composes the runner-supplied wall-clock signal with a
    // per-request grace timer so a server that ignores the abort doesn't hang
    // the runner indefinitely.
    const perReqController = new AbortController();
    const onParentAbort = () => perReqController.abort('parent-aborted');
    if (signal) {
      if (signal.aborted) {
        perReqController.abort('parent-aborted');
      } else {
        signal.addEventListener('abort', onParentAbort, { once: true });
      }
    }
    const graceTimer = setTimeout(() => {
      // 30s grace after parent abort: if the server hasn't closed the
      // connection by then, force-terminate locally.
    }, graceMs);

    let response;
    try {
      const fetchPromise = fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: conversation.map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          })),
          tools: tools.length > 0 ? tools : undefined,
        }),
        signal: perReqController.signal,
      });

      response = await fetchPromise;
    } catch (err) {
      clearTimeout(graceTimer);
      if (signal) signal.removeEventListener('abort', onParentAbort);
      const aborted = err && (err.name === 'AbortError' || perReqController.signal.aborted);
      if (aborted) {
        // Decide whether the abort was within the grace window or a forced
        // local kill: if the parent signal aborted and we still got control
        // back before the grace window elapsed, it's time-cap; otherwise it's
        // an error per the spec's force-termination clause.
        const sinceAbort = signal?.aborted ? Date.now() - startedAt - wallClockMs : 0;
        if (sinceAbort > graceMs) {
          stopReason = 'error';
          conversation.push({
            role: 'system',
            content: 'provider abort timeout',
          });
        } else {
          stopReason = 'time-cap';
        }
        break;
      }
      stopReason = 'error';
      conversation.push({
        role: 'system',
        content: `[openai-compatible fetch error] ${err && err.message}`,
      });
      break;
    }
    clearTimeout(graceTimer);
    if (signal) signal.removeEventListener('abort', onParentAbort);

    if (!response.ok) {
      stopReason = 'error';
      const text = await response.text().catch(() => '');
      conversation.push({
        role: 'system',
        content: `[openai-compatible HTTP ${response.status}] ${text.slice(0, 500)}`,
      });
      break;
    }

    let body;
    try {
      body = await response.json();
    } catch (err) {
      stopReason = 'error';
      conversation.push({
        role: 'system',
        content: `[openai-compatible JSON parse error] ${err && err.message}`,
      });
      break;
    }

    if (body.usage) {
      tokensIn += body.usage.prompt_tokens || 0;
      tokensOut += body.usage.completion_tokens || 0;
    }
    if (body.model) resolvedModelId = body.model;

    const choice = body.choices?.[0];
    const message = choice?.message;
    if (!message) {
      stopReason = 'error';
      conversation.push({
        role: 'system',
        content: '[openai-compatible: no choices in response]',
      });
      break;
    }

    conversation.push({
      role: 'assistant',
      content: message.content ?? '',
      tool_calls: message.tool_calls,
      finish_reason: choice.finish_reason,
    });

    const structuredCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (structuredCalls.length > 0) {
      for (const call of structuredCalls) {
        const fn = call.function;
        if (!fn?.name) continue;
        let args = {};
        try {
          args = JSON.parse(fn.arguments ?? '{}');
        } catch {
          args = {};
        }
        if (fn.name === 'write_source' && args.path && args.content) {
          sourceFiles[args.path] = String(args.content);
        } else if (fn.name === 'write_test' && args.path && args.content) {
          testFiles[args.path] = String(args.content);
        }
      }
      // Synthesize a tool-result user turn so the loop continues.
      conversation.push({ role: 'tool', content: '[tool results applied]' });
      continue;
    }

    // Fallback: structured tool_calls is absent or empty. Some models
    // (e.g. Qwen2.5-Coder when no vLLM tool-parser matches their format)
    // emit tool calls as fenced ```json blocks inside content. Extract them
    // here so the trial is still scoreable. See
    // doc/specs/2026-05-11-bench-provider-jsoncode-fallback.spec.md.
    const fallbackCalls = extractJsonCodeBlockToolCalls(message.content ?? '');
    if (fallbackCalls.length > 0) {
      for (const call of fallbackCalls) {
        const { name, arguments: args } = call;
        if (name === 'write_source' && args.path && args.content) {
          sourceFiles[args.path] = String(args.content);
        } else if (name === 'write_test' && args.path && args.content) {
          testFiles[args.path] = String(args.content);
        }
      }
      conversation.push({ role: 'tool', content: '[tool results applied]' });
      continue;
    }

    if (choice.finish_reason === 'stop') {
      stopReason = 'done';
      break;
    }
    if (choice.finish_reason === 'length') {
      conversation.push({ role: 'user', content: '[continue]' });
      continue;
    }
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

export const __DEFAULTS__ = {
  turn_cap: DEFAULT_TURN_CAP,
  wall_clock_cap_ms: DEFAULT_WALL_CLOCK_MS,
  grace_ms: DEFAULT_GRACE_MS,
};
