// Phase 1 produced source for the slugify task. Used as input context for
// the Phase 2 fresh-agent dispatch in dispatchEditTrial tests.
export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
