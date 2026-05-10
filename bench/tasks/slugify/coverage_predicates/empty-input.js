// Coverage predicate for the `empty-input` label on the slugify task.
//
// Returns true if the agent's tests in `testsDir` exercise empty-string input
// to slugify. Inspects test source text for an empty-string literal passed to
// slugify, OR a test name that names the case explicitly. This is a coarse
// text inspection (the spec target is AST-or-text predicates that are not
// pure literal-text match — we look for either a recognizable code shape OR
// a recognizable label-shape, which is more robust than matching one phrase).
//
// Authored to be re-implementable by an independent rater from the label
// alone: "empty-input means the agent passed '' / "" to the function under
// test, or named a case 'empty input' / 'empty-input' / 'empty string'."

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

export default function emptyInputPredicate(testsDir) {
  let combined = '';
  try {
    for (const f of walk(testsDir)) combined += readFileSync(f, 'utf8') + '\n';
  } catch {
    return false;
  }
  // Code shape: slugify('') or slugify("").
  const callShape = /slugify\s*\(\s*(['"])\1\s*\)/.test(combined);
  // Label shape in test names / comments.
  const labelShape = /empty[\s-]?(input|string)/i.test(combined);
  return callShape || labelShape;
}
