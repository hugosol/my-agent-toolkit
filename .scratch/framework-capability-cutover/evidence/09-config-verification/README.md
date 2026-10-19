# Ticket 09 — configuration entry and model-cost diagnostics: verification evidence

Source state: branch
`hyper/framework-capability-cutover/09-config-diagnostics-cutover-412a17-e1e098c5b064`, base
revision `51a001d` (the merged ticket 08 cutover), plus this ticket's working changes. Dependencies:
`bun install --frozen-lockfile` (13 packages); `bun.lock` sha256
`e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`, unchanged. Environment:
Windows 10.0.26200 x64, Bun 1.4.2 (`744846f84`), Node v24.18.0, TypeScript 7.0.2. Configuration
observations below used real temporary directories and real configuration files read by the
default `node:fs` reader and `yaml` parser; no reader/parser double was used for those cases.

## Delivered behavior

- `framework/interface/general/config.ts` is the configuration module's one extension-facing entry.
  Its runtime exports are exactly `getConfig` and `ExtensionConfigError`. It publishes no
  `ConfigLoadError`, `ConfigReader`, `ConfigParser`, `ConfigSource`, `ConfigReadOptions`,
  `readConfig`, `readConfigDocument`, `findConfigFailure`, `describeValue`, `isScheduledWait` or
  `SCHEDULED_WAIT_TEXT`, and it does not expose the framework's Shared configuration.
- `framework/interface/general/config-contract.ts` canonically owns `ExtensionConfigError`.
  `framework/core/config.ts` imports that class and throws it; the entry re-exports the same class.
  A misuse thrown inside is therefore the identity a consumer imports (`instanceof` and constructor
  equality both observed), while a loading-time failure remains the internal `ConfigLoadError`.
- The configuration declaration (`ExtensionConfigDeclaration`, `ConfigFieldType`) remains owned by
  the root authoring contract in `framework/interface/details/definition.ts`; `core/config.ts`
  imports those declarations and the entry restates none of them.
- `framework/public.ts` is deleted. Its only remaining export was the internal reader/source types;
  no extension, test, script, adapter or framework module imported it after the config consumers
  migrated. There is no `framework/interface/general/index.ts`, and the root authoring entry does
  not export `getConfig` or `ExtensionConfigError`.
- Runtime connection (one-way, no cycle):

  ```text
  interface/general/config.ts ──► interface/general/config-contract.ts   (error declaration)
  interface/general/config.ts ──► core/config.ts                         (getConfig re-export)
  core/config.ts              ──► interface/general/config-contract.ts   (same error class)
  interface/general/config-contract.ts ──► (no imports)
  ```

- Consumers migrated: connect-bot's `shared-logic/panel/config.ts`; model-cost's test support
  `tests/model-cost/support/store-child.ts`; `tests/connect-bot/config.test.ts`; the framework
  configuration suite. Scripts had no `getConfig` consumer. Extension imports under `framework/`
  now all resolve inside `framework/interface`; the import-boundary test has no legacy-entry
  exemption list and allows exactly the three general runtime connections.
- model-cost's consumption document now imports `describeValue` from its own
  `shared-logic/foundation/session/describe-value.ts`. It no longer imports anything from
  `framework/core/config`, and the framework gained no new public tool. The diagnostic wording for
  an invalid consumption document is unchanged.

## Acceptance mapping

