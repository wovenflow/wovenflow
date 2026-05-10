// Three-rater agreement eval for the throttle task.
// Loads predicates from rater A (committed), rater B (kappa-pre-check/throttle),
// and rater C (kappa-pre-check/throttle-rater-c) and evaluates all three
// against the positive (real hidden_tests) and negative (empty dir) fixtures.
// Reports per-label per-rater outputs and majority verdicts.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const TASK = 'throttle';

async function loadPred(file) {
  const mod = await import(pathToFileURL(file).href);
  return mod.default;
}

const taskDir = path.join(REPO_ROOT, 'bench', 'tasks', TASK);
const labelsManifest = JSON.parse(
  fs.readFileSync(path.join(taskDir, 'hidden_tests', 'labels.json'), 'utf8'),
);
const labels = labelsManifest.labels;
const hiddenDir = path.join(taskDir, 'hidden_tests');
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kappa3-empty-'));

const dirs = {
  A: path.join(taskDir, 'coverage_predicates'),
  B: path.join(REPO_ROOT, 'bench', 'kappa-pre-check', TASK),
  C: path.join(REPO_ROOT, 'bench', 'kappa-pre-check', `${TASK}-rater-c`),
};

const out = ['# Throttle 3-rater agreement', ''];
out.push('| Label | A pos | A neg | B pos | B neg | C pos | C neg | Majority pos | Majority neg | Note |');
out.push('|---|---|---|---|---|---|---|---|---|---|');

let majorityCorrect = 0;
let totalLabels = 0;
const recommendations = [];

for (const label of labels) {
  const results = {};
  for (const [rater, dir] of Object.entries(dirs)) {
    const file = path.join(dir, `${label}.js`);
    if (!fs.existsSync(file)) {
      results[rater] = { positive: 'missing', negative: 'missing' };
      continue;
    }
    const p = await loadPred(file);
    let pos, neg;
    try { pos = p(hiddenDir); } catch (e) { pos = `err:${e.message}`; }
    try { neg = p(emptyDir); } catch (e) { neg = `err:${e.message}`; }
    results[rater] = { positive: pos, negative: neg };
  }

  const posVotes = [results.A.positive, results.B.positive, results.C.positive];
  const negVotes = [results.A.negative, results.B.negative, results.C.negative];
  const majPos = posVotes.filter(v => v === true).length >= 2;
  const majNeg = negVotes.filter(v => v === true).length >= 2;
  const majPosCorrect = majPos === true;
  const majNegCorrect = majNeg === false;
  totalLabels++;
  if (majPosCorrect && majNegCorrect) majorityCorrect++;

  let note = '';
  if (!majPosCorrect) note += 'Majority WRONG on positive. ';
  const trueOnPos = ['A', 'B', 'C'].filter(r => results[r].positive === true);
  if (trueOnPos.length === 1) note += `Only ${trueOnPos[0]} fires; recommend adopting ${trueOnPos[0]}'s predicate.`;
  if (trueOnPos.length === 0) note += 'NO rater fires; label is low-confidence.';
  if (trueOnPos.length === 2 && results.A.positive !== true) note += `A is the outlier; replace A with ${trueOnPos[0]} or ${trueOnPos[1]}.`;
  if (trueOnPos.length === 3) note += 'All agree; predicate is reliable.';

  if (note.includes('replace A') || note.includes('Only')) {
    recommendations.push({ label, action: note });
  }

  out.push(`| ${label} | ${results.A.positive} | ${results.A.negative} | ${results.B.positive} | ${results.B.negative} | ${results.C.positive} | ${results.C.negative} | ${majPos} | ${majNeg} | ${note} |`);
}

out.push('', `**Majority correctness:** ${majorityCorrect}/${totalLabels} labels (${(100 * majorityCorrect / totalLabels).toFixed(1)}%)`, '');

if (recommendations.length > 0) {
  out.push('## Recommendations', '');
  for (const r of recommendations) {
    out.push(`- **${r.label}:** ${r.action}`);
  }
}

fs.rmSync(emptyDir, { recursive: true, force: true });
process.stdout.write(out.join('\n') + '\n');
