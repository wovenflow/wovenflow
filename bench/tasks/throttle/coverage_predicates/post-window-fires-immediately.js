// Predicate for label: post-window-fires-immediately
// Description: After the throttle window has elapsed and any trailing-edge call has fired, the next call outside the window fires immediately as a fresh leading edge. The agent's tests should include at least one assertion exercising this behavior.
// Strategy: Look for tests that advance the clock past the window and then make a follow-up call, with an assertion that the call fires (count incremented) immediately. Phrases like "after the window", "next window", "second window", "fresh leading edge", "again", "new window" combined with an additional timer-advance + invocation count step.
//
// LOW-CONFIDENCE: per the kappa pre-check (bench/kappa-pre-check/FINDINGS.md), all three blind raters' predicates failed to fire on the actual hidden test that exercises this label. Static text inspection cannot reliably detect "wait past window, then call again, then assert count delta" without lexical signals, and tests in the wild often don't carry such signals. The bench's headline self-test-coverage metric should report this label with a low-confidence flag and exclude it from the sensitivity-analysis variant.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelRe = /\b(after\s+(?:the\s+)?window|next\s+window|second\s+window|new\s+window|past\s+(?:the\s+)?window|window\s+(?:has\s+)?(?:elapsed|expired|passed)|fresh\s+leading|leading\s+edge\s+again|next\s+leading|outside\s+(?:the\s+)?window|reset(?:s)?\s+after|fires?\s+(?:again|immediately)\s+(?:after|once)|subsequent\s+(?:call|window))\b/i;
  // Multiple timer-advance occurrences are a structural signal of "wait past window, then call again, then wait again".
  const timerAdvanceRe = /(clock\.tick|advanceTimersByTime|advanceTimers|runAllTimers|jest\.advanceTimers|await\s+(?:new\s+)?Promise|setTimeout)/g;
  const callCountAssertRe = /(toHaveBeenCalledTimes|callCount|calls(?:\.length)?\s*(?:===|==|toBe|to\.equal|toEqual)|calledTwice|calledThrice)/;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    const advances = (text.match(timerAdvanceRe) || []).length;
    if (labelRe.test(text) && callCountAssertRe.test(text)) return true;
    // Code-shape: at least two clock advances + a count assertion of >=2 suggests "fired in window 1, fired again in window 2".
    if (advances >= 2 && /(toHaveBeenCalledTimes\s*\(\s*[2-9]|callCount\s*(?:===|==|toBe|to\.equal|toEqual)\s*\(?\s*[2-9]|calls(?:\.length)?\s*(?:===|==|toBe|to\.equal|toEqual)\s*\(?\s*[2-9]|calledTwice|calledThrice)/.test(text) && /throttle/i.test(text)) return true;
  }
  return false;
}
