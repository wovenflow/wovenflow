// Hidden suite for the widget fixture task. Only checks the doubling
// behaviour for positives — leaves the negative-handling decision to the
// per-trial test sources, which is exactly the "permissive hidden suite"
// scenario the cross-test matrix is built to expose.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const widget = mod.widget;

test('[basic] doubles 3 to 6', () => {
  assert.equal(widget(3), 6);
});

test('[basic] doubles 0 to 0', () => {
  assert.equal(widget(0), 0);
});
