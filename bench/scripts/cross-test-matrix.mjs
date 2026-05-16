#!/usr/bin/env node
// Post-hoc cross-test matrix tool.
//
// Given a completed bench results directory (`bench/results/<run-id>/`),
// score every Phase-1 trial's implementation against every OTHER trial's
// tests AND against the task's hidden suite. The matrix is written to
// `<results_dir>/cross-test-matrix.json` and a human-readable
// `<results_dir>/cross-test-matrix.md`.
//
// Why this exists: per-trial scoring against a single held-out suite can mask
// real differences between methodologies (e.g. the semver-parse hidden suite
// accepts both reject-leading-zeros and accept-leading-zeros impls). Running
// each impl through every trial's own tests surfaces those differences
// directly. See bench/PROTOCOL-v2.md §9 for the use case.
//
// Phase-2 directories (`phase-2/`, `phase-2-wd/`) are intentionally ignored
// — the matrix is over Phase-1 (initial generation) only. Phase-2 changes
// the task in flight, so cross-testing across edit-trials would compare
// impls of subtly different specs.
//
// Test framework heterogeneity: trial test files often import non-Node
// frameworks (`vitest`, `jest`, `chai`, ...). The transformer below
// rewrites imports to `node:test` and injects a small `expect` shim
// supporting the common matchers seen in our trials. This is best-effort:
// if a transform misses, the matrix cell is reported as `LOAD ERR` rather
// than silently dropped.

import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Public helpers (also imported by the test file).
// ---------------------------------------------------------------------------

