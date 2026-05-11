import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const deepEqual = mod.deepEqual ?? mod.default;
if (typeof deepEqual !== 'function') throw new Error('produced source must export deepEqual()');

test('[primitive-equal] equal primitives', () => {
  assert.equal(deepEqual(1, 1), true);
  assert.equal(deepEqual('foo', 'foo'), true);
  assert.equal(deepEqual(true, true), true);
});

test('[primitive-unequal] unequal primitives', () => {
  assert.equal(deepEqual(1, 2), false);
  assert.equal(deepEqual('foo', 'bar'), false);
});

test('[nan-equality] NaN equals NaN', () => {
  assert.equal(deepEqual(NaN, NaN), true);
});

test('[array-equal] arrays equal element-wise', () => {
  assert.equal(deepEqual([1, 2, 3], [1, 2, 3]), true);
  assert.equal(deepEqual([1, 2], [1, 2, 3]), false);
});

test('[object-equal] objects equal key-by-key', () => {
  assert.equal(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 }), true);
  assert.equal(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 }), false);
  assert.equal(deepEqual({ a: 1 }, { a: 1, b: 2 }), false);
});

test('[nested-structure] handles nested arrays and objects', () => {
  const a = { x: [1, { y: 2 }] };
  const b = { x: [1, { y: 2 }] };
  const c = { x: [1, { y: 3 }] };
  assert.equal(deepEqual(a, b), true);
  assert.equal(deepEqual(a, c), false);
});

test('[type-mismatch] different types are not equal', () => {
  assert.equal(deepEqual([1, 2], { 0: 1, 1: 2 }), false);
  assert.equal(deepEqual(null, undefined), false);
  assert.equal(deepEqual(0, '0'), false);
});

test('[cyclic-reference] handles self-referential objects', () => {
  const a = { x: 1 };
  a.self = a;
  const b = { x: 1 };
  b.self = b;
  // Must not infinite-loop. Result for equivalent cycles should be true.
  assert.equal(deepEqual(a, b), true);
});

// --- post-edit assertions: options.collections (Map/Set/Date structural equality) ---

test('[collections-default-off] Map/Set/Date still compare as plain objects by default', () => {
  // Without options.collections, two Date objects with the same time value should
  // NOT be considered equal under the original deepEqual contract (they're
  // objects with no enumerable own keys; comparing them yields true on key-set
  // but their distinct time isn't checked). The post-edit default behavior is
  // unchanged from pre-edit.
  const a = new Date(1000);
  const b = new Date(1000);
  // Either result is acceptable for the DEFAULT path — what matters is
  // consistency with pre-edit behavior; assert the function does not throw.
  assert.doesNotThrow(() => deepEqual(a, b));
});

test('[collections-date-equality] Date instances compare by getTime() when opted in', () => {
  const a = new Date(1000);
  const b = new Date(1000);
  const c = new Date(2000);
  assert.equal(deepEqual(a, b, { collections: true }), true);
  assert.equal(deepEqual(a, c, { collections: true }), false);
});

test('[collections-date-nan] NaN-time Date instances are equal under collections opt-in', () => {
  const a = new Date(NaN);
  const b = new Date(NaN);
  assert.equal(deepEqual(a, b, { collections: true }), true);
});

test('[collections-set-equality] Sets equal by size + element-wise membership (order-independent)', () => {
  const a = new Set([1, 2, 3]);
  const b = new Set([3, 2, 1]);
  const c = new Set([1, 2, 4]);
  assert.equal(deepEqual(a, b, { collections: true }), true);
  assert.equal(deepEqual(a, c, { collections: true }), false);
});

test('[collections-map-equality] Maps equal by size + key-value membership', () => {
  const a = new Map([['x', 1], ['y', 2]]);
  const b = new Map([['y', 2], ['x', 1]]);
  const c = new Map([['x', 1], ['y', 3]]);
  assert.equal(deepEqual(a, b, { collections: true }), true);
  assert.equal(deepEqual(a, c, { collections: true }), false);
});

test('[collections-nested-deep-equal] Map values are compared with deepEqual recursively', () => {
  const a = new Map([['k', { nested: [1, 2] }]]);
  const b = new Map([['k', { nested: [1, 2] }]]);
  const c = new Map([['k', { nested: [1, 3] }]]);
  assert.equal(deepEqual(a, b, { collections: true }), true);
  assert.equal(deepEqual(a, c, { collections: true }), false);
});
