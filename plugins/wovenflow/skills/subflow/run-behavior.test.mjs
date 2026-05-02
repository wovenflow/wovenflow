import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RUN_BEHAVIOR = join(__dirname, 'run-behavior.mjs');

function runBehavior(args, opts = {}) {
	return spawnSync(process.execPath, [RUN_BEHAVIOR, ...args], { encoding: 'utf8', ...opts });
}

let workdir;

beforeEach(() => {
	workdir = mkdtempSync(join(tmpdir(), 'run-behavior-test-'));
});

afterEach(() => {
	if (workdir && existsSync(workdir)) {
		rmSync(workdir, { recursive: true, force: true });
	}
});

const TWO_BEHAVIORS = [
	"import { test } from 'node:test';",
	"import assert from 'node:assert/strict';",
	"test('B1: alpha passes', () => { assert.equal(1, 1); });",
	"test('B2: beta fails', () => { assert.equal(1, 2); });"
].join('\n');

function writeSpec(path, body) {
	writeFileSync(path, '```typescript\n' + body + '\n```\n');
}

/**
 * run-behavior.mjs — Single-behavior filter (B1)
 *
 * Given a spec file and a behavior id, run-behavior extracts the spec to a
 * temp dir and invokes node --test --experimental-strip-types
 * --test-name-pattern <id> on the result. Only tests whose names match the
 * id (substring match, since node:test treats the pattern as a regex and
 * an unanchored alphanumeric string is its own substring regex) execute.
 *
 * Concretely: passing 'B1' against a spec containing test('B1: alpha …')
 * and test('B2: beta …') runs only the B1 test. The B2 failure must NOT
 * cause this invocation to fail.
 */
describe('B1: single-behavior filter', () => {
	test('runs only the matching behavior, ignoring siblings', () => {
		const spec = join(workdir, 'two.spec.md');
		writeSpec(spec, TWO_BEHAVIORS);

		const r = runBehavior([spec, 'B1']);
		assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
		assert.match(r.stdout, /B1: alpha passes/);
		assert.doesNotMatch(r.stdout, /B2: beta fails/);
	});
});

/**
 * run-behavior.mjs — Spec file required (B2)
 *
 * The first positional arg must be a path to an existing .spec.md file.
 * If the path is missing or does not exist, run-behavior writes a usage
 * line to stderr and exits 1 — without invoking the extractor.
 */
describe('B2: spec file required', () => {
	test('exits 1 with usage when no args are passed', () => {
		const r = runBehavior([]);
		assert.equal(r.status, 1);
		assert.match(r.stderr, /usage/i);
	});

	test('exits 1 when the spec file does not exist', () => {
		const r = runBehavior([join(workdir, 'missing.spec.md'), 'B1']);
		assert.equal(r.status, 1);
		assert.match(r.stderr, /usage|not found|exist/i);
	});
});

/**
 * run-behavior.mjs — Behavior id required (B3)
 *
 * The second positional arg (behavior id) is required. If it is missing,
 * run-behavior prints a usage line to stderr and exits 1. The id may be
 * any non-empty string (substring of a test name). No id means we cannot
 * decide what to filter, so we refuse rather than running the whole suite.
 */
describe('B3: behavior id required', () => {
	test('exits 1 when only the spec file is passed', () => {
		const spec = join(workdir, 'a.spec.md');
		writeSpec(spec, TWO_BEHAVIORS);

		const r = runBehavior([spec]);
		assert.equal(r.status, 1);
		assert.match(r.stderr, /usage/i);
	});
});

/**
 * run-behavior.mjs — Pass-through exit code (B4)
 *
 * The script's exit code matches node:test's. If the matched behavior
 * passes, exit 0. If it fails, exit non-zero. Callers can wire this into
 * git hooks or CI to gate on a single behavior.
 */
describe('B4: pass-through exit code', () => {
	test('exits non-zero when the matched behavior fails', () => {
		const spec = join(workdir, 'fail.spec.md');
		writeSpec(spec, TWO_BEHAVIORS);

		const r = runBehavior([spec, 'B2']);
		assert.notEqual(r.status, 0);
	});

	test('exits zero when the matched behavior passes', () => {
		const spec = join(workdir, 'pass.spec.md');
		writeSpec(spec, TWO_BEHAVIORS);

		const r = runBehavior([spec, 'B1']);
		assert.equal(r.status, 0, `stderr: ${r.stderr}`);
	});
});

/**
 * run-behavior.mjs — Behavior not found (B5)
 *
 * If node:test reports zero tests matched the pattern (typo, wrong id,
 * not yet implemented), run-behavior exits 1 with a clear stderr message
 * naming both the missing id and the spec file. This is distinct from
 * "behavior ran and failed" — it tells the user the test name doesn't
 * exist, not that an assertion blew up.
 */
describe('B5: behavior not found', () => {
	test('exits 1 with stderr message when no tests match the pattern', () => {
		const spec = join(workdir, 'a.spec.md');
		writeSpec(spec, TWO_BEHAVIORS);

		const r = runBehavior([spec, 'B999_DOES_NOT_EXIST']);
		assert.equal(r.status, 1);
		assert.match(r.stderr, /B999_DOES_NOT_EXIST/);
		assert.match(r.stderr, /not found/i);
	});
});
