// Predicate for label: negative-offset
// Description: offset<0 is treated as zero. The agent's tests should include at least one assertion exercising negative offset.
// Strategy: look for a test/comment naming negative-offset alongside a paginate call whose offset argument is negative.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const labelRe = /(?:it|test|describe)\s*\(\s*[`'"][^`'"]*(negative[\s-]?offset|offset[\s-]?<[\s-]?0|offset[\s-]?of[\s-]?-?\d+|negative[\s-]?index|clamp(s|ed)?[\s-]?(to)?[\s-]?zero)[^`'"]*[`'"]/i;
    const commentRe = /(?:\/\/|\/\*|\*).*(negative[\s-]?offset|offset\s*<\s*0|treat(ed)?\s*as\s*zero|clamp(ed)?\s*to\s*zero)/i;

    const paginateCall = /paginate\s*\(/i;
    const negativeOffset = /\boffset\s*[:=]\s*-\s*[1-9]\d*\b/;
    const assertion = /(expect|assert|equal|deepEqual|toEqual|toStrictEqual)/i;

    if ((labelRe.test(text) || commentRe.test(text)) && paginateCall.test(text) && assertion.test(text)) {
      return true;
    }

    if (negativeOffset.test(text) && paginateCall.test(text) && assertion.test(text)) {
      return true;
    }
  }
  return false;
}
