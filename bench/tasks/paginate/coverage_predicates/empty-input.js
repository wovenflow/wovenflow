// Predicate for label: empty-input
// Description: Input array is empty. Returns empty items, hasMore false. The agent's tests should include at least one assertion exercising empty input.
// Strategy: look for a test/comment naming the empty-input case alongside a paginate call whose first arg is an empty array literal, plus an assertion.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const labelRe = /(?:it|test|describe)\s*\(\s*[`'"][^`'"]*(empty[\s-]?(input|array|list|data|collection|source))[^`'"]*[`'"]/i;
    const commentRe = /(?:\/\/|\/\*|\*).*empty[\s-]?(input|array|list|data|collection|source)/i;

    const paginateCall = /paginate\s*\(/i;
    // first arg is empty array literal
    const emptyArrFirstArg = /paginate\s*\(\s*\[\s*\]/i;
    const assertion = /(expect|assert|equal|deepEqual|toEqual|toStrictEqual)/i;

    if ((labelRe.test(text) || commentRe.test(text)) && paginateCall.test(text) && assertion.test(text)) {
      return true;
    }

    if (emptyArrFirstArg.test(text) && assertion.test(text)) {
      return true;
    }

    // Also accept: a named const set to [] is passed in, with a label/comment mention
    if ((labelRe.test(text) || commentRe.test(text)) && /=\s*\[\s*\]/.test(text) && paginateCall.test(text) && assertion.test(text)) {
      return true;
    }
  }
  return false;
}
