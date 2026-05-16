# setup web-dashboard template spec

The setup skill ships a `web-dashboard/` template directory that the
wizard materializes into a project's `web/` folder. The substitution
model is the same as every other template: `{{VAR}}` and
`{{IF VAR}}…{{ENDIF}}` blocks. These tests verify the templates produce
syntactically valid output for a representative panel mix.

## User stories

- As a wovenflow maintainer, I want the web-dashboard templates to be
  validated in CI so a syntactically broken template doesn't ship.
- As a wovenflow user, I want confidence that materializing the templates
  with my chosen panels produces a `serve.mjs` Node can parse and an
  `index.html` that's well-formed.

## Behaviors

### B1: substituting serve.mjs.tmpl with a panel mix produces a node-parsable script

∵ **IF** `serve.mjs.tmpl` is rendered with `PANEL_TESTS`, `PANEL_GIT`, `PANEL_COMMITS`, `PANEL_SPECS` set non-empty (and the rest empty)
↦ **WHEN** the materialized output is checked with `node --check`
∴ **THEN** the exit code is `0` (the file parses cleanly)

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { execFileSync, spawnSync } = require('node:child_process');
  const { mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  const REPO = path.join(__dirname, '..', '..');
  const TMPL_DIR = path.join(REPO, 'plugins', 'wovenflow', 'skills', 'setup', 'templates', 'web-dashboard');

  // Reusable substitution function — minimal implementation of the same
  // model documented in templates/README.md ({{VAR}} + {{IF VAR}}…{{ENDIF}}).
  // Handles nested IF blocks by repeatedly resolving the innermost IF
  // (one with no other {{IF }} between its open and close) until none remain.
  function substitute(tmpl, vars) {
    let out = tmpl;
    // Inside-out: find an IF whose body contains no further {{IF }} and resolve it.
    const innermostIf = /\{\{IF (\w+)\}\}((?:(?!\{\{IF )[\s\S])*?)\{\{ENDIF\}\}/;
    while (innermostIf.test(out)) {
      out = out.replace(innermostIf, (_, name, body) => (vars[name] ? body : ''));
    }
    out = out.replace(/\{\{(\w+)\}\}/g, (_, name) => (name in vars ? String(vars[name]) : ''));
    return out;
  }

  test('B1: serve.mjs.tmpl renders + node --check passes for a 4-panel mix', () => {
    const tmpl = readFileSync(path.join(TMPL_DIR, 'serve.mjs.tmpl'), 'utf8');
    const rendered = substitute(tmpl, {
      PROJECT_NAME: 'demo',
      INTERVAL_S: '5',
      PORT: '8082',
      UMBRELLA_PATH: '',
      PANELS_LIST: 'tests,git,commits,specs',
      PANEL_TESTS: '1', TESTS_CMD: 'echo ok', TESTS_INTERVAL_S: '60',
      PANEL_GIT: '1',
      PANEL_COMMITS: '1', COMMITS_LIMIT: '10', COMMITS_BRANCH: '',
      PANEL_SPECS: '1', SPECS_DIR: 'doc/specs',
      // unset panels left out — substitute() defaults them to empty
    });
    const dir = mkdtempSync(path.join(tmpdir(), 'wovenflow-dash-b1-'));
    const outFile = path.join(dir, 'serve.mjs');
    writeFileSync(outFile, rendered);
    const r = spawnSync('node', ['--check', outFile], { encoding: 'utf8' });
    assert.equal(r.status, 0, `node --check failed:\n${r.stderr}`);
    // No remaining template markers should leak into the output.
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(rendered), 'unsubstituted {{VAR}} marker remains');
    assert.ok(!/\{\{IF /.test(rendered), 'unsubstituted {{IF}} marker remains');
    assert.ok(!/\{\{ENDIF\}\}/.test(rendered), 'unsubstituted {{ENDIF}} marker remains');
  });
}
```

### B2: index.html.tmpl renders to balanced HTML for a chart-panel mix

∵ **IF** `index.html.tmpl` is rendered with `PANEL_TESTS`, `PANEL_TIMESERIES`, `PANEL_BAR`, `PANEL_SPARKLINE` set non-empty
↦ **WHEN** the output is inspected
∴ **THEN** there is exactly one `<html>` open + close, exactly one `<body>` open + close, no leftover `{{VAR}}` markers, and the chart helper functions (`lineChartSvg`, `barChartSvg`, `sparklineSvg`) appear in the script body

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { readFileSync } = require('node:fs');
  const path = require('node:path');

  const REPO = path.join(__dirname, '..', '..');
  const TMPL_DIR = path.join(REPO, 'plugins', 'wovenflow', 'skills', 'setup', 'templates', 'web-dashboard');

  function substitute(tmpl, vars) {
    let out = tmpl;
    const innermostIf = /\{\{IF (\w+)\}\}((?:(?!\{\{IF )[\s\S])*?)\{\{ENDIF\}\}/;
    while (innermostIf.test(out)) {
      out = out.replace(innermostIf, (_, name, body) => (vars[name] ? body : ''));
    }
    out = out.replace(/\{\{(\w+)\}\}/g, (_, name) => (name in vars ? String(vars[name]) : ''));
    return out;
  }

  test('B2: index.html.tmpl renders to balanced HTML for a chart-panel mix', () => {
    const tmpl = readFileSync(path.join(TMPL_DIR, 'index.html.tmpl'), 'utf8');
    const rendered = substitute(tmpl, {
      PROJECT_NAME: 'demo',
      INTERVAL_S: '5',
      UMBRELLA_PATH: '',
      PANEL_TESTS: '1', TESTS_CMD: 'echo ok', COMMAND_LABEL: '',
      PANEL_TIMESERIES: '1',
      PANEL_BAR: '1',
      PANEL_SPARKLINE: '1',
    });

    const openHtml  = (rendered.match(/<html\b/gi)  || []).length;
    const closeHtml = (rendered.match(/<\/html>/gi) || []).length;
    const openBody  = (rendered.match(/<body\b/gi)  || []).length;
    const closeBody = (rendered.match(/<\/body>/gi) || []).length;
    assert.equal(openHtml,  1, '<html> count');
    assert.equal(closeHtml, 1, '</html> count');
    assert.equal(openBody,  1, '<body> count');
    assert.equal(closeBody, 1, '</body> count');

    assert.ok(!/\{\{[A-Z_]+\}\}/.test(rendered), 'unsubstituted {{VAR}} marker remains');
    assert.ok(!/\{\{IF /.test(rendered), 'unsubstituted {{IF}} marker remains');

    assert.ok(rendered.includes('lineChartSvg'),  'chart-mix output should include lineChartSvg');
    assert.ok(rendered.includes('barChartSvg'),   'chart-mix output should include barChartSvg');
    assert.ok(rendered.includes('sparklineSvg'),  'chart-mix output should include sparklineSvg');
    assert.ok(rendered.includes('renderTestsPanel'), 'tests panel renderer should be present');
  });
}
```

### B3: rendered serve.mjs runs against a temp project dir and writes data.json

∵ **IF** `serve.mjs.tmpl` is rendered with `PANEL_GIT` and `PANEL_TESTS` set non-empty (a minimal panel mix that needs a real cwd)
↦ **WHEN** the output is run with `--once` from a temp directory that's been `git init`ed
∴ **THEN** the script exits 0 and `data.json` exists next to it with a parseable JSON object containing `generated_at` and a `panels.git` entry

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { spawnSync } = require('node:child_process');
  const { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  const REPO = path.join(__dirname, '..', '..');
  const TMPL_DIR = path.join(REPO, 'plugins', 'wovenflow', 'skills', 'setup', 'templates', 'web-dashboard');

  function substitute(tmpl, vars) {
    let out = tmpl;
    const innermostIf = /\{\{IF (\w+)\}\}((?:(?!\{\{IF )[\s\S])*?)\{\{ENDIF\}\}/;
    while (innermostIf.test(out)) {
      out = out.replace(innermostIf, (_, name, body) => (vars[name] ? body : ''));
    }
    out = out.replace(/\{\{(\w+)\}\}/g, (_, name) => (name in vars ? String(vars[name]) : ''));
    return out;
  }

  test('B3: rendered serve.mjs --once writes data.json with git panel snapshot', () => {
    const tmpl = readFileSync(path.join(TMPL_DIR, 'serve.mjs.tmpl'), 'utf8');
    const rendered = substitute(tmpl, {
      PROJECT_NAME: 'demo',
      INTERVAL_S: '5',
      PORT: '8082',
      UMBRELLA_PATH: '',
      PANELS_LIST: 'git,tests',
      PANEL_GIT: '1',
      PANEL_TESTS: '1', TESTS_CMD: 'true', TESTS_INTERVAL_S: '60',
    });

    // Set up a temp project: git init, then put serve.mjs in <project>/web/.
    const projectDir = mkdtempSync(path.join(tmpdir(), 'wovenflow-dash-b3-'));
    spawnSync('git', ['init', '-q'], { cwd: projectDir });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: projectDir });
    spawnSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd: projectDir });
    const webDir = path.join(projectDir, 'web');
    mkdirSync(webDir);
    const serveFile = path.join(webDir, 'serve.mjs');
    writeFileSync(serveFile, rendered);

    const r = spawnSync('node', [serveFile, '--once'], {
      cwd: projectDir, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(r.status, 0, `serve.mjs --once exited non-zero:\n${r.stderr}`);

    const dataPath = path.join(webDir, 'data.json');
    assert.ok(existsSync(dataPath), 'data.json should have been written');
    const snap = JSON.parse(readFileSync(dataPath, 'utf8'));
    assert.equal(snap.project, 'demo');
    assert.ok(snap.generated_at, 'generated_at should be set');
    assert.ok(snap.panels && typeof snap.panels === 'object', 'panels should be an object');
    assert.ok('git' in snap.panels, 'git panel should be present');
    assert.ok('tests' in snap.panels, 'tests panel should be present');
    // git panel for an init-only repo should report a branch.
    assert.ok(snap.panels.git.branch, `git panel should expose branch (got: ${JSON.stringify(snap.panels.git)})`);
    // dirty_count should be >= 1 because we just wrote serve.mjs into the repo
    // and didn't commit it. The point is the field is populated, not its exact value.
    assert.ok(typeof snap.panels.git.dirty_count === 'number', 'dirty_count should be a number');
  });
}
```

### B4: panels left unset are stripped from both serve.mjs and index.html

∵ **IF** only `PANEL_GIT` is set (no other panels)
↦ **WHEN** both templates are rendered
∴ **THEN** the rendered serve.mjs contains `probeGit` but does not contain `probeTests` / `probeBench` / `probeTimeseries`, and the rendered index.html contains `renderGitPanel` but not `renderTestsPanel` / `renderTimeseriesPanel`

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { readFileSync } = require('node:fs');
  const path = require('node:path');

  const REPO = path.join(__dirname, '..', '..');
  const TMPL_DIR = path.join(REPO, 'plugins', 'wovenflow', 'skills', 'setup', 'templates', 'web-dashboard');

  function substitute(tmpl, vars) {
    let out = tmpl;
    const innermostIf = /\{\{IF (\w+)\}\}((?:(?!\{\{IF )[\s\S])*?)\{\{ENDIF\}\}/;
    while (innermostIf.test(out)) {
      out = out.replace(innermostIf, (_, name, body) => (vars[name] ? body : ''));
    }
    out = out.replace(/\{\{(\w+)\}\}/g, (_, name) => (name in vars ? String(vars[name]) : ''));
    return out;
  }

  test('B4: unset panels are stripped from both rendered files', () => {
    const serveTmpl = readFileSync(path.join(TMPL_DIR, 'serve.mjs.tmpl'), 'utf8');
    const htmlTmpl  = readFileSync(path.join(TMPL_DIR, 'index.html.tmpl'), 'utf8');
    const vars = {
      PROJECT_NAME: 'tiny', INTERVAL_S: '5', PORT: '8082', UMBRELLA_PATH: '',
      PANELS_LIST: 'git', PANEL_GIT: '1',
      // Every other PANEL_* deliberately left unset.
    };
    const rServe = substitute(serveTmpl, vars);
    const rHtml  = substitute(htmlTmpl, vars);

    // Present
    assert.ok(rServe.includes('probeGit'),       'probeGit should be present');
    assert.ok(rHtml.includes('renderGitPanel'),  'renderGitPanel should be present');

    // Stripped
    for (const stripped of ['probeTests', 'probeBench', 'probeTimeseries', 'probeBar', 'probeSparkline', 'probeCommits', 'probeSpecs', 'probeSubagents', 'probeTasks', 'probeCommand', 'probeProcesses']) {
      assert.ok(!rServe.includes(stripped), `${stripped} should have been stripped from serve.mjs`);
    }
    for (const stripped of ['renderTestsPanel', 'renderTimeseriesPanel', 'renderBarPanel', 'renderBenchPanel', 'renderCommitsPanel', 'renderSpecsPanel', 'renderSubagentsPanel', 'renderTasksPanel', 'renderCommandPanel', 'renderProcessesPanel', 'renderSparklinePanel']) {
      assert.ok(!rHtml.includes(stripped), `${stripped} should have been stripped from index.html`);
    }
    assert.ok(!/\{\{IF /.test(rServe) && !/\{\{ENDIF\}\}/.test(rServe), 'serve.mjs IF/ENDIF residue');
    assert.ok(!/\{\{IF /.test(rHtml)  && !/\{\{ENDIF\}\}/.test(rHtml),  'index.html IF/ENDIF residue');
  });
}
```
