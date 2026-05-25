# Parse duration

Parse a human-readable duration string into a number of milliseconds. The input is a string built from one or more `<number><unit>` segments, optionally surrounded by whitespace.

Supported units (case-sensitive, lowercase):

- `ms` — milliseconds
- `s` — seconds (1000 ms)
- `m` — minutes (60000 ms)
- `h` — hours (3600000 ms)
- `d` — days (86400000 ms)
- `w` — weeks (604800000 ms)

Rules:

- A single segment like `"500ms"` or `"2h"` is converted to its millisecond value.
- Multiple segments may be combined and are summed, e.g. `"1h30m"` is `5400000`. Segments may appear in any order; ordering is NOT required (`"30m1h"` equals `"1h30m"`).
- A segment's number may be fractional, e.g. `"1.5h"` is `5400000` and `"0.5s"` is `500`.
- Surrounding whitespace is tolerated, e.g. `"  2h  "` parses the same as `"2h"`.
- `"0s"` (or any zero-valued duration) returns `0`.

Return the total number of milliseconds as a `Number`. For any input that is not a valid duration, return `null`. Invalid input includes: a bare number with no unit (`"100"`), an unknown unit (`"5x"`), the empty string, a non-string, and any string that does not consist entirely of valid `<number><unit>` segments.

Export a single function `parseDuration(str)` from `index.js`.
