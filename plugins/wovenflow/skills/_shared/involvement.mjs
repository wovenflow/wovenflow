// User-involvement-cadence helper for wovenflow skills.
//
// Reads `.wovenflow.yml` at the project root and exposes `shouldAsk(gate, config)`
// — the single decision the orchestrator consults at every prompt-the-user point.
//
// The schema is tiny and fixed, so this module ships a minimal hand-written YAML
// parser scoped exactly to that schema. No npm dependency — wovenflow is
// zero-dep on the plugin surface, and YAML libraries are too big for one file.
//
// Schema:
//
//   involvement:
//     mode: minimal | standard | maximal | custom
//     gates:
//       <gate_name>: ask | auto
//       ...
//
// Mode-to-gate table is the spec. `custom` mode reads gates from the file;
// gates not listed in `custom` fall back to `standard`'s behavior.

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

// The canonical mode-to-gate table. This is the SPEC.
export const MODE_TABLE = {
  minimal: {
    design_doc_ready: 'ask',
    open_question_from_subagent: 'ask',
    ui_inspect: 'ask',
    redteam_findings: 'auto',
    scopecheck_clean: 'auto',
    scopecheck_violations: 'auto',
    scopecheck_ambiguous_or_blocked: 'ask',
    pre_ship_pr: 'auto',
    subflow_style_decisions: 'auto',
  },
  standard: {
    design_doc_ready: 'ask',
    open_question_from_subagent: 'ask',
    ui_inspect: 'ask',
    redteam_findings: 'ask',
    scopecheck_clean: 'auto',
    scopecheck_violations: 'ask',
    scopecheck_ambiguous_or_blocked: 'ask',
    pre_ship_pr: 'ask',
    subflow_style_decisions: 'auto',
  },
  maximal: {
    design_doc_ready: 'ask',
    open_question_from_subagent: 'ask',
    ui_inspect: 'ask',
    redteam_findings: 'ask',
    scopecheck_clean: 'ask',
    scopecheck_violations: 'ask',
    scopecheck_ambiguous_or_blocked: 'ask',
    pre_ship_pr: 'ask',
    subflow_style_decisions: 'ask',
  },
};

export const KNOWN_GATES = Object.keys(MODE_TABLE.standard);
export const KNOWN_MODES = ['minimal', 'standard', 'maximal', 'custom'];

/**
 * Who writes the code during the build phase.
 *
 *   fork      — subagent inheriting the orchestrator's conversation context
 *   subagent  — subagent with no inherited context
 *   inline    — the orchestrator itself
 *
 * `fork` is the default because the dominant failure in practice is context
 * loss at the handoff, not implementation quality: a fresh subagent re-reads
 * the spec but cannot re-read the conversation, so anything settled in dialogue
 * is invisible to it.
 */
export const KNOWN_IMPLEMENTERS = ['fork', 'subagent', 'inline'];
export const DEFAULT_IMPLEMENTER = 'fork';

/**
 * Parse the tiny YAML subset that `.wovenflow.yml` is permitted to use.
 * Hand-written; intentionally not a general YAML parser.
 *
 * Accepts:
 *   - One top-level key `involvement:`
 *   - A scalar `mode: <value>`
 *   - A nested `gates:` map of `<key>: <value>` (one per line)
 *   - Blank lines, full-line `#` comments, inline `#` comments after a value
 *
 * Rejects anything else by throwing a descriptive Error.
 */
