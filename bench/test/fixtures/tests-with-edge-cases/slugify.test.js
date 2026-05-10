// Placeholder agent-authored tests for B6 (coverage-of-hidden-cases scoring).
// Hits multiple labeled edge categories so scoreCoverage has signal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../source-clean/index.js';

test('empty-input', () => assert.equal(slugify(''), ''));
test('unicode', () => assert.equal(typeof slugify('café'), 'string'));
test('off-by-one', () => assert.equal(slugify('a'), 'a'));
