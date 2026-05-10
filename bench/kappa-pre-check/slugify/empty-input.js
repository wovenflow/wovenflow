// Predicate for label: empty-input
// Description: The input is the empty string. The agent's tests should include
// at least one assertion that exercises empty-string input.
// Strategy: Look for a call/assertion that passes an empty string literal as
// argument, or a test name/comment mentioning empty input/string.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Code-shape: a function call with an empty string literal as arg.
  // e.g. slugify(''), slug(""), toSlug(``)
  const emptyArgCall = /\b[A-Za-z_$][\w$]*\s*\(\s*(['"`])\1\s*[\),]/;

  // Code-shape: an assertion comparing a slugify call's result to '' or
  // explicitly stating equality with the empty string.
  const emptyEqAssertion = /(toBe|toEqual|toStrictEqual|deepEqual|strictEqual|is|equal|equals|assertEquals|assertEqual|assert\.equal|assert\.strictEqual|assert\.deepEqual|assert\.is)\s*\(\s*(['"`])\2\s*[\),]/;

  // Label/comment/test-name regex.
  const labelRx = /(empty[\s_-]*(?:string|input|str|case)|'\s*empty\b|"\s*empty\b|`\s*empty\b)/i;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (emptyArgCall.test(text)) return true;
    if (emptyEqAssertion.test(text) && /slug/i.test(text)) return true;
    if (labelRx.test(text)) return true;
  }
  return false;
}
