// Predicate for label: all-expired
// Description: When every recorded value is older than ttlMs, sum returns 0.
// Strategy: Combo — comment/label mentioning "all expired" / "every value expired" /
// "everything expired", combined with a sum(...) == 0 assertion.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /all[\s_-]*expired|every[\s_-]*(value|entry)[\s_-]*expired|everything[\s_-]*expired|all[\s_-]*older[\s_-]*than|fully[\s_-]*expired/i;
  const sumZeroRe = /\bsum\s*\([^)]*\)[^;\n]*(?:===|==|toBe|toEqual|equal|equals|strictEqual)[^;\n]*\b0\b/;
  const sumZeroAlt = /(?:assert(?:Equals|Equal|Strict(?:Equal)?|Is)?|expect|equal|equals|strictEqual|deepEqual|toBe|toEqual)[^;\n]*\bsum\s*\([^)]*\)[^;\n]*\b0\b/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasLabel = labelRe.test(text);
    const hasSumZero = sumZeroRe.test(text) || sumZeroAlt.test(text);
    if (hasLabel && hasSumZero) return true;
  }
  return false;
}
