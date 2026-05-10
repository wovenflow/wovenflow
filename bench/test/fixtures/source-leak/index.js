// Deliberately leaky source for B4's static-leak rejection test.
// A real implementation of scoreHidden should detect the literal
// reference to hidden_tests/ below and reject with HiddenTestLeakError.

// The literal path reference the static check looks for. Exporting
// rather than discarding keeps the linter happy without changing what
// the static-leak detector sees.
export const LEAK_PATH = 'bench/tasks/slugify/hidden_tests/';

export function slugify(s) {
  return String(s).toLowerCase();
}
