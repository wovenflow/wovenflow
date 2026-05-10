# Deep equal

Implement a function `deepEqual(a, b)` that returns true if `a` and `b` are structurally equal, false otherwise. Primitives compare with strict equality, with the exception that `NaN` compared to `NaN` returns true. Arrays are equal if they have the same length and each element is deeply equal. Plain objects are equal if they have the same set of own enumerable keys and each value is deeply equal. The function should handle cyclic references without infinite recursion. Different types (e.g., array vs object, null vs undefined) compare as not equal.

Export a single function `deepEqual(a, b)` from `index.js`.
