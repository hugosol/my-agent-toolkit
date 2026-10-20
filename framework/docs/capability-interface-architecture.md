# Capability interface architecture

**Status:** Session, State, Prompt/Marker, Feedback, Provider, Subagent, the root authoring contract, Command and General are implemented, including Command's narrowed runtime delivery and General's three direct entries. The single framework/adapter interaction contract is implemented in [`framework/runtime/port.ts`](../runtime/port.ts).
**Scope:** the dependency seam between `framework/`, `adapters/`, and `extensions/`.
**Decision status:** ADR-0002's Session amendment accepts the first complete capability, its Command amendment the next, and the [full-capability cutover amendment](../../docs/adr/0002-semantic-extension-framework.md#full-capability-interface-cutover-2026-10-19) records the completed non-additive switch. The direction below is the implemented one; §9 keeps the decisions that remain open and the candidates that were deliberately not adopted.

## Current capability interface cutover

`framework/interface/session` owns the canonical extension-facing Session facts, event deliveries,
Subscription group, observation reader and confirmed-write contract. The factory supplies
`context.session.observations` and `context.session.recordCommit`; the old top-level
`sessionObservations` / `recordSessionCommit` fields and public concrete class are removed. A reader
is a separate runtime object, and returned readings cannot write into the source. Session consumer
types have no compatibility re-export from any mixed entry or the internal [`runtime/port.ts`](../runtime/port.ts).

State's own capability interface now owns its declarations (`StateDeclaration`, `StatePersistence`,
`StateInheritance`) and managed operations (`OwnerReference`, `DeclaredValueSeam`,
`OwnerCapabilityHandle`); the definition entry refers to them without re-publishing them. The
Prompt and Marker entries own only their declarations (`PromptDeclaration`, `PromptStrategy` and
`MarkerDeclaration`): the run facts, contribution result, selection rules and the unified area's
transport stay internal, and the initialization, directed and action deliveries no longer carry a
marker transport. The Feedback and Provider leaf contracts required by Session also live beside
it. The root authoring entry (`framework/interface/index.ts`) now owns `defineExtension`,
`defineImplementation` and the whole definition/implementation contract in its public `details/` files; `SubagentIntegration`,
`SubagentIntegrationFailure` and `SubagentCapability` live in `framework/interface/subagent.ts`, and
Command's declarations, implementations and deliveries in `framework/interface/command/` (its
`details/definition.ts` and `details/implementation.ts`). The actual command and action deliveries are
explicitly constructed from the approved members: the adapter's persistence callback, the marker-area
transport and the internal invocation are not reachable from an extension. General's HTTP, safe-file
and configuration functions are published by their three direct entries (`general/http.ts`,
`general/files.ts`, `general/config.ts`), with no aggregate `general/index.ts`; the former mixed
`framework/public.ts` entry is removed. The one adapter port now lives in `framework/runtime/port.ts`,
referring to the canonical interface declarations instead of restating them; the former
`core/protocol.ts` no longer exists. The import check requires every extension import under `framework/` to
resolve inside `framework/interface`, with no remaining-entry exemption list. No new disposal
event, second dispatch, runtime registry or second adapter abstraction is introduced. Start at the [Session capability entry](../interface/session/index.ts) before reading its implementation.
The root owns capability, current-observation and subscription entries; `details/` owns public domain
contracts. This is navigation within one interface, not another capability or implementation layer.

The following sections describe the overall target, not a directory-by-directory completion report.

## 1. Purpose

The framework is one shared source tree used across multiple harnesses. The architecture should make three things true at the same time:

- extension developers see one small, capability-oriented interface and do not need to understand framework internals or native harness APIs;
- adapter developers see one framework-defined port and keep native translation code in the adapter tree;
- framework maintainers see the deep modules and the composition between them, without extension business logic leaking into the framework.

This document describes the implemented direction and the rules that keep it true. The sections on
deferred tooling and open decisions mark explicitly what is not implemented.

## 2. Principles

### 2.1 Capability first, not module mirror

The first-class unit is a **capability**: something the framework defines and provides to an extension, or something an extension contributes through a framework-defined surface.

A capability is not a directory mirror of an adapter domain. Adapter domains are navigation groupings over native mappings. A framework capability may receive facts from several adapter domains, and one adapter domain may feed several framework capabilities. The capability list is derived from what an extension consumes, not from the current file layout.

### 2.2 The interface is the extension's whole world

