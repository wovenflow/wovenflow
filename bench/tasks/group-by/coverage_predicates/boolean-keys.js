// Predicate for label: boolean-keys
// Description: The keyFn returns booleans (true/false). The agent's tests should include at least one assertion exercising boolean-keyed grouping.
// Strategy: Look for a groupBy call whose keyFn returns a boolean expression, or a label/comment naming the boolean-keys case.
import fs from 'node:fs';
import path from 'node:path';
export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/groupBy\s*\(/.test(text)) continue;
    // Label/comment hint.
    const labelHints = /(boolean[-_ ]?keys?|bool[-_ ]?keys?|boolean[-_ ]?keyed|true[\/\\-]false|truthy[\/\\-]?falsy|partition)/i;
    if (labelHints.test(text)) return true;
    // Code-shape: a keyFn that returns a boolean — comparison/logical expression, Boolean(), or literal.
    const arrowReturnsBoolean = /=>\s*[^,;\n]*?(?:[<>!=]==?|&&|\|\||\bBoolean\s*\(|\b(?:true|false)\b)/;
    if (arrowReturnsBoolean.test(text)) {
      // require that the boolean case is referenced under a key like ["true"] or .true / [true].
      if (/\[\s*(?:true|false|"true"|"false"|'true'|'false')\s*\]|\.(?:true|false)\b/.test(text)) return true;
    }
    // Direct keys access: groups[true], groups["false"], etc., is a strong signal alongside groupBy.
    if (/\b\w+\s*\[\s*(?:true|false|"true"|"false"|'true'|'false')\s*\]/.test(text)) return true;
  }
  return false;
}
