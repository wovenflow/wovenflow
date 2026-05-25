// Hidden tests for the parse-duration task.
// Imports the produced source via BENCH_SOURCE_DIR env var.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');

const mod = await import(sourceDir + '/index.js');
const parseDuration = mod.parseDuration ?? mod.default;
if (typeof parseDuration !== 'function') {
  throw new Error('produced source must export parseDuration()');
}

test('[single-unit] milliseconds', () => {
  assert.equal(parseDuration('500ms'), 500);
});

test('[single-unit] hours', () => {
  assert.equal(parseDuration('2h'), 7200000);
});

test('[single-unit] all units', () => {
  assert.equal(parseDuration('1s'), 1000);
  assert.equal(parseDuration('1m'), 60000);
  assert.equal(parseDuration('1d'), 86400000);
  assert.equal(parseDuration('1w'), 604800000);
});

test('[combined-units] hours and minutes sum', () => {
  assert.equal(parseDuration('1h30m'), 5400000);
});

test('[combined-units] three segments sum', () => {
  assert.equal(parseDuration('1d2h30m'), 86400000 + 7200000 + 1800000);
});

test('[fractional-value] fractional hours', () => {
  assert.equal(parseDuration('1.5h'), 5400000);
});

test('[fractional-value] fractional seconds', () => {
  assert.equal(parseDuration('0.5s'), 500);
});

test('[surrounding-whitespace] leading and trailing spaces tolerated', () => {
  assert.equal(parseDuration('  2h  '), 7200000);
});

test('[order-independent] out-of-order segments sum the same', () => {
  assert.equal(parseDuration('30m1h'), parseDuration('1h30m'));
  assert.equal(parseDuration('30m1h'), 5400000);
});

test('[invalid-input] bare number with no unit is null', () => {
  assert.equal(parseDuration('100'), null);
});

test('[invalid-input] unknown unit is null', () => {
  assert.equal(parseDuration('5x'), null);
});

test('[invalid-input] garbage string is null', () => {
  assert.equal(parseDuration('abc'), null);
});

test('[empty-string] empty string is null', () => {
  assert.equal(parseDuration(''), null);
});

test('[zero-value] zero seconds is the number 0', () => {
  assert.equal(parseDuration('0s'), 0);
});

test('[zero-value] zero is a number, not null', () => {
  const r = parseDuration('0ms');
  assert.equal(r, 0);
  assert.equal(typeof r, 'number');
});
