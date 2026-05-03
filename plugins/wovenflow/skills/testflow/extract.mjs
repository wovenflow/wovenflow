#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, statSync, globSync } from 'node:fs';
import { basename, join } from 'node:path';

const FENCE = /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[ \t]*$/;

// Map --lang to the fence label looked for in the markdown and the output
// filename derived from the input basename (already stripped of trailing .md).
// Add more languages here as they're needed.
const LANGS = {
	typescript: {
		fence: 'typescript',
		outputName: (base) => base + '.test.ts',
	},
	javascript: {
		fence: 'javascript',
		outputName: (base) => base + '.test.js',
	},
	python: {
		// pytest's default discovery wants `test_*.py`. Dots inside basenames
		// (e.g. feature.spec) confuse module-style import collection, so
		// sanitize them to underscores.
		fence: 'python',
		outputName: (base) => 'test_' + base.replace(/\./g, '_') + '.py',
	},
	rust: {
		fence: 'rust',
		outputName: (base) => base.replace(/\./g, '_') + '_test.rs',
	},
	ruby: {
		fence: 'ruby',
		outputName: (base) => base.replace(/\./g, '_') + '_test.rb',
	},
	go: {
		fence: 'go',
		outputName: (base) => base.replace(/[.-]/g, '_') + '_test.go',
	},
};

function parseArgs(argv) {
	const positional = [];
	const opts = { lang: 'typescript' };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--lang') opts.lang = argv[++i];
		else if (a.startsWith('--lang=')) opts.lang = a.slice('--lang='.length);
		else positional.push(a);
	}
	return { positional, opts };
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
		process.stderr.write('usage: extract.mjs <input-glob-or-file> <output-dir> [--lang LANG]\n');
		process.stderr.write('  supported languages: ' + Object.keys(LANGS).join(', ') + ' (default: typescript)\n');
		process.exit(1);
	}
	const langSpec = LANGS[opts.lang];
	if (!langSpec) {
		process.stderr.write(`error: unsupported language "${opts.lang}"\n`);
		process.stderr.write('  supported languages: ' + Object.keys(LANGS).join(', ') + '\n');
		process.exit(1);
	}
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
