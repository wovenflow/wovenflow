// Predicate for label: order-independent
// Description: Segments may appear in any order and are summed; ordering is not required (e.g. '30m1h' equals '1h30m'). The agent's tests should include at least one assertion exercising out-of-order segments.
// Strategy: Find a multi-segment parseDuration argument where a smaller-magnitude unit appears before a larger one (e.g. minutes before hours), which only an order-independent parser handles.
import fs from 'node:fs';
import path from 'node:path';

// rank: larger number = longer unit
const RANK = { ms: 0, s: 1, m: 2, h: 3, d: 4, w: 5 };

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Dd]uration\s*\(/.test(text)) continue;

    const callRe = /parse_?[Dd]uration\s*\(\s*(['"`])([\s\S]*?)\1/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      const inner = m[2].trim().replace(/^-/, '');
      const segs = inner.match(/\d+(?:\.\d+)?(ms|[smhdw])/g);
      if (!segs || segs.length < 2) continue;
      // pull the unit of each segment in order
      const units = segs.map(seg => seg.match(/(ms|[smhdw])$/)[1]);
      for (let i = 1; i < units.length; i++) {
        if (RANK[units[i]] > RANK[units[i - 1]]) {
          // a longer unit follows a shorter one -> out of descending order
          return true;
        }
      }
    }

    const labelHit = /order[\s_-]*independent|any\s+order|out[\s_-]*of[\s_-]*order|unordered\s+segments?|order\s+(?:is\s+)?not\s+required/i.test(text);
    if (labelHit && /parse_?[Dd]uration\s*\(/.test(text)) return true;
  }
  return false;
}
