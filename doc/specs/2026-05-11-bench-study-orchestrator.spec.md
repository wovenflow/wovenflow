# Bench study orchestrator + Baseline condition

## User stories

- As the bench protocol author, I want a deterministic script that drives the v2 Stage-2 matrix end-to-end against any configured provider, so that running the study reduces to one command invocation.
- As a reviewer of the v2 study, I want each trial's score (Phase 1, Phase 2, Phase 2-WD) recorded alongside its conversation log, so that downstream analysis can reproduce per-cell aggregates from disk without recomputing.
- As the bench harness maintainer, I want Baseline to be a first-class condition — not a freeform alias — so that the experimental contrast between "no methodology" and "methodology X" is honest and the harness rejects the protocol's condition name unambiguously.
- As an operator running the bench, I want a CLI that accepts `--run-id`, `--tasks`, `--conditions`, and `--trials` flags, so that a smoke run (1 trial × 1 task × 1 condition) and a full run (10 trials × 5 tasks × 3 conditions) use the same code path and differ only by arguments.

## Scope

This spec defines the **minimum surface** required to drive a real v2 Stage-2 run end-to-end. Specifically out of scope (deferred to a follow-up spec):

- Per-run report generation with heatmaps and per-cell pass-rate tables
- Bootstrap 95% CIs (computed during analysis, not at trial time)
- Methodology compliance grading sample selection (post-run analysis)
- Provider-specific tool-loop variants (e.g., Anthropic native tools vs OpenAI function-calls — current openai-compatible.js already handles the OpenAI shape)

In scope:

- Baseline condition in `KNOWN_STYLES`
- Prompt + tool composition logic per condition
- Trial iteration over (condition, task, trial_index)
- Phase 2 + Phase 2-WD dispatch per successful Phase 1
- Per-trial scoring with hidden_pass recorded in `meta.json`
- Minimal CLI at `bench/study.mjs`

## Behaviors

### B1: Baseline condition is a recognized style
∵ **IF** a caller invokes `dispatchTrial({style: 'baseline', task_id, topology, trial_index, dry_run: true})` with otherwise-valid parameters
↦ **WHEN** the harness validates the style argument
∴ **THEN** the call returns the dry-run prepared invocation without throwing the "unknown style" error; `KNOWN_STYLES` (exported or internal) accepts `'baseline'` alongside `tdd`, `dtdd`, `plan`, `freeform`

### B2: Prompt composer includes style card content when condition has one
∵ **IF** a study orchestrator function `composePrompt({condition: 'dtdd', task_id, repo_root})` is called for a condition whose style card exists at `bench/styles/<condition>.md`
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `system_prompt` contains the verbatim content of `bench/styles/<condition>.md` followed by tool-usage instructions (the exact instructions are an implementation detail; the verbatim style card content must be present in the output string and the orchestrator must not paraphrase it)

### B3: Prompt composer omits style card for Baseline
∵ **IF** `composePrompt({condition: 'baseline', task_id, repo_root})` is called
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `system_prompt` does NOT contain the content of any file under `bench/styles/`; it contains only the tool-usage instructions and any condition-agnostic preamble. The orchestrator must not silently fall back to `bench/styles/freeform.md` — Baseline is the genuine null

### B4: User message contains the task's intent.md verbatim
∵ **IF** `composePrompt({condition: <any>, task_id, repo_root})` is called for a task that has `bench/tasks/<task_id>/intent.md`
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `user_message` contains the verbatim content of `bench/tasks/<task_id>/intent.md`. The orchestrator must not summarize or rewrite the intent

