# Ticket 13 — pi real-entry regression: verification evidence

This record covers ticket 13's own partition only: the two pi discovery entries (P46's pi half),
the pi half of P47 (real Session save/end, subagent observation/commit and close-out), and this
ticket's P52 handoff. It does not claim the OMP entries (ticket 12), the framework partition
(ticket 11), or the P48 readability judgement (ticket 14, human).

## Source and environment

| Item | Value |
| --- | --- |
| Branch | `hyper/framework-capability-cutover/13-pi-real-entry-regression-fd585c-e1e098c5b064` |
| Base revision | `8aa4d15a4c46648ea17a04b557417eded5ba3f27` (the merged ticket 12 work) |
| Source changes | `scripts/pi-terminal-round-smoke.ts` and `scripts/pi-session-accounting.ts`, `framework/docs/harness-support.md` (the current-run record), plus this evidence directory. No production, framework, adapter, extension or entrypoint source changed. |
| Dependencies | `bun install --frozen-lockfile`, exit 0, 13 packages; `bun.lock` raw sha256 `e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f` (unchanged from the recorded baseline) |
| OS | Windows 10.0.26200, x64 |
| Runtimes | Bun 1.4.2 (`744846f84`); Node 22.19.0 (`D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe`, installed with nvm without switching the default) used through `PI_NODE` for every pi run; Node 24.18.0 was tried first and hit the recorded Windows libuv assertion (below). TypeScript 7.0.2. |
| pi harness | installed `@earendil-works/pi-coding-agent@1.3.0`, `D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`; the smoke's own expectations were written for 1.2.0, so the installed host is a candidate observation, never a support certification |
| pi patches | **none.** The pi path uses no host patch; the OMP patch artifacts are not involved. |
| Subagent provider | `pi-subagents@0.78.0`, this repository's pinned dependency (`node_modules/pi-subagents/index.js`) |
| Provider endpoint | the dock's local OpenAI-compatible capture server with a dummy key; no real credential, paid call, remote provider account or network dependency is used |
| Isolation | every run gets its own temp agent state, session directory, working directory and (where applicable) user home; the formal loading configuration, default agent state and any running agent are untouched |
| Fixtures / support | `tests/harness-dock/capture-server.ts` (local endpoint), `tests/harness-dock/pi-session.ts` (RPC driver), `tests/harness-dock/run-root.ts`, `tests/harness-dock/env.ts`; the model-cost entrypoint fixture `tests/harness-dock/fixtures/pi-model-cost/entrypoint.ts` with `pi-session-facts`, `pi-background-rounds` and `pi-terminal-rounds` probes; `scripts/support/tui-acceptance-fixture.ts` and `scripts/support/terminal-screen.ts` for the real-TUI captures. No fixture changed during the runs. |

Every run loads the production entrypoint explicitly (`--no-extensions -e entrypoints/pi/<extension>.ts
--no-mcp`, RPC or real TUI), so the loaded extension set is exactly the one named.

## What this ticket delivered

The deliverable is the current-run evidence for the pi partition plus two corrections to the
existing pi smokes and two temporary actual-path probes:

| Item | Gap it closes | Change |
| --- | --- | --- |
| `scripts/pi-terminal-round-smoke.ts` | the late-arrival save check compared the whole shared document, so the still-running child's own process adding its own record made the check fail even though the parent's record was byte-identical. The check now holds the parent session's own record fixed. `--expect-pi-version` (default remains 1.2.0) states the installed 1.3.0 observation explicitly. | test/evidence only |
| `scripts/pi-session-accounting.ts` | the resumed-tree check took the first widget frame carrying `Total:`, which can be the entry's empty reading before its initialization/store read settles; it now waits for the frame that really draws the child row. `--expect-pi-version` added with the same default. | test/evidence only |
| `probes/pi-codebase-tools-subagent.ts` | the existing codebase-tools smoke loads no subagent provider, so the assembly's stated `childEntry` and its `follow` inheritance were never exercised on a real pi child. The probe loads the pinned provider beside the production entrypoint, drives a real delegation with the owner off and on, and reads the child's own request and session journal. | temporary evidence probe |
| `probes/pi-tui-marker.ts` | the 01 baseline and the RPC smoke observed the marker/notices only through `setWidget`/`notify` frames; the contract refuses that as a substitute for the real TUI. The probe drives the real pi terminal UI at 120 and 60 columns, runs `/codebase-tools`, and reads the screen back cell by cell. | temporary evidence probe |

