// Scorer for the DTDD prompting-style bench harness.
//
// Implements behaviors B4-B6 of doc/specs/2026-05-10-dtdd-bench.spec.md:
//
//   - scoreHidden:   pass-rate against held-out tests, with sandbox + static
//                    leak check on the produced source.
//   - scoreSelf:     pass-rate of the agent's own tests against the agent's
//                    own source, plus parsimony signal (lines-of-test).
//   - scoreCoverage: per-label boolean coverage map produced by blind-authored
//                    semantic predicates published under each task.
//
// The scorer runs from the bench/ working directory (npm test --prefix bench
// chdirs into bench/), but the spec's test contracts spell every fixture path
// rooted at the repo (e.g. 'bench/test/fixtures/source-clean/'). resolvePath()
// reconciles those two views by walking up from cwd until the path argument
// exists, so callers can hand us either form without knowing which.

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// --- error types ------------------------------------------------------------

export class HiddenTestLeakError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HiddenTestLeakError';
  }
}

export class MissingPredicatesError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MissingPredicatesError';
  }
}

// --- path resolution --------------------------------------------------------

// Resolve a path that the caller spelled relative to the repo root (e.g.
// 'bench/test/fixtures/...') even when our cwd is bench/. Walks up at most
// a few levels looking for the first ancestor where the joined path exists.
function resolvePath(p) {
  if (isAbsolute(p)) return p;
  const cwd = process.cwd();
  // Try cwd, then each parent up to 4 levels.
  let here = cwd;
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(here, p);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  // Fallback to cwd-relative — caller will get a clear ENOENT downstream.
  return resolve(cwd, p);
}

// --- shared filesystem helpers ---------------------------------------------

function* walkFiles(dir, predicate = () => true) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walkFiles(p, predicate);
    } else if (predicate(name, p)) {
      yield p;
    }
  }
}

const SOURCE_FILE_RE = /\.(m?js|cjs|ts|tsx|jsx)$/;
const TEST_FILE_RE = /\.test\.(m?js|cjs|ts)$/;

// --- B4: scoreHidden --------------------------------------------------------

