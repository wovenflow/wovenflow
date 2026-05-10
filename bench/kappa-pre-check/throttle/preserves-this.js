// Predicate for label: preserves-this
// Description: When the throttled function is called as a method (with a this binding), the wrapped function receives the same this. The agent's tests should include at least one assertion checking the this binding.
// Strategy: look for "this" / context / binding language paired with an assertion that compares some captured this/context value to the expected receiver (or uses .call/.apply/.bind to set it).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const thisPhrase = /\b(this[\s-]?binding|this\s+(context|value|reference)|preserve(s|d|ing)?\s+(this|context|the\s+receiver)|receiver|context\s+(binding|preserved|forwarded)|method\s+(call|invocation|context)|bound\s+this|correct\s+this)\b/i;
  // patterns indicating a `this` is captured and asserted, or invocation as a method / via call/apply/bind
  const thisCheck = /(\.call\s*\(|\.apply\s*\(|\.bind\s*\(|capturedThis|capturedContext|self\s*=\s*this|thisArg|that\s*=\s*this|this\s*===|===\s*this\b|toBe\s*\(\s*(obj|context|self|that|owner|receiver)\b|toBe\s*\(\s*this\b|equal\s*\(\s*[^,]*this\b|strictEqual\s*\([^,]+,\s*(obj|context|self|that|owner|receiver|this)\b)/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (thisPhrase.test(text) && thisCheck.test(text)) return true;
  }
  return false;
}
