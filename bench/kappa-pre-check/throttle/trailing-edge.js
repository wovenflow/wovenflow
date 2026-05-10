// Predicate for label: trailing-edge
// Description: When the throttled function is called multiple times within one window, the wrapped function is called once at the END of the window with the most recent arguments. The agent's tests should include at least one assertion that a trailing-edge call fires after the window with the latest args.
// Strategy: look for a test that mentions trailing/end-of-window and uses a timer-advance helper (clock.tick / advanceTimersByTime / vi.advanceTimers / fake timers / sleep) plus an assertion on the latest/last/most-recent argument value.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const trailingPhrase = /\b(trailing[\s-]?edge|trailing\s+call|end\s+of\s+(the\s+)?window|after\s+(the\s+)?(window|throttle|delay|timeout|interval)|latest\s+(arg|args|argument|arguments|call|value)|last\s+(arg|args|argument|arguments|call|value)|most\s+recent\s+(arg|args|argument|arguments|call|value))\b/i;
  const timerAdvance = /(advanceTimersByTime|advanceTimers|runAllTimers|runOnlyPendingTimers|tick\s*\(|clock\.tick|jest\.advanceTimers|vi\.advanceTimers|sinon\.useFakeTimers|useFakeTimers|setTimeout\s*\(\s*[^,]+,\s*\d+\s*\)|setImmediate|await\s+sleep|await\s+wait|await\s+delay|await\s+new\s+Promise)/;
  // some assertion referencing a value that came from the last call
  const argAssert = /(toHaveBeenCalledWith|toBeCalledWith|calledWith|lastCall|lastCalledWith|mostRecentCall|mock\.calls|\.args\b|withArgs)/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (trailingPhrase.test(text) && timerAdvance.test(text) && argAssert.test(text)) return true;
  }
  return false;
}
