// Predicate for label: consecutive-separators
// Description: The input contains adjacent characters that all become hyphens
// (e.g. multiple spaces in a row, mixed punctuation back-to-back). The agent's
// tests should include at least one assertion that exercises consecutive-
// separator input.
// Strategy: Look for string literals that contain runs of 2+ adjacent
// separator characters (spaces, tabs, common punctuation), OR a
// label/comment mentioning "consecutive", "multiple spaces", "double",
// "repeated", or "back-to-back". Combine signals when possible.
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

  // Extract every string literal so we can inspect its content directly.
  // Conservative: matches simple single, double, and backtick strings on a single line.
  const stringLiteralRe = /(['"`])((?:\\.|(?!\1).)*)\1/g;

  // Inside a literal, "consecutive separators" are runs of 2+ characters
  // from a separator class: space, tab, and common punctuation that would
  // collapse to hyphens in slugification.
  // We require at least one alphanumeric somewhere in the same literal so
  // we don't double-count whitespace-only inputs (which is its own label).
  const sepRunRe = /[ \t!@#$%^&*()_+={}\[\]|\\:;"'<>,.?/~`-]{2,}/;
  const alnumRe = /[A-Za-z0-9]/;

  // Label/comment cue
  const labelRe = /\b(consecutive|multiple\s+(?:spaces|separators|hyphens|dashes|punctuation)|double\s+(?:space|hyphen|dash|separator)|repeated\s+(?:space|hyphen|dash|separator)|back[-\s]?to[-\s]?back|adjacent|collapse|two\s+spaces|several\s+spaces)\b/i;

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
      // Skip very long literals that are likely fixtures unrelated to a test arg.
      if (inner.length > 500) continue;
      if (sepRunRe.test(inner) && alnumRe.test(inner)) {
        hasShape = true;
        break;
      }
    }

    const mentions = labelRe.test(text);

    // Strong: shape + label.
    if (hasShape && mentions) return true;
    // Shape alone is fairly specific — runs of separators between alnum
    // characters in a test fixture almost certainly target this case.
    if (hasShape) return true;
    // Label alone is too brittle to accept without shape.
  }
  return false;
}
