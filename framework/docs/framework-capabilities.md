# Semantic extension framework — capability and options index

This is the index of the framework's public authoring surface: the entry points, and the meaning and
accepted value of every parameter `defineExtension`, `ompAdapter` and the scoped `piAdapter` take. It is written for a human or
an agent that has to *find* an entry point and then read the source for detail — every symbol below is
cited to its defining file and line, and that source is authoritative for behavior, ordering and errors.

It is not the contract and not an implementation description. The promises and seams of the
first-release migrations — for connect-bot, promises P1–P48 across the real OMP extension seam (S1)
and the runtime-neutral public-interface seam (S2) — are recorded with the migration records;
terminology lives in [GLOSSARY.md](../GLOSSARY.md); the architecture decision is
[ADR 0002](../../docs/adr/0002-semantic-extension-framework.md). Only the first-release ("v1") surface is
listed: the unions below are closed, and a kind outside them is not bound.

The model-cost observation decisions (2026-10-11) revised the target placement of reusable
lifecycle logic — identity and in-flight association, generic dedup/conflict handling, and Round
open/close with the deferred end-candidate re-check belong to the framework as far as possible, while
the adapter keeps native subscriptions, field/signal mapping and capability clues. The index below
describes the implemented surface: the migration is complete, and the decisions remain the record of
why the input seam is shaped as it is.

## Entry points

All capabilities are fully encapsulated. Start with the capability entry the extension needs — for
example the [Session capability entry](../interface/session/index.ts), imported from
`framework/interface/session`. The factory hands out `context.session`, not an observation source.
State, Feedback and Provider declarations live in their own interface modules, Prompt and Marker
own their declarations in `framework/interface/prompt.ts` and `framework/interface/marker.ts`, and
the root authoring entry (`framework/interface/index.ts`) owns `defineExtension` plus the
definition/implementation contract. Subagent and Command each own their declarations too, and
Command's runtime deliveries are narrowed to the approved members. General's three modules are
direct public entries; internal adapter contracts in this index are explicitly not extension-facing
exports.

