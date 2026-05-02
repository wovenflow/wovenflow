import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXTRACT = join(__dirname, 'extract.mjs');

function runExtract(args, opts = {}) {
	return spawnSync(process.execPath, [EXTRACT, ...args], { encoding: 'utf8', ...opts });
}

let workdir;

beforeEach(() => {
	workdir = mkdtempSync(join(tmpdir(), 'behavior-spec-extract-'));
});

afterEach(() => {
	if (workdir && existsSync(workdir)) {
		rmSync(workdir, { recursive: true, force: true });
	}
});

/**
 * extract.mjs — Single-file extraction (B1)
 *
 * If input is a single .spec.md file path, when the extractor runs, then
 * <output-dir>/<basename>.test.ts is written, containing the concatenated
 * content of every typescript-fenced code block from the source.
 *
 * The output basename is derived from the input file's basename: a file
 * named foo.spec.md produces foo.spec.test.ts (the extractor swaps the
 * trailing `.md` for `.test.ts`).
 */
describe('B1: single-file extraction', () => {
	test('writes a .test.ts file containing the typescript block', () => {
		const input = join(workdir, 'foo.spec.md');
		const outDir = join(workdir, 'out');
		writeFileSync(input, [
			'# Foo',
			'',
			'```typescript',
			'test("a", () => { assert.ok(true); });',
			'```',
			''
		].join('\n'));

		const r = runExtract([input, outDir]);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);

		const outFile = join(outDir, 'foo.spec.test.ts');
		assert.ok(existsSync(outFile), `expected output at ${outFile}`);
		const content = readFileSync(outFile, 'utf8');
		assert.equal(content, 'test("a", () => { assert.ok(true); });');
	});

});

/**
 * extract.mjs — Glob support (B2)
 *
 * If input is a glob pattern (e.g., doc/specs/(star)(star)/(star).spec.md), when the extractor
 * runs, then every matched file produces its own .test.ts in <output-dir>
 * with matching basename. We rely on Node 22+ fs.globSync.
 */
describe('B2: glob support', () => {
	test('matches multiple files via a glob and emits one .test.ts each', () => {
		const specsDir = join(workdir, 'specs', 'nested');
		mkdirSync(specsDir, { recursive: true });
		writeFileSync(join(workdir, 'specs', 'a.spec.md'), '```typescript\ntest("a", () => {});\n```\n');
		writeFileSync(join(specsDir, 'b.spec.md'), '```typescript\ntest("b", () => {});\n```\n');

		const outDir = join(workdir, 'out');
		const glob = join(workdir, 'specs', '**', '*.spec.md');
		const r = runExtract([glob, outDir]);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);

		assert.ok(existsSync(join(outDir, 'a.spec.test.ts')));
		assert.ok(existsSync(join(outDir, 'b.spec.test.ts')));
		assert.equal(readFileSync(join(outDir, 'a.spec.test.ts'), 'utf8'), 'test("a", () => {});');
		assert.equal(readFileSync(join(outDir, 'b.spec.test.ts'), 'utf8'), 'test("b", () => {});');
	});

});

/**
 * extract.mjs — Verbatim copy (B3)
 *
 * If a typescript code block contains arbitrary characters (comments,
 * multiline template-literal strings, escaped backticks, unicode, etc.),
 * when extracted, then the output contains the exact bytes between the
 * fences, unmodified. No formatting, no linting, no rewrites.
 */
describe('B3: verbatim copy', () => {
	test('preserves exact bytes between fences', () => {
		const input = join(workdir, 'verbatim.spec.md');
		const outDir = join(workdir, 'out');
		const block = [
			'// a comment with weird chars: <>&"\\\'',
			'const s = `multi',
			'  line',
			'  ${42}`;',
			'/* unicode: emojis-removed-per-rules */',
			'test("v", () => { assert.equal(s.split("\\n").length, 3); });'
		].join('\n');
		writeFileSync(input, '```typescript\n' + block + '\n```\n');

		const r = runExtract([input, outDir]);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);

		const out = readFileSync(join(outDir, 'verbatim.spec.test.ts'), 'utf8');
		assert.equal(out, block);
	});

});

/**
 * extract.mjs — Block ordering (B4)
 *
 * Multiple typescript blocks in a .spec.md are concatenated in source
 * order, separated by exactly one blank line between blocks.
 */
