// Predicate for label: empty-window
// Description: A new window with no values added returns sum 0 for any sum() query.
// Strategy: Look for an assertion that sum() equals 0 with no preceding add() calls,
// or a label/comment mention of "empty" combined with an equality-to-0 assertion.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /empty[\s_-]*window|empty\b|no[\s_-]+(values|adds|entries)|new\s+window/i;
  // Assertion shapes: assertEquals/equals/toBe/toEqual/strictEqual/is etc., comparing sum(...) to 0
  const sumZeroRe = /(?:assert(?:Equals|Equal|Strict(?:Equal)?|Is)?|expect|equal|equals|strictEqual|deepEqual|toBe|toEqual|is|===|==)[^;\n]*\bsum\s*\([^)]*\)[^;\n]*\b0\b/;
  const sumZeroAlt = /\bsum\s*\([^)]*\)[^;\n]*(?:===|==|toBe|toEqual|equal|equals|strictEqual)[^;\n]*\b0\b/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasLabel = labelRe.test(text);
    const hasSumZero = sumZeroRe.test(text) || sumZeroAlt.test(text);
    if (hasLabel && hasSumZero) return true;
  }
  return false;
}
