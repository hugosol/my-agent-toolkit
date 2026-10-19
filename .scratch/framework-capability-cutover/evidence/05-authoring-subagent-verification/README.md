# Ticket 05 — Authoring and Subagent cutover: verification evidence

Source state: branch
`hyper/framework-capability-cutover/05-authoring-subagent-cutover-3cce09-e1e098c5b064` (the branch
created for this ticket), base revision
`a806c8f2b77b6f003f8d1679269796b861518420` (the merged ticket 04 cutover), plus this ticket's
working changes. Dependencies: `bun install --frozen-lockfile` (13 packages); `bun.lock` sha256
`e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`, unchanged. Environment:
Windows 10.0.26200 x64, Bun 1.4.2 (`744846f84`), Node v24.18.0, TypeScript 7.0.2. The real dock used
the recorded isolated `@oh-my-pi/pi-coding-agent@18.5.0` baseline install
(`framework/docs/harness-baseline.json`; revision anchor `9348320c`, frozen artifact hashes checked
by the dock setup). The final runs below finished on the unchanged tree recorded here; run output
was saved under `logs/` (local, ignored by the repository's `*.log` rule).

## Delivered behavior

- `framework/interface/index.ts` is the root authoring entry. It owns `defineExtension` and composes
  the whole definition/implementation contract from its public `details/` files; it exports no
  capability declaration and does not aggregate State, Session, Prompt, Marker, Feedback, Host
  facts, Subagent or Command.
- `framework/interface/details/definition.ts` now canonically owns `ExtensionDefinition`,
  `ExtensionConfigDeclaration` and `ConfigFieldType`. It refers to the capability-owned declarations
  (`StateDeclaration`, `PromptDeclaration`, `MarkerDeclaration`, `CommandDeclaration`,
  `SubagentCapability`) instead of re-declaring them.
- `framework/interface/details/implementation.ts` canonically owns `ExtensionAssembly`,
  `ExtensionFactory`, `ImplementationContext`, `ExtensionImplementation`, `InitializationDelivery`
  and `DeclarableRequiredSemantic`. `ImplementationContext` still carries only `config`, optional
  `modelPrices`, optional `providerAccess` and `session`; `InitializationDelivery` carries only
  `owner`, `hasUI`, `feedback` and `subagents`.
- `framework/interface/subagent.ts` canonically owns `SubagentIntegration`,
  `SubagentIntegrationFailure` and `SubagentCapability`. `SubagentExecutionMode`,
  `HarnessIntegrationDeclaration`, `ExtensionHarnessEntry` and the full `RequiredSemantic` /
  `FRAMEWORK_REQUIRED_SEMANTICS` vocabulary stay internal (`core/integration.ts`,
  `core/requirements.ts`). `DeclarableRequiredSemantic` is exactly the two lifecycle semantics.
- `framework/interface/command.ts` canonically owns the Command public declarations,
  implementation types, `CommandDelivery`, `ActionDelivery`, `RecognizedDirective` and
  `CanAcceptInput`. This file was required by the authoring contract's references and is the
  canonical destination the Command batch will finish against; the old `framework/public` entry
  keeps re-exporting it for the consumers that batch has not migrated yet.
- The internal modules now import the canonical declarations: `core/definition.ts` keeps only
  defaults/bound sets/resolution helpers, `core/assembly.ts` only the argument-normalization and
  mapping guards, `core/protocol.ts` only the adapter-facing and internal command-invocation types.
  Both adapters, all three extensions, scripts and tests import the canonical entries.
- The authorization boundary was tightened: extensions may no longer import `framework/core/assembly`,
  `framework/core/definition` or `framework/core/integration` — those legacy exceptions are removed
  from the import check. `framework/public` remains only for the Command runtime types and General's
  HTTP/file/config functions that their own batches still own.
- Documentation updated for the merged state: root `framework/README.md`, `framework/interface/README.md`,
  `framework/interface/session/README.md`, `framework/docs/framework-capabilities.md`,
  `framework/docs/capability-interface-architecture.md`, ADR-0002's additive status note and
  ADR-0003's authoring-entry link. No target is described as fully achieved.

## Acceptance mapping

| Ticket acceptance | Promise / partition | Evidence (actual run) | Result |
| --- | --- | --- | --- |
| Root authoring selectively provides `defineExtension` and the whole definition/implementation contract, does not aggregate capabilities; establishes the approved ownership of `ExtensionDefinition`, the configuration declaration, assembly/factory/context/implementation/initialize and `DeclarableRequiredSemantic` | P01, P05, P49 (authoring partition) | `tests/framework/import-boundary.test.ts`: “Authoring declarations are published only by the root authoring interface” (the three canonical files declare all ten names; no other file declares or exports one), “the root authoring entry composes its own contract and no capability” (exact export set; no capability name), plus the existing interface-import and Prompt/Marker-transport checks. Repository search for each declaration returns exactly one canonical declaration; `bun run typecheck` exit 0 | Pass |
| `ImplementationContext` keeps config, optional modelPrices/providerAccess and session; no `context.hostFacts` or builder; existing extensions compile and are really constructed | P06, P05 (authoring partition) | `tests/framework/implementation-lifecycle.test.ts`: the factory receives `{config, session}` with no grouped fact; a new case with harness facts receives the same query objects as `modelPrices`/`providerAccess` and exactly `{config, modelPrices, providerAccess, session}`; existing cases construct the real adapter/entrypoints. `bun run test:framework` 626 pass; real dock `binding-lifecycle.test.ts` loads the fixture through the production loader | Pass |
| The actual initialize delivery provides only owner, hasUI, feedback and subagents, observed through framework construction with no markers/internal engine/transport bypass; approved operations usable | P04 | `implementation-lifecycle.test.ts` “the initialization delivery carries the approved surface and no internal transport”: exact four keys on the constructed delivery, resolved owner/UI facts, `subagents = {mode:"none"}`, `feedback.notify` reaches the session's feedback record, recursive key scan finds no `markers`/`publishMarkers`. `pi-subagent-integration.test.ts` reads the same delivery's `subagents` for `subagents`/`none`/`failed` | Pass |
| Subagent exposes only `SubagentIntegration`, `SubagentIntegrationFailure`, `SubagentCapability`; drives subagents, normal none and failed; later child count does not move the result; no execution mode exposed | P33, P49 (Subagent partition) | `pi-subagent-integration.test.ts`: real pinned provider surface for `none` (no provider), `subagents` (announced/answered), `registration`/`identity`/`protocol` failures, and “the mode is settled once: a provider appearing later, and a child session, move nothing” (one initialization, no re-settle). `implementation-lifecycle.test.ts` “the OMP initialization is handed the adapter's settled subagent integration” observes the real OMP adapter's constant `subagents` answer on the constructed delivery. `import-boundary.test.ts` “Subagent declarations are published only by the Subagent capability interface” also asserts no interface file declares/exports `SubagentExecutionMode` | Pass |
| Configuration validation precedes the factory (a refusal never constructs); factory has no remote request/timer; one initialize completes before the first model request; no per-Session re-initialization | P34 | `implementation-lifecycle.test.ts`: validated values reach the factory; illegal configuration never reaches it; binding performs no delivery/initialization; initialization runs once at the first owner session and not for a reload/resume/inherited session; a held initialization blocks the first request until it settles; a later request does not wait again. The no-remote/no-timer rule is a contract on extension code (see limits) | Pass for framework timing/validation; factory effect-freedom is contract + unchanged consumers |
| Binding-failure cleanup, ordinary transfer without disposal, actual disposal stops delivery, a later binding uses a new instance | P35 | `implementation-lifecycle.test.ts`: refused pair cleans up once and registers nothing; another owner's/subagent's end cleans nothing; `transferred` cleans nothing; the serving owner's `disposed` cleans once and later commands/run contributions reach nothing; a later adapter binding builds and initializes a fresh instance. Real dock `binding-lifecycle.test.ts` 2 pass | Pass |
| Only the original two declarable lifecycle requirements remain; the complete `RequiredSemantic` and framework requirements stay internal; History preservation is not an author option or a startup gate | P49, P51 (authoring partition) | `interface/details/implementation.ts` declares only the two lifecycle literals; `core/requirements.ts` composes the full union behind the framework invariant and stays internal; the root-authoring export-set check excludes `RequiredSemantic`/`FRAMEWORK_REQUIRED_SEMANTICS`; `startup-requirements.test.ts` still shows a declared semantic changes no binding decision and no notice | Pass |
| Migrate this batch's framework, adapter, three extensions, script and test consumers; retire the corresponding old exports and exceptions; reuse implementation-lifecycle/subagent/binding coverage and the applicable real binding-lifecycle dock | P51 (authoring/Subagent partition), P52 (05 handoff) | Repository search after migration: no consumer reads authoring/Subagent declarations from `framework/public`, `core/definition`, `core/assembly` or `core/integration`; `framework/public` no longer exports them; both adapters' unused `ExtensionAssembly` re-exports are removed; the import check's legacy list dropped `core/assembly`, `core/definition` and `core/integration`; `bun run test:framework` (626), `test:codebase-tools` (24), `tests/model-cost` (516), `tests/connect-bot` (142), the dock (2) and `check:integrations` all exit 0 | Pass for the 05 partitions; other partitions remain open |

## Red → green and fault injection

| Slice | Evidence | Result |
| --- | --- | --- |
| Authoring/Subagent canonical ownership | Added the ownership and root-selectivity tests first; `bun test tests/framework/import-boundary.test.ts` failed with the missing `framework/interface/index.ts`, `details/` and `subagent.ts`, and with `extensions/model-cost/shared-logic/runtime.ts` bypassing the interface through `core/assembly` after the legacy exception was removed. Implemented the entries, moved the declarations and migrated consumers; the same suite then passed 15/15 | Red observed, then green |
| Initialization delivery surface | Temporarily added a `markers: {}` member to the delivery built by `initializeImplementation`; “the initialization delivery carries the approved surface…” failed with `markers` in the received key set (20 pass / 1 fail). Removed and reran green | Fault detected, then restored |
| Factory context surface | Temporarily added `hostFacts: {}` to the factory context in `bindExtension`; both context-surface cases failed with `hostFacts` in the key set (19 pass / 2 fail). Removed and reran green | Fault detected, then restored |

All injected changes were removed before the final regression runs.

## Commands and results

Final tree, run sequentially; no source or fixture was edited during these runs.

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 13 packages installed; `bun.lock` unchanged |
| `bun run typecheck` | 0 | no diagnostics |
| `bun run test:framework` | 0 | **626 pass / 0 fail**, 2880 `expect()` calls, 53 files |
| `bun run test:codebase-tools` | 0 | **24 pass / 0 fail**, 334 `expect()` calls, 7 files |
| `bun test tests/model-cost` | 0 | **516 pass / 0 fail**, 2892 `expect()` calls, 51 files |
| `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe bun test tests/connect-bot` | 0 | **142 pass / 0 fail**, 689 `expect()` calls, 18 files |
| `bun test tests/harness-dock/binding-lifecycle.test.ts` | 0 | **2 pass / 0 fail**, 24 `expect()` calls; real isolated OMP 18.5.0 baseline |
| `bun run check:integrations` | 0 | all five actual discovery entries complete or not required; declaration matching only, behavior not assessed |

## Scope limits and unverified items

- This ticket closes only its P01/P05/P49/P51 partitions and the P52 handoff for ticket 05. It does
  not close those promises globally: the Command runtime delivery narrowing, General, the internal
  port relocation, the old mixed entry's removal, the final import-exception retirement, the five
  real entry regressions and the final handoff remain later tickets. `framework/public` still
  re-exports the canonical Command types and the General HTTP/file/config functions, and the
  corresponding import exceptions (`framework/public`, `core/config`, `modules/http`,
  `modules/files`) remain, as scheduled.
- P48 terminal readability was not judged. No real provider account, external service or physical
  TUI was used. The dock ran the recorded isolated OMP 18.5.0 install against its local capture
  endpoint; it is not a provider acceptance. The pi partition is the framework suite's pi surface
  double and extension suites, not a real pi entry run.
- “The factory sends no remote request and starts no timer” is a contract on extension code: the
  framework test proves that binding itself performs no delivery/initialization and calls the
  factory only after validation. It is not a general runtime detector for arbitrary extension
  modules; the three existing factories are unchanged and their behavior partitions pass.
- The execution-mode non-exposure is enforced lexically for the interface and observed for the
  initialization result. The framework does not add a runtime query to prove the absence of a mode
  in every reachable object; that is the same lexical-alarm limitation the existing import check
  documents.
- This ticket did not run the full repository `bun run test`, the five-entry real regression or the
  final integration; those remain tickets 12/14. Focused green is not a claim of full-repository
  green.
