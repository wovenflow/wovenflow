// OpenAI-compatible provider adapter for the bench runner.
//
// POSTs to <endpoint_url>/chat/completions per the openai-chat-completions
// protocol variant. Other variants (ollama-native, llama-cpp-grammar, etc.)
// are reserved for future adapters and throw ProviderConfigError when
// resolved — see runner.js's resolveProvider.
//
// runTrial() shape matches anthropic.js so the runner is provider-agnostic.
//
// vLLM-recovery env vars
// ----------------------
// vLLM has a known v1 multiproc IPC bug (TimeoutError on sample_tokens) that
// can crash the server periodically. A separate supervisor script
// (bench/.local-serve/vllm-supervisor.sh) auto-restarts vLLM, but the restart
// takes ~3-5 min. To survive a mid-trial crash, the per-turn fetch path is
// wrapped in a recovery loop: on a network-shaped failure, the provider polls
// ${endpoint_url}/models until vLLM answers OK, then retries the same turn.
//
//   VLLM_RECOVERY_MAX_WAIT_MS       — total ms to spend polling vLLM after
//                                     a single fetch failure (default 240_000
//                                     = 4 min, enough for a typical cold start
//                                     plus a small buffer). Capped further by
//                                     the trial's remaining wall budget.
//   VLLM_RECOVERY_MAX_RETRIES       — max retry attempts per single turn
//                                     before giving up and surfacing
//                                     stop_reason: 'error' (default 3).
//   VLLM_RECOVERY_POLL_INTERVAL_MS  — sleep between vLLM /models polls
//                                     (default 5_000).

import { ProviderConfigError } from './errors.js';
// Side-effect import: installs an undici Agent with extended bodyTimeout
// and headersTimeout as the global dispatcher, so undici's silent 5-min
// defaults don't preempt the bench's own wall_clock_cap_ms budget.
// See ./_fetch-config.mjs for rationale and env-var overrides.
import './_fetch-config.mjs';
import { runTestsTool } from '../run-tests-tool.js';

const DEFAULT_TURN_CAP = 20;
const DEFAULT_WALL_CLOCK_MS = 15 * 60 * 1000;
const DEFAULT_GRACE_MS = 30 * 1000;

// vLLM recovery defaults (see header). All overridable via env at call time.
const DEFAULT_RECOVERY_MAX_WAIT_MS = 240_000;
const DEFAULT_RECOVERY_MAX_RETRIES = 3;
const DEFAULT_RECOVERY_POLL_INTERVAL_MS = 5_000;
// Per-poll request timeout: short, since /models is a cheap endpoint and a
// hung connect is itself a "vLLM is down" signal.
const RECOVERY_POLL_TIMEOUT_MS = 2_000;

function readEnvMs(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function readEnvInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return fallback;
  return n;
}

// Heuristic: is `err` a network-shaped failure that's plausibly a transient
// vLLM outage (refused connection, reset, undici body timeout, etc.) as
// opposed to a real client error or an abort? Used to decide whether to enter
// the vLLM-recovery polling loop.
//
// Match by error message AND by node's network error codes (`err.cause.code`
// for undici's wrapped TypeError 'fetch failed', plus direct `err.code` for
// older shapes). AbortError is explicitly excluded — the parent-abort
// propagation path is handled separately and must NOT be defeated by retry.
export function isRetryableNetworkError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return false;
  const code = err.code || (err.cause && err.cause.code) || '';
  if (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === 'UND_ERR_SOCKET' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT'
  ) {
    return true;
  }
  const msg = (err.message || '') + ' ' + ((err.cause && err.cause.message) || '');
  if (
    /fetch failed/i.test(msg) ||
    /ECONNREFUSED/i.test(msg) ||
    /ECONNRESET/i.test(msg) ||
    /ETIMEDOUT/i.test(msg) ||
    /Body Timeout/i.test(msg) ||
    /Headers Timeout/i.test(msg) ||
    /terminated/i.test(msg) ||
    /socket hang up/i.test(msg) ||
    /other side closed/i.test(msg)
  ) {
    return true;
  }
  return false;
}

// HTTP status codes that indicate the upstream server is transiently
// unavailable (reverse proxy reports while vLLM restarts, vLLM itself in
// startup, etc.) — worth retrying with the same payload.
export function isRetryableHttpStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

// Sleep that resolves early if the parent abort signal fires. Returns true
// if the sleep ran to completion, false if it was aborted.
function abortableSleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(t);
      resolve(false);
    };
    const t = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    // NOTE: timer is intentionally NOT unref()'d. The recovery loop is
    // actively awaiting this sleep — unref'ing would let Node decide the
    // event loop is empty and exit while a real recovery is in flight,
    // surfacing as "Promise resolution is still pending but the event loop
    // has already resolved." Keep the loop alive while we sleep.
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

