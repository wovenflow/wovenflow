// Predicate for label: object-equal
// Description: Two plain objects with the same keys and equal values compare as equal; different keys compare as not equal. The agent's tests should include at least one assertion exercising object equality.
// Strategy: Look for plain-object literals ({...}) as arguments in equality assertions / expect chains.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // helper({...}, {...}) — both args object literals (no nested braces; nesting handled in nested-structure)
    const helperObjObj = /\b(?:deep[_-]?equal|deepEquals?|equals?|isEqual|toEqual|toStrictEqual|notDeepEqual|notEqual|deepStrictEqual|sameValue|assertEquals?)\s*\(\s*\{[^{}]*\}\s*,\s*\{[^{}]*\}\s*[,)]/;

    // expect({...}).toEqual({...}) / .toStrictEqual / .to.deep.equal / .to.eql
    const expectObj = /expect\s*\(\s*\{[^{}]*\}\s*\)\s*\.\s*(?:not\s*\.\s*)?(?:toEqual|toBe|toStrictEqual|toDeepEqual|deep\.equal|to\.equal|to\.deep\.equal|to\.deep\.equals|to\.eql|to(?:\.\w+)*\.equals?)\s*\(\s*\{[^{}]*\}\s*\)/;

    const labelHit = /object[\s_-]*equal|objects?\s+(?:are\s+)?equal|same\s+keys?|different\s+keys?/i.test(text);
    const anyAssertWithObj = /(?:deep[_-]?equal|deepEquals?|equals?|isEqual|toEqual|toBe|toStrictEqual|expect)\s*\([^)]*\{[^{}]*\}[^)]*\)/;

    if (helperObjObj.test(text) || expectObj.test(text)) return true;
    if (labelHit && anyAssertWithObj.test(text)) return true;
  }
  return false;
}
