# Capability interfaces

Session is the first capability encapsulated here. Its interface is the canonical extension-facing
contract, not a re-export of an implementation directory. Start with [Session](session/README.md)
and import its types from `framework/interface/session`; the implementation factory hands the
extension `context.session`. The selected `adapters/<harness>` assembly entry connects the same
shared implementation to pi or oh-my-pi.

| Reader | Read | Do not reach through |
| --- | --- | --- |
| Extension author consuming Session | [Session contract](session/README.md), its types and the existing authoring entry | Observation constructors, source mutation, Local access, internal dispatch |
| Adapter author supplying facts | Internal `core/protocol` port plus canonical interface facts, and the native harness | Extension business logic |
| Framework maintainer | Interface plus internal capability modules and composition | No extension-owned policy belongs in the capability |

Session's type dependencies live beside it: [State](state/index.ts) owns Owner references and retained
write capabilities, [Feedback](feedback/index.ts) owns the operator notice contract, and
[Host facts](host-facts/index.ts) owns provider/catalog facts used by Turn. Only supporting consumer
contracts have moved for these capabilities; this is not a claim that all their authoring and runtime
entries have been migrated.

Other capability authoring/runtime entries remain at `framework/public`, `core/assembly`,
`core/definition`, `core/config`, `core/integration`, `modules/http` and `modules/files` as needed.
These are explicit remaining entries, not permission to import arbitrary framework internals.
Session types have no compatibility exports there; the import check protects that single seam.
The later runtime-port relocation in the [overall direction](../docs/capability-interface-architecture.md)
is not part of this Session cutover.

A deep module gives leverage through a small interface, while the implementation keeps rule changes
local. Session hides its source, Round/Turn processing and cross-process coordination behind this
seam; its two existing harness adapters supply different native mappings. A capability directory
must not become a shallow forwarding module or a mirror of adapter domain folders.

See [ADR-0002](../../docs/adr/0002-semantic-extension-framework.md#session-capability-interface-cutover-2026-10-19)
for the accepted cutover decision and [the development map](../docs/extension-development-map.md)
for responsibility placement. Encapsulation is enforced by type checking, the runtime objects handed
to consumers, and import checks; it is not a same-process security sandbox.
