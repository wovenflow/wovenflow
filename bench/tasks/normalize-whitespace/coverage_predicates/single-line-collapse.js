// Predicate for label: single-line-collapse
// Description: Multiple spaces within one line collapse to a single space. The agent's tests should include at least one assertion exercising space collapse.
// Strategy: Look for a string literal containing two-or-more consecutive spaces (no newline) used as test input.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Match a quoted string containing 2+ consecutive spaces with no newline / tab escape inside.
  // We look for a string literal that contains "  " (two or more spaces) between non-space chars,
  // with no \n or \t escape inside the same literal.
  const multiSpace = /(['"`])(?:(?!\1|\\n|\\t|\\r)[\s\S])*?\S {2,}\S(?:(?!\1|\\n|\\t|\\r)[\s\S])*?\1/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (multiSpace.test(text)) return true;
  }
  return false;
}
