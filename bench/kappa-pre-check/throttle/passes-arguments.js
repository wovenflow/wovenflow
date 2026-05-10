// Predicate for label: passes-arguments
// Description: The wrapped function receives the arguments that were passed to the throttled function (correctly, for whichever invocation the underlying call corresponds to). The agent's tests should include at least one assertion checking arguments.
// Strategy: look for an assertion form that checks the args the spy/mock was called with (toHaveBeenCalledWith / calledWith / mock.calls[i] / .args), or for a comment/test name about argument forwarding/passing.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  const argsAssertion = /(toHaveBeenCalledWith|toBeCalledWith|nthCalledWith|lastCalledWith|calledWith|calledWithExactly|withArgs|mock\.calls\s*\[\s*\d+\s*\]\s*\[|\.args\s*\[\s*\d+\s*\]|firstCall\.args|lastCall\.args|getCall\s*\(\s*\d+\s*\)\.args|spy\.args)/;
  const argsPhrase = /\b(pass(es|ed|ing)?\s+(the\s+)?(arg|args|argument|arguments)|forward(s|ed|ing)?\s+(the\s+)?(arg|args|argument|arguments)|receive(s|d)?\s+(the\s+)?(arg|args|argument|arguments)|with\s+(the\s+)?(correct|right|same)\s+(arg|args|argument|arguments)|argument\s+(passing|forwarding))\b/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (argsAssertion.test(text) && argsPhrase.test(text)) return true;
  }
  return false;
}
