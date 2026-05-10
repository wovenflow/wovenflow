// Predicate for label: empty-input
// Description: Empty argv array returns an empty flags object and an empty positional array.
// Strategy: Look for an empty array literal '[]' passed in (as call argument) combined with an assertion in the same file.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Empty array passed as a function argument: '([])' or '([],' or '( [] )', possibly with whitespace.
  const emptyArrayArg = /\(\s*\[\s*\]\s*[\),]/;
  const hasAssertion = /\b(expect|assert|toBe|toEqual|toStrictEqual|deepEqual|strictEqual|equal)\b/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (emptyArrayArg.test(text) && hasAssertion.test(text)) return true;
  }
  return false;
}
