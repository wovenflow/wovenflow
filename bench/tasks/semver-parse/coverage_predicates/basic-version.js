// Predicate for label: basic-version
// Description: The input is a plain MAJOR.MINOR.PATCH version string (e.g. '1.2.3') with no
//   prerelease and no build metadata. The agent's tests should include at least one assertion
//   exercising a plain version.
// Strategy: Look for at least one quoted MAJOR.MINOR.PATCH literal that does NOT contain a
//   prerelease (no '-') or build metadata (no '+') AND a label/comment hint mentioning a basic
//   or plain version, OR a clearly basic literal like '1.2.3'/'0.0.0' anywhere in the file.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f =>
    f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.mjs') || f.endsWith('.cjs')
  );

  // Label/comment hints suggesting a basic/plain version case is being exercised.
  const labelHint = /\b(basic|plain|simple|standard|valid|happy|normal|canonical)\b[^\n]{0,80}\b(version|semver|parse|case|input)\b/i;
  const labelHintReverse = /\b(version|semver)\b[^\n]{0,40}\b(basic|plain|simple|standard|valid|happy|normal|canonical)\b/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // Find a plain literal that is unambiguous: quoted MAJOR.MINOR.PATCH with no '-'/'+' adjacent.
    // We scan all matches and confirm at least one is purely numeric/dot.
    const matches = text.match(/(['"`])\d+\.\d+\.\d+\1/g) || [];
    const hasPlain = matches.length > 0;

    if (!hasPlain) continue;

    // If we have a plain literal AND a hint label, that's a strong combined signal.
    if (labelHint.test(text) || labelHintReverse.test(text)) return true;

    // Fallback: a plain literal alongside a passing/parses assertion is sufficient,
    // since virtually every semver-parse test suite asserts on the basic case.
    if (/\b(parse|parses|valid|equal|deepEqual|toEqual|toStrictEqual|strictEqual|is)\b/i.test(text)) {
      return true;
    }
  }
  return false;
}
