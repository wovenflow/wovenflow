# Specification-first development

## What this style asks of you

You capture each behavior as prose plus a test block inside a single markdown specification file before writing implementation code.

## Workflow

1. Read the task and create a `.spec.md` file for the feature or fix.
2. In the spec, write one or more user stories describing who needs the behavior and why, in plain prose.
3. For each behavior, write an `IF / WHEN / THEN` triplet describing the precondition, the trigger, and the observable outcome. Keep the prose readable on its own — a reader who skipped the code blocks should still understand the behavior.
4. Immediately after each triplet, add a fenced code block containing a test that asserts that exact behavior in the project's test language. The fence sits inline in the markdown; you do not move it to a separate test file.
5. Once the spec covers every behavior the task requires, write implementation files whose only job is to make the specced tests pass.
6. Run the test suite. If a test fails, decide whether the spec is wrong (edit the triplet and its fence) or the implementation is wrong (edit the implementation). Re-run until green.

## Artifacts you produce

A single `.spec.md` per feature or fix, containing user stories, `IF / WHEN / THEN` triplets, and inline test fences. Implementation source files referenced by the tests. You do not create separate test files, additional spec markdown files, or sibling design documents; if you find you have written more than one `.spec.md` for the same task, consolidate them before declaring the work done.

## Stop conditions

Every behavior the task describes appears as a triplet in the spec, every triplet has a test fence, every fence passes, and no implementation code exists that no fence exercises.

## Boundaries

You do not write implementation code before the spec describes the behavior in prose and in a test fence. You do not move tests out of the markdown into standalone files. You do not leave triplets without an accompanying fence. You do not edit a fence purely to silence a failure. You do not declare the work complete unless every fence actually executed and reported a verifiable pass or fail.
