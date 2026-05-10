// Predicate for label: nan-equality
// Description: NaN compared to NaN returns true (despite native ===). The agent's tests should include at least one assertion exercising NaN handling.
// Strategy: Look for the literal NaN (or Number.NaN) inside any equality assertion or deepEqual call.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // Any test source mentioning NaN — strong signal
    const hasNaN = /\b(?:NaN|Number\.NaN)\b/.test(text);
    if (!hasNaN) continue;

    // NaN appears inside an assertion-ish helper call or expect(...) chain
    const naNInAssert = /(?:deep[_-]?equal|deepEquals?|equals?|isEqual|toEqual|toBe|toStrictEqual|toDeepEqual|notDeepEqual|notEqual|strictEqual|sameValue|assertEquals?|expect)\s*\(\s*[^)]*\b(?:NaN|Number\.NaN)\b[^)]*\)/;

    // label/comment hit
    const labelHit = /\bNaN\b|nan[\s_-]*equality|not[\s_-]*a[\s_-]*number/i.test(text);

    if (naNInAssert.test(text) || labelHit) {
      return true;
    }
  }
  return false;
}
