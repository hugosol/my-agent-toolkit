# Ticket 02 — Prompt and Marker cutover: verification evidence

Source state: branch `hyper/framework-capability-cutover/02-prompt-marker-cutover-adfbcc-e1e098c5b064`,
base revision `b6f0c21abf27a20a5237474244a015ee4e7dbc52` (the merged ticket 01 cutover), plus this
ticket's working changes. Dependencies: `bun install --frozen-lockfile` (13 packages); `bun.lock`
sha256 `e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`, unchanged. Environment:
Windows 10.0.26200 x64, Bun 1.4.2, Node v24.18.0, pi 1.3.0, isolated exact install of
`@oh-my-pi/pi-coding-agent@18.5.0` for the OMP dock. The dock runs used the frozen
`host-patches/omp-18.5.0-viewed-session` artifact. The temporary worktree checked that artifact out
with CRLF (`core.autocrlf=true`), and `patchTouchedFiles` reads the diff by LF lines; the patch files
were restored from their committed LF index bytes for the dock runs (`git ls-files --eol` reports
`i/lf w/lf`; no tracked content changed). Logs named below are ignored by `.gitignore` (`*.log`);
the results are recorded here.

## Acceptance mapping

| Ticket acceptance | Promise | Evidence (actual run) | Result |
| --- | --- | --- | --- |
| Prompt publishes only `PromptDeclaration`, `PromptStrategy`; Marker only `MarkerDeclaration`; defaults, bound strategy list, selection tool, `RunDelivery`, `PromptContribution` and `MarkerTransport` stay internal | P01, P05, P19, P49, P51 (Prompt/Marker partition) | `framework/interface/prompt.ts`, `framework/interface/marker.ts`; `core/definition.ts` imports both and keeps only the internal `BOUND_PROMPT_STRATEGIES`; `public.ts` no longer exports the three declarations, `MarkerTransport` or `PromptContribution`; `import-boundary.test.ts` “Prompt and Marker declarations are published only by their capability interfaces” and “the authoring entry publishes no Prompt or Marker runtime transport”; fault injection below; `bun run typecheck` exit 0 | Pass |
| Real framework construction for initialize, directed run, unrecognized and actions shows no `markers` or area-transport bypass, while internal publication still works | P02, P03, P04, P19 | `implementation-lifecycle.test.ts` “the initialization delivery carries no marker area transport”; `directed-control.test.ts` “the delivery carries no marker area transport, on `run` and `unrecognized` alike”; `actions-routing.test.ts` “the action delivery carries no marker area transport”. Each walks the actual delivery object recursively, so a nested transport would be found. `CommandDelivery.persist` deliberately remains for ticket 06; this ticket claims only the Marker closure. Internal publication is the existing marker suites plus the real OMP dock runs below. | Pass for the Marker partition; full Command delivery is ticket 06 |
| `first-enabled-run` / `every-enabled-run`, slot identity, branch progress, frequency, priority, position, visibility and retention hold, with independently specified contribution counts and content | P17 | `injection.test.ts`: init identity `codebase-tools:init` on the first enabled run, reminder identity on every later enabled run, one contribution per run, pending one-shot preferred over a repeating slot, first declared repeating slot otherwise, disabled owner contributes nothing, re-entry/replay and rewound branch decisions; content read from the extension's own `init.md`/`reminder.md`. Real OMP: `tests/codebase-tools/init-injection.test.ts`, `reminder-injection.test.ts`, `session-boundaries.test.ts`. Real pi: `scripts/pi-codebase-tools-smoke.ts` phase 1 below. | Pass |
| Real requests and session records: framework contributions do not delete, replace or reorder history-derived content; no cache-hit or cross-harness role guarantee is added | P18 | Real OMP `tests/codebase-tools` (init/reminder injection and session boundaries) and real pi smoke phase 1: append-only journal, earlier request messages an unchanged prefix, one hidden persisted contribution per enabled slot, init not re-injected. The pi TUI/role questions are not re-adjudicated here and no role/cache claim is added. | Pass for the existing observed paths; no new guarantee |
| Two marked extensions and an unmarked consumer coexist; each step renders exactly its expected lines; disabling one removes only its line; all hidden clears the area | P20 | `marker.test.ts` “two marked extensions and an unmarked consumer coexist, and each step renders exactly its lines” (six exact widget renderings: one line, both sorted, re-asserted by two marked run bindings, one line, cleared); existing “turning one extension off removes only its line”. Real OMP dock: `consumer-regression`, `viewed-marker`. Real pi smoke: marker shown on enable and cleared on disable. | Pass |
| One process-wide area, existing sorting, Viewed-session projection, and publication on initialization/write/run/view changes; duplicated module graphs share the area; viewing grants no Owner or write authority | P21 | `marker-module-duplication.test.ts` (process-global area across duplicated module instances), `viewed-marker.test.ts` (projection re-reads the displayed session, a spawned binding does not empty it, a view change grants no authority), `marker.test.ts` (run re-assert, transition publish and clear), `session-events.test.ts` (boundary publish). Real OMP `tests/harness-dock/viewed-marker.test.ts` passed with the frozen viewed-session patch. | Pass for automated content/authority; readability is P48 |
| All this batch's consumers migrated; old declarations/exports exited; reuse injection, marker, viewed-marker and module-duplication coverage plus the real dock; compare 01 baseline field content | P51 (Prompt/Marker partition), P52 | Framework, adapters, extensions, scripts and tests import only the canonical declaration files or the internal protocol seam; `bun run typecheck` and the import-boundary check; `bun run test:framework`, `tests/codebase-tools`, `tests/connect-bot`, `tests/model-cost`; the same five dock files that produced the 01 baseline now pass 19/19 with 229 expect calls, asserting the same exact marker lines, widget frames and notice severities. | Pass for this partition; whole-repository retirement remains ticket 11 |

