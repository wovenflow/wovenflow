# Throttle

Implement a function `throttle(fn, ms)` that returns a throttled version of `fn`. The throttled function may be called many times in rapid succession, but `fn` itself runs at most once per `ms` milliseconds. The first call to the throttled function invokes `fn` immediately (leading edge); subsequent calls within the throttle window are coalesced and the most recent arguments are passed to `fn` when the window ends (trailing edge). After the trailing-edge call, the throttled function is ready to fire immediately on the next invocation outside the window. The returned function should pass through arguments and `this` faithfully.

Export a single function `throttle(fn, ms)` from `index.js`.
