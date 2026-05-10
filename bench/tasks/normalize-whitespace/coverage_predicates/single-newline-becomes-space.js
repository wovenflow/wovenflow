// Predicate for label: single-newline-becomes-space
// Description: A single newline within a paragraph (between non-empty lines) becomes a single space, joining the lines. The agent's tests should include at least one assertion exercising single-newline-to-space behavior.
// Strategy: Look for a string literal containing exactly one \n between two non-whitespace runs (not preceded or followed by another \n).
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Escape-form: a single \n surrounded by non-newline text on both sides inside a quoted literal.
  const escapedSingle = /(['"`])[^'"`]*?\S(?<!\\n)\\n(?!\\n)\S[^'"`]*?\1/;
  // Raw-form (template literal): a single newline between two non-whitespace lines.
  const rawSingle = /`[^`]*?\S\n(?!\n)\S[^`]*?`/;
  // Mention helps disambiguate.
  const mention = /(single[-\s]?newline|join(ed)?\s*lines?|newline.*space)/i;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (escapedSingle.test(text) || rawSingle.test(text)) return true;
    if (mention.test(text) && /\\n/.test(text)) return true;
  }
  return false;
}
