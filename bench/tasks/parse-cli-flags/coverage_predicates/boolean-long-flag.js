// Predicate for label: boolean-long-flag
// Description: A long flag with no value (next token is a flag or end of input) is captured as boolean true.
// Strategy: Look for a quoted '--name' token in an argv-like context combined with the literal 'true' and an assertion.
//           The combo of '--word' + 'true' + assertion strongly implies a boolean-flag assertion.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Quoted long flag token '--word' (no '=', not followed by another character inside quotes besides word chars/dashes).
  const longFlagPattern = /(['"`])--[A-Za-z][\w-]*\1/;
  const truthLiteral = /\btrue\b/;
  const hasAssertion = /\b(expect|assert|toBe|toEqual|toStrictEqual|deepEqual|strictEqual|equal)\b/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (longFlagPattern.test(text) && truthLiteral.test(text) && hasAssertion.test(text)) return true;
  }
  return false;
}
