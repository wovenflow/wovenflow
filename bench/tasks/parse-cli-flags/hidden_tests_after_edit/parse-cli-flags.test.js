import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const parseFlags = mod.parseFlags ?? mod.default;
if (typeof parseFlags !== 'function') throw new Error('produced source must export parseFlags()');

test('[long-flag-space-value] --name value', () => {
  const r = parseFlags(['--name', 'alice']);
  assert.equal(r.flags.name, 'alice');
});

test('[long-flag-equals-value] --name=value', () => {
  const r = parseFlags(['--name=alice']);
  assert.equal(r.flags.name, 'alice');
});

test('[short-flag] -x value', () => {
  const r = parseFlags(['-x', 'val']);
  // Either flags.x === 'val' OR flags.x === true with positional ['val'] — accept either.
  assert.ok(r.flags.x === 'val' || (r.flags.x === true && r.positional.includes('val')));
});

test('[combined-short-flags] -xyz sets x, y, z true', () => {
  const r = parseFlags(['-xyz']);
  assert.equal(r.flags.x, true);
  assert.equal(r.flags.y, true);
  assert.equal(r.flags.z, true);
});

test('[positional-args] non-flag tokens collect in order', () => {
  const r = parseFlags(['build', 'src', 'dist']);
  assert.deepEqual(r.positional, ['build', 'src', 'dist']);
});

test('[boolean-long-flag] flag with no value is true', () => {
  const r = parseFlags(['--verbose', '--name', 'alice']);
  assert.equal(r.flags.verbose, true);
  assert.equal(r.flags.name, 'alice');
});

test('[repeated-long-flag] repeated flag collects values', () => {
  const r = parseFlags(['--include', 'a', '--include', 'b', '--include=c']);
  assert.deepEqual(r.flags.include, ['a', 'b', 'c']);
});

test('[empty-input] empty argv returns empty flags + positional', () => {
  const r = parseFlags([]);
  assert.deepEqual(r.flags, {});
  assert.deepEqual(r.positional, []);
});

// --- post-edit assertions: options.aliases + stringifyFlags export ---

const stringifyFlags = mod.stringifyFlags;
if (typeof stringifyFlags !== 'function') {
  throw new Error('produced source must export stringifyFlags() (post-edit)');
}

test('[alias-short-to-long] short flag with alias resolves to long name', () => {
  const r = parseFlags(['-v'], { aliases: { v: 'verbose' } });
  assert.equal(r.flags.verbose, true);
  // short-key should NOT be set under the single-char form
  assert.equal(r.flags.v, undefined);
});

test('[alias-combined-shorts] aliases apply per character in combined shorts', () => {
  const r = parseFlags(['-vo'], { aliases: { v: 'verbose', o: 'output' } });
  assert.equal(r.flags.verbose, true);
  assert.equal(r.flags.output, true);
});

test('[alias-mixed-presence] absent alias preserves single-char key', () => {
  const r = parseFlags(['-vq'], { aliases: { v: 'verbose' } });
  assert.equal(r.flags.verbose, true);
  assert.equal(r.flags.q, true);
});

test('[alias-no-options] no aliases supplied preserves pre-edit behavior', () => {
  const r = parseFlags(['-v']);
  assert.equal(r.flags.v, true);
});

test('[stringify-boolean] booleans serialize as bare --name', () => {
  const argv = stringifyFlags({ flags: { verbose: true }, positional: [] });
  assert.deepEqual(argv, ['--verbose']);
});

test('[stringify-string] string values use --name=value form', () => {
  const argv = stringifyFlags({ flags: { name: 'alice' }, positional: [] });
  assert.deepEqual(argv, ['--name=alice']);
});

test('[stringify-array] array values repeat the flag', () => {
  const argv = stringifyFlags({ flags: { include: ['a', 'b'] }, positional: [] });
  assert.deepEqual(argv, ['--include=a', '--include=b']);
});

test('[stringify-positional-tail] positional args appended at the end', () => {
  const argv = stringifyFlags({ flags: { verbose: true }, positional: ['src', 'dist'] });
  assert.deepEqual(argv, ['--verbose', 'src', 'dist']);
});

test('[stringify-roundtrip] parseFlags(stringifyFlags(x)) preserves x for the supported subset', () => {
  const original = { flags: { name: 'alice', verbose: true }, positional: ['file.txt'] };
  const argv = stringifyFlags(original);
  const reparsed = parseFlags(argv);
  assert.equal(reparsed.flags.name, 'alice');
  assert.equal(reparsed.flags.verbose, true);
  assert.deepEqual(reparsed.positional, ['file.txt']);
});
