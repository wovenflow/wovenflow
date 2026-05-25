// Bench study orchestrator (v2 Stage-2).
//
// Implements behaviors B2-B9 of doc/specs/2026-05-11-bench-study-orchestrator.spec.md.
//
// Exports:
//   - composePrompt({condition, task_id, repo_root})          — B2-B5
//   - runStudy({run_id, tasks, conditions, trials, dry_run})  — B6 (dry-run)
//                                                              plus live path
//   - planPhase2({run_id, run_dir, phase1_trial_dirs})        — B7
//   - scoreTrialAndUpdateMeta({trial_dir, task_id, phase})    — B8
//
// CLI: `node bench/study.mjs --run-id=... --tasks=... --conditions=...
//      --trials=... [--dry-run]`  (B9)
//
// Composition is provider-agnostic on the outside but tuned for the
// openai-compatible adapter's tool-call extraction:
// `bench/providers/openai-compatible.js` matches `fn.name === 'write_source'`
// and `fn.name === 'write_test'` literally — so we must produce tool
// definitions with those exact names in the OpenAI function-call schema.

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  statSync,
  mkdirSync,
  appendFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  dispatchTrial,
  dispatchEditTrial,
  dispatchMultiAgentTrial,
  composeOrchestratorPrompt,
} from './runner.js';
import { scoreHidden, HiddenTestLeakError } from './scorer.js';

