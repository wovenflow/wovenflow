# Time window

Implement a sliding-window aggregator. The function `createWindow(ttlMs)` returns an object with two methods: `add(value, now)` records a value at the given timestamp; `sum(now)` returns the sum of all values still within the TTL window relative to `now`. Values whose recorded timestamp is older than `now - ttlMs` are excluded. The window is exclusive of the older edge: a value recorded exactly at `now - ttlMs` is excluded; a value recorded at `now - ttlMs + 1` is included. Timestamps are always passed in by the caller (no internal `Date.now()`); the function should not depend on real wall-clock time.

Export a single function `createWindow(ttlMs)` from `index.js`.
