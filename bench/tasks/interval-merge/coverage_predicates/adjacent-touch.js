// Predicate for label: adjacent-touch
// Description: Two intervals that touch exactly (one ends where the next begins, e.g. [1,2] and
//   [2,3]) are merged into [1,3]. The agent's tests should include at least one assertion
//   exercising the adjacency/touching merge rule.
// Strategy: Look for two interval pairs inside a mergeIntervals call where the end of one equals
//   the start of the next (a touching pair), OR a label/comment hint about adjacency/touching near
//   an assertion.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\badjacen|touch|abut|contiguous|back[\s_-]?to[\s_-]?back\b/i;
  const assertionVocab = /\b(equal|deepEqual|deepStrictEqual|toEqual|toStrictEqual|expect|assert)\b/i;

  // Two consecutive pairs [a, X] , [X, d] where the shared boundary X is identical.
  const num = /(-?\d+(?:\.\d+)?)/.source;
  const touchingPair = new RegExp(
    `\\[\\s*${num}\\s*,\\s*${num}\\s*\\]\\s*,\\s*\\[\\s*${num}\\s*,\\s*${num}\\s*\\]`,
    'g'
  );

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // Code-shape: any two adjacent pairs where end1 === start2.
    let m;
    touchingPair.lastIndex = 0;
    while ((m = touchingPair.exec(text)) !== null) {
      const end1 = m[2];
      const start2 = m[3];
      if (Number(end1) === Number(start2)) return true;
    }

    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