`framework/interface/` is the only extension-facing framework layer. An extension source file reads and imports only that layer, plus the selected adapter assembly entry and its own files.

The interface layer is the canonical source for extension-facing types. It is not a re-export barrel over internal modules. Runtime values are limited to the few capability entry points that must be callable (`defineExtension`, `request`, `updateFile`, `getConfig`) and their error classes; their implementations remain behind the interface.

### 2.3 Complexity sits behind the interface

A capability interface hides a deep implementation. The extension does not need to know which internal modules implement it, how identity is minted, how a reading is deduplicated, how a transport is selected, or how a capability is reconciled at a session boundary.

The internal modules may remain small, separately testable, and independently replaceable. They are implementation details of the capability, not additional extension-facing capabilities.

### 2.4 The adapter already translates; the framework does not abstract the adapter twice

`adapters/<harness>/domain/*` translates native harness facts and effects into framework semantic facts and effects. By the time the framework runtime receives them, they are framework-shaped: `SessionDelivery`, `RoundObservation`, `TurnSignal`, `ProviderAccess`, `CatalogPriceSource`, `ViewedSessionPort`, `SubagentIntegration`, and so on.

`HarnessPort` is the framework-defined port the adapter implements. It is not a second translation layer. A separate `framework/adapter.ts` abstraction would only move types to another path; it would not reduce adapter work, increase extension leverage, or concentrate implementation complexity. It fails the deletion test.

The adapter seam therefore stays small and internal: one port module in the framework runtime, implemented by each adapter, imported only by adapter and framework-runtime code.

### 2.5 Harness semantics flow one way

Harness semantics flow in one direction:

```text
native harness
      │  native API
      ▼
adapters/<harness>/domain/* + internal/port
      │  framework semantic facts and effects
      │  (HarnessPort)
      ▼
framework/runtime + internal deep modules
      │  framework capability interface
      ▼
framework/interface
      │
      ▼
extension
```

No layer reaches back across the flow:

- the framework MUST NOT import extension code;
- the framework MUST NOT name native harness packages;
- an extension MUST NOT import framework runtime or internal modules;
- an adapter MUST NOT import extension business code.

Each layer knows the semantics it receives from the layer above it and offers a smaller interface to the layer below it.

## 3. Roles and reading map

| Role | Needs to read | May import | Deliberately does not read |
| --- | --- | --- | --- |
| Extension developer | `framework/interface/`, the selected adapter assembly entry, the extension's own definition and `shared-logic` | `framework/interface`, `adapters/<harness>` assembly entry, extension-local files | `framework/runtime`, `framework/core`, `framework/behaviors`, `framework/modules`, adapter `domain/` and `internal/` |
| Adapter developer | `framework/runtime/port`, the `framework/interface/` delivery facts, the native harness API | native harness packages, `framework/runtime/port`, `framework/interface` delivery facts | extension business implementations |
| Framework maintainer | `framework/interface`, `framework/runtime`, internal capability modules, adapter contract as a verification input | the whole framework and its tests | extension business logic, except while verifying a consumer |

The goal is that each role can answer "where do I look?" without reconstructing the other two roles' models.

## 4. Extension-facing capability interface

`framework/interface/` is organized by capability, not by the current `core` / `behaviors` / `modules` implementation buckets.

```text
framework/interface/
  index.ts
  details/
    definition.ts
    implementation.ts
  state/
    index.ts
  session/
    index.ts
    observation.ts
    subscriptions.ts
    details/
      facts.ts
      session.ts
      round.ts
      turn.ts
      activity.ts
      context.ts
      input.ts
      commit.ts
      unobserved.ts
  command/
    index.ts
    details/
      definition.ts
      implementation.ts
  subagent.ts
  prompt.ts
  marker.ts
  feedback/
    index.ts
  provider/
    index.ts
  general/
    http.ts
    files.ts
    config.ts
```

General deliberately has no `index.ts`: each general module is a direct entry, and the root
authoring entry does not aggregate them.

The directory names are navigation. The capability boundaries are the important part; a capability can move to another file or directory without changing what the extension knows.

### 4.1 Capability inventory