// Topology values the study orchestrator routes on. Mirrors KNOWN_TOPOLOGIES
// in runner.js but kept local so a typo in the CLI flag fails fast in study.mjs
// rather than dispatching a trial only to have the runner reject it.
const KNOWN_TOPOLOGIES = new Set(['single', 'multi']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// --- shared constants -------------------------------------------------------

// Conditions the orchestrator recognizes. The harness's `KNOWN_STYLES`
// (runner.js B1) accepts the same strings. `baseline`, `tdd`, and `dtdd`
// are the v2 pre-reg matrix (see DEFAULT_CONDITIONS below); `plan` and
// `freeform` are accepted as exploratory conditions when explicitly named
// via --conditions. They are not in the default matrix. Multi-agent
// decomposition for plan/freeform is explicitly out-of-scope per
// doc/specs/2026-05-13-bench-multi-agent-topology.spec.md § "Out of scope" —
// under --topology=multi those conditions fall back to multi.md §1's
// "single subagent for the whole task" default. The whitelist exists to
// catch CLI typos before dispatching trials and burning budget.
const KNOWN_CONDITIONS = new Set(['baseline', 'tdd', 'dtdd', 'plan', 'freeform']);

// v2 task set per spec B9's default. Kept here as a single source of truth so
// the CLI default and any programmatic caller stay aligned.
const DEFAULT_TASKS = [
  'slugify',
  'semver-parse',
  'throttle',
  'deep-equal',
  'group-by',
];

const DEFAULT_CONDITIONS = ['baseline', 'tdd', 'dtdd'];

// Per-trial turn budget for the study workflow. Deliberately above the
// provider's floor of `DEFAULT_TURN_CAP = 20` (see bench/runner.js): the DTDD
// workflow runs spec → tests → implementation across multiple `write_test` /
// `write_source` calls, and 20 turns was empirically too tight — models spent
// the budget on small test writes and then stubbed `write_source` on the last
// turn. 35 gives that workflow headroom while still acting as a ceiling, not a
// target; callers can override per `runStudy` invocation.
//
// Exported so the CLI (`main`) and tests can name the default without
// re-hard-coding 35. This is a near-pre-registered value — change it only
// via an explicit `--turn-cap` override on a run, never by editing the
// constant for a single run.
export const STUDY_DEFAULT_TURN_CAP = 35;

// Tool-usage preamble appended to every system prompt regardless of condition.
// Describes what `write_source` and `write_test` do so the model knows to call
// them. Stays condition-agnostic — methodology guidance lives in the style card
// (when one is loaded) and never bleeds into Baseline.
const TOOL_USAGE_INSTRUCTIONS = [
  '## Tool usage',
  '',
  'You have access to three tools:',
  '',
  '- `write_source(path, content)` — write a source file. `path` is relative',
  '  to the project root (e.g. `index.js`). Calling this tool replaces any',
  "  previously-written file at the same path. Implementation files belong",
  '  here.',
  '- `write_test(path, content)` — write a test file. `path` is relative to',
  '  the project root. Use this for any test files you author. Implementation',
  '  belongs in `write_source`, not here.',
  '- `run_tests([test_path])` — execute your test files against your source',
  '  files in a sandboxed `node:test` process. Returns structured pass/fail per',
  '  test plus any load errors. Without an argument it runs every',
  '  `*.test.{js,mjs,cjs}` you have written via `write_test`; with `test_path`',
  '  it runs only that single file (path must match one you wrote — path',
  '  traversal is rejected). Use this after writing tests + source to verify',
  '  they actually pass. Without it you are guessing whether your tests run.',
  '',
  'When you call `write_source`, the file you write must be a real, working',
  'implementation — not a placeholder. Do not write TODO stubs or placeholder',
  'comments in function bodies (e.g. `// TODO: implement this`). Do not write',
  '`throw new Error("not implemented")` or empty function bodies and call it',
  'done. If you cannot complete the task, say so explicitly rather than',
  'shipping a stub. A complete-but-empty function is worse than no submission.',
  '',
  'Files are loaded as ES modules (the project `package.json` declares',
  '`"type": "module"`). Expose functions with `export function name(...)` or',
  '`export default function`. Do not use `module.exports` or `require(...)` —',
  'CommonJS syntax throws at import time in ES module scope.',
  '',
  'Call the tools rather than printing file contents inline. When you are',
  'finished, stop generating tool calls; the harness will end the turn.',
  '',
  '**When to stop:** once `run_tests` reports all tests passing AND you have',
  'no further `write_source` / `write_test` edits in mind, return without',
  'emitting any tool calls — the harness ends the trial as soon as an',
  'assistant turn produces zero tool calls. Do not re-run `run_tests` on',
  'already-passing code; additional turns burn budget without adding signal.',
  'You may also stop without ever calling `run_tests` if you judge your work',
  'complete on inspection.',
  '',
  'Wrap each function call in `<tool_call>...</tool_call>` XML tags, with a',
  'single JSON object inside containing `name` and `arguments` fields. Example:',
  '',
  '```',
  '<tool_call>',
  '{"name": "write_source", "arguments": {"path": "index.js", "content": "..."}}',
  '</tool_call>',
  '```',
].join('\n');

// --- B2 / B3 / B4 / B5: composePrompt --------------------------------------

/**
 * Compose the per-trial prompt for a given (condition, task) pair.
 *
 * @param {object} args
 * @param {string} args.condition  — 'baseline' | 'tdd' | 'dtdd' | ...
 * @param {string} args.task_id    — task name under bench/tasks/
 * @param {string} args.repo_root  — directory under which bench/ lives
 * @returns {{system_prompt: string, user_message: string, tools: Array}}
 */
export function composePrompt({ condition, task_id, repo_root } = {}) {
  if (typeof condition !== 'string' || condition.length === 0) {
    throw new Error('composePrompt: condition must be a non-empty string');
  }
  if (typeof task_id !== 'string' || task_id.length === 0) {
    throw new Error('composePrompt: task_id must be a non-empty string');
  }
  const root = typeof repo_root === 'string' && repo_root.length > 0
    ? repo_root
    : process.cwd();

  // --- system_prompt ----------------------------------------------------
  // Baseline (B3) gets NO style card content. For every other condition, we
  // splice the verbatim style-card body in. The condition-agnostic tool-usage
  // preamble follows so the model always knows the tools regardless of style.
  const systemParts = [];
  if (condition !== 'baseline') {
    const stylePath = path.join(root, 'bench', 'styles', `${condition}.md`);
    if (!existsSync(stylePath)) {
      throw new Error(
        `composePrompt: style card not found for condition "${condition}" at ${stylePath}`,
      );
    }
    const styleCard = readFileSync(stylePath, 'utf8').trim();
    systemParts.push(styleCard);
  }
  systemParts.push(TOOL_USAGE_INSTRUCTIONS);
  const system_prompt = systemParts.join('\n\n');

  // --- user_message -----------------------------------------------------
  // B4: includes intent.md verbatim. We add a one-line lead-in so the model
  // sees framing context, but the intent body itself is never paraphrased.
  const intentPath = path.join(root, 'bench', 'tasks', task_id, 'intent.md');
  if (!existsSync(intentPath)) {
    throw new Error(
      `composePrompt: intent.md not found for task "${task_id}" at ${intentPath}`,
    );
  }
  const intent = readFileSync(intentPath, 'utf8').trim();
  const user_message = `# Task\n\n${intent}`;

  // --- tools ------------------------------------------------------------
  // B5: exactly two OpenAI function-call tools. Names MUST match the literal
  // strings the openai-compatible provider checks for in its tool-call
  // extraction (see bench/providers/openai-compatible.js).
  const tools = [
    {
      type: 'function',
      function: {
        name: 'write_source',
        description:
          'Write a source (implementation) file. The path is relative to the project root (e.g. "index.js"). Calling this replaces any previously-written file at the same path.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Project-root-relative path for the source file.',
            },
            content: {
              type: 'string',
              description: 'Full contents of the source file.',
            },
          },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'write_test',
        description:
          'Write a test file. The path is relative to the project root. Use this for any test files you author; implementation code belongs in write_source.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Project-root-relative path for the test file.',
            },
            content: {
              type: 'string',
              description: 'Full contents of the test file.',
            },
          },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_tests',
        description:
          'Execute your test files (whatever you have written via write_test) against your source files (whatever you have written via write_source) in a sandboxed node:test process. Returns structured pass/fail per test plus any load errors. Use this to verify your tests actually pass before declaring the cycle complete. Supports node:test syntax; if you import vitest/jest/chai/etc., the harness shims `expect`/`describe`/`it` onto node:test equivalents (best-effort).',
        parameters: {
          type: 'object',
          properties: {
            test_path: {
              type: 'string',
              description:
                'Optional. If omitted, runs all *.test.{js,mjs,cjs} you have written via write_test. If specified, runs only that single file (must be a path you wrote via write_test; path traversal is rejected).',
            },
          },
        },
      },
    },
  ];

  return { system_prompt, user_message, tools };
}

// --- Multi-agent composition (2026-05-13 spec) -----------------------------
//
// `dispatch_subagent` is the orchestrator-only tool that lets a multi-agent
// orchestrator request fresh implementer subagents. Each call produces one
// subagent dispatch entry the runner picks up from the provider response (per
// the multi-agent spec's B4 / B5 contract). The provider parses these calls;
// the runner runs each subagent in its own fresh provider chain.
//
// Multiple `dispatch_subagent` calls in a single orchestrator turn fan out to
// multiple parallel subagents. The runner enforces N <= 6.
const DISPATCH_SUBAGENT_TOOL = {
  type: 'function',
  function: {
    name: 'dispatch_subagent',
    description:
      'Dispatch a fresh implementer subagent with a focused brief. Each subagent runs in its own provider call chain (no shared conversation), receives its own copy of the methodology, and writes files into the trial dir. Multiple dispatch_subagent calls in one turn run in parallel; the harness enforces a maximum of 6 subagents per orchestrator turn. Use this when a piece of work can be completed independently of other pieces.',
    parameters: {
      type: 'object',
      properties: {
        subagent_id: {
          type: 'string',
          description:
            'Short stable identifier for this subagent (e.g. "S1", "S2"). Appears in logs and per-subagent token accounting. Use distinct ids across calls in the same turn.',
        },
        brief: {
          type: 'string',
          description:
            'One paragraph describing the focused scope of the subagent\'s work. Include any cross-subagent invariants you have already settled (e.g. interface decisions). Do not repeat the methodology — the subagent will receive its own copy of the style card.',
        },
        artifacts_to_produce: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of project-root-relative file paths the subagent should write (e.g. ["source/index.js", "tests/index.test.js"]). Helps reviewers audit decomposition decisions; the subagent is not required to write every listed file.',
        },
      },
      required: ['subagent_id', 'brief'],
    },
  },
};

