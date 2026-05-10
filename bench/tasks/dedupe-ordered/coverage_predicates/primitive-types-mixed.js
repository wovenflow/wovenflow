// Predicate for label: primitive-types-mixed
// Description: Different primitive types are deduplicated independently (1 and '1' are different, true and 1 are different). The agent's tests should include at least one assertion exercising mixed-primitive-types behavior.
// Strategy: Look for a test that mixes a number with the same-looking string (e.g. 1 and '1') OR a boolean with a number (true and 1) in the same input array, with an assertion that they remain distinct.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasAssertion = /\b(expect|assert|deepEqual|deepStrictEqual|strictEqual|toEqual|toStrictEqual|to\.eql|to\.deep\.equal)\b/.test(text);
    // Code-shape: an array containing both a number literal and a stringified version of the same digit.
    const numberAndString = /\[[^\]]*\b1\b[^\]]*['"]1['"][^\]]*\]/.test(text)
      || /\[[^\]]*['"]1['"][^\]]*\b1\b[^\]]*\]/.test(text);
    // Code-shape: an array containing both a boolean and a number 1/0.
    const boolAndNumber = /\[[^\]]*\btrue\b[^\]]*\b1\b[^\]]*\]/.test(text)
      || /\[[^\]]*\b1\b[^\]]*\btrue\b[^\]]*\]/.test(text)
      || /\[[^\]]*\bfalse\b[^\]]*\b0\b[^\]]*\]/.test(text)
      || /\[[^\]]*\b0\b[^\]]*\bfalse\b[^\]]*\]/.test(text);
    const mentionsMixed = /(mixed[\s-]*(?:primitive|type)|different\s*(?:primitive|type)s?|type\s*coercion|loose\s*equal|strict\s*equal|primitive\s*types|independently)/i.test(text);
    if (hasAssertion && (numberAndString || boolAndNumber)) {
      if (mentionsMixed || /\b(it|test|describe)\s*\(\s*['"`][^'"`]*(mixed|primitive|type|coercion)[^'"`]*['"`]/i.test(text)) return true;
      // Strong code shape alone is enough since matching both 1 and '1' in the same array literal is intentional.
      if (numberAndString) return true;
    }
  }
  return false;
}
