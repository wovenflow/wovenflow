# Bench provider: never send mid-conversation `system` messages to the model

## User stories

- As the bench operator, I want the provider's transport/recovery breadcrumbs (e.g. `[openai-compatible] fetch failed, polling vLLM…`) to stay out of the message array sent to the model, so that a single transient hiccup does not poison the conversation and cause every subsequent request to fail. The breadcrumbs must still appear in the saved transcript and live log for observability — they just must not be sent to the model.

## Context

`bench/providers/openai-compatible.js` keeps a single `conversation` array that serves two purposes at once: it is the saved transcript (and the source of `conversation-live.jsonl`) **and** it is mapped directly into the request `messages` field on every turn (the `conversation.map(...)` at the `fetch` body, ~line 562).

The per-turn recovery loop, on any transport-shaped failure (network error, retryable 5xx, JSON-parse error, abort timeout), records a human-readable breadcrumb by calling `pushTurn({ role: 'system', content: '[openai-compatible] …' })`. Because `pushTurn` appends to `conversation`, that breadcrumb becomes part of the next request's `messages` — as a `system` message sitting *after* the user/assistant turns.

Qwen3.6's chat template enforces **"a `system` message may only appear at the very beginning."** Observed live in `bench/results/repilot-20260520T031343-single/*`:

```
jinja2.exceptions.TemplateError: System message must be at the beginning.
ValueError: System message must be at the beginning.
```

So the failure mode is a cascade: one transient blip → a `system` breadcrumb lands mid-conversation → the next request is rejected with HTTP 500 → the 500 is itself "retryable", so the loop appends *another* `system` breadcrumb → 500 again, until retries/wall budget are exhausted. The flood of malformed requests also destabilizes vLLM's `EngineCore` (it exits `code=0`, not OOM). Trials that had already produced correct artifacts (e.g. Phase 1 scoring 8/8) get mislabeled `stop_reason: "error"` because a *later* turn triggered the cascade; trials whose first request lands on the just-killed engine record `tokens_in: 0` and burn their whole wall budget in recovery polling.

The fix isolates "what the model sees" from "what we log". A pure exported helper `toModelMessages(conversation)` builds the request `messages`: it drops any turn tagged `diagnostic: true`, and — defensively, for any chat template that requires system-first — drops any `system` message that is not at index 0 of the result. Every recovery/error breadcrumb is tagged `diagnostic: true`. `conversation` itself is unchanged, so the transcript and live log keep every breadcrumb.

This is methodology-neutral (applies to all conditions and topologies) and lives next to the existing `validateArtifactPath` / `validateArtifactContent` helpers.

## Behaviors

### B1: `toModelMessages` drops diagnostic turns and preserves the rest in order

∵ **IF** `toModelMessages(conversation)` is called with a `conversation` array that contains one or more turns tagged `diagnostic: true` interleaved with normal `system` / `user` / `assistant` / `tool` turns
↦ **WHEN** the function returns
∴ **THEN** the result contains every non-diagnostic turn in its original order with `{ role, content }` only (no `diagnostic` key), and contains none of the diagnostic turns. The input array is not mutated — diagnostic breadcrumbs remain in `conversation` for the transcript.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toModelMessages } from '../../providers/openai-compatible.js';

test('B1: toModelMessages drops diagnostic turns, preserves the rest in order', () => {
  const convo = [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'do the task' },
    { role: 'assistant', content: 'working' },
    { role: 'system', content: '[openai-compatible] fetch failed, polling vLLM', diagnostic: true },
    { role: 'user', content: 'continue' },
  ];
  const out = toModelMessages(convo);
  assert.deepStrictEqual(out, [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'do the task' },
    { role: 'assistant', content: 'working' },
    { role: 'user', content: 'continue' },
  ]);
  // input untouched — the breadcrumb still lives in the transcript array
  assert.strictEqual(convo.length, 5);
  assert.strictEqual(convo[3].diagnostic, true);
});
```

### B2: `toModelMessages` drops any `system` message not at index 0

∵ **IF** `toModelMessages(conversation)` is called with a `conversation` whose first turn is a `system` message and that also contains a later `system` message (tagged or not)
↦ **WHEN** the function returns
∴ **THEN** the leading `system` message is preserved at index 0 and no `system` message appears anywhere after index 0 of the result. This enforces the "system message must be at the beginning" chat-template invariant even for an untagged stray system turn.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toModelMessages } from '../../providers/openai-compatible.js';

test('B2: toModelMessages drops any system message not at index 0', () => {
  const convo = [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'task' },
    { role: 'system', content: 'stray mid-stream system (untagged)' },
    { role: 'assistant', content: 'ok' },
  ];
  const out = toModelMessages(convo);
  assert.deepStrictEqual(out, [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'task' },
    { role: 'assistant', content: 'ok' },
  ]);
  assert.strictEqual(out[0].role, 'system');
  assert.strictEqual(out.slice(1).some((m) => m.role === 'system'), false);

  // No leading system at all: any system message is dropped.
  const convo2 = [
    { role: 'user', content: 'task' },
    { role: 'system', content: 'late system' },
    { role: 'assistant', content: 'ok' },
  ];
  assert.deepStrictEqual(toModelMessages(convo2), [
    { role: 'user', content: 'task' },
    { role: 'assistant', content: 'ok' },
  ]);
});
```

