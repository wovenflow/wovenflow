// Predicate for label: primitive-equal
// Description: Two equal primitive values (e.g. 1 and 1, 'foo' and 'foo', true and true) compare as equal. The agent's tests should include at least one assertion exercising primitive equality.
// Strategy: Look for a deepEqual-style call where both arguments are equal primitive literals (number, string, boolean) AND an explicit truthy/equal expectation, OR a comment/label that mentions primitive equality near such a call.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // A primitive literal: number, single/double/back-tick string, true/false
  const PRIM = String.raw`(?:-?\d+(?:\.\d+)?|'[^'\n]*'|"[^"\n]*"|\`[^\`\n]*\`|true|false)`;

  // deepEqual-style call: identifier ending in equal/Equal/equals/Equals followed by `(prim, sameOrPrim,...)`
  const callRe = new RegExp(
    String.raw`\b\w*[Ee]quals?\s*\(\s*(${PRIM})\s*,\s*(${PRIM})\b`,
    'g'
  );

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // 1) Direct: a deepEqual(1, 1) with two equal primitive literals.
    let m;
    const re = new RegExp(callRe.source, 'g');
    while ((m = re.exec(text)) !== null) {
      const a = m[1];
      const b = m[2];
      if (a === b) {
        // Must look like a positive equality assertion (not asserting !== / not equal).
        // Check the 200 chars before for "not"/"!"/"false" right before the call.
        const before = text.slice(Math.max(0, m.index - 60), m.index);
        if (/\b(not|notDeepEqual|isNot|isFalse|toBeFalsy|toEqual\s*\(\s*false)\b/.test(before)) continue;
        return true;
      }
    }

    // 2) Label/comment fallback: a comment/string mentioning primitive equality with a deepEqual call nearby.
    if (/primitive[-_ ]?equal/i.test(text) && /\b\w*[Ee]quals?\s*\(/.test(text)) {
      return true;
    }
  }
  return false;
}
