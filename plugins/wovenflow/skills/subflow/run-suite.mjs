#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTRACT = join(__dirname, '..', 'testflow', 'extract.mjs');

function usage() {
	process.stderr.write('usage: run-suite.mjs <glob-or-file> [<output-dir>]\n');
	process.exit(1);
}

function main(argv) {
	const [input, suppliedOutDir] = argv;
	if (!input) usage();

	const outDir = suppliedOutDir ?? mkdtempSync(join(tmpdir(), 'run-suite-'));

	const extract = spawnSync(process.execPath, [EXTRACT, input, outDir], { encoding: 'utf8' });
	if (extract.stdout) process.stdout.write(extract.stdout);
	if (extract.stderr) process.stderr.write(extract.stderr);
	if (extract.status !== 0) process.exit(extract.status ?? 1);

	const testFiles = readdirSync(outDir)
		.filter(f => f.endsWith('.test.ts'))
		.map(f => join(outDir, f))
		.sort();

	if (testFiles.length === 0) {
		process.stderr.write('no tests found\n');
		process.exit(0);
	}

	const env = { ...process.env };
	delete env.NODE_TEST_CONTEXT;
	const runner = spawnSync(
		process.execPath,
		['--test', '--experimental-strip-types', ...testFiles],
		{ encoding: 'utf8', env }
	);
	if (runner.stdout) process.stdout.write(runner.stdout);
	if (runner.stderr) process.stderr.write(runner.stderr);
	process.exit(runner.status ?? 1);
}

main(process.argv.slice(2));
