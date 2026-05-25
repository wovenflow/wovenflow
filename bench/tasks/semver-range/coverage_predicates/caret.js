// Predicate for label: caret
// Description: A caret range with a non-zero major (e.g. '^1.2.3' := >=1.2.3 <2.0.0) allows minor
//   and patch increases but not a major bump. The agent's tests should include at least one
//   assertion exercising a caret range with a non-zero major, including a version at or above the
//   next major being rejected.
// Strategy: Look for a quoted caret literal whose major component is non-zero (^N.M.P with N>=1),
//   OR a label/comment hint about caret combined with a non-zero-major caret literal.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // ^N.M.P where N is non-zero (a leading digit 1-9), inside quotes.
    const caretNonZero = /(['"`])\^[1-9]\d*\.\d+\.\d+/;
    if (caretNonZero.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }

    // Label/comment hint mentioning caret AND any non-zero-major caret literal present.
    if (/\bcaret\b|\^\d/.test(text) && /(['"`])\^[1-9]/.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }
  }
  return false;
}
