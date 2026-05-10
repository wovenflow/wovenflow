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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ProviderConfigError } from './providers/errors.js';

export { ProviderConfigError };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// runner.js lives at <repo-root>/bench/runner.js, so the repo root is one up.
const REPO_ROOT = path.resolve(__dirname, '..');

const DEFAULT_TURN_CAP = 20;
const DEFAULT_WALL_CLOCK_CAP_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_GRACE_MS = 30 * 1000;

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

// dispatchTrial is intentionally a regular (non-async) function. Validation
// errors must throw synchronously so B2 of the main bench spec's
// `assert.throws(() => dispatchTrial({...}))` test path works. When dry_run
// is false we return a Promise from the live runner — `await dispatchTrial`
// still works in the dry-run case because awaiting a non-Promise just yields
// the value.
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
    provider,
    run_id,
    turn_cap,
    wall_clock_cap_ms,
    grace_ms,
    env,
    protocol_model_id,
    system_prompt,
    user_message,
    tools,
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
    // is left to the runner that ties this into the trial executor.
    mkdirSync(worktreePath, { recursive: true });
  }

  if (dry_run) {
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

  // Live path. Resolve provider config from the in-test shortcut or from env.
  // resolveProvider may throw ProviderConfigError; that throw stays synchronous
  // so misconfiguration surfaces before the trial dispatches.
  const providerConfig = resolveProviderConfig({
    provider,
    env: env ?? process.env,
    protocol_model_id,
  });

  const trialId = `${task_id}-${style}-${topology}-${trial_index}`;
  const effectiveRunId = run_id ?? `live-${Date.now()}`;

  return runLiveTrial({
    task_id,
    style,
    topology,
    trial_index,
    trial_id: trialId,
    run_id: effectiveRunId,
    style_card_path: styleCardPath,
    topology_helper_path: topologyHelperPath,
    worktree_path: worktreePath,
    provider: providerConfig,
    turn_cap: turn_cap ?? DEFAULT_TURN_CAP,
    wall_clock_cap_ms: wall_clock_cap_ms ?? DEFAULT_WALL_CLOCK_CAP_MS,
    grace_ms: grace_ms ?? DEFAULT_GRACE_MS,
    system_prompt: system_prompt ?? `style: ${style}\ntopology: ${topology}\ntask: ${task_id}`,
    user_message: user_message ?? `Implement task ${task_id}.`,
    tools: tools ?? [],
  });
}

// --- B2 (provider extension): resolveProvider + live trial runner -------

const KNOWN_PROVIDERS = new Set(['anthropic', 'openai-compatible']);
const SUPPORTED_OPENAI_VARIANTS = new Set(['openai-chat-completions']);

// resolveProvider per the bench-provider spec B2. Pure function over an env
// map and the protocol's model_id; produces a config object the runner uses
// to dispatch a live trial. Throws ProviderConfigError on any unrecognized
// or incomplete configuration before dispatch.
export function resolveProvider({ env = {}, protocol_model_id } = {}) {
  const providerName = env.BENCH_PROVIDER;

  if (!providerName || providerName === 'anthropic') {
    return {
      name: 'anthropic',
      endpoint_url: null,
      model_id: protocol_model_id || env.BENCH_PROVIDER_MODEL || null,
      protocol_variant: null,
    };
  }

  if (providerName === 'openai-compatible') {
    const url = env.BENCH_PROVIDER_URL;
    const model = env.BENCH_PROVIDER_MODEL;
    const variant = env.BENCH_PROVIDER_PROTOCOL;
    const missing = [];
    if (!url) missing.push('BENCH_PROVIDER_URL');
    if (!model) missing.push('BENCH_PROVIDER_MODEL');
    if (!variant) missing.push('BENCH_PROVIDER_PROTOCOL');
    if (missing.length > 0) {
      throw new ProviderConfigError(
        `openai-compatible provider missing required env var(s): ${missing.join(', ')}`,
      );
    }
    if (!SUPPORTED_OPENAI_VARIANTS.has(variant)) {
      throw new ProviderConfigError(
        `openai-compatible: BENCH_PROVIDER_PROTOCOL "${variant}" is not supported in this build. ` +
          `Supported variants: ${[...SUPPORTED_OPENAI_VARIANTS].join(', ')}.`,
      );
    }
    // Per spec B2: env var wins over protocol model_id for the
    // openai-compatible path because the protocol's model id is Claude-specific.
    return {
      name: 'openai-compatible',
      endpoint_url: url,
      model_id: model,
      protocol_variant: variant,
    };
  }

  throw new ProviderConfigError(
    `BENCH_PROVIDER "${providerName}" is not recognized. ` +
      `Supported providers: ${[...KNOWN_PROVIDERS].join(', ')}.`,
  );
}

