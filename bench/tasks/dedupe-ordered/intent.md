# Dedupe preserving order

Implement a function `dedupe(items)` that takes an array and returns a new array with duplicates removed, preserving the order of first occurrence. The first time a value appears in the input it is kept; subsequent appearances are dropped. Equality is by strict equality (===) for primitives. Object/array values compare by reference (two different objects that happen to be structurally equal are considered different). NaN values should be treated as equal to other NaN values for deduplication purposes (so multiple NaN entries collapse to one).

Export a single function `dedupe(items)` from `index.js`.