export function parseInvolvementYaml(text) {
  const lines = text.split(/\r?\n/);
  const out = { involvement: {}, build: {} };
  let inInvolvement = false;
  let inBuild = false;
  let inGates = false;
  let gates = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Strip inline comments (anything from an unquoted # onward) and trailing ws.
    const noComment = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
    const line = noComment.replace(/\s+$/, '');
    if (line.trim() === '') continue;

    // Top-level (no leading whitespace).
    if (!/^\s/.test(line)) {
      if (line.startsWith('involvement:')) {
        inInvolvement = true;
        inBuild = false;
        inGates = false;
        const rest = line.slice('involvement:'.length).trim();
        if (rest !== '') {
          throw new Error(
            `.wovenflow.yml line ${i + 1}: \`involvement:\` must be a mapping, not a scalar`,
          );
        }
        continue;
      }
      if (line.startsWith('build:')) {
        inBuild = true;
        inInvolvement = false;
        inGates = false;
        const rest = line.slice('build:'.length).trim();
        if (rest !== '') {
          throw new Error(
            `.wovenflow.yml line ${i + 1}: \`build:\` must be a mapping, not a scalar`,
          );
        }
        continue;
      }
      // Any other top-level key is unsupported in this schema.
      throw new Error(
        `.wovenflow.yml line ${i + 1}: unsupported top-level key (expected \`involvement\` or \`build\`)`,
      );
    }

    if (!inInvolvement && !inBuild) {
      throw new Error(
        `.wovenflow.yml line ${i + 1}: indented content outside any known top-level key`,
      );
    }

    // 2-space indented entries under `build:`.
    if (inBuild) {
      const bTwo = /^  (\S.*)$/.exec(line);
      if (bTwo && bTwo[1].startsWith('implementer:')) {
        const val = stripQuotes(bTwo[1].slice('implementer:'.length).trim());
        if (val === '') {
          throw new Error(`.wovenflow.yml line ${i + 1}: \`implementer:\` requires a value`);
        }
        if (!KNOWN_IMPLEMENTERS.includes(val)) {
          throw new Error(
            `.wovenflow.yml line ${i + 1}: unknown build.implementer "${val}" ` +
              `(expected one of: ${KNOWN_IMPLEMENTERS.join(', ')})`,
          );
        }
        out.build.implementer = val;
        continue;
      }
      throw new Error(
        `.wovenflow.yml line ${i + 1}: unsupported key under \`build\` ` +
          `(\`${(bTwo ? bTwo[1] : line.trim()).split(':')[0]}\`)`,
      );
    }

    // 2-space indented entries under `involvement:`.
    const twoSpace = /^  (\S.*)$/.exec(line);
    if (twoSpace) {
      const body = twoSpace[1];
      if (body.startsWith('mode:')) {
        inGates = false;
        const val = body.slice('mode:'.length).trim();
        if (val === '') {
          throw new Error(`.wovenflow.yml line ${i + 1}: \`mode:\` requires a value`);
        }
        out.involvement.mode = stripQuotes(val);
        continue;
      }
      if (body.startsWith('gates:')) {
        const rest = body.slice('gates:'.length).trim();
        if (rest !== '') {
          throw new Error(`.wovenflow.yml line ${i + 1}: \`gates:\` must be a mapping`);
        }
        gates = {};
        out.involvement.gates = gates;
        inGates = true;
        continue;
      }
      throw new Error(
        `.wovenflow.yml line ${i + 1}: unsupported key under \`involvement\` (\`${body.split(':')[0]}\`)`,
      );
    }

    // 4-space indented entries under `gates:`.
    const fourSpace = /^    (\S.*)$/.exec(line);
    if (fourSpace && inGates && gates) {
      const body = fourSpace[1];
      const m = /^([A-Za-z_][A-Za-z0-9_]*):\s*(\S.*)$/.exec(body);
      if (!m) {
        throw new Error(
          `.wovenflow.yml line ${i + 1}: cannot parse gate entry (expected \`<name>: ask|auto\`)`,
        );
      }
      const gateName = m[1];
      const gateVal = stripQuotes(m[2].trim());
      if (gateVal !== 'ask' && gateVal !== 'auto') {
        throw new Error(
          `.wovenflow.yml line ${i + 1}: gate \`${gateName}\` value must be \`ask\` or \`auto\` (got \`${gateVal}\`)`,
        );
      }
      gates[gateName] = gateVal;
      continue;
    }

    throw new Error(
      `.wovenflow.yml line ${i + 1}: unexpected indentation or content`,
    );
  }

  return out;
}

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Load `.wovenflow.yml` from `repoRoot` (default cwd) and return the resolved
 * config:
 *
 *   { mode, gates: { gate: 'ask'|'auto', ... }, source: 'file'|'default' }
 *
 * Missing file → defaults to `standard`. Unknown mode → throws.
 */
