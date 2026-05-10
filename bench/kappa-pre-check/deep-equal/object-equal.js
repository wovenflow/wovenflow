// Predicate for label: object-equal
// Description: Two plain objects with the same keys and equal values compare as equal; different keys compare as not equal. The agent's tests should include at least one assertion exercising object equality.
// Strategy: Find an equal-style assertion where at least one argument contains an object literal `{ key: value }` (excluding pure array literals).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const callRe = /\b\w*[Ee]quals?\s*\(/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      let depth = 0;
      let i = m.index + m[0].length - 1;
      let start = i + 1;
      let end = -1;
      for (; i < text.length; i++) {
        const c = text[i];
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end === -1) continue;
      const args = text.slice(start, end);
      // Object literal heuristic: `{ key: ... }` where key is identifier, string, or quoted.
      // Match `{` followed by something other than just `}` (allow whitespace/newline) and a `:` indicating key-value.
      if (/\{\s*(?:[A-Za-z_$][\w$]*|"[^"]*"|'[^']*')\s*:/.test(args)) {
        return true;
      }
    }

    // Fallback: explicit label/comment
    if (/object[-_ ]?equal/i.test(text) && /\b\w*[Ee]quals?\s*\(/.test(text)) return true;
  }
  return false;
}
