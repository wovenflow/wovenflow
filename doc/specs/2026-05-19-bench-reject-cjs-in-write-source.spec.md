# Bench provider: reject CommonJS content in `write_source` / `write_test`

## User stories

- As the bench operator, I want the provider to reject `write_source` / `write_test` calls whose `content` uses CommonJS module syntax (`module.exports = ...`, `exports.X = ...`, `require(...)`), so that trials produced under `"type": "module"` trial dirs don't silently fail at hidden-test import time. The model sees the rejection reason in its tool result and can retry with ESM syntax.

## Context

The bench's trial dirs declare `"type": "module"`. Hidden test suites import the agent's source via `await import(sourceDir + '/index.js')`. When the agent writes CJS (`module.exports = slugify`) under ESM scope, the import throws `ReferenceError: module is not defined` and the hidden test file fails to load — surfacing as `hidden_pass: { pass_count: 0, total_count: 1 }` in `meta.json`.

The `TOOL_USAGE_INSTRUCTIONS` system prompt already tells the model:

> Files are loaded as ES modules (the project `package.json` declares `"type": "module"`). Expose functions with `export function name(...)` or `export default function`. Do not use `module.exports` or `require(...)` — CommonJS syntax throws at import time in ES module scope.

But open-weights coder models occasionally ignore the directive — observed in `bench/results/ray-smoke-20260519T023549/slugify-dtdd-multi-0/phase-2/source/index.js`, which contains `module.exports = slugify` despite the explicit warning. That trial scored `0/1` solely because of the load failure.

Harness-side content validation catches the pattern at write time, surfaces the rejection to the model as a tool result, and lets the model retry. The trial outcome stops being "silent CJS scored as load error" and becomes "model corrected itself after rejection" or, if it doesn't, "n turns wasted on CJS retries" — both are observable, actionable signals where the prior behavior was a confusing 0/1.

This validation is methodology-neutral (applies to all conditions and topologies) and lives next to the existing `validateArtifactPath` path-traversal validation.

## Behaviors

### B1: `validateArtifactContent` accepts ESM content
∵ **IF** `validateArtifactContent(content, path)` is called with `content` that uses `export function` / `export default` / `import x from '...'` (or has no module-system statements at all)
↦ **WHEN** the function returns
∴ **THEN** the return value is `{ ok: true }`. No CJS-pattern false positive is fired by ESM syntax, by string literals containing the substring `module.exports` inside a comment, or by empty content.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifactContent } from '../../providers/openai-compatible.js';

test('B1: validateArtifactContent accepts ESM and empty content', () => {
  // Canonical ESM
  assert.deepStrictEqual(
    validateArtifactContent('export function slugify(input) { return input.toLowerCase(); }', 'index.js'),
    { ok: true },
  );
  assert.deepStrictEqual(
    validateArtifactContent('export default function slugify(input) { return input; }', 'index.js'),
    { ok: true },
  );
  assert.deepStrictEqual(
    validateArtifactContent("import { foo } from './lib.js';\nexport const bar = foo;\n", 'index.js'),
    { ok: true },
  );
  // Empty / non-string
  assert.deepStrictEqual(validateArtifactContent('', 'index.js'), { ok: true });
  assert.deepStrictEqual(validateArtifactContent(null, 'index.js'), { ok: true });
  assert.deepStrictEqual(validateArtifactContent(undefined, 'index.js'), { ok: true });
});
```

### B2: `validateArtifactContent` rejects `module.exports = ...`
∵ **IF** `validateArtifactContent(content, path)` is called with `content` containing `module.exports = ...` at the start of a line (after optional leading whitespace)
↦ **WHEN** the function returns
∴ **THEN** the return value is `{ ok: false, reason: <string> }` where `reason` contains the literal substring `module.exports` and the literal substring `"type": "module"` (pointing the model at the cause) and the path argument.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifactContent } from '../../providers/openai-compatible.js';

test('B2: validateArtifactContent rejects module.exports = ...', () => {
  const cjs = 'function slugify(s) { return s.toLowerCase(); }\nmodule.exports = slugify;\n';
  const r = validateArtifactContent(cjs, 'index.js');
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /module\.exports/);
  assert.match(r.reason, /"type":\s*"module"/);
  assert.match(r.reason, /index\.js/);

  // Leading whitespace still matches (line-start regex with optional indent).
  const indented = '  module.exports = foo;\n';
  assert.strictEqual(validateArtifactContent(indented, 'index.js').ok, false);

  // Tab indent too.
  const tabbed = '\tmodule.exports = foo;\n';
  assert.strictEqual(validateArtifactContent(tabbed, 'index.js').ok, false);
});
```

