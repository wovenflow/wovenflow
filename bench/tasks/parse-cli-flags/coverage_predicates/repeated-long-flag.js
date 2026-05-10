// Predicate for label: repeated-long-flag
// Description: When a long flag appears multiple times, values collect into an array.
// Strategy: Look for the same '--name' token appearing 2+ times in the same file combined with an assertion
//           that mentions an array literal (e.g., toEqual([...]) or [...] structure).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const hasAssertion = /\b(expect|assert|toBe|toEqual|toStrictEqual|deepEqual|strictEqual|equal)\b/;
  // We want a long flag name to occur at least twice in the file (covers passing the same flag repeatedly).
  const longFlagOccurrences = /(['"`])--([A-Za-z][\w-]*)(?:=[^'"`\s]+)?\1/g;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!hasAssertion.test(text)) continue;
    const counts = new Map();
    let m;
    while ((m = longFlagOccurrences.exec(text)) !== null) {
      const name = m[2];
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    let repeated = false;
    for (const c of counts.values()) {
      if (c >= 2) { repeated = true; break; }
    }
    // Also require an array literal somewhere in the file (the expected collected value).
    const arrayLiteral = /\[\s*['"`][^'"`]*['"`]\s*,\s*['"`][^'"`]*['"`]\s*\]/.test(text);
    if (repeated && arrayLiteral) return true;
  }
  return false;
}
