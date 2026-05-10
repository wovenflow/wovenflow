// Predicate for label: trailing-edge
// Description: When the throttled function is called multiple times within one window,
// the wrapped function is called once at the END of the window with the most recent
// arguments. Tests should assert a trailing-edge call fires after the window with the
// latest args.
// Strategy: Look for "trailing"/"end of window"/"latest"/"last args" hints with a
// time-advance pattern (jest.advanceTimersByTime, setTimeout, clock.tick, sleep, await new Promise).
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const labelHint = /(trailing[\s-]?edge|end\s+of\s+(the\s+)?window|after\s+the\s+window|latest\s+arg|last\s+arg|most\s+recent\s+arg|trailing\s+call)/i;
  const timeAdvance = /(advanceTimersByTime|advanceTimers|runAllTimers|runOnlyPendingTimers|clock\.tick|tick\(|setTimeout|sleep|await\s+new\s+Promise|jest\.useFakeTimers|sinon\.useFakeTimers|vi\.useFakeTimers|vi\.advanceTimers)/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!labelHint.test(text)) continue;
    if (!timeAdvance.test(text)) continue;
    return true;
  }
  return false;
}
