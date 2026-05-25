// Hidden tests for groupBy — POST-EDIT version.
// All tests from hidden_tests/ are included verbatim (regression check),
// plus new assertions for the additive edit (optional valueFn parameter
// per edit.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const groupBy = mod.groupBy ?? mod.default;
if (typeof groupBy !== 'function') throw new Error('produced source must export groupBy()');

// --- Original behaviors (regression check, verbatim from hidden_tests/) ----

test('[empty-input] empty array returns empty object', () => {
  const r = groupBy([], (x) => x);
  assert.deepEqual(Object.keys(r), []);
});

test('[single-group] each distinct key gets its own one-element group', () => {
  const r = groupBy([1, 2, 3], (x) => String(x));
  assert.deepEqual(r, { '1': [1], '2': [2], '3': [3] });
});

test('[multiple-groups] typical multi-group split', () => {
  const r = groupBy(['apple', 'avocado', 'banana', 'blueberry', 'cherry'], (s) => s[0]);
  assert.deepEqual(r.a, ['apple', 'avocado']);
  assert.deepEqual(r.b, ['banana', 'blueberry']);
  assert.deepEqual(r.c, ['cherry']);
});

test('[preserves-order] within-group order matches input order', () => {
  const r = groupBy([3, 1, 4, 1, 5, 9, 2, 6, 5, 3], (n) => n % 2 === 0 ? 'even' : 'odd');
  assert.deepEqual(r.odd, [3, 1, 1, 5, 9, 5, 3]);
  assert.deepEqual(r.even, [4, 2, 6]);
});

test('[numeric-keys] numeric keys group correctly', () => {
  const r = groupBy([10, 20, 30, 25], (n) => Math.floor(n / 10));
  // String-coerced or numeric keys both acceptable
  const k1 = r['1'] ?? r[1];
  const k2 = r['2'] ?? r[2];
  const k3 = r['3'] ?? r[3];
  assert.deepEqual(k1, [10]);
  assert.deepEqual(k2, [20, 25]);
  assert.deepEqual(k3, [30]);
});

test('[boolean-keys] boolean keys group correctly', () => {
  const r = groupBy([1, 2, 3, 4], (n) => n % 2 === 0);
  const trueKey = r['true'] ?? r[true];
  const falseKey = r['false'] ?? r[false];
  assert.deepEqual(falseKey, [1, 3]);
  assert.deepEqual(trueKey, [2, 4]);
});

test('[all-same-key] everything in one group', () => {
  const r = groupBy([1, 2, 3], () => 'x');
  assert.deepEqual(r.x, [1, 2, 3]);
  assert.equal(Object.keys(r).length, 1);
});

// --- New behaviors (additive, per edit.md: optional valueFn parameter) -----

test('[valueFn-omitted] omitting valueFn stores raw items (original behavior)', () => {
  const r = groupBy(['apple', 'avocado', 'banana'], (s) => s[0]);
  assert.deepEqual(r.a, ['apple', 'avocado']);
  assert.deepEqual(r.b, ['banana']);
});

test('[valueFn-null-or-undefined] explicit null/undefined behave like omitted', () => {
  const u = groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? 'even' : 'odd'), undefined);
  assert.deepEqual(u.odd, [1, 3]);
  assert.deepEqual(u.even, [2, 4]);
  const z = groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? 'even' : 'odd'), null);
  assert.deepEqual(z.odd, [1, 3]);
  assert.deepEqual(z.even, [2, 4]);
});

test('[valueFn-transforms-values] groups hold valueFn(item) instead of the raw item', () => {
  const items = [
    { team: 'a', name: 'Ada' },
    { team: 'b', name: 'Bo' },
    { team: 'a', name: 'Al' },
  ];
  const r = groupBy(items, (x) => x.team, (x) => x.name);
  assert.deepEqual(r.a, ['Ada', 'Al']);
  assert.deepEqual(r.b, ['Bo']);
});

test('[valueFn-preserves-order] transformed values keep input order within a group', () => {
  const r = groupBy([3, 1, 4, 2, 6], (n) => (n % 2 === 0 ? 'even' : 'odd'), (n) => n * 10);
  assert.deepEqual(r.odd, [30, 10]);
  assert.deepEqual(r.even, [40, 20, 60]);
});

test('[valueFn-empty-input] empty array with valueFn returns empty object', () => {
  const r = groupBy([], (x) => x, (x) => x);
  assert.deepEqual(Object.keys(r), []);
});
