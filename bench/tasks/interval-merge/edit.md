# Edit: Add an optional `gap` argument for near-merging

Extend `mergeIntervals(intervals, gap)` to accept an optional second argument `gap` (a non-negative number, default `0`). Two intervals merge if the distance between them is less than or equal to `gap` — that is, intervals `[a, b]` and `[c, d]` (with `b <= c`) merge when `c - b <= gap`. With the default `gap` of `0`, behavior is unchanged from the original (overlapping and exactly-touching intervals merge, a one-unit hole does not).

With `gap = 1`, intervals separated by a hole of size 1 also merge: `[1, 2]` and `[3, 4]` → `[1, 4]` (since `3 - 2 = 1 <= 1`). With `gap = 2`, `[1, 2]` and `[5, 6]` stay separate (since `5 - 2 = 3 > 2`) but `[1, 2]` and `[4, 6]` merge (since `4 - 2 = 2 <= 2`).

All other rules from the original task are unchanged: output is sorted ascending by start, the input is not mutated, and a fresh array of fresh pairs is returned. When `gap` is omitted, the exported `mergeIntervals(intervals, gap?)` behaves identically to the original `mergeIntervals(intervals)`.

Export the same single function `mergeIntervals(intervals, gap)` from `index.js`.
