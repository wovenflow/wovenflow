// Predicate for label: post-window-fires-immediately
// Description: After the throttle window has elapsed and any trailing-edge call has fired,
// the next call outside the window fires immediately as a fresh leading edge. Tests should
// assert this behavior.
// Strategy: Look for hints like "after window"/"new window"/"fresh leading"/"next call" combined
// with a time-advance pattern that exceeds the window.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelHint = /(after\s+(?:the\s+)?window|new\s+window|next\s+window|outside\s+(?:the\s+)?window|fresh\s+leading|fires?\s+again|second\s+window|subsequent\s+call|post[\s-]?window|reset[s]?\b)/i;
  const timeAdvance = /(advanceTimersByTime|advanceTimers|runAllTimers|clock\.tick|tick\(|setTimeout|sleep|await\s+new\s+Promise|jest\.useFakeTimers|sinon\.useFakeTimers|vi\.useFakeTimers)/;
  const callAssert = /(toHaveBeenCalled(Times)?|toBeCalled(Times)?|callCount|\.calls\.length|calledOnce|calledTwice|calledThrice|toBe\(\s*[1-9]\b)/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!labelHint.test(text)) continue;
    if (!timeAdvance.test(text)) continue;
    if (!callAssert.test(text)) continue;
    return true;
  }
  return false;
}
