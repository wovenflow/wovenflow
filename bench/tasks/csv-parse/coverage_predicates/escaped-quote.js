// Predicate for label: escaped-quote
// Description: Inside a quoted field, a doubled double-quote ('""') represents a single literal double-quote character. The agent's tests should include at least one assertion exercising an escaped (doubled) quote.
// Strategy: Find a parseCsv input string that contains two adjacent double-quote characters in the interior of a quoted field — the "" escape sequence.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Cc]sv\s*\(/.test(text)) continue;

    // Two adjacent quote chars. In a JS single-quoted string the CSV looks like
    // '"a""b"', so '""' appears literally. In a double-quoted JS string it's
    // escaped as \"\". Match either run of two consecutive (possibly escaped) quotes.
    const doubledQuote = /""|\\"\\"/;
    if (doubledQuote.test(text)) {
      // Avoid matching an empty quoted field at a boundary like ',""' alone by
      // also confirming there's content adjacent to a doubled quote, OR a label.
      const interior = /[^,"\s\\]\s*(?:""|\\"\\")|(?:""|\\"\\")\s*[^,"\s\\]/;
      if (interior.test(text)) return true;
    }

    const labelHit = /escaped[\s_-]*quote|doubled?\s+quote|double[\s_-]*quote\s+escape|""\s*(?:->|→|becomes)/i.test(text);
    if (labelHit) return true;
  }
  return false;
}
