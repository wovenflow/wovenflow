// Predicate for label: single-call
// Description: A single isolated call to the throttled function results in exactly one
// invocation of the wrapped function. Tests should exercise single-call behavior.
// Strategy: Look for hints like "single"/"one call"/"once"/"isolated" combined with an
// assertion that the call count equals 1 (toHaveBeenCalledTimes(1), calledOnce, etc.).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelHint = /(single\s+call|one\s+call|called\s+once|exactly\s+once|isolated\s+call|just\s+once|only\s+once|single\s+invocation|one\s+invocation)/i;
  const onceAssert = /(toHaveBeenCalledTimes\s*\(\s*1\s*\)|toBeCalledTimes\s*\(\s*1\s*\)|calledOnce\b|callCount[^=]*===?\s*1\b|\.calls\.length\s*===?\s*1\b|toBe\s*\(\s*1\s*\)|assert(?:\.strictEqual|\.equal)?\([^,]*,\s*1\s*\))/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    // Strong: hint + once-assertion in same file
    if (labelHint.test(text) && onceAssert.test(text)) return true;
    // Fallback: a test description mentioning single/once and a once-assertion
    if (/(it|test|describe)\s*\(\s*['"`][^'"`]*\b(single|once|one\s+call|isolated)\b[^'"`]*['"`]/i.test(text)
        && onceAssert.test(text)) {
      return true;
    }
  }
  return false;
}