| Entry point | Source | Role |
| --- | --- | --- |
| `defineExtension(definition)` | [`framework/interface/index.ts`](../interface/index.ts), defined at [`index.ts#L26`](../interface/index.ts#L26) | Declares an extension. Returns its argument typed; nothing is validated or copied here. |
| `ExtensionDefinition`, `ExtensionConfigDeclaration`, `ConfigFieldType` | [`framework/interface/details/definition.ts`](../interface/details/definition.ts) | The definition shape and its configuration types. The definition *refers to* the capability declarations rather than owning them: the State axis (`StateDeclaration`, `StatePersistence`, `StateInheritance`) is owned by the [State capability interface](../interface/state/index.ts); `PromptDeclaration`, `PromptStrategy` and `MarkerDeclaration` by the [Prompt](../interface/prompt.ts) and [Marker](../interface/marker.ts) interfaces; and `CommandDeclaration` plus its member types by the [Command interface](../interface/command/index.ts). |
| `PromptDeclaration`, `PromptStrategy` | [`framework/interface/prompt.ts`](../interface/prompt.ts) | The injected-prompt slot and its activation rule. The run facts, contribution selection and contribution result stay internal; see [Injected prompts](#prompts-readonly-promptdeclaration). |
| `MarkerDeclaration` | [`framework/interface/marker.ts`](../interface/marker.ts) | The extension's status-marker text. The process-wide area, its ordering, projection, publication and transport stay internal; see [Marker area](#marker-markerdeclaration). |
| `defineImplementation`, `AuthoredImplementation`, `ImplementationDeclaration`, `ImplementationSubscription`, `ImplementationEventHandlers`, `ImplementationCommands`, `ImplementationAction`, `CommandImplementationHandlers`, `DirectedImplementationHandlers`, `ActionsImplementationHandlers`, `ExtensionAssembly`, `ImplementationContext`, `InitializationDelivery` | [`framework/interface/details/implementation.ts`](../interface/details/implementation.ts) | The authoring surface an extension's implementation is written against: `defineImplementation` returns an opaque callable factory whose `.declaration` is the canonical static object — `create(context)` builds the one business state, and subscription groups, command slots, the catalog selector and the one-time `initialize`/`cleanup` name handlers that receive it. The context carries the validated configuration, the harness's model prices and provider access under their own names, and the Session capability (`context.session.observations` for reads and `context.session.recordCommit` for stating that a session's own write really landed). Initialization delivery carries `owner`, `hasUI`, `feedback` and `subagents`; source analysis derives the integration dependencies. The resolved `ExtensionImplementation` shape is internal. |
| `SubagentIntegration`, `SubagentIntegrationFailure` | [`framework/interface/subagent.ts`](../interface/subagent.ts) | The settled initialization integration result (`subagents`, normal `none`, or `failed` with its part and diagnosis). Integration demand is source-derived; execution mechanisms remain adapter-owned. |
| `SubscriptionGroup`, `ObservationScope` | [`Session subscriptions`](../interface/session/subscriptions.ts) | The one-time declaration of what a subscription observes: a group carries the scope it covers (`owner` — the owner session's own deliveries; `session` — every actual session the adapter reports, with that session's own identity, direct parent, latest name, the handle of the task it was spawned for, the name and id of the agent it runs and, on the delivery that announces its own start, the model and effective level it began on) and the handlers for the event kinds it subscribes. Both scopes run through the one dispatch, and widening a group to `session` grants no State write and no external-effect authority. |
| `SessionFacts`, `SessionStartup`, `TurnEvent`, `TurnStartDelivery`, `TurnEndDelivery`, `TurnStartFacts`, `TurnEndFacts`, `TurnUsage`, `TurnOutcome`, `ProviderHttpFacts`, `CatalogPrice`, `CatalogPriceSource`, `ProviderAccess`, `ProviderAccessFacts` | [`Session facts`](../interface/session/details/facts.ts), [`Turn`](../interface/session/details/turn.ts), [`Provider`](../interface/provider/index.ts) | The per-actual-session facts and the Turn axis: a session's identity, direct parent, latest name, the handle of the task it was spawned for (a subagent's own name for its work, which is neither the agent definition it runs nor the id its registry uses), the name and id of the agent it runs, and the optional `SessionStartup` — the model and effective level the session began on, reported on its own start alone and never rewritten; the two Turn edges with the request-time facts fixed at the first and repeated at the second; the reliable-or-unavailable usage, outcome, HTTP facts and the two provider reference ids; and the extension's own catalog the framework queries at each request's start. Native `TurnSignal` / `TurnSignalFacts` remain internal adapter contracts, not Session consumer exports. See [The Turn axis and the two observation scopes](#the-turn-axis-and-the-two-observation-scopes). |
| `CommandImplementations`, `CommandImplementation`, `CommandAction`, `ActionsCommandImplementation`, `ActionDelivery` | [`Command interface`](../interface/command/index.ts) | What an implementation delivers for one command: a directed implementation under its command name, or an `actions` command's table of named actions. An action may return a promise the host's command chain waits for, and its delivery is the invocation facts alone — the argument, the owner, `hasUI`, the idle query, the running session's `provider` and the feedback channel — with no declared-value seam, retained capability, persistence path or marker transport, because an `actions` command drives no State and owns no area line. |
| `ompAdapter(definition, options?)` | [`adapters/omp/index.ts`](../../adapters/omp/index.ts) | Assembles a definition for the `omp` harness; returns an `OmpExtensionFactory`. Also re-exports `BindingResult`, which is what that factory returns. |
| `piAdapter(definition, options?)` | [`adapters/pi/index.ts`](../../adapters/pi/index.ts) | Uses the same `ExtensionAssembly`, `StateStore` and binding behaviors for pi. Maps the session boundaries, the run-cycle facts the Round axis is synthesized from, Turn signals, user input, commands, hidden persisted prompt messages, marker and feedback. Catalog, provider-access and viewed-session outlets are provided only where pi's own surface states them. |
| `ExtensionAssembly` | [`framework/interface/details/implementation.ts`](../interface/details/implementation.ts) | The harness-independent assembly information, every member optional (`implementation`, `configBaseDir`). `implementation` is the result of `defineImplementation`, never a raw factory function. Harness version support is deliberately not one of them either: support is an evidence claim recorded in the repository's support record ([`harness-support.md`](harness-support.md)), and no assembly supplies or widens it. |
| `BindingResult`, `BindingFailure` | [`framework/runtime/port.ts`](../runtime/port.ts) | What a binding concluded, and why it was refused. |
| `DirectedCommandImplementation`, `CommandDelivery`, `DeclaredValueSeam` | [`command/details/implementation.ts#L81`](../interface/command/details/implementation.ts#L81), [`#L137`](../interface/command/details/implementation.ts#L137), [`State interface`](../interface/state/index.ts) | The implementations an assembly injects for a definition's directed commands, keyed by command name — each with a `run` member and an optional `unrecognized` member for an argument that parsed to no directive — and the delivery and declared-value seam each one writes through. The delivery is explicitly constructed from its approved members (`args`, `canAcceptInput`, `provider`, `owner`, `feedback`, `hasUI`, `state`, `capability`); the adapter's persistence callback and the marker area transport stay internal. The old `CommandActions` combination type was removed after its last consumer check found none. |
| `RecognizedDirective`, `DirectedDirective` | [`command/details/implementation.ts#L69`](../interface/command/details/implementation.ts#L69), internal [`control.ts`](../behaviors/control.ts) | The directive a directed command's `run` receives, and the internal normalization result that also carries the unrecognized text. `DirectedDirective` is not extension-facing. |
| `OwnerCapabilityHandle` | [`State interface`](../interface/state/index.ts) | The owner-scoped capability a handler may retain — the declared-value seam plus the unified feedback channel, bound to the owner its delivery resolved — for the effects it drives after the delivery is over (a heartbeat timer, an outbound flusher). Valid while its owner lives, inert afterwards; carries no `hasUI`. See [Owner-scoped effect capabilities](#owner-scoped-effect-capabilities). |
| `SessionEvent`, `SessionStartReason`, `SessionEndReason` | [`Session facts`](../interface/session/details/facts.ts), [`events`](../interface/session/details/session.ts) | The session axis of the semantic lifecycle: the symmetric `session_start`/`session_end` pair and the reason vocabulary each member carries, plus `session_facts` — the one session delivery that is not a boundary, reporting a session's own facts where the harness learned they changed (a rename, most often) and reconciling nothing. |
| `RoundEvent`, `RoundDelivery`, `RoundObservation` | [`Round interface`](../interface/session/details/round.ts), internal [`adapter observations`](../runtime/port.ts) | The round axis of the semantic lifecycle: the edge-triggered `round_start`/`round_end` pair (with confirmed/truncated ending), the facts one edge carries, and the actual session (`SessionFacts`) it came from — plus the native run-cycle observation an adapter reports instead of an edge, which carries the harness's continuation flag and the live quiescence read the re-check asks. The framework mints and retires the round's identity per actual session from the edges its own synthesis dispatches; the identity is what a Turn's start facts name as the round it belongs to. An edge a session's disposal closed carries the close-out's own wait (`CloseOutWait`: the budget, its deadline and what is left of it, fifteen seconds by default), which is what a consumer owing an asynchronous effect bounds that effect's wait by. |
| `SemanticEvent`, `SemanticEventHandlers`, `SemanticEventDeliveryMap` | [`Session subscriptions`](../interface/session/subscriptions.ts) | All session-scoped event kinds as one handler surface: the event union (session, round, activity, Turn, input, context and a session's own confirmed storage write), the handler map an implementation delivers for one subscription group keyed by event, and the map that keeps each kind paired with the delivery it carries. Which deliveries reach a handler is the group's declared `ObservationScope`, not this type. |
| `AgentActivity`, `SessionActivityEvent`, `SessionActivityObservation`, `SessionActivityDelivery` | [`Session activity`](../interface/session/details/activity.ts) | The activity axis of the semantic lifecycle: one actual session's current agent activity (`working`/`idle`), the one event kind `session_activity`, the observation that states it — the session's own facts, the owner scope it concerns, the reading, `hasUI` and the feedback channel — and the delivery that carries the reading to a handler. It is *derived*: the framework states it from the round transitions its own synthesis dispatches (a Round it holds open is that session working, a Round it confirmed ended is idle), delivering it only where the reading moved, and the same shape is what a reading obtained elsewhere (another process's session, through the framework's local access) arrives in. See [The activity axis](#the-activity-axis). |
| `SessionContextEvent`, `SessionContextDelivery`, `SessionContextHandler(s)`, `SessionContextReading` | [`Session context`](../interface/session/details/context.ts); internal adapter observation in [`port`](../runtime/port.ts) | The context axis of the semantic lifecycle: one *collected* reading of one session's own context — the tokens its conversation held and the provider/exact model it ran at that instant — reported by an adapter at its own collection points (the session's start, a finalized message, the run's own execution convergence) and delivered to a subscribing group as the change it is. A host that states an unknown count (pi's `null`) reports no collection rather than a reading of zero. |
| `SessionCommitEvent`, `SessionCommitObservation`, `SessionCommitDelivery`, `SessionCommitHandler(s)` | [`Session commit`](../interface/session/details/commit.ts) | The commit axis of the semantic lifecycle: one actual session's own confirmed write of its extension data, as the process that ran it states it. The observation carries the session's own facts, the owner, the running count of confirmed writes, `hasUI` and the feedback channel — and nothing the storage holds, so a subscriber that adopts it reads the storage itself. It is delivered where the count moved, mints no Round, Turn or accounting fact, and is stated by the extension through `ImplementationContext.session.recordCommit`. |
| `SessionCapability`, `SessionObservationReader`, `SessionObservation` | [`Session capability`](../interface/session/index.ts), [`current observations`](../interface/session/observation.ts) | The authored implementation's `create` supplies `context.session`, never an observation source constructor. `observations.read` and `snapshot` return isolated current readings, including observations collected before attaching. Missing observations are not Idle or zero. `recordCommit` states a confirmed write without saving or carrying business content. Source mutation, ordering and withdrawal stay internal; a lost source withdraws live readings but not a confirmed write. See the [Session capability entry](../interface/session/index.ts). |
| `SessionEventHandlers`, `SessionEventHandler`, `SessionEventDelivery`, `RoundEventHandlers`, `RoundEventHandler`, `SessionActivityEventHandler`, `SessionActivityEventHandlers`, `TurnEventHandlers`, `TurnEventHandler`, `UserInputEventHandler`, `UserInputDelivery`, `SessionContextHandler`, `SessionContextDelivery`, `SessionCommitHandler`, `SessionCommitHandlers` | [`Session events and per-kind contracts`](../interface/session/index.ts) | The per-axis handler aliases, keyed by event, and the delivery each one receives — the session axis's delivery carries the actual session's facts and the owner-scoped capability, while the round, activity, Turn, input, context and commit deliveries carry their own facts and no capability. A handler may return a promise: the framework contains its rejection the way it contains a synchronous throw, and does not wait for it. All of these are public authoring types ([`framework/interface/session`](../interface/session/index.ts)), not adapter exports. |
| Verification vocabulary (`RequiredSemantic`, `FRAMEWORK_REQUIRED_SEMANTICS`) | [`framework/core/requirements.ts`](../core/requirements.ts) | Internal behavior-verification names and the framework's history-preservation invariant. Extension dependency inventories are source-derived, not public assembly requirement arrays. No runtime switch. |
| `ConfigurationViolation` | [`framework/core/violations.ts`](../core/violations.ts) | The report of one broken configuration rule, carried by a `configuration` binding failure: a `ConfigurationViolationKind` and the deterministic `detail`. |
| `ExtensionConfigDeclaration`, `ConfigFieldType`, `BOUND_CONFIG_FIELD_TYPES` | [`framework/interface/details/definition.ts`](../interface/details/definition.ts) for the declarations; [`framework/core/definition.ts#L66`](../core/definition.ts#L66) for the internal bound set | The configuration an extension requires of its own `config.yaml`: the file's path, and the keys the file must carry with the type each must match. See [Extension configuration](#extension-configuration-declaration--file). |
| `getConfig`, `ExtensionConfigError` | [`framework/interface/general/config.ts`](../interface/general/config.ts), implemented at [`framework/core/config.ts`](../core/config.ts) | The framework's general configuration module: the one call shared logic imports directly, which reads the values the definition's own file was validated to carry in this process, and the misuse failure it may recognize. `getConfig` and `ExtensionConfigError` are the entry's runtime exports; the error class is canonical in the adjacent `config-contract.ts`, so the implementation throws the same identity a consumer checks. See [Extension configuration](#extension-configuration-declaration--file). |
| `readConfig`, `ConfigSource`, `ConfigReadOptions`, `ConfigReader`, `ConfigParser`, `ConfigLoadError`, `readConfigDocument`, `isScheduledWait`, `SCHEDULED_WAIT_TEXT`, `describeValue` | [`framework/core/config.ts`](../core/config.ts) | The internal loading implementation: the injectable reader/parser/base-directory seam, the one reading and validating code path, the shared-configuration document reader, the waiting-budget vocabulary and the value-description helper. None of them is extension-facing; a loading-time failure is a `ConfigLoadError` whose `detail` binding turns into a configuration failure. |
| `request`, `HttpRequestOptions`, `HttpConfigurationError` | [`framework/interface/general/http.ts`](../interface/general/http.ts), implemented at [`framework/modules/http.ts`](../modules/http.ts) | The framework's general HTTP module: the one call shared logic imports directly, what a request declares (method, headers, body, `timeoutMs`, `proxy`), and the configuration failure a request may reject with before anything is sent. It is a value — `request` is one of the entry's runtime exports. See [General HTTP module](#general-http-module). |
| `updateFile`, `SafeFileUpdateOptions`, `SafeFileUpdateError`, `SafeFileUpdateFailureKind` | [`framework/interface/general/files.ts`](../interface/general/files.ts), implemented at [`framework/modules/files.ts`](../modules/files.ts) | The framework's general safe-file module: the one coordinated read-modify-publish call shared logic imports directly, the absolute target and update function it takes, the wait budget and abort it accepts, and the distinguishable failure a refused coordination rejects with. `updateFile` and `SafeFileUpdateError` are the entry's runtime exports. See [General safe-file module](#general-safe-file-module). |
| Adapter-facing delivery types (`NoticeTransport`, `MarkerTransport`, `StateValues`, `TurnSignal`, `TurnSignalFacts`); `FeedbackLevel` and `FeedbackTransport` are canonical in the [Feedback interface](../interface/feedback/index.ts), and `OwnerReference` in the [State interface](../interface/state/index.ts) | [`framework/runtime/port.ts`](../runtime/port.ts) | The facts and transports a harness adapter resolves; not authored by an extension. `HarnessPort.onTurn` ([`port.ts`](../runtime/port.ts)) is the hook an adapter reports its mapped model-cycle facts through, and `HarnessPort.onRound` ([`port.ts`](../runtime/port.ts)) the hook it reports its run-cycle facts through for the round axis's own synthesis. |

A real, minimal consumer is the codebase-tools extension: the shared declaration is
[`extensions/codebase-tools/definition.ts`](../../extensions/codebase-tools/definition.ts), its OMP assembly is
[`extensions/codebase-tools/harnesses/omp.ts`](../../extensions/codebase-tools/harnesses/omp.ts), and the discovery
entrypoint that re-exports it is [`entrypoints/omp/codebase-tools.ts`](../../entrypoints/omp/codebase-tools.ts).
The same declaration is connected to `piAdapter` by
[`extensions/codebase-tools/harnesses/pi.ts`](../../extensions/codebase-tools/harnesses/pi.ts), exposed through
[`entrypoints/pi/codebase-tools.ts`](../../entrypoints/pi/codebase-tools.ts). Its first import initializes the
adapter's scoped Node Markdown loader before loading the shared definition. pi has no native extension-label
surface: the binding label is used for diagnostics, not pi's unrelated session-entry labels. See the
[pi support evidence](harness-support.md#pi-codebase-tools-adapter-evidence) for verified scope and runtime limits.

## `defineExtension(definition)`

`definition` is an `ExtensionDefinition` ([`details/definition.ts#L58`](../interface/details/definition.ts#L58)): plain data,
no builder and no handler. All fields are described below. `state`, `commands`, `prompts`, `marker` and
`config` are optional; `id` and `displayName` are required. Integration demand is derived from source.

### `id: string`

Stable extension identity. It is also the prefix of every contribution identity: a prompt slot's framework
identity is `${id}:${tag}` ([`interface/prompt.ts`](../interface/prompt.ts)).

### `displayName: string`

Human-readable name used for the extension's label and the text of its notifications (for example the
toggle's enabled/disabled notice).

### Source-derived integration contracts

Extension demand comes from actual definitions, canonical static authoring and framework interface
use, not manually synchronized requirement arrays. The former subagent-only requirement and adapter
inventory lists are removed. The shared framework planner expands subscription, command, prompt,
marker and lifecycle structure; explicit semantic rules cover indirect observations and other
framework-mediated uses. Native widgets and general HTTP/files/config modules do not become adapter
requirements.

```sh
bun run check:integrations --extension model-cost --demand-only
bun run check:integrations --extension model-cost --adapter pi --json
bun run check:integrations
bun run generate:integrations --extension codebase-tools --adapter new-harness --dry-run --json
bun run generate:integrations --extension codebase-tools --adapter new-harness
```

No working reference harness or target discovery entry is needed. With no selection, checking scans
extension/adapter directory pairs; `--extension` and `--adapter` also accept source paths. `--root`
selects a fixture/project root. Adapter source paths select their owning `adapters/<name>/` directory;
generation rejects targets outside that tree. Modules, business constructors and handlers are never executed;
configuration is not read, runtime branch combinations are not explored, and behavior tests are not
invoked. Static authoring analysis is reused rather than interpreting arbitrary JavaScript.

Each contract includes its requirement policy, source locations and dependency path. Adapter supply
is derived from the actual `defineAdapterPort` assembly and reachable canonical delivery construction,
not a separate declaration catalog. For selected ports with explicit canonical payload construction,
required payload members are derived from `AdapterDeliveryMap`, so framework-needed callbacks are
checked even when the extension never reads them directly. A function body is not examined to guess
whether it really implements native behavior. Results distinguish provided, unavailable, conditional,
missing and unresolved supply. A query that sometimes returns no fact is not the same as a missing query.
Conditional integration is not a guarantee of required availability. Unknown analysis never counts
as complete. Dynamic member selection on a tracked capability, an unmapped context/Session member,
or exhausted function traversal produces an explicit diagnostic. Ordinary dynamic indexing of business
data is not subject to those capability-structure restrictions. Exit codes are `0` complete (explicit optional absences allowed), `1` required gaps or
unresolved analysis, and `2` invocation/infrastructure failure. JSON uses `stage: "integration-contracts"`
and `behaviorTestsRun: false`.

Generation analyzes current source again. It selects confirmed missing required contracts by default;
`--include-optional` also selects known optional absences. It preserves supplied implementations and
refuses unsafe/ambiguous edits. Preview is read-only. Generated code references missing implementation
exports in the real assembly; it does not create an implementation module, empty function, throwing
stub, `declare` or second copy of framework signatures. A new adapter must also satisfy all required
`HarnessPort` members. Generated code intentionally cannot compile until a human or agent provides
real implementations with the required exports and types. Repeated generation must not duplicate
imports or overwrite existing implementation files.

Type and structural completeness do not establish correct native mapping. A no-op can satisfy a type;
reviewers, agents and behavior verification remain responsible for semantic correctness. Neither
command installs a harness, promotes support, reads a verification report or changes extension loading.
See [the refactor and generation boundary](integration-contract-refactor.md) and
[contract-driven upgrade review](harness-support.md#contract-driven-agent-pre-review).

### Adapter implementation navigation

Start with the contract reported by the checker, then the matching `adapters/<harness>/internal/port.ts`
actual assembly and its referenced domain implementation. The following is a navigation convention,
not a one-capability/one-file rule. Shared logic consumes framework interfaces, never these native modules.

| Existing requirement | Native implementation neighbourhood | Framework-owned implementation |
| --- | --- | --- |
| `extension-loading` | pi [`domain/subagent/effects.ts`](../../adapters/pi/domain/subagent/effects.ts) and the assembly's child entry; OMP uses its native integrated loading path | Declaration matching stays offline; loading a child is not a second extension business implementation. |
| `session-facts` | OMP [`domain/session/queries.ts`](../../adapters/omp/domain/session/queries.ts), pi [`domain/session/queries.ts`](../../adapters/pi/domain/session/queries.ts) | Owner/State and observation consumers use the common fact vocabulary. |
| `turn-usage` | [`omp/domain/session/turn.ts`](../../adapters/omp/domain/session/turn.ts), [`pi/domain/session/turn.ts`](../../adapters/pi/domain/session/turn.ts) | [`behaviors/turn-events.ts`](../behaviors/turn-events.ts) owns Turn association and deduplication. |
| `session-lifecycle` | OMP [`domain/session/events.ts`](../../adapters/omp/domain/session/events.ts), pi [`domain/session/events.ts`](../../adapters/pi/domain/session/events.ts), each harness's `domain/session/round.ts` | [`behaviors/binding.ts`](../behaviors/binding.ts) and [`round-events.ts`](../behaviors/round-events.ts) own delivery and Round transitions. |
| `session-observations` | OMP [`domain/context/events.ts`](../../adapters/omp/domain/context/events.ts) and [`domain/context/queries.ts`](../../adapters/omp/domain/context/queries.ts), pi [`domain/context.ts`](../../adapters/pi/domain/context.ts), `domain/session/` and necessary native subagent facts | [`core/observations.ts`](../core/observations.ts) and the activity/context behaviors own unified readings. |
| `storage-commit` | Actual-session facts and the selected native subagent access mode, connected in the harness entry | [`core/subagent-access.ts`](../core/subagent-access.ts) and [`modules/local-access.ts`](../modules/local-access.ts) carry confirmed notices; business storage stays extension-owned. |
| `state-follow` | Session/Owner facts; pi's child integration when applicable | [`core/state.ts`](../core/state.ts), [`subagent-access.ts`](../core/subagent-access.ts) and [`followed-owners.ts`](../core/followed-owners.ts) own live following. |

The complete domain map below applies to both harnesses. A root-level domain file is a simple
mapping, not an alternative technical taxonomy; only domains with collaborating implementations
need a directory. Extension-specific presentation stays outside these adapters.

| Domain | Mapping responsibility | OMP | pi |
| --- | --- | --- | --- |
| Session | Events, identity/startup/branch queries, native State entry effects; owns Turn and Round | [`domain/session/`](../../adapters/omp/domain/session/) | [`domain/session/`](../../adapters/pi/domain/session/) |
| Context | Context-reading observations; current-context and idle reads where needed | [`domain/context/events.ts`](../../adapters/omp/domain/context/events.ts), [`domain/context/queries.ts`](../../adapters/omp/domain/context/queries.ts) | [`domain/context.ts`](../../adapters/pi/domain/context.ts) |
| Subagent | Native parent/ancestor relations and integration-state queries; provider protocol events and registration effects where needed | [`domain/subagent/queries.ts`](../../adapters/omp/domain/subagent/queries.ts) | [`domain/subagent/events.ts`](../../adapters/pi/domain/subagent/events.ts), [`domain/subagent/queries.ts`](../../adapters/pi/domain/subagent/queries.ts), [`domain/subagent/effects.ts`](../../adapters/pi/domain/subagent/effects.ts); [`domain/subagent/integration.ts`](../../adapters/pi/domain/subagent/integration.ts) owns their shared lifetime |
| Provider | Catalog price queries and current provider address/credential queries, mapped to framework facts | [`domain/provider.ts`](../../adapters/omp/domain/provider.ts) | [`domain/provider.ts`](../../adapters/pi/domain/provider.ts) |
| Control | Native command registration and invocation mapping | [`domain/control.ts`](../../adapters/omp/domain/control.ts) | [`domain/control.ts`](../../adapters/pi/domain/control.ts) |
| Prompt | Native run-initiation mapping and injected-message result | [`domain/prompt.ts`](../../adapters/omp/domain/prompt.ts) | [`domain/prompt.ts`](../../adapters/pi/domain/prompt.ts) |
| Feedback | Extension feedback and framework notice effects; UI or stderr | [`domain/feedback.ts`](../../adapters/omp/domain/feedback.ts) | [`domain/feedback.ts`](../../adapters/pi/domain/feedback.ts) |
| Marker | Marker area widget effect; absent on surfaces without UI | [`domain/marker.ts`](../../adapters/omp/domain/marker.ts) | [`domain/marker.ts`](../../adapters/pi/domain/marker.ts) |

Subagent relations are not Session identity: Session consumes those relations for its own facts and
Owner mapping. OMP observes child Session/Turn/Round through the same subscriptions as main sessions,
so it has no separate Subagent `events.ts`; pi additionally reads its provider's announcements and
replies. Offline supply analysis follows the actual port assembly, not separately maintained inventories.
The third-party loader under pi `domain/subagent/internal/` is private provider-resolution implementation.

Each adapter root has exactly three entries: `index.ts`, `internal/`, and `domain/`. Only
`domain/` holds capability domains; the other two are structural support.

- `index.ts` is the adapter's public assembly entry. It exports `ompAdapter`/`piAdapter`, builds the
  process-scoped readers and creates the shared binding; extension assemblies import this module.
- `internal/port.ts` is the per-binding implementation of the framework's `HarnessPort`. It connects the
  domain mappings to the framework hooks and owns binding-scoped cross-cutting state (newest native
  context, diagnostic deduplication, owner resolution). It carries no capability of its own.
- `internal/` is private adapter implementation support: host API type declarations, pi's Node text
  loader, pi's third-party provider loader, and the per-binding `port.ts` composition. It is not a
  capability surface.

Only the nine domain rows above are capability domains. A simple domain may be one file; a domain
with collaborating mappings gets a directory. `index.ts` remains at the adapter root because it is
the import path extension assemblies use; it is a structural entry, not a missing domain.
Prefer domain locality over the native object's name. Turn and Round belong under Session. Within a domain, `events.ts` owns event mappings, `queries.ts` owns native reads,
and `effects.ts` owns native effects when these responsibilities need separate implementation files.
Session event construction stays in its event mapping rather than being rebuilt in the port; State
entry writes are a Session effect, not a second State implementation. Keep simple domains as single
files, retain complex Turn/Round protocols internally, and create no forwarding-only entry files or
empty three-file templates. The two harnesses need not be structurally identical.

The shared [`behaviors/assembly.ts`](../behaviors/assembly.ts) creates the observation source and
State store and reuses an implementation until disposal. Harness entries assemble native modules;
pi retains native shutdown release ordering after binding. This adds no capability registry,
automatic requirement inference or runtime negotiation. Configuration remains `framework/config.yaml`.

### `state?: StateDeclaration`

The State the extension declares ([`State interface`](../interface/state/index.ts#L47)). v1 owns exactly one
boolean activation field per extension, and the field name is also the persistence key for its value whenever the
field is persisted. The declared axes are independent: the control kind decides how a command drives the field,
persistence decides whether the value is recorded in the owner's medium and seeded from a branch, and inheritance
decides whether a subagent reads the owner's current value or the field's declared default.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `field?` | `string` | The activation field name. Defaults to `DEFAULT_ACTIVATION_FIELD` = `"enabled"` when `state` is omitted ([`definition.ts#L39`](../core/definition.ts#L39), resolved by `activationField` at [`definition.ts#L75`](../core/definition.ts#L75)). |
| `persistence?` | `"session-entry"` \| `"memory"` | Whether the value is recorded in the owner's persistence medium and seeded from the target branch at a session boundary (`session-entry`, the default, [`definition.ts#L16`](../core/definition.ts#L16)) or kept in memory only (`memory`: never recorded, never seeded; a boundary that replaces the owner drops it to the declared default, while navigation that keeps the owner keeps the value). Resolved by `statePersistence` ([`definition.ts#L80`](../core/definition.ts#L80)). |
| `inheritance?` | `"follow"` \| `"none"` | How a subagent session reads the value: `none` (the default, [`definition.ts#L19`](../core/definition.ts#L19)) reads the field's declared default, `follow` reads the owner's current value live. Resolved by `stateInheritance` ([`definition.ts#L85`](../core/definition.ts#L85)); codebase-tools declares `follow` ([`extensions/codebase-tools/definition.ts`](../../extensions/codebase-tools/definition.ts)). |

**Bound set.** `BOUND_STATE_PERSISTENCES = ["session-entry", "memory"]`
([`definition.ts#L28`](../core/definition.ts#L28)) and `BOUND_STATE_INHERITANCES = ["follow", "none"]`
([`definition.ts#L36`](../core/definition.ts#L36)): a value outside them is refused at binding as an
`initialization` failure, never silently read as the default one.

### `commands?: readonly CommandDeclaration[]`

The extension's control commands. `CommandDeclaration` is the closed union of the three bound control kinds
([`command/details/definition.ts#L94`](../interface/command/details/definition.ts#L94)); `ControlKind` is its discriminant. The control kinds
share a name, a description and a command surface; what they drive differs:

| Parameter | Type | Meaning |
| --- | --- | --- |
| `type` | `"toggle"` \| `"directed"` \| `"actions"` | The control kind; see the three kinds below. |
| `name` | `string` | Command name, without the leading slash. |
| `state` | `string` | The State field this command drives — `toggle` and `directed` only. |
| `description?` | `string` | Human-readable description, shown wherever the harness lists commands. |
| `actions` | `Record<string, string>` | The declared action names and the words the help shows for each — `actions` only. |

| `type` | Behavior | Source |
| --- | --- | --- |
| `"toggle"` | Alternates the field between its two values on successive executions, and publishes the extension's activation feedback (`<displayName> enabled`/`disabled`) on the delivery's extension feedback channel at `info` severity. | [`command/details/definition.ts#L16`](../interface/command/details/definition.ts#L16) |
| `"directed"` | Names its target value explicitly and repeats its side effect on every execution: the framework never deduplicates, short-circuits or serializes it, so idempotence is the extension's, and the write is its injected implementation's. | [`command/details/definition.ts#L45`](../interface/command/details/definition.ts#L45) |
| `"actions"` | Offers a declared table of named actions. The framework trims the argument, ignores case and matches it **whole**: empty prints the help, a match runs that action and waits for it, and anything else prints the same help at `error` severity and runs nothing. No abbreviation, no extra argument, no default action, and the directed kind's `unrecognized` member is deliberately not consulted. An `actions` command drives no declared State. | [`command/details/definition.ts#L76`](../interface/command/details/definition.ts#L76) |

**Bound set.** `BOUND_CONTROL_KINDS = ["toggle", "directed", "actions"]`
([`definition.ts#L53`](../core/definition.ts#L53)); deeper argument grammars, flags, numeric arguments
and aliases remain deferred. A kind outside the bound set is refused at binding, not silently dropped. (One
extension, one command name, one declared writer per State field — see `ConfigurationViolation` below.)

**Directed commands pair a declaration with an authored implementation slot.** The definition names the
command and its field; the implementation arrives as the authored declaration's `commands` entry
([`implementation.ts`](../interface/details/implementation.ts)). Binding refuses a directed declaration whose
implementation was not injected — an `initialization` failure, with nothing registered — so a command the user
can run always has something to run.

The framework then normalizes the argument into a `DirectedDirective`
([`port.ts`](../runtime/port.ts)): `{ kind: "activate" }` for the empty argument,
`{ kind: "deactivate" }` for `off`, and `{ kind: "unrecognized"; argument }` for anything else. A recognized
directive runs `DirectedCommandImplementation.run` with a `CommandDelivery`. An unrecognized argument is not a
directive: the framework records no value and publishes nothing, and hands the text verbatim to the
implementation's optional `unrecognized` member ([`command/details/implementation.ts#L81`](../interface/command/details/implementation.ts#L81)) so the
extension that owns the words can answer a mistyped argument. An implementation that injects no such member
leaves the argument inert, which is what makes the addition compatible with implementations that predate it. A
directed command publishes no framework feedback at all — its operator-facing text belongs to the extension,
which publishes it on the delivery's extension feedback channel at the severity it chooses.

**An `actions` command routes, awaits and reports.** Its implementation is a table of functions keyed by
declared action name ([`command/details/implementation.ts#L41`](../interface/command/details/implementation.ts#L41)); binding refuses a declaration whose table
lists an action with no function behind it, or an implementation of the directed kind
([`binding.ts#L234`](../behaviors/binding.ts#L281)). Routing, the help text and the failure report are the
framework's own ([`actions.ts#L52`](../behaviors/actions.ts#L52)): an action may return a promise and the
command concludes only when it settles — the host's command chain receives that promise, so an operator's
command finishes with the effect rather than beside it — and a synchronous throw or a rejected promise is
reported once, at `error` severity, as `/<name> <action> failed: <detail>`. The framework retries nothing,
rolls nothing back and reports no success: an action that succeeded says so itself on the delivery's feedback
channel. Its delivery ([`command/details/implementation.ts#L185`](../interface/command/details/implementation.ts#L185))
is the invocation facts alone — the argument, the owner scope, `hasUI`, the idle query, the running
provider and the feedback channel — because an `actions` command drives no declared State and therefore
has no seam, capability, persistence path or area transport to carry.

**The implementation owns the write.** A delivery that carries the declared-value seam
([`State interface`](../interface/state/index.ts)) reads the owner's current value on every call: `read()` is
live, so a read after a write observes that write, and a handler that needs the value it saw before writing
keeps it itself. `write(value)` is the only path that records the field — the framework writes nothing before,
after or instead of it, so a handler that never writes leaves the value alone. The write becomes the owner's
current value first, is then recorded best-effort in the owner's persistence medium (never for a `memory`
field), and finally publishes the framework-owned marker area ([`port.ts`](../runtime/port.ts)),
which is why a write of `false` removes the extension's line. The same seam serves every handler delivery that
carries one, so the write authority has one implementation whatever the control kind.

**The delivery also carries a capability the handler may retain.** `delivery.capability`
([`OwnerCapabilityHandle`](../interface/state/index.ts#L118)) is the same declared-value write and the same
feedback channel this delivery uses, bound to the owner it resolved, so an extension whose effects outlive the
delivery — the heartbeat timer that disarms it, the outbound flusher — keeps that handle in its own owner-keyed
record instead of asking the framework for an owner-resolving write or feedback API. It is valid for the
owner's life and no longer: the boundary that retires the owner's cell revokes it, so a late callback's write is
a no-op that neither recreates State nor republishes the marker area and its feedback is dropped. It carries no
`hasUI`. See [Owner-scoped effect capabilities](#owner-scoped-effect-capabilities).

### `prompts?: readonly PromptDeclaration[]`

The injected-prompt slots ([`interface/prompt.ts`](../interface/prompt.ts)). A slot's framework
identity is `${definition.id}:${tag}`; its visibility, delivery position and retention are framework-owned
and are not parameters.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `tag` | `string` | The slot's identity within the extension; with `id` it forms `${id}:${tag}`. One rule per slot. |
| `strategy` | `PromptStrategy` | When the slot contributes (see below). |
| `content` | `string` | The text the slot contributes. |

`PromptStrategy` ([`interface/prompt.ts`](../interface/prompt.ts)) — both members are bound
(`BOUND_PROMPT_STRATEGIES`, a framework-internal set at [`definition.ts#L63`](../core/definition.ts#L63)):

| Value | Meaning |
| --- | --- |
| `"first-enabled-run"` | Contributes while the current branch does not yet carry the slot's identity. |
| `"every-enabled-run"` | Contributes on each enabled run. |

### `marker?: MarkerDeclaration`

The extension's status-marker text ([`interface/marker.ts`](../interface/marker.ts)). Placement,
ordering and lifecycle are framework-owned; the extension supplies only the text. The area's transport
stays internal and is absent from every extension delivery. The area is one per
process rather than one per module instance: it is registered on the process global under a well-known
symbol, so it stays single even when the adapter layer's loader evaluates its own copy of the framework
module graph for each extension.

What the area carries is the *displayed* session's own effective State — the session the host is showing,
re-read at every publication when its adapter publishes a `viewedSession` ([`port.ts`](../runtime/port.ts)),
and otherwise the position the delivery itself carries. A marker line is therefore the extension's value for
that seat under the same per-field inheritance rule as everywhere else: the seat that is the owner reads its
own cell, a seat that is a subagent reads the owner's *current* value only for a field that declares `follow`
and otherwise that field's declared default. Two extensions rendering in one session never overwrite each
other, an extension never names the widget, and being looked at makes no session an owner: a view moves the
rendering and nothing else.

One extension bound by several sessions registers once per binding — the loader evaluates an extension's
module graph for each session's runner, and each binding keeps its own State ([`state.ts`](../core/state.ts)) —
so a seat is answered by the newest registration whose store *serves* the Owner that seat names. A binding of
a session nobody is displaying never served that Owner, so it can neither empty the area nor answer with its
own value, and an Owner whose session ended still belongs to the store that served it rather than to a
leftover registration of an earlier session that held the same key. A store that *follows* an Owner answers
for it too, once it has read it: a value that changes in the process serving that Owner has no transition
here to publish the change, so the run initiation in the following process publishes the area it would
render either way — the line appears and disappears with the Owner's value rather than staying at what the
first publication made it. A store that has not read the Owner answers for nothing, so the first run that
reads it publishes nothing of its own.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `text` | `string` | The marker text rendered in the framework's unified marker area. |

### `config?: ExtensionConfigDeclaration`

The configuration the extension requires of its own file
([`definition.ts#L46`](../interface/details/definition.ts#L46)). Omitted — the case for every extension so far —
means the extension reads no configuration at all and the capability is invisible to it.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `path?` | `string` | The file's path, relative to the **configuration base directory** the assembly supplies (`ExtensionAssembly.configBaseDir`); the convention `extensions/<definition.id>/config.yaml` when omitted. An absolute path is used as declared, and with no base directory a relative path resolves against the process's working directory. |
| `fields` | `Readonly<Record<string, ConfigFieldType>>` | Every key the file must declare, with the type it must match: `"string"`, `"non-empty-string"`, `"number"`, `"boolean"` or `"milliseconds"` (`BOUND_CONFIG_FIELD_TYPES`, [`definition.ts#L66`](../core/definition.ts#L66)). A `milliseconds` field is a whole number of milliseconds this harness's timer schedules — 1 through 2^31-1, the longest delay it waits for before clamping a value to 1ms — so a wait budget is never read as a delay the extension would not be given. |

The declaration is plain data and stays that way: nothing is read or validated at declaration time, and the file
it names is what `getConfig` hands the extension's shared logic. See
[Extension configuration](#extension-configuration-declaration--file).

## `ompAdapter(definition, options)`

Assembles an `ExtensionDefinition` for the `omp` harness
([`adapters/omp/index.ts`](../../adapters/omp/index.ts)). It returns an `OmpExtensionFactory`
([`omp.ts`](../../adapters/omp/index.ts)) — `(api) => BindingResult` — which each thin entrypoint
re-exports as its default factory and the loader calls once per binding.

Its private OMP observation modules keep native subscriptions together with the implementation
that interprets their facts: [`adapters/omp/domain/session/turn.ts`](../../adapters/omp/domain/session/turn.ts) owns request/response
mapping, usage availability and per-subscription streaming-reading deduplication;
[`adapters/omp/domain/session/round.ts`](../../adapters/omp/domain/session/round.ts) owns activity signals, continuation flags and
late quiescence reads. The private [`adapters/omp/domain/session/`](../../adapters/omp/domain/session/) module
keeps Session knowledge local: [`queries.ts`](../../adapters/omp/domain/session/queries.ts) reads Session identity,
startup facts, persisted State payloads and injected-prompt identities, and maps the parent/ancestor
identities supplied by [`subagent/queries.ts`](../../adapters/omp/domain/subagent/queries.ts) into direct-parent
facts and Owner references; native registry traversal is owned by Subagent, not duplicated in Session;
[`events.ts`](../../adapters/omp/domain/session/events.ts) owns native Session event types, transition
pairing and rename observations. Its active Owner key lives once per binding, while rename tracking
lives once per observation subscription. Owner is the State-owning main session (a main session owns
itself), not the immediate Parent agent.

[`adapters/omp/domain/session/viewed-session.ts`](../../adapters/omp/domain/session/viewed-session.ts) owns the Viewed session native
facts, subscription re-pointing and last-listener release. The assembly keeps one latest actual
delivery context: both this module and context-free Subagent observations read that same source.
Viewing grants no State-write authority. `internal/port.ts` connects the native mappings and owns binding-scoped
diagnostic deduplication; `context/queries.ts` keeps the binding's newest context and reads idle facts,
while `context/events.ts` subscribes and constructs context observations. `session/effects.ts` appends
the State entry that `session/queries.ts` reads; the same write is shared with commands. Session event
construction lives in `session/events.ts`, with complex Turn/Round protocols kept in their own files. The entry `index.ts` assembles the process-level readers and the shared
framework binding life; native types remain available through that adapter entry. State seeding,
implementation reuse and cleanup, Turn identity and Round transitions retain their framework
semantics. These modules add no public interface: tests continue to drive native events through
`ompAdapter`, not internal helpers.

### `definition: ExtensionDefinition`

The same plain definition `defineExtension` returns. The adapter is the point at which declared conflicts
are reported and the binding is decided; declaration itself validates nothing
([`index.ts#L26`](../interface/index.ts#L26)).

### `options: ExtensionAssembly`

The harness-independent assembly information ([`implementation.ts#L192`](../interface/details/implementation.ts#L192)) — the adapter
adds no member of its own, so an assembly names no harness when it states what its extension builds, what it
depends on and where its configuration lives.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `implementation?` | `AuthoredImplementationFactory` | The result of `defineImplementation`: the canonical authored declaration, materialized once the definition's configuration validated. Its `create` is handed the validated values (`{ config }`, an empty object for a definition that declares none) and must send no remote request or start a timer, because a refusal can still follow. A raw factory function is not assignable; only the branded helper result is. Omitted when the definition needs nothing injected. |
| `configBaseDir?` | `string` | The directory the definition's relative configuration paths are resolved against, as plain data: the extension repository root, from which the convention `extensions/<definition.id>/config.yaml` is relative. An assembly is the one party that knows it — its own module lives in that repository and the loader discovers the extension by an absolute path while the process runs in an arbitrary project directory — so connect-bot's assembly derives it from `import.meta.url`. Omitted when the definition declares no configuration, and omitted by an assembly that names none: a relative path then resolves against the process's working directory, and an absolute `path` is unaffected either way. See [Extension configuration](#extension-configuration-declaration--file). |

**There is no supported-version option, and no version is compared at all.** Harness version support is an
evidence claim recorded in [`harness-support.md`](harness-support.md), not an extension's, an assembly's or
the framework's runtime declaration: an assembly describes only what its extension builds and needs, normal
startup performs no compatibility check, and the version a run exercises is selected by the dock from the
support record (or from `OMP_TEST_VERSION` for a candidate). An extension that needs none of the options
above assembles with no options at all, which is the canonical form in this repository
([`extensions/codebase-tools/harnesses/omp.ts`](../../extensions/codebase-tools/harnesses/omp.ts)).

### The authored implementation and its lifecycle

`defineImplementation` ([`implementation.ts`](../interface/details/implementation.ts)) returns the one canonical
authored object: `create(context)` builds the extension's business state, and the static slots —
`subscriptions` (scopes and semantic event keys), `commands` (directed `run`/`unrecognized` or an actions
table), `catalog`, `initialize` and `cleanup` — name handlers that receive that state. Its `.declaration`
is inspectable without calling the factory or running `create`, so registration and semantic-dependency
selection can use the same structure a future checker reads. The framework materializes the internal
`ExtensionImplementation` from that declaration; no second requirement list exists.

**Ordering.** Configuration is read and validated first; the authored factory is materialized only then,
and the declaration/implementation pairs and registration follow. Every refusal that follows creation
runs the one `cleanup` the authored declaration selected, so a binding that fails after creation leaves no
business instance behind ([`binding.ts`](../behaviors/binding.ts)).

**One implementation per adapter.** The `omp` adapter materializes the authored declaration once — the
first binding hands `create` the validated configuration, and every later binding (another session's, a
subagent's) reuses what it built ([`omp.ts`](../../adapters/omp/index.ts)) — with one exception: an
implementation whose cleanup has already run is spent, so the binding that comes after it builds a fresh
instance rather than delivering to a closed one. An assembly that wants the instance to be the *process's*
creates its adapter once, at module load, as the entrypoints do; that is what makes an ordinary model,
session, tree or view change harmless.

**Initialization runs once, and the first request waits for it.** The framework calls `initialize` at the
owner session node — the first session that is its own owner, and therefore the first moment of the process in
which the extension serves a session that can hold its instance — and the run-initiation hook hands the
harness the initialization's promise, so the first model request is issued after it settled with the
contribution planned from the facts as they then stand ([`lifecycle.ts#L66`](../behaviors/lifecycle.ts#L89)).
A rejection is reported once on the adapter's diagnostic channel and does not fail the request. Later
requests are not made to wait for work that is already done
([`lifecycle.ts#L104`](../behaviors/lifecycle.ts#L128)).

**Cleanup runs once, and then the binding delivers nothing.** The session the instance is *serving* ending —
`session_end` marked `disposed`, naming that owner — stops this binding's delivery and runs `cleanup` exactly
once ([`lifecycle.ts#L140`](../behaviors/lifecycle.ts#L140)). An ordinary switch is not that end: it delivers
`session_end(transferred)` for the session being left and `session_start` for the one taking over, so the same
business instance keeps serving the session that took over and nothing is cleaned up. The stop is total for
the extension's own code: its handlers, its run-initiation contributions and the injected implementations of
its commands are reached no more, because a command registration, once the host holds it, cannot be withdrawn
either (the framework's own `toggle` path is local State rather than the extension's code and stays reachable).
A subagent binding never initializes and never delivers that end, so a child's traffic can never tear down the
CLI's instance, and a disposed instance is never handed out again: a binding that arrives after the cleanup
builds a new one. A throw or a rejection from either entry is reported once and is not rethrown; nothing the
framework does here waits for the extension's work, which is what keeps an ending session from being held by a
remote call.

**Handlers may be asynchronous.** A session or round handler may return a promise, and the framework does not
wait for it: a save or a refresh the extension started must not become a barrier for the events and input that
follow it. A synchronous throw and a rejected promise are both contained and reported once each, without
changing what the framework already did for the event or keeping another subscriber from running.

**The semantic lifecycle subscription pairs a definition with injected handlers.** The framework's session
axis is the symmetric pair `session_start` ([`session.ts#L22`](../interface/session/details/session.ts#L22)) and
`session_end`: a start seeds the owner's State from the branch the delivery names, an end retires the owner it
names, and both refresh the framework-owned marker area
([`port.ts`](../runtime/port.ts)). A transition that changes which session is current
is an end marked `transferred` naming the owner being left, followed by a start naming the owner being entered;
a navigation that leaves the current owner alone — a tree jump, a same-file resume or reload, an in-place
context reset — is not a transition and produces no event at all. The axis carries one member that is not a
transition either: `session_facts`, the session's own facts as the harness now reports them. A harness
delivers it where it learns a session's name (or another fact) changed rather than at that session's next
boundary, so a session nobody is viewing is as current as the one on screen; it reconciles nothing, retires
nothing and publishes no marker area, and a harness that reports no such change simply never delivers it.

A start delivery is also the one delivery whose facts include the pair the session *began* on — the model and
the effective level the harness resolved for it ([`SessionStartup`](../interface/session/details/facts.ts)) — and only where
that start proves the session was beginning: a creation rather than a way into a session that already exists
(no `resume`, no `fork`), over a session whose own transcript carries no conversation yet. A fresh spawn is that
case; a session the host reloaded and re-bound — a parked subagent revived, a session re-entered in another
process — fires the same start signal while replaying its conversation, and reports none. Every other delivery
reports none as well, because what it could read is the session's *current* pair rather than the one it started
on. A fact nothing proved stays absent, part by part, rather than being filled in from the settings in effect.

The run axis is the edge-triggered pair `round_start` and `round_end`
([`round.ts#L23`](../interface/session/details/round.ts#L23)), where a `Round` is one period of agent activity
from the agent taking up input to quiescence. An opening carries its kind alone, and an end carries one
fact beside it — `ending`, either `confirmed` or `truncated` — which is how the end was *established*
rather than how the activity turned out: how a round ended is a
fact the harnesses disagree about, and the agent's *current* state is the idle query below rather than a
field of a past transition. An edge is delivered only when the session really crosses it — the first run
start of a session that has no round open opens one, a start inside an open round is work within it and is
not a second `round_start`, a settle that already scheduled its continuation (an automatic retry, an
empty-stop recovery, a compaction or stop-hook turn, a pending asynchronous wake) is a pause inside the
round and not a `round_end`, and a settle while no round is open closes nothing, because there is no round
whose end it could be evidence of. Error and abort terminals end the round the same way an ordinary answer
does. The framework applies no behavior of its own to a round beyond the identity and its lifetime:
three-value agent state is not framework State, so a round edge is a subscription and nothing else.

**A session's own disposal closes the round it leaves behind.** A host that is disposing an actual
session reports that fact at its own awaitable exit position (`onDisposal` on the port, which the `pi`
mapping is), and the framework closes the round there: a settle the session had already stated and never
had confirmed is confirmed — the session is over, so it is at rest and nothing beyond it can continue it —
and a round left open with no end ever stated is truncated, because nothing can continue it any more and
the activity's own completion was never established. The close-out is what makes a short-lived session's
last exchange accountable: the framework answers the report once every handler the edge reached has
settled, so a host that waits for it — and pi awaits a `session_shutdown` handler — has the session's own
commit finished before its process may leave. A session the host merely left is no disposal and closes
nothing: a transfer, a rename and a view that moved report no such fact and produce no `round_end`.

**That close-out is bounded, and what it states about its own work is what the work really did.** The
budget is the host's own wait when the report states one, and the framework's built-in fifteen seconds
otherwise — counted from entering the close-out, never reset for work that had already been running, with
no retry and no added delay (`DEFAULT_CLOSE_OUT_MS`). The edge carries what is left of it (`CloseOutWait`
on the delivery), and a consumer that owes an asynchronous effect bounds that effect's *wait* by it: a
session's own save declares the remainder to `updateFile` rather than a budget of its own, so a document
another writer holds is refused at the close-out's own deadline and the refusal is on the record before the
host is answered. Two cases are therefore told apart in what is reported rather than assumed: a wait that
can be given up is reported as the uncommitted write it is — the file holds nothing of it — while an update
that had already begun is not stopped by the deadline at all, and the deadline's own statement is that its
outcome is unconfirmed, claiming neither a cancellation nor an unwritten document. The file that really
gets published stays the authority. Nothing waits for the owner of another process here: a session this
process runs commits and closes within the bound whatever the process serving its owner is doing, and the
whole guarantee ends at ordinary disposal — a killed process, a crash and a power loss are outside it.

**A settle is an end candidate, not an end.** A harness reports a run as over before its own work has
unwound, so the session is usually not idle at that instant and may still have queued input or a running
asynchronous job that continues the same work. The framework therefore holds the settle, lets the adapter's
native callback return so the host can settle, and arranges exactly one re-check on the harness's next task
(`nextTask` on the port, which the `omp` mapping is): the round ends only if the session then answers
`true` for quiescence — idle, nothing queued, no asynchronous job still running — and a candidate that is
not confirmed is kept for the next fact that could decide it. Nothing polls and nothing waits on a duration.
The adapter contributes the harness's own run-cycle facts and that live read (see
[harness-support.md](harness-support.md)); which of them is an edge, and when, is the framework's
synthesis ([`behaviors/round-events.ts`](../behaviors/round-events.ts)).

### The activity axis

**Working/Idle is the framework's answer, and it is derived from the round axis.** An extension that
has to know whether a session is still working — to emphasise the row of a session that is running, to
refuse an action from a busy session — subscribes to `session_activity` instead of reading a harness's
run state. The framework states the reading from the transitions its own synthesis dispatches: a Round
it holds open for a session is that session working, a Round it confirmed ended is idle. The one rule
lives in [`behaviors/session-activity.ts`](../behaviors/session-activity.ts) (`ACTIVITY_OF_EDGE`), and
it reads a transition the framework already decided rather than interpreting a native fact — which is
why it is not a second set of edge rules, and why an automatic continuation, a drained queued message
and a job the session is still waiting on all keep reading as working: none of them crosses an edge.

**The reading is delivered where it moved, after the edge that moved it.** A delivery carries the
reading itself beside the session's own facts, its owner scope, `hasUI` and the feedback channel, and
a session that stays in the reading it was already delivered in produces nothing — so a pause inside a
Round states no reading at all, and nothing here polls, follows a stream or repeats what a subscriber
already holds. A session no reading has moved reads as nothing rather than as idle: an unestablished
activity is not idleness. The axis is not an arm path: it carries no capability, and the framework's
own behavior for it is nothing — the billing lifecycle a `round_end` drives belongs to the edges above,
and no Round, Turn or save follows from a reading.

**The same shape is what a reading obtained elsewhere arrives in.** Which process ran the session is
not part of the reading: a session another process ran is observed there and handed in as
`SessionActivityObservation`, and the framework delivers it as what it is. Applying one drives no
Round identity, no edge and no attribution, so the round axis stays the one owner of the Round, its
identity and its end — see [framework/docs/harness-support.md](harness-support.md) and the local-access
direction of the contract's observation work.

An implementation subscribes through `subscriptions`: one `SubscriptionGroup` per group it declares,
each stating once the `ObservationScope` it observes under and the handlers for the event kinds it
subscribes. The delivery each handler receives
([`session.ts#L36`](../interface/session/details/session.ts#L36)) carries the event, the owner scope it concerns, the
faithful `hasUI` fact, the unified extension feedback channel
([`Feedback interface`](../interface/feedback/index.ts)) — the same two seams a command delivery carries, so
one shared gate and one notice path serve both handler kinds and every axis — and the owner-scoped capability a
handler may retain for the effects it drives outside the delivery
([`state/index.ts#L118`](../interface/state/index.ts#L118)), because a `session_start` is an arm path like a
command. A round, activity or Turn delivery carries the first three and the feedback channel, and no capability:
a round edge and a Turn edge are not arm paths, and an activity reading is not one either. The framework's
own behavior for a session event always runs first — the one exception is `session_facts`, which crossed no
boundary and therefore runs no framework behavior at all — and a handler that throws — or returns a promise that
rejects — is reported on the adapter's diagnostic channel without changing what the framework already did or
keeping another subscriber from running. Which native event becomes which semantic session event is the
adapter's mapping alone — and on the round axis the adapter reports its run-cycle facts and the framework's
synthesis above decides the transition; shared logic names no native event either way.

**The scope is the group's, and it is declared once.** An `owner` group is dispatched only for a delivery
whose owner is `{ kind: "owner" }` — the session that is its own owner. A subagent session's boundaries,
rounds and Turns, and those of a session whose parent chain leaves the process, resolve to `inherited`
or `unresolved` ([`State interface`](../interface/state/index.ts)) and reach no `owner` handler: those
deliveries belong to the owner that session follows, and the effect body an extension drives from them
belongs to the session that armed it, which is why a subagent can never report or stop the owner's effects.
A `session` group is dispatched every actual session's deliveries, each naming that session's own identity,
direct parent, latest name, the handle of the task its spawn was allocated and — on the start alone that proves
the session was beginning — the model and effective level it began on: the scope a per-session observation view
declares. The handle names the
session's work rather than the agent definition it runs, which is a kind of agent, and none of these facts is
an identity: a rename or a handle leaves the session's own id, its direct parent and its Owner exactly as they
were. Widening a group grants
nothing else: there is no write path on either subscriber delivery, State inheritance is unchanged, and
the capability a delivery hands out is scoped to *its own* session — an owner-scoped handle for the
session that is its own owner, and a read of the value its field's inheritance rule reads for any other,
with every write and notice dropped. The rule is the framework's, expressed
in `subscriptions.ts`, `dispatchSessionEvent` and `dispatchRoundEvent` and observable at the adapter contract
(`tests/framework/subscription-scope.test.ts`, `tests/framework/owner-gate.test.ts`); the *resolution* is the
adapter's, and on `omp` it reads the session's agent identity, the harness's agent registry and its own
session manager (see [harness-support.md](harness-support.md#capability-difference-register)).

The framework's own behavior is never gated by a scope: it runs for every delivery the adapter resolves and
already owns nothing in a session that is not its own owner (an `inherited` or `unresolved` delivery seeds no
cell, retires none and renders no area).

## The Turn axis and the two observation scopes

A **Turn** is one observable model request/response cycle (see [GLOSSARY.md](../GLOSSARY.md)). The framework
owns its identity and the rules that join its facts; the adapter maps the harness's native facts and nothing
more. The two edges are `turn_start` and `turn_end` ([`turn.ts#L21`](../interface/session/details/turn.ts#L21)), and the
harness's own `turn_end` — which fires once the requested tools have run — is deliberately not this axis's end,
because tool execution is outside the Turn.

- **`turn_start` fixes the request-time facts.** An opaque `turnId` the framework mints (never a provider
  request or response id), the actual session, the round this Turn belongs to, the real start time, the
  provider and model of the request itself, and the catalog price the extension's own catalog reported at that
  moment. A later model or price change never re-attributes or re-prices the Turn, which is why `turn_end`
  repeats the same record.
- **`turn_end` delivers the same identity with the response's facts**: the outcome, the reliable usage, the
  obtainable HTTP status/headers/metadata, and the two provider reference ids — carried apart, never assumed
  equal, never used as the identity.
- **Every fact a host could not obtain is named** in the delivery's `unavailable` list. A settle whose start
  was never observed is reported on the adapter's diagnostic channel and dropped: no start is fabricated for
  it, and no current session, model or arrival order is used to attribute it.
- **Usage is reliable or unavailable, never zero by default.** A reading observed while the response streamed
  is not a final reading and makes no conflict; a settle that reported none, or that reported readings which
  disagree leaving no determinable valid source, is delivered as an unavailable usage with that reason, and a
  reading is delivered as the one its own source established. A source whose native facts cannot tell its own
  default from a reported zero — the OMP adapter's assistant messages carry an all-zero usage object in both
  cases — reports no reading rather than an all-zero one, so a zero that reaches a handler is a reported zero
  and an all-zero settle the same Turn's streamed evidence contradicts is named as the host default it is. A
  Turn is delivered once: a repeated settle with the same reading is normal
  deduplication, and one with a different reading is reported as a conflict and dropped, because no post-end
  correction exists.
- **The extension supplies its own catalog.** `ImplementationDeclaration.catalog`
  ([`implementation.ts`](../interface/details/implementation.ts)) selects the extension's own
  `CatalogPriceSource` from its business state: the framework queries it once per request, at the request's
  real start, and treats every value it returns as opaque business data — it never interprets a price, a
  currency or a bucket key, and an implementation that supplies no catalog has every Turn name the price as
  unavailable.
- **The harness's own model prices are a fact `create` receives.** A harness whose model catalog states
  what a model costs reports it as `HarnessPort.modelPrices` ([`port.ts`](../runtime/port.ts)),
  the same query shape and never a native model, registry or context; binding hands it to the extension's
  `create` as `ImplementationContext.modelPrices` ([`implementation.ts`](../interface/details/implementation.ts)). The framework
  never queries it itself — whether a channel is priced from the extension's own data or from the harness's
  catalog is the extension's business — and an adapter that reports no prices hands over no fact rather than an
  empty one. On `omp` the adapter maps it from the live session context's model catalog, in US dollars per
  million tokens, answering nothing for a pair the catalog does not carry or prices at zero on every bucket.
- **The harness's own provider access is a per-operation query `create` receives.** A harness whose host
  can resolve a provider's credential and address reports it as `HarnessPort.providerAccess`
  ([`port.ts`](../runtime/port.ts)), the small `ProviderAccess` query of
  `{ baseUrl?, credential? }` facts and never a native registry or credential store; binding hands it to the
  extension's `create` as `ImplementationContext.providerAccess`
  ([`implementation.ts#L74`](../interface/details/implementation.ts#L74)). The framework asks it for nothing and caches nothing: a
  question is answered by the host's state at that moment, so a credential a login or a replacement has since
  made effective is what the next operation uses, and an adapter that resolves no such access hands over no
  member rather than a query that always answers nothing. On `omp` the adapter maps it from the live session
  context's model registry, naming only the two members it needs (`getProviderBaseUrl` and the awaited
  `getApiKeyForProvider`), mapping the registry's own keyless sentinel to no credential, and answering nothing
  for a provider the host reports neither an address nor a credential for.

The framework's own behavior runs before any handler: the identity, the round and the price anchor are fixed
before a `turn_start` handler runs, and the outcome, usage and HTTP facts are resolved before a `turn_end`
handler does. Where these facts come from on `omp` — the request hook, the response boundary, and the finalized
assistant message — is the adapter's mapping, and every fact a host does not report is delivered as unavailable
rather than filled in: the recorded baseline's Codex transport reports no response boundary of its own,
and a local patch on that baseline publishes it without changing the support record, which the
capability-difference register records (see
[`turn.provider-response-boundary`](./harness-support.md#capability-difference-register)). The rules above are
the framework's, and they are observable at
the adapter contract in `tests/framework/turn-facts.test.ts` and `tests/framework/turn.test.ts`, and in a
running harness in `tests/harness-dock/turn-facts.test.ts`: one real request; one delegating run in which the
main session spawns a real subagent that spawns a real grandchild, so all three actual sessions deliver their
own identity, direct parent and Turn while the owner-scoped group is driven by the main session alone; and one
run in which a real tool executes, where the harness's own `turn_end` — the one carrying that tool's result —
is observed falling between two Turns rather than ending one.

## Extension configuration (declaration + file)

An extension may declare the configuration it needs from one YAML file in its own source directory — by
convention `extensions/<definition.id>/config.yaml`, overridable through `config.path`. The file the repository
commits *is* the default: no default value and no fallback lives in code, so a file that is missing or illegal
refuses the extension instead of letting it run on a value the framework invented.

**A relative declaration is resolved against a directory the assembly supplies, never against the process.** A
load discovers an extension by an absolute path while the process runs in an arbitrary project directory, so the
convention path — which is relative to the extension repository — cannot be found from the process's own working
directory. The assembly is the one party that knows the repository (its own module lives in it), and connect-bot's
OMP assembly derives the root from `import.meta.url` and passes it as `ExtensionAssembly.configBaseDir`. An
absolute `config.path` is used as declared, and an assembly that supplies no directory leaves a relative path to
the process's working directory — the behavior every read had before the directory existed. Every failure names
the file the resolution reached, so a report says where the framework actually looked.

The framework reads and validates that file at binding, before the first registration, on the same deterministic
path as the declaration conflicts below: the shape of the `config` declaration itself, and then the file's
content, are validated together, and either kind of failure becomes one `configuration` binding failure carrying
a `config` violation (see [Binding outcome and failure report](#binding-outcome-and-failure-report)), reported on
the non-model channel exactly once. The extension does not load; the extensions that did keep running.

| Loading-time failure | The `detail` names |
| --- | --- |
| the declaration's shape: `config` is not an object, `fields` is absent or is not a mapping, a field names a type outside the bound set, `path` is not a non-empty string | the declaration, e.g. `config declares path a number, which is not a non-empty string` |
| the file is missing or cannot be read | the file and why: `does not exist`, or `could not be read: …` |
| the text is not YAML | the file, followed by the parser's own explanation |
| the document is not a mapping at its top level | the file and the value it declares instead |
| a declared key is missing, or its value has the wrong type | the file, the key, the value it declares, and the type the declaration requires |

`readConfig(path, options)` ([`framework/core/config.ts`](../core/config.ts)) is the one
reading, parsing and validating implementation, and it is harness-neutral: the text is read through `node:fs`
and parsed as YAML by the pure-JS `yaml` package, and the reader, the parser and the base directory a relative
path is resolved against are all injectable through `ConfigSource`, so the framework's own suite covers every
failure path without a file. Every file-side failure is a `ConfigLoadError`
whose `detail` is the same deterministic text the binding reports.

**Shared logic reads the validated values, never the file.** `getConfig(definition)`
([`framework/interface/general/config.ts`](../interface/general/config.ts), implemented at
[`framework/core/config.ts`](../core/config.ts)) returns the values the declaration named — exactly those
keys, in declaration order; a key the declaration does not name is ignored — in whichever session, command or
lifecycle handler the extension runs. It is not a way to read a configuration that is not there: an extension
that declared no configuration, or whose values were never validated in this process, gets an
`ExtensionConfigError` ([`framework/interface/general/config.ts`](../interface/general/config.ts)) — the same
class identity the implementation throws — which is deliberately neither a `BindingFailure` nor a
`ConfigLoadError`.

The configuration entry publishes exactly those two names. `ConfigLoadError`, the reader/parser/source seam,
`readConfig`, `readConfigDocument`, the declaration/validation helpers and the framework's Shared configuration
stay internal; an extension asked for a configuration its binding never validated cannot use this entry to read
one. The `ExtensionConfigDeclaration` and `ConfigFieldType` it consumes remain owned by the root authoring
contract, and the value is delivered as the same recorded object in `context.config` and `getConfig` — TypeScript
`Readonly`, with no freeze, copy or runtime write protection added by this migration.

The file belongs to the machine: there is no environment or command-line override, and a validated configuration
is read once per extension per process, so a changed value takes effect with the next process rather than with
the next session.

## General HTTP module

`request(url, options)` ([`framework/interface/general/http.ts`](../interface/general/http.ts)) is
the framework's one outbound HTTP call, imported directly by shared logic rather than injected
through a command or event delivery. The deep implementation — the shared proxy table, the native
client and the wait budget — remains in [`framework/modules/http.ts`](../modules/http.ts). It is
deliberately not a business API: the caller prepares everything it means and interprets everything
it gets back.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `url` | `string` | The request target, as the caller prepared it. |
| `options.method?` | `string` | The HTTP method; `GET` when omitted. |
| `options.headers?` | `Readonly<Record<string, string>>` | The headers, sent exactly as given — no content type, no authorization, nothing added. |
| `options.body?` | `string` | The body, sent exactly as given — nothing is serialized. |
| `options.timeoutMs?` | `number` | The wait budget in milliseconds. Omitted takes the shared `http.defaultTimeoutMs`, and with that absent — or with no shared file at all — the built-in 30000. A declared budget must be a whole number of milliseconds this harness's timer schedules (`isScheduledWait`): `0` does not turn the wait off, and an illegal value is refused rather than replaced. |
| `options.proxy?` | `false \| string` | `false`, or omitted, is a direct connection. A string selects the entry of that name in the shared `http.proxies` table; that entry is used only when it says `enabled: true`, and any other entry is an explicitly disabled one that connects directly. |

**What comes back.** The runtime's own `Response`, streamed from the connection rather than
buffered, so the caller reads `status`, `ok`, `headers` and the body itself. A non-2xx answer —
a 3xx included — is an ordinary result: the framework turns no status into an error, follows no
redirect, and defines no business envelope, no JSON helper and no bearer management. A transport
failure rejects; a wait that runs out rejects with the wait's own timeout failure; a body that
cannot be read, including one that stops before its end, rejects the read. Nothing is retried and
nothing is turned into `null` or a zero. The client speaks HTTP/1.1 and asks for no encoding: no
`accept-encoding` is added and nothing is decoded, so the caller's own headers decide what it
asks for and the bytes that arrive are the bytes it reads.

**Where the request goes.** `proxy: false` and an omitted `proxy` state a direct connection. A string
names one entry of the shared `framework/config.yaml`:

```yaml
http:
  defaultTimeoutMs: 30000
  proxies:
    codex:
      enabled: true
      url: "http://127.0.0.1:7890"
```

`http.proxies.<name>.url` is the proxy's own address — `http://` or `https://`, which is the protocol of
the connection *to the proxy*, not of the target — and it is read only for an entry that says
`enabled: true`. An entry that exists without `enabled: true` is an explicitly disabled one: the request
connects directly and its `url` is never read, so a disabled entry may keep a placeholder or none. The
file is optional, machine-owned, and read once per process, so an edited value takes effect with the next
process. A request that names a proxy reads the table it selected and nothing else: no file, no table, no
such entry, an entry that is not a mapping, and an enabled entry without a usable address are all
`HttpConfigurationError`s that refuse the request *before anything is sent*; only an entry that exists
and is not `enabled: true` connects directly, and a chosen proxy that fails is never retried direct.

**How the route is realized.** The connection is made by this runtime's own `node:http`/`node:https`
client, whose address is the one the request settled on and nothing else. A plain-HTTP target through a
proxy is asked for by its absolute URL over the connection to the proxy; an HTTPS target is reached
through a CONNECT tunnel, with the connection to the proxy itself over TLS when the proxy's address is
`https://`, and the TLS connection to the target then running over that tunnel. This is why the
transport is not the process's `fetch`: `fetch` follows a process-level proxy environment even for a
request that states a direct connection, so the ambient environment could take a connection the caller
did not ask for. Here it cannot.

**What the module never does.** It does not read or write the ambient proxy environment (`HTTP_PROXY`,
`HTTPS_PROXY`, a `PI_PROXY_*` name) to choose a path, and it does not take over the network the harness
uses for its own model requests and OAuth updates: the request states the route it wants, and the
client it is made over consults no environment of its own. It publishes no cancellation channel either
— the caller declares a budget, the module imposes it, and no controller is handed out. The budget
covers waiting for the response *head* and reading its body; business work after the whole body has
been read is outside it.

**The seam.** `createHttpModule({ transport, configPath, reader, parser })`
([`http.ts`](../modules/http.ts)) builds a module over an injected call and shared file. It is
the implementation's own seam, not part of the published surface; the
[interface entry](../interface/general/http.ts) re-exports the module's one published call.
`tests/framework/http.test.ts` drives it so that no permanent case uses a network, and
`scripts/http-transport-smoke.ts` proves the real transport
against loopback servers — a plain target and a TLS target, a plain proxy and an HTTPS proxy (both
absolute-form and CONNECT), a body that stops before its end, a delayed body under a short budget and
under a longer one, a refused proxy, a hung target for the built-in budget, and a proxy-environment trap
that the whole run — including a separate process driving the published `request` — never reaches.

## General safe-file module

`updateFile(target, update, options?)` ([`framework/interface/general/files.ts`](../interface/general/files.ts)) is the
framework's one coordinated read-modify-publish call, imported directly by shared logic through
that interface entry rather than injected through a command or event delivery. It is
deliberately not a business API: it knows no schema, no version and no period, it never interprets the
document, and what it publishes is exactly what the update function returned.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `target` | `string` | The document's absolute path. Its directory must already exist — the module creates documents, never the place they live — and it is read and replaced at this path. |
| `update` | `(current: unknown) => T \| Promise<T>` | The business update. It is called with the document as of inside the coordination scope, or `undefined` when the file does not exist yet, and the value it returns is what is published. A business refusal is a throw: the rejection reaches the caller untouched and the document is not written. |
| `options.timeoutMs?` | `number` | The whole wait budget in milliseconds — in-process queueing plus cross-process lock acquisition. Omitted takes the built-in 15000. A declared budget must be a whole number of milliseconds this harness's timer schedules; an illegal one is refused rather than replaced. |
| `options.signal?` | `AbortSignal` | Aborts the *wait*. Once the update has begun it is ignored: the call waits for the real result rather than pretending to have stopped. |

**What comes back.** The promise resolves with the update function's own return value, after that
document is really on disk; a rejection is either a [`SafeFileUpdateError`](../interface/general/files.ts) naming
its kind or the update function's own error, unchanged. The failure kinds are closed: `timeout` (the
budget ran out before coordination was acquired), `cancelled` (the caller's own abort during that wait),
`io` (a document, a lock or a directory the module could not read, create, replace or lock, or a
call it could not start at all — a target that is not an absolute path, a budget that is not a wait
this framework schedules) and `corrupt` (an existing target whose text is not a JSON document). A
`corrupt` target is never called into and never overwritten. Nothing is retried after a failure has
been reported: there is no background queue, no deferred write, no second synchronous entry, and no
native file-lock dependency.

**Where the coordination happens.** Two callers of one document are serialized. In this process the
key's own promise chain runs one update at a time in submission order — the order the calls entered
`updateFile`, preserved across the key's own asynchronous resolution — and the key is dropped once
nobody is waiting for it, so a document at rest holds no queue. Across processes one lock directory,
installed exclusively beside the target, provides mutual exclusion; no cross-process *order* is
promised. Both share the one wait budget of that call, and distinct documents never wait for each
other. The
coordination key is the **existing parent directory's realpath plus the file's name** (folded to one
case on Windows), so two spellings of one directory cannot take two locks, and only then is the
document re-read, parsed and handed to the update function — the fresh on-disk value is always the one
the business logic sees.

**Publication.** The new document is written to a temporary file in the same directory and renamed over
the target, so a reader meets the complete old document or the complete new one, and the target's own
identity changes rather than its bytes. The one retry in the module lives here: while a reader holds
the document open this platform refuses the replacing rename, and the same step succeeds a moment
later, so a single publication steps over that refusal a bounded number of times before reporting an
`io` failure. The release and the recovery take the same bounded step over the same refusal — an
unlink or an `rmdir` the platform is momentarily unwilling to make — so a name it still has open
cannot leave this call's own lock behind for the next caller to wait on.

**The lock, and its recovery.** The lock is a directory beside the target that carries one entry while
it is held: a file named after the holder's process and a token unique to that acquisition, installed
by renaming a prepared directory into the lock name. The holder's liveness is judged by the process that
entry names. A lock is recovered only when that holder is confirmed gone — the process is queried, and
"no such process" is the confirmation. Age is never evidence, so a lock whose holder is alive, or whose
liveness cannot be established, is never taken over: that call fails at the end of its budget and writes
nothing. A process that dies while holding the lock therefore leaves a lock the next caller genuinely
recovers, which is what keeps one crash from blocking every later write.

Recovering that lock — and releasing one — removes the dead holder's own entry and then the directory,
and neither step can touch whoever holds the lock now, however late it runs: an entry name is one no
other acquisition of the document writes, so a newer holder's entry is simply not there to remove, and
`rmdir` is never applied by a platform to a directory that still carries an entry. So of any number of
processes that meet one dead lock at once, exactly one can install its own lock, none of them can take a
live holder's lock from it, and a recovery that removes nothing waits its turn like any other caller. An
empty lock directory is a leftover of a release or a recovery interrupted between removing its entry and
removing the directory, and it holds nobody; a lock name that is anything else this module did not write
is reported as an `io` failure rather than guessed at. Releasing is case-by-case: the call removes only
the lock it took.

**What the module never does.** It does not promise a hard deadline for the whole operation, and it does
not publish a cancel channel for one: the budget covers the wait, and the read-modify-publish after it
runs to its real outcome. It knows no business schema and no merge rule, keeps no ledger, and never
creates the caller's own directory — the place a document lives is the caller's, only its document,
its temporary files and its lock directory are this module's. Its scope is this machine's local file
systems: several CLIs, terminals and projects sharing one directory are safe against each other, and
nothing is claimed for a document shared over a network volume or a cloud-synced folder.

**The seam.** There is deliberately none: an in-process lock simulation could not stand for the safety
this module claims, so `tests/framework/files.test.ts` drives the published entry over real temporary
local directories, real child processes, real process ids and real liveness — a live holder that is
never taken over, an aborted or budget-exhausted wait that never writes late, a holder that is killed
and its lock recovered, every process that races to recover one dead lock committing without losing an
update, the process that recovered a dead lock being a live holder no peer takes it from, independent
processes that lose no update, and readers that only ever see whole documents.

## Local access (adapter-facing)

The framework's general local-access module ([`modules/local-access.ts`](../modules/local-access.ts))
is the one way a process offers the *declared values* of an owner it serves to a session this harness
runs in another process, and the one way such a session hands the process that serves its owner the
*observation* of itself: the serving process publishes where its access is, and a session in
another process reaches it over a name the platform already provides — a Windows named pipe
(`\\.\pipe\my-agent-toolkit-access-<id>`) or a POSIX socket file. It is **not** an extension entry and
not part of any extension-facing interface: an extension never touches it. The harness adapter selects the subagent
access capability through [`core/subagent-access.ts`](../core/subagent-access.ts): OMP selects
`in-process`; pi selects `cross-process` when its assembly states a `childEntry`, while retaining the
same-process direct path for owners served here. This is only subagent access, not general communication
or a scheduler. `SubagentAccess` owns value offers, followed reads, observation admissions, hand-over
routing and their release; State supplies current values and binding supplies semantic facts and sinks.
The assembly hands State one `StateRules.access`, not separate publisher and follower lifetimes.
A harness whose sessions are all bindings in one process creates no endpoint, record or configuration read.

**The follow read.** A field that declares `follow` makes a subagent session read its Owner's *current*
value, and a session this harness ran in another process holds no cell for it. `StateStore.followed`
is that synchronous read: the value is the one the Owner's access last stated, and the declared default
stands in while no access is reached. Before the first run's prompt planning and Marker publication,
the framework's awaitable run-initiation position joins the first bounded access attempt; if an earlier
synchronous read already started it, both share that attempt. Failure retains the default and the existing
read-driven recovery. Later runs do not wait again or request a value per use: connected values arrive
by push, so cross-process propagation is not instantaneous. Same-process cells need no wait.
A default read writes nothing to the Owner's cell or the reader's persistence medium and is not a
confirmed reading of the Owner's value. Synchronous State reads, including a handler's read capability,
remain synchronous; the readiness wait belongs to the framework's pre-request position, not to that interface.

**Recovery is per read, spaced and bounded.** The first read of an owner starts one attempt (a second
read in the same turn shares it), the change of a connected owner arrives by itself over the access —
nothing polls a healthy one — and a failed attempt is what spaces the next: the delay doubles per
consecutive failure and stops at the policy's ceiling. An access that reports itself ended is spent and
never reused, and the read after the spacing opens a fresh one, because a lost connection is not proof
that the owner ended. Disposal is final: `StateStore.dispose` releases every followed access and stops
following for good. It delegates to the assembly's `SubagentAccess`, which also withdraws its value
offers and observation admissions and releases outgoing observation connections. The pi adapter reports
quit/reload only after the awaitable session close-out, so the final save and its commit notice finish
before communication is released; a session transfer does not dispose the assembly's access.

**What one access is.** A *seat* is one extension's access to one owner (`{ extension, owner }`) — an
owner key alone is not unique across extensions, because two extensions of one process serve the same
session's owner. The serving process offers a seat's current declared values, pushes that seat's
changes one way, and answers a declared read on demand; the same seat carries one direction more, and
it is the observation a session the harness ran elsewhere holds of itself. Nothing else crosses: there
is no write frame, no method name and no argument list, so this is not an RPC surface, a session cannot
reach any value or any other session through it, and a frame that is not the declared `hello`, `read`
or `observed` is refused rather than interpreted.

**The two halves of one seat are offered separately.** `OwnerAccessPublisher.offer` offers a seat's
declared values and `OwnerAccessPublisher.receive` receives its observations; the seat, its location
record and its endpoint live while either half is offered and are released with the last of them, and
a half offered again over a seat that is still there keeps that seat's verification, so a reader that
already read the record is not locked out by it. `SubagentAccess` builds and owns these halves once per
assembly, tracks the bindings serving each owner and releases each binding's admission on transfer or
end. An inherited session whose owner any binding serves here stays local. `HarnessPort.sessionObservationAccess`
remains an internal carrier seam for a harness supplying its own observation bridge: its `receive` and
`deliver` join the same admission and hand-over rules rather than a second dispatcher.

**Observation delivery.** The framework decides *which* readings cross, not the adapter: a session's
facts are handed over where the delivery that named it arrived, its activity and its context where the
edges and collections that moved them ran, and only for a session whose owner this process does not
serve (`core/observations.ts`, `handOverReading`). On the other end the receiving process records the
reading in its own observation source and dispatches it to the subscribers of the session that follows
that owner (`behaviors/binding.ts`, `adoptReading`), so an extension reads a session it never ran
exactly as it reads its own. The observation source retains the first reliably reported startup
snapshot for each actual session: later facts refresh its name and position but neither erase that
snapshot when omitted nor replace it with a later model or effort. Consumers can therefore read the
startup facts before any extension data has been committed.
One member travels the same way but is a statement rather than a reading:
a session's own process records each write it confirmed (`ImplementationContext.session.recordCommit`,
`SessionObservations.recordCommit`) and the count crosses as a notice — no content of the storage, no
Round, Turn or accounting fact — reaching a subscriber as `session_commit` where the count moved, so a
process serving that session's owner learns the shared storage grew and reads it itself; a session
whose owner is served here is recorded and handed to nobody. `createObservationDeliverer` is the
delivering half as an adapter uses it: one reach per owner, the state this process holds (the count
included) sent as the access's first word, later readings written straight onto the connection, a miss
reported as nothing at all, and a runtime directory this process cannot state reported as its own
configuration failure. Nothing here is persisted and nothing is polled: a reading arrives because a
session's own observation moved.

**The location is separate from the messages.** One JSON record per seat lives under the configured
runtime directory, named from the seat itself, holding the seat, the endpoint, that access's own
verification and the publishing process's id — no value, no State, no business data. Process id and
endpoint are recorded as information and are never read as proof that an owner lives. A record that
cannot be read, states no readable endpoint or verification, or names another seat than the file it is
filed under, is read as no record at all.

**Both ends are checked before anything crosses.** The reading process states the seat it wants with
the verification it read from the record; the serving process answers only when that seat is one it
serves right now and the verification is the one it published, and the reading process checks the seat
the answer names in turn. The endpoint's id is random per serving process, so it is never guessed and
never reused by a later process. A refusal closes the connection with no values, which is what keeps a
stale record, an old endpoint or another seat's record from reaching this seat's values.

**Configuration.** The runtime directory is the shared configuration file's `runtimeDir`
([`config.yaml`](../config.yaml)), and a relative value is resolved against that file's own directory,
so two processes that read the same file agree on it whatever their working directories are. No file, no
`runtimeDir`, an empty or non-string value, and an unreadable or non-mapping file all fail as a
`LocalAccessConfigurationError` naming the file resolution reached
([`resolveRuntimeDirectory`](../modules/local-access.ts)): nothing is substituted — no temporary
directory, no working directory, no extension storage root — and the failure is not a shape a retry
repairs. A publisher reports that failure once on its own channel and simply offers nothing.

**Outcomes and release.** Everything but a reached access is a `LocalAccessUnavailableError` with one
reason: `no-location`, `endpoint-absent`, `refused` or `closed`. None of them is evidence about an
owner's life, and none of them is another. Withdrawing a seat removes its record, stops its
observations and releases the connections admitted for it; the endpoint closes once no seat is left, and
`dispose` withdraws every seat and closes the endpoint, removing a POSIX socket file. A caller reports
`ended()` as soon as its access is released, rather than at its next request. A caller that outlived its
access is released rather than left listening for a value that will not come.

**What it does not claim.** The endpoint is reachable by any process of this machine that can name it,
and on Windows the platform exposes no authorization knob to `node:net` to change that. The verification
separates *which* access a caller reached; it is not an operating-system access control, a cross-user
boundary or POSIX authentication. On POSIX the record is written `0o600` and the runtime directory is
created `0o700`, which is the only isolation either file system is asked for here.

**The seam.** The carrier itself is not doubled: [`tests/framework/local-access.test.ts`](../../tests/framework/local-access.test.ts)
starts real child processes over a real named pipe or socket file, reads the record the serving process
published, and observes what crossed — a change arriving and a declared read answered; another
verification, another seat, an old endpoint and an unreadable record all refused without a value; a
released seat's reader released with it and another seat's reader untouched; a disposed access whose
endpoint is gone; the same-process read that opens nothing; and the pi assembly that offers an owner
only for a `follow` field in a host that spawns sessions. The configuration cases drive the real read of
a real file, with the file's own text as the input.

## Binding outcome and failure report

The factory returns a `BindingResult` ([`port.ts`](../runtime/port.ts)):

```ts
type BindingResult =
  | { readonly bound: true; readonly definition: ExtensionDefinition }
  | { readonly bound: false; readonly failures: readonly BindingFailure[] };
```

An unbound result carries its `BindingFailure[]`. `BindingFailure`
([`port.ts`](../runtime/port.ts)) is a closed union of three kinds:

| `kind` | Payload | Meaning |
| --- | --- | --- |
| `"configuration"` | `violation: ConfigurationViolation` | The definition breaks one of the framework's configuration rules: it declares competing declarations, or its declared configuration — the `config` declaration or the file it names — is illegal. |
| `"initialization"` | `detail: string` | The definition cannot be initialized against this harness: no id or display name, a command declaring a control kind or a State field this version does not bind, a `state` declaration that is not a State object or that names a `persistence`/`inheritance` value outside the bound set, a directed command whose implementation was not injected, or a registration the harness refused. |

Those two are the whole of it: a binding has no compatibility verdict of its own. The former
`"required-semantics"` kind went with the startup route it belonged to — a harness that cannot honor a
semantic a binding's behavior rests on is a finding of the independent verification, not a refusal at
binding (see [Declared requirements](#declared-requirements-verification-input)).

`ConfigurationViolation` ([`violations.ts#L24`](../core/violations.ts#L24)) is
`{ kind: ConfigurationViolationKind; detail: string }`, where `ConfigurationViolationKind`
([`violations.ts#L14`](../core/violations.ts#L14)) is
`"duplicate-command"` (two commands share one name), `"duplicate-state-writer"` (two commands declare
themselves writers of one State field), `"duplicate-slot-rule"` (one prompt `tag` carries more than one
rule), or `"config"` (the extension's declared configuration — its declaration or its file — is illegal; the
`detail` distinguishes the failure class, see
[Extension configuration](#extension-configuration-declaration--file)).

`describeBindingFailure(extensionId, failure)` ([`binding.ts`](../behaviors/binding.ts)) produces
the deterministic text of one failure, independent of where it is reported.

## Declared requirements (verification input)

The framework's contracts rest on semantics — history preservation, the two semantic lifecycle axes — and
both the ones every binding requires and the ones an extension's assembly additionally declares are recorded
here as *contract metadata*: what a supported harness scope must be independently verified for.

They are not a runtime switch. Normal startup performs no compatibility check at all — it neither evaluates
harness version membership nor judges a native capability surface — so a declaration neither refuses a
binding, downgrades it nor falls back to a partial capability. A harness that cannot honor a semantic is a
finding of the [independent verification](harness-support.md#independent-compatibility-verification),
reported as covered/unverified scope rather than decided at binding.

| Symbol | Source | Shape and meaning |
| --- | --- | --- |
| `RequiredSemantic` | [`requirements.ts`](../core/requirements.ts) | Internal verification vocabulary for history preservation and the lifecycle axes. It is not a public authoring requirement list. |
| `FRAMEWORK_REQUIRED_SEMANTICS` | [`requirements.ts`](../core/requirements.ts) | The framework's history-preservation invariant, applicable to every binding. |

The public `requiredSemantics` option and `DeclarableRequiredSemantic` alias are removed. Integration
contracts are derived from actual source use; behavior-verification reports remain independent.

`history-preservation` is not something an extension can trade away: it is the framework's own invariant —
new material is appended through the harness's own recording path and no existing conversation entry is
rewritten — which is why it is required of every binding and no assembly declares it.

### Two kinds of absence

Conflating them is the mistake the removed startup route made. A `RequiredSemantic` is a property of the
*harness scope*: whether it holds is established by the independent verification, for the whole supported
combination. The facts a *delivery* needs are per-context facts of one session, unknowable at binding time:
the session's idle fact behind `canAcceptInput()` ([`port.ts`](../runtime/port.ts)), and the
pending-message and asynchronous-job facts behind the quiescence gate
([`round.ts#L86`](../interface/session/details/round.ts#L86)). The framework reports one of those on the non-model channel
when the read finds it missing and fabricates no value in its place (the read answers nothing, which is not a
confirmation, so the round stays open; the query answers `undefined`). See
[harness-support.md](harness-support.md#capability-difference-register) for which harness reports which of
these facts.

## Notices, marker and owner scope (adapter-facing shapes)

These are resolved by a harness adapter, not authored by an extension, and are cited here so the
option/feedback surface is complete. Both feedback channels travel the session's own UI channel on the `omp`
harness — the framework's notice as a `warning`, an extension's feedback at the level it chose — and fall back
to one stderr line when the session has no UI ([`omp.ts`](../../adapters/omp/index.ts)).

| Symbol | Source | Shape and meaning |
| --- | --- | --- |
| `OwnerReference` | [`State interface`](../interface/state/index.ts) | `{ kind: "owner"; key }` \| `{ kind: "inherited"; key }` \| `{ kind: "unresolved" }` — the owner a framework effect acts on. An `inherited` session owns no cell: it never writes one and reads its owner's value only when the declared field opts in with `follow` (see `state.inheritance`), and neither it nor an `unresolved` session reaches an owner-scoped subscription (a session-scoped group still observes actual sessions). |
| `NoticeTransport` | [`port.ts`](../runtime/port.ts) | `{ warn(message): void }` — the framework's own notice channel (session warnings), outside model context (a UI notification at `warning`, or a stderr line when the session has no UI). Its upper-level responsibility and lifetime stay separate from extension feedback, while each adapter maps both through the **same actual output implementation**; sharing that output does not expose this channel to an extension. |
| `FeedbackLevel` | [`Feedback interface`](../interface/feedback/index.ts) | `"info"` \| `"warning"` \| `"error"` — the severity one extension notice carries. `info` reports an effect that happened, `warning` reports something to notice about an effect that only partly happened or did not happen at all, and `error` reports one that did not; the level names how serious a notice is, not which channel carries it. |
| `FeedbackTransport` | [`Feedback interface`](../interface/feedback/index.ts) | `{ notify(level, message): void }` — the single harness-independent channel through which an extension tells the operator about an effect, carried by every handler delivery. Outside model context, never filtered or reordered by the framework: a UI notification at the notice's own severity when the session has a UI, and one stderr line when it does not. The adapter maps it through its one actual output implementation, which the framework's own notice wrapper uses too; the upper-level responsibilities and lifetimes remain distinct. |
| `MarkerTransport` | [`port.ts`](../runtime/port.ts) | `{ publishMarkers(lines: readonly string[]): void }` — the internal transport for the unified marker area. It is an adapter/framework seam, not an extension-facing declaration, and no extension delivery carries it. |
| `ViewedSessionPort` | [`port.ts`](../runtime/port.ts) | The session the host is displaying, as its adapter resolves it — the fact behind the one marker area's projection, and never authority: `read(): OwnerReference \| undefined` (the displayed session's position, re-read per publication; `undefined` means this harness publishes no outlet at all, while a resolved `unresolved` means the outlet exists and its owner could not be obtained) and `subscribe(listener: (markers: MarkerTransport) => void): () => void` (one listener per change of the display; the listener re-reads and publishes through the transport it is handed). A harness that publishes no such outlet omits the member on `HarnessPort`, and the framework then projects the position each delivery carries. |
| `StateValues` | [`port.ts`](../runtime/port.ts) | `Readonly<Record<string, boolean>>` — the State values one write path records, by field name. |
| `HarnessPort` | [`port.ts`](../runtime/port.ts) | The registration and feedback surface an adapter provides (`setLabel`, `reportDiagnostic`, `onSession`, `onRound`, `onDisposal` when the harness states its own session disposals, `onSessionContext`, `onTurn`, `onUserInput`, `nextTask`, `onRunInitiation`, `registerCommand`), plus the facts it resolves when it can and omits when it cannot: `modelPrices`, `providerAccess` and `viewedSession`. `onDisposal` is registered with `onRound` — a binding that observes neither the round axis nor the Turn axis holds no bookkeeping to close — and what it receives is one actual session's own end (`SessionDisposal`), whose close-out the framework answers once the edge it dispatches has settled or the close-out's own wait has run out — the host's stated wait, or fifteen seconds by default — and a close-out whose work had not concluded is stated on the diagnostic channel as unconfirmed rather than claimed either way. `onRound` is subscribed only when the assembly injected a round handler, and what it receives are the harness's run-cycle observations (`RoundObservation`), not edges: the synthesis above decides which of them is a transition. `onSessionContext` is subscribed only when a group observes a context reading, and what it receives is one collection of one session's own context (with the model that session ran at that instant) — a fact the framework records and decides about, never an edge, and never a reading the adapter deduplicates. `nextTask(callback)` is the harness's own task boundary, which is where the framework re-checks an end candidate — one callback per arrangement, no duration and no repetition. |
| `CanAcceptInput` | [`Command interface`](../interface/command/details/implementation.ts#L125) | `() => boolean \| undefined` — the framework's idle query: `true` when the agent can take input now, `false` when it is working, and `undefined` when the harness reports no idle fact at all (surfaced, never fabricated). It is a query and not a payload, carried by command deliveries so the arm path can read the state it starts from without waiting for any event. |
| `CommandInvocation` | [`port.ts`](../runtime/port.ts) | Internal adapter contract. One command invocation's facts: the argument text, the owner, whether the session has a UI (`hasUI`), the idle query (`canAcceptInput`), the provider that session currently runs (`provider`, absent as `undefined` when the surface reports no current model), and the feedback, persistence and marker transports. The framework constructs the extension-facing `CommandDelivery` from its approved members; the invocation is never handed to an extension. |
| `CommandDelivery` | [`Command interface`](../interface/command/details/implementation.ts#L137) | The delivery a directed handler receives: `args`, `owner`, `hasUI`, `canAcceptInput`, `provider`, `feedback`, the declared-value `state` seam it writes through and the owner-scoped `capability` it may retain. It is explicitly constructed, so the invocation's persistence callback and marker area transport are not reachable from the extension. |
| `ActionDelivery` | [`Command interface`](../interface/command/details/implementation.ts#L185) | The delivery one routed `actions` action receives: `args`, `owner`, `hasUI`, `canAcceptInput`, `provider` and `feedback` only. No declared-value seam, retained capability, persistence callback or marker transport, because an action owns no framework State and no area line. |
| `SessionDelivery` | [`port.ts`](../runtime/port.ts) | The facts one semantic session event carries: the event itself, the owner the event concerns (the session being entered on a start, the one being left on an end), the target branch's persisted payloads, the persistence medium a retained capability records through, the same `hasUI` fact and feedback transport a command delivery carries, the framework's own notice transport, and the transport the boundary's marker-area update is published through. |
| `DeclaredValueSeam` | [`State interface`](../interface/state/index.ts) | `{ read(): boolean; write(value: boolean): void }` — the extension's declared value for one owner. A handler owns the write: the framework writes nothing on its behalf, records each write best-effort where the field persists there (a `memory` field is never recorded), and republishes the framework-owned marker area after every write (so `false` clears the extension's line). Writes are not deduplicated — a repeated write of the same value records and republishes again — and the seam and a retained capability reach that one write implementation through `StateStore.writer` ([`framework/core/state.ts`](../core/state.ts); see [State module](#state-module)). |

## Owner-scoped effect capabilities

An extension-owned background effect — a heartbeat timer, an outbound flusher — runs outside any handler
delivery, so the delivery-scoped seams above cannot be what it calls. It does not become a framework concern
and it does not need a framework API of its own: the delivery that arms the effect hands out an owner-scoped
capability the handler retains in its own owner-keyed record, and the callback reuses that handle later. The
capability is what the delivery already carries — the declared-value seam and the unified feedback channel —
bound to the same owner, so a write an hour later records, renders and clears exactly as one made inside the
delivery, and no owner-resolving write or feedback API exists for a caller to reach around the delivery that
authorized it.

| Member | Source | Meaning |
| --- | --- | --- |
| `OwnerCapabilityHandle.state` | [`state/index.ts#L118`](../interface/state/index.ts#L118), [`#L91`](../interface/state/index.ts#L91) | The owner's declared-value seam: `read()` is ungated — a handle kept past its owner's life still observes the current value, never a frozen copy — while `write(value)` is the one write path (`DeclaredValueSeam`) and works only while that life is open: the new value becomes current, is recorded best-effort in the owner's medium where the field persists there, and the marker area is republished. |
| `OwnerCapabilityHandle.feedback` | [`state/index.ts#L118`](../interface/state/index.ts#L118), [`feedback/index.ts#L33`](../interface/feedback/index.ts#L33) | The owner's unified extension feedback channel (`FeedbackTransport`), so a failure the background effect observes still reaches the operator at the severity the extension chose. |

**The capability is valid for its owner's life and no longer.** The framework's own behavior runs before any
handler sees a session event, so the boundary that ends an owner has already retired that owner's cell by the
time a handler observes it: a capability retained earlier is inert from then on (a later start opens the
owner's life again for newly minted handles only — it never revives an old one). A write is dropped before it
can record a value, attempt persistence or republish the marker area — a late callback can never recreate the
retired cell — and feedback is dropped before it reaches the operator, so a session that is gone is not spoken
for. A capability retained by a `session_end` delivery is inert from birth, because that owner ended before the
handler ran.

**A delivery whose session is not its own owner hands out no authority.** That session owns no cell, and
observing it must not grant what the Owner holds: such a delivery's capability reads the value its own
field's inheritance rule reads — the Owner's current value for a `follow` field, the declared default
otherwise — and every `write` and every `notify` is dropped, wherever it is used and whatever happens to
the session afterwards. An extension that subscribes to every actual session therefore gains observations
and nothing else, and a subagent can never drive the Owner's value, its marker area or its notices.

**The `session_end` delivery keeps a feedback channel of its own.** That dispatch's `feedback`
([`session.ts#L43`](../interface/session/details/session.ts#L43)) is the one thing that can still speak for the
boundary: a notice published while the handler runs reaches the operator, which is what lets an extension
announce the session switch while it stops its local effects. The channel is the dispatch's own and closes when
the dispatch ends — a timer that kept that channel instead of the capability is heard by nobody — so the two
are not interchangeable: the channel reports this boundary, the capability acts for the owner that retained it.
Both are exercised at the adapter contract in `tests/framework/owner-capability.test.ts`, and the additive
architecture decision is [ADR 0002](../../docs/adr/0002-semantic-extension-framework.md#owner-scoped-effect-capabilities-additive-connect-bot-migration-decision-07).

## State module

Every State value, owner life, declared-value write and session-boundary restoration is implemented by
one framework-internal module, [`framework/core/state.ts`](../core/state.ts) — the separately
named declared-value, capability and session behaviors are its implementation detail, not modules of
their own. An extension never names it: the authoring surface is unchanged. The decision that shaped it,
with the behavior it must preserve, is
[ADR 0002](../../docs/adr/0002-semantic-extension-framework.md#one-state-module-for-value-life-writes-and-restoration-constrained-refactor).

| Member | Meaning |
| --- | --- |
| `StateRules` | The State one store serves: `{ field, persistence }`, exactly the pair an assembly resolves from the definition through `activationField` ([`definition.ts#L75`](../core/definition.ts#L75)) and `statePersistence` ([`definition.ts#L80`](../core/definition.ts#L80)), plus the two optional access seams an assembly states — `localAccess` (the owner this process serves, offered) and `follow` (the owner another process serves, read). The constructor requires the first two: a store knows its field and persistence and holds no definition. |
| `new StateStore(rules)` | One store per adapter factory call ([`omp.ts`](../../adapters/omp/index.ts), [`pi.ts`](../../adapters/pi/index.ts)), shared by every session binding of that extension — not a process-global registry keyed by definition id. |
| `view(ownerKey)` | The read surface, unchanged: `read(field)` is the owner's current value, or the declared default when unset. |
| `followed(ownerKey)` | The read surface for an owner this process may not hold: the cell first (an in-process read takes no access at all), then what the owner's access last stated, then the declared default. It is what a `follow` field's subagent reads. |
| `serves(ownerKey)` | Whether this store answers for an Owner: an Owner boundary it reconciled, a cell it wrote — a fact that survives the Owner's retirement — or an Owner it has chased through an access. What the process-wide Marker area reads to decide which of one extension's registrations answers for a seat, so a session's binding speaks for its own Owner — or for the Owner it follows — and for nothing else. |
| `follows(ownerKey)` | Whether this store reads that Owner through an access rather than holding it: true once it has chased that Owner, reached or not. The Marker area asks it for the seat it is about to publish, because a value that changes in another process had no transition here to publish it. |
| `dispose()` | Releases every access this store holds and stops following: a disposed store reads the declared default for followed owners and opens nothing again. The cells it serves, their owners' lives and its own offer of them are untouched. |
| `writer(target)` | The declared-value seam of one delivery (`StateWriteTarget`: `ownerKey`, `persist(values)`, `publishMarker()`), ungated: the value is set first, then recorded best-effort where the field persists (`memory` is never recorded), then the marker area is published. A repeated write of the same value is not deduplicated. |
| `capability(target)` | The owner-scoped handle (`StateCapabilityTarget` adds `feedback`): `read` is ungated — a handle kept from an earlier life still reads the current value — while `write` and `feedback` work only while its owner's life is open. A handle minted after that life ended is inert from birth; a later start opens a life for newly minted handles and never revives an old one. |
| `reconcile(change)` | One session boundary (`StateSessionChange`: `owner`, `event`, `statePayloads`, `publishMarker(ownerKey)`): a delivery that is not its own owner is ignored; an end drops the cell then revokes capabilities, publishing only for `disposed`; a start opens the life, seeds a `session-entry` field from the last payload when it declares the field as a boolean (otherwise the declared default) and never seeds `memory`, then publishes. |

## Maintaining this index

When a public symbol gains a parameter, update the cited row here and the source line it points to; the
source stays authoritative, this file stays an index. The framework's public interface is stable: a
removal or rename is a new explicit decision recorded in [ADR 0002](../../docs/adr/0002-semantic-extension-framework.md),
not an edit to this document alone. The capability cutover was one such explicitly accepted
non-additive change.
