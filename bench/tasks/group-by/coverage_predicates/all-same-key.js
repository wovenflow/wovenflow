// Predicate for label: all-same-key
// Description: Every item produces the same key; all items end up in one group. The agent's tests should include at least one assertion exercising the everything-coalesces case.
// Strategy: Look for a groupBy call paired with a constant-returning keyFn or a label/comment naming the case.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/groupBy\s*\(/.test(text)) continue;
    // Label/comment hint.
    const labelHints = /(all[-_ ]?same[-_ ]?key|same[-_ ]?key|everything[-_ ]?coalesces|coalesce|one[-_ ]?group|single[-_ ]?bucket|constant[-_ ]?key)/i;
    if (labelHints.test(text)) return true;
    // Code-shape: keyFn that returns a constant literal — `() => "x"`, `() => 0`, `_ => 'all'`, etc.
    const constArrow = /(?:\(\s*\)|\(?\s*[A-Za-z_$][\w$]*\s*\)?|\(?\s*_+\s*\)?)\s*=>\s*(?:["'`][^"'`]*["'`]|-?\d+(?:\.\d+)?|true|false|null)\s*[,)\n]/;
    if (constArrow.test(text)) return true;
    // function keyFn(...) { return <literal>; }
    if (/function[^()]*\([^)]*\)\s*\{\s*return\s+(?:["'`][^"'`]*["'`]|-?\d+(?:\.\d+)?|true|false|null)\s*;?\s*\}/.test(text)) return true;
  }
  return false;
}
