# Glob match

Implement a function `globMatch(pattern, path)` that returns `true` if the `/`-separated `path` matches the glob `pattern`, and `false` otherwise. The match is anchored: the pattern must match the entire path, not just a prefix or substring.

The pattern language is the standard shell-style glob with these exact rules:

- **Literal characters** match themselves. A pattern with no metacharacters matches only an identical path (e.g. `foo/bar` matches `foo/bar` and nothing else).
- **`*`** matches zero or more characters **within a single path segment** — it never matches a `/`. So `foo/*` matches `foo/bar` but not `foo/bar/baz`, and `a*c` matches `abc` and `ac` but not `a/c`.
- **`**`** (two consecutive stars) matches zero or more characters **including `/`** — it crosses segment boundaries. So `a/**/b` matches `a/b`, `a/x/b`, and `a/x/y/b`; and `**` alone matches any path.
- **`?`** matches exactly one character that is **not** a `/`. So `a?c` matches `abc` but not `a/c` and not `ac`.
- **Character class `[...]`** matches exactly one character (never a `/`) from the set. `[abc]` matches one of `a`, `b`, or `c`. A range like `[a-z]` matches any single character in that range. A class beginning with `!` is **negated**: `[!abc]` matches any single non-`/` character that is *not* `a`, `b`, or `c`.
- **Backslash escape `\`** removes any special meaning from the next character, matching it literally. So `\*` matches a literal `*`, `\?` matches a literal `?`, `\[` matches a literal `[`, and `\\` matches a literal backslash.

A literal `/` in the pattern matches a literal `/` in the path. Neither `*`, `?`, nor a character class ever matches a `/`; only `**` does.

Export a single function `globMatch(pattern, path)` from `index.js`.
