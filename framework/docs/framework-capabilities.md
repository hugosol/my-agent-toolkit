# Semantic extension framework — capability and options index

This is the index of the framework's public authoring surface: the entry points, and the meaning and
accepted value of every parameter `defineExtension` and `ompAdapter` take. It is written for a human or
an agent that has to *find* an entry point and then read the source for detail — every symbol below is
cited to its defining file and line, and that source is authoritative for behavior, ordering and errors.

It is not the contract and not an implementation description. The promises and seams live in the
[contract](../../.scratch/connect-bot-migration/contract.md); terminology lives in [GLOSSARY.md](../GLOSSARY.md);
the architecture decision is [ADR 0002](../../docs/adr/0002-semantic-extension-framework.md). Only the first-release
("v1") surface is listed: the unions below are closed, and a kind outside them is not bound.

The in-progress [model-cost observation decisions](../../.scratch/model-cost-migration/lighthouse/03-observation-contract.md) revise the target placement of reusable lifecycle logic; the index below still describes the implemented surface, not the planned input seam or a completed refactor.

## Entry points

| Entry point | Source | Role |
| --- | --- | --- |
| `defineExtension(definition)` | [`framework/public.ts`](../public.ts), defined at [`framework/core/definition.ts#L287`](../core/definition.ts#L287) | Declares an extension. Returns its argument typed; nothing is validated or copied here. |
| `ExtensionDefinition` and its member types (`StateDeclaration`, `StatePersistence`, `StateInheritance`, `CommandDeclaration`, `CommandToggleDeclaration`, `CommandDirectedDeclaration`, `CommandActionsDeclaration`, `ControlKind`, `PromptDeclaration`, `PromptStrategy`, `MarkerDeclaration`, `ExtensionConfigDeclaration`, `ConfigFieldType`) | [`framework/core/definition.ts#L267`](../core/definition.ts#L267) | The definition shape and its configuration types. |
| `ExtensionAssembly`, `ExtensionFactory`, `ImplementationContext`, `ExtensionImplementation`, `InitializationDelivery` | [`framework/public.ts`](../public.ts), defined at [`framework/core/assembly.ts`](../core/assembly.ts) | The assembly surface an extension's implementation is written against: the factory a harness adapter calls once the configuration validated, the context it is handed, what it returns (`commands`, `subscriptions`, `catalog`, the one-time `initialize` and `cleanup`), and the facts the initialization runs with. Types only — the entry keeps `defineExtension` as its one runtime export. |
| `SubscriptionGroup`, `ObservationScope` | [`framework/core/protocol.ts#L175`](../core/protocol.ts#L175), [`#L165`](../core/protocol.ts#L165) | The one-time declaration of what a subscription observes: a group carries the scope it covers (`owner` — the owner session's own deliveries; `session` — every actual session the adapter reports, with that session's own identity, direct parent and latest name) and the handlers for the event kinds it subscribes. Both scopes run through the one dispatch, and widening a group to `session` grants no State write and no external-effect authority. |
| `SessionFacts`, `TurnEvent`, `TurnStartDelivery`, `TurnEndDelivery`, `TurnStartFacts`, `TurnEndFacts`, `TurnUsage`, `TurnOutcome`, `ProviderHttpFacts`, `TurnSignal`, `TurnSignalFacts`, `CatalogPrice`, `CatalogPriceSource`, `ProviderAccess`, `ProviderAccessFacts` | [`framework/core/protocol.ts#L130`](../core/protocol.ts#L130), [`#L376`](../core/protocol.ts#L376), [`#L511`](../core/protocol.ts#L511), [`#L527`](../core/protocol.ts#L527) | The per-actual-session facts and the Turn axis: a session's identity, direct parent and latest name; the two Turn edges with the request-time facts fixed at the first and repeated at the second; the reliable-or-unavailable usage, outcome, HTTP facts and the two provider reference ids; the mapped native signals a harness adapter reports, and the extension's own catalog the framework queries at each request's start. See [The Turn axis and the two observation scopes](#the-turn-axis-and-the-two-observation-scopes). |
| `CommandImplementations`, `CommandImplementation`, `CommandAction`, `ActionsCommandImplementation`, `ActionDelivery` | [`framework/core/assembly.ts#L50`](../core/assembly.ts#L50), [`framework/core/protocol.ts#L591`](../core/protocol.ts#L591) | What an implementation delivers for one command: a directed implementation under its command name, or an `actions` command's table of named actions. An action may return a promise the host's command chain waits for, and its delivery is the invocation facts alone — the argument, the owner, `hasUI`, the idle query, the running session's `provider` and the feedback and marker transports — with no declared-value seam, because an `actions` command drives no State. |
| `ompAdapter(definition, options?)` | [`framework/adapters/omp.ts#L789`](../adapters/omp.ts#L789) | Assembles a definition for the `omp` harness; returns an `OmpExtensionFactory`. Also re-exports `BindingResult`, which is what that factory returns. |
| `ExtensionAssembly` | [`framework/core/assembly.ts#L178`](../core/assembly.ts#L178) | The harness-independent assembly information, every member optional (`factory`, `requiredSemantics`, `configBaseDir`). Harness version support is deliberately not one of them either: support is an evidence claim recorded in the repository's support record ([`harness-support.md`](harness-support.md)), and no assembly supplies or widens it. |
| `BindingResult`, `BindingFailure` | [`framework/core/protocol.ts#L680`](../core/protocol.ts#L680) | What a binding concluded, and why it was refused. |
| `CommandActions`, `DirectedCommandImplementation`, `CommandDelivery`, `DeclaredValueSeam` | [`protocol.ts#L484`](../core/protocol.ts#L484), [`#L447`](../core/protocol.ts#L447), [`#L566`](../core/protocol.ts#L566), [`#L398`](../core/protocol.ts#L398) | The implementations an assembly injects for a definition's directed commands, keyed by command name — each with a `run` member and an optional `unrecognized` member for an argument that parsed to no directive — and the delivery and declared-value seam each one writes through. |
| `RecognizedDirective`, `DirectedDirective` | [`framework/core/protocol.ts#L367`](../core/protocol.ts#L367) | The directive the framework normalizes a directed command's argument into, and the two members it acts on. |
| `OwnerCapabilityHandle` | [`protocol.ts#L432`](../core/protocol.ts#L432) | The owner-scoped capability a handler may retain — the declared-value seam plus the unified feedback channel, bound to the owner its delivery resolved — for the effects it drives after the delivery is over (a heartbeat timer, an outbound flusher). Valid while its owner lives, inert afterwards; carries no `hasUI`. See [Owner-scoped effect capabilities](#owner-scoped-effect-capabilities). |
| `SessionEvent`, `SessionStartReason`, `SessionEndReason` | [`framework/core/protocol.ts#L76`](../core/protocol.ts#L76), [`#L44`](../core/protocol.ts#L44), [`#L54`](../core/protocol.ts#L54) | The session axis of the semantic lifecycle: the symmetric `session_start`/`session_end` pair and the reason vocabulary each member carries, plus `session_facts` — the one session delivery that is not a boundary, reporting a session's own facts where the harness learned they changed (a rename, most often) and reconciling nothing. |
| `RoundEvent`, `RoundDelivery`, `RoundObservation` | [`framework/core/protocol.ts#L331`](../core/protocol.ts#L331) | The round axis of the semantic lifecycle: the edge-triggered `round_start`/`round_end` pair (no payload), the facts one edge carries, and the actual session (`SessionFacts`) it came from — plus the native run-cycle observation an adapter reports instead of an edge, which carries the harness's continuation flag and the live quiescence read the re-check asks. The framework mints and retires the round's identity per actual session from the edges its own synthesis dispatches; the identity is what a Turn's start facts name as the round it belongs to. |
| `SemanticEvent`, `SemanticEventHandlers`, `SemanticEventDeliveryMap` | [`protocol.ts#L550`](../core/protocol.ts#L550), [`#L582`](../core/protocol.ts#L582), [`#L553`](../core/protocol.ts#L553) | All three axes as one handler surface: the event union (session, round and Turn), the handler map an implementation delivers for one subscription group keyed by event, and the map that keeps each kind paired with the delivery it carries. Which deliveries reach a handler is the group's declared `ObservationScope`, not this type. |
| `SessionEventHandlers`, `SessionEventHandler`, `SessionEventDelivery`, `RoundEventHandlers`, `RoundEventHandler`, `TurnEventHandlers`, `TurnEventHandler` | [`protocol.ts#L266`](../core/protocol.ts#L266) | The per-axis handler aliases, keyed by event, and the delivery each one receives — the session axis's delivery carries the actual session's facts and the owner-scoped capability, the round axis's carries the session facts and no capability, and the Turn axis's carries the Turn's facts and no capability either. A handler may return a promise: the framework contains its rejection the way it contains a synchronous throw, and does not wait for it. All of these are public authoring types ([`framework/public.ts`](../public.ts)), not adapter exports. |
| Requirement types (`RequiredSemantic`, `DeclarableRequiredSemantic`, `FRAMEWORK_REQUIRED_SEMANTICS`) | [`framework/core/requirements.ts`](../core/requirements.ts) | The semantics a binding's behavior rests on: the framework's own, and the ones an assembly may declare its extension additionally depends on. Contract metadata for the independent verification — no runtime switch. |
| `ConfigurationViolation` | [`framework/core/violations.ts`](../core/violations.ts) | The report of one broken configuration rule, carried by a `configuration` binding failure: a `ConfigurationViolationKind` and the deterministic `detail`. |
| `ExtensionConfigDeclaration`, `ConfigFieldType`, `BOUND_CONFIG_FIELD_TYPES` | [`framework/core/definition.ts#L255`](../core/definition.ts#L255) | The configuration an extension requires of its own `config.yaml`: the file's path, and the keys the file must carry with the type each must match. See [Extension configuration](#extension-configuration-declaration--file). |
| `readConfig`, `getConfig`, `ConfigSource`, `ConfigReadOptions`, `ConfigReader`, `ConfigParser`, `ConfigLoadError`, `ExtensionConfigError` | [`framework/core/config.ts`](../core/config.ts) | The one reading, parsing and validating implementation, the values shared logic reads, the injectable seam it runs through, and the two error classes that keep a loading-time failure apart from a misuse. See [Extension configuration](#extension-configuration-declaration--file). |
| `readConfigDocument`, `isScheduledWait`, `SCHEDULED_WAIT_TEXT`, `describeValue` | [`framework/core/config.ts`](../core/config.ts) | The same reading and parsing seam used for a document the framework interprets itself rather than validating against a declaration — the shared configuration file, where a missing file is an answer rather than a failure — and the shared vocabulary for a value that is not what a configuration requires and for a wait this harness's timer schedules. |
| `request`, `HttpRequestOptions`, `HttpConfigurationError` | [`framework/public.ts`](../public.ts), defined at [`framework/modules/http.ts`](../modules/http.ts) | The framework's general HTTP module: the one call shared logic imports directly, what a request declares (method, headers, body, `timeoutMs`, `proxy`), and the configuration failure a request may reject with before anything is sent. These are values — `defineExtension` and `request` are the entry's runtime exports. See [General HTTP module](#general-http-module). |
| `updateFile`, `SafeFileUpdateOptions`, `SafeFileUpdateError`, `SafeFileUpdateFailureKind` | [`framework/public.ts`](../public.ts), defined at [`framework/modules/files.ts`](../modules/files.ts) | The framework's general safe-file module: the one coordinated read-modify-publish call shared logic imports directly, the absolute target and update function it takes, the wait budget and abort it accepts, and the distinguishable failure a refused coordination rejects with. These are values too — `defineExtension`, `request` and `updateFile` are the entry's runtime exports. See [General safe-file module](#general-safe-file-module). |
| Adapter-facing delivery types (`OwnerReference`, `NoticeTransport`, `FeedbackLevel`, `FeedbackTransport`, `MarkerTransport`, `StateValues`, `TurnSignal`, `TurnSignalFacts`) | [`framework/core/protocol.ts#L15`](../core/protocol.ts#L15), [`#L907`](../core/protocol.ts#L907) | The facts and transports a harness adapter resolves; not authored by an extension. `HarnessPort.onTurn` ([`protocol.ts#L1023`](../core/protocol.ts#L1023)) is the hook an adapter reports its mapped model-cycle facts through. |

A real, minimal consumer is the codebase-tools extension: the shared declaration is
[`extensions/codebase-tools/definition.ts`](../../extensions/codebase-tools/definition.ts), its OMP assembly is
[`extensions/codebase-tools/harnesses/omp.ts`](../../extensions/codebase-tools/harnesses/omp.ts), and the discovery
entrypoint that re-exports it is [`entrypoints/omp/codebase-tools.ts`](../../entrypoints/omp/codebase-tools.ts).

## `defineExtension(definition)`

`definition` is an `ExtensionDefinition` ([`definition.ts#L267`](../core/definition.ts#L267)): plain data,
no builder and no handler. All fields are described below. `state`, `commands`, `prompts`, `marker` and `config`
are optional; `id` and `displayName` are required.

### `id: string`

Stable extension identity. It is also the prefix of every contribution identity: a prompt slot's framework
identity is `${id}:${tag}` ([`definition.ts#L155`](../core/definition.ts#L155)).

### `displayName: string`

Human-readable name used for the extension's label and the text of its notifications (for example the
toggle's enabled/disabled notice).

### `state?: StateDeclaration`

The State the extension declares ([`definition.ts#L48`](../core/definition.ts#L48)). v1 owns exactly one
boolean activation field per extension, and the field name is also the persistence key for its value whenever the
field is persisted. The declared axes are independent: the control kind decides how a command drives the field,
persistence decides whether the value is recorded in the owner's medium and seeded from a branch, and inheritance
decides whether a subagent reads the owner's current value or the field's declared default.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `field?` | `string` | The activation field name. Defaults to `DEFAULT_ACTIVATION_FIELD` = `"enabled"` when `state` is omitted ([`definition.ts#L81`](../core/definition.ts#L81), resolved by `activationField` at [`definition.ts#L255`](../core/definition.ts#L255)). |
| `persistence?` | `"session-entry"` \| `"memory"` | Whether the value is recorded in the owner's persistence medium and seeded from the target branch at a session boundary (`session-entry`, the default, [`definition.ts#L58`](../core/definition.ts#L58)) or kept in memory only (`memory`: never recorded, never seeded; a boundary that replaces the owner drops it to the declared default, while navigation that keeps the owner keeps the value). Resolved by `statePersistence` ([`definition.ts#L260`](../core/definition.ts#L260)). |
| `inheritance?` | `"follow"` \| `"none"` | How a subagent session reads the value: `none` (the default, [`definition.ts#L61`](../core/definition.ts#L61)) reads the field's declared default, `follow` reads the owner's current value live. Resolved by `stateInheritance` ([`definition.ts#L265`](../core/definition.ts#L265)); codebase-tools declares `follow` ([`extensions/codebase-tools/definition.ts`](../../extensions/codebase-tools/definition.ts)). |

**Bound set.** `BOUND_STATE_PERSISTENCES = ["session-entry", "memory"]`
([`definition.ts#L70`](../core/definition.ts#L70)) and `BOUND_STATE_INHERITANCES = ["follow", "none"]`
([`definition.ts#L78`](../core/definition.ts#L78)): a value outside them is refused at binding as an
`initialization` failure, never silently read as the default one.

### `commands?: readonly CommandDeclaration[]`

The extension's control commands. `CommandDeclaration` is the closed union of the three bound control kinds
([`definition.ts#L162`](../core/definition.ts#L162)); `ControlKind` is its discriminant. The control kinds
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
| `"toggle"` | Alternates the field between its two values on successive executions, and publishes the extension's activation feedback (`<displayName> enabled`/`disabled`) on the delivery's extension feedback channel at `info` severity. | [`definition.ts#L84`](../core/definition.ts#L84) |
| `"directed"` | Names its target value explicitly and repeats its side effect on every execution: the framework never deduplicates, short-circuits or serializes it, so idempotence is the extension's, and the write is its injected implementation's. | [`definition.ts#L113`](../core/definition.ts#L113) |
| `"actions"` | Offers a declared table of named actions. The framework trims the argument, ignores case and matches it **whole**: empty prints the help, a match runs that action and waits for it, and anything else prints the same help at `error` severity and runs nothing. No abbreviation, no extra argument, no default action, and the directed kind's `unrecognized` member is deliberately not consulted. An `actions` command drives no declared State. | [`definition.ts#L144`](../core/definition.ts#L144) |

**Bound set.** `BOUND_CONTROL_KINDS = ["toggle", "directed", "actions"]`
([`definition.ts#L182`](../core/definition.ts#L182)); deeper argument grammars, flags, numeric arguments
and aliases remain deferred. A kind outside the bound set is refused at binding, not silently dropped. (One
extension, one command name, one declared writer per State field — see `ConfigurationViolation` below.)

**Directed commands pair a declaration with an injected implementation.** The definition names the command
and its field; the implementation arrives with the assembly's implementation factory
([`assembly.ts#L118`](../core/assembly.ts#L118)). Binding refuses a directed declaration whose
implementation was not injected — an `initialization` failure, with nothing registered — so a command the user
can run always has something to run.

The framework then normalizes the argument into a `DirectedDirective`
([`protocol.ts#L367`](../core/protocol.ts#L367)): `{ kind: "activate" }` for the empty argument,
`{ kind: "deactivate" }` for `off`, and `{ kind: "unrecognized"; argument }` for anything else. A recognized
directive runs `DirectedCommandImplementation.run` with a `CommandDelivery`. An unrecognized argument is not a
directive: the framework records no value and publishes nothing, and hands the text verbatim to the
implementation's optional `unrecognized` member ([`protocol.ts#L474`](../core/protocol.ts#L474)) so the
extension that owns the words can answer a mistyped argument. An implementation that injects no such member
leaves the argument inert, which is what makes the addition compatible with implementations that predate it. A
directed command publishes no framework feedback at all — its operator-facing text belongs to the extension,
which publishes it on the delivery's extension feedback channel at the severity it chooses.

**An `actions` command routes, awaits and reports.** Its implementation is a table of functions keyed by
declared action name ([`assembly.ts#L50`](../core/assembly.ts#L50)); binding refuses a declaration whose table
lists an action with no function behind it, or an implementation of the directed kind
([`binding.ts#L234`](../behaviors/binding.ts#L281)). Routing, the help text and the failure report are the
framework's own ([`actions.ts#L52`](../behaviors/actions.ts#L52)): an action may return a promise and the
command concludes only when it settles — the host's command chain receives that promise, so an operator's
command finishes with the effect rather than beside it — and a synchronous throw or a rejected promise is
reported once, at `error` severity, as `/<name> <action> failed: <detail>`. The framework retries nothing,
rolls nothing back and reports no success: an action that succeeded says so itself on the delivery's feedback
channel. Its delivery ([`protocol.ts#L591`](../core/protocol.ts#L591)) is the invocation facts alone — the
argument, the owner scope, `hasUI`, the idle query and the two effect transports — because an `actions`
command drives no declared State and therefore has no seam or capability to carry.

**The implementation owns the write.** The delivery carries the declared-value seam
([`protocol.ts#L398`](../core/protocol.ts#L398)): `read()` observes the value the invocation started
from, and `write(value)` is the only path that records the field — the framework writes nothing before, after
or instead of it, so an action that fails leaves the value alone. Each write is recorded in the owner's
persistence medium best-effort and followed by an update of the framework-owned marker area
([`protocol.ts#L324`](../core/protocol.ts#L324)), which is why a write of `false` removes the
extension's line. The same seam serves every handler delivery, so the write authority has one implementation
whatever the control kind.

**The delivery also carries a capability the handler may retain.** `delivery.capability`
([`protocol.ts#L578`](../core/protocol.ts#L578)) is the same declared-value write and the same
feedback channel this delivery uses, bound to the owner it resolved, so an extension whose effects outlive the
delivery — the heartbeat timer that disarms it, the outbound flusher — keeps that handle in its own owner-keyed
record instead of asking the framework for an owner-resolving write or feedback API. It is valid for the
owner's life and no longer: the boundary that retires the owner's cell revokes it, so a late callback's write is
a no-op that neither recreates State nor republishes the marker area and its feedback is dropped. It carries no
`hasUI`. See [Owner-scoped effect capabilities](#owner-scoped-effect-capabilities).

### `prompts?: readonly PromptDeclaration[]`

The injected-prompt slots ([`definition.ts#L158`](../core/definition.ts#L158)). A slot's framework
identity is `${definition.id}:${tag}`; its visibility, delivery position and retention are framework-owned
and are not parameters.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `tag` | `string` | The slot's identity within the extension; with `id` it forms `${id}:${tag}`. One rule per slot. |
| `strategy` | `PromptStrategy` | When the slot contributes (see below). |
| `content` | `string` | The text the slot contributes. |

`PromptStrategy` ([`definition.ts#L151`](../core/definition.ts#L151)) — both members are bound
(`BOUND_PROMPT_STRATEGIES`, [`definition.ts#L172`](../core/definition.ts#L172)):

| Value | Meaning |
| --- | --- |
| `"first-enabled-run"` | Contributes while the current branch does not yet carry the slot's identity. |
| `"every-enabled-run"` | Contributes on each enabled run. |

### `marker?: MarkerDeclaration`

The extension's status-marker text ([`definition.ts#L175`](../core/definition.ts#L175)). Placement,
ordering and lifecycle are framework-owned; the extension supplies only the text. The area is one per
process rather than one per module instance: it is registered on the process global under a well-known
symbol, so it stays single even when the adapter layer's loader evaluates its own copy of the framework
module graph for each extension.

What the area carries is the *displayed* session's own effective State — the session the host is showing,
re-read at every publication when its adapter publishes a `viewedSession` ([`protocol.ts`](../core/protocol.ts)),
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
leftover registration of an earlier session that held the same key.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `text` | `string` | The marker text rendered in the framework's unified marker area. |

### `config?: ExtensionConfigDeclaration`

The configuration the extension requires of its own file
([`definition.ts#L218`](../core/definition.ts#L218)). Omitted — the case for every extension so far —
means the extension reads no configuration at all and the capability is invisible to it.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `path?` | `string` | The file's path, relative to the **configuration base directory** the assembly supplies (`ExtensionAssembly.configBaseDir`); the convention `extensions/<definition.id>/config.yaml` when omitted. An absolute path is used as declared, and with no base directory a relative path resolves against the process's working directory. |
| `fields` | `Readonly<Record<string, ConfigFieldType>>` | Every key the file must declare, with the type it must match: `"string"`, `"non-empty-string"`, `"number"`, `"boolean"` or `"milliseconds"` (`BOUND_CONFIG_FIELD_TYPES`, [`definition.ts#L193`](../core/definition.ts#L193)). A `milliseconds` field is a whole number of milliseconds this harness's timer schedules — 1 through 2^31-1, the longest delay it waits for before clamping a value to 1ms — so a wait budget is never read as a delay the extension would not be given. |

The declaration is plain data and stays that way: nothing is read or validated at declaration time, and the file
it names is what `getConfig` hands the extension's shared logic. See
[Extension configuration](#extension-configuration-declaration--file).

## `ompAdapter(definition, options)`

Assembles an `ExtensionDefinition` for the `omp` harness
([`framework/adapters/omp.ts#L789`](../adapters/omp.ts#L789)). It returns an `OmpExtensionFactory`
([`omp.ts#L279`](../adapters/omp.ts#L279)) — `(api) => BindingResult` — which each thin entrypoint
re-exports as its default factory and the loader calls once per binding.

### `definition: ExtensionDefinition`

The same plain definition `defineExtension` returns. The adapter is the point at which declared conflicts
are reported and the binding is decided; declaration itself validates nothing
([`definition.ts#L250`](../core/definition.ts#L250)).

### `options: ExtensionAssembly`

The harness-independent assembly information ([`assembly.ts#L178`](../core/assembly.ts#L178)) — the adapter
adds no member of its own, so an assembly names no harness when it states what its extension builds, what it
depends on and where its configuration lives.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `factory?` | `ExtensionFactory` | The extension's own half: called once the definition's configuration validated, handed the validated values (`{ config }`, an empty object for a definition that declares none), and expected to return the implementation the binding connects ([`assembly.ts#L167`](../core/assembly.ts#L167)). It must send no remote request and start no timer, because a refusal can still follow. Omitted when the definition needs nothing injected. |
| `requiredSemantics?` | `readonly DeclarableRequiredSemantic[]` | The semantics this extension depends on **beyond** the ones every binding already requires: `"session-lifecycle-events"`, `"round-lifecycle-events"`. This is contract metadata: it states what the supported harness scope must be independently verified for, and nothing in the framework reads it at binding. Omitted when the extension depends on nothing beyond the framework's own requirements — the case for an extension that observes no lifecycle event. See [Declared requirements](#declared-requirements-verification-input). |
| `configBaseDir?` | `string` | The directory the definition's relative configuration paths are resolved against, as plain data: the extension repository root, from which the convention `extensions/<definition.id>/config.yaml` is relative. An assembly is the one party that knows it — its own module lives in that repository and the loader discovers the extension by an absolute path while the process runs in an arbitrary project directory — so connect-bot's assembly derives it from `import.meta.url`. Omitted when the definition declares no configuration, and omitted by an assembly that names none: a relative path then resolves against the process's working directory, and an absolute `path` is unaffected either way. See [Extension configuration](#extension-configuration-declaration--file). |

**There is no supported-version option, and no version is compared at all.** Harness version support is an
evidence claim recorded in [`harness-support.md`](harness-support.md), not an extension's, an assembly's or
the framework's runtime declaration: an assembly describes only what its extension builds and needs, normal
startup performs no compatibility check, and the version a run exercises is selected by the dock from the
support record (or from `OMP_TEST_VERSION` for a candidate). An extension that needs none of the options
above assembles with no options at all, which is the canonical form in this repository
([`extensions/codebase-tools/harnesses/omp.ts`](../../extensions/codebase-tools/harnesses/omp.ts)).

### The implementation factory and its lifecycle

`ExtensionImplementation` ([`assembly.ts#L118`](../core/assembly.ts#L118)) is what a factory returns, and it
is the whole of the extension's half: `commands` (the implementations of the definition's commands, keyed by
command name), `events` (the semantic lifecycle handlers), and the two lifecycle entries `initialize` and
`cleanup`. Every member is optional.

**Ordering.** Configuration is read and validated first; the factory is called only then, and the
declaration/implementation pairs and registration follow. Every refusal that follows the factory
runs the implementation's one cleanup, so a binding that fails after creation leaves no business instance
behind ([`binding.ts#L234`](../behaviors/binding.ts#L281)).

**One implementation per adapter.** The `omp` adapter calls the factory once — the first binding hands it the
validated configuration, and every later binding (another session's, a subagent's) reuses what it built
([`omp.ts#L795`](../adapters/omp.ts#L795)) — with one exception: an implementation whose cleanup has already
run is spent, so the binding that comes after it builds a fresh instance rather than delivering to a closed
one. An assembly that wants the instance to be the *process's* creates its adapter once, at module load, as
the entrypoints do; that is what makes an ordinary model, session, tree or view change harmless.

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
axis is the symmetric pair `session_start` ([`protocol.ts#L76`](../core/protocol.ts#L76)) and
`session_end`: a start seeds the owner's State from the branch the delivery names, an end retires the owner it
names, and both refresh the framework-owned marker area
([`protocol.ts#L324`](../core/protocol.ts#L324)). A transition that changes which session is current
is an end marked `transferred` naming the owner being left, followed by a start naming the owner being entered;
a navigation that leaves the current owner alone — a tree jump, a same-file resume or reload, an in-place
context reset — is not a transition and produces no event at all. The axis carries one member that is not a
transition either: `session_facts`, the session's own facts as the harness now reports them. A harness
delivers it where it learns a session's name (or another fact) changed rather than at that session's next
boundary, so a session nobody is viewing is as current as the one on screen; it reconciles nothing, retires
nothing and publishes no marker area, and a harness that reports no such change simply never delivers it.

The run axis is the edge-triggered pair `round_start` and `round_end`
([`protocol.ts#L241`](../core/protocol.ts#L241)), where a `Round` is one period of agent activity
from the agent taking up input to quiescence. Both edges are payload-free by design: how a round ended is a
fact the harnesses disagree about, and the agent's *current* state is the idle query below rather than a
field of a past transition. An edge is delivered only when the session really crosses it — the first run
start of a session that has no round open opens one, a start inside an open round is work within it and is
not a second `round_start`, a settle that already scheduled its continuation (an automatic retry, an
empty-stop recovery, a compaction or stop-hook turn, a pending asynchronous wake) is a pause inside the
round and not a `round_end`, and a settle while no round is open closes nothing, because there is no round
whose end it could be evidence of. Error and abort terminals end the round the same way an ordinary answer
does. The framework applies no behavior of its own to a round beyond the identity and its lifetime:
three-value agent state is not framework State, so a round edge is a subscription and nothing else.

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

An implementation subscribes through `subscriptions`: one `SubscriptionGroup` per group it declares,
each stating once the `ObservationScope` it observes under and the handlers for the event kinds it
subscribes. The delivery each handler receives
([`protocol.ts#L266`](../core/protocol.ts#L266)) carries the event, the owner scope it concerns, the
faithful `hasUI` fact, the unified extension feedback channel
([`protocol.ts#L111`](../core/protocol.ts#L111)) — the same two seams a command delivery carries, so
one shared gate and one notice path serve both handler kinds and all three axes — and the owner-scoped capability a
handler may retain for the effects it drives outside the delivery
([`protocol.ts#L703`](../core/protocol.ts#L703)), because a `session_start` is an arm path like a
command. A round or Turn delivery carries the first three and the feedback channel, and no capability:
neither edge is an arm path. The framework's
own behavior for a session event always runs first — the one exception is `session_facts`, which crossed no
boundary and therefore runs no framework behavior at all — and a handler that throws — or returns a promise that
rejects — is reported on the adapter's diagnostic channel without changing what the framework already did or
keeping another subscriber from running. Which native event becomes which semantic session event is the
adapter's mapping alone — and on the round axis the adapter reports its run-cycle facts and the framework's
synthesis above decides the transition; shared logic names no native event either way.

**The scope is the group's, and it is declared once.** An `owner` group is dispatched only for a delivery
whose owner is `{ kind: "owner" }` — the session that is its own owner. A subagent session's boundaries,
rounds and Turns, and those of a session whose parent chain leaves the process, resolve to `inherited`
or `unresolved` ([`protocol.ts#L31`](../core/protocol.ts#L31)) and reach no `owner` handler: those
deliveries belong to the owner that session follows, and the effect body an extension drives from them
belongs to the session that armed it, which is why a subagent can never report or stop the owner's effects.
A `session` group is dispatched every actual session's deliveries, each naming that session's own identity,
direct parent and latest name — the scope a per-session observation view declares. Widening a group grants
nothing else: there is no write path on either subscriber delivery, State inheritance is unchanged, and the
retainable capability is still scoped to the owner its delivery resolved. The rule is the framework's, expressed
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
more. The two edges are `turn_start` and `turn_end` ([`protocol.ts#L376`](../core/protocol.ts#L376)), and the
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
- **The extension supplies its own catalog.** `ExtensionImplementation.catalog`
  ([`assembly.ts#L152`](../core/assembly.ts#L152)) is the extension's own `CatalogPriceSource`: the framework
  queries it once per request, at the request's real start, and treats every value it returns as opaque
  business data — it never interprets a price, a currency or a bucket key, and an implementation that supplies
  no catalog has every Turn name the price as unavailable.
- **The harness's own model prices are a fact the factory receives.** A harness whose model catalog states
  what a model costs reports it as `HarnessPort.modelPrices` ([`protocol.ts#L1029`](../core/protocol.ts#L1029)),
  the same query shape and never a native model, registry or context; binding hands it to the extension's
  factory as `ImplementationContext.modelPrices` ([`assembly.ts#L93`](../core/assembly.ts#L93)). The framework
  never queries it itself — whether a channel is priced from the extension's own data or from the harness's
  catalog is the extension's business — and an adapter that reports no prices hands over no fact rather than an
  empty one. On `omp` the adapter maps it from the live session context's model catalog, in US dollars per
  million tokens, answering nothing for a pair the catalog does not carry or prices at zero on every bucket.
- **The harness's own provider access is a per-operation query the factory receives.** A harness whose host
  can resolve a provider's credential and address reports it as `HarnessPort.providerAccess`
  ([`protocol.ts#L1160`](../core/protocol.ts#L1160)), the small `ProviderAccess` query of
  `{ baseUrl?, credential? }` facts and never a native registry or credential store; binding hands it to the
  extension's factory as `ImplementationContext.providerAccess`
  ([`assembly.ts#L96`](../core/assembly.ts#L96)). The framework asks it for nothing and caches nothing: a
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

`readConfig(path, options)` ([`framework/core/config.ts#L296`](../core/config.ts#L296)) is the one
reading, parsing and validating implementation, and it is harness-neutral: the text is read through `node:fs`
and parsed as YAML by the pure-JS `yaml` package, and the reader, the parser and the base directory a relative
path is resolved against are all injectable through `ConfigSource`, so the framework's own suite covers every
failure path without a file. Every file-side failure is a `ConfigLoadError`
whose `detail` is the same deterministic text the binding reports.

**Shared logic reads the validated values, never the file.** `getConfig(definition)`
([`framework/core/config.ts#L379`](../core/config.ts#L379)) returns the values the declaration named —
exactly those keys, in declaration order; a key the declaration does not name is ignored — in whichever session,
command or lifecycle handler the extension runs. It is not a way to read a configuration that is not there: an
extension that declared no configuration, or whose values were never validated in this process, gets an
`ExtensionConfigError` ([`framework/core/config.ts#L96`](../core/config.ts#L96)), which is deliberately
neither a `BindingFailure` nor a `ConfigLoadError`.

The file belongs to the machine: there is no environment or command-line override, and a validated configuration
is read once per extension per process, so a changed value takes effect with the next process rather than with
the next session.

## General HTTP module

`request(url, options)` ([`framework/modules/http.ts`](../modules/http.ts)) is the framework's one
outbound HTTP call, imported directly by shared logic through [`framework/public.ts`](../public.ts)
rather than injected through a command or event delivery. It is deliberately not a business API: the
caller prepares everything it means and interprets everything it gets back.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `url` | `string` | The request target, as the caller prepared it. |
| `options.method?` | `string` | The HTTP method; `GET` when omitted. |
| `options.headers?` | `Readonly<Record<string, string>>` | The headers, sent exactly as given — no content type, no authorization, nothing added. |
| `options.body?` | `string` | The body, sent exactly as given — nothing is serialized. |
| `options.timeoutMs?` | `number` | The wait budget in milliseconds. Omitted takes the shared `http.defaultTimeoutMs`, and with that absent — or with no shared file at all — the built-in 30000. A declared budget must be a whole number of milliseconds this harness's timer schedules (`isScheduledWait`): `0` does not turn the wait off, and an illegal value is refused rather than replaced. |
| `options.proxy?` | `false \| string` | `false`, or omitted, is a direct connection. A string selects the entry of that name in the shared `http.proxies` table. |

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
      url: "http://127.0.0.1:7890"
```

`http.proxies.<name>.url` is the proxy's own address — `http://` or `https://`, which is the protocol of
the connection *to the proxy*, not of the target. The file is optional, machine-owned, and read once per
process, so an edited value takes effect with the next process. A request that names a proxy reads the
table it selected and nothing else: no table, no such entry, an entry without a usable address, and a
file that cannot be read or parsed are all `HttpConfigurationError`s that refuse the request *before
anything is sent* — never a direct request, and never a second attempt after a chosen proxy fails to
connect.

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
the module's own seam, not part of the published surface; `tests/framework/http.test.ts` drives it so
that no permanent case uses a network, and `scripts/http-transport-smoke.ts` proves the real transport
against loopback servers — a plain target and a TLS target, a plain proxy and an HTTPS proxy (both
absolute-form and CONNECT), a body that stops before its end, a delayed body under a short budget and
under a longer one, a refused proxy, a hung target for the built-in budget, and a proxy-environment trap
that the whole run — including a separate process driving the published `request` — never reaches.

## General safe-file module

`updateFile(target, update, options?)` ([`framework/modules/files.ts`](../modules/files.ts)) is the
framework's one coordinated read-modify-publish call, imported directly by shared logic through
[`framework/public.ts`](../public.ts) rather than injected through a command or event delivery. It is
deliberately not a business API: it knows no schema, no version and no period, it never interprets the
document, and what it publishes is exactly what the update function returned.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `target` | `string` | The document's absolute path. Its directory must already exist — the module creates documents, never the place they live — and it is read and replaced at this path. |
| `update` | `(current: unknown) => T \| Promise<T>` | The business update. It is called with the document as of inside the coordination scope, or `undefined` when the file does not exist yet, and the value it returns is what is published. A business refusal is a throw: the rejection reaches the caller untouched and the document is not written. |
| `options.timeoutMs?` | `number` | The whole wait budget in milliseconds — in-process queueing plus cross-process lock acquisition. Omitted takes the built-in 15000. A declared budget must be a whole number of milliseconds this harness's timer schedules; an illegal one is refused rather than replaced. |
| `options.signal?` | `AbortSignal` | Aborts the *wait*. Once the update has begun it is ignored: the call waits for the real result rather than pretending to have stopped. |

**What comes back.** The promise resolves with the update function's own return value, after that
document is really on disk; a rejection is either a [`SafeFileUpdateError`](../modules/files.ts) naming
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

## Binding outcome and failure report

The factory returns a `BindingResult` ([`protocol.ts#L665`](../core/protocol.ts#L665)):

```ts
type BindingResult =
  | { readonly bound: true; readonly definition: ExtensionDefinition }
  | { readonly bound: false; readonly failures: readonly BindingFailure[] };
```

An unbound result carries its `BindingFailure[]`. `BindingFailure`
([`protocol.ts#L635`](../core/protocol.ts#L635)) is a closed union of three kinds:

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

`describeBindingFailure(extensionId, failure)` ([`protocol.ts#L670`](../core/protocol.ts#L670)) produces
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
| `RequiredSemantic` | [`requirements.ts#L13`](../core/requirements.ts#L13) | Closed union of three members: `"history-preservation"` (existing conversation entries and their history-derived request content are preserved; new material is appended), `"session-lifecycle-events"` and `"round-lifecycle-events"` (the two semantic lifecycle axes of this release). |
| `FRAMEWORK_REQUIRED_SEMANTICS` | [`requirements.ts#L23`](../core/requirements.ts#L23) | The semantics required of every binding whatever its assembly declares: `["history-preservation"]`. Not declarable — `DeclarableRequiredSemantic` excludes it. |
| `DeclarableRequiredSemantic` | [`requirements.ts#L34`](../core/requirements.ts#L34) | The members an extension's assembly **may** declare it depends on: `Exclude<RequiredSemantic, (typeof FRAMEWORK_REQUIRED_SEMANTICS)[number]>` — today the two lifecycle axes. This is the type of `ExtensionAssembly.requiredSemantics`. |
| `ExtensionAssembly.requiredSemantics` | [`assembly.ts#L233`](../core/assembly.ts#L233) | An assembly's own statement of what its extension depends on beyond the framework's requirements. It is the input a verification run reports its coverage against; nothing in the framework reads it, and declaring one changes no binding outcome. |

`history-preservation` is not something an extension can trade away: it is the framework's own invariant —
new material is appended through the harness's own recording path and no existing conversation entry is
rewritten — which is why it is required of every binding and no assembly declares it.

### Two kinds of absence

Conflating them is the mistake the removed startup route made. A `RequiredSemantic` is a property of the
*harness scope*: whether it holds is established by the independent verification, for the whole supported
combination. The facts a *delivery* needs are per-context facts of one session, unknowable at binding time:
the session's idle fact behind `canAcceptInput()` ([`protocol.ts#L500`](../core/protocol.ts#L500)), and the
pending-message and asynchronous-job facts behind the quiescence gate
([`protocol.ts#L241`](../core/protocol.ts#L241)). The framework reports one of those on the non-model channel
when the read finds it missing and fabricates no value in its place (the read answers nothing, which is not a
confirmation, so the round stays open; the query answers `undefined`). See
[harness-support.md](harness-support.md#capability-difference-register) for which harness reports which of
these facts.

## Notices, marker and owner scope (adapter-facing shapes)

These are resolved by a harness adapter, not authored by an extension, and are cited here so the
option/feedback surface is complete. Both feedback channels travel the session's own UI channel on the `omp`
harness — the framework's notice as a `warning`, an extension's feedback at the level it chose — and fall back
to one stderr line when the session has no UI ([`omp.ts#L546`](../adapters/omp.ts#L546)).

| Symbol | Source | Shape and meaning |
| --- | --- | --- |
| `OwnerReference` | [`protocol.ts#L31`](../core/protocol.ts#L31) | `{ kind: "owner"; key }` \| `{ kind: "inherited"; key }` \| `{ kind: "unresolved" }` — the owner a framework effect acts on. An `inherited` session owns no cell: it never writes one and reads its owner's value only when the declared field opts in with `follow` (see `state.inheritance`), and neither it nor an `unresolved` session reaches an extension's subscription (see the owner scope above). |
| `NoticeTransport` | [`protocol.ts#L78`](../core/protocol.ts#L78) | `{ warn(message): void }` — the framework's own notice channel (session warnings), outside model context (a UI notification, or a stderr line when the session has no UI). It is **not** extension feedback and is never merged into it. |
| `FeedbackLevel` | [`protocol.ts#L92`](../core/protocol.ts#L92) | `"info"` \| `"warning"` \| `"error"` — the severity one extension notice carries. `info` reports an effect that happened, `warning` reports something to notice about an effect that only partly happened or did not happen at all, and `error` reports one that did not; the level names how serious a notice is, not which channel carries it. |
| `FeedbackTransport` | [`protocol.ts#L111`](../core/protocol.ts#L111) | `{ notify(level, message): void }` — the single harness-independent channel through which an extension tells the operator about an effect, carried by every handler delivery. Outside model context, never filtered or reordered by the framework: a UI notification at the notice's own severity when the session has a UI, and one stderr line when it does not. |
| `MarkerTransport` | [`protocol.ts#L324`](../core/protocol.ts#L324) | `{ publishMarkers(lines: readonly string[]): void }` — the transport for the unified marker area. |
| `ViewedSessionPort` | [`protocol.ts`](../core/protocol.ts) | The session the host is displaying, as its adapter resolves it — the fact behind the one marker area's projection, and never authority: `read(): OwnerReference \| undefined` (the displayed session's position, re-read per publication; `undefined` means this harness publishes no outlet at all, while a resolved `unresolved` means the outlet exists and its owner could not be obtained) and `subscribe(listener: (markers: MarkerTransport) => void): () => void` (one listener per change of the display; the listener re-reads and publishes through the transport it is handed). A harness that publishes no such outlet omits the member on `HarnessPort`, and the framework then projects the position each delivery carries. |
| `StateValues` | [`protocol.ts#L15`](../core/protocol.ts#L15) | `Readonly<Record<string, boolean>>` — the State values one write path records, by field name. |
| `HarnessPort` | [`protocol.ts#L590`](../core/protocol.ts#L590) | The registration and feedback surface an adapter provides (`setLabel`, `reportDiagnostic`, `onSession`, `onRound`, `nextTask`, `onRunInitiation`, `registerCommand`), plus the facts it resolves when it can and omits when it cannot: `modelPrices`, `providerAccess` and `viewedSession`. `onRound` is subscribed only when the assembly injected a round handler, and what it receives are the harness's run-cycle observations (`RoundObservation`), not edges: the synthesis above decides which of them is a transition. `nextTask(callback)` is the harness's own task boundary, which is where the framework re-checks an end candidate — one callback per arrangement, no duration and no repetition. |
| `CanAcceptInput` | [`protocol.ts#L500`](../core/protocol.ts#L500) | `() => boolean \| undefined` — the framework's idle query: `true` when the agent can take input now, `false` when it is working, and `undefined` when the harness reports no idle fact at all (surfaced, never fabricated). It is a query and not a payload, carried by command invocations so the arm path can read the state it starts from without waiting for any event. |
| `CommandInvocation` | [`protocol.ts#L511`](../core/protocol.ts#L511) | One command invocation's facts: the argument text, the owner, whether the session has a UI (`hasUI`), the idle query (`canAcceptInput`), the provider that session currently runs (`provider`, absent as `undefined` when the surface reports no current model), and the feedback, persistence and marker transports. |
| `CommandDelivery` | [`protocol.ts#L566`](../core/protocol.ts#L566) | The invocation a handler receives: those facts plus the declared-value seam it writes through and the owner-scoped capability it may retain. |
| `SessionDelivery` | [`protocol.ts#L126`](../core/protocol.ts#L126) | The facts one semantic session event carries: the event itself, the owner the event concerns (the session being entered on a start, the one being left on an end), the target branch's persisted payloads, the persistence medium a retained capability records through, the same `hasUI` fact and feedback transport a command delivery carries, the framework's own notice transport, and the transport the boundary's marker-area update is published through. |
| `DeclaredValueSeam` | [`protocol.ts#L398`](../core/protocol.ts#L398) | `{ read(): boolean; write(value: boolean): void }` — the extension's declared value for one owner. A handler owns the write: the framework writes nothing on its behalf, records each write best-effort where the field persists there (a `memory` field is never recorded), and republishes the framework-owned marker area after every write (so `false` clears the extension's line). Writes are not deduplicated — a repeated write of the same value records and republishes again — and the seam and a retained capability reach that one write implementation through `StateStore.writer` ([`framework/core/state.ts`](../core/state.ts); see [State module](#state-module)). |

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
| `OwnerCapabilityHandle.state` | [`protocol.ts#L432`](../core/protocol.ts#L432), [`#L398`](../core/protocol.ts#L398) | The owner's declared-value seam: `read()` is ungated — a handle kept past its owner's life still observes the current value, never a frozen copy — while `write(value)` is the one write path (`DeclaredValueSeam`) and works only while that life is open: the new value becomes current, is recorded best-effort in the owner's medium where the field persists there, and the marker area is republished. |
| `OwnerCapabilityHandle.feedback` | [`protocol.ts#L432`](../core/protocol.ts#L432), [`#L111`](../core/protocol.ts#L111) | The owner's unified extension feedback channel (`FeedbackTransport`), so a failure the background effect observes still reaches the operator at the severity the extension chose. |

**The capability is valid for its owner's life and no longer.** The framework's own behavior runs before any
handler sees a session event, so the boundary that ends an owner has already retired that owner's cell by the
time a handler observes it: a capability retained earlier is inert from then on (a later start opens the
owner's life again for newly minted handles only — it never revives an old one). A write is dropped before it
can record a value, attempt persistence or republish the marker area — a late callback can never recreate the
retired cell — and feedback is dropped before it reaches the operator, so a session that is gone is not spoken
for. A capability retained by a `session_end` delivery is inert from birth, because that owner ended before the
handler ran.

**The `session_end` delivery keeps a feedback channel of its own.** That dispatch's `feedback`
([`protocol.ts#L196`](../core/protocol.ts#L196)) is the one thing that can still speak for the
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
| `StateRules` | The State one store serves: `{ field, persistence }`, exactly the pair an assembly resolves from the definition through `activationField` ([`definition.ts#L255`](../core/definition.ts#L255)) and `statePersistence` ([`definition.ts#L260`](../core/definition.ts#L260)). The constructor requires it: a store knows its field and persistence and holds no definition. |
| `new StateStore(rules)` | One store per `ompAdapter` factory call ([`omp.ts#L789`](../adapters/omp.ts#L789)), shared by every session binding of that extension — not a process-global registry keyed by definition id. |
| `view(ownerKey)` | The read surface, unchanged: `read(field)` is the owner's current value, or the declared default when unset. |
| `serves(ownerKey)` | Whether this store answers for an Owner: an Owner boundary it reconciled, or a cell it wrote — a fact that survives the Owner's retirement. It is what the process-wide Marker area reads to decide which of one extension's registrations answers for a seat, so a session's binding speaks for its own Owner and nothing else. |
| `writer(target)` | The declared-value seam of one delivery (`StateWriteTarget`: `ownerKey`, `persist(values)`, `publishMarker()`), ungated: the value is set first, then recorded best-effort where the field persists (`memory` is never recorded), then the marker area is published. A repeated write of the same value is not deduplicated. |
| `capability(target)` | The owner-scoped handle (`StateCapabilityTarget` adds `feedback`): `read` is ungated — a handle kept from an earlier life still reads the current value — while `write` and `feedback` work only while its owner's life is open. A handle minted after that life ended is inert from birth; a later start opens a life for newly minted handles and never revives an old one. |
| `reconcile(change)` | One session boundary (`StateSessionChange`: `owner`, `event`, `statePayloads`, `publishMarker(ownerKey)`): a delivery that is not its own owner is ignored; an end drops the cell then revokes capabilities, publishing only for `disposed`; a start opens the life, seeds a `session-entry` field from the last payload when it declares the field as a boolean (otherwise the declared default) and never seeds `memory`, then publishes. |

## Maintaining this index

When a public symbol gains a parameter, update the cited row here and the source line it points to; the
source stays authoritative, this file stays an index. The framework's public interface is additive-only
([ADR 0002](../../docs/adr/0002-semantic-extension-framework.md)), so a removal or rename is a new explicit decision,
not an edit to this document alone.
