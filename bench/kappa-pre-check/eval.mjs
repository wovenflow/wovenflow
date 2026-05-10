// Inter-rater agreement check for coverage predicates.
//
// For each sampled task and each label, compares predicates from two
// independent blind authors:
//   - Rater A: bench/tasks/<task>/coverage_predicates/<label>.js (committed)
//   - Rater B: bench/kappa-pre-check/<task>/<label>.js (re-authored)
//
// Each predicate is evaluated against:
//   - POSITIVE fixture: the task's actual hidden_tests/ directory
//     (which by construction exercises every label)
//   - NEGATIVE fixture: an empty temp directory (which exercises no labels)
//
// Expected: both raters return true on positive, false on negative.
// Disagreement indicates a buggy or over-strict predicate.
//
// Output: a report.md with per-task per-label per-fixture results,
// per-task agreement rate, and aggregate agreement.
//
// This is a lightweight first cut. A full kappa computation would need
// a larger fixture bank with adversarial cases per label; that's deferred
// to a follow-up before Stage-2 lock per PROTOCOL.md §9.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SAMPLED_TASKS = ['slugify', 'throttle', 'deep-equal'];

async function loadPredicate(file) {
  const mod = await import(pathToFileURL(file).href);
  return mod.default;
}

function makeEmptyDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kappa-empty-'));
}

async function evalRater(predicatesDir, labels, hiddenDir, emptyDir) {
  const results = {};
  for (const label of labels) {
    const file = path.join(predicatesDir, `${label}.js`);
    if (!fs.existsSync(file)) {
      results[label] = { positive: 'missing', negative: 'missing' };
      continue;
    }
    const predicate = await loadPredicate(file);
    let positive, negative;
    try { positive = predicate(hiddenDir); } catch (e) { positive = `error: ${e.message}`; }
    try { negative = predicate(emptyDir); } catch (e) { negative = `error: ${e.message}`; }
    results[label] = { positive, negative };
  }
  return results;
}

const reportLines = ['# Kappa pre-check report', ''];
let totalLabels = 0;
let totalFixtures = 0;
let agreements = 0;
let positiveCorrect = 0;
let negativeCorrect = 0;

for (const task of SAMPLED_TASKS) {
  const taskDir = path.join(REPO_ROOT, 'bench', 'tasks', task);
  const labelsManifest = JSON.parse(
    fs.readFileSync(path.join(taskDir, 'hidden_tests', 'labels.json'), 'utf8'),
  );
  const labels = labelsManifest.labels;
  const hiddenDir = path.join(taskDir, 'hidden_tests');
  const emptyDir = makeEmptyDir();

  const raterA = await evalRater(
    path.join(taskDir, 'coverage_predicates'),
    labels,
    hiddenDir,
    emptyDir,
  );
  const raterB = await evalRater(
    path.join(REPO_ROOT, 'bench', 'kappa-pre-check', task),
    labels,
    hiddenDir,
    emptyDir,
  );

  reportLines.push(`## Task: ${task}`, '');
  reportLines.push('| Label | Rater A pos | Rater A neg | Rater B pos | Rater B neg | Agree pos | Agree neg |');
  reportLines.push('|---|---|---|---|---|---|---|');

  let taskAgree = 0;
  let taskTotal = 0;
  for (const label of labels) {
    const a = raterA[label];
    const b = raterB[label];
    const aPosOk = a.positive === true;
    const aNegOk = a.negative === false;
    const bPosOk = b.positive === true;
    const bNegOk = b.negative === false;
    const agreePos = a.positive === b.positive ? '✓' : '✗';
    const agreeNeg = a.negative === b.negative ? '✓' : '✗';
    if (a.positive === b.positive) taskAgree++;
    if (a.negative === b.negative) taskAgree++;
    taskTotal += 2;
    if (aPosOk) positiveCorrect++;
    if (aNegOk) negativeCorrect++;
    if (bPosOk) positiveCorrect++;
    if (bNegOk) negativeCorrect++;
    totalLabels++;
    reportLines.push(`| ${label} | ${a.positive} | ${a.negative} | ${b.positive} | ${b.negative} | ${agreePos} | ${agreeNeg} |`);
  }
  agreements += taskAgree;
  totalFixtures += taskTotal;
  reportLines.push('', `**Per-task agreement:** ${taskAgree}/${taskTotal} = ${(100 * taskAgree / taskTotal).toFixed(1)}%`, '');

  fs.rmSync(emptyDir, { recursive: true, force: true });
}

reportLines.push('## Aggregate', '');
reportLines.push(`- Total label×fixture observations per rater: ${totalLabels * 2}`);
reportLines.push(`- Pairwise agreement: ${agreements}/${totalFixtures} = ${(100 * agreements / totalFixtures).toFixed(1)}%`);
reportLines.push(`- Rater A correctness on positive fixtures: ${positiveCorrect / 2}/${totalLabels} (${(50 * positiveCorrect / totalLabels).toFixed(1)}%)`);
reportLines.push(`- Negative-fixture correctness pooled across raters: ${negativeCorrect}/${totalLabels * 2} (${(100 * negativeCorrect / (totalLabels * 2)).toFixed(1)}%)`);
reportLines.push('');
reportLines.push('## Methodology note');
reportLines.push('');
reportLines.push('This is a lightweight first-cut agreement check. Both raters were independently dispatched as blind subagents reading only the task\'s `labels.json`. Each rater\'s predicates were evaluated against (1) the task\'s actual hidden_tests/ directory, which exercises every label by construction, and (2) an empty temp directory, which exercises none.');
reportLines.push('');
reportLines.push('A full kappa computation would require a larger per-label fixture bank with adversarial cases (test files that exercise some labels but not others). That is deferred to a follow-up before Stage-2 lock per PROTOCOL.md §9.');
reportLines.push('');
reportLines.push('## Reproducing');
reportLines.push('');
reportLines.push('From the repo root:');
reportLines.push('');
reportLines.push('```bash');
reportLines.push('node bench/kappa-pre-check/eval.mjs > bench/kappa-pre-check/report.md');
reportLines.push('```');

const report = reportLines.join('\n');
process.stdout.write(report);
