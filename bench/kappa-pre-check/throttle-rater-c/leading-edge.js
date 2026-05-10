// Predicate for label: leading-edge
// Description: On the first call, the throttled function invokes the wrapped function
// synchronously (or within a vanishingly small delay). The agent's tests should include
// at least one assertion that the first call fires immediately.
// Strategy: Look for "leading"/"immediately"/"first call"/"sync" hints near assertions
// (toHaveBeenCalled-style or expect/assert with count 1) without prior timer advance.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelHint = /(leading[\s-]?edge|fires?\s+immediately|first\s+call|invoke[ds]?\s+immediately|synchronously|right\s+away|without\s+(?:any\s+)?delay)/i;
  // Code-shape: an assertion checking the wrapped fn was called (or call count >= 1)
  const callAssert = /(toHaveBeenCalled(Times)?|toBeCalled(Times)?|callCount|\.calls\.length|called\s*===?\s*1|calledOnce|assert(?:\.strictEqual|\.equal)?\([^,]*,\s*1\b|toBe\(\s*1\s*\))/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!labelHint.test(text)) continue;
    if (!callAssert.test(text)) continue;
    // Hint and assertion both present somewhere in the same test file.
    return true;
  }
  return false;
}
