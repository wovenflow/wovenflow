// Phase 1 produced source for the slugify task — but this fixture is
// deliberately CORRUPTED: the Phase 1 agent's conversation.jsonl was
// erroneously written inside source/ (alongside index.js). The B3 invariant
// (c) guard in dispatchEditTrial must detect this and refuse to dispatch
// rather than copy run-state into the fresh Phase 2 worktree.
export function slugify(s) {
  return String(s).toLowerCase();
}