// Multi-agent prompt composition. Returns the orchestrator and subagent
// prompts/tools for a (condition, task) pair under topology='multi'.
//
// B3 strategy: **Option B (style-card injection via user_message)**. The
// orchestrator's system_prompt comes from `composeOrchestratorPrompt` in
// runner.js (methodology-neutral topology helper + role preamble); the
// orchestrator's user_message inlines the task intent AND the style-card
// body so the orchestrator can choose its decomposition without needing a
// `read_file` tool.
//
// Why Option B over Option A (file-read tool):
//   * Qwen3.6-35B-A3B-FP8 on a 30+ turn loop is already shaky with reasoning
//     enabled — minimizing tool-use ceremony for the orchestrator is wise.
//   * A `read_file` tool would burn an extra orchestrator turn for each style
//     card read, eating into the 35-turn budget on every multi-agent trial.
//   * The orchestrator's job is decomposition, not retrieval; the style card
//     is the methodology context, not a runtime artifact to discover.
//   * The methodology-neutrality of the topology helper (B3 / red-team
//     resolution) is preserved: the system_prompt is `multi.md` + the role
//     preamble. The style card lives in user_message — a payload the runner
//     supplies, not part of the orchestrator's identity prompt.
//
// Each dispatched subagent receives its own freshly-composed system_prompt
// (the same `composePrompt` output single-agent trials use) plus the brief
// the orchestrator wrote. Subagents do NOT inherit the orchestrator's
// conversation (B5).
export function composeMultiAgentPrompt({ condition, task_id, repo_root } = {}) {
  if (typeof condition !== 'string' || condition.length === 0) {
    throw new Error('composeMultiAgentPrompt: condition must be a non-empty string');
  }
  if (typeof task_id !== 'string' || task_id.length === 0) {
    throw new Error('composeMultiAgentPrompt: task_id must be a non-empty string');
  }
  const root = typeof repo_root === 'string' && repo_root.length > 0
    ? repo_root
    : process.cwd();

  // Orchestrator system_prompt: methodology-neutral topology helper. Reads
  // bench/topology/multi.md verbatim and appends a role preamble. Delegates
  // to composeOrchestratorPrompt in runner.js so the spec-compliance contract
  // (B3) lives in one place.
  const orch = composeOrchestratorPrompt({
    style: condition,
    task_id,
    repo_root: root,
  });

  // Orchestrator user_message: the task intent + the methodology body. The
  // orchestrator never sees the file path of the style card — it sees the
  // resolved content, so it can decompose without a read_file tool.
  const intentPath = path.join(root, 'bench', 'tasks', task_id, 'intent.md');
  if (!existsSync(intentPath)) {
    throw new Error(
      `composeMultiAgentPrompt: intent.md not found for task "${task_id}" at ${intentPath}`,
    );
  }
  const intent = readFileSync(intentPath, 'utf8').trim();

  // Subagent prompts: identical to the single-agent composition. Each
  // implementer subagent gets the full style card + tool-usage instructions
  // — the orchestrator's role preamble does NOT bleed into subagents.
  const subagentPrompt = composePrompt({ condition, task_id, repo_root: root });

  // Style card body (or empty for baseline — baseline has no style card).
  // We inline this into the orchestrator's user_message so the orchestrator
  // can decide its decomposition based on the methodology shape.
  let styleCardBody = '';
  if (condition !== 'baseline') {
    const stylePath = path.join(root, 'bench', 'styles', `${condition}.md`);
    if (existsSync(stylePath)) {
      styleCardBody = readFileSync(stylePath, 'utf8').trim();
    }
  }

  const orchestratorUserMessage = [
    '# Task',
    '',
    intent,
    '',
    '# Your methodology',
    '',
    condition === 'baseline'
      ? 'You have no specific methodology — implement the task however you judge best.'
      : `Your coding methodology is **${condition.toUpperCase()}**. The full methodology card follows. Use it to decide how to decompose the work into subagent dispatches.`,
    '',
    styleCardBody || '(no methodology card — baseline condition)',
    '',
    '# Your subagents',
    '',
    'Each implementer subagent you dispatch via `dispatch_subagent` will receive its own copy of the methodology card above plus the brief you write. You do not need to repeat the methodology in the brief — focus the brief on the scope of the subagent\'s work and any cross-subagent invariants you have already settled (interface decisions, file boundaries).',
    '',
    '# Hard requirements — orchestrator role',
    '',
    'You MUST dispatch at least one implementer subagent per trial via `dispatch_subagent`. You are the coordinator, not the implementer. Direct implementation by the orchestrator defeats the purpose of the multi-agent topology — it is what the harness is measuring against.',
    '',
    '- `write_source` from the orchestrator turn is allowed ONLY for a single methodology-specific artifact: the `<task>.spec.md` file authored by a DTDD orchestrator before dispatching its per-behavior subagents (e.g. `slugify.spec.md`). Any other path under `write_source` (anything under `source/`, anything that looks like implementation code, anything ending in `.js`/`.mjs`/`.cjs`/`.ts`) MUST be produced by a dispatched subagent, not by you.',
    '- `write_test` is for subagents, not for you — never call write_test from the orchestrator turn. Tests are an implementer-subagent responsibility under every methodology in this study.',
    '- `run_tests` is for subagents — each subagent verifies its own work. The orchestrator does not need to call run_tests; integration happens after subagents report back.',
    '',
    'If you call `write_source` with a path that is NOT a `<task>.spec.md` file, the harness will record the call to `meta.json.orchestrator_violations[]` as a methodology-compliance violation. The trial will still complete (this is observability, not a hard block), but downstream analysis will treat the trial as off-protocol.',
    '',
    'When you are done dispatching (and, for DTDD only, after writing the `<task>.spec.md`), stop generating tool calls; the harness will end your turn.',
  ].join('\n');

  // Orchestrator tools: dispatch_subagent + the file-write tools. Subagent
  // tools omit dispatch_subagent (subagents cannot dispatch their own
  // subagents — the provider also strips it defensively per spec
  // §"Subagent role plumbing").
  const orchestratorTools = [DISPATCH_SUBAGENT_TOOL, ...subagentPrompt.tools];
  const subagentTools = subagentPrompt.tools;

  return {
    orchestrator_system_prompt: orch.system_prompt,
    orchestrator_user_message: orchestratorUserMessage,
    orchestrator_tools: orchestratorTools,
    subagent_system_prompt: subagentPrompt.system_prompt,
    subagent_tools: subagentTools,
  };
}

