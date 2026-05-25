# Edit: Add an optional custom delimiter argument

Extend `parseCsv(text, delimiter)` to accept an optional second argument `delimiter` that overrides the field separator. When `delimiter` is omitted (or undefined), it defaults to `','`, preserving the existing behavior exactly. When provided, the given single character is used as the field separator instead of a comma — for example, passing `'\t'` parses tab-separated values (TSV), and passing `';'` parses semicolon-delimited rows.

All existing quoting rules continue to apply relative to the active delimiter: a quoted field may contain the delimiter as a literal character, doubled double-quotes (`""`) still escape a literal quote, line breaks (LF and CRLF) still separate rows, a single trailing line break still does not produce an extra empty row, and whitespace is still preserved. The delimiter character itself is the only separator that changes; the double-quote character (`"`) remains the quote character regardless of delimiter.

The exported signature remains `parseCsv(text, delimiter?)` from `index.js`.
