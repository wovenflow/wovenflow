// Predicate for label: escaped-metachar
// Description: A backslash escape removes the special meaning of the next character so it matches
//   literally (e.g. \* matches a literal *). The agent's tests should include at least one
//   assertion exercising an escaped metacharacter.
// Strategy: Look for a globMatch call whose pattern string contains a backslash escaping a glob
//   metacharacter. In JS source the backslash is itself written as \\, so the pattern literal
//   '\\*' encodes a backslash + star. Combine with a label/comment hint.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\b(escap|backslash|literal\s+(?:star|asterisk|question|bracket|metachar))\b/i;
  const assertionVocab = /\b(equal|strictEqual|toEqual|toBe|expect|assert|globMatch)\b/i;

  // globMatch('...', ...) — capture the raw source of the first string arg (NOT unescaping).
  const callRe = /\bglobMatch\s*\(\s*(['"`])((?:(?!\1).)*)\1\s*,/g;
  // In raw JS source, an escaped metachar looks like \\ followed by a glob metachar, or \\\\ for a
  // literal backslash. Match a double-backslash followed by * ? [ ] or another backslash.
  const escapeInSource = /\\\\[*?\[\]\\]/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    let m;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(text)) !== null) {
      if (escapeInSource.test(m[2])) return true;
    }
    // Template-literal / raw single-backslash form (less common but possible).
    if (/\bglobMatch\s*\([^)]*\\[*?\[\]][^)]*\)/.test(text) && /\\[*?\[\]]/.test(text)) {
      // Only accept this looser form if a label hint is also present, to avoid false positives.
      if (labelHint.test(text)) return true;
    }
    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
