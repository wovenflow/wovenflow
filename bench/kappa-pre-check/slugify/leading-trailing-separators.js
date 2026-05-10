// Predicate for label: leading-trailing-separators
// Description: The input begins or ends with characters that become hyphens.
// The agent's tests should include at least one assertion that exercises
// leading or trailing separator input.
// Strategy: Look for string literals whose first OR last non-quote character
// is whitespace or a known separator-becoming punctuation char, or a
// label/comment mentioning leading/trailing separator/space/whitespace/dash.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Match a quoted literal where the first or last inner char is whitespace
  // or punctuation-that-becomes-hyphen. Inner content must be non-empty and
  // contain at least one alpha/digit so we're not matching all-whitespace.
  // Group 2 = inner.
  const litRx = /(['"`])([^'"`\n]*[A-Za-z0-9][^'"`\n]*)\1/g;
  const sepCharClass = /[\s,!?@#%^&*()_+={}\[\]:;<>./\\|~\-]/;

  // Label/comment regex
  const labelRx = /(leading|trailing|both[\s-]*ends|surrounding|begins|ends?[\s_-]*with)\s*(separators?|spaces?|whitespace|hyphens?|dashes?|punctuation|delimiters?)?/i;
  const trimMention = /\btrim(med|ming)?\b/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    let m;
    while ((m = litRx.exec(text)) !== null) {
      const inner = m[2];
      if (!inner.length) continue;
      const first = inner[0];
      const last = inner[inner.length - 1];
      if (sepCharClass.test(first) || sepCharClass.test(last)) {
        const start = Math.max(0, m.index - 200);
        const end = Math.min(text.length, m.index + m[0].length + 200);
        const window = text.slice(start, end);
        if (/slug|slugify|toSlug|kebab|slugger|expect|assert|toBe|toEqual|equal|is\s*\(/i.test(window)) {
          return true;
        }
      }
    }

    if (labelRx.test(text)) return true;
    if (trimMention.test(text) && /slug|hyphen|dash|separator/i.test(text)) return true;
  }
  return false;
}
