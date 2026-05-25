// Predicate for label: nullish-override
// Description: A source value of null or undefined overrides the target value rather than being
//   skipped. The agent's tests should include at least one assertion exercising a null or
//   undefined source value winning over a non-nullish target value.
// Strategy: Find a deepMerge call where the source (second) argument contains a "key: null" or
//   "key: undefined" value, OR a label/comment hint about null/undefined/nullish overriding.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  function hasNullishValue(blob) {
    return /:\s*(null|undefined)\b/.test(blob);
  }

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const callRe = /\b(?:deep[_-]?merge|merge|deepMerge)\s*\(\s*(\{[^]*?\})\s*,\s*(\{[^]*?\})\s*[,)]/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      // source side carries an explicit null/undefined value
      if (hasNullishValue(m[2])) return true;
    }

    // Label/comment hint plus a merge call.
    if (/\bnull\b|\bundefined\b|\bnullish\b/i.test(text) &&
        /\b(overrid|overwrit|win|skip|not\s+skip)/i.test(text)) {
      if (/\b(?:deep[_-]?merge|deepMerge|merge)\s*\(/.test(text)) return true;
    }
  }
  return false;
}