// --- B6: runStudy -----------------------------------------------------------

/**
 * Drive the full v2 Stage-2 matrix (Phase 1 trials, then Phase 2 + Phase 2-WD
 * follow-ups, then scoring) end-to-end. When `dry_run: true`, returns the
 * planned Phase 1 trial list without dispatching anything.
 *
 * @param {object} args
 * @param {string} args.run_id
 * @param {string[]} args.tasks
 * @param {string[]} args.conditions
 * @param {number} args.trials
 * @param {boolean} [args.dry_run]
 * @param {string} [args.repo_root]
 */
export async function runStudy({
  run_id,
  tasks,
  conditions,
  trials,
  turn_cap,
  topology,
  dry_run = false,
  repo_root,
} = {}) {
  if (typeof run_id !== 'string' || run_id.length === 0) {
    throw new Error('runStudy: run_id must be a non-empty string');
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('runStudy: tasks must be a non-empty array');
  }
  if (!Array.isArray(conditions) || conditions.length === 0) {
    throw new Error('runStudy: conditions must be a non-empty array');
  }
  for (const c of conditions) {
    if (!KNOWN_CONDITIONS.has(c)) {
      throw new Error(
        `runStudy: unknown condition "${c}" (expected one of ${[...KNOWN_CONDITIONS].join(', ')})`,
      );
    }
  }
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new Error('runStudy: trials must be a positive integer');
  }
  // Resolve the per-trial turn cap: explicit override wins, else the
  // study-tuned default (above the provider floor of 20). A non-positive or
  // non-integer override is rejected rather than silently coerced.
  let resolved_turn_cap = STUDY_DEFAULT_TURN_CAP;
  if (turn_cap !== undefined) {
    if (!Number.isInteger(turn_cap) || turn_cap <= 0) {
      throw new Error('runStudy: turn_cap must be a positive integer when provided');
    }
    resolved_turn_cap = turn_cap;
  }
  // Resolve the topology: default `single` per the v2 Stage-2 lock; explicit
  // `multi` enables the v2.1 multi-agent path. Anything else fails fast.
  const resolved_topology = topology ?? 'single';
  if (!KNOWN_TOPOLOGIES.has(resolved_topology)) {
    throw new Error(
      `runStudy: unknown topology "${resolved_topology}" (expected one of ${[...KNOWN_TOPOLOGIES].join(', ')})`,
    );
  }
  const root = typeof repo_root === 'string' && repo_root.length > 0
    ? repo_root
    : REPO_ROOT;

  // --- Phase 1 planning ------------------------------------------------
  // Topology defaults to `single` for back-compat with the v2 Stage-2 lock;
  // `multi` is the v2.1 multi-agent path. The trial-id shape carries the
  // topology slot so single-agent and multi-agent results coexist in
  // bench/results/ without colliding.
  const phase1_planned = [];
  for (const task_id of tasks) {
    for (const condition of conditions) {
      for (let trial_index = 0; trial_index < trials; trial_index += 1) {
        phase1_planned.push({
          task_id,
          condition,
          trial_index,
          topology: resolved_topology,
          trial_id: `${task_id}-${condition}-${resolved_topology}-${trial_index}`,
        });
      }
    }
  }

  if (dry_run) {
    return {
      phase1_planned,
      turn_cap: resolved_turn_cap,
      topology: resolved_topology,
      phase2_inherits_prompt_from_phase1: true,
    };
  }

  // Compute the run_dir up front so the error-telemetry appender can write
  // to it from the very first trial, even if every dispatch fails (each
  // dispatchTrial would otherwise create the run_dir lazily as a side effect
  // of writing its own trial_dir).
  const run_dir = path.resolve(root, 'bench', 'results', run_id);
  const errors = [];
  // ensureRunDir + appendError isolate the I/O concern of telemetry so a
  // write failure here can't cascade into a second exception inside the
  // catch handler — appendError swallows its own I/O errors after one
  // best-effort write.
  const ensureRunDir = () => {
    try {
      mkdirSync(run_dir, { recursive: true });
    } catch {
      // mkdir failure is non-fatal here; the worst case is the in-memory
      // errors[] is the only record, which is still correct telemetry.
    }
  };
  const appendError = (record) => {
    errors.push(record);
    try {
      ensureRunDir();
      appendFileSync(path.join(run_dir, 'errors.jsonl'), JSON.stringify(record) + '\n');
    } catch {
      // Telemetry-of-telemetry would be turtles all the way down. The
      // in-memory record in `errors` is the authoritative one for the caller.
    }
  };

  // --- Phase 1 dispatch -----------------------------------------------
  // Sequential by design: simplifies rate-limit accounting and avoids
  // interleaved disk writes. Do not "optimize" into Promise.all.
  //
  // Per-trial try/catch keeps a single transient failure (network blip,
  // provider 5xx, dispatcher crash on one trial) from aborting the whole
  // matrix. For a 450-trial v2 Stage-2 run, losing hours of compute to one
  // bad trial is worse than the alternative: record the error, move on, let
  // the operator decide whether to re-run the failed cell offline.
  const phase1_results = [];
  for (const entry of phase1_planned) {
    try {
      // Route on topology. Multi-agent uses composeMultiAgentPrompt to derive
      // separate orchestrator and subagent prompts/tools; single-agent stays
      // on composePrompt. This branch is the only place where multi-agent
      // composition diverges from the single-agent flow — downstream the
      // dispatchMultiAgentTrial vs dispatchTrial signatures handle the rest.
      let result;
      if (entry.topology === 'multi') {
        const composed = composeMultiAgentPrompt({
          condition: entry.condition,
          task_id: entry.task_id,
          repo_root: root,
        });
        result = await dispatchMultiAgentTrial({
          task_id: entry.task_id,
          style: entry.condition,
          trial_index: entry.trial_index,
          run_id,
          system_prompt: composed.orchestrator_system_prompt,
          user_message: composed.orchestrator_user_message,
          tools: composed.orchestrator_tools,
          subagent_system_prompt: composed.subagent_system_prompt,
          subagent_tools: composed.subagent_tools,
          turn_cap: resolved_turn_cap,
        });
      } else {
        const prompt = composePrompt({
          condition: entry.condition,
          task_id: entry.task_id,
          repo_root: root,
        });
        result = await dispatchTrial({
          task_id: entry.task_id,
          style: entry.condition,
          trial_index: entry.trial_index,
          run_id,
          system_prompt: prompt.system_prompt,
          user_message: prompt.user_message,
          tools: prompt.tools,
          turn_cap: resolved_turn_cap,
          topology: entry.topology,
        });
      }
      phase1_results.push({ ...entry, ...result });
    } catch (err) {
      appendError({
        trial_id: entry.trial_id,
        task_id: entry.task_id,
        condition: entry.condition,
        trial_index: entry.trial_index,
        phase: 'phase-1',
        stage: 'dispatch',
        error: err && err.message ? err.message : String(err),
      });
    }
  }

  // --- Phase 1 scoring -------------------------------------------------
  // Scoring is fast and CPU-bound; we still wrap each scoring call so a
  // surprise (e.g. malformed meta.json, scoreHidden internal error) doesn't
  // skip Phase 2 for trials that were dispatched successfully.
  for (const r of phase1_results) {
    if (!r.trial_dir) continue;
    try {
      await scoreTrialAndUpdateMeta({
        trial_dir: r.trial_dir,
        task_id: r.task_id,
        phase: 'phase-1',
      });
    } catch (err) {
      appendError({
        trial_id: r.trial_id,
        task_id: r.task_id,
        phase: 'phase-1',
        stage: 'score',
        error: err && err.message ? err.message : String(err),
      });
    }
  }

  // --- Phase 2 planning + dispatch ------------------------------------
  const phase1_trial_dirs = phase1_results
    .map((r) => r.trial_dir)
    .filter((d) => typeof d === 'string' && existsSync(d));
  const phase2_plan = planPhase2({ run_id, run_dir, phase1_trial_dirs });

  // Sequential by design: same rationale as Phase 1. Each Phase 2 trial also
  // gets its own try/catch so a single editTrial failure doesn't lose the
  // remaining Phase 2 slots.
  const phase2_results = [];
  for (const entry of phase2_plan.phase2_planned) {
    let result;
    try {
      // Per the 2026-05-12 edittrial-prompt-passthrough spec: the Phase 2 fresh
      // agent must receive the same composed style card + tool-usage directives
      // + write_source/write_test tool definitions that Phase 1 received. We
      // re-derive the condition from the trial_id (planPhase2 doesn't carry it)
      // and use that to recompose the prompt. If the condition can't be parsed,
      // dispatchEditTrial's own back-compat defaults still apply.
      const condition = deriveConditionFromTrialId(entry.trial_id);
      let phase2_system_prompt;
      let phase2_tools;
      let phase2_subagent_system_prompt;
      let phase2_subagent_tools;
      if (condition && KNOWN_CONDITIONS.has(condition)) {
        if (resolved_topology === 'multi') {
          // Multi-agent edit: the Phase 2 orchestrator gets the multi-agent
          // composition (orchestrator system_prompt is the topology helper +
          // role preamble; orchestrator tools include dispatch_subagent).
          // Subagents get the methodology-aware single-agent composition.
          const composed = composeMultiAgentPrompt({
            condition,
            task_id: entry.task_id,
            repo_root: root,
          });
          phase2_system_prompt = composed.orchestrator_system_prompt;
          phase2_tools = composed.orchestrator_tools;
          phase2_subagent_system_prompt = composed.subagent_system_prompt;
          phase2_subagent_tools = composed.subagent_tools;
        } else {
          const prompt = composePrompt({
            condition,
            task_id: entry.task_id,
            repo_root: root,
          });
          phase2_system_prompt = prompt.system_prompt;
          phase2_tools = prompt.tools;
        }
      }
      result = await dispatchEditTrial({
        phase1_trial_dir: entry.phase1_trial_dir,
        task_id: entry.task_id,
        include_original_description: entry.include_original_description,
        run_id,
        turn_cap: resolved_turn_cap,
        system_prompt: phase2_system_prompt,
        tools: phase2_tools,
        // Phase 2 topology mirrors the run's chosen topology. dispatchEditTrial
        // is back-compat: omitted/`single` runs the existing single-agent path,
        // `multi` routes through the multi-agent edit path.
        topology: resolved_topology,
        subagent_system_prompt: phase2_subagent_system_prompt,
        subagent_tools: phase2_subagent_tools,
      });
      phase2_results.push({ ...entry, ...result });
    } catch (err) {
      appendError({
        trial_id: entry.trial_id,
        task_id: entry.task_id,
        phase: entry.include_original_description ? 'phase-2-wd' : 'phase-2',
        stage: 'dispatch',
        error: err && err.message ? err.message : String(err),
      });
      continue;
    }
    if (result?.trial_dir) {
      try {
        await scoreTrialAndUpdateMeta({
          trial_dir: result.trial_dir,
          task_id: entry.task_id,
          phase: entry.include_original_description ? 'phase-2-wd' : 'phase-2',
        });
      } catch (err) {
        appendError({
          trial_id: entry.trial_id,
          task_id: entry.task_id,
          phase: entry.include_original_description ? 'phase-2-wd' : 'phase-2',
          stage: 'score',
          error: err && err.message ? err.message : String(err),
        });
      }
    }
  }

  // Persist the skipped list as an audit trail. Each skipped trial gets one
  // line; non-existent run_dir is silently ignored (the skipped list will
  // still be returned in-memory).
  if (existsSync(run_dir) && phase2_plan.skipped.length > 0) {
    const lines = phase2_plan.skipped
      .map((s) => JSON.stringify(s))
      .join('\n');
    writeFileSync(path.join(run_dir, 'skipped.jsonl'), lines + '\n');
  }

  return {
    phase1_planned,
    phase1_results,
    phase2_planned: phase2_plan.phase2_planned,
    phase2_results,
    skipped: phase2_plan.skipped,
    errors,
    turn_cap: resolved_turn_cap,
  };
}

