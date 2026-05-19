# User-involvement cadence spec

A wovenflow user declares — in `.wovenflow.yml` at the project root — how often
they want the workflow to stop and ask. Every wovenflow skill respects this
single setting at every prompt-the-user point, so the user gets one knob
instead of N per-skill toggles.

## User stories

- As a wovenflow user, I want to set `involvement.mode: minimal` once and have
  every skill stop asking me about decisions I don't care about, so I can run
  the workflow heads-down.
- As a wovenflow user, I want to set `involvement.mode: maximal` when working
  on high-stakes code, so the workflow stops at every gate and I never miss a
  decision the orchestrator was about to auto-resolve.
- As a wovenflow user, I want a `custom` mode that lets me flip individual
  gates without redefining the whole table, so I can mostly run on `standard`
  but force one specific gate to always ask (or always auto).
- As a wovenflow contributor, I want a clear error when the config file is
  malformed, so a typo never silently changes my workflow.
- As an auditor, I want every auto-decided gate logged to
  `.wovenflow-decisions.log` (JSONL), so I can review what the orchestrator
  decided on my behalf.

## Behaviors

### B1: minimal mode maps each gate to the spec'd value

∵ **IF** `.wovenflow.yml` declares `involvement.mode: minimal`
↦ **WHEN** the helper resolves the config and `shouldAsk(gate, config)` runs for every known gate
∴ **THEN** the returned values match the minimal column of the mode-to-gate table exactly

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { mkdtempSync, writeFileSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  test('B1: minimal mode maps each gate to the spec\'d value', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wovenflow-b1-'));
    writeFileSync(path.join(dir, '.wovenflow.yml'), 'involvement:\n  mode: minimal\n');
    const helperUrl = require('url').pathToFileURL(
      path.join(__dirname, '..', '..', 'plugins', 'wovenflow', 'skills', '_shared', 'involvement.mjs'),
    ).href;
    const mod = await import(helperUrl);
    const cfg = mod.loadInvolvementConfig(dir);
    assert.equal(cfg.mode, 'minimal');
    const expected = {
      design_doc_ready: 'ask',
      open_question_from_subagent: 'ask',
      ui_inspect: 'ask',
      redteam_findings: 'auto',
      scopecheck_clean: 'auto',
      scopecheck_violations: 'auto',
      scopecheck_ambiguous_or_blocked: 'ask',
      pre_ship_pr: 'auto',
      subflow_style_decisions: 'auto',
    };
    for (const [gate, want] of Object.entries(expected)) {
      assert.equal(mod.shouldAsk(gate, cfg), want, `gate ${gate} under minimal`);
    }
  });
}
```

### B2: standard and maximal modes map each gate to the spec'd value

∵ **IF** `.wovenflow.yml` declares `involvement.mode: standard` (resp. `maximal`)
↦ **WHEN** `shouldAsk` runs for every known gate
∴ **THEN** the returned values match the standard (resp. maximal) column of the table exactly

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { mkdtempSync, writeFileSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  test('B2: standard and maximal modes map each gate to the spec\'d value', async () => {
    const helperUrl = require('url').pathToFileURL(
      path.join(__dirname, '..', '..', 'plugins', 'wovenflow', 'skills', '_shared', 'involvement.mjs'),
    ).href;
    const mod = await import(helperUrl);

    const standardExpected = {
      design_doc_ready: 'ask',
      open_question_from_subagent: 'ask',
      ui_inspect: 'ask',
      redteam_findings: 'ask',
      scopecheck_clean: 'auto',
      scopecheck_violations: 'ask',
      scopecheck_ambiguous_or_blocked: 'ask',
      pre_ship_pr: 'ask',
      subflow_style_decisions: 'auto',
    };
    const maximalExpected = {
      design_doc_ready: 'ask',
      open_question_from_subagent: 'ask',
      ui_inspect: 'ask',
      redteam_findings: 'ask',
      scopecheck_clean: 'ask',
      scopecheck_violations: 'ask',
      scopecheck_ambiguous_or_blocked: 'ask',
      pre_ship_pr: 'ask',
      subflow_style_decisions: 'ask',
    };

    for (const [mode, expected] of [['standard', standardExpected], ['maximal', maximalExpected]]) {
      const dir = mkdtempSync(path.join(tmpdir(), `wovenflow-b2-${mode}-`));
      writeFileSync(path.join(dir, '.wovenflow.yml'), `involvement:\n  mode: ${mode}\n`);
      const cfg = mod.loadInvolvementConfig(dir);
      assert.equal(cfg.mode, mode);
      for (const [gate, want] of Object.entries(expected)) {
        assert.equal(mod.shouldAsk(gate, cfg), want, `gate ${gate} under ${mode}`);
      }
    }
  });
}
```

### B3: custom mode respects per-gate overrides, falls back to standard for unlisted gates

