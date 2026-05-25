# Bench provider: strip a wrapping markdown code fence from `write_source` / `write_test` content

## User stories

- As the bench operator, I want `write_source` / `write_test` content that is wholly wrapped in a single markdown code fence (e.g. ` ```javascript\n…\n``` `) to be unwrapped before the file is persisted, so that a model that habitually fences its code does not produce a file whose first line (` ```javascript `) is a syntax error — which makes the hidden suite's `import('index.js')` throw and scores the trial a misleading load failure instead of its true behavioral score.

## Context

The hidden test for each task resolves the submission with a fixed entrypoint, `await import(sourceDir + '/index.js')`. If the persisted `index.js` begins with a markdown fence line, the import throws `SyntaxError` and the trial records the load-failure signature (`total_count: 1`, a single file-level subtest failure, not a real per-test run).

Observed live in `bench/results/vllm14b-dtdd-20260524T052338/slugify-dtdd-single-0/` (Qwen2.5-Coder-14B-Instruct-AWQ via vLLM): the model emitted a **correct** slugify implementation, but the `write_source` `content` argument was the entire function wrapped in a fence:

```
​```javascript
export function slugify(input) { … }
​```
```

The harness wrote that verbatim to `index.js`, so the import failed and the cell scored `0/1`. The **same task and model under the `baseline` condition scored 8/8** on a clean (un-fenced) response. The fence-wrapping is therefore (a) a pure harness artifact — the inner code is valid and complete — and (b) **condition-correlated**: the methodology-heavy conditions ("write a spec", "write a document") nudge the model into a documentation register where fencing code is natural. Scoring the fence as a code failure would attribute a markdown-formatting habit to the methodology, confounding the benchmark's central comparison.

This is the same class of harness gap as the existing CommonJS-content rejection (`validateArtifactContent`), the subdirectory-path rejection (`validateArtifactPath`), and the mid-conversation-system fix: locally-reasonable model output the harness should normalize at write time rather than silently mis-score.

**Why strip rather than reject (the choice the prior three fixes made):** the CJS and subdirectory cases reject content/paths that would be *wrong even after the obvious correction is applied at the same location* (CJS throws regardless; a subdir file never loads at the root). A wrapping fence is different — the model's intended payload is the **valid code inside the fence**; the fence is a transport/formatting wrapper, not a defect in the code. Unwrapping it is closer to *parsing the tool argument correctly* than to *rejecting bad code*. It also avoids a failure mode that rejection would introduce on a weak model: a model that fences habitually would get its file rejected, never persist an `index.js`, and score an `empty-source` skip (excluded from analysis) — strictly worse than scoring the code it actually wrote. Stripping is methodology-neutral (applies to all conditions and topologies) and the raw fenced argument remains in the saved transcript, so no observability is lost. Every strip is recorded in a `content_normalizations[]` array on the result for auditability.

The strip is deliberately conservative: it fires **only** when the entire trimmed content is a single fenced block (optionally with a language tag). Content with prose around a fence, or multiple fenced blocks, is left untouched — those are ambiguous and not the observed failure.

## Behaviors

### B1: `stripCodeFence` unwraps a single fully-wrapping fence with a language tag
∵ **IF** `stripCodeFence(content)` is called with content whose trimmed form starts with an opening fence line carrying a language tag (e.g. ` ```javascript `, ` ```js `, ` ```ts `) and ends with a closing ` ``` ` line, with the file body in between
↦ **WHEN** the function runs
∴ **THEN** it returns just the inner body (the fence lines removed), preserving the body's own internal newlines, and not introducing a leading/trailing blank line from the removed fences.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripCodeFence } from '../../providers/openai-compatible.js';

test('B1: stripCodeFence unwraps a fence with a language tag', () => {
  const wrapped = '```javascript\nexport function slugify(s) {\n  return s.toLowerCase();\n}\n```';
  const inner = 'export function slugify(s) {\n  return s.toLowerCase();\n}';
  assert.strictEqual(stripCodeFence(wrapped), inner);
  // leading/trailing whitespace around the whole block is tolerated
  assert.strictEqual(stripCodeFence('\n\n' + wrapped + '\n'), inner);
});
```

