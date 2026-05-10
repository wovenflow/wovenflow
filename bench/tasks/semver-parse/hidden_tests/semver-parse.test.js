// Hidden tests for the semver-parse task.
// Imports the produced source via BENCH_SOURCE_DIR env var.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');

const mod = await import(sourceDir + '/index.js');
const parse = mod.parse ?? mod.default;
if (typeof parse !== 'function') {
  throw new Error('produced source must export parse()');
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
