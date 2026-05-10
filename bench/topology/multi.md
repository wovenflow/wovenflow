# Multi-agent topology helper

This document describes how an orchestrator agent coordinates subagents on a coding task. The orchestrator brings its own working style; this document only governs coordination.

## 1. Decomposition rule

The orchestrator inspects the incoming task and decides between two paths.

Dispatch a single subagent for the whole task when the work touches one cohesive area, when the changes are tightly coupled, or when splitting would create more coordination overhead than it removes. This is the default for small or medium tasks.

Decompose into multiple subtasks when the work contains two or more parts that can be worked on without one needing to read the in-progress output of the other. Typical separators include independent files or modules, independent layers (for example, data access vs. user-facing surface), or independent fixes within a larger change. If two parts must agree on an interface, treat the interface decision as a prerequisite the orchestrator settles before dispatch, not as something the subagents negotiate among themselves.

Aim for subtasks that a competent agent can complete in roughly one focused pass. If a candidate subtask feels like it needs further splitting, split it; if two candidates feel like they keep referring to each other, merge them.

The orchestrator assigns each subtask a short identifier (for example, `S1`, `S2`) and a one-line scope statement, and keeps a small in-memory table mapping identifier to scope, assigned subagent, and current status (dispatched, reporting, complete, blocked). The identifiers appear in subagent prompts and in their reports back.

## 2. Synchronization points

The orchestrator may dispatch subagents in parallel, in sequence, or as a mix. Run subtasks in parallel only when each can produce its result without observing the others' partial work. Run them in sequence when a later subtask depends on an earlier one's output. When mixing, group independent subtasks into a parallel wave and place dependent ones in a later wave.

Parallel subagents must operate in isolated working trees so their edits do not collide. Each subagent reports a summary plus the diff (or branch) it produced. The orchestrator integrates results into the main working tree itself, in an order it controls, resolving any overlap before moving on. Sequential subagents may share the working tree directly because only one is active at a time.

The orchestrator waits for every dispatched subagent in the current wave to report before starting the next wave or before declaring the task complete. A subagent is considered done when it returns its final report; until then the orchestrator treats it as in flight. The orchestrator does not start integrating partial results from a wave that has not finished.

## 3. Clarification routing

A subagent that hits a question or ambiguity addresses it to the orchestrator, not to peer subagents and not to the human. The subagent states the question, states the assumption it would make in the absence of an answer, and either pauses or proceeds under that assumption depending on how reversible the choice is — pause when the choice would be expensive to undo, proceed when it would not.

The orchestrator answers from the original task description and from decisions it has already made. If the orchestrator itself cannot resolve the question, it records the ambiguity, picks the most defensible interpretation, notes the choice in its final report, and continues. Subagents do not contact the human directly.

## 4. Stop condition

A subagent stops when it has delivered the change its subtask describes and has reported back, or when it has reported that it is blocked and cannot make further progress without a decision.

The orchestrator stops when every dispatched subagent has reached one of those two states and the integrated result satisfies the original task. If a subagent reports blocked, the orchestrator either resolves the block and redispatches, redefines the subtask, or finishes without that piece and notes the gap.

The run also ends on a hard failure: a subagent that cannot return at all, two integrated results that contradict each other in a way the orchestrator cannot reconcile, or a wall-clock or step budget being exhausted. In every ending case the orchestrator produces one final report covering what was done, what was not done, and any unresolved questions.
