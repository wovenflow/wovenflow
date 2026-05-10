// Predicate for label: primitive-unequal
// Description: Two unequal primitive values compare as not equal. The agent's tests should include at least one assertion exercising primitive inequality.
// Strategy: Look for assertions that produce a falsy/inequality result on two distinct primitive literals — either explicit notDeepEqual/notEqual style helpers, or equality helpers asserted to be false / not.toEqual / etc.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  const prim = String.raw`(?:-?\d+(?:\.\d+)?|'[^'\\\n$]*'|"[^"\\\n$]*"|\`[^\`$\\\n]*\`|true|false)`;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // not.deepEqual / notEqual / notDeepEqual on two primitives
    const notHelper = new RegExp(
      String.raw`\b(?:notDeepEqual|notEqual|notStrictEqual|notDeepStrictEqual|assertNotEquals?)\s*\(\s*` +
        prim + String.raw`\s*,\s*` + prim + String.raw`\s*[,)]`,
      'g'
    );

    // expect(prim).not.toEqual(prim) / not.toBe(prim) / .to.not.equal(prim)
    const notExpect = new RegExp(
      String.raw`expect\s*\(\s*` + prim + String.raw`\s*\)\s*\.\s*(?:not\.(?:toEqual|toBe|toStrictEqual|toDeepEqual)|to(?:\.\w+)*\.not\.equals?)\s*\(\s*` +
        prim + String.raw`\s*\)`,
      'g'
    );

    // assert.equal(deepEqual(a,b), false) where a,b are primitive literals
    const eqFalse = new RegExp(
      String.raw`(?:deep[_-]?equal|deepEquals?|isEqual)\s*\(\s*` + prim + String.raw`\s*,\s*` + prim +
        String.raw`\s*\)\s*\)?\s*[,;]?\s*(?:===\s*false|toBe\s*\(\s*false\s*\)|toEqual\s*\(\s*false\s*\))`,
      'g'
    );

    // assertFalse(deepEqual(a, b)) / refute(...)
    const assertFalseLike = new RegExp(
      String.raw`(?:assertFalse|refute|isFalse|toBeFalsy)\s*\(\s*(?:deep[_-]?equal|deepEquals?|isEqual)\s*\(\s*` +
        prim + String.raw`\s*,\s*` + prim + String.raw`\s*\)\s*\)`,
      'g'
    );

    // label-based with code-shape: comment mentions inequality/unequal/not equal AND any equality helper call exists nearby
    const labelHit = /(?:not\s+equal|unequal|inequality|primitive[\s_-]*unequal|different\s+primitive)/i.test(text);
    const anyHelperPrim = new RegExp(
      String.raw`\b(?:deep[_-]?equal|deepEquals?|equals?|isEqual|toEqual|toBe|toStrictEqual|notDeepEqual|notEqual)\s*\(\s*` +
        prim + String.raw`\s*,\s*` + prim + String.raw`\s*[,)]`,
      'g'
    );

    if (notHelper.test(text) || notExpect.test(text) || eqFalse.test(text) || assertFalseLike.test(text)) {
      return true;
    }
    if (labelHit && anyHelperPrim.test(text)) {
      return true;
    }
  }
  return false;
}
