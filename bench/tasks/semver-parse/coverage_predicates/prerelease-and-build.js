// Predicate for label: prerelease-and-build
// Description: The input includes BOTH a prerelease identifier and build metadata in the same
//   string (e.g. '1.2.3-alpha+sha.deadbeef'). The agent's tests should include at least one
//   assertion exercising both segments together.
// Strategy: Look for a quoted version literal that contains BOTH a '-' prerelease segment AND a
//   '+' build segment in the same string. This is the unambiguous code-shape signal. Combine
//   with assertion vocabulary or a label/comment hint mentioning both.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f =>
    f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.mjs') || f.endsWith('.cjs')
  );

  // Quoted version literal with prerelease AND build metadata.
  // Format: MAJOR.MINOR.PATCH-<prerelease>+<build>
  const combinedLiteral = /(['"`])\d+\.\d+\.\d+-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*\1/;

  // Label/comment hints suggesting both segments present.
  const bothHint = /\b(both|combined|together|full|complete)\b[^\n]{0,120}\b(prerelease|pre-release|build|metadata)\b/i;
  const bothHintReverse = /\b(prerelease|pre-release|build|metadata)\b[^\n]{0,120}\b(both|combined|together|and|plus)\b[^\n]{0,80}\b(prerelease|pre-release|build|metadata)\b/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    if (!combinedLiteral.test(text)) continue;

    // Code-shape alone is essentially diagnostic for this label, but require a basic
    // assertion vocabulary too so we don't false-positive on stray comments.
    if (/\b(parse|parses|equal|deepEqual|toEqual|toStrictEqual|strictEqual|expect|assert)\b/i.test(text)) {
      return true;
    }

    // Or, a label hint mentioning both concepts.
    if (bothHint.test(text) || bothHintReverse.test(text)) return true;
  }
  return false;
}
