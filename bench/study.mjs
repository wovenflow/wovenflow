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

import { dispatchTrial, dispatchEditTrial } from './runner.js';
import { scoreHidden, HiddenTestLeakError } from './scorer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// --- shared constants -------------------------------------------------------

// Conditions the orchestrator recognizes for v2 Stage-2. The harness's
// `KNOWN_STYLES` also accepts these strings (runner.js B1).
// v2 deliberately narrows to three conditions; bench/runner.js's KNOWN_STYLES
// remains permissive (plan, freeform) for v1 compatibility.
const KNOWN_CONDITIONS = new Set(['baseline', 'tdd', 'dtdd']);

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

// Tool-usage preamble appended to every system prompt regardless of condition.
// Describes what `write_source` and `write_test` do so the model knows to call
// them. Stays condition-agnostic — methodology guidance lives in the style card
// (when one is loaded) and never bleeds into Baseline.
const TOOL_USAGE_INSTRUCTIONS = [
  '## Tool usage',
  '',
  'You have access to two tools for emitting files:',
  '',
  '- `write_source(path, content)` — write a source file. `path` is relative',
  '  to the project root (e.g. `index.js`). Calling this tool replaces any',
  "  previously-written file at the same path. Implementation files belong",
  '  here.',
  '- `write_test(path, content)` — write a test file. `path` is relative to',
  '  the project root. Use this for any test files you author. Implementation',
  '  belongs in `write_source`, not here.',
  '',
  'Call the tools rather than printing file contents inline. When you are',
  'finished, stop generating tool calls; the harness will end the turn.',
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
  ];

  return { system_prompt, user_message, tools };
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
  const root = typeof repo_root === 'string' && repo_root.length > 0
    ? repo_root
    : REPO_ROOT;

  // --- Phase 1 planning ------------------------------------------------
  // Topology is hardcoded `single` for v2 — multi-agent is out of scope per
  // the spec's B6 contract. The trial-id shape matches the harness's existing
  // worktree naming so dispatchTrial's output paths line up.
  const phase1_planned = [];
  for (const task_id of tasks) {
    for (const condition of conditions) {
      for (let trial_index = 0; trial_index < trials; trial_index += 1) {
        phase1_planned.push({
          task_id,
          condition,
          trial_index,
          topology: 'single',
          trial_id: `${task_id}-${condition}-single-${trial_index}`,
        });
      }
    }
  }

  if (dry_run) {
    return { phase1_planned };
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
      const prompt = composePrompt({
        condition: entry.condition,
        task_id: entry.task_id,
        repo_root: root,
      });
      const result = await dispatchTrial({
        task_id: entry.task_id,
        style: entry.condition,
        topology: entry.topology,
        trial_index: entry.trial_index,
        run_id,
        system_prompt: prompt.system_prompt,
        user_message: prompt.user_message,
        tools: prompt.tools,
      });
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
      result = await dispatchEditTrial({
        phase1_trial_dir: entry.phase1_trial_dir,
        task_id: entry.task_id,
        include_original_description: entry.include_original_description,
        run_id,
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

function parseArgs(argv) {
  const out = {
    run_id: null,
    tasks: null,
    conditions: null,
    trials: null,
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
    dry_run,
  });

  if (dry_run) {
    // Emit a human-readable matrix. The spec's regex matches lines containing
    // `<task>.*<condition>`; keeping task first matches that, and one line per
    // planned trial is easy to grep.
    process.stdout.write(
      `Planned ${plan.phase1_planned.length} Phase 1 trials ` +
        `(${tasks.length} tasks × ${conditions.length} conditions × ${trials} trials):\n`,
    );
    for (const entry of plan.phase1_planned) {
      process.stdout.write(
        `  ${entry.task_id}\t${entry.condition}\ttrial=${entry.trial_index}\t(${entry.trial_id})\n`,
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
