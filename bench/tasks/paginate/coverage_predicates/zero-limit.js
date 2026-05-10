// Predicate for label: zero-limit
// Description: limit<=0 returns empty items array. The agent's tests should include at least one assertion exercising zero-or-negative limit.
// Strategy: look for a test/comment naming zero/negative-limit alongside a paginate call whose limit argument is 0 or negative, plus an assertion of empty items.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const labelRe = /(?:it|test|describe)\s*\(\s*[`'"][^`'"]*(zero[\s-]?limit|limit[\s-]?(of[\s-]?)?(zero|0)|negative[\s-]?limit|non[\s-]?positive[\s-]?limit|limit[\s-]?<=?[\s-]?0)[^`'"]*[`'"]/i;
    const commentRe = /(?:\/\/|\/\*|\*).*(zero[\s-]?limit|negative[\s-]?limit|limit\s*<=?\s*0|limit\s*===?\s*0)/i;

    const paginateCall = /paginate\s*\(/i;
    // limit: 0 or limit: -N as object property OR positional
    const zeroOrNegLimit = /\blimit\s*[:=]\s*-?0\b|\blimit\s*[:=]\s*-\s*[1-9]\d*\b/;
    const assertion = /(expect|assert|equal|deepEqual|toEqual|toStrictEqual)/i;

    if ((labelRe.test(text) || commentRe.test(text)) && paginateCall.test(text) && assertion.test(text)) {
      return true;
    }

    if (zeroOrNegLimit.test(text) && paginateCall.test(text) && assertion.test(text)) {
      return true;
    }
  }
  return false;
}
