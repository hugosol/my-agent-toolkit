---
status: accepted
---

# Agent-runtime-independent semantic framework as shared in-repository source

For the initial, single-maintainer use case, maintain one framework source tree in `my-agent-toolkit/framework/`. Extensions import this source directly rather than consuming a separately published framework package, so framework and extension logic can be edited and debugged together. Each extension retains one shared behavior definition and one shared TypeScript implementation, with thin pi/oh-my-pi entrypoints selecting the respective adapters. An entrypoint copied without the source tree and required dependencies is not a supported standalone artifact. This supersedes the independent runtime-package deployment decision; standalone extension generation also remains deferred. Avoid building a code generator before shared semantic behavior has been exercised on a real agent runtime; the first release exercises the OMP path and does not implement the pi adapter.

Keep the semantic core separate from reusable behaviors, feature templates, and agent-runtime adapters, so common functionality can be configuration-only without moving all feature-specific business logic into the core. Own the event contracts while choosing names close to pi terminology to ease migration. If future distribution requires independent agent-runtime artifacts, bundling or generation can be added later without maintaining duplicate feature logic. That future option is not part of the initial deliverable; arbitrary edits to such artifacts would be independently maintained rather than merged back into framework-managed sources.

This chooses direct source debugging and atomic framework/extension changes in one repository over independent package releases and standalone installability. The tested repository revision and dependency lockfile identify the deployed source combination. An actual installed agent-runtime loader must be exercised with an entrypoint importing extension and framework TypeScript from outside its discovery directory before claiming the organization works; the first release exercises the OMP loader, with the pi loader deferred. Direct source imports do not imply automatic hot reload or working source breakpoints; reload/cache behavior and debugger mapping require their own verification.

## Repository ownership and migration references

The framework's authoritative design and implementation live in my-agent-toolkit. The original independent extensions remain in [my-omp-toolkit](../../../my-omp-toolkit/), which is the source of existing business contracts, proven implementations, and selectable rollback baselines. Replacements are developed here incrementally; this document's source layout describes the target, not a migration already performed.

Maintain one authoritative document for each fact. Framework architecture decisions belong here; terms belong in [GLOSSARY.md](../../GLOSSARY.md); agent-runtime observations and integration evidence belong in [agent-runtime-support.md](../agent-runtime-support.md) and its linked research; unresolved work belongs in the [framework backlog](../semantic-extension-framework-backlog.md). Other documents link to the owner rather than maintaining another policy or schema copy. my-omp-toolkit remains an independent extension repository and does not retain framework documents or migration pointers. References are one-way: my-agent-toolkit may consult my-omp-toolkit, but the original repository does not need to know about this framework.

| Subject | Authoritative source |
| --- | --- |
| Existing extension behavior and business terminology | Original extension documentation, including [codebase-tools](../../../my-omp-toolkit/extensions/codebase-tools/README.md) and its [glossary](../../../my-omp-toolkit/extensions/codebase-tools/GLOSSARY.md), and [model-cost](../../../my-omp-toolkit/extensions/model-cost/README.md) and its [glossary](../../../my-omp-toolkit/extensions/model-cost/GLOSSARY.md) |
| Existing codebase-tools contribution requirements | [Original ADR-0001](../../../my-omp-toolkit/docs/adr/0001-codebase-tools-extension.md); the number refers to that repository, not a missing local ADR |
| Original implementation and concrete persistence contracts | The relevant my-omp-toolkit source and documents at the baseline selected for each migration; do not copy their schemas into framework documentation |
| Refactoring progress and acceptance/rollback evidence | Each replacement's migration work in my-agent-toolkit, referencing its original contract and selected source revision rather than restating the business specification |

Migration is per independent extension. A selected original implementation and its replacement must not both be active. During transition, loading may select old and new implementations for different extensions; for the first release, simultaneous activation of one extension's original and replacement is prevented by load-source mutual exclusion (an explicit-only root during development/acceptance, and removal of the superseded implementation before the permanent cutover), and this migration does not change installed agent-runtime configuration. Persistence and round-trip verification requirements have their single decision record in [Persistence compatibility for reversible extension migration](#persistence-compatibility-for-reversible-extension-migration).

Cross-repository source links assume sibling checkouts named my-agent-toolkit, my-omp-toolkit, pi, and oh-my-pi. Links to local sources identify where to inspect; historical investigation versions remain in the agent-runtime baseline, and future migration acceptance must identify the original source revision actually verified.

