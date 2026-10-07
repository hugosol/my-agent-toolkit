# Semantic extension framework — capability and options index

This is the index of the framework's public authoring surface: the entry points, and the meaning and
accepted value of every parameter `defineExtension` and `ompAdapter` take. It is written for a human or
an agent that has to *find* an entry point and then read the source for detail — every symbol below is
cited to its defining file and line, and that source is authoritative for behavior, ordering and errors.

It is not the contract and not an implementation description. The promises and seams live in the
[contract](../.scratch/codebase-tools-omp-v1/contract.md); terminology lives in [GLOSSARY.md](../GLOSSARY.md);
the architecture decision is [ADR 0002](adr/0002-semantic-extension-framework.md). Only the first-release
("v1") surface is listed: the unions below are closed, and a kind outside them is not bound.

## Entry points

| Entry point | Source | Role |
| --- | --- | --- |
| `defineExtension(definition)` | [`framework/public.ts`](../framework/public.ts), defined at [`framework/core/definition.ts#L110`](../framework/core/definition.ts#L110) | Declares an extension. Returns its argument typed; nothing is validated or copied here. |
| `ExtensionDefinition` and its member types (`StateDeclaration`, `CommandDeclaration`, `CommandToggleDeclaration`, `ControlKind`, `PromptDeclaration`, `PromptStrategy`, `MarkerDeclaration`) | [`framework/core/definition.ts#L18`](../framework/core/definition.ts#L18) | The definition shape and its configuration types. |
| `ompAdapter(definition, options)` | [`framework/adapters/omp.ts#L483`](../framework/adapters/omp.ts#L483) | Assembles a definition for the `omp` agent runtime; returns an `OmpExtensionFactory`. |
| `OmpAdapterOptions` | [`framework/adapters/omp.ts#L172`](../framework/adapters/omp.ts#L172) | The assembly options (`supportedVersions`). |
| `BindingResult`, `BindingFailure` | [`framework/core/protocol.ts#L237`](../framework/core/protocol.ts#L237) | What a binding concluded, and why it was refused. |
| Admission types (`RequiredSemantic`, `AdmissionFacts`, `AdmissionOutcome`, `VerifiedEnvironment`) | [`framework/core/admission.ts`](../framework/core/admission.ts) | The version/required-semantics admission facts and verdict shape. |
| `ConfigurationViolation` | [`framework/core/violations.ts`](../framework/core/violations.ts) | The configuration-conflict report carried by a `configuration` binding failure. |
| Adapter-facing delivery types (`OwnerReference`, `NoticeTransport`, `MarkerTransport`, `StateValues`) | [`framework/core/protocol.ts#L15`](../framework/core/protocol.ts#L15) | The facts and transports an agent-runtime adapter resolves; not authored by an extension. |

A real, minimal consumer is the codebase-tools extension: the shared declaration is
[`extensions/codebase-tools/definition.ts`](../extensions/codebase-tools/definition.ts), its OMP assembly is
[`extensions/codebase-tools/runtimes/omp.ts`](../extensions/codebase-tools/runtimes/omp.ts), and the discovery
entrypoint that re-exports it is [`entrypoints/omp/codebase-tools.ts`](../entrypoints/omp/codebase-tools.ts).

## `defineExtension(definition)`

`definition` is an `ExtensionDefinition` ([`definition.ts#L92`](../framework/core/definition.ts#L92)): plain data,
no builder and no handler. All fields are described below. `state`, `commands`, `prompts` and `marker` are
optional; `id` and `displayName` are required.

### `id: string`

Stable extension identity. It is also the prefix of every contribution identity: a prompt slot's framework
identity is `${id}:${tag}` ([`definition.ts#L70`](../framework/core/definition.ts#L70)).

### `displayName: string`

Human-readable name used for the extension's label and the text of its notifications (for example the
toggle's enabled/disabled notice).

### `state?: StateDeclaration`

The State the extension declares ([`definition.ts#L18`](../framework/core/definition.ts#L18)). v1 owns exactly one
boolean activation field per extension, and the field name is also the persistence key for its value.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `field?` | `string` | The activation field name. Defaults to `DEFAULT_ACTIVATION_FIELD` = `"enabled"` when `state` is omitted ([`definition.ts#L24`](../framework/core/definition.ts#L24), resolved by `activationField` at [`definition.ts#L115`](../framework/core/definition.ts#L115)). |

### `commands?: readonly CommandDeclaration[]`

The extension's control commands. `CommandDeclaration` is currently the closed alias of
`CommandToggleDeclaration` ([`definition.ts#L45`](../framework/core/definition.ts#L45)); `ControlKind` is the
discriminant of that union ([`definition.ts#L48`](../framework/core/definition.ts#L48)).

| Parameter | Type | Meaning |
| --- | --- | --- |
| `type` | `"toggle"` | Discriminant of the closed control-kind union. |
| `name` | `string` | Command name, without the leading slash. |
| `state` | `string` | The State field this command transitions. |
| `description?` | `string` | Human-readable description, shown wherever the agent runtime lists commands. |

**v1 boundary (C15): the framework binds only `toggle`.** The bound set is the closed union
`BOUND_CONTROL_KINDS = ["toggle"]` ([`definition.ts#L57`](../framework/core/definition.ts#L57)); configuration
switches, mode selection, mixed control and command actions are deferred beyond the first release. A kind
outside the bound set is refused at binding, not silently dropped. (One extension, one command name, one
declared writer per State field — see `ConfigurationViolation` below.)

### `prompts?: readonly PromptDeclaration[]`

The injected-prompt slots ([`definition.ts#L70`](../framework/core/definition.ts#L70)). A slot's framework
identity is `${definition.id}:${tag}`; its visibility, delivery position and retention are framework-owned
and are not parameters.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `tag` | `string` | The slot's identity within the extension; with `id` it forms `${id}:${tag}`. One rule per slot. |
| `strategy` | `PromptStrategy` | When the slot contributes (see below). |
| `content` | `string` | The text the slot contributes. |

`PromptStrategy` ([`definition.ts#L63`](../framework/core/definition.ts#L63)) — both members are bound
(`BOUND_PROMPT_STRATEGIES`, [`definition.ts#L84`](../framework/core/definition.ts#L84)):

| Value | Meaning |
| --- | --- |
| `"first-enabled-run"` | Contributes while the current branch does not yet carry the slot's identity. |
| `"every-enabled-run"` | Contributes on each enabled run. |

### `marker?: MarkerDeclaration`

The extension's status-marker text ([`definition.ts#L87`](../framework/core/definition.ts#L87)). Placement,
ordering and lifecycle are framework-owned; the extension supplies only the text.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `text` | `string` | The marker text rendered in the framework's unified marker area. |

## `ompAdapter(definition, options)`

Assembles an `ExtensionDefinition` for the `omp` agent runtime
([`framework/adapters/omp.ts#L483`](../framework/adapters/omp.ts#L483)). It returns an `OmpExtensionFactory`
([`omp.ts#L184`](../framework/adapters/omp.ts#L184)) — `(api) => BindingResult` — which each thin entrypoint
re-exports as its default factory and the loader calls once per binding.

### `definition: ExtensionDefinition`

The same plain definition `defineExtension` returns. The adapter is the point at which declared conflicts
are reported and admission is decided; declaration itself validates nothing
([`definition.ts#L110`](../framework/core/definition.ts#L110)).

### `options: OmpAdapterOptions`

| Parameter | Type | Meaning |
| --- | --- | --- |
| `supportedVersions` | `readonly [string, ...string[]]` | The exact agent-runtime versions this extension is supported on ([`omp.ts#L172`](../framework/adapters/omp.ts#L172)). The non-empty tuple type keeps the declaration from claiming support for nothing. Admission reads this set; see below. |

The canonical value in this repository is `{ supportedVersions: ["18.5.0"] }`
([`extensions/codebase-tools/runtimes/omp.ts`](../extensions/codebase-tools/runtimes/omp.ts)).

## Binding outcome and failure report

The factory returns a `BindingResult` ([`protocol.ts#L237`](../framework/core/protocol.ts#L237)):

```ts
type BindingResult =
  | { readonly bound: true; readonly definition: ExtensionDefinition }
  | { readonly bound: false; readonly failures: readonly BindingFailure[] };
```

An unbound result carries its `BindingFailure[]`. `BindingFailure`
([`protocol.ts#L211`](../framework/core/protocol.ts#L211)) is a closed union of three kinds:

| `kind` | Payload | Meaning |
| --- | --- | --- |
| `"configuration"` | `violation: ConfigurationViolation` | The definition declares competing declarations. |
| `"initialization"` | `detail: string` | The definition cannot be initialized against this agent runtime. |
| `"required-semantics"` | `missing: readonly RequiredSemantic[]` | The agent runtime cannot honor a required framework semantic. |

`ConfigurationViolation` ([`violations.ts`](../framework/core/violations.ts)) is
`{ kind: ConfigurationViolationKind; detail: string }`, where `ConfigurationViolationKind` is
`"duplicate-command"` (two commands share one name), `"duplicate-state-writer"` (two commands declare
themselves writers of one State field), or `"duplicate-slot-rule"` (one prompt `tag` carries more than one
rule).

`describeBindingFailure(extensionId, failure)` ([`protocol.ts#L242`](../framework/core/protocol.ts#L242)) produces
the deterministic text of one failure, independent of where it is reported.

## Admission and required-semantics reporting shape

Admission is the one pre-registration check that decides whether the observed agent runtime is one the
extension declares support for ([`framework/core/admission.ts`](../framework/core/admission.ts)). Its
fact/verdict shape is:

| Symbol | Source | Shape and meaning |
| --- | --- | --- |
| `RequiredSemantic` | [`admission.ts#L27`](../framework/core/admission.ts#L27) | Closed union; v1 has exactly one member, `"history-preservation"` — existing conversation entries and their history-derived request content are preserved; new material is appended. |
| `VerifiedEnvironment` | [`admission.ts#L35`](../framework/core/admission.ts#L35) | `{ platform: string; runtime: string }` (e.g. `win32-x64`, `omp`). Recorded only; not gated. |
| `AdmissionFacts` | [`admission.ts#L43`](../framework/core/admission.ts#L43) | `{ version?: string; missingRequiredSemantics?: readonly RequiredSemantic[]; environment?: VerifiedEnvironment }`. The facts one binding resolved, as the adapter observed them. |
| `AdmissionOutcome` | [`admission.ts#L53`](../framework/core/admission.ts#L53) | `{ kind: "admitted" }` \| `{ kind: "unlisted-version"; version: string; supportedVersions: readonly string[] }` \| `{ kind: "required-semantics-missing"; missing: readonly RequiredSemantic[] }`. |

Required-semantics reporting is what ticket 10 added to this seam: a missing required semantic is a
`required-semantics-missing` admission outcome, carried as a `BindingFailure` of kind `"required-semantics"`
with the offending `RequiredSemantic[]` — an explicit refusal that binds nothing, never a downgrade. It is
distinct from `"unlisted-version"`, which is not a refusal.

| Symbol | Source | Meaning |
| --- | --- | --- |
| `UnlistedVersionAdmission` | [`admission.ts#L59`](../framework/core/admission.ts#L59) | The `unlisted-version` outcome, as the notice behavior consumes it. |
| `AdmissionNotices` | [`admission.ts#L87`](../framework/core/admission.ts#L87) | The once-per-main-session record used to deduplicate admission notices. |
| `describeUnlistedVersion(displayName, outcome)` | [`admission.ts#L105`](../framework/core/admission.ts#L105) | The notice text for an unlisted version. |

## Notices, marker and owner scope (adapter-facing shapes)

These are resolved by an agent-runtime adapter, not authored by an extension, and are cited here so the
option/feedback surface is complete.

| Symbol | Source | Shape and meaning |
| --- | --- | --- |
| `OwnerReference` | [`protocol.ts#L31`](../framework/core/protocol.ts#L31) | `{ kind: "owner"; key }` \| `{ kind: "inherited"; key }` \| `{ kind: "unresolved" }` — the owner a framework effect acts on. |
| `NoticeTransport` | [`protocol.ts#L55`](../framework/core/protocol.ts#L55) | `{ warn(message): void }` — the non-model channel for user-visible notices (a UI notification, or a stderr line when the session has no UI). |
| `MarkerTransport` | [`protocol.ts#L95`](../framework/core/protocol.ts#L95) | `{ publishMarkers(lines: readonly string[]): void }` — the transport for the unified marker area. |
| `StateValues` | [`protocol.ts#L15`](../framework/core/protocol.ts#L15) | `Readonly<Record<string, boolean>>` — the State values one write path records, by field name. |
| `AgentRuntimePort` | [`protocol.ts#L176`](../framework/core/protocol.ts#L176) | The registration and feedback surface an adapter provides (`setLabel`, `reportDiagnostic`, `onSession`, `onRunInitiation`, `registerCommand`). |

## Maintaining this index

When a public symbol gains a parameter, update the cited row here and the source line it points to; the
source stays authoritative, this file stays an index. The framework's public interface is additive-only
([ADR 0002](adr/0002-semantic-extension-framework.md)), so a removal or rename is a new explicit decision,
not an edit to this document alone.
