// Predicate for label: mixed-case
// Description: The input contains both uppercase and lowercase letters. The
// agent's tests should include at least one assertion that exercises
// mixed-case input.
// Strategy: Look for a string literal that contains BOTH at least one
// uppercase ASCII letter and at least one lowercase ASCII letter, sitting
// in a test/assertion context. Plus label/comment heuristics.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Match each quoted literal and check both cases inside.
  const litRx = /(['"`])([^'"`\n]+)\1/g;

  // Label/comment regex
  const labelRx = /(mixed[\s_-]*case|upper[\s_-]*and[\s_-]*lower|case[\s_-]*insensitive|lowercas(e|ing)|uppercas(e|ing)|down(\s|-)?cas(e|ing))/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    let m;
    while ((m = litRx.exec(text)) !== null) {
      const inner = m[2];
      if (/[A-Z]/.test(inner) && /[a-z]/.test(inner)) {
        // Filter obvious non-input literals: skip identifier-like JS names,
        // file paths, URLs, import specifiers. We require some non-letter
        // content (a space, a digit, or punctuation) OR proximity to a
        // slug/assertion call.
        const start = Math.max(0, m.index - 200);
        const end = Math.min(text.length, m.index + m[0].length + 200);
        const window = text.slice(start, end);
        const looksLikeInput =
          /\s/.test(inner) ||
          /[^A-Za-z0-9]/.test(inner) ||
          /slug|slugify|toSlug|kebab|slugger/i.test(window);
        const inAssertCtx = /(slug|slugify|toSlug|kebab|slugger|expect|assert|toBe|toEqual|equal|is\s*\(|deepEqual|strictEqual)/i.test(window);
        if (looksLikeInput && inAssertCtx) return true;
      }
    }

    if (labelRx.test(text)) return true;
  }
  return false;
}
