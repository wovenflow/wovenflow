// Predicate for label: type-mismatch
// Description: Values of different types (e.g. array vs object, null vs undefined, number vs string) compare as not equal. The agent's tests should include at least one assertion exercising a type mismatch.
// Strategy: Find an equal-style assertion whose two leading arguments are of obviously different categories (array vs object, null vs undefined, number vs string, primitive vs container, etc.).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Categorize an argument expression by its leading token (best-effort).
  function category(arg) {
    const t = arg.trim();
    if (t === '') return null;
    if (/^\[/.test(t)) return 'array';
    if (/^\{/.test(t)) return 'object';
    if (/^null\b/.test(t)) return 'null';
    if (/^undefined\b/.test(t)) return 'undefined';
    if (/^(true|false)\b/.test(t)) return 'boolean';
    if (/^-?\d/.test(t)) return 'number';
    if (/^['"`]/.test(t)) return 'string';
    if (/^NaN\b/.test(t)) return 'number';
    return null; // identifiers / expressions we can't classify
  }

  // Split a top-level argument list on commas, respecting brackets/strings.
  function splitArgs(args) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (let i = 0; i < args.length; i++) {
      const c = args[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        cur += c;
        i++;
        while (i < args.length && args[i] !== q) {
          cur += args[i];
          if (args[i] === '\\' && i + 1 < args.length) { cur += args[i + 1]; i++; }
          i++;
        }
        if (i < args.length) cur += args[i];
        continue;
      }
      if (c === '(' || c === '[' || c === '{') { depth++; cur += c; continue; }
      if (c === ')' || c === ']' || c === '}') { depth--; cur += c; continue; }
      if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim() !== '') out.push(cur);
    return out;
  }

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
      const args = splitArgs(text.slice(start, end));
      if (args.length < 2) continue;
      const a = category(args[0]);
      const b = category(args[1]);
      if (a && b && a !== b) return true;
    }

    // Fallback: explicit label/comment naming type mismatch with an equal call present.
    if (/type[-_ ]?mismatch|different[-_ ]?type/i.test(text) && /\b\w*[Ee]quals?\s*\(/.test(text)) {
      return true;
    }
  }
  return false;
}
