// Predicate for label: cyclic-reference
// Description: An object that contains a reference back to itself does not cause infinite recursion when compared to itself or another cyclic object. The agent's tests should include at least one assertion exercising cyclic structures.
// Strategy: A test file constructs a self-referential structure (an assignment of the form `x.<key> = x` / `x[<key>] = x` / cycle between two vars) AND has at least one equal-style assertion call.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    if (!/\b\w*[Ee]quals?\s*\(/.test(text)) continue;

    // 1) Direct self-reference: same identifier on both sides of assignment. E.g. `a.self = a;` or `a["self"] = a;`
    const selfRe = /\b([A-Za-z_$][\w$]*)\s*(?:\.\w+|\[[^\]]+\])(?:\s*\.\w+|\s*\[[^\]]+\])*\s*=\s*\1\b/;
    if (selfRe.test(text)) return true;

    // 2) Mutual cycle: `a.x = b;` and `b.y = a;`
    const assignRe = /\b([A-Za-z_$][\w$]*)\s*(?:\.\w+|\[[^\]]+\])\s*=\s*([A-Za-z_$][\w$]*)\b/g;
    const edges = new Map(); // src -> Set of dsts
    let m;
    while ((m = assignRe.exec(text)) !== null) {
      const src = m[1], dst = m[2];
      if (src === dst) continue; // already covered above
      if (!edges.has(src)) edges.set(src, new Set());
      edges.get(src).add(dst);
    }
    for (const [src, dsts] of edges) {
      for (const dst of dsts) {
        const back = edges.get(dst);
        if (back && back.has(src)) return true;
      }
    }

    // 3) Label/comment fallback
    if (/cyclic|circular|self[-_ ]?reference|cycle\b/i.test(text)) return true;
  }
  return false;
}
