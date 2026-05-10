// Predicate for label: last-page-partial
// Description: offset+limit exceeds total but offset<total — returns the remaining items, which is fewer than limit. The agent's tests should include at least one assertion exercising the partial-last-page case.
// Strategy: look for a test name/comment mentioning "last page", "partial", "remaining", or "fewer than limit" alongside an assertion whose result length is less than the requested limit.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const labelRe = /(?:it|test|describe)\s*\(\s*[`'"][^`'"]*(last[\s-]?page|partial|remain(ing|der)|fewer[\s-]?than[\s-]?limit|tail[\s-]?slice)[^`'"]*[`'"]/i;
    const commentRe = /(?:\/\/|\/\*|\*).*(last[\s-]?page|partial[\s-]?last|partial[\s-]?page|remain(ing|der)|fewer[\s-]?than[\s-]?limit)/i;

    const paginateCall = /paginate\s*\(/i;
    const assertion = /(expect|assert|equal|deepEqual|toEqual|toStrictEqual)/i;

    if ((labelRe.test(text) || commentRe.test(text)) && paginateCall.test(text) && assertion.test(text)) {
      return true;
    }

    // Fallback: a slice/length check where length is strictly less than the limit value
    // e.g. expect(result.items.length).toBeLessThan(limit) or items.length === 2 with limit 5
    if (/length\s*\)?\.?(?:toBeLessThan|<)\s*\(?\s*\d+/.test(text) && /\boffset\b/i.test(text) && /\blimit\b/i.test(text)) {
      return true;
    }
  }
  return false;
}
