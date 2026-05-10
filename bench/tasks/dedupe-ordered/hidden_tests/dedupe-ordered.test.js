import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const dedupe = mod.dedupe ?? mod.default;
if (typeof dedupe !== 'function') throw new Error('produced source must export dedupe()');

test('[empty-input] empty array', () => {
  assert.deepEqual(dedupe([]), []);
});

test('[no-duplicates] returns copy in order', () => {
  assert.deepEqual(dedupe([1, 2, 3, 4]), [1, 2, 3, 4]);
});

test('[all-duplicates] collapses to one', () => {
  assert.deepEqual(dedupe([5, 5, 5, 5]), [5]);
});

test('[preserves-first-occurrence-order] order matches first-seen', () => {
  assert.deepEqual(dedupe([3, 1, 2, 1, 3, 4, 2]), [3, 1, 2, 4]);
  assert.deepEqual(dedupe(['c', 'a', 'b', 'a', 'c']), ['c', 'a', 'b']);
});

test('[primitive-types-mixed] strict equality across types', () => {
  assert.deepEqual(dedupe([1, '1', true, 1, '1', true]), [1, '1', true]);
});

test('[object-reference-equality] different object literals are not duplicates', () => {
  const r = dedupe([{ a: 1 }, { a: 1 }]);
  assert.equal(r.length, 2);
  // Same reference deduplicates:
  const obj = { a: 1 };
  const r2 = dedupe([obj, obj, obj]);
  assert.equal(r2.length, 1);
});

test('[nan-deduplication] multiple NaN collapse to one', () => {
  const r = dedupe([NaN, 1, NaN, 2, NaN]);
  // Expected: [NaN, 1, 2] — count of NaN is 1.
  const nanCount = r.filter((x) => Number.isNaN(x)).length;
  assert.equal(nanCount, 1);
  assert.ok(r.includes(1));
  assert.ok(r.includes(2));
  assert.equal(r.length, 3);
});
