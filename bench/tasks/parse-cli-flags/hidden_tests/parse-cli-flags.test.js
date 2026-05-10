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
