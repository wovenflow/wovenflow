// Predicate for label: object-reference-equality
// Description: Two different object literals with the same shape are NOT considered duplicates. The agent's tests should include at least one assertion exercising object-reference-equality.
// Strategy: Look for a test that constructs two object literals (same or similar shape) inside an input array and asserts the output contains both — paired with a comment/test name about reference equality, identity, or "different objects".
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasAssertion = /\b(expect|assert|deepEqual|deepStrictEqual|strictEqual|toEqual|toStrictEqual|toHaveLength|to\.eql|to\.deep\.equal)\b/.test(text);
    // Code-shape: two object literals appearing inside an array, e.g. [{a:1},{a:1}] or [{...}, {...}].
    const twoObjectLiteralsInArray = /\[\s*\{[^{}]*\}\s*,\s*\{[^{}]*\}/.test(text);
    const mentionsRefEquality = /(reference\s*equal|object\s*identity|by\s*reference|same\s*shape|different\s*objects?|distinct\s*objects?|object\s*literal|not\s*(?:considered\s*)?duplicates?|deep\s*equal\s*(?:but|yet)\s*not)/i.test(text);
    if (hasAssertion && twoObjectLiteralsInArray) {
      if (mentionsRefEquality) return true;
      if (/\b(it|test|describe)\s*\(\s*['"`][^'"`]*(reference|identity|object|shape|distinct)[^'"`]*['"`]/i.test(text)) return true;
    }
  }
  return false;
}
