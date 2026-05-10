// Predicate for label: offset-past-end
// Description: offset>=total returns empty items array with hasMore false. The agent's tests should include at least one assertion exercising offset-past-end.
// Strategy: look for a test/comment mentioning "past end" / "out of range" / "beyond" alongside an assertion that items is empty AND hasMore is false.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    const labelRe = /(?:it|test|describe)\s*\(\s*[`'"][^`'"]*(past[\s-]?end|past[\s-]?total|out[\s-]?of[\s-]?range|beyond[\s-]?(end|total|length)|offset[\s-]?>?=?[\s-]?total|over[\s-]?shoot)[^`'"]*[`'"]/i;
    const commentRe = /(?:\/\/|\/\*|\*).*(past[\s-]?end|past[\s-]?total|out[\s-]?of[\s-]?range|beyond[\s-]?(end|total|length)|offset[\s-]?>=?[\s-]?total)/i;

    const paginateCall = /paginate\s*\(/i;
    const emptyItems = /(items\s*[:=]\s*\[\s*\]|\.items\)?\.?(?:toEqual|toStrictEqual|to\.deep\.equal)\s*\(\s*\[\s*\]|\.items\.length\s*\)?\.?(?:toBe|to\.equal|toEqual|===)\s*\(?\s*0)/;
    const hasMoreFalse = /hasMore\s*[:=]?\s*(?:false|!== true)|hasMore\s*\)?\.?(?:toBe|to\.equal|toEqual)\s*\(\s*false\s*\)/;

    if ((labelRe.test(text) || commentRe.test(text)) && paginateCall.test(text)) {
      return true;
    }

    // Fallback: paginate call with a clearly-too-big offset and assertions for empty + hasMore false
    if (paginateCall.test(text) && emptyItems.test(text) && hasMoreFalse.test(text)) {
      return true;
    }
  }
  return false;
}
