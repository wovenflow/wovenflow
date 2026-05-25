// Predicate for label: negated-class
// Description: A class beginning with ! ([!abc]) matches any single non-/ character not in the
//   set. The agent's tests should include at least one assertion exercising a negated class.
// Strategy: Look for a globMatch call whose pattern contains a bracket class starting with ! (or
//   the POSIX ^ negation form). Combine with a label/comment hint.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\b(negat|\[!|\[\^|complement|not\s+in\s+(?:the\s+)?(?:set|class)|excluded)\b/i;
  const assertionVocab = /\b(equal|strictEqual|toEqual|toBe|expect|assert|globMatch)\b/i;

  const callRe = /\bglobMatch\s*\(\s*(['"`])((?:(?!\1).)*)\1\s*,/g;
  // A negated class: [ immediately followed by ! (or ^).
  const negClass = /\[[!^][^\]/]*\]/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    let m;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(text)) !== null) {
      const unescaped = m[2].replace(/\\./g, '');
      if (negClass.test(unescaped)) return true;
    }
    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
