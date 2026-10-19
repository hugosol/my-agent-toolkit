# Ticket 01 — P48 comparable baseline (before the State cutover edits)

Captured before any source edit of ticket 01. This is machine-observed material for the
final P48 human readability judgment (ticket 14): it records what the existing entries actually
displayed/notified, with versions and reproduction. It does **not** judge readability.

## Source and environment

| Item | Value |
| --- | --- |
| Source revision | `0d61913c703bd44793cbdab08479ab8121b38a90` (`hyper/framework-capability-cutover/01-state-interface-cutover-094c18-e1e098c5b064`) |
| Tree during capture | clean except this evidence directory |
| `bun.lock` sha256 | `e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f` |
| OS | Windows 10.0.26200, x64 |
| Bun | 1.4.2 |
| Node | v24.18.0 |
| pi | 1.3.0, `D:\nvm4w\nodejs\pi` shim → `node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js` |
| OMP under dock | isolated exact `@oh-my-pi/pi-coding-agent@18.5.0`, prefix `.cache/omp-baseline/18.5.0` (gitignored; linked from the repository's recorded baseline cache) |
| Host patches | `model-cost-modes` used `host-patches/omp-18.5.0-viewed-session`; other OMP runs listed below used the unpatched isolated 18.5.0. The `patch.diff` files were read from LF-normalized checkout bytes (this worktree is `core.autocrlf=true`; no tracked content changed). |
| Terminal widths | pi TUI capture: 120 and 60 columns, 40 rows. OMP dock runs drive RPC sessions and read the host's `setWidget` / notify frames; no physical terminal width applies. |
| Configuration | pi runs: isolated agent state, session directory, working directory and user home per run; provider redirected to the dock's local capture endpoint; `pi-subagents@0.78.0` pinned from this repository. OMP runs: isolated agent state/run roots; provider fixture redirected to the local capture endpoint; no formal install or global config touched. |

## Runs and observed output

Logs are beside this file. Exit statuses are as the run reported them.

| Entry / observation | Command | Exit | Observed |
| --- | --- | --- | --- |
| OMP real entries, one session: marker area lines, operator notices, State isolation | `bun test tests/harness-dock/consumer-regression.test.ts` | 0 | 3 pass / 0 fail, 61 assertions. The area opened cleared, codebase-tools' own line rendered alone, connect-bot's line joined in extension-id order, `off` removed only its own line, both lines cleared after the last disable. Notices observed: connect-bot refusal (`error`) and acceptance (`info`) messages on the operator channel. |
| OMP model-cost headless: stderr severities, no widget | `bun test tests/harness-dock/model-cost-headless.test.ts` | 0 | 7 pass / 0 fail, 66 assertions. Error and warning notices (refused balance, unusable baseline) reached stderr once each at their own severity; no widget was created; stdout stayed protocol-only. |
| OMP model-cost display on the real patched host | `bun test tests/harness-dock/model-cost-modes.test.ts` | 0 | 6 pass / 0 fail, 67 assertions. Host `setWidget` frames carried the hidden/no-widget case, token-only budget, Codex allowance and reference/ratio, dual channels across a model switch, the DeepSeek budget and accounted cost, and the balance line. |
| pi model-cost real TUI display, brief and detail | `bun scripts/pi-tui-acceptance.ts --widths 120,60 --rows 40 --out .scratch/framework-capability-cutover/evidence/01-p48-baseline/pi-tui` | 1 (one check) | 34 ok / 1 failed. The only failure is the run's fixed expectation `pi 1.2.0`; the CLI reports `1.3.0`. All content/layout checks passed at both widths: account row (Effort/Balance/Accrued), Total row (Cache/ratio/Cost/Span), per-session amounts and runtimes, unknown-start markers, narrowing keeps every amount and runtime, ellipsis for cut names/snapshots, one depth column layout, and identical Total line between brief and detail. Frames, ANSI recordings, PNG renderings and `report.json` are in `pi-tui/`. |
| pi codebase-tools real entry: marker and notices | `bun scripts/pi-codebase-tools-smoke.ts` | 1 (environment) | 34 checks passed before the run stopped on the known Node 24.18.0 Windows libuv assertion (`UV_HANDLE_CLOSING`, exit 9) while exiting a session. The marker-area observations in the first phase passed: area published without the line, enabling showed the line, disabling cleared it. This is a recorded environment limitation, not a display regression. |
| pi codebase-tools under Bun runtime (attempt) | `PI_NODE=bun bun scripts/pi-codebase-tools-smoke.ts` | 1 | Stopped on a request-shape expectation: under Bun the harness serialized the injected custom message as a `user` role, so the smoke's role-based "one injected message" check saw none. Recorded for completeness; the verified pi runtime remains Node. |

## What this baseline supports, and what it does not

- Supports: a before/after comparison of the same entry-visible lines, severities and model-cost
  row content on this machine, at the recorded versions, for the eventual P48 human judgment.
- Does not support: a readability judgment, a support-version claim (pi here is 1.3.0, not the
  acceptance's 1.2.0), pi Node 24 behavior beyond the recorded abort, or any behavior outside these
  commands. The OMP runs are the recorded 18.5.0 isolated install, not the global 18.12.2.
- Rerun after the cutover with the same commands and environment; compare the frame/notice content.
  The P48 human confirmation remains unverified until the user gives it.

## Reproduction

```powershell
bun install --frozen-lockfile
bun test tests/harness-dock/consumer-regression.test.ts
bun test tests/harness-dock/model-cost-headless.test.ts
bun test tests/harness-dock/model-cost-modes.test.ts
bun scripts/pi-tui-acceptance.ts --widths 120,60 --rows 40 --out .scratch/framework-capability-cutover/evidence/01-p48-baseline/pi-tui
bun scripts/pi-codebase-tools-smoke.ts
```
