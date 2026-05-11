// Hidden tests for the semver-parse task — POST-EDIT version.
// All tests from hidden_tests/ are included verbatim (regression check),
// plus new assertions for the additive edit (compare() export per edit.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');

const mod = await import(sourceDir + '/index.js');
const parse = mod.parse ?? mod.default;
const compare = mod.compare;
if (typeof parse !== 'function') {
  throw new Error('produced source must export parse()');
}
if (typeof compare !== 'function') {
  throw new Error('produced source must export compare() (post-edit)');
}

test('[basic-version] parses MAJOR.MINOR.PATCH', () => {
  const r = parse('1.2.3');
  assert.equal(r.major, 1);
  assert.equal(r.minor, 2);
  assert.equal(r.patch, 3);
  assert.equal(r.prerelease, null);
  assert.equal(r.build, null);
});

test('[basic-version] handles zeroes', () => {
  const r = parse('0.0.0');
  assert.equal(r.major, 0);
  assert.equal(r.minor, 0);
  assert.equal(r.patch, 0);
});

test('[prerelease-identifier] parses simple prerelease', () => {
  const r = parse('1.2.3-alpha');
  assert.equal(r.major, 1);
  assert.equal(r.prerelease, 'alpha');
  assert.equal(r.build, null);
});

test('[prerelease-identifier] parses dotted prerelease', () => {
  const r = parse('1.2.3-rc.1');
  assert.equal(r.prerelease, 'rc.1');
});

test('[build-metadata] parses build metadata', () => {
  const r = parse('1.2.3+sha.deadbeef');
  assert.equal(r.major, 1);
  assert.equal(r.prerelease, null);
  assert.equal(r.build, 'sha.deadbeef');
});

test('[build-metadata] parses build with hyphens', () => {
  const r = parse('1.0.0+20130313144700');
  assert.equal(r.build, '20130313144700');
});

test('[prerelease-and-build] parses both segments together', () => {
  const r = parse('1.2.3-alpha+sha.deadbeef');
  assert.equal(r.major, 1);
  assert.equal(r.prerelease, 'alpha');
  assert.equal(r.build, 'sha.deadbeef');
});

test('[invalid-shape] rejects too-few components', () => {
  assert.throws(() => parse('1.2'));
});

test('[invalid-shape] rejects too-many components', () => {
  assert.throws(() => parse('1.2.3.4'));
});

test('[invalid-shape] rejects empty string', () => {
  assert.throws(() => parse(''));
});

test('[invalid-shape] rejects non-version garbage', () => {
  assert.throws(() => parse('not a version'));
});

test('[leading-zeros] handles leading zeros consistently', () => {
  // Per semver, leading zeros are invalid. Either rejection or acceptance
  // with a documented choice is acceptable; we assert behavior is consistent.
  let rejects;
  try { parse('01.2.3'); rejects = false; } catch { rejects = true; }
  // The implementation must be one or the other for ALL leading-zero cases.
  let rejectsB;
  try { parse('1.02.3'); rejectsB = false; } catch { rejectsB = true; }
  assert.equal(
    rejects,
    rejectsB,
    'leading-zero handling must be consistent across positions',
  );
});

test('[non-numeric-component] rejects non-numeric major', () => {
  assert.throws(() => parse('a.2.3'));
});

test('[non-numeric-component] rejects non-numeric minor', () => {
  assert.throws(() => parse('1.b.3'));
});

test('[non-numeric-component] rejects non-numeric patch', () => {
  assert.throws(() => parse('1.2.c'));
});

// --- post-edit assertions: compare() ---

test('[compare-basic-precedence] orders by major, then minor, then patch', () => {
  assert.equal(compare('1.0.0', '2.0.0'), -1);
  assert.equal(compare('2.0.0', '1.0.0'), 1);
  assert.equal(compare('1.2.0', '1.3.0'), -1);
  assert.equal(compare('1.2.9', '1.2.10'), -1);
});

test('[compare-equal-versions] returns 0 for identical versions', () => {
  assert.equal(compare('1.2.3', '1.2.3'), 0);
  assert.equal(compare('0.0.0', '0.0.0'), 0);
});

test('[compare-prerelease-precedence] prerelease ranks below the plain version', () => {
  assert.equal(compare('1.0.0-alpha', '1.0.0'), -1);
  assert.equal(compare('1.0.0', '1.0.0-rc.1'), 1);
});

test('[compare-prerelease-segments] compares prerelease segments per semver rules', () => {
  // numeric segments compared numerically
  assert.equal(compare('1.0.0-alpha.1', '1.0.0-alpha.2'), -1);
  // numeric ranks below alphanumeric at the same position
  assert.equal(compare('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
  // shorter identifier list ranks below longer when leading segments match
  assert.equal(compare('1.0.0-alpha', '1.0.0-alpha.1'), -1);
});

test('[compare-build-metadata-ignored] build metadata does not affect ordering', () => {
  assert.equal(compare('1.0.0+build.1', '1.0.0+build.2'), 0);
  assert.equal(compare('1.0.0-alpha+build.1', '1.0.0-alpha+build.2'), 0);
});

test('[compare-rejects-malformed] propagates parse rejection on malformed input', () => {
  assert.throws(() => compare('not a version', '1.0.0'));
  assert.throws(() => compare('1.0.0', '1.2'));
});
