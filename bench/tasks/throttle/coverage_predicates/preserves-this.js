// Predicate for label: preserves-this
// Description: When the throttled function is called as a method (with a this binding), the wrapped function receives the same this. The agent's tests should include at least one assertion checking the this binding.
// Strategy: Look for tests that invoke the throttled fn as `obj.method()` or via `.call(ctx)` / `.apply(ctx)` and assert on `this` identity (e.g., capturing `this` inside the wrapped fn into a variable then asserting it === obj/ctx). Label hints: "this", "context", "binding", "preserve(s) this".
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /\b(preserve(?:s|d)?\s+this|this\s+(?:binding|context)|correct\s+this|same\s+this|forward(?:s|ed|ing)?\s+this|context\s+(?:binding|preserv|propagat)|bound\s+context|method\s+(?:invocation|context)|when\s+called\s+as\s+a\s+method)\b/i;
  // Code-shape: capture `this` and assert it equals an object, OR use .call/.apply with a context object and assert.
  const thisCaptureRe = /(function\s*\([^)]*\)\s*\{[^}]*\bthis\b|capturedThis|self\s*=\s*this|ctx\s*=\s*this|context\s*=\s*this|received(?:This|Context)|seenThis)/;
  const callApplyRe = /\.(call|apply)\s*\(\s*(?:obj|ctx|context|self|that|target|owner|host)\b/;
  const thisAssertRe = /(toBe\s*\(\s*(?:obj|ctx|context|self|that|target|owner|host)\b|to\.equal\s*\(\s*(?:obj|ctx|context|self|that|target|owner|host)\b|===\s*(?:obj|ctx|context|self|that|target|owner|host)\b|toEqual\s*\(\s*(?:obj|ctx|context|self|that|target|owner|host)\b)/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/throttle/i.test(text)) continue;
    if (labelRe.test(text)) return true;
    if (thisCaptureRe.test(text) && thisAssertRe.test(text)) return true;
    if (callApplyRe.test(text) && /\bthis\b/.test(text)) return true;
  }
  return false;
}