// Poll ${endpointUrl}/models until it responds 2xx or the budget expires.
// Returns { recovered: true, elapsedMs } or { recovered: false, elapsedMs,
// reason: 'budget'|'aborted' }. Each individual probe has its own short
// timeout so a hung connect doesn't burn the polling budget on one attempt.
export async function pollVllmHealth({
  endpointUrl,
  maxWaitMs,
  pollIntervalMs,
  perRequestTimeoutMs = RECOVERY_POLL_TIMEOUT_MS,
  signal,
}) {
  const base = endpointUrl.replace(/\/+$/, '');
  const url = base + '/models';
  const startedAt = Date.now();
  while (true) {
    if (signal?.aborted) {
      return { recovered: false, elapsedMs: Date.now() - startedAt, reason: 'aborted' };
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed >= maxWaitMs) {
      return { recovered: false, elapsedMs: elapsed, reason: 'budget' };
    }
    const probeController = new AbortController();
    const probeTimer = setTimeout(() => probeController.abort('probe-timeout'), perRequestTimeoutMs);
    if (typeof probeTimer.unref === 'function') probeTimer.unref();
    const onParentAbort = () => probeController.abort('parent-aborted');
    if (signal) signal.addEventListener('abort', onParentAbort, { once: true });
    let probeOk = false;
    try {
      const res = await fetch(url, { method: 'GET', signal: probeController.signal });
      // 2xx or even 401/403 means the server is up and answering — recovered.
      // Only network failures and 5xx mean "still down."
      if (res.ok || (res.status >= 200 && res.status < 500 && res.status !== 502 && res.status !== 503 && res.status !== 504)) {
        probeOk = true;
      }
      // Drain body so undici can recycle the socket.
      try { await res.arrayBuffer(); } catch { /* ignore */ }
    } catch {
      // probe failed — vLLM still down, keep polling.
    } finally {
      clearTimeout(probeTimer);
      if (signal) signal.removeEventListener('abort', onParentAbort);
    }
    if (probeOk) {
      return { recovered: true, elapsedMs: Date.now() - startedAt };
    }
    // Sleep between polls, but never sleep past the budget. The sleep is
    // abortable via the parent signal so a wall-clock kill doesn't get stuck.
    const remaining = maxWaitMs - (Date.now() - startedAt);
    if (remaining <= 0) {
      return { recovered: false, elapsedMs: Date.now() - startedAt, reason: 'budget' };
    }
    const waitMs = Math.min(pollIntervalMs, remaining);
    const completed = await abortableSleep(waitMs, signal);
    if (!completed && signal?.aborted) {
      return { recovered: false, elapsedMs: Date.now() - startedAt, reason: 'aborted' };
    }
  }
}

// Matches fenced ```json ... ``` code blocks. The opening fence may have
// trailing whitespace before the newline; the body is captured non-greedily up
// to the closing ``` fence.
const JSON_FENCE_RE = /```json[ \t]*\r?\n([\s\S]*?)\r?\n```/g;

// Tool names recognized by the provider's content-fallback extractor.
// `dispatch_subagent` is added at orchestrator time (see runTrial: the
// effective set is computed per-call from the caller-supplied `tools` array
// plus `role`, so subagents never accept a `dispatch_subagent` even if the
// model emits one).
//
// `run_tests` is universally available (single-agent, orchestrator, subagent)
// — it has no methodology semantics, just an execution hook for the agent's
// own feedback loop. Each role runs against ITS OWN in-memory file maps.
const FILE_TOOL_NAMES = new Set(['write_source', 'write_test', 'run_tests']);
const ORCHESTRATOR_TOOL_NAMES = new Set([
  'write_source',
  'write_test',
  'run_tests',
  'dispatch_subagent',
]);

// Directory names that show up as path PREFIXES when a model has confused
// "path relative to source/" with "path relative to the repo root." Writing
// `bench/tasks/<task>/intent.md` from inside the harness produced
// `source/bench/tasks/<task>/intent.md`, leaking the harness's own tree into
// the trial dir. Same shape for `tests/` and `source/` themselves.
const REJECTED_PATH_PREFIXES = ['bench/', 'tests/', 'source/'];
// Bare directory names (no extension, exact match) that are unambiguously
// directory placeholders. A model emitting `path: "bench"` is producing a
// directory name, not a file path; we reject rather than create a file
// literally named `bench`.
const REJECTED_BARE_NAMES = new Set(['bench', 'tests', 'source']);

/**
 * Validate a relative artifact path supplied to `write_source` / `write_test`.
 *
 * Returns `{ ok: true }` when the path is a sensible relative file path
 * (e.g. `index.js`, `lib/util.js`, `slugify.spec.md`). Returns
 * `{ ok: false, reason }` for paths that are:
 *   - empty
 *   - absolute (start with `/` or `\`)
 *   - contain `..` (path traversal)
 *   - start with a known harness prefix (`bench/`, `tests/`, `source/`)
 *   - equal a bare directory name (`bench`, `tests`, `source`)
 *
 * Exported so callers (the runner, tests, future provider adapters) share
 * one definition of "what counts as a malformed artifact path." See
 * doc/specs/2026-05-17-bench-orchestrator-must-dispatch.spec.md B4.
 */
export function validateArtifactPath(p) {
  if (typeof p !== 'string' || p.length === 0) {
    return { ok: false, reason: `write_source/write_test: path "${p ?? ''}" rejected (path must be a non-empty string relative to source/, no traversal, no leading directory prefix)` };
  }
  if (p.startsWith('/') || p.startsWith('\\')) {
    return { ok: false, reason: `write_source/write_test: path "${p}" rejected (absolute paths not allowed; must be relative to source/, no traversal, no leading directory prefix)` };
  }
  if (p.includes('..')) {
    return { ok: false, reason: `write_source/write_test: path "${p}" rejected (contains "..", path traversal not allowed; must be relative to source/, no traversal, no leading directory prefix)` };
  }
  for (const prefix of REJECTED_PATH_PREFIXES) {
    if (p.startsWith(prefix)) {
      return { ok: false, reason: `write_source/write_test: path "${p}" rejected (leading "${prefix}" prefix leaks harness tree; must be relative to source/, no traversal, no leading directory prefix)` };
    }
  }
  if (REJECTED_BARE_NAMES.has(p)) {
    return { ok: false, reason: `write_source/write_test: path "${p}" rejected (bare directory name, not a file path; must be relative to source/, no traversal, no leading directory prefix)` };
  }
  return { ok: true };
}

