// Predicate for label: exact-literal
// Description: A pattern with no metacharacters matches only an identical path; the match is
//   anchored. The agent's tests should include at least one assertion exercising a literal
//   pattern, ideally including a non-match.
// Strategy: Look for a globMatch call whose pattern argument is a quoted string containing NO glob
//   metacharacters (* ? [ ] \). Such a literal-only pattern is the signature of this label.
//   Combine with a label/comment hint for robustness.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\b(exact|literal|anchored|no\s+metachar|plain\s+pattern)\b/i;
  const assertionVocab = /\b(equal|deepEqual|strictEqual|toEqual|toBe|expect|assert|globMatch)\b/i;

  // globMatch('<literal>', ...) where <literal> has no glob metachars.
  const literalCall = /\bglobMatch\s*\(\s*(['"`])((?:(?!\1)[^*?\[\]\\])*)\1\s*,/g;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    let m;
    literalCall.lastIndex = 0;
    while ((m = literalCall.exec(text)) !== null) {
      // Require a non-empty literal pattern (the empty string is a degenerate case).
      if (m[2].length > 0) return true;
    }
    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
