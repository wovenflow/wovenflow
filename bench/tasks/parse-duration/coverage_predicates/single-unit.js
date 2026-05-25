// Predicate for label: single-unit
// Description: A single <number><unit> segment (e.g. '500ms', '2h') converts to its millisecond value. The agent's tests should include at least one assertion exercising a single-unit duration.
// Strategy: Find a parseDuration call whose argument is a string of exactly one number + unit segment (e.g. '2h', '500ms') asserted against a numeric value.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Dd]uration\s*\(/.test(text)) continue;

    // parseDuration('<number><unit>') with a single segment, optional surrounding ws.
    const singleSeg = /parse_?[Dd]uration\s*\(\s*(['"`])\s*\d+(?:\.\d+)?\s*(?:ms|[smhdw])\s*\1/;
    if (singleSeg.test(text)) return true;

    const labelHit = /single[\s_-]*unit|one\s+(?:segment|unit)/i.test(text);
    if (labelHit && /parse_?[Dd]uration\s*\(/.test(text)) return true;
  }
  return false;
}
