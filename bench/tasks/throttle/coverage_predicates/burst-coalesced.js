// Predicate for label: burst-coalesced
// Description: Many rapid calls within one window result in only one or two underlying invocations (one leading-edge, optionally one trailing-edge), not one per call. The agent's tests should include at least one assertion that a burst of N>=3 rapid calls produces fewer than N invocations.
// Strategy: Look for either (a) a loop that calls the throttled fn N>=3 times paired with an assertion that call count is <= 2 / less than N, or (b) explicit labeling like "burst", "rapid", "coalesce", "many calls" combined with a numeric assertion bounded below the call count.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /\b(burst|rapid(?:ly)?|coalesc|many\s+calls?|multiple\s+calls?|repeated\s+calls?|spam(?:m(?:ed|ing))?|flood(?:ed|ing)?)\b/i;
  // Loop shape: for-loop with i < N (N >= 3), or Array.from({length: N}), or repeated synchronous calls.
  const loopRe = /(for\s*\([^)]*<\s*([3-9]|\d{2,})\s*;|for\s*\([^)]*<=\s*([2-9]|\d{2,})\s*;|Array(?:\.from)?\s*\(\s*\{?\s*length\s*:?\s*([3-9]|\d{2,})|\.times\s*\(\s*([3-9]|\d{2,})\s*[,)])/;
  // Assertion shape: count is 1 or 2, or less than N, or not equal to the loop count.
  const boundedAssertRe = /(toHaveBeenCalledTimes\s*\(\s*[12]\s*\)|toHaveBeenCalledOnce|callCount\s*(?:===|==|toBe|to\.equal|toEqual)\s*\(?\s*[12]\b|calls(?:\.length)?\s*(?:===|==|toBe|to\.equal|toEqual)\s*\(?\s*[12]\b|toBeLessThan|to\.be\.lessThan|<\s*(?:n|N|count|calls?|times|iterations?)|fewer\s+than|less\s+than|not\s+(?:N|n)\s+times|once|twice)/i;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    // Strong label signal alone.
    if (/\b(burst|coalesc)/i.test(text) && /(toHaveBeenCalled|callCount|calls\.length|calledOnce|calledTwice)/.test(text)) return true;
    if (loopRe.test(text) && boundedAssertRe.test(text)) return true;
    if (labelRe.test(text) && boundedAssertRe.test(text) && /(throttle|throttled)/i.test(text)) return true;
  }
  return false;
}