// --- B7: planPhase2 ---------------------------------------------------------

/**
 * Plan the Phase 2 + Phase 2-WD follow-up dispatches for a set of completed
 * Phase 1 trial directories. Purely descriptive — does not call
 * `dispatchEditTrial`. Execution happens in `runStudy`'s non-dry-run path.
 *
 * Empty-source trials are routed to `skipped` with reason `"empty-source"`
 * instead of generating Phase 2 entries; a Phase 2 dispatch against an empty
 * Phase 1 is meaningless (nothing to edit) and would pollute the matrix.
 *
 * @param {object} args
 * @param {string} args.run_id
 * @param {string} args.run_dir
 * @param {string[]} args.phase1_trial_dirs
 * @returns {{phase2_planned: object[], skipped: object[]}}
 */
export function planPhase2({ run_id, run_dir, phase1_trial_dirs } = {}) {
  if (typeof run_id !== 'string' || run_id.length === 0) {
    throw new Error('planPhase2: run_id must be a non-empty string');
  }
  if (typeof run_dir !== 'string' || run_dir.length === 0) {
    throw new Error('planPhase2: run_dir must be a non-empty string');
  }
  if (!Array.isArray(phase1_trial_dirs)) {
    throw new Error('planPhase2: phase1_trial_dirs must be an array');
  }

  const phase2_planned = [];
  const skipped = [];

  for (const trial_dir of phase1_trial_dirs) {
    const trial_id = path.basename(String(trial_dir).replace(/\/+$/, ''));
    const task_id = deriveTaskIdFromTrialId(trial_id);
    const sourceDir = path.join(trial_dir, 'source');

    let isEmpty = true;
    if (existsSync(sourceDir)) {
      try {
        const st = statSync(sourceDir);
        if (st.isDirectory()) {
          // Empty = no files (recursive). A directory containing only empty
          // subdirectories is still empty by this measure — there's nothing
          // for the Phase 2 agent to edit.
          isEmpty = !hasAnyFile(sourceDir);
        }
      } catch {
        isEmpty = true;
      }
    }

    if (isEmpty) {
      skipped.push({
        trial_id,
        trial_dir,
        reason: 'empty-source',
      });
      continue;
    }

    // Each non-empty Phase 1 trial fans out into TWO Phase 2 dispatches:
    // one without the original task description (the test condition: pure
    // artifact-driven edit) and one with it (the control: WD = "with
    // description"). The B7 fence asserts both flavors appear exactly once
    // per non-empty trial.
    for (const include_original_description of [false, true]) {
      phase2_planned.push({
        trial_id,
        task_id,
        phase1_trial_dir: trial_dir,
        include_original_description,
        phase: include_original_description ? 'phase-2-wd' : 'phase-2',
      });
    }
  }

  return { phase2_planned, skipped };
}