// Transform a test source file body so it runs under `node --test`.
//
// Handles:
//   - `import { describe, it, expect, ... } from 'vitest'|'jest'|'@jest/globals'|'mocha'|'chai'`
//     → strips the import, supplies `describe`/`it`/`test` from `node:test` and
//       a synthesized `expect`/`assert` shim.
//   - Bare `it(...)`/`test(...)` calls work either way (node:test exports both).
//   - Rewrites `from '../index.js'` and `from './index.js'` to a canonical
//     `from './__impl__.mjs'` so the sandbox layout is uniform regardless of
//     where the original test lived in the trial tree.
//
// The shim is appended (not prepended) only via injected header lines. Returns
// the transformed source. Idempotent on already-transformed input.
export function transformTestSource(src) {
  let out = src;

  // 1. Remove framework imports we are about to shim. We capture the imported
  //    names so we can avoid double-declaring `describe`/`it`/`test` later.
  const FRAMEWORK_IMPORT = /^\s*import\s*(?:\{([^}]*)\}\s*)?from\s*['"](vitest|jest|@jest\/globals|mocha|chai)['"]\s*;?\s*$/gm;
  const importedNames = new Set();
  out = out.replace(FRAMEWORK_IMPORT, (_match, names) => {
    if (names) {
      for (const raw of names.split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (name) importedNames.add(name);
      }
    }
    return ''; // strip the line
  });

  // 2. Rewrite relative impl imports to a canonical sibling path.
  //    Any `from './index.js'`, `from '../index.js'`, `from './index.mjs'`,
  //    or `from '../index.mjs'` becomes `from './__impl__.mjs'`. The sandbox
  //    layout writes the impl as `__impl__.mjs` next to the test.
  out = out.replace(
    /from\s*(['"])(?:\.\.?\/)+index\.(?:m?js)\1/g,
    "from './__impl__.mjs'",
  );
  // Same for dynamic-style require-ish patterns (defensive — most trials use
  // ESM imports, but some test files mix in `await import(...)`).
  out = out.replace(
    /import\s*\(\s*(['"])(?:\.\.?\/)+index\.(?:m?js)\1\s*\)/g,
    "import('./__impl__.mjs')",
  );

  // 3. Build the header. Always supply `describe`/`it`/`test` from node:test
  //    (re-import is idempotent — Node won't complain about duplicate symbols
  //    if we don't shadow names already present in the source). We always
  //    supply `expect` and `assert` shims because they're not from node:test.
  //
  //    To avoid duplicate `describe`/`it`/`test` declarations colliding with
  //    a leftover `import { describe, it } from 'node:test'` already in the
  //    source, we name our locals from a different binding when needed.
  //
  //    Strategy: if the source already imports any of describe/it/test from
  //    node:test, do NOT re-import them. Otherwise, import all three.
  const ALREADY_IMPORTS_NODE_TEST =
    /import\s*\{[^}]*\b(describe|it|test)\b[^}]*\}\s*from\s*['"]node:test['"]/.test(out);

  const headerParts = [];
  if (!ALREADY_IMPORTS_NODE_TEST) {
    headerParts.push(`import { describe, it, test } from 'node:test';`);
  }
  // Always pull in assert for the expect shim. Use a non-colliding alias.
  headerParts.push(
    `import { default as __ctmAssert__ } from 'node:assert/strict';`,
  );
  headerParts.push(EXPECT_SHIM_SOURCE);
  const header = headerParts.join('\n') + '\n';

  return header + out;
}

// The expect shim. Defines a global `expect()` and a thin `assert` re-export.
// Covers the matchers we've actually seen in qwen36 trials: toEqual, toBe,
// toThrow, toBeNull, toBeTruthy, toBeFalsy, toBeUndefined, toBeDefined,
// toContain, toHaveLength, plus `.not.<matcher>` negation. The shim throws
// AssertionError-shaped errors so node:test reports them cleanly.
const EXPECT_SHIM_SOURCE = `
const __ctm_assert = __ctmAssert__;
function __ctm_makeMatchers(actual, negate) {
  const ok = (cond, msg) => {
    if (negate ? cond : !cond) {
      __ctm_assert.fail(msg);
    }
  };
  return {
    toEqual(expected) {
      try {
        __ctm_assert.deepStrictEqual(actual, expected);
        if (negate) __ctm_assert.fail('expected values to differ');
      } catch (err) {
        if (!negate) throw err;
      }
    },
    toStrictEqual(expected) {
      try {
        __ctm_assert.deepStrictEqual(actual, expected);
        if (negate) __ctm_assert.fail('expected values to differ');
      } catch (err) {
        if (!negate) throw err;
      }
    },
    toBe(expected) {
      ok(Object.is(actual, expected), 'expected ' + String(actual) + ' to be ' + String(expected));
    },
    toBeNull() {
      ok(actual === null, 'expected null');
    },
    toBeUndefined() {
      ok(actual === undefined, 'expected undefined');
    },
    toBeDefined() {
      ok(actual !== undefined, 'expected defined value');
    },
    toBeTruthy() {
      ok(Boolean(actual), 'expected truthy');
    },
    toBeFalsy() {
      ok(!actual, 'expected falsy');
    },
    toContain(needle) {
      const has = actual && typeof actual.includes === 'function' && actual.includes(needle);
      ok(has, 'expected to contain ' + String(needle));
    },
    toHaveLength(n) {
      ok(actual && actual.length === n, 'expected length ' + n);
    },
    toThrow(matcher) {
      let threw = false;
      let err;
      try {
        if (typeof actual === 'function') actual();
      } catch (e) {
        threw = true;
        err = e;
      }
      if (negate) {
        if (threw) __ctm_assert.fail('expected not to throw, got: ' + (err && err.message));
        return;
      }
      if (!threw) __ctm_assert.fail('expected to throw');
      if (matcher == null) return;
      if (matcher instanceof RegExp) {
        if (!matcher.test(err && err.message)) {
          __ctm_assert.fail('thrown message ' + JSON.stringify(err && err.message) + ' does not match ' + matcher);
        }
      } else if (typeof matcher === 'string') {
        if (!String(err && err.message).includes(matcher)) {
          __ctm_assert.fail('thrown message ' + JSON.stringify(err && err.message) + ' does not contain ' + matcher);
        }
      } else if (typeof matcher === 'function') {
        if (!(err instanceof matcher)) {
          __ctm_assert.fail('thrown error is not instance of expected constructor');
        }
      }
    },
  };
}
function __ctm_expect(actual) {
  const matchers = __ctm_makeMatchers(actual, false);
  matchers.not = __ctm_makeMatchers(actual, true);
  return matchers;
}
globalThis.expect = globalThis.expect || __ctm_expect;
`;

// Walk a directory and yield matching test files.
function* walkTestFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTestFiles(p);
    } else if (entry.isFile() && /\.test\.(m?js|cjs)$/.test(entry.name)) {
      yield p;
    } else if (entry.isFile() && /\.spec\.(m?js|cjs)$/.test(entry.name)) {
      // Some trials use `.spec.js` for runnable tests rather than docs;
      // include them so the matrix picks up frameworks like jasmine.
      yield p;
    }
  }
}

// Read a trial's test files, transforming each individually. We deliberately
// do NOT concatenate them into a single body — multiple files often re-import
// the same names (`parse`, `widget`, ...) at module top-level and ESM rejects
// duplicate top-level bindings. Running each file separately also preserves
// per-file attribution if a single file fails to load.
function readTrialTestSources(testsDir) {
  const files = [...walkTestFiles(testsDir)].sort();
  if (files.length === 0) return [];
  const out = [];
  for (const f of files) {
    let body;
    try {
      body = readFileSync(f, 'utf8');
    } catch (err) {
      out.push({ path: f, body: null, error: err.message });
      continue;
    }
    out.push({ path: f, body, error: null });
  }
  return out;
}

// Run a transformed test body against an impl source dir. Returns
// { pass, total, load_error }.
function runTransformedTest({ testBody, implSourcePath }) {
  const sandbox = mkdtempSync(join(tmpdir(), 'wovenflow-ctm-'));
  try {
    // Layout:
    //   sandbox/__impl__.mjs   (the impl, possibly renamed for ESM)
    //   sandbox/cross-test.test.mjs (the transformed test)
    const dest = join(sandbox, '__impl__.mjs');
    copyFileSync(implSourcePath, dest);
    const testPath = join(sandbox, 'cross-test.test.mjs');
    writeFileSync(testPath, testBody);

    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    // Some hidden suites rely on BENCH_SOURCE_DIR; satisfy that contract too
    // so the same runner works for the hidden suite path.
    childEnv.BENCH_SOURCE_DIR = sandbox;

    const result = spawnSync(
      process.execPath,
      ['--test', '--test-reporter=tap', testPath],
      { cwd: sandbox, env: childEnv, encoding: 'utf8' },
    );
    const tap = (result.stdout || '') + (result.stderr || '');
    const loadError = detectLoadError(tap, result.status);
    if (loadError) {
      return { pass: 0, total: 0, load_error: loadError };
    }
    const summary = parseTapSummary(tap);
    return { pass: summary.pass, total: summary.total, load_error: null };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// Distinguish "the test file failed to load" from "tests ran and some failed".
// node:test wraps a file-level load failure as a synthetic top-level test
// whose name is the file path with `# Subtest: <file>` and `failureType:
// testCodeFailure`. The leading `# ...` block (Node's stderr leakage into TAP)
// contains the actual SyntaxError / ERR_MODULE_NOT_FOUND. Returns a short
// error string if a load error was detected, or null if the file ran normally.
function detectLoadError(tap, exitStatus) {
  // Strong signal: the TAP comment block contains a process-level error.
  const COMMENT_ERR = /^#\s+(SyntaxError|ReferenceError|TypeError|Error \[ERR_MODULE_NOT_FOUND\]|Cannot find (?:module|package)).*$/m;
  const commentMatch = tap.match(COMMENT_ERR);
  if (commentMatch) {
    // Pull a few comment lines around the error for context.
    const lines = tap
      .split('\n')
      .filter((l) => l.startsWith('# '))
      .slice(0, 8)
      .join('\n')
      .replace(/^# ?/gm, '');
    return lines.slice(0, 800);
  }
  // Weaker signal: there were zero passing tests and the process exited
  // non-zero, which usually means the test runner itself bailed out.
  const summary = parseTapSummary(tap);
  if (summary.total === 0 && exitStatus !== 0) {
    return `node --test exited ${exitStatus} with no test results`;
  }
  return null;
}

// Run the hidden suite for a task against an impl dir. Re-uses the existing
// scoreHidden contract (BENCH_SOURCE_DIR + execution under tmp cwd) but
// inlines the run loop so we don't need to import scorer.js (keeps this file
// runnable from any cwd).
//
// Both `taskDir` and `implSourceDir` MUST be absolute paths — the test
// process runs with cwd = sandbox tempdir, so relative paths from the
// caller's cwd would fail to resolve. We `resolve()` defensively here.
function runHiddenSuite({ taskDir, implSourceDir }) {
  const absTaskDir = resolve(taskDir);
  const absImplSourceDir = resolve(implSourceDir);
  const hiddenDir = join(absTaskDir, 'hidden_tests');
  if (!existsSync(hiddenDir)) {
    return { pass: 0, total: 0, load_error: `hidden_tests dir not found at ${hiddenDir}` };
  }
  const files = [];
  for (const entry of readdirSync(hiddenDir)) {
    const p = join(hiddenDir, entry);
    if (statSync(p).isFile() && /\.test\.(m?js|cjs)$/.test(entry)) files.push(p);
  }
  if (files.length === 0) return { pass: 0, total: 0, load_error: null };

  const sandbox = mkdtempSync(join(tmpdir(), 'wovenflow-ctm-hidden-'));
  try {
    let pass = 0;
    let total = 0;
    let firstError = null;
    for (const file of files) {
      const childEnv = { ...process.env, BENCH_SOURCE_DIR: absImplSourceDir };
      delete childEnv.NODE_TEST_CONTEXT;
      const result = spawnSync(
        process.execPath,
        ['--test', '--test-reporter=tap', file],
        { cwd: sandbox, env: childEnv, encoding: 'utf8' },
      );
      const tap = (result.stdout || '') + (result.stderr || '');
      const loadError = detectLoadError(tap, result.status);
      if (loadError && !firstError) firstError = loadError;
      const summary = parseTapSummary(tap);
      pass += summary.pass;
      total += summary.total;
    }
    return { pass, total, load_error: total === 0 ? firstError : null };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// Parse node:test TAP for leaf-test pass/total counts.
//
// node:test emits a footer block like:
//
//   # tests 5
//   # suites 1
//   # pass 4
//   # fail 1
//
// where `tests` counts every leaf test (including those nested inside
// `describe()` blocks). When that footer is present we use it directly.
// As a fallback (older Node, or output truncation), we count top-level
// `ok N - <name>` lines that are NOT `type: 'suite'` — but the top-level
// fallback misses subtests inside describe blocks, so it should only be
// used when the footer is absent.
function parseTapSummary(tap) {
  // Prefer the footer counts.
  const footerTests = tap.match(/^#\s+tests\s+(\d+)\s*$/m);
  const footerPass = tap.match(/^#\s+pass\s+(\d+)\s*$/m);
  if (footerTests && footerPass) {
    const total = Number(footerTests[1]);
    const pass = Number(footerPass[1]);
    return { pass, total };
  }
  // Fallback: count top-level ok / not ok lines.
  let pass = 0;
  let total = 0;
  for (const rawLine of tap.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const m = line.match(/^(ok|not ok)\s+\d+\s+-\s+(.*)$/);
    if (!m) continue;
    total += 1;
    if (m[1] === 'ok') pass += 1;
  }
  return { pass, total };
}

// Discover Phase-1 trial directories under a results dir. A trial dir is any
// child directory that contains `meta.json` AND a `source/` subdir.
function discoverTrials(resultsDir) {
  if (!existsSync(resultsDir)) return [];
  const entries = readdirSync(resultsDir, { withFileTypes: true });
  const trials = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const trialDir = join(resultsDir, entry.name);
    const metaPath = join(trialDir, 'meta.json');
    const sourceDir = join(trialDir, 'source');
    const testsDir = join(trialDir, 'tests');
    if (!existsSync(metaPath) || !existsSync(sourceDir)) continue;
    let meta;
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch {
      continue;
    }
    trials.push({
      trial_id: entry.name,
      dir: trialDir,
      meta,
      source_dir: sourceDir,
      tests_dir: existsSync(testsDir) ? testsDir : null,
    });
  }
  trials.sort((a, b) => a.trial_id.localeCompare(b.trial_id));
  return trials;
}

// ---------------------------------------------------------------------------
// Public entry point. Exported so the test file can call it without spawning
// a child process.
// ---------------------------------------------------------------------------

export async function buildCrossTestMatrix({ resultsDir, taskRoot }) {
  const absResultsDir = resolve(resultsDir);
  const absTaskRoot = resolve(taskRoot);
  const trials = discoverTrials(absResultsDir);
  if (trials.length === 0) {
    throw new Error(
      `no trials found under ${absResultsDir} (expected child dirs with meta.json + source/)`,
    );
  }
  // All trials in a run target the same task. If they don't, refuse — the
  // matrix wouldn't have a coherent hidden-suite column.
  const taskIds = new Set(trials.map((t) => t.meta.task_id));
  if (taskIds.size !== 1) {
    throw new Error(
      `cross-test matrix expects a single task per run; found: ${[...taskIds].join(', ')}`,
    );
  }
  const taskId = trials[0].meta.task_id;
  const runId = trials[0].meta.run_id;

  // Prepare each trial's transformed test bodies once, up-front (one per
  // test file). If a trial has no tests dir (or no test files in it),
  // record an empty list and the matrix cell will report `no tests`.
  const sourcesByTrial = new Map();
  for (const trial of trials) {
    if (!trial.tests_dir) {
      sourcesByTrial.set(trial.trial_id, []);
      continue;
    }
    const sources = readTrialTestSources(trial.tests_dir);
    const transformedSources = sources.map((s) => {
      if (!s.body) {
        return { path: s.path, transformed: null, transform_error: s.error };
      }
      try {
        return {
          path: s.path,
          transformed: transformTestSource(s.body),
          transform_error: null,
        };
      } catch (err) {
        return {
          path: s.path,
          transformed: null,
          transform_error: `transform failed: ${err.message}`,
        };
      }
    });
    sourcesByTrial.set(trial.trial_id, transformedSources);
  }

  // Run the matrix. Cell (impl, test_source) = run EACH test file from
  // test_source's `tests/` against impl's source/index.js, then sum the
  // counts across files. Per-file load errors are aggregated into the cell's
  // load_error field — a cell is marked LOAD ERR only when EVERY file failed
  // to load (otherwise the cell still has at least partial pass/total info).
  const matrix = {};
  for (const implTrial of trials) {
    const implSourcePath = join(implTrial.source_dir, 'index.js');
    if (!existsSync(implSourcePath)) {
      matrix[implTrial.trial_id] = {
        _error: `impl missing source/index.js`,
      };
      continue;
    }
    const row = {};
    for (const testTrial of trials) {
      const sources = sourcesByTrial.get(testTrial.trial_id) || [];
      if (sources.length === 0) {
        row[testTrial.trial_id] = { pass: 0, total: 0, load_error: 'no tests' };
        continue;
      }
      let pass = 0;
      let total = 0;
      const errors = [];
      let anySucceeded = false;
      for (const src of sources) {
        if (!src.transformed) {
          errors.push(`${basename(src.path)}: ${src.transform_error}`);
          continue;
        }
        const r = runTransformedTest({
          testBody: src.transformed,
          implSourcePath,
        });
        if (r.load_error) {
          errors.push(`${basename(src.path)}: ${r.load_error.split('\n')[0]}`);
        } else {
          anySucceeded = true;
        }
        pass += r.pass;
        total += r.total;
      }
      row[testTrial.trial_id] = {
        pass,
        total,
        load_error: !anySucceeded && errors.length > 0 ? errors.join(' | ').slice(0, 800) : null,
      };
    }
    // Hidden suite column. Trial source_dir is already absolute (set by
    // discoverTrials from the absolute resultsDir join).
    const taskDir = join(absTaskRoot, taskId);
    row.hidden_suite = runHiddenSuite({
      taskDir,
      implSourceDir: implTrial.source_dir,
    });
    matrix[implTrial.trial_id] = row;
  }

  // Build the test-files-per-trial summary for the report. Strip everything
  // up to and including the trial's tests/ prefix so paths are readable.
  const fileListByTrial = new Map();
  for (const trial of trials) {
    const sources = sourcesByTrial.get(trial.trial_id) || [];
    fileListByTrial.set(
      trial.trial_id,
      sources.map((s) => relativeUnderTests(s.path)),
    );
  }

  return {
    run_id: runId,
    task_id: taskId,
    trials: trials.map((t) => t.trial_id),
    test_files_by_trial: Object.fromEntries(fileListByTrial),
    matrix,
  };
}

function relativeUnderTests(p) {
  const idx = p.indexOf('/tests/');
  if (idx >= 0) return p.slice(idx + 1);
  return basename(p);
}

// ---------------------------------------------------------------------------
// Markdown rendering.
// ---------------------------------------------------------------------------

export function renderMatrixMarkdown(result) {
  const { run_id, task_id, trials, matrix, test_files_by_trial } = result;
  const lines = [];
  lines.push(`# Cross-test matrix — ${run_id}`);
  lines.push('');
  lines.push(`**task:** \`${task_id}\``);
  lines.push('');
  lines.push(
    'Rows are implementations. Columns are the test sources used to score them.',
  );
  lines.push(
    'Cell format: `pass/total` — `OK` decoration when all tests pass, `LOAD ERR` when the test source failed to load.',
  );
  lines.push('');

  // Header row.
  const cols = [...trials, 'hidden_suite'];
  const head = ['impl \\\\ tests', ...cols].join(' | ');
  const sep = ['---', ...cols.map(() => '---')].join(' | ');
  lines.push('| ' + head + ' |');
  lines.push('| ' + sep + ' |');

  for (const impl of trials) {
    const row = matrix[impl] || {};
    const cells = [impl];
    for (const col of cols) {
      const cell = row[col];
      if (!cell) {
        cells.push('—');
      } else if (cell.load_error) {
        cells.push(`LOAD ERR`);
      } else if (cell.total === 0) {
        cells.push('0/0');
      } else if (cell.pass === cell.total) {
        cells.push(`${cell.pass}/${cell.total} OK`);
      } else {
        cells.push(`${cell.pass}/${cell.total}`);
      }
    }
    lines.push('| ' + cells.join(' | ') + ' |');
  }

  // Test source attribution.
  lines.push('');
  lines.push('## Test sources per trial');
  lines.push('');
  for (const trial of trials) {
    const files = (test_files_by_trial && test_files_by_trial[trial]) || [];
    if (files.length === 0) {
      lines.push(`- **${trial}**: (no test files found)`);
    } else {
      lines.push(`- **${trial}**: ${files.map((f) => '`' + f + '`').join(', ')}`);
    }
  }

  // Findings.
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  const findings = computeFindings(result);
  if (findings.length === 0) {
    lines.push('- (no asymmetric correctness or hidden-suite disagreements detected)');
  } else {
    for (const f of findings) lines.push(`- ${f}`);
  }
  lines.push('');
  return lines.join('\n');
}

// Surface two kinds of finding:
//   1. Asymmetric correctness: impl X passes its OWN tests but fails another
//      condition's tests. This is the core "TDD impl fails DTDD's tests" signal.
//   2. Hidden-suite blind spot: impl X passes the hidden suite (full marks) but
//      fails another trial's tests. This is the masked-by-permissive-suite signal.
function computeFindings(result) {
  const { trials, matrix } = result;
  const findings = [];
  for (const impl of trials) {
    const row = matrix[impl] || {};
    const ownCell = row[impl];
    const ownPasses =
      ownCell && !ownCell.load_error && ownCell.total > 0 && ownCell.pass === ownCell.total;
    for (const otherTrial of trials) {
      if (otherTrial === impl) continue;
      const cell = row[otherTrial];
      if (!cell || cell.load_error || cell.total === 0) continue;
      if (cell.pass < cell.total && ownPasses) {
        findings.push(
          `**${impl}** passes its own tests but fails ${cell.total - cell.pass}/${cell.total} of \`${otherTrial}\`'s tests (asymmetric correctness)`,
        );
      }
    }
    const hidden = row.hidden_suite;
    const hiddenPerfect =
      hidden && !hidden.load_error && hidden.total > 0 && hidden.pass === hidden.total;
    if (hiddenPerfect) {
      for (const otherTrial of trials) {
        if (otherTrial === impl) continue;
        const cell = row[otherTrial];
        if (!cell || cell.load_error || cell.total === 0) continue;
        if (cell.pass < cell.total) {
          findings.push(
            `**${impl}** is full-marks on hidden suite but fails ${cell.total - cell.pass}/${cell.total} of \`${otherTrial}\`'s tests (hidden suite blind spot)`,
          );
        }
      }
    }
  }
  // De-dup while preserving order.
  return [...new Set(findings)];
}

// ---------------------------------------------------------------------------
// CLI entry.
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.error(
      'usage: cross-test-matrix.mjs <results_dir> [--task-root <dir>]',
    );
    console.error(
      '       --task-root defaults to bench/tasks/ relative to the script',
    );
    process.exit(2);
  }
  const resultsDir = resolve(argv[0]);
  let taskRootArg = null;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--task-root') {
      taskRootArg = argv[++i];
    }
  }
  const HERE = dirname(fileURLToPath(import.meta.url));
  const defaultTaskRoot = resolve(HERE, '..', 'tasks');
  const taskRoot = taskRootArg ? resolve(taskRootArg) : defaultTaskRoot;

  const result = await buildCrossTestMatrix({ resultsDir, taskRoot });
  const jsonPath = join(resultsDir, 'cross-test-matrix.json');
  const mdPath = join(resultsDir, 'cross-test-matrix.md');
  writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n');
  writeFileSync(mdPath, renderMatrixMarkdown(result));
  console.log(`wrote ${jsonPath}`);
  console.log(`wrote ${mdPath}`);
}

// Run main only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith('cross-test-matrix.mjs')) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
