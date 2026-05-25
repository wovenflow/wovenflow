// Predicate for label: quoted-comma
// Description: A field wrapped in double quotes may contain a comma that is treated as a literal character, not a field separator. The agent's tests should include at least one assertion exercising a comma inside a quoted field.
// Strategy: Find a parseCsv input string that contains an escaped/literal double-quote with a comma between two quote markers — i.e. a quoted segment "...,..." inside the CSV input.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Cc]sv\s*\(/.test(text)) continue;

    // An escaped/embedded double-quote char followed (within the input) by a comma
    // and another double-quote: a quoted region containing a comma.
    // Covers '"a,b"' inside single-quoted JS strings and \"a,b\" inside double-quoted.
    const quotedComma = /(?:\\?"|\\")[^"\\]*,[^"\\]*(?:\\?"|\\")/;
    if (quotedComma.test(text)) {
      // Make sure it actually appears inside a parseCsv call argument region.
      const inCall = /parse_?[Cc]sv\s*\(\s*[`'"][\s\S]*?(?:\\?"|\\")[^"\\]*,[^"\\]*(?:\\?"|\\")/;
      if (inCall.test(text)) return true;
    }

    const labelHit = /quoted[\s_-]*comma|comma\s+inside\s+quotes?|comma.*(?:literal|quoted)/i.test(text);
    if (labelHit && /parse_?[Cc]sv\s*\(/.test(text)) return true;
  }
  return false;
}
