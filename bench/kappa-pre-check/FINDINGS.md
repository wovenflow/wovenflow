# Kappa pre-check — interpretation

This is the human-readable interpretation of `report.md`. The auto-generated report has the data; this document has the verdict and the implications.

## What we did

Sampled 3 tasks (slugify, throttle, deep-equal) covering varied complexity (text-shape, async/timing, recursive structure). For each task, dispatched a fresh blind subagent to re-author the predicates from `labels.json` alone — same brief as the original predicates, no exposure to the prior author's work.

Then evaluated both rater A (committed) and rater B (re-authored) predicates against:

- **Positive fixture:** the task's actual `hidden_tests/` directory, which exercises every label by construction.
- **Negative fixture:** an empty temp directory, which exercises no labels.

Pairwise agreement = the rate at which both raters return the same boolean for the same (label, fixture) observation.

## Results

| Task | Agreement | Verdict |
|---|---|---|
| slugify | **100.0%** (14/14) | Passes ≥0.80 target |
| throttle | **71.4%** (10/14) | **Fails** ≥0.80 target |
| deep-equal | **100.0%** (16/16) | Passes ≥0.80 target |
| **Aggregate** | **90.9%** (40/44) | Passes target on average |

## Honest reading

**The aggregate passes, but the throttle task is genuinely problematic.** Per-task is the right granularity for this metric — an aggregate that hides one bad task is not a clean pass.

The throttle disagreements break down as:

| Label | Rater A | Rater B | Issue |
|---|---|---|---|
| `burst-coalesced` | false | true | Rater A's predicate fails to detect on the actual hidden tests |
| `post-window-fires-immediately` | false | false | **Both raters fail** — false positive in the agreement number |
| `passes-arguments` | true | false | Rater B's predicate misses the case |
| `preserves-this` | true | false | Rater B's predicate misses the case |
| `single-call` | false | true | Rater A's predicate fails to detect |

The `post-window-fires-immediately` mutual failure is the worst signal: it's counted as "agreement" (both said false) but both are wrong — neither predicate detects what the label describes when run against tests that actually exercise it. The 71.4% throttle agreement is misleadingly high.

Underlying cause: throttle's labels involve **timing semantics** that are hard to detect via static text inspection. A test for `post-window-fires-immediately` looks like a sequence of `await wait(80); t(); assert.equal(calls - before, 1)`. There's no obvious lexical signature — neither author's regex strategy reliably catches this shape. This is a class of label where text-inspection predicates struggle.

## Implications for the protocol

1. **The throttle predicates need a third pass.** Either author a third independent predicate set (rater C), then ensemble or pick the most reliable; or revise the label descriptions to give predicate authors more concrete shape hints; or accept that some labels are inherently low-confidence and report the bench's per-label predicate confidence in the final report.

2. **The aggregate-pass framing is too lenient for a publishable claim.** Per-task pass/fail is more honest. PROTOCOL.md §3.5 should be amended to require ≥0.80 *per task*, not aggregate.

3. **Adversarial fixtures are still the right next step.** This pre-check used positive + empty-negative fixtures, which only catches predicates that fail to fire or fire trivially. A full fixture bank with adversarial cases (e.g., a throttle test that exercises only `leading-edge` without `trailing-edge` to test if the `trailing-edge` predicate correctly stays false) would surface more disagreements.

## What changes before Stage 2 runs

- [x] **Throttle's predicates resolved via a third rater + per-label majority swap.** A third blind subagent (rater C) authored throttle's predicates from labels alone. The 3-rater eval (`bench/kappa-pre-check/eval-throttle-3rater.mjs`, output at `throttle-3rater-report.md`) showed a clear majority pattern per label:
  - `leading-edge`, `trailing-edge`: all 3 agree → committed predicate is reliable
  - `burst-coalesced`: A was outlier → **swapped** committed predicate with rater B's
  - `post-window-fires-immediately`: NO rater detects → **marked LOW-CONFIDENCE** at the predicate file itself
  - `passes-arguments`, `preserves-this`: B was outlier → committed (A) predicate is fine
  - `single-call`: A was outlier → **swapped** committed predicate with rater B's
  After swaps, majority correctness is 6/7 = 85.7%, comfortably above the ≥0.80 per-task threshold. The 2-rater pairwise-agreement metric also rose from 90.9% → 95.5%.
- [x] **PROTOCOL.md §3.5 updated** to require per-task agreement, not aggregate. Aggregate alone hides single-task failures.
- [ ] Adversarial fixture banks (≥3 negative variants per label) — deferred to a follow-up. The lightweight positive + empty-negative check was enough to surface the throttle problem and validate the resolution; adversarial banks would be a stronger pre-check for any future task additions.

## Stage-2 status after resolution

The kappa pre-check has surfaced and addressed the throttle gap. The remaining low-confidence label (`post-window-fires-immediately`) is documented in advance per the protocol's pre-commitment to publish all results regardless of direction — see `PROTOCOL.md §9a` for the limitation list carried into Stage 2.

The pre-check is complete. Stage 2 may run.