export function loadInvolvementConfig(repoRoot = process.cwd()) {
  const path = join(repoRoot, '.wovenflow.yml');
  if (!existsSync(path)) {
    return {
      mode: 'standard',
      gates: { ...MODE_TABLE.standard },
      source: 'default',
    };
  }
  const text = readFileSync(path, 'utf8');
  const parsed = parseInvolvementYaml(text);
  const inv = parsed.involvement || {};
  const mode = inv.mode || 'standard';
  if (!KNOWN_MODES.includes(mode)) {
    throw new Error(
      `.wovenflow.yml: unknown involvement.mode "${mode}" (expected one of: ${KNOWN_MODES.join(', ')})`,
    );
  }

  let gates;
  if (mode === 'custom') {
    // Start from standard, overlay user overrides.
    gates = { ...MODE_TABLE.standard };
    const userGates = inv.gates || {};
    for (const [k, v] of Object.entries(userGates)) {
      gates[k] = v;
    }
  } else {
    gates = { ...MODE_TABLE[mode] };
  }

  return { mode, gates, source: 'file' };
}

/**
 * Load the build-phase config from `.wovenflow.yml` at `repoRoot`:
 *
 *   { implementer: 'fork'|'subagent'|'inline', source: 'file'|'default' }
 *
 * Missing file, or a file with no `build` block → `fork`. An unrecognised
 * implementer value throws, matching how an unknown involvement mode is
 * treated: a typo that silently falls back to a default is worse than one that
 * stops the run, because the run then proceeds under a setting nobody chose.
 */
export function loadBuildConfig(repoRoot = process.cwd()) {
  const path = join(repoRoot, '.wovenflow.yml');
  if (!existsSync(path)) {
    return { implementer: DEFAULT_IMPLEMENTER, source: 'default' };
  }
  const parsed = parseInvolvementYaml(readFileSync(path, 'utf8'));
  const implementer = (parsed.build || {}).implementer;
  if (!implementer) {
    return { implementer: DEFAULT_IMPLEMENTER, source: 'default' };
  }
  return { implementer, source: 'file' };
}

/**
 * Decision API: should the orchestrator invoke AskUserQuestion at this gate?
 * Pass either a loaded config object or a repoRoot path (or nothing for cwd).
 *
 * Returns 'ask' or 'auto'. Unknown gates default to 'ask' (safety: when in
 * doubt, ask the user) but emit a warning to stderr.
 */
export function shouldAsk(gate, configOrRoot) {
  let config;
  if (configOrRoot && typeof configOrRoot === 'object' && configOrRoot.gates) {
    config = configOrRoot;
  } else {
    config = loadInvolvementConfig(configOrRoot);
  }
  if (!(gate in config.gates)) {
    if (!KNOWN_GATES.includes(gate)) {
      // Genuinely unknown gate — be conservative.
      process.stderr.write(
        `wovenflow involvement: unknown gate "${gate}", defaulting to ask\n`,
      );
      return 'ask';
    }
    // Known gate not in the resolved config (shouldn't normally happen since
    // custom falls back to standard, but be defensive).
    return MODE_TABLE.standard[gate];
  }
  return config.gates[gate];
}

/**
 * Append a JSON-Lines record to `.wovenflow-decisions.log` whenever an
 * auto-decided gate fires. Format per spec:
 *   { ts, skill, gate, chosen, reason }
 */
export function logAutoDecision({ skill, gate, chosen, reason }, repoRoot = process.cwd()) {
  const ts = new Date().toISOString();
  const record = JSON.stringify({ ts, skill, gate, chosen, reason });
  appendFileSync(join(repoRoot, '.wovenflow-decisions.log'), record + '\n');
}
