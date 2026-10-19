# Ticket 12 — P48 material (for ticket 14's human readability judgment)

This directory holds the actual UI frames the real OMP host was told to render during ticket 12's
probes. It records content and layout; it does not judge readability.

Source runs (harness `@oh-my-pi/pi-coding-agent@18.5.0`, isolated exact install; `18.5.0-viewed-session`
for the projection and model-cost runs; Bun 1.4.2, Windows 10.0.26200 x64):

- `../probes/out/connect-bot/` — probe 1, unpatched install, connect-bot's own entrypoint.
- `../probes/out/codebase-tools-viewed/` — probe 2, viewed-session patch, codebase-tools' entrypoint.
- `../probes/out/model-cost-presentation/` — probe 3, viewed-session patch, model-cost's entrypoint.

## What each file is

| File | Actual host output |
| --- | --- |
| `connect-bot-marker-area.txt` | Every `setWidget` call for the framework's `semantic-extensions` key, in order, with placement `aboveEditor`. The line is `◐ connectBot`; cleared entries are the empty rendering. |
| `connect-bot-notices.txt` | The `notify` frames at their severities: arm accepted, unknown argument, off, re-arm. |
| `codebase-tools-viewed-marker-area.txt` | The same area across two displayed sessions: line, cleared for the new session, line, line after switching back, cleared after disabling A, line when B is displayed again. |
| `model-cost-widget.txt` | Every `setWidget` call for `z-model-cost`; the extension passes no placement, so the host default applies. |
| `model-cost-notices.txt` | The `/budget` help notice and the `/budget detail` action notice. |
| `model-cost-presentation-report.json` | The probe's checks and the final brief/detail line arrays. |

## Observed screen sequences (content and layout only)

connect-bot, in order:

```text
(area cleared)
◐ connectBot
[info] 已接入 omp-bot 面板（当前 1 个在线会话）

◐ connectBot
[error] 未知参数「bogus」；用法：/connect-bot（接入 omp-bot 面板）或 /connect-bot off（断开）。

(area cleared)
[info] 已断开 omp-bot 面板
◐ connectBot
```

codebase-tools viewed projection: A enabled → `◈ codeBaseTools`; new displayed session → cleared;
B enabled → `◈ codeBaseTools`; back to A → `◈ codeBaseTools`; A disabled → cleared; back to B →
`◈ codeBaseTools`.

model-cost brief (three lines, actual):

```text
🏖️  [░░░░░░░░░░░░░░░░░░░░   0% (2,000/450.0K)]  Effort: high  💰 Balance: ¥110.00  ⏳ Accrued: ¥0.0000
Total:  Cache: 50%  ¥Cache/In/Out：0:20:80  Cost: ¥0.0050  Span: 0:00:00
Round:  Cache: 50%  ¥Cache/In/Out：0:20:80  Cost: ¥0.0050
```

model-cost detail (four lines, actual):

```text
🏖️  [░░░░░░░░░░░░░░░░░░░░   0% (2,000/450.0K)]  Effort: high  💰 Balance: ¥110.00  ⏳ Accrued: ¥0.0050 [▏]
Total:  Cache: 50%  ¥Cache/In/Out：0:20:80  Cost:   ¥0.01  Span: 0:00:00
main
│  deepseek / deepseek-flash  Cache: 50%  ¥Cache/In/Out：0:20:80  Cost: ¥0.01
```

## Comparison with the 01 baseline

`.scratch/framework-capability-cutover/evidence/01-p48-baseline/` recorded the same channels for
the pre-cutover OMP runs (marker-area `setWidget` lines, notify frames, model-cost widget frames)
at the same supported version. Its width-bearing captures are the pi TUI runs at 120 and 60
columns. These OMP runs are RPC sessions: their frames carry no terminal width, so no
width-specific OMP comparison exists. The final readability judgment and any width discussion
belong to ticket 14.
