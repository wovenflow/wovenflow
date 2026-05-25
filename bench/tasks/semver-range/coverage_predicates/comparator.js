// Predicate for label: comparator
// Description: A comparator range using >, >=, <, or <= matches versions on the correct side of
//   the boundary, compared numerically by major then minor then patch. The agent's tests should
//   include at least one assertion exercising a comparator operator.
// Strategy: Look for a quoted range literal that begins with one of the comparator operators
//   (>=, <=, >, <) immediately followed by a version, OR a label/comment hint about comparators.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // A quoted literal containing a leading >,>=,<,<= operator before a version number.
    // Allow it to appear anywhere in the literal (covers AND parts too), but require it to
    // directly precede a digit so we don't match stray angle brackets.
    const cmp = /(['"`])[^'"`]*?(?:>=|<=|>|<)\s*\d+\.\d+/;
    if (cmp.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }

    // Label/comment hint, given a satisfies call.
    if (/\bcomparator\b|greater[\s_-]*than|less[\s_-]*than|greater[\s_-]*or[\s_-]*equal|less[\s_-]*or[\s_-]*equal|\bgte?\b|\blte?\b/i.test(text)) {
      if (/\bsatisfies\s*\(/.test(text)) return true;
    }
  }
  return false;
}
