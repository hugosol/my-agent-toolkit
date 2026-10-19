# Session capability

Start at [index.ts](index.ts): it defines the factory's `context.session` and exports the public
contracts in consumption order. The root holds the capability, current-observation and subscription
entries; `details/` holds public domain contracts, not implementation. Import from
`framework/interface/session`; no observation writer, constructor or native harness context is exposed.

Behavior, absence, dispatch and close-out semantics are documented beside their owning declarations,
not repeated here. For a complete consumer, see model-cost's
[shared runtime](../../../extensions/model-cost/shared-logic/runtime.ts) and
[pi assembly](../../../extensions/model-cost/harnesses/pi.ts).

Observation admission and withdrawal, source ordering, identity synthesis, Turn association and dedup,
Round end confirmation, Local access and close-out coordination stay behind this seam. Consumer tests
cross the same interface as extensions; internal tests may drive internal seams. Import checks enforce
engineering encapsulation, not a security sandbox for arbitrary code in the same process.

Other capability authoring contracts have not all moved: the root authoring entry is
`framework/interface` (with `defineExtension` and the definition/implementation contract), while
General's public functions remain at `framework/public`. Neither entry exports Session types.
