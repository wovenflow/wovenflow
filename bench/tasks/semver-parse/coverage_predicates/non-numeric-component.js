// Predicate for label: non-numeric-component
// Description: The input has a non-numeric character where a numeric component should be (e.g.
//   'a.2.3', '1.b.3'). The agent's tests should include at least one assertion that the function
//   rejects non-numeric MAJOR/MINOR/PATCH components.
// Strategy: Look for a quoted literal of the shape X.Y.Z where at least one of X/Y/Z contains a
//   non-digit character (a letter, etc.) AND a throwing/rejection assertion in the file. Combine
//   with a label/comment hint mentioning "non-numeric", "letter", "alpha" (in the rejection
//   sense), or similar.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f =>
    f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.mjs') || f.endsWith('.cjs')
  );

  // Throwing-assertion vocabulary.
  const throwAssertion = /(\.toThrow|\.toThrowError|toThrow\s*\(|\.rejects\b|assert\.throws|assert\.throw\b|\bthrows\s*\(|t\.throws\s*\(|t\.throwsAsync|expect[^\n]*throw|should[^\n]{0,30}throw|chai[^\n]{0,40}throw)/i;

  // Quoted X.Y.Z where one or more of X/Y/Z contains a letter or hyphen-mid-component (a clearly
  // non-numeric MAJOR/MINOR/PATCH). We also want to AVOID matching plain-numeric "1.2.3".
  // We allow each component to be one of: pure digits, OR a token containing at least one letter.
  // Then post-check that at least one of the three components contains a non-digit.
  const tripleQuoted = /(['"`])([A-Za-z0-9]+)\.([A-Za-z0-9]+)\.([A-Za-z0-9]+)(?:[-+][0-9A-Za-z.-]+)?\1/g;

  // Label/comment hint
  const labelHint = /\b(non[\s-]?numeric|not[\s-]?numeric|letter|alphabetic|alpha\s+(in|character|component)|invalid\s+major|invalid\s+minor|invalid\s+patch|garbage|reject)\b/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    if (!throwAssertion.test(text)) continue;

    let hasNonNumericComponent = false;
    let m;
    // Reset lastIndex when reusing global regex per file.
    tripleQuoted.lastIndex = 0;
    while ((m = tripleQuoted.exec(text)) !== null) {
      const [, , a, b, c] = m;
      // We want at least one component that contains a non-digit character.
      const isNonDigit = (s) => /[A-Za-z]/.test(s);
      if (isNonDigit(a) || isNonDigit(b) || isNonDigit(c)) {
        hasNonNumericComponent = true;
        break;
      }
    }

    if (hasNonNumericComponent) return true;

    // Fallback: throw assertion + explicit plain-language label hint is sufficient.
    if (labelHint.test(text)) {
      // But require we've also seen *some* version-like quoted literal in the file
      // to avoid false-positives on tests that only test other things.
      if (/(['"`])[A-Za-z0-9.+-]+\1/.test(text)) return true;
    }
  }
  return false;
}