### B2: `stripCodeFence` unwraps a fence with no language tag
∵ **IF** `stripCodeFence(content)` is called with content wrapped in a bare ` ``` ` … ` ``` ` fence (no language tag)
↦ **WHEN** the function runs
∴ **THEN** it returns the inner body with both fence lines removed.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripCodeFence } from '../../providers/openai-compatible.js';

test('B2: stripCodeFence unwraps a bare fence', () => {
  const wrapped = '```\nconst x = 1;\nexport default x;\n```';
  assert.strictEqual(stripCodeFence(wrapped), 'const x = 1;\nexport default x;');
});
```

### B3: `stripCodeFence` leaves non-wrapping content unchanged
∵ **IF** `stripCodeFence(content)` is called with content that is NOT a single fully-wrapping fence — already-clean code, prose followed by a fenced block, two separate fenced blocks, or a string that merely contains backticks inline
↦ **WHEN** the function runs
∴ **THEN** it returns the content unchanged (the strip is conservative; it only fires for the unambiguous whole-content single-fence case).

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripCodeFence } from '../../providers/openai-compatible.js';

test('B3: stripCodeFence leaves non-wrapping content unchanged', () => {
  const clean = 'export function f() {\n  return 1;\n}';
  assert.strictEqual(stripCodeFence(clean), clean);

  const prosePlusFence = 'Here is the code:\n```js\nexport const x = 1;\n```';
  assert.strictEqual(stripCodeFence(prosePlusFence), prosePlusFence);

  const twoBlocks = '```js\nconst a = 1;\n```\n```js\nconst b = 2;\n```';
  assert.strictEqual(stripCodeFence(twoBlocks), twoBlocks);

  const inlineBackticks = 'const s = `a ${x} b`;\nexport default s;';
  assert.strictEqual(stripCodeFence(inlineBackticks), inlineBackticks);

  // empty / non-string inputs pass through untouched
  assert.strictEqual(stripCodeFence(''), '');
});
```

### B4: `write_source` persists the unwrapped content and records the normalization
∵ **IF** during a trial the model emits a `write_source` call whose `content` is a single fully-wrapping fenced block containing valid ESM
↦ **WHEN** the provider processes the turn
∴ **THEN** the persisted `source_files[path]` is the unwrapped body (so the hidden `import('index.js')` resolves), the CJS/path validation runs against the unwrapped body, and a record of the strip is appended to the result's `content_normalizations[]` array (each entry naming the tool and path). The raw fenced argument is unchanged in the saved `conversation` transcript.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTrial } from '../../providers/openai-compatible.js';