| Capability | What the extension sees | Hidden implementation | Adapter source |
| --- | --- | --- | --- |
| **State** | State declaration axes, owner reference, declared-value seam, retained capability | store, cells, owner lives, persistence, followed-owner read, access lifetime | session boundaries and subagent relations |
| **Session** | `SessionCapability` with `SessionObservationReader` yielding `SessionObservation`, confirmed-write statements, and the session-scoped event kinds: session, Round, Turn, Activity, Context, Input, Commit, Unobserved; disposal | session identity, Round synthesis, Turn association/dedup, activity derivation, context collection, subscription dispatch, observation source, cross-process access, close-out | Session, Context, Subagent domains |
| **Command** | command declaration, invocation facts, action delivery, directed implementation | toggle/directed/actions routing, State transition, feedback | Control domain |
| **Prompt** | prompt declaration and strategy | run facts, contribution result, contribution selection, branch-progress matching | Prompt domain |
| **Marker** | marker declaration text | marker area transport, process-global area, line order, viewed-session projection, publication triggers | Marker domain |
| **Feedback** | notification level and feedback transport | delivery wiring; no standalone behaviour module | Feedback domain |
| **Provider** | provider access, catalog price, provider HTTP facts | factory hand-over and adapter query mapping; no framework policy | Provider domain |
| **Subagent** | the settled initialization integration result (`subagents` / `none` / `failed`) and the requirement vocabulary | execution modes, adapter coverage inventory, provider protocol and registration | Subagent domains |
| **General modules** (a navigation group, not an adapter-backed capability) | `request`, `updateFile`, `getConfig` and their option/error types | HTTP transport, coordinated file update, configuration document reading | none |

The root `index.ts` and its public `details/` files are the authoring layer. They are not capabilities themselves; they describe how an extension declares a capability and supplies an implementation, and they compose the capability declarations without re-publishing them.

### 4.2 Session is one capability, not one module

Session is a deep capability. The extension sees:

- one read surface for the current observation of an actual session;
- one subscription surface carrying the session-scoped event kinds;
- the existing session-end and Round close-out contracts for the session's own end; adapter disposal facts are not a new extension event.

The facts and deliveries for Round, Turn, Activity, Context, Input, Commit and Unobserved are public
domain contracts under `session/details/`, exported through the Session entry. Their processing,
observation sources, access and close-out coordination are implementation modules behind the
interface. Those internal modules remain separate where their rules, lifetimes and tests differ;
extensions do not import them.

This follows the same shape as State: the extension sees the declared-value seam and retained capability; `StateStore`, owner lives, persistence, followed-owner read, and access are hidden behind it.

### 4.3 What must not appear in `framework/interface`

The following are implementation or adapter-facing types. They MUST NOT be exported from `framework/interface`:

- `HarnessPort`, `RoundObservation`, `TurnSignal`, `TurnSignalFacts`;
- `SessionObservationAccess`, `SessionObservationSink`, `ObservationSource`;
- `BindingResult`, `BindingFailure`, `describeBindingFailure`;
- `StateStore`, the concrete `SessionObservations` class, `SubagentAccess`, `FollowedOwners`;
- `LocalAccess*`, `OwnerAccess*`;
- `ConfigSource`, `ConfigReader`, `readConfig`, `readConfigDocument`;
- internal guards, closed sets, and validation helpers.

Their absence is part of the interface. An extension that needs one of them is either using an internal seam that should be promoted deliberately, or reaching past the capability it actually needs.

## 5. Adapter seam

The framework runtime owns one adapter-facing port module:

```text
framework/runtime/
  port.ts          # HarnessPort and adapter-facing framework facts; the only runtime module
framework/
  core/            # harness-independent contracts and engines
  behaviors/       # binding, assembly, lifecycle, dispatch and capability behaviors
```

The port is one module rather than a runtime directory tree. Composition stays where its real
responsibilities live: `behaviors/binding.ts` connects a definition to the port,
`behaviors/assembly.ts` owns the per-assembly State store and observation source, and
`behaviors/lifecycle.ts` owns one-time initialization and cleanup. Splitting a second
`runtime/binding`, `runtime/assembly` or `runtime/lifecycle` layer was not adopted; it would move
names without changing the adapter seam.

`port.ts` contains framework-shaped facts, not native types:

- `HarnessPort`;
- adapter-to-framework observations such as `RoundObservation` and `TurnSignal`;
- cross-process observation access such as `SessionObservationAccess` and `SessionObservationSink`;
- binding outcome types such as `BindingResult` and `BindingFailure`.

Adapters import:

- `framework/interface/` to construct semantic delivery facts;
- `framework/runtime/port` to implement the port;
- their native harness packages inside the adapter escape hatch.

Extensions do not import `framework/runtime` at all.

### 5.1 Why there is no `framework/adapter.ts`

