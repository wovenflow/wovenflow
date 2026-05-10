import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const groupBy = mod.groupBy ?? mod.default;
if (typeof groupBy !== 'function') throw new Error('produced source must export groupBy()');

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