### B5: Tools array contains write_source and write_test in OpenAI function-call shape
∵ **IF** `composePrompt({condition: <any>, task_id, repo_root})` is called
↦ **WHEN** it returns the composed prompt object
∴ **THEN** the returned `tools` is an array of exactly two function definitions matching the OpenAI tool-call schema: `{type: "function", function: {name: "write_source", description: <string>, parameters: {type: "object", properties: {path: {type: "string"}, content: {type: "string"}}, required: ["path", "content"]}}}` and the analogous shape for `write_test`. Names must match exactly (the bench's openai-compatible provider matches `fn.name === 'write_source'` literally)

### B6: Per-cell trial loop produces (conditions × tasks × trials) Phase 1 directories
∵ **IF** the orchestrator's `runStudy({run_id, tasks, conditions, trials, provider_env})` is called with concrete arrays of tasks and conditions and a positive integer `trials`
↦ **WHEN** it completes Phase 1 dispatch for all cells
∴ **THEN** `bench/results/<run_id>/` contains exactly `tasks.length × conditions.length × trials` Phase 1 trial directories, each named `<task>-<condition>-single-<trial_index>` (the trial id convention extends the existing harness pattern with `condition` in the slot `style` previously held; this is the harness-facing name. `'single'` topology is hardcoded — multi-agent topology is out of scope for v2)

### B7: Phase 2 and Phase 2-WD fire for each non-empty Phase 1 trial
∵ **IF** a Phase 1 trial directory has a non-empty `source/` directory (at least one file written by the agent) AND `runStudy` has completed Phase 1 batch
↦ **WHEN** the orchestrator proceeds to the edit phase
∴ **THEN** for each such trial directory it invokes `dispatchEditTrial` twice — once with `include_original_description: false` (producing `phase-2/`) and once with `include_original_description: true` (producing `phase-2-wd/`). Phase 1 trials with empty `source/` are skipped with an entry written to `bench/results/<run_id>/skipped.jsonl` containing `{trial_id, reason: "empty-source"}`. The orchestrator does NOT retry empty-source trials; the skip is recorded and counted

### B8: Each trial's meta.json records hidden_pass against the appropriate suite
∵ **IF** any trial (Phase 1, Phase 2, or Phase 2-WD) has completed and the orchestrator is finalizing it
↦ **WHEN** the orchestrator scores that trial
∴ **THEN** the trial's `meta.json` is updated to include a `hidden_pass` field as an object `{pass_count: <int>, total_count: <int>}`. Phase 1 is scored against `bench/tasks/<task>/hidden_tests/`; Phase 2 and Phase 2-WD are scored against `bench/tasks/<task>/hidden_tests_after_edit/`. Scoring failures (e.g., `HiddenTestLeakError`) are recorded as `hidden_pass: {error: <message>}` rather than masking the failure as a zero score

### B9: CLI accepts --run-id, --tasks, --conditions, --trials with documented defaults
∵ **IF** `node bench/study.mjs` is invoked with command-line flags
↦ **WHEN** the CLI parses arguments and dispatches to `runStudy`
∴ **THEN** it accepts the following:
  - `--run-id=<string>` (required when not in dry-run; the bench/results subdirectory name)
  - `--tasks=<comma-sep>` (defaults to the five v2 tasks: `slugify,semver-parse,throttle,deep-equal,group-by`)
  - `--conditions=<comma-sep>` (defaults to `baseline,tdd,dtdd`; any value not in that set causes the CLI to exit non-zero with a useful error)
  - `--trials=<positive-int>` (defaults to 1 for smoke; the full v2 lock-time matrix uses 10)
  - `--dry-run` (boolean; if set, prints the planned trial matrix and exits without dispatching)
  Provider configuration is read from environment per the existing harness convention (`BENCH_PROVIDER`, `BENCH_PROVIDER_URL`, `BENCH_PROVIDER_MODEL`, `BENCH_PROVIDER_PROTOCOL`). The CLI does NOT introduce new provider-config flags

## Red-team check

Decision under test: if we proceed, the project commits to building `bench/study.mjs` + extending `KNOWN_STYLES` per the nine behaviors above, as the unblocker for the v2 Stage-2 run.

Stakes: Phase 7 (testflow) and Phase 8 (subflow) costs are sunk if the spec needs major revision after lock. Larger stake: the actual Stage-2 run depends on this orchestrator being correct; a bug in prompt composition or tool-call extraction silently degrades all 450 trials.

Top three reasons this might not be the right call:

1. **Coupling Baseline-condition + study orchestrator in one spec may produce a subflow PR larger than the reviewer can effectively check.** Nine behaviors is at the upper edge of what one subflow run cleanly handles. Mitigation: subflow's named-agents mode lets reviewers persist across behaviors; if the spec proves too large at testflow time, split into two sequential specs (Baseline first as a 1-behavior spec, orchestrator as the remaining 8). Not a load-bearing objection unless review bandwidth is genuinely scarce.

2. **The tool-shape contract in B5 hard-codes the OpenAI function-call schema, but the Anthropic provider uses a different native tool shape.** If we later run v2 against Claude in addition to the local model, the prompt composer would need to branch by provider. Mitigation: scope is currently local-model-via-openai-compatible per the smoke. If Claude becomes a target, a provider-aware tool-shape adapter is a small additive change. Not load-bearing for the immediate goal.

3. **The trial-id naming in B6 (`<task>-<condition>-single-<trial_index>`) repurposes the slot the harness internally calls `style` to hold the v2 `condition`.** This is mostly a documentation concern: the harness's `dispatchTrial({style: 'baseline'})` accepts the string and writes the artifact dir accordingly, but internal code and meta.json fields still use the name `style` for what the protocol calls `condition`. Mitigation: keep the harness-internal name `style` for backwards compatibility with v1, document the mapping in the orchestrator's README; the protocol's analysis-time code reads the meta.json field by name regardless of label. Not load-bearing.

Verdict: **PROCEED.** All three objections are real but addressable; none requires reshaping the spec before testflow.

## Handoff

Once this prose is reviewed and accepted, invoke `wovenflow:testflow` to insert inline test fences alongside each behavior. The test fences for B1 belong adjacent to behavior B1, similarly for B2-B9. Tests should be `node --test` JavaScript fences, matching the existing bench conventions.

The subsequent `wovenflow:subflow` step will dispatch an implementer (or implementers per behavior) to make the failing tests pass — extending `bench/runner.js` (B1), adding `bench/study.mjs` (B2-B9), and any test fixtures the tests reference.
