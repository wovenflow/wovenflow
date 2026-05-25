// Predicate for label: or
// Description: An OR range joins parts with '||' and matches if ANY part matches
//   (e.g. '1.2.3 || >=2.0.0'). The agent's tests should include at least one assertion exercising
//   a '||' range, including a version that matches one part and a version that matches none.
// Strategy: Look for a quoted range literal containing the '||' operator, OR a label/comment hint
//   about OR combined with a satisfies call.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // A quoted literal containing '||'.
    const orLit = /(['"`])[^'"`]*\|\|[^'"`]*\1/;
    if (orLit.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }

    // Label/comment hint mentioning OR / '||' / "any part" AND a satisfies call.
    if (/\bor[\s_-]*range\b|\bany\s+part\b|matches\s+(?:either|any)|\|\|/i.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }
  }
  return false;
}
