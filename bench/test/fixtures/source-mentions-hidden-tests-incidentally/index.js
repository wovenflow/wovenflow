// Source for Phase 2 spec B1's "incidental substring does NOT trip" test.
// This file mentions the bare substring `hidden_tests` in a comment without
// any surrounding path context — the path-scoped static-leak check MUST NOT
// reject it. (The v1 substring-only check would have false-positived here,
// which is exactly the brittleness the path-scoped rewrite fixes.)
//
// Note: the comment intentionally uses the word `hidden_tests` to describe
// the bench's hidden_tests directory in prose, the same way a docstring on
// a producing agent might. No bench/tasks/<task>/hidden_tests/ path appears
// anywhere in this file, so scoreHidden({hidden_tests_subdir:
// 'hidden_tests_after_edit'}) should run cleanly.

export function slugify(s) {
  return String(s).toLowerCase().trim().replace(/\s+/g, '-');
}
