// Tests for bench/run-tests-tool.js — the agent's mid-trial test-execution
// feedback loop.
//
// The motivating scenario: a DTDD trial shipped tests asserting
// `/Invalid semver string/` against an impl that threw `Invalid semantic
// version: ...`. The mismatch would have been caught instantly if the agent
// had been able to run its tests. These tests verify run_tests catches
// exactly that failure mode plus the surrounding contract:
//
//   1. Happy path — passing tests return pass info
//   2. Failing path — the DTDD scenario above; FAIL output names the test +
//      assertion message
//   3. No tests written yet — graceful "no tests found"
//   4. Vitest-style imports — shim makes `expect` work under node:test
//   5. Path traversal — `../../bench/tasks/...` rejected without execution
//   6. Timeout — runaway test bounded; result indicates truncation/timeout

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runTestsTool } from '../run-tests-tool.js';

test('run_tests: happy path — passing tests return pass info', () => {
  const sourceFiles = {
    'index.js': `export function add(a, b) { return a + b; }\n`,
  };
  const testFiles = {
    'index.test.js': `
import { add } from './index.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('adds two numbers', () => {
  assert.strictEqual(add(2, 3), 5);
});

test('adds zero', () => {
  assert.strictEqual(add(0, 0), 0);
});
`,
  };
  const result = runTestsTool({ sourceFiles, testFiles });
  assert.match(result, /\[run_tests\] 2\/2 passed/, `unexpected result:\n${result}`);
  // Happy path should not surface any FAIL lines.
  assert.ok(!/^FAIL:/m.test(result), `unexpected FAIL line:\n${result}`);
});

test('run_tests: DTDD scenario — failing test/impl mismatch surfaces 4 failures', () => {
  // Reproduce the exact qwen36-semver-3conditions-64k-2 failure mode: impl
  // throws "Invalid semantic version: <input>" but tests assert the message
  // matches /Invalid semver string/. Six positives pass, four negatives fail.
  const sourceFiles = {
    'index.js': `
export function parse(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Expected a string');
  }
  const re = /^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$/;
  const match = input.match(re);
  if (!match) {
    throw new Error(\`Invalid semantic version: \${input}\`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
    build: match[5] ?? null,
  };
}
`,
  };
  const testFiles = {
    'index.test.js': `
import { parse } from './index.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('parse', () => {
  it('parses major.minor.patch', () => {
    const result = parse('1.2.3');
    assert.deepStrictEqual(result, { major: 1, minor: 2, patch: 3, prerelease: null, build: null });
  });
  it('parses with prerelease', () => {
    const result = parse('1.0.0-alpha');
    assert.deepStrictEqual(result, { major: 1, minor: 0, patch: 0, prerelease: 'alpha', build: null });
  });
  it('parses zero version', () => {
    const result = parse('0.0.0');
    assert.deepStrictEqual(result, { major: 0, minor: 0, patch: 0, prerelease: null, build: null });
  });
  it('throws for invalid input with letters in version numbers', () => {
    assert.throws(() => parse('1.2.x'), { message: /Invalid semver string/ });
  });
  it('throws for missing version parts', () => {
    assert.throws(() => parse('1.2'), { message: /Invalid semver string/ });
  });
  it('throws for empty string', () => {
    assert.throws(() => parse(''), { message: /Invalid semver string/ });
  });
  it('throws for leading zeros', () => {
    assert.throws(() => parse('01.2.3'), { message: /Invalid semver string/ });
  });
});
`,
  };
  const result = runTestsTool({ sourceFiles, testFiles });
  // Three positives pass; four negatives fail.
  assert.match(
    result,
    /\[run_tests\] 3\/7 passed \| 4 failed/,
    `unexpected summary:\n${result}`,
  );
  // Failing test names appear comma-separated on the summary line (compact
  // format — no per-failure diagnostic body, just names so the agent knows
  // which tests to investigate without context-bloating the conversation).
  assert.match(result, /parse > throws for invalid input/, `missing fail:\n${result}`);
  assert.match(result, /parse > throws for missing version parts/, `missing fail:\n${result}`);
  assert.match(result, /parse > throws for empty string/, `missing fail:\n${result}`);
  assert.match(result, /parse > throws for leading zeros/, `missing fail:\n${result}`);
});

test('run_tests: no tests written yet — graceful no-tests message', () => {
  const result = runTestsTool({
    sourceFiles: { 'index.js': `export const x = 1;\n` },
    testFiles: {},
  });
  assert.match(result, /no test files found/, `unexpected message:\n${result}`);
});

