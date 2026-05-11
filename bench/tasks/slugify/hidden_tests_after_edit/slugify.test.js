// Hidden tests for slugify — POST-EDIT version.
// All tests from hidden_tests/ are included verbatim (regression check),
// plus new assertions for the additive edit (optional maxLength parameter
// per edit.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');

const mod = await import(sourceDir + '/index.js');
const slugify = mod.slugify ?? mod.default;
if (typeof slugify !== 'function') {
  throw new Error('produced source must export slugify()');
}

// --- Original behaviors (regression check, verbatim from hidden_tests/) ----

test('[empty-input] empty string returns empty string', () => {
  assert.equal(slugify(''), '');
});

test('[whitespace-only] whitespace-only returns empty string', () => {
  assert.equal(slugify('   '), '');
  assert.equal(slugify('\t\n  '), '');
});

test('[consecutive-separators] runs of separators collapse to single hyphen', () => {
  assert.equal(slugify('foo  bar'), 'foo-bar');
  assert.equal(slugify('a , b'), 'a-b');
});

test('[leading-trailing-separators] leading and trailing separators are trimmed', () => {
  assert.equal(slugify('  foo  '), 'foo');
  assert.equal(slugify('---bar---'), 'bar');
  assert.equal(slugify('!hello!'), 'hello');
});

test('[mixed-case] uppercase becomes lowercase', () => {
  assert.equal(slugify('FooBar'), 'foobar');
  assert.equal(slugify('HELLO World'), 'hello-world');
});

test('[punctuation] punctuation becomes hyphens', () => {
  assert.equal(slugify('hello, world!'), 'hello-world');
  assert.equal(slugify('a&b@c'), 'a-b-c');
});

test('[unicode-non-ascii] non-ASCII characters are handled (replaced or normalized)', () => {
  const cafe = slugify('café');
  assert.ok(
    cafe === 'caf' || cafe === 'caf-' || cafe === 'cafe' || cafe === 'caf-e',
    `expected slugify('café') to handle non-ASCII; got ${JSON.stringify(cafe)}`,
  );
  const cjk = slugify('hello 世界');
  assert.ok(
    cjk === 'hello' || cjk.startsWith('hello-'),
    `expected slugify('hello 世界') to begin with 'hello'; got ${JSON.stringify(cjk)}`,
  );
});

test('[mixed-case + consecutive-separators + leading-trailing] composite case', () => {
  assert.equal(slugify('  Hello,  World!  '), 'hello-world');
});

// --- New behaviors (additive, per edit.md: optional maxLength parameter) ---

test('[maxLength-omitted] omitting maxLength preserves original behavior', () => {
  assert.equal(slugify('hello world'), 'hello-world');
});

test('[maxLength-null-or-undefined] explicit null/undefined behave like omitted', () => {
  assert.equal(slugify('hello world', undefined), 'hello-world');
  assert.equal(slugify('hello world', null), 'hello-world');
});

test('[maxLength-zero-or-negative] zero or negative maxLength is treated as omitted (no truncation)', () => {
  assert.equal(slugify('hello world', 0), 'hello-world');
  assert.equal(slugify('hello world', -5), 'hello-world');
});

test('[maxLength-truncates] positive maxLength caps the produced slug', () => {
  const out = slugify('hello world this is a long slug', 11);
  assert.ok(out.length <= 11, `expected length <= 11; got ${out.length} (${out})`);
});

test('[maxLength-trims-trailing-hyphen] truncated slug never ends with a hyphen', () => {
  const out = slugify('hello world foo bar', 12);
  assert.ok(out.length <= 12);
  assert.ok(!out.endsWith('-'), `expected no trailing hyphen; got ${JSON.stringify(out)}`);
});
