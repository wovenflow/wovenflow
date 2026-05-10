#!/usr/bin/env node
// Sets up bench/test/fixtures/{dirty-tree, clean-tree} as standalone git
// repositories with the state B10's tests require:
//
//   clean-tree/  → git repo with a single commit, working tree clean.
//   dirty-tree/  → git repo with a single commit, plus one uncommitted change.
//
// Idempotent: if a fixture is already initialized in the right state, this
// script is a no-op. Re-creates the dirty-tree's uncommitted modification
// every run so test ordering / prior `git status` calls cannot accidentally
// flip the fixture clean.
//
// Why standalone repos rather than filtering the parent repo: scoping is
// trivial (each fixture answers its own `git status`), parent-repo state
// (the orchestrator's working tree) cannot leak in, and the test pinning
// `result.protocol_sha` to a 40-char SHA holds without the wovenflow tree
// needing any particular HEAD.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = dirname(HERE);
const FIXTURES_DIR = resolve(BENCH_DIR, 'test', 'fixtures');

function run(cmd, args, cwd) {
  execFileSync(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Make `git commit` work without the user's identity being configured.
      GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'bench-fixture',
      GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'bench-fixture@example.com',
      GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'bench-fixture',
      GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'bench-fixture@example.com',
    },
  });
}

function ensureRepo(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, '.git'))) {
    run('git', ['init', '-q', '-b', 'fixture'], dir);
  }
  // Ensure at least one commit exists so HEAD resolves to a SHA.
  let hasHead = false;
  try {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    hasHead = true;
  } catch {
    hasHead = false;
  }
  if (!hasHead) {
    writeFileSync(join(dir, 'baseline.txt'), 'baseline\n');
    run('git', ['add', 'baseline.txt'], dir);
    run('git', ['commit', '-q', '-m', 'fixture: initial commit'], dir);
  }
}

function setupClean() {
  const dir = join(FIXTURES_DIR, 'clean-tree');
  ensureRepo(dir);
  // Anything that would make this repo dirty must be committed (or removed).
  // Idempotent loop: stage everything, commit if there's anything to commit.
  run('git', ['add', '-A'], dir);
  let porcelain = '';
  try {
    porcelain = execFileSync('git', ['status', '--porcelain'], {
      cwd: dir,
      encoding: 'utf8',
    });
  } catch {
    porcelain = '';
  }
  if (porcelain.trim().length > 0) {
    run('git', ['commit', '-q', '-m', 'fixture: clean state'], dir);
  }
}

function setupDirty() {
  const dir = join(FIXTURES_DIR, 'dirty-tree');
  ensureRepo(dir);
  // Hard-reset the working tree to HEAD and clear any untracked files so each
  // run starts from a deterministic clean baseline. Then introduce exactly one
  // uncommitted change (an untracked file) so `git status --porcelain` is
  // guaranteed to produce ≥1 dirty path regardless of prior state.
  run('git', ['reset', '--hard', '-q', 'HEAD'], dir);
  run('git', ['clean', '-fdq'], dir);
  writeFileSync(join(dir, 'uncommitted.txt'), 'introduced by setup-fixtures.mjs\n');
}

setupClean();
setupDirty();
