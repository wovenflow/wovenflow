// Predicate for label: trims-edges
// Description: Leading and trailing whitespace (including blank lines) is removed from the overall result. The agent's tests should include at least one assertion exercising edge trimming.
// Strategy: Look for a test input string literal that begins or ends with whitespace (space, tab, or newline) inside the quotes.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Quoted string literal whose contents start with whitespace or escape (\n, \t) immediately after opening quote.
  const leading = /(['"`])(?:\\[ntr]| |\t)/;
  // Quoted string literal whose contents end with whitespace or escape (\n, \t) immediately before closing quote.
  const trailing = /(?:\\[ntr]| |\t)(['"`])/;
  // Mention of trim/edges in comments or test name.
  const mention = /\b(trim|edges|leading|trailing)\b/i;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if ((leading.test(text) || trailing.test(text)) && mention.test(text)) return true;
    // Fallback: look for an explicit literal that has both leading and trailing escape whitespace, e.g., "  hi  " or "\n hi \n".
    if (/(['"`])(?:\\n|\\t| |\t)+\S[\s\S]*?\S(?:\\n|\\t| |\t)+\1/.test(text)) return true;
  }
  return false;
}
