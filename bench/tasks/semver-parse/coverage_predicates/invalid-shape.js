// Predicate for label: invalid-shape
// Description: The input does not match the semver shape (e.g. '1.2', 'abc', '1.2.3.4', empty
//   string). The agent's tests should include at least one assertion that the function rejects
//   malformed input by throwing.
// Strategy: Look for a "throws" / rejection assertion (toThrow, throws, assert.throws, rejects,
//   try/catch + fail, etc.) AND a malformed input literal (e.g. quoted '1.2', '1.2.3.4', empty
//   string, or a label/comment hint mentioning invalid/malformed/bad/throw/reject).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f =>
    f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.mjs') || f.endsWith('.cjs')
  );

  // Throwing-assertion vocabulary across BDD/TDD/AVA/node:test styles.
  const throwAssertion = /(\.toThrow|\.toThrowError|toThrow\s*\(|\.rejects\b|assert\.throws|assert\.throw\b|\bthrows\s*\(|t\.throws\s*\(|t\.throwsAsync|expect[^\n]*throw|should[^\n]{0,30}throw|chai[^\n]{0,40}throw)/i;

  // Code-shape: malformed quoted literals.
  // - Two-component "1.2" (digit.digit, NOT followed by another .digit)
  // - Four-component "1.2.3.4"
  // - Empty string '' or "" or `` immediately
  // - Pure non-numeric like 'abc'
  const twoComponent = /(['"`])\d+\.\d+\1/;        // exact closing quote — no third component
  const fourComponent = /(['"`])\d+\.\d+\.\d+\.\d+(?:[^'"`]*)\1/;
  const emptyString = /(['"])\1|`\s*`/;             // '' or "" or ``
  const nonNumericOnly = /(['"`])[A-Za-z][A-Za-z0-9]*\1/; // 'abc'

  // Label/comment hints
  const labelHint = /\b(invalid|malformed|bad|illegal|reject|throws?\b|throw|garbage|nonsense|not\s+a\s+(valid\s+)?(version|semver))\b/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    if (!throwAssertion.test(text)) continue;

    const hasMalformedLiteral =
      twoComponent.test(text) ||
      fourComponent.test(text) ||
      emptyString.test(text) ||
      nonNumericOnly.test(text);

    if (hasMalformedLiteral) return true;

    // Fallback: throw assertion + plain-language hint about invalidity is sufficient.
    if (labelHint.test(text)) return true;
  }
  return false;
}
