// Predicate for label: empty-input
// Description: An empty array returns an empty array. The agent's tests should include at least one assertion exercising empty input.
// Strategy: Look for a test that passes an empty array literal `[]` to the function under test, paired with an assertion.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    // Look for an empty array literal anywhere in the test file paired with
    // an assertion-style call (expect/assert/toEqual/deepEqual/strictEqual/etc).
    const hasEmptyArray = /\[\s*\]/.test(text);
    const hasAssertion = /\b(expect|assert|deepEqual|deepStrictEqual|strictEqual|toEqual|toStrictEqual|toHaveLength|to\.eql|to\.deep\.equal)\b/.test(text);
    // Also accept commentary that explicitly mentions empty input near the assertion.
    const mentionsEmpty = /empty/i.test(text);
    if (hasEmptyArray && hasAssertion && mentionsEmpty) return true;
    // Fallback: a test name / describe / it that mentions "empty" with an empty literal.
    if (hasEmptyArray && /\b(it|test|describe)\s*\(\s*['"`][^'"`]*empty[^'"`]*['"`]/i.test(text)) return true;
  }
  return false;
}
