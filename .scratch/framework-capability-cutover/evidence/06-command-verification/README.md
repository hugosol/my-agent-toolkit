# Ticket 06 — Command delivery cutover: verification evidence

Source state: branch
`hyper/framework-capability-cutover/06-command-delivery-cutover-d809a6-e1e098c5b064` (the branch
created for this ticket), base revision
`c5a8b2a44fae5fadde304105a6526d66c40e82ca` (the merged ticket 05 cutover), plus this ticket's
working changes. Dependencies: `bun install --frozen-lockfile` (13 packages); `bun.lock` sha256
`e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`, unchanged. Environment:
Windows 10.0.26200 x64, Bun 1.4.2 (`744846f84`), Node v24.18.0, TypeScript 7.0.2. The real dock used
the recorded isolated `@oh-my-pi/pi-coding-agent@18.5.0` baseline install
(`framework/docs/harness-baseline.json`; revision anchor `9348320c`, frozen artifact hashes checked
by the dock setup). The connect-bot suite used the real panel binary at
`E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`. Final runs below finished on the
unchanged tree; no source or fixture was edited during them.

## Delivered behavior

- `framework/interface/command/index.ts` is the canonical Command entry, organized in its public
  `details/definition.ts` (the closed control-kind declarations, `CommandDeclaration`, `ControlKind`)
  and `details/implementation.ts` (`DirectedCommandImplementation`, `CommandAction`,
  `ActionsCommandImplementation`, `CommandImplementation(s)`, `CommandDelivery`, `ActionDelivery`,
  `RecognizedDirective`, `CanAcceptInput`). All framework, adapter, extension and test consumers
  import that entry.
- The actual directed delivery (`run` and `unrecognized`) is explicitly constructed with exactly
  `args`, `canAcceptInput`, `provider`, `owner`, `feedback`, `hasUI`, `state` and `capability`.
  The actual action delivery is exactly `args`, `canAcceptInput`, `provider`, `owner`, `feedback`
  and `hasUI`: no State seam, retained capability, persistence callback or marker transport.
- `persist` left the extension-facing `CommandDelivery` declaration and the constructed object; the
  internal invocation and the managed State write path still record through the adapter's callback.
  The old `CommandActions` combination type and the old `framework/public` Command exports are
  removed without aliases. Internal `CommandInvocation`, `BoundCommand`, `DirectedDirective`,
  `parseDirectedArgument`, `actionsHelp` and `normalizeCommandArgument` stay out of the interface.
- The three controls keep their existing semantics: toggle owner scope, ordered State/marker/
  feedback path and activation text; directed owner scope, empty-argument activation, `off`
  deactivation, repeat execution without dedup/serialization, handler-owned writes and optional
  `unrecognized`; actions routing with trim/lowercase/whole-word matching, empty-argument info help,
  unknown/abbreviated error help, awaited async completion and one-report failure. Actions keep
  their existing call scope without the owner gate. `canAcceptInput` remains a live three-valued
  query of the executing session.
- Consumers migrated: `extensions/connect-bot` command and panel registration,
  `extensions/model-cost` period switch, and the framework's control/actions/protocol modules.
  Documentation updated for the moved entry and the narrowed delivery; ADR-0002 records the
  non-additive public-contract change.

## Acceptance mapping

