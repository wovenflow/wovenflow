// Predicate for label: type-mismatch
// Description: Values of different types (e.g. array vs object, null vs undefined, number vs string) compare as not equal. The agent's tests should include at least one assertion exercising a type mismatch.
// Strategy: Find assertion calls whose two arguments are literals of different types (string vs number, array vs object, null vs undefined, etc.).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // classify a trimmed token as a type tag, or null if can't tell
  function typeOf(tok) {
    const t = tok.trim();
    if (!t) return null;
    if (/^['"`]/.test(t)) return 'string';
    if (/^-?\d+(?:\.\d+)?$/.test(t) || /^-?\.\d+$/.test(t)) return 'number';
    if (t === 'true' || t === 'false') return 'boolean';
    if (t === 'null') return 'null';
    if (t === 'undefined') return 'undefined';
    if (t === 'NaN' || t === 'Number.NaN') return 'number';
    if (t.startsWith('[')) return 'array';
    if (t.startsWith('{')) return 'object';
    return null;
  }

  // Split top-level arguments inside (...) text
  function splitArgs(s) {
    const out = [];
    let depth = 0, inStr = null, escape = false, last = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ',' && depth === 0) {
        out.push(s.slice(last, i));
        last = i + 1;
      }
    }
    out.push(s.slice(last));
    return out;
  }

  const callRe = /\b(?:deep[_-]?equal|deepEquals?|equals?|isEqual|toEqual|toBe|toStrictEqual|toDeepEqual|notDeepEqual|notEqual|deepStrictEqual|sameValue|assertEquals?)\s*\(/g;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    let m;
    while ((m = callRe.exec(text)) !== null) {
      const start = m.index + m[0].length;
      let i = start, depth = 1, inStr = null, escape = false;
      while (i < text.length && depth > 0) {
        const c = text[i];
        if (inStr) {
          if (escape) escape = false;
          else if (c === '\\') escape = true;
          else if (c === inStr) inStr = null;
        } else {
          if (c === '"' || c === "'" || c === '`') inStr = c;
          else if (c === '(') depth++;
          else if (c === ')') depth--;
        }
        i++;
      }
      const argsSpan = text.slice(start, i - 1);
      const args = splitArgs(argsSpan);
      if (args.length >= 2) {
        const t1 = typeOf(args[0]);
        const t2 = typeOf(args[1]);
        if (t1 && t2 && t1 !== t2) return true;
      }
    }

    // expect(X).toEqual(Y) / not.toEqual(Y) — capture each side and compare types
    const expectRe = /expect\s*\(\s*([^()]*?)\s*\)\s*\.\s*(?:not\s*\.\s*)?(?:toEqual|toBe|toStrictEqual|toDeepEqual|deep\.equal|to\.equal|to\.deep\.equal|to\.eql|to(?:\.\w+)*\.equals?)\s*\(\s*([^()]*?)\s*\)/g;
    let em;
    while ((em = expectRe.exec(text)) !== null) {
      const t1 = typeOf(em[1]);
      const t2 = typeOf(em[2]);
      if (t1 && t2 && t1 !== t2) return true;
    }

    // Label-based fallback
    const labelHit = /type[\s_-]*mismatch|different\s+types?|null\s+(?:vs|and)\s+undefined|array\s+(?:vs|and)\s+object|number\s+(?:vs|and)\s+string/i.test(text);
    if (labelHit) return true;
  }
  return false;
}
