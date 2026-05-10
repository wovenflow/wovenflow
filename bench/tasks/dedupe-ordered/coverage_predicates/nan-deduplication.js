// Predicate for label: nan-deduplication
// Description: Multiple NaN entries collapse to one (NaN treated as equal to NaN for dedupe purposes). The agent's tests should include at least one assertion exercising NaN handling.
// Strategy: Look for the literal `NaN` (or Number.NaN) appearing in a test, paired with an assertion. Optionally check for multiple NaN entries in the same array literal or test name mentioning NaN.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasNaN = /\bNaN\b|\bNumber\.NaN\b/.test(text);
    const hasAssertion = /\b(expect|assert|deepEqual|deepStrictEqual|strictEqual|toEqual|toStrictEqual|toHaveLength|to\.eql|to\.deep\.equal)\b/.test(text);
    // Code-shape: array literal containing NaN at least twice.
    const multipleNaNInArray = /\[[^\]]*\bNaN\b[^\]]*\bNaN\b[^\]]*\]/.test(text);
    const mentionsNaN = /\b(it|test|describe)\s*\(\s*['"`][^'"`]*nan[^'"`]*['"`]/i.test(text)
      || /\/\/[^\n]*\bNaN\b/i.test(text)
      || /\/\*[\s\S]*?\bNaN\b[\s\S]*?\*\//i.test(text);
    if (hasNaN && hasAssertion && (multipleNaNInArray || mentionsNaN)) return true;
  }
  return false;
}
