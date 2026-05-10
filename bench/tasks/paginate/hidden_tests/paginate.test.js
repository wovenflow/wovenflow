import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const paginate = mod.paginate ?? mod.default;
if (typeof paginate !== 'function') throw new Error('produced source must export paginate()');

const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

test('[first-page] offset=0, limit=3 returns first three', () => {
  const r = paginate(data, { offset: 0, limit: 3 });
  assert.deepEqual(r.items, [1, 2, 3]);
  assert.equal(r.total, 10);
  assert.equal(r.offset, 0);
  assert.equal(r.limit, 3);
});

test('[middle-page] middle slice', () => {
  const r = paginate(data, { offset: 3, limit: 3 });
  assert.deepEqual(r.items, [4, 5, 6]);
});

test('[last-page-partial] partial final page', () => {
  const r = paginate(data, { offset: 8, limit: 5 });
  assert.deepEqual(r.items, [9, 10]);
  assert.equal(r.hasMore, false);
});

test('[offset-past-end] offset >= total returns empty + hasMore=false', () => {
  const r = paginate(data, { offset: 100, limit: 5 });
  assert.deepEqual(r.items, []);
  assert.equal(r.hasMore, false);
});

test('[empty-input] empty array returns empty items + hasMore=false', () => {
  const r = paginate([], { offset: 0, limit: 5 });
  assert.deepEqual(r.items, []);
  assert.equal(r.total, 0);
  assert.equal(r.hasMore, false);
});

test('[zero-limit] zero or negative limit returns empty items', () => {
  const r0 = paginate(data, { offset: 0, limit: 0 });
  assert.deepEqual(r0.items, []);
  const rNeg = paginate(data, { offset: 0, limit: -3 });
  assert.deepEqual(rNeg.items, []);
});

test('[negative-offset] negative offset is treated as zero', () => {
  const r = paginate(data, { offset: -5, limit: 3 });
  assert.deepEqual(r.items, [1, 2, 3]);
});

test('[has-more-flag] true when more items remain, false when not', () => {
  const r1 = paginate(data, { offset: 0, limit: 3 });
  assert.equal(r1.hasMore, true);
  const r2 = paginate(data, { offset: 7, limit: 3 });
  assert.equal(r2.hasMore, false);
});
