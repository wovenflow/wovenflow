# Bench provider: just-in-time wrap-up reminder after an all-pass `run_tests`

## User stories

- As the bench operator, I want a clear "you're done — stop now" reminder appended to the tool-result message whenever the model's own `run_tests` call comes back all-green on a non-empty suite, so that a weak model which ignores the buried system-prompt "stop when green" instruction is nudged to end the trial instead of burning the remaining turns rewriting already-passing files until it hits the turn cap.

## Context

The bench drives a model through a `write_test` / `write_source` / `run_tests` loop capped at 35 turns. The model ends the trial by emitting a turn with no tool calls (`finish_reason: 'stop'`), which the provider treats as `stopReason: 'done'`.

Observed live in `bench/results/vllm14b-round-20260524T103108/` (Qwen2.5-Coder-14B-Instruct-AWQ via vLLM): the model reaches all-passing tests on its OWN `run_tests` call by ~turn 2, but then IGNORES the system-prompt "stop when green" instruction and keeps calling `write_source` on already-working code until it hits the 35-turn cap — roughly 33 wasted turns per trial, which also overflows the context window on verbose tasks. The buried system-prompt line does not land on this model.

The fix is a JUST-IN-TIME reminder: when a `run_tests` tool call returns all-pass on a non-empty test suite, append a clear wrap-up reminder to that turn's tool-result message content. An inline reminder right after green is far more salient than the system-prompt instruction. This does NOT hard-stop the trial — the model still chooses to stop by emitting a zero-tool-call turn (which already ends the trial). It only nudges. The turn cap is unchanged.

Detection rides on the exact `run_tests` result format produced by `formatResult` in `bench/run-tests-tool.js`:

- All-pass, non-empty suite — `[run_tests] N/N passed` (no `| X failed` suffix, no `— <names>` failing-test list), with `N > 0`.
- Failing / partial — `[run_tests] 6/10 passed | 4 failed — <names>`.
- Empty suite — `[run_tests] no test files found (...)`.
- Errors — `[run_tests] error: ...`, `[run_tests] N test file(s) failed to load:`, `[run_tests] TIMEOUT after ...`.

The reminder fires ONLY for the genuinely all-pass, non-empty case. It must never fire for a partial/failing run, an empty suite, a load error, a timeout, or a validation/path error.

This is a harness nudge, not a scoring change: the locked study design (conditions, tasks, scoring predicates, hypotheses) is untouched. The reminder text is appended to the tool message the model sees on that turn; it is not injected as a separate system/user turn, so it does not perturb the system-first invariant the provider already defends (see `2026-05-20-bench-provider-no-midstream-system.spec.md`).

## Behaviors

### B1: an all-pass `run_tests` result's tool message includes the wrap-up reminder
∵ **IF** a `run_tests` tool call resolves to an all-pass, non-empty result (e.g. `[run_tests] 8/8 passed`)
↦ **WHEN** the provider builds the tool-result message for that call
∴ **THEN** the tool message content includes the wrap-up reminder text directed at stopping (it mentions the passing count and instructs the model to STOP NOW by replying with no tool calls).

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendGreenWrapupReminder } from '../../providers/openai-compatible.js';

test('B1: all-pass run_tests result gets the wrap-up reminder appended', () => {
  const out = appendGreenWrapupReminder('[run_tests] 8/8 passed');
  assert.notStrictEqual(out, '[run_tests] 8/8 passed');
  assert.match(out, /STOP NOW/);
  assert.match(out, /no tool calls/);
  // single-test all-pass also fires
  const out1 = appendGreenWrapupReminder('[run_tests] 1/1 passed');
  assert.match(out1, /STOP NOW/);
});
```

### B2: a failing / partial / empty / error `run_tests` result does NOT get the reminder
∵ **IF** a `run_tests` tool call resolves to anything other than an all-pass non-empty result — a partial/failing run, an empty suite, a load error, a timeout, a validation error, or a zero-test pass (`0/0`)
↦ **WHEN** the provider builds the tool-result message for that call
∴ **THEN** the tool message content is returned unchanged — the reminder is NOT appended.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendGreenWrapupReminder } from '../../providers/openai-compatible.js';

test('B2: non-all-pass run_tests results are left unchanged', () => {
  const cases = [
    '[run_tests] 0/1 passed | 1 failed — parse > throws for invalid input',
    '[run_tests] 6/10 passed | 4 failed — a, b, c, d',
    '[run_tests] no test files found (write tests via write_test before calling run_tests)',
    '[run_tests] error: test_path "x" was not written via write_test',
    '[run_tests] 1 test file(s) failed to load:\nLOAD ERR: index.test.js\n  SyntaxError: ...',
    '[run_tests] TIMEOUT after 60s — partial results may be incomplete',
    '[run_tests] 0/0 passed',
  ];
  for (const c of cases) {
    assert.strictEqual(appendGreenWrapupReminder(c), c, `should not fire for: ${c}`);
  }
});
```

