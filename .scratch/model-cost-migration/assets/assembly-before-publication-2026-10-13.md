# 装配决议发布前历史

本文件保存本轮发布前的完整原文，仅作恢复与旧到新溯源，不是当前政策。各快照内相对链接按原文件位置解释；当前结果见 [装配权威](../lighthouse/10-assembly-layout.md)，确认来源见 [本轮确认](assembly-confirmation-2026-10-13.md)。

## docs/adr/0002-semantic-extension-framework.md

````markdown
---
status: accepted
---

# Harness-independent semantic framework as shared in-repository source

> **Terminology updated 2026-10-08** by [ADR-0003](./0003-harness-terminology.md): the host program
> this framework adapts to is a **harness** (formerly "agent runtime"), and the repository's shared
> test rig is the **harness dock**（short `dock`, formerly `tests/harness/`). Where this document
> keeps the word "runtime", it means only the run-time sense — for example `runtime-exercised` or
> the `runtime parameter` — never the host.

For the initial, single-maintainer use case, maintain one framework source tree in `my-agent-toolkit/framework/`. Extensions import this source directly rather than consuming a separately published framework package, so framework and extension logic can be edited and debugged together. Each extension retains one shared behavior definition and one shared TypeScript implementation, with thin pi/oh-my-pi entrypoints selecting the respective adapters. An entrypoint copied without the source tree and required dependencies is not a supported standalone artifact. This supersedes the independent harness-package deployment decision; standalone extension generation also remains deferred. Avoid building a code generator before shared semantic behavior has been exercised on a real harness; the first release exercises the OMP path and does not implement the pi adapter.

Keep the semantic core separate from reusable behaviors, feature templates, and harness adapters, so common functionality can be configuration-only without moving all feature-specific business logic into the core. Own the event contracts while choosing names close to pi terminology to ease migration. If future distribution requires independent harness artifacts, bundling or generation can be added later without maintaining duplicate feature logic. That future option is not part of the initial deliverable; arbitrary edits to such artifacts would be independently maintained rather than merged back into framework-managed sources.

This chooses direct source debugging and atomic framework/extension changes in one repository over independent package releases and standalone installability. The tested repository revision and dependency lockfile identify the deployed source combination. An actual installed harness loader must be exercised with an entrypoint importing extension and framework TypeScript from outside its discovery directory before claiming the organization works; the first release exercises the OMP loader, with the pi loader deferred. Direct source imports do not imply automatic hot reload or working source breakpoints; reload/cache behavior and debugger mapping require their own verification.

## Repository ownership and migration references

The framework's authoritative design and implementation live in my-agent-toolkit. The original independent extensions remain in [my-omp-toolkit](../../../my-omp-toolkit/), which is the source of existing business contracts, proven implementations, and selectable rollback baselines. Replacements are developed here incrementally; this document's source layout describes the target, not a migration already performed.

Maintain one authoritative document for each fact. Framework architecture decisions belong here; terms belong in [GLOSSARY.md](../../framework/GLOSSARY.md); harness observations and integration evidence belong in [harness-support.md](../../framework/docs/harness-support.md) and its linked research; unresolved work belongs in the [framework backlog](../../framework/docs/semantic-extension-framework-backlog.md). Other documents link to the owner rather than maintaining another policy or schema copy. my-omp-toolkit remains an independent extension repository and does not retain framework documents or migration pointers. References are one-way: my-agent-toolkit may consult my-omp-toolkit, but the original repository does not need to know about this framework.

| Subject | Authoritative source |
| --- | --- |
| Existing extension behavior and business terminology | Original extension documentation, including [codebase-tools](../../../my-omp-toolkit/extensions/codebase-tools/README.md) and its [glossary](../../../my-omp-toolkit/extensions/codebase-tools/GLOSSARY.md), and [model-cost](../../../my-omp-toolkit/extensions/model-cost/README.md) and its [glossary](../../../my-omp-toolkit/extensions/model-cost/GLOSSARY.md) |
| Existing codebase-tools contribution requirements | [Original ADR-0001](../../../my-omp-toolkit/docs/adr/0001-codebase-tools-extension.md); the number refers to that repository, not a missing local ADR |
| Original implementation and concrete persistence contracts | The relevant my-omp-toolkit source and documents at the baseline selected for each migration; do not copy their schemas into framework documentation |
| Refactoring progress and acceptance/rollback evidence | Each replacement's migration work in my-agent-toolkit, referencing its original contract and selected source revision rather than restating the business specification |

Migration is per independent extension. A selected original implementation and its replacement must not both be active. During transition, loading may select old and new implementations for different extensions; for the first release, simultaneous activation of one extension's original and replacement is prevented by load-source mutual exclusion (an explicit-only root during development/acceptance, and removal of the superseded implementation before the permanent cutover), and this migration does not change installed harness configuration. Persistence and round-trip verification requirements have their single decision record in [Persistence compatibility for reversible extension migration](#persistence-compatibility-for-reversible-extension-migration).

Cross-repository source links assume sibling checkouts named my-agent-toolkit, my-omp-toolkit, pi, and oh-my-pi. Links to local sources identify where to inspect; historical investigation versions remain in the harness baseline, and future migration acceptance must identify the original source revision actually verified.

## Source organization and harness discovery

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
      definition.ts             # The declaration shared by every harness assembly
      shared-logic/             # Harness-independent shared logic (everything outside harnesses/)
        prompts.ts
        prompts/
          init.md
          reminder.md
      harnesses/
        pi.ts                   # Harness assembly and harness-specific implementation
        omp.ts
    connect-bot/
      definition.ts
      config.yaml
      shared-logic/             # Grouped by concept: panel/, session/, command/ (plus shared seams)
        panel/
        session/
        command/
      harnesses/
        omp.ts
    model-cost/
      definition.ts
      shared-logic/
      harnesses/
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

The named extensions illustrate the layout, not completed migrations or certified harness support. An extension's harness-independent code lives under `shared-logic/`, grouped by concept when it is large enough to need it; `harnesses/` holds the harness assemblies and is the only native access; `definition.ts`, `config.yaml` and the extension's own docs stay at its root. Do not create unused files merely to match the diagram. In the first release only codebase-tools and connect-bot are migrated, only their OMP assemblies are implemented, codebase-tools' behavior is declared in its definition rather than a large logic file, and the pi adapter and the model-cost migration are deferred.

### Harness loading and source dependencies

```text
pi  scans entrypoints/pi/  -> independent pi extension entrypoints
OMP scans entrypoints/omp/ -> independent OMP extension entrypoints
                                      |
                                      v
                         extensions/<extension>/harnesses/<harness>
                           |                         |
                           v                         v
                  shared extension logic     framework/adapters/<harness>
                           |                         |
                           +------------+------------+
                                        v
                            shared framework interfaces
                           (semantic core and behaviors)
```

Arrows represent loading/import dependencies, not shared in-memory State or the order of all harness events. Both harnesses use the same framework source tree and shared extension source; only the selected harness assembly and native integration differ. Actual loader resolution, reload behavior, and debugging remain deployment verification requirements.

Keep framework source in `framework/`, with semantic core, reusable behaviors, and harness adapters separated internally. Keep each independent extension's shared definition and logic plus its harness-specific implementations in `extensions/<extension>/`. Provide separate discovery roots `entrypoints/pi/` and `entrypoints/omp/`, each containing one thin entrypoint per supported extension. Configure each harness to scan only its own discovery root, not the shared implementation directories. Entrypoints import or re-export their extension's harness-specific assembly; they do not copy framework or business code and do not aggregate all extensions into one factory. Do not add a root `index.ts` that changes a discovery root into a single extension.

Extensions cross the framework's small public interfaces even though the code lives in the same repository. The framework must not depend on individual extension implementations, and shared logic must not import native harness types merely because both are locally available. Harness-specific code may use native capabilities directly. One source tree does not imply one harness instance or shared in-memory State between harness processes. This records the target layout, not a completed migration or a reason to create empty directories before implementation. The framework's small public interfaces are a stable contract surface and evolve additively; a non-additive change requires a new explicit decision in this document.

### Enforcement of the native boundary

The shared/native split above is enforced mechanically by [`tests/framework/import-boundary.test.ts`](../../tests/framework/import-boundary.test.ts). The test scans every `.ts` under `framework/`, `extensions/` and `entrypoints/` and puts each module in exactly one class:

