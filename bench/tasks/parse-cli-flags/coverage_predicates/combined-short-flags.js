// Predicate for label: combined-short-flags
// Description: Combined short flags '-xyz' set each of x, y, z as boolean true.
// Strategy: Look for a quoted token starting with a single dash followed by 2+ letters (not '--'), combined with an assertion.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Quoted token: single '-' followed by two or more letters with nothing else (no '=' value).
  // This excludes '--word' (long flag) and single-letter '-x' (plain short flag).
  const combinedPattern = /(['"`])-[A-Za-z]{2,}\1/;
  const hasAssertion = /\b(expect|assert|toBe|toEqual|toStrictEqual|deepEqual|strictEqual|equal)\b/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (combinedPattern.test(text) && hasAssertion.test(text)) return true;
  }
  return false;
}
