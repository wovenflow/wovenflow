// Predicate for label: nested-merge
// Description: When a key exists in both inputs with plain-object values, those objects are merged
//   recursively. The agent's tests should include at least one assertion exercising recursive
//   merging of nested objects.
// Strategy: Find a deepMerge call where both object-literal arguments contain a nested object
//   literal (a "{...{...}...}" shape on each side), OR a label/comment hint about nested/recursive
//   /deep merging.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Does this object-literal blob contain a nested object literal as a value?
  function hasNestedObject(blob) {
    return /:\s*\{/.test(blob);
  }

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const callRe = /\b(?:deep[_-]?merge|merge|deepMerge)\s*\(\s*(\{[^]*?\})\s*,\s*(\{[^]*?\})\s*[,)]/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      if (hasNestedObject(m[1]) && hasNestedObject(m[2])) return true;
    }

    // Label/comment hint plus at least one merge call.
    if (/\bnest(ed|ing)?\b|\brecursiv(e|ely)\b|\bdeep(ly)?\s+merg|merge[sd]?\s+recursiv|levels?\s+deep|sub[\s-]?object/i.test(text)) {
      if (/\b(?:deep[_-]?merge|deepMerge|merge)\s*\(/.test(text)) return true;
    }
  }
  return false;
}
