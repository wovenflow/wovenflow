// Predicate for label: unsorted-input
// Description: Input intervals may be given out of order; the output is always sorted ascending by
//   start. The agent's tests should include at least one assertion where the input is not
//   pre-sorted.
// Strategy: Look for a mergeIntervals call where the input pairs are NOT in ascending order of
//   start (the first pair's start is greater than a later pair's start), OR a label/comment hint
//   about sorting/ordering/unsorted near an assertion.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\bunsorted|out\s+of\s+order|sorted|sort\s+by\s+start|ordering|reorder\b/i;
  const assertionVocab = /\b(equal|deepEqual|deepStrictEqual|toEqual|toStrictEqual|expect|assert)\b/i;

  // Extract the array literal that is the first arg of a mergeIntervals call, collect pair starts,
  // and check whether any start is followed later by a smaller start (i.e. not ascending).
  const callRe = /mergeIntervals\s*\(\s*\[/g;
  const pairRe = /\[\s*(-?\d+(?:\.\d+)?)\s*,\s*-?\d+(?:\.\d+)?\s*\]/g;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    let cm;
    callRe.lastIndex = 0;
    while ((cm = callRe.exec(text)) !== null) {
      // Find the matching close bracket for the outer input array literal.
      let i = cm.index + cm[0].length - 1; // index of the '[' we matched
      let depth = 0, end = -1;
      for (let j = i; j < text.length; j++) {
        const c = text[j];
        if (c === '[') depth++;
        else if (c === ']') {
          depth--;
          if (depth === 0) { end = j; break; }
        }
      }
      if (end === -1) continue;
      const arr = text.slice(i, end + 1);
      const starts = [];
      let pm;
      pairRe.lastIndex = 0;
      while ((pm = pairRe.exec(arr)) !== null) starts.push(Number(pm[1]));
      for (let a = 0; a < starts.length - 1; a++) {
        for (let b = a + 1; b < starts.length; b++) {
          if (starts[a] > starts[b]) return true; // not ascending => unsorted input exercised
        }
      }
    }

    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
