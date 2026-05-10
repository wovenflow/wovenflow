// Predicate for label: passes-arguments
// Description: The wrapped function receives the arguments that were passed to the throttled
// function. Tests should include at least one assertion checking arguments.
// Strategy: Look for argument-related assertion patterns like toHaveBeenCalledWith,
// calledWith, .args, .calls[i][j], or assertions referencing argument values.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Code-shape: argument-checking assertions are a strong signal on their own.
  const argAssert = /(toHaveBeenCalledWith|toBeCalledWith|calledWith|calledWithExactly|firstCall\.args|lastCall\.args|getCall\(|\.calls\[\s*\d+\s*\]\[\s*\d+\s*\]|\.mock\.calls\[|\.args\[\s*\d+\s*\]|toHaveBeenLastCalledWith|toHaveBeenNthCalledWith)/;
  const labelHint = /(argument|args?\b|param|passed?\s+(to|with)|forward(ed)?\s+arg|with\s+the\s+(same|correct|right))/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (argAssert.test(text)) return true;
    // Fallback: hint + assertion that tests pass-through values
    if (labelHint.test(text) && /(assert|expect)\b/.test(text)) {
      // Look for any numeric/string literal forwarded through a fn invocation
      // followed by an assertion that mentions the same literal indirectly.
      // Conservative: require label hint + argAssert-ish pattern relaxed.
      if (/(received|got|equal|toBe|toEqual|deepEqual|strictEqual)/.test(text)) return true;
    }
  }
  return false;
}