### B3: `validateArtifactContent` rejects `require(...)` patterns
∵ **IF** `validateArtifactContent(content, path)` is called with `content` containing `const x = require('y')`, `require('z')` at line start, or `exports.<name> = ...`
↦ **WHEN** the function returns
∴ **THEN** the return value is `{ ok: false, reason: <string> }` with `reason` naming the CJS pattern.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifactContent } from '../../providers/openai-compatible.js';

test('B3: validateArtifactContent rejects require() and exports.X patterns', () => {
  const r1 = validateArtifactContent("const fs = require('node:fs');\nexport function foo() {}\n", 'index.js');
  assert.strictEqual(r1.ok, false);
  assert.match(r1.reason, /require/);

  const r2 = validateArtifactContent("require('node:fs');\nexport function foo() {}\n", 'index.js');
  assert.strictEqual(r2.ok, false);
  assert.match(r2.reason, /require/);

  const r3 = validateArtifactContent('function foo() {}\nexports.foo = foo;\n', 'index.js');
  assert.strictEqual(r3.ok, false);
  assert.match(r3.reason, /exports\./);

  // `let` and `var` should also be caught.
  const r4 = validateArtifactContent("let path = require('node:path');\nexport const p = path;\n", 'index.js');
  assert.strictEqual(r4.ok, false);
});
```

## Red-team check

Decision: add `validateArtifactContent` and surface rejections in tool results so the model retries with ESM.

Top three reasons this might not be the right call:

1. **False positives could block legitimate code.** A docstring that says `// pre-ESM, this used module.exports` would not be rejected (the regex requires line-start), but a snippet like `\nmodule.exports = foo` at line start would. If the model genuinely needs CJS for some reason (no realistic case in this bench — trial dirs declare "type": "module"), this is a hard block. **Mitigation:** the rejection reason names the pattern and points at the ESM syntax to use; the model can rewrite. The error is reversible per-turn. Not load-bearing.

2. **The model could thrash retrying the same CJS pattern in a loop.** If Qwen3.6 reliably emits CJS in some contexts, the harness could spin on rejections until turn-cap. **Mitigation:** the rejection is surfaced explicitly in the tool result, which is exactly the kind of feedback that fine-tuned coder models tend to act on (they've seen many "error: X is undefined" patterns in training data). If empirical thrashing emerges, downgrade rejection to a warning rather than a hard block. Worth measuring before second-guessing.

3. **Methodology compliance becomes harder to measure post-hoc.** Before this fix, a CJS source under ESM scope was a clean "methodology-noncompliant" signal in the data (the trial scored 0/1, but the source on disk showed the model's actual choice). After this fix, CJS is corrected in flight — the data shows the post-correction source, hiding the original choice. **Mitigation:** `content_rejections[]` is recorded in the trial's `meta.json` (via the runner's serialization), preserving the original choice as a methodology-compliance signal independent of the corrected on-disk output. The fix improves Phase-2 scoring without losing the methodology signal.

Verdict: **PROCEED.** Three patterns, line-start matching keeps false positives low, tool-result surfacing creates an in-flight feedback loop that mirrors a real coder's edit-test-fix cycle, and `content_rejections[]` preserves the methodology-compliance signal for post-hoc analysis.

## Handoff

After testflow inserts these test fences into `bench/out/spec-tests/`, the implementer:

- Confirms `validateArtifactContent` exists in `bench/providers/openai-compatible.js` (created at fix time alongside `validateArtifactPath`).
- Confirms both `write_source` and `write_test` native and JSON-code-block fallback handlers run `validateArtifactContent` after `validateArtifactPath` passes, push to `contentRejections[]` on failure, and skip the file write.
- Confirms the per-turn tool-result construction surfaces `[rejected] <reason>` lines for content rejects (alongside the existing path rejects).
- Confirms `result.content_rejections` is populated.
- Authors `bench/test/fixtures/mock-cjs-write.mjs` — a tiny mock provider that emits a single `write_source` call with `module.exports = slugify` content, then on the next turn emits no tool calls (to end the loop). Pattern matches the existing `mock-multi-agent-*.mjs` fixtures.

After all behaviors are green, no further work — this is a harness-only fix.
