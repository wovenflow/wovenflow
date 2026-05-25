// Predicate for label: no-mutation
// Description: Neither target nor source is mutated; the function returns a fresh object such that
//   mutating the result at a merged path does not alter either input. The agent's tests should
//   include at least one assertion verifying an input is unchanged after the merge, or that
//   mutating the result does not leak into an input.
// Strategy: Look for evidence of an immutability check: a snapshot-then-compare of an input
//   (deepEqual/deepStrictEqual against a saved/clone), an assignment into the result followed by an
//   assertion on the original input, or a label/comment hint about mutation/immutability/unchanged
//   alongside a merge call.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const hasMerge = /\b(?:deep[_-]?merge|deepMerge|merge)\s*\(/.test(text);
    if (!hasMerge) continue;

    // 1) Snapshot a value (clone / structuredClone / JSON round-trip / spread copy) then compare.
    const snapshot = /(JSON\.parse\s*\(\s*JSON\.stringify|structuredClone|\.\.\.\s*[A-Za-z_$])/;
    const comparison = /(deepEqual|deepStrictEqual|notDeepEqual|toEqual|toStrictEqual|to\.deep\.equal|to\.eql|strictEqual|equal)\s*\(/;
    if (snapshot.test(text) && comparison.test(text)) return true;

    // 2) Mutate the result (result.x = ...  / r[..] = ...) then assert on an input identifier.
    const mutateResult = /\b([A-Za-z_$][A-Za-z0-9_$]*)(?:\.[A-Za-z0-9_$]+|\[[^\]]*\])+\s*=\s*[^=]/;
    if (mutateResult.test(text) && comparison.test(text)) {
      // ensure there is an assertion referencing a likely-input name
      if (/\b(target|source|original|input|a|b|first|second|obj1|obj2|left|right)\b/i.test(text)) {
        // and a mutation/immutability hint somewhere
        if (/\bmutat|\bimmutab|\bunchanged\b|\bnot\s+(?:modif|chang|mutat|alter)|\bleak\b|\bfresh\b|\bclone\b|\bcopy\b/i.test(text)) {
          return true;
        }
      }
    }

    // 3) Plain label/comment hint plus a merge call.
    if (/\bmutat(e|es|ed|ing|ion)\b|\bimmutab(le|ility)\b|\bunchanged\b|does\s+not\s+(?:modify|change|mutate|alter)|not\s+mutated|without\s+mutating|no[\s-]?mutation/i.test(text)) {
      return true;
    }
  }
  return false;
}
