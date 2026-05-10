import { test } from 'node:test';
import assert from 'node:assert/strict';

const sourceDir = process.env.BENCH_SOURCE_DIR;
if (!sourceDir) throw new Error('BENCH_SOURCE_DIR not set');
const mod = await import(sourceDir + '/index.js');
const createWindow = mod.createWindow ?? mod.default;
if (typeof createWindow !== 'function') throw new Error('produced source must export createWindow()');

test('[empty-window] no adds returns 0', () => {
  const w = createWindow(100);
  assert.equal(w.sum(1000), 0);
});

test('[all-within-window] all values inside TTL', () => {
  const w = createWindow(100);
  w.add(5, 950);
  w.add(7, 970);
  w.add(3, 1000);
  assert.equal(w.sum(1000), 15);
});

test('[some-expired] mix of expired and active', () => {
  const w = createWindow(100);
  w.add(10, 800); // expired at now=1000
  w.add(20, 950); // active
  w.add(30, 1000); // active
  assert.equal(w.sum(1000), 50);
});

test('[all-expired] every value older than TTL', () => {
  const w = createWindow(100);
  w.add(5, 100);
  w.add(10, 200);
  assert.equal(w.sum(10000), 0);
});

test('[exact-edge-excluded] value at now-ttlMs is excluded', () => {
  const w = createWindow(100);
  w.add(7, 900); // exactly now-ttlMs when now=1000
  assert.equal(w.sum(1000), 0);
});

test('[just-inside-edge-included] value at now-ttlMs+1 is included', () => {
  const w = createWindow(100);
  w.add(7, 901);
  assert.equal(w.sum(1000), 7);
});

test('[ordered-and-unordered-adds] out-of-order timestamps still summed correctly', () => {
  const w = createWindow(100);
  w.add(1, 1000);
  w.add(2, 950);
  w.add(3, 800); // expired at now=1000
  w.add(4, 980);
  assert.equal(w.sum(1000), 7); // 1 + 2 + 4
});
