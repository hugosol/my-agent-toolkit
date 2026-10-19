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
| Extension author declaring commands | [Command contract](command.ts) | Invocation construction, argument parsing, help tooling or marker transport |
| Extension author declaring subagent needs | [Subagent contract](subagent.ts) | Execution modes, adapter coverage inventories or provider protocols |
| Adapter author supplying facts | Internal `core/protocol` port plus canonical interface facts, and the native harness | Extension business logic |
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

[Command](command.ts) owns the declaration, implementation and delivery groups an extension writes
commands against. Its runtime construction is still being narrowed, so the old mixed entry remains
the path for that part until its batch completes. General's `getConfig`, `request` and `updateFile`
remain at `framework/public`, `core/config`, `modules/http` and `modules/files` as needed. These are
explicit remaining entries, not permission to import arbitrary framework internals. Authoring,
State, Session, Prompt, Marker, Feedback, Host facts, Subagent and Command declarations have no
compatibility exports there; the import check protects those seams. The later runtime-port relocation
in the [overall direction](../docs/capability-interface-architecture.md) is not part of these
cutovers.

A deep module gives leverage through a small interface, while the implementation keeps rule changes
local. Session hides its source, Round/Turn processing and cross-process coordination behind this
seam; its two existing harness adapters supply different native mappings. A capability directory
must not become a shallow forwarding module or a mirror of adapter domain folders.

See [ADR-0002](../../docs/adr/0002-semantic-extension-framework.md#session-capability-interface-cutover-2026-10-19)
for the accepted cutover decision and [the development map](../docs/extension-development-map.md)
for responsibility placement. Encapsulation is enforced by type checking, the runtime objects handed
to consumers, and import checks; it is not a same-process security sandbox.
