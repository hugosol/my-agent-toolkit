# Ticket 14 — P48 readability handoff (prepared, not judged)

This directory prepares the evidence for the one human judgement the approved contract leaves to
the user: whether the **existing terminal readability** of the Marker area, operator notices and
model-cost display shows no obvious regression. It does not judge that result, does not redesign
the display, and does not count as a P48 pass.

## What the human is asked to compare

**Question (the only human decision requested by ticket 14):** comparing the pre-cutover material
under `../../01-p48-baseline/` with the current material under
`../../12-omp-real-entry-regression/p48/`, `../../13-pi-real-entry-regression/p48/` and this
directory's `warning/`, is the existing terminal readability (Marker line, notice lines and
model-cost brief/detail layout at the recorded widths) **without obvious regression**?

The comparison is about the same business content and the same channels. It is **not** a request to
redesign the display, to accept new harness versions, or to certify provider/terminal support. The
loader, field correctness, lifecycle and error semantics are the agent's responsibility and are
covered by the runs listed below.

## Source material

| Side | Material | Source state | Harness / runtime |
| --- | --- | --- | --- |
| Before (baseline) | `../../01-p48-baseline/README.md`; pi TUI frames, ANSI recordings, PNGs and `report.json` under `../../01-p48-baseline/pi-tui/` | commit `0d61913c703bd44793cbdab08479ab8121b38a90` (ticket 01 branch, before the first cutover edit) | pi 1.3.0 real TUI, Node 24.18.0, Bun 1.4.2; OMP 18.5.0 isolated install for the RPC runs (marker/notice/widget frames, no TUI) |
| After (current, OMP) | `../../12-omp-real-entry-regression/p48/README.md` and the frame files beside it | merged ticket 12 tree (`a3166c5` + evidence only); current production tree unchanged since | OMP 18.5.0 isolated exact install; viewed-session patch for the projection/model-cost runs; no OMP TUI was run, so no terminal width applies |
| After (current, pi) | `../../13-pi-real-entry-regression/p48/README.md` and the frame files/recordings/PNGs beside it | merged ticket 13 tree (`8aa4d15` + its changes); current HEAD is that tree | pi 1.3.0 real TUI via Node 22.19.0, Bun 1.4.2; widths 120 and 60 columns, 40 rows |

Configuration and isolation are recorded in those READMEs: every run used an isolated agent state,
session directory, working directory and (where applicable) user home; the provider was the
repository's local capture endpoint with a fixture credential; the formal loading configuration,
global installs and any running agent were untouched.

## Comparison by channel

### Marker area

| Entry | Baseline | Current | Result |
| --- | --- | --- | --- |
| OMP / codebase-tools + connect-bot coexistence | `01` README: area opened cleared; `◈ codeBaseTools` alone; `◐ connectBot` joined in extension-id order; `off` removed only its own line; both cleared after the last disable | `12/p48/connect-bot-marker-area.txt` and `codebase-tools-viewed-marker-area.txt`: same two lines, same `aboveEditor` placement, same clear transitions; projection across displayed sessions preserved | Same content and placement; OMP has no terminal width |
| pi / codebase-tools | `01` recorded the marker through RPC `setWidget` (its pi codebase-tools smoke passed the first-phase marker checks, then stopped later on the recorded Node 24 libuv assertion); no pi TUI marker capture existed in the baseline | `13/p48/codebase-tools-marker.txt` and `codebase-tools-marker/`: real TUI at 120×40 and 60×40; line `◈ codeBaseTools` on its own line below the enable notice and above the separator rules; absent when off; 60 columns still fits it whole | Current material is a real TUI; the declared text and transitions match the baseline's recorded text |

### Notifications (info / warning / error)

