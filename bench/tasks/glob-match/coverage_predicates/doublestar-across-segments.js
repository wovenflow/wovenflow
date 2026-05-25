// Predicate for label: doublestar-across-segments
// Description: A double star ** matches zero or more characters including /, crossing segment
//   boundaries. The agent's tests should include at least one assertion exercising ** spanning
//   multiple segments.
// Strategy: Look for a globMatch call whose pattern contains a literal ** (two consecutive stars).
//   Combine with a label/comment hint.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\b(double[\s_-]?star|globstar|cross(?:es|ing)?\s+(?:a\s+)?(?:slash|segment)|across\s+segment)\b/i;
  const assertionVocab = /\b(equal|strictEqual|toEqual|toBe|expect|assert|globMatch)\b/i;

  const callRe = /\bglobMatch\s*\(\s*(['"`])((?:(?!\1).)*)\1\s*,/g;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    let m;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(text)) !== null) {
      const unescaped = m[2].replace(/\\./g, '');
      if (/\*\*/.test(unescaped)) return true;
    }
    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
