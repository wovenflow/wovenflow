// Predicate for label: nested-structure
// Description: Equality recurses into nested arrays/objects. The agent's tests should include at least one assertion exercising at least 2 levels of nesting.
// Strategy: Find an equal-style assertion whose argument list contains a nested structure — two levels of `{ ... { ... } ... }`, `[ ... [ ... ] ... ]`, `[ ... { ... } ... ]`, or `{ ... [ ... ] ... }`.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Helper: scan a string and check whether any `{` or `[` opens a region that contains
  // another `{` or `[` before its matching close, considering nesting properly.
  function hasTwoLevelNesting(s) {
    const stack = []; // stack of { type, hasInner }
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      // Skip strings to avoid bracket-in-string false positives
      if (c === '"' || c === "'" || c === '`') {
        const quote = c;
        i++;
        while (i < s.length && s[i] !== quote) {
          if (s[i] === '\\') i++;
          i++;
        }
        continue;
      }
      if (c === '{' || c === '[') {
        // If something is already on the stack that opened a container, then this open is "inner".
        if (stack.length > 0) {
          // Found an inner container inside an outer container -> 2 levels of nesting.
          return true;
        }
        stack.push(c);
      } else if (c === '}' || c === ']') {
        if (stack.length > 0) stack.pop();
      }
    }
    return false;
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
      const args = text.slice(start, end);
      if (hasTwoLevelNesting(args)) return true;
    }

    // Fallback: explicit nested-structure label/comment with an equal call present.
    if (/nested[-_ ]?(structure|object|array|equal)/i.test(text) &&
        /\b\w*[Ee]quals?\s*\(/.test(text)) {
      return true;
    }
  }
  return false;
}