| Level | Baseline | Current | Result |
| --- | --- | --- | --- |
| info | OMP: connect-bot acceptance and disconnect notices; model-cost `/budget detail` help | `12/p48/connect-bot-notices.txt` and `model-cost-notices.txt` carry the same notices as `[info]`; pi TUI carries the model-cost detail notice at both widths (`13/p48/model-cost-notices.txt`) | Content and severity preserved |
| error | OMP: connect-bot refusal for an unknown argument (`[error]`) | same frame, same text and level | Content and severity preserved |
| warning | No warning frame was captured in the 01 baseline either; the level was recorded only as tested through the adapter/headless path. | [`warning/notices.txt`](warning/notices.txt) and [`warning/report.json`](warning/report.json): a real OMP 18.5.0 run of the production model-cost entry with a non-DeepSeek provider; `/budget holiday` produced `[warning] /budget holiday 仅适用于当前 provider 为 DeepSeek 的入口；本次入口的 provider 「openai」，未执行。` The run made no model request and its 7 checks passed. | Current level and text are material. The baseline has no visual counterpart, so this is a content/level comparison, not a rendering comparison; the OMP RPC frame carries no terminal width or styling |

### model-cost display

| Form / width | Baseline | Current | Result |
| --- | --- | --- | --- |
| pi brief, 120 columns | 3 lines (account row, `Total:`, `Round:`) with `Balance: ¥12.34`, `Accrued: ¥0.07`, `Cost: ¥0.07`, `Span: 0:05:00` | identical after normalizing the temp run-root path and CRLF; no line changed | Line-for-line identical |
| pi detail, 120 columns | account row, `Total:`, `主会话`, 5 tree rows with costs/runtimes/levels | identical after the same normalization | Line-for-line identical |
| pi detail, 60 columns | account row wrapped to 2 lines, `Total:` wrapped to 2 lines, tree rows with the display's own ellipsis; every amount/runtime/level kept | identical after the same normalization | Line-for-line identical |
| pi brief, 60 columns | as above, no leading separator rule above the header | identical except the host's extra leading separator rule produced by the extra "no project session" warning; no business field moved | Same fields; one host chrome line differs |
| OMP brief/detail | 01 README records the same `setWidget` channel, brief three-line and detail four-line layouts, balance line and hidden/no-widget case; the raw baseline frames were not retained | `12/p48/model-cost-widget.txt` holds the actual brief/detail frames (`Cost: ¥0.0050`, `Cost:   ¥0.01`, tree row), and the presentation report checks the line arrays | Same content and layout observable; no raw baseline frames exist for a byte-level diff (limit) |

The pi normalized comparison is reproducible with the command in "Reproduction" and is saved as
[`pi-tui-normalized-diff.txt`](pi-tui-normalized-diff.txt): `brief@120`, `detail@120` and
`detail@60` have no diff; `brief@60` differs by exactly one leading `────` separator line.

## Automated field/layout checks already run

| Check | Result | What it covers |
| --- | --- | --- |
| `01/pi-tui/report.json` | 34 of 35 observations held; the sole failure is the script's fixed `pi 1.2.0` version assertion (host reports 1.3.0) | every width × form captured; account row fields; Total line; tree depth/columns; amounts/runtimes kept under narrowing; brief/detail Total line identity |
| `13/p48/model-cost-tui/report.json` | 34 of 35 held; same sole version failure | same checks on the current tree |
| `13/p48/codebase-tools-marker/report.json` | 12 of 12 checks passed | marker absent when off, present after enable, absent after disable; notice text at 120 and 60 |
| `12` probes (`connect-bot`, `codebase-tools-viewed`, `model-cost-presentation`) | 26/26, 15/15 and 29/29 checks | actual marker/notify/widget frames, Viewed-session projection, action presentation and saved document |
| `tests/framework/feedback-harness.test.ts`, `feedback-pi-harness.test.ts` | green (part of the final full test) | info/warning/error through each adapter's actual UI notification and headless stderr; notices absent from model context |
| `tests/harness-dock/period-switch.test.ts` | green (part of the final full test) | warning-level notices of the real OMP entry's period switch |
| `probes/warning-notice-smoke.ts` (temporary evidence probe, run by ticket 14) | exit 0; 7/7 checks | the actual real-OMP warning notice of the production model-cost entry (`/budget holiday`, non-DeepSeek provider), level `warning`, no model request; output under `p48/warning/` |
| `bun run smoke:model-cost-detail-layout` (existing script, run by ticket 14) | exit 0; 16 PASS / 0 FAIL, 0 checks failed, at 160, 120, 100, 80 and 60 columns | line-level column layout of the detail tree: no line overruns its width, the theme adds no column, rows of one depth agree on field columns, and a resize redraws the same width identically. The run's stdout was not a terminal (reported width unknown), so this is the printed line measurement, not the Windows console cell measurement; the real-TUI captures above supply the terminal-device half |

