# Paginate

Implement a function `paginate(items, { offset, limit })` that returns a slice of an array along with pagination metadata. The result is an object with `items` (the slice), `total` (the original array's length), `offset` (the offset that was applied), `limit` (the limit that was applied), `hasMore` (true if there are items beyond the slice). If `offset` is greater than or equal to the total length, return an empty `items` array with `hasMore: false`. If `limit` is less than or equal to zero, return an empty `items` array. Negative `offset` is treated as zero.

Export a single function `paginate(items, options)` from `index.js`.