## Red → green evidence

The tests were written before the corresponding production change and failed for the intended reason:

| Slice | Red result | Green result |
| --- | --- | --- |
| Canonical Prompt/Marker declarations and retired exports | `import-boundary-red.log`: missing `framework/interface/prompt.ts`; `framework/public.ts` exported `MarkerTransport`/`PromptContribution` (8 pass / 2 fail) | `import-boundary-green.log`: 10 pass / 0 fail |
| Initialization delivery | `init-surface-red.log`: recursive keys contained `markers` and `publishMarkers` (1 fail) | `init-surface-green.log`: 1 pass |
| Directed `run` and `unrecognized` deliveries | `directed-surface-red.log`: the spread delivery contained `markers`/`publishMarkers` (1 fail) | `directed-surface-green.log`: 9 pass / 0 fail |
| Action delivery | `action-surface-red.log`: the invocation itself was handed over, with `markers`/`publishMarkers` (1 fail) | `action-surface-green.log`: 14 pass / 0 fail |
| Two markers + unmarked consumer line sets | The first run exposed an incorrect hand-written expectation (the fifth rendering is `["◈ zzz"]`, not `["◈ aaa"]`); the expectation was corrected before it was accepted as coverage. The test is sensitive to a wrong line set, as that failure shows. | `marker-coexistence-green.log`: 6 pass / 0 fail |

### Fault injection for the ownership check

A duplicate `export type PromptStrategy` was temporarily added to `framework/core/definition.ts`.
`bun test tests/framework/import-boundary.test.ts -t "Prompt and Marker"` failed with

```text
framework/core/definition.ts declares PromptStrategy outside its capability interface
```

(0 pass / 1 fail, `ownership-fault-injection.log`). The declaration was removed, and the final
focused run is green (86 pass / 0 fail). No other fault injection was needed: the delivery tests'
red runs above already observed the real leak before it was removed.

## Commands and results

All runs used the source above.

| Command | Exit | Result |
| --- | --- | --- |
| `bun run typecheck` | 0 | no diagnostics (`typecheck-final.log`) |
| `bun test tests/framework/{injection,marker,viewed-marker,marker-module-duplication,directed-control,actions-routing,implementation-lifecycle,import-boundary}.test.ts` | 0 | **86 pass / 0 fail**, 274 expect() calls, 8 files (`focused-acceptance-final.log`) |
| `bun run test:framework` | 0 | **610 pass / 0 fail**, 2747 expect() calls, 52 files (`framework-partition-final.log`; the first partition run had the same counts) |
| `bun run test:codebase-tools` | 0 | **24 pass / 0 fail**, 334 expect() calls, 7 files (`codebase-tools-partition.log`); real isolated OMP entries, real injection, session and marker suites |
| `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot` | 0 | **142 pass / 0 fail**, 689 expect() calls, 18 files (`connect-bot-partition.log`) |
| `bun test tests/model-cost` | 0 | **515 pass / 0 fail**, 2891 expect() calls, 51 files (`model-cost-partition.log`) |
| `bun test tests/harness-dock/{consumer-regression,model-cost-headless,model-cost-modes,viewed-marker,binding-lifecycle}.test.ts` | 0 | **19 pass / 0 fail**, 229 expect() calls, 5 files (`dock-prompt-marker-consumers.log`); real isolated OMP 18.5.0 with the frozen viewed-session patch, same five files as the 01 baseline |
| `bun scripts/pi-codebase-tools-smoke.ts` | 1 (environment) | **34 checks passed** in two isolated real pi 1.3.0 runs, then the run stopped on the known Node 24.18.0 Windows libuv assertion (`UV_HANDLE_CLOSING`, child exit 9) while exiting a session (`pi-codebase-tools-smoke.log`). Phase 1's marker, injection, history-prefix and disable-clear checks passed; phases 3–7 were not reached. Recorded as an environment limitation, not a pass. |

A first dock attempt failed before running any host session: the worktree's CRLF copy of
`host-patches/omp-18.5.0-viewed-session/patch.diff` parsed as touching no file (`patchTouchedFiles`).
After restoring the artifact's committed LF bytes, the same five-file run passed 19/19. This is a
checkout line-ending artifact, not a product failure; the tracked blob and `bun.lock` are unchanged.

## P48 status

The 01 baseline and this run use the same five dock files and the same exact widget/notice
assertions (19 pass / 229 expect calls both times), so the automated field content is unchanged.
**P48 remains unverified**: this ticket does not authorize a readability judgment. The human must
compare the recorded real terminal output and the pi TUI material; that remains ticket 14's handoff.
The pi smoke's exit-9 environment limitation above is not a readability result.

## Scope limits

- This ticket did not run the full repository `bun run test`, `check:integrations`, or the final
  five-entry regression; those remain final integration (tickets 12 and 14).
- The pi smoke was run as an added real-entry observation; its phases 3–7 and the pi TUI were not
  reached or run under this ticket. No pi support or P46 claim is made.
- `CommandDelivery.persist`, the rest of the Command surface, and the authoring/feedback/host-facts
  migrations are not claimed here; they belong to tickets 05 and 06.
- No formal installation, global configuration, provider credential or real model service was
  touched. OMP requests went to the dock's local capture endpoint; pi runs used isolated temporary
  roots; the model-cost cross-process suites used their own temporary directories.
