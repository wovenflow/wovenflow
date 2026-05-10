// Predicate for label: unicode-non-ascii
// Description: The input contains characters outside the ASCII letter/digit
// range (accented letters, CJK, emoji). The agent's tests should include
// at least one assertion that exercises non-ASCII input.
// Strategy: Look for string literals containing at least one code unit
// outside ASCII (charCode > 127) OR a Unicode escape sequence (\uXXXX or
// \u{XXXX}) that resolves to a non-ASCII codepoint. Combine with
// label/comment mentions of "unicode", "non-ascii", "accent", "emoji",
// "cjk", "diacritic", "umlaut", or specific languages.
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

  // Match string literals (single, double, backtick) on a single line.
  const stringLiteralRe = /(['"`])((?:\\.|(?!\1).)*)\1/g;

  // Direct non-ASCII byte (covers raw é, 中, emoji, etc.)
  const rawNonAsciiRe = /[^\x00-\x7F]/;

  // Unicode escape: \uXXXX or \u{XXXX...}
  const unicodeEscapeRe = /\\u(?:\{([0-9A-Fa-f]+)\}|([0-9A-Fa-f]{4}))/g;

  // Hex escape \xXX where XX > 7F (rare in JS strings but valid).
  const hexEscapeRe = /\\x([89A-Fa-f][0-9A-Fa-f])/g;

  const labelRe = /\b(unicode|non[-\s]?ascii|ascii[-\s]?fold(?:ing)?|accent(?:ed|s)?|diacritic(?:s|al)?|umlaut|tilde|cedilla|emoji|emojis|cjk|chinese|japanese|korean|kanji|hiragana|katakana|cyrillic|arabic|hebrew|greek|thai|devanagari|latin[-\s]?(?:1|extended)|special\s+letters?|international|i18n|transliterat(?:e|ion)|normaliz(?:e|ation))\b/i;

  for (const f of files) {
    let text;
    try { text = fs.readFileSync(path.join(testsDir, f), 'utf8'); }
    catch { continue; }

    let hasShape = false;

    // First, scan all string literals for non-ASCII content.
    stringLiteralRe.lastIndex = 0;
    let m;
    while ((m = stringLiteralRe.exec(text)) !== null) {
      const inner = m[2];
      if (!inner) continue;
      if (inner.length > 1000) continue;

      if (rawNonAsciiRe.test(inner)) { hasShape = true; break; }

      // Unicode escapes resolving to non-ASCII codepoints.
      let em;
      unicodeEscapeRe.lastIndex = 0;
      let foundEscape = false;
      while ((em = unicodeEscapeRe.exec(inner)) !== null) {
        const hex = em[1] || em[2];
        const cp = parseInt(hex, 16);
        if (Number.isFinite(cp) && cp > 0x7F) { foundEscape = true; break; }
      }
      if (foundEscape) { hasShape = true; break; }

      // Hex escapes \x80-\xFF.
      hexEscapeRe.lastIndex = 0;
      if (hexEscapeRe.test(inner)) { hasShape = true; break; }
    }

    const mentions = labelRe.test(text);

    if (hasShape && mentions) return true;
    // Shape alone is strong: a non-ASCII byte in a test fixture almost
    // always indicates intent to exercise non-ASCII handling.
    if (hasShape) return true;
  }
  return false;
}
