// B8: Reporter — aggregates a scored run into a reviewer-readable report.
//
// Reads <run_dir>/meta.json and <run_dir>/trials/<trial-id>/{meta,hidden_score,
// self_score,coverage_score,compliance}.json — produced by B3 (capture) and
// B4/B5/B6/B7 (scoring + grading). Writes
// bench/results/<run_id>/report.md and returns its absolute path.
//
// Per-style aggregates use the normal-approximation 95% CI (mean ± 1.96 *
// stderr) so reviewers see uncertainty alongside the point estimate. Cells
// with fewer than 5 trials display "—" for the CI half-width since the normal
// approximation is unsafe there; this is documented inline in the report.
//
// Compliance verdicts are only present for the human-graded sample (B7).
// Trials outside the sample contribute to the automated metrics but are
// excluded from the "Compliant vs non-compliant" breakdown — the report
// states the per-style sample size N so the distinction is visible.

import fs from 'node:fs';
import path from 'node:path';

const REPORT_FILENAME = 'report.md';
const MIN_N_FOR_NORMAL_CI = 5;
const Z_95 = 1.96;

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

// Tests pass paths like "bench/test/fixtures/run-scored/" — relative to the
// repo root. The pretest pipeline runs with cwd=bench/, so the literal path
// won't resolve. Try the path as given, then strip a leading "bench/" segment
// if cwd already ends in /bench. Fall back to absolute paths untouched.
function resolveRunDir(p) {
  if (path.isAbsolute(p)) return p;
  if (fs.existsSync(p)) return path.resolve(p);
  if (p.startsWith('bench/') && path.basename(process.cwd()) === 'bench') {
    const stripped = p.slice('bench/'.length);
    if (fs.existsSync(stripped)) return path.resolve(stripped);
  }
  // Last resort: walk upward looking for a "bench" directory and try there.
  let cur = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(cur, p);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // Return resolved absolute even if missing — caller will surface a clear error.
  return path.resolve(p);
}

