// Predicate for label: single-group
// Description: All items produce different keys; each item ends up in its own single-element group. The agent's tests should include at least one assertion exercising the every-item-distinct case.
// Strategy: Look for a comment/label hinting at distinct/singleton keys plus a groupBy invocation in the file.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/groupBy\s*\(/.test(text)) continue;
    // Combo: a label/comment naming the case + a groupBy call in the same file.
    const labelHints = /(single[-_ ]?group|distinct[-_ ]?keys?|every[-_ ]?item[-_ ]?distinct|each[-_ ]?(?:in|its)[-_ ]?own|unique[-_ ]?keys?|singleton[s]?|one[-_ ]?per[-_ ]?group)/i;
    if (labelHints.test(text)) return true;
    // Alternative: an assertion that every group's array length is 1.
    if (/length\s*[:=]+\s*1/.test(text) && /groupBy\s*\(/.test(text) &&
        /\b(distinct|unique|singleton|each)\b/i.test(text)) return true;
  }
  return false;
}
