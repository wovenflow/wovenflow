// Shared fetch dispatcher for bench OpenAI-compatible providers.
//
// Why this exists
// ---------------
// Node's built-in `fetch()` (powered by undici) defaults to
// `bodyTimeout: 300_000` (5 min) and `headersTimeout: 300_000` (5 min). When
// vLLM (or any OpenAI-compatible backend) takes more than 5 min to fully
// stream a single completion — common at large contexts and modest token
// rates — undici throws `fetch failed` and the bench records
// `stop_reason: error`, even though the server is healthy and still
// generating. The bench's own `wallClockMs` per-trial budget is the
// authoritative cap; undici's silent default just gets in the way.
//
// We construct an undici Agent with substantially larger timeouts and
// install it as the *global* dispatcher via `setGlobalDispatcher`. The
// global call wins for built-in `fetch()` even though the userland
// `undici` package may be a different major version than the one Node
// bundles internally — they share the same global registration symbol.
// Per-call `dispatcher: ...` does NOT cross that version boundary.
//
// Defaults:
//
//   - bodyTimeout:    1_800_000 ms (30 min) — generous; the harness's own
//                     wall_clock_cap_ms terminates the trial first.
//   - headersTimeout:    60_000 ms ( 1 min) — server should send headers
//                     long before then; if it doesn't, fail fast.
//
// Both can be overridden via env vars at module-load time:
//
//   BENCH_FETCH_BODY_TIMEOUT_MS
//   BENCH_FETCH_HEADERS_TIMEOUT_MS
//
// Setting either to 0 disables that timeout in undici.
//
// Side effect on import
// ---------------------
// `applyDefaultDispatcher()` is called once at module import. The bench's
// providers re-export this side effect by importing this module. To opt
// out (e.g., a unit test that wants the original 5-min defaults), call
// `restoreOriginalDispatcher()` and re-call `applyDefaultDispatcher()`
// when done.
//
// Test injection
// --------------
// `installDispatcher(agent)` swaps the global dispatcher to an arbitrary
// Agent so timeout behavior can be verified with tiny windows in CI
// (no 5-minute waits).

import { Agent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';

const DEFAULT_BODY_TIMEOUT_MS = 30 * 60 * 1000;
// Empirical: 60s was too aggressive — vLLM with reasoning_parser=qwen3
// can take >60s to start streaming headers when the model reasons internally
// before its first output token. Bumped to 10 min so the harness's own
// wallClockMs cap dominates rather than a low-level fetch timeout.
const DEFAULT_HEADERS_TIMEOUT_MS = 10 * 60 * 1000;

function readEnvMs(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

let _originalDispatcher = null;

export function installDispatcher(agent) {
  if (_originalDispatcher === null) {
    _originalDispatcher = getGlobalDispatcher();
  }
  setGlobalDispatcher(agent);
}

export function restoreOriginalDispatcher() {
  if (_originalDispatcher !== null) {
    setGlobalDispatcher(_originalDispatcher);
    _originalDispatcher = null;
  }
}

export function buildBenchAgent({ bodyTimeoutMs, headersTimeoutMs } = {}) {
  return new Agent({
    bodyTimeout:
      bodyTimeoutMs ?? readEnvMs('BENCH_FETCH_BODY_TIMEOUT_MS', DEFAULT_BODY_TIMEOUT_MS),
    headersTimeout:
      headersTimeoutMs ??
      readEnvMs('BENCH_FETCH_HEADERS_TIMEOUT_MS', DEFAULT_HEADERS_TIMEOUT_MS),
  });
}

// Re-installable: tests that swap the dispatcher out can call this to put
// the bench's defaults back in place.
export function applyDefaultDispatcher() {
  installDispatcher(buildBenchAgent());
}

// Apply on first import. Idempotent.
applyDefaultDispatcher();

export const __DEFAULTS__ = {
  body_timeout_ms: DEFAULT_BODY_TIMEOUT_MS,
  headers_timeout_ms: DEFAULT_HEADERS_TIMEOUT_MS,
};
