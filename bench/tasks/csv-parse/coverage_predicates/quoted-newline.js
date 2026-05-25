// Predicate for label: quoted-newline
// Description: A field wrapped in double quotes may contain a line break that is treated as a literal character, not a row separator. The agent's tests should include at least one assertion exercising a newline inside a quoted field.
// Strategy: Find a parseCsv input string that contains a double-quote followed by a newline escape (\n or \r\n) and another double-quote — a quoted region spanning a line break.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Cc]sv\s*\(/.test(text)) continue;

    // A quoted region containing a newline escape between two quote markers.
    // Matches '"...\n..."' and \"...\n...\" forms; also tolerates a real newline
    // inside a template literal.
    const quotedNewline = /(?:\\?"|\\")[^"\\]*(?:\\r?\\n|\r?\n)[^"\\]*(?:\\?"|\\")/;
    if (quotedNewline.test(text)) return true;

    const labelHit = /quoted[\s_-]*newline|newline\s+inside\s+quotes?|line\s*break\s+inside|embedded\s+newline/i.test(text);
    if (labelHit) return true;
  }
  return false;
}
