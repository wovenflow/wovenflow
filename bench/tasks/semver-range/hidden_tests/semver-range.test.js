// Hidden tests for the semver-range task.
// Imports the produced source via BENCH_SOURCE_DIR env var.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');

const mod = await import(sourceDir + '/index.js');
const satisfies = mod.satisfies ?? mod.default;
if (typeof satisfies !== 'function') {
  throw new Error('produced source must export satisfies()');
}

test('[exact] exact version matches only itself', () => {
  assert.equal(satisfies('1.2.3', '1.2.3'), true);
  assert.equal(satisfies('1.2.4', '1.2.3'), false);
  assert.equal(satisfies('1.2.3', '1.2.0'), false);
});

test('[exact] bare version and =version are equivalent', () => {
  assert.equal(satisfies('1.2.3', '=1.2.3'), true);
  assert.equal(satisfies('1.2.4', '=1.2.3'), false);
});

test('[comparator] greater-than and greater-or-equal', () => {
  assert.equal(satisfies('1.2.4', '>1.2.3'), true);
  assert.equal(satisfies('1.2.3', '>1.2.3'), false);
  assert.equal(satisfies('1.2.3', '>=1.2.3'), true);
  assert.equal(satisfies('1.2.2', '>=1.2.3'), false);
});

test('[comparator] less-than and less-or-equal', () => {
  assert.equal(satisfies('1.2.2', '<1.2.3'), true);
  assert.equal(satisfies('1.2.3', '<1.2.3'), false);
  assert.equal(satisfies('1.2.3', '<=1.2.3'), true);
  assert.equal(satisfies('1.2.4', '<=1.2.3'), false);
});

test('[comparator] ordering crosses minor and major boundaries', () => {
  assert.equal(satisfies('1.3.0', '>1.2.9'), true);
  assert.equal(satisfies('2.0.0', '>1.99.99'), true);
  assert.equal(satisfies('1.10.0', '>1.9.0'), true); // numeric, not lexical
});

test('[caret] caret allows up to next major', () => {
  assert.equal(satisfies('1.2.3', '^1.2.3'), true);
  assert.equal(satisfies('1.9.9', '^1.2.3'), true);
  assert.equal(satisfies('2.0.0', '^1.2.3'), false);
  assert.equal(satisfies('1.2.2', '^1.2.3'), false); // below the floor
});

test('[caret-zero] caret with zero major pins minor', () => {
  // ^0.2.3 := >=0.2.3 <0.3.0
  assert.equal(satisfies('0.2.3', '^0.2.3'), true);
  assert.equal(satisfies('0.2.9', '^0.2.3'), true);
  assert.equal(satisfies('0.3.0', '^0.2.3'), false);
  assert.equal(satisfies('0.2.2', '^0.2.3'), false);
});

test('[caret-zero] caret with zero major and minor pins patch', () => {
  // ^0.0.3 := >=0.0.3 <0.0.4
  assert.equal(satisfies('0.0.3', '^0.0.3'), true);
  assert.equal(satisfies('0.0.4', '^0.0.3'), false);
});

test('[tilde] tilde allows patch-level changes only', () => {
  // ~1.2.3 := >=1.2.3 <1.3.0
  assert.equal(satisfies('1.2.3', '~1.2.3'), true);
  assert.equal(satisfies('1.2.9', '~1.2.3'), true);
  assert.equal(satisfies('1.3.0', '~1.2.3'), false);
  assert.equal(satisfies('1.2.2', '~1.2.3'), false);
});

test('[x-range] patch wildcard matches the minor series', () => {
  // 1.2.x := >=1.2.0 <1.3.0
  assert.equal(satisfies('1.2.0', '1.2.x'), true);
  assert.equal(satisfies('1.2.9', '1.2.x'), true);
  assert.equal(satisfies('1.3.0', '1.2.x'), false);
  assert.equal(satisfies('1.2.5', '1.2.*'), true);
});

test('[x-range] minor wildcard matches the major series', () => {
  // 1.x := >=1.0.0 <2.0.0
  assert.equal(satisfies('1.0.0', '1.x'), true);
  assert.equal(satisfies('1.99.99', '1.x'), true);
  assert.equal(satisfies('2.0.0', '1.x'), false);
  assert.equal(satisfies('0.9.9', '1.x'), false);
});

test('[x-range] star matches anything', () => {
  assert.equal(satisfies('0.0.0', '*'), true);
  assert.equal(satisfies('99.99.99', '*'), true);
});

test('[or] OR matches if any part matches', () => {
  assert.equal(satisfies('1.2.3', '1.2.3 || >=2.0.0'), true);
  assert.equal(satisfies('2.5.0', '1.2.3 || >=2.0.0'), true);
  assert.equal(satisfies('1.5.0', '1.2.3 || >=2.0.0'), false);
});

test('[and] space-separated comparators are ANDed', () => {
  assert.equal(satisfies('1.5.0', '>=1.2.0 <2.0.0'), true);
  assert.equal(satisfies('1.2.0', '>=1.2.0 <2.0.0'), true);
  assert.equal(satisfies('2.0.0', '>=1.2.0 <2.0.0'), false);
  assert.equal(satisfies('1.0.0', '>=1.2.0 <2.0.0'), false);
});

test('[and] AND and OR combine with correct precedence', () => {
  // (>=1.0.0 <1.5.0) OR (>=2.0.0)
  const range = '>=1.0.0 <1.5.0 || >=2.0.0';
  assert.equal(satisfies('1.4.9', range), true);
  assert.equal(satisfies('1.5.0', range), false);
  assert.equal(satisfies('2.0.0', range), true);
  assert.equal(satisfies('1.9.0', range), false);
});
