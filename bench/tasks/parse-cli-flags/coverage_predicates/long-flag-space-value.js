// Predicate for label: long-flag-space-value
// Description: Long flags in the form '--name value' (separate tokens) parse value as the flag's value.
// Strategy: Look for an argv array literal containing a '--name' token followed by a separate value token (not '--name=value'),
//           combined with an assertion or expect call in the same file.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Match a quoted '--word' token followed (after optional whitespace/comma) by another quoted token
  // that is NOT itself a flag (does not start with '-') and is not the same '--word=...' single-token form.
  // Examples that match: ['--name', 'value']  ["--port", "8080"]  '--name', 'value'
  const spaceFlagPattern = /(['"`])--[A-Za-z][\w-]*\1\s*,\s*(['"`])(?!-)[^'"`]+\2/;
  const hasAssertion = /\b(expect|assert|toBe|toEqual|toStrictEqual|deepEqual|strictEqual|equal)\b/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (spaceFlagPattern.test(text) && hasAssertion.test(text)) return true;
  }
  return false;
}
