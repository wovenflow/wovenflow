# Interval merge

Implement a function `mergeIntervals(intervals)` that merges a collection of closed integer/number intervals. The input is an array of `[start, end]` pairs where `start <= end`. The intervals may be given in any order and may overlap. Return a new array of merged `[start, end]` pairs, sorted ascending by `start`, where no two output intervals overlap or touch.

Rules:

- Two intervals that **overlap** are merged into one spanning their combined range (e.g. `[1, 5]` and `[3, 8]` → `[1, 8]`).
- Two intervals that are **adjacent / touching** — where one ends exactly where the next begins — are also merged (e.g. `[1, 2]` and `[2, 3]` → `[1, 3]`).
- An interval **fully contained** within another is absorbed (e.g. `[1, 10]` and `[3, 4]` → `[1, 10]`).
- Input order does not matter; the output is always sorted ascending by `start`.
- An **empty input** array returns an empty array.
- A **single interval** is returned as-is (in a new array).
- **Zero-length point intervals** are allowed (e.g. `[5, 5]`) and follow the same merge rules — a point that touches another interval merges into it.

The input must not be mutated. Return a fresh array of fresh pairs.

Export a single function `mergeIntervals(intervals)` from `index.js`.
