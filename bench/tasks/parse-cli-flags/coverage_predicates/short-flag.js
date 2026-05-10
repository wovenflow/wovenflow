// Predicate for label: short-flag
// Description: Short flags '-x value' parse with value as a string, or set the flag boolean if no value follows.
// Strategy: Look for a quoted single-letter '-x' token (not '--' long form, not multi-letter combined) plus an assertion.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Quoted token that is exactly '-x' where x is one letter — single-letter short flag.
  // The negative lookbehind/ahead avoids matching '--x' (long form) by requiring the dash is not preceded by another dash inside the quote.
  const shortFlagPattern = /(['"`])-[A-Za-z]\1/;
  const hasAssertion = /\b(expect|assert|toBe|toEqual|toStrictEqual|deepEqual|strictEqual|equal)\b/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (shortFlagPattern.test(text) && hasAssertion.test(text)) return true;
  }
  return false;
}
