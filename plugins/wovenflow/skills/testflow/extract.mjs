#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, statSync, globSync } from 'node:fs';
import { basename, join } from 'node:path';

const FENCE = /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[ \t]*$/;

function extractTypescriptBlocks(source) {
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
		if (lang === 'typescript') blocks.push(body.join('\n'));
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

function outputName(inputPath) {
	const base = basename(inputPath);
	return base.endsWith('.md') ? base.slice(0, -3) + '.test.ts' : base + '.test.ts';
}

function main(argv) {
	const [input, outDir] = argv;
	if (!input || !outDir) {
		process.stderr.write('usage: extract.mjs <input-glob-or-file> <output-dir>\n');
		process.exit(1);
	}
	const files = resolveInputs(input);
	mkdirSync(outDir, { recursive: true });
	for (const file of files) {
		const blocks = extractTypescriptBlocks(readFileSync(file, 'utf8'));
		if (blocks.length === 0) continue;
		writeFileSync(join(outDir, outputName(file)), blocks.join('\n\n'));
	}
}

main(process.argv.slice(2));
