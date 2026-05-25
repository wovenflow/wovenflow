# Edit: add an optional array-merge strategy

Extend `deepMerge(target, source, options)` to accept an optional third argument `options`. When `options.arrayMerge === 'concat'` and a key holds an array in BOTH `target` and `source`, the result for that key is a NEW array containing the target's elements followed by the source's elements (`target.concat(source)`), instead of the source array replacing the target array.

All other behavior is unchanged:

- When `options` is omitted, or `options.arrayMerge` is anything other than the string `'concat'` (including the default replace behavior), arrays are replaced exactly as before.
- The concat strategy applies ONLY when both values are arrays. If only one side is an array (a type mismatch — array vs object, array vs primitive, etc.), `source` still wins exactly as in the base behavior; arrays are never concatenated with non-arrays.
- The concatenated array must be a fresh array; neither input array may be mutated.
- Nested arrays follow the same rule recursively: when concat mode is active, arrays found at any depth where both sides are arrays are concatenated.

The exported signature remains `deepMerge(target, source, options?)` from `index.js`.
