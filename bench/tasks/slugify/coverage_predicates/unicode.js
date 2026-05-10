// Coverage predicate for the `unicode` label on the slugify task.
//
// Returns true if the agent's tests exercise non-ASCII input — either a
// non-ASCII literal in code, or a recognizable mention of unicode / accented
// / non-ASCII categories in test names or comments. Matches the AST-or-text
// guidance from the spec (not a single literal-text match).

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

export default function unicodePredicate(testsDir) {
  let combined = '';
  try {
    for (const f of walk(testsDir)) combined += readFileSync(f, 'utf8') + '\n';
  } catch {
    return false;
  }
  // Code shape: any non-ASCII codepoint inside a string literal.
  const nonAscii = /[^\x00-\x7F]/.test(combined);
  // Label shape.
  const labelShape = /unicode|non[\s-]?ascii|accent|diacritic|emoji/i.test(combined);
  return nonAscii || labelShape;
}