// Trial-id convention: `<task>-<condition>-<topology>-<trial_index>`. The
// task name is the first hyphen-delimited segment in the simple case, but
// some task names contain hyphens themselves (e.g. `deep-equal`, `semver-parse`,
// `group-by`). The trial id is composed by joining task + condition + topology
// + index with hyphens; we recover task by stripping the known-conditions and
// known-topology + trial_index suffix from the right.
function deriveTaskIdFromTrialId(trial_id) {
  // Parse from the right: trial_index (digits), topology, condition. Whatever
  // remains is the task_id. The harness only emits `single` for v2; we still
  // accept `multi` defensively in case a v1 trial sneaks in.
  const parts = trial_id.split('-');
  if (parts.length < 4) return trial_id; // malformed; let downstream surface it
  // Right-most part: trial_index (digits only).
  if (!/^\d+$/.test(parts[parts.length - 1])) return trial_id;
  const topology = parts[parts.length - 2];
  if (topology !== 'single' && topology !== 'multi') return trial_id;
  // Be permissive on the condition slot: a v1 trial may carry a condition not
  // in v2's KNOWN_CONDITIONS, but the task name still occupies the leading
  // parts. Join all but the trailing condition+topology+index segments.
  return parts.slice(0, parts.length - 3).join('-');
}

