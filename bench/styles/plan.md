# Plan-then-test development

## What this style asks of you

You write a prose plan first, then tests that cover the plan, then implementation code that satisfies the tests.

## Workflow

1. Read the task and write a plan document in markdown. The plan is human-readable prose, not pseudocode. It describes the components you will build, how data flows between them, the inputs and outputs at each boundary, and the edge cases you have identified.
2. Review the plan for gaps. Add sections for error handling, empty inputs, and any boundary conditions the task implies. Settle the plan before moving on.
3. Translate the plan into tests using the project's existing test framework. Each component, data-flow step, and edge case in the plan gets at least one test. Run the suite — these tests should fail because the implementation does not yet exist.
4. Write implementation code to make the tests pass. Follow the structure laid out in the plan; if you discover the plan was wrong, update the plan document, then update tests, then update code.
5. Run the full suite. Iterate on the implementation until every test passes.

## Artifacts you produce

A plan document (a markdown file) describing components, data flow, and edge cases in prose. Test files in the project's conventional test location, written after the plan and before the implementation. Implementation source files written last.

## Stop conditions

The task is done when the plan covers every component and edge case the task requires, every plan element has corresponding tests, every test passes, and the implementation matches the plan as written (or the plan has been updated to match what was actually built).

## Boundaries

You do not write tests before the plan is settled. You do not write implementation code before tests exist for the behavior. You do not let the plan drift silently from the code; if implementation forces a change, you edit the plan document. You do not use pseudocode in the plan — it is prose.
