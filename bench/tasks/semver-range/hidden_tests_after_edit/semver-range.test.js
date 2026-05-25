// Hidden tests for the semver-range task — POST-EDIT version.
// All tests from hidden_tests/ are included verbatim (regression check),
// plus new assertions for the additive edit (prerelease handling per edit.md).
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

// --- post-edit assertions: prerelease handling ---

test('[prerelease-excluded-by-default] prerelease excluded when range has no prerelease at its tuple', () => {
  // numerically in range, but no prerelease comparator at 1.2.3 -> excluded
  assert.equal(satisfies('1.2.3-beta.1', '>=1.0.0'), false);
  assert.equal(satisfies('1.2.3-beta.1', '^1.0.0'), false);
  assert.equal(satisfies('1.2.3-beta.1', '*'), false);
});

test('[prerelease-opt-in-same-tuple] prerelease allowed when comparator opts in at the same tuple', () => {
  assert.equal(satisfies('1.2.3-beta.2', '>=1.2.3-beta.1'), true);
  assert.equal(satisfies('1.2.3-beta.1', '>=1.2.3-beta.2'), false);
  assert.equal(satisfies('1.2.3-beta.1', '>=1.2.3-beta.1'), true);
});

test('[prerelease-opt-in-tuple-must-match] opt-in only applies at the comparators exact tuple', () => {
  // comparator prerelease is at 1.2.3; the candidate prerelease is at 1.2.4 -> still excluded
  assert.equal(satisfies('1.2.4-beta.1', '>=1.2.3-beta.1'), false);
});

test('[prerelease-segment-precedence] prerelease tags compared per semver precedence', () => {
  // numeric segments numeric, alphanumeric lexical, numeric ranks below alphanumeric,
  // shorter set ranks below longer when leading segments match
  assert.equal(satisfies('1.0.0-alpha.2', '>1.0.0-alpha.1'), true);
  assert.equal(satisfies('1.0.0-alpha.1', '>1.0.0-alpha.beta'), false); // numeric < alphanumeric
  assert.equal(satisfies('1.0.0-alpha.1', '>1.0.0-alpha'), true); // longer > shorter
});

test('[prerelease-release-outranks] a release version outranks its prereleases', () => {
  assert.equal(satisfies('1.2.3', '>=1.2.3-beta.1'), true);
  assert.equal(satisfies('1.2.3', '>1.2.3-beta.1'), true);
});

test('[prerelease-release-unaffected] release versions and plain ranges behave as before', () => {
  // no prerelease anywhere -> identical to phase-1 behavior
  assert.equal(satisfies('1.2.3', '>=1.0.0'), true);
  assert.equal(satisfies('1.5.0', '^1.2.3'), true);
  assert.equal(satisfies('2.0.0', '^1.2.3'), false);
});
