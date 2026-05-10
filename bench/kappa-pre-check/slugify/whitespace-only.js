// Predicate for label: whitespace-only
// Description: The input contains only whitespace characters (spaces, tabs,
// etc.). The agent's tests should include at least one assertion that
// exercises whitespace-only input.
// Strategy: Find a call/assertion whose input is a string literal made up
// only of whitespace characters (spaces, tabs, newlines, escape sequences),
// or a test name/comment mentioning whitespace-only input.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Code-shape: literal containing only whitespace characters or whitespace
  // escape sequences (\s, \t, \n, \r,  , etc.) — at least one such char.
  // We require the literal to be non-empty and contain ONLY whitespace tokens.
  const wsLiteral = /(['"`])((?:\s|\\t|\\n|\\r|\\u00[aA]0|\\u0020|\\x20|\\x09)+)\1/;

  // Label/comment regex
  const labelRx = /(whitespace[\s_-]*only|only[\s_-]*whitespace|all[\s_-]*spaces|tab(?:s)?[\s_-]*only|spaces?[\s_-]*only)/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    // Look for a whitespace-only literal in proximity to a slug call/assertion.
    let m;
    const re = new RegExp(wsLiteral.source, 'g');
    while ((m = re.exec(text)) !== null) {
      // Skip empty literal (matched by 0+ — guarded by + above, so non-empty).
      // Confirm the literal sits in test context near a slug-related token or
      // an assertion keyword.
      const start = Math.max(0, m.index - 200);
      const end = Math.min(text.length, m.index + m[0].length + 200);
      const window = text.slice(start, end);
      if (/slug|slugify|toSlug|kebab|slugger/i.test(window)) return true;
      if (/(toBe|toEqual|toStrictEqual|deepEqual|strictEqual|assert|expect|equal|equals|is\s*\()/i.test(window)) return true;
    }
    if (labelRx.test(text)) return true;
  }
  return false;
}
