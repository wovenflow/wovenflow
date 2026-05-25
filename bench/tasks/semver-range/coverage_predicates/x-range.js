// Predicate for label: x-range
// Description: An x-range / wildcard (e.g. '1.2.x', '1.x', '*') treats x/X/* or omitted trailing
//   components as 'any' within the implied bounds. The agent's tests should include at least one
//   assertion exercising a wildcard range.
// Strategy: Look for a quoted range literal that is a bare '*' / 'x', or a version with an x/X/*
//   in a component position (e.g. '1.2.x', '1.x', '1.2.*'), OR a label/comment hint about
//   x-range/wildcard combined with such a literal.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // bare '*' or 'x'/'X' as a whole quoted range literal
    const bareStar = /(['"`])\s*[*xX]\s*\1/;
    // a version literal with a wildcard component: digits then .x/.X/.* (possibly twice)
    const xComponent = /(['"`])\d+(?:\.\d+)*\.(?:[xX]|\*)(?:\.(?:[xX]|\*))?\1/;
    // also accept forms like '1.x' / '1.*' caught by xComponent above (1 then .x)
    if (bareStar.test(text) || xComponent.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }

    // Label/comment hint mentioning x-range/wildcard AND any wildcard-ish literal present.
    if (/x[\s_-]*range|wild[\s_-]*card|\bany\s+version|\bstar\b/i.test(text) &&
        /(['"`])[^'"`]*[*xX][^'"`]*\1/.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }
  }
  return false;
}
