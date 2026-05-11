// Deliberately leaky source for Phase 2 spec B1's path-scoped leak rejection.
// References the EXACT path of the alternate hidden-tests directory used by
// the Phase 2 / post-edit scoring path. scoreHidden({hidden_tests_subdir:
// 'hidden_tests_after_edit'}) MUST reject this source with HiddenTestLeakError
// because the literal path of the active suite appears in the source body.

export const LEAK_PATH = 'bench/tasks/slugify/hidden_tests_after_edit/';

export function slugify(s) {
  return String(s).toLowerCase();
}
