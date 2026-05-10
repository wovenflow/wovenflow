// B7: Methodology compliance is verified by a human-graded stratified sample.
//
// Implements the contract from doc/specs/2026-05-10-dtdd-bench.spec.md:
//   - sampleForGrading({run_dir, sample_size_per_style, seed}): reads a run's
//     trial index and produces a stratified sample with >= sample_size_per_style
//     trials per style, distributed proportionally across tasks within each style.
//     Reproducible given the same seed.
//   - aggregateGrading({grades_path}): reads N raters' grades, computes the
//     majority verdict per trial, the per-style compliance rate, the inter-rater
//     agreement (Fleiss' kappa for >2 raters; the field is named cohens_kappa
//     to match the spec), and the list of trials where raters disagreed.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute, resolve } from 'node:path';

const STYLES = ['tdd', 'dtdd', 'plan', 'freeform'];

// Resolve a fixture path so callers can pass either an absolute path or a
// repo-root-relative path like 'bench/test/fixtures/run-200-trials/'. The
// grader.js module lives at <repo>/bench/grader.js, so the repo root is the
// parent of grader.js's directory. We try the path as-given first (handles
// absolute paths and the case where cwd is already the repo root), then fall
// back to repo-root-relative resolution.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);

function resolveFixturePath(p) {
  if (isAbsolute(p)) return p;
  if (existsSync(p)) return resolve(p);
  const repoRooted = join(REPO_ROOT, p);
  if (existsSync(repoRooted)) return repoRooted;
  // Fall back to the repo-rooted form even if it doesn't exist so the
  // downstream readFileSync produces a clear ENOENT against the more useful
  // path rather than the relative one.
  return repoRooted;
}

// Tiny deterministic PRNG (mulberry32). Pure function of seed; identical seed
// produces an identical stream — required for reproducible sampling.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle using the supplied rng. Returns a new array.
function shuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Loads the trial index for a run directory. The index is expected at
// <run_dir>/index.json with shape {trials: [{trial_id, style, task_id, ...}]}.
// If only a directory of per-trial summary files is present, fall back to
// reading each *.json file in the directory (excluding index.json itself).
function loadTrialIndex(runDir) {
  const indexPath = join(runDir, 'index.json');
  if (existsSync(indexPath)) {
    const raw = JSON.parse(readFileSync(indexPath, 'utf8'));
    if (!Array.isArray(raw.trials)) {
      throw new Error(`run index at ${indexPath} is missing trials[]`);
    }
    return raw.trials;
  }
  // Directory-of-trials fallback: read every <trial_id>.json sibling.
  if (!existsSync(runDir) || !statSync(runDir).isDirectory()) {
    throw new Error(`run_dir does not exist or is not a directory: ${runDir}`);
  }
  const trials = [];
  for (const entry of readdirSync(runDir)) {
    if (!entry.endsWith('.json')) continue;
    if (entry === 'index.json') continue;
    const obj = JSON.parse(readFileSync(join(runDir, entry), 'utf8'));
    if (obj && obj.trial_id && obj.style && obj.task_id) trials.push(obj);
  }
  return trials;
}

// Stratified proportional sampling across tasks within a style. We allocate
// per-task quotas as ceil(want * c_i / total) so the per-task floor never
// undersamples a small bucket; then we draw without replacement using the
// supplied rng. The result has at least sample_size_per_style trials.
function sampleStyle(styleTrials, want, rng) {
  const byTask = new Map();
  for (const t of styleTrials) {
    if (!byTask.has(t.task_id)) byTask.set(t.task_id, []);
    byTask.get(t.task_id).push(t);
  }
  const total = styleTrials.length;
  if (total === 0) return [];
  const sampled = [];
  // First pass: ceil-allocate per task, draw via shuffle-then-take.
  const tasks = [...byTask.keys()].sort();
  for (const task of tasks) {
    const bucket = byTask.get(task);
    const quota = Math.min(bucket.length, Math.ceil((want * bucket.length) / total));
    const shuffled = shuffle(bucket, rng);
    for (let i = 0; i < quota; i++) sampled.push(shuffled[i]);
  }
  // If ceil-allocation overshot, that's fine — spec says >= want.
  // If it undershot (only possible when bucket.length caps clamp the ceil),
  // top up by drawing remaining trials at random without replacement.
  if (sampled.length < want) {
    const used = new Set(sampled.map((t) => t.trial_id));
    const remaining = styleTrials.filter((t) => !used.has(t.trial_id));
    const extra = shuffle(remaining, rng);
    for (let i = 0; i < extra.length && sampled.length < want; i++) {
      sampled.push(extra[i]);
    }
  }
  return sampled;
}

export function sampleForGrading({ run_dir, sample_size_per_style, seed }) {
  if (typeof run_dir !== 'string') throw new TypeError('run_dir must be a string');
  if (typeof sample_size_per_style !== 'number' || sample_size_per_style < 1) {
    throw new TypeError('sample_size_per_style must be a positive number');
  }
  if (typeof seed !== 'number') throw new TypeError('seed must be a number');

  const resolved = resolveFixturePath(run_dir);
  const trials = loadTrialIndex(resolved);

  // Group trials by style so each style is sampled independently with its
  // own deterministic stream derived from the master seed (so changing the
  // ordering of styles doesn't shift trial choices for other styles).
  const byStyle = new Map();
  for (const t of trials) {
    if (!byStyle.has(t.style)) byStyle.set(t.style, []);
    byStyle.get(t.style).push(t);
  }

  const sample = [];
  for (let i = 0; i < STYLES.length; i++) {
    const style = STYLES[i];
    const styleTrials = byStyle.get(style) || [];
    // Per-style rng: master seed mixed with style index so each style gets
    // an independent, reproducible draw.
    const rng = mulberry32(seed + i * 0x9E3779B1);
    const drawn = sampleStyle(styleTrials, sample_size_per_style, rng);
    for (const t of drawn) {
      sample.push({
        trial_id: t.trial_id,
        style: t.style,
        task_id: t.task_id,
      });
    }
  }
  return sample;
}

