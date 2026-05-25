// Predicate for label: empty-fields
// Description: Empty fields are preserved as empty strings, including consecutive separators (e.g. 'a,,c'). The agent's tests should include at least one assertion exercising empty fields.
// Strategy: Find a parseCsv input string with consecutive commas (a,,c), a leading comma (,a), or a trailing comma (a,) — patterns that produce empty fields — OR an asserted empty-string field.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Cc]sv\s*\(/.test(text)) continue;

    // Look at the argument region of each parseCsv call for an empty-field shape.
    const callRe = /parse_?[Cc]sv\s*\(\s*([`'"])((?:(?!\1)[\s\S])*)\1/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      const inner = m[2];
      // consecutive separators, leading separator, or trailing separator (before
      // a newline or end). Use comma since that's the default delimiter.
      if (/,,/.test(inner)) return true;
      if (/^,/.test(inner) || /(?:\\n|\\r\\n),/.test(inner)) return true;
      if (/,$/.test(inner) || /,(?:\\n|\\r\\n)/.test(inner)) return true;
    }

    const labelHit = /empty[\s_-]*fields?|empty\s+string\s+field|consecutive\s+(?:comma|separator|delimiter)/i.test(text);
    if (labelHit) return true;
  }
  return false;
}
