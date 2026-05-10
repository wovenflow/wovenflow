// Predicate for label: preserves-first-occurrence-order
// Description: When duplicates are removed, the order of remaining elements matches their first-occurrence order in the input. The agent's tests should include at least one assertion exercising order preservation with duplicates.
// Strategy: Look for a test name/comment referencing "order"/"first occurrence"/"preserves", or a code shape where input has a duplicate that appears later (e.g. [1,2,1,3]) and the expected output equals [1,2,3].
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const hasAssertion = /\b(expect|assert|deepEqual|deepStrictEqual|strictEqual|toEqual|toStrictEqual|to\.eql|to\.deep\.equal)\b/.test(text);
    const mentionsOrder = /(first[\s-]*occurrence|preserve[sd]?\s*order|maintain[sd]?\s*order|original\s*order|order\s*preserv|in\s*order|stable)/i.test(text);
    // Code-shape: an array literal with an interspersed duplicate, e.g. [1,2,1,3] or ['a','b','a','c'].
    const interspersedDup = /\[\s*([^\]]*?)\b(\d+|['"][^'"]*['"])\b([^\]]*?)\b\2\b([^\]]*?)\]/.test(text)
      && /\[[^\]]*,[^\]]*,[^\]]*,[^\]]*\]/.test(text);
    if (hasAssertion && mentionsOrder) return true;
    if (hasAssertion && interspersedDup && /\b(it|test|describe)\s*\(\s*['"`][^'"`]*(order|preserv|first)[^'"`]*['"`]/i.test(text)) return true;
  }
  return false;
}
