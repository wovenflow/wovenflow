// Predicate for label: ordered-and-unordered-adds
// Description: Adds may arrive in any timestamp order; sum still returns the correct windowed total.
// Strategy: Combo — comment/label mentioning "out of order", "unordered", "non-monotonic",
// "any order", "shuffled", or "reversed", paired with multiple add() calls and a sum() assertion.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /out[\s_-]*of[\s_-]*order|unordered|non[\s_-]*monotonic|not[\s_-]*monotonic|any[\s_-]*order|shuffled|reversed[\s_-]*order|reverse[\s_-]*order|arbitrary[\s_-]*order|backwards|out-of-order|nonmonotonic/i;
  const addRe = /\badd\s*\(/g;
  const sumRe = /\bsum\s*\(/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasLabel = labelRe.test(text);
    const adds = (text.match(addRe) || []).length;
    const hasSum = sumRe.test(text);
    if (hasLabel && hasSum && adds >= 2) return true;
  }
  return false;
}
