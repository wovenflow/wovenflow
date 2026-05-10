// Predicate for label: punctuation
// Description: The input contains common punctuation (commas, exclamation
// marks, ampersands, etc.). The agent's tests should include at least one
// assertion that exercises punctuated input.
// Strategy: Look for string literals containing alphanumeric characters AND
// at least one common punctuation character (,.!?&;:'"@#$%*()[]{}<>/\|+=).
// Combine with label/comment mentions of "punctuation", "special chars",
// "comma", "exclamation", "ampersand", "symbols", etc.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  let files;
  try {
    files = fs.readdirSync(testsDir).filter(f =>
      f.endsWith('.js') || f.endsWith('.ts') ||
      f.endsWith('.mjs') || f.endsWith('.cjs')
    );
  } catch {
    return false;
  }

  const stringLiteralRe = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  // "Common punctuation" — explicitly excludes hyphen/space/tab so we don't
  // overlap too much with the separator labels, but ampersand/comma/exclam
  // are central examples in the description.
  const punctRe = /[!@#$%^&*()_+=\[\]{}|\\:;"'<>,.?/~]/;
  const alnumRe = /[A-Za-z0-9]/;

  const labelRe = /\b(punctuation|punctuated|special\s+(?:chars?|characters?|symbols?)|symbols?|comma|exclamation|ampersand|question\s+mark|period|colon|semicolon|apostrophe|quote|bracket|paren(?:thes[ie]s)?|slash|backslash|pipe|asterisk|hash(?:tag)?|at[-\s]?sign|dollar|percent|caret|tilde|underscore|plus|equals?)\b/i;

  for (const f of files) {
    let text;
    try { text = fs.readFileSync(path.join(testsDir, f), 'utf8'); }
    catch { continue; }

    let hasShape = false;
    stringLiteralRe.lastIndex = 0;
    let m;
    while ((m = stringLiteralRe.exec(text)) !== null) {
      const inner = m[2];
      if (!inner) continue;
      if (inner.length > 500) continue;
      if (alnumRe.test(inner) && punctRe.test(inner)) {
        hasShape = true;
        break;
      }
    }

    const mentions = labelRe.test(text);

    if (hasShape && mentions) return true;
    // Shape alone is acceptable: a test fixture with alnum + punctuation is
    // very likely exercising punctuation handling.
    if (hasShape) return true;
  }
  return false;
}
