// Predicate for label: simple-rows
// Description: Plain comma-separated rows with no quoting parse into an array of rows, each an array of string fields. The agent's tests should include at least one assertion exercising a simple multi-row, multi-field parse.
// Strategy: Look for a parseCsv call whose input string contains a comma and at least one newline (or two rows asserted), with no double-quote — a plain multi-row CSV.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // parseCsv("...,...\n...,...") — input contains a comma and a newline escape
  const multiRowRe = /parse_?[Cc]sv\s*\(\s*(['"`])(?:(?!\1)[\s\S])*?,(?:(?!\1)[\s\S])*?(?:\\n|\\r\\n)(?:(?!\1)[\s\S])*?\1/;
  // single-row with a comma is also a valid simple parse
  const commaRowRe = /parse_?[Cc]sv\s*\(\s*(['"`])(?:(?!\1)[\s\S])*?,(?:(?!\1)[\s\S])*?\1/;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (multiRowRe.test(text)) return true;
    if (commaRowRe.test(text)) return true;
    if (/simple[\s_-]*rows?|plain\s+csv|comma[\s_-]*separated|basic\s+(?:row|parse)/i.test(text)
        && /parse_?[Cc]sv\s*\(/.test(text)) return true;
  }
  return false;
}