// Reads the grades JSON written by raters. Schema:
//   { raters: [ { rater_id, grades: [ { trial_id, style, verdict, evidence } ] } ] }
// where verdict is "compliant" | "non-compliant" (we accept booleans too via
// .compliant for forward-compatibility with the spec narrative).
function loadGrades(gradesPath) {
  const resolved = resolveFixturePath(gradesPath);
  const raw = JSON.parse(readFileSync(resolved, 'utf8'));
  if (!raw || !Array.isArray(raw.raters)) {
    throw new Error(`grades file at ${resolved} is missing raters[]`);
  }
  return raw;
}

function verdictToBool(v) {
  if (typeof v === 'boolean') return v;
  if (v === 'compliant') return true;
  if (v === 'non-compliant') return false;
  throw new Error(`unrecognized verdict: ${v}`);
}

// Fleiss' kappa for n raters, N items, k categories. The spec field is named
// cohens_kappa for compatibility; the actual metric is Fleiss' kappa, which
// generalizes Cohen's kappa to >2 raters. (Cohen's kappa is undefined when a
// trial is graded by anything other than exactly 2 raters.)
function fleissKappa(items, categories) {
  // items: array of arrays of category indices, one per rater. We assume each
  // item has the same number of raters n.
  const N = items.length;
  if (N === 0) return 0;
  const n = items[0].length;
  if (n < 2) return 0;
  const k = categories.length;

  // n_ij: count of raters that assigned item i to category j.
  // P_i = (sum_j n_ij^2 - n) / (n * (n - 1))
  // P_bar = mean of P_i
  // p_j = (sum_i n_ij) / (N * n)
  // P_e = sum_j p_j^2
  // kappa = (P_bar - P_e) / (1 - P_e)
  const colTotals = new Array(k).fill(0);
  let sumPi = 0;
  for (const ratings of items) {
    const counts = new Array(k).fill(0);
    for (const r of ratings) counts[r] += 1;
    let sumSq = 0;
    for (let j = 0; j < k; j++) {
      sumSq += counts[j] * counts[j];
      colTotals[j] += counts[j];
    }
    const Pi = (sumSq - n) / (n * (n - 1));
    sumPi += Pi;
  }
  const Pbar = sumPi / N;
  const total = N * n;
  let Pe = 0;
  for (let j = 0; j < k; j++) {
    const pj = colTotals[j] / total;
    Pe += pj * pj;
  }
  if (Pe === 1) return 1; // unanimous on a single category — perfect agreement
  return (Pbar - Pe) / (1 - Pe);
}

export function aggregateGrading({ grades_path }) {
  if (typeof grades_path !== 'string') {
    throw new TypeError('grades_path must be a string');
  }
  const data = loadGrades(grades_path);

  // Build a per-trial map: trial_id -> { style, ratings: [bool, ...] }
  const perTrial = new Map();
  for (const rater of data.raters) {
    if (!Array.isArray(rater.grades)) continue;
    for (const g of rater.grades) {
      if (!perTrial.has(g.trial_id)) {
        perTrial.set(g.trial_id, { style: g.style, ratings: [], evidence: [] });
      }
      const entry = perTrial.get(g.trial_id);
      entry.ratings.push(verdictToBool(g.verdict ?? (g.compliant ? 'compliant' : 'non-compliant')));
      if (g.evidence) entry.evidence.push({ rater_id: rater.rater_id, evidence: g.evidence });
    }
  }

  // Per-style compliance rate: majority verdict per trial, then mean per style.
  const styleStats = {};
  for (const style of STYLES) styleStats[style] = { compliantCount: 0, total: 0 };

  const disagreements = [];
  for (const [trial_id, entry] of perTrial) {
    const yes = entry.ratings.filter((r) => r === true).length;
    const no = entry.ratings.length - yes;
    const majority = yes > no; // ties on even-rater counts fall to non-compliant
    if (entry.style && styleStats[entry.style]) {
      styleStats[entry.style].total += 1;
      if (majority) styleStats[entry.style].compliantCount += 1;
    }
    if (yes !== entry.ratings.length && no !== entry.ratings.length) {
      disagreements.push({
        trial_id,
        style: entry.style,
        ratings: entry.ratings.map((r) => (r ? 'compliant' : 'non-compliant')),
        evidence: entry.evidence,
      });
    }
  }

  const compliance_rate = {};
  for (const style of STYLES) {
    const s = styleStats[style];
    compliance_rate[style] = s.total === 0 ? 0 : s.compliantCount / s.total;
  }

  // Build the items matrix for kappa: each item is a vector of category
  // indices (0 = compliant, 1 = non-compliant), one entry per rater.
  // Skip items that don't have ratings from every rater (kappa is only
  // defined when each item has the same number of raters).
  const ratersPerItem = data.raters.length;
  const items = [];
  for (const [, entry] of perTrial) {
    if (entry.ratings.length !== ratersPerItem) continue;
    items.push(entry.ratings.map((r) => (r ? 0 : 1)));
  }
  const cohens_kappa = fleissKappa(items, ['compliant', 'non-compliant']);

  return { compliance_rate, cohens_kappa, disagreements };
}
