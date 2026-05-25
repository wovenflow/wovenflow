// Predicate for label: caret-zero
// Description: A caret range with a zero major pins the next significant component:
//   '^0.2.3' := >=0.2.3 <0.3.0, and '^0.0.3' := >=0.0.3 <0.0.4. The agent's tests should include
//   at least one assertion exercising a caret range whose major version is 0.
// Strategy: Look for a quoted caret literal whose major component is 0 (^0.M.P), OR a
//   label/comment hint about caret + zero major combined with such a literal.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // ^0.M.P inside quotes (zero major).
    const caretZero = /(['"`])\^0\.\d+\.\d+/;
    if (caretZero.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }

    // Label/comment hint mentioning a zero-major caret AND a ^0. literal present.
    if (/zero[\s_-]*major|\^0\b|caret[^\n]{0,30}zero|0\.\d[^\n]{0,20}caret/i.test(text) &&
        /\^0\./.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }
  }
  return false;
}
