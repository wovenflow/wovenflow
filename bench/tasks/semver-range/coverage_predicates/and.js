// Predicate for label: and
// Description: A space-separated comparator range ANDs its comparators: the version must satisfy
//   ALL of them (e.g. '>=1.2.0 <2.0.0'). The agent's tests should include at least one assertion
//   exercising a space-separated AND range, including a version that fails one comparator.
// Strategy: Look for a quoted range literal that contains at least one OR-part with two
//   space-separated comparators (a "comparator<space>comparator" pair that is NOT the whole thing
//   joined only by '||'), OR a label/comment hint about AND / "all comparators".
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Does any '||'-separated part contain two space-separated comparators?
  function hasAndPart(literal) {
    const parts = literal.split('||');
    for (const part of parts) {
      const trimmed = part.trim();
      // two comparator-with-version tokens separated by whitespace within this part
      if (/(?:>=|<=|>|<|=)?\s*\d+\.\d+(?:\.\d+)?\s+(?:>=|<=|>|<|=)?\s*\d+\.\d+/.test(trimmed)) {
        // require at least one explicit operator so a bare "1.2.3" exact isn't counted
        if (/(?:>=|<=|>|<)/.test(trimmed)) return true;
      }
    }
    return false;
  }

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // Extract quoted literals and inspect each.
    const litRe = /(['"`])([^'"`]*)\1/g;
    let m;
    while ((m = litRe.exec(text)) !== null) {
      const lit = m[2];
      if (lit.includes(' ') && (lit.includes('>') || lit.includes('<')) && hasAndPart(lit)) {
        if (/\bsatisfies\s*\(/.test(text)) return true;
      }
    }

    // Label/comment hint about ANDing comparators AND a satisfies call.
    if (/\band[\s_-]*range\b|space[\s_-]*separated|all\s+(?:of\s+)?(?:the\s+)?comparators?|must\s+satisfy\s+all|\banded\b/i.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }
  }
  return false;
}
