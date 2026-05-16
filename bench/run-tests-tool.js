// run_tests tool execution.
//
// Lets a bench agent verify its own tests against its own source mid-trial,
// instead of guessing whether they pass. The DTDD trial that motivated this
// shipped tests asserting `/Invalid semver string/` against an impl that threw
// `Invalid semantic version: ...` — the test/impl mismatch would have been
// caught instantly if the agent had been able to run the tests.
//
// Operates on the in-memory maps the openai-compatible provider accumulates
// from the agent's `write_source` / `write_test` tool calls. Runs in a
// sandboxed tempdir so:
//   1. The agent can't reach into the bench's hidden_tests/ directory (which
//      lives at bench/tasks/<task>/hidden_tests/ — outside the sandbox).
//   2. Path traversal in `test_path` is rejected before any execution; only
//      paths the agent has actually written via write_test are eligible.
//
// Returns a single string (capped at MAX_RESULT_CHARS) suitable as a tool
// result message back to the model. Format:
//
//     [run_tests] 6/10 passed | 4 failed
//     FAIL: parse > throws for invalid input ...
//       AssertionError: ...
//     ...
//
// scoring:
//   - hidden tests scoring (bench/scorer.js scoreHidden) is the bench's
//     official grading path; run_tests is the agent's feedback loop.
//     They share execution patterns but never cross.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Cap on the result string we hand back to the model. ~2000 chars is enough
// for ~30 lines of failure detail without bloating context. Truncation is
// indicated explicitly so the model knows there was more.
const MAX_RESULT_CHARS = 2000;

// Per-tool-call wall clock cap. Keeps a runaway test (infinite loop, hung
// import) from chewing the trial's budget. 60s is generous for unit tests.
const DEFAULT_TIMEOUT_MS = 60_000;

// Match `*.test.{js,mjs,cjs}` test files. Mirrors the scorer's TEST_FILE_RE
// shape but is permissive about whether the agent uses `.js`, `.mjs`, or
// `.cjs` (the project is type:module so `.js` is ESM-by-default).
const TEST_FILE_RE = /\.test\.(m?js|cjs)$/;

// --- path-traversal guard ---------------------------------------------------

