// Predicate for label: consecutive-separators
// Description: The input contains adjacent characters that all become hyphens
// (e.g. multiple spaces in a row, mixed punctuation back-to-back). The agent's
// tests should include at least one assertion that exercises
// consecutive-separator input.
// Strategy: Look for a string literal containing two or more consecutive
// space/separator/punctuation characters in test input position, or a test
// name/comment mentioning consecutive/multiple/repeated separators.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Code-shape: literal that contains a run of >= 2 spaces, OR runs of
  // separator-becoming characters back to back like "a--b" "x  y" "a, ,b"
  // "a!!b" — heuristic: any literal containing 2+ consecutive whitespace
  // chars, OR a literal that has mixed punctuation/whitespace adjacency
  // (e.g. " ,", ",,", "! ", " -", etc.).
  const multiSpace = /(['"`])[^'"`]*\s{2,}[^'"`]*\1/;
  const adjacentSeparators = /(['"`])[^'"`]*[\s,!?@#%^&*()_+={}\[\]:;"'<>./\\|~`-]{2,}[^'"`]*\1/;

  // Label/comment regex
  const labelRx = /(consecutive|multiple|repeated|adjacent|back[\s-]*to[\s-]*back|run\s+of)\s*(separators?|spaces?|hyphens?|dashes?|punctuation|delimiters?)/i;
  const labelRx2 = /(double|triple)\s*(space|hyphen|dash|separator)/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (multiSpace.test(text)) return true;
    // adjacentSeparators is broader; gate by checking proximity to slug/test keywords
    let m;
    const re = new RegExp(adjacentSeparators.source, 'g');
    while ((m = re.exec(text)) !== null) {
      const lit = m[0];
      // Skip pure code tokens (we already require quote chars). Need at least
      // one whitespace OR punctuation to be part of "what becomes hyphens".
      if (/[ \t,!?&;:.@#%^*()+=/\\|~]{2,}/.test(lit)) {
        const start = Math.max(0, m.index - 200);
        const end = Math.min(text.length, m.index + lit.length + 200);
        const window = text.slice(start, end);
        if (/slug|slugify|toSlug|kebab|slugger|expect|assert|toBe|toEqual|equal|is\s*\(/i.test(window)) {
          return true;
        }
      }
    }
    if (labelRx.test(text) || labelRx2.test(text)) return true;
  }
  return false;
}
