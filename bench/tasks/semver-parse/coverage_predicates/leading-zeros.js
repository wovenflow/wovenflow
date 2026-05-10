// Predicate for label: leading-zeros
// Description: The input has a numeric component with a leading zero (e.g. '01.2.3'). Per the
//   semver spec this is invalid; the agent's tests should include at least one assertion about
//   leading-zero behavior, accepting either rejection or acceptance with a documented choice.
// Strategy: Look for a quoted version literal where any of the three numeric components has a
//   leading zero (e.g. '01.2.3', '1.02.3', '1.2.03'), AND an assertion of any kind (the test
//   may rejection-assert OR accept with a documented choice). Combine with a label/comment hint
//   mentioning "leading zero" / "leading-zero" for robustness.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f =>
    f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.mjs') || f.endsWith('.cjs')
  );

  // A multi-digit number starting with 0 in any of MAJOR/MINOR/PATCH position inside a quoted version.
  // - 0[0-9]+ matches "01", "00", "012", but NOT bare "0".
  const leadingZeroLiteral = /(['"`])(?:0\d+\.\d+\.\d+|\d+\.0\d+\.\d+|\d+\.\d+\.0\d+)(?:[-+][0-9A-Za-z.-]+)?\1/;

  // Label/comment hint
  const labelHint = /\b(leading[\s-]?zero|leading[\s-]?0|no[\s-]?leading[\s-]?zero|leading\s+zeroes)\b/i;

  // Generic assertion vocabulary so we don't false-positive on a stray literal in a comment block.
  const assertionVocab = /\b(parse|parses|equal|deepEqual|toEqual|toStrictEqual|strictEqual|expect|assert|throws?|toThrow|rejects)\b/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const hasLeadingZeroLiteral = leadingZeroLiteral.test(text);
    const hasLabelHint = labelHint.test(text);

    // Strongest signal: literal AND label hint.
    if (hasLeadingZeroLiteral && hasLabelHint) return true;

    // Code-shape alone is a strong signal — leading-zero literals like '01.2.3' don't appear by
    // accident. Require at least an assertion vocabulary nearby.
    if (hasLeadingZeroLiteral && assertionVocab.test(text)) return true;

    // Label hint alone is too weak (someone might just mention it in a comment without testing).
  }
  return false;
}