## Source organization and agent-runtime discovery

### Target directory layout

```text
my-agent-toolkit/
  framework/                    # One shared framework source tree
    core/
    behaviors/
    adapters/
      pi/
      omp/

  extensions/                   # Independent extension implementations
    codebase-tools/
      definition.ts
      logic.ts
      prompts.ts
      runtimes/
        pi.ts                   # Agent-runtime assembly and agent-runtime-specific implementation
        omp.ts
    model-cost/
      definition.ts
      logic.ts
      runtimes/
        pi.ts
        omp.ts

  entrypoints/                  # Only discoverable extension entrypoints
    pi/
      codebase-tools.ts
      model-cost.ts
    omp/
      codebase-tools.ts
      model-cost.ts

  package.json                  # Shared third-party dependency declarations
```

The named extensions illustrate the layout, not completed migrations or certified agent-runtime support. Split agent-runtime-specific files into subdirectories when their implementation needs it; do not create unused files merely to match the diagram. In the first release only codebase-tools is migrated, only its OMP assembly is implemented, its shared logic lives in the framework core/behaviors rather than a separate extension logic file, and the pi adapter and the model-cost migration are deferred.

### Agent-runtime loading and source dependencies

```text
pi  scans entrypoints/pi/  -> independent pi extension entrypoints
OMP scans entrypoints/omp/ -> independent OMP extension entrypoints
                                      |
                                      v
                         extensions/<extension>/runtimes/<runtime>
                           |                         |
                           v                         v
                  shared extension logic     framework/adapters/<runtime>
                           |                         |
                           +------------+------------+
                                        v
                            shared framework interfaces
                           (semantic core and behaviors)
```

Arrows represent loading/import dependencies, not shared in-memory State or the order of all runtime events. Both agent runtimes use the same framework source tree and shared extension source; only the selected agent-runtime assembly and native integration differ. Actual loader resolution, reload behavior, and debugging remain deployment verification requirements.

Keep framework source in `framework/`, with semantic core, reusable behaviors, and agent-runtime adapters separated internally. Keep each independent extension's shared definition and logic plus its agent-runtime-specific implementations in `extensions/<extension>/`. Provide separate discovery roots `entrypoints/pi/` and `entrypoints/omp/`, each containing one thin entrypoint per supported extension. Configure each agent runtime to scan only its own discovery root, not the shared implementation directories. Entrypoints import or re-export their extension's agent-runtime-specific assembly; they do not copy framework or business code and do not aggregate all extensions into one factory. Do not add a root `index.ts` that changes a discovery root into a single extension.

Extensions cross the framework's small public interfaces even though the code lives in the same repository. The framework must not depend on individual extension implementations, and shared logic must not import native agent-runtime types merely because both are locally available. Agent-runtime-specific code may use native capabilities directly. One source tree does not imply one runtime instance or shared in-memory State between agent-runtime processes. This records the target layout, not a completed migration or a reason to create empty directories before implementation. The framework's small public interfaces are a stable contract surface and evolve additively; a non-additive change requires a new explicit decision in this document.

### Enforcement of the native boundary

The shared/native split above is enforced mechanically by [`tests/framework/import-boundary.test.ts`](../../tests/framework/import-boundary.test.ts). The test scans every `.ts` under `framework/`, `extensions/` and `entrypoints/`; a module is **shared source** unless it lives in `framework/adapters/**` or `extensions/<id>/runtimes/**`; and shared source must neither import an agent-runtime package (`@oh-my-pi/*`, `@earendil-works/*`) nor reach an escape-hatch module by relative import. Each discovery entrypoint is likewise constrained to a single re-export of its extension's runtime assembly.

The native escape hatch is therefore exactly two locations: `framework/adapters/**` and `extensions/<id>/runtimes/**`. The check reads import specifiers lexically rather than through an AST: it is an alarm for the ordinary crossing, and the principle above is what binds — `require(...)`, computed specifiers and aliasing can evade it.

Widening the escape hatch, adding an equivalent bypass, or moving native access outside these two locations is a non-additive architecture change and requires an explicit decision in this document, not an implementation detail. The connect-bot migration fixed the extension-side allow-list ([decision 04](../../.scratch/connect-bot-migration/decision/04-interaction-native-boundary.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/04-interaction-native-boundary.md)) and restated the invariant in these terms ([decision 07](../../.scratch/connect-bot-migration/decision/07-effect-callback-capabilities.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/07-effect-callback-capabilities.md)).

### Responsibility test for agent-runtime differences

