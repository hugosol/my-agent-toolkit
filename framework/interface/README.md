# Capability interfaces

Session is the first capability encapsulated here. Its interface is the canonical extension-facing
contract, not a re-export of an implementation directory. Start with [Session](session/README.md)
and import its types from `framework/interface/session`; the implementation factory hands the
extension `context.session`. The selected `adapters/<harness>` assembly entry connects the same
shared implementation to pi or oh-my-pi.

The root entry is [`index.ts`](index.ts): it owns `defineExtension` and composes the whole
definition/implementation authoring contract from its public [`details/`](details/) files. It does
not aggregate the capability entries below.

| Reader | Read | Do not reach through |
| --- | --- | --- |
| Extension author consuming Session | [Session contract](session/README.md), its types and the root authoring entry | Observation constructors, source mutation, Local access, internal dispatch |
| Extension author declaring an extension | [Root authoring entry](index.ts) and its [definition](details/definition.ts) / [implementation](details/implementation.ts) details | Internal defaults, bound sets, validation helpers or assembly wiring |
| Extension author declaring commands | [Command contract](command/index.ts) and its [declaration](command/details/definition.ts) / [implementation](command/details/implementation.ts) details | Invocation construction, argument parsing, help tooling, persistence callback or marker transport |
| Extension author declaring subagent needs | [Subagent contract](subagent.ts) | Execution modes, adapter coverage inventories or provider protocols |
| Adapter author supplying facts | The internal [`runtime/port`](../runtime/port.ts) plus canonical interface facts, and the native harness | Extension business logic |
| Framework maintainer | Interface plus internal capability modules and composition | No extension-owned policy belongs in the capability |

Session's type dependencies live beside it: [State](state/index.ts) owns the declared State axes
(`StateDeclaration`, `StatePersistence`, `StateInheritance`), the owner reference and the managed
operations (`DeclaredValueSeam`, `OwnerCapabilityHandle`); [Feedback](feedback/index.ts) owns the
operator notice contract; and [Host facts](host-facts/index.ts) owns provider/catalog facts used by
Turn. The declaration-only capabilities are their own entries: [Prompt](prompt.ts) owns
`PromptDeclaration` and `PromptStrategy`, [Marker](marker.ts) owns `MarkerDeclaration`, and
[Subagent](subagent.ts) owns the initialization integration result and requirement vocabulary. The
selection tools, run facts, contribution result and area transport stay internal. The definition
entry refers to all of these declarations but does not re-publish them: an extension that names one
imports it here. This is not a claim that every capability's authoring and runtime entries have been
migrated.

[Command](command/index.ts) owns the declaration, implementation and delivery groups an extension
writes commands against: its declaration group in `details/definition.ts`, and its implementation,
delivery and directive group in `details/implementation.ts`. The actual delivery the framework
constructs carries only those approved members; the persistence callback, the area transport and the
internal invocation stay out of it. General's three modules are their own direct entries:
[general/http.ts](general/http.ts) publishes `request`, `HttpRequestOptions` and
`HttpConfigurationError`; [general/files.ts](general/files.ts) publishes `updateFile`,
`SafeFileUpdateOptions`, `SafeFileUpdateError` and `SafeFileUpdateFailureKind`; and
[general/config.ts](general/config.ts) publishes `getConfig` and `ExtensionConfigError`. Their
implementations stay in `framework/modules/http.ts`, `framework/modules/files.ts` and
`framework/core/config.ts`; the configuration declaration an extension writes remains owned by
the root authoring contract. There is deliberately no `general/index.ts` aggregator, and the root
authoring entry does not aggregate them. These are exact entries, not permission to import
arbitrary framework internals: no reader, parser, source, `readConfig`, shared-configuration
reader or validation helper is published. Authoring, State, Session, Prompt, Marker, Feedback,
Host facts, Subagent, Command and all three general modules have no compatibility exports
anywhere else; the import check protects those seams. The framework/adapter interaction contract is
one internal port at [`runtime/port.ts`](../runtime/port.ts); it refers to these canonical
declarations and is never imported by an extension. See the
[overall direction](../docs/capability-interface-architecture.md).

A deep module gives leverage through a small interface, while the implementation keeps rule changes
local. Session hides its source, Round/Turn processing and cross-process coordination behind this
seam; its two existing harness adapters supply different native mappings. A capability directory
must not become a shallow forwarding module or a mirror of adapter domain folders.

See [ADR-0002](../../docs/adr/0002-semantic-extension-framework.md#session-capability-interface-cutover-2026-10-19)
for the accepted cutover decision and [the development map](../docs/extension-development-map.md)
for responsibility placement. Encapsulation is enforced by type checking, the runtime objects handed
to consumers, and import checks; it is not a same-process security sandbox.
