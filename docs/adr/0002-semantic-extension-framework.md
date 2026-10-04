---
status: accepted
---

# Host-independent semantic framework as shared in-repository source

For the initial, single-maintainer use case, maintain one framework source tree in `my-agent-toolkit/framework/`. Extensions import this source directly rather than consuming a separately published framework package, so framework and extension logic can be edited and debugged together. Each extension retains one shared behavior definition and one shared TypeScript implementation, with thin pi/oh-my-pi entrypoints selecting the respective adapters. An entrypoint copied without the source tree and required dependencies is not a supported standalone artifact. This supersedes the independent runtime-package deployment decision; standalone extension generation also remains deferred. Avoid building a code generator before shared semantic behavior has been exercised on both hosts.

Keep the semantic core separate from reusable behaviors, feature templates, and host adapters, so common functionality can be configuration-only without moving all feature-specific business logic into the core. Own the event contracts while choosing names close to pi terminology to ease migration. If future distribution requires independent host artifacts, bundling or generation can be added later without maintaining duplicate feature logic. That future option is not part of the initial deliverable; arbitrary edits to such artifacts would be independently maintained rather than merged back into framework-managed sources.

This chooses direct source debugging and atomic framework/extension changes in one repository over independent package releases and standalone installability. The tested repository revision and dependency lockfile identify the deployed source combination. Actual installed pi and OMP loaders must be exercised with an entrypoint importing extension and framework TypeScript from outside its discovery directory before claiming the organization works. Direct source imports do not imply automatic hot reload or working source breakpoints; reload/cache behavior and debugger mapping require their own verification.

## Repository ownership and migration references

The framework's authoritative design and implementation live in my-agent-toolkit. The original independent extensions remain in [my-omp-toolkit](../../../my-omp-toolkit/), which is the source of existing business contracts, proven implementations, and selectable rollback baselines. Replacements are developed here incrementally; this document's source layout describes the target, not a migration already performed.

Maintain one authoritative document for each fact. Framework architecture decisions belong here; terms belong in [GLOSSARY.md](../../GLOSSARY.md); host observations and integration evidence belong in [host-support.md](../host-support.md) and its linked research; unresolved work belongs in the [framework backlog](../semantic-extension-framework-backlog.md). Other documents link to the owner rather than maintaining another policy or schema copy. my-omp-toolkit remains an independent extension repository and does not retain framework documents or migration pointers. References are one-way: my-agent-toolkit may consult my-omp-toolkit, but the original repository does not need to know about this framework.

| Subject | Authoritative source |
| --- | --- |
| Existing extension behavior and business terminology | Original extension documentation, including [codebase-tools](../../../my-omp-toolkit/extensions/codebase-tools/README.md) and its [glossary](../../../my-omp-toolkit/extensions/codebase-tools/GLOSSARY.md), and [model-cost](../../../my-omp-toolkit/extensions/model-cost/README.md) and its [glossary](../../../my-omp-toolkit/extensions/model-cost/GLOSSARY.md) |
| Existing codebase-tools contribution requirements | [Original ADR-0001](../../../my-omp-toolkit/docs/adr/0001-codebase-tools-extension.md); the number refers to that repository, not a missing local ADR |
| Original implementation and concrete persistence contracts | The relevant my-omp-toolkit source and documents at the baseline selected for each migration; do not copy their schemas into framework documentation |
| Refactoring progress and acceptance/rollback evidence | Each replacement's migration work in my-agent-toolkit, referencing its original contract and selected source revision rather than restating the business specification |