// Internal: resolve the effective provider config for dispatchTrial. Honours
// the in-test {provider} shortcut first (so unit tests can inject a mock
// without setting env vars), otherwise falls back to env-based resolution.
function resolveProviderConfig({ provider, env, protocol_model_id }) {
  if (provider && typeof provider === 'object') {
    if (typeof provider.name !== 'string' || provider.name.length === 0) {
      throw new ProviderConfigError(
        'dispatchTrial: provider.name must be a non-empty string',
      );
    }
    return {
      name: provider.name,
      endpoint_url: provider.endpoint_url ?? null,
      model_id: provider.model_id ?? protocol_model_id ?? null,
      protocol_variant: provider.protocol_variant ?? null,
      script: provider.script ?? null,
    };
  }
  return resolveProvider({ env, protocol_model_id });
}

// Resolve the path used for `provider.script` to an absolute file path.
// The mock-provider scripts are referenced as `bench/test/fixtures/...` from
// the spec test fences regardless of the cwd at test time.
function resolveScriptPath(scriptPath) {
  return resolveBenchRelative(scriptPath);
}

// Load the provider module that exposes runTrial(). When provider.script is
// set we import that module directly. Otherwise we route by provider.name to
// the bundled adapters.
async function loadProviderModule(providerConfig) {
  if (providerConfig.script) {
    const resolved = resolveScriptPath(providerConfig.script);
    if (!existsSync(resolved)) {
      throw new ProviderConfigError(
        `provider script not found at ${resolved} (specifier: ${providerConfig.script})`,
      );
    }
    return import(pathToFileURL(resolved).href);
  }
  if (providerConfig.name === 'anthropic') {
    return import('./providers/anthropic.js');
  }
  if (providerConfig.name === 'openai-compatible') {
    return import('./providers/openai-compatible.js');
  }
  throw new ProviderConfigError(
    `no built-in adapter for provider "${providerConfig.name}"`,
  );
}

