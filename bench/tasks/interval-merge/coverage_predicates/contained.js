// Predicate for label: contained
// Description: An interval fully contained within another is absorbed (e.g. [1,10] and [3,4] ->
//   [1,10]). The agent's tests should include at least one assertion exercising full containment.
// Strategy: Look for a mergeIntervals call where one input pair is strictly contained within
//   another (outer.start <= inner.start and inner.end <= outer.end, and they are not identical),
//   OR a label/comment hint about containment/absorb/nested near an assertion.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\bcontain|absorb|nested|engulf|subsumed|swallow|inside\b/i;
  const assertionVocab = /\b(equal|deepEqual|deepStrictEqual|toEqual|toStrictEqual|expect|assert)\b/i;

  const callRe = /mergeIntervals\s*\(\s*\[/g;
  const pairRe = /\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    let cm;
    callRe.lastIndex = 0;
    while ((cm = callRe.exec(text)) !== null) {
      let i = cm.index + cm[0].length - 1;
      let depth = 0, end = -1;
      for (let j = i; j < text.length; j++) {
        const c = text[j];
        if (c === '[') depth++;
        else if (c === ']') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end === -1) continue;
      const arr = text.slice(i, end + 1);
      const pairs = [];
      let pm;
      pairRe.lastIndex = 0;
      while ((pm = pairRe.exec(arr)) !== null) pairs.push([Number(pm[1]), Number(pm[2])]);
      for (let a = 0; a < pairs.length; a++) {
        for (let b = 0; b < pairs.length; b++) {
          if (a === b) continue;
          const [os, oe] = pairs[a];
          const [is, ie] = pairs[b];
          // b strictly contained in a (and not identical)
          if (os <= is && ie <= oe && !(os === is && oe === ie)) return true;
        }
      }
    }

    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