describe('B4: block ordering', () => {
	test('concatenates multiple blocks in source order, separated by a blank line', () => {
		const input = join(workdir, 'order.spec.md');
		const outDir = join(workdir, 'out');
		writeFileSync(input, [
			'```typescript',
			'A',
			'```',
			'',
			'prose between',
			'',
			'```typescript',
			'B',
			'```',
			'',
			'```typescript',
			'C',
			'```'
		].join('\n'));

		const r = runExtract([input, outDir]);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);

		const out = readFileSync(join(outDir, 'order.spec.test.ts'), 'utf8');
		assert.equal(out, 'A\n\nB\n\nC');
	});

});

/**
 * extract.mjs — Non-typescript blocks ignored (B5)
 *
 * Blocks fenced with other language tags (bash, js, markdown) and untagged
 * blocks are omitted entirely. Only typescript-fenced blocks contribute
 * to the output.
 */
describe('B5: non-typescript blocks ignored', () => {
	test('ignores bash, js, markdown, and untagged fences', () => {
		const input = join(workdir, 'mixed.spec.md');
		const outDir = join(workdir, 'out');
		writeFileSync(input, [
			'```bash',
			'echo hi',
			'```',
			'',
			'```js',
			'console.log("nope");',
			'```',
			'',
			'```',
			'untagged',
			'```',
			'',
			'```typescript',
			'KEEP',
			'```',
			'',
			'```markdown',
			'# nope',
			'```'
		].join('\n'));

		const r = runExtract([input, outDir]);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);

		const out = readFileSync(join(outDir, 'mixed.spec.test.ts'), 'utf8');
		assert.equal(out, 'KEEP');
	});

});

/**
 * extract.mjs — Empty input (B6)
 *
 * A .spec.md with zero typescript blocks produces NO .test.ts file.
 * Rationale: empty test files clutter the output dir and break runners
 * that expect every .test.ts to register at least one test. Skipping is
 * cheaper than synthesizing a placeholder and signals to the author that
 * the spec has no executable behavior yet.
 */
describe('B6: empty input', () => {
	test('produces no output file when no typescript blocks are present', () => {
		const input = join(workdir, 'empty.spec.md');
		const outDir = join(workdir, 'out');
		writeFileSync(input, '# just prose\n\n```bash\necho hi\n```\n');

		const r = runExtract([input, outDir]);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);

		assert.ok(!existsSync(join(outDir, 'empty.spec.test.ts')));
	});

});

/**
 * extract.mjs — Output dir creation (B7)
 *
 * If <output-dir> does not exist, the extractor creates it recursively
 * before writing files into it.
 */
describe('B7: output dir creation', () => {
	test('creates the output directory recursively when missing', () => {
		const input = join(workdir, 'mk.spec.md');
		const outDir = join(workdir, 'deep', 'nested', 'out');
		writeFileSync(input, '```typescript\ntest("mk", () => {});\n```\n');

		assert.ok(!existsSync(outDir));
		const r = runExtract([input, outDir]);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);
		assert.ok(existsSync(join(outDir, 'mk.spec.test.ts')));
	});

});

/**
 * extract.mjs — Idempotence (B8)
 *
 * Running the extractor twice with the same inputs produces byte-identical
 * output files. No nondeterminism (timestamps, random IDs, ordering
 * jitter).
 */
describe('B8: idempotence', () => {
	test('two runs produce byte-identical output', () => {
		const input = join(workdir, 'idem.spec.md');
		const outDir = join(workdir, 'out');
		writeFileSync(input, [
			'```typescript',
			'A',
			'```',
			'',
			'```typescript',
			'B',
			'```'
		].join('\n'));

		const r1 = runExtract([input, outDir]);
		assert.equal(r1.status, 0);
		const first = readFileSync(join(outDir, 'idem.spec.test.ts'));

		const r2 = runExtract([input, outDir]);
		assert.equal(r2.status, 0);
		const second = readFileSync(join(outDir, 'idem.spec.test.ts'));

		assert.deepEqual(first, second);
	});

});

/**
 * extract.mjs — CLI argument validation (B9)
 *
 * Missing or invalid args -> the extractor prints a usage line to stderr
 * and exits with status 1. A successful extraction exits 0. The usage
 * line mentions both required positional args.
 */
describe('B9: CLI argument validation', () => {
	test('exits 1 with a usage message when no args are passed', () => {
		const r = runExtract([]);
		assert.equal(r.status, 1);
		assert.match(r.stderr, /usage/i);
	});

	test('exits 1 with a usage message when only one arg is passed', () => {
		const r = runExtract(['only-one']);
		assert.equal(r.status, 1);
		assert.match(r.stderr, /usage/i);
	});

	test('exits 0 on successful extraction', () => {
		const input = join(workdir, 'ok.spec.md');
		const outDir = join(workdir, 'out');
		writeFileSync(input, '```typescript\nT\n```\n');
		const r = runExtract([input, outDir]);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);
	});

});