// Static-check a source tree for any literal reference to the active hidden-
// tests directory. Throws HiddenTestLeakError on the first hit.
//
// Phase 2 (v2) note: the check is **path-scoped**, not substring-scoped. It
// matches one of two exact path strings naming the active hidden-tests
// directory for this call:
//
//   - `bench/tasks/<task_id>/<subdir>/` (the bench-relative spelling — what
//     a producing agent would write)
//   - the absolute resolved path with a trailing slash (defense-in-depth for
//     pathologically resolved leaks)
//
// Bare references to the substring `hidden_tests` without surrounding path
// context (e.g. a docstring that mentions "the hidden_tests directory") do
// NOT trip the check. This is load-bearing for v2: when the alternate suite
// is `hidden_tests_after_edit/`, a path-rooted reference to the default
// `hidden_tests/` would still be a leak (and vice-versa), but unscoped
// substring mentions of either name are fine.
function staticLeakCheck(sourceDir, taskId, hiddenSubdir, resolvedHiddenDir) {
  const benchRelativePath = `bench/tasks/${taskId}/${hiddenSubdir}/`;
  const absolutePath = resolvedHiddenDir.endsWith('/')
    ? resolvedHiddenDir
    : resolvedHiddenDir + '/';
  for (const file of walkFiles(sourceDir, (name) => SOURCE_FILE_RE.test(name))) {
    let body;
    try {
      body = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (body.includes(benchRelativePath) || body.includes(absolutePath)) {
      throw new HiddenTestLeakError(
        `static leak: ${file} references the active hidden-tests path ${benchRelativePath}`,
      );
    }
  }
}

// Run `node --test` over the hidden-test files with a sandboxed cwd that
// denies the producing source any chance to chdir back into the hidden-tests
// directory at runtime. We don't reach for a full filesystem sandbox here —
// that's out of scope per the implementer brief — but we do (a) refuse to
// run if the source statically referenced the path, and (b) execute under a
// scratch cwd so the source can't relative-resolve into hidden_tests/.
//
// `hidden_tests_subdir` (v2 / Phase 2 spec B1): names the subdirectory under
// `bench/tasks/<task_id>/` that holds the active suite. Defaults to
// `'hidden_tests'` to preserve v1 behavior — the original held-out suite is
// scored exactly as before when the caller omits the parameter. The Phase 2
// study passes `'hidden_tests_after_edit'` to score against the extended
// suite that includes assertions for the post-edit behavior.
export async function scoreHidden({ task_id, source_dir, hidden_tests_subdir }) {
  const subdir = hidden_tests_subdir ?? 'hidden_tests';
  const resolvedSource = resolvePath(source_dir);

  const taskDir = resolvePath(`bench/tasks/${task_id}`);
  const hiddenDir = join(taskDir, subdir);

  staticLeakCheck(resolvedSource, task_id, subdir, hiddenDir);

  if (!existsSync(hiddenDir)) {
    // No hidden suite configured yet — return an empty result rather than
    // exploding. This keeps the bench bootable while tasks are still being
    // authored; the validator surfaces missing-suite warnings separately.
    return { pass_count: 0, total_count: 0, per_test: {}, runtime_errors: [] };
  }

  const testFiles = [...walkFiles(hiddenDir, (name) => TEST_FILE_RE.test(name))];
  if (testFiles.length === 0) {
    return { pass_count: 0, total_count: 0, per_test: {}, runtime_errors: [] };
  }

  // Run each test file individually so we can attribute failures to a file
  // even when node:test doesn't enumerate them in the TAP stream the way we
  // want. The runtime sandbox is an os tempdir as cwd — denies relative
  // resolution back into hidden_tests/ from the source under test.
  const sandbox = mkdtempSync(join(tmpdir(), 'wovenflow-bench-hidden-'));
  const perTest = {};
  const runtimeErrors = [];
  let passCount = 0;
  let totalCount = 0;

  try {
    for (const testFile of testFiles) {
      // When scoreHidden is itself called from within a `node --test` parent,
      // the parent sets NODE_TEST_CONTEXT in the child's env via {...process.env},
      // which triggers Node's recursive-test-runner detection — the child sees
      // an active test context, refuses to enumerate test files, and emits the
      // "node:test run() is being called recursively" warning while writing
      // zero TAP. We strip that var so the child runs a fresh, top-level test
      // session and produces normal TAP output regardless of how the parent
      // process is invoked.
      const childEnv = {
        ...process.env,
        // Pass the resolved source root so hidden tests can import it
        // without needing to know the producing-source layout.
        BENCH_SOURCE_DIR: resolvedSource,
      };
      delete childEnv.NODE_TEST_CONTEXT;
      const result = spawnSync(
        process.execPath,
        ['--test', '--test-reporter=tap', testFile],
        {
          cwd: sandbox,
          env: childEnv,
          encoding: 'utf8',
        },
      );
      const tap = (result.stdout || '') + (result.stderr || '');
      const summary = parseTapSummary(tap);
      const fileKey = relPath(hiddenDir, testFile);
      for (const [name, ok] of Object.entries(summary.perTest)) {
        const key = `${fileKey}::${name}`;
        perTest[key] = ok;
        totalCount += 1;
        if (ok) passCount += 1;
      }
      if (result.status !== 0 && summary.total === 0) {
        runtimeErrors.push({ file: fileKey, message: tap.trim().slice(0, 500) });
      }
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  return {
    pass_count: passCount,
    total_count: totalCount,
    per_test: perTest,
    runtime_errors: runtimeErrors,
  };
}

function relPath(root, p) {
  if (p.startsWith(root + '/')) return p.slice(root.length + 1);
  return p;
}

// Parse node:test TAP output for top-level `ok N - <name>` / `not ok` lines.
// Indented lines (subtest detail) are ignored — we only count the rolled-up
// per-test verdicts.
function parseTapSummary(tap) {
  const perTest = {};
  let total = 0;
  for (const rawLine of tap.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    // Top-level only: must start at column zero.
    const m = line.match(/^(ok|not ok)\s+\d+\s+-\s+(.*)$/);
    if (!m) continue;
    const ok = m[1] === 'ok';
    let name = m[2];
    // Strip ' # SKIP' / ' # TODO' directives from the test name.
    name = name.replace(/\s+#\s+(SKIP|TODO).*$/i, '');
    perTest[name] = ok;
    total += 1;
  }
  return { perTest, total };
}

// --- B5: scoreSelf ----------------------------------------------------------

// Count non-blank, non-comment lines across all test files in a directory.
// "Comment" is approximated as a line whose first non-whitespace character is
// `//` or that lies inside a `/* ... */` block. JSDoc-only / banner-comment
// files therefore score zero, which is the right parsimony signal — banner
// noise shouldn't pad a test's apparent rigor.
function countTestLines(testsDir) {
  let total = 0;
  for (const file of walkFiles(testsDir, (name) => TEST_FILE_RE.test(name))) {
    let body;
    try {
      body = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    let inBlock = false;
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (inBlock) {
        if (trimmed.includes('*/')) inBlock = false;
        continue;
      }
      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) inBlock = true;
        continue;
      }
      if (trimmed.startsWith('//')) continue;
      total += 1;
    }
  }
  return total;
}

// Count `test(`-style declarations across all test files. Approximate — we
// look for `test(`, `it(`, and tagged variants like `test.skip(` /
// `test.only(`. Used for the parsimony report; not load-bearing for any
// other metric.
function countTestDecls(testsDir) {
  let total = 0;
  for (const file of walkFiles(testsDir, (name) => TEST_FILE_RE.test(name))) {
    let body;
    try {
      body = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const matches = body.match(/\b(test|it)\b(?:\.[a-zA-Z]+)?\s*\(/g);
    total += matches ? matches.length : 0;
  }
  return total;
}

export async function scoreSelf({ source_dir, tests_dir }) {
  const resolvedTests = resolvePath(tests_dir);
  const resolvedSource = resolvePath(source_dir);

  const testFiles = [...walkFiles(resolvedTests, (name) => TEST_FILE_RE.test(name))];
  const linesOfTest = countTestLines(resolvedTests);
  const testCount = countTestDecls(resolvedTests);

  if (testFiles.length === 0) {
    return {
      pass_count: 0,
      total_count: 0,
      test_count: 0,
      lines_of_test: linesOfTest,
      all_pass: true,
    };
  }

  let passCount = 0;
  let totalCount = 0;

  for (const testFile of testFiles) {
    // Same NODE_TEST_CONTEXT scrub as in scoreHidden — see the comment there
    // for the recursive-test-runner trap this avoids.
    const childEnv = { ...process.env, BENCH_SOURCE_DIR: resolvedSource };
    delete childEnv.NODE_TEST_CONTEXT;
    const result = spawnSync(
      process.execPath,
      ['--test', '--test-reporter=tap', testFile],
      {
        // Run the test from its own directory so the agent's relative
        // imports (e.g. `../source-clean/index.js`) resolve as authored.
        cwd: dirname(testFile),
        env: childEnv,
        encoding: 'utf8',
      },
    );
    const tap = (result.stdout || '') + (result.stderr || '');
    const summary = parseTapSummary(tap);
    for (const ok of Object.values(summary.perTest)) {
      totalCount += 1;
      if (ok) passCount += 1;
    }
  }

  return {
    pass_count: passCount,
    total_count: totalCount,
    test_count: testCount,
    lines_of_test: linesOfTest,
    all_pass: totalCount > 0 ? passCount === totalCount : true,
  };
}

// --- B6: scoreCoverage ------------------------------------------------------

// Read the labels this task's hidden suite uses. The spec calls for labeled
// hidden tests; we encode the per-task label set as a small JSON manifest
// under hidden_tests/labels.json, with one entry per category. This keeps
// the predicate lookup deterministic and lets the bench validator enumerate
// labels without having to parse hidden test files by reflection (which
// would force the hidden suite to follow a fragile naming convention).
function readLabels(taskDir) {
  const manifest = join(taskDir, 'hidden_tests', 'labels.json');
  if (!existsSync(manifest)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.labels)) return parsed.labels;
  return null;
}

export async function scoreCoverage({ task_id, tests_dir }) {
  const taskDir = resolvePath(`bench/tasks/${task_id}`);
  const predicatesDir = join(taskDir, 'coverage_predicates');
  // Spec's contract: predicates_path is the bench-relative form, not the
  // absolute resolved path. Reconstruct it so the value matches the test.
  const predicatesPath = `bench/tasks/${task_id}/coverage_predicates/`;

  if (!existsSync(taskDir)) {
    throw new MissingPredicatesError(
      `task ${task_id} has no coverage predicates: task directory not found`,
    );
  }

  const labels = readLabels(taskDir);
  if (!labels || labels.length === 0) {
    throw new MissingPredicatesError(
      `task ${task_id} declares no labels in hidden_tests/labels.json`,
    );
  }

  // Verify a predicate file exists for every label first; if any are
  // missing, throw before doing partial work — the spec is explicit that
  // the bench refuses to start when coverage is incomplete.
  const missing = [];
  for (const label of labels) {
    const file = join(predicatesDir, `${label}.js`);
    if (!existsSync(file)) missing.push(label);
  }
  if (missing.length > 0) {
    throw new MissingPredicatesError(
      `task ${task_id} is missing predicates for labels: ${missing.join(', ')}`,
    );
  }

  const resolvedTests = resolvePath(tests_dir);
  const perLabel = {};
  for (const label of labels) {
    const file = join(predicatesDir, `${label}.js`);
    let mod;
    try {
      mod = await import(pathToFileURL(file).href);
    } catch (err) {
      throw new MissingPredicatesError(
        `predicate ${label} failed to load: ${err.message}`,
      );
    }
    const fn = mod.default;
    if (typeof fn !== 'function') {
      throw new MissingPredicatesError(
        `predicate ${label} does not default-export a function`,
      );
    }
    let result;
    try {
      result = fn(resolvedTests);
    } catch {
      result = false;
    }
    perLabel[label] = Boolean(result);
  }

  return { per_label: perLabel, predicates_path: predicatesPath };
}
