import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const normalize = mod.normalize ?? mod.default;
if (typeof normalize !== 'function') throw new Error('produced source must export normalize()');

test('[empty-input] empty string', () => {
  assert.equal(normalize(''), '');
});

test('[single-line-collapse] runs of spaces collapse', () => {
  assert.equal(normalize('foo    bar'), 'foo bar');
  assert.equal(normalize('a  b   c'), 'a b c');
});

test('[tabs-collapse] tabs collapse with spaces', () => {
  assert.equal(normalize('foo\tbar'), 'foo bar');
  assert.equal(normalize('a \t b'), 'a b');
});

test('[preserves-paragraph-break] double newline preserved as paragraph break', () => {
  assert.equal(normalize('a\n\nb'), 'a\n\nb');
});

test('[collapses-blank-lines] 3+ newlines collapse to 2', () => {
  assert.equal(normalize('a\n\n\n\nb'), 'a\n\nb');
});

test('[trims-edges] leading and trailing whitespace removed', () => {
  assert.equal(normalize('   foo   '), 'foo');
  assert.equal(normalize('\n\n  foo  \n\n'), 'foo');
});

test('[single-newline-becomes-space] single newline within paragraph becomes space', () => {
  assert.equal(normalize('hello\nworld'), 'hello world');
});

test('[combined] multiple paragraphs with internal whitespace', () => {
  const input = '  Para  one\n  has   wrapped lines.\n\n\nPara two!\n';
  const expected = 'Para one has wrapped lines.\n\nPara two!';
  assert.equal(normalize(input), expected);
});
