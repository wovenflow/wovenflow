import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const mergeIntervals = mod.mergeIntervals ?? mod.default;
if (typeof mergeIntervals !== 'function') throw new Error('produced source must export mergeIntervals()');

// --- phase-1 regression assertions (behavior with default gap unchanged) ---

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

test('[adjacent-touch] a one-unit gap does NOT merge by default', () => {
  assert.deepEqual(mergeIntervals([[1, 2], [3, 4]]), [[1, 2], [3, 4]]);
});

test('[unsorted-input] output is sorted by start regardless of input order', () => {
  assert.deepEqual(mergeIntervals([[7, 8], [1, 2], [4, 5]]), [[1, 2], [4, 5], [7, 8]]);
});

test('[contained] a fully contained interval is absorbed', () => {
  assert.deepEqual(mergeIntervals([[1, 10], [3, 4]]), [[1, 10]]);
});

test('[point-interval] a point that touches an interval merges in', () => {
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

// --- post-edit assertions: optional `gap` argument ---

test('[gap-default] omitting gap is identical to the original behavior', () => {
  // A one-unit hole does NOT merge when gap is omitted (default 0).
  assert.deepEqual(mergeIntervals([[1, 2], [3, 4]]), [[1, 2], [3, 4]]);
});

test('[gap-default] explicit gap=0 matches the default', () => {
  assert.deepEqual(mergeIntervals([[1, 2], [3, 4]], 0), [[1, 2], [3, 4]]);
  // Overlapping/touching still merge with gap=0.
  assert.deepEqual(mergeIntervals([[1, 2], [2, 3]], 0), [[1, 3]]);
});

test('[gap-merges] gap=1 merges intervals separated by a hole of 1', () => {
  assert.deepEqual(mergeIntervals([[1, 2], [3, 4]], 1), [[1, 4]]);
});

test('[gap-merges] gap respects the distance threshold', () => {
  // distance 5-2 = 3 > 2, so these stay separate.
  assert.deepEqual(mergeIntervals([[1, 2], [5, 6]], 2), [[1, 2], [5, 6]]);
  // distance 4-2 = 2 <= 2, so these merge.
  assert.deepEqual(mergeIntervals([[1, 2], [4, 6]], 2), [[1, 6]]);
});

test('[gap-merges] gap-merging chains across multiple intervals', () => {
  // With gap=1: [1,2]~[3,4]~[5,6] all merge into [1,6].
  assert.deepEqual(mergeIntervals([[1, 2], [3, 4], [5, 6]], 1), [[1, 6]]);
});

test('[gap-merges] gap-merging still sorts unsorted input', () => {
  assert.deepEqual(mergeIntervals([[5, 6], [1, 2], [3, 4]], 1), [[1, 6]]);
});
