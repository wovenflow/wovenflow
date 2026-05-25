import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const globMatch = mod.globMatch ?? mod.default;
if (typeof globMatch !== 'function') throw new Error('produced source must export globMatch()');

// --- phase-1 regression assertions (case-sensitive behavior unchanged) ---

test('[exact-literal] a literal pattern matches only the identical path', () => {
  assert.equal(globMatch('foo/bar', 'foo/bar'), true);
  assert.equal(globMatch('foo/bar', 'foo/baz'), false);
  assert.equal(globMatch('foo', 'foobar'), false);
});

test('[star-within-segment] * matches within a segment', () => {
  assert.equal(globMatch('foo/*', 'foo/bar'), true);
  assert.equal(globMatch('a*c', 'abc'), true);
  assert.equal(globMatch('a*c', 'ac'), true);
});

test('[star-within-segment] * does NOT cross a slash', () => {
  assert.equal(globMatch('foo/*', 'foo/bar/baz'), false);
  assert.equal(globMatch('a*c', 'a/c'), false);
});

test('[doublestar-across-segments] ** crosses segment boundaries', () => {
  assert.equal(globMatch('a/**/b', 'a/b'), true);
  assert.equal(globMatch('a/**/b', 'a/x/b'), true);
  assert.equal(globMatch('a/**/b', 'a/x/y/b'), true);
});

test('[doublestar-across-segments] ** alone matches any path', () => {
  assert.equal(globMatch('**', 'a/b/c'), true);
  assert.equal(globMatch('**', ''), true);
});

test('[question-single-char] ? matches exactly one non-slash char', () => {
  assert.equal(globMatch('a?c', 'abc'), true);
  assert.equal(globMatch('a?c', 'ac'), false);
  assert.equal(globMatch('a?c', 'a/c'), false);
});

test('[char-class] [abc] matches one listed char', () => {
  assert.equal(globMatch('a[bcd]e', 'abe'), true);
  assert.equal(globMatch('a[bcd]e', 'ace'), true);
  assert.equal(globMatch('a[bcd]e', 'aze'), false);
});

test('[char-class] a class never matches a slash', () => {
  assert.equal(globMatch('a[/]c', 'a/c'), false);
});

test('[char-class-range] [a-z] matches any char in the range', () => {
  assert.equal(globMatch('[a-z]', 'm'), true);
  assert.equal(globMatch('[a-z]', 'z'), true);
  assert.equal(globMatch('[a-z]', 'A'), false);
  assert.equal(globMatch('[0-9]', '5'), true);
});

test('[negated-class] [!abc] matches a non-listed non-slash char', () => {
  assert.equal(globMatch('[!abc]', 'd'), true);
  assert.equal(globMatch('[!abc]', 'a'), false);
  assert.equal(globMatch('[!abc]', '/'), false);
});

test('[escaped-metachar] backslash escapes a star to match it literally', () => {
  assert.equal(globMatch('a\\*b', 'a*b'), true);
  assert.equal(globMatch('a\\*b', 'axb'), false);
});

test('[escaped-metachar] backslash escapes ? and [ literally', () => {
  assert.equal(globMatch('a\\?b', 'a?b'), true);
  assert.equal(globMatch('a\\?b', 'axb'), false);
  assert.equal(globMatch('\\[x', '[x'), true);
});

// --- post-edit assertions: options.nocase ---

test('[nocase-default] omitting options keeps case-sensitive matching', () => {
  assert.equal(globMatch('Foo/Bar', 'foo/bar'), false);
});

test('[nocase-default] options without nocase is still case-sensitive', () => {
  assert.equal(globMatch('Foo/Bar', 'foo/bar', {}), false);
  assert.equal(globMatch('Foo/Bar', 'foo/bar', { nocase: false }), false);
});

test('[nocase-literal] nocase makes literals case-insensitive', () => {
  assert.equal(globMatch('Foo/Bar', 'foo/bar', { nocase: true }), true);
  assert.equal(globMatch('FOO/BAR', 'foo/bar', { nocase: true }), true);
});

test('[nocase-class] nocase applies to ranges and negation', () => {
  assert.equal(globMatch('[a-z]', 'M', { nocase: true }), true);
  // 'A' case-folds to 'a', which is in the negated set, so it must NOT match.
  assert.equal(globMatch('[!abc]', 'A', { nocase: true }), false);
  assert.equal(globMatch('[!abc]', 'D', { nocase: true }), true);
});

test('[nocase-slash] nocase does not change slash handling', () => {
  assert.equal(globMatch('a*c', 'A/C', { nocase: true }), false);
  assert.equal(globMatch('a?c', 'A/C', { nocase: true }), false);
});
