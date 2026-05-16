// Tests for bench/scripts/cross-test-matrix.mjs
//
// Three behaviors under test:
//
//   1. End-to-end on a fixture: a 2-trial fixture with a permissive impl + a
//      strict impl + a permissive hidden suite produces the expected matrix
//      (each impl passes its own tests, fails the other's negative-handling
//      assertion, and the hidden suite says OK to both).
//
//   2. transformTestSource: the vitest→node:test transform plus the expect
//      shim correctly run a minimal vitest-style test under `node --test`.
//
//   3. Load errors are captured cleanly (not thrown) when a test source has a
//      syntax error or imports a missing module.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCrossTestMatrix,
  renderMatrixMarkdown,
  transformTestSource,
} from '../scripts/cross-test-matrix.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, 'fixtures', 'cross-test-matrix-fixture');

test('cross-test-matrix: end-to-end against synthetic 2-trial fixture', async () => {
  const result = await buildCrossTestMatrix({
    resultsDir: FIXTURE_DIR,
    taskRoot: join(FIXTURE_DIR, 'tasks'),
  });

  assert.equal(result.task_id, 'widget');
  assert.deepEqual(result.trials.sort(), ['trial-a', 'trial-b']);

  // Each impl passes its own tests in full.
  const aRow = result.matrix['trial-a'];
  const bRow = result.matrix['trial-b'];
  assert.ok(aRow, 'trial-a row present');
  assert.ok(bRow, 'trial-b row present');

  // trial-a (strict) passes all of trial-a's tests.
  assert.equal(aRow['trial-a'].load_error, null);
  assert.equal(aRow['trial-a'].pass, aRow['trial-a'].total);
  assert.ok(aRow['trial-a'].total >= 3);

  // trial-b (permissive) passes all of trial-b's tests (vitest-style).
  // This is also the load-bearing assertion that the transform works.
  assert.equal(bRow['trial-b'].load_error, null, `trial-b own tests load error: ${bRow['trial-b'].load_error}`);
  assert.equal(
    bRow['trial-b'].pass,
    bRow['trial-b'].total,
    `trial-b should pass its own tests: ${bRow['trial-b'].pass}/${bRow['trial-b'].total}`,
  );
  assert.ok(bRow['trial-b'].total >= 3);

  // trial-b (permissive) FAILS at least one of trial-a's tests (the
  // "rejects negatives" test) — the permissive impl returns -2 instead of
  // throwing.
  assert.equal(bRow['trial-a'].load_error, null);
  assert.ok(
    bRow['trial-a'].pass < bRow['trial-a'].total,
    `expected trial-b impl to fail some of trial-a's tests, got ${bRow['trial-a'].pass}/${bRow['trial-a'].total}`,
  );

  // trial-a (strict) FAILS at least one of trial-b's tests (the
  // "doubles negatives too" test) — the strict impl throws instead.
  assert.equal(aRow['trial-b'].load_error, null);
  assert.ok(
    aRow['trial-b'].pass < aRow['trial-b'].total,
    `expected trial-a impl to fail some of trial-b's tests, got ${aRow['trial-b'].pass}/${aRow['trial-b'].total}`,
  );

  // Hidden suite is permissive — both impls pass it in full.
  assert.equal(aRow.hidden_suite.load_error, null);
  assert.equal(aRow.hidden_suite.pass, aRow.hidden_suite.total);
  assert.ok(aRow.hidden_suite.total >= 1);
  assert.equal(bRow.hidden_suite.load_error, null);
  assert.equal(bRow.hidden_suite.pass, bRow.hidden_suite.total);

  // Markdown render contains the expected header and a Findings section that
  // surfaces the asymmetric / hidden-suite-blind-spot signals.
  const md = renderMatrixMarkdown(result);
  assert.match(md, /Cross-test matrix/);
  assert.match(md, /trial-a/);
  assert.match(md, /trial-b/);
  assert.match(md, /hidden_suite/);
  assert.match(md, /Findings/);
  assert.match(
    md,
    /hidden suite blind spot|asymmetric correctness/,
    'expected at least one finding to be surfaced',
  );
});

