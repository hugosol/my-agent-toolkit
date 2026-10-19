# Ticket 13 — P48 material for the pi entries (prepared, not judged)

This directory holds the current real-terminal material ticket 14 compares against the
[pre-cutover baseline](../01-p48-baseline/README.md). It is **not** a readability verdict: the
human judgement stays with ticket 14, and P48 is unverified until the user confirms it.

## What is here

| Artifact | What it records | Widths / form |
| --- | --- | --- |
| [`codebase-tools-marker.txt`](codebase-tools-marker.txt) | the marker line and the enable/disable notices of `codebase-tools` on the real pi TUI | 120 and 60 columns |
| [`codebase-tools-marker/`](codebase-tools-marker/) | every raw frame (`screen-*.txt`), the process's own bytes (`recording-*.ansi`) and the probe's 12 checks (`report.json`) | 120 and 60 columns |
| [`model-cost-widget.txt`](model-cost-widget.txt) | the account row, Total row and detail tree of `model-cost`, brief and detail | 120 and 60 columns |
| [`model-cost-notices.txt`](model-cost-notices.txt) | the `/budget detail` info notice as the terminal wraps it | 120 and 60 columns |
| [`model-cost-tui/`](model-cost-tui/) | the acceptance frames (`screen-*.txt`), the process's bytes (`recording-*.ansi`), PNG renderings and the 34/35 report (`report.json`) | 120 and 60 columns |

## Source and conditions

- Real pi terminal UI v1.3.0 (`D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`),
  Node 22.19.0 (`PI_NODE`), Bun 1.4.2, Windows 10.0.26200 x64.
- Isolated agent state, session directory, working directory and user home per run; the provider
  endpoint is the repository's local capture server with a dummy key. No formal loading
  configuration, default agent state or credential was touched.
- `codebase-tools`: production `entrypoints/pi/codebase-tools.ts`, loaded with
  `--no-extensions -e`, no subagent provider. Frames were taken before the command, at the enable
  notice/marker and after the disable notice.
- `model-cost`: production `entrypoints/pi/model-cost.ts` plus the pinned `pi-subagents@0.78.0`,
  the fixed acceptance scenario from `scripts/support/tui-acceptance-fixture.ts`.

## Content checked here

The agent checked the actual frame text before handing it over: the marker text is exactly
`◈ codeBaseTools` and is absent when off; the two notices are exactly `codeBaseTools enabled` and
`codeBaseTools disabled`; the model-cost account/Total/tree fields match the seeded scenario
(`Balance: ¥12.34`, `Accrued: ¥0.07`, `Cost: ¥0.07`, `Span: 0:05:00`), and every per-session
amount and runtime marker survives narrowing to 60 columns. Against the 01 baseline, the
model-cost detail frames and the 120-column brief are line-for-line identical after normalizing
CRLF, the host's extra warning and the temp run-root path.

## What this does not decide

Whether the format, spacing, narrow-width behaviour and overall presentation read well. That is
ticket 14's human confirmation. The model-cost acceptance script's single failing check is its
fixed pi-version assertion (expects 1.2.0; this host reports 1.3.0); all 34 content/layout checks
passed, and that version failure is not a readability result.

For codebase-tools, the 01 baseline recorded the marker/notices through the host's `setWidget` and
`notify` RPC frames, not a real TUI. This ticket supplies the missing real-terminal frames at 120
and 60 columns; the declared marker text (`◈ codeBaseTools`) and the two notice texts are the same
ones the baseline recorded.
