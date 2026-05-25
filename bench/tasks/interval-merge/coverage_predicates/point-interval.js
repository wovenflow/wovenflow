// Predicate for label: point-interval
// Description: Zero-length point intervals (e.g. [5,5]) are valid and follow the same merge rules.
//   The agent's tests should include at least one assertion exercising a point/zero-length
//   interval.
// Strategy: Look for an interval pair [n, n] where both endpoints are identical, OR a
//   label/comment hint about point/zero-length/degenerate intervals near an assertion.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\bpoint\s+interval|zero[\s_-]?length|degenerate|single\s+point|empty\s+interval\b/i;
  const assertionVocab = /\b(equal|deepEqual|deepStrictEqual|toEqual|toStrictEqual|expect|assert)\b/i;

  // A pair literal where start === end: [n, n].
  const pointRe = /\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    let pm;
    pointRe.lastIndex = 0;
    while ((pm = pointRe.exec(text)) !== null) {
      if (Number(pm[1]) === Number(pm[2])) return true;
    }

    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
