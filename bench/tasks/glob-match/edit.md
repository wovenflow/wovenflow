# Edit: Add an optional `options` argument with case-insensitive matching

Extend `globMatch(pattern, path, options)` to accept an optional third argument `options`. When `options.nocase` is `true`, matching is **case-insensitive**: literal characters, `?`, `*`, `**`, and character classes (including ranges and negation) all match without regard to ASCII letter case. So with `{ nocase: true }`, the pattern `Foo/Bar` matches `foo/bar`, `[a-z]` matches `M`, and `[!abc]` does not match `A` (because `A` case-folds to `a`, which is in the set).

When `options` is omitted, or `options.nocase` is falsy, matching is case-sensitive exactly as before. The slash-handling rules are unchanged: `*`, `?`, and character classes still never match a `/`, and only `**` crosses segment boundaries — case folding does not affect `/`.

All existing behavior for callers that omit `options` (or pass `options` without `nocase`) is identical to the original. Export the same single function `globMatch(pattern, path, options)` from `index.js`.
