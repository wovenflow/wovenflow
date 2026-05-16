# Web dashboard template

A tailored single-page dashboard for project monitoring. The setup wizard
asks which panels you want, then materializes only those into your project's
`web/` directory.

## Why this exists

A dashboard is a much better surface than text for things that resist text.
"Tests passed" is a sentence; "pass rate over the last 30 commits" is a
chart you can glance at and immediately know whether you're on or off the
rails. The panel system below leans into that: status panels for now-state,
chart panels for change-over-time.

## What gets materialized

For a chosen set of panels, the wizard writes:

```
<repo>/web/
├── serve.mjs        # generated from serve.mjs.tmpl — Node writer + optional HTTP server
├── index.html       # generated from index.html.tmpl — SPA, polls data.json
└── data.json        # written by serve.mjs each tick (gitignored)
```

`serve.mjs` is the writer. It runs each enabled panel's probe function on
an interval and writes the snapshot to `data.json`. `index.html` polls
`data.json` and re-renders.

## Panel catalog

| Panel | What it shows | Variables it needs |
|---|---|---|
| `tests` | Pass/fail counts from the test command | `TESTS_CMD`, `TESTS_INTERVAL_S` |
| `specs` | `*.spec.md` files with state (designed/tested) | `SPECS_DIR` |
| `commits` | Last N commits + 14-day commits/day sparkline | `COMMITS_LIMIT`, `COMMITS_BRANCH` (optional) |
| `subagents` | Active subagent transcript count (last 60s) | — |
| `git` | Branch, dirty files, ahead/behind upstream | — |
| `tasks` | tasks.md counts OR `gh issue list` | `TASKS_FILE`, `TASKS_LABELS` (optional) |
| `command` | Custom shell command stdout, optional regex extract | `COMMAND_CMD`, `COMMAND_LABEL`, `COMMAND_INTERVAL_S`, `COMMAND_REGEX` (optional) |
| `processes` | Processes matching name patterns | `PROCESSES_PATTERNS` (comma-separated) |
| `bench` | wovenflow `bench/results/` summary (advanced) | — |
| `timeseries` | Line chart from JSONL/CSV — change over time | `TIMESERIES_SOURCE`, `TIMESERIES_X`, `TIMESERIES_Y` |
| `bar` | Bar chart from JSON array or object | `BAR_SOURCE`, `BAR_X_LABEL`, `BAR_Y_LABEL` |
| `sparkline` | Tiny inline trend line — "is this number drifting?" | `SPARKLINE_SOURCE`, `SPARKLINE_Y`, `SPARKLINE_LABEL` |

The chart panels (`timeseries`, `bar`, `sparkline`) don't need a chart
library — pure inline SVG, matching the convention in
`/home/will/web/tekton/index.html`. Recommend them for any time-varying
metric. Status panels are fine for now-state; charts are how you see trend.

## Common variables

| Variable | Meaning | Example |
|---|---|---|
| `PROJECT_NAME` | Used in `<title>`, headings, and umbrella URL | `wovenflow` |
| `INTERVAL_S` | Seconds between data.json writes | `5` |
| `PORT` | Port for standalone HTTP server (`--serve`) | `8082` |
| `UMBRELLA_PATH` | Absolute path to umbrella web root, empty for standalone | `/home/will/web` |
| `PANELS_LIST` | Comma-separated list (for the file header) | `tests,git,commits,specs` |

## Substitution model

Per the parent `templates/README.md`:
- `{{VAR}}` is replaced with the user's answer.
- `{{IF VAR}}…{{ENDIF}}` blocks are kept if `VAR` is non-empty, dropped otherwise.

For panels, the convention is `PANEL_<NAME>` (e.g. `PANEL_TESTS`,
`PANEL_TIMESERIES`). The wizard sets the chosen panels' flags to a
non-empty string (e.g., `"1"`); unset panels are stripped.

## Serving modes

The wizard asks where to serve from:

1. **Standalone HTTP server.** `node web/serve.mjs --serve` listens on
   `PORT`. Good for projects without an umbrella site.
2. **Umbrella mode.** The serve loop just writes `data.json`; you point
   your existing umbrella server (a `python3 -m http.server` rooted at the
   umbrella, or nginx, or whatever) at `<umbrella>/<project>/`. The
   wizard sets `UMBRELLA_PATH` so the comments + `<link>` to
   `/static/site.css` come along for the ride. Recommended when you
   already manage a fawkes-style multi-project setup.
3. **Both.** The output works as a standalone server and is
   umbrella-compatible (the umbrella stylesheet link is included; if it
   404s, the page falls back to the local styles cleanly).

## Adding a new panel later

1. Pick a panel name (e.g. `latency`).
2. Add a probe function to `serve.mjs` that returns the snapshot for that
   panel. Use the existing panels in `panels/*.mjs.tmpl` as reference.
3. Wire it into the snapshot:
   ```js
   try { snap.panels.latency = probeLatency(); } catch (e) { snap.panels.latency = { error: e.message }; }
   ```
4. Add a render function in `index.html` (`renderLatencyPanel`) and
   include it in `render(snapshot)`. Use `panelWrap(title, body)` and
   the chart helpers (`lineChartSvg`, `barChartSvg`, `sparklineSvg`) as
   needed.

For a one-off project-specific panel, edit `web/serve.mjs` and
`web/index.html` directly. To contribute the panel back to wovenflow:

1. Create `panels/<name>.mjs.tmpl` (probe reference + docs).
2. Add `{{IF PANEL_<NAME>}}…{{ENDIF}}` blocks to `serve.mjs.tmpl` and
   `index.html.tmpl`.
3. Add the panel to the wizard's menu in `setup/SKILL.md` Step 4.X.
4. Document the variables in this file's table.

## Caveats

- **Shell command panel runs untrusted-from-the-perspective-of-the-system
  commands.** `command` and `tests` panels invoke `sh -c "<user-supplied
  command>"`. Don't paste a command you wouldn't run yourself, and don't
  point the dashboard at a repo you don't trust. The dashboard runs as
  your user with all your privileges.
- **Cache TTLs matter.** Tests + custom command panels cache their last
  result; if your test suite takes 30s and the dashboard ticks every 5s,
  you'd burn the system on test runs. Pick a TTL ≥ 2× the command's
  runtime.
- **Subagents panel reads from `~/.claude/projects/<slug>/`.** The slug
  derivation is "absolute repo path with `/` → `-`, leading `-`". If
  Claude Code changes that convention, the panel goes blind until the
  probe is updated.
- **Bench panel is wovenflow-specific.** Skip it unless your project
  actually has `bench/results/`.
- **Umbrella vs standalone is your call.** Umbrella keeps you within an
  existing top-nav and styling; standalone is one less moving part. You
  can always change later by re-running the wizard.
