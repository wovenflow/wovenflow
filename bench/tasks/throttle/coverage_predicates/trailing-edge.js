// Predicate for label: trailing-edge
// Description: When the throttled function is called multiple times within one window, the wrapped function is called once at the END of the window with the most recent arguments. The agent's tests should include at least one assertion that a trailing-edge call fires after the window with the latest args.
// Strategy: Match tests that mention "trailing", "after the window", "end of window", or "latest/last arguments" — together with timer-advance code (clock.tick / advanceTimersBy / setTimeout-wait) and an assertion on either invocation count or argument identity reflecting the most recent call.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /\b(trailing[- ]?edge|after\s+(?:the\s+)?window|end\s+of\s+(?:the\s+)?window|latest\s+arg|last\s+arg|most\s+recent\s+arg|trailing\s+call)\b/i;
  const timerAdvanceRe = /(clock\.tick|advanceTimersByTime|advanceTimers|runAllTimers|runOnlyPendingTimers|jest\.advanceTimers|setTimeout|await\s+(?:new\s+)?Promise|sleep|delay|wait)/i;
  const argAssertRe = /(toHaveBeenCalledWith|calledWith|args\s*(?:===|==|toBe|to\.equal|toEqual|deep\.equal)|lastCall|mock\.calls\[)/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (/\btrailing[- ]?edge\b/i.test(text)) return true;
    if (labelRe.test(text) && timerAdvanceRe.test(text) && argAssertRe.test(text)) return true;
    if (/(latest|last|most\s+recent)\s+(?:arg|argument|value)/i.test(text) && argAssertRe.test(text) && timerAdvanceRe.test(text)) return true;
  }
  return false;
}
