# Semver range

Implement a function `satisfies(version, range)` that returns `true` if the semantic version `version` satisfies the version range `range`, and `false` otherwise. Follow standard npm semver semantics, restricted to release versions (no prerelease tags in phase 1).

`version` is a release version string of the form `MAJOR.MINOR.PATCH` where each component is a non-negative integer (e.g. `"1.2.3"`, `"0.0.0"`). You may assume `version` is always a well-formed release version; you do not need to validate it.

`range` is a string built from the following constructs. Each is defined precisely so behavior is unambiguous:

- **Exact version** — `"1.2.3"`. Matches only that exact version.
- **Comparators** — a comparator operator immediately followed by a version: `>1.2.3`, `>=1.2.3`, `<1.2.3`, `<=1.2.3`, `=1.2.3`. Comparison is by `[major, minor, patch]` ordered numerically (major first, then minor, then patch). `=1.2.3` is equivalent to the exact version `1.2.3`. A bare version with no operator (`1.2.3`) is also treated as `=1.2.3`.
- **Caret** `^MAJOR.MINOR.PATCH` — allows changes that do not modify the left-most non-zero component:
  - `^1.2.3` means `>=1.2.3 <2.0.0`.
  - `^0.2.3` means `>=0.2.3 <0.3.0` (major is 0, so the left-most non-zero component is minor).
  - `^0.0.3` means `>=0.0.3 <0.0.4` (left-most non-zero component is patch).
- **Tilde** `~MAJOR.MINOR.PATCH` — allows patch-level changes: `~1.2.3` means `>=1.2.3 <1.3.0`. (For the full `MAJOR.MINOR.PATCH` form, tilde always pins major+minor and allows patch upward.)
- **X-ranges** — `x`, `X`, or `*` stand in for "any" in a position, and trailing positions may be omitted:
  - `1.2.x` (equivalently `1.2.*`) means `>=1.2.0 <1.3.0`.
  - `1.x` (equivalently `1.x.x`, `1.*`) means `>=1.0.0 <2.0.0`.
  - `*` (equivalently `x`, `x.x.x`) matches any version.
- **OR** — two or more range parts joined by `||` (with optional surrounding spaces): the version satisfies the range if it satisfies ANY part. Example: `"1.2.3 || >=2.0.0"`.
- **AND** — two or more comparators separated by spaces within a single part: the version must satisfy ALL of them. Example: `">=1.2.0 <2.0.0"`. Caret, tilde, and x-range forms desugar to their comparator pair and are ANDed accordingly.

Precedence: `||` separates parts at the top level; within a part, space-separated comparators are ANDed. So `">=1.0.0 <1.5.0 || >=2.0.0"` is `(>=1.0.0 AND <1.5.0) OR (>=2.0.0)`.

There are no prerelease versions in scope for this phase: neither `version` nor `range` will contain a hyphen prerelease tag. Build metadata is also out of scope.

Export a single function `satisfies(version, range)` from `index.js`.