| Ticket acceptance | Promise / partition | Evidence (actual run) | Result |
| --- | --- | --- | --- |
| Command declarations, implementations, delivery, `RecognizedDirective` and `CanAcceptInput` are canonically owned by the Command interface; internal invocation/binding/parsing/help/`DirectedDirective` are not public | P01, P05, P49 (Command partition) | `tests/framework/import-boundary.test.ts`: “Command declarations are published only by the Command capability interface” (all 14 owned names declared/exported only by the three canonical files; no other file declares/exports them; no `export *` from the Command entry; internal names absent from every interface file and from `framework/public.ts`). Repository search after migration found no `framework/public` Command import and no `CommandActions` consumer; the type is deleted. `bun run typecheck` 0 | Pass |
| The actual `run`/`unrecognized` `CommandDelivery` has only args, owner, hasUI, canAcceptInput, provider, feedback, state, capability; the actual `ActionDelivery` has only the first six, with no State writer, retained capability, persist, markers or nested bypass | P02, P03 | `tests/framework/directed-control.test.ts` “the delivery is exactly the approved surface, on `run` and `unrecognized` alike”: exact key set for both paths, recursive scan finds no `persist`/`markers`/`publishMarkers`, `state` is exactly `read`/`write`, `capability` exactly `state`/`feedback`. `tests/framework/actions-routing.test.ts` “the action delivery is exactly the approved facts and no capability”: exact six keys and recursive absence of `persist`, `state`, `capability`, `markers`. Both observe the framework-constructed delivery through `bindExtension`; approved State and retained operations remain covered by `declared-value-write.test.ts` and `owner-capability.test.ts` | Pass |
| Explicit construction, no spread of the invocation or direct hand-off to actions; approved State/retained operations keep working; no generic delivery factory/filter/Proxy/revocation added | P02, P03, P05 | Code inspection: `behaviors/control.ts` and `behaviors/actions.ts` build object literals from named members; no `...invocation`/`...delivery` remains under `framework/`, `adapters/` or `extensions/`. `declared-value-write.test.ts` (handler reads pre-invocation value, writes nothing or a different value, repeated writes not deduplicated) and `owner-capability.test.ts` (retained capability writes/feedback live, inert after owner end) pass in `test:framework` | Pass |
| toggle alternates the current value for the Owner's own session only, two consecutive invocations produce the specified sequence through the original State and feedback paths; codebase-tools real consumer regression | P22 | `tests/framework/control.test.ts` “each toggle records the new value and announces it, alternating between runs” (`true` then `false`, two records, `enabled`/`disabled` text) and the deterministic write-order case; `tests/framework/owner-inheritance.test.ts` “a command in a subagent writes nothing and announces nothing” and “a session whose parent link resolves to no main … cannot toggle”; `bun run test:codebase-tools` includes the real OMP `command-toggle.test.ts` (two real `/codebase-tools` command turns, persisted values and frames) | Pass |
| directed runs only in the Owner's own session; empty argument activates, `off` deactivates, every repetition runs; handler-writes-nothing and handler-writes-itself both observed; framework neither derives nor overwrites; async model unchanged; connect-bot real consumer regression | P23 | `directed-control.test.ts` activate/`off`/three repeated invocations/pending implementation not serialized/subagent refusal; `declared-value-write.test.ts` “a handler that writes nothing records nothing and publishes nothing”, “the value the handler writes is what State holds, not the one the directive named”, per-invocation read order. `bun test tests/connect-bot` (real panel binary) covers connect-bot's directed arm/off/gates | Pass |
| Unknown directed text reaches only the optional `unrecognized`, keeps its normalized text, and neither run/write/publish/feedback happens automatically with or without a member; connect-bot real consumer regression | P24 | `directed-control.test.ts` “an unrecognized argument reaches the implementation's own `unrecognized` member” (text verbatim, no record/marker, only the extension's notice) and “an unrecognized argument runs no implementation and changes no State” (implementation without the member). Real consumer: `tests/connect-bot/off.test.ts` “`offline` is no longer a form…” and “an unknown argument in a session that never armed sends no request and writes nothing” (passed in the real-panel suite) | Pass |
| actions keep their own call scope without the Owner gate; trim, lowercase and whole-word matching; empty argument info help and unknown/abbreviation error help, none executing an action; model-cost real consumer regression | P25 | `tests/framework/actions-routing.test.ts` exact-name/whitespace/case/empty/abbreviation/extra/undeclared cases and help text; action routing runs for an inherited/ownerless invocation through the same code path (`runCommandActions` has no owner check). `bun test tests/model-cost` includes `/budget` help, unknown argument and provider/idle gates; real host `tests/harness-dock/period-switch.test.ts` drives `/budget holiday` and `/budget clear` through the host's command chain | Pass |
| actions await controlled async completion; synchronous throw and async rejection are reported once on the existing path with no new retry, rollback or success notice | P26 | `actions-routing.test.ts` “an asynchronous action finishes before the invocation returns”, “a synchronous throw is reported once…”, “a rejected promise is reported once, and nothing reports success afterwards”; real host binding-lifecycle dock observes the same await and one-report behavior | Pass |
| `CanAcceptInput` returns the executing session's live true/false/undefined each time; framework does not gate on it or treat undefined as idle; original business branches verified | P27 | `tests/framework/round.test.ts` “the query re-reads the session's fact instead of delivering a snapshot” (same context answers `true`, `false`, `undefined` as its fact moves) and the existing native-seam true/false/undefined cases; `tests/framework/round-events.test.ts` three-valued delivery case; real consumer branches: model-cost `period-switch.test.ts` busy/unreported refusals and connect-bot `state-machine.test.ts` idle/busy state reports | Pass |
| Migrate all this batch's consumers, recheck and delete the unused `CommandActions`, retire the old Command declarations/exports and related exceptions, run control/actions plus the three affected extensions' coverage and the corresponding real host paths | P51 (Command partition), P52 (06 handoff) | Repository search: no consumer reads Command types from `framework/public`; `framework/public.ts` keeps only General's config/HTTP/file entries; `core/protocol.ts` no longer declares `CommandActions`; import-boundary legacy list unchanged for General only. Runs below cover framework, codebase-tools (real OMP), connect-bot (real panel), model-cost, and the real OMP consumer-regression, period-switch and binding-lifecycle docks | Pass |

