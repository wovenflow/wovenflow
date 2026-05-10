# Test fixture: task with incomplete coverage predicates

This task exists only as a fixture for B6's MissingPredicatesError test in `doc/specs/2026-05-10-dtdd-bench.spec.md`. It declares labels in `hidden_tests/labels.json` but intentionally provides no predicate files under `coverage_predicates/` — so `scoreCoverage` must reject it.

Do not run this as a real benchmark task.