Migration is per independent extension. A selected original implementation and its replacement must not both be active. During transition, loading may select old and new implementations for different extensions; the exact loading selection mechanism is not yet decided, and this document migration does not change installed host configuration. Persistence and round-trip verification requirements have their single decision record in [Persistence compatibility for reversible extension migration](#persistence-compatibility-for-reversible-extension-migration).

Cross-repository source links assume sibling checkouts named my-agent-toolkit, my-omp-toolkit, pi, and oh-my-pi. Links to local sources identify where to inspect; historical investigation versions remain in the host baseline, and future migration acceptance must identify the original source revision actually verified.

## Source organization and host discovery

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
      hosts/
        pi.ts                   # Host assembly and host-specific implementation
        omp.ts
    model-cost/
      definition.ts
      logic.ts
      hosts/
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

The named extensions illustrate the layout, not completed migrations or certified host support. Split host-specific files into subdirectories when their implementation needs it; do not create unused files merely to match the diagram.

### Host loading and source dependencies

```text
pi  scans entrypoints/pi/  -> independent pi extension entrypoints
OMP scans entrypoints/omp/ -> independent OMP extension entrypoints
                                      |
                                      v
                         extensions/<extension>/hosts/<host>
                           |                         |
                           v                         v
                  shared extension logic     framework/adapters/<host>
                           |                         |
                           +------------+------------+
                                        v
                            shared framework interfaces
                           (semantic core and behaviors)
```

Arrows represent loading/import dependencies, not shared in-memory State or the order of all runtime events. Both hosts use the same framework source tree and shared extension source; only the selected host assembly and native integration differ. Actual loader resolution, reload behavior, and debugging remain deployment verification requirements.

Keep framework source in `framework/`, with semantic core, reusable behaviors, and host adapters separated internally. Keep each independent extension's shared definition and logic plus its host-specific implementations in `extensions/<extension>/`. Provide separate discovery roots `entrypoints/pi/` and `entrypoints/omp/`, each containing one thin entrypoint per supported extension. Configure each host to scan only its own discovery root, not the shared implementation directories. Entrypoints import or re-export their extension's host-specific assembly; they do not copy framework or business code and do not aggregate all extensions into one factory. Do not add a root `index.ts` that changes a discovery root into a single extension.

Extensions cross the framework's small public interfaces even though the code lives in the same repository. The framework must not depend on individual extension implementations, and shared logic must not import native host types merely because both are locally available. Host-specific code may use native capabilities directly. One source tree does not imply one runtime instance or shared in-memory State between host processes. This records the target layout, not a completed migration or a reason to create empty directories before implementation.

### Responsibility test for host differences

Different native implementations do not by themselves justify moving behavior out of the framework. Decide ownership by the semantic contract being upheld, not by whether the code contains host-specific calls.

| Responsibility | Implementation location | Example |
| --- | --- | --- |
| Host differences required to satisfy a framework-owned contract | Framework host adapter, using the shared core where appropriate | Map native lifecycle events to semantic hooks; establish the supported subagent State relationship |
| Extension-specific native presentation or integration not promised by the framework | That extension's host-specific implementation | Complex widget layout, native editor interaction, or a host-only enhancement |
| Business rules that mean the same thing across supported hosts | That extension's shared logic | Cost calculation, Holiday pricing, and extension-specific archival merge decisions |
| Native capability itself | Host-owned implementation, called directly where needed | Native UI operations or subagent execution; do not mirror the entire native interface in the framework |

The framework owns State and other capabilities it defines; it does not automatically own every native operation an extension uses. Conversely, extensions should not each reimplement host mapping for a framework contract. A host-specific integration remains part of its extension, while a framework host adapter is reused by all extensions. This placement rule does not exempt native calls from applicable history-preservation constraints.

## Scope map

The discussion covers nine areas: (1) extension definition/configuration and shared TypeScript logic; (2) control patterns, commands, and subfeatures; (3) semantic hooks and State orchestration; (4) State ownership, storage, restoration, archives, and shared-file concurrency; (5) ongoing work and lifecycle effects; (6) instruction contribution and mandatory history preservation; (7) basic status feedback driven by State; (8) host adapters and declared version/capability support; and (9) framework verification as upgrade regression detection. This map records responsibilities and exclusions, not a claim that these modules or all five migrations have been implemented.

## Initial control scope

Support three independent control patterns: configuration switches applied after restart, idempotent selection of a named mode, and command toggles alternating between two modes. Mixed control, such as the current Build/Explore/Debug interaction, is explicitly deferred rather than implicitly implemented through the initial patterns.

## Shared behavior scope

Include activation and mode controls, state storage (in-memory values, host-owned session entries, and extension-owned files), session state and restoration, and basic status feedback. Storage is not limited to framework-declared switches and parameters: business history and archival are explicitly in scope, motivated by existing model-cost requirements; shared-file concurrency safety is also an explicit framework capability, while its precise interface and failure contract remain to be designed. Command actions and parameter settings are also suitable reusable subfeatures, distinct from mode transitions; their exact contracts remain to be defined. A command subfeature and its State/storage are orthogonal: `/budget holiday` is an idempotent command subfeature activating the persisted Holiday pricing flag, not a mutually exclusive submode, while quota-ratio data may be stored without becoming a command or mode. Storage choice does not by itself define state ownership or restoration semantics. `codebase-tools` already persists `{on, initInjected}` in host-owned non-LLM session entries via `appendEntry` and restores it from the active branch; it does not store that state in a separate extension JSON file. These state entries are distinct from LLM conversation messages, so the history-preservation guarantee must not accidentally prohibit them.

Include configurable instruction contribution, using readonly-mode's injection slots and mode-dependent rules as a starting point. The goal is to configure content and contribution rules instead of editing host-specific hook code. Exact timing, context placement, retention, and role guarantees must be established separately; including instruction contribution does not automatically authorize arbitrary history rewrites or promise identical provider wire roles. See [prompt-injection research](../research/prompt-injection-research.md) for the verified current behavior.

Do not include operation guards in the initial common behavior library: the current evidence is specific to `readonly-mode`, rather than a demonstrated shared behavior across the extensions. This does not remove its existing protection requirements or settle how it will migrate.

## Persistence compatibility for reversible extension migration

Framework-based replacements must strictly preserve each original extension's persistence contract so users can switch between the selected original my-omp-toolkit baseline and its replacement without data conversion, schema-version upgrades, backup restoration, or loss of intervening business data. Compatibility is bidirectional: the replacement reads original data, and the original implementation reads and continues updating data written by the replacement. Preserve storage locations, record identifiers, field structure and meaning, units, and session/branch restoration semantics required by the original implementation; preserving only the JSON shape is insufficient.

Existing extension documents and the selected original source revision remain the authority for the concrete persistence format. Do not duplicate those schemas in framework documentation. Framework State may have a different in-memory representation, but its storage mapping must retain the original contract rather than serialize framework internals or introduce a generic replacement format. Do not automatically add schema-version envelopes or migrations. A change that would break this compatibility is outside the accepted refactoring scope and requires a new explicit decision.

Each extension's migration verification must exercise an original-write → replacement-read/update → original-read/update → replacement-read cycle on the same stored data, checking consumer-visible values and continuation behavior. Include the storage media that extension actually uses (files, archives, and host-owned non-LLM session entries as applicable); do not treat backups or a one-way import as rollback proof. This is an acceptance requirement, not a claim that any replacement has passed it. Switching implementations must avoid simultaneous activation; data compatibility alone does not stop duplicate hooks or ongoing work.

This decision removes persistence conversion as a required switching step, not the need to select a compatible host/source baseline or verify rollback. It does not claim that pi and OMP can read each other's native session formats; cross-host session portability is a separate, unestablished capability.

## Shared-file concurrency scope

When multiple sessions or agent processes update one extension-owned document, the framework should provide a coordinated read-modify-publish operation and reader-safe atomic publication so one writer cannot silently replace another writer's completed update or expose a partially written document. The fresh on-disk value must be considered within the coordination scope; locking only the final write is insufficient. Feature-specific merge decisions (such as choosing the newer model-cost measurement baseline while retaining a known ratio) remain feature logic, not a universal last-writer-wins policy. After a peer's publication, State may need reconciliation before it is used as the current value. The first implementation must not rely on an OMP-only runtime module for a shared pi/OMP capability.

Existing model-cost tests exercise multiple tracker instances sharing a file but substitute an in-process serialization lock ([original test lock](../../../my-omp-toolkit/tests/model-cost/test-lock.ts)); they do not independently verify a real inter-process lock. A framework-owned implementation therefore needs its own actual cross-process and crash/atomic-read contract tests. Lock portability, timeout/failure behavior, and State freshness are detailed-design decisions, not guarantees inferred from the present tests.

## Semantic hooks at the scope level

The framework should offer extension-owned code injection at meaningful agent lifecycle points as well as declarative behaviors. Examples such as agent start and message completion are candidate concepts, not yet a published event inventory or a claim of equivalent timing across pi and OMP. Selecting and verifying the exact hook set, its payloads and ordering belongs to detailed design against existing extensions and both hosts. An extension supplies one shared TypeScript implementation for each chosen semantic hook; host adapters bind that same implementation at the corresponding host lifecycle point and expose host-independent inputs and framework capabilities. Thin pi/OMP entrypoints must not require maintaining two copies of the feature logic. Treat source-code text splicing into host-specific templates as a different, fragile approach, not the intended meaning of "injection." Do not confuse message completion with an entire agent run settling.

## State and recovery seam

Treat state value, ownership, storage medium, restore policy, and lifecycle effects as related but distinct aspects of a behavior definition. A resumed session can restore state without replaying an earlier command or assuming its external effects are still active; reacquiring timers or remote registrations needs an explicit reconciliation policy. Persisted business values such as model-cost's holiday flag and quota estimate/baseline are not automatically modes or state-machine states. Exact reconciliation semantics and which values belong in the initial declarative state model remain open.

## Framework-owned capabilities and initial subagent inheritance

Expose small interfaces for framework-defined capabilities such as State; do not duplicate the host's native extension interface. Extensions may call native capabilities directly. Host adapters own the differences needed to uphold framework contracts, including State relationships across supported subagent execution paths; this does not require the framework to introduce a subagent scheduler or an MCP implementation. Native calls that affect conversation history remain subject to the history-preservation discussion; access to native interfaces is not a sandbox guarantee.

Initially implement only the inheritance behavior demonstrated by codebase-tools: subagents follow the owning main session's current activation value, while each session keeps its own init-injection progress. This is live following, not a one-time copy at child creation or wholesale inheritance of extension State. Do not introduce a menu of snapshot, shared-write, or other inheritance strategies before concrete extensions need them. The existing module-level `globalOn` is evidence of the desired behavior, not a framework ownership mechanism: the framework must associate values with the correct owning session rather than assume every binding in a process belongs to one owner.

Bind inheritance support to an explicitly integrated subagent execution path. The initial implementation target is OMP's built-in path; the initial pi adapter does not support subagent State inheritance. Do not choose or implement a pi subagent runner merely to claim parity. This is a planned host-qualified framework capability, not an implemented or runtime-certified feature. Extension loading, State inheritance, and MCP availability are separate conditions; inheritance does not imply that a child loads an extension or gains access to MCP.

For codebase-tools, explicitly permit operation in the current pi session without subagent State inheritance, provided its other required contracts are satisfied. Notify the user once when the extension is first enabled in that session, stating that the activation is not propagated to subagents by the framework. This is an accepted extension-specific policy, not permission to continue every extension when a required capability is absent. The concrete notification transport, reload/resume deduplication details, and declaration syntax remain to be designed; the notice must not be implemented as a model instruction or conversation contribution. Owner disappearance, child restoration without its owner, and child-side writes also require detailed contracts; this scope decision does not introduce fallback semantics for them.

## State as the current-value source

Call the unified per-extension current-value source **State**, borrowing React's vocabulary without adopting its component or hook model. Framework-managed behaviors read declared values from State, including extension-defined values; UI, command feedback, and instruction conditions do not each maintain a separate current-value copy. Framework-provided and extension-defined State variables may drive basic notifications and persistent status indicators; complex widget layout remains feature-specific rather than a universal UI language. State's read surface is not its mutation surface: control transitions, declared actions, host-event projections, and restore/persistence reconciliation are candidate update sources, while renderer code should not bypass them. Persistence media and remote providers remain external inputs; their observations must be reconciled into State before framework consumers read a current value. Cross-process freshness and the exact write/reconciliation contract remain open rather than implied by the phrase "single source of truth."

## Behavior orchestration around State

Treat State as the shared current-value source connecting control, commands, host events, persistence, instruction contribution, feedback, and ongoing lifecycle effects. Ongoing effects depend on both State and their owning scope: entering an active condition may start work, leaving it or losing the scope must stop work, and restoring State alone does not prove earlier effects are still active. One-shot command actions remain distinct from ongoing effects; neither every State update nor every restore automatically replays side effects. Framework-managed model-context behavior observes the same State but is additionally bound by the mandatory history-preservation contract.

## History preservation and execution frequency

Defer request-context filtering, including filtering this extension's own earlier contributions, to a later, more flexible policy. Arbitrary edits to other participants' messages or deletion of persisted conversations are not part of the initial common behavior. In the first release, strict history preservation is mandatory: the framework preserves existing host-owned conversation entries and the history-derived portion of each request without filtering, substitution, or reordering. New extension messages may be appended through the host's normal conversation-recording path; those entries then belong to the history that subsequent requests preserve. Request-only contributions do not themselves mutate stored history, but whether the first release supports them is not yet decided; their placement must not silently violate the history-derived prefix contract. This supersedes the earlier blanket prohibition of persisted extension-added messages: preserving existing history does not prohibit appending new recorded messages. Persistence alone is not sufficient; insertion into the middle of existing history, later removal, or rewriting the recorded contribution remains prohibited.

Appending temporary material after the history-derived content is the proposed cache-conscious placement: it can preserve that historical prefix, whereas insertion before or among existing history can change the reusable prefix despite leaving disk untouched. Exact allowed insertion positions remain to be confirmed. Temporary contributions are not automatically retained in subsequent requests, and their disappearance or change can limit reuse beyond the stable history prefix.

The guarantee concerns framework-managed behavior, not the host's normal message recording, compaction, other extensions, or a future independently modified generated artifact. Keeping chat history intact does not by itself guarantee cache hits: system instructions, tool declarations, and provider behavior are separate concerns. Whether system-prompt changes receive a separate stability policy remains open.

Distinguish agent-run initiation from individual model requests for all context-processing behaviors, not only prompt insertion. There is no established requirement yet for a public per-model-request insertion option. Filtering is excluded from the first release; if later enabled, it must apply consistently across the requests it governs, including tool continuations.

## Business logic versus model-context behavior

Keep the contracts for ordinary extension actions separate from instruction contribution and request-context processing. They may share configuration, state, and lifecycle infrastructure, but history-preservation constraints do not prohibit unrelated business computation, extension-owned archives, or status feedback. Apply the constraint according to effects: custom TS that changes host conversation data or outgoing chat history is context-affecting behavior, not exempt merely because it is custom code. The mechanism for keeping custom code within framework-managed interfaces remains a design decision; arbitrary in-process TS is not implicitly sandboxed.

## Supported-host compatibility

Only advertise a behavior as common when its semantic contract can be satisfied across all declared supported host targets; identical native API names are not required. The framework may additionally own explicitly host-qualified capabilities, initially subagent State inheritance on the integrated OMP path but not on pi. Their support conditions and absence must be visible rather than represented as cross-host parity. This qualifies the earlier common-behavior-only scope; it does not permit silently weakening required semantics. Reject a behavior whose required role or insertion semantics cannot be met rather than silently substituting a weaker behavior. Anchor the host targets and evidence in a [version baseline file](../host-support.md), separating source inspection from runtime validation; a version number alone does not establish compatibility across provider protocols or operating modes. Run shared semantic contract scenarios against host upgrades to detect regressions quickly: failure is an investigation signal, while success does not automatically approve support. A framework maintainer explicitly assesses source changes and/or additional evidence before declaring a new host version supported.

## Framework verification as a separate concern

Treat framework verification as a ninth scope area alongside definition/configuration, control/commands, semantic events and State orchestration, storage/recovery, ongoing lifecycle work, instruction contribution, status feedback, and host adaptation. Shared semantic contract scenarios serve as upgrade regression alarms; the maintainer, not a green test run, decides when a host version is supported. The specific scenarios and test harness belong to detailed design.

## Consequences and unresolved details

- This records the agreed direction, not implementation completion or compatibility of the existing five extensions.
- Existing `readonly-mode` mixed control cannot be claimed as a behavior-preserving migration within the initial control scope. Its migration treatment remains to be decided.
- The existing `codebase-tools` developer-role injection requirement in ADR-0001 remains in force; this decision does not authorize weakening it for another host.
- Restart versus extension reload, definition syntax, source import and dependency resolution under both loaders, exact-version versus version-range admission, treatment of a newly added host that cannot meet an existing common contract, and the precise set of reusable behaviors remain open. Standalone generated artifact packaging is explicitly deferred.
- Cross-behavior composition and conflict rules remain open: multiple contributions to the same slot, multiple transitions triggered by one semantic event, and competing State updates must not be resolved implicitly by host registration order.
- The mechanism for enforcing history preservation through custom-code interfaces, system-prefix treatment, and the precise shared-file coordination, failure, and freshness guarantees remain open. The scope of the history guarantee is framework-managed behavior; host behavior and other extensions are excluded.
