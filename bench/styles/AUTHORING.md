# Style card authoring spec

You are authoring four style cards for a benchmark that compares prompting styles for AI-assisted coding. Each style card is the system prompt an agent receives at the start of a coding trial; it tells the agent what methodology to follow.

**You are blind to the methodology under test.** You do not know which style is the "favorite" or what hypothesis is being evaluated. Your job is to write four cards that fairly represent four common prompting practices in AI-assisted coding, each at equal length and equal specificity.

## Constraints (load-bearing for fairness)

1. **Equal word count.** Each style card is **between 250 and 350 words** of actual instruction (excluding code blocks and headers). The variance between the longest and shortest card must be ≤ 30 words.
2. **Equal specificity.** Each card explains the style's discipline at the same level of detail — what the agent should do step-by-step, not just a slogan. Using the test of "could a competent agent execute this style's instructions cleanly?" — yes for all four, or no for all four.
3. **No methodology endorsement.** Do not call any style "best practice," "modern," "rigorous," or similar. Each card describes the style neutrally as a coding discipline.
4. **No cross-references.** Each card stands alone. Do not say "unlike TDD" or "this is similar to BDD." Each card is read by an agent that does not see the others.
5. **No project-name leakage.** Do not say "wovenflow," "DTDD," "this benchmark," or similar. The agent should not be able to infer which project authored these cards.
6. **Neutral tone.** Write each card in the voice of a competent engineer explaining a discipline they use. No salesmanship, no warnings, no flattery.

## Required sections per card

Every card has five sections, in this order:

1. **What this style asks of you** (one sentence)
2. **Workflow** (3-6 step list — what you do, in what order)
3. **Artifacts you produce** (what files you write and roughly when)
4. **Stop conditions** (when you consider the work done)
5. **Boundaries** (what you don't do)

## The four styles

### `tdd.md` — Test-Driven Development

Authoring brief: classic TDD. Write a failing test first, then write the minimal code to make it pass, then refactor (red-green-refactor cycle). The agent should write tests as the primary planning artifact. Tests are written before implementation. Implementation is the minimum that makes the failing test pass. After tests pass, the agent may refactor, but only with green tests.

The card should make clear: tests are not after-thoughts; they are how the agent thinks about the problem before writing any code. The agent writes tests in whatever framework the project uses (assume the project's existing test runner is available; the agent does not need to set one up).

### `dtdd.md` — Documentation-and-test in one file

Authoring brief: a discipline where each behavior is captured in a single markdown document, with prose describing the behavior as `IF / WHEN / THEN` triplets and a code-fence test block immediately after each triplet. The agent writes a `.spec.md` file containing user stories and behavior triplets with test fences before writing implementation code. The `.spec.md` is the source of truth — implementation files exist to make the specced tests pass.

The card should make clear: prose comes first, then test code goes inside the markdown next to the prose, then implementation files satisfy what the spec describes. The agent does not move tests out of the markdown; tests are extracted by tooling at runtime (the agent doesn't need to set up extraction).

### `plan.md` — Plan-then-test

Authoring brief: the agent writes a plan document first, then writes tests to cover the plan, then writes implementation code to make the tests pass. The plan is a prose markdown document outlining what will be built — components, data flow, edge cases. Tests follow the plan; implementation follows the tests. The plan is a separate artifact from the tests and from the code.

The card should make clear: planning is the first deliverable; tests come after the plan is settled; implementation comes last. The plan is human-readable prose, not pseudocode.

### `freeform.md` — No prescribed method

Authoring brief: the agent builds the requested feature using whatever approach it judges best. No required artifact order, no required prose-first or tests-first discipline. The agent decides whether and when to write tests. The agent decides what to document.

The card should make clear: the agent is free to use its own judgment. It is not "no testing"; it is "no prescribed methodology." A competent agent given this card may still write tests, write a plan, or refactor — those are choices, not requirements.

## Process

1. Read this entire document. Read no other documents about the benchmark.
2. Author each card to the constraints above. Iterate until each is between 250 and 350 words and the four cards are within 30 words of each other.
3. Run a self-check against this checklist:
   - [ ] Each card is 250-350 words (instructions only, excluding headers and any code blocks)
   - [ ] Word count variance across the four ≤ 30 words
   - [ ] All five required sections present in each
   - [ ] No methodology endorsement language
   - [ ] No cross-references between cards
   - [ ] No project-name leakage (no "wovenflow," "DTDD," "this benchmark," etc.)
4. Save each as `bench/styles/<name>.md`.
5. Report back the four word counts and confirm the self-check passed.

## What the cards will be used for

Each card will be the system prompt for an AI agent given a small coding task. The agent reads the card, then reads a one-paragraph task description, then attempts the task. We measure whether the produced code passes a held-out test suite the agent didn't see.

The fairness of that comparison rests on these four cards being equally specific, equally clear, and equally agent-actionable. Your job is to make that true.
