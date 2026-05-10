// Predicate for label: burst-coalesced
// Description: Many rapid calls within one window result in only one or two underlying invocations (one leading-edge, optionally one trailing-edge), not one per call. The agent's tests should include at least one assertion that a burst of N>=3 rapid calls produces fewer than N invocations.
// Strategy: look for a loop/sequence producing >= 3 calls, paired with an assertion that the underlying invocation count is small (1, 2, or strictly less than the burst count).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const burstPhrase = /\b(burst|coalesc|rapid(ly)?|many\s+(calls|times|rapid)|multiple\s+(rapid\s+)?calls|N\s+calls|several\s+calls|repeatedly|spam(med|ming)?|rapid[\s-]?fire|in\s+(quick\s+)?succession)\b/i;
  // a loop that runs >= 3 times, or 3+ explicit invocations
  const loop = /(for\s*\(\s*(let|var|const)?\s*\w+\s*=\s*0[^;]*;\s*\w+\s*<\s*([3-9]|\d{2,})|for\s*\(\s*(let|var|const)?\s*\w+\s*=\s*1[^;]*;\s*\w+\s*<=?\s*([3-9]|\d{2,})|Array\.(from|of)\s*\(\s*\{?\s*length\s*:?\s*([3-9]|\d{2,})|\.fill\s*\([^)]*\)\.forEach|times\s*\(\s*([3-9]|\d{2,})|_\.times\s*\(\s*([3-9]|\d{2,}))/;
  // assertion that count is 1 or 2 or less than N
  const countAssertion = /(toHaveBeenCalledTimes\s*\(\s*[12]\s*\)|toBeCalledTimes\s*\(\s*[12]\s*\)|callCount\s*[=!<>]==?\s*[12]\b|calls\.length\s*[=!<>]==?\s*[12]\b|toBe\s*\(\s*[12]\s*\)|toEqual\s*\(\s*[12]\s*\)|assert\.equal\s*\([^,]+,\s*[12]\b|strictEqual\s*\([^,]+,\s*[12]\b|\.calledOnce\b|\.calledTwice\b|toBeLessThan|lessThan|\.lt\s*\(|<\s*\w+\.length)/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (burstPhrase.test(text) && (loop.test(text) || /\(\s*\)[\s;,]+(.*\(\s*\)[\s;,]+){2,}/.test(text)) && countAssertion.test(text)) return true;
  }
  return false;
}
