# Topology helper authoring spec

You are authoring a multi-agent topology helper — the document that tells an orchestrator agent how to coordinate subagents on a coding task. The helper will be used identically across multiple coding-methodology conditions in a benchmark; your job is to make sure the helper is fair to all of them.

**You are blind to the methodologies being compared.** You do not know which workflows the orchestrator will be running under. Your job is to write a single methodology-agnostic helper that any reasonable workflow style can plug into without advantage or disadvantage.

## Constraints (load-bearing for fairness)

1. **Methodology-agnostic.** Do not require the orchestrator to produce a `spec.md`, a plan document, a test file before code, a research note, or any other named artifact. The orchestrator's methodology decides what artifacts it produces. The topology decides how the orchestrator coordinates subagents.
2. **No favoritism.** Do not use language that advantages any particular workflow style. Words like "spec-first," "test-first," "plan-first," "TDD," "BDD," etc. are out. So is the inverse: "freeform," "ad-hoc," "exploratory" as positive descriptors.
3. **Agent-actionable.** A competent orchestrator agent should be able to read this helper and execute the topology cleanly without inventing details. Be specific about WHEN something happens, not just WHAT.
4. **Self-contained.** Subagents the orchestrator dispatches will receive this same helper as part of their context. The helper must read clearly to both the orchestrator and the subagents.
5. **Word count target.** 400-700 words of instruction (excluding headers and code blocks). Aim for clarity, not coverage — under-specifying is better than over-specifying.

## Required sections

Author the helper as a single markdown document with these four sections, in this order:

### 1. Decomposition rule

How does the orchestrator split a coding task into subtasks for subagents?

Specify: when does the orchestrator decompose vs. handle the task as one unit? What's a reasonable size for a subtask? How are subtasks named/identified? How does the orchestrator track which subagent is doing what?

A reasonable answer is concrete — e.g., "decompose when the task has clearly separable concerns; otherwise dispatch one subagent for the whole task." Don't prescribe a particular workflow's decomposition (e.g., "one subagent per behavior" is too DTDD-flavored; "one subagent per planned step" is too plan-then-test-flavored). Find a more general framing.

### 2. Synchronization points

When does the orchestrator wait for subagents to report back vs. let them run concurrently? What does the orchestrator do with their reports?

Specify: dispatch model (parallel vs sequential), wait conditions, how subagent outputs are reconciled with each other (e.g., do they share a working tree? are commits merged?), and how the orchestrator detects subagent completion.

### 3. Clarification routing

How does a subagent surface a question or ambiguity? Where does it go?

Specify: whether subagents address questions to the orchestrator, to a peer subagent, or directly to a human; whether the subagent waits for an answer or proceeds with its best guess; what happens if the orchestrator is itself unsure.

### 4. Stop condition

When is the multi-agent run considered complete?

Specify: per-subagent stop (when does the subagent declare its work done), per-orchestrator stop (when does the orchestrator declare the whole run done), and failure modes (timeout, unresolvable contradiction, blocked subagent).

## Process

1. Read this entire document. Read no other documents about the benchmark.
2. Author the helper to the constraints above. Aim for 400-700 words across the four sections combined.
3. Run a self-check against this list:
   - [ ] Total word count 400-700 (instruction text only, excluding headers and code blocks)
   - [ ] All four required sections present in the required order
   - [ ] No requirement to produce a particular named artifact (spec, plan, test, doc, etc.) before others
   - [ ] No methodology-flavored vocabulary (TDD, BDD, spec-first, plan-first, freeform-as-positive, ad-hoc, etc.)
   - [ ] No project-name leakage (no "wovenflow," "DTDD," "benchmark," etc.)
   - [ ] Agent-actionable — a competent orchestrator could execute this without inventing details
4. Save the result as `bench/topology/multi.md`.
5. Report back the word count and confirm the self-check passed.

## What this helper will be used for

A benchmark dispatches coding tasks to AI orchestrator agents. Each orchestrator gets a system prompt describing its coding methodology (the "style") and this topology helper describing how to coordinate subagents. We compare results across multiple methodologies.

The helper's job is to keep the multi-agent coordination protocol identical across methodologies, so any difference in outcomes traces to the methodology and not to topology asymmetries. Your job is to make that property hold.
