// Hidden tests for the slugify task.
// Imports the produced source via BENCH_SOURCE_DIR env var (set by scoreHidden
// per the bench harness). Tests are labeled in their names so that a per-label
// pass map can be reconstructed from the TAP output.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');

const mod = await import(sourceDir + '/index.js');
const slugify = mod.slugify ?? mod.default;
if (typeof slugify !== 'function') {
  throw new Error('produced source must export slugify()');
}

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
  // Either replacement-with-hyphen OR ASCII-folding is acceptable.
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
