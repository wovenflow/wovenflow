// Predicate for label: tilde
// Description: A tilde range (e.g. '~1.2.3' := >=1.2.3 <1.3.0) allows patch-level changes but pins
//   major and minor. The agent's tests should include at least one assertion exercising a tilde
//   range, including a version at the next minor being rejected.
// Strategy: Look for a quoted tilde literal (~M.M.P) used as a range, OR a label/comment hint
//   about tilde combined with a tilde literal.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // ~M.M.P (or ~M.M / ~M) inside quotes.
    const tildeLit = /(['"`])~\d+(?:\.\d+){0,2}/;
    if (tildeLit.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }

    // Label/comment hint mentioning tilde AND a tilde literal present.
    if (/\btilde\b/i.test(text) && /~\d/.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }
  }
  return false;
}