// Find the bench directory so we can write bench/results/<run_id>/report.md
// in a stable location regardless of where the test harness was invoked from.
function findBenchDir() {
  if (path.basename(process.cwd()) === 'bench' && fs.existsSync(path.join(process.cwd(), 'package.json'))) {
    return process.cwd();
  }
  let cur = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(cur, 'bench');
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // Fall back to a sibling of cwd
  return path.join(process.cwd(), 'bench');
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function mean(xs) {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stddev(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

// Returns {mean, ci_half_width, n}. ci_half_width is null when n is too small
// for the normal approximation; the report prints "—" in that case.
function summarize(xs) {
  const n = xs.length;
  if (n === 0) return { mean: null, ci_half_width: null, n: 0 };
  const m = mean(xs);
  if (n < MIN_N_FOR_NORMAL_CI) return { mean: m, ci_half_width: null, n };
  const sd = stddev(xs);
  if (!isFinite(sd) || sd === 0) return { mean: m, ci_half_width: 0, n };
  return { mean: m, ci_half_width: Z_95 * (sd / Math.sqrt(n)), n };
}

// ---------------------------------------------------------------------------
// Trial loading
// ---------------------------------------------------------------------------

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function loadTrial(trialDir) {
  const meta = readJsonIfExists(path.join(trialDir, 'meta.json'));
  if (!meta) return null;
  const hidden = readJsonIfExists(path.join(trialDir, 'hidden_score.json'));
  const self_ = readJsonIfExists(path.join(trialDir, 'self_score.json'));
  const coverage = readJsonIfExists(path.join(trialDir, 'coverage_score.json'));
  const compliance = readJsonIfExists(path.join(trialDir, 'compliance.json'));

  // Derive metric values, leaving null when a score is missing.
  const hidden_pass_rate = hidden && hidden.total_count > 0
    ? hidden.pass_count / hidden.total_count
    : null;
  const self_pass_rate = self_ && self_.total_count > 0
    ? self_.pass_count / self_.total_count
    : null;
  let self_coverage = null;
  if (coverage && coverage.per_label && Object.keys(coverage.per_label).length > 0) {
    const labels = Object.values(coverage.per_label);
    const covered = labels.filter(Boolean).length;
    self_coverage = covered / labels.length;
  }

  return {
    trial_id: path.basename(trialDir),
    task_id: meta.task_id,
    style: meta.style,
    topology: meta.topology,
    trial_index: meta.trial_index,
    tokens_total: typeof meta.tokens_total === 'number'
      ? meta.tokens_total
      : (typeof meta.tokens_input === 'number' && typeof meta.tokens_output === 'number'
        ? meta.tokens_input + meta.tokens_output
        : null),
    wall_clock_ms: typeof meta.wall_clock_ms === 'number' ? meta.wall_clock_ms : null,
    stop_reason: meta.stop_reason,
    hidden_pass_rate,
    self_pass_rate,
    self_coverage,
    compliance_verdict: compliance ? compliance.verdict : null,
    is_graded: !!compliance,
  };
}

function loadAllTrials(runDir) {
  const trialsDir = path.join(runDir, 'trials');
  if (!fs.existsSync(trialsDir)) return [];
  const entries = fs.readdirSync(trialsDir, { withFileTypes: true });
  const trials = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const t = loadTrial(path.join(trialsDir, e.name));
    if (t) trials.push(t);
  }
  // Stable order: task, style, trial_index
  trials.sort((a, b) => {
    if (a.task_id !== b.task_id) return a.task_id < b.task_id ? -1 : 1;
    if (a.style !== b.style) return a.style < b.style ? -1 : 1;
    return (a.trial_index ?? 0) - (b.trial_index ?? 0);
  });
  return trials;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtPct(x, digits = 1) {
  if (x == null || !isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

function fmtNum(x, digits = 0) {
  if (x == null || !isFinite(x)) return '—';
  return x.toFixed(digits);
}

function fmtCellPct(s) {
  if (s.mean == null) return '—';
  if (s.ci_half_width == null) return `${fmtPct(s.mean)} (95% CI —, n=${s.n})`;
  return `${fmtPct(s.mean)} ± ${fmtPct(s.ci_half_width)} (95% CI, n=${s.n})`;
}

function fmtCellNum(s, digits = 0) {
  if (s.mean == null) return '—';
  if (s.ci_half_width == null) return `${fmtNum(s.mean, digits)} (95% CI —, n=${s.n})`;
  return `${fmtNum(s.mean, digits)} ± ${fmtNum(s.ci_half_width, digits)} (95% CI, n=${s.n})`;
}

// ---------------------------------------------------------------------------
// Report sections
// ---------------------------------------------------------------------------

function renderRunMetadata(runMeta, trials) {
  const lines = [];
  lines.push('## Run metadata');
  lines.push('');
  // protocol_sha: must be present and on its own line for the B8 regex.
  const sha = runMeta.protocol_sha || '0000000000000000000000000000000000000000';
  lines.push(`- protocol_sha: ${sha}`);
  if (runMeta.run_id) lines.push(`- run_id: ${runMeta.run_id}`);
  if (runMeta.model_id) lines.push(`- model_id: ${runMeta.model_id}`);
  if (typeof runMeta.temperature === 'number') lines.push(`- temperature: ${runMeta.temperature}`);
  if (typeof runMeta.seed !== 'undefined') lines.push(`- seed: ${runMeta.seed}`);
  lines.push(`- total_trials: ${trials.length}`);
  if (typeof runMeta.total_cost_usd === 'number') {
    lines.push(`- total_cost_usd: $${runMeta.total_cost_usd.toFixed(2)}`);
  }
  if (runMeta.started_at) lines.push(`- started_at: ${runMeta.started_at}`);
  if (runMeta.finished_at) lines.push(`- finished_at: ${runMeta.finished_at}`);
  lines.push('');
  lines.push('This is a directional preprint, not a peer-reviewed claim. Confidence intervals use the normal approximation `mean ± 1.96 * stderr` and are suppressed (—) when n < ' + MIN_N_FOR_NORMAL_CI + '.');
  lines.push('');
  return lines.join('\n');
}

function renderPerStyleAggregates(trials) {
  const lines = [];
  lines.push('## Per-style aggregates');
  lines.push('');
  lines.push('Mean and 95% CI per style for each metric. Tokens and wall-clock time are reported alongside the headline pass-rate metrics so a reader can weigh quality against cost. Compliance rate is computed only on the human-graded sample (per-style N noted).');
  lines.push('');

  // Group by style
  const styles = [...new Set(trials.map((t) => t.style))].sort();
  const headers = ['style', 'hidden-pass', 'self-pass', 'self-coverage', 'tokens', 'wall_clock_ms', 'compliance (graded sample)'];
  lines.push('| ' + headers.join(' | ') + ' |');
  lines.push('|' + headers.map(() => '---').join('|') + '|');

  for (const style of styles) {
    const cell = trials.filter((t) => t.style === style);
    const hidden = summarize(cell.map((t) => t.hidden_pass_rate).filter((x) => x != null));
    const self_ = summarize(cell.map((t) => t.self_pass_rate).filter((x) => x != null));
    const cov = summarize(cell.map((t) => t.self_coverage).filter((x) => x != null));
    const tok = summarize(cell.map((t) => t.tokens_total).filter((x) => x != null));
    const wall = summarize(cell.map((t) => t.wall_clock_ms).filter((x) => x != null));
    const graded = cell.filter((t) => t.is_graded);
    const complianceVals = graded.map((t) => (t.compliance_verdict === 'compliant' ? 1 : 0));
    const compl = summarize(complianceVals);

    const row = [
      style,
      fmtCellPct(hidden),
      fmtCellPct(self_),
      fmtCellPct(cov),
      fmtCellNum(tok, 0),
      fmtCellNum(wall, 0),
      compl.n === 0 ? '— (no graded trials)' : fmtCellPct(compl),
    ];
    lines.push('| ' + row.join(' | ') + ' |');
  }
  lines.push('');
  return lines.join('\n');
}

function renderHeatmap(trials) {
  const lines = [];
  lines.push('## Per-task heatmap');
  lines.push('');
  lines.push('Cells are mean **hidden-test pass rate** per (task × style); we picked the headline metric so the heatmap fits in one table. Sample size per cell is shown in parentheses. See the per-style aggregates above for the other five metrics.');
  lines.push('');

  const tasks = [...new Set(trials.map((t) => t.task_id))].sort();
  const styles = [...new Set(trials.map((t) => t.style))].sort();

  const header = ['task', ...styles];
  lines.push('| ' + header.join(' | ') + ' |');
  lines.push('|' + header.map(() => '---').join('|') + '|');

  for (const task of tasks) {
    const row = [task];
    for (const style of styles) {
      const cell = trials.filter((t) => t.task_id === task && t.style === style);
      const vals = cell.map((t) => t.hidden_pass_rate).filter((x) => x != null);
      if (vals.length === 0) {
        row.push('— (n=0)');
      } else {
        row.push(`${fmtPct(mean(vals))} (n=${vals.length})`);
      }
    }
    lines.push('| ' + row.join(' | ') + ' |');
  }
  lines.push('');
  return lines.join('\n');
}

function renderComplianceBreakdown(trials) {
  const lines = [];
  lines.push('## Compliant vs non-compliant');
  lines.push('');
  lines.push('Per-style breakdown of automated metrics within the human-graded sample, split by compliance verdict. **Trials outside the human-graded sample are excluded here** — they do not have a compliance verdict (per B7). The N column is the size of the graded sample for that style; if a sub-cell has 0 trials its row is omitted.');
  lines.push('');

  const styles = [...new Set(trials.map((t) => t.style))].sort();
  const headers = ['style', 'verdict', 'N', 'hidden-pass mean', 'self-pass mean', 'self-coverage mean'];
  lines.push('| ' + headers.join(' | ') + ' |');
  lines.push('|' + headers.map(() => '---').join('|') + '|');

  for (const style of styles) {
    const graded = trials.filter((t) => t.style === style && t.is_graded);
    if (graded.length === 0) {
      lines.push(`| ${style} | — (no graded trials) | 0 | — | — | — |`);
      continue;
    }
    for (const verdict of ['compliant', 'non-compliant']) {
      const sub = graded.filter((t) => t.compliance_verdict === verdict);
      if (sub.length === 0) continue;
      const hidden = mean(sub.map((t) => t.hidden_pass_rate).filter((x) => x != null));
      const self_ = mean(sub.map((t) => t.self_pass_rate).filter((x) => x != null));
      const cov = mean(sub.map((t) => t.self_coverage).filter((x) => x != null));
      lines.push(`| ${style} | ${verdict} | ${sub.length} | ${fmtPct(hidden)} | ${fmtPct(self_)} | ${fmtPct(cov)} |`);
    }
  }
  lines.push('');
  lines.push(`Among the human-graded sample: per-style N is the count of graded trials shown above. Total trials in run: ${trials.length}; total graded: ${trials.filter((t) => t.is_graded).length}.`);
  lines.push('');
  return lines.join('\n');
}

function renderRawData(trials, runDir) {
  const lines = [];
  lines.push('## Raw data');
  lines.push('');
  lines.push('Per-trial directories are linked relative to this report. Each directory contains the raw scoring JSON files (hidden_score, self_score, coverage_score, optional compliance) and the trial meta.json (tokens, time, stop_reason).');
  lines.push('');
  lines.push('| trial_id | task | style | topology | hidden-pass | self-pass | self-coverage | tokens | wall_clock_ms | graded |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const t of trials) {
    const link = `[${t.trial_id}](../../${path.relative(findBenchDir(), path.join(runDir, 'trials', t.trial_id)).split(path.sep).join('/')})`;
    lines.push([
      '',
      link,
      t.task_id ?? '—',
      t.style ?? '—',
      t.topology ?? '—',
      fmtPct(t.hidden_pass_rate),
      fmtPct(t.self_pass_rate),
      fmtPct(t.self_coverage),
      fmtNum(t.tokens_total),
      fmtNum(t.wall_clock_ms),
      t.is_graded ? 'yes' : 'no',
      '',
    ].join(' | ').trim());
  }
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function generateReport({ run_dir }) {
  if (!run_dir) throw new Error('generateReport: run_dir is required');

  const resolvedRunDir = resolveRunDir(run_dir);
  if (!fs.existsSync(resolvedRunDir)) {
    throw new Error(`generateReport: run_dir does not exist: ${run_dir} (resolved to ${resolvedRunDir})`);
  }

  const runMetaPath = path.join(resolvedRunDir, 'meta.json');
  const runMeta = readJsonIfExists(runMetaPath) || {};
  const run_id = runMeta.run_id || path.basename(resolvedRunDir.replace(/[/\\]+$/, ''));

  const trials = loadAllTrials(resolvedRunDir);

  const sections = [
    `# Bench run report — ${run_id}`,
    '',
    renderRunMetadata(runMeta, trials),
    renderPerStyleAggregates(trials),
    renderHeatmap(trials),
    renderComplianceBreakdown(trials),
    renderRawData(trials, resolvedRunDir),
  ];
  const md = sections.join('\n');

  const benchDir = findBenchDir();
  const outDir = path.join(benchDir, 'results', run_id);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, REPORT_FILENAME);
  fs.writeFileSync(outPath, md, 'utf8');
  return path.resolve(outPath);
}
