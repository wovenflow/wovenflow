# Edit: add prerelease handling

Extend `satisfies(version, range)` so that `version` and the versions inside `range` comparators may carry a prerelease tag (a hyphen followed by dot-separated identifiers, e.g. `1.2.3-beta.1`, `2.0.0-rc.2`). Apply the standard npm rule for prereleases:

- A prerelease version (one that has a `-tag`) is, by default, EXCLUDED from a range unless the range contains at least one comparator whose version has the SAME `[major, minor, patch]` tuple AND also carries a prerelease tag. In other words, prereleases are only matched when the user opted into that exact `MAJOR.MINOR.PATCH` by writing a prerelease comparator there.
- When the comparator does opt in (same `[major, minor, patch]` and a prerelease tag present), the prerelease version is compared normally: first by `[major, minor, patch]` numerically, then — for equal tuples — by prerelease precedence. Prerelease precedence follows semver: a version WITHOUT a prerelease ranks ABOVE one WITH a prerelease at the same tuple; comparing two prerelease tags is done dot-segment by dot-segment, numeric segments ordered numerically, alphanumeric segments ordered lexically, numeric segments ranking below alphanumeric ones, and a shorter set of segments ranking below a longer one when all leading segments match.
- A non-prerelease (release) version's behavior is UNCHANGED by this edit. Ranges and versions without any prerelease tags behave exactly as in phase 1.

Concretely:
- `satisfies('1.2.3-beta.1', '>=1.0.0')` is `false` — the range has no prerelease comparator at `1.2.3`, so the prerelease is excluded even though `1.2.3-beta.1` is numerically in range.
- `satisfies('1.2.3-beta.2', '>=1.2.3-beta.1')` is `true` — the comparator opts in at `1.2.3` with a prerelease, and `beta.2 > beta.1`.
- `satisfies('1.2.3-beta.1', '>=1.2.3-beta.2')` is `false` — opted in, but `beta.1 < beta.2`.
- `satisfies('1.2.4-beta.1', '>=1.2.3-beta.1')` is `false` — the prerelease comparator is at tuple `1.2.3`, not `1.2.4`, so `1.2.4-beta.1` does not get the opt-in and is excluded.
- `satisfies('1.2.3', '>=1.2.3-beta.1')` is `true` — `1.2.3` is a release version, unaffected by the prerelease rule, and `1.2.3 >= 1.2.3-beta.1` because a release outranks its prereleases.

The exported signature remains `satisfies(version, range)` from `index.js`.
