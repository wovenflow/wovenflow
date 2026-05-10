// Predicate for label: just-inside-edge-included
// Description: A value recorded at now-ttlMs+1 (one tick newer than the edge) is INCLUDED.
// Strategy: Combo — comment/label mentioning "just inside", "one tick", "edge included",
// "inclusive newer", "ttl + 1" / "ttlMs + 1", paired with a sum() assertion.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /just[\s_-]*inside|one[\s_-]*tick|edge[\s_-]*included|inclusive[\s_-]*(edge|newer)|just[\s_-]*newer|inside[\s_-]*edge|barely[\s_-]*(in|inside)/i;
  // Look for arithmetic shapes like now - ttl + 1 or ttlMs + 1 or - ttlMs + 1
  const mathRe = /-\s*ttl(?:Ms)?\s*\+\s*1\b|now\s*-\s*ttl(?:Ms)?\s*\+\s*1\b|ttl(?:Ms)?\s*-\s*1\b/i;
  const sumRe = /\bsum\s*\(/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasLabel = labelRe.test(text) || mathRe.test(text);
    const hasSum = sumRe.test(text);
    if (hasLabel && hasSum) return true;
  }
  return false;
}
