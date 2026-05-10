// Predicate for label: array-equal
// Description: Two arrays with the same length and equal elements compare as equal; different length compares as not equal. The agent's tests should include at least one assertion exercising array equality.
// Strategy: Find an equal-style assertion call where at least one argument is an array literal `[ ... ]` (covers both same-array and different-length cases).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // Walk every equal-style call and inspect its balanced argument list
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
      // An array literal is present (and not just a property access). Heuristic: `[` followed by content and `]`.
      if (/\[[^\[\]]*\]/.test(args)) return true;
    }

    // Fallback: explicit comment/label
    if (/array[-_ ]?equal/i.test(text) && /\b\w*[Ee]quals?\s*\(/.test(text)) return true;
  }
  return false;
}
