// Placeholder source for B4/B5 happy-path scoring fixtures.
// Intentionally minimal; the bench scorer is what's under test.
export function slugify(s) {
  return String(s).toLowerCase().trim().replace(/\s+/g, '-');
}