// Recover the condition slot from a trial_id of the form
// `<task>-<condition>-<topology>-<trial_index>`. Mirrors
// deriveTaskIdFromTrialId's right-anchored parsing: trial_index lives at the
// tail, topology one slot in, condition one slot before that. Returns null when
// the shape doesn't match so the caller can fall back to the back-compat
// defaults in dispatchEditTrial.
function deriveConditionFromTrialId(trial_id) {
  if (typeof trial_id !== 'string') return null;
  const parts = trial_id.split('-');
  if (parts.length < 4) return null;
  if (!/^\d+$/.test(parts[parts.length - 1])) return null;
  const topology = parts[parts.length - 2];
  if (topology !== 'single' && topology !== 'multi') return null;
  return parts[parts.length - 3];
}

function hasAnyFile(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isFile()) return true;
    if (entry.isDirectory()) {
      if (hasAnyFile(path.join(dir, entry.name))) return true;
    }
  }
  return false;
}

// --- B8: scoreTrialAndUpdateMeta -------------------------------------------

/**
 * Score a completed trial's `source/` against the appropriate hidden-tests
 * suite and write the result into the trial's `meta.json`.
 *
 *   - phase: 'phase-1'              → bench/tasks/<task>/hidden_tests/
 *   - phase: 'phase-2' or 'phase-2-wd' → bench/tasks/<task>/hidden_tests_after_edit/
 *
 * Errors from `scoreHidden` (HiddenTestLeakError, missing fixtures, etc.) are
 * recorded as `hidden_pass: { error: <message> }` rather than silently
 * collapsing to `{ pass_count: 0, total_count: 0 }`. Masking real failures as
 * zero-pass would corrupt downstream analysis.
 *
 * @param {object} args
 * @param {string} args.trial_dir
 * @param {string} args.task_id
 * @param {'phase-1'|'phase-2'|'phase-2-wd'} args.phase
 */
export async function scoreTrialAndUpdateMeta({ trial_dir, task_id, phase } = {}) {
  if (typeof trial_dir !== 'string' || trial_dir.length === 0) {
    throw new Error('scoreTrialAndUpdateMeta: trial_dir must be a non-empty string');
  }
  if (typeof task_id !== 'string' || task_id.length === 0) {
    throw new Error('scoreTrialAndUpdateMeta: task_id must be a non-empty string');
  }
  if (phase !== 'phase-1' && phase !== 'phase-2' && phase !== 'phase-2-wd') {
    throw new Error(
      `scoreTrialAndUpdateMeta: phase "${phase}" must be one of phase-1 | phase-2 | phase-2-wd`,
    );
  }

  const metaPath = path.join(trial_dir, 'meta.json');
  if (!existsSync(metaPath)) {
    throw new Error(`scoreTrialAndUpdateMeta: meta.json not found at ${metaPath}`);
  }
  let meta;
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch (err) {
    throw new Error(
      `scoreTrialAndUpdateMeta: meta.json at ${metaPath} is not valid JSON: ${err.message}`,
    );
  }

  const hidden_tests_subdir =
    phase === 'phase-1' ? 'hidden_tests' : 'hidden_tests_after_edit';
  const source_dir = path.join(trial_dir, 'source');

  let hidden_pass;
  try {
    const result = await scoreHidden({
      task_id,
      source_dir,
      hidden_tests_subdir,
    });
    // Preserve only the counts on the happy path; per-test detail and runtime
    // errors stay accessible by re-running scoreHidden against the trial dir,
    // but meta.json is the load-bearing summary read by downstream analysis.
    hidden_pass = {
      pass_count: result.pass_count,
      total_count: result.total_count,
    };
    if (Array.isArray(result.runtime_errors) && result.runtime_errors.length > 0) {
      hidden_pass.runtime_errors = result.runtime_errors;
    }
  } catch (err) {
    const message =
      err instanceof HiddenTestLeakError
        ? `HiddenTestLeakError: ${err.message}`
        : err && err.message
          ? err.message
          : String(err);
    hidden_pass = { error: message };
  }

  meta.hidden_pass = hidden_pass;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  return meta;
}

// --- B9: CLI ----------------------------------------------------------------

export function parseArgs(argv) {
  const out = {
    run_id: null,
    tasks: null,
    conditions: null,
    trials: null,
    turn_cap: null,
    topology: null,
    dry_run: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }
    if (arg === '--dry-run') {
      out.dry_run = true;
      continue;
    }
    const eq = arg.indexOf('=');
    if (!arg.startsWith('--') || eq < 0) {
      throw new Error(
        `unrecognized argument "${arg}" (expected --flag=value or --dry-run)`,
      );
    }
    const key = arg.slice(2, eq);
    const value = arg.slice(eq + 1);
    switch (key) {
      case 'run-id':
        out.run_id = value;
        break;
      case 'tasks':
        out.tasks = value.split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case 'conditions':
        out.conditions = value.split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case 'trials':
        out.trials = Number.parseInt(value, 10);
        break;
      case 'turn-cap': {
        // Parse strictly: reject anything that isn't a bare positive integer.
        // Number.parseInt('15abc', 10) === 15 would silently accept garbage,
        // so require the whole value to be digits, then range-check > 0. This
        // mirrors the fail-fast validation on --trials / --topology so a typo
        // can't quietly dispatch trials with a meaningless budget.
        const n = /^\d+$/.test(value) ? Number.parseInt(value, 10) : NaN;
        if (!Number.isInteger(n) || n <= 0) {
          throw new Error(
            `--turn-cap must be a positive integer (got "${value}")`,
          );
        }
        out.turn_cap = n;
        break;
      }
      case 'topology':
        out.topology = value;
        break;
      default:
        throw new Error(`unknown flag --${key}`);
    }
  }
  return out;
}

