// Predicate for label: prerelease-identifier
// Description: The input includes a prerelease identifier after a hyphen (e.g. '1.2.3-alpha',
//   '1.2.3-rc.1'). The agent's tests should include at least one assertion exercising a version
//   with a prerelease.
// Strategy: Look for a quoted MAJOR.MINOR.PATCH-<something> literal (hyphen + identifier, no '+'
//   yet — we want to count prerelease-only OR prerelease-with-build, but here we accept both
//   since both exercise prerelease handling), combined with a label/comment hint mentioning
//   "prerelease", "pre-release", "alpha", "beta", "rc", or similar.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f =>
    f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.mjs') || f.endsWith('.cjs')
  );

  // Quoted version with a hyphen-prerelease segment: 1.2.3-<id>(.<id>)*  (build metadata may follow)
  // Prerelease identifier per semver: [0-9A-Za-z-]+ separated by '.'
  const prereleaseLiteral = /(['"`])\d+\.\d+\.\d+-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*(?:\+[0-9A-Za-z.-]+)?\1/;

  // Label/comment hints
  const labelHint = /\b(pre[\s-]?release|prerelease|alpha|beta|rc\b|release.candidate|snapshot)\b/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const hasPrereleaseLiteral = prereleaseLiteral.test(text);
    if (!hasPrereleaseLiteral) continue;

    if (labelHint.test(text)) return true;

    // Fallback: presence of a clear prerelease literal plus assertion vocabulary is strong on its own,
    // because the only reason to write "1.2.3-alpha" in a parse test is to exercise the prerelease branch.
    if (/\b(parse|parses|equal|deepEqual|toEqual|toStrictEqual|strictEqual|expect|assert)\b/i.test(text)) {
      return true;
    }
  }
  return false;
}
