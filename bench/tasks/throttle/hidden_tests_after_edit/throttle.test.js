// Hidden tests for throttle — POST-EDIT version.
// All tests from hidden_tests/ are included verbatim (regression check),
// plus new assertions for the additive edit (cancel() method per edit.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const throttle = mod.throttle ?? mod.default;
if (typeof throttle !== 'function') throw new Error('produced source must export throttle()');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

test('[leading-edge] first call fires immediately', () => {
  let calls = 0;
  const t = throttle(() => calls++, 50);
  t();
  assert.equal(calls, 1);
});

test('[single-call] one call results in exactly one invocation', async () => {
  let calls = 0;
  const t = throttle(() => calls++, 30);
  t();
  await wait(80);
  assert.equal(calls, 1);
});

test('[trailing-edge] last args used for trailing call', async () => {
  const seen = [];
  const t = throttle((x) => seen.push(x), 40);
  t('a');
  t('b');
  t('c');
  await wait(120);
  assert.ok(seen.includes('c'), `expected 'c' in trailing args; got ${JSON.stringify(seen)}`);
});

test('[burst-coalesced] burst of 5 rapid calls produces <5 invocations', async () => {
  let calls = 0;
  const t = throttle(() => calls++, 50);
  for (let i = 0; i < 5; i++) t();
  await wait(120);
  assert.ok(calls < 5, `expected coalesced < 5; got ${calls}`);
  assert.ok(calls >= 1);
});

test('[post-window-fires-immediately] new call after window fires immediately', async () => {
  let calls = 0;
  const t = throttle(() => calls++, 30);
  t();
  await wait(80);
  const before = calls;
  t();
  assert.equal(calls - before, 1, 'expected immediate fire after window');
});

test('[passes-arguments] arguments are forwarded to wrapped fn', () => {
  const seen = [];
  const t = throttle((...args) => seen.push(args), 30);
  t(1, 2, 3);
  assert.deepEqual(seen[0], [1, 2, 3]);
});

test('[preserves-this] this binding is preserved', () => {
  let captured;
  const t = throttle(function () { captured = this; }, 30);
  const obj = { t };
  obj.t();
  assert.equal(captured, obj);
});

// --- post-edit assertions: cancel() method on the returned throttled function ---

test('[cancel-method-exists] returned function exposes cancel()', () => {
  const t = throttle(() => {}, 50);
  assert.equal(typeof t.cancel, 'function');
});

test('[cancel-returns-undefined] cancel() returns undefined', () => {
  const t = throttle(() => {}, 50);
  t();
  assert.equal(t.cancel(), undefined);
});

test('[cancel-discards-pending-trailing] cancel discards a pending trailing call', async () => {
  const seen = [];
  const t = throttle((x) => seen.push(x), 40);
  t('a');
  t('b');
  t('c');
  t.cancel();
  await wait(120);
  // Trailing 'c' should NOT have fired; only the leading 'a' was invoked.
  assert.ok(!seen.includes('c'), `expected no trailing-edge fire after cancel; got ${JSON.stringify(seen)}`);
  assert.deepEqual(seen, ['a']);
});

test('[cancel-resets-window] next call after cancel fires immediately', async () => {
  let calls = 0;
  const t = throttle(() => calls++, 50);
  t();
  t.cancel();
  // No need to wait for the window — cancel reset it.
  t();
  assert.equal(calls, 2);
});

test('[cancel-fresh-noop] cancel before any call is a harmless no-op', () => {
  let calls = 0;
  const t = throttle(() => calls++, 50);
  assert.doesNotThrow(() => t.cancel());
  t();
  assert.equal(calls, 1);
});