### B3: the reminder is APPENDED — the original result text is preserved
∵ **IF** an all-pass non-empty `run_tests` result has the reminder applied
↦ **WHEN** the resulting tool message content is inspected
∴ **THEN** the original `[run_tests] N/N passed` summary line is still present verbatim at the start of the content, and the reminder is added after it (the reminder augments, it never replaces).

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendGreenWrapupReminder } from '../../providers/openai-compatible.js';

test('B3: the reminder is appended, original summary preserved', () => {
  const original = '[run_tests] 8/8 passed';
  const out = appendGreenWrapupReminder(original);
  assert.ok(out.startsWith(original), 'original summary must remain at the start');
  assert.ok(out.length > original.length, 'content must have grown');
  // the passing count is surfaced in the reminder
  assert.match(out, /8/);
});
```

### B4: end-to-end — an all-pass `run_tests` turn delivers the reminder in the tool message the model sees
∵ **IF** during a trial the model calls `run_tests` and the suite is all-pass non-empty
↦ **WHEN** the provider processes the turn and pushes the tool-result message
∴ **THEN** the `tool`-role turn paired with that `run_tests` call carries the reminder text, while a subsequent failing `run_tests` turn does not.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTrial } from '../../providers/openai-compatible.js';

test('B4: end-to-end all-pass run_tests tool message carries the reminder', async () => {
  // Source + test that pass cleanly under run_tests' node:test sandbox.
  const goodSource = 'export function add(a, b) {\n  return a + b;\n}\n';
  const goodTest =
    "import { test } from 'node:test';\n" +
    "import assert from 'node:assert/strict';\n" +
    "import { add } from './index.js';\n" +
    "test('adds', () => { assert.strictEqual(add(1, 2), 3); });\n";

  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      // turn 1: write the test
      return mkToolCall('call_t', 'write_test', { path: 'index.test.js', content: goodTest });
    }
    if (calls === 2) {
      // turn 2: write the source
      return mkToolCall('call_s', 'write_source', { path: 'index.js', content: goodSource });
    }
    if (calls === 3) {
      // turn 3: run the tests (will be all-pass)
      return mkToolCall('call_r', 'run_tests', {});
    }
    // turn 4: stop
    return {
      ok: true, status: 200,
      async json() { return { usage: {}, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'done' } }] }; },
      async text() { return ''; },
    };
  };
  function mkToolCall(id, name, args) {
    return {
      ok: true, status: 200,
      async json() {
        return {
          usage: { prompt_tokens: 5, completion_tokens: 5 },
          choices: [{
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant', content: '',
              tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
            },
          }],
        };
      },
      async text() { return ''; },
    };
  }

  const toolDefs = ['write_source', 'write_test', 'run_tests'].map((name) => ({
    type: 'function',
    function: {
      name,
      description: name,
      parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, test_path: { type: 'string' } } },
    },
  }));

  const result = await runTrial({
    endpoint_url: 'http://mock/v1', model_id: 'mock', protocol_variant: 'openai-chat-completions',
    system_prompt: 'SYS', user_message: 'task', tools: toolDefs,
    _injectedFetch: fetchImpl,
  });

  // The tool turn paired with the run_tests call must carry the reminder.
  const runToolTurn = result.conversation.find(
    (t) => t.role === 'tool' && t.tool_call_id === 'call_r',
  );
  assert.ok(runToolTurn, 'a tool turn for the run_tests call must exist');
  assert.match(runToolTurn.content, /passed/);
  assert.match(runToolTurn.content, /STOP NOW/);
});
```

