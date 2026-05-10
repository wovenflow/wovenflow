// Predicate for label: all-within-window
// Description: When every recorded value is within the TTL of the query timestamp, sum returns the total of all values.
// Strategy: Combo — comment/label mentioning "all within" / "within window" / "all in window"
// alongside multiple add() calls and a sum() assertion.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /all[\s_-]*within|within[\s_-]*(window|ttl)|all[\s_-]*in[\s_-]*window|every[\s_-]*value[\s_-]*within|none[\s_-]*expired/i;
  const sumAssertRe = /\bsum\s*\(/;
  const addRe = /\badd\s*\(/g;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasLabel = labelRe.test(text);
    const adds = (text.match(addRe) || []).length;
    const hasSum = sumAssertRe.test(text);
    if (hasLabel && hasSum && adds >= 2) return true;
  }
  return false;
}