The probes are evidence scripts, not permanent tests: they live under this evidence directory and
are not part of any `tests/` partition. Their reports are under `probes/out/` and
`p48/codebase-tools-marker/`.

No production source changed, so there was no product mutation to inject and restore before the
final regression. The subagent probe carries its own negative control: a child that ignored the
owner's value would fail the enabled child's contribution check, and a child that always read the
enabled value would fail the off child's empty-journal check; a child that wrote State would fail
the zero-State-write check. The two smoke corrections were themselves observed failing before the
correction and passing after it.

## Commands and results

Logs were kept under the gitignored `.cache/ticket13-logs/` during the run. Every command below
ran against the source state named above with the tested tree otherwise unchanged.

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 13 packages; lockfile unchanged |
| `bun run typecheck` | 0 | no diagnostics |
| `PI_NODE=<node22> bun scripts/pi-codebase-tools-smoke.ts --pi <cli>` | 0 | **52 checks passed, none failed**, 4 isolated runs |
| `PI_NODE=<node22> bun scripts/pi-model-cost-smoke.ts --pi <cli>` | 0 | **100 checks passed, none failed**, 28 isolated runs |
| `PI_NODE=<node22> bun scripts/pi-subagent-smoke.ts --pi <cli> --expect-pi-version 1.3.0` | 0 | **30 observations held** (no-provider, refused child, foreground and background delegations) |
| `PI_NODE=<node22> bun scripts/pi-background-round-smoke.ts --pi <cli>` | 0 | **15 observations held** |
| `PI_NODE=<node22> bun scripts/pi-terminal-round-smoke.ts --pi <cli> --expect-pi-version 1.3.0` | 0 | **17 observations held** after the correction |
| `PI_NODE=<node22> bun scripts/pi-close-out-smoke.ts --pi <cli>` | 0 | **11 observations held, 0 required facts missing** |
| `PI_NODE=<node22> bun scripts/pi-session-accounting.ts --pi <cli> --expect-pi-version 1.3.0` | 0 | **18 observations held, 0 required facts missing** after the correction |
| `PI_NODE=<node22> bun .scratch/.../probes/pi-codebase-tools-subagent.ts --pi <cli>` | 0 | **14 checks, all passed** |
| `PI_NODE=<node22> bun .scratch/.../probes/pi-tui-marker.ts --pi <cli> --widths 120,60 --rows 40` | 0 | **12 checks, 12 passed** |
| `PI_NODE=<node22> bun scripts/pi-tui-acceptance.ts --pi <cli> --widths 120,60 --rows 40 --out .scratch/.../p48/model-cost-tui` | 1 | **34 ok / 1 failed**; the sole failure is the script's fixed version assertion (`pi reported 1.3.0, expected 1.2.0`). All content/layout checks passed at both widths. |

