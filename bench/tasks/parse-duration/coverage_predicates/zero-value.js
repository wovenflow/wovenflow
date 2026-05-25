// Predicate for label: zero-value
// Description: A zero-valued duration returns the number 0 (e.g. '0s' is 0, not null). The agent's tests should include at least one assertion exercising a zero-valued duration.
// Strategy: Find a parseDuration call whose argument is a zero-valued segment (e.g. '0s', '0ms', '0.0h') asserted against 0.
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
      const inner = m[2].trim().replace(/^-/, '');
      // wholly valid duration whose numeric parts are all zero
      if (/^(?:0+(?:\.0+)?(?:ms|[smhdw]))+$/.test(inner)) return true;
    }

    // A standalone zero-valued segment token (not part of a larger number like
    // the "0m" inside "30m"): the digit run must be all zeros and not preceded
    // by another digit, and bounded by a quote/whitespace on the left.
    const zeroToken = /(?:^|['"`\s(])0+(?:\.0+)?(?:ms|s|m|h|d|w)\b/;
    const labelHit = /zero[\s_-]*value|zero\s+duration/i.test(text) || zeroToken.test(text);
    if (labelHit && /parse_?[Dd]uration\s*\(/.test(text)) return true;
  }
  return false;
}
