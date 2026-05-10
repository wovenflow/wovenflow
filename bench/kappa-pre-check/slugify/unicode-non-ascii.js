// Predicate for label: unicode-non-ascii
// Description: The input contains characters outside the ASCII letter/digit
// range (accented letters, CJK, emoji). The agent's tests should include at
// least one assertion that exercises non-ASCII input.
// Strategy: Find a string literal that contains a non-ASCII codepoint
// directly OR an escaped unicode codepoint (\uXXXX or \u{...}) outside the
// ASCII printable range, sitting in test/assertion context. Plus label hints.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Quoted literal
  const litRx = /(['"`])((?:[^'"`\\\n]|\\.|\\u\{[0-9a-fA-F]+\}|\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2})+)\1/g;
  // Non-ASCII codepoint detector: any char with codepoint > 0x7E or < 0x20
  // (we exclude the basic ASCII range). For escapes, decode \uXXXX / \u{...} /
  // \xHH and check.
  const nonAsciiCharRx = /[^\x00-\x7F]/;

  function escapesToCodepoints(s) {
    const out = [];
    const re = /\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const hex = m[1] || m[2] || m[3];
      out.push(parseInt(hex, 16));
    }
    return out;
  }

  // Label/comment regex
  const labelRx = /(unicode|non[\s_-]*ascii|accent(s|ed)?|diacritic(s|al)?|cjk|chinese|japanese|korean|emoji|umlaut|cyrillic|greek|arabic|hebrew|cafe?\b|naïve|naive[\s_-]*char|résumé|smart[\s_-]*quote)/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // Quick win: any non-ASCII char anywhere in the file in proximity to a
    // slug/assertion call.
    if (nonAsciiCharRx.test(text)) {
      // Check that at least one non-ASCII char is actually inside a literal.
      // A simple proxy: scan literals.
      let m;
      while ((m = litRx.exec(text)) !== null) {
        const inner = m[2];
        if (nonAsciiCharRx.test(inner)) {
          const start = Math.max(0, m.index - 200);
          const end = Math.min(text.length, m.index + m[0].length + 200);
          const window = text.slice(start, end);
          if (/slug|slugify|toSlug|kebab|slugger|expect|assert|toBe|toEqual|equal|is\s*\(/i.test(window)) {
            return true;
          }
        }
        // Check for escape sequences referring to non-ASCII codepoints.
        const cps = escapesToCodepoints(inner);
        if (cps.some(cp => cp > 0x7e || cp < 0x20)) {
          const start = Math.max(0, m.index - 200);
          const end = Math.min(text.length, m.index + m[0].length + 200);
          const window = text.slice(start, end);
          if (/slug|slugify|toSlug|kebab|slugger|expect|assert|toBe|toEqual|equal|is\s*\(/i.test(window)) {
            return true;
          }
        }
      }
      // Reset regex state for next file
      litRx.lastIndex = 0;
    } else {
      // Even without raw non-ASCII bytes, escape sequences may exist.
      let m;
      while ((m = litRx.exec(text)) !== null) {
        const inner = m[2];
        const cps = escapesToCodepoints(inner);
        if (cps.some(cp => cp > 0x7e || cp < 0x20)) {
          const start = Math.max(0, m.index - 200);
          const end = Math.min(text.length, m.index + m[0].length + 200);
          const window = text.slice(start, end);
          if (/slug|slugify|toSlug|kebab|slugger|expect|assert|toBe|toEqual|equal|is\s*\(/i.test(window)) {
            return true;
          }
        }
      }
      litRx.lastIndex = 0;
    }

    if (labelRx.test(text)) return true;
  }
  return false;
}
