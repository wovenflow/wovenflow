// Predicate for label: punctuation
// Description: The input contains common punctuation (commas, exclamation
// marks, ampersands, etc.). The agent's tests should include at least one
// assertion that exercises punctuated input.
// Strategy: Find a string literal that contains at least one common
// punctuation character (, ! ? & : ; . ' " @ # % * etc.) sitting in a
// test/assertion context — and not just a structural character of the test
// itself. Also accept label/comment hints.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Quoted literals (excluding obvious structural backtick template strings
  // is handled by also accepting backtick).
  const litRx = /(['"`])([^'"`\n]+)\1/g;
  // Common punctuation chars that aren't whitespace or hyphen alone.
  const punctRx = /[,!?&:;.@#%*+="'<>/\\|~()$\[\]{}]/;

  // Label/comment regex
  const labelRx = /(punctuation|comma|exclamation|ampersand|question[\s_-]*mark|special[\s_-]*char|symbols?)/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    let m;
    while ((m = litRx.exec(text)) !== null) {
      const inner = m[2];
      if (!punctRx.test(inner)) continue;
      // Require at least one alpha character so we're not matching e.g. ":::".
      if (!/[A-Za-z]/.test(inner)) continue;
      const start = Math.max(0, m.index - 200);
      const end = Math.min(text.length, m.index + m[0].length + 200);
      const window = text.slice(start, end);
      if (/slug|slugify|toSlug|kebab|slugger/i.test(window) ||
          /(toBe|toEqual|toStrictEqual|deepEqual|strictEqual|assert|expect|equal|is\s*\()/i.test(window)) {
        return true;
      }
    }

    if (labelRx.test(text)) return true;
  }
  return false;
}
