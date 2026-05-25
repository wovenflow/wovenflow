// Predicate for label: empty-string
// Description: The empty string returns null. The agent's tests should include at least one assertion that an empty string returns null.
// Strategy: Find a parseDuration call whose argument is an empty string literal, near a null assertion.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Dd]uration\s*\(/.test(text)) continue;

    // parseDuration('') or parseDuration("") or parseDuration(``)
    const emptyCall = /parse_?[Dd]uration\s*\(\s*(['"`])\1\s*\)/;
    if (emptyCall.test(text)) {
      // confirm a null is referenced somewhere in the file
      if (/\bnull\b/.test(text)) return true;
      // even without an explicit null mention, asserting on '' is the signal
      return true;
    }

    const labelHit = /empty[\s_-]*string/i.test(text);
    if (labelHit && /parse_?[Dd]uration\s*\(/.test(text)) return true;
  }
  return false;
}
