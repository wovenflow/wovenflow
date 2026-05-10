// Predicate for label: preserves-this
// Description: When the throttled function is called as a method (with a this binding),
// the wrapped function receives the same this. Tests should check the this binding.
// Strategy: Look for `this` references inside the wrapped fn body in tests, or hints
// like "this binding"/"context"/"as a method", combined with an assertion that captures
// or compares `this`.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelHint = /(this[\s-]?binding|preserve[ds]?\s+this|context|as\s+a\s+method|method\s+call|call\s*\(|apply\s*\(|bind\s*\(|receiver)/i;
  // Code-shape: function uses `this` somewhere AND asserts something about it
  const thisInFn = /function\s*\([^)]*\)\s*\{[^}]*\bthis\b/;
  const thisAssert = /(\bthis\b[^;]*===?|toBe\s*\(\s*\w+\s*\)|toEqual\s*\(\s*\w+\s*\)|deepEqual|strictEqual|capturedThis|self\s*===?|context\s*===?|receivedThis)/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!labelHint.test(text)) continue;
    // Need either a non-arrow function body referencing `this`, or an assertion comparing this/context.
    if (!thisInFn.test(text) && !/\bthis\b/.test(text)) continue;
    if (!thisAssert.test(text) && !/(assert|expect)\b/.test(text)) continue;
    return true;
  }
  return false;
}