// CommonJS patterns that throw under Node's ESM loader. The bench's trial
// dirs declare `"type": "module"`, so any of these statements cause
// `await import(.../index.js)` (used by hidden-test suites) to fail with
// `ReferenceError: module is not defined` or `ReferenceError: require is not
// defined`. Producing CJS instead of ESM is a methodology-compliance issue
// that the TOOL_USAGE_INSTRUCTIONS prelude warns against, but open-weights
// coder models occasionally ignore the warning. This validation catches the
// pattern at write_source / write_test time so the model sees a tool-result
// error and can retry with ESM syntax — turning a silent
// scored-as-load-error trial into an observable, recoverable signal.
//
// Patterns match only at the start of a line (after optional whitespace) to
// avoid false positives on string literals or comments containing the same
// substrings (e.g. a docstring discussing CJS vs ESM).
const CJS_REJECTION_PATTERNS = [
  { pattern: /^[\t ]*module\.exports\s*=/m, label: 'module.exports = ...' },
  { pattern: /^[\t ]*exports\.\w+\s*=/m, label: 'exports.<name> = ...' },
  { pattern: /^[\t ]*(?:const|let|var)\s+[\w{},\s]+\s*=\s*require\s*\(/m, label: 'const ... = require(...)' },
  { pattern: /^[\t ]*require\s*\(/m, label: 'require(...)' },
];

/**
 * Validate the content of a `write_source` / `write_test` call against the
 * bench's ESM-only contract. Trial dirs declare `"type": "module"`, so CJS
 * patterns throw at import time. Returns `{ ok: true }` when the content is
 * ESM-shaped (or has no module-system statements at all). Returns
 * `{ ok: false, reason }` when it matches a known CJS pattern, with a
 * reason string naming the pattern and pointing the model at ESM syntax.
 *
 * Exported for testability and so future provider adapters can share one
 * definition. See doc/specs/2026-05-19-bench-reject-cjs-in-write-source.spec.md.
 */
export function validateArtifactContent(content, path) {
  if (typeof content !== 'string' || content.length === 0) {
    return { ok: true };
  }
  for (const { pattern, label } of CJS_REJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return {
        ok: false,
        reason: `write_source/write_test: content of "${path}" rejected (contains CommonJS pattern \`${label}\`; trial dirs declare "type": "module" so CJS throws at import time — use \`export function name(...)\` / \`export default\` and \`import x from '...'\` instead)`,
      };
    }
  }
  return { ok: true };
}

/**
 * Build the request `messages` array from the `conversation` transcript,
 * isolating "what the model sees" from "what we log."
 *
 * `conversation` doubles as the saved transcript (and `conversation-live.jsonl`
 * source) AND the request payload. Recovery/error breadcrumbs are pushed onto
 * `conversation` as `system`-role turns for observability, but a `system`
 * message landing mid-conversation is rejected by chat templates that require
 * the system message to be first (Qwen3.x: "System message must be at the
 * beginning"), turning one transient blip into a cascade of HTTP 500s.
 *
 * This helper returns a NEW array of `{ role, content }` objects:
 *   - turns tagged `diagnostic === true` are dropped (the explicit signal that
 *     a turn is a transport breadcrumb, not model-visible);
 *   - any `system`-role turn that is not the first element of the RESULT is
 *     dropped (positional backstop for the system-first invariant, even for an
 *     untagged stray system turn);
 *   - non-string `content` is JSON-stringified (preserving the prior
 *     `conversation.map(...)` behavior).
 *
 * The input array is not mutated, so `conversation` keeps every breadcrumb for
 * the transcript. See doc/specs/2026-05-20-bench-provider-no-midstream-system.spec.md.
 */
export function toModelMessages(conversation) {
  const out = [];
  for (const turn of conversation) {
    if (turn.diagnostic === true) continue;
    // Drop any system message that would not be the first element of the
    // result (out.length > 0 means a non-system turn already precedes it).
    if (turn.role === 'system' && out.length > 0) continue;
    out.push({
      role: turn.role,
      content:
        typeof turn.content === 'string' ? turn.content : JSON.stringify(turn.content),
    });
  }
  return out;
}

// Scan an assistant `content` string for fenced ```json blocks and return one
// `{ name, arguments }` object per block whose body parses as JSON, has a
// string `name` matching one of `acceptedNames`, and an object `arguments`
// field. Malformed or non-tool-call blocks are silently skipped — the model
// may legitimately include illustrative JSON in prose. See B3 of
// doc/specs/2026-05-11-bench-provider-jsoncode-fallback.spec.md.
export function extractJsonCodeBlockToolCalls(content, acceptedNames) {
  if (typeof content !== 'string' || content.length === 0) return [];
  const accepted = acceptedNames instanceof Set ? acceptedNames : FILE_TOOL_NAMES;
  const out = [];
  JSON_FENCE_RE.lastIndex = 0;
  let match;
  while ((match = JSON_FENCE_RE.exec(content)) !== null) {
    const body = match[1];
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      continue;
    }
    if (typeof parsed.name !== 'string' || !accepted.has(parsed.name)) {
      continue;
    }
    if (
      parsed.arguments === null ||
      typeof parsed.arguments !== 'object' ||
      Array.isArray(parsed.arguments)
    ) {
      continue;
    }
    out.push({ name: parsed.name, arguments: parsed.arguments });
  }
  return out;
}

