# Edit: Support negative durations with a leading minus sign

Extend `parseDuration(str)` to accept an optional single leading `-` (minus sign) on the whole duration string, producing a negative millisecond total. For example, `"-30m"` returns `-1800000` and `"-1h30m"` returns `-5400000`.

The minus sign applies to the entire summed duration, not to an individual segment: `"-1h30m"` is `-(3600000 + 1800000) = -5400000`. The minus may be preceded by surrounding whitespace (e.g. `"  -2h "` is `-7200000`), but it must be the first non-whitespace character. After stripping a leading minus, the remainder must be a valid positive duration; otherwise return `null`.

A leading `-` followed by `"0s"` (or any zero duration) returns `0` (negative zero and positive zero are equal). A bare `"-"` with no following duration, or any otherwise-invalid input, still returns `null`. All Phase-1 behavior for non-negative inputs is unchanged.

The exported signature remains `parseDuration(str)` from `index.js`.
