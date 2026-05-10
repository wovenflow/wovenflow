# Parse CLI flags

Implement a function `parseFlags(argv)` that parses an array of command-line arguments into an options object. Recognize three forms: long flags `--name value` and `--name=value`, short flags `-x value` and combined `-xyz` (each character is a boolean flag), and positional arguments (anything that does not start with a dash). Long-flag values are captured as strings. If a long flag appears without a value (next arg is another flag or end of array), treat it as a boolean true. The returned object has a `flags` property (an object mapping flag name to value) and a `positional` property (an array of positional arguments in order). Repeated long flags collect into an array of values.

Export a single function `parseFlags(argv)` from `index.js`.
