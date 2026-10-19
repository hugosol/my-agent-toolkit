# Ticket 10 — internal port and offline checker independence: verification evidence

Source state: branch
`hyper/framework-capability-cutover/10-internal-port-cutover-a5bd8e-e1e098c5b064`, base revision
`a00bcee` (the merged ticket 09 cutover), plus this ticket's working changes. Dependencies:
`bun install --frozen-lockfile` (13 packages); `bun.lock` sha256
`e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`, unchanged. Environment:
Windows 10.0.26200 x64, Bun 1.4.2 (`744846f84`), Node v24.18.0, TypeScript 7.0.2.

Harnesses actually run:

- OMP 18.5.0 from the isolated acceptance artifact `.cache/omp-baseline/18.5.0` (the baseline
  record in `framework/docs/harness-baseline.json`; `tests/harness-dock/baseline.ts` materialised and
  byte-checked it during `consumer-regression.test.ts`).
- pi 1.3.0 via `D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`
  (the `D:\nvm4w\nodejs\pi.cmd` shim run through Node, as the smoke reports).
- connect-bot's real panel binary at
  `E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`, selected with the existing
  `OMP_BOT_BINARY` variable because the support code's default temp path was absent.

No formal load configuration or harness patch was changed. The OMP dock and pi smoke used their
repository fixtures and isolated agent directories.

## Delivered behavior

- `framework/runtime/port.ts` is the single framework/adapter interaction contract. It declares
  `HarnessPort`, `BindingResult`, `BindingFailure`, `StateValues`, `NoticeTransport`,
  `SessionDelivery`, `SessionDisposal`, `RoundSignal`, `RoundObservation`,
  `SessionContextObservation`, `ObservedSession`, `ObservationSource`, `SessionObservationSink`,
  `SessionObservationAccess`, `MarkerTransport`, `ViewedSessionPort`, `RunDelivery`,
  `PromptContribution`, `CommandInvocation`, `BoundCommand`, `TurnSignal` and `TurnSignalFacts`.
  A declaration search found each of these names declared in exactly `framework/runtime/port.ts`.
- The port refers to the canonical public declarations instead of restating them: Session facts and
  deliveries from `interface/session`, `OwnerReference`/`DeclaredValueSeam`/`OwnerCapabilityHandle`
  from `interface/state`, `FeedbackTransport` from `interface/feedback`, `CatalogPriceSource`/
  `ProviderAccess`/`ProviderHttpFacts` from `interface/host-facts`, `SubagentIntegration` from
  `interface/subagent`, `CanAcceptInput` from `interface/command`, and `ExtensionDefinition` from
  `interface/details/definition`. It is type-only against those modules.
- The two helpers that retain real internal duties were moved next to their users instead of
  becoming port members: `DirectedDirective` lives beside `parseDirectedArgument` in
  `framework/behaviors/control.ts`, and the deterministic `describeBindingFailure` text helper is
  private to `framework/behaviors/binding.ts`.
- `framework/core/protocol.ts` is deleted (git reports the path as a rename); no forwarding file,
  compatibility alias or re-export remains. All framework, adapter, script and test interaction
  consumers import `framework/runtime/port`; extensions import neither.
- The internal offline vocabulary remains internal: `SubagentExecutionMode`,
  `HarnessIntegrationDeclaration` and `ExtensionHarnessEntry` stay in
  `framework/core/integration.ts`; `RequiredSemantic` and `FRAMEWORK_REQUIRED_SEMANTICS`
  (`history-preservation`) stay in `framework/core/requirements.ts`. No interface file declares
  any of them, and no tooling module, scanner or diagnostics command was added
  (`package.json` unchanged).
- `scripts/check-adapter-integrations.ts` and `framework/integration-check.ts` still compare
  declarations only. Nothing under `entrypoints/`, `adapters/` or the framework's runtime path
  imports the checker or the integration inventory.

## Dependency review

Commands were run after the migration; all expected-empty results were empty:

```text
grep extension imports of framework/{core,modules,behaviors,runtime}  → none
grep extension imports of adapters/<harness>/{domain,internal}       → none
grep framework/adapter imports of extensions/                        → none
grep framework/interface imports of framework/runtime/port           → none
grep old path framework/core/protocol.ts                             → absent
```

The only adapter re-export of a port type is `adapters/pi/index.ts` publishing `BindingResult`
because `PiExtensionFactory` returns it; it is a type re-export of the one canonical declaration,
not a second declaration or a forwarding implementation entry. Adapter entrypoints keep the existing
native escape hatch (`adapters/pi/index.ts` re-exports `internal/native`); extension harness
assemblies import only `adapters/omp` / `adapters/pi` roots. The import-boundary suite enforces the
native-package/escape-hatch direction, extension→interface direction, framework→extension absence,
canonical declaration ownership and the exact internal implementation connections.

## Acceptance mapping

