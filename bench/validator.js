// B9 + B10 validator: task provenance + pre-registration cleanliness.
//
// Spec: doc/specs/2026-05-10-dtdd-bench.spec.md (B9, B10).
//
// Both functions are synchronous. Path arguments in the spec tests are written
// relative to the wovenflow repo root (e.g. `bench/test/fixtures/...`); the
// test runner's cwd is `bench/`, so we resolve every incoming path against the
// directory that contains this file's parent (validator.js lives in `bench/`,
// so its parent dir is the repo root).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);

export class MissingProvenanceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MissingProvenanceError';
  }
}

export class DirtyTreeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DirtyTreeError';
  }
}

function resolveAgainstRepoRoot(p) {
  if (isAbsolute(p)) return p;
  return resolve(REPO_ROOT, p);
}

// --- B9 -------------------------------------------------------------------

const VALID_SOURCES = new Set([
  'livecodebench-post-2025-cutoff',
  'hand-written',
  'other-with-justification',
]);

const CONTAMINATION_RISK_BY_SOURCE = {
  'hand-written': 'low',
  'livecodebench-post-2025-cutoff': 'low-with-cutoff-caveat',
  'other-with-justification': 'unknown-pending-justification',
};

function parseProvenance(text) {
  // Minimal front-matter-ish parser: `key: value` lines, with `urls:` accepting
  // either a comma-separated value on the same line or a bullet list beneath.
  const out = { source: null, date: null, urls: [] };
  const lines = text.split(/\r?\n/);
  let inUrlList = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      inUrlList = false;
      continue;
    }
    if (inUrlList && /^\s*[-*]\s+/.test(line)) {
      out.urls.push(line.replace(/^\s*[-*]\s+/, '').trim());
      continue;
    }
    inUrlList = false;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'source') {
      out.source = value;
    } else if (key === 'date') {
      out.date = value;
    } else if (key === 'urls' || key === 'url') {
      if (value) {
        out.urls.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
      } else {
        inUrlList = true;
      }
    }
  }
  return out;
}

export function validateTasks({ tasks_dir }) {
  if (!tasks_dir) {
    throw new TypeError('validateTasks requires { tasks_dir }');
  }
  const dir = resolveAgainstRepoRoot(tasks_dir);
  if (!existsSync(dir)) {
    throw new Error(`tasks_dir does not exist: ${dir}`);
  }
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const tasks = [];
  for (const taskId of entries) {
    const taskPath = join(dir, taskId);
    const provenancePath = join(taskPath, 'provenance.md');
    if (!existsSync(provenancePath)) {
      throw new MissingProvenanceError(
        `task '${taskId}' is missing provenance.md (expected at ${provenancePath})`,
      );
    }
    const text = readFileSync(provenancePath, 'utf8');
    const parsed = parseProvenance(text);
    if (!parsed.source || !VALID_SOURCES.has(parsed.source)) {
      throw new MissingProvenanceError(
        `task '${taskId}' provenance.md has invalid or missing 'source' (got ${JSON.stringify(parsed.source)}; ` +
          `must be one of ${[...VALID_SOURCES].join(', ')})`,
      );
    }
    if (!parsed.date) {
      throw new MissingProvenanceError(
        `task '${taskId}' provenance.md is missing 'date'`,
      );
    }
    tasks.push({
      task_id: taskId,
      source: parsed.source,
      date: parsed.date,
      contamination_risk: CONTAMINATION_RISK_BY_SOURCE[parsed.source],
      urls: parsed.urls,
    });
  }
  return { tasks };
}

// --- B10 ------------------------------------------------------------------

function findEnclosingGitDir(startAbsPath) {
  // Walk upward until we find a directory containing a `.git` entry (file or
  // directory — worktrees use a `.git` file). Returns the directory itself
  // (the repo top-level), or null if we hit the filesystem root.
  let cur = existsSync(startAbsPath) && statSync(startAbsPath).isDirectory()
    ? startAbsPath
    : dirname(startAbsPath);
  while (true) {
    if (existsSync(join(cur, '.git'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export function checkPreregistration({ bench_dir, allow_dirty }) {
  if (!bench_dir) {
    throw new TypeError('checkPreregistration requires { bench_dir }');
  }
  const absBenchDir = resolveAgainstRepoRoot(bench_dir);
  if (!existsSync(absBenchDir)) {
    throw new Error(`bench_dir does not exist: ${absBenchDir}`);
  }

  const repoTop = findEnclosingGitDir(absBenchDir);
  if (!repoTop) {
    throw new Error(`no enclosing git repository for bench_dir: ${absBenchDir}`);
  }

  // git status --porcelain, scoped to the bench_dir path so unrelated dirty
  // files in the repo (e.g. the harness itself in development) don't leak
  // into the result.
  const statusOut = execFileSync(
    'git',
    ['status', '--porcelain', '--', absBenchDir],
    { cwd: repoTop, encoding: 'utf8' },
  );

  const dirty_paths = statusOut
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.length > 0)
    .map((l) => {
      // Porcelain v1 lines: "XY <path>" (or "XY <orig> -> <new>" for renames).
      // Strip the two-char status + single space.
      const rest = l.length > 3 ? l.slice(3) : '';
      const arrow = rest.indexOf(' -> ');
      return arrow >= 0 ? rest.slice(arrow + 4) : rest;
    });

  const protocol_sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoTop,
    encoding: 'utf8',
  }).trim();

  if (dirty_paths.length > 0 && !allow_dirty) {
    const err = new DirtyTreeError(
      `bench tree has uncommitted changes; pre-registered runs require a clean ` +
        `commit so the protocol SHA in the run metadata is meaningful. Pass ` +
        `--allow-dirty to override. Dirty paths:\n  ${dirty_paths.join('\n  ')}`,
    );
    err.dirty_paths = dirty_paths;
    throw err;
  }

  return {
    dirty_paths,
    allow_dirty: dirty_paths.length > 0 ? !!allow_dirty : false,
    protocol_sha,
  };
}
