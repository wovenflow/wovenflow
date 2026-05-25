# Deep merge

Implement a function `deepMerge(target, source)` that recursively merges `source` into `target` and returns a NEW merged object. Neither `target` nor `source` may be mutated.

Rules:

- A key present in `source` but not in `target` is added to the result.
- A key present in both, where both values are plain objects, is merged recursively.
- A key present in both, where the values are NOT both plain objects, takes the `source` value (source wins). This includes the case where the `source` value is `null` or `undefined`: such a value overrides the target value rather than being skipped.
- Arrays are treated as scalar values: when both values are arrays (or in any case that is not "both plain objects"), the `source` array REPLACES the target value entirely. Arrays are never concatenated or element-wise merged.
- A type mismatch on a key (a plain object in one input and a non-object — primitive, array, `null`, etc. — in the other) resolves in favor of `source`.
- The result is a fresh object. Nested plain objects that come only from `target` or only from `source` may be shared by reference into the result, but the top-level returned object and every plain object reached by recursive merging must be newly created so that mutating the result does not mutate either input at a merged path.

"Plain object" means a value `v` where `typeof v === 'object'`, `v !== null`, `Array.isArray(v)` is false, and it is not some other built-in like `Date`, `Map`, or `RegExp` (treat those non-plain objects as scalar values that `source` replaces). You may assume inputs contain only plain objects, arrays, and primitives.

Export a single function `deepMerge(target, source)` from `index.js`.