## Red-team check

Decision: detect an all-pass, non-empty `run_tests` result by its exact summary-line format and append a salient wrap-up reminder to that turn's tool-result message, nudging the model to stop. No hard-stop, no turn-cap change, no separate system/user turn.

Top three reasons this might not be the right call:

1. **Format-coupling: the detector keys off `formatResult`'s exact string shape, so a future change to `run-tests-tool.js` could silently stop the reminder firing (or fire it wrongly).** Mitigated by anchoring the match to the stable invariants of the all-pass case: a leading `[run_tests] ` prefix, an `N/N passed` ratio with equal numerator/denominator and `N > 0`, and the ABSENCE of the `| ... failed` / `— <names>` / error / timeout / load-error / `no test files` markers. The detector is conservative — anything it does not positively recognize as all-pass-non-empty is left untouched, so a format drift fails safe (no reminder) rather than firing on a failing run. The spec's B2 enumerates every other observed format as a negative case, so a regression is caught by the suite.

2. **A nudge the model still ignores buys nothing — maybe a hard-stop is the real fix.** Rejected deliberately: a hard-stop on first green would mis-score any trial that legitimately needs more than one green checkpoint (e.g. the model adds a test, goes red, then green again), and it removes the model's own agency to decide it is done — which is exactly the behavior the bench measures. The inline reminder is strictly more information at the most salient moment, costs nothing if ignored, and leaves the trial's stop decision where the protocol puts it (a zero-tool-call turn). If the nudge proves insufficient in a later round, escalating is a separate, measurable decision.

3. **It alters what the model sees mid-trial on a pre-registered protocol.** The locked study design (conditions, tasks, scoring predicates, hypotheses) is untouched; this only augments the model's own `run_tests` feedback, which the harness already authored. The reminder is appended to the existing tool message (not a new turn), so it does not perturb the system-first invariant. It applies uniformly across all conditions and topologies, so it is methodology-neutral. The raw `run_tests` result remains the prefix of the message, so the transcript still shows exactly what the suite reported.

Verdict: **PROCEED.** Conservative all-pass detection that fails safe, an additive nudge that preserves the model's stop agency, methodology-neutral and observability-preserving.

## Handoff

After testflow inserts these test fences into `bench/out/spec-tests/`, the implementer:

- Adds an exported `appendGreenWrapupReminder(resultString)` to `bench/providers/openai-compatible.js`. Behavior: if `resultString` is a non-empty string matching the all-pass-non-empty shape — a single summary line `[run_tests] N/N passed` where the numerator equals the denominator and `N > 0`, with NO `| ... failed` suffix, NO `— <names>` failing list, and NOT one of the error/timeout/load-error/no-tests forms — return `resultString` plus an appended reminder. Otherwise return `resultString` unchanged. The reminder must name the passing count, instruct the model to STOP NOW by replying with no tool calls, and tell it not to re-run tests on already-passing code or rewrite working files.
- In the `run_tests` branch of the per-turn loop (where `outcomes[i] = result;`), wrap the result through `appendGreenWrapupReminder` before assigning it to `outcomes[i]`, so the appended reminder lands in the tool message paired with that `run_tests` `tool_call_id`.
- Touches NOTHING else in the provider's control flow (no turn-cap change, no new turns).
- Wires `doc/specs/2026-05-24-bench-green-wrapup-reminder.spec.md` into `bench/package.json`'s `pretest` extractor chain (after the `2026-05-24-bench-strip-code-fence.spec.md` entry).
- Confirms `VLLM_RECOVERY_MAX_RETRIES=0 npm test --prefix bench` is green (existing tests + B1–B4 here) and `npm test` (wovenflow self-tests) is unchanged-green.

After all behaviors are green, no further work — this is a harness-only fix. `bench/` is not plugin surface; no version bump.