| Ticket acceptance | Promise / partition | Evidence (actual run) | Result |
| --- | --- | --- | --- |
| One port owns the approved interaction contracts | P49 (port partition) | Declaration search: each of the 22 names appears exactly once, in `framework/runtime/port.ts`; the file exists at `framework/runtime/port.ts`; the old `core/protocol.ts` is absent; `bun run typecheck` resolves every migrated consumer | Pass |
| The port refers to canonical Session/State/Feedback/Host facts/Subagent/Command/authoring declarations; all interaction consumers migrated; emptied files deleted; real internal helpers retained | P49 (dependency partition) | Port import block is the canonical-interface list above; no `framework/interface` file imports the port; no extension imports the port; all prior `core/protocol` import sites were migrated to `runtime/port` (framework, both adapters, Local access, scripts and tests); `DirectedDirective` and `describeBindingFailure` moved beside their real users; `git status` records the old path as renamed/deleted; `bun run typecheck` and `tests/framework/import-boundary.test.ts` green | Pass |
| Extensions reach only approved interfaces; harness assemblies use the selected adapter's public entry and native escape hatch, not its domain/internal; framework does not depend on extension business or name native harness packages | P49 (boundary partition) | Dependency-review greps above are empty; the import-boundary suite's harness-package/escape-hatch case and framework→extension case pass (17/0); `tests/codebase-tools` (24/0) and the real OMP dock (3/0) load extension assemblies through the adapter roots | Pass |
| Only defineExtension/request/updateFile/getConfig may connect an interface to an internal implementation; no blanket re-export, wide internal directory or cycle; the import check keeps its lexical limits | P49 (connection partition) | `tests/framework/import-boundary.test.ts` allows exactly `general/http.ts → modules/http`, `general/files.ts → modules/files`, `general/config.ts → core/config`; defineExtension is implemented in the root authoring entry and imports no implementation; the authoring-entry case still lists only the ten authoring names; no interface imports the port; the suite's comment states these are exact connections and the suite keeps its lexical-alarm limitation | Pass |
| SubagentExecutionMode, HarnessIntegrationDeclaration, ExtensionHarnessEntry and the complete requirement vocabulary keep their approved internal ownership; the offline checker separately verifies complete and missing declarations; no new tool module, scanner or diagnostics command | P50 | `framework/core/integration.ts` and `framework/core/requirements.ts` remain the only owners; `grep` shows `SubagentExecutionMode` absent from every interface file; the checker unit suite is 8/0; actual CLI runs: complete declaration state exited 0 with `All declared requirements are connected; behavior correctness is not assessed.`; with `state-follow` temporarily removed from the OMP declaration it printed `MISSING omp / codebase-tools: in-process: missing state-follow` and exited 1; the edit was restored and the complete run exited 0 again. `package.json` has no new script and no tool module was added | Pass |
| Actual entry loading does not depend on the checker and adds no startup gate or degradation; History preservation is not an author option | P50 (runtime independence) | No runtime import of `integration-check`, `check-adapter-integrations` or `core/integration` exists outside the adapter declarations/offline script; the real OMP consumer regression loaded `entrypoints/omp` verbatim and bound all three extensions (3/0); `DeclarableRequiredSemantic` still has exactly the two lifecycle values and `FRAMEWORK_REQUIRED_SEMANTICS` still owns `history-preservation` internally; no startup check was added | Pass |
| Typecheck, existing import restrictions, independent checker and relevant behavior/real host paths run; dependency ownership reviewed rather than replaced by declaration checks | P49/P50/P51 (10 partition), P52 (10 handoff) | Commands and results below: typecheck 0, import-boundary 17/0, checker unit 8/0, framework 633/0, codebase-tools 24/0, connect-bot 142/0 with the real panel, model-cost 518/0, real OMP dock 3/0, real pi model-cost smoke 100 checks/28 runs; the dependency review is the grep/re-export inspection above, and behavior runs are separate from the declaration checks | Pass |

## Commands and results

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 13 packages installed; lockfile unchanged |
| `bun run typecheck` | 0 | no diagnostics |
| `bun test tests/framework/import-boundary.test.ts` | 0 | 17 pass / 0 fail, 526 expect() calls |
| `bun test tests/framework/integration-check.test.ts` | 0 | 8 pass / 0 fail, 9 expect() calls |
| `bun run check:integrations` (complete state) | 0 | `COMPLETE`/`NOT REQUIRED` for all five deployed pairs; final line says behavior correctness is not assessed |
| `bun run check:integrations` (fault injection: OMP `state-follow` removed) | 1 | `MISSING omp / codebase-tools: in-process: missing state-follow`; other pairs unchanged; restored immediately |
| `bun run test:framework` | 0 | 633 pass / 0 fail, 3325 expect() calls, 53 files |
| `bun test tests/codebase-tools` | 0 | 24 pass / 0 fail, 334 expect() calls, 7 files |
| `bun test tests/connect-bot` (default panel path absent) | 1 | 137 pass / 5 fail; every failure is the support helper's missing real panel binary at the default temp path, not a code assertion |
| `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot` | 0 | 142 pass / 0 fail, 689 expect() calls, 18 files |
| `bun test tests/model-cost` | 0 | 518 pass / 0 fail, 2899 expect() calls, 51 files |
| `bun test tests/harness-dock/consumer-regression.test.ts` | 0 | 3 pass / 0 fail, 61 expect() calls; real OMP 18.5.0 loaded the deployed `entrypoints/omp` and all three extensions |
| `bun scripts/pi-model-cost-smoke.ts` | 0 | `100 check(s) passed, none failed`, 28 isolated real pi 1.3.0 runs |

## Limits and unverified scope

- This record claims the ticket 10 partition only. Full five-entry real-entry regression belongs to
  ticket 12, and final navigation/ADR consistency belongs to ticket 11; neither is claimed here.
- P48 readability remains human-only and unverified. The pi smoke observes published widget frames,
  not terminal readability; the OMP dock observes marker/notice behavior, not human readability.
- The connect-bot real-panel run required an explicit binary path; the repository's default temp
  location was absent. That is an environment selection, not a product failure, and the same binary
  drove the green run recorded above.
- The pi smoke ran against pi 1.3.0 while its expectations were written for 1.2.0; it reported the
  version note and all 100 checks passed. No new pi version support is claimed.
- No OMP candidate or other harness version was exercised. No credentials or real provider accounts
  were used by the recorded pi run beyond its scripted local endpoints; its own limitation notes
  state that the account answers are the script's documents.
- The import check remains a lexical alarm over `.ts` files, not a proof; this record does not claim
  complete coverage of computed specifiers, non-`.ts` modules or aliasing.
