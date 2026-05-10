// Predicate for label: cyclic-reference
// Description: An object that contains a reference back to itself does not cause infinite recursion when compared to itself or another cyclic object. The agent's tests should include at least one assertion exercising cyclic structures.
// Strategy: Look for self-assignment patterns like `x.foo = x` / `x[0] = x` / `a.b = a` (or via mutual references) combined with a deep-equal/equality assertion involving the same identifier.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // self-reference: ident.prop = ident   OR   ident[..] = ident
    const selfRefRe = /\b([A-Za-z_$][\w$]*)\s*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])\s*=\s*\1\b/;
    // mutual reference: a.x = b ; b.x = a (rough)
    const mutualRefRe = /\b([A-Za-z_$][\w$]*)\s*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])\s*=\s*([A-Za-z_$][\w$]*)\s*[;\n][\s\S]{0,200}?\b\2\s*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])\s*=\s*\1\b/;

    const selfMatch = text.match(selfRefRe);
    const mutualMatch = text.match(mutualRefRe);

    const hasCycleConstruction = !!(selfMatch || mutualMatch);

    // assertion mentioning the cyclic ident (or any equality assertion at all if label hits)
    const assertRe = /\b(?:deep[_-]?equal|deepEquals?|equals?|isEqual|toEqual|toBe|toStrictEqual|toDeepEqual|notDeepEqual|notEqual|deepStrictEqual|sameValue|assertEquals?|expect)\s*\(/;
    const hasAssertion = assertRe.test(text);

    const labelHit = /cycl(?:e|ic|es)|circular|self[\s_-]*reference|infinite\s+recurs/i.test(text);

    if (hasCycleConstruction && hasAssertion) return true;
    if (labelHit && hasAssertion && /\b([A-Za-z_$][\w$]*)\s*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])\s*=\s*[A-Za-z_$][\w$]*/.test(text)) {
      // label says cyclic and there is at least one ref-style assignment + an assertion
      return true;
    }
  }
  return false;
}
