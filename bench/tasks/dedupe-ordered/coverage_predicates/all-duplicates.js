// Predicate for label: all-duplicates
// Description: An array where every element is the same value collapses to a single-element array. The agent's tests should include at least one assertion exercising the all-same case.
// Strategy: Look for an array literal with the same value repeated (e.g. [1,1,1] or ['a','a','a']) plus an assertion comparing to a single-element array, and/or a test name mentioning "all duplicates" / "all same".
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasAssertion = /\b(expect|assert|deepEqual|deepStrictEqual|strictEqual|toEqual|toStrictEqual|toHaveLength|to\.eql|to\.deep\.equal)\b/.test(text);
    // Code-shape: input is a repeated value array. Look for [x, x, x] patterns.
    const repeatedArray = /\[\s*(\d+|['"][^'"]*['"]|true|false|null)\s*,\s*\1\s*(?:,\s*\1\s*)*\]/.test(text);
    const mentionsAllSame = /(all\s*(?:dup|same|duplicates|equal)|every\s*element\s*(?:is\s*)?(?:the\s*)?same|collapse[sd]?\s*to\s*(?:one|a\s*single)|single[-\s]element)/i.test(text);
    if (hasAssertion && (repeatedArray || mentionsAllSame)) {
      // Require at least one of the two strong signals plus mention or test-name keyword.
      if (mentionsAllSame || /\b(it|test|describe)\s*\(\s*['"`][^'"`]*(all\s*dup|same|duplicate)[^'"`]*['"`]/i.test(text)) return true;
      if (repeatedArray && /\.length\s*===?\s*1\b|toHaveLength\(\s*1\s*\)/.test(text)) return true;
    }
  }
  return false;
}
