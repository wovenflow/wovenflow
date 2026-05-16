// Strict test source — asserts that negatives throw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { widget } from './index.js';

test('doubles positives', () => {
  assert.equal(widget(3), 6);
});

test('rejects negatives', () => {
  assert.throws(() => widget(-1));
});

test('rejects non-numbers', () => {
  assert.throws(() => widget('x'));
});
