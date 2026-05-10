// Predicate for label: some-expired
// Description: When some recorded values are older than ttlMs and others within, sum returns only the within-window total.
// Strategy: Combo — comment/label mentions "some expired" / "partial" / "mixed" / "old and new",
// alongside multiple add() calls and a sum() assertion.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /some[\s_-]*expired|partial(?:ly)?[\s_-]*expired|mixed[\s_-]*(expir|window)|old[\s_-]*and[\s_-]*new|partial[\s_-]*expiration|some[\s_-]*older/i;
  const sumRe = /\bsum\s*\(/;
  const addRe = /\badd\s*\(/g;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasLabel = labelRe.test(text);
    const adds = (text.match(addRe) || []).length;
    const hasSum = sumRe.test(text);
    if (hasLabel && hasSum && adds >= 2) return true;
  }
  return false;
}