`adapters/<harness>` is the adapter. It satisfies the `HarnessPort` interface at the adapter seam. `HarnessPort` is the interface, not another adapter.

A separate top-level adapter abstraction would:

- not change the port's width or the adapter's translation work;
- not add a new capability or deepen an existing one;
- create a second adapter-facing path to maintain and document;
- suggest that the framework translates native semantics twice, when the adapter already does that translation.

If the port later proves too wide for a real consumer, the correct move is to split the port by capability at the existing seam, not to add another layer above it. That decision is deliberately open.

### 5.2 Inspectable adapter assembly (2026-10-20)

The single `HarnessPort` remains the seam; [`runtime/adapter-authoring.ts`](../runtime/adapter-authoring.ts) adds an internal construction convention, not a second translation interface. Each adapter's module-level `OMP_PORT` or `PI_PORT` is defined with `defineAdapterPort<Context>`. Its complete mapped key set accounts for every port member. Required members supply factories; optional members supply factories (which may return `undefined` for an assembly-disabled path) or explicitly record `unavailablePortMember(reason)`. The factories are the actual runtime assembly source, exposed as `bindings` and evaluated only by `.create(context)` per native binding. No parallel capability manifest or global registry is introduced.

Native translation and lifecycle ownership stay in the existing domain modules. `defineAdapterDelivery(kind, payload)` marks their final protocol payload construction, including embedded effects and late queries, using canonical existing types without changing payload identity or callback timing. Domain grouping is semantic, not a directory split by event/query/effect interaction mode.

