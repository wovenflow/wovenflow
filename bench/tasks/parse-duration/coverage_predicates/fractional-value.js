// Predicate for label: fractional-value
// Description: A segment's number may be a decimal/fraction (e.g. '1.5h' is 5400000, '0.5s' is 500). The agent's tests should include at least one assertion exercising a fractional value.
// Strategy: Find a parseDuration argument string containing a decimal number followed by a unit (e.g. 1.5h, 0.5s).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Dd]uration\s*\(/.test(text)) continue;

    const callRe = /parse_?[Dd]uration\s*\(\s*(['"`])([\s\S]*?)\1/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      const inner = m[2];
      // a decimal number (with a dot and a fractional part) immediately before a unit
      if (/\d+\.\d+\s*(?:ms|[smhdw])/.test(inner)) return true;
      // leading-dot decimals like .5s
      if (/(?:^|[^.\d])\.\d+\s*(?:ms|[smhdw])/.test(inner)) return true;
    }

    const labelHit = /fractional|decimal|fraction(?:al)?\s+(?:value|number)/i.test(text);
    if (labelHit && /parse_?[Dd]uration\s*\(/.test(text)) return true;
  }
  return false;
}
