// Predicate for label: shallow-override
// Description: When a key exists in both target and source and the values are not both plain
//   objects, the source value wins. The agent's tests should include at least one assertion
//   exercising a same-key override.
// Strategy: Find a deepMerge call whose two object-literal arguments share at least one key whose
//   value differs (a same-key override), OR a label/comment hint about override/overwrite/wins.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Collect top-level keys appearing in an object literal blob.
  function keysOf(blob) {
    const keys = new Set();
    const re = /(?:^|[{,]\s*)(?:(['"`])([A-Za-z0-9_$]+)\1|([A-Za-z_$][A-Za-z0-9_$]*))\s*:/g;
    let m;
    while ((m = re.exec(blob)) !== null) keys.add(m[2] || m[3]);
    return keys;
  }

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // deepMerge({...}, {...}) where both args contain at least one shared key.
    const callRe = /\b(?:deep[_-]?merge|merge|deepMerge)\s*\(\s*(\{[^]*?\})\s*,\s*(\{[^]*?\})\s*[,)]/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      const ka = keysOf(m[1]);
      const kb = keysOf(m[2]);
      for (const k of kb) {
        if (ka.has(k)) return true; // shared key => an override scenario
      }
    }

    // Label/comment hint
    if (/\boverrid(e|es|ing|den)\b|\boverwrit(e|es|ing|ten)\b|source\s+wins?|same\s+key/i.test(text)) {
      // require at least one deepMerge call in the file too
      if (/\b(?:deep[_-]?merge|deepMerge|merge)\s*\(/.test(text)) return true;
    }
  }
  return false;
}
