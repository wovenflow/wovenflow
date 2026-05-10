// Predicate for label: single-call
// Description: A single isolated call to the throttled function results in exactly one invocation of the wrapped function. The agent's tests should include at least one assertion exercising single-call behavior.
// Strategy: Look for tests where the throttled fn is invoked exactly once (no loop, single statement) followed by an assertion that the wrapped fn was called exactly once. Label hints: "single call", "one call", "called once", "isolated call", "only once".
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /\b(single\s+(?:isolated\s+)?call|one\s+call|isolated\s+call|called\s+(?:exactly\s+)?once|invok(?:ed|es)\s+(?:exactly\s+)?once|only\s+once|exactly\s+one|just\s+once)\b/i;
  const onceAssertRe = /(toHaveBeenCalledTimes\s*\(\s*1\s*\)|toHaveBeenCalledOnce|toBeCalledTimes\s*\(\s*1\s*\)|callCount\s*(?:===|==|toBe|to\.equal|toEqual)\s*\(?\s*1\b|calls(?:\.length)?\s*(?:===|==|toBe|to\.equal|toEqual)\s*\(?\s*1\b|calledOnce\b)/i;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/throttle/i.test(text)) continue;
    if (labelRe.test(text) && onceAssertRe.test(text)) return true;
    // Code-shape: a test block that contains a once-assertion without burst/loop indicators is diagnostic for single-call coverage.
    // We split into test/it blocks roughly and check.
    const blockRe = /(?:\bit|\btest|\bdescribe)\s*\(\s*(['"`])([^'"`]+)\1[\s\S]*?\}\s*\)/g;
    let m;
    while ((m = blockRe.exec(text)) !== null) {
      const block = m[0];
      const title = m[2];
      if (onceAssertRe.test(block) && /\b(single|one|once|isolated)\b/i.test(title)) return true;
    }
  }
  return false;
}