function assertSupportedVariant(variant) {
  if (variant !== 'openai-chat-completions') {
    throw new ProviderConfigError(
      `openai-compatible: protocol variant "${variant}" is not implemented in this build. ` +
        `Only "openai-chat-completions" is supported. ` +
        `Variants like "ollama-native" and "llama-cpp-grammar" are reserved for future adapter modules.`,
    );
  }
}

export async function runTrial({
  system_prompt = '',
  user_message = '',
  tools = [],
  options = {},
  signal,
  // Multi-agent extras (per the runner's contract documented in
  // bench/runner.js's "--- Multi-agent topology" header). Single-agent calls
  // omit these. `role` defaults to 'single' for back-compat — the existing
  // single-agent dispatchTrial path doesn't pass `role`.
  role = 'single',
  // Documented part of the runner contract; not consumed by the provider.
  // `_subagent_id` — runner uses it for naming. `_subagent_worktree` — runner
  // merges results from the response. Underscored to mark intentional.
  subagent_id: _subagent_id,
  subagent_worktree: _subagent_worktree,
  // Optional: write per-turn live log here so the dashboard can probe
  // in-flight progress before the canonical conversation.jsonl is written by
  // captureTrial at end of dispatch. Filename is `conversation-live.jsonl`.
  // Best-effort: any write failure is swallowed so it never breaks dispatch.
  progress_dir,
} = {}) {
  assertSupportedVariant(options.protocol_variant || 'openai-chat-completions');

  const turnCap = options.turn_cap ?? DEFAULT_TURN_CAP;
  const wallClockMs = options.wall_clock_cap_ms ?? DEFAULT_WALL_CLOCK_MS;
  const graceMs = options.grace_ms ?? DEFAULT_GRACE_MS;
  const endpointUrl = options.endpoint_url;
  const modelId = options.model_id;

  if (!endpointUrl) {
    throw new ProviderConfigError(
      'openai-compatible: endpoint_url is required',
    );
  }
  if (!modelId) {
    throw new ProviderConfigError(
      'openai-compatible: model_id is required',
    );
  }

  // Defensive: subagents must NEVER dispatch their own subagents (per spec
  // §"Subagent role plumbing" in doc/specs/2026-05-13-bench-multi-agent-topology.spec.md
  // — the runner's tree of nested calls would otherwise unbound). If the
  // caller mistakenly passed a `dispatch_subagent` tool to a subagent role,
  // strip it here so the provider neither advertises it to the model nor
  // accepts it from a wayward response.
  let effectiveTools = Array.isArray(tools) ? tools : [];
  if (role === 'subagent') {
    effectiveTools = effectiveTools.filter(
      (t) => t?.function?.name !== 'dispatch_subagent',
    );
  }

  // Which tool names the JSON-fence content-fallback should accept this call.
  // Orchestrators get the dispatch tool; everyone else only sees the file
  // tools. Computed from `effectiveTools` so a caller that didn't pass
  // dispatch_subagent in tools[] never gets it parsed from content fallback.
  const acceptedToolNames = new Set();
  for (const t of effectiveTools) {
    const name = t?.function?.name;
    if (typeof name === 'string') acceptedToolNames.add(name);
  }
  // If the caller passed no tools (e.g. a malformed configuration), default
  // to the file tools so the JSON-fence fallback still recovers them — same
  // back-compat behavior the single-agent path had with the FILE_TOOL_NAMES
  // set hardcoded.
  const fallbackAccepted =
    acceptedToolNames.size > 0
      ? acceptedToolNames
      : role === 'orchestrator'
        ? ORCHESTRATOR_TOOL_NAMES
        : FILE_TOOL_NAMES;

  const conversation = [];

  // Live progress log: append every turn to a sidecar JSONL the dashboard can
  // read mid-trial. Best-effort: errors are swallowed so a write failure here
  // never affects dispatch. We use synchronous appendFileSync via static import
  // (already at top of file) — no async race.
  const liveLogPath = progress_dir ? `${progress_dir}/conversation-live.jsonl` : null;
  const fs = liveLogPath ? await import('node:fs') : null;
  if (liveLogPath) {
    try {
      fs.writeFileSync(liveLogPath, '');
    } catch {
      // ignore
    }
  }
  const pushTurn = (turn) => {
    conversation.push(turn);
    if (!liveLogPath) return;
    try {
      fs.appendFileSync(liveLogPath, JSON.stringify(turn) + '\n');
    } catch {
      // ignore
    }
  };

  if (system_prompt) {
    pushTurn({ role: 'system', content: system_prompt });
  }
  pushTurn({ role: 'user', content: user_message });

  const sourceFiles = {};
  const testFiles = {};
  // Path-validation rejections collected this call. Each entry is
  // `{tool, path, reason}` for any write_source / write_test call whose
  // `path` failed `validateArtifactPath`. The rejection is recorded but the
  // call is silently dropped from sourceFiles/testFiles so a malformed
  // orchestrator path (e.g. `bench/tasks/x/intent.md`) doesn't leak into
  // `source/`. The runner surfaces orchestrator-role rejections to
  // meta.json.orchestrator_violations[] (see runner.js).
  const pathRejections = [];
  // Content-validation rejections. Each entry is `{tool, path, reason}` for
  // a write_source/write_test call whose `content` matched a CJS pattern
  // forbidden by the bench's ESM-only contract. The file is dropped; the
  // model sees the reason in its tool result and can retry with ESM syntax.
  const contentRejections = [];
  // Multi-agent: orchestrator-collected dispatch entries to surface to the
  // runner. Each entry mirrors the contract documented at runner.js's
  // "Provider contract extension" header: {id, system_prompt, user_message,
  // tools}. The provider only fills `id` and `user_message` (the brief from
  // the model); the runner fills system_prompt/tools from its own templates
  // when entries omit them, so the methodology-aware composition stays in the
  // runner/study.mjs layer rather than baked into the provider.
  const subagentDispatches = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let resolvedModelId = modelId;

  let stopReason = 'turn-cap';
  const startedAt = Date.now();

  const url = endpointUrl.replace(/\/+$/, '') + '/chat/completions';

  // Recovery tunables (env-overridable; see header comment).
  const recoveryMaxWaitMs = readEnvMs('VLLM_RECOVERY_MAX_WAIT_MS', DEFAULT_RECOVERY_MAX_WAIT_MS);
  const recoveryMaxRetries = readEnvInt('VLLM_RECOVERY_MAX_RETRIES', DEFAULT_RECOVERY_MAX_RETRIES);
  const recoveryPollIntervalMs = readEnvMs(
    'VLLM_RECOVERY_POLL_INTERVAL_MS',
    DEFAULT_RECOVERY_POLL_INTERVAL_MS,
  );

  // Sentinel returned by the per-turn helper when the turn loop should break
  // out (terminal error, abort, etc.) — distinguishes from "got a body, keep
  // processing the turn." Carries the new stopReason so the outer loop can
  // record it before exiting.
  const TURN_FAILED = Symbol('turn-failed');

  for (let turn = 0; turn < turnCap; turn += 1) {
    if (signal?.aborted) {
      stopReason = 'time-cap';
      break;
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed >= wallClockMs) {
      stopReason = 'time-cap';
      break;
    }

    // Per-turn fetch with vLLM-recovery retry loop. On a network-shaped
    // failure (or 5xx-ish HTTP status), poll vLLM /models until it answers
    // OK, then re-issue the same payload. Bounded by:
    //   - VLLM_RECOVERY_MAX_RETRIES per turn
    //   - min(VLLM_RECOVERY_MAX_WAIT_MS, remaining wall budget) per poll
    //   - parent abort signal at all levels
    let body = null;
    let attempts = 0;
    while (true) {
      attempts += 1;

      // Per-request abort: composes the runner-supplied wall-clock signal
      // with a per-request grace timer so a server that ignores the abort
      // doesn't hang the runner indefinitely.
      const perReqController = new AbortController();
      const onParentAbort = () => perReqController.abort('parent-aborted');
      if (signal) {
        if (signal.aborted) {
          perReqController.abort('parent-aborted');
        } else {
          signal.addEventListener('abort', onParentAbort, { once: true });
        }
      }
      const graceTimer = setTimeout(() => {
        // 30s grace after parent abort: if the server hasn't closed the
        // connection by then, force-terminate locally.
      }, graceMs);

      let response;
      let fetchErr = null;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: modelId,
            messages: toModelMessages(conversation),
            tools: effectiveTools.length > 0 ? effectiveTools : undefined,
            tool_choice: effectiveTools.length > 0 ? 'required' : undefined,
            // Cap any single response. The vLLM v1 multiproc IPC bug fires on
            // very long single responses (~40K+ output tokens). Capping forces
            // the model into shorter turns — the harness injects [continue] on
            // `finish_reason: length`. 16384 is well below the crash threshold
            // and high enough that most trials complete without continue-loops
            // chewing the wall budget. See:
            //   https://github.com/vllm-project/vllm/issues/36921
            //   https://github.com/vllm-project/vllm/issues/41530
            max_tokens: 16384,
          }),
          signal: perReqController.signal,
        });
      } catch (err) {
        fetchErr = err;
      } finally {
        clearTimeout(graceTimer);
        if (signal) signal.removeEventListener('abort', onParentAbort);
      }

      if (fetchErr) {
        const aborted =
          fetchErr.name === 'AbortError' || perReqController.signal.aborted;
        if (aborted) {
          // Parent-abort path: never retry. Decide between time-cap (within
          // grace) vs error (force-terminate clause).
          const sinceAbort = signal?.aborted ? Date.now() - startedAt - wallClockMs : 0;
          if (sinceAbort > graceMs) {
            stopReason = 'error';
            pushTurn({
              role: 'system',
              content: 'provider abort timeout',
              diagnostic: true,
            });
          } else {
            stopReason = 'time-cap';
          }
          body = TURN_FAILED;
          break;
        }
        // Network-shaped: enter the recovery loop if (a) the error looks
        // retryable, (b) we have retries left, (c) we have wall budget left.
        if (
          isRetryableNetworkError(fetchErr) &&
          attempts <= recoveryMaxRetries
        ) {
          const remainingWall = wallClockMs - (Date.now() - startedAt);
          const waitBudget = Math.min(recoveryMaxWaitMs, remainingWall);
          if (waitBudget <= 0) {
            stopReason = 'error';
            pushTurn({
              role: 'system',
              content:
                `[openai-compatible] fetch failed (attempt ${attempts}) — no wall-clock budget remaining for recovery: ${fetchErr.message}`,
              diagnostic: true,
            });
            body = TURN_FAILED;
            break;
          }
          const waitS = Math.round(waitBudget / 1000);
          pushTurn({
            role: 'system',
            content:
              `[openai-compatible] fetch failed (attempt ${attempts}), polling vLLM for ~${waitS}s before retry: ${fetchErr.message}`,
            diagnostic: true,
          });
          const probe = await pollVllmHealth({
            endpointUrl,
            maxWaitMs: waitBudget,
            pollIntervalMs: recoveryPollIntervalMs,
            signal,
          });
          if (probe.recovered) {
            const recS = Math.round(probe.elapsedMs / 1000);
            pushTurn({
              role: 'system',
              content: `[openai-compatible] vLLM recovered after ${recS}s, retrying turn`,
              diagnostic: true,
            });
            // Loop back: same payload, fresh per-request controller.
            continue;
          }
          if (probe.reason === 'aborted') {
            // Parent aborted while we were polling — fall through to time-cap
            // semantics.
            stopReason = 'time-cap';
            body = TURN_FAILED;
            break;
          }
          // Budget exhausted on this single recovery attempt. If we still have
          // retries left AND wall budget left, loop and try again — but
          // typically the wall budget is what runs out first.
          if (attempts < recoveryMaxRetries) {
            pushTurn({
              role: 'system',
              content:
                `[openai-compatible] vLLM did not recover within ${Math.round(probe.elapsedMs / 1000)}s, retrying (${attempts}/${recoveryMaxRetries})`,
              diagnostic: true,
            });
            continue;
          }
          // Out of retries.
          stopReason = 'error';
          pushTurn({
            role: 'system',
            content:
              `[openai-compatible fetch error] giving up after ${attempts} attempts (vLLM unrecovered): ${fetchErr.message}`,
            diagnostic: true,
          });
          body = TURN_FAILED;
          break;
        }
        // Non-retryable, or out of retries: terminal error.
        if (attempts > 1) {
          stopReason = 'error';
          pushTurn({
            role: 'system',
            content:
              `[openai-compatible fetch error] giving up after ${attempts} attempts: ${fetchErr.message}`,
            diagnostic: true,
          });
        } else {
          stopReason = 'error';
          pushTurn({
            role: 'system',
            content: `[openai-compatible fetch error] ${fetchErr.message}`,
            diagnostic: true,
          });
        }
        body = TURN_FAILED;
        break;
      }

      // Got a response. Handle status codes.
      if (!response.ok) {
        // 5xx-ish: vLLM may be transiently unavailable behind a proxy. Retry
        // path mirrors the network-error branch.
        if (
          isRetryableHttpStatus(response.status) &&
          attempts <= recoveryMaxRetries
        ) {
          const remainingWall = wallClockMs - (Date.now() - startedAt);
          const waitBudget = Math.min(recoveryMaxWaitMs, remainingWall);
          if (waitBudget <= 0) {
            const text = await response.text().catch(() => '');
            stopReason = 'error';
            pushTurn({
              role: 'system',
              content: `[openai-compatible HTTP ${response.status}] ${text.slice(0, 500)}`,
              diagnostic: true,
            });
            body = TURN_FAILED;
            break;
          }
          // Drain the response body so undici can recycle the socket.
          try { await response.arrayBuffer(); } catch { /* ignore */ }
          const waitS = Math.round(waitBudget / 1000);
          pushTurn({
            role: 'system',
            content:
              `[openai-compatible] HTTP ${response.status} (attempt ${attempts}), polling vLLM for ~${waitS}s before retry`,
            diagnostic: true,
          });
          const probe = await pollVllmHealth({
            endpointUrl,
            maxWaitMs: waitBudget,
            pollIntervalMs: recoveryPollIntervalMs,
            signal,
          });
          if (probe.recovered) {
            const recS = Math.round(probe.elapsedMs / 1000);
            pushTurn({
              role: 'system',
              content: `[openai-compatible] vLLM recovered after ${recS}s, retrying turn`,
              diagnostic: true,
            });
            continue;
          }
          if (probe.reason === 'aborted') {
            stopReason = 'time-cap';
            body = TURN_FAILED;
            break;
          }
          if (attempts < recoveryMaxRetries) {
            pushTurn({
              role: 'system',
              content:
                `[openai-compatible] vLLM did not recover within ${Math.round(probe.elapsedMs / 1000)}s, retrying (${attempts}/${recoveryMaxRetries})`,
              diagnostic: true,
            });
            continue;
          }
          stopReason = 'error';
          pushTurn({
            role: 'system',
            content:
              `[openai-compatible HTTP ${response.status}] giving up after ${attempts} attempts (vLLM unrecovered)`,
            diagnostic: true,
          });
          body = TURN_FAILED;
          break;
        }
        // 4xx or other non-retryable status: terminal.
        stopReason = 'error';
        const text = await response.text().catch(() => '');
        pushTurn({
          role: 'system',
          content: `[openai-compatible HTTP ${response.status}] ${text.slice(0, 500)}`,
          diagnostic: true,
        });
        body = TURN_FAILED;
        break;
      }

      // 2xx: parse body. JSON parse errors are NOT retried (they indicate a
      // vLLM response-shape issue, not an outage we can poll our way out of).
      try {
        body = await response.json();
      } catch (err) {
        stopReason = 'error';
        pushTurn({
          role: 'system',
          content: `[openai-compatible JSON parse error] ${err && err.message}`,
          diagnostic: true,
        });
        body = TURN_FAILED;
        break;
      }
      // Successful body — exit the retry loop, fall through to message
      // processing below.
      break;
    }

    if (body === TURN_FAILED) {
      break;
    }

    if (body.usage) {
      tokensIn += body.usage.prompt_tokens || 0;
      tokensOut += body.usage.completion_tokens || 0;
    }
    if (body.model) resolvedModelId = body.model;

    const choice = body.choices?.[0];
    const message = choice?.message;
    if (!message) {
      stopReason = 'error';
      pushTurn({
        role: 'system',
        content: '[openai-compatible: no choices in response]',
        diagnostic: true,
      });
      break;
    }

    pushTurn({
      role: 'assistant',
      content: message.content ?? '',
      tool_calls: message.tool_calls,
      finish_reason: choice.finish_reason,
    });

    const structuredCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (structuredCalls.length > 0) {
      let sawDispatch = false;
      // Collect run_tests output across calls in this turn so the model sees
      // all results in one tool message (matches OpenAI's expected pattern of
      // one tool reply per assistant turn rather than interleaved messages).
      const runTestsResults = [];
      // Snapshot rejection counts so we can surface only THIS turn's rejects
      // to the model (rejections accumulate across turns in the module-scoped
      // arrays; per-turn slicing is how we tell the model what just got
      // rejected so it can retry with corrected path/content).
      const pathRejCountBefore = pathRejections.length;
      const contentRejCountBefore = contentRejections.length;
      for (const call of structuredCalls) {
        const fn = call.function;
        if (!fn?.name) continue;
        let args = {};
        try {
          args = JSON.parse(fn.arguments ?? '{}');
        } catch {
          args = {};
        }
        if (fn.name === 'write_source' && args.path && args.content) {
          const v = validateArtifactPath(args.path);
          if (!v.ok) {
            pathRejections.push({ tool: 'write_source', path: args.path, reason: v.reason });
          } else {
            const cv = validateArtifactContent(args.content, args.path);
            if (!cv.ok) {
              contentRejections.push({ tool: 'write_source', path: args.path, reason: cv.reason });
            } else {
              sourceFiles[args.path] = String(args.content);
            }
          }
        } else if (fn.name === 'write_test' && args.path && args.content) {
          const v = validateArtifactPath(args.path);
          if (!v.ok) {
            pathRejections.push({ tool: 'write_test', path: args.path, reason: v.reason });
          } else {
            const cv = validateArtifactContent(args.content, args.path);
            if (!cv.ok) {
              contentRejections.push({ tool: 'write_test', path: args.path, reason: cv.reason });
            } else {
              testFiles[args.path] = String(args.content);
            }
          }
        } else if (fn.name === 'run_tests') {
          // Execute the agent's tests against the agent's source. This is the
          // model's feedback loop — it runs in a sandbox tempdir, never
          // touches bench/tasks/<task>/hidden_tests/, and returns a structured
          // pass/fail summary suitable for the next turn.
          const result = runTestsTool({
            sourceFiles,
            testFiles,
            test_path: typeof args.test_path === 'string' ? args.test_path : undefined,
          });
          runTestsResults.push(result);
        } else if (
          fn.name === 'dispatch_subagent' &&
          role === 'orchestrator' &&
          typeof args.subagent_id === 'string' &&
          typeof args.brief === 'string'
        ) {
          // Multi-agent: capture the orchestrator's intent. The runner reads
          // subagent_dispatches from the response and dispatches each one as
          // a fresh runTrial({role: 'subagent', ...}) call. system_prompt /
          // tools are intentionally left undefined here so the runner's
          // fallbacks (subagent_system_prompt / subagent_tools, populated by
          // study.mjs) carry the methodology-aware templating — keeping the
          // provider methodology-agnostic.
          subagentDispatches.push({
            id: args.subagent_id,
            user_message: args.brief,
            // Surface the optional artifacts list verbatim so downstream tooling
            // (scorers, reviewers) can audit decomposition decisions later.
            artifacts_to_produce: Array.isArray(args.artifacts_to_produce)
              ? args.artifacts_to_produce.map(String)
              : undefined,
          });
          sawDispatch = true;
        }
      }
      if (sawDispatch) {
        // Orchestrator has dispatched: stop the orchestrator loop and let
        // the runner take over. Per the multi-agent spec, the orchestrator's
        // turn ends when it has decided who to dispatch — it does not wait
        // for subagent results in the same provider call chain (B5: each
        // subagent runs in its own fresh chain).
        stopReason = 'done';
        break;
      }
      // Synthesize a tool-result user turn so the loop continues. When
      // run_tests was called this turn, surface the test output so the model
      // can react to failures next turn; otherwise the generic placeholder.
      // Per-turn rejection summaries are prepended so the model sees its
      // write_source/write_test errors and can retry.
      const turnPathRejects = pathRejections.slice(pathRejCountBefore);
      const turnContentRejects = contentRejections.slice(contentRejCountBefore);
      const rejectLines = [
        ...turnPathRejects.map((r) => `[rejected] ${r.reason}`),
        ...turnContentRejects.map((r) => `[rejected] ${r.reason}`),
      ];
      const baseContent =
        runTestsResults.length > 0
          ? runTestsResults.join('\n\n')
          : '[tool results applied]';
      const toolContent =
        rejectLines.length > 0 ? `${rejectLines.join('\n')}\n\n${baseContent}` : baseContent;
      pushTurn({ role: 'tool', content: toolContent });
      continue;
    }

    // Fallback: structured tool_calls is absent or empty. Some models
    // (e.g. Qwen2.5-Coder when no vLLM tool-parser matches their format)
    // emit tool calls as fenced ```json blocks inside content. Extract them
    // here so the trial is still scoreable. See
    // doc/specs/2026-05-11-bench-provider-jsoncode-fallback.spec.md.
    const fallbackCalls = extractJsonCodeBlockToolCalls(
      message.content ?? '',
      fallbackAccepted,
    );
    if (fallbackCalls.length > 0) {
      let sawDispatch = false;
      const runTestsResults = [];
      const pathRejCountBefore = pathRejections.length;
      const contentRejCountBefore = contentRejections.length;
      for (const call of fallbackCalls) {
        const { name, arguments: args } = call;
        if (name === 'write_source' && args.path && args.content) {
          const v = validateArtifactPath(args.path);
          if (!v.ok) {
            pathRejections.push({ tool: 'write_source', path: args.path, reason: v.reason });
          } else {
            const cv = validateArtifactContent(args.content, args.path);
            if (!cv.ok) {
              contentRejections.push({ tool: 'write_source', path: args.path, reason: cv.reason });
            } else {
              sourceFiles[args.path] = String(args.content);
            }
          }
        } else if (name === 'write_test' && args.path && args.content) {
          const v = validateArtifactPath(args.path);
          if (!v.ok) {
            pathRejections.push({ tool: 'write_test', path: args.path, reason: v.reason });
          } else {
            const cv = validateArtifactContent(args.content, args.path);
            if (!cv.ok) {
              contentRejections.push({ tool: 'write_test', path: args.path, reason: cv.reason });
            } else {
              testFiles[args.path] = String(args.content);
            }
          }
        } else if (name === 'run_tests') {
          const result = runTestsTool({
            sourceFiles,
            testFiles,
            test_path: typeof args.test_path === 'string' ? args.test_path : undefined,
          });
          runTestsResults.push(result);
        } else if (
          name === 'dispatch_subagent' &&
          role === 'orchestrator' &&
          typeof args.subagent_id === 'string' &&
          typeof args.brief === 'string'
        ) {
          subagentDispatches.push({
            id: args.subagent_id,
            user_message: args.brief,
            artifacts_to_produce: Array.isArray(args.artifacts_to_produce)
              ? args.artifacts_to_produce.map(String)
              : undefined,
          });
          sawDispatch = true;
        }
      }
      if (sawDispatch) {
        stopReason = 'done';
        break;
      }
      const turnPathRejects = pathRejections.slice(pathRejCountBefore);
      const turnContentRejects = contentRejections.slice(contentRejCountBefore);
      const rejectLines = [
        ...turnPathRejects.map((r) => `[rejected] ${r.reason}`),
        ...turnContentRejects.map((r) => `[rejected] ${r.reason}`),
      ];
      const baseContent =
        runTestsResults.length > 0
          ? runTestsResults.join('\n\n')
          : '[tool results applied]';
      const toolContent =
        rejectLines.length > 0 ? `${rejectLines.join('\n')}\n\n${baseContent}` : baseContent;
      pushTurn({ role: 'tool', content: toolContent });
      continue;
    }

    if (choice.finish_reason === 'stop') {
      stopReason = 'done';
      break;
    }
    if (choice.finish_reason === 'length') {
      pushTurn({ role: 'user', content: '[continue]' });
      continue;
    }
    stopReason = 'done';
    break;
  }

  const result = {
    conversation,
    source_files: sourceFiles,
    test_files: testFiles,
    tokens_input: tokensIn,
    tokens_output: tokensOut,
    stop_reason: stopReason,
    model_id: resolvedModelId,
  };
  // Surface path-validation rejections so the runner can fold orchestrator
  // ones into meta.json.orchestrator_violations[]. Always present (possibly
  // empty) so the runner can distinguish "no rejections" from "field omitted
  // by an older provider build."
  result.path_rejections = pathRejections;
  // Surface content-validation rejections (CJS-pattern rejects from
  // validateArtifactContent). Same back-compat shape as path_rejections.
  result.content_rejections = contentRejections;
  // Multi-agent: surface dispatch entries when this was an orchestrator call
  // and the model invoked dispatch_subagent. Always present (possibly empty)
  // for orchestrator role so the runner can disambiguate "orchestrator chose
  // not to dispatch" from "non-orchestrator call." Single-agent and subagent
  // calls omit the field entirely (back-compat with the existing shape).
  if (role === 'orchestrator') {
    result.subagent_dispatches = subagentDispatches;
  }
  return result;
}

export const __DEFAULTS__ = {
  turn_cap: DEFAULT_TURN_CAP,
  wall_clock_cap_ms: DEFAULT_WALL_CLOCK_MS,
  grace_ms: DEFAULT_GRACE_MS,
};
