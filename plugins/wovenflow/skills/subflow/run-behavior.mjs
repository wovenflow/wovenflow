#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTRACT = join(__dirname, '..', 'testflow', 'extract.mjs');

function usage() {
	process.stderr.write('usage: run-behavior.mjs <spec-file> <behavior-id>\n');
	process.exit(1);
}

function main(argv) {
	const [specFile, behaviorId] = argv;
	if (!specFile || !behaviorId) usage();

	let isFile = false;
	try { isFile = statSync(specFile).isFile(); } catch { /* missing */ }
	if (!isFile) {
		process.stderr.write(`usage: run-behavior.mjs <spec-file> <behavior-id>\nspec file not found: ${specFile}\n`);
		process.exit(1);
	}

	const outDir = mkdtempSync(join(tmpdir(), 'run-behavior-'));

	const extract = spawnSync(process.execPath, [EXTRACT, specFile, outDir], { encoding: 'utf8' });
	if (extract.stdout) process.stdout.write(extract.stdout);
	if (extract.stderr) process.stderr.write(extract.stderr);
	if (extract.status !== 0) process.exit(extract.status ?? 1);

	const testFiles = readdirSync(outDir)
		.filter(f => f.endsWith('.test.ts'))
		.map(f => join(outDir, f))
		.sort();

	if (testFiles.length === 0) {
		process.stderr.write(`behavior ${behaviorId} not found in ${specFile}\n`);
		process.exit(1);
	}

	const env = { ...process.env };
	delete env.NODE_TEST_CONTEXT;
	const runner = spawnSync(
		process.execPath,
		['--test', '--experimental-strip-types', '--test-name-pattern', behaviorId, ...testFiles],
		{ encoding: 'utf8', env }
	);
	const stdout = runner.stdout ?? '';
	const stderr = runner.stderr ?? '';
	process.stdout.write(stdout);
	process.stderr.write(stderr);

	if (/^1\.\.0$/m.test(stdout)) {
		process.stderr.write(`behavior ${behaviorId} not found in ${specFile}\n`);
		process.exit(1);
	}

	process.exit(runner.status ?? 1);
}

main(process.argv.slice(2));
