// Placeholder agent-authored test fixture for B5 (self-test scoring).
// Mix of passing and failing assertions so a real scoreSelf can compute
// a non-trivial pass_count vs total_count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../source-clean/index.js';

test('slugify lowercases', () => assert.equal(slugify('HELLO'), 'hello'));
test('slugify spaces to dashes', () => assert.equal(slugify('a b'), 'a-b'));
test('slugify deliberately failing case', () => assert.equal(slugify('x'), 'NOT-X'));