No permanent test was added for layout, path or wiring by this ticket. The checks above are content
and field observations, not a readability verdict.

## Reproduction

The pi comparison (run from the repository root; the two directories are the committed artifacts):

```powershell
$base = ".scratch/framework-capability-cutover/evidence/01-p48-baseline/pi-tui"
$cur  = ".scratch/framework-capability-cutover/evidence/13-pi-real-entry-regression/p48/model-cost-tui"
foreach ($w in 120, 60) {
  foreach ($form in "brief", "detail") {
    $b = Get-Content "$base/screen-$form-$w.txt" | Where-Object { $_ -notmatch '^Warning: No project session found' }
    $c = Get-Content "$cur/screen-$form-$w.txt" | Where-Object { $_ -notmatch '^Warning: No project session found' }
    # normalize CRLF and the temporary run-root path before comparing
    Compare-Object ($b -replace 'C:\\Users\\[^\\]+\\AppData\\Local\\Temp\\omp-dock-tui-acceptance-[A-Za-z0-9]+\\work', '<RUNROOT>') `
                   ($c -replace 'C:\\Users\\[^\\]+\\AppData\\Local\\Temp\\omp-dock-tui-acceptance-[A-Za-z0-9]+\\work', '<RUNROOT>')
  }
}
```

To regenerate the current captures:

```powershell
$env:PI_NODE = "D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe"
$cli = "D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js"
bun scripts/pi-tui-acceptance.ts --pi $cli --widths 120,60 --rows 40 --out .scratch/framework-capability-cutover/evidence/13-pi-real-entry-regression/p48/model-cost-tui
bun .scratch/framework-capability-cutover/evidence/13-pi-real-entry-regression/probes/pi-tui-marker.ts --pi $cli --widths 120,60 --rows 40
```

The OMP material is regenerated by the three probes named in
`../../12-omp-real-entry-regression/README.md`; the current runs used the isolated 18.5.0 install and
the local capture endpoint, not a real provider or the user's panel. The ticket-14 warning frame is
regenerated with:

```powershell
bun .scratch/framework-capability-cutover/evidence/14-final-integration-handoff/probes/warning-notice-smoke.ts
```

## What is not covered

- **P48 remains unverified until the user confirms it.** No agent judgement in this directory
  substitutes for that confirmation.
- No OMP TUI was run, so no OMP terminal width or physical-terminal readability is claimed; the OMP
  material is RPC frame text.
- The pi material is from pi 1.3.0 (the installed host) while the acceptance script's fixed
  expectation is 1.2.0; that version assertion is the one failed check in both the baseline and
  current captures. No version support is claimed.
- No real provider credential, paid request or remote account was used; the provider endpoint is
  the repository's local capture server. The baseline and current runs are not provider acceptance.
- The 60-column brief's single extra separator line is host chrome produced by the extra "no
  project session" warning; it is not a business field. The human may still weigh it in the
  readability judgement.
- Warning now has a current real-OMP RPC frame (`warning/`) but no pi TUI frame, and the baseline has
  no warning frame at all. Its level and text are covered; its terminal styling is not part of the
  visual comparison.
