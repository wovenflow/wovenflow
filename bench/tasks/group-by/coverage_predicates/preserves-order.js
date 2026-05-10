// Predicate for label: preserves-order
// Description: Within each group, items appear in the same order they appeared in the input. The agent's tests should include at least one assertion that order within a group is preserved.
// Strategy: Look for an order/preserve/stability label/comment combined with a groupBy invocation.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/groupBy\s*\(/.test(text)) continue;
    // Combo: explicit label/comment about order preservation + groupBy.
    const labelHints = /(preserves?[-_ ]?order|order[-_ ]?(?:is[-_ ]?)?preserved|maintains?[-_ ]?order|keeps?[-_ ]?order|stable|insertion[-_ ]?order|input[-_ ]?order|in[-_ ]?order)/i;
    if (labelHints.test(text)) return true;
  }
  return false;
}
