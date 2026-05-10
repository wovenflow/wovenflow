// Predicate for label: middle-page
// Description: offset>0 and offset+limit<total returns a middle slice. The agent's tests should include at least one assertion exercising a middle-page case.
// Strategy: look for a test name mentioning "middle"/"middle page" or a paginate call with a non-zero offset whose offset+limit is less than the input length, paired with an assertion.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const labelRe = /(?:it|test|describe)\s*\(\s*[`'"][^`'"]*middle[\s-]?page[^`'"]*[`'"]/i;
    const labelAlt = /(?:it|test|describe)\s*\(\s*[`'"][^`'"]*\bmiddle\b[^`'"]*[`'"]/i;
    const commentMiddle = /(?:\/\/|\/\*|\*).*middle[\s-]?page/i;

    // A paginate-like call with non-zero offset
    const nonZeroOffset = /\boffset\s*[:=]\s*[1-9]\d*\b/;
    const paginateCall = /paginate\s*\(/i;

    if ((labelRe.test(text) || labelAlt.test(text) || commentMiddle.test(text)) &&
        (nonZeroOffset.test(text) || paginateCall.test(text))) {
      return true;
    }

    // Fallback: assertion + non-zero offset + a limit that doesn't reach the end (heuristic — we can't compute total here, so accept any test that uses a slice form like items: data.slice(<n>, <n+limit>) where n > 0)
    if (/\.slice\s*\(\s*[1-9]\d*\s*,/.test(text) && /(expect|assert|equal|deepEqual|toEqual|toStrictEqual)/i.test(text)) {
      return true;
    }
  }
  return false;
}
