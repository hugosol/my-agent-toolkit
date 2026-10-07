# Semantic extension framework — capability and options index

This is the index of the framework's public authoring surface: the entry points, and the meaning and
accepted value of every parameter `defineExtension` and `ompAdapter` take. It is written for a human or
an agent that has to *find* an entry point and then read the source for detail — every symbol below is
cited to its defining file and line, and that source is authoritative for behavior, ordering and errors.

It is not the contract and not an implementation description. The promises and seams live in the
[contract](../.scratch/connect-bot-migration/contract.md); terminology lives in [GLOSSARY.md](../GLOSSARY.md);
the architecture decision is [ADR 0002](adr/0002-semantic-extension-framework.md). Only the first-release
("v1") surface is listed: the unions below are closed, and a kind outside them is not bound.

## Entry points

| Entry point | Source | Role |
| --- | --- | --- |
| `defineExtension(definition)` | [`framework/public.ts`](../framework/public.ts), defined at [`framework/core/definition.ts#L243`](../framework/core/definition.ts#L243) | Declares an extension. Returns its argument typed; nothing is validated or copied here. |
| `ExtensionDefinition` and its member types (`StateDeclaration`, `StatePersistence`, `StateInheritance`, `CommandDeclaration`, `CommandToggleDeclaration`, `CommandDirectedDeclaration`, `ControlKind`, `PromptDeclaration`, `PromptStrategy`, `MarkerDeclaration`, `ExtensionConfigDeclaration`, `ConfigFieldType`) | [`framework/core/definition.ts#L223`](../framework/core/definition.ts#L223) | The definition shape and its configuration types. |
| `ompAdapter(definition, options)` | [`framework/adapters/omp.ts#L845`](../framework/adapters/omp.ts#L845) | Assembles a definition for the `omp` agent runtime; returns an `OmpExtensionFactory`. |
| `OmpAdapterOptions` | [`framework/adapters/omp.ts#L287`](../framework/adapters/omp.ts#L287) | The assembly options (`supportedVersions`, `actions`, `events`, `requiredSemantics`, `configBaseDir`). |
| `BindingResult`, `BindingFailure` | [`framework/core/protocol.ts#L665`](../framework/core/protocol.ts#L665) | What a binding concluded, and why it was refused. |
| `CommandActions`, `DirectedCommandImplementation`, `CommandDelivery`, `DeclaredValueSeam` | [`protocol.ts#L484`](../framework/core/protocol.ts#L484), [`#L447`](../framework/core/protocol.ts#L447), [`#L566`](../framework/core/protocol.ts#L566), [`#L398`](../framework/core/protocol.ts#L398) | The implementations an assembly injects for a definition's directed commands, keyed by command name — each with a `run` member and an optional `unrecognized` member for an argument that parsed to no directive — and the delivery and declared-value seam each one writes through. |
| `RecognizedDirective`, `DirectedDirective` | [`framework/core/protocol.ts#L367`](../framework/core/protocol.ts#L367) | The directive the framework normalizes a directed command's argument into, and the two members it acts on. |
| `OwnerCapabilityHandle` | [`protocol.ts#L432`](../framework/core/protocol.ts#L432) | The owner-scoped capability a handler may retain — the declared-value seam plus the unified feedback channel, bound to the owner its delivery resolved — for the effects it drives after the delivery is over (a heartbeat timer, an outbound flusher). Valid while its owner lives, inert afterwards; carries no `hasUI`. See [Owner-scoped effect capabilities](#owner-scoped-effect-capabilities). |
| `SessionEvent`, `SessionStartReason`, `SessionEndReason` | [`framework/core/protocol.ts#L67`](../framework/core/protocol.ts#L67), [`#L44`](../framework/core/protocol.ts#L44), [`#L54`](../framework/core/protocol.ts#L54) | The session axis of the semantic lifecycle: the symmetric `session_start`/`session_end` pair and the reason vocabulary each member carries. |
| `RoundEvent`, `RoundDelivery` | [`framework/core/protocol.ts#L241`](../framework/core/protocol.ts#L241), [`#L252`](../framework/core/protocol.ts#L252) | The round axis of the semantic lifecycle: the edge-triggered `round_start`/`round_end` pair (no payload) and the facts one edge carries. |
| `SemanticEvent`, `SemanticEventHandlers`, `SemanticEventDeliveryMap` | [`protocol.ts#L282`](../framework/core/protocol.ts#L282), [`#L311`](../framework/core/protocol.ts#L311), [`#L285`](../framework/core/protocol.ts#L285) | Both axes as one subscription surface: the event union, the owner-scoped handler map an assembly injects keyed by event, and the map that keeps each kind paired with the delivery it carries. |
| `SessionEventHandlers`, `SessionEventHandler`, `SessionEventDelivery`, `RoundEventHandlers`, `RoundEventHandler` | [`protocol.ts#L221`](../framework/core/protocol.ts#L221), [`#L210`](../framework/core/protocol.ts#L210), [`#L183`](../framework/core/protocol.ts#L183), [`#L273`](../framework/core/protocol.ts#L273), [`#L264`](../framework/core/protocol.ts#L264) | The per-axis handler aliases, keyed by event, and the delivery each one receives. All are re-exported by [`framework/adapters/omp.ts#L45`](../framework/adapters/omp.ts#L45) so an assembly's subscription needs no core import. |
| Admission types (`RequiredSemantic`, `DeclarableRequiredSemantic`, `FRAMEWORK_REQUIRED_SEMANTICS`, `AdmissionFacts`, `AdmissionOutcome`, `VerifiedEnvironment`) | [`framework/core/admission.ts`](../framework/core/admission.ts) | The version and required-semantics admission facts, the semantics an assembly may declare, and the verdict shape. |
| `ConfigurationViolation` | [`framework/core/violations.ts`](../framework/core/violations.ts) | The report of one broken configuration rule, carried by a `configuration` binding failure: a `ConfigurationViolationKind` and the deterministic `detail`. |
| `ExtensionConfigDeclaration`, `ConfigFieldType`, `BOUND_CONFIG_FIELD_TYPES` | [`framework/core/definition.ts#L211`](../framework/core/definition.ts#L211) | The configuration an extension requires of its own `config.yaml`: the file's path, and the keys the file must carry with the type each must match. See [Extension configuration](#extension-configuration-declaration--file). |
| `readConfig`, `getConfig`, `ConfigSource`, `ConfigReadOptions`, `ConfigReader`, `ConfigParser`, `ConfigLoadError`, `ExtensionConfigError` | [`framework/core/config.ts`](../framework/core/config.ts) | The one reading, parsing and validating implementation, the values shared logic reads, the injectable seam it runs through, and the two error classes that keep a loading-time failure apart from a misuse. See [Extension configuration](#extension-configuration-declaration--file). |
| Adapter-facing delivery types (`OwnerReference`, `NoticeTransport`, `FeedbackLevel`, `FeedbackTransport`, `MarkerTransport`, `StateValues`) | [`framework/core/protocol.ts#L15`](../framework/core/protocol.ts#L15) | The facts and transports an agent-runtime adapter resolves; not authored by an extension. |

A real, minimal consumer is the codebase-tools extension: the shared declaration is
[`extensions/codebase-tools/definition.ts`](../extensions/codebase-tools/definition.ts), its OMP assembly is
[`extensions/codebase-tools/runtimes/omp.ts`](../extensions/codebase-tools/runtimes/omp.ts), and the discovery
entrypoint that re-exports it is [`entrypoints/omp/codebase-tools.ts`](../entrypoints/omp/codebase-tools.ts).

## `defineExtension(definition)`

`definition` is an `ExtensionDefinition` ([`definition.ts#L223`](../framework/core/definition.ts#L223)): plain data,
no builder and no handler. All fields are described below. `state`, `commands`, `prompts`, `marker` and `config`
are optional; `id` and `displayName` are required.

### `id: string`

Stable extension identity. It is also the prefix of every contribution identity: a prompt slot's framework
identity is `${id}:${tag}` ([`definition.ts#L155`](../framework/core/definition.ts#L155)).

### `displayName: string`

Human-readable name used for the extension's label and the text of its notifications (for example the
toggle's enabled/disabled notice).

### `state?: StateDeclaration`

The State the extension declares ([`definition.ts#L48`](../framework/core/definition.ts#L48)). v1 owns exactly one
boolean activation field per extension, and the field name is also the persistence key for its value whenever the
field is persisted. The declared axes are independent: the control kind decides how a command drives the field,
persistence decides whether the value is recorded in the owner's medium and seeded from a branch, and inheritance
decides whether a subagent reads the owner's current value or the field's declared default.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `field?` | `string` | The activation field name. Defaults to `DEFAULT_ACTIVATION_FIELD` = `"enabled"` when `state` is omitted ([`definition.ts#L81`](../framework/core/definition.ts#L81), resolved by `activationField` at [`definition.ts#L248`](../framework/core/definition.ts#L248)). |
| `persistence?` | `"session-entry"` \| `"memory"` | Whether the value is recorded in the owner's persistence medium and seeded from the target branch at a session boundary (`session-entry`, the default, [`definition.ts#L58`](../framework/core/definition.ts#L58)) or kept in memory only (`memory`: never recorded, never seeded; a boundary that replaces the owner drops it to the declared default, while navigation that keeps the owner keeps the value). Resolved by `statePersistence` ([`definition.ts#L253`](../framework/core/definition.ts#L253)). |
| `inheritance?` | `"follow"` \| `"none"` | How a subagent session reads the value: `none` (the default, [`definition.ts#L61`](../framework/core/definition.ts#L61)) reads the field's declared default, `follow` reads the owner's current value live. Resolved by `stateInheritance` ([`definition.ts#L258`](../framework/core/definition.ts#L258)); codebase-tools declares `follow` ([`extensions/codebase-tools/definition.ts`](../extensions/codebase-tools/definition.ts)). |

**Bound set.** `BOUND_STATE_PERSISTENCES = ["session-entry", "memory"]`
([`definition.ts#L70`](../framework/core/definition.ts#L70)) and `BOUND_STATE_INHERITANCES = ["follow", "none"]`
([`definition.ts#L78`](../framework/core/definition.ts#L78)): a value outside them is refused at binding as an
`initialization` failure, never silently read as the default one.

### `commands?: readonly CommandDeclaration[]`

The extension's control commands. `CommandDeclaration` is the closed union of the two bound control kinds
([`definition.ts#L131`](../framework/core/definition.ts#L131)); `ControlKind` is its discriminant
([`definition.ts#L134`](../framework/core/definition.ts#L134)). Both kinds carry the same parameters:

| Parameter | Type | Meaning |
| --- | --- | --- |
| `type` | `"toggle"` \| `"directed"` | The control kind; see the two kinds below. |
| `name` | `string` | Command name, without the leading slash. |
| `state` | `string` | The State field this command drives. |
| `description?` | `string` | Human-readable description, shown wherever the agent runtime lists commands. |

| `type` | Behavior | Source |
| --- | --- | --- |
| `"toggle"` | Alternates the field between its two values on successive executions, and publishes the extension's activation feedback (`<displayName> enabled`/`disabled`) on the delivery's extension feedback channel at `info` severity. | [`definition.ts#L84`](../framework/core/definition.ts#L84) |
| `"directed"` | Names its target value explicitly and repeats its side effect on every execution: the framework never deduplicates, short-circuits or serializes it, so idempotence is the extension's, and the write is its injected implementation's. | [`definition.ts#L113`](../framework/core/definition.ts#L113) |

**Bound set.** `BOUND_CONTROL_KINDS = ["toggle", "directed"]`
([`definition.ts#L145`](../framework/core/definition.ts#L145)); configuration switches, mode selection, mixed
control and command actions are deferred beyond this release. A kind outside the bound set is refused at
binding, not silently dropped. (One extension, one command name, one declared writer per State field — see
`ConfigurationViolation` below.)

**Directed commands pair a declaration with an injected implementation.** The definition names the command
and its field; the implementation is injected by the extension's assembly through `OmpAdapterOptions.actions`
([`omp.ts#L307`](../framework/adapters/omp.ts#L307)). Binding refuses a directed declaration whose
implementation was not injected — an `initialization` failure, with nothing registered — so a command the user
can run always has something to run.

The framework then normalizes the argument into a `DirectedDirective`
([`protocol.ts#L367`](../framework/core/protocol.ts#L367)): `{ kind: "activate" }` for the empty argument,
`{ kind: "deactivate" }` for `off`, and `{ kind: "unrecognized"; argument }` for anything else. A recognized
directive runs `DirectedCommandImplementation.run` with a `CommandDelivery`
([`protocol.ts#L447`](../framework/core/protocol.ts#L447)). An unrecognized argument is not a directive: the
framework records no value and publishes nothing, and hands the text verbatim to the implementation's optional
`unrecognized` member ([`protocol.ts#L474`](../framework/core/protocol.ts#L474)) so the extension that owns the
words can answer a mistyped argument. An implementation that injects no such member leaves the argument inert,
which is what makes the addition compatible with implementations that predate it. A directed command publishes
no framework feedback at all — its operator-facing text belongs to the extension, which publishes it on the
delivery's extension feedback channel at the severity it chooses.

**The implementation owns the write.** The delivery carries the declared-value seam
([`protocol.ts#L398`](../framework/core/protocol.ts#L398)): `read()` observes the value the invocation started
from, and `write(value)` is the only path that records the field — the framework writes nothing before, after
or instead of it, so an action that fails leaves the value alone. Each write is recorded in the owner's
persistence medium best-effort and followed by an update of the framework-owned marker area
([`protocol.ts#L324`](../framework/core/protocol.ts#L324)), which is why a write of `false` removes the
extension's line. The same seam serves every handler delivery, so the write authority has one implementation
whatever the control kind.

**The delivery also carries a capability the handler may retain.** `delivery.capability`
([`protocol.ts#L578`](../framework/core/protocol.ts#L578)) is the same declared-value write and the same
feedback channel this delivery uses, bound to the owner it resolved, so an extension whose effects outlive the
delivery — the heartbeat timer that disarms it, the outbound flusher — keeps that handle in its own owner-keyed
record instead of asking the framework for an owner-resolving write or feedback API. It is valid for the
owner's life and no longer: the boundary that retires the owner's cell revokes it, so a late callback's write is
a no-op that neither recreates State nor republishes the marker area and its feedback is dropped. It carries no
`hasUI`. See [Owner-scoped effect capabilities](#owner-scoped-effect-capabilities).

### `prompts?: readonly PromptDeclaration[]`

The injected-prompt slots ([`definition.ts#L158`](../framework/core/definition.ts#L158)). A slot's framework
identity is `${definition.id}:${tag}`; its visibility, delivery position and retention are framework-owned
and are not parameters.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `tag` | `string` | The slot's identity within the extension; with `id` it forms `${id}:${tag}`. One rule per slot. |
| `strategy` | `PromptStrategy` | When the slot contributes (see below). |
| `content` | `string` | The text the slot contributes. |

`PromptStrategy` ([`definition.ts#L151`](../framework/core/definition.ts#L151)) — both members are bound
(`BOUND_PROMPT_STRATEGIES`, [`definition.ts#L172`](../framework/core/definition.ts#L172)):

| Value | Meaning |
| --- | --- |
| `"first-enabled-run"` | Contributes while the current branch does not yet carry the slot's identity. |
| `"every-enabled-run"` | Contributes on each enabled run. |

### `marker?: MarkerDeclaration`

The extension's status-marker text ([`definition.ts#L175`](../framework/core/definition.ts#L175)). Placement,
ordering and lifecycle are framework-owned; the extension supplies only the text.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `text` | `string` | The marker text rendered in the framework's unified marker area. |

### `config?: ExtensionConfigDeclaration`

The configuration the extension requires of its own file
([`definition.ts#L211`](../framework/core/definition.ts#L211)). Omitted — the case for every extension so far —
means the extension reads no configuration at all and the capability is invisible to it.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `path?` | `string` | The file's path, relative to the **configuration base directory** the assembly supplies (`OmpAdapterOptions.configBaseDir`); the convention `extensions/<definition.id>/config.yaml` when omitted. An absolute path is used as declared, and with no base directory a relative path resolves against the process's working directory. |
| `fields` | `Readonly<Record<string, ConfigFieldType>>` | Every key the file must declare, with the type it must match: `"string"`, `"non-empty-string"`, `"number"` or `"boolean"` (`BOUND_CONFIG_FIELD_TYPES`, [`definition.ts#L190`](../framework/core/definition.ts#L190)). |

The declaration is plain data and stays that way: nothing is read or validated at declaration time, and the file
it names is what `getConfig` hands the extension's shared logic. See
[Extension configuration](#extension-configuration-declaration--file).

## `ompAdapter(definition, options)`

Assembles an `ExtensionDefinition` for the `omp` agent runtime
([`framework/adapters/omp.ts#L845`](../framework/adapters/omp.ts#L845)). It returns an `OmpExtensionFactory`
([`omp.ts#L357`](../framework/adapters/omp.ts#L357)) — `(api) => BindingResult` — which each thin entrypoint
re-exports as its default factory and the loader calls once per binding.

### `definition: ExtensionDefinition`

The same plain definition `defineExtension` returns. The adapter is the point at which declared conflicts
are reported and admission is decided; declaration itself validates nothing
([`definition.ts#L243`](../framework/core/definition.ts#L243)).

### `options: OmpAdapterOptions`

| Parameter | Type | Meaning |
| --- | --- | --- |
| `supportedVersions` | `readonly [string, ...string[]]` | The exact agent-runtime versions this extension is supported on ([`omp.ts#L295`](../framework/adapters/omp.ts#L295)). The non-empty tuple type keeps the declaration from claiming support for nothing. Admission reads this set; see below. |
| `actions?` | `CommandActions` | The assembly's implementations of the definition's directed commands, keyed by command name ([`omp.ts#L307`](../framework/adapters/omp.ts#L307)). Each implementation writes the declared value through the delivery's seam ([`protocol.ts#L398`](../framework/core/protocol.ts#L398)) and publishes its own operator-facing text through the delivery's feedback channel; the framework writes nothing on its behalf. Omitted when the definition declares none; a directed declaration without its implementation is refused at binding. |
| `events?` | `SemanticEventHandlers` | The assembly's handlers for the definition's semantic lifecycle events, keyed by the event each subscribes to ([`omp.ts#L326`](../framework/adapters/omp.ts#L326)): the session axis (`session_start`/`session_end`) and the round axis (`round_start`/`round_end`). This is where shared logic reacts to a boundary; see below. Omitted when the extension observes none. |
| `requiredSemantics?` | `readonly DeclarableRequiredSemantic[]` | The semantics this extension depends on **beyond** the ones every binding already requires ([`omp.ts#L339`](../framework/adapters/omp.ts#L339)): `"session-lifecycle-events"`, `"round-lifecycle-events"`. Declaring one is what turns a runtime that cannot honor it from a gap the extension works around into a `required-semantics` refusal. Omitted when the extension depends on nothing beyond the framework's own requirements — the case for an extension that observes no lifecycle event. See [Admission and required-semantics reporting shape](#admission-and-required-semantics-reporting-shape). |
| `configBaseDir?` | `string` | The directory the definition's relative configuration paths are resolved against, as plain data ([`omp.ts#L353`](../framework/adapters/omp.ts#L353)): the extension repository root, from which the convention `extensions/<definition.id>/config.yaml` is relative. An assembly is the one party that knows it — its own module lives in that repository and the loader discovers the extension by an absolute path while the process runs in an arbitrary project directory — so connect-bot's assembly derives it from `import.meta.url`. Omitted when the definition declares no configuration, and omitted by an assembly that names none: a relative path then resolves against the process's working directory, and an absolute `path` is unaffected either way. See [Extension configuration](#extension-configuration-declaration--file). |

The canonical value in this repository is `{ supportedVersions: ["18.5.0"] }`
([`extensions/codebase-tools/runtimes/omp.ts`](../extensions/codebase-tools/runtimes/omp.ts)).

**The semantic lifecycle subscription pairs a definition with injected handlers.** The framework's session
axis is the symmetric pair `session_start` ([`protocol.ts#L67`](../framework/core/protocol.ts#L67)) and
`session_end`: a start seeds the owner's State from the branch the delivery names, an end retires the owner it
names, and both refresh the framework-owned marker area
([`protocol.ts#L324`](../framework/core/protocol.ts#L324)). A transition that changes which session is current
is an end marked `transferred` naming the owner being left, followed by a start naming the owner being entered;
a navigation that leaves the current owner alone — a tree jump, a same-file resume or reload, an in-place
context reset — is not a transition and produces no event at all.

The run axis is the edge-triggered pair `round_start` and `round_end`
([`protocol.ts#L241`](../framework/core/protocol.ts#L241)), where a `Round` is one period of agent activity
from the agent taking up input to quiescence. Both edges are payload-free by design: how a round ended is a
fact the agent runtimes disagree about, and the agent's *current* state is the idle query below rather than a
field of a past transition. An edge is delivered only when the session really crosses it — a repeated or
nested start inside an open round is not a second `round_start`, a settle that already scheduled its
continuation (an automatic retry, an empty-stop recovery, a compaction or stop-hook turn, a pending
asynchronous wake) or that still has queued messages or a running asynchronous job is not a `round_end`, and a
settle while no round is open closes nothing. Error and abort terminals end the round the same way an ordinary
answer does. The framework applies no behavior of its own to a round: three-value agent state is not framework
State, so a round edge is a subscription and nothing else, and the adapter is what synthesizes it (the `omp`
mapping reads the native run start, the native run end and its continuation flag, and the session's own idle,
pending-message and asynchronous-job facts — see [agent-runtime-support.md](agent-runtime-support.md)).

An assembly subscribes through `options.events`, and the delivery each handler receives
([`protocol.ts#L183`](../framework/core/protocol.ts#L183)) carries the event, the owner scope it concerns, the
faithful `hasUI` fact, the unified extension feedback channel
([`protocol.ts#L111`](../framework/core/protocol.ts#L111)) — the same two seams a command delivery carries, so
one shared gate and one notice path serve both handler kinds and both axes — and the owner-scoped capability a
handler may retain for the effects it drives outside the delivery
([`protocol.ts#L206`](../framework/core/protocol.ts#L206)), because a `session_start` is an arm path like a
command. A round delivery ([`protocol.ts#L252`](../framework/core/protocol.ts#L252)) carries the first three
and the feedback channel, and no capability: a round edge is a subscription, not an arm path, and the framework
has no behavior of its own to apply to it. The framework's
own behavior for a session event always runs first, and a handler that throws is reported on the adapter's
diagnostic channel ([`protocol.ts#L590`](../framework/core/protocol.ts#L590)) without changing what the
framework already did or keeping another subscriber from running. Which native event becomes which semantic
event is the adapter's mapping alone ([`omp.ts#L164`](../framework/adapters/omp.ts#L164)); shared logic names
no native event.

**That subscription is owner-scoped.** A handler is dispatched only for a delivery whose owner is
`{ kind: "owner" }` — the session that is its own owner. A subagent session's boundaries and rounds, and
those of a session whose parent chain leaves the process, resolve to `inherited` or `unresolved`
([`protocol.ts#L31`](../framework/core/protocol.ts#L31)) and reach no handler: those events belong to the owner
that session follows, and the effect body an extension drives from them belongs to the session that armed it,
which is why a subagent can never report or stop the owner's effects. The framework's own behavior is not
gated: it runs for every delivery the adapter resolves and already owns nothing in a session that is not its own
owner (an `inherited` or `unresolved` delivery seeds no cell, retires none and renders no area). The rule is the
framework's, expressed in `dispatchSessionEvent`/`dispatchRoundEvent` and observable at the adapter contract
(`tests/framework/owner-gate.test.ts`); the *resolution* is the adapter's, and on `omp` it reads the session's
agent identity and the runtime's agent registry (see
[agent-runtime-support.md](agent-runtime-support.md#capability-difference-register)).

## Extension configuration (declaration + file)

An extension may declare the configuration it needs from one YAML file in its own source directory — by
convention `extensions/<definition.id>/config.yaml`, overridable through `config.path`. The file the repository
commits *is* the default: no default value and no fallback lives in code, so a file that is missing or illegal
refuses the extension instead of letting it run on a value the framework invented.

**A relative declaration is resolved against a directory the assembly supplies, never against the process.** A
load discovers an extension by an absolute path while the process runs in an arbitrary project directory, so the
convention path — which is relative to the extension repository — cannot be found from the process's own working
directory. The assembly is the one party that knows the repository (its own module lives in it), and connect-bot's
OMP assembly derives the root from `import.meta.url` and passes it as `OmpAdapterOptions.configBaseDir`. An
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

`readConfig(path, options)` ([`framework/core/config.ts#L228`](../framework/core/config.ts#L228)) is the one
reading, parsing and validating implementation, and it is runtime-neutral: the text is read through `node:fs`
and parsed as YAML by the pure-JS `yaml` package, and the reader, the parser and the base directory a relative
path is resolved against are all injectable through `ConfigSource`, so the framework's own suite covers every
failure path without a file. Every file-side failure is a `ConfigLoadError`
whose `detail` is the same deterministic text the binding reports.

**Shared logic reads the validated values, never the file.** `getConfig(definition)`
([`framework/core/config.ts#L299`](../framework/core/config.ts#L299)) returns the values the declaration named —
exactly those keys, in declaration order; a key the declaration does not name is ignored — in whichever session,
command or lifecycle handler the extension runs. It is not a way to read a configuration that is not there: an
extension that declared no configuration, or whose values were never validated in this process, gets an
`ExtensionConfigError` ([`framework/core/config.ts#L96`](../framework/core/config.ts#L96)), which is deliberately
neither a `BindingFailure` nor a `ConfigLoadError`.

The file belongs to the machine: there is no environment or command-line override, and a validated configuration
is read once per extension per process, so a changed value takes effect with the next process rather than with
the next session.

## Binding outcome and failure report

The factory returns a `BindingResult` ([`protocol.ts#L665`](../framework/core/protocol.ts#L665)):

```ts
type BindingResult =
  | { readonly bound: true; readonly definition: ExtensionDefinition }
  | { readonly bound: false; readonly failures: readonly BindingFailure[] };
```

An unbound result carries its `BindingFailure[]`. `BindingFailure`
([`protocol.ts#L635`](../framework/core/protocol.ts#L635)) is a closed union of three kinds:

| `kind` | Payload | Meaning |
| --- | --- | --- |
| `"configuration"` | `violation: ConfigurationViolation` | The definition breaks one of the framework's configuration rules: it declares competing declarations, or its declared configuration — the `config` declaration or the file it names — is illegal. |
| `"initialization"` | `detail: string` | The definition cannot be initialized against this agent runtime: no id or display name, a command declaring a control kind or a State field this version does not bind, a `state` declaration that is not a State object or that names a `persistence`/`inheritance` value outside the bound set, a directed command whose implementation was not injected, or a registration the runtime refused. |
| `"required-semantics"` | `missing: readonly RequiredSemantic[]` | The agent runtime cannot honor a semantic required of this binding: the framework's own, or one the extension's assembly declared through `OmpAdapterOptions.requiredSemantics`. |

`ConfigurationViolation` ([`violations.ts#L24`](../framework/core/violations.ts#L24)) is
`{ kind: ConfigurationViolationKind; detail: string }`, where `ConfigurationViolationKind`
([`violations.ts#L14`](../framework/core/violations.ts#L14)) is
`"duplicate-command"` (two commands share one name), `"duplicate-state-writer"` (two commands declare
themselves writers of one State field), `"duplicate-slot-rule"` (one prompt `tag` carries more than one
rule), or `"config"` (the extension's declared configuration — its declaration or its file — is illegal; the
`detail` distinguishes the failure class, see
[Extension configuration](#extension-configuration-declaration--file)).

`describeBindingFailure(extensionId, failure)` ([`protocol.ts#L670`](../framework/core/protocol.ts#L670)) produces
the deterministic text of one failure, independent of where it is reported.

## Admission and required-semantics reporting shape

Admission is the one pre-registration check that decides whether the observed agent runtime is one the
extension declares support for ([`framework/core/admission.ts`](../framework/core/admission.ts)). Its
fact/verdict shape is:

| Symbol | Source | Shape and meaning |
| --- | --- | --- |
| `RequiredSemantic` | [`admission.ts#L36`](../framework/core/admission.ts#L36) | Closed union of three members: `"history-preservation"` (existing conversation entries and their history-derived request content are preserved; new material is appended), `"session-lifecycle-events"` and `"round-lifecycle-events"` (the two semantic lifecycle axes of this release). |
| `FRAMEWORK_REQUIRED_SEMANTICS` | [`admission.ts#L45`](../framework/core/admission.ts#L45) | The semantics required of every binding whatever its assembly declares: `["history-preservation"]`. Not declarable — `DeclarableRequiredSemantic` excludes it. |
| `DeclarableRequiredSemantic` | [`admission.ts#L54`](../framework/core/admission.ts#L54) | The members an extension's assembly **may** declare it depends on: `Exclude<RequiredSemantic, (typeof FRAMEWORK_REQUIRED_SEMANTICS)[number]>` — today the two lifecycle axes. This is the type of `OmpAdapterOptions.requiredSemantics`. |
| `VerifiedEnvironment` | [`admission.ts#L62`](../framework/core/admission.ts#L62) | `{ platform: string; runtime: string }` (e.g. `win32-x64`, `omp`). Recorded only; not gated. |
| `AdmissionFacts` | [`admission.ts#L70`](../framework/core/admission.ts#L70) | `{ version?: string; missingRequiredSemantics?: readonly RequiredSemantic[]; environment?: VerifiedEnvironment }`. The facts one binding resolved, as the adapter observed them. `missingRequiredSemantics` is a fact about the *runtime*, not a verdict about a binding: which of them refuses *this* binding is admission's rule. |
| `AdmissionOutcome` | [`admission.ts#L86`](../framework/core/admission.ts#L86) | `{ kind: "admitted" }` \| `{ kind: "unlisted-version"; version: string; supportedVersions: readonly string[] }` \| `{ kind: "required-semantics-missing"; missing: readonly RequiredSemantic[] }`. |

Required-semantics reporting is what ticket 10 added to this seam: a missing required semantic is a
`required-semantics-missing` admission outcome, carried as a `BindingFailure` of kind `"required-semantics"`
with the offending `RequiredSemantic[]` — an explicit refusal that binds nothing, never a downgrade. It is
distinct from `"unlisted-version"`, which is not a refusal.

**Which semantics are required is now the union of two things** (`admit`,
[`admission.ts#L110`](../framework/core/admission.ts#L110)). The framework requires history preservation of
every binding, so that one is never optional. On top of it, the extension's assembly may declare the
capability it is built on through `OmpAdapterOptions.requiredSemantics`, which reaches admission as
`BindingAdmission.requiredSemantics`. A runtime that cannot honor a semantic nobody declared is therefore a
fact and nothing more — an extension that observes no lifecycle event keeps binding and running on a runtime
that delivers none — while a declared one refuses that binding, with nothing registered and one
`reportDiagnostic` line naming the extension and the semantic.

**Two kinds of absence, and they are not the same absence.** A `RequiredSemantic` is a capability judged once,
before registration: either the runtime's surface has what the framework's contract rests on, or the binding
is abandoned in full. The facts a *delivery* needs — the session's idle fact behind `canAcceptInput()`
([`protocol.ts#L500`](../framework/core/protocol.ts#L500)), and the pending-message and asynchronous-job facts
behind the quiescence gate ([`protocol.ts#L241`](../framework/core/protocol.ts#L241)) — are per-context facts
that no binding-time judgement can see, so they are reported on the non-model channel when a delivery finds
one missing and no value is fabricated in its place (the round simply stays open; the query answers
`undefined`). Declaring `round-lifecycle-events` is therefore not a second refusal of the quiescence facts:
it asks for the round axis to exist, and what a session reports about itself is answered per delivery either
way. See [agent-runtime-support.md](agent-runtime-support.md#capability-difference-register) for
which runtime reports which of these facts.

| Symbol | Source | Meaning |
| --- | --- | --- |
| `UnlistedVersionAdmission` | [`admission.ts#L92`](../framework/core/admission.ts#L92) | The `unlisted-version` outcome, as the notice behavior consumes it. |
| `AdmissionNotices` | [`admission.ts#L132`](../framework/core/admission.ts#L132) | The once-per-main-session record used to deduplicate admission notices. |
| `describeUnlistedVersion(displayName, outcome)` | [`admission.ts#L150`](../framework/core/admission.ts#L150) | The notice text for an unlisted version. |

## Notices, marker and owner scope (adapter-facing shapes)

These are resolved by an agent-runtime adapter, not authored by an extension, and are cited here so the
option/feedback surface is complete. Both feedback channels travel the session's own UI channel on the `omp`
runtime — the framework's notice as a `warning`, an extension's feedback at the level it chose — and fall back
to one stderr line when the session has no UI ([`omp.ts#L550`](../framework/adapters/omp.ts#L550)).

| Symbol | Source | Shape and meaning |
| --- | --- | --- |
| `OwnerReference` | [`protocol.ts#L31`](../framework/core/protocol.ts#L31) | `{ kind: "owner"; key }` \| `{ kind: "inherited"; key }` \| `{ kind: "unresolved" }` — the owner a framework effect acts on. An `inherited` session owns no cell: it never writes one and reads its owner's value only when the declared field opts in with `follow` (see `state.inheritance`), and neither it nor an `unresolved` session reaches an extension's subscription (see the owner scope above). |
| `NoticeTransport` | [`protocol.ts#L78`](../framework/core/protocol.ts#L78) | `{ warn(message): void }` — the framework's own notice channel (admission and session warnings), outside model context (a UI notification, or a stderr line when the session has no UI). It is **not** extension feedback and is never merged into it. |
| `FeedbackLevel` | [`protocol.ts#L92`](../framework/core/protocol.ts#L92) | `"info"` \| `"error"` — the severity one extension notice carries. `info` reports an effect that happened, `error` one that did not; the level names how serious a notice is, not which channel carries it. |
| `FeedbackTransport` | [`protocol.ts#L111`](../framework/core/protocol.ts#L111) | `{ notify(level, message): void }` — the single runtime-independent channel through which an extension tells the operator about an effect, carried by every handler delivery. Outside model context, never filtered or reordered by the framework: a UI notification at the notice's own severity when the session has a UI, and one stderr line when it does not. |
| `MarkerTransport` | [`protocol.ts#L324`](../framework/core/protocol.ts#L324) | `{ publishMarkers(lines: readonly string[]): void }` — the transport for the unified marker area. |
| `StateValues` | [`protocol.ts#L15`](../framework/core/protocol.ts#L15) | `Readonly<Record<string, boolean>>` — the State values one write path records, by field name. |
| `AgentRuntimePort` | [`protocol.ts#L590`](../framework/core/protocol.ts#L590) | The registration and feedback surface an adapter provides (`setLabel`, `reportDiagnostic`, `onSession`, `onRound`, `onRunInitiation`, `registerCommand`). `onRound` is subscribed only when the assembly injected a round handler: the framework has no behavior of its own to apply to a round. |
| `CanAcceptInput` | [`protocol.ts#L500`](../framework/core/protocol.ts#L500) | `() => boolean \| undefined` — the framework's idle query: `true` when the agent can take input now, `false` when it is working, and `undefined` when the runtime reports no idle fact at all (surfaced, never fabricated). It is a query and not a payload, carried by command invocations so the arm path can read the state it starts from without waiting for any event. |
| `CommandInvocation` | [`protocol.ts#L511`](../framework/core/protocol.ts#L511) | One command invocation's facts: the argument text, the owner, whether the session has a UI (`hasUI`), the idle query (`canAcceptInput`), and the feedback, persistence and marker transports. |
| `CommandDelivery` | [`protocol.ts#L566`](../framework/core/protocol.ts#L566) | The invocation a handler receives: those facts plus the declared-value seam it writes through and the owner-scoped capability it may retain. |
| `SessionDelivery` | [`protocol.ts#L126`](../framework/core/protocol.ts#L126) | The facts one semantic session event carries: the event itself, the owner the event concerns (the session being entered on a start, the one being left on an end), the target branch's persisted payloads, the persistence medium a retained capability records through, the same `hasUI` fact and feedback transport a command delivery carries, the framework's own notice transport, and the transport the boundary's marker-area update is published through. |
| `DeclaredValueSeam` | [`protocol.ts#L398`](../framework/core/protocol.ts#L398) | `{ read(): boolean; write(value: boolean): void }` — the extension's declared value for one owner. A handler owns the write: the framework writes nothing on its behalf, records each write best-effort where the field persists there (a `memory` field is never recorded), and republishes the framework-owned marker area after every write (so `false` clears the extension's line). |

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
| `OwnerCapabilityHandle.state` | [`protocol.ts#L432`](../framework/core/protocol.ts#L432), [`#L398`](../framework/core/protocol.ts#L398) | The owner's declared-value seam: `read()` observes the value the owner's cell holds, `write(value)` is the one write path (`DeclaredValueSeam`) — the new value becomes current, is recorded best-effort in the owner's medium where the field persists there, and the marker area is republished. |
| `OwnerCapabilityHandle.feedback` | [`protocol.ts#L432`](../framework/core/protocol.ts#L432), [`#L111`](../framework/core/protocol.ts#L111) | The owner's unified extension feedback channel (`FeedbackTransport`), so a failure the background effect observes still reaches the operator at the severity the extension chose. |

**The capability is valid for its owner's life and no longer.** The framework's own behavior runs before any
handler sees a session event, so the boundary that ends an owner has already retired that owner's cell by the
time a handler observes it: a capability retained earlier is inert from then on. A write is dropped before it
can record a value, attempt persistence or republish the marker area — a late callback can never recreate the
retired cell — and feedback is dropped before it reaches the operator, so a session that is gone is not spoken
for. A capability retained by a `session_end` delivery is inert from birth, because that owner ended before the
handler ran.

**The `session_end` delivery keeps a feedback channel of its own.** That dispatch's `feedback`
([`protocol.ts#L196`](../framework/core/protocol.ts#L196)) is the one thing that can still speak for the
boundary: a notice published while the handler runs reaches the operator, which is what lets an extension
announce the session switch while it stops its local effects. The channel is the dispatch's own and closes when
the dispatch ends — a timer that kept that channel instead of the capability is heard by nobody — so the two
are not interchangeable: the channel reports this boundary, the capability acts for the owner that retained it.
Both are exercised at the adapter contract in `tests/framework/owner-capability.test.ts`, and the additive
architecture decision is [ADR 0002](adr/0002-semantic-extension-framework.md#owner-scoped-effect-capabilities-additive-connect-bot-migration-decision-07).

## Maintaining this index

When a public symbol gains a parameter, update the cited row here and the source line it points to; the
source stays authoritative, this file stays an index. The framework's public interface is additive-only
([ADR 0002](adr/0002-semantic-extension-framework.md)), so a removal or rename is a new explicit decision,
not an edit to this document alone.
