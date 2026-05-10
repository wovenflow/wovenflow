// Predicate for label: leading-edge
// Description: On the first call, the throttled function invokes the wrapped function synchronously (or within a vanishingly small delay). The agent's tests should include at least one assertion that the first call fires immediately.
// Strategy: Look for tests that label/comment about "leading", "first call", "immediate(ly)", or "synchronous(ly)" combined with an assertion on call count being 1 (or truthy) right after a single throttled invocation, before any timer advance. Either signal alone is diagnostic enough.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /\b(leading[- ]?edge|first[- ]call|fires?\s+immediately|immediate(?:ly)?|synchronous(?:ly)?|right\s+away|without\s+(?:any\s+)?(?:wait|delay))\b/i;
  // Code-shape: an assertion that callCount/calls.length/mock invocation count is 1 (or toHaveBeenCalledOnce / called once) appearing in a test about "leading"/"first"/"immediate".
  const assertOnceRe = /(toHaveBeenCalledTimes\s*\(\s*1\s*\)|toHaveBeenCalledOnce|callCount\s*(?:===|==|toBe|to\.equal|toEqual)\s*\(?\s*1|calls(?:\.length)?\s*(?:===|==|toBe|to\.equal|toEqual)\s*\(?\s*1|called\s+once|calledOnce)/i;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (labelRe.test(text) && assertOnceRe.test(text)) return true;
    // Strong label signal alone is diagnostic.
    if (/\bleading[- ]?edge\b/i.test(text)) return true;
    if (/first\s+call\s+(?:fires?|invokes?|runs?|happens?|executes?)\s+(?:immediately|synchronously|right\s+away)/i.test(text)) return true;
  }
  return false;
}
