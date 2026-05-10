// Predicate for label: tabs-collapse
// Description: Tabs within a line are treated as whitespace and collapse with surrounding spaces to a single space. The agent's tests should include at least one assertion exercising tab handling.
// Strategy: Look for a literal \t escape (or a tab character) inside a string literal in the test file.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Match a string literal containing the \t escape sequence.
  const escapedTab = /(['"`])[^'"`\n]*\\t[^'"`\n]*\1/;
  // Or a literal raw tab character inside a quoted string.
  const rawTab = /(['"`])[^'"`\n]*\t[^'"`\n]*\1/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (escapedTab.test(text) || rawTab.test(text)) return true;
  }
  return false;
}
