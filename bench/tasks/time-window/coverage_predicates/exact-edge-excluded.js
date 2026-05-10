// Predicate for label: exact-edge-excluded
// Description: A value recorded exactly at now-ttlMs is EXCLUDED (window is exclusive on older edge).
// Strategy: Combo — comment/label mentioning "exact edge", "boundary excluded", "exclusive",
// "now - ttl", or "at the edge", paired with a sum() assertion.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /exact[\s_-]*edge|edge[\s_-]*excluded|exclusive[\s_-]*(edge|boundary|window)|on[\s_-]*the[\s_-]*edge|boundary[\s_-]*excluded|at[\s_-]*now[\s_-]*-?[\s_-]*ttl|exactly[\s_-]*ttl|exact[\s_-]*boundary/i;
  const edgeMathRe = /now\s*-\s*ttl|ttl[\s_-]*ms.*excl|-\s*ttlMs\b/i;
  const sumRe = /\bsum\s*\(/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasLabel = labelRe.test(text) || edgeMathRe.test(text);
    const hasSum = sumRe.test(text);
    if (hasLabel && hasSum) return true;
  }
  return false;
}
