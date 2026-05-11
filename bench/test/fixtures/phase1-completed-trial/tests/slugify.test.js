// Phase 1 produced tests for the slugify task — copied into the Phase 2
// worktree by dispatchEditTrial so the fresh agent has a starting test set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../source/index.js';

test('slugify is callable', () => {
  assert.equal(typeof slugify, 'function');
});

test('basic slugify', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});
