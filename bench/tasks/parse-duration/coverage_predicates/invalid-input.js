// Predicate for label: invalid-input
// Description: Invalid input returns null: a bare number with no unit ('100'), an unknown unit ('5x'), or any string not made entirely of valid segments. The agent's tests should include at least one assertion that invalid input returns null.
// Strategy: Find a parseDuration call asserted to equal null whose argument is a non-empty invalid string (bare number, unknown unit, or garbage). Empty-string-only is handled by the empty-string label, so require a non-empty argument here.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (!/parse_?[Dd]uration\s*\(/.test(text)) continue;

    // Collect parseDuration(<arg>) call argument strings paired with a nearby null.
    const callRe = /parse_?[Dd]uration\s*\(\s*(['"`])([\s\S]*?)\1\s*\)/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      const inner = m[2];
      if (inner.trim() === '') continue; // empty-string label covers this
      // Is this argument an INVALID duration? (not all valid segments)
      const normalized = inner.trim().replace(/^-/, '');
      const allValid = /^(?:\d+(?:\.\d+)?(?:ms|[smhdw]))+$/.test(normalized);
      if (allValid) continue;
      // The call is on an invalid arg. Check that null appears near this call.
      const tail = text.slice(m.index, m.index + m[0].length + 60);
      const head = text.slice(Math.max(0, m.index - 60), m.index);
      if (/\bnull\b/.test(tail) || /\bnull\b/.test(head)) return true;
    }

    const labelHit = /invalid[\s_-]*input|unknown\s+unit|bare\s+number|returns?\s+null|=>?\s*null/i.test(text);
    if (labelHit && /\bnull\b/.test(text)) {
      // ensure there's at least one non-empty arg that is NOT a wholly-valid
      // duration (i.e. a genuinely invalid input being tested).
      const argRe = /parse_?[Dd]uration\s*\(\s*(['"`])([\s\S]*?)\1\s*\)/g;
      let am;
      while ((am = argRe.exec(text)) !== null) {
        const a = am[2].trim();
        if (a === '') continue;
        const norm = a.replace(/^-/, '');
        if (!/^(?:\d+(?:\.\d+)?(?:ms|[smhdw]))+$/.test(norm)) return true;
      }
    }
  }
  return false;
}
