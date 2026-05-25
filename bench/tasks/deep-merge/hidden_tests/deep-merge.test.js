// Hidden tests for the deep-merge task.
// Imports the produced source via BENCH_SOURCE_DIR env var.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');

const mod = await import(sourceDir + '/index.js');
const deepMerge = mod.deepMerge ?? mod.default;
if (typeof deepMerge !== 'function') {
  throw new Error('produced source must export deepMerge()');
}

test('[shallow-override] source value wins for a key present in both', () => {
  const r = deepMerge({ a: 1, b: 2 }, { b: 3 });
  assert.deepEqual(r, { a: 1, b: 3 });
});

test('[shallow-override] string and boolean overrides', () => {
  const r = deepMerge({ name: 'old', flag: true }, { name: 'new', flag: false });
  assert.deepEqual(r, { name: 'new', flag: false });
});

test('[new-keys] keys only in source are added', () => {
  const r = deepMerge({ a: 1 }, { b: 2, c: 3 });
  assert.deepEqual(r, { a: 1, b: 2, c: 3 });
});

test('[new-keys] keys only in target are preserved', () => {
  const r = deepMerge({ a: 1, keepMe: 'yes' }, { a: 9 });
  assert.deepEqual(r, { a: 9, keepMe: 'yes' });
});

test('[nested-merge] nested plain objects merge recursively', () => {
  const r = deepMerge(
    { config: { host: 'localhost', port: 80 } },
    { config: { port: 443, tls: true } },
  );
  assert.deepEqual(r, { config: { host: 'localhost', port: 443, tls: true } });
});

test('[nested-merge] deeply nested merge (3 levels)', () => {
  const r = deepMerge(
    { a: { b: { c: 1, keep: 0 } } },
    { a: { b: { c: 2, added: 9 } } },
  );
  assert.deepEqual(r, { a: { b: { c: 2, keep: 0, added: 9 } } });
});

test('[array-replace] arrays are replaced, not concatenated', () => {
  const r = deepMerge({ items: [1, 2, 3] }, { items: [4, 5] });
  assert.deepEqual(r, { items: [4, 5] });
});

test('[array-replace] array in source replaces object in target', () => {
  const r = deepMerge({ x: { a: 1 } }, { x: [1, 2] });
  assert.deepEqual(r, { x: [1, 2] });
});

test('[nullish-override] null in source overrides target value', () => {
  const r = deepMerge({ a: 1, b: { nested: true } }, { a: null, b: null });
  assert.deepEqual(r, { a: null, b: null });
});

test('[nullish-override] undefined in source overrides target value', () => {
  const r = deepMerge({ a: 1 }, { a: undefined });
  assert.equal('a' in r, true);
  assert.equal(r.a, undefined);
});

test('[type-mismatch] object in target, primitive in source -> source wins', () => {
  const r = deepMerge({ a: { deep: 1 } }, { a: 42 });
  assert.deepEqual(r, { a: 42 });
});

test('[type-mismatch] primitive in target, object in source -> source wins', () => {
  const r = deepMerge({ a: 42 }, { a: { deep: 1 } });
  assert.deepEqual(r, { a: { deep: 1 } });
});

test('[no-mutation] target is not mutated', () => {
  const target = { a: 1, nested: { x: 1 } };
  const source = { a: 2, nested: { y: 2 } };
  const before = JSON.parse(JSON.stringify(target));
  deepMerge(target, source);
  assert.deepEqual(target, before);
});

test('[no-mutation] source is not mutated and mutating result does not leak', () => {
  const target = { nested: { x: 1 } };
  const source = { nested: { y: 2 } };
  const result = deepMerge(target, source);
  result.nested.x = 999;
  // original inputs untouched
  assert.equal(target.nested.x, 1);
  assert.equal(source.nested.y, 2);
  assert.equal('x' in source.nested, false);
});
