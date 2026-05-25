// Predicate for label: non-overlapping
// Description: Disjoint, non-touching intervals remain separate in the output. The agent's tests
//   should include at least one assertion where the input intervals do not overlap and the output
//   keeps them separate.
// Strategy: A label/comment hint about disjoint/separate/non-overlapping intervals near an
//   assertion, OR an expected output that contains two or more pairs (so the result was NOT fully
//   merged to one interval).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\bnon[\s_-]?overlap|disjoint|separate|stay\s+separate|do(?:es)?\s+not\s+overlap|no\s+overlap\b/i;
  const assertionVocab = /\b(equal|deepEqual|deepStrictEqual|toEqual|toStrictEqual|expect|assert)\b/i;

  // An expected multi-pair output: an array literal containing two or more [a,b] pairs.
  const pair = /\[\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\]/.source;
  const multiPairOutput = new RegExp(`\\[\\s*${pair}\\s*,\\s*${pair}`);

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (labelHint.test(text) && assertionVocab.test(text)) return true;
    // An expected result keeping >=2 intervals is strong evidence of a non-merge case.
    if (multiPairOutput.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
