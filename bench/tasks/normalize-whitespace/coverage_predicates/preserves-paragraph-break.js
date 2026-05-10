// Predicate for label: preserves-paragraph-break
// Description: Two or more consecutive newlines remain as exactly one blank line in the output (\n\n separator). The agent's tests should include at least one assertion exercising paragraph-break preservation.
// Strategy: Look for an expected-output string literal that contains "\n\n" (escaped or raw blank line).
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // \n\n inside a quoted string literal (escape form), with no third \n adjacent.
  const escapedDouble = /(['"`])[^'"`]*?[^\\]\\n\\n(?!\\n)[^'"`]*?\1/;
  // Or a template literal containing a literal blank line (two consecutive newlines), but not three.
  const rawDoubleBlank = /`[^`]*?\S\n\n(?!\n)[^`]*?`/;
  // Or a comment / string mentioning paragraph break together with \n\n.
  const mention = /paragraph[\s-]?break/i;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (escapedDouble.test(text) || rawDoubleBlank.test(text)) return true;
    if (mention.test(text) && /\\n\\n/.test(text)) return true;
  }
  return false;
}
