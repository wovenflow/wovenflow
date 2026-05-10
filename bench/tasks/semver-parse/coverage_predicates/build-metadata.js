// Predicate for label: build-metadata
// Description: The input includes build metadata after a plus sign (e.g. '1.2.3+sha.deadbeef').
//   The agent's tests should include at least one assertion exercising a version with build metadata.
// Strategy: Look for a quoted version literal containing a '+' segment (build metadata), combined
//   with a label/comment hint mentioning "build", "metadata", or "+".
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f =>
    f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.mjs') || f.endsWith('.cjs')
  );

  // Quoted version with build-metadata segment. Allow optional prerelease before the '+'.
  // Build metadata identifiers per semver: [0-9A-Za-z-]+ separated by '.'.
  const buildMetadataLiteral = /(['"`])\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*\1/;

  const labelHint = /\b(build[\s-]?metadata|build[\s-]?info|build[\s-]?id|metadata|build)\b/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const hasBuildLiteral = buildMetadataLiteral.test(text);
    if (!hasBuildLiteral) continue;

    if (labelHint.test(text)) return true;

    // Fallback: any '+'-bearing quoted version literal is essentially diagnostic of a
    // build-metadata test case, given the input space.
    if (/\b(parse|parses|equal|deepEqual|toEqual|toStrictEqual|strictEqual|expect|assert)\b/i.test(text)) {
      return true;
    }
  }
  return false;
}
