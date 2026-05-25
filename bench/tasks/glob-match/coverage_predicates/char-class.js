// Predicate for label: char-class
// Description: A bracket class [abc] matches exactly one of the listed characters and never a /.
//   The agent's tests should include at least one assertion exercising a character class.
// Strategy: Look for a globMatch call whose pattern contains a bracket class [...] that is NOT a
//   range and NOT negated (a plain enumerated set of characters). Combine with a label/comment
//   hint. Negated and range classes have their own labels.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const labelHint = /\b(char(?:acter)?[\s_-]?class|bracket(?:\s+expression)?|\[abc\]|enumerated\s+set)\b/i;
  const assertionVocab = /\b(equal|strictEqual|toEqual|toBe|expect|assert|globMatch)\b/i;

  const callRe = /\bglobMatch\s*\(\s*(['"`])((?:(?!\1).)*)\1\s*,/g;
  // A bracket class: [ , optional ! , some non-]/ content, ] . We accept any class here (this
  // label is the umbrella "agent used a class at all"); range/negation are additionally tracked
  // by their own predicates.
  const anyClass = /\[!?[^\]/]+\]/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    let m;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(text)) !== null) {
      const unescaped = m[2].replace(/\\./g, '');
      if (anyClass.test(unescaped)) return true;
    }
    if (labelHint.test(text) && assertionVocab.test(text)) return true;
  }
  return false;
}
