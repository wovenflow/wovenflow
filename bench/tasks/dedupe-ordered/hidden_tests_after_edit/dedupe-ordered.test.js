// Hidden tests for dedupe — POST-EDIT version.
// All tests from hidden_tests/ are included verbatim (regression check),
// plus new assertions for the additive edit (optional keyFn parameter
// per edit.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const dedupe = mod.dedupe ?? mod.default;
if (typeof dedupe !== 'function') throw new Error('produced source must export dedupe()');

// --- Original behaviors (regression check, verbatim from hidden_tests/) ----

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

// --- New behaviors (additive, per edit.md: optional keyFn parameter) ------

test('[keyFn-omitted] omitting keyFn preserves original behavior', () => {
  assert.deepEqual(dedupe([3, 1, 2, 1, 3, 4, 2]), [3, 1, 2, 4]);
});

test('[keyFn-null-or-undefined] explicit null/undefined behave like omitted', () => {
  assert.deepEqual(dedupe([1, 2, 1, 3], undefined), [1, 2, 3]);
  assert.deepEqual(dedupe([1, 2, 1, 3], null), [1, 2, 3]);
});

test('[keyFn-derives-key] dedupes by the derived key, keeping the original item', () => {
  const items = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 1, n: 'c' }];
  const r = dedupe(items, (x) => x.id);
  assert.equal(r.length, 2);
  // First item per key is kept (the original object, not the key).
  assert.deepEqual(r[0], { id: 1, n: 'a' });
  assert.deepEqual(r[1], { id: 2, n: 'b' });
});

test('[keyFn-preserves-first-occurrence-order] order follows first-seen key', () => {
  const items = ['apple', 'avocado', 'banana', 'blueberry', 'cherry'];
  const r = dedupe(items, (s) => s[0]);
  assert.deepEqual(r, ['apple', 'banana', 'cherry']);
});

test('[keyFn-collapses-distinct-objects] structurally-equal objects collapse under a shared key', () => {
  const items = [{ a: 1 }, { a: 1 }, { a: 2 }];
  const r = dedupe(items, (x) => x.a);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { a: 1 });
  assert.deepEqual(r[1], { a: 2 });
});

test('[keyFn-nan-keys] NaN keys collapse to one', () => {
  const items = [{ v: NaN }, { v: 1 }, { v: NaN }, { v: 2 }];
  const r = dedupe(items, (x) => x.v);
  assert.equal(r.length, 3);
  assert.deepEqual(r[0], { v: NaN });
  assert.deepEqual(r[1], { v: 1 });
  assert.deepEqual(r[2], { v: 2 });
});