// Validate that a relative `test_path` (when provided) targets a file the
// agent has actually written via `write_test`. Defends against:
//
//   - `../../bench/tasks/<task>/hidden_tests/anything.js` (path traversal
//     toward the hidden suite — the model could try this to score itself
//     against the held-out grader)
//   - absolute paths
//   - paths that escape via `../`, `./..`, etc.
//
// The contract is intentionally strict: the path MUST appear verbatim as a
// key in `testFiles` (i.e. exactly one of the paths the agent has written).
// "Match by basename" is rejected because two test files could share a base.
function validateTestPath(test_path, testFiles) {
  if (typeof test_path !== 'string' || test_path.length === 0) {
    return { ok: false, reason: 'test_path must be a non-empty string when provided' };
  }
  // Reject absolute and parent-traversal patterns BEFORE consulting testFiles
  // so the rejection message is clear about WHY (security), not just that the
  // path didn't match.
  if (test_path.startsWith('/') || test_path.startsWith('\\')) {
    return { ok: false, reason: `test_path must be relative (got absolute "${test_path}")` };
  }
  if (test_path.includes('..')) {
    return {
      ok: false,
      reason:
        `test_path "${test_path}" contains ".." — only files you have written via ` +
        `write_test are eligible. Path traversal toward bench/tasks/<task>/hidden_tests/ ` +
        `is rejected.`,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(testFiles, test_path)) {
    const available = Object.keys(testFiles);
    return {
      ok: false,
      reason:
        `test_path "${test_path}" was not written via write_test. ` +
        (available.length > 0
          ? `Available test files: ${available.join(', ')}`
          : 'No test files have been written yet.'),
    };
  }
  return { ok: true };
}

// --- TAP parsing -------------------------------------------------------------

// Parse node:test TAP for a list of {name, ok, diag} per leaf test, plus the
// rolled-up footer counts. Reused-from-scorer.js style: prefer the footer for
// counts, but keep per-test entries for the failure detail we surface back to
// the model. Diagnostic lines (`---` ... `...`) are concatenated under the
// preceding test's `diag` field so a single FAIL: line can carry the
// AssertionError detail.
function parseTap(tap) {
  const lines = tap.split('\n').map((l) => l.replace(/\r$/, ''));
  const tests = [];
  let current = null;
  let inDiag = false;
  let suiteStack = [];

  for (const line of lines) {
    // Indented `# Subtest: name` — opens a suite/describe block, push the name
    // onto the stack so leaf-test names can be qualified `parent > leaf`.
    const subtest = line.match(/^(\s*)# Subtest: (.+)$/);
    if (subtest) {
      const depth = Math.floor(subtest[1].length / 4);
      // Trim the stack to the new depth.
      suiteStack = suiteStack.slice(0, depth);
      suiteStack.push(subtest[2]);
      continue;
    }
    // Top-level `ok N - name` / `not ok N - name`. node:test emits these for
    // both leaf tests and rolled-up suite results. We only want leaf tests:
    // skip lines whose YAML diag identifies them as `type: 'suite'`.
    const okMatch = line.match(/^(\s*)(ok|not ok)\s+\d+\s+-\s+(.*)$/);
    if (okMatch) {
      const indent = okMatch[1];
      const ok = okMatch[2] === 'ok';
      let name = okMatch[3].replace(/\s+#\s+(SKIP|TODO).*$/i, '').trim();
      // Strip a trailing duration block like ` # time=12.34ms` if present.
      name = name.replace(/\s+#\s+time=.*$/, '');
      // Build the qualified name from the suite stack at the same depth.
      const depth = Math.floor(indent.length / 4);
      const ancestors = suiteStack.slice(0, depth);
      const qualified = [...ancestors, name].filter(Boolean).join(' > ');
      current = { name: qualified, ok, diag: '' };
      tests.push(current);
      inDiag = false;
      continue;
    }
    // YAML-style diag block opener / closer (`  ---` / `  ...`).
    if (current && /^\s*---\s*$/.test(line)) {
      inDiag = true;
      continue;
    }
    if (current && /^\s*\.\.\.\s*$/.test(line)) {
      inDiag = false;
      current = null;
      continue;
    }
    if (current && inDiag) {
      // Strip the leading YAML indent for compactness.
      current.diag += (current.diag ? '\n' : '') + line.replace(/^\s*/, '');
    }
  }

  // Filter out suite-level "ok" lines: a node:test suite without explicit
  // tests still gets a top-level `ok` for the file. We keep all leaf tests
  // (including subtests under describe), and post-filter rolled-up suites
  // by inspecting the diag for `type: suite`.
  const leafTests = tests.filter((t) => !/type: ['"]?suite['"]?/.test(t.diag));

  // Footer counts (canonical when present).
  let footerTotal = null;
  let footerPass = null;
  let footerFail = null;
  for (const line of lines) {
    let m;
    if ((m = line.match(/^#\s+tests\s+(\d+)\s*$/))) footerTotal = Number(m[1]);
    else if ((m = line.match(/^#\s+pass\s+(\d+)\s*$/))) footerPass = Number(m[1]);
    else if ((m = line.match(/^#\s+fail\s+(\d+)\s*$/))) footerFail = Number(m[1]);
  }

  // If the footer disagrees with the leaf-tests list (e.g. node:test counts
  // suite-level OKs), prefer the footer. The leafTests list is still useful
  // for failure detail.
  const total = footerTotal ?? leafTests.length;
  const pass =
    footerPass ?? leafTests.filter((t) => t.ok).length;
  const fail =
    footerFail ?? leafTests.filter((t) => !t.ok).length;

  return { tests: leafTests, total, pass, fail };
}

// --- result formatting ------------------------------------------------------

// Format the structured result as a string suitable for a tool result message.
// Truncates to MAX_RESULT_CHARS and explicitly notes when truncation occurred.
function formatResult({ pass, fail, total, failures, loadErrors, timedOut }) {
  const lines = [];
  if (timedOut) {
    lines.push(`[run_tests] TIMEOUT after ${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s — partial results may be incomplete`);
  }
  if (loadErrors.length > 0) {
    lines.push(`[run_tests] ${loadErrors.length} test file(s) failed to load:`);
    for (const le of loadErrors) {
      lines.push(`LOAD ERR: ${le.path}`);
      // Show the first line of the error; the full stack would blow the cap.
      const firstLine = le.message.split('\n').find((l) => l.trim().length > 0) ?? '';
      lines.push(`  ${firstLine.slice(0, 300)}`);
    }
    if (total === 0 && failures.length === 0) {
      // Pure load-error case — return early so the summary line doesn't lie.
      return truncate(lines.join('\n'));
    }
  }
  // Minimal: just summary line + (when failures exist) failing test names on
  // ONE line, comma-separated. No per-failure diag body. Goal: keep tool
  // responses tiny so the agent can iterate many times without burning the
  // turn/wall budget. If the agent needs to inspect a specific failure, they
  // can call run_tests({test_path}) to scope down.
  let line = `[run_tests] ${pass}/${total} passed${fail > 0 ? ` | ${fail} failed` : ''}`;
  if (failures.length > 0) {
    const names = failures.map((f) => f.name).join(', ');
    line += ` — ${names}`;
  }
  lines.push(line);
  return truncate(lines.join('\n'));
}

function truncate(s) {
  if (s.length <= MAX_RESULT_CHARS) return s;
  return s.slice(0, MAX_RESULT_CHARS - 30) + '\n[... truncated, output >2000 chars]';
}

// --- core entrypoint --------------------------------------------------------

/**
 * Execute the agent's tests against the agent's source in a sandbox.
 *
 * @param {object} args
 * @param {Record<string,string>} args.sourceFiles  — in-memory map (path → content)
 *   of files the agent has written via `write_source`. Path is project-root-
 *   relative (e.g. `index.js`, `source/index.js`).
 * @param {Record<string,string>} args.testFiles    — same, for `write_test`.
 * @param {string} [args.test_path]                 — optional. If provided, run
 *   only that single test file (validated against testFiles to defend against
 *   path traversal toward hidden_tests/).
 * @param {number} [args.timeout_ms]                — per-call wall clock cap.
 * @returns {string} — formatted result string for the tool result message.
 */
export function runTestsTool({
  sourceFiles = {},
  testFiles = {},
  test_path,
  timeout_ms = DEFAULT_TIMEOUT_MS,
} = {}) {
  // --- Path-traversal / availability guards -----------------------------
  let selectedTestPaths;
  if (test_path !== undefined && test_path !== null) {
    const v = validateTestPath(test_path, testFiles);
    if (!v.ok) {
      return `[run_tests] error: ${v.reason}`;
    }
    selectedTestPaths = [test_path];
  } else {
    // Default: every *.test.{js,mjs,cjs} the agent has written. We tolerate
    // tests under any subdir (e.g. tests/index.test.js, src/foo.test.js) —
    // the agent picks the layout, we run what's there.
    selectedTestPaths = Object.keys(testFiles).filter((p) => TEST_FILE_RE.test(p));
  }

  if (selectedTestPaths.length === 0) {
    return '[run_tests] no test files found (write tests via write_test before calling run_tests)';
  }

  // --- Sandbox setup ----------------------------------------------------
  // Layout inside the sandbox:
  //
  //   sandbox/<all source files at the same relative paths the agent used>
  //   sandbox/<all selected test files at the same relative paths>
  //
  // We preserve the agent's relative paths so an `import './source/index.js'`
  // in a test resolves identically inside the sandbox. The transformer
  // (transformTestSource from cross-test-matrix.mjs) is opinionated about
  // rewriting `from '../index.js'` / `from './index.js'` to `from
  // './__impl__.mjs'`, which is wrong for trials that DO use the project
  // root layout. We therefore SKIP the transform for impl-rewrite — only
  // the framework-shim portions matter for run_tests' purposes — and
  // instead use a thinner shim that strips known framework imports + adds
  // an `expect` shim, but leaves relative imports untouched.
  const sandbox = mkdtempSync(join(tmpdir(), 'wovenflow-run-tests-'));
  let timedOut = false;
  let totalPass = 0;
  let totalFail = 0;
  let totalTotal = 0;
  const failures = [];
  const loadErrors = [];
  const startedAt = Date.now();

  try {
    // Write source files first.
    for (const [relPath, content] of Object.entries(sourceFiles)) {
      writeSandboxFile(sandbox, relPath, content);
    }
    // Write test files (with framework shim applied if needed).
    const writtenTestPaths = [];
    for (const relPath of selectedTestPaths) {
      const original = testFiles[relPath];
      const transformed = applyShimIfNeeded(original);
      writeSandboxFile(sandbox, relPath, transformed);
      writtenTestPaths.push(relPath);
    }

    // Spawn one `node --test` per test file so we can attribute failures and
    // load errors per-file. Same NODE_TEST_CONTEXT scrub the scorer uses.
    for (const relPath of writtenTestPaths) {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= timeout_ms) {
        timedOut = true;
        break;
      }
      const remaining = timeout_ms - elapsed;
      const childEnv = { ...process.env };
      delete childEnv.NODE_TEST_CONTEXT;
      // Provide BENCH_SOURCE_DIR for tests authored against the bench's
      // hidden-suite convention (BENCH_SOURCE_DIR-rooted imports). The
      // agent's own tests usually use relative imports, but exposing the
      // sandbox is harmless and matches scoreHidden's pattern.
      childEnv.BENCH_SOURCE_DIR = sandbox;
      const result = spawnSync(
        process.execPath,
        ['--test', '--test-reporter=tap', join(sandbox, relPath)],
        {
          cwd: sandbox,
          env: childEnv,
          encoding: 'utf8',
          timeout: remaining,
          maxBuffer: 4 * 1024 * 1024, // 4MB; should never be reached in practice
        },
      );
      if (result.signal === 'SIGTERM' || result.error?.code === 'ETIMEDOUT') {
        timedOut = true;
        break;
      }
      const tap = (result.stdout || '') + (result.stderr || '');
      const summary = parseTap(tap);

      if (summary.total === 0 && result.status !== 0) {
        // No leaf tests AND non-zero exit — load error or runtime crash.
        // Pull the first SyntaxError / Error line from the TAP comments.
        const errLine =
          tap
            .split('\n')
            .map((l) => l.trim())
            .find(
              (l) =>
                /^# (SyntaxError|ReferenceError|TypeError|Error|Cannot)/.test(l),
            ) ?? `process exited ${result.status}`;
        loadErrors.push({ path: relPath, message: errLine.replace(/^# /, '') });
        continue;
      }
      totalTotal += summary.total;
      totalPass += summary.pass;
      totalFail += summary.fail;
      for (const t of summary.tests) {
        if (!t.ok) failures.push(t);
      }
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  return formatResult({
    pass: totalPass,
    fail: totalFail,
    total: totalTotal,
    failures,
    loadErrors,
    timedOut,
  });
}

// --- internal helpers -------------------------------------------------------

// Write a file to `sandbox/<relPath>`, creating parent directories as needed.
// `relPath` is trusted at this point (validated upstream against the in-memory
// maps the agent wrote, plus per-call validateTestPath for explicit selections).
function writeSandboxFile(sandbox, relPath, content) {
  const target = join(sandbox, relPath);
  // Defense-in-depth: refuse to write outside the sandbox even if the agent
  // managed to slip a `..` past write_source / write_test (write_source does
  // not currently validate this — see openai-compatible.js's structuredCalls
  // handler at line 315).
  const resolvedTarget = resolve(target);
  const resolvedSandbox = resolve(sandbox);
  if (!resolvedTarget.startsWith(resolvedSandbox + '/') && resolvedTarget !== resolvedSandbox) {
    // Skip — the agent wrote a path that resolves outside the sandbox. This is
    // a no-op (silent) because the path is already in the agent's in-memory
    // file map; the upstream tools will or won't have written it elsewhere
    // already. Our concern here is only NOT to escape the sandbox.
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

// Apply a thin framework shim to a test source: strip vitest/jest/chai
// imports and inject `expect` + node:test bindings. Reuses the same expect
// shim source as cross-test-matrix.mjs's transformTestSource — but only the
// framework-shim portion. We deliberately do NOT rewrite relative imports
// (cross-test-matrix's `__impl__.mjs` rewrite is wrong for run_tests because
// the agent's own tests already point at the right paths).
//
// Idempotence: re-applying the shim is safe — the strip-and-inject pattern
// produces the same output if no framework imports remain.
function applyShimIfNeeded(src) {
  if (typeof src !== 'string') return '';
  // Detect any framework import we'd need to shim.
  const HAS_FRAMEWORK =
    /\bfrom\s*['"](vitest|jest|@jest\/globals|mocha|chai)['"]/.test(src);
  if (!HAS_FRAMEWORK) {
    // Source is already plain node:test (or pure assert) — pass through
    // untransformed so we don't perturb syntax the agent intentionally chose.
    return src;
  }

  let out = src;
  // 1. Strip framework imports. Capture imported names so we can avoid
  //    re-declaring node:test bindings the source already has.
  const FRAMEWORK_IMPORT =
    /^\s*import\s*(?:\{([^}]*)\}\s*)?from\s*['"](vitest|jest|@jest\/globals|mocha|chai)['"]\s*;?\s*$/gm;
  out = out.replace(FRAMEWORK_IMPORT, '');

  // 2. Header: import describe/it/test from node:test if not already; always
  //    pull in assert + define `expect`.
  const ALREADY_NODE_TEST =
    /import\s*\{[^}]*\b(describe|it|test)\b[^}]*\}\s*from\s*['"]node:test['"]/.test(
      out,
    );
  const headerParts = [];
  if (!ALREADY_NODE_TEST) {
    headerParts.push(`import { describe, it, test } from 'node:test';`);
  }
  headerParts.push(
    `import { default as __rttAssert__ } from 'node:assert/strict';`,
  );
  headerParts.push(EXPECT_SHIM_SOURCE);
  return headerParts.join('\n') + '\n' + out;
}

// Minimal expect shim. Same matchers as cross-test-matrix.mjs's shim. Kept as
// a string constant rather than imported so this module stays standalone (the
// cross-test transform is opinionated in ways we don't want — see
// applyShimIfNeeded's comment).
const EXPECT_SHIM_SOURCE = `
const __rtt_assert = __rttAssert__;
function __rtt_makeMatchers(actual, negate) {
  const ok = (cond, msg) => {
    if (negate ? cond : !cond) __rtt_assert.fail(msg);
  };
  return {
    toEqual(expected) {
      try {
        __rtt_assert.deepStrictEqual(actual, expected);
        if (negate) __rtt_assert.fail('expected values to differ');
      } catch (err) {
        if (!negate) throw err;
      }
    },
    toStrictEqual(expected) {
      try {
        __rtt_assert.deepStrictEqual(actual, expected);
        if (negate) __rtt_assert.fail('expected values to differ');
      } catch (err) {
        if (!negate) throw err;
      }
    },
    toBe(expected) {
      ok(Object.is(actual, expected), 'expected ' + String(actual) + ' to be ' + String(expected));
    },
    toBeNull() { ok(actual === null, 'expected null'); },
    toBeUndefined() { ok(actual === undefined, 'expected undefined'); },
    toBeDefined() { ok(actual !== undefined, 'expected defined value'); },
    toBeTruthy() { ok(Boolean(actual), 'expected truthy'); },
    toBeFalsy() { ok(!actual, 'expected falsy'); },
    toContain(needle) {
      const has = actual && typeof actual.includes === 'function' && actual.includes(needle);
      ok(has, 'expected to contain ' + String(needle));
    },
    toHaveLength(n) { ok(actual && actual.length === n, 'expected length ' + n); },
    toThrow(matcher) {
      let threw = false;
      let err;
      try { if (typeof actual === 'function') actual(); }
      catch (e) { threw = true; err = e; }
      if (negate) {
        if (threw) __rtt_assert.fail('expected not to throw');
        return;
      }
      if (!threw) __rtt_assert.fail('expected to throw');
      if (matcher == null) return;
      if (matcher instanceof RegExp) {
        if (!matcher.test(err && err.message)) __rtt_assert.fail('thrown message ' + JSON.stringify(err && err.message) + ' does not match ' + matcher);
      } else if (typeof matcher === 'string') {
        if (!String(err && err.message).includes(matcher)) __rtt_assert.fail('thrown message does not contain ' + matcher);
      }
    },
  };
}
function __rtt_expect(actual) {
  const matchers = __rtt_makeMatchers(actual, false);
  matchers.not = __rtt_makeMatchers(actual, true);
  return matchers;
}
globalThis.expect = globalThis.expect || __rtt_expect;
`;

// Re-export the constants for tests that want to assert on cap behavior.
export const __INTERNALS__ = {
  MAX_RESULT_CHARS,
  DEFAULT_TIMEOUT_MS,
  TEST_FILE_RE,
};
