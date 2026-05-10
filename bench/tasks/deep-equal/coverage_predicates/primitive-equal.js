// Predicate for label: primitive-equal
// Description: Two equal primitive values (e.g. 1 and 1, 'foo' and 'foo', true and true) compare as equal. The agent's tests should include at least one assertion exercising primitive equality.
// Strategy: Look for assertions where deepEqual / equal-style helpers are called with two identical primitive literals (numbers, strings, booleans).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // assertion-ish call name (deepEqual, equal, equals, eq, isEqual, toEqual, toBe, sameValue, strictEqual, etc.)
  const assertName = String.raw`(?:deep[_-]?equal|deepEquals?|equals?|eq|isEqual|toEqual|toBe|toStrictEqual|sameValue|strictEqual|notDeepEqual|notEqual|deepStrictEqual|assertEquals?)`;

  // primitive literal: number, single/double-quoted string, backtick string without ${, true/false
  const prim = String.raw`(?:-?\d+(?:\.\d+)?|'[^'\\\n$]*'|"[^"\\\n$]*"|\`[^\`$\\\n]*\`|true|false)`;

  // Pattern 1: helper(a, a, ...) — same primitive twice
  // Pattern 2: expect(a).toEqual(a) — same primitive in expect+matcher
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // Look at tests with comments/labels mentioning primitive equality near call
    const labelHit = /primitive[\s_-]*equal(?:ity)?|equal\s+primitive|same\s+primitive/i.test(text);

    // Same primitive on both sides of assertion call
    // helper(1, 1) or helper(1, 1, msg)
    const sameSidesRe = new RegExp(
      String.raw`\b` + assertName + String.raw`\s*\(\s*(` + prim + String.raw`)\s*,\s*\1\s*[,)]`,
      'g'
    );

    // expect(1).toEqual(1) / expect(1).toBe(1) / expect(1).toStrictEqual(1)
    const expectRe = new RegExp(
      String.raw`expect\s*\(\s*(` + prim + String.raw`)\s*\)\s*\.\s*(?:toEqual|toBe|toStrictEqual|toDeepEqual|deep\.equal|to\.equal|to\.deep\.equal)\s*\(\s*\1\s*\)`,
      'g'
    );

    // chai-style: expect(1).to.equal(1)
    const chaiRe = new RegExp(
      String.raw`expect\s*\(\s*(` + prim + String.raw`)\s*\)\s*\.\s*to(?:\.\w+)*\.equals?\s*\(\s*\1\s*\)`,
      'g'
    );

    if (sameSidesRe.test(text) || expectRe.test(text) || chaiRe.test(text)) {
      return true;
    }

    // Fallback: any deepEqual-ish call where both args are equal primitive literals (covers two different literals with equal value harder; this is intentionally narrow)
    if (labelHit) {
      const anyHelperPrim = new RegExp(
        String.raw`\b` + assertName + String.raw`\s*\(\s*` + prim + String.raw`\s*,\s*` + prim + String.raw`\s*[,)]`,
        'g'
      );
      if (anyHelperPrim.test(text)) return true;
    }
  }
  return false;
}
