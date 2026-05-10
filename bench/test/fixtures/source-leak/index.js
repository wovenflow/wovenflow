// Deliberately leaky source for B4's static-leak rejection test.
// The string "hidden_tests/" below is what triggers the static-check
// branch of scoreHidden — a real implementation should detect this and
// reject with HiddenTestLeakError.
import fs from 'node:fs';

export function slugify(s) {
  // Leaks: references the hidden_tests/ directory by literal path.
  const _hint = fs.readdirSync('bench/tasks/slugify/hidden_tests/');
  return String(s).toLowerCase();
}
