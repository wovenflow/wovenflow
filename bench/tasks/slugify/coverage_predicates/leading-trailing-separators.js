// Predicate for label: leading-trailing-separators
// Description: The input begins or ends with characters that become hyphens.
// The agent's tests should include at least one assertion that exercises
// leading or trailing separator input.
// Strategy: Look for string literals whose first or last character is a
// separator (space, tab, or common punctuation), AND that also contain at
// least one alphanumeric (so we exclude empty/whitespace-only). Combine with
// label/comment mentions of "leading", "trailing", "starts with", "ends with",
// or "trim".
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  let files;
  try {
    files = fs.readdirSync(testsDir).filter(f =>
      f.endsWith('.js') || f.endsWith('.ts') ||
      f.endsWith('.mjs') || f.endsWith('.cjs')
    );
  } catch {
    return false;
  }

  const stringLiteralRe = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  const sepCharClass = /[ \t!@#$%^&*()_+={}\[\]|\\:;"'<>,.?/~`-]/;
  const alnumRe = /[A-Za-z0-9]/;

  const labelRe = /\b(leading|trailing|starts?\s+with|ends?\s+with|begins?\s+with|begin\s+with|edge\s+(?:space|hyphen|dash)|trim(?:med|ming)?|strip(?:ped|ping)?\s+(?:leading|trailing|edges?))\b/i;

  for (const f of files) {
    let text;
    try { text = fs.readFileSync(path.join(testsDir, f), 'utf8'); }
    catch { continue; }

    let hasShape = false;
    stringLiteralRe.lastIndex = 0;
    let m;
    while ((m = stringLiteralRe.exec(text)) !== null) {
      const inner = m[2];
      if (!inner || inner.length === 0) continue;
      if (inner.length > 500) continue;
      if (!alnumRe.test(inner)) continue; // exclude whitespace-only / empty
      const first = inner[0];
      const last = inner[inner.length - 1];
      if (sepCharClass.test(first) || sepCharClass.test(last)) {
        hasShape = true;
        break;
      }
    }

    const mentions = labelRe.test(text);

    if (hasShape && mentions) return true;
    if (hasShape) return true;
  }
  return false;
}
