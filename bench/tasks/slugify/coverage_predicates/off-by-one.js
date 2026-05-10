// Coverage predicate for the `off-by-one` label on the slugify task.
//
// Returns true if the agent's tests exercise a length-1 input, a length-2
// input, OR explicitly name an off-by-one case in a test name / comment.
// Length boundaries are the standard off-by-one signal for string functions.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      yield* walk(p);
    } else if (/\.(m?js|cjs|ts)$/.test(name)) {
      yield p;
    }
  }
}

export default function offByOnePredicate(testsDir) {
  let combined = '';
  try {
    for (const f of walk(testsDir)) combined += readFileSync(f, 'utf8') + '\n';
  } catch {
    return false;
  }
  // Code shape: slugify called with a 1-char or 2-char string literal.
  const oneOrTwoChar = /slugify\s*\(\s*(['"])[^'"\\]{1,2}\1\s*\)/.test(combined);
  // Label shape.
  const labelShape = /off[\s-]?by[\s-]?one|boundary|length[\s-]?(one|1|two|2)/i.test(combined);
  return oneOrTwoChar || labelShape;
}