| Ticket acceptance | Promise / partition | Evidence (actual run) | Result |
| --- | --- | --- | --- |
| The general entry publishes only `getConfig` and `ExtensionConfigError`; internal throws are the same class consumers recognize; declarations reference the authoring canonical source; no Shared configuration or reader/parser/source/helpers | P01, P43, P49, P51 (config partition) | Import-boundary case asserts the entry's lexical exports are exactly `["ExtensionConfigError","getConfig"]` and none of the internal names; the entry runtime import printed exactly those two values; a one-off probe printed `misuseClass: "ExtensionConfigError"`, `misuseIsPublicExtensionConfigError: true`, `misuseSameConstructorAsEntry: true`; `core/config.ts` imports the contract class and `interface/details/definition.ts` remains the declaration source; repository search after migration found no `framework/public` or extension import of `framework/core/config` | Pass |
| A real temporary configuration file drives binding success/failure; on success `getConfig` and `context.config` hold validated values; failure does not load; `getConfig` with no available configuration is distinguished from a binding load error | P43 | `tests/framework/config.test.ts` added real-file cases: a valid file at `<temp>/extensions/<id>/config.yaml` bound with the framework's default reader/parser, `getConfig` equal to the file's declared values and `context.config` the same object; an illegal real file (`endpoint: ""`) produced one `configuration` failure, one diagnostic, zero registrations and zero factory calls, and `getConfig` threw the public `ExtensionConfigError`, not `ConfigLoadError`; the existing no-config/never-bound misuse cases now import the public error and assert the same distinction | Pass |
| TypeScript `Readonly` is compile-verified; actual reads verify the original cache, effect timing and object delivery; no freeze, copy, hot reload or runtime write protection is added | P44 | `bun run typecheck` passes with two `@ts-expect-error` assertions over `ImplementationContext["config"]` (one for `getConfig`'s return value, one for `context.config`), so a writable type would fail the compile; the real-file cache case changed the file after the first binding and observed the second binding still delivering the first values; the real-file success case asserted `context.config === getConfig(definition)` and repeated `getConfig` returned the same object; a one-off probe printed `sameObjectAsContextConfig: true`, `sameObjectAcrossReads: true`, `frozen: false`, and a type-bypassed write was visible through the same object (`mutatedValueVisibleThroughSameObject: "mutated"`) — the approved limited exception, with no protection implementation added | Pass |
| model-cost uses its own small helper; invalid consumption documents keep independently specified consumer-visible diagnostics; the `describeValue` framework dependency exits; no new framework public tool or implementation-text assertion | P45, P51 (diagnostics partition) | Repository search shows the consumption document imports `./describe-value` and model-cost has no `framework/core/config` import; `tests/model-cost/foundation/storage/consumption-document.test.ts` added exact consumer-visible reasons for string, number, non-finite number, null, array and boolean values (`不是映射（…）`) plus the top-level non-mapping reason, all written as literals from the diagnostic contract; fault injection changing `an array` to `a list` made that case fail. The existing invalid-document and runtimeMs fault-diagnostic cases remain green | Pass |
| Migrate every configuration consumer in this batch, including scripts and tests; retire the old exports and the configuration implementation legacy exception; the three General entries have no aggregate and are not aggregated by the authoring root; the plain-function connection has no cycle | P51, P52 (09 handoff) | `framework/public.ts` deleted; repository search found no extension import outside `framework/interface`; `tests/framework/import-boundary.test.ts` no longer has an exemption list and adds the exact config runtime connection; its authoring-entry test still shows exactly the ten authoring names, no `getConfig`; `bun run typecheck` and the framework partition pass with the new module graph; the entry loads at runtime in the probe | Pass |
| Run the affected configuration/binding and model-cost document-diagnostic partitions plus real configuration-binding observation, with independent evidence for load failure, usage error and cache | P43, P44, P45, P52 | Commands and results below: focused four-file run 109/0, framework partition 633/0, model-cost partition 518/0, connect-bot config consumer 13/0, model-cost data smoke 20/0; real-file success/failure/cache cases and the probe above are the independent observations | Pass |
| Handoff evidence is attributable and scope-accurate; do not present partial green as full-repository or harness support | P52 (09) | This record names the source state, dependencies, environment, commands, counts, fault injections, failures and unverified items. P48 remains human-only and unverified | Pass |

## Red → green and fault injection

| Slice | Evidence | Result |
| --- | --- | --- |
| Public entry and canonical error | Red: the migrated test import failed with `Cannot find module '../../framework/interface/general/config'`; the import-boundary config-surface case failed because `framework/interface/general/config.ts` did not exist, and the tightened extension-import case reported the two legacy `framework/core/config` imports. After adding the entry, contract and consumer migration, the focused suite passed 70/0 | Red observed, then green |
| Validated-values cache is really process-wide | Fault injection: `findConfigFailure`'s `validatedConfigs.has(definition.id)` guard was temporarily replaced with `if (true)`. The real-file cache case failed, receiving `{ endpoint: "second" }` where the first validated object was expected. The guard was restored and the focused suite reran green | Fault detected, then restored |
| The delivery is the recorded object, not a copy | Fault injection: the factory's `config: getConfig(definition)` was temporarily changed to `{ ...getConfig(definition) }`. The real-file success case failed its `context.config === getConfig(definition)` assertion (`serializes to the same string`). The spread was removed and the case reran green | Fault detected, then restored |
| model-cost diagnostics are the consumer-visible text | Fault injection: the local helper's array wording was temporarily changed from `an array` to `a list`; the new diagnostics case failed on the expected literal. The wording was restored and the case reran green | Fault detected, then restored |

All injected changes were removed before the final runs; `grep` for `FAULT`, `if (true)` and the
temporary probe file found no residue. The deleted `framework/public.ts` and the added helper/entry
files are the intended final tree, not scaffolds.

## Commands and results

Final tree, run sequentially. The framework, model-cost and connect-bot partitions ran after the
last source edit; documentation edits followed but did not change the tested modules or fixtures.

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 13 packages installed; `bun.lock` sha256 unchanged (`e7ed487b…`) |
| `bun run typecheck` | 0 | no diagnostics (includes the `@ts-expect-error` `Readonly` assertions) |
| `bun test tests/framework/config.test.ts tests/framework/import-boundary.test.ts` | 0 | **70 pass / 0 fail**, 725 `expect()` calls, 2 files |
| `bun run test:framework` | 0 | **633 pass / 0 fail**, 3325 `expect()` calls, 53 files (includes the isolated OMP 18.5.0 deployment test) |
| `bun test tests/model-cost` | 0 | **518 pass / 0 fail**, 2899 `expect()` calls, 51 files |
| `bun test tests/connect-bot/config.test.ts` | 0 | **13 pass / 0 fail**, 67 `expect()` calls |
| `bun test tests/connect-bot` | 1 | **137 pass / 5 fail**, 142 tests across 18 files; all five failures are interop cases that require the actual `omp-bot.exe`, absent at `C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe` (error text names the build command) |
| `bun test tests/model-cost/foundation/storage/consumption-document.test.ts` | 0 | **26 pass / 0 fail**, 75 `expect()` calls |
| `bun test tests/framework/config.test.ts tests/framework/import-boundary.test.ts tests/model-cost/foundation/storage/consumption-document.test.ts tests/connect-bot/config.test.ts` | 0 | **109 pass / 0 fail**, 867 `expect()` calls, 4 files |
| `bun run smoke:model-cost-data` | 0 | **20 passed / 0 failed**, 20 checks |
| `bun probe-09-config.ts` (one-off, removed) | 0 | `{"entryRuntimeExports":["ExtensionConfigError","getConfig"],"bound":true,"valuesBefore":{"endpoint":"http://omp-bot.local:8787","requestTimeoutMs":2000},"sameObjectAsContextConfig":true,"sameObjectAcrossReads":true,"frozen":false,"mutatedValueVisibleThroughSameObject":"mutated","misuseClass":"ExtensionConfigError","misuseIsPublicExtensionConfigError":true,"misuseSameConstructorAsEntry":true}` |
| Fault-injection targeted runs | 1 each (injected) | three failures recorded above; all reverted |

## Scope limits and unverified items

- This ticket closes P43–P45 and its P01/P49/P51 configuration-and-diagnostics partition, plus the
  P52 handoff for ticket 09. It does not close those promises globally: the single internal port
  (ticket 10), final legacy retirement (11), the five real entry regressions (12–13) and the final
  handoff (14) remain later tickets.
- The five `tests/connect-bot` failures are an environment limit, not a green claim: the actual
  `omp-bot` panel binary is absent, so the frozen-protocol, exit-budget, unregister, offline-window
  and client-timeout interop cases did not run. The connect-bot configuration consumer itself
  (`tests/connect-bot/config.test.ts`) passed, and no connect-bot source other than its config import
  changed.
- No harness dock, real host session, provider account, external service or physical terminal was
  run. The changed production code is harness-independent configuration and model-cost shared logic;
  no adapter, harness assembly or discovery entry changed. Therefore no P48 readability judgment was
  made, and none is claimed.
- `bun run test` (full repository), `bun run check:integrations` and the real-entry regressions are
  final-integration work, not this ticket's partition. Focused and partition green is not a claim of
  full-repository green or harness support certification.
- The one-off probe deliberately wrote through the TypeScript `Readonly` type to observe that no
  runtime write protection exists; that observation is evidence for the approved limited exception,
  not a requirement that consumers bypass types. No permanent test asserts mutation behavior.
