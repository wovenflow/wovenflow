// Predicate for label: burst-coalesced
// Description: Many rapid calls within one window result in only one or two underlying
// invocations (one leading-edge, optionally one trailing-edge), not one per call. Tests
// should assert a burst of N>=3 rapid calls produces fewer than N invocations.
// Strategy: Look for burst/coalesce/multiple-calls hints, OR detect a code shape with a
// loop or repeated invocations followed by an assertion that the call count is small (1 or 2).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelHint = /(burst|coalesce[ds]?|rapid(ly)?|multiple\s+calls|many\s+calls|throttle[ds]?|debounce[ds]?|N\s*calls|3\s+calls|several\s+calls)/i;
  // Code-shape: a loop calling the throttled fn, OR several consecutive call statements.
  const loopShape = /\bfor\s*\(|\.forEach\s*\(|while\s*\(|Array\.from\s*\(\s*\{\s*length/;
  // Or: explicit assertion that the wrapped fn was called less than the number of calls
  const smallCountAssert = /(toHaveBeenCalledTimes\s*\(\s*[12]\s*\)|toBeCalledTimes\s*\(\s*[12]\s*\)|callCount[^=]*===?\s*[12]\b|\.calls\.length\s*===?\s*[12]\b|calledOnce|calledTwice|toBe\(\s*[12]\s*\)|assert(?:\.strictEqual|\.equal)?\([^,]*,\s*[12]\s*\))/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!labelHint.test(text)) continue;
    if (!(loopShape.test(text) || smallCountAssert.test(text))) continue;
    return true;
  }
  return false;
}