The first codebase-tools attempt used the default Node 24.18.0 and stopped after 34 checks on the
known Windows libuv assertion (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`,
`src\win\async.c`, child exit 9) while a replaced session exited. The same tree under Node 22.19.0
completed all 52 checks; the failure is recorded as an environment limitation, not a product pass
on Node 24. The smoke's usage text already names Node 22.19.0 as the verified Windows runtime.

## Promise coverage (ticket partition only)

| Promise | Ticket partition | Evidence |
| --- | --- | --- |
| P46 | pi / codebase-tools: loader, toggle, restore, Prompt/History, Feedback/Marker, applicable subagent inheritance | `pi-codebase-tools-smoke` (52 checks: default off, toggle on/off, init/reminder, request/journal append-only, new session, resume in a new process, `switch_session`); `probes/pi-codebase-tools-subagent` (14 checks: off child silent, on child inherits the init, no child State write, owner State isolated); `probes/pi-tui-marker` and `p48/codebase-tools-marker/` for the real TUI marker/notices |
| P46 | pi / model-cost: loader, actions, initialization, provider/catalog, Session/save, applicable subagent paths | `pi-model-cost-smoke` (100 checks, 28 runs: entry loading, init prefetch before the first request, per-Round save, second process continuation, `/budget` actions, no-subagent detail notice, `storageDir` rules, illegal config refusal, Codex allowance windows, unmeasured/unpriced requests, clear/holiday archive); `pi-subagent-smoke` (child loading, child record, parent link); `pi-background-round-smoke`; `pi-terminal-round-smoke`; `pi-close-out-smoke` |
| P47 | pi Session save, end, subagent observation/commit, single dispatch, scope and close-out | `pi-subagent-smoke` (child registration before its first Round, owner observation source, child's own save under its own identity); `pi-session-accounting` (once-only accounting, direct-parent rollup, tree from the saved document); `pi-background-round` (one Round across waits/wakes, save at the boundary); `pi-terminal-round` (interrupted Round, late append opens nothing, resume reads the saved record); `pi-close-out` (bounded disposal, locked document deadline, notices, document untouched) |
| P52 | Ticket 13 handoff: attributable commands, source/fixtures, dependencies/lockfile, harness version/patch, environment and pass/fail/unverified scope | This README, the probe `report.json` files, and `p48/README.md` |

The OMP halves of P46/P47 are ticket 12's. The framework half of P47 and the global
P01/P05/P49/P51 partitions are ticket 11's. P48 remains human.

## Acceptance mapping

| Ticket acceptance | Evidence (actual run) | Result |
| --- | --- | --- |
| Load the two pi entries through their existing discovery entrypoints with an isolated explicit entry set, frozen install and existing patch conditions; no connect-bot/pi, no formal loading-config change, no version/execution-mode expansion | Every command above uses `--no-extensions -e entrypoints/pi/{codebase-tools,model-cost}.ts`; `bun install --frozen-lockfile` and the unchanged lockfile hash; no pi patch exists or was added. The smoke `--expect-pi-version` option states the installed 1.3.0 observation while leaving the default 1.2.0 expectation untouched. No connect-bot or new harness entry was added. | Pass for the observed 1.3.0 host; no support certification |
| codebase-tools: toggle, restore, Prompt/History preservation, Feedback/Marker and applicable subagent inheritance, checked against real requests and session records | `pi-codebase-tools-smoke` 52/0 (real captured requests and session JSONL: default-off journal, toggle values, init/reminder identities, append-only history, prefix preservation, new/resume/switch sessions); `pi-codebase-tools-subagent` 14/14 (real child request and child JSONL); real TUI marker/notices | Pass |
| model-cost: actions, initialization, provider/catalog, Session/save, applicable subagent paths; missing price and credentials keep their existing business meaning | `pi-model-cost-smoke` 100/0, including the no-price/allowance-reference and unmeasured-request phases, the credential-less provider phase, the initialization-before-first-request phase, the per-Round save and second-process continuation; `pi-subagent`/`background-round`/`terminal-round`/`close-out` for the applicable child paths | Pass |
| pi Session save, end, subagent observation/commit and close-out, observing actual files/session content; read-only observation, isolation, recordCommit, single dispatch, scope | `pi-subagent-smoke` (30), `pi-session-accounting` (18), `pi-background-round` (15), `pi-terminal-round` (17), `pi-close-out` (11). These read the session JSONL, the consumption document, the provider's launch artifacts and the real notices; no historical no-subagent record is substituted | Pass |
| Reuse the existing pi smokes and check the actual scene gaps against pi-subagent, background-round, terminal-round and close-out | All five named smokes plus session-accounting ran. Two real gaps were found and closed: the whole-document late-arrival comparison and the early empty-widget capture. The missing codebase-tools subagent scene was closed by a probe. | Pass, with the two corrections recorded above |
| Save actual terminal / applicable-width Marker, notices and model-cost output for ticket 14; check content and fields first; do not substitute RPC/headless for the TUI readability judgement | `p48/codebase-tools-marker.txt` and `p48/codebase-tools-marker/` (real TUI 120/60), `p48/model-cost-widget.txt`, `p48/model-cost-notices.txt`, `p48/model-cost-tui/` (real TUI 120/60). Content/fields were checked by hand; comparison with the 01 baseline is recorded. The readability judgement is explicitly left to ticket 14. | Material complete; P48 unverified pending human confirmation |
| Provide version/patch, environment and per-run evidence; state missing credentials/TUI/mode conditions as unverified and blocking; do not call loader/typecheck equal to all behavior | The tables above; the limits below. | Pass for the executed scope |

## P48 material and human handoff

- Marker text and notices: `p48/codebase-tools-marker.txt` records ` codeBaseTools enabled`,
  ` ◈ codeBaseTools` and ` codeBaseTools disabled` at 120 and 60 columns; the raw frames and
  recordings are in `p48/codebase-tools-marker/`.
- model-cost display: `p48/model-cost-widget.txt` records the brief and detail account/Total/tree
  lines at both widths; `p48/model-cost-notices.txt` records the `/budget detail` info notice and
  its 60-column wrap; raw frames, recordings and PNGs are in `p48/model-cost-tui/`.
- Baseline: `.scratch/framework-capability-cutover/evidence/01-p48-baseline/pi-tui/` (same pi
  1.3.0, same 120/60 widths). After normalizing CRLF, the host's added warning and the temp
  run-root path, the detail frames at both widths and the brief at 120 are line-for-line
  identical; the brief at 60 differs only by the host's extra separator line.
- Ticket 14 owns the final human readability confirmation. Until then P48 is unverified, and that
  is not counted as a ticket-13 failure of the automated scope.

## Limits and unverified scope

- **No real provider credential or remote provider response was exercised.** The provider endpoint
  is the local capture fixture; this record makes no claim about real authentication, account
  balance, model quality or wire acceptance. The provider-account read script was not run: it
  requires the machine's own credential and is outside this ticket's named scenes; its absence is
  a blocking limit on any real-account claim, not a green result.
- **The installed pi is 1.3.0 while the smokes' fixed expectation is 1.2.0.** The explicit
  `--expect-pi-version 1.3.0` states the candidate observation; the TUI acceptance's version check
  therefore fails (its 34 content checks pass). No version support is claimed. Other pi versions,
  POSIX and other users are unverified.
- **Node 24.18.0 on this Windows host** hits the recorded libuv assertion when a codebase-tools
  session that replaced itself exits. Node 22.19.0 completed the same run. The Node 24 abort is an
  environment limitation, not a product pass.
- **No physical interactive terminal was driven by a person.** The real TUI frames are captured
  through a terminal device and read back cell by cell; the readability judgement is ticket 14's.
- The pi smokes drive the real loader and the pinned provider with isolated directories and a
  local model-response fixture. They do not cover nested delegation beyond the scenes stated in
  each smoke's own limits, fork inheritance, `reload`, cancellation beyond terminal-round's
  interrupted run, or a real peak/off-peak clock boundary.
- The probes are temporary evidence, not permanent tests. A later source change invalidates these
  results; rerun the commands above against the changed tree. The smoke corrections are in the
  permanent scripts so a rerun reaches the same observations.
- The tested source and fixtures stayed unchanged while the runs above executed; the only
  repository change in this ticket is the two scripts and this evidence directory.

## Reproduction

```powershell
bun install --frozen-lockfile
bun run typecheck
$env:PI_NODE = "D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe"
$cli = "D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js"
bun scripts/pi-codebase-tools-smoke.ts --pi $cli
bun scripts/pi-model-cost-smoke.ts --pi $cli
bun scripts/pi-subagent-smoke.ts --pi $cli --expect-pi-version 1.3.0
bun scripts/pi-background-round-smoke.ts --pi $cli
bun scripts/pi-terminal-round-smoke.ts --pi $cli --expect-pi-version 1.3.0
bun scripts/pi-close-out-smoke.ts --pi $cli
bun scripts/pi-session-accounting.ts --pi $cli --expect-pi-version 1.3.0
bun .scratch/framework-capability-cutover/evidence/13-pi-real-entry-regression/probes/pi-codebase-tools-subagent.ts --pi $cli
bun .scratch/framework-capability-cutover/evidence/13-pi-real-entry-regression/probes/pi-tui-marker.ts --pi $cli --widths 120,60 --rows 40
bun scripts/pi-tui-acceptance.ts --pi $cli --widths 120,60 --rows 40 --out .scratch/framework-capability-cutover/evidence/13-pi-real-entry-regression/p48/model-cost-tui
```
