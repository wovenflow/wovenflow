# Kappa pre-check report

## Task: slugify

| Label | Rater A pos | Rater A neg | Rater B pos | Rater B neg | Agree pos | Agree neg |
|---|---|---|---|---|---|---|
| empty-input | true | false | true | false | ✓ | ✓ |
| whitespace-only | true | false | true | false | ✓ | ✓ |
| consecutive-separators | true | false | true | false | ✓ | ✓ |
| leading-trailing-separators | true | false | true | false | ✓ | ✓ |
| mixed-case | true | false | true | false | ✓ | ✓ |
| punctuation | true | false | true | false | ✓ | ✓ |
| unicode-non-ascii | true | false | true | false | ✓ | ✓ |

**Per-task agreement:** 14/14 = 100.0%

## Task: throttle

| Label | Rater A pos | Rater A neg | Rater B pos | Rater B neg | Agree pos | Agree neg |
|---|---|---|---|---|---|---|
| leading-edge | true | false | true | false | ✓ | ✓ |
| trailing-edge | true | false | true | false | ✓ | ✓ |
| burst-coalesced | true | false | true | false | ✓ | ✓ |
| post-window-fires-immediately | false | false | false | false | ✓ | ✓ |
| passes-arguments | true | false | false | false | ✗ | ✓ |
| preserves-this | true | false | false | false | ✗ | ✓ |
| single-call | true | false | true | false | ✓ | ✓ |

**Per-task agreement:** 12/14 = 85.7%

## Task: deep-equal

| Label | Rater A pos | Rater A neg | Rater B pos | Rater B neg | Agree pos | Agree neg |
|---|---|---|---|---|---|---|
| primitive-equal | true | false | true | false | ✓ | ✓ |
| primitive-unequal | true | false | true | false | ✓ | ✓ |
| nan-equality | true | false | true | false | ✓ | ✓ |
| array-equal | true | false | true | false | ✓ | ✓ |
| object-equal | true | false | true | false | ✓ | ✓ |
| nested-structure | true | false | true | false | ✓ | ✓ |
| type-mismatch | true | false | true | false | ✓ | ✓ |
| cyclic-reference | true | false | true | false | ✓ | ✓ |

**Per-task agreement:** 16/16 = 100.0%

## Aggregate

- Total label×fixture observations per rater: 44
- Pairwise agreement: 42/44 = 95.5%
- Rater A correctness on positive fixtures: 20/22 (90.9%)
- Negative-fixture correctness pooled across raters: 44/44 (100.0%)

## Methodology note

This is a lightweight first-cut agreement check. Both raters were independently dispatched as blind subagents reading only the task's `labels.json`. Each rater's predicates were evaluated against (1) the task's actual hidden_tests/ directory, which exercises every label by construction, and (2) an empty temp directory, which exercises none.

A full kappa computation would require a larger per-label fixture bank with adversarial cases (test files that exercise some labels but not others). That is deferred to a follow-up before Stage-2 lock per PROTOCOL.md §9.

## Reproducing

From the repo root:

```bash
node bench/kappa-pre-check/eval.mjs > bench/kappa-pre-check/report.md
```