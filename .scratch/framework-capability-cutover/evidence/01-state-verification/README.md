# Ticket 01 — State interface cutover: verification evidence

Source state: branch `hyper/framework-capability-cutover/01-state-interface-cutover-094c18-e1e098c5b064`,
base revision `0d61913c703bd44793cbdab08479ab8121b38a90`, plus this ticket's working changes.
Dependencies: `bun install --frozen-lockfile`; `bun.lock` sha256
`e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f` (unchanged by the install).
Environment: Windows 10.0.26200 x64, Bun 1.4.2, Node v24.18.0, pi 1.3.0, isolated
`@oh-my-pi/pi-coding-agent@18.5.0` for the OMP dock. `model-cost-modes` and `viewed-marker` used the
frozen `host-patches/omp-18.5.0-viewed-session` artifact; the other OMP runs used the unpatched
isolated 18.5.0. The checkout's `patch.diff` bytes were read from their committed LF form (the
worktree is `core.autocrlf=true`; no tracked content changed). Tested sources and fixtures: the real
`entrypoints/omp/{codebase-tools,connect-bot,model-cost}` and `entrypoints/pi/model-cost` entries,
`extensions/*` definitions/shared logic, and the dock fixtures under `tests/harness-dock/fixtures/`.
The P48 baseline captured before the first source edit is in
[`../01-p48-baseline/`](../01-p48-baseline/README.md).

## Acceptance mapping

| Ticket acceptance | Promise | Evidence (actual run) | Result |
| --- | --- | --- | --- |
| P48 baseline before the first related change | P48 (preparation only) | [`../01-p48-baseline/README.md`](../01-p48-baseline/README.md): OMP consumer regression (marker lines, operator notices), OMP model-cost headless (stderr severities), OMP model-cost display, pi model-cost TUI at 120×40 and 60×40, pi codebase-tools marker/notices | Baseline captured. Readability judgment is **not** made here; P48 remains unconfirmed. |
| Six declarations owned by the approved interface; one source; no store/cell/Map/Owner life/writer published | P01, P05 (State partition) | `tests/framework/import-boundary.test.ts` test “State's declarations are published only by the State capability interface”; `bun run typecheck` exit 0; `framework/interface/state/index.ts` owns `StateDeclaration`, `StatePersistence`, `StateInheritance`, `OwnerReference`, `DeclaredValueSeam`, `OwnerCapabilityHandle`; `framework/public.ts` no longer exports the three declaration types; internal `core/definition.ts` and `core/state.ts` import the same declarations | Pass |
| Actual framework delivery reads/writes; two extensions and different Owners; write-then-read and a retained handle read the current value; no per-field permissions or delivery-writer revocation | P07, P08, P09 | `declared-value-write.test.ts` (handler reads previous value, repeated identical writes, seam shape); `owner-capability.test.ts` (retained read after write, write by delivery then read by handle); `owner-inheritance.test.ts` (“two extensions with different per-field policies coexist”); `control.test.ts` (“two sessions keep independent values …”, toggle path) | Pass |
| Same-value repeated writes still persist and publish; order current value → session-entry persistence → marker; memory never persists | P09, P10 | `declared-value-write.test.ts` “two identical writes are two writes” (two records, two area updates); `control.test.ts` “persistence is attempted before the marker and feedback, and the record carries the new value”; `owner-inheritance.test.ts` memory cases (never seeded, never recorded) | Pass |
| Persistence failure does not roll back and still publishes; marker failure propagates without rollback | P11, P12 | `control.test.ts` “a failed record does not change the feedback or the authoritative current value” (asserted effect order `persist, marker, notify` on both attempts) and “a marker publication that fails does not roll back the value or its record” (throw observed; value and record kept) | Pass |
| Owner end: old retained writes/feedback inert, no cell rebuild, same key/new life does not revive, post-end handle inert, old read not frozen | P13 | `owner-capability.test.ts` retired-write, retired-feedback, reopened-owner, end-delivery capability and read cases; `session-events.test.ts` disposed-end retirement | Pass |
| follow reads the Owner's current value; none/unresolved read the default; subagent gets no writer or Owner feedback; widening scope adds no write | P15 | `owner-inheritance.test.ts` follow/none/unresolved and “a subagent has no write face”; real dock: `tests/codebase-tools/subagent-owner.test.ts` (OMP, real subagents) and `tests/harness-dock/viewed-marker.test.ts` (real host projection); `owner-gate.test.ts` (subscription scope); framework child-process coverage (`owner-follow-processes`, local-access) in the framework partition | Pass for the existing in-process and recorded cross-process paths; no new cross-process guarantee claimed |
| session-entry uses the last payload's legal boolean, else the default; memory does not restore; same-Owner navigation keeps; a restored value does not restore effects | P16 | `session-events.test.ts` new last-payload test (last legal value wins; non-boolean/non-object last → default; earlier values do not leak); `owner-inheritance.test.ts` memory-field cases and same-identity resume; real OMP `tests/codebase-tools/session-boundaries.test.ts` (restart, legacy invalid record, tree navigation, branch, fork) and `marker-lifecycle.test.ts` (restored line); `tests/connect-bot/arm.test.ts` “binding alone sends no request, schedules no timer and writes no state” plus connect-bot's `memory` declaration (a restored value cannot arm it) | Pass; the framework seeds only the value and publishes the area, and extension effects are only run by their handlers |
| Reuse existing coverage, run consumers and real recovery/inheritance; old State exports retire | P52, P51 (State partition) | Commands below; `framework/public.ts` State export removal; import-boundary check; `bun run typecheck` | Pass for this partition; whole-repository legacy retirement remains ticket 11's when its consumers finish |

## Commands and results

All runs used the source above. Logs are beside this file.

| Command | Exit | Result |
| --- | --- | --- |
| `bun run typecheck` | 0 | no diagnostics |
| `bun test tests/framework/declared-value-write.test.ts tests/framework/owner-capability.test.ts tests/framework/owner-inheritance.test.ts tests/framework/control.test.ts tests/framework/session-events.test.ts tests/framework/import-boundary.test.ts` | 0 | **59 pass / 0 fail**, 196 expect() calls, 6 files (`state-focused-tests.log`) |
| `bun run test:framework` | 0 | **604 pass / 0 fail**, 2725 expect() calls, 52 files (`framework-partition.log`) |
| `bun test tests/codebase-tools` | 0 | **24 pass / 0 fail**, 334 expect() calls, 7 files (`codebase-tools-partition.log`); includes real OMP session-boundaries, marker, injection and subagent tests |
| `bun test tests/connect-bot` | 1 (first run) / 0 (rerun) | First run without a panel binary: 137 pass / 5 fail, all five “the interop run needs the actual omp-bot panel…” at the default path (`connect-bot-partition.log`). Rerun with `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`: **142 pass / 0 fail**, 689 expect() calls, 18 files (`connect-bot-partition-with-panel.log`). |
| `bun test tests/model-cost` | 0 | **515 pass / 0 fail**, 2891 expect() calls, 51 files (`model-cost-partition.log`) |
| `bun test tests/harness-dock/consumer-regression.test.ts tests/harness-dock/model-cost-headless.test.ts tests/harness-dock/model-cost-modes.test.ts tests/harness-dock/viewed-marker.test.ts tests/harness-dock/binding-lifecycle.test.ts` | 0 | **19 pass / 0 fail**, 229 expect() calls, 5 files (`dock-state-consumers.log`); real isolated OMP 18.5.0, real entries, marker/notices/model-cost display, real subagent following |
| `bun scripts/pi-tui-acceptance.ts --widths 120,60 --rows 40 --out .scratch/framework-capability-cutover/evidence/01-state-verification/pi-tui-post-cutover` | 1 (version check only) | **34 ok / 1 failed**, the same sole failure as the baseline (script expects pi 1.2.0, CLI reports 1.3.0). `pi-tui-acceptance-post-cutover.log`; frames in `pi-tui-post-cutover/`. The 60-column brief/detail frames are byte-identical to the baseline; the 120-column frames differ only in the temporary run-root path drawn by the host. No readability judgment is made. |

### Fault injection used to check the new evidence

1. `framework/core/definition.ts` temporarily re-declared `StatePersistence`: the import-boundary
   test failed with `framework/core/definition.ts declares StatePersistence outside the State
   capability interface`; after restoring, 8 pass / 0 fail.
2. `framework/core/state.ts` temporarily selected `statePayloads[0]` instead of the last payload:
   the new session-events test failed (`Expected: false, Received: true`); restored.
3. The same function temporarily accepted any non-`undefined` value instead of a boolean: the new
   test failed (`Expected: false, Received: "yes"`); restored.
The final focused run above is the restored, green state.

## P48 status

The pre-change baseline and the post-change dock runs cover the same entry-visible content, but the
ticket does not authorize a readability judgment. **P48 remains unverified**: the human must compare
the recorded frames/notices and the real terminal. The pi baseline ran with pi 1.3.0 while the
acceptance script's expectation states 1.2.0 (its sole failed check); the pi codebase-tools smoke
stopped on the known Node 24.18.0 Windows libuv assertion after 34 passed checks. Those are
environment limitations recorded in the baseline, not passes.

## Scope limits

- This ticket did not run the full repository `bun run test`, `check:integrations`, the five-entry
  final regression, or any real-host run outside the OMP isolated install and the local pi CLI.
  Those remain for final integration (ticket 14) and are not claimed here.
- No formal installation, global configuration, provider credential or real model service was
  touched. OMP model requests went to the dock's local capture endpoint; pi runs were isolated
  temporary roots.
- The cross-process State path is covered only by the existing framework child-process suites in
  the framework partition; no new remote-sync guarantee is claimed.
