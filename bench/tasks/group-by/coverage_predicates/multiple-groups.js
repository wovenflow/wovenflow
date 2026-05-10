// Predicate for label: multiple-groups
// Description: Items split across multiple non-singleton groups. The agent's tests should include at least one assertion exercising a typical multi-group case.
// Strategy: Look for a label/comment naming the multi-group case combined with a groupBy invocation.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/groupBy\s*\(/.test(text)) continue;
    // Combo: explicit label/comment + groupBy call.
    const labelHints = /(multiple[-_ ]?groups?|multi[-_ ]?group|several[-_ ]?groups?|many[-_ ]?groups?|typical|non[-_ ]?singleton)/i;
    if (labelHints.test(text)) return true;
    // Alternative combo: assertion that some group's length is 2 or more, alongside groupBy.
    if (/length\s*[:=]+\s*[2-9]/.test(text) && /groupBy\s*\(/.test(text)) return true;
  }
  return false;
}