test('B4: write_source persists unwrapped content and logs the normalization', async () => {
  let calls = 0;
  const fencedSource = '```javascript\nexport function slugify(s) {\n  return s.toLowerCase();\n}\n```';
  const provider = {
    async fetch() {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true, status: 200,
          async json() {
            return {
              usage: { prompt_tokens: 5, completion_tokens: 5 },
              choices: [{
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant', content: '',
                  tool_calls: [{
                    id: 'call_1', type: 'function',
                    function: { name: 'write_source', arguments: JSON.stringify({ path: 'index.js', content: fencedSource }) },
                  }],
                },
              }],
            };
          },
          async text() { return ''; },
        };
      }
      return {
        ok: true, status: 200,
        async json() { return { usage: {}, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'done' } }] }; },
        async text() { return ''; },
      };
    },
  };
  const result = await runTrial({
    endpoint_url: 'http://mock/v1', model_id: 'mock', protocol_variant: 'openai-chat-completions',
    system_prompt: 'SYS', user_message: 'task',
    tools: [{ type: 'function', function: { name: 'write_source', description: 'w', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } }],
    _injectedFetch: provider.fetch,
  });
  // Persisted file is unwrapped — no fence lines, valid ESM.
  assert.strictEqual(result.source_files['index.js'], 'export function slugify(s) {\n  return s.toLowerCase();\n}');
  assert.ok(!result.source_files['index.js'].includes('```'));
  // Normalization recorded.
  assert.ok(Array.isArray(result.content_normalizations));
  assert.strictEqual(result.content_normalizations.length, 1);
  assert.strictEqual(result.content_normalizations[0].tool, 'write_source');
  assert.strictEqual(result.content_normalizations[0].path, 'index.js');
  // Raw fenced argument preserved in the transcript.
  const assistantTurn = result.conversation.find((t) => t.role === 'assistant' && Array.isArray(t.tool_calls));
  assert.ok(JSON.parse(assistantTurn.tool_calls[0].function.arguments).content.includes('```'));
});
```

## Red-team check

Decision: add a conservative `stripCodeFence` that unwraps content only when the entire trimmed content is a single fenced block, apply it to `write_source` / `write_test` content before validation and persistence, and log each strip in `content_normalizations[]`.

Top three reasons this might not be the right call:

1. **It silently modifies model output, unlike the three prior fixes which reject.** Mitigated three ways: (a) the modification is a faithful unwrap of the model's evident intent — the inner code is what it meant to write; (b) the raw fenced argument is preserved verbatim in the saved transcript, so nothing is lost for audit; (c) every strip is recorded in `content_normalizations[]`, the same observability shape as `path_rejections[]`. The rejection pattern was right for content that is wrong-as-written (CJS, subdirs); unwrapping is right for content that is correct-but-wrapped.

2. **A too-eager strip could corrupt a file that legitimately is a markdown document** (e.g. a task that asks for a `.md` artifact whose body is a fenced block). Mitigated by the conservative trigger: it only fires when the *whole* trimmed content is exactly one fence pair. A real `.md` artifact would have prose or front-matter around any fence, so it would not match. If a future task needs a file that is literally one fenced block, the trigger would need revisiting — but no current task is shaped that way (the tasks are single-module JS exercises whose entrypoint is `index.js`).

3. **It changes scoring behavior on a pre-registered protocol.** The locked study design (conditions, tasks, scoring predicates, hypotheses) is untouched. This removes a harness artifact that was *confounding* the comparison — fence-wrapping was condition-correlated, so leaving it in would attribute a formatting habit to methodology. Documented here, consistent with the prior three post-tag harness normalizations, and recorded per-strip so the effect is measurable rather than hidden.

Verdict: **PROCEED.** Conservative trigger, faithful normalization, full observability retained, removes a condition-correlated confound from the benchmark's central comparison.

## Handoff

After testflow inserts these test fences into `bench/out/spec-tests/`, the implementer:

- Adds an exported `stripCodeFence(content)` to `bench/providers/openai-compatible.js`, next to `validateArtifactContent`. Behavior: if `content` is a non-empty string whose trimmed form starts with an opening fence (`^\`\`\`[a-zA-Z0-9_-]*\n`) and ends with a closing fence (`\n\`\`\`$` on the trimmed form), return the substring between the opening fence line and the closing fence line, with the trailing newline before the closing fence removed and no surrounding blank lines introduced. Otherwise return `content` unchanged. Must only fire for a single whole-content fence pair (reject the multi-block / prose-around-fence cases — e.g. require that the closing ` ``` ` is the final line of the trimmed content and there is no intermediate ` ``` ` fence line).
- In both the `write_source` and `write_test` branches of the per-turn loop (after `args.path && args.content` is established), compute `const normalized = stripCodeFence(args.content)`; if `normalized !== args.content`, push `{ tool, path: args.path }` to a module-scoped `contentNormalizations` array. Run `validateArtifactPath` / `validateArtifactContent` against and persist `normalized` (not the raw `args.content`).
- Surfaces `result.content_normalizations = contentNormalizations` on the returned object (always present, possibly empty — same back-compat shape as `path_rejections` / `content_rejections`).
- Leaves the `conversation` transcript untouched (the raw tool_call arguments keep the fence).
- Wires `doc/specs/2026-05-24-bench-strip-code-fence.spec.md` into `bench/package.json`'s `pretest` extractor chain.
- Confirms `npm test --prefix bench` is green (existing tests + B1–B4 here) and `npm test` (wovenflow self-tests) is unchanged-green.

After all behaviors are green, no further work — this is a harness-only fix. `bench/` is not plugin surface; no version bump.
