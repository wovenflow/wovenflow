// B1-B3 implementations for the DTDD prompting-style bench.
// Contract: doc/specs/2026-05-10-dtdd-bench.spec.md, behaviors B1, B2, B3.
//
// B1: loadProtocol — sync read+parse+validate of the pre-registered protocol
//     JSON, returns {config, metadata.protocol_sha} where protocol_sha is the
//     full git SHA captured from `git rev-parse HEAD` of the file's repo.
// B2: dispatchTrial — sync (despite test 1 awaiting it; an awaited sync
//     throw still rejects). Returns the style card path, the topology helper
//     path, and a per-trial worktree path. Refuses topology helper paths
//     that smell style-specific (the spec forbids style-specific wiring
//     outside the style card).
// B3: captureTrial — async; reads a fixture trial JSON and writes the six
//     required artifacts under bench/results/<run_id>/<trial_id>/.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// runner.js lives at <repo-root>/bench/runner.js, so the repo root is one up.
const REPO_ROOT = path.resolve(__dirname, '..');

// --- Path resolution ----------------------------------------------------
// The spec's test fences pass paths like `bench/test/fixtures/...` regardless
// of the cwd `npm test --prefix bench` lands in (npm runs scripts from the
// package directory, so cwd is bench/, but the fences were authored to read
// naturally from the repo root). Resolve in this order:
//   1. as given (handles repo-root cwd)
//   2. relative to the repo root (handles bench/ cwd with `bench/...` paths)
//   3. relative to bench/ with the `bench/` prefix stripped
// First hit wins. If none exist, the unresolved (as-given) path is returned
// so the caller's I/O surfaces a clean ENOENT.
function resolveBenchRelative(p) {
  if (path.isAbsolute(p)) return p;
  if (existsSync(p)) return path.resolve(p);
  const fromRepo = path.resolve(REPO_ROOT, p);
  if (existsSync(fromRepo)) return fromRepo;
  if (p.startsWith('bench/')) {
    const fromBench = path.resolve(REPO_ROOT, 'bench', p.slice('bench/'.length));
    if (existsSync(fromBench)) return fromBench;
  }
  return path.resolve(p);
}

// --- B1 -----------------------------------------------------------------

export class ProtocolValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProtocolValidationError';
  }
}

const REQUIRED_PROTOCOL_FIELDS = [
  'tasks',
  'styles',
  'topologies',
  'model_id',
  'n_trials_per_cell',
  'temperature',
  'stop_conditions',
  'seed',
];

function validateProtocolShape(config) {
  const missing = [];
  for (const field of REQUIRED_PROTOCOL_FIELDS) {
    if (!(field in config)) missing.push(field);
  }
  if (missing.length > 0) {
    throw new ProtocolValidationError(
      `protocol missing required field(s): ${missing.join(', ')}`,
    );
  }
  // Light type checks — the spec calls for "well-typed" required fields.
  if (!Array.isArray(config.tasks)) {
    throw new ProtocolValidationError('tasks must be an array');
  }
  if (!Array.isArray(config.styles)) {
    throw new ProtocolValidationError('styles must be an array');
  }
  if (!Array.isArray(config.topologies)) {
    throw new ProtocolValidationError('topologies must be an array');
  }
  if (typeof config.model_id !== 'string') {
    throw new ProtocolValidationError('model_id must be a string');
  }
  if (typeof config.n_trials_per_cell !== 'number') {
    throw new ProtocolValidationError('n_trials_per_cell must be a number');
  }
  if (typeof config.temperature !== 'number') {
    throw new ProtocolValidationError('temperature must be a number');
  }
  if (
    config.stop_conditions === null ||
    typeof config.stop_conditions !== 'object'
  ) {
    throw new ProtocolValidationError('stop_conditions must be an object');
  }
  if (typeof config.seed !== 'number') {
    throw new ProtocolValidationError('seed must be a number');
  }
}

function captureGitSha(forFile) {
  // `git rev-parse HEAD` resolved in the directory containing the protocol
  // file, so a protocol committed to a different repo than the harness still
  // pins its own SHA.
  const cwd = path.dirname(forFile);
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new ProtocolValidationError(
      `git rev-parse HEAD returned non-SHA value: ${sha}`,
    );
  }
  return sha;
}

export function loadProtocol(protocolPath) {
  if (typeof protocolPath !== 'string' || protocolPath.length === 0) {
    throw new ProtocolValidationError('loadProtocol requires a path string');
  }
  const resolved = resolveBenchRelative(protocolPath);
  let raw;
  try {
    raw = readFileSync(resolved, 'utf8');
  } catch (err) {
    throw new ProtocolValidationError(
      `failed to read protocol at ${resolved}: ${err.message}`,
    );
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new ProtocolValidationError(
      `protocol at ${resolved} is not valid JSON: ${err.message}`,
    );
  }
  validateProtocolShape(config);
  const protocol_sha = captureGitSha(resolved);
  return { config, metadata: { protocol_sha, protocol_path: resolved } };
}

// --- B2 -----------------------------------------------------------------

const KNOWN_STYLES = new Set(['tdd', 'dtdd', 'plan', 'freeform']);
const KNOWN_TOPOLOGIES = new Set(['single', 'multi']);