Different native implementations do not by themselves justify moving behavior out of the framework. Decide ownership by the semantic contract being upheld, not by whether the code contains agent-runtime-specific calls.

| Responsibility | Implementation location | Example |
| --- | --- | --- |
| Agent-runtime differences required to satisfy a framework-owned contract | Framework agent-runtime adapter, using the shared core where appropriate | Map native lifecycle events to semantic hooks; establish the supported subagent State relationship |
| Extension-specific native presentation or integration not promised by the framework | That extension's agent-runtime-specific implementation | Complex widget layout, native editor interaction, or an agent-runtime-only enhancement |
| Business rules that mean the same thing across supported agent runtimes | That extension's shared logic | Cost calculation, Holiday pricing, and extension-specific archival merge decisions |
| Native capability itself | Agent-runtime-owned implementation, called directly where needed | Native UI operations or subagent execution; do not mirror the entire native interface in the framework |

The framework owns State and other capabilities it defines; it does not automatically own every native operation an extension uses. Conversely, extensions should not each reimplement agent-runtime mapping for a framework contract. An agent-runtime-specific integration remains part of its extension, while a framework agent-runtime adapter is reused by all extensions. This placement rule does not exempt native calls from applicable history-preservation constraints.

## Scope map

The discussion covers nine areas: (1) extension definition/configuration and shared TypeScript logic; (2) control patterns, commands, and subfeatures; (3) semantic hooks and State orchestration; (4) State ownership, storage, restoration, archives, and shared-file concurrency; (5) ongoing work and lifecycle effects; (6) instruction contribution and mandatory history preservation; (7) basic status feedback driven by State; (8) agent-runtime adapters and declared version/capability support; and (9) framework verification as upgrade regression detection. This map records responsibilities and exclusions, not a claim that these modules or all five migrations have been implemented.

## Initial control scope

The control vocabulary covers configuration switches applied after restart, idempotent selection of a named mode, and command toggles alternating between two modes, but the first release implements only **command toggle**. Configuration switches, mode selection, mixed control such as the current Build/Explore/Debug interaction, and the remaining control kinds are explicitly deferred rather than implicitly implemented through the initial pattern.

### Extension configuration (additive; connect-bot migration, decision 05)

The connect-bot migration adds an additive capability for an extension's own configuration **values**, distinct from the deferred configuration-switch control kind: the framework reads a fixed `config.yaml` from the extension's source directory (`extensions/<definition.id>/config.yaml`, overridable by a declared `path`), parses it with the pure-JS `yaml` package (zero external dependencies, ISC) in the framework's runtime-independent config module behind an injectable seam, and validates the required keys and primitive types the extension declares as plain data in its definition (`config.fields`). Missing, unreadable, malformed, non-object, missing-required, or wrong-type content refuses the binding — the extension is not loaded and a `config` binding failure is reported on the non-model diagnostic channel; there is no code-level default fallback, the shipped file is the default. Values reach the extension's shared logic through a runtime-independent `getConfig(definition)` read, so no agent-runtime assembly handles configuration; `readConfig(path)` and `ExtensionConfigError` are the config module's single read/parse/validate/throw surface. This is additive: configuration switches, mode selection, mixed control and the remaining control kinds stay deferred, and the same file is their intended future carrier.

### Directed control and per-field State lifecycle (additive; connect-bot migration, decision 02)

The connect-bot migration adds a second bound control kind, **directed** ([decision 02](../../.scratch/connect-bot-migration/decision/02-command-state-ownership.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/02-command-state-ownership.md)): a command that names its target state explicitly (`/connect-bot` = on, `/connect-bot off` = off), repeats its side effect on every invocation, and is never deduplicated or short-circuited by the framework — idempotence is the extension's responsibility. It is distinct from the deferred mode-selection, mixed-control and command-action kinds.

It also makes the State lifecycle **per field**, on three orthogonal axes:

