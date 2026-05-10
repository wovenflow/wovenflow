// Predicate for label: leading-edge
// Description: On the first call, the throttled function invokes the wrapped function synchronously (or within a vanishingly small delay). The agent's tests should include at least one assertion that the first call fires immediately.
// Strategy: look for a test block whose name/comment mentions leading/immediate/first-call behavior, paired with an assertion on the wrapped fn (typically a spy/mock with toHaveBeenCalled / called / callCount === 1) before any timer advance.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  // Phrases that indicate a leading-edge / fire-immediately scenario
  const leadingPhrase = /\b(leading[\s-]?edge|fires?\s+immediately|invokes?\s+immediately|calls?\s+immediately|first\s+call\s+(fires|invokes|runs|is\s+called|happens)|immediately\s+on\s+(first|the\s+first)\s+call|synchronously\s+on\s+(first|the\s+first)\s+call|sync(hronously)?\s+on\s+first|no\s+delay\s+on\s+first|without\s+(any\s+)?delay)\b/i;
  // An assertion that some call/invocation count is 1 or that a spy was called
  const callAssertion = /(toHaveBeenCalled(Times)?\s*\(\s*1?\s*\)|toBeCalled(Times)?\s*\(\s*1?\s*\)|\.callCount\s*[=!<>]==?\s*1|\.calls\.length\s*[=!<>]==?\s*1|\.called\b|\.calledOnce\b|called\s+once|equal\s*\(\s*1\b|strictEqual\s*\([^,]+,\s*1\b|toBe\s*\(\s*1\s*\)|toEqual\s*\(\s*1\s*\)|assert\.equal\s*\([^,]+,\s*1\b)/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (leadingPhrase.test(text) && callAssertion.test(text)) return true;
  }
  return false;
}