The compiler checks complete assembly keys and contract types. An adapter source-expression gate and full wiring/dependency analyzer are not implemented by this refactor: arbitrary dynamic bodies, assertions and semantic correctness are not proved. The extension-only `check:authoring` gate must not be presented as adapter verification. Explicit absence describes current adapter supply, not proof of native harness unavailability. Runtime loading, optional fallbacks and independent behavior verification are unchanged. Implementation and executed evidence are recorded in [the refactor summary](integration-contract-refactor.md#35-adapter-侧可检查组装后续已完成).

## 6. Capability coverage and evidence

### Inspectable authoring and shared planning (2026-10-20)

The architecture prerequisite is implemented independently of the checker. Assemblies supply
`implementation: defineImplementation({ create, subscriptions, commands, initialize, cleanup, catalog })`
(or a shared helper returning that authored value), not a raw `factory`. Event handlers receive
`(state, delivery)`; lifecycle and command handlers likewise receive the lazily created business
state. The authored value's `.declaration` exposes the same structure used for materialization,
without invoking `create`. There is no parallel requirement list. The private type brand remains
required when an assembly erases the business-state type; the resolved implementation and its
resolver are internal runtime contracts, not root authoring exports.

[`behaviors/integration-plan.ts`](../behaviors/integration-plan.ts) owns the pure selection rules
consumed by runtime binding, including the current Turn/Activity/Context dependency on Round
bookkeeping and initialize-or-cleanup dependency on run initiation. It also exposes port obligations
and reasons. This is the runtime registration plan, not a completed analyzer of all interface reads,
provider access or delivery-level obligations. Native adapter mappings and the single `HarnessPort`
remain unchanged. Creation, reuse, dispatch and disposal retain their existing semantics.

Static source restrictions are now enforced by the separate `check:authoring` linter and included
in the development `typecheck` gate. It resolves canonical authoring symbols and bounded static
composition without executing extension code, reports compact source diagnostics, and exposes a
full maintained rule catalog via `--rules`. Statically resolvable computed keys and spreads are
allowed; dynamic or unresolved integration structure is diagnosed. Business handler bodies remain
outside the expression rules. See [the expression-check guide](static-authoring-check.md) and
[the refactor and deferred dependency-checker plan](../../.scratch/integration-contract-refactor/spec.md).
The existing `check:integrations` still performs only subagent declaration matching; no full
interface-to-adapter dependency analyzer or runtime loading gate is added.

### Agreed dependency-analysis direction (2026-10-20; checker not implemented)

The next diagnostic is intended to cover all framework-mediated extension dependencies, not only the subagent example. It derives the extension's demand and compares it with a target adapter's implemented and wired supply. Direct extension-to-harness integrations, such as native widgets, are outside this inventory. No working reference harness or target discovery entry is a prerequisite: demand can be listed without an adapter, and a target with no implementation has the full required set outstanding.

Analysis starts from extension calls, declarations, subscriptions and reads. It expands framework-owned semantic dependency rules into minimal integration contracts and their `HarnessPort` implementation obligations, then traces the target adapter's implementations and assembly wiring. A direct call graph is insufficient: a read may depend on facts supplied earlier through an observation source, and framework synthesis may require several port operations. Reliably extractable relationships come from code; maintainers explicitly define necessary semantic dependencies that source calls alone cannot express. Conditional paths contribute their possible dependencies rather than depending on a live user configuration.

A minimal integration contract identifies a semantic obligation and its complete interaction protocol, not just a capability group, method signature or generic “event” category. Existing `HarnessPort` remains the common adapter seam; extension consumers continue to use `framework/interface`. A supplied method or generated function body alone does not prove wiring or correct semantics. Report known missing implementations separately from dependencies or wiring the analyzer cannot resolve; unresolved analysis must not silently count as complete.

The agreed first direction is an explicitly invoked offline diagnostic with demand-only and target-comparison output, showing requirement origins, dependency paths and missing implementation locations. This is not a code-generation, editor-plugin, startup-admission or semantic-certification project. Collect all possible dependencies without evaluating runtime configurations or expanding path-sensitive branch combinations. Retain explicit required/optional distinctions: a port member's optional syntax alone does not determine an extension's dependency policy. Report optional absences without failing; missing required integration obligations or unresolved analysis return a nonzero status, with unresolved analysis distinguished from confirmed absence. A successful check requires complete analysis and no required gaps. These are developer diagnostics, not restrictions on extension loading: extension authors decide whether to accept the reported risks. Exact extraction representation and command options still require implementation design. Automatic inventories replace repeated manual calculation where rules suffice; this revisits §6.5's earlier manual-intent-only recommendation without claiming that the existing declarations or checker have already changed. The rest of §6 describes the previous proposal and current declaration-only seed where not superseded here.

Structural completeness remains distinct from semantic correctness. Maintainers define and review semantic promises and accepted native approximations; agent-assisted upgrade review examines whether their assumptions still hold. See [contract-driven agent pre-review](harness-support.md#contract-driven-agent-pre-review). Future semantic evolution and version coexistence are background considerations, not this diagnostic's scope.

### 6.1 Purpose

Coverage checking is a **manual, offline diagnostic**, not a runtime gate. This section records a
proposed tooling direction; it is not implemented and no `check:capabilities` command exists.
An extension developer would be able to run one script against a selected harness and see which
capabilities that harness adapter has not declared or has no structural evidence for.

The current `bun run check:integrations` is the seed of this mechanism. It already compares the extension's declared subagent requirements with the adapter's declared supply, per execution mode, and reports missing capabilities. It does not install a harness, run behavior tests, load an extension implementation, or admit an extension at startup. The next step, if pursued, would add structural evidence to the same diagnostic; the cutover did not add a scanner or diagnostics command.

The purpose is not to build a strict automatic alarm. It is a deliberate developer tool: fast, deterministic, explicit, and separate from runtime behavior.

### 6.2 Three evidence levels

| Evidence level | What it means | Who supplies it | Can it be computed offline? |
| --- | --- | --- | --- |
| **Declared** | The extension states what it needs; the adapter states what it supplies | extension author, adapter author | no; this is intent |
| **Structural** | The source contains code evidence that the capability is used or wired | tooling, from source structure | mostly yes |
| **Verified** | Behavior tests or the harness dock prove the capability works | independent verification | no; behavior cannot be inferred from declarations |

The diagnostic may compare **declared** and **structural** evidence. It MUST NOT present structural evidence as behavior proof. The verified column is separate and may be filled from a verification report, or left `unverified`.

### 6.3 What can be derived structurally

#### Extension side

From the definition:

| Evidence | Capability |
| --- | --- |
| `commands` declared | Command |
| `prompts` declared | Prompt |
| `marker` declared | Marker |
| `state` declared | State |
| `config` declared | Config |
| `state.inheritance === "follow"` | `state-follow` |

From the implementation and shared logic:

| Evidence | Capability |
| --- | --- |
| subscriptions to `turn_start` / `turn_end` | `turn-usage` |
| subscriptions to `session_start` / `session_end` / `round_start` / `round_end` | `session-lifecycle` |
| subscriptions to `session_activity` / `session_context`, or `context.session.observations` use | `session-observations` |
| `context.session.recordCommit` use | `storage-commit` |
| actual session identity, parent, or owner fact use | `session-facts` (partial) |
| session-scoped subscription or a subagent-visible prompt/marker/state-follow need | `extension-loading` (partial) |

Examples from the current extensions:

- `codebase-tools` declares `state.inheritance: "follow"`, so `state-follow` is structurally derivable without a hand-written requirement.
- `model-cost` subscribes to Turn, Round, Session, Activity, and Context events and uses the observation source and commit notice; most of its six requirements have structural evidence.
- `connect-bot` uses an owner-scoped group and declares no subagent requirements; it should derive none.

#### Adapter side

| Evidence | Capability |
| --- | --- |
| `domain/session/turn.ts` / Turn event mapping | `turn-usage` |
| `domain/session/round.ts` / Round event mapping | `session-lifecycle` |
| `domain/session/events.ts` / session facts and owner mapping | `session-facts` |
| `domain/context/*` plus observation access | `session-observations` |
| local access, `sessionObservationAccess`, or the in-process observation path | `storage-commit` |
| local access plus child entry / cross-process wiring | `state-follow` |
| child loading / provider integration path | `extension-loading` |
| `internal/port.ts` hook implementation | the corresponding port capability |
| declared execution modes and runtime wiring | subagent mode coverage |

Examples:

- OMP's `in-process` declaration can be checked against its `domain/session`, `domain/context`, `domain/subagent`, and `internal/port.ts` structure.
- pi's `in-process` and `cross-process` declarations can be checked against its child entry, local access, and `domain/subagent/integration.ts` structure.

#### What cannot be derived precisely

- **Intent.** `extension-loading` and `session-facts` are partly business decisions: needing actual session identity or needing the extension to run inside a subagent is not always visible in syntax.
- **Conditional use.** A capability used behind a runtime condition is structurally present but not necessarily required for every run.
- **Behavior correctness.** Turn usage correctness, storage-commit delivery, and cross-process state follow require behavior verification, not static evidence.

The correct claim is therefore **structural evidence**, not "the capability is correct."

### 6.4 Capability evidence matrix

The diagnostic should print a matrix per actual extension/harness entry. A shape such as:

```bash
bun run check:capabilities --harness omp --extension model-cost
```

```text
omp / model-cost
  turn-usage
    declared:          yes (extension)
    supplied:          yes (adapter declaration)
    structural:        yes (subscription: turn_start, turn_end;
                            adapter: domain/session/turn)
    verified:          unverified

  state-follow
    declared:          no
    supplied:          yes (adapter declaration)
    structural:        no
    verified:          n/a

MISSING: none
WARNINGS:
  - session-facts declared, but no structural evidence found in extension source
```

For a missing adapter capability:

```text
omp / model-cost
  storage-commit
    declared:          yes
    supplied:          no
    structural:        no (no local access / observation access wiring)
    verified:          n/a

MISSING omp / model-cost: storage-commit
```

The script should:

- scan source, import graph, subscription maps, adapter domain modules, and the runtime port implementation;
- not start a harness, load an extension factory, read extension configuration, or run behavior tests;
- default to advisory output, not a startup or CI gate;
- offer `--strict` for a non-zero exit on declared/structural gaps;
- offer `--json` for tooling and review.

### 6.5 Relationship to declarations

The declarations remain the **intent**:

- `ExtensionDefinition.subagentRequirements` states what the extension needs for complete subagent integration;
- `HarnessIntegrationDeclaration` states what the adapter supplies per execution mode.

The diagnostic must not silently generate those declarations from code. It may:

- derive structural evidence and compare it with the declarations;
- report **declared but not structurally evidenced**;
- report **structurally evidenced but not declared**;
- report **declared and supplied but structurally unevidenced**;
- report **verified** only from a separate behavior-verification source.

A mismatch is a review signal, not a runtime verdict. The extension author and adapter author decide whether the declaration or the code is wrong.

### 6.6 Relationship to the capability interface

The capability interface makes structural evidence reliable:

- an extension imports capability-specific paths such as `framework/interface/session`, `framework/interface/command`, and `framework/interface/marker`;
- Session event-kind imports distinguish Turn, Round, Activity, Context, Commit, and Unobserved use;
- the implementation context keeps `context.session` for the capability object and passes the validated `config`, `modelPrices` and `providerAccess` facts under their own names; a capability-grouped `context.provider` or `context.config` was considered and not adopted, because it would break every factory without hiding anything the flat members do not;
- adapter domains and `framework/runtime/port.ts` expose the same capability vocabulary on the supply side.

The evidence model therefore uses the same capability names as the interface inventory. It is a tooling layer over the interface, not a runtime capability registry. It does not introduce runtime negotiation, a startup gate, or a second dispatcher.

### 6.7 Open implementation choices

- Extend `check:integrations` or add a separate `check:capabilities` command.
- Use TypeScript AST/import-graph analysis, an explicit evidence manifest, or a combination.
- Keep the default advisory or make structural mismatches fail by default (`--strict` is the recommended opt-in).
- Decide where the evidence rules live: framework tooling or `scripts/`.
- Decide how the verified column consumes existing verification reports without inventing a new certification process.

## 7. Dependency rules

The following rules are invariants of the target direction. They should be enforced by [`tests/framework/import-boundary.test.ts`](../../tests/framework/import-boundary.test.ts).

| Source | May import | Must not import |
| --- | --- | --- |
| `extensions/**/shared-logic/**`, extension `definition.ts` | `framework/interface`, extension-local files | `framework/runtime`, `framework/core`, `framework/behaviors`, `framework/modules`, adapter internals |
| `extensions/**/harnesses/**` | `framework/interface`, `adapters/<harness>` assembly entry, native escape hatch | other framework internals, extension business from another extension |
| `adapters/**` | native harness packages, `framework/interface` delivery facts, `framework/runtime/port` | extension business code |
| `framework/runtime/**`, `framework/core/**`, `framework/behaviors/**`, `framework/modules/**` | `framework/interface`, `framework/runtime`, internal framework modules | adapters, extension code |
| `framework/interface/**` | interface-local files; a small runtime entry for `request` / `updateFile` / `getConfig` | internal engines, adapter code, extension code |

The `framework/interface` runtime re-export is a deliberate exception: the capability entry point is public, but its implementation stays behind the interface. It should be a thin re-export, not a second implementation.

The boundary test is the upgrade alarm for this architecture. Without it, `framework/interface` is only a convention and extension code will continue to import internal modules.

## 8. Refactor sequence

The cutover was implemented in stages. Each stage left the repository typechecking and its
current tests green.

### Phase 1 - Interface becomes canonical (implemented)

- Extension-facing types moved from `core/definition`, `core/assembly`, `core/protocol`, `core/config`, `modules/http`, and `modules/files` into `framework/interface/`.
- Internal modules import those types from the interface.
- Adapter-facing types moved into `framework/runtime/port.ts`.
- Extension imports migrated to `framework/interface` and adapter assembly entries.
- The import-boundary rules above are enforced.
- `framework/public.ts` is removed as a public path; the root authoring entry and the capability/general entries are the only extension-facing paths. No alias, re-export or forwarding shell remains.
- Verification: typecheck, the import-boundary suite and the framework suite; behavior did not change.

### Phase 2 - Runtime port (implemented)

- [`framework/runtime/port.ts`](../runtime/port.ts) carries the framework-shaped adapter contract:
  `HarnessPort`, the semantic deliveries and observations, the adapter-facing transports, the
  command invocation and the binding outcomes.
- It refers to the canonical declarations in `framework/interface` and restates none of them; the
  former `core/protocol.ts` is removed rather than left as a forwarding entry.
- Adapters import the port from `framework/runtime/port`; extensions never do.
- The port stays one interface. Splitting it by capability is a later decision.

### Phase 3 - Session read surface (implemented; context grouping not adopted)

- The extension-facing Session read surface is read-only; the concrete observation source and its
  mutation methods remain internal. This part was implemented.
- Grouping the whole implementation context by capability (`context.session`, `context.provider`,
  `context.config`) was considered and deliberately not adopted: it would break every extension
  factory for classification only. `context.session` remains the capability object, while the
  validated configuration, model prices and provider access stay under their own names.
- All extension factories and tests were migrated to the approved members.

### Phase 4 - Deep modules behind the interface (implemented)

- State and Session implementations sit behind their interfaces first.
- Round, Turn, Activity, Context, observation, access, and disposal remain internal Session modules.
- Command, Prompt, Marker, Feedback, Provider, and General followed.
- Composition (`assembly`, `binding`, `lifecycle`) connects capabilities and the adapter port; it does not own capability rules.
- Verification: capability contract tests through `framework/interface` and a port double; internal module tests remain for implementation seams.

### Phase 5 - Documentation and decision record (implemented)

- `framework/interface/README.md` carries the capability-to-import map.
- `framework/README.md`, `framework-capabilities.md`, and `extension-development-map.md` follow the implementation.
- The accepted architecture is recorded in ADR-0002 amendments, including the candidates that were not adopted.
- The old public path and the former extension import exceptions are removed.

## 9. Open decisions and candidates not adopted

These are deliberately not settled by this document. The second table records the candidates the
cutover considered and rejected, so they are not read as current policy.

| Decision | Current recommendation | Why it is open |
| --- | --- | --- |
| `HarnessPort` granularity | keep one port for now | splitting by capability is useful only if a real adapter or test double needs a narrower port |
| Internal layout | keep `core` / `behaviors` / `modules` behind `framework/interface`; move to capability directories only when the interface is stable | a large directory move before the interface settles adds churn without changing the extension-facing seam |
| `BindingResult` / `BindingFailure` | stay in `framework/runtime/port.ts` | they are adapter factory results, not extension capability calls |
| Session observation | part of the Session capability, with a read interface distinct from event subscription | the read surface and event surface are different interfaces even though they share Session identity |
| Coverage script shape | extend the existing offline `check:integrations` checker first, if the tooling is pursued; no `check:capabilities` command exists | the current command already owns discovery and declaration comparison |
| Structural evidence extraction | start with import-graph and declaration/event-map scanning, with an explicit evidence table; add TypeScript AST analysis only where the import graph is too coarse | source scanning must stay deterministic and must not execute extension factories or read configuration |
| Coverage default strictness | advisory by default; `--strict` opt-in for a non-zero exit on declared/structural gaps | the check is a developer diagnostic, not a startup or CI gate |
| Verified status source | consume existing verification reports when available; never derive `verified` from structural evidence | behavior correctness is independent verification, not a static claim |
| Declaration generation | keep `subagentRequirements` and `HarnessIntegrationDeclaration` as manual intent; derive and compare structural evidence only | some capabilities express business intent and cannot be inferred reliably from syntax |

Candidates considered and not adopted:

| Candidate | Why it is not current policy |
| --- | --- |
| Separate public `definition/` and `assembly/` directory layers, or a pure classification `extension.ts` entry | The authoring contract is one root entry plus its public `details/` files. The separate layers duplicated the same declarations and added shallow modules without changing extension leverage. |
| A capability-grouped implementation context (`context.provider`, `context.config`) | It would break every extension factory for classification only. The context keeps `session` plus the flat `config`, `modelPrices` and `providerAccess` facts. |
| General as an adapter-backed capability or an aggregate `general/index.ts` entry | General is a navigation group of three independent, harness-independent modules. Each has its own direct entry; there is no registry, adapter or aggregate entry. |
| A public Marker transport on deliveries, or extension-level marker-area operations | The marker area is process-global and framework-owned. Deliveries carry no transport, and an extension declares text and affects display only through managed State. |

## 10. Non-goals

- This is not a mirror of adapter domains in framework directories.
- This is not a second adapter abstraction above `HarnessPort`.
- This is not a move of extension business logic into the framework.
- This is not a change to harness semantics, supported-version policy, or verification scope.
- This is not a code generator, a runtime capability registry, or a general dependency-injection container.
- This is not a promise that every capability becomes a separate directory; a capability may be one file or several modules, depending on its real implementation.

## 11. Relationship to existing decisions

- [ADR-0002](../../docs/adr/0002-semantic-extension-framework.md) establishes the shared framework source, the adapter/native escape hatch, and the capability-domain adapter organization. This direction refines the extension-facing seam and the adapter port placement; it does not change the native boundary or the ownership rule.
- [Framework glossary](../GLOSSARY.md) remains the authority for domain terms such as State, Session observation, Round, Turn, Owner, Local access, and Marker area.
- [Capability layering](./capability-layering.md) records the model-cost business/foundation/presentation direction. That is an extension-side layering; it is not copied into the framework capability interface.
- [Extension development map](./extension-development-map.md) remains the navigation guide; this document adds the missing extension-facing capability seam and the role-based reading map.

## 12. Success criteria

The direction is working when:

- an extension developer can implement a new extension by reading only `framework/interface/` and the selected adapter assembly entry;
- an adapter developer can implement a new harness by reading only `framework/runtime/port`, the interface delivery facts, and the native harness;
- a framework maintainer can change a deep module without changing extension imports;
- the import-boundary test fails on a framework-internal import from extension code, or an extension import from adapter code;
- the same extension definition and shared logic run across both supported harnesses without framework-internal branches;
- harness-specific code remains in `adapters/<harness>` and `extensions/<id>/harnesses`, not in the interface or the deep modules.