test('cross-test-matrix: transformTestSource rewrites vitest imports + injects expect shim', () => {
  const src = `
import { describe, it } from 'vitest';
import { thing } from './index.js';

describe('thing', () => {
  it('does the thing', () => {
    expect(thing(2)).toEqual(4);
    expect(thing(0)).toBe(0);
    expect(() => thing()).toThrow();
  });
});
`;
  const transformed = transformTestSource(src);

  // The vitest import is gone.
  assert.doesNotMatch(transformed, /from\s*['"]vitest['"]/);
  // node:test import is injected.
  assert.match(transformed, /from\s*['"]node:test['"]/);
  // assert shim is wired in.
  assert.match(transformed, /node:assert\/strict/);
  // expect shim is defined.
  assert.match(transformed, /globalThis\.expect/);
  // The relative impl import was canonicalized to __impl__.mjs.
  assert.match(transformed, /from\s*['"]\.\/__impl__\.mjs['"]/);

  // Now run the transformed source for real to prove the shim works.
  const sandbox = mkdtempSync(join(tmpdir(), 'ctm-shim-'));
  try {
    writeFileSync(
      join(sandbox, '__impl__.mjs'),
      `export function thing(n) { if (n === undefined) throw new Error('missing'); return n * 2; }\n`,
    );
    writeFileSync(join(sandbox, 'cross-test.test.mjs'), transformed);
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    const r = spawnSync(
      process.execPath,
      ['--test', '--test-reporter=tap', 'cross-test.test.mjs'],
      { cwd: sandbox, env: childEnv, encoding: 'utf8' },
    );
    const tap = (r.stdout || '') + (r.stderr || '');
    // At least one passing top-level test line.
    assert.match(tap, /^ok\s+\d+\s+-/m, `expected ok line; got:\n${tap}`);
    assert.doesNotMatch(tap, /^not ok/m, `expected no failures; got:\n${tap}`);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('cross-test-matrix: load errors are reported as load_error cells, not thrown', async () => {
  // Build a synthetic results dir on the fly: one trial with a syntactically
  // broken test file. The matrix must complete and report load_error for the
  // broken column, without crashing the whole script.
  const root = mkdtempSync(join(tmpdir(), 'ctm-loaderr-'));
  try {
    const trialDir = join(root, 'broken-trial');
    mkdirSync(join(trialDir, 'source'), { recursive: true });
    mkdirSync(join(trialDir, 'tests'), { recursive: true });
    writeFileSync(
      join(trialDir, 'meta.json'),
      JSON.stringify({
        run_id: 'loaderr-fixture',
        trial_id: 'broken-trial',
        task_id: 'widget',
        style: 'baseline',
      }),
    );
    writeFileSync(
      join(trialDir, 'source', 'index.js'),
      `export function widget(n) { return n * 2; }\n`,
    );
    // Broken: imports a module that doesn't exist + has a stray brace.
    writeFileSync(
      join(trialDir, 'tests', 'broken.test.js'),
      `import { test } from 'node:test';\nimport { nope } from 'this-package-does-not-exist-xyz';\ntest('x', () => {)\n`,
    );

    // Reuse the fixture's hidden suite so the hidden_suite column is well-defined.
    const taskRoot = join(FIXTURE_DIR, 'tasks');
    const result = await buildCrossTestMatrix({
      resultsDir: root,
      taskRoot,
    });
    const row = result.matrix['broken-trial'];
    assert.ok(row, 'broken-trial row exists');
    const ownCell = row['broken-trial'];
    assert.ok(
      ownCell.load_error,
      `expected load_error to be populated, got: ${JSON.stringify(ownCell)}`,
    );
    assert.equal(ownCell.pass, 0);
    assert.equal(ownCell.total, 0);
    // Hidden suite should still run cleanly (impl is fine).
    assert.equal(row.hidden_suite.load_error, null);
    assert.ok(row.hidden_suite.total > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
