// Predicate for label: combined-units
// Description: Multiple segments concatenated together are summed (e.g. '1h30m', '1d2h30m'). The agent's tests should include at least one assertion exercising a multi-segment duration.
// Strategy: Find a parseDuration argument string containing two or more adjacent <number><unit> segments.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Dd]uration\s*\(/.test(text)) continue;

    // Look inside each parseDuration string argument for >= 2 segments back to back.
    const callRe = /parse_?[Dd]uration\s*\(\s*(['"`])([\s\S]*?)\1/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      const inner = m[2].trim();
      const segs = inner.match(/\d+(?:\.\d+)?(?:ms|[smhdw])/g);
      if (segs && segs.length >= 2) {
        // confirm the segments are contiguous (no separator other than another segment)
        const stripped = inner.replace(/^-/, '');
        if (/^(?:\d+(?:\.\d+)?(?:ms|[smhdw])){2,}$/.test(stripped)) return true;
      }
    }

    const labelHit = /combined[\s_-]*units?|multiple\s+segments?|multi[\s_-]*segment|sum(?:med|s)?\s+(?:of\s+)?(?:units|segments)/i.test(text);
    if (labelHit && /parse_?[Dd]uration\s*\(/.test(text)) return true;
  }
  return false;
}