- **Escape hatch** — `framework/adapters/**` and `extensions/<id>/harnesses/**`. Native access is permitted here and nowhere else.
- **Discovery entrypoint** — every module under `entrypoints/`. Each is a single re-export of its extension's harness assembly and nothing else, so reaching the escape hatch is what it is for, and the entrypoint assertion governs it.
- **Shared source** — everything else: the framework tree outside `adapters/`, and every extension module outside its `harnesses/` (conventionally under the extension's `shared-logic/`).

No module outside the escape hatch may **name** a harness package (`@oh-my-pi/*`, `@earendil-works/*`) — an import, a dynamic import and an ambient `declare module` alike — and shared source may in addition not reach an escape-hatch module by relative import. The harness package's ambient declaration therefore sits with the adapter (`framework/adapters/modules.d.ts`), beside the code allowed to import it.

The native escape hatch is exactly two locations: `framework/adapters/**` and `extensions/<id>/harnesses/**`. The check reads specifiers lexically rather than through an AST, and only from `.ts` files: it is an alarm for the ordinary crossing, and the principle above is what binds. `require(...)`, computed or concatenated specifiers, aliasing, and a non-`.ts` module sit outside it, so a green run does not establish the boundary — it means only that the alarm found nothing to contradict it. A case the alarm cannot see is decided by the principle, and a case it flags is fixed rather than exempted.

Widening the escape hatch, adding an equivalent bypass, or moving native access outside these two locations is a non-additive architecture change and requires an explicit decision in this document, not an implementation detail. The connect-bot migration fixed the extension-side allow-list ([decision 04](../../.scratch/connect-bot-migration/decision/04-interaction-native-boundary.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/04-interaction-native-boundary.md)) and restated the invariant in these terms ([decision 07](../../.scratch/connect-bot-migration/decision/07-effect-callback-capabilities.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/07-effect-callback-capabilities.md)).

### Responsibility test for harness differences

Different native implementations do not by themselves justify moving behavior out of the framework. Decide ownership by the semantic contract being upheld, not by whether the code contains harness-specific calls.

| Responsibility | Implementation location | Example |
| --- | --- | --- |
| Harness differences required to satisfy a framework-owned contract | Framework harness adapter for native subscriptions, fact mapping and necessary bridges | Extract native lifecycle facts and supported relationship evidence without leaking native payloads |
| Reusable framework-owned semantic logic | Harness-independent framework core / behaviors wherever semantics can be unified | Manage identities, associations and lifecycle transitions once rather than repeating them per adapter |
| Extension-specific native presentation or integration not promised by the framework | That extension's harness-specific implementation | Complex widget layout, native editor interaction, or a harness-only enhancement |
| Business rules that mean the same thing across supported harnesses | That extension's shared logic | Cost calculation, Holiday pricing, and extension-specific archival merge decisions |
| Native capability itself | Harness-owned implementation, called directly where needed | Native UI operations or subagent execution; do not mirror the entire native interface in the framework |

The framework owns State and other capabilities it defines; it does not automatically own every native operation an extension uses. Conversely, extensions should not each reimplement harness mapping for a framework contract. A harness-specific integration remains part of its extension, while a framework harness adapter is reused by all extensions. This placement rule does not exempt native calls from applicable history-preservation constraints.

### Viewed-session presentation scope (additive planning; model-cost migration)

The model-cost migration applies the responsibility test above to extension-owned harness-specific widget fronts, shared business/presentation backends, and framework-owned viewed-session facts and effective-State marker projection. The confirmed scope and remaining native/assembly questions live only in [the assembly Lighthouse](../../.scratch/model-cost-migration/lighthouse/10-assembly-layout.md); [the display Lighthouse](../../.scratch/model-cost-migration/lighthouse/08-presentation.md) owns widget-specific behavior, with [confirmation and evidence limits](../../.scratch/model-cost-migration/assets/presentation-confirmation-2026-10-12.md). This does not widen the native escape hatch or change State Owner, and does not certify an implemented public focus interface or a newer harness baseline.

## Scope map

The discussion covers nine areas: (1) extension definition/configuration and shared TypeScript logic; (2) control patterns, commands, and subfeatures; (3) semantic hooks and State orchestration; (4) State ownership, storage, restoration, archives, and shared-file concurrency; (5) ongoing work and lifecycle effects; (6) instruction contribution and mandatory history preservation; (7) basic status feedback driven by State; (8) harness adapters and declared version/capability support; and (9) framework verification as upgrade regression detection. This map records responsibilities and exclusions, not a claim that these modules or all five migrations have been implemented.

## HTTP capability scope (additive planning; model-cost migration)

The model-cost migration confirms framework-owned, harness-independent HTTP transport, consumed directly through the framework public interface rather than delivery-scoped injection. The complete approved contract is held only in [HTTP Lighthouse](../../.scratch/model-cost-migration/lighthouse/05-http-capability.md); [the HTTP interview](../../.scratch/model-cost-migration/assets/http-capability-confirmation-2026-10-12.md) records confirmation, explicit revisions and evidence limits. That authority replaces the earlier partial proxy policy.

Provider endpoints, parsers and business routing remain extension shared logic; current credential facts are mapped on demand by the framework adapter under the responsibility test above. The approved consumer scope includes model-cost queries and connect-bot transport, without transferring their business protocols into HTTP or claiming control over harness-owned networking. Concrete source organization, wiring and acceptance remain in the migration map’s assembly and verification decisions; approval is not an implemented capability or runtime certification.

## Initial control scope

The control vocabulary covers configuration switches applied after restart, idempotent selection of a named mode, and command toggles alternating between two modes, but the first release implements only **command toggle**. Configuration switches, mode selection, mixed control such as the current Build/Explore/Debug interaction, and the remaining control kinds are explicitly deferred rather than implicitly implemented through the initial pattern.

### Extension configuration (additive; connect-bot migration, decision 05)

The connect-bot migration adds an additive capability for an extension's own configuration **values**, distinct from the deferred configuration-switch control kind: the framework reads a fixed `config.yaml` from the extension's source directory (`extensions/<definition.id>/config.yaml`, overridable by a declared `path`), parses it with the pure-JS `yaml` package (zero external dependencies, ISC) in the framework's harness-independent config module behind an injectable seam, and validates the required keys and primitive types the extension declares as plain data in its definition (`config.fields`). An invalid `config` declaration (non-object, a `fields` entry outside `string | non-empty-string | number | boolean | milliseconds`, or a non-string/empty `path`) and missing, unreadable, malformed, non-object, missing-required, or wrong-type content all refuse the binding the same way — the extension is not loaded and a `configuration` binding failure with violation kind `config` is reported on the non-model diagnostic channel; there is no code-level default fallback, the shipped file is the default. Values reach the extension's shared logic through a harness-independent `getConfig(definition)` read, so no harness assembly handles configuration; `readConfig(path)` and `ExtensionConfigError` are the config module's single read/parse/validate/throw surface. The convention path and any relative `path` are relative to the **configuration base directory** the extension's own assembly supplies as plain data — its extension-repository root — because the loader discovers an entrypoint by absolute path while the process runs in an arbitrary project directory; an absolute declared path is used as declared, and an assembly that names no directory leaves a relative path to be read against the process's working directory, as before that option existed. This is additive: configuration switches, mode selection, mixed control and the remaining control kinds stay deferred, and the same file is their intended future carrier.

### Directed control and per-field State lifecycle (additive; connect-bot migration, decision 02)

The connect-bot migration adds a second bound control kind, **directed** ([decision 02](../../.scratch/connect-bot-migration/decision/02-command-state-ownership.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/02-command-state-ownership.md)): a command that names its target state explicitly (`/connect-bot` = on, `/connect-bot off` = off), repeats its side effect on every invocation, and is never deduplicated or short-circuited by the framework — idempotence is the extension's responsibility. It is distinct from the deferred mode-selection, mixed-control and command-action kinds.

It also makes the State lifecycle **per field**, on three orthogonal axes:

- **Control kind** — `toggle` (existing) or `directed` (new).
- **Persistence** — `session-entry` (default: written to the owner's persistence medium, seeded from the target branch at session boundaries) or `memory` (never written and never seeded; an owner-identity change drops the value to the declared default, while navigation that keeps the identity preserves it).
- **Inheritance** — `follow` or `none` (default `none`: a subagent reads the declared default unless the field declares `follow`).

The framework's write authority is unchanged: the extension's handler runs before the framework records the value and owns the write, so a command can read the pre-invocation value. `memory` is the choice for a value that declares a live external effect, because a restored value does not prove the effect is running (see [State and recovery seam](#state-and-recovery-seam)).

## Shared behavior scope

Include activation and mode controls, state storage (in-memory values, harness-owned session entries, and extension-owned files), session state and restoration, and basic status feedback; the first release implements only the subset codebase-tools requires (activation toggle, owner-session-entry persistence, session restoration, and basic status feedback), leaving business archival, extension-owned files, and shared-file coordination to later releases. Storage is not limited to framework-declared switches and parameters: business history and archival are explicitly in scope, motivated by existing model-cost requirements; shared-file concurrency safety is also an explicit framework capability, while its precise interface and failure contract remain to be designed beyond the first release. Command actions and parameter settings are also suitable reusable subfeatures, distinct from mode transitions; their exact contracts remain to be defined beyond the first release. A command subfeature and its State/storage are orthogonal: `/budget holiday` is an idempotent command subfeature activating the persisted Holiday pricing flag, not a mutually exclusive submode, while quota-ratio data may be stored without becoming a command or mode. Storage choice does not by itself define state ownership or restoration semantics. The replacement persists its single activation value as `{enabled}` in a harness-owned non-LLM session entry via `appendEntry` (the original `{on, initInjected}` contract is not preserved), and derives injection progress from the active branch rather than a stored flag; it does not store that state in a separate extension JSON file. These state entries are distinct from LLM conversation messages, so the history-preservation guarantee must not accidentally prohibit them.

Include configurable instruction contribution, using readonly-mode's injection slots and mode-dependent rules as a starting point. The goal is to configure content and contribution rules instead of editing harness-specific hook code. For the first release, timing (one agent-run initiation per user turn), tail placement, persisted retention, and role handling (harness-qualified and recorded per provider path, not a developer-authority promise) are decided; the broader framework may generalize them later. Including instruction contribution does not automatically authorize arbitrary history rewrites or promise identical provider wire roles. See [prompt-injection research](../../framework/docs/research/prompt-injection-research.md) for the verified current behavior.

Do not include operation guards in the initial common behavior library: the current evidence is specific to `readonly-mode`, rather than a demonstrated shared behavior across the extensions. This does not remove its existing protection requirements or settle how it will migrate.

## Persistence compatibility for reversible extension migration

Framework-based replacements must strictly preserve each original extension's persistence contract so users can switch between the selected original my-omp-toolkit baseline and its replacement without data conversion, schema-version upgrades, backup restoration, or loss of intervening business data. Compatibility is bidirectional: the replacement reads original data, and the original implementation reads and continues updating data written by the replacement. The codebase-tools migration is an explicit, recorded exception (updated 2026-10-07): it preserves neither direction. The replacement uses a new `{enabled}` state key, does not read the original `{on}` field, and resumes pre-migration sessions as off (users re-toggle); no data conversion or import is provided. This persistence break is itself the explicit new decision the compatibility rule requires. Other migrations keep the bidirectional default. Preserve storage locations, record identifiers, field structure and meaning, units, and session/branch restoration semantics required by the original implementation; preserving only the JSON shape is insufficient.

Existing extension documents and the selected original source revision remain the authority for the concrete persistence format. Do not duplicate those schemas in framework documentation. Framework State may have a different in-memory representation, but its storage mapping must retain the original contract rather than serialize framework internals or introduce a generic replacement format. Do not automatically add schema-version envelopes or migrations. A change that would break this compatibility is outside the accepted refactoring scope and requires a new explicit decision.

Each extension's migration verification must exercise an original-write → replacement-read/update → original-read/update → replacement-read cycle on the same stored data, checking consumer-visible values and continuation behavior. The recorded codebase-tools exception verifies neither half (this migration preserves no persistence data); it is an explicit scope decision, not a general relaxation. Include the storage media that extension actually uses (files, archives, and harness-owned non-LLM session entries as applicable); do not treat backups or a one-way import as rollback proof. This is an acceptance requirement, not a claim that any replacement has passed it. Switching implementations must avoid simultaneous activation; data compatibility alone does not stop duplicate hooks or ongoing work.

This decision removes persistence conversion as a required switching step, not the need to select a compatible harness/source baseline or verify rollback. It does not claim that pi and OMP can read each other's native session formats; cross-harness session portability is a separate, unestablished capability.

## Shared-file concurrency scope

When multiple sessions or agent processes update one extension-owned document, the framework should provide a coordinated read-modify-publish operation and reader-safe atomic publication so one writer cannot silently replace another writer's completed update or expose a partially written document. The fresh on-disk value must be considered within the coordination scope; locking only the final write is insufficient. Feature-specific merge decisions (such as choosing the newer model-cost measurement baseline while retaining a known ratio) remain feature logic, not a universal last-writer-wins policy. After a peer's publication, State may need reconciliation before it is used as the current value. The first implementation must not rely on an OMP-only harness module for a shared pi/OMP capability.

Existing model-cost tests exercise multiple tracker instances sharing a file but substitute an in-process serialization lock ([original test lock](../../../my-omp-toolkit/tests/model-cost/test-lock.ts)); they do not independently verify a real inter-process lock. A framework-owned implementation therefore needs its own actual cross-process and crash/atomic-read contract tests. Lock portability, timeout/failure behavior, and State freshness are detailed-design decisions, not guarantees inferred from the present tests.

## Semantic hooks at the scope level

The framework should offer extension-owned code injection at meaningful agent lifecycle points as well as declarative behaviors. Examples such as agent start and message completion are candidate concepts, not yet a published event inventory or a claim of equivalent timing across pi and OMP. The first release fixes one semantic hook mapping (agent-run initiation, at most once per user turn); the broader hook set, its payloads and ordering still belong to detailed design against existing extensions and both harnesses. An extension supplies one shared TypeScript implementation for each chosen semantic hook; harness adapters bind that same implementation at the corresponding harness lifecycle point and expose harness-independent inputs and framework capabilities. Thin pi/OMP entrypoints must not require maintaining two copies of the feature logic. Treat source-code text splicing into harness-specific templates as a different, fragile approach, not the intended meaning of "injection." Do not confuse message completion with an entire agent run settling.

## Semantic lifecycle model

The framework owns one harness-independent lifecycle vocabulary for extensions. Its target places reusable semantic processing in the shared framework, with harness adapters supplying native fact mappings and necessary bridges; the model-cost migration explicitly permits refactoring existing placement and accepting reviewed edge-case accuracy tradeoffs to avoid repeating lifecycle logic per harness. The confirmed scope and feasibility limits live in [the observation Lighthouse](../../.scratch/model-cost-migration/lighthouse/03-observation-contract.md); this is not a claim that the existing adapter has been refactored. The connect-bot migration fixed the first implemented model ([decision](../../.scratch/connect-bot-migration/decision/03-lifecycle-effects.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/03-lifecycle-effects.md)):

- **Session axis.** `session_start` (a session became the current owner; reason `initial`, `new`, `resume` or `fork`) and `session_end` (the current owner ceased; reason `transferred` or `disposed`) form a symmetric pair. A switch, branch or fork is `session_end(transferred)` followed by `session_start`; navigation that keeps the same owner emits neither. The framework seeds and retires State and refreshes the marker area on these boundaries; an extension may subscribe, and the migrating extension uses `session_end` to stop its own effect. The delivery carries this event rather than the earlier session `position`/`reason` pair: the event **replaces** those two fields, and the `SessionPosition`/`SessionChangeReason` types with them, instead of traveling beside them, because a position-described delivery can express neither a symmetric pair nor a start that carries no reason. That replacement is a non-additive interface change and is decided here; the delivery's redundant `previousOwnerKey` is removed with it and recorded in the capability section below.
- **Round axis.** A **Round** is one period of agent activity, from starting work to quiescence — no automatic work remains and it is waiting for the user. A round may contain several model-response turns and several low-level agent runs. `round_start` and `round_end` are edge-triggered transitions; `round_end` has no payload and fires only at quiescence (automatic continuations stay inside the round, while error and abort still reach it).
- **Idle is a query, not an event.** `canAcceptInput()` exposes the harness's idle fact independently of the events and supplies the initial value at activation.
- **Ownership and dispatch.** The framework owns the event semantics, reusable lifecycle processing and owner scope; adapters own native fact mapping and necessary bridges, and a missing required semantic is refused fail-soft rather than silently weakened. An owner-facing subscription receives only its owner session's events — a subagent's events never reach it. Framework behaviors run before extension handlers.
- **Effects stay with the extension.** Ongoing work such as timers, outbound queues, retry/failure budgets and network protocol remains the extension's business; the framework emits semantic events and does not add a continuous-task contract.

This fixes the first-release lifecycle vocabulary and refines the "Semantic hooks at the scope level" note above; the remaining hook inventory (for example model-response turns, provider and tool events) stays deferred until a concrete extension needs it. Everything else the migration added for these two axes is additive — an event union, deliveries, handler subscriptions, the idle query, the port's round hook, and the assembly-declared required semantics — so the session-axis replacement recorded above and the feedback replacement recorded in the feedback section are this migration's only non-additive interface changes.

## Owner-scoped effect capabilities (additive; connect-bot migration, decision 07)

An extension-owned background effect (for example a heartbeat timer or an outbound flusher) runs outside any handler delivery, so it cannot rely on delivery-scoped seams alone ([decision 07](../../.scratch/connect-bot-migration/decision/07-effect-callback-capabilities.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/07-effect-callback-capabilities.md)):

- A handler delivery exposes an **owner-scoped capability** (declared-value write plus the feedback channel) that the extension may retain in its own owner-keyed effect record and reuse from that background callback.
- The capability is valid only while its owner is live. On `session_end` the framework retires the owner before the extension handler runs, so a retained capability becomes inert: writes are no-ops that neither recreate State nor republish a marker, and feedback is dropped. The `session_end` delivery itself carries a fresh, dispatch-scoped feedback channel, so the extension can still emit its session-switched notice while stopping local effects.
- `session_end` names the **ending** owner in its `owner` field; the earlier `previousOwnerKey` is redundant once a switch is expressed as `session_end` + `session_start`, and is removed from the semantic delivery. No `hasUI` is carried on the retained capability.
- The extension stops its local resources synchronously before any await; the framework does not wait for the extension's best-effort remote unregister.

## State and recovery seam

Treat state value, ownership, storage medium, restore policy, and lifecycle effects as related but distinct aspects of a behavior definition. A resumed session can restore state without replaying an earlier command or assuming its external effects are still active; reacquiring timers or remote registrations needs an explicit reconciliation policy. Persisted business values such as model-cost's holiday flag and quota estimate/baseline are not automatically modes or state-machine states. For the first release, reconciliation semantics are decided (seed from the target branch at session boundaries, in-session current value authoritative, and navigation that does not change session identity does not refresh activation) and the initial declarative state model is the single boolean activation value used by codebase-tools; broader values and reconciliation remain open.

## Framework-owned capabilities and initial subagent inheritance

Expose small interfaces for framework-defined capabilities such as State; do not duplicate the harness's native extension interface. Extensions may call native capabilities directly. Harness adapters own the differences needed to uphold framework contracts, including State relationships across supported subagent execution paths; this does not require the framework to introduce a subagent scheduler or an MCP implementation. Native calls that affect conversation history remain subject to the history-preservation discussion; access to native interfaces is not a sandbox guarantee.

Inheritance is a per-field axis and defaults to `none`: a subagent reads a field's declared default unless that field declares `follow`, in which case it reads the owning main session's current value live, while each session keeps its own init-injection progress. The first implementation of that live following was the behavior codebase-tools demonstrated, and codebase-tools keeps it by declaring `follow` explicitly. This is live following, not a one-time copy at child creation or wholesale inheritance of extension State. Do not introduce a menu of snapshot, shared-write, or other inheritance strategies before concrete extensions need them. The connect-bot migration made this per-field and default-off, with codebase-tools explicitly opting in; see the directed-control and per-field State lifecycle note under Initial control scope. The existing module-level `globalOn` is evidence of the desired behavior, not a framework ownership mechanism: the framework must associate values with the correct owning session rather than assume every binding in a process belongs to one owner.

Bind inheritance support to an explicitly integrated subagent execution path. The first-release implementation target is OMP's built-in path; the first release ships no pi adapter, so pi subagent State inheritance is not merely unsupported but unimplemented. Do not choose or implement a pi subagent runner merely to claim parity. This is a planned harness-qualified framework capability, not an implemented or runtime-certified feature. Extension loading, State inheritance, and MCP availability are separate conditions; inheritance does not imply that a child loads an extension or gains access to MCP.

A future pi adapter may explicitly permit codebase-tools to operate in a pi session without subagent State inheritance, provided its other required contracts are satisfied; the first release ships no pi adapter, so this is recorded as a deferred harness-qualified path rather than first-release behavior. When such a path is implemented, notify the user once at the extension's first activation in that session that activation is not propagated to subagents by the framework. This is an accepted extension-specific policy, not permission to continue every extension when a required capability is absent. The first release decides the notification transport (extension UI notification, with a stderr line when no UI is available), deduplication (once per main session), and declaration syntax (the declarative extension definition); the notice is not implemented as a model instruction or conversation contribution. Owner disappearance and child restoration without their owner resolve to off, and child-side writes are not permitted; no further fallback semantics are introduced.

## State as the current-value source

Call the unified per-extension current-value source **State**, borrowing React's vocabulary without adopting its component or hook model. Framework-managed behaviors read declared values from State, including extension-defined values; UI, command feedback, and instruction conditions do not each maintain a separate current-value copy. Framework-provided and extension-defined State variables may drive basic notifications and persistent status indicators; complex widget layout remains feature-specific rather than a universal UI language. State's read surface is not its mutation surface: control transitions, declared actions, harness-event projections, and restore/persistence reconciliation are candidate update sources, while renderer code should not bypass them. Persistence media and remote providers remain external inputs; their observations must be reconciled into State before framework consumers read a current value. For the first release the write path is decided (single writer, transition → persistence → feedback, with the in-session current value authoritative); cross-process freshness remains open rather than implied by the phrase "single source of truth."

## One State module for value, life, writes and restoration (constrained refactor)

This records the module shape State is implemented with and refines the write-path and reconciliation notes above; it changes nothing an extension authors. [`StateStore`](../../framework/core/state.ts) owns the extension's declared State end to end — the owner-keyed cells (field name → current value), the owner lives a retained capability is gated by, the declared-value write path, and session-boundary restoration — and keeps the read surface `view(ownerKey).read(field)` unchanged. The separate behavior modules that used to hold the declared-value seam, the retained capability and the session reconciliation are deleted rather than kept as pass-through wrappers.

- **Only State rules are accepted.** The constructor requires the resolved `StateRules` (`{ field, persistence }`) — exactly the pair `activationField(definition)` and `statePersistence(definition)` ([`definition.ts#L255`](../../framework/core/definition.ts#L255), [`#L260`](../../framework/core/definition.ts#L260)) already resolve for the definition an assembly serves. The store holds no definition, reaches into none, and applies no default of its own: what a definition leaves out is resolved where the defaults live. The effect shapes it consumes are exported beside it: `StateWriteTarget` (`ownerKey`, `persist(values)`, `publishMarker()`), `StateCapabilityTarget` (that plus `feedback`), and `StateSessionChange` (`owner`, `event`, `statePayloads`, `publishMarker(ownerKey)`) — the publication receives the owner key the boundary resolved, so the dispatcher does not repeat the owner gate.
- **Effects are supplied per delivery, not remembered by the store.** `writer(target)` returns the delivery's declared-value seam, `capability(target)` returns the owner-scoped handle, and `reconcile(change)` applies one boundary. No transport is resolved inside the store, and the store has no mutable current-session target: each writer or capability closes over the effects its own delivery supplied.
- **One store per assembly, not a process-global registry.** The store is constructed inside [`ompAdapter`](../../framework/adapters/omp.ts#L848), once per factory call, and shared by every session binding of that extension, so those bindings agree on one current value per owner and two extensions never share a store. State is deliberately not resolved from a process global keyed by definition id: the process-scoped resources remain the ones a duplicated framework module graph must still share — the unified marker area (see [Extension feedback, marker, and declared-value writes](#extension-feedback-marker-and-declared-value-writes-additive-connect-bot-migration-decision-04)) and the version judgement — and State is not one of them.
- **Owner lives stay private.** `OwnerLives` remains the implementation of "a capability lives exactly as long as its owner's cell", kept as the store's private `#ownerLives` composition rather than a member a behavior reaches. A start opens the life, the end that retires the cell revokes what was retained for it, and a handle asked for after that owner's life has ended is inert from birth; an owner not yet seen by a session event keeps the existing command-before-start behavior.

The refactor moves the same behavior behind that one interface; it does not revisit it:

- **Write order and best effort.** A write sets the value first and is authoritative for later reads whether or not the persistence attempt succeeds; a persistence failure is swallowed and does not stop the marker publication that follows, and a publication failure propagates without rolling back the value or the persistence attempt; a `memory` field is never persisted, and repeated writes of the same value are neither deduplicated nor short-circuited — each one records (where the field persists) and republishes.
- **Capability gating.** A retained handle's `read` is not gated or frozen: a handle kept from an earlier life still observes the current value, while its `write` and `feedback` are dropped once that life has ended. A handle minted for an owner whose life has already ended — including the one a `session_end` delivery mints — is inert from birth; a later start opens a life for newly minted handles only and never revives an old one. The `session_end` dispatch keeps its own feedback channel, independent of the capability, so the handler can still speak for the boundary after the owner it names has been retired.
- **Reconciliation.** A delivery whose session is not its own owner is ignored. An end drops the owner's cell and then revokes its retained capabilities, so a late write cannot recreate the cell, and publishes the marker area only for `disposed`. A start opens the life first, then, for a `session-entry` field only, seeds the cell from the **last** payload when that payload declares the field as a boolean — any other payload yields the declared default — and publishes the area; a `memory` field is never seeded, so navigation that keeps the owner keeps its value.

The extension-authoring contract is untouched: no definition, assembly option, delivery type or shared-logic call changes, and the read surface is the same `view`. What changes is `StateStore`'s own surface — `applyTransition`, `seed`, `retire` and the public `ownerLives` give way to `writer`, `capability` and `reconcile` — and that internal surface carries no extension compatibility promise; this section is the explicit decision for it. This records the agreed shape and the behavior it must preserve, not runtime verification of the implementation: the framework suites that pin those behaviors — [`declared-value-write.test.ts`](../../tests/framework/declared-value-write.test.ts), [`owner-capability.test.ts`](../../tests/framework/owner-capability.test.ts), [`session-events.test.ts`](../../tests/framework/session-events.test.ts) and [`owner-gate.test.ts`](../../tests/framework/owner-gate.test.ts) — remain the regression alarm for it.

## Behavior orchestration around State

Treat State as the shared current-value source connecting control, commands, harness events, persistence, instruction contribution, feedback, and ongoing lifecycle effects. Ongoing effects depend on both State and their owning scope: entering an active condition may start work, leaving it or losing the scope must stop work, and restoring State alone does not prove earlier effects are still active. One-shot command actions remain distinct from ongoing effects; neither every State update nor every restore automatically replays side effects. Framework-managed model-context behavior observes the same State but is additionally bound by the mandatory history-preservation contract.

## Extension feedback, marker, and declared-value writes (additive; connect-bot migration, decision 04)

The connect-bot migration fixes the user-visible feedback and status surface ([decision 04](../../.scratch/connect-bot-migration/decision/04-interaction-native-boundary.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/04-interaction-native-boundary.md)):

- **One feedback channel.** Extensions publish operator-facing notices through a single harness-independent channel with an `info | error` severity, available on command and semantic-event handlers; the adapter maps it to a UI notification, or to a stderr line when the session has no UI. It is never model-visible — not an injected prompt, a conversation entry, or tool output — and the framework's internal admission/session warnings are not merged into it. The channel **replaces** the delivery's earlier plain `notify(message)` member, which is removed rather than kept beside it, so an extension says everything it says to the operator in one place at one severity; that replacement is a non-additive interface change and is decided here. The existing toggle feedback keeps its two texts and is published on the new channel, and a `directed` command publishes no framework feedback of its own.
- **`hasUI` on deliveries.** A delivery states whether the session has a UI, so the extension's shared logic enforces its own main-session + UI gate rather than the framework silently refusing on its behalf. Subagent refusals remain the framework's owner-scope concern.
- **Marker ownership.** The unified marker area stays framework-owned (placement, line order, publication, clearing); an extension contributes only its text. The migrated markers are `◈ codeBaseTools` and `◐ connectBot`, published only while their activation value is true. Both are East Asian Width Ambiguous symbols from the Geometric Shapes block, so they render from one font at one advance and the two area lines stay aligned. The area is one per process, resolved from the process global rather than from the module instance, so every extension's line renders in the one widget even when the loader evaluates a separate framework module graph per extension.
- **Declared-value write seam.** Every injected handler delivery carries a write seam limited to the extension's declared fields, and the framework publishes the marker after each write. Auto-disarm uses it to write its activation field `false`.
- **Native allow-list.** The extension's direct native use is limited to its `harnesses/omp.ts` assembly (managed timer, real session id/cwd/model as plain data); shared logic imports no native types and registers no native hooks.

## History preservation and execution frequency

Defer request-context filtering, including filtering this extension's own earlier contributions, to a later, more flexible policy. Arbitrary edits to other participants' messages or deletion of persisted conversations are not part of the initial common behavior. In the first release, strict history preservation is mandatory: the framework preserves existing harness-owned conversation entries and the history-derived portion of each request without filtering, substitution, or reordering. New extension messages may be appended through the harness's normal conversation-recording path; those entries then belong to the history that subsequent requests preserve. Request-only contributions do not themselves mutate stored history; the first release does not support them, and any future placement must not silently violate the history-derived prefix contract. This supersedes the earlier blanket prohibition of persisted extension-added messages: preserving existing history does not prohibit appending new recorded messages. Persistence alone is not sufficient; insertion into the middle of existing history, later removal, or rewriting the recorded contribution remains prohibited.

Appending new contributed material after the history-derived content is the first-release placement: it preserves that historical prefix, whereas insertion before or among existing history can change the reusable prefix despite leaving disk untouched. Exact allowed insertion positions for future request-only material remain to be confirmed. Temporary contributions are not automatically retained in subsequent requests, and their disappearance or change can limit reuse beyond the stable history prefix.

The guarantee concerns framework-managed behavior, not the harness's normal message recording, compaction, other extensions, or a future independently modified generated artifact. Keeping chat history intact does not by itself guarantee cache hits: system instructions, tool declarations, and provider behavior are separate concerns. Whether system-prompt changes receive a separate stability policy remains open.

Distinguish agent-run initiation from individual model requests for all context-processing behaviors, not only prompt insertion. There is no established requirement yet for a public per-model-request insertion option. Filtering is excluded from the first release; if later enabled, it must apply consistently across the requests it governs, including tool continuations.

## Business logic versus model-context behavior

Keep the contracts for ordinary extension actions separate from instruction contribution and request-context processing. They may share configuration, state, and lifecycle infrastructure, but history-preservation constraints do not prohibit unrelated business computation, extension-owned archives, or status feedback. Apply the constraint according to effects: custom TS that changes harness conversation data or outgoing chat history is context-affecting behavior, not exempt merely because it is custom code. For the first release, custom code that changes conversation data or outgoing history may write only through the framework's contribution interface (append-only and history-preserving), and arbitrary in-process TS is not implicitly sandboxed; a constrained custom-logic entry point remains deferred.

## Supported-harness compatibility

Harness version support is a framework-owned baseline, not an extension-owned list. Evaluate version membership once per process and share the result across extensions, including separately loaded framework module copies. Keep the lightweight required-API shape check at each binding; it is only an availability guard, not proof of semantic compatibility. Semantic compatibility remains established by contract scenarios and real harness verification. This changes the admission ownership and execution scope; it does not change the policy that an unlisted version warns and continues.

Only advertise a behavior as common when its semantic contract can be satisfied across all declared supported harness targets; identical native API names are not required. The framework may additionally own explicitly harness-qualified capabilities, initially subagent State inheritance on the integrated OMP path but not on pi, and the delivered authority of persisted instruction contributions, whose OMP mapping is recorded from provider serialization while other harnesses remain undecided. Their support conditions and absence must be visible rather than represented as cross-harness parity. This qualifies the earlier common-behavior-only scope; it does not permit silently weakening required semantics. Reject a behavior whose required role or insertion semantics cannot be met rather than silently substituting a weaker behavior. An extension may instead record an explicit, harness-scoped acceptance of a documented absence, as codebase-tools does on OMP for delivered contribution authority; that record is per harness and is not a cross-harness permission. Rejection is **fail-soft**: the unmet requirement is reported on a non-model channel (never in model instructions or conversation history), the affected capability or extension is not bound, no partial registration is left behind, and the harness continues. The same fail-soft rule covers invalid extension definitions, configuration conflicts (duplicate command names, competing State writers, multiple rules for one contribution slot), and initialization failures. Anchor the harness targets and evidence in a [version baseline file](../../framework/docs/harness-support.md), separating source inspection from runtime validation; a version number alone does not establish compatibility across provider protocols or operating modes. Run shared semantic contract scenarios against harness upgrades to detect regressions quickly: failure is an investigation signal, while success does not automatically approve support. A framework maintainer explicitly assesses source changes and/or additional evidence before declaring a new harness version supported.

## Framework verification as a separate concern

Treat framework verification as a ninth scope area alongside definition/configuration, control/commands, semantic events and State orchestration, storage/recovery, ongoing lifecycle work, instruction contribution, status feedback, and harness adaptation. Shared semantic contract scenarios serve as upgrade regression alarms; the maintainer, not a green test run, decides when a harness version is supported. The first release fixes the scenarios and dock as two separated suites (extension acceptance and framework capability, the latter doubling as the upgrade alarm); later scenarios still belong to detailed design.

## Consequences and unresolved details

- This records the agreed direction, not implementation completion or compatibility of the existing five extensions.
- Existing `readonly-mode` mixed control cannot be claimed as a behavior-preserving migration within the first release. Its migration treatment remains out of first-release scope and to be decided later.
- The `codebase-tools` developer-role injection requirement in ADR-0001 is recast as a harness-qualified capability: the OMP adapter records the provider's serialized role for persisted contributions, and codebase-tools explicitly operates on OMP without developer authority. The recorded facts (2026-10-07, real outbound capture per provider path, see [provider-path role evidence](../../framework/docs/harness-support.md#provider-path-role-evidence-recorded-facts-not-a-gate)) are `user` on `deepseek/deepseek-flash` (`openai-completions`) and `developer` on `openai-codex/gpt-6-luna` (`openai-codex-responses`, shape-only layer 1) — an earlier statement here that both verified paths serialize `user` was a source inference, not a capture, and is superseded. A universal developer-role guarantee is not promised, the role is recorded as a fact rather than an activation or refusal condition, other harnesses remain undecided, and the original ADR-0001 is left untouched as the original extension's record.
- Restart versus extension reload is decided for the first release: only a whole-process restart takes effect, and hot reload is deferred. The v1 extension definition syntax is settled (a declarative `defineExtension` plus a harness adapter assembly), and the framework's small public interfaces evolve **additively only**; a non-additive change requires a new explicit decision in this document. Exact-version admission and the treatment of a newly added harness that cannot meet an existing common contract are also decided: an unlisted version is warned about once per main session and then continues, while a missing required semantic rejects the affected capability fail-soft. Dependency discovery under the first-release OMP loader is resolved; the pi loader path, the precise composition of the reusable behavior library, and standalone generated artifact packaging remain deferred.
- For the first release, cross-behavior conflict rules are decided: exactly one rule per contribution slot, exactly one declared writer per State field, and one command name per extension; a conflict is an explicit configuration error handled fail-soft, and no behavior may be resolved implicitly by harness registration order. Composition and precedence among multiple rules per slot, multiple transitions triggered by one semantic event, and other multi-consumer cases remain deferred.
- For the first release, history preservation is enforced by restricting history-affecting writes to the framework's append-only contribution interface; request-only insertion, system-prefix treatment, and the precise shared-file coordination, failure, and freshness guarantees remain open or deferred. The scope of the history guarantee is framework-managed behavior; harness behavior and other extensions are excluded.

````

## .scratch/model-cost-migration/map.md

````markdown
# model-cost 完整迁移：通用能力分层与 OMP 适配

Labels: wayfinder:map

## Destination

逐项确认 model-cost 的完整需求、extension／framework 通用能力／harness adapter 的归属、能力契约、源码组织及验收标准，形成可直接实施的完整迁移规格。地图清晰后进入单独跟踪的实施，最终完成 OMP 上的迁移与验收；地图本身不承载生产实施。

## Notes

- 2026-10-09 用户确认：先决策，再完整实施；OMP 落地，业务逻辑与通用契约保持 harness-independent，不在本次实现 pi adapter。
- 用户确认以现有功能全量保留为讨论基线；逐项讨论后才允许有意删改。以实际代码、业务 ADR 和 glossary 为证，不把 README 当完整清单。
- 用户允许全新统计：不要求导入旧统计文件、延续旧统计基线或新旧文档读写兼容。保留旧数据、不自动删除或改写；新存储根目录、账户隔离、归档格式和正式切换另行决策。
- 用户确认按三层开票：model-cost 拥有业务规则；HTTP／文件及并发协调纳入 framework 通用能力；宿主事实与语义映射由 framework adapter 提供。具体接口并未确认；widget、命令和认证／代理的 seam 单独讨论。
- 现有 ADR-0002 的责任测试与 native import 边界继续约束本次设计。backlog 对 HTTP 曾持扩展自有方向，本次明确讨论升级为 framework 能力；最终决策须同步其唯一权威文档，不能并存两套政策。
- 2026-10-09 用户选择以旧实现“聚合为主”为基础，先检验具体极端场景，只有发现不能满足的必要场景才取舍是否升级。/tree 优先保证 Session 累计正常，历史 Turn 累计可能不可取得可以接受；最小 framework 能力由选定实现需要倒推，而非先造完整账本／框架接口。该局部取舍不自动取消其他功能，正式修订范围由当前数据决策记录。
- 2026-10-09 用户要求重新评估“按 Turn 记录”的成本收益：逐响应计价／累加、运行期关联与长期明细留存不是同一要求，不把完整逐 Turn 账本或准确性最大化作为默认迁移目标。数据讨论先用旧代码和实际场景验证最小必要记录粒度；此前决定可据此提出修订，但未确认的修订不改变当前有效契约；已确认修订按用户要求同步旧 Lighthouse 与决策票正文，修订前版本保留历史快照，不自动缩减其他功能。
- 2026-10-09 用户要求纠正讨论顺序：先用旧源码、具体数据结构和一条端到端数据流建立实现心智模型，再讨论逻辑／接口取舍；未说明数据在哪里、谁读写、何时持久化前，不泛问同步／异步。当前先做数据归属／寿命／查询，再做存储与协调，随后收口观察处理约束和刷新调度。装配草图可以提前作为讨论材料，最终装配规格仍在契约明确后收口。保持地图规划模式，可用隔离探针支持决定，不做生产迁移。
- 后续设计讨论遵循[Happy flow 优先的设计推进原则](lighthouse/03-observation-contract.md#happy-flow-优先的设计推进原则)：先建立原则，再在原则内推进具体设计，避免用假想极端组合反复推翻主线；确认来源与重审条件在该权威主题。
- 每次咨询 grilling、domain-modeling；设计接口咨询 codebase-design；决策落地依次使用 lighthouse、backtracer。HITL 决策须由用户确认。每次工作只解决一个非 research 决策票，chart 会话不关闭票。
- [现状调查与功能证据](assets/current-state.md) 是事实资产，不是已批准的契约。它也记录调查 smoke 的实际输出；远端余额／额度、动态 TUI、完整 OMP 原生链路均未在本次调查运行。
- 框架当前仅实现 OMP adapter，支持基线为 18.5.0；本机安装版本不等于支持基线。迁移验收版本是否改变必须显式决定。
- 子票存放于 decision/；按编号扫描 open、无未满足依赖、未认领的票选 frontier。开始工作前先写 Status: claimed 和 Assignee。开放票不在地图正文重复列出。
- [数据归属与账户周期决议](lighthouse/12-state-data-contract.md)已正式结案；最终取舍与历次暂停溯源只在 Lighthouse。后续按已定数据流推进存储与协调，再返回观察处理约束；不重问聚合／明细账、不恢复观察票旧 Q10，不把本票结案视为存储或原生观测已实现。继续工作时按 tracker 查询 frontier，或使用用户明确指定的票。

- 本轮[存储 schema](lighthouse/06-local-storage.md#q25consumptionjson-的物理-schema归档与版本)已最终确认并结案；Round 持久化与恢复取舍在[数据原主题](lighthouse/12-state-data-contract.md#最近-roundtree-与恢复展示)修订，首次 holiday 自动切周期在[命令原主题](lighthouse/07-command-state.md#holiday-与-clear当前入口适用条件)修订。[确认来源](assets/storage-schema-confirmation-2026-10-12.md)与[发布前历史](assets/storage-schema-before-publication-2026-10-12.md)可恢复；未实施生产迁移，其他存储协调原则保留。

- 本轮[展示确认与证据](assets/presentation-confirmation-2026-10-12.md)获 Q33 收口；[展示权威](lighthouse/08-presentation.md)与[装配](lighthouse/10-assembly-layout.md)／[模型计价](lighthouse/13-model-catalog-policy.md)部分结果分别持有政策。[发布前历史](assets/presentation-before-publication-2026-10-12.md)保留旧恢复点；跨票发布不认领或改变目标票体，不将无 UI 记账推成远端刷新获批，支持基线未变。

- 本轮[刷新生命周期](lighthouse/09-refresh-lifecycle.md)获整票确认并结案；[确认与实验限度](assets/refresh-confirmation-2026-10-12.md)、[发布前历史](assets/refresh-before-publication-2026-10-12.md)及[工作票 Handoff](decision/09-refresh-lifecycle.md#handoff)可恢复。新结果不改其他票的问题／claim，不把查询与边界探针当生产或多窗口问题已修复。

## Decisions so far

- [完整保留哪些业务行为，统计单位如何命名？](lighthouse/01-behavior-contract.md)： 保留请求锚价、公共 Turn／工具／Round 与 Codex 额度；当前基线消费 provider 单一统计范围、整文件 clear 与预算修改移除，不扩大所有 provider 展示。

- [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](lighthouse/02-accounting-ownership.md)： framework 每 provider 单账号；取消账号／凭据统计身份与自动替换隔离，按 provider 单一范围聚合；多 CLI 正常并发、去重与直接父 Session 汇总保留。

- [model-cost 的哪些数据进入 framework State，如何声明与读取？](lighthouse/12-state-data-contract.md)： Session 自身与父子关系持久化；Round 仅推断，正常连续对话可看上一 Round，resume/tree 只要求 Session 恢复；业务不升级 framework State。

- [framework 如何提供独立存储、原子更新与跨进程协调？](lighthouse/06-local-storage.md)： 已结案；harness 优先／Session 扁平 list／provider-model 自身桶、周期与快照版本、起止元数据；单活动 JSON／独立归档与 estimate，安全异步更新与失败政策保留。

- [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](lighthouse/03-observation-contract.md)：已按正常数据流、最小必要事实与异常基本原则收束；公共逻辑优先 framework、adapter 必要桥接，尽量统一 round_end；宿主可先 idle／接受新输入，公共 handler 等待自身异步保存，具体装配与生产验收仍未实施。

- [账户凭据、provider 地址和代理如何跨 seam 提供？](lighthouse/04-provider-access.md)： 按 framework 每 provider 单账号支持前提，adapter 提供当前认证确需资料／地址，不生成持久统计身份；业务查询留 shared logic，秘密不落盘。

- [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](lighthouse/05-http-capability.md)：已结案；直接导入单一 request、原生 response、共享代理配置与逐请求选择、业务优先的可配置有限超时；显式选代理缺配置失败，model-cost／connect-bot 统一传输，业务留 shared logic，不预建主动取消。

- [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](lighthouse/09-refresh-lifecycle.md)：已结案；CLI 单次两源预取，运行期 DeepSeek usage TTL／Codex headers，窗口独立与估计成对，无 UI 同后端、结束不等网络，单一 UI 边界 timer。

- [/budget 的参数、操作与状态如何在新框架表达？](lighthouse/07-command-state.md)： 已结案；actions 路由／等待／反馈，detail 入口偏好；holiday／clear 限当前 DeepSeek idle／保存收口，首次 holiday 自动完整归档并切新周期，已开启幂等；不把规划当生产实现。

- [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](lighthouse/08-presentation.md)：已确认旧视觉／共享后端与宿主前端、混范围 Total、静态 detail 树、子代理 brief 与轻量 Round；无 UI 记账和错误可见，远端调度只见刷新权威。

- [确定的新能力与 model-cost 如何组织、声明和装配？](lighthouse/10-assembly-layout.md)：部分确认扩展宿主专属实现、framework 当前查看会话与有效标记；完整接口、原生出口和装配仍未决。

- [官方计价与 token-only 模型名单如何确定、配置和维护？](lighthouse/13-model-catalog-policy.md)：已结案；官方两 ID／Go 五 ID、集中扩展谷价＋峰价系数、价格派生参考比例与 Codex 缺价退化；发现只辅助维护，历史金额不重算。

- [DeepSeek 模型发现 API 提供哪些资料，能否支持集中维护？](lighthouse/14-deepseek-model-discovery.md)：研究与真实鉴权发现已完成；当前两 ID、无价格字段，文档样例／接受别名／实际名单分别记录。

- [OpenCode Go 当前支持哪些模型及其精确 ID？](lighthouse/15-opencode-go-models.md)：研究与匿名发现已完成；独立 provider、38 个发现 ID／五个 DeepSeek ID，不把公开发现当账户调用认证。

- [观察契约的 Handoff](decision/03-observation-contract.md#handoff)记录本轮收束、证据限度及下游职责；不恢复异常情景树或父 Round 分配，不把规划结案／临时探针当生产实现。

## Not yet specified

- 原生宿主缺失尚未具体暴露的观测能力时，其降级／拒绝与诊断如何衔接，遇到具体路径再展开；账户访问的局部查询失败原则已由账户访问权威持有，提示承载由现有展示票决定，不在此重复开雾。
- 尚未暴露的非 HTTP 新增通用能力对 connect-bot 等既有消费者的影响，待具体能力出现后再判断。已经具体化的当前查看会话／有效标记公共能力与消费者隔离由[装配局部结果](lighthouse/10-assembly-layout.md)及其原 Question 承接，不在此重复作为 fog；其他未知复用影响保留。

## Out of scope

- framework 每 provider 多账号选择／轮换／管理、统计账号识别／持久化分区、账号替换自动隔离或重置、跨进程账号登记检测；支持范围与取舍见[消费归属的账户主题](lighthouse/02-accounting-ownership.md#账户隔离多会话与额度)；只有当前认证资料随宿主实际生效，不承诺替换统计隔离。

- 多台机器通过网络共享盘／云同步共同写入统计的正确性保证、分布式锁或同步冲突合并；[本地协调范围决议](lighthouse/06-local-storage.md)限定本机本地文件系统，不取消同机多进程安全共享。

- 实现或认证 pi adapter；只考虑契约是否把 OMP 原生细节泄漏给共享代码，不宣称 pi 能力对等。
- 导入旧统计、继续旧基线或要求新旧统计文档双向兼容；用户允许从空统计开始，旧数据保留。
- 图内执行生产迁移；决策规格完成后进入独立 implementation 工作流，整体迁移目标不取消。
- Codex 会话消耗与账户额度之间的转换或分摊；[消费归属决议](lighthouse/02-accounting-ownership.md)确认不做此换算，账户级双窗口／ratio／left 与参考费用继续保留。

````

## .scratch/model-cost-migration/decision/10-assembly-layout.md

````markdown
# 确定的新能力与 model-cost 如何组织、声明和装配？

Type: grilling
Status: claimed
Assignee: hugos（本会话 agent 协助讨论）
Blocked by: 03, 04, 05, 06, 07, 08, 09, 12, 13
Prerequisites: [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](05-http-capability.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)；[/budget 的参数、操作与状态如何在新框架表达？](07-command-state.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](08-presentation.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](09-refresh-lifecycle.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](13-model-catalog-policy.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Handoff

- 当前状态：open、未认领，保留全部原依赖；本次只同步存储票确认结果，不替本票做设计或解除依赖。
- 当前权威：[存储局部决议](../lighthouse/06-local-storage.md)、[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)、[消费归属决议](../lighthouse/02-accounting-ownership.md)与[行为契约决议](../lighthouse/01-behavior-contract.md)。已确认部分享其来源；本票只记录自身后果，下方历史未决标记不覆盖现行 Lighthouse。
- 本票后果：将 storageDir 的字段局部解析放在 model-cost 配置／装配入口，再把已解析路径交通用文件 module；不修改 framework 其他字段 ~ 语义，不硬编码 OMP 目录进通用文件 module。
- 仍待决定：依赖注入、模块组织与公共 exports、requiredSemantics／fail-soft、实例创建销毁及观察／恢复／入口绑定、单执行者检测归属、原生 import seam、消费者迁移、源 oracle revision 与依赖来源。前置接口尚未全部收口；装配草图可提前用于数据流讨论，最终规格仍须等前置。
- 最新路径输入：存储 Lighthouse Q17–Q20 已确认复用用户 .omp/cost-archive，切换前用户手动备份清空；storageDir 的 ~/ 特指用户 .omp 主目录，仅此字段例外，其余配置机制不变。固定文件组织已由[存储局部决议](../lighthouse/06-local-storage.md)Q21 确认：只配置根，根下 consumption.json、独立 codex-usage-estimate.json 与 archives/ 每次唯一归档；本票装配／验收采用该组织，不复用旧 deepseek-cost.json 或误清 estimate／旧归档。schema／平台锁／运行态仍等存储票，不将文件名确认视为完整存储已实现。
- 协调运行条件：采用[存储局部决议](../lighthouse/06-local-storage.md)Q22 的本机本地文件系统范围；装配不增分布式锁／云同步合并，验收证明已声明 Windows x64／Bun 基线上的同机跨进程正确性，不要求或宣称网络盘／跨机器写入或其他 OS 已认证。具体锁／读新鲜度仍待存储票；本范围不削弱同机多会话与账户隔离。
- 保存前置：以存储 Lighthouse 当前 Q5–Q15 为准，历史“失败保留内存／Q11 待澄清／Q10 预算未定／归档输入未定”已被后续结果替代；不恢复完整账本、补账、后台恢复或 clear 内存收集。原有理由、证据限制及未决问题保存在下方历史，读取历史应对照现行权威。
- 下一 ready 问题：等待当前记录的未满足前置，再按本票 Question 讨论；不在本次存储 claim 下代决本票。

## Question

将已确认契约映射到现有 framework core／behaviors／adapters 和 extensions/model-cost 的 definition／shared-logic／harnesses／entrypoint。是否需要新的通用能力目录或公共 authoring exports，如何保持原生 import 只在 adapter／extension harnesses？不得建立第二套能力声明、配置或框架。

确定 dependency injection、业务模块拆分、requiredSemantics 与 fail-soft binding、配置路径和消费者迁移职责，冻结源 oracle revision 与依赖来源。现有唯一 boolean State 不应被业务数据冒用。此票产出可实施组织规格，不复制代码、生成空文件或开始实现。


## Comments

以下为历史输入与证据，保留未决范围与当时理由；现行恢复点以 Handoff 与对应 Lighthouse 为准。

### 历史交接 from data Lighthouse

- [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)已明确 shared logic 拥有自身聚合／关系／当前最近轮／账户缓存，framework 激活 State 不作业务容器；UI 只读，native import 只走 adapter／harness seam，不建立第二套框架或配置。
- 运行期请求身份标记寿命绑定观察实例，detail 绑定交互入口；普通切换／tree 与重载／销毁不是同一边界。装配需说明实例创建、销毁、请求观察与业务数据恢复怎样绑定；具体接口未定。
- 不把所有业务数据塞进 State 或在装配层再实现计价／汇总；同 session 单执行者检测与拒绝仍是未决原生／通用协调问题。

### 历史讨论方式

本票的最终组织／装配规格仍在相关契约收口后决定；但旧源码到新模块的数据流与装配草图必须提前作为数据／State、存储和观察讨论的输入，不要求讨论者仅凭抽象接口选择方案。早期草图不是本票已结案或生产实施授权。

### 历史交接 from partial storage decision

[存储组织与唯一消费源局部决议](../lighthouse/06-local-storage.md)确认消费单活动 JSON、独立归档和独立 Codex estimate；Session 自身累计与最近轮快照来自同一聚合，round_end 同次保存。聚合／schema／保存模型属于 model-cost，framework 文件 module 仅提供安全更新，其他 extension 可采用不同模型。具体 schema、协调、保存完成／失败、clear 一致性仍待存储票，不把该局部结论视为整个依赖已满足或生产能力已实现。

### 历史交接 from storage Q6

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。

### 历史交接 from storage Q7

[存储局部决议](../lighthouse/06-local-storage.md)Q7 确认 framework 内部同文件轻量 Promise 尾链实现进程内提交顺序，失败后继续、空闲键清理、不同文件独立；跨进程互斥但不承诺全局 FIFO。不得复制到每个 extension，不引入持久任务队列或后台重试；具体锁、路径协调键、等待／取消及旧快照／周期校验仍由存储票决定。

### 历史交接 from storage Q8 / Q9

[存储局部决议](../lighthouse/06-local-storage.md)Q8／Q9 确认按负责的会话记录合并、账户周期／保存版本校验；framework 提供协调权限内最新文档和安全更新，extension 拥有业务有效性规则。排队／取锁有限等待预算合计，等待超时或取消后无迟到写入，更新开始后等待真实结果；具体预算、resume 版本、单执行者与 clear 一致性仍未决。

### 历史交接 from storage Q10 / Q12

[存储局部决议](../lighthouse/06-local-storage.md)确认 Q10 默认从提交起排队＋取锁合计 15 秒，调用方可覆盖，model-cost 暂用默认不增 YAML 项；Q12 同版本不同内容冲突拒绝并报告，不猜合并。Q11 用户提出理解核对，恢复版本接续仍待澄清，不因“同意”自行批准缺版本文档兼容或双执行者恢复。

### 历史交接 from storage Q11 confirmed

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。

### 历史交接 from revised failure policy

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。 业务失败初始化归 extension shared logic，不升级通用文件 module 为复杂恢复系统。

### 历史交接 from storage Q13 / Q14

[存储局部决议](../lighthouse/06-local-storage.md)Q13／Q14 已确认简化 clear 的归档先于活动原子重置，失败终止不补做；无有效基线暂停本实例消费统计／保存至下一次正常初始化，模型与独立余额／额度继续。extension shared logic 拥有失败政策，framework 拥有安全协调；归档输入／新周期运行态／锁与 schema 仍未定。

### 历史交接 from storage Q15

[存储局部决议](../lighthouse/06-local-storage.md)Q15 确认 clear 不增加跨进程内存收集、强制保存／排空或补账，业务归档输入仅锁内最新已保存活动文件。用户要求 clear 尽量简单；通用锁／安全发布仍归 framework，消费丢弃属于 extension shared logic，不用该偏好撤销正常多会话安全更新。


### 历史交接 from state-data discussion

- [数据讨论当前有效决定](12-state-data-contract.md)明确：本次特定的聚合、最近 Round 快照、数据寿命与统计 tradeoff 属于 model-cost shared logic，不提升为通用业务 State。
- Round、response／usage、实际会话及父子身份等宿主事实使用 harness-independent 接口，adapter 映射宿主，shared logic 不依赖 OMP 原生 context／payload；接入其他 harness 不重写该业务逻辑。本次仍只落地 OMP，不实现或认证 pi adapter。
- 业务数据的读写归 shared logic，UI 读取其只读视图，HTTP／文件与协调能力按地图既定 framework 分层承接；具体接口和模块组织仍由相关票收口。

### 历史交接 from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：支持同进程及跨进程多个独立 main、每个 session 单执行者；Owner State 与业务消费归属不同。
- 待决定：如何装配请求事实采集、扩展自有聚合／关系／最近快照、只读统计视图、账户解析、激活 State 和通用持久化协调；单执行者检测／拒绝由何层提供？不要在装配层重实现业务计价／聚合，也不要在 shared logic 引入 native 身份或锁。受影响既有消费者的生命周期能力仍按原 Notes 审查。


````

## .scratch/model-cost-migration/lighthouse/10-assembly-layout.md

````markdown
# 确定的新能力与 model-cost 如何组织、声明和装配？：Lighthouse

> Question and discussion: [确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)
>
> 部分发布：本轮只确认宿主专属实现层，以及当前查看 Session 的通用事实／有效激活标记归属。源票仍 open、未认领；其正文、依赖和未决范围不变。确认来源为[展示访谈的文件名定向确认](../assets/presentation-confirmation-2026-10-12.md) Q3／Q29；未实施生产能力。

## Question

如何组织扩展共享逻辑与各 harness 的不同实现，并在不泄漏原生依赖、不改记账／State Owner 的情况下支持当前查看会话？本局部结果不决定完整模块布局、公共 exports、实例装配或原生接线。

## Discussion

### 扩展的宿主专属实现层

扩展拥有必须按 harness 分别实现的部分；复用业务规则与纯展示计算放 shared logic，宿主原生 UI、主题、布局及必要专有集成放该扩展的宿主专属实现。widget 是明确实例，不把扩展专有组件整体升级为 framework 公用 UI 系统。

framework／adapter 负责根据当前 harness 选择并接入扩展提供的对应实现。具体实现声明、选择方式、实例创建／销毁及文件布局尚未定；不默认运行时 autodetect、自动加载全部分支或第二套注册机制。framework 不依赖个别扩展的业务实现，由装配提供所需实现与依赖。

目的：宿主接口变更影响对应桥接与专属实现，不要求修改整个 extension；共享契约真的改变时仍可修改 shared logic，不承诺任何宿主变更都绝不影响共享契约。

遵守 [ADR-0002 的责任测试与原生 import seam](../../../docs/adr/0002-semantic-extension-framework.md#responsibility-test-for-harness-differences)：framework 自有语义仍由 core／behaviors 与 adapter 分工；扩展宿主实现仍属于扩展，原生访问只在既有 adapter／extension harnesses 位置。本轮认可职责层，不批准扩大 native allow-list 或另开任意 native 目录。

### 当前查看 Session 的通用事实与状态投影

framework 提供宿主无关、只读的当前查看 Session 身份、当前模型、实际 Effort、上下文事实，以及查看切换语义；adapter 映射原生事实与信号，不透传整个宿主 context。这是公共查看能力，不把 model-cost 消费字段纳入 framework 业务 State。

统一 Marker area 按当前查看 Session 的有效 State 投影各扩展激活标记，复用已定 follow／none 继承规则；不是直接复制主会话全部 markers，不额外创建 model-cost 标记系统。查看只改变 UI 目标，不改变记账身份、State Owner、继承值或 owner-scoped 外部效果。各扩展声明及 State 仍是唯一激活来源。

具体接口、订阅／取消、事实不可取得、旧 owner gate 收口、marker 实例与 focused 状态刷新接线、源 oracle 和支持版本仍由本票收口。不能仅添加 TypeScript interface 就假定 OMP 原生可取得事实。本轮允许按需补齐公共能力，但不默认批准访问宿主私有字段、不猜 UI 文字、不静默升级基线；若需要宿主公开出口改动，具体路线与版本仍待核验。

本轮证据与限制见[确认资产](../assets/presentation-confirmation-2026-10-12.md)：OMP 内部 viewSession 与 main 分开；已检查的公开扩展 context 不暴露焦点；真实 focus 控制器的隔离探针仅在安装版 18.9.2、fixture Session／UI 下运行，不是新 framework 或 18.5.0 验收。

### 尚未决定

保留源票全部未决问题：依赖注入、目录与 exports、requiredSemantics／fail-soft、公共实例生命周期、逐会话观察、当前查看事实的可支持原生出口、消费者迁移、oracle revision、依赖来源与验收版本。当前公共模型价格事实消费[观察权威](03-observation-contract.md)与[计价来源局部权威](13-model-catalog-policy.md)，不在此再决定模型名单。

## Decision

确认扩展拥有宿主专属实现、shared logic 拥有复用业务及纯展示逻辑；当前查看 Session 与有效 State 标记投影属于 framework 公共能力、原生映射属于 adapter。完整装配与原生路线仍未决，源票保持 open。

## User stories

1. As a 维护者, I want 宿主专属实现与共享业务分离, so that 宿主改动集中在桥接与专属实现而不牵动整个扩展。
2. As a 用户, I want 通用当前查看会话事实与有效激活标记, so that 在 Hub 查看子代理时不会看到主会话的 Effort／上下文或错误的扩展开关。
3. As a 扩展作者, I want framework 能力通过公共接口取得, so that shared logic 不直接依赖原生 context 或各自重写焦点与 State 规则。

## Preconditions

- [观察契约](03-observation-contract.md)提供逐实际 Session 身份与必要模型／上下文事实；已批准不等于已实现。
- [展示权威](08-presentation.md)定义 widget 数据范围与主／子视图；framework 不复制业务统计。
- 现有 State 继承、Marker area 和 [ADR-0002](../../../docs/adr/0002-semantic-extension-framework.md)约束 owner、native seam 和框架依赖方向。
- 当前 OMP 的可靠公开出口、版本支持、焦点信号与 marker 重绘还需本票具体核验。

## Postconditions

- 后续装配在此职责层内设计，不抽通用复杂 widget、不把计价移入 framework，不创建第二套 native seam。
- 不把“当前查看会话”当命令执行会话或记账所属会话；焦点切换不重置业务状态。
- 源票的正文、status、assignee 与其他未决范围不变；部分确认只在此 authority。

## Invariants

- 遵守 ADR-0002 responsibility test：native access 仅 framework/adapters 与 extension harnesses；framework 不依赖具体扩展业务。
- State 与 Marker area 复用原 Owner／follow／none 语义，查看投影不授予写权限或触发 connect-bot 等 owner 外部效果。
- 组件实现差异不自动决定语义归属；可统一的 framework 语义不复制到每个 adapter／extension。
- 18.9.2 隔离探针不改变已声明 18.5.0 基线，不认证 pi，不实施生产能力。

````

## framework/docs/harness-support.md

````markdown
# Harness version and compatibility baseline

Recorded: 2026-10-03; aligned with the first-release decisions on 2026-10-07 (see [contract](../../.scratch/connect-bot-migration/contract.md)); the four-state support record, the upgrade standard and the upgrade runbook were completed on 2026-10-07 (ticket 14). This is the single authority for harness/package version compatibility, not a claim that the in-repository harness framework or certified adapters already exist. Exact versions below record observations; the first-release admission policy is decided: an exact supported-version enumeration, an unlisted version warned about once per main session and then allowed to continue, and a missing required semantic rejected **fail-soft** (reported on a non-model channel, not bound, no partial registration, harness continues; never silently weakened).

## Harness targets and evidence

| Harness | Package | Source version / checkout | Observed installed harness | Evidence status |
| --- | --- | --- | --- | --- |
| pi | `@earendil-works/pi-coding-agent` | 1.0.0; `a276dabe57911253350bffb93cb7d7aff6a73261` | `pi --version`: `1.0.0` | Source inspected; isolated RPC and local OpenAI-compatible request smoke performed. **Not part of the first release**: no pi adapter is implemented or certified; this evidence is retained for a later pi adapter. |
| oh-my-pi | `@oh-my-pi/pi-coding-agent` | 18.5.0; `9348320cc4a30a7195d36a1f05a6c11bcb701a17` | observed installs: `omp/18.4.6` (design time), `18.6.1` (later) | **First-release supported baseline: 18.5.0 (checkout `@9348320`) + Windows x64 + Bun 1.4.2.** Decision 03 runtime-exercised the extension-path behaviors on an isolated exact install of `@18.5.0`. Installed versions outside the enumeration are `verified-unlisted` examples: warn once per main session, then continue. |

Sources: the respective `packages/coding-agent/package.json` files, source-checkout `git log -1`, and direct executable version checks. Checking an executable version is not functional validation. Decision 03 subsequently runtime-exercised OMP 18.5.0 through the extension interface on an isolated exact install; that is the runtime evidence behind the first-release baseline, and it does not certify other versions or provider paths.

### Fixed verification baseline and dock

The single checkable record of *what* runs acceptance, and of the source combination it is pinned to, is [`harness-baseline.json`](harness-baseline.json): the revision anchor (local checkout `@9348320` = 18.5.0), the run/acceptance artifact (isolated exact install `@oh-my-pi/pi-coding-agent@18.5.0` with the byte-identity conclusion reused from decision 03), and the dependency lockfiles of this repository and of the `my-omp-toolkit` behavior oracle. Support status stays in this document; the record only holds that correspondence, and everything in it is re-checked rather than restated.

Runs execute through the dock in [`tests/harness-dock/`](../../tests/harness-dock/index.ts):

- `cd <repo> && bun install` (once) then `bun test tests/harness-dock`; the isolated install lands in the gitignored `.cache/omp-baseline/<version>` prefix and is reused.
- The version under test is the recorded supported version by default; `OMP_TEST_VERSION=<v>` selects a candidate, which materialises into its own prefix (`.cache/omp-baseline/<v>`) instead of reusing or overwriting the fixed one.
- The dock materialises the recorded install, starts a controlled session (`--mode rpc --no-extensions -e <extension path>`), executes commands and turns, reads the session JSONL back, captures full outbound request JSON at a local capture endpoint, captures stderr, and reports argv/run root/stderr/frame tail when a run fails.
- Every run uses a temporary agent state directory, session directory, working directory and capture directory under the OS temp root. The environment is stripped of resolution offsets (`OMP_PROFILE`, `PI_PROFILE`, `OMPCODE`, `PI_CONFIG_FILES`, `XDG_*`, `PI_CODING_AGENT_DIR`, `OMP_AUTH_BROKER_*`) and `PI_CODING_AGENT_DIR` is pointed at that temporary directory, so the default global install, formal configuration and any running agent are untouched.
- The local checkout is a source/revision anchor only: it cannot run a full session because its native addon is not built, and acceptance never builds natives. The install ships prebuilt win32-x64 natives.
- The harness materialises its session file lazily, so JSONL read-back happens after a turn and a graceful exit (`stop()` closes stdin and waits for exit code 0); a command-only session may leave nothing on disk.

## Support record (four states)

Every support statement in this document uses one of four states, and each row carries its evidence, its conditions and its upgrade standard. A state is never upgraded by a passing run: a pass is an alarm or an input, and the transition is always a maintainer decision based on the evidence named in the row. The single checkable correspondence behind the `verified-supported` row — the revision anchor, the artifact that actually runs, and the dependency lockfiles — is data in [`harness-baseline.json`](harness-baseline.json), re-checked by `tests/harness-dock/baseline.test.ts`; this document remains the authority for the *status*.

| State | Combination or path | Evidence | Conditions | Upgrade standard |
| --- | --- | --- | --- | --- |
| `verified-supported` | `@oh-my-pi/pi-coding-agent@18.5.0`, checkout `@9348320` + Windows x64 + Bun 1.4.2 | Decision 03 runtime-exercised the extension path on an isolated exact install (byte identity with the anchor `6/6`, re-checked by the baseline record); the migration suites then ran green on that same isolated install — framework 234 pass, codebase-tools 24 pass, connect-bot 103 pass, dock 9 pass ([migration run record](../../.scratch/connect-bot-migration/run-record.md) §6 RR-01, which records that run's revision and lockfile) | Exactly this combination; verified provider paths only (`deepseek/deepseek-flash` → `openai-completions`; `openai-codex/gpt-6-luna` → `openai-codex-responses`, shape-only layer 1); every run executes the isolated exact install under a temporary agent state | Framework capabilities only (C1–C15), by isolated candidate verification (see [Upgrade standard and triggering](#upgrade-standard-and-triggering)). No extension capability is part of the long-term standard |
| `verified-unlisted` | Any other installed version the harness reports (observed: `omp/18.4.6` at design time, `18.6.1` later) | Installation observation only; no behavior exercised on that version | Warned once per main session, then continues **without** a support claim; never treated as evidence for any capability | Same candidate verification path; a pass there still does not promote the version |
| `unverified` | openai-codex layer-2 real-credential delivery; interactive TUI visual acceptance; every provider path not listed above (including pi) | Dock prepared but not executed (`scripts/capture-codex-outbound.ts`, layer 2); TUI acceptance not performed; a local capture endpoint proves serialization only, never real-service acceptance | Recorded as unverified, never as passing; no inference from a verified path; the ready-to-run steps are in the [README human acceptance runbook](../README.md#human-acceptance-and-cutover) | Not a candidate path: it becomes evidence only when a human supplies the credential or performs the acceptance |
| `unsupported` | pi adapter (the first release ships none); two main sessions in one process; hot reload or in-process discovery-root swap | The framework suite asserts the supported shape only; the multi-main shape has no test, and a green suite for the supported shape says nothing about it | States that the framework integration is not provided — not that the harness lacks the native feature | Revisit only through an explicit decision, not through a test run |

The `verified-supported` row also fixes *what runs*: the revision anchor is the local checkout `@9348320` (= 18.5.0), and the run/acceptance artifact is the isolated exact install at `.cache/omp-baseline/18.5.0` (replaying decision 03's byte-identity conclusion). That correspondence — `harness.revisionAnchor` ↔ `harness.acceptanceArtifact` ↔ the `sourceCombination`/`oracle` lockfiles — is recorded as data in [`harness-baseline.json`](harness-baseline.json), not restated here. Role evidence per provider path has its own table above and keeps its own states ([provider-path role evidence](#provider-path-role-evidence-recorded-facts-not-a-gate)).

## Upgrade standard and triggering

**Scope — framework capabilities only.** The long-term upgrade standard covers the framework capabilities C1–C15 as exercised by [`tests/framework/`](../../tests/framework). Extension capabilities are deliberately **outside** it: an extension's own behavior is covered by [`tests/codebase-tools/`](../../tests/codebase-tools), which runs permanently against the fixed supported version, plus the human user acceptance at the end of development. A green framework alarm says nothing about an extension.

**Trigger — on demand only.** Another version is verified only when a maintainer proposes a candidate. Default and CI always run the fixed supported version (`18.5.0`); a scheduled or CI candidate run is explicitly rejected.

**Basic verification (regression alarm) — P34.** `OMP_TEST_VERSION=<v>` selects a candidate. The dock installs that exact version into its own isolated prefix `.cache/omp-baseline/<v>` and runs the framework suite against it; [`scripts/verify-omp-candidate.ts`](../../scripts/verify-omp-candidate.ts) performs the install, runs the suite and writes a checkable result record to `.cache/omp-baseline/<v>/candidate-verification.json` — a local, gitignored artifact next to that install, evidence for the maintainer's decision and never a committed support claim. The runbook with the exact commands is in the [README](../README.md#upgrading-the-supported-harness).

**Extension regression.** `bun test tests/codebase-tools` runs permanently against the fixed supported version; it is not part of the candidate alarm.

**Human TUI spot check (trigger).** When the upgrade touches an **extension-visible surface** — marker rendering, the command, contribution order or role, session resume — the maintainer appends one human interactive TUI spot check to the candidate suite. When it does not, the candidate suite alone is the alarm.

**Explicit replacement — never automatic.** A green candidate suite (plus the spot check where it is triggered) is maintainer input, not a decision. Replacing the supported version is one explicit maintainer action: change `SUPPORTED_HARNESS_VERSIONS` in [`framework/core/baseline.ts`](../core/baseline.ts) — the framework-owned baseline, since version support is the framework's and no extension assembly declares a version list — update this support record and refresh [`harness-baseline.json`](harness-baseline.json), then restart the harness. That list stays exactly `["18.5.0"]` until that action is taken.

**Isolation conditions.** Candidate work never touches the default global install, the formal configuration, or a running agent: installation is confined to `.cache/omp-baseline/<version>` (gitignored), every controlled session runs the isolated install under a temporary agent state directory, and the dock strips the resolution offsets (`OMP_PROFILE`, `PI_PROFILE`, `OMPCODE`, `PI_CONFIG_FILES`, `XDG_*`, `PI_CODING_AGENT_DIR`, `OMP_AUTH_BROKER_*`) before starting one.

## Shared-source deployment prerequisite

The framework lives once in `my-agent-toolkit/framework/`; extensions import that source directly instead of depending on a separately published framework package. The first release configures only OMP to scan `entrypoints/omp/`; the pi discovery root is deferred with the pi adapter. The OMP root contains independent thin extension entrypoints importing implementations under `extensions/`, which in turn use the shared framework source. The implementation and framework directories are not extension discovery roots.

Before claiming this deployment works, exercise the actual installed OMP loader with an entrypoint importing TypeScript outside its discovery root. Decision 03 verified source/dependency resolution, independent extension discovery, and Markdown text import on OMP 18.5.0; the pi loader remains deferred and unverified. **That loader smoke is automated**: the migration's loader/admission step (L2) is no longer a separate manual step. `tests/framework/deployment.test.ts` runs the isolated install's own loader against this repository's layout — the configured root's discovery, each thin entrypoint loaded alone and together (its shared source and Markdown text resolving with 0 errors), both extensions binding (connect-bot's binding included, which is where its declared `extensions/connect-bot/config.yaml` is read and validated), and the same-named pair that load-source mutual exclusion keeps apart — and it remains the automation precondition of the human acceptance round.

An extension's declared configuration file is resolved against the **extension repository root its assembly supplies** — the convention path `extensions/<id>/config.yaml`, overridable through `config.path` — so a run that expects connect-bot to load needs no particular working directory. Connect-bot's OMP assembly derives its repository root from its own module location (`import.meta.url` under `extensions/connect-bot/harnesses/`) and hands the framework that directory as plain data, which is what lets the same load bind from a user's project directory as from this repository. A relative declaration with no directory supplied — an assembly that names none — resolves against the process working directory, the behavior the framework had before that seam existed; an absolute `config.path` is used as declared either way. Record the tested repository revision, dependency lockfile, and harness versions instead of an independently released framework version. Simultaneous activation of an extension's original and replacement is prevented by load-source mutual exclusion (an explicit-only root during development/acceptance, and removal of the superseded implementation before the permanent cutover).

Source co-location supports direct editing and debugging but does not establish hot reload or breakpoint mapping. The first release promises only whole-process restart; hot reload is deferred, so verification of reload/cache visibility is deferred with it. One source tree does not create shared in-memory State across harness processes. These are deployment prerequisites, not a claim that the source layout or framework has been implemented.

### Load-source mutual exclusion

One extension's original and replacement implementations must never be discovered into the same process. The mechanism is **load-source mutual exclusion**, and the alternatives are rejected on the fixed baseline:

- **Name deduplication — rejected.** `discoverExtensionPaths` does not deduplicate by extension name: pointing discovery at both the original and the replacement returns both paths, each carrying the extension name (`codebase-tools`, and `connect-bot` for the second extension's pair), and binding that set binds both factories. Name matching therefore cannot keep them apart, and nothing relies on it.
- **`disabledExtensions` — rejected.** It matches `extension-module:<name>`, so disabling the one extension name would disable the replacement as well.
- **Harness identity probing — rejected.** No source, path, or identity probe runs at load; the loader does not distinguish implementations with the same name.

What is used instead: development and acceptance run explicit-only (`--no-extensions -e <repo>/entrypoints/omp` with a temporary agent state directory), and the permanent cutover — performed by the user only after acceptance — removes the superseded implementation *and* adds the new discovery root before restarting. Until that cutover the original implementation keeps its own discovery entry, so the two never meet in one load set. Such a run needs no particular working directory: connect-bot's declared configuration file resolves against the repository root its assembly derives from its own module location, whatever `--cwd` names. `tests/framework/deployment.test.ts` starts the real CLI with `--cwd` in a directory outside this repository — carrying no `extensions/connect-bot/` in one run and a decoy file at the convention path in another — and observes the extension register its command either way.

**Only a whole-process restart takes effect.** The discovery root is not swapped inside a running process, extension module caching/reload is not a switching mechanism, and the first release promises no hot reload. The tested deployment seam (discovery, out-of-directory imports, each extension's binding, mutual exclusion) is recorded in the framework suite at `tests/framework/deployment.test.ts`, against the isolated install.

## Investigated common behavior candidates

| Contract area | pi evidence | OMP evidence | Current limitation |
| --- | --- | --- | --- |
| Current system-prompt contribution | Source and actual local request capture | Source | First release: contribution is a persisted hidden custom message appended at the tail, with the OMP provider mapping recorded per path (decision 05). Cross-harness prefix stability remains open. |
| Persisted hidden custom messages | RPC/request smoke plus disk history inspection | Source | Resolved for the first release as a harness-qualified capability: the OMP adapter records the serialized role and codebase-tools accepts the recorded role on the verified paths (`user` on `deepseek/openai-completions`, `developer` on the shape-only `openai-codex/openai-codex-responses` capture — see [provider-path role evidence](#provider-path-role-evidence-recorded-facts-not-a-gate)); no universal developer authority is promised, and the role is not a gate (decision 05). |
| Conditional and mode-change contribution | Actual pi pipeline smoke; readonly-mode state logic exercised separately | Source | Decided for the first release: one agent-run initiation per user turn, branch-derived injection progress, and a State + branch pure decision (decisions 01/04/05). |
| Filtering own contributed context | Actual outgoing request and unchanged disk history observed | Source | Changes the request prefix despite not deleting disk history; incompatible with stronger request-prefix preservation. Deferred beyond the first release. |
| Universal developer-role conversation injection | Not established; installed custom-message path produces user messages | Not established across provider protocols | Cannot advertise as an unconditional common behavior; recorded as a harness-qualified capability per provider path. |

Detailed source references and exercised scenarios: [prompt-injection research](research/prompt-injection-research.md). The first-release timing, placement, retention, and role contracts are recorded in decisions 01/05; this table remains the investigation index, not the current contract.

### Provider-path role evidence (recorded facts, not a gate)

The delivered role of a persisted injected prompt is recorded from the harness's own outbound request on each verified path. It is a fact about that path, never an activation, admission or refusal condition: nothing in the framework reads it, and an untested path is `unverified` rather than inferred from the paths below. Evidence type stays explicit — a local capture endpoint proves serialization only, never that a real service accepts it.

| Path (api) | Recorded delivery | Role | Evidence |
| --- | --- | --- | --- |
| `deepseek/deepseek-flash` (`openai-completions`) | One message, appended after the turn's own user message and last in the request; the system message does not carry the injected text | `user` | Real outbound capture through the real catalog model and its api adapter, with a local capture endpoint standing in for the real service: `tests/codebase-tools/outbound-role.test.ts`, raw body in [`.scratch/.../assets/11/captures/deepseek/`](../../.scratch/codebase-tools-omp-v1/assets/11/captures/deepseek) |
| `openai-codex/gpt-6-luna` (`openai-codex-responses`) | One `input` item appended after the turn's own user item and last in the array; the system prompt travels in `instructions` and does not carry the injected text | `developer` (input item) | **Shape-only layer 1** — local probe, same capture and suite; the Codex serializer preserves the `developer` slot the harness's LLM view gives a persisted custom message, unlike the shared Responses conversion, which folds user/developer into `user`. Whether chatgpt.com accepts it (and whether a `developer` item mid-conversation is valid) is **not** established |
| every other provider path (including pi) | — | `unverified` / undecided | Not recorded. Other harnesses' role and authority semantics stay **undecided**, and no cross-harness developer-authority guarantee is claimed |

Two observations that the record depends on, both reproducible with the probe under `.scratch/codebase-tools-omp-v1/assets/11/probes/role-capture.ts`:

- A harness `registerProvider` `baseUrl` override does **not** reach the model a session runs: `--model <provider>/<id>` is resolved while the harness boots, before extensions load. The override has to sit in the isolated `models.yml` (see `tests/harness-dock/agent-config.ts`), which the model registry reads at construction.
- The Codex path only becomes observable as a captured body when the transport is pinned to SSE (`providers.openaiWebsockets: "off"`): the catalog model prefers websockets, and `PI_REQ_DEBUG` records HTTP requests. WebSocket frames are therefore **not independently observed**; layer 2 records SSE.

Layer 2 (real credential delivery) is prepared but not executed: `scripts/capture-codex-outbound.ts --prepare` writes the isolated settings and prints the exact wizard steps (`PI_CODING_AGENT_DIR=<isolated agent state> bun <isolated 18.5.0 cli> login openai-codex`, or `... auth-broker import` for a credential the broker already holds; the credential lands in that directory's `agent.db` and never enters a prompt). `--run` then performs one real `openai-codex/gpt-6-luna` turn through the pinned isolated install with `PI_REQ_DEBUG=1` and reports the recorded request bodies. Until a human supplies credentials and runs it, the real round trip stays `unverified` — it is not a blocker and not an automatic certification; ticket 15 supplies the capture, and the [support record](#support-record-four-states) states the resulting status (currently `unverified`).

## Harness-qualified capability: subagent State inheritance

Decided on 2026-10-04, aligned with decisions 03/04 on 2026-10-07 and with the per-field State lifecycle of decision 02 on 2026-10-07; the decided contract is implemented in the first release, and coverage of the exercised shape is not a certification of native behavior outside it. Inheritance is a per-field axis: the default `none` makes a subagent read the field's declared default, and a field that declares `follow` makes it read the owning main session's current activation value live. The first release implements exactly that following for the field that opts in — codebase-tools declares `follow` — with independent branch-derived injection progress in each session. Other inheritance strategies are deferred until there is a concrete need.

| Harness path | First-release scope |
| --- | --- |
| OMP built-in subagent path | **Targeted for the first release.** Decision 03 runtime-exercised the built-in subagent path (identity, factory rebinding, inheritance, independent init); decision 04 decided the owner contract (nearest main ancestor, `parentId` + `AgentRegistry`, live following), which decision 02 made per-field and opt-in (`follow`). The first release now implements that resolution and the read-only following for a field that declares `follow`, exercised against this path; the multi-main disambiguation stays deferred (see the limitation below). |
| pi | **Deferred.** The first release ships no pi adapter, so pi subagent State inheritance is unimplemented; no pi subagent implementation is selected or integrated. |

This does not declare pi incapable of running subagents. It limits the framework's supported integration paths. Extension loading, State inheritance, and MCP availability are separate concerns. The framework owns the State contract and its harness mapping, not a replacement subagent scheduler or MCP implementation.

A future pi adapter may explicitly accept codebase-tools operating in a pi session without inheritance, subject to its other required contracts; the first release ships no pi adapter, so this is a deferred policy rather than first-release behavior. When implemented, notify the user once at the extension's first activation in that session that the framework will not propagate its activation to subagents; the notification transport is the extension UI notification channel (a stderr line when no UI is available) and the notice is never inserted into model instructions or conversation history. This is not a general permission to ignore missing required capabilities, and required role and insertion semantics are not relaxed.

### First-release limitation: one main session per process

Owner resolution walks the harness's own facts — `ctx.agent.parentId` plus the injected `AgentRegistry` — up the parent chain to the nearest top-level main session, so a subagent follows the value its owner holds *now*, read-only, level by level through nesting, and resolves to nothing when that chain leaves the process. That resolution is unambiguous only while one main session exists in the process.

Two main sessions in one process — an ACP/cmux/embedded host, or a subagent that outlives `/new` — are **not supported** in the first release: the registry then holds more than one main agent, and a resolution may name the wrong owner. This is a recorded limitation and explicitly **not** a passing result: no test in this repository asserts behaviour for that shape, and a green suite for the supported shape says nothing about it. Disambiguation (a parent-side `spawnKey → ownerKey` edge recorded at `before_subagent_spawn`) remains on the [backlog](semantic-extension-framework-backlog.md).

When no owner resolves at all, the affected session stays off, its activation cannot be toggled, and the adapter reports that once per binding on the non-model channel (stderr when the session has no UI). That notice is best-effort and is neither the version-admission nor the required-semantics refusal channel: the extension stays bound either way.

### Subagent mechanism evidence and its limits

Source observations checked on 2026-10-04 against the local checkouts; these do not certify installed-harness behavior:

- **OMP rebinding is not business State copying.** [`bindExtension`](../../../oh-my-pi/packages/coding-agent/src/extensibility/extensions/loader.ts#L439) creates an extension/API binding and runs the prepared factory; [`bindPreparedExtensions`](../../../oh-my-pi/packages/coding-agent/src/extensibility/extensions/loader.ts#L491) creates a new harness for the binding set. OMP's [extension guidance](../../../oh-my-pi/docs/extensions.md#L1048) explicitly says module globals are shared by parent/child bindings, while session-specific state belongs in the factory closure or persisted session entries. This explains how shared activation and independent injection progress can coexist; it does not define arbitrary extension State inheritance.
- **Use identity, not depth alone.** [`ExtensionAgentIdentity`](../../../oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts#L464) provides `kind: "main" | "sub"`, `id`, `name`, `depth`, and optional `parentId`. Its comments explicitly allow subagents at depth zero. Mapping this identity to a State owner still belongs to the framework adapter; a process-global variable does not encode that relationship.
- **The ordinary pi subagent example has a different process boundary.** The [example's arguments](../../../pi/packages/coding-agent/examples/extensions/subagent/index.ts#L300) include `--mode json -p --no-session`, and it [spawns a separate process](../../../pi/packages/coding-agent/examples/extensions/subagent/index.ts#L346). The example's process cannot inherit the parent's JavaScript module variable merely by importing the same source. This observation concerns that example, not every possible pi subagent implementation.
- **Do not conflate pi's experimental durable path with ordinary extensions.** The [durable harness](../../../pi/packages/durable/README.md#L3) is explicitly experimental. Its [subagent implementation](../../../pi/packages/coding-agent/src/experimental/durable/subagent.ts#L34) creates a task-owned child conversation through durable interfaces. It is a distinct possible integration path, not evidence that a pi adapter supports inheritance (the first release ships no pi adapter).

### codebase-tools extension-logic probe

During this design discussion, a throwaway Bun probe imported the actual [`codebase-tools` extension factory](../../../my-omp-toolkit/extensions/codebase-tools/index.ts#L45) and `__resetCodebaseToolsForTests`. It supplied minimal harness substitutes for hook/command registration, session entries, agent identity (`"main"` / `"sub"`), and UI calls. It invoked both factories and their `session_start` handlers while activation was off, then invoked the main command and child `before_agent_start` handlers in this order:

| Step | Observed child result |
| --- | --- |
| Child turn before main activation | No contributed message |
| Main toggles on; the already-created child runs | `codebase-tools:init` |
| Same child runs again | `codebase-tools:reminder` |
| Main toggles off; same child runs | No contributed message |

The process exited with code 0 and no stderr. The child substitute recorded one non-LLM state entry containing `{ on: true, initInjected: true }` for the **original** implementation. The observed stop after main deactivation comes from reading `globalOn` on the next hook call, not from replacing that child entry. The probe established live following rather than a creation-time snapshot, and separately maintained child injection progress, for the existing extension logic. The replacement does not preserve this contract: it persists only `{enabled}` and derives injection progress from the branch (decision 05), and persistence compatibility is abandoned in both directions.

This was **not** a real OMP task spawn or a pi subprocess test. It does not verify native loader behavior, real session persistence/resume, provider message roles, MCP availability, multi-owner isolation, parent disappearance, or future framework behavior. The probe ran directly from an inline script and left no probe file. Framework implementation must replace accidental process-global ownership with an explicit owner relationship; decision 03 later exercised the real OMP extension path and decision 04 decided the owner contract. The replacement now resolves an owner through the harness's own registry and follows it read-only, covered by the framework suite at the adapter seam and by the extension suite against the real built-in subagent path; the multi-main disambiguation stays open, and human TUI acceptance remains separate.

## Capability-difference register

Use this register as the single index of harness differences relevant to framework consumers, not as an exhaustive catalog of native features or a new harness policy engine. The record shape is uniform; each feature retains its own semantic contract and implementation strategy. Record the capability/effect, applicable harness path and conditions, framework policy, implementation owner, and evidence/open work. Stable identifiers below are documentation keys, not finalized harness API names.

Keep three dimensions separate: native mechanism availability, framework integration support, and verification evidence. `Uninvestigated`, `not integrated`, and `unavailable` are not interchangeable. A similarly named native feature does not establish semantic equivalence. Required versus optional is an extension's dependency on a capability, not a universal property of that capability.

| ID / capability | pi conditions | OMP conditions | Strategy / decision status | Implementation owner | Evidence / open work |
| --- | --- | --- | --- | --- | --- |
| `state.subagent-follow` — live activation following for a field that declares `follow` (`none` is the default, so a subagent otherwise reads the declared default); independent session injection progress | No pi adapter in the first release; no subagent integration | Built-in subagent path (the exercised shape) | **Decided (02/04); implemented:** the OMP built-in path is the exercised one; owner contract from decision 04, made per-field and opt-in by decision 02. The pi path is deferred with the pi adapter; a future pi adapter may accept operation without inheritance once notified. Not a blanket fallback for other extensions. | Framework State and harness adapters; extension declares its use | Harness path exercised in decision 03; owner contract decided in 04; resolution and read-only following implemented, verified at the adapter seam and against the real built-in path; multi-main disambiguation unsupported and deferred (see the limitation above) |
| `context.required-role` — required instruction authority | Existing custom-message path does not establish developer authority | Intermediate developer role does not guarantee final provider role | **Harness-qualified:** no cross-harness developer-authority guarantee. The OMP adapter records the provider's serialized role for persisted contributions; codebase-tools accepts the recorded role on each verified path — `user` on `deepseek/deepseek-flash` (`openai-completions`) and `developer` on `openai-codex/gpt-6-luna` (`openai-codex-responses`, shape-only layer 1, see [provider-path role evidence](#provider-path-role-evidence-recorded-facts-not-a-gate)). The role is recorded as a fact and is never an activation or refusal condition. Other harnesses/extensions' required-role semantics remain undecided. | Harness/provider mapping, recorded per path; ADR 0002 owns the OMP exception | [Prompt research](research/prompt-injection-research.md); [ADR 0002](../../docs/adr/0002-semantic-extension-framework.md#history-preservation-and-execution-frequency) owns the contribution/role decision; deepseek role verified, openai-codex layer 1 shape-only and layer 2 real-credential per decision 08 (unverified if unavailable) |
| `ui.native-presentation` — complex native presentation, including footer replacement | Interactive footer replacement has an implementation | Inspected interactive `setFooter` / `setHeader` bindings are no-ops | **Accepted scope:** complex layout remains extension-owned; native presentation is not promised as a universal framework capability. Exact alternate presentations are extension-specific decisions. | Extension's harness-specific presentation code | [pi footer implementation](../../../pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2486), [OMP UI bindings](../../../oh-my-pi/packages/coding-agent/src/modes/controllers/extension-ui-controller.ts#L124); source-only observations, no TUI runtime validation |
| `execution.mcp-access` — MCP availability in the relevant execution scope | No pi adapter in the first release | Session creation gates MCP with `restrictToolNames` and `enableMCP` | **Deferred beyond the first release:** keep MCP availability separate from State inheritance. The first release does not handle an MCP dependency; codebase-tools deliberately does not split its prompt by MCP/LSP capability. | Harness owns MCP; framework handling of any declared dependency remains to be designed | [OMP creation condition](../../../oh-my-pi/packages/coding-agent/src/sdk.ts#L2404), [codebase-tools ADR](../../../my-omp-toolkit/docs/adr/0001-codebase-tools-extension.md); no automatic enabling or isolation guarantee |
| `execution.codemode` — code execution and possible State-scope effects | Built-in `codemode` extension entry exists | `Code Mode` initialization entry exists; equivalence unestablished | **Deferred research:** no inheritance strategy or missing-capability policy selected | To be determined from actual State-scope effects; native execution remains harness-owned | [pi entry](../../../pi/packages/coding-agent/src/extensions/codemode/index.ts#L31), [OMP entry](../../../oh-my-pi/packages/coding-agent/src/session/agent-session.ts#L5999), [research todo](semantic-extension-framework-backlog.md); no runtime comparison |
| `lifecycle.semantic-events` — harness-independent session/round lifecycle events | Session start carries the transition reason (startup/reload/new/resume/fork); the per-user-prompt settle is `agent_settled`; per-model-turn `turn_end` and `agent_before_settle` are actionable boundaries | `session_switch`/`session_branch` carry the reason and `session_shutdown` the process exit; the run edges are `agent_start` (once per user prompt) and `agent_end` with `willContinue`, preceded by the main-only `session_stop`, whose continuation request surfaces as the following `agent_end`'s `willContinue: true`; there is no `agent_settled`; `session_tree` is navigation inside one session | **Decided (03); session axis implemented (06), round axis implemented (07):** the framework emits the symmetric `session_start(initial\|new\|resume\|fork)` / `session_end(transferred\|disposed)` pair — a transition that changes which session is current is an end naming the owner being left followed by a start naming the owner being entered, and a navigation that keeps the owner (`/tree`, a same-file resume or reload, an in-place context reset) emits nothing. It also emits the edge-triggered `round_start`/`round_end` pair, where a `Round` runs from the agent taking up input to quiescence: `round_end` carries no payload, is produced only at quiescence, and is produced by an error or an abort terminal too, while an automatic continuation, a drained queued message and a still-running asynchronous job stay inside the round and a repeated or nested start inside an open round is no second edge. The OMP synthesis reads `agent_start`, then `agent_end` with `willContinue !== true` followed by the session's own idle, pending-message and asynchronous-job facts; the adapter subscribes to no `session_stop` of its own. An assembly may declare either axis as a dependency it cannot run without (`OmpAdapterOptions.requiredSemantics`): a declaration is what turns a harness that cannot honor the axis into a `required-semantics` refusal instead of a capability the extension works around, while an undeclared gap refuses nothing (08). On `omp` the two axes share the one lifecycle-subscription surface, so the adapter reports a declared axis missing when that surface is absent from the api it was handed. The first consumer of the round axis is connect-bot (16): its assembly subscribes both edges and declares the axis, because a harness that delivered no round edge could never move the state the panel is told. The session axis's first consumer is the same extension (17): its assembly subscribes `session_end` and declares that axis too, because a session it armed has to be wound down when another identity takes its place — a heartbeat and a panel row would otherwise outlive the connection — while `session_start` needs no handler at all, since the session taking over begins unarmed | Framework adapters; extension logic subscribes (`extensions/connect-bot/shared-logic/session/state-machine.ts` is the round axis's first consumer, `extensions/connect-bot/shared-logic/panel/registration.ts` the session axis's) | Session axis: the OMP mapping is exercised by `tests/framework/session.test.ts` and the framework-side semantics of the delivered events by `tests/framework/session-events.test.ts`; the initial-restore and boundary marker renders are runtime-exercised in `tests/codebase-tools/marker-lifecycle.test.ts`. Round axis: the framework-side edges and the idle query are exercised by `tests/framework/round-events.test.ts`, and the OMP synthesis (start/end, the continuation flag, queued drain, running job, abrupt terminals, the quiescence gate) by `tests/framework/round.test.ts` against the `OmpExtensionApi` double. The consumption is exercised by `tests/connect-bot/state-machine.test.ts` against that same double: the arm's initial value comes from the idle query, a delivered edge moves the extension's own owner-scoped tri-state, a real move is what pushes the `state` event, a subagent's edge moves nothing, and the framework's declared State still holds `enabled` alone (contract P6, story 74–76). The session axis's consumption is exercised by `tests/connect-bot/session-switch.test.ts` against the same double: a switch stops the ending owner's heartbeat, queue and record synchronously before the old row is asked about, announces the switch on the delivery's own channel, removes the row by the real session id and leaves the session that took over unarmed; a disposal stops locally in silence; a navigation that keeps the identity — a tree jump, a reload, a clear, a same-file resume, a TUI branch — is not a boundary at all; and a beat or a capability that outlives the boundary writes nothing back. That the extension names no native session event and registers no native lifecycle subscription of its own — the disposal included — is asserted lexically by `tests/connect-bot/native-session-boundary.test.ts` (E14, P35), and the wording every boundary and command publishes is checked at its own seam, the frozen table in `tests/connect-bot/feedback.test.ts`. The native session facts — `session_switch`/`session_branch` (the transition and its reason), `session_shutdown` (the process exit) and `session_tree` (navigation that produces no event) — are **source-inspected; not runtime-exercised** (checkout `@9348320`), exactly as the native round facts are: `agent_start`/`agent_end` ([`shared-events.ts#L199`](../../../oh-my-pi/packages/coding-agent/src/extensibility/shared-events.ts#L199)), `willContinue` ([`#L214`](../../../oh-my-pi/packages/coding-agent/src/extensibility/shared-events.ts#L214)) and the context's idle facts |
| `lifecycle.owner-scope` — subagent events never reach the owner-facing subscription | No agent identity on the extension context (no kind/id/depth/parentId); no built-in subagent | `ctx.agent` exposes kind/id/name/depth/parentId; `before_subagent_spawn` | **Implemented (08), harness-qualified (03):** the framework's own rule — a delivery whose owner is not `{ kind: "owner" }` reaches no extension handler, while the framework's session behavior still runs for every delivery — is expressed once in the harness-independent dispatch, so every adapter inherits it. The *resolution* is the adapter's: OMP reads `ctx.agent.kind` and walks `parentId` through the harness's agent registry; pi is unimplemented and equivalence is not inferred | Framework behaviors (`dispatchSessionEvent`/`dispatchRoundEvent`); adapters resolve the owner fact | `tests/framework/owner-gate.test.ts` (adapter contract and OMP seam: a resolvable subagent owner and an ownerless session reach no handler, the owner still does); OMP identity declaration, pi absence confirmed by source search |
| `execution.managed-timer` — harness-managed timers for ongoing effects | None: the extension context has no timer API; docs direct extensions to own raw timers and close session-scoped resources in `session_shutdown` | `ctx.setInterval`/`setTimeout`/`clearTimer`, throw-contained, `unref()`d, cleared only on `session_shutdown`/dispose | **Decided (03):** ongoing effect bodies (timers, outbound queues, retry/failure budgets, protocol) stay the extension's business; the framework adds no continuous-task contract. An extension that owns a periodic effect reaches this surface only from its own assembly, which injects it as a capability so its shared logic still names no native timer (`extensions/connect-bot/shared-logic/managed-timer.ts`) | Extension's OMP assembly (`extensions/connect-bot/harnesses/omp.ts`), injected into the extension's shared source as the `ManagedTimers` capability; the framework owns no part of it | OMP `managed-timers.ts`; pi absence confirmed; OMP timers survive in-process session switches. The consumption is exercised by `tests/connect-bot/heartbeat.test.ts` against an `OmpExtensionApi` double (one 10s interval per armed owner, cancelled through the extension's own stop path); the native members themselves stay **source-inspected; not runtime-exercised** until the M-layer round |
| `work.async-job-snapshot` — running async-job visibility for the settle self-check | None | `ctx.getAsyncJobSnapshot()` ([`types.ts#L491`](../../../oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts#L491)) | **Harness-qualified (03); consumed by the round synthesis (07):** the OMP `round_end` synthesis includes "no running async job"; pi has no such fact, so `agent_settled` alone is authoritative | Framework adapter | OMP declaration; pi absence confirmed by source search; the synthesis that reads it is exercised by `tests/framework/round.test.ts` (`source-inspected; not runtime-exercised` for the native member) |
| `session.identity-facts` — the real session facts an extension's wire protocol needs | No pi adapter in the first release; no framework API exposes a session identity at all (the framework's owner key is an opaque derivation it never interprets) | `ctx.sessionManager.getSessionId()` / `ctx.sessionManager.getSessionName()`, `ctx.cwd` ([`types.ts#L497`](../../../oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts#L497)) and `ctx.model?.name` ([`types.ts#L505`](../../../oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts#L505)) on the extension context | **Decided (04); harness-qualified:** an extension whose protocol must name the real session reads these facts in its own OMP assembly and hands them to shared logic as plain data — the framework's owner key stays opaque and unparsed, and shared logic names no native type | Extension's OMP assembly (`extensions/connect-bot/harnesses/omp.ts`); the framework adapter owns the owner key only | Source-inspected; not runtime-exercised — the injection is exercised by `tests/connect-bot/arm.test.ts` against an `OmpExtensionApi` double, and the native members themselves stay unverified until the M-layer round |
| `lifecycle.input-acceptance` — the idle fact behind `canAcceptInput()` | `ctx.isIdle()` on the extension context ([`types.ts#L348`](../../../pi/packages/coding-agent/src/core/extensions/types.ts#L348)); no pi adapter in the first release | `ctx.isIdle()` on the extension context ([`types.ts#L509`](../../../oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts#L509)) | **Implemented (07), harness-qualified:** the framework's `canAcceptInput()` is a query carried by command invocations — the arm path asks it for the state it reports — and never a field of an event payload. It answers the session's own idle fact and is three-valued: `undefined` means this harness reports no idle fact at all, which is reported once per binding on the non-model channel rather than answered with a fabricated state. It is not an admission required-semantic: the fact lives on the context the harness builds per delivery, so nothing about it is observable at binding time | Framework adapter; extension logic reads it at arm | `tests/framework/round-events.test.ts` (idle, working and unreported at the port seam) and `tests/framework/round.test.ts` (the native mapping); the OMP member is **source-inspected; not runtime-exercised** (checkout `@9348320`) |
| `work.pending-message-visibility` — queued-message visibility for the settle self-check | None named on the extension context; the per-user-prompt settle (`agent_settled`) is authoritative | `ctx.hasPendingMessages()` ([`types.ts#L513`](../../../oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts#L513)) | **Harness-qualified (07):** the OMP `round_end` synthesis includes "nothing queued", so a drained queued message stays inside the round instead of producing a boundary and a second start; a surface that does not report the fact leaves quiescence unestablished, and an unestablished quiescence closes no round. pi is unimplemented and equivalence is not inferred | Framework adapter | `tests/framework/round.test.ts`; the OMP member is **source-inspected; not runtime-exercised** (checkout `@9348320`) |

Per-feature strategies need not share an implementation. A future harness representation should be driven by actual checks and diagnostics required by these entries, not by inventing a universal fallback language. A new entry must not convert an unknown condition into permission to proceed. This register organizes the first-release decisions and the remaining research gaps; it does not certify additional harness versions beyond the declared baseline.

## Meaning of the support list

This file concerns harness/package version compatibility, not which tools an agent may call. The first-release admission policy is decided: support is an exact version enumeration; an unlisted installed version is warned about once per main session and then allowed to continue without claiming support; a missing required semantic rejects the affected capability fail-soft. "Required" is the framework's own history preservation, plus whatever the extension's assembly declared through `requiredSemantics` (`"session-lifecycle-events"`, `"round-lifecycle-events"`), so a gap nobody declared refuses nothing: an extension that observes no lifecycle event keeps binding on a harness that delivers none. The version judgement is process-scoped — one decision per reported version, shared by every extension in the process, including the separately loaded framework module copies the loader evaluates per extension — while the required-api shape check is read at each binding. The check runs at extension load/binding, before commands and contributions are registered; platform and harness are recorded but not gated. The support record uses four states — `verified-supported`, `verified-unlisted`, `unverified`, and `unsupported` — and the per-row evidence, conditions and upgrade standard live in [Support record (four states)](#support-record-four-states); this section states the meaning and the admission policy behind them, and the [upgrade standard](#upgrade-standard-and-triggering) states how a state changes.

The first release requires strict history preservation: no mutation or reordering of existing conversation entries, and no alteration of their history-derived request content. Request-context filtering, even of the extension's own earlier messages, is deferred. It permits new messages to be appended through the harness's normal recording path; once recorded, they receive the same protection. Non-persisted request contributions are not included in the first release, so their placement remains undecided. Mechanism availability in the table above does not by itself establish policy compliance.

## Compatibility rules already agreed

- Common framework behaviors must be satisfiable across all declared supported harness targets, possibly through different adapter implementations. Additional harness-qualified framework capabilities are permitted with explicit support conditions and visible absence; first-release subagent State inheritance targets OMP, not pi.
- Required semantics must not be silently weakened. An unmet required semantic rejects the affected capability fail-soft: it is reported on a non-model channel, not bound, and leaves no partial registration while the harness continues.
- Version claims must retain their evidence level. Source inspection, executable startup, and exercised behavior are distinct.
- Cross-harness semantic contract scenarios are regression alarms: a failure signals an incompatibility to investigate, while a pass never automatically approves a harness version. A framework maintainer reviews the changed harness source and/or further test evidence and explicitly decides whether to declare support.

## Decisions still open

- Admission of a new harness (for example pi) without silently weakening already-established common contracts; the first release ships no pi adapter.
- Cross-harness prefix stability and a system-prompt stability policy.
- Shared-file concurrency, configuring State persistence media, request-only contribution placement, and the remaining control kinds (all deferred beyond the first release).

The following are **decided** for the first release and are no longer open: the supported set is the exact combination `@oh-my-pi/pi-coding-agent@18.5.0` (checkout `@9348320`) + Windows x64 + Bun 1.4.2; an unlisted installed version is not refused — it is warned about once per main session and then continues; mode/provider constraints are the verified providers `deepseek/deepseek-flash` (`openai-completions`) and `openai-codex/gpt-6-luna` (`openai-codex-responses`, shape-only layer 1 and real-credential layer 2 per decision 08); upgrade regression runs the framework suite on isolated candidate installs on demand, and a pass never automatically approves a version. Future support declarations still require an explicit maintainer decision based on source review and/or exercised scenarios for the declared target; passing tests alone is not that decision. OMP 18.5.0 is runtime-verified only for the extension-path behaviors exercised in decision 03; other versions and provider paths are not certified by that evidence.

````

## framework/docs/semantic-extension-framework-backlog.md

````markdown
# Semantic extension framework backlog

This is a research backlog, not an implementation-ready specification. Accepted framework scope remains in [ADR-0002](../../docs/adr/0002-semantic-extension-framework.md); harness differences and policies are tracked in [harness-support.md](harness-support.md).

The focused first-release planning effort is tracked in [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../../.scratch/codebase-tools-omp-v1/map.md). Its scope and decision tickets live there; this file remains the deferred research backlog, not the first-release specification.

## Todo list

- [ ] Verify OMP extension code hot reload: whether `/reload-plugins` re-imports edited extension/framework source (or returns cached modules), and whether reload keeps owner-scoped State and contribution registration idempotent and reconstructable from session entries. The first release only promises source changes take effect after a process restart; session resume/State restore is a separate, in-scope contract. Deferred by [decision 02](../../.scratch/codebase-tools-omp-v1/lighthouse/02-candidate-support.md).

- [ ] Investigate pi `codemode` and OMP `Code Mode`, their actual semantic differences, and whether either requires framework State inheritance.

- [ ] Decide multiple contribution rules per slot: composition vs explicit precedence, and how conflicts are detected/rejected. The first release supports exactly one rule per slot with an explicit error on multiple matches; deferred by [decision 05](../../.scratch/codebase-tools-omp-v1/lighthouse/05-contribution-contract.md).

- [ ] Plan and verify model-cost's separation of harness observation/State updates from native widget rendering during framework migration.

- [ ] Decide owner disambiguation when multiple main sessions coexist in one process (ACP/cmux/embedded, or old subagents outliving `/new`). First release supports a single main only; native `parentId` + `AgentRegistry` can resolve the wrong `"Main"` slot. Candidate approach: parent-side `before_subagent_spawn` `spawnKey → ownerKey` edge. Deferred by [decision 04](../../.scratch/codebase-tools-omp-v1/lighthouse/04-state-ownership.md).

- [ ] Decide whether State persistence media become configurable (in-memory / extension-owned file / harness session entries). First release implements only the owner-session JSONL mapping that codebase-tools needs, keeping the value-vs-mapping seam. Deferred by [decision 04](../../.scratch/codebase-tools-omp-v1/lighthouse/04-state-ownership.md).

- [ ] Decide the remaining constrained custom-logic seam for extensions. The earlier direction to keep HTTP extension-owned is superseded: [HTTP decision](../../.scratch/model-cost-migration/lighthouse/05-http-capability.md) now owns the complete confirmed HTTP contract and consumer scope, including model-cost and connect-bot. HTTP planning is resolved, not implemented; concrete wiring and acceptance remain with [组织与装配](../../.scratch/model-cost-migration/decision/10-assembly-layout.md) and [验收与切换](../../.scratch/model-cost-migration/decision/11-acceptance-cutover.md). Other custom-logic questions remain deferred by the earlier [framework-interface decision](../../.scratch/codebase-tools-omp-v1/lighthouse/06-framework-interface.md).

- [ ] Decide the remaining control kinds (mode selection, configuration switch, parameter setting, command action) and a required-semantics declaration for extensions that need role guarantees. Deferred by [decision 06](../../.scratch/codebase-tools-omp-v1/lighthouse/06-framework-interface.md).

## model-cost migration risk: rendering currently updates business state

Source inspection on 2026-10-04: [`buildWidgetLines`](../../../my-omp-toolkit/extensions/model-cost/index.ts#L247) reads `ctx.sessionManager.getUsageStatistics()` and `ctx.getContextUsage()`, then assigns `state.lastContextTokens`. [`refresh`](../../../my-omp-toolkit/extensions/model-cost/index.ts#L349) installs a widget factory whose `render(width)` calls that function. This is not a presentation-only path. Moving the existing function to an OMP-specific presentation file would preserve the coupling rather than complete the separation.

During migration, arrange harness observations and reconciliation into State independently of renderer execution. Keep shared cost/budget rules in shared extension logic; native rendering should read the reconciled business values and choose layout/colour, not be the operation that makes business State current. Do not change the established business calculations merely to perform this separation.

The observation triggers, update timing, unavailable-observation policy, and concrete framework interfaces remain to be designed. This is a migration task, not a claim that those contracts or the migration are implemented. Completion must exercise business updates without an installed UI and confirm that repeated native rendering does not mutate business State; also verify that existing visible cost/context behavior is preserved. Choose the actual verification scenario when the update contract is known. No model-cost harness migration was exercised in this documentation task.

## Deferred codemode research

### Question and current evidence

The design discussion raised pi codemode as a possible additional inheritance consumer. No runtime verification or inheritance requirement has been established. Do not assume OMP lacks a comparable feature: pi has `createCodemodeExtension` in `packages/coding-agent/src/extensions/codemode/index.ts:31-44`, while OMP has `AgentSession.initializeCodeMode` in `packages/coding-agent/src/session/agent-session.ts:5999-6003`. These source observations establish entry points, not equivalence or a shared contract.

### Research scope

1. Establish what each feature executes, in which process/session/execution scope, and how it obtains tools, MCP access, and extension behavior. Distinguish script tool execution from a new agent/model conversation.
2. Determine whether framework State needs to cross an actual ownership boundary. Identify which value would need inheritance and why; do not infer an inheritance requirement from nested execution alone.
3. Exercise the relevant execution paths in both harnesses and record harness versions, settings, observed behavior, and limits. Separate source inspection from runtime evidence.
4. Decide whether the existing live-following inheritance contract is sufficient, whether a different concrete requirement exists, or whether no inheritance is needed. Do not add new inheritance modes speculatively.
5. Update the capability-difference register with the precise harness conditions, evidence, responsible implementation, and explicit strategy (including any user notice or rejection).

### Completion evidence

A source-backed and runtime-exercised comparison, a concrete answer about State ownership/inheritance, and an updated difference-register entry. If a prerequisite prevents execution, record it explicitly rather than claiming support.

````

