# Methodology compliance grading rubric

This rubric is the contract between the bench protocol and the humans who grade trials for methodology compliance. The grading produces the per-style compliance rate that `B7` of `doc/specs/2026-05-10-dtdd-bench.spec.md` requires and that the report's "Compliant vs non-compliant" section breaks down.

## Purpose

For each sampled trial, decide whether the agent followed the methodology its style card prompted. The aggregate compliance rate per style tells readers whether a style's headline metric is dragged by instruction-following failures or whether the methodology was actually executed.

This is **not** a code-quality judgment. A trial can produce broken code and still be compliant (the agent followed the methodology, even if poorly). A trial can produce great code and still be non-compliant (the agent ignored the methodology and just shipped what it wanted). Grade the methodology adherence, not the result.

## What you receive per trial

The grading interface gives you, per trial:

- The style card the agent received (`bench/styles/<style>.md`)
- The task intent (`bench/tasks/<task>/intent.md`)
- The full conversation log (`bench/results/<run-id>/<trial-id>/conversation.jsonl`)
- Files the agent produced (`source/`, `tests/`, plus any other artifacts under the trial dir)
- The trial's `meta.json` (token counts, time, stop reason)

You do **not** see hidden tests, the agent's hidden-test pass rate, or the predicates' coverage output. Compliance grading is independent of outcome metrics.

## General principle

A trial is **compliant** if the conversation log shows the agent intentionally executing the prompted methodology, with the resulting artifacts matching the methodology's required shape. A trial is **non-compliant** if the agent skipped, faked, or substantively deviated from the methodology.

When you grade, cite specific evidence — a conversation turn number, an artifact path, a quote. Compliance verdicts without citations are not usable.

## Per-style rubrics

### TDD

**Compliant** if both:

1. **Test artifact exists** — the trial dir has a tests file (or test code in source) that contains assertions targeting the task.
2. **Tests come first as a planning step** — the conversation shows the agent intentionally writing tests as the primary planning artifact before writing implementation code. The agent should reach for tests as the way to think about the problem, not as an afterthought.

**Non-compliant** examples:

- The agent wrote a single throwaway test after implementation just to "have a test."
- The agent reasoned in prose about the implementation, wrote the implementation, then wrote tests that match what the implementation already does.
- No tests in the trial output at all.

**Borderline case.** The agent wrote the function signature first, then tests, then the body. **Verdict:** compliant if the signature was a stub (no implementation logic) and the tests came before the body. The signature alone is not "implementation."

### DTDD

**Compliant** if both:

1. **A `.spec.md`-shaped artifact exists** — there is a markdown file (any name; conventionally `.spec.md` or named after the task) containing prose `IF / WHEN / THEN` behavior triplets with code-fence test blocks immediately after each.
2. **Source of truth is the spec** — the conversation references the spec as the canonical artifact at least once during implementation. The agent should treat the spec as the definition of done.

**Non-compliant** examples:

- The agent wrote prose-only design notes with no code fences, then wrote tests separately.
- The agent wrote a spec markdown but never referred to it again — the implementation drifted from what the spec described.
- The agent skipped the markdown step entirely and wrote tests + code directly.

**Borderline case.** The agent wrote a spec with `IF / WHEN / THEN` behaviors but used the words "Given / When / Then" instead of `IF / WHEN / THEN`. **Verdict:** compliant. The synonyms map cleanly; the methodology is the structured behavior + co-located test, not the keywords.

### Plan-then-test

**Compliant** if all three:

1. **A plan artifact exists** — a markdown file (not source code) outlining the approach, components, or design decisions.
2. **Plan precedes source** — the conversation shows the plan being authored before any source file.
3. **Tests follow the plan** — tests are written referring to the plan, before or alongside source implementation.

**Non-compliant** examples:

- The agent wrote a plan as a code comment in the source file (not a separate markdown).
- The agent wrote source first, then back-filled a plan to satisfy the appearance.
- The agent's "plan" is a single sentence in the conversation, not a written artifact.

**Borderline case.** The plan is a section of `README.md` rather than a dedicated `plan.md`. **Verdict:** compliant if the plan is in markdown, distinguishable from documentation prose, and was authored before source.

### Freeform

**Always compliant.** Freeform's "methodology" is the absence of one. The agent had explicit permission to use any approach. Don't grade.

## Recording your verdict

Per trial, record:

```json
{
  "compliant": true,
  "evidence": "Conversation turn 3: agent writes 'I'll start by writing tests for the empty-input case'. Trial dir has tests/slugify.test.js created at turn 4. Source written at turn 7 only after tests are visible. The TDD methodology was followed intentionally."
}
```

Or for non-compliant:

```json
{
  "compliant": false,
  "evidence": "Conversation turns 1-5 show the agent writing the source implementation directly. Tests appear at turn 6 only after the agent says 'now let me add some tests'. Tests are written to match the existing implementation, not used as a planning step."
}
```

Keep evidence specific (turn numbers, quotes, file paths). Avoid generic phrases like "agent followed methodology" or "agent did not follow methodology."

## Inter-rater calibration

Before grading the full sample:

1. All raters read this rubric and the four style cards (`bench/styles/{tdd,dtdd,plan,freeform}.md`).
2. All raters independently grade the same 5-trial calibration set (one trial from each style + one extra).
3. Compare verdicts. For any disagreement, discuss the evidence and align on the rule. Update this rubric if a rule is genuinely ambiguous.
4. Then grade the full sample independently.

The protocol reports inter-rater agreement (Fleiss' kappa) as a first-class result. Low kappa means the rubric was ambiguous; the rubric should be revised before publishing.

## When uncertain

If a trial is genuinely on the borderline after applying the per-style rubric and the borderline cases above, grade it according to the **dominant signal**: which way does the conversation lean overall? When even that is unclear, mark non-compliant and document the ambiguity in the evidence — this is the conservative direction (it's safer to say "the methodology wasn't clearly followed" than to say "it was, despite the noise").

## What this rubric does NOT cover

- Code quality (handled by the bench's hidden-test-pass-rate metric)
- Speed or token cost (separate secondary metrics)
- Style adherence beyond the methodology (e.g., naming conventions, modularity)
- Whether the agent's tests are actually correct (handled by self-test pass rate)

Stay focused on methodology compliance. Other metrics are computed separately by the bench harness.
