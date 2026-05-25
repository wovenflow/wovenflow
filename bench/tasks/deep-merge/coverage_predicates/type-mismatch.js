// Predicate for label: type-mismatch
// Description: When a key holds a plain object on one side and a non-object (primitive, array,
//   null) on the other, source wins in both directions. The agent's tests should include at least
//   one assertion exercising a type mismatch between target and source on the same key.
// Strategy: Find a deepMerge call where the SAME key holds an object literal value on one side and
//   a non-object value (primitive, array, null) on the other, OR a label/comment hint about a type
//   mismatch / object-vs-primitive.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  // Map key -> coarse value tag for a single-depth object literal blob.
  // Returns { key: 'object'|'array'|'scalar' }.
  function valueTags(blob) {
    const tags = {};
    // match  key:  <value-start-token>
    const re = /(?:^|[{,]\s*)(?:(['"`])([A-Za-z0-9_$]+)\1|([A-Za-z_$][A-Za-z0-9_$]*))\s*:\s*([\{\[]|null\b|undefined\b|true\b|false\b|-?\d|['"`])/g;
    let m;
    while ((m = re.exec(blob)) !== null) {
      const key = m[2] || m[3];
      const v = m[4];
      let tag;
      if (v === '{') tag = 'object';
      else if (v === '[') tag = 'array';
      else tag = 'scalar'; // null/undefined/bool/number/string
      // first occurrence at this depth wins for the key
      if (!(key in tags)) tags[key] = tag;
    }
    return tags;
  }

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const callRe = /\b(?:deep[_-]?merge|merge|deepMerge)\s*\(\s*(\{[^]*?\})\s*,\s*(\{[^]*?\})\s*[,)]/g;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      const ta = valueTags(m[1]);
      const tb = valueTags(m[2]);
      for (const key of Object.keys(tb)) {
        if (!(key in ta)) continue;
        const a = ta[key], b = tb[key];
        // one side object, other side not object => type mismatch
        if ((a === 'object') !== (b === 'object')) return true;
      }
    }

    // Label/comment hint plus a merge call.
    if (/type[\s_-]*mismatch|object\s+(?:vs|and|over|replaces?)\s+(?:primitive|scalar|number|string|array)|primitive\s+(?:vs|and|over|replaces?)\s+object|mismatch(ed)?\s+type/i.test(text)) {
      if (/\b(?:deep[_-]?merge|deepMerge|merge)\s*\(/.test(text)) return true;
    }
  }
  return false;
}
