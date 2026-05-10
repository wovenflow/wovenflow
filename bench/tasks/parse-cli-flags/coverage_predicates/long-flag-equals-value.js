// Predicate for label: long-flag-equals-value
// Description: Long flags in the form '--name=value' (single token) parse value as the flag's value.
// Strategy: Look for a single-token quoted '--name=value' literal combined with an assertion in the same test file.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // A quoted single-token '--name=value' (the '=' must be inside the quoted literal).
  const equalsFlagPattern = /(['"`])--[A-Za-z][\w-]*=[^'"`\s]+\1/;
  const hasAssertion = /\b(expect|assert|toBe|toEqual|toStrictEqual|deepEqual|strictEqual|equal)\b/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (equalsFlagPattern.test(text) && hasAssertion.test(text)) return true;
  }
  return false;
}
