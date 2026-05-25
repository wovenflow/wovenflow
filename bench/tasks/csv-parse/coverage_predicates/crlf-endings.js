// Predicate for label: crlf-endings
// Description: CRLF ('\r\n') line endings separate rows just like LF, and the carriage return must not leak into the parsed field value. The agent's tests should include at least one assertion exercising CRLF line endings.
// Strategy: Find a parseCsv input string that contains a CRLF escape sequence (\r\n) or a literal carriage return + newline.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Cc]sv\s*\(/.test(text)) continue;

    // \r\n escape inside any string, or a literal CR LF pair inside a template literal.
    const crlfEscape = /\\r\\n/;
    const crlfReal = /\r\n/;
    if (crlfEscape.test(text)) return true;
    // a literal CRLF inside a parseCsv template-literal argument
    if (/parse_?[Cc]sv\s*\(\s*`[\s\S]*?\r\n[\s\S]*?`/.test(text) && crlfReal.test(text)) return true;

    const labelHit = /crlf|carriage\s+return|\\r\\n|windows\s+line\s+ending/i.test(text);
    if (labelHit) return true;
  }
  return false;
}