test('run_tests: vitest-style imports — shim makes expect work', () => {
  const sourceFiles = {
    'index.js': `export function double(n) { return n * 2; }\n`,
  };
  const testFiles = {
    'index.test.js': `
import { describe, it, expect } from 'vitest';
import { double } from './index.js';

describe('double', () => {
  it('doubles a positive number', () => {
    expect(double(3)).toEqual(6);
  });
  it('doubles zero', () => {
    expect(double(0)).toBe(0);
  });
  it('handles negatives', () => {
    expect(double(-2)).toEqual(-4);
  });
});
`,
  };
  const result = runTestsTool({ sourceFiles, testFiles });
  assert.match(result, /\[run_tests\] 3\/3 passed/, `vitest shim failed:\n${result}`);
});

test('run_tests: path-traversal attempt is rejected without execution', () => {
  const sourceFiles = { 'index.js': `export const x = 1;\n` };
  const testFiles = {
    'index.test.js': `
import { test } from 'node:test';
test('ok', () => {});
`,
  };
  // Try to point at the hidden suite via parent traversal.
  const result = runTestsTool({
    sourceFiles,
    testFiles,
    test_path: '../../bench/tasks/slugify/hidden_tests/anything.js',
  });
  assert.match(result, /\[run_tests\] error:/, `expected error prefix:\n${result}`);
  assert.match(
    result,
    /contains "\.\."|path traversal/i,
    `expected traversal rejection reason:\n${result}`,
  );
  // Also try an absolute path.
  const result2 = runTestsTool({
    sourceFiles,
    testFiles,
    test_path: '/etc/passwd',
  });
  assert.match(result2, /\[run_tests\] error:/, `expected error prefix:\n${result2}`);
  assert.match(result2, /must be relative|absolute/i, `expected absolute rejection:\n${result2}`);
  // And a path the agent didn't write — must not silently fall through to
  // some other testFiles entry.
  const result3 = runTestsTool({
    sourceFiles,
    testFiles,
    test_path: 'never-written.test.js',
  });
  assert.match(result3, /not written via write_test/, `expected not-written rejection:\n${result3}`);
});

test('run_tests: timeout caps a runaway test', () => {
  const sourceFiles = {};
  const testFiles = {
    // Infinite loop inside a test body. node:test will hang until our
    // per-call timeout fires.
    'hang.test.js': `
import { test } from 'node:test';

test('hangs forever', () => {
  while (true) {
    // burn CPU
  }
});
`,
  };
  const start = Date.now();
  const result = runTestsTool({
    sourceFiles,
    testFiles,
    timeout_ms: 2000,
  });
  const elapsed = Date.now() - start;
  // Bounded by the timeout (with some slack for spawn overhead).
  assert.ok(
    elapsed < 8000,
    `expected timeout to bound execution; elapsed ${elapsed}ms — result:\n${result}`,
  );
  assert.match(result, /TIMEOUT/i, `expected timeout indication:\n${result}`);
});

test('run_tests: explicit test_path runs only that file', () => {
  const sourceFiles = {
    'index.js': `export const a = 1; export const b = 2;\n`,
  };
  const testFiles = {
    'a.test.js': `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { a } from './index.js';
test('a is 1', () => { assert.strictEqual(a, 1); });
`,
    'b.test.js': `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b } from './index.js';
test('b is 2', () => { assert.strictEqual(b, 2); });
test('b is also 2', () => { assert.strictEqual(b, 2); });
`,
  };
  // Selecting only b.test.js gives 2 tests, not 3.
  const result = runTestsTool({
    sourceFiles,
    testFiles,
    test_path: 'b.test.js',
  });
  assert.match(result, /\[run_tests\] 2\/2 passed/, `expected b-only run:\n${result}`);
});

test('run_tests: result is capped at ~2000 characters', () => {
  // Generate many failing tests to overflow the cap.
  const sourceFiles = { 'index.js': `export const x = 0;\n` };
  let body = `
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { x } from './index.js';
`;
  for (let i = 0; i < 200; i += 1) {
    body += `\ntest('failure number ${i} with a deliberately long descriptive name to inflate the output', () => { assert.strictEqual(x, ${i + 1}); });`;
  }
  const result = runTestsTool({
    sourceFiles,
    testFiles: { 'index.test.js': body },
  });
  assert.ok(
    result.length <= 2010,
    `result should be capped near 2000 chars, got ${result.length}`,
  );
  assert.match(result, /truncated/i, `expected truncation indicator:\n${result.slice(-200)}`);
});
