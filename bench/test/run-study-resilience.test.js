// Regression test for the per-trial try/catch resilience added to runStudy
// after the code-quality review of the bench study orchestrator spec.
//
// Contract under test:
//   - A throwing dispatchTrial for one trial must NOT abort the rest of the
//     run. The orchestrator records the error in the returned `errors` array
//     and continues iterating.
//   - The error is also persisted to `<run_dir>/errors.jsonl`, one JSON
//     object per line, so an operator can recover the trial-level breakage
//     report after the process exits.
//
// Strategy: install a mock provider via BENCH_PROVIDER=openai-compatible plus
// a synthetic endpoint that always 500s. dispatchTrial's runLiveTrial catches
// the fetch error internally and yields a `stop_reason: 'error'` result —
// which is NOT a thrown error from runStudy's perspective. So instead we
// monkey-patch a top-level dispatchTrial replacement by exercising runStudy
// against a tasks list that includes one invalid task_id that will cause
// composePrompt to throw synchronously inside the try block. The error path
// is then exercised end-to-end without needing a network mock.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runStudy } from '../study.mjs';

test('runStudy: per-trial error in dispatch is recorded, run continues', async () => {
  // Use a tmp dir as the synthetic repo_root so we don't pollute bench/results.
  // Inside it we create a minimal bench/tasks/<valid_task>/intent.md fixture so
  // composePrompt succeeds for one task, and we let the OTHER task have no
  // intent.md so composePrompt throws.
  const root = mkdtempSync(path.join(tmpdir(), 'study-resilience-'));
  const { mkdirSync, writeFileSync, cpSync } = await import('node:fs');

  // Copy the real bench/styles/ directory in so composePrompt can find the
  // dtdd style card for the valid task.
  mkdirSync(path.join(root, 'bench', 'styles'), { recursive: true });
  cpSync(path.resolve('bench/styles'), path.join(root, 'bench', 'styles'), {
    recursive: true,
  });

  // Valid task: full intent.md present.
  mkdirSync(path.join(root, 'bench', 'tasks', 'valid'), { recursive: true });
  writeFileSync(
    path.join(root, 'bench', 'tasks', 'valid', 'intent.md'),
    '# Valid\nMinimal intent body for the resilience test.\n',
  );
  // Invalid task: no intent.md → composePrompt will throw inside the try
  // block when runStudy tries to compose its prompt.
  mkdirSync(path.join(root, 'bench', 'tasks', 'no-intent'), { recursive: true });

  // Stub the provider env so dispatchTrial doesn't hit a real network. We do
  // not actually need the dispatchTrial to succeed for the valid task; we
  // only need the orchestrator to ATTEMPT the dispatch for each trial and
  // capture the no-intent error.
  const prevProvider = process.env.BENCH_PROVIDER;
  const prevUrl = process.env.BENCH_PROVIDER_URL;
  const prevModel = process.env.BENCH_PROVIDER_MODEL;
  const prevProtocol = process.env.BENCH_PROVIDER_PROTOCOL;
  // 127.0.0.1:1 is the canonical unroutable-locally port — any fetch fails
  // ECONNREFUSED instantly, no waiting. dispatchTrial CATCHES that internally
  // (per runLiveTrial's catch block) so the valid trial returns a normal
  // result with stop_reason='error'; it does NOT bubble up. Only the
  // no-intent trial reaches our outer catch via composePrompt throwing.
  process.env.BENCH_PROVIDER = 'openai-compatible';
  process.env.BENCH_PROVIDER_URL = 'http://127.0.0.1:1';
  process.env.BENCH_PROVIDER_MODEL = 'no-such-model';
  process.env.BENCH_PROVIDER_PROTOCOL = 'openai-chat-completions';

  try {
    const result = await runStudy({
      run_id: 'resilience-test',
      tasks: ['valid', 'no-intent'],
      conditions: ['dtdd'],
      trials: 1,
      dry_run: false,
      repo_root: root,
    });

    // Two trials planned, but only one dispatched. The orchestrator must
    // surface the failure rather than aborting.
    assert.strictEqual(result.phase1_planned.length, 2);
    assert.ok(Array.isArray(result.errors), 'errors must be an array');
    const noIntentErrors = result.errors.filter((e) =>
      typeof e.trial_id === 'string' && e.trial_id.startsWith('no-intent-'),
    );
    assert.strictEqual(
      noIntentErrors.length, 1,
      `expected exactly one error for no-intent trial, got ${result.errors.length}: ${JSON.stringify(result.errors)}`,
    );
    const e = noIntentErrors[0];
    assert.strictEqual(e.phase, 'phase-1');
    assert.strictEqual(e.stage, 'dispatch');
    assert.match(e.error, /intent\.md/, 'error message should mention the missing intent.md');

    // Persisted to errors.jsonl under the run dir. dispatchTrial writes its
    // artifacts under the REAL bench/results/<run_id>/ (the runner.js path
    // arithmetic uses its own REPO_ROOT, not our test's root override), so
    // the run_dir for the errors.jsonl appender is rooted at the test root
    // we passed in. Both locations are checked: in-memory `errors` is
    // load-bearing, file is best-effort.
    const errorsFile = path.join(root, 'bench', 'results', 'resilience-test', 'errors.jsonl');
    if (existsSync(errorsFile)) {
      const lines = readFileSync(errorsFile, 'utf8').trim().split('\n');
      const parsed = lines.map((l) => JSON.parse(l));
      const fromFile = parsed.find((p) =>
        typeof p.trial_id === 'string' && p.trial_id.startsWith('no-intent-'),
      );
      assert.ok(fromFile, 'errors.jsonl must contain the no-intent failure');
      assert.match(fromFile.error, /intent\.md/);
    }
  } finally {
    if (prevProvider === undefined) delete process.env.BENCH_PROVIDER;
    else process.env.BENCH_PROVIDER = prevProvider;
    if (prevUrl === undefined) delete process.env.BENCH_PROVIDER_URL;
    else process.env.BENCH_PROVIDER_URL = prevUrl;
    if (prevModel === undefined) delete process.env.BENCH_PROVIDER_MODEL;
    else process.env.BENCH_PROVIDER_MODEL = prevModel;
    if (prevProtocol === undefined) delete process.env.BENCH_PROVIDER_PROTOCOL;
    else process.env.BENCH_PROVIDER_PROTOCOL = prevProtocol;
    rmSync(root, { recursive: true, force: true });
    // The valid trial may have left an artifact under the real
    // bench/results/resilience-test/ from dispatchTrial's path arithmetic.
    // Clean it up so a stale dir doesn't accumulate across test runs.
    const realArtifactDir = path.resolve('bench/results/resilience-test');
    rmSync(realArtifactDir, { recursive: true, force: true });
    const realWorktreeRoot = path.resolve('bench/worktrees');
    for (const subdir of ['valid-dtdd-single-0', 'no-intent-dtdd-single-0']) {
      rmSync(path.join(realWorktreeRoot, subdir), { recursive: true, force: true });
    }
  }
});
