// Predicate for label: empty
// Description: An empty input array returns an empty array. The agent's tests should include at
//   least one assertion exercising empty input.
// Strategy: Look for the function being called with an empty array literal as the (sole or first)
//   argument, near an assertion. Combine with a label/comment hint for robustness.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // mergeIntervals([]) — empty array literal as first arg (optionally followed by a second arg).
  const callEmpty = /\bmergeIntervals\s*\(\s*\[\s*\]\s*[,)]/;

  // Label/comment hint
  const labelHint = /\bempty\b/i;

  // Generic assertion vocabulary nearby.
  const assertionVocab = /\b(equal|deepEqual|deepStrictEqual|toEqual|toStrictEqual|strictEqual|expect|assert|toHaveLength|length)\b/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (callEmpty.test(text)) return true;
    if (labelHint.test(text) && assertionVocab.test(text) && /\[\s*\]/.test(text)) return true;
  }
  return false;
}