function rejectStyleSpecificTopology(helperPath, style) {
  // The spec forbids "topology configs that introduce style-specific wiring
  // outside the style card." We detect that by checking whether the helper
  // path's filename references any known style name. This catches the
  // motivating example (`bench/topology/multi-tdd-only.md`) and analogous
  // patterns for the other three styles.
  const base = path.basename(helperPath).toLowerCase();
  for (const candidate of KNOWN_STYLES) {
    // Use a word-boundary-ish check so e.g. `multi.md` doesn't false-match.
    const re = new RegExp(`(^|[^a-z])${candidate}([^a-z]|$)`, 'i');
    if (re.test(base)) {
      throw new Error(
        `style-specific topology wiring rejected: helper path ${helperPath} ` +
          `references style "${candidate}" — per spec B2, the multi-agent ` +
          `topology helper is constant across all four styles. ` +
          `Methodology-driven asymmetries belong in the style card.`,
      );
    }
  }
  // Also reject a helper path that explicitly mentions the dispatched style.
  if (style && base.includes(style.toLowerCase())) {
    throw new Error(
      `style-specific topology wiring rejected: helper path ${helperPath} ` +
        `references the dispatched style "${style}".`,
    );
  }
}

export function dispatchTrial(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('dispatchTrial requires an options object');
  }
  const {
    task_id,
    style,
    topology,
    trial_index,
    dry_run = false,
    topology_helper_path,
  } = options;

  if (typeof task_id !== 'string' || task_id.length === 0) {
    throw new Error('dispatchTrial: task_id must be a non-empty string');
  }
  if (!KNOWN_STYLES.has(style)) {
    throw new Error(
      `dispatchTrial: unknown style "${style}" (expected one of ${[...KNOWN_STYLES].join(', ')})`,
    );
  }
  if (!KNOWN_TOPOLOGIES.has(topology)) {
    throw new Error(
      `dispatchTrial: unknown topology "${topology}" (expected one of ${[...KNOWN_TOPOLOGIES].join(', ')})`,
    );
  }
  if (typeof trial_index !== 'number' || !Number.isInteger(trial_index) || trial_index < 0) {
    throw new Error('dispatchTrial: trial_index must be a non-negative integer');
  }

  // If a topology helper override is provided, vet it first — synchronous
  // throw is required so B2's second test (assert.throws sync matcher) sees
  // it directly without needing to await.
  if (topology_helper_path !== undefined) {
    rejectStyleSpecificTopology(topology_helper_path, style);
  }

  const styleCardPath = `bench/styles/${style}.md`;
  const topologyHelperPath =
    topology_helper_path ?? `bench/topology/${topology}.md`;
  const worktreePath = path.resolve(
    REPO_ROOT,
    'bench',
    'worktrees',
    `${task_id}-${style}-${topology}-${trial_index}`,
  );

  if (!dry_run) {
    // Materialize the worktree directory. Real branching off a clean commit
    // is left to the runner that ties this into the trial executor; the
    // bench unit-tests use dry_run, so we keep this side effect minimal.
    mkdirSync(worktreePath, { recursive: true });
  }

  return {
    style_card_path: styleCardPath,
    topology_helper_path: topologyHelperPath,
    worktree_path: worktreePath,
    task_id,
    style,
    topology,
    trial_index,
    dry_run,
  };
}

// --- B3 -----------------------------------------------------------------

const VALID_STOP_REASONS = new Set(['done', 'turn-cap', 'time-cap', 'error']);

function writeArtifactTree(rootDir, files) {
  for (const [relPath, contents] of Object.entries(files ?? {})) {
    const target = path.join(rootDir, relPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
}

export async function captureTrial(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('captureTrial requires an options object');
  }
  const { run_id, trial_id, fixture } = options;
  if (typeof run_id !== 'string' || run_id.length === 0) {
    throw new Error('captureTrial: run_id must be a non-empty string');
  }
  if (typeof trial_id !== 'string' || trial_id.length === 0) {
    throw new Error('captureTrial: trial_id must be a non-empty string');
  }
  if (typeof fixture !== 'string' || fixture.length === 0) {
    throw new Error('captureTrial: fixture must be a non-empty path string');
  }

  const fixturePath = resolveBenchRelative(fixture);
  if (!existsSync(fixturePath) || !statSync(fixturePath).isFile()) {
    throw new Error(`captureTrial: fixture not found at ${fixturePath}`);
  }
  const trial = JSON.parse(readFileSync(fixturePath, 'utf8'));

  if (!VALID_STOP_REASONS.has(trial.stop_reason)) {
    throw new Error(
      `captureTrial: fixture stop_reason "${trial.stop_reason}" not in ${[...VALID_STOP_REASONS].join('|')}`,
    );
  }

  const trialDir = path.resolve(
    REPO_ROOT,
    'bench',
    'results',
    run_id,
    trial_id,
  );
  const sourceDir = path.join(trialDir, 'source');
  const testsDir = path.join(trialDir, 'tests');
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(testsDir, { recursive: true });

  writeArtifactTree(sourceDir, trial.source_files);
  writeArtifactTree(testsDir, trial.test_files);

  // conversation.jsonl: one JSON object per line, no trailing comma.
  const conversation = Array.isArray(trial.conversation)
    ? trial.conversation
    : [];
  const jsonl =
    conversation.map((turn) => JSON.stringify(turn)).join('\n') +
    (conversation.length > 0 ? '\n' : '');
  writeFileSync(path.join(trialDir, 'conversation.jsonl'), jsonl);

  const meta = {
    run_id,
    trial_id,
    task_id: trial.task_id,
    style: trial.style,
    topology: trial.topology,
    trial_index: trial.trial_index,
    tokens_input: Number(trial.tokens_input ?? 0),
    tokens_output: Number(trial.tokens_output ?? 0),
    wall_clock_ms: Number(trial.wall_clock_ms ?? 0),
    stop_reason: trial.stop_reason,
    captured_at: new Date().toISOString(),
  };
  writeFileSync(
    path.join(trialDir, 'meta.json'),
    JSON.stringify(meta, null, 2) + '\n',
  );

  return trialDir;
}
