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

// --- post-edit assertions: page/pageSize opt-in (per edit.md) ---

test('[page-basic-slice] page=1, pageSize=3 returns first three with page metadata', () => {
  const r = paginate(data, { page: 1, pageSize: 3 });
  assert.deepEqual(r.items, [1, 2, 3]);
  assert.equal(r.page, 1);
  assert.equal(r.pageSize, 3);
  assert.equal(r.total, 10);
});

test('[page-middle] page=2, pageSize=3 returns middle slice', () => {
  const r = paginate(data, { page: 2, pageSize: 3 });
  assert.deepEqual(r.items, [4, 5, 6]);
  assert.equal(r.page, 2);
});

test('[page-clamping] page<1 is clamped to 1', () => {
  const r = paginate(data, { page: 0, pageSize: 3 });
  assert.deepEqual(r.items, [1, 2, 3]);
  assert.equal(r.page, 1);
  const r2 = paginate(data, { page: -5, pageSize: 3 });
  assert.deepEqual(r2.items, [1, 2, 3]);
  assert.equal(r2.page, 1);
});

test('[total-pages-math] totalPages = ceil(total / pageSize)', () => {
  const r = paginate(data, { page: 1, pageSize: 3 });
  assert.equal(r.totalPages, 4); // ceil(10 / 3)
  const r2 = paginate(data, { page: 1, pageSize: 5 });
  assert.equal(r2.totalPages, 2); // 10 / 5
});

test('[total-pages-edge-zero-pagesize] totalPages = 0 when pageSize <= 0', () => {
  const r = paginate(data, { page: 1, pageSize: 0 });
  assert.equal(r.totalPages, 0);
});

test('[page-pagesize-precedence] page/pageSize wins over offset/limit when both supplied', () => {
  const r = paginate(data, { offset: 6, limit: 2, page: 1, pageSize: 3 });
  assert.deepEqual(r.items, [1, 2, 3]);
});

test('[page-hasmore-flag] hasMore reflects whether more pages remain', () => {
  const r1 = paginate(data, { page: 1, pageSize: 3 });
  assert.equal(r1.hasMore, true);
  const r2 = paginate(data, { page: 4, pageSize: 3 });
  assert.equal(r2.hasMore, false);
});

test('[page-original-shape-preserved] offset/limit-only calls return the pre-edit shape', () => {
  const r = paginate(data, { offset: 0, limit: 3 });
  assert.deepEqual(r.items, [1, 2, 3]);
  assert.equal(r.offset, 0);
  assert.equal(r.limit, 3);
  // 'page' / 'pageSize' / 'totalPages' may be absent on the pre-edit path —
  // the contract is "original shape and values" when only offset/limit supplied.
});
