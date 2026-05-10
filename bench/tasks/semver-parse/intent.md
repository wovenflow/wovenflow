# Semver parse

Parse a semantic-version string into its components. The input is a string in the form `MAJOR.MINOR.PATCH` optionally followed by a hyphen and a pre-release identifier (e.g. `-alpha.1`) and optionally followed by a plus sign and build metadata (e.g. `+sha.deadbeef`). Return an object with the parsed components: `major`, `minor`, `patch` (numbers), `prerelease` (string or null), `build` (string or null). Reject inputs that do not match the semver shape by throwing an error.

Export a single function `parse(input)` from `index.js`.
