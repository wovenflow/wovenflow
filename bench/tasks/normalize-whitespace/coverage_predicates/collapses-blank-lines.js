// Predicate for label: collapses-blank-lines
// Description: Three or more consecutive newlines collapse to exactly two newlines (one blank line between paragraphs). The agent's tests should include at least one assertion exercising blank-line collapse.
// Strategy: Look for an input string literal containing three-or-more consecutive newlines (\n\n\n+ or raw triple blank lines).
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // \n\n\n (or more) as escape sequence inside a quoted literal.
  const escapedTriple = /\\n\\n\\n/;
  // Or a template literal that contains 3+ consecutive raw newlines.
  const rawTriple = /`[^`]*?\n\n\n[^`]*?`/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (escapedTriple.test(text) || rawTriple.test(text)) return true;
  }
  return false;
}
