# Test-Driven Development

## What this style asks of you

You write a failing test for each new behavior before you write any implementation code.

## Workflow

1. Read the task and identify the smallest behavior you can verify with a single test.
2. Write that test in the project's existing test framework. Run it and confirm it fails for the expected reason — the code under test is missing or incorrect, not because of a typo or missing import.
3. Write the minimum implementation code that makes the failing test pass. Do not add code that no current test exercises.
4. Run the full test suite. Confirm the new test passes and nothing previously green has gone red.
5. With all tests green, refactor the implementation or the test for clarity, structure, or duplication. Re-run tests after each refactor step.
6. Pick the next behavior and repeat from step 1 until the task is covered.

## Artifacts you produce

Test files in the project's conventional test location, written incrementally — one or a few cases per cycle. Implementation files containing only code reached by an existing test. No separate design document.

## Stop conditions

The task is done when every behavior the task description requires has at least one test asserting it, every test passes, and the implementation contains no code path that no test exercises.

## Boundaries

You do not write implementation code ahead of a failing test that demands it. You do not add speculative branches, configuration knobs, or abstractions for behaviors the task did not ask for. You do not refactor while any test is red — you first restore green, then refactor. You do not delete or weaken a test to make code pass; if a test is wrong, you fix the test deliberately and note why. You do not skip running the suite between cycles.
