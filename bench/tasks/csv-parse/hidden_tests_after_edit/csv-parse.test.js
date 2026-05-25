// Hidden tests for the csv-parse task, after the delimiter edit.
// Includes the Phase-1 regression tests plus tests for the custom delimiter.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');

const mod = await import(sourceDir + '/index.js');
const parseCsv = mod.parseCsv ?? mod.default;
if (typeof parseCsv !== 'function') {
  throw new Error('produced source must export parseCsv()');
}

// --- Phase-1 regression tests (delimiter defaults to comma) ---

test('[simple-rows] parses plain comma-separated rows', () => {
  assert.deepEqual(parseCsv('a,b,c\nd,e,f'), [
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
  ]);
});

test('[simple-rows] single field single row', () => {
  assert.deepEqual(parseCsv('hello'), [['hello']]);
});

test('[quoted-comma] comma inside quotes is literal', () => {
  assert.deepEqual(parseCsv('"a,b",c'), [['a,b', 'c']]);
});

test('[quoted-comma] multiple quoted fields with commas', () => {
  assert.deepEqual(parseCsv('"x,y","z,w"'), [['x,y', 'z,w']]);
});

test('[quoted-newline] newline inside quotes is literal', () => {
  assert.deepEqual(parseCsv('"line1\nline2",b'), [['line1\nline2', 'b']]);
});

test('[escaped-quote] doubled quote becomes single quote', () => {
  assert.deepEqual(parseCsv('"a""b"'), [['a"b']]);
});

test('[escaped-quote] escaped quote alongside literal comma', () => {
  assert.deepEqual(parseCsv('"she said ""hi"", ok",next'), [
    ['she said "hi", ok', 'next'],
  ]);
});

test('[empty-fields] consecutive separators yield empty strings', () => {
  assert.deepEqual(parseCsv('a,,c'), [['a', '', 'c']]);
});

test('[empty-fields] leading and trailing empty fields', () => {
  assert.deepEqual(parseCsv(',a,'), [['', 'a', '']]);
});

test('[trailing-newline] trailing LF does not add an empty row', () => {
  assert.deepEqual(parseCsv('a,b\n'), [['a', 'b']]);
});

test('[trailing-newline] trailing CRLF does not add an empty row', () => {
  assert.deepEqual(parseCsv('a,b\r\n'), [['a', 'b']]);
});

test('[crlf-endings] CRLF separates rows without leaking carriage return', () => {
  assert.deepEqual(parseCsv('a,b\r\nc,d'), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('[whitespace-preserved] whitespace outside quotes is not trimmed', () => {
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('[whitespace-preserved] whitespace inside quotes is preserved', () => {
  assert.deepEqual(parseCsv('"  spaced  ",x'), [['  spaced  ', 'x']]);
});

// --- Post-edit tests: optional delimiter argument ---

test('[delimiter-default] omitted delimiter still splits on comma', () => {
  assert.deepEqual(parseCsv('a,b,c'), [['a', 'b', 'c']]);
});

test('[delimiter-tab] tab delimiter parses TSV', () => {
  assert.deepEqual(parseCsv('a\tb\tc\nd\te\tf', '\t'), [
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
  ]);
});

test('[delimiter-semicolon] semicolon delimiter splits fields', () => {
  assert.deepEqual(parseCsv('x;y;z', ';'), [['x', 'y', 'z']]);
});

test('[delimiter-comma-literal-under-custom] comma is literal when delimiter is not comma', () => {
  // With a tab delimiter, an unquoted comma is just a normal character.
  assert.deepEqual(parseCsv('a,b\tc', '\t'), [['a,b', 'c']]);
});

test('[delimiter-quoting] quoting rules apply to the custom delimiter', () => {
  // A quoted field may contain the active delimiter as a literal.
  assert.deepEqual(parseCsv('"a;b";c', ';'), [['a;b', 'c']]);
});

test('[delimiter-escaped-quote] doubled quotes still escape under custom delimiter', () => {
  assert.deepEqual(parseCsv('"a""b";c', ';'), [['a"b', 'c']]);
});
