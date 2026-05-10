// Predicate for label: mixed-case
// Description: The input contains both uppercase and lowercase letters. The
// agent's tests should include at least one assertion that exercises
// mixed-case input.
// Strategy: Look for string literals containing BOTH at least one uppercase
// ASCII letter and at least one lowercase ASCII letter. Combine with a
// label/comment mention of "case", "uppercase", "lowercase", "mixed case",
// or "Hello World"-style fixture references.
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

  const stringLiteralRe = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  const upperRe = /[A-Z]/;
  const lowerRe = /[a-z]/;

  const labelRe = /\b(mixed[-\s]?case|uppercase|lowercase|upper[-\s]?case|lower[-\s]?case|case[-\s]?(?:insensitive|sensitivity|conversion|fold(?:ing)?|normaliz(?:e|ation))|to[-\s]?lower|toLowerCase|toLocaleLowerCase|down(?:case|cas(?:e|ing))|capital(?:s|ize|ization|ized)?)\b/i;

  for (const f of files) {
    let text;
    try { text = fs.readFileSync(path.join(testsDir, f), 'utf8'); }
    catch { continue; }

    let hasShape = false;
    stringLiteralRe.lastIndex = 0;
    let m;
    while ((m = stringLiteralRe.exec(text)) !== null) {
      const inner = m[2];
      if (!inner) continue;
      if (inner.length > 500) continue;
      // Strip escape sequences and unicode escapes that are obviously not
      // letters ASCII letters; quick check is fine here.
      if (upperRe.test(inner) && lowerRe.test(inner)) {
        hasShape = true;
        // Don't break yet — but since we just need one, break.
        break;
      }
    }

    const mentions = labelRe.test(text);

    // Mixed-case fixtures are extremely common (e.g. 'Hello World') and on
    // their own may not indicate intent to test case handling. Require BOTH
    // a fixture with both cases AND a label/comment mention OR a
    // toLowerCase-style assertion target.
    if (hasShape && mentions) return true;

    // Fallback: a fixture with both cases AND an expected output that is
    // all-lowercase and clearly derived from the fixture (suggests intent).
    // We approximate by checking for the words "lower" or "case" near an
    // assertion that compares to a lowercased-looking string.
    if (hasShape && /to(?:Locale)?LowerCase|\.toLowerCase\(\)/.test(text)) return true;
  }
  return false;
}
