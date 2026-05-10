// Predicate for label: nested-structure
// Description: Equality recurses into nested arrays/objects. The agent's tests should include at least one assertion exercising at least 2 levels of nesting.
// Strategy: Find assertion calls whose arguments contain a literal with at least 2 levels of nesting (e.g. {a:{b:1}}, [[1]], {a:[1]}, [{x:1}]).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Detect ≥2 levels of nesting in a literal: an opening {/[ that contains another {/[
  // We do this by scanning chars and tracking max bracket depth inside literals.
  function maxLiteralDepth(src) {
    let max = 0, depth = 0;
    let inStr = null, escape = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (inStr) {
        if (escape) { escape = false; continue; }
        if (c === '\\') { escape = true; continue; }
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '{' || c === '[') { depth++; if (depth > max) max = depth; }
      else if (c === '}' || c === ']') { depth--; }
    }
    return max;
  }

  // Find assertion call argument lists; check if any contains depth >= 2 literal.
  const callRe = /\b(?:deep[_-]?equal|deepEquals?|equals?|isEqual|toEqual|toBe|toStrictEqual|toDeepEqual|notDeepEqual|notEqual|deepStrictEqual|sameValue|assertEquals?|expect)\s*\(/g;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // For each helper-call open paren, walk balanced parens to capture argument span,
    // then check max literal depth in that span.
    let m;
    while ((m = callRe.exec(text)) !== null) {
      const start = m.index + m[0].length; // just after '('
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
      if (maxLiteralDepth(argsSpan) >= 2) {
        return true;
      }
    }

    // Also accept: variable referenced in assertion declared with depth-2 literal nearby, via label hit
    const labelHit = /nested|recurs|deeply\s+nested|level(?:s)?\s+of\s+nesting|2\s+levels/i.test(text);
    if (labelHit && maxLiteralDepth(text) >= 2) {
      // crude: if label talks about nesting and any depth-2 literal exists in file, accept
      return true;
    }
  }
  return false;
}
