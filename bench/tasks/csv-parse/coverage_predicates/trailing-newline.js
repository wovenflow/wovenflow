// Predicate for label: trailing-newline
// Description: A single trailing line break at the end of the input does NOT produce an extra empty final row. The agent's tests should include at least one assertion exercising a trailing newline.
// Strategy: Find a parseCsv input string that ends with a newline escape (\n or \r\n) just before the closing string quote.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Cc]sv\s*\(/.test(text)) continue;

    // parseCsv input whose content ends with a newline escape immediately before
    // the closing quote of the string literal.
    const trailing = /parse_?[Cc]sv\s*\(\s*(['"`])(?:(?!\1)[\s\S])*?(?:\\n|\\r\\n)\1/;
    if (trailing.test(text)) return true;
    // template literal ending with a real newline before the backtick
    const trailingReal = /parse_?[Cc]sv\s*\(\s*`[\s\S]*?\r?\n`/;
    if (trailingReal.test(text)) return true;

    const labelHit = /trailing[\s_-]*newline|trailing\s+line\s*break|no\s+(?:extra|empty)\s+(?:final\s+)?row/i.test(text);
    if (labelHit) return true;
  }
  return false;
}
