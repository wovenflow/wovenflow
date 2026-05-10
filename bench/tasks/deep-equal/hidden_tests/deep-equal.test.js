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
