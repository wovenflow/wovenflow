// Predicate for label: first-page
// Description: offset=0, limit smaller than total returns the first slice. The agent's tests should include at least one assertion exercising the first-page case.
// Strategy: look for a test/it block whose name mentions "first" or "first page" combined with a paginate/pagination call using offset 0 and a small limit.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // Look for test/it/describe blocks that mention first-page semantics
    const labelRe = /(?:it|test|describe)\s*\(\s*[`'"][^`'"]*first[\s-]?page[^`'"]*[`'"]/i;
    const labelAlt = /(?:it|test|describe)\s*\(\s*[`'"][^`'"]*\bfirst\b[^`'"]*[`'"]/i;

    // Look for paginate-like call with offset: 0 (or default offset) and a positive limit
    const offsetZero = /\boffset\s*[:=]\s*0\b/;
    // Heuristic for paginate call shape
    const paginateCall = /paginate\s*\(/i;

    if ((labelRe.test(text) || labelAlt.test(text)) && (offsetZero.test(text) || paginateCall.test(text))) {
      return true;
    }

    // Fallback: explicit comment + assertion shape mentioning first page
    if (/first[\s-]?page/i.test(text) && /(expect|assert|equal|deepEqual|toEqual|toStrictEqual)/i.test(text) && /\boffset\b/i.test(text)) {
      return true;
    }
  }
  return false;
}
