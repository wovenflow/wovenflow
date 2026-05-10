// Predicate for label: positional-args
// Description: Tokens that do not start with a dash are positional arguments and appear in the positional array in order.
// Strategy: Look for the word 'positional' (in identifier, property access, or string) combined with an assertion call.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Match 'positional' (case-insensitive) — covers .positional, ['positional'], "positionals", etc.
  const positionalToken = /positional/i;
  const hasAssertion = /\b(expect|assert|toBe|toEqual|toStrictEqual|deepEqual|strictEqual|equal)\b/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (positionalToken.test(text) && hasAssertion.test(text)) return true;
  }
  return false;
}
