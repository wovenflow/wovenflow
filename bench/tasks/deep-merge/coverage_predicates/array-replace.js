// Predicate for label: array-replace
// Description: Arrays are treated as scalar values: a source array replaces the target value
//   entirely instead of being concatenated or element-wise merged. The agent's tests should
//   include at least one assertion exercising array replacement.
// Strategy: Find a deepMerge call where at least one argument contains an array literal as a value
//   (a "key: [...]" shape), combined with either a second array literal on the other side or a
//   label/comment hint about replace/replaced/not concatenated/array.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Does this blob contain an array literal as a property value?
  function hasArrayValue(blob) {
    return /:\s*\[/.test(blob);
  }

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const callRe = /\b(?:deep[_-]?merge|merge|deepMerge)\s*\(\s*(\{[^]*?\})\s*,\s*(\{[^]*?\})\s*[,)]/g;
    let m;
    let anyArrayInCall = false;
    while ((m = callRe.exec(text)) !== null) {
      const a = hasArrayValue(m[1]);
      const b = hasArrayValue(m[2]);
      // source side holds an array -> a replacement scenario
      if (b) return true;
      if (a || b) anyArrayInCall = true;
    }

    // Label/comment hint about array replacement, given any array appears in a merge call.
    if (anyArrayInCall &&
        /\barray(s)?\b[^\n]{0,40}\b(replac|overwrit|not\s+concat|scalar|wins?)\b|\b(replac|overwrit)[^\n]{0,40}\barray/i.test(text)) {
      return true;
    }
  }
  return false;
}
