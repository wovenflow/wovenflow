// Predicate for label: char-class-range
// Description: A range class like [a-z] matches any single character within the range. The agent's
//   tests should include at least one assertion exercising a range.
// Strategy: Look for a globMatch call whose pattern contains a bracket class with a range (X-Y
//   inside [...]). Combine with a label/comment hint.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\b(range|\[a-z\]|\[0-9\]|character\s+range|lo(?:wer)?\s+through\s+hi)\b/i;
  const assertionVocab = /\b(equal|strictEqual|toEqual|toBe|expect|assert|globMatch)\b/i;

  const callRe = /\bglobMatch\s*\(\s*(['"`])((?:(?!\1).)*)\1\s*,/g;
  // A class containing a range: [ ... X-Y ... ] where X-Y is a single-char range.
  const rangeClass = /\[!?[^\]/]*[^\]/-]-[^\]/-][^\]/]*\]/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    let m;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(text)) !== null) {
      const unescaped = m[2].replace(/\\./g, '');
      if (rangeClass.test(unescaped)) return true;
    }
    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
