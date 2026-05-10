// Predicate for label: no-duplicates
// Description: An array with no duplicates returns a copy with the same elements in the same order. The agent's tests should include at least one assertion exercising the no-duplicates case.
// Strategy: Look for a test naming/commenting "no duplicates" or "unique"/"already unique", with an array of distinct values and an equality assertion that compares to the same array.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const mentionsNoDup = /(no\s*[-_ ]?dup|already\s*unique|distinct|unique\s*(input|elements|array)|all\s*unique)/i.test(text);
    const hasAssertion = /\b(expect|assert|deepEqual|deepStrictEqual|strictEqual|toEqual|toStrictEqual|to\.eql|to\.deep\.equal)\b/.test(text);
    // A code-shape signal: assertion comparing two arrays of length >= 2 of distinct primitives.
    const distinctArray = /\[\s*(?:1\s*,\s*2\s*,\s*3|['"]a['"]\s*,\s*['"]b['"]\s*,\s*['"]c['"])/i.test(text);
    if (mentionsNoDup && hasAssertion) return true;
    if (distinctArray && hasAssertion && /\b(it|test|describe)\s*\(\s*['"`][^'"`]*(unique|no\s*dup|distinct)[^'"`]*['"`]/i.test(text)) return true;
  }
  return false;
}
