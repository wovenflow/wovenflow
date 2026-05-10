// Predicate for label: post-window-fires-immediately
// Description: After the throttle window has elapsed and any trailing-edge call has fired, the next call outside the window fires immediately as a fresh leading edge. The agent's tests should include at least one assertion exercising this behavior.
// Strategy: look for a test that mentions post-window / next-window / fresh leading edge, advances timers past the window, then makes a new call and asserts immediate invocation (count goes up before any further timer advance).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const postWindowPhrase = /\b(after\s+(the\s+)?(window|throttle|delay|timeout|interval)|post[\s-]?window|next\s+(window|cycle|leading)|fresh\s+(leading|window|throttle)|new\s+(window|leading[\s-]?edge|cycle)|window\s+(has\s+)?(elapsed|passed|expired|reset)|outside\s+(the\s+)?window|once\s+the\s+window|reset(s|ting)?\s+(after|the))\b/i;
  const timerAdvance = /(advanceTimersByTime|advanceTimers|runAllTimers|tick\s*\(|clock\.tick|jest\.advanceTimers|vi\.advanceTimers|useFakeTimers|await\s+sleep|await\s+wait|await\s+delay|setTimeout)/;
  // multiple invocations of the throttled function (so we have post-window call after initial)
  const callAssertion = /(toHaveBeenCalledTimes|toBeCalledTimes|callCount|calls\.length|calledOnce|calledTwice|calledThrice|toBe\s*\(\s*[23]\s*\)|toEqual\s*\(\s*[23]\s*\))/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (postWindowPhrase.test(text) && timerAdvance.test(text) && callAssertion.test(text)) return true;
  }
  return false;
}
