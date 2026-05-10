// Predicate for label: empty-input
// Description: The input is the empty string. The agent's tests should include
// at least one assertion that exercises empty-string input.
// Strategy: Look for a call to slugify (or any function under test) being
// passed an empty string literal '' or "", OR a label/comment mentioning
// "empty" near the relevant test. Either signal alone is brittle, so we
// accept either, but prefer them combined when present.
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

  // Code-shape: a function call that passes an empty string literal as an arg.
  // Matches: foo('') , foo("") , foo(``) — including with whitespace.
  const emptyArgRe = /\(\s*(?:''|""|``)\s*[,)]/;

  // Label/comment: word "empty" appearing in test name, describe, it, comment, or string.
  const emptyWordRe = /\bempty\b/i;

  for (const f of files) {
    let text;
    try { text = fs.readFileSync(path.join(testsDir, f), 'utf8'); }
    catch { continue; }

    const hasEmptyArg = emptyArgRe.test(text);
    const mentionsEmpty = emptyWordRe.test(text);

    // Strong signal: both shape and label.
    if (hasEmptyArg && mentionsEmpty) return true;

    // Code-shape alone is acceptable: passing '' is rarely accidental.
    if (hasEmptyArg) return true;

    // Label alone with an assert/expect nearby is acceptable as fallback.
    if (mentionsEmpty && /\b(assert|expect|equal|toBe|strictEqual|deepEqual|is\(|t\.)/.test(text)) {
      // require the empty word to appear within ~120 chars of an assertion-ish keyword
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (emptyWordRe.test(lines[i])) {
          const window = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
          if (/\b(assert|expect|equal|toBe|strictEqual|deepEqual|is\(|t\.)/.test(window)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}
