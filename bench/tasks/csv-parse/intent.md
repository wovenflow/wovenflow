# CSV parse

Parse a string of CSV (comma-separated values) text into an array of rows, where each row is an array of string fields. Fields are separated by commas and rows are separated by line breaks.

Follow the common CSV quoting rules (RFC 4180 style):

- A field may be wrapped in double quotes. A quoted field may contain commas, which are treated as literal characters rather than field separators.
- A quoted field may contain line breaks, which are treated as literal characters rather than row separators.
- Inside a quoted field, a doubled double-quote (`""`) represents a single literal double-quote character.
- Whitespace inside a quoted field is preserved exactly. Whitespace in an unquoted field is also preserved (do NOT trim fields).
- Empty fields are allowed: `a,,c` parses to three fields, the middle one being the empty string.

Line endings may be `\n` (LF) or `\r\n` (CRLF); both separate rows, and the `\r` of a CRLF must not appear in the parsed field. A single trailing line break at the very end of the input does NOT produce an extra empty final row.

All returned field values are strings (no type coercion).

Export a single function `parseCsv(text)` from `index.js`.
