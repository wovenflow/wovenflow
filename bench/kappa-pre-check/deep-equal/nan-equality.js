// Predicate for label: nan-equality
// Description: NaN compared to NaN returns true (despite native ===). The agent's tests should include at least one assertion exercising NaN handling.
// Strategy: A test file references NaN (or Number.NaN) inside a deepEqual-style assertion call.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // Find any equal-like call site, then check whether the call/argument list mentions NaN.
    const callRe = /\b\w*[Ee]quals?\s*\(/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      // Walk forward and balance parens to capture the argument list
      let depth = 0;
      let i = m.index + m[0].length - 1; // position at '('
      let start = i + 1;
      let end = -1;
      for (; i < text.length; i++) {
        const c = text[i];
        if (c === '(') depth++;
        else if (c === ')') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end === -1) continue;
      const args = text.slice(start, end);
      if (/\bNaN\b|\bNumber\.NaN\b/.test(args)) return true;
    }

    // Fallback: comment/label mentions NaN and the file has equal-style calls.
    if (/\bNaN\b/i.test(text) && /\b\w*[Ee]quals?\s*\(/.test(text) &&
        /\/\/.*NaN|\/\*[^]*?NaN[^]*?\*\/|nan[-_ ]?equal/i.test(text)) {
      return true;
    }
  }
  return false;
}
