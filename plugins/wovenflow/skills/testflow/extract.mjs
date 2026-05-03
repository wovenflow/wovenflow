#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, statSync, globSync } from 'node:fs';
import { basename, join } from 'node:path';

const FENCE = /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[ \t]*$/;

// `base` is the input filename minus `.md`. `snake` and `pascal` are
// transformations that match each language's idiomatic test-file convention.
const snake = (b) => b.replace(/[.\-\s]+/g, '_');
const pascal = (b) => b.split(/[._\-\s]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join('');

// Curated defaults for common languages. The fence label matches the markdown
// fence; the outputName produces the file the language's standard test
// runner discovers automatically. For anything not in this table, use
// --fence LABEL --name-template PATTERN to override.
const LANGS = {
	typescript: { fence: 'typescript', outputName: (b) => `${b}.test.ts` },
	javascript: { fence: 'javascript', outputName: (b) => `${b}.test.js` },
	python:     { fence: 'python',     outputName: (b) => `test_${snake(b)}.py` },
	rust:       { fence: 'rust',       outputName: (b) => `${snake(b)}_test.rs` },
	ruby:       { fence: 'ruby',       outputName: (b) => `${snake(b)}_test.rb` },
	go:         { fence: 'go',         outputName: (b) => `${snake(b)}_test.go` },
	java:       { fence: 'java',       outputName: (b) => `${pascal(b)}Test.java` },
	kotlin:     { fence: 'kotlin',     outputName: (b) => `${pascal(b)}Test.kt` },
	scala:      { fence: 'scala',      outputName: (b) => `${pascal(b)}Test.scala` },
	swift:      { fence: 'swift',      outputName: (b) => `${pascal(b)}Tests.swift` },
	csharp:     { fence: 'csharp',     outputName: (b) => `${pascal(b)}Tests.cs` },
	fsharp:     { fence: 'fsharp',     outputName: (b) => `${pascal(b)}Tests.fs` },
	cpp:        { fence: 'cpp',        outputName: (b) => `${snake(b)}_test.cpp` },
	c:          { fence: 'c',          outputName: (b) => `test_${snake(b)}.c` },
	php:        { fence: 'php',        outputName: (b) => `${pascal(b)}Test.php` },
	dart:       { fence: 'dart',       outputName: (b) => `${snake(b)}_test.dart` },
	elixir:     { fence: 'elixir',     outputName: (b) => `${snake(b)}_test.exs` },
	erlang:     { fence: 'erlang',     outputName: (b) => `${snake(b)}_tests.erl` },
	clojure:    { fence: 'clojure',    outputName: (b) => `${snake(b)}_test.clj` },
	haskell:    { fence: 'haskell',    outputName: (b) => `${pascal(b)}Spec.hs` },
	ocaml:      { fence: 'ocaml',      outputName: (b) => `${snake(b)}_test.ml` },
	julia:      { fence: 'julia',      outputName: (b) => `${snake(b)}_test.jl` },
	lua:        { fence: 'lua',        outputName: (b) => `${snake(b)}_spec.lua` },
	bash:       { fence: 'bash',       outputName: (b) => `test_${snake(b)}.sh` },
	shell:      { fence: 'sh',         outputName: (b) => `test_${snake(b)}.sh` },
	r:          { fence: 'r',          outputName: (b) => `test-${b}.R` },
	sql:        { fence: 'sql',        outputName: (b) => `${b}.test.sql` },
	graphql:    { fence: 'graphql',    outputName: (b) => `${b}.test.graphql` },
};

function applyTemplate(template, base) {
	return template
		.replace(/\{base\}/g, base)
		.replace(/\{snake\}/g, snake(base))
		.replace(/\{pascal\}/g, pascal(base));
}

function parseArgs(argv) {
	const positional = [];
	const opts = { lang: null, fence: null, nameTemplate: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--lang') opts.lang = argv[++i];
		else if (a.startsWith('--lang=')) opts.lang = a.slice('--lang='.length);
		else if (a === '--fence') opts.fence = argv[++i];
		else if (a.startsWith('--fence=')) opts.fence = a.slice('--fence='.length);
		else if (a === '--name-template') opts.nameTemplate = argv[++i];
		else if (a.startsWith('--name-template=')) opts.nameTemplate = a.slice('--name-template='.length);
		else positional.push(a);
	}
	return { positional, opts };
}

function resolveLang(opts) {
	// Explicit overrides win (allow custom DSLs / unsupported languages).
	if (opts.fence || opts.nameTemplate) {
		if (!opts.fence || !opts.nameTemplate) {
			process.stderr.write('error: --fence and --name-template must be set together (or use --lang)\n');
			process.exit(1);
		}
		return {
			fence: opts.fence,
			outputName: (base) => applyTemplate(opts.nameTemplate, base),
		};
	}
	const langKey = opts.lang ?? 'typescript';
	const langSpec = LANGS[langKey];
	if (!langSpec) {
		process.stderr.write(`error: unsupported language "${langKey}"\n`);
		process.stderr.write('  built-in languages: ' + Object.keys(LANGS).sort().join(', ') + '\n');
		process.stderr.write('  for anything else, use: --fence LABEL --name-template PATTERN\n');
		process.stderr.write('  template placeholders: {base}, {snake}, {pascal}\n');
		process.exit(1);
	}
	return langSpec;
}

function extractBlocks(source, fence) {
	const lines = source.split('\n');
	const blocks = [];
	let i = 0;
	while (i < lines.length) {
		const m = lines[i].match(FENCE);
		if (!m) { i++; continue; }
		const [, , marker, lang] = m;
		const closer = new RegExp('^[ \\t]{0,3}' + marker[0] + '{' + marker.length + ',}[ \\t]*$');
		const body = [];
		i++;
		while (i < lines.length && !closer.test(lines[i])) {
			body.push(lines[i]);
			i++;
		}
		i++;
		if (lang === fence) blocks.push(body.join('\n'));
	}
	return blocks;
}

function resolveInputs(arg) {
	let asFile = null;
	try { if (statSync(arg).isFile()) asFile = arg; } catch { /* not a plain file */ }
	if (asFile) return [asFile];
	const matches = globSync(arg);
	return matches.filter(p => {
		try { return statSync(p).isFile(); } catch { return false; }
	}).sort();
}

function stripMd(filename) {
	return filename.endsWith('.md') ? filename.slice(0, -3) : filename;
}

function main(argv) {
	const { positional, opts } = parseArgs(argv);
	const [input, outDir] = positional;
	if (!input || !outDir) {
		process.stderr.write('usage: extract.mjs <input-glob-or-file> <output-dir> [--lang LANG | --fence LABEL --name-template PATTERN]\n');
		process.stderr.write('  built-in languages: ' + Object.keys(LANGS).sort().join(', ') + '\n');
		process.stderr.write('  default: --lang typescript\n');
		process.stderr.write('  custom: --fence LABEL --name-template PATTERN  (placeholders: {base}, {snake}, {pascal})\n');
		process.exit(1);
	}
	const langSpec = resolveLang(opts);
	const files = resolveInputs(input);
	mkdirSync(outDir, { recursive: true });
	for (const file of files) {
		const blocks = extractBlocks(readFileSync(file, 'utf8'), langSpec.fence);
		if (blocks.length === 0) continue;
		const base = stripMd(basename(file));
		writeFileSync(join(outDir, langSpec.outputName(base)), blocks.join('\n\n'));
	}
}

main(process.argv.slice(2));
