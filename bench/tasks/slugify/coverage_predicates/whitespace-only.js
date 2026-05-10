// Predicate for label: whitespace-only
// Description: The input contains only whitespace characters (spaces, tabs, etc.).
// The agent's tests should include at least one assertion that exercises
// whitespace-only input.
// Strategy: Look for a function call where the argument is a string literal
// containing ONLY whitespace characters (one or more spaces, tabs, \t, \n,
// or escape-sequence representations). Combine with a label/comment mention
// of "whitespace", "spaces only", "tabs only", or "blank".
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  let files;
  try {
    files = fs.readdirSync(testsDir).filter(f =>
      f.endsWith('.js') || f.endsWith('.ts') ||
      f.endsWith('.mjs') || f.endsWith('.cjs')
    );
  } catch {
    return false;
  }

  // Code-shape: string literal containing only whitespace characters
  // (literal spaces/tabs/newlines or \t \n \r escape sequences).
  // Matches '   ', "  ", '\t', "\t\t", '   \t', etc., but NOT '' (empty).
  const wsOnlyArgRe = /(['"`])(?:[ \t\r\n]|\\t|\\n|\\r)+\1/;

  // Stronger: such a literal appears as an argument in a call.
  const wsOnlyCallRe = /\(\s*(['"`])(?:[ \t\r\n]|\\t|\\n|\\r)+\1\s*[,)]/;

  // Label/comment: words referring to whitespace-only inputs.
  const labelRe = /\b(whitespace[-\s]?only|only\s+whitespace|whitespace|spaces?\s+only|tabs?\s+only|blank(?:\s+string)?|all\s+spaces?|all\s+whitespace)\b/i;

  for (const f of files) {
    let text;
    try { text = fs.readFileSync(path.join(testsDir, f), 'utf8'); }
    catch { continue; }

    const hasWsCall = wsOnlyCallRe.test(text);
    const hasWsLit = wsOnlyArgRe.test(text);
    const mentions = labelRe.test(text);

    // Strong: shape (call form) + label.
    if (hasWsCall && mentions) return true;
    // Acceptable: a whitespace-only literal anywhere + label nearby.
    if (hasWsLit && mentions) return true;
    // Code-shape alone (call form) is convincing — whitespace-only literals
    // are very specific and rarely accidental in tests.
    if (hasWsCall) return true;
  }
  return false;
}
