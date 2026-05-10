#!/usr/bin/env node
// Post-processes the extracted spec test file produced by extract.mjs.
//
// The wovenflow extractor concatenates every test fence of a given language
// into one output file. The DTDD bench spec writes each test fence as a
// self-contained ES module (top-level `import`), which is the natural shape
// for a fence the reader is supposed to understand on its own — but causes
// `Identifier 'X' has already been declared` once concatenated.
//
// This script collapses duplicate top-level `import` statements (anything
// matching the basic single-line form `import ... from '...';`) to a single
// occurrence at the top of the file, preserving the rest of the source order.
//
// Scope is intentionally narrow: only single-line static imports. Multi-line
// imports, dynamic imports, and side-effect imports beyond exact-text dupes
// are left alone.
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

const seenImports = new Set();
const importLines = [];
const otherLines = [];

const IMPORT_RE = /^\s*import\s+[^;]*from\s+['"][^'"]+['"]\s*;?\s*$/;

for (const line of lines) {
  if (IMPORT_RE.test(line)) {
    const key = line.trim();
    if (!seenImports.has(key)) {
      seenImports.add(key);
      importLines.push(line);
    }
    // Drop duplicate import lines.
  } else {
    otherLines.push(line);
  }
}

// Write imports first, then a blank line, then the rest.
const out = [...importLines, '', ...otherLines].join('\n');
writeFileSync(path, out);
