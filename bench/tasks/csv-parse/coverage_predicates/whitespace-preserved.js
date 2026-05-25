// Predicate for label: whitespace-preserved
// Description: Whitespace is preserved exactly: leading/trailing spaces inside or outside quotes are NOT trimmed. The agent's tests should include at least one assertion exercising preserved whitespace.
// Strategy: Find a parseCsv call whose input has a space adjacent to a comma or quote (e.g. ' a , b ' or '"  x  "'), AND an asserted expectation that retains that space — i.e. a string field literal in the expected output that begins or ends with a space.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Cc]sv\s*\(/.test(text)) continue;

    // Input has a space adjacent to a separator or to a quote boundary.
    const callRe = /parse_?[Cc]sv\s*\(\s*([`'"])((?:(?!\1)[\s\S])*)\1/g;
    let inputHasEdgeSpace = false;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      const inner = m[2];
      // space next to a comma, or a quoted region with an interior leading/trailing space
      if (/\s,|,\s/.test(inner)) inputHasEdgeSpace = true;
      if (/(?:\\?"|\\")\s|\s(?:\\?"|\\")/.test(inner)) inputHasEdgeSpace = true;
      if (/^\s|\s$/.test(inner)) inputHasEdgeSpace = true;
    }

    // Expected output retains a leading/trailing space in a string field literal.
    const expectedSpace = /(['"])\s+(?:(?!\1)[\s\S])*\1|(['"])(?:(?!\2)[\s\S])*\s+\2/;

    if (inputHasEdgeSpace && expectedSpace.test(text)) return true;

    const labelHit = /whitespace[\s_-]*preserv|not\s+trim|preserve[sd]?\s+(?:space|whitespace)|leading\/?trailing\s+space/i.test(text);
    if (labelHit && inputHasEdgeSpace) return true;
  }
  return false;
}
