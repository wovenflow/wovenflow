import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RUN_SUITE = join(__dirname, 'run-suite.mjs');

function runSuite(args, opts = {}) {
	return spawnSync(process.execPath, [RUN_SUITE, ...args], { encoding: 'utf8', ...opts });
}

let workdir;

beforeEach(() => {
	workdir = mkdtempSync(join(tmpdir(), 'run-suite-test-'));
});

afterEach(() => {
	if (workdir && existsSync(workdir)) {
		rmSync(workdir, { recursive: true, force: true });
	}
});

const PASSING_BLOCK = [
	"import { test } from 'node:test';",
	"import assert from 'node:assert/strict';",
	"test('B1: passes', () => { assert.equal(1, 1); });"
].join('\n');

const FAILING_BLOCK = [
	"import { test } from 'node:test';",
	"import assert from 'node:assert/strict';",
	"test('B1: fails', () => { assert.equal(1, 2); });"
].join('\n');

function writeSpec(path, body) {
	writeFileSync(path, '```typescript\n' + body + '\n```\n');
}

/**
 * run-suite.mjs — Default output dir (B1)
 *
 * If the user omits the second positional argument, when run-suite runs,
 * then it extracts to a fresh os.tmpdir()/run-suite-<random>/ directory
 * and runs node --test on the extracted files. The user does not need to
 * manage the temp dir; the runner handles it.
 */
describe('B1: default output dir', () => {
	test('extracts to a fresh temp dir under os.tmpdir() when no output dir is given', () => {
		const spec = join(workdir, 'a.spec.md');
		writeSpec(spec, PASSING_BLOCK);

		const r = runSuite([spec]);
		assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
	});
});

/**
 * run-suite.mjs — Persistent output dir (B2)
 *
 * If a second positional arg is supplied, when run-suite runs, then it
 * extracts to that exact directory (creating it if missing) and the
 * .test.ts files are still present after the script exits. This lets
 * the user inspect or rerun the extracted tests without re-extracting.
 */
describe('B2: persistent output dir', () => {
	test('extracts to the supplied directory and leaves files behind', () => {
		const spec = join(workdir, 'a.spec.md');
		writeSpec(spec, PASSING_BLOCK);
		const outDir = join(workdir, 'persist');

		const r = runSuite([spec, outDir]);
		assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
		assert.ok(existsSync(outDir));
		assert.ok(existsSync(join(outDir, 'a.spec.test.ts')));
	});
});

/**
 * run-suite.mjs — Glob support (B3)
 *
 * If the input is a glob pattern, when run-suite runs, then every matched
 * .spec.md file is extracted and run. Glob matching is delegated to
 * extract.mjs (which uses Node 22+ fs.globSync); run-suite must not
 * re-implement glob.
 */
describe('B3: glob support', () => {
	test('extracts and runs every spec matched by a glob', () => {
		const specsDir = join(workdir, 'specs');
		mkdirSync(specsDir, { recursive: true });
		writeSpec(join(specsDir, 'a.spec.md'), PASSING_BLOCK.replaceAll('B1', 'B1a'));
		writeSpec(join(specsDir, 'b.spec.md'), PASSING_BLOCK.replaceAll('B1', 'B1b'));
		const outDir = join(workdir, 'out');
		const glob = join(specsDir, '*.spec.md');

		const r = runSuite([glob, outDir]);
		assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
		assert.ok(existsSync(join(outDir, 'a.spec.test.ts')));
		assert.ok(existsSync(join(outDir, 'b.spec.test.ts')));
	});
});

/**
 * run-suite.mjs — Single-file support (B4)
 *
 * If the input is a path to a single .spec.md file (not a glob), when
 * run-suite runs, then just that file is extracted and run. Behaviour
 * mirrors extract.mjs's single-file mode.
 */
describe('B4: single-file support', () => {
	test('extracts and runs a single spec when given a single file path', () => {
		const spec = join(workdir, 'only.spec.md');
		writeSpec(spec, PASSING_BLOCK);
		const outDir = join(workdir, 'out');

		const r = runSuite([spec, outDir]);
		assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
		const files = readdirSync(outDir);
		assert.deepEqual(files.sort(), ['only.spec.test.ts']);
	});
});

/**
 * run-suite.mjs — Run via node:test (B5)
 *
 * After extraction, run-suite spawns Node's built-in test runner with the
 * --experimental-strip-types flag (so .test.ts files run without a
 * separate compile step) on every extracted *.test.ts file. Output streams
 * to the script's stdout/stderr so the user sees per-test progress in real
 * time.
 */
describe('B5: run via node:test', () => {
	test('passes node:test output through to stdout', () => {
		const spec = join(workdir, 'a.spec.md');
		writeSpec(spec, PASSING_BLOCK);

		const r = runSuite([spec]);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);
		assert.match(r.stdout, /B1: passes/);
	});
});

/**
 * run-suite.mjs — Exit code (B6)
 *
 * The script's exit code matches node:test's: zero when every test passes,
 * non-zero when any test fails. Callers can chain run-suite into shell
 * pipelines and trust the status.
 */
describe('B6: exit code', () => {
	test('exits non-zero when any test fails', () => {
		const spec = join(workdir, 'fail.spec.md');
		writeSpec(spec, FAILING_BLOCK);

		const r = runSuite([spec]);
		assert.notEqual(r.status, 0);
	});

	test('exits zero when every test passes', () => {
		const spec = join(workdir, 'pass.spec.md');
		writeSpec(spec, PASSING_BLOCK);

		const r = runSuite([spec]);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);
	});
});

/**
 * run-suite.mjs — No tests found (B7)
 *
 * If the extractor produces zero .test.ts files (empty input, or a spec
 * with no typescript blocks), run-suite exits 0 with a "no tests found"
 * message on stderr instead of erroring. Empty is not failure; the user
 * may have just removed all blocks pending a rewrite.
 */
describe('B7: no tests found', () => {
	test('exits 0 with stderr message when no .test.ts files are produced', () => {
		const spec = join(workdir, 'empty.spec.md');
		writeFileSync(spec, '# just prose, no typescript blocks\n');

		const r = runSuite([spec]);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);
		assert.match(r.stderr, /no tests found/i);
	});
});

/**
 * run-suite.mjs — CLI argument validation (B8)
 *
 * Missing the required first positional arg -> usage line on stderr,
 * exit 1. The usage line mentions both positional args.
 */
describe('B8: CLI argument validation', () => {
	test('exits 1 with usage on stderr when no args are passed', () => {
		const r = runSuite([]);
		assert.equal(r.status, 1);
		assert.match(r.stderr, /usage/i);
	});
});
