// Predicate for label: star-within-segment
// Description: A single * matches within one segment but never matches a /. The agent's tests
//   should include at least one assertion showing * matching within a segment AND at least one
//   showing it does not cross a slash.
// Strategy: Look for a globMatch call whose pattern contains a single * that is NOT part of a **
//   (i.e. a lone star within a segment). Combine with a label/comment hint.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\b(single\s+star|star\s+within|within\s+(?:a\s+)?segment|does\s+not\s+cross|wildcard)\b/i;
  const assertionVocab = /\b(equal|strictEqual|toEqual|toBe|expect|assert|globMatch)\b/i;

  // globMatch('<pattern>', ...) capturing the pattern string.
  const callRe = /\bglobMatch\s*\(\s*(['"`])((?:(?!\1).)*)\1\s*,/g;
  // A lone star: a * not adjacent to another * on either side.
  const loneStar = /(?<!\*)\*(?!\*)/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    let m;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(text)) !== null) {
      const pat = m[2];
      // strip escaped stars so \* doesn't count as a glob star
      const unescaped = pat.replace(/\\./g, '');
      if (loneStar.test(unescaped)) return true;
    }
    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
