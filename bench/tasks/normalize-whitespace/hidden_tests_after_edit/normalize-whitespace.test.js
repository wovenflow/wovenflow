// Hidden tests for normalize — POST-EDIT version.
// All tests from hidden_tests/ are included verbatim (regression check),
// plus new assertions for the additive edit (optional options.collapseParagraphs
// flag per edit.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const normalize = mod.normalize ?? mod.default;
if (typeof normalize !== 'function') throw new Error('produced source must export normalize()');

// --- Original behaviors (regression check, verbatim from hidden_tests/) ----

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

// --- New behaviors (additive, per edit.md: options.collapseParagraphs) -----

test('[options-omitted] omitting options preserves paragraph breaks', () => {
  assert.equal(normalize('a\n\nb'), 'a\n\nb');
});

test('[options-null-or-undefined] explicit null/undefined behave like omitted', () => {
  assert.equal(normalize('a\n\nb', undefined), 'a\n\nb');
  assert.equal(normalize('a\n\nb', null), 'a\n\nb');
});

test('[options-falsy-flag] collapseParagraphs:false preserves paragraph breaks', () => {
  assert.equal(normalize('a\n\nb', { collapseParagraphs: false }), 'a\n\nb');
});

test('[collapse-paragraphs-basic] collapseParagraphs:true merges paragraphs into one line', () => {
  assert.equal(normalize('a\n\nb', { collapseParagraphs: true }), 'a b');
  const out = normalize('a\n\n\n\nb', { collapseParagraphs: true });
  assert.equal(out, 'a b');
});

test('[collapse-paragraphs-no-newlines] result contains no newline characters', () => {
  const input = '  Para  one\n  has   wrapped lines.\n\n\nPara two!\n';
  const out = normalize(input, { collapseParagraphs: true });
  assert.ok(!out.includes('\n'), `expected no newlines; got ${JSON.stringify(out)}`);
  assert.equal(out, 'Para one has wrapped lines. Para two!');
});

test('[collapse-paragraphs-trims-edges] leading/trailing whitespace still trimmed', () => {
  assert.equal(normalize('\n\n  foo  \n\n', { collapseParagraphs: true }), 'foo');
});

test('[collapse-paragraphs-empty] empty string stays empty', () => {
  assert.equal(normalize('', { collapseParagraphs: true }), '');
});