## Red → green and fault injection

| Slice | Evidence | Result |
| --- | --- | --- |
| Directed/action delivery surface | Strengthened the existing surface assertions first (exact key sets and no `persist`). `bun test tests/framework/directed-control.test.ts tests/framework/actions-routing.test.ts` failed on the then-current directed delivery: received one extra key `persist` (22 pass / 1 fail). Removed `persist` from the public type and the constructed object | Red observed, then green |
| Command canonical ownership | Added the Command ownership/import check and moved `framework/interface/command.ts` to the approved `command/index.ts` + `details/` layout; `bun test tests/framework/import-boundary.test.ts` then passed 16/16 with `framework/public` no longer exporting any Command name | Green with new alarm |
| Leak injection (directed + actions) | Temporarily added `persist` and `markers` back to both constructed deliveries and cast them; the directed surface case failed with `persist` in the received keys and the action surface case failed with `persist` plus the extra count (21 pass / 2 fail). Restored the explicit literals and reran: 23 pass / 0 fail | Fault detected, then restored |
| Live idle query | Added the re-read case after the delivery changes; the existing adapter closure already answered live, so it passes as consumer-visible coverage of P27 | Verified existing behavior |

All injected changes were removed before the final regression runs.

## Commands and results

Final tree, run sequentially; no source or fixture was edited during these runs.

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 13 packages installed; `bun.lock` unchanged |
| `bun run typecheck` | 0 | no diagnostics |
| `bun run test:framework` | 0 | **628 pass / 0 fail**, 3238 `expect()` calls, 53 files |
| `bun run test:codebase-tools` | 0 | **24 pass / 0 fail**, 334 `expect()` calls, 7 files (includes the real OMP `command-toggle` run) |
| `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot` | 0 | **142 pass / 0 fail**, 689 `expect()` calls, 18 files |
| `bun test tests/model-cost` | 0 | **516 pass / 0 fail**, 2892 `expect()` calls, 51 files on the final tree. One earlier run of the same tree reported 515 pass / 1 fail in `tests/model-cost/harnesses/pi/pi-disposal-round-close.test.ts` (“no record for pi-disposal-child was published … it holds undefined”); the identical failure reproduces on the base revision `c5a8b2a` in 2 of 5 isolated runs, so it is a pre-existing flaky file-coordination case unrelated to Command, not a ticket regression |
| `bun test tests/harness-dock/binding-lifecycle.test.ts` | 0 | **2 pass / 0 fail**, 24 `expect()` calls; real isolated OMP 18.5.0 baseline |
| `bun test tests/harness-dock/consumer-regression.test.ts` | 0 | **3 pass / 0 fail**, 61 `expect()` calls; deployed discovery root, all three consumers' commands in one real host |
| `bun test tests/harness-dock/period-switch.test.ts` | 0 | **1 pass / 0 fail**, 28 `expect()` calls; real host `/budget holiday` and `/budget clear` |
| `bun run check:integrations` | 0 | declaration matching only; five entries complete or not required; behavior not assessed |

## Scope limits and unverified items

- This ticket closes P02/P03/P22–P27 and its P01/P05/P49/P51 (Command) partitions plus the P52 handoff
  for ticket 06. It does not close those promises globally: General, the internal-port relocation,
  the removal of the mixed public entry, the final import-exception retirement, the five real entry
  regressions and the final handoff remain later tickets.
- The delivery-surface proof is the framework-constructed object observed at the approved S1 seam
  (`bindExtension` + the shared port double), not a new instrumentation of a production extension.
  The real host docks exercise the same construction path through the loaded extensions, but they
  assert consumer outcomes rather than re-enumerating object keys.
- No real pi entry run was performed for this batch. The pi adapter's command invocation is unchanged
  and the pi-facing `tests/model-cost` cases (surface double) pass; the pi real-entry matrix belongs
  to ticket 12. No provider account, external service, physical TUI or formal P48 readability
  judgment was used.
- `canAcceptInput` liveness is shown at the adapter seam with one moving native fact and in the
  extension suites' business branches; the OMP native `isIdle` implementation itself was not
  re-verified against the live host beyond those dock runs.
- The `pi-disposal-round-close` case is an observed pre-existing flake (identical message on base
  `c5a8b2a`), not a Command behavior signal. It is recorded rather than hidden; no source in this
  ticket was changed to work around it.
- Focused green is not a claim of full-repository green or harness support certification.
