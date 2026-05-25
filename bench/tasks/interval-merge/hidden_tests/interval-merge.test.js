import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const mergeIntervals = mod.mergeIntervals ?? mod.default;
if (typeof mergeIntervals !== 'function') throw new Error('produced source must export mergeIntervals()');

test('[empty] empty input returns empty array', () => {
  assert.deepEqual(mergeIntervals([]), []);
});

test('[single] a single interval is returned as-is', () => {
  assert.deepEqual(mergeIntervals([[1, 4]]), [[1, 4]]);
});

test('[non-overlapping] disjoint intervals stay separate', () => {
  assert.deepEqual(mergeIntervals([[1, 2], [4, 5], [7, 8]]), [[1, 2], [4, 5], [7, 8]]);
});

test('[overlapping] overlapping intervals are merged', () => {
  assert.deepEqual(mergeIntervals([[1, 5], [3, 8]]), [[1, 8]]);
});

test('[overlapping] a chain of overlaps collapses to one', () => {
  assert.deepEqual(mergeIntervals([[1, 3], [2, 6], [5, 10]]), [[1, 10]]);
});

test('[adjacent-touch] touching intervals merge ([1,2]+[2,3] -> [1,3])', () => {
  assert.deepEqual(mergeIntervals([[1, 2], [2, 3]]), [[1, 3]]);
});

test('[adjacent-touch] a one-unit gap does NOT merge', () => {
  // [1,2] and [3,4] are not touching (2 !== 3), so they stay separate.
  assert.deepEqual(mergeIntervals([[1, 2], [3, 4]]), [[1, 2], [3, 4]]);
});

test('[unsorted-input] output is sorted by start regardless of input order', () => {
  assert.deepEqual(mergeIntervals([[7, 8], [1, 2], [4, 5]]), [[1, 2], [4, 5], [7, 8]]);
});

test('[unsorted-input] unsorted overlapping intervals merge correctly', () => {
  assert.deepEqual(mergeIntervals([[3, 8], [1, 5]]), [[1, 8]]);
});

test('[contained] a fully contained interval is absorbed', () => {
  assert.deepEqual(mergeIntervals([[1, 10], [3, 4]]), [[1, 10]]);
});

test('[contained] containment holds when the inner interval comes first', () => {
  assert.deepEqual(mergeIntervals([[3, 4], [1, 10]]), [[1, 10]]);
});

test('[point-interval] a point that touches an interval merges in', () => {
  // [5,5] touches [5,9] at 5, so it merges.
  assert.deepEqual(mergeIntervals([[5, 5], [5, 9]]), [[5, 9]]);
});

test('[point-interval] a standalone point survives as a zero-length interval', () => {
  assert.deepEqual(mergeIntervals([[5, 5], [8, 9]]), [[5, 5], [8, 9]]);
});

test('input array is not mutated', () => {
  const input = [[3, 8], [1, 5]];
  const snapshot = JSON.parse(JSON.stringify(input));
  mergeIntervals(input);
  assert.deepEqual(input, snapshot);
});