- **Control kind** — `toggle` (existing) or `directed` (new).
- **Persistence** — `session-entry` (default: written to the owner's persistence medium, seeded from the target branch at session boundaries) or `memory` (never written and never seeded; an owner-identity change drops the value to the declared default, while navigation that keeps the identity preserves it).
- **Inheritance** — `follow` or `none` (default `none`: a subagent reads the declared default unless the field declares `follow`).

The framework's write authority is unchanged: the extension's handler runs before the framework records the value and owns the write, so a command can read the pre-invocation value. `memory` is the choice for a value that declares a live external effect, because a restored value does not prove the effect is running (see [State and recovery seam](#state-and-recovery-seam)).

## Shared behavior scope

Include activation and mode controls, state storage (in-memory values, agent-runtime-owned session entries, and extension-owned files), session state and restoration, and basic status feedback; the first release implements only the subset codebase-tools requires (activation toggle, owner-session-entry persistence, session restoration, and basic status feedback), leaving business archival, extension-owned files, and shared-file coordination to later releases. Storage is not limited to framework-declared switches and parameters: business history and archival are explicitly in scope, motivated by existing model-cost requirements; shared-file concurrency safety is also an explicit framework capability, while its precise interface and failure contract remain to be designed beyond the first release. Command actions and parameter settings are also suitable reusable subfeatures, distinct from mode transitions; their exact contracts remain to be defined beyond the first release. A command subfeature and its State/storage are orthogonal: `/budget holiday` is an idempotent command subfeature activating the persisted Holiday pricing flag, not a mutually exclusive submode, while quota-ratio data may be stored without becoming a command or mode. Storage choice does not by itself define state ownership or restoration semantics. The replacement persists its single activation value as `{enabled}` in an agent-runtime-owned non-LLM session entry via `appendEntry` (the original `{on, initInjected}` contract is not preserved), and derives injection progress from the active branch rather than a stored flag; it does not store that state in a separate extension JSON file. These state entries are distinct from LLM conversation messages, so the history-preservation guarantee must not accidentally prohibit them.

Include configurable instruction contribution, using readonly-mode's injection slots and mode-dependent rules as a starting point. The goal is to configure content and contribution rules instead of editing agent-runtime-specific hook code. For the first release, timing (one agent-run initiation per user turn), tail placement, persisted retention, and role handling (agent-runtime-qualified and recorded per provider path, not a developer-authority promise) are decided; the broader framework may generalize them later. Including instruction contribution does not automatically authorize arbitrary history rewrites or promise identical provider wire roles. See [prompt-injection research](../research/prompt-injection-research.md) for the verified current behavior.

Do not include operation guards in the initial common behavior library: the current evidence is specific to `readonly-mode`, rather than a demonstrated shared behavior across the extensions. This does not remove its existing protection requirements or settle how it will migrate.

## Persistence compatibility for reversible extension migration

Framework-based replacements must strictly preserve each original extension's persistence contract so users can switch between the selected original my-omp-toolkit baseline and its replacement without data conversion, schema-version upgrades, backup restoration, or loss of intervening business data. Compatibility is bidirectional: the replacement reads original data, and the original implementation reads and continues updating data written by the replacement. The codebase-tools migration is an explicit, recorded exception (updated 2026-10-07): it preserves neither direction. The replacement uses a new `{enabled}` state key, does not read the original `{on}` field, and resumes pre-migration sessions as off (users re-toggle); no data conversion or import is provided. This persistence break is itself the explicit new decision the compatibility rule requires. Other migrations keep the bidirectional default. Preserve storage locations, record identifiers, field structure and meaning, units, and session/branch restoration semantics required by the original implementation; preserving only the JSON shape is insufficient.

Existing extension documents and the selected original source revision remain the authority for the concrete persistence format. Do not duplicate those schemas in framework documentation. Framework State may have a different in-memory representation, but its storage mapping must retain the original contract rather than serialize framework internals or introduce a generic replacement format. Do not automatically add schema-version envelopes or migrations. A change that would break this compatibility is outside the accepted refactoring scope and requires a new explicit decision.

Each extension's migration verification must exercise an original-write → replacement-read/update → original-read/update → replacement-read cycle on the same stored data, checking consumer-visible values and continuation behavior. The recorded codebase-tools exception verifies neither half (this migration preserves no persistence data); it is an explicit scope decision, not a general relaxation. Include the storage media that extension actually uses (files, archives, and agent-runtime-owned non-LLM session entries as applicable); do not treat backups or a one-way import as rollback proof. This is an acceptance requirement, not a claim that any replacement has passed it. Switching implementations must avoid simultaneous activation; data compatibility alone does not stop duplicate hooks or ongoing work.

This decision removes persistence conversion as a required switching step, not the need to select a compatible agent runtime/source baseline or verify rollback. It does not claim that pi and OMP can read each other's native session formats; cross-agent-runtime session portability is a separate, unestablished capability.

## Shared-file concurrency scope

When multiple sessions or agent processes update one extension-owned document, the framework should provide a coordinated read-modify-publish operation and reader-safe atomic publication so one writer cannot silently replace another writer's completed update or expose a partially written document. The fresh on-disk value must be considered within the coordination scope; locking only the final write is insufficient. Feature-specific merge decisions (such as choosing the newer model-cost measurement baseline while retaining a known ratio) remain feature logic, not a universal last-writer-wins policy. After a peer's publication, State may need reconciliation before it is used as the current value. The first implementation must not rely on an OMP-only runtime module for a shared pi/OMP capability.

Existing model-cost tests exercise multiple tracker instances sharing a file but substitute an in-process serialization lock ([original test lock](../../../my-omp-toolkit/tests/model-cost/test-lock.ts)); they do not independently verify a real inter-process lock. A framework-owned implementation therefore needs its own actual cross-process and crash/atomic-read contract tests. Lock portability, timeout/failure behavior, and State freshness are detailed-design decisions, not guarantees inferred from the present tests.

## Semantic hooks at the scope level

The framework should offer extension-owned code injection at meaningful agent lifecycle points as well as declarative behaviors. Examples such as agent start and message completion are candidate concepts, not yet a published event inventory or a claim of equivalent timing across pi and OMP. The first release fixes one semantic hook mapping (agent-run initiation, at most once per user turn); the broader hook set, its payloads and ordering still belong to detailed design against existing extensions and both agent runtimes. An extension supplies one shared TypeScript implementation for each chosen semantic hook; agent-runtime adapters bind that same implementation at the corresponding agent runtime lifecycle point and expose agent-runtime-independent inputs and framework capabilities. Thin pi/OMP entrypoints must not require maintaining two copies of the feature logic. Treat source-code text splicing into agent-runtime-specific templates as a different, fragile approach, not the intended meaning of "injection." Do not confuse message completion with an entire agent run settling.

## Semantic lifecycle model

The framework owns one runtime-independent lifecycle vocabulary for extensions; each agent-runtime adapter synthesizes it from that runtime's native events. The connect-bot migration fixed the first model ([decision](../../.scratch/connect-bot-migration/decision/03-lifecycle-effects.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/03-lifecycle-effects.md)):

- **Session axis.** `session_start` (a session became the current owner; reason `initial`, `new`, `resume` or `fork`) and `session_end` (the current owner ceased; reason `transferred` or `disposed`) form a symmetric pair. A switch, branch or fork is `session_end(transferred)` followed by `session_start`; navigation that keeps the same owner emits neither. The framework seeds and retires State and refreshes the marker area on these boundaries; an extension may subscribe, and the migrating extension uses `session_end` to stop its own effect.
- **Round axis.** A **Round** is one period of agent activity, from starting work to quiescence — no automatic work remains and it is waiting for the user. A round may contain several model-response turns and several low-level agent runs. `round_start` and `round_end` are edge-triggered transitions; `round_end` has no payload and fires only at quiescence (automatic continuations stay inside the round, while error and abort still reach it).
- **Idle is a query, not an event.** `canAcceptInput()` exposes the runtime's idle fact independently of the events and supplies the initial value at activation.
- **Ownership and dispatch.** The framework owns the event semantics and owner scope; adapters own the native mapping, and a missing required semantic is refused fail-soft rather than silently weakened. An owner-facing subscription receives only its owner session's events — a subagent's events never reach it. Framework behaviors run before extension handlers.
- **Effects stay with the extension.** Ongoing work such as timers, outbound queues, retry/failure budgets and network protocol remains the extension's business; the framework emits semantic events and does not add a continuous-task contract.

This fixes the first-release lifecycle vocabulary and refines the "Semantic hooks at the scope level" note above; the remaining hook inventory (for example model-response turns, provider and tool events) stays deferred until a concrete extension needs it.

## Owner-scoped effect capabilities (additive; connect-bot migration, decision 07)

An extension-owned background effect (for example a heartbeat timer or an outbound flusher) runs outside any handler delivery, so it cannot rely on delivery-scoped seams alone ([decision 07](../../.scratch/connect-bot-migration/decision/07-effect-callback-capabilities.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/07-effect-callback-capabilities.md)):

- A handler delivery exposes an **owner-scoped capability** (declared-value write plus the feedback channel) that the extension may retain in its own owner-keyed effect record and reuse from that background callback.
- The capability is valid only while its owner is live. On `session_end` the framework retires the owner before the extension handler runs, so a retained capability becomes inert: writes are no-ops that neither recreate State nor republish a marker, and feedback is dropped. The `session_end` delivery itself carries a fresh, dispatch-scoped feedback channel, so the extension can still emit its session-switched notice while stopping local effects.
- `session_end` names the **ending** owner in its `owner` field; the earlier `previousOwnerKey` is redundant once a switch is expressed as `session_end` + `session_start`, and is removed from the semantic delivery. No `hasUI` is carried on the retained capability.
- The extension stops its local resources synchronously before any await; the framework does not wait for the extension's best-effort remote unregister.

## State and recovery seam

Treat state value, ownership, storage medium, restore policy, and lifecycle effects as related but distinct aspects of a behavior definition. A resumed session can restore state without replaying an earlier command or assuming its external effects are still active; reacquiring timers or remote registrations needs an explicit reconciliation policy. Persisted business values such as model-cost's holiday flag and quota estimate/baseline are not automatically modes or state-machine states. For the first release, reconciliation semantics are decided (seed from the target branch at session boundaries, in-session current value authoritative, and navigation that does not change session identity does not refresh activation) and the initial declarative state model is the single boolean activation value used by codebase-tools; broader values and reconciliation remain open.

## Framework-owned capabilities and initial subagent inheritance

Expose small interfaces for framework-defined capabilities such as State; do not duplicate the agent runtime's native extension interface. Extensions may call native capabilities directly. Agent-runtime adapters own the differences needed to uphold framework contracts, including State relationships across supported subagent execution paths; this does not require the framework to introduce a subagent scheduler or an MCP implementation. Native calls that affect conversation history remain subject to the history-preservation discussion; access to native interfaces is not a sandbox guarantee.

Initially implement only the inheritance behavior demonstrated by codebase-tools: subagents follow the owning main session's current activation value, while each session keeps its own init-injection progress. This is live following, not a one-time copy at child creation or wholesale inheritance of extension State. Do not introduce a menu of snapshot, shared-write, or other inheritance strategies before concrete extensions need them. The connect-bot migration made this per-field and default-off, with codebase-tools explicitly opting in; see the directed-control and per-field State lifecycle note under Initial control scope. The existing module-level `globalOn` is evidence of the desired behavior, not a framework ownership mechanism: the framework must associate values with the correct owning session rather than assume every binding in a process belongs to one owner.

Bind inheritance support to an explicitly integrated subagent execution path. The first-release implementation target is OMP's built-in path; the first release ships no pi adapter, so pi subagent State inheritance is not merely unsupported but unimplemented. Do not choose or implement a pi subagent runner merely to claim parity. This is a planned agent-runtime-qualified framework capability, not an implemented or runtime-certified feature. Extension loading, State inheritance, and MCP availability are separate conditions; inheritance does not imply that a child loads an extension or gains access to MCP.

A future pi adapter may explicitly permit codebase-tools to operate in a pi session without subagent State inheritance, provided its other required contracts are satisfied; the first release ships no pi adapter, so this is recorded as a deferred agent-runtime-qualified path rather than first-release behavior. When such a path is implemented, notify the user once at the extension's first activation in that session that activation is not propagated to subagents by the framework. This is an accepted extension-specific policy, not permission to continue every extension when a required capability is absent. The first release decides the notification transport (extension UI notification, with a stderr line when no UI is available), deduplication (once per main session), and declaration syntax (the declarative extension definition); the notice is not implemented as a model instruction or conversation contribution. Owner disappearance and child restoration without their owner resolve to off, and child-side writes are not permitted; no further fallback semantics are introduced.

## State as the current-value source

Call the unified per-extension current-value source **State**, borrowing React's vocabulary without adopting its component or hook model. Framework-managed behaviors read declared values from State, including extension-defined values; UI, command feedback, and instruction conditions do not each maintain a separate current-value copy. Framework-provided and extension-defined State variables may drive basic notifications and persistent status indicators; complex widget layout remains feature-specific rather than a universal UI language. State's read surface is not its mutation surface: control transitions, declared actions, agent-runtime-event projections, and restore/persistence reconciliation are candidate update sources, while renderer code should not bypass them. Persistence media and remote providers remain external inputs; their observations must be reconciled into State before framework consumers read a current value. For the first release the write path is decided (single writer, transition → persistence → feedback, with the in-session current value authoritative); cross-process freshness remains open rather than implied by the phrase "single source of truth."

## Behavior orchestration around State

Treat State as the shared current-value source connecting control, commands, agent-runtime events, persistence, instruction contribution, feedback, and ongoing lifecycle effects. Ongoing effects depend on both State and their owning scope: entering an active condition may start work, leaving it or losing the scope must stop work, and restoring State alone does not prove earlier effects are still active. One-shot command actions remain distinct from ongoing effects; neither every State update nor every restore automatically replays side effects. Framework-managed model-context behavior observes the same State but is additionally bound by the mandatory history-preservation contract.

## Extension feedback, marker, and declared-value writes (additive; connect-bot migration, decision 04)

The connect-bot migration fixes the user-visible feedback and status surface ([decision 04](../../.scratch/connect-bot-migration/decision/04-interaction-native-boundary.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/04-interaction-native-boundary.md)):

- **One feedback channel.** Extensions publish operator-facing notices through a single runtime-independent channel with an `info | error` severity, available on command and semantic-event handlers; the adapter maps it to a UI notification, or to a stderr line when the session has no UI. It is never model-visible — not an injected prompt, a conversation entry, or tool output — and the framework's internal admission/session warnings are not merged into it.
- **`hasUI` on deliveries.** A delivery states whether the session has a UI, so the extension's shared logic enforces its own main-session + UI gate rather than the framework silently refusing on its behalf. Subagent refusals remain the framework's owner-scope concern.
- **Marker ownership.** The unified marker area stays framework-owned (placement, line order, publication, clearing); an extension contributes only its text. The first migrated marker is `◈ connectBot`, published only while its activation value is true.
- **Declared-value write seam.** Every injected handler delivery carries a write seam limited to the extension's declared fields, and the framework publishes the marker after each write. Auto-disarm uses it to write its activation field `false`.
- **Native allow-list.** The extension's direct native use is limited to its `runtimes/omp.ts` assembly (managed timer, real session id/cwd/model as plain data); shared logic imports no native types and registers no native hooks.

## History preservation and execution frequency

Defer request-context filtering, including filtering this extension's own earlier contributions, to a later, more flexible policy. Arbitrary edits to other participants' messages or deletion of persisted conversations are not part of the initial common behavior. In the first release, strict history preservation is mandatory: the framework preserves existing agent-runtime-owned conversation entries and the history-derived portion of each request without filtering, substitution, or reordering. New extension messages may be appended through the agent runtime's normal conversation-recording path; those entries then belong to the history that subsequent requests preserve. Request-only contributions do not themselves mutate stored history; the first release does not support them, and any future placement must not silently violate the history-derived prefix contract. This supersedes the earlier blanket prohibition of persisted extension-added messages: preserving existing history does not prohibit appending new recorded messages. Persistence alone is not sufficient; insertion into the middle of existing history, later removal, or rewriting the recorded contribution remains prohibited.

Appending new contributed material after the history-derived content is the first-release placement: it preserves that historical prefix, whereas insertion before or among existing history can change the reusable prefix despite leaving disk untouched. Exact allowed insertion positions for future request-only material remain to be confirmed. Temporary contributions are not automatically retained in subsequent requests, and their disappearance or change can limit reuse beyond the stable history prefix.

The guarantee concerns framework-managed behavior, not the agent runtime's normal message recording, compaction, other extensions, or a future independently modified generated artifact. Keeping chat history intact does not by itself guarantee cache hits: system instructions, tool declarations, and provider behavior are separate concerns. Whether system-prompt changes receive a separate stability policy remains open.

Distinguish agent-run initiation from individual model requests for all context-processing behaviors, not only prompt insertion. There is no established requirement yet for a public per-model-request insertion option. Filtering is excluded from the first release; if later enabled, it must apply consistently across the requests it governs, including tool continuations.

## Business logic versus model-context behavior

Keep the contracts for ordinary extension actions separate from instruction contribution and request-context processing. They may share configuration, state, and lifecycle infrastructure, but history-preservation constraints do not prohibit unrelated business computation, extension-owned archives, or status feedback. Apply the constraint according to effects: custom TS that changes agent-runtime conversation data or outgoing chat history is context-affecting behavior, not exempt merely because it is custom code. For the first release, custom code that changes conversation data or outgoing history may write only through the framework's contribution interface (append-only and history-preserving), and arbitrary in-process TS is not implicitly sandboxed; a constrained custom-logic entry point remains deferred.

## Supported-agent-runtime compatibility

Only advertise a behavior as common when its semantic contract can be satisfied across all declared supported agent-runtime targets; identical native API names are not required. The framework may additionally own explicitly agent-runtime-qualified capabilities, initially subagent State inheritance on the integrated OMP path but not on pi, and the delivered authority of persisted instruction contributions, whose OMP mapping is recorded from provider serialization while other agent runtimes remain undecided. Their support conditions and absence must be visible rather than represented as cross-agent-runtime parity. This qualifies the earlier common-behavior-only scope; it does not permit silently weakening required semantics. Reject a behavior whose required role or insertion semantics cannot be met rather than silently substituting a weaker behavior. An extension may instead record an explicit, agent-runtime-scoped acceptance of a documented absence, as codebase-tools does on OMP for delivered contribution authority; that record is per agent runtime and is not a cross-agent-runtime permission. Rejection is **fail-soft**: the unmet requirement is reported on a non-model channel (never in model instructions or conversation history), the affected capability or extension is not bound, no partial registration is left behind, and the agent runtime continues. The same fail-soft rule covers invalid extension definitions, configuration conflicts (duplicate command names, competing State writers, multiple rules for one contribution slot), and initialization failures. Anchor the agent-runtime targets and evidence in a [version baseline file](../agent-runtime-support.md), separating source inspection from runtime validation; a version number alone does not establish compatibility across provider protocols or operating modes. Run shared semantic contract scenarios against agent runtime upgrades to detect regressions quickly: failure is an investigation signal, while success does not automatically approve support. A framework maintainer explicitly assesses source changes and/or additional evidence before declaring a new agent-runtime version supported.

## Framework verification as a separate concern

Treat framework verification as a ninth scope area alongside definition/configuration, control/commands, semantic events and State orchestration, storage/recovery, ongoing lifecycle work, instruction contribution, status feedback, and agent-runtime adaptation. Shared semantic contract scenarios serve as upgrade regression alarms; the maintainer, not a green test run, decides when an agent-runtime version is supported. The first release fixes the scenarios and harness as two separated suites (extension acceptance and framework capability, the latter doubling as the upgrade alarm); later scenarios still belong to detailed design.

## Consequences and unresolved details

- This records the agreed direction, not implementation completion or compatibility of the existing five extensions.
- Existing `readonly-mode` mixed control cannot be claimed as a behavior-preserving migration within the first release. Its migration treatment remains out of first-release scope and to be decided later.
- The `codebase-tools` developer-role injection requirement in ADR-0001 is recast as an agent-runtime-qualified capability: the OMP adapter records the provider's serialized role for persisted contributions, and codebase-tools explicitly operates on OMP without developer authority. The recorded facts (2026-10-07, real outbound capture per provider path, see [provider-path role evidence](../agent-runtime-support.md#provider-path-role-evidence-recorded-facts-not-a-gate)) are `user` on `deepseek/deepseek-flash` (`openai-completions`) and `developer` on `openai-codex/gpt-6-luna` (`openai-codex-responses`, shape-only layer 1) — an earlier statement here that both verified paths serialize `user` was a source inference, not a capture, and is superseded. A universal developer-role guarantee is not promised, the role is recorded as a fact rather than an activation or refusal condition, other agent runtimes remain undecided, and the original ADR-0001 is left untouched as the original extension's record.
- Restart versus extension reload is decided for the first release: only a whole-process restart takes effect, and hot reload is deferred. The v1 extension definition syntax is settled (a declarative `defineExtension` plus an agent-runtime adapter assembly), and the framework's small public interfaces evolve **additively only**; a non-additive change requires a new explicit decision in this document. Exact-version admission and the treatment of a newly added agent runtime that cannot meet an existing common contract are also decided: an unlisted version is warned about once per main session and then continues, while a missing required semantic rejects the affected capability fail-soft. Dependency discovery under the first-release OMP loader is resolved; the pi loader path, the precise composition of the reusable behavior library, and standalone generated artifact packaging remain deferred.
- For the first release, cross-behavior conflict rules are decided: exactly one rule per contribution slot, exactly one declared writer per State field, and one command name per extension; a conflict is an explicit configuration error handled fail-soft, and no behavior may be resolved implicitly by agent-runtime registration order. Composition and precedence among multiple rules per slot, multiple transitions triggered by one semantic event, and other multi-consumer cases remain deferred.
- For the first release, history preservation is enforced by restricting history-affecting writes to the framework's append-only contribution interface; request-only insertion, system-prefix treatment, and the precise shared-file coordination, failure, and freshness guarantees remain open or deferred. The scope of the history guarantee is framework-managed behavior; agent-runtime behavior and other extensions are excluded.