∵ **IF** `.wovenflow.yml` declares `involvement.mode: custom` with a partial `gates:` map
↦ **WHEN** `shouldAsk` runs for both listed and unlisted gates
∴ **THEN** listed gates return the user's choice; unlisted gates return standard's behavior

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { mkdtempSync, writeFileSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  test('B3: custom mode respects per-gate overrides, falls back to standard', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wovenflow-b3-'));
    // Flip two gates away from standard: redteam_findings ask→auto, scopecheck_clean auto→ask.
    writeFileSync(path.join(dir, '.wovenflow.yml'),
      'involvement:\n  mode: custom\n  gates:\n    redteam_findings: auto\n    scopecheck_clean: ask\n');
    const helperUrl = require('url').pathToFileURL(
      path.join(__dirname, '..', '..', 'plugins', 'wovenflow', 'skills', '_shared', 'involvement.mjs'),
    ).href;
    const mod = await import(helperUrl);
    const cfg = mod.loadInvolvementConfig(dir);
    assert.equal(cfg.mode, 'custom');
    // Overridden gates use the user's value.
    assert.equal(mod.shouldAsk('redteam_findings', cfg), 'auto');
    assert.equal(mod.shouldAsk('scopecheck_clean', cfg), 'ask');
    // Unlisted gates match standard.
    assert.equal(mod.shouldAsk('design_doc_ready', cfg), 'ask');         // standard: ask
    assert.equal(mod.shouldAsk('subflow_style_decisions', cfg), 'auto'); // standard: auto
    assert.equal(mod.shouldAsk('scopecheck_violations', cfg), 'ask');    // standard: ask
    assert.equal(mod.shouldAsk('pre_ship_pr', cfg), 'ask');              // standard: ask
  });
}
```

### B4: unknown mode is rejected with a clear error

∵ **IF** `.wovenflow.yml` declares `involvement.mode: ridiculous`
↦ **WHEN** the helper loads the config
∴ **THEN** loading throws an Error naming the unsupported mode and the allowed set

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { mkdtempSync, writeFileSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  test('B4: unknown mode is rejected with a clear error', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wovenflow-b4-'));
    writeFileSync(path.join(dir, '.wovenflow.yml'), 'involvement:\n  mode: ridiculous\n');
    const helperUrl = require('url').pathToFileURL(
      path.join(__dirname, '..', '..', 'plugins', 'wovenflow', 'skills', '_shared', 'involvement.mjs'),
    ).href;
    const mod = await import(helperUrl);
    assert.throws(
      () => mod.loadInvolvementConfig(dir),
      /unknown involvement\.mode "ridiculous".*minimal.*standard.*maximal.*custom/s,
    );
  });
}
```

### B5: missing .wovenflow.yml defaults to standard

∵ **IF** no `.wovenflow.yml` exists at the repo root
↦ **WHEN** the helper loads the config
∴ **THEN** the returned config is `mode: standard` with `source: default`, and every gate matches standard

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { mkdtempSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  test('B5: missing .wovenflow.yml defaults to standard', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wovenflow-b5-'));
    const helperUrl = require('url').pathToFileURL(
      path.join(__dirname, '..', '..', 'plugins', 'wovenflow', 'skills', '_shared', 'involvement.mjs'),
    ).href;
    const mod = await import(helperUrl);
    const cfg = mod.loadInvolvementConfig(dir);
    assert.equal(cfg.mode, 'standard');
    assert.equal(cfg.source, 'default');
    // Spot-check several gates against standard.
    assert.equal(mod.shouldAsk('design_doc_ready', cfg), 'ask');
    assert.equal(mod.shouldAsk('redteam_findings', cfg), 'ask');
    assert.equal(mod.shouldAsk('scopecheck_clean', cfg), 'auto');
    assert.equal(mod.shouldAsk('subflow_style_decisions', cfg), 'auto');
  });
}
```

### B6: logAutoDecision appends a JSONL record per auto-decided gate

∵ **IF** the orchestrator auto-decides a gate (per the resolved config)
↦ **WHEN** `logAutoDecision({ skill, gate, chosen, reason }, repoRoot)` is called
∴ **THEN** `.wovenflow-decisions.log` gains one line of JSON with `ts`, `skill`, `gate`, `chosen`, `reason`

```javascript
{
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const { mkdtempSync, readFileSync, existsSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const path = require('node:path');

  test('B6: logAutoDecision appends a JSONL record per auto-decided gate', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wovenflow-b6-'));
    const helperUrl = require('url').pathToFileURL(
      path.join(__dirname, '..', '..', 'plugins', 'wovenflow', 'skills', '_shared', 'involvement.mjs'),
    ).href;
    const mod = await import(helperUrl);

    mod.logAutoDecision({
      skill: 'scopecheck',
      gate: 'scopecheck_clean',
      chosen: 'proceed',
      reason: 'all diff lines covered',
    }, dir);
    mod.logAutoDecision({
      skill: 'redteam',
      gate: 'redteam_findings',
      chosen: 'PROCEED',
      reason: 'no load-bearing objections',
    }, dir);

    const logPath = path.join(dir, '.wovenflow-decisions.log');
    assert.ok(existsSync(logPath));
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);

    const r1 = JSON.parse(lines[0]);
    assert.equal(r1.skill, 'scopecheck');
    assert.equal(r1.gate, 'scopecheck_clean');
    assert.equal(r1.chosen, 'proceed');
    assert.equal(r1.reason, 'all diff lines covered');
    assert.match(r1.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO-8601 prefix

    const r2 = JSON.parse(lines[1]);
    assert.equal(r2.skill, 'redteam');
    assert.equal(r2.gate, 'redteam_findings');
  });
}
```
