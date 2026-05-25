// Predicate for label: new-keys
// Description: A key present only in source is added to the result, and a key present only in
//   target is preserved. The agent's tests should include at least one assertion exercising keys
//   unique to one side.
// Strategy: Find a deepMerge call whose two object-literal arguments have at least one key that is
//   NOT shared (unique to one side), OR a label/comment hint about adding/new/unique/preserved keys.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  function keysOf(blob) {
    const keys = new Set();
    const re = /(?:^|[{,]\s*)(?:(['"`])([A-Za-z0-9_$]+)\1|([A-Za-z_$][A-Za-z0-9_$]*))\s*:/g;
    let m;
    while ((m = re.exec(blob)) !== null) keys.add(m[2] || m[3]);
    return keys;
  }

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const callRe = /\b(?:deep[_-]?merge|merge|deepMerge)\s*\(\s*(\{[^]*?\})\s*,\s*(\{[^]*?\})\s*[,)]/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      const ka = keysOf(m[1]);
      const kb = keysOf(m[2]);
      if (ka.size === 0 && kb.size === 0) continue;
      // a key unique to source...
      for (const k of kb) if (!ka.has(k)) return true;
      // ...or a key unique to target
      for (const k of ka) if (!kb.has(k)) return true;
    }

    if (/\b(new|added?|adding|unique|preserv(e|ed|es|ing)|kept|keep|only\s+in)\b[^\n]{0,40}\b(key|keys|property|properties|source|target)\b/i.test(text)) {
      if (/\b(?:deep[_-]?merge|deepMerge|merge)\s*\(/.test(text)) return true;
    }
    if (/\b(key|keys|property|properties)\b[^\n]{0,40}\b(new|added?|unique|preserv|kept|keep|only)\b/i.test(text)) {
      if (/\b(?:deep[_-]?merge|deepMerge|merge)\s*\(/.test(text)) return true;
    }
  }
  return false;
}