### B3: `toModelMessages` stringifies non-string content

∵ **IF** `toModelMessages(conversation)` is called with a turn whose `content` is not a string (e.g. a structured object)
↦ **WHEN** the function returns
∴ **THEN** that turn's `content` in the result is the JSON-stringified form (preserving the prior `conversation.map` behavior), while string content passes through unchanged.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toModelMessages } from '../../providers/openai-compatible.js';

test('B3: toModelMessages stringifies non-string content', () => {
  const convo = [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: { kind: 'structured', n: 1 } },
  ];
  const out = toModelMessages(convo);
  assert.strictEqual(out[0].content, 'SYS');
  assert.strictEqual(typeof out[1].content, 'string');
  assert.deepStrictEqual(JSON.parse(out[1].content), { kind: 'structured', n: 1 });
});
```

## Red-team check

Decision: add `toModelMessages` (drop `diagnostic` turns + drop non-leading `system` turns) and tag every recovery/error breadcrumb `diagnostic: true`.

Top three reasons this might not be the right call:

1. **The defensive "drop non-leading system" rule could silently swallow a legitimate mid-conversation system message.** In this harness there is none — the only legitimate `system` message is the index-0 composed prompt (style card + tool-usage, concatenated by study.mjs into a single `system_prompt`); every other `system` turn is a transport breadcrumb. **Mitigation:** the rule is scoped to the model payload only; `conversation` keeps everything, so nothing is lost from the transcript. If a future condition genuinely needs a mid-stream system message, it would have to be re-expressed as a `user`/`developer` turn anyway, because the target template forbids it.

2. **Tagging is redundant given the positional rule (both drop the breadcrumbs).** True for `system`-role breadcrumbs, but the `diagnostic` tag is the explicit, role-independent signal of intent — it documents *why* a turn is excluded and survives if a future breadcrumb uses a non-`system` role. The positional rule is the backstop, not the primary mechanism. Keeping both is cheap and clearer than relying on either alone.

3. **This treats a symptom of vLLM instability rather than the instability itself.** The opposite is true: the live evidence shows the engine deaths are *caused* by the malformed-request flood, not vice versa (clean `code=0` exits, KV cache far from full). The Ray-executor experiment that chased the "instability" has been reverted; this is the actual root-cause fix. Residual engine instability, if any, is a separate axis to re-measure after this lands.

Verdict: **PROCEED.** Small, pure, well-tested helper; preserves all observability; directly removes the cascade's trigger; positional rule generalizes the fix to any system-first chat template.

## Handoff

After testflow inserts these test fences into `bench/out/spec-tests/`, the implementer:

- Adds an exported `toModelMessages(conversation)` to `bench/providers/openai-compatible.js`, next to `validateArtifactPath` / `validateArtifactContent`. It returns a new array of `{ role, content }` objects: skip turns with `diagnostic === true`; skip any `system`-role turn that is not the first element of the *result*; stringify non-string `content` via `JSON.stringify`.
- Replaces the inline `messages: conversation.map(...)` in the request body (~line 562) with `messages: toModelMessages(conversation)`.
- Adds `diagnostic: true` to every recovery/error breadcrumb `pushTurn({ role: 'system', ... })` in the per-turn loop (the fetch-error branch, the retryable-HTTP-status branch, the terminal-status branch, the JSON-parse branch, and the abort-timeout branch). Do **not** tag the initial `system_prompt` turn, the `user` message, assistant turns, tool results, or any `[continue]` injection — those are real model-visible turns.
- Leaves `pushTurn` and `conversation` otherwise unchanged so the saved transcript and `conversation-live.jsonl` keep every breadcrumb.

After all behaviors are green, no further work — this is a harness-only fix. `bench/` is not plugin surface; no version bump.
