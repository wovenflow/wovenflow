// Predicate for label: surrounding-whitespace
// Description: Leading and/or trailing whitespace around the whole string is tolerated and stripped (e.g. '  2h  ' equals '2h'). The agent's tests should include at least one assertion exercising surrounding whitespace.
// Strategy: Find a parseDuration argument string that begins or ends with a literal space (or whitespace escape) while still containing a valid duration segment.
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
      const hasSegment = /\d+(?:\.\d+)?(?:ms|[smhdw])/.test(inner) || /\\[tn]/.test(inner);
      // leading/trailing literal space, tab, or escaped whitespace
      const edgeWs = /^[ \t]|[ \t]$|^\\[tn]|\\[tn]$/.test(inner);
      if (hasSegment && edgeWs) return true;
    }

    const labelHit = /surrounding[\s_-]*whitespace|leading.*trailing\s+(?:space|whitespace)|trim(?:med|s)?\s+(?:whitespace|spaces?)|whitespace\s+toleran/i.test(text);
    if (labelHit && /parse_?[Dd]uration\s*\(/.test(text)) return true;
  }
  return false;
}
