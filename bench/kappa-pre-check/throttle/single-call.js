// Predicate for label: single-call
// Description: A single isolated call to the throttled function results in exactly one invocation of the wrapped function. The agent's tests should include at least one assertion exercising single-call behavior.
// Strategy: look for a test whose name/comment mentions a single/one/once isolated call, paired with an assertion that the underlying invocation count is exactly 1.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const singlePhrase = /\b(single\s+(call|invocation|isolated)|one\s+(call|invocation)|isolated\s+(call|invocation)|exactly\s+(one|once)|only\s+once|just\s+once|called?\s+once|once\s+only|one[\s-]?shot|fires?\s+once|invoked?\s+once)\b/i;
  const onceAssertion = /(toHaveBeenCalledTimes\s*\(\s*1\s*\)|toBeCalledTimes\s*\(\s*1\s*\)|toHaveBeenCalledOnce|toBeCalledOnce|callCount\s*[=!<>]==?\s*1\b|calls\.length\s*[=!<>]==?\s*1\b|\.calledOnce\b|toHaveBeenCalled\s*\(\s*\)|toBeCalled\s*\(\s*\)|toBe\s*\(\s*1\s*\)|toEqual\s*\(\s*1\s*\)|assert\.equal\s*\([^,]+,\s*1\b|strictEqual\s*\([^,]+,\s*1\b)/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (singlePhrase.test(text) && onceAssertion.test(text)) return true;
  }
  return false;
}
