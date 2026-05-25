// Predicate for label: exact
// Description: An exact-version range (e.g. '1.2.3', or '=1.2.3') matches only that exact version
//   and nothing else. The agent's tests should include at least one assertion exercising an
//   exact-version range, including a non-matching version.
// Strategy: Look for a satisfies()/expect() call whose range argument is a bare MAJOR.MINOR.PATCH
//   literal (no operator, no wildcard, no ||/space) or a '=1.2.3' literal, OR a label/comment hint
//   about an exact/exact-match range.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // a quoted literal that is exactly =M.M.P or a bare M.M.P (the latter used as a RANGE arg)
    const eqExact = /(['"`])=\d+\.\d+\.\d+\1/;
    if (eqExact.test(text)) return true;

    // satisfies(version, '1.2.3') — second argument is a bare release literal.
    // Match a call with two quoted-version-ish args where the second is a plain M.M.P.
    const twoArg = /\bsatisfies\s*\(\s*(['"`])[^'"`]*\1\s*,\s*(['"`])\d+\.\d+\.\d+\2\s*\)/;
    if (twoArg.test(text)) return true;

    // Label/comment hint, given at least one satisfies call.
    if (/\bexact\b|exact[\s_-]*match|only\s+(?:that|itself|the\s+same)/i.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }
  }
  return false;
}
