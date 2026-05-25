// Predicate for label: overlapping
// Description: Two or more overlapping intervals are merged into one spanning their combined range.
//   The agent's tests should include at least one assertion exercising overlap merging.
// Strategy: Look for a label/comment hint about overlapping/merging near an assertion, OR an
//   assertion whose expected output is a single [a,b] pair produced from a multi-pair input
//   (a merge happened).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\boverlap|merg(e|ed|ing|es)\b/i;
  const assertionVocab = /\b(equal|deepEqual|deepStrictEqual|toEqual|toStrictEqual|expect|assert)\b/i;

  const pair = /\[\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\]/.source;
  // mergeIntervals( [ [a,b] , [c,d] ... ] ) — call with >=2 input pairs (a merge candidate).
  const multiPairCall = new RegExp(`mergeIntervals\\s*\\(\\s*\\[\\s*${pair}\\s*,\\s*${pair}`);

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (labelHint.test(text) && assertionVocab.test(text) && multiPairCall.test(text)) return true;
  }
  return false;
}