// Live trial runner. Imports the provider module, sets up the wall-clock
// AbortController, calls provider.runTrial, applies the runner-level
// stop-condition rules from B5, and writes the artifact tree per B1/B3.
async function runLiveTrial(ctx) {
  const {
    task_id,
    style,
    topology,
    trial_index,
    trial_id,
    run_id,
    worktree_path,
    style_card_path,
    topology_helper_path,
    provider,
    turn_cap,
    wall_clock_cap_ms,
    grace_ms,
    system_prompt,
    user_message,
    tools,
  } = ctx;

  // Write live-trial artifacts at REPO_ROOT/bench/results/<run_id>/<trial_id>/.
  // The bench's npm test command `cd ..` chdirs to the repo root before
  // invoking node --test, so test fences that read `bench/results/...` see
  // the same path. REPO_ROOT is computed at module load relative to this
  // file, so the result is stable even when the test process is launched
  // from elsewhere.
  const trialDir = path.resolve(REPO_ROOT, 'bench', 'results', run_id, trial_id);
  const sourceDir = path.join(trialDir, 'source');
  const testsDir = path.join(trialDir, 'tests');
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(testsDir, { recursive: true });

  const startedAt = Date.now();
  const controller = new AbortController();
  // Use unref()-able timers so a still-armed timer can never keep the event
  // loop alive past the trial it was created for. This matters when a test
  // process imports this module and the runner returns before the wall-clock
  // cap fires — without unref, the default 15-minute cap would block process
  // exit.
  const wallClockTimer = setTimeout(() => controller.abort('wall-clock'), wall_clock_cap_ms);
  if (typeof wallClockTimer.unref === 'function') wallClockTimer.unref();

  // Force-terminate the trial if the provider doesn't honour the abort within
  // the grace window (spec B5 force-terminate clause). We arm a single timer
  // on first abort; the race below resolves when it fires.
  let graceTimer = null;
  let resolveForceTerminate = null;
  const forceTerminate = new Promise((resolve) => {
    resolveForceTerminate = resolve;
  });
  controller.signal.addEventListener('abort', () => {
    graceTimer = setTimeout(() => {
      if (resolveForceTerminate) resolveForceTerminate({ __force_terminated__: true });
    }, grace_ms);
    if (typeof graceTimer.unref === 'function') graceTimer.unref();
  }, { once: true });

  let providerResult;
  let stopReason = 'error';
  let providerError = null;
  let resolvedModelId = provider.model_id;

  try {
    const mod = await loadProviderModule(provider);
    if (typeof mod.runTrial !== 'function') {
      throw new ProviderConfigError(
        `provider module does not export runTrial() (provider: ${provider.name}, script: ${provider.script ?? 'built-in'})`,
      );
    }

    const providerPromise = Promise.resolve(
      mod.runTrial({
        task_id,
        style,
        topology,
        trial_index,
        trial_id,
        run_id,
        system_prompt,
        user_message,
        tools,
        signal: controller.signal,
        options: {
          turn_cap,
          wall_clock_cap_ms,
          grace_ms,
          endpoint_url: provider.endpoint_url,
          model_id: provider.model_id,
          protocol_variant: provider.protocol_variant,
        },
      }),
    );

    providerResult = await Promise.race([providerPromise, forceTerminate]);
    if (providerResult && providerResult.__force_terminated__) {
      stopReason = 'error';
      providerError = 'provider abort timeout';
      providerResult = {
        conversation: [{ role: 'system', content: 'provider abort timeout (grace window expired)' }],
        source_files: {},
        test_files: {},
        tokens_input: 0,
        tokens_output: 0,
        stop_reason: 'error',
        model_id: resolvedModelId,
      };
    } else {
      stopReason = providerResult?.stop_reason ?? 'done';
      if (providerResult?.model_id) resolvedModelId = providerResult.model_id;
    }
  } catch (err) {
    providerError = err && err.message ? err.message : String(err);
    stopReason = 'error';
    providerResult = {
      conversation: [{ role: 'system', content: `[runner] provider error: ${providerError}` }],
      source_files: {},
      test_files: {},
      tokens_input: 0,
      tokens_output: 0,
      stop_reason: 'error',
      model_id: resolvedModelId,
    };
  } finally {
    clearTimeout(wallClockTimer);
    if (graceTimer) clearTimeout(graceTimer);
    // Defuse the force-terminate promise so it doesn't keep us pending.
    if (resolveForceTerminate) resolveForceTerminate({ __noop__: true });
  }

  // Validate the stop_reason returned by the provider. If it's bogus, override
  // to 'error' so the on-disk meta is always one of the four sanctioned values.
  if (!VALID_STOP_REASONS.has(stopReason)) {
    stopReason = 'error';
  }

  const wallClockMs = Date.now() - startedAt;

  // Write source/, tests/, conversation.jsonl
  writeArtifactTree(sourceDir, providerResult.source_files ?? {});
  writeArtifactTree(testsDir, providerResult.test_files ?? {});
  const conversation = Array.isArray(providerResult.conversation)
    ? providerResult.conversation
    : [];
  const jsonl =
    conversation.map((turn) => JSON.stringify(turn)).join('\n') +
    (conversation.length > 0 ? '\n' : '');
  writeFileSync(path.join(trialDir, 'conversation.jsonl'), jsonl);

  // Compose meta.json — B3 of the main bench spec PLUS the additive provider
  // fields from B3 of the bench-provider spec.
  const meta = {
    run_id,
    trial_id,
    task_id,
    style,
    topology,
    trial_index,
    tokens_input: Number(providerResult.tokens_input ?? 0),
    tokens_output: Number(providerResult.tokens_output ?? 0),
    wall_clock_ms: wallClockMs,
    stop_reason: stopReason,
    captured_at: new Date().toISOString(),
    // Provider extension (B3):
    provider: provider.name,
    endpoint_url: provider.endpoint_url ?? null,
    model_id: resolvedModelId ?? null,
  };
  if (providerError) {
    meta.error = providerError;
  }
  writeFileSync(
    path.join(trialDir, 'meta.json'),
    JSON.stringify(meta, null, 2) + '\n',
  );

  return {
    trial_id: trial_id,
    run_id,
    style_card_path,
    topology_helper_path,
    worktree_path,
    stop_reason: stopReason,
    provider: provider.name,
    endpoint_url: provider.endpoint_url ?? null,
    model_id: resolvedModelId ?? null,
    tokens_input: meta.tokens_input,
    tokens_output: meta.tokens_output,
    wall_clock_ms: wallClockMs,
    trial_dir: trialDir,
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
