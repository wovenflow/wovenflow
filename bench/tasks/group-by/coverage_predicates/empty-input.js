// Predicate for label: empty-input
// Description: Calling groupBy on an empty array returns an empty object (or equivalent — no enumerable own keys). The agent's tests should include at least one assertion exercising empty input.
// Strategy: Find a groupBy invocation passing an empty array literal somewhere in the test file.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    // Look for groupBy(...) called with an empty array as the first argument,
    // or an empty array variable being passed to groupBy.
    if (/groupBy\s*\(\s*\[\s*\]/.test(text)) return true;
    // Also accept patterns where an empty array is assigned then passed in.
    if (/(?:const|let|var)\s+(\w+)\s*=\s*\[\s*\]\s*;[\s\S]*groupBy\s*\(\s*\1\b/.test(text)) return true;
  }
  return false;
}
