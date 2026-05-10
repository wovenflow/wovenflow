// Predicate for label: passes-arguments
// Description: The wrapped function receives the arguments that were passed to the throttled function (correctly, for whichever invocation the underlying call corresponds to). The agent's tests should include at least one assertion checking arguments.
// Strategy: Look for argument-checking assertions (toHaveBeenCalledWith / calledWith / mock.calls[i] / spy.args / lastCall.args) combined with a throttle context. Either the structural signal is enough when used with a throttled fn invocation, or label hints like "argument(s)", "passes arg", "forwards arg" reinforce it.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const argShapeRe = /(toHaveBeenCalledWith|toBeCalledWith|\.calledWith\b|mock\.calls\s*\[\s*\d+\s*\]\s*\[\s*\d+\s*\]|\.lastCall(?:\.args)?|spy\.args\b|\.firstCall\.args|\.getCall\s*\(\s*\d+\s*\)\.args|args\s*\[\s*\d+\s*\]\s*(?:===|==|toBe|to\.equal|toEqual|deep\.equal))/;
  const labelRe = /\b(pass(?:es|ed|ing)?\s+arg|forward(?:s|ed|ing)?\s+arg|receive(?:s|d)?\s+(?:the\s+)?arg|with\s+(?:the\s+)?(?:correct|right|same|provided)\s+arg|argument(?:s)?\b)/i;
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/throttle/i.test(text)) continue;
    if (argShapeRe.test(text)) return true;
    if (labelRe.test(text) && /(toHaveBeenCalled|calledWith|calls\[|spy\.args|\.args\b)/.test(text)) return true;
  }
  return false;
}
