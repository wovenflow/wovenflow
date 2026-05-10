// Predicate for label: array-equal
// Description: Two arrays with the same length and equal elements compare as equal; different length compares as not equal. The agent's tests should include at least one assertion exercising array equality.
// Strategy: Look for array literals ([...]) appearing as arguments in equality assertion calls or expect(...).toEqual(...) chains.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // helper([...], [...]) — both args are array literals
    const helperArrArr = /\b(?:deep[_-]?equal|deepEquals?|equals?|isEqual|toEqual|toStrictEqual|notDeepEqual|notEqual|deepStrictEqual|sameValue|assertEquals?)\s*\(\s*\[[^\[\]]*\]\s*,\s*\[[^\[\]]*\]\s*[,)]/;

    // expect([...]).toEqual([...]) / .toStrictEqual([...]) / .to.deep.equal([...])
    const expectArr = /expect\s*\(\s*\[[^\[\]]*\]\s*\)\s*\.\s*(?:not\s*\.\s*)?(?:toEqual|toBe|toStrictEqual|toDeepEqual|deep\.equal|to\.equal|to\.deep\.equal|to\.deep\.equals|to\.eql|to(?:\.\w+)*\.equals?)\s*\(\s*\[[^\[\]]*\]\s*\)/;

    // label-based: comment "array equality"/"arrays" with any array literal in an assertion
    const labelHit = /array[\s_-]*equal|arrays?\s+(?:are\s+)?equal|same\s+array|different\s+length/i.test(text);
    const anyAssertWithArray = /(?:deep[_-]?equal|deepEquals?|equals?|isEqual|toEqual|toBe|toStrictEqual|expect)\s*\([^)]*\[[^\[\]]*\][^)]*\)/;

    if (helperArrArr.test(text) || expectArr.test(text)) return true;
    if (labelHit && anyAssertWithArray.test(text)) return true;
  }
  return false;
}
