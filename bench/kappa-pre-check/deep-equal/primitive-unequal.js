// Predicate for label: primitive-unequal
// Description: Two unequal primitive values compare as not equal. The agent's tests should include at least one assertion exercising primitive inequality.
// Strategy: Look for a notDeepEqual-style call OR a deepEqual call whose result is asserted false, where both arguments are primitive literals that differ.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const PRIM = String.raw`(?:-?\d+(?:\.\d+)?|'[^'\n]*'|"[^"\n]*"|\`[^\`\n]*\`|true|false)`;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // 1) notDeepEqual / notEqual / isNot... / .not.toEqual / assert.notDeepEqual with two distinct primitive literals
    const notRe = new RegExp(
      String.raw`(?:notDeepEqual|notEqual|isNotEqual|isNot|\.not\.(?:toEqual|toBe|toStrictEqual|toDeepEqual)|notDeepStrictEqual)\s*\(\s*(${PRIM})\s*,\s*(${PRIM})\b`,
      'g'
    );
    let m;
    while ((m = notRe.exec(text)) !== null) {
      if (m[1] !== m[2]) return true;
    }

    // 2) deepEqual(prim1, prim2) where they differ AND result asserted false / toEqual(false) / toBe(false)
    const deepRe = new RegExp(
      String.raw`\b\w*[Dd]eep[Ee]quals?\s*\(\s*(${PRIM})\s*,\s*(${PRIM})\s*\)`,
      'g'
    );
    while ((m = deepRe.exec(text)) !== null) {
      if (m[1] === m[2]) continue;
      // Check ~80 chars after for `, false)` / `).toBe(false)` / `).toEqual(false)` / `isFalse`
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 120);
      const before = text.slice(Math.max(0, m.index - 80), m.index);
      if (/,\s*false\b/.test(after) ||
          /\.toBe\s*\(\s*false\b/.test(after) ||
          /\.toEqual\s*\(\s*false\b/.test(after) ||
          /isFalse|toBeFalsy/.test(after) ||
          /\b(isFalse|assertFalse|expectFalse)\s*\(/.test(before)) {
        return true;
      }
    }

    // 3) Label/comment fallback
    if (/primitive[-_ ]?unequal|not[-_ ]?equal.*primitive/i.test(text)) {
      if (/\b\w*[Ee]quals?\s*\(/.test(text)) return true;
    }
  }
  return false;
}