function printUsage(stream = process.stdout) {
  stream.write([
    'Usage: node bench/study.mjs [options]',
    '',
    'Options:',
    '  --run-id=<string>       Required (unless --dry-run). bench/results/ subdir name.',
    `  --tasks=<csv>           Comma-separated tasks (default: ${DEFAULT_TASKS.join(',')}).`,
    `  --conditions=<csv>      Comma-separated conditions (default: ${DEFAULT_CONDITIONS.join(',')}).`,
    '  --trials=<int>          Trials per cell (default: 1).',
    `  --turn-cap=<int>        Per-trial turn budget (positive int; default: ${STUDY_DEFAULT_TURN_CAP}).`,
    `  --topology=<single|multi>  Topology for the run (default: single).`,
    '  --dry-run               Print the planned matrix and exit without dispatching.',
    '',
    'Provider config is read from BENCH_PROVIDER, BENCH_PROVIDER_URL,',
    'BENCH_PROVIDER_MODEL, BENCH_PROVIDER_PROTOCOL (per the existing harness).',
    '',
  ].join('\n'));
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`bench/study.mjs: ${err.message}\n`);
    printUsage(process.stderr);
    process.exit(2);
  }
  if (parsed.help) {
    printUsage();
    process.exit(0);
  }

  const tasks = parsed.tasks ?? DEFAULT_TASKS;
  const conditions = parsed.conditions ?? DEFAULT_CONDITIONS;
  const trials = parsed.trials ?? 1;
  const run_id = parsed.run_id ?? null;
  // Per-trial turn budget: explicit --turn-cap override (already validated as a
  // positive integer in parseArgs) wins, else the study-tuned default. runStudy
  // re-validates and threads the resolved value down to the provider.
  const turn_cap = parsed.turn_cap ?? STUDY_DEFAULT_TURN_CAP;
  const topology = parsed.topology ?? 'single';
  const dry_run = parsed.dry_run;

  // Validate conditions up front so a typo doesn't burn budget. The error
  // message contains the offending value so the spec's regex
  // /condition.*nonsense|invalid condition|unknown condition/i hits.
  const invalid = conditions.filter((c) => !KNOWN_CONDITIONS.has(c));
  if (invalid.length > 0) {
    process.stderr.write(
      `bench/study.mjs: invalid condition(s): ${invalid.join(', ')}. ` +
        `Allowed: ${[...KNOWN_CONDITIONS].join(', ')}.\n`,
    );
    process.exit(2);
  }
  // Validate topology with a message format that matches the spec's regex
  // /topology.*<value>|invalid topology|unknown topology/i.
  if (!KNOWN_TOPOLOGIES.has(topology)) {
    process.stderr.write(
      `bench/study.mjs: unknown topology "${topology}". ` +
        `Allowed: ${[...KNOWN_TOPOLOGIES].join(', ')}.\n`,
    );
    process.exit(2);
  }
  if (!Number.isInteger(trials) || trials <= 0) {
    process.stderr.write(
      `bench/study.mjs: --trials must be a positive integer (got "${parsed.trials}")\n`,
    );
    process.exit(2);
  }
  if (!run_id && !dry_run) {
    process.stderr.write(
      'bench/study.mjs: --run-id is required (omit only with --dry-run)\n',
    );
    process.exit(2);
  }

  // For dry-run we don't need a real run_id; supply a placeholder so runStudy's
  // validation doesn't reject the call. The placeholder is never written to
  // disk because dry_run short-circuits before any dispatch.
  const effective_run_id = run_id ?? 'dry-run';

  const plan = await runStudy({
    run_id: effective_run_id,
    tasks,
    conditions,
    trials,
    turn_cap,
    topology,
    dry_run,
  });

  if (dry_run) {
    // Emit a human-readable matrix. The spec's regex matches lines containing
    // `<task>.*<condition>.*<topology>`; keeping that order makes the line
    // grep-friendly and one line per planned trial keeps the dry-run output
    // mechanical.
    process.stdout.write(
      `Planned ${plan.phase1_planned.length} Phase 1 trials ` +
        `(${tasks.length} tasks × ${conditions.length} conditions × ${trials} trials, topology=${topology}):\n`,
    );
    for (const entry of plan.phase1_planned) {
      process.stdout.write(
        `  ${entry.task_id}\t${entry.condition}\t${entry.topology}\ttrial=${entry.trial_index}\t(${entry.trial_id})\n`,
      );
    }
    process.exit(0);
  }

  // Non-dry-run path already executed and scored. Emit a short summary so the
  // operator can confirm the run completed without tailing logs.
  process.stdout.write(
    `Completed run "${effective_run_id}": ` +
      `${plan.phase1_results.length} Phase 1, ` +
      `${plan.phase2_results.length} Phase 2, ` +
      `${plan.skipped.length} skipped, ` +
      `${(plan.errors ?? []).length} errors.\n`,
  );
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`bench/study.mjs: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });
}
