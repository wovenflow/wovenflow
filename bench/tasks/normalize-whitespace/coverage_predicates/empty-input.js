// Predicate for label: empty-input
// Description: Empty string input returns the empty string. The agent's tests should include at least one assertion exercising empty input.
// Strategy: Look for an empty-string literal passed into a normalize-like call, or an empty-string expectation.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Match a call like normalize(""), normalizeWhitespace(''), etc., where the argument is an empty string literal.
  const callEmpty = /\b\w*[nN]ormalize\w*\s*\(\s*(['"])\1\s*[),]/;
  // Match an equality assertion against an empty string literal (e.g., toBe(""), toEqual('')).
  const expectEmpty = /\b(toBe|toEqual|toStrictEqual|deepEqual|strictEqual|equal|equals|is)\s*\(\s*(['"])\2\s*\)/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (callEmpty.test(text) && expectEmpty.test(text)) return true;
    // Fallback: a line that mentions empty input near an empty-string literal.
    if (/empty/i.test(text) && /(['"])\1/.test(text)) return true;
  }
  return false;
}
