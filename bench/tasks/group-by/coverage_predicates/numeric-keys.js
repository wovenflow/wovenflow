// Predicate for label: numeric-keys
// Description: The keyFn returns numbers (or numbers convertible to keys). Resulting object keys may be string-coerced; the test should still find groups under those keys. The agent's tests should include at least one assertion exercising numeric-keyed grouping.
// Strategy: Look for a groupBy call whose keyFn body or arrow returns a numeric expression, optionally paired with a numeric-keys label/comment.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/groupBy\s*\(/.test(text)) continue;
    // Label/comment hint.
    const labelHints = /(numeric[-_ ]?keys?|number[-_ ]?keys?|integer[-_ ]?keys?|numeric[-_ ]?keyed|numeric[-_ ]?grouping)/i;
    if (labelHints.test(text)) return true;
    // Code-shape: keyFn that does arithmetic / Math.* / parseInt / Number(), or returns a numeric property.
    // e.g. x => x % 2, x => Math.floor(...), item => item.age, x => x.length
    const arrowReturnsNumber = /=>\s*[^,\n;]*?(\b(?:Math\.|parseInt|parseFloat|Number\s*\()|%\s*\d|\.length\b|\bNaN\b)/;
    if (arrowReturnsNumber.test(text)) return true;
    // function keyFn { return <numeric>; }
    if (/function[^()]*\([^)]*\)\s*\{[^}]*return\s+[^;]*?(?:Math\.|parseInt|parseFloat|Number\s*\(|%\s*\d|\.length\b)/.test(text)) return true;
  }
  return false;
}
