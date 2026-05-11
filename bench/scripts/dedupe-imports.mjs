#!/usr/bin/env node
// Post-processes the extracted spec test file produced by extract.mjs.
//
// The wovenflow extractor concatenates every test fence of a given language
// into one output file. The DTDD bench spec writes each test fence as a
// self-contained ES module (top-level `import`), which is the natural shape
// for a fence the reader is supposed to understand on its own — but causes
// `Identifier 'X' has already been declared` once concatenated.
//
// This script collapses duplicate top-level `import` statements to a single
// occurrence at the top of the file, preserving the rest of the source order.
//
// Two forms are recognized:
//   1. Default / namespace / side-effect / non-named imports collapsed by
//      exact text.
//   2. Named imports from the same module: their name lists are MERGED, so
//      `import { a } from 'x'; import { a, b } from 'x';` becomes a single
//      `import { a, b } from 'x';`. This is load-bearing for specs whose
//      individual test fences self-document their imports but overlap on
//      named bindings (which would otherwise re-declare identifiers).
//
// In addition, this script rewrites bench-relative module specifiers that
// were authored assuming the test would run from the repo root (e.g.
// `'../bench/runner.js'`) into paths relative to the actual extracted-test
// location (`bench/out/spec-tests/<file>.test.js` → `'../../runner.js'`).
// File-system *path* arguments inside test bodies (e.g. fixture paths
// `'bench/test/fixtures/...'`) are NOT rewritten — those are interpreted by
// the implementation under test, which sets cwd or otherwise resolves them.

import { readFileSync, writeFileSync } from 'node:fs';
import { argv } from 'node:process';

const path = argv[2];
if (!path) {
  process.stderr.write('usage: dedupe-imports.mjs <file>\n');
  process.exit(1);
}

let source = readFileSync(path, 'utf8');

// Rewrite ../bench/<file> module specifiers in static imports to ../../<file>
// so the relative resolution works from out/spec-tests/.
source = source.replace(
  /(import\s+[^;]*from\s+['"])\.\.\/bench\/([^'"]+)(['"])/g,
  '$1../../$2$3',
);

const lines = source.split('\n');

// A named-import line: `import { a, b as c } from 'x';`. (No default-with-named
// form like `import x, { y } from 'm'` — the bench specs only use the pure
// named form, so we keep the parser narrow rather than risk a wrong rewrite.)
const NAMED_IMPORT_RE =
  /^\s*import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/;
// Any single-line static import. Matches when NAMED_IMPORT_RE does not.
const IMPORT_RE = /^\s*import\s+[^;]*from\s+['"][^'"]+['"]\s*;?\s*$/;

// Merged named-import sets keyed by module specifier. Preserves insertion
// order of specifiers AND of names within each specifier.
const namedBySpec = new Map(); // spec -> ordered Set of name tokens
const otherImports = []; // non-named imports in first-seen order
const seenOther = new Set();
const otherLines = [];

for (const line of lines) {
  const named = line.match(NAMED_IMPORT_RE);
  if (named) {
    const names = named[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const spec = named[2];
    if (!namedBySpec.has(spec)) namedBySpec.set(spec, new Set());
    const set = namedBySpec.get(spec);
    for (const n of names) set.add(n);
    continue;
  }
  if (IMPORT_RE.test(line)) {
    const key = line.trim();
    if (!seenOther.has(key)) {
      seenOther.add(key);
      otherImports.push(line);
    }
    continue;
  }
  otherLines.push(line);
}

const mergedNamedLines = [];
for (const [spec, names] of namedBySpec.entries()) {
  mergedNamedLines.push(
    `import { ${[...names].join(', ')} } from '${spec}';`,
  );
}

// Write imports first (non-named, then merged named), then a blank line, then
// the rest.
const out = [...otherImports, ...mergedNamedLines, '', ...otherLines].join('\n');
writeFileSync(path, out);
