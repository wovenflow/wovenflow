// Predicate for label: question-single-char
// Description: A ? matches exactly one character that is not a /. The agent's tests should include
//   at least one assertion exercising ?.
// Strategy: Look for a globMatch call whose pattern contains an unescaped ?. Combine with a
//   label/comment hint.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\b(question\s*mark|single[\s_-]?char|exactly\s+one\s+char|\bany\s+one\s+char)\b/i;
  const assertionVocab = /\b(equal|strictEqual|toEqual|toBe|expect|assert|globMatch)\b/i;

  const callRe = /\bglobMatch\s*\(\s*(['"`])((?:(?!\1).)*)\1\s*,/g;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    let m;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(text)) !== null) {
      const unescaped = m[2].replace(/\\./g, '');
      if (/\?/.test(unescaped)) return true;
    }
    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
