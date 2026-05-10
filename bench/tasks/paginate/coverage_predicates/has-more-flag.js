// Predicate for label: has-more-flag
// Description: hasMore is true when there are items beyond the slice, false otherwise. The agent's tests should include at least one assertion checking the hasMore flag in both states.
// Strategy: require at least one assertion that hasMore is true AND at least one assertion that hasMore is false (the "both states" requirement), anywhere in the test files.
import fs from 'node:fs';
import path from 'node:path';

export default function predicate(testsDir) {
  const files = fs.readdirSync(testsDir).filter(f => /\.(m|c)?(j|t)s$/.test(f));

  let sawTrue = false;
  let sawFalse = false;
  let sawLabel = false;

  for (const f of files) {
    const text = fs.readFileSync(path.join(testsDir, f), 'utf8');

    // Label/comment hint about hasMore flag
    if (/(?:it|test|describe)\s*\(\s*[`'"][^`'"]*has[\s-]?more[^`'"]*[`'"]/i.test(text) ||
        /(?:\/\/|\/\*|\*).*has[\s-]?more/i.test(text)) {
      sawLabel = true;
    }

    // hasMore is true assertion
    const hasMoreTrue = [
      /hasMore\s*\)?\.?(?:toBe|to\.equal|toEqual|toStrictEqual)\s*\(\s*true\s*\)/,
      /hasMore\s*[:=]\s*true\b/,
      /assert(?:\.\w+)?\s*\(\s*[^)]*hasMore[^)]*\)/i,
      /expect\s*\(\s*[^)]*hasMore[^)]*\)\s*\.\s*toBeTruthy\s*\(\s*\)/,
    ];
    // hasMore is false assertion
    const hasMoreFalse = [
      /hasMore\s*\)?\.?(?:toBe|to\.equal|toEqual|toStrictEqual)\s*\(\s*false\s*\)/,
      /hasMore\s*[:=]\s*false\b/,
      /expect\s*\(\s*[^)]*hasMore[^)]*\)\s*\.\s*toBeFalsy\s*\(\s*\)/,
      /assert(?:\.\w+)?\s*\(\s*!\s*[^)]*hasMore[^)]*\)/i,
    ];

    if (hasMoreTrue.some(re => re.test(text))) sawTrue = true;
    if (hasMoreFalse.some(re => re.test(text))) sawFalse = true;
  }

  // Combo: both states (true AND false) must be exercised — that is the contract.
  // Label/comment alone is not sufficient; suppress the unused signal.
  void sawLabel;
  return sawTrue && sawFalse;
}
