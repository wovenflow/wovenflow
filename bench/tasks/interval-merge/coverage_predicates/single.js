// Predicate for label: single
// Description: A single interval is returned unchanged (in a new array). The agent's tests should
//   include at least one assertion exercising the single-interval case.
// Strategy: Look for mergeIntervals called with an array containing exactly one [start,end] pair.
//   Combine with a label/comment hint for robustness.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // mergeIntervals([[a, b]]) — outer array with exactly one inner pair (no comma between pairs).
  const callSingle = /\bmergeIntervals\s*\(\s*\[\s*\[\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\]\s*\]\s*[,)]/;

  const labelHint = /\bsingle\b|\bone\s+interval\b|\bsingleton\b/i;
  const assertionVocab = /\b(equal|deepEqual|deepStrictEqual|toEqual|toStrictEqual|expect|assert)\b/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (callSingle.test(text)) return true;
    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
