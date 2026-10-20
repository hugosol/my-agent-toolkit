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

## pi adapter scope revision (2026-10-15)

The maintainer approved adding only the pi extension-layer mechanisms consumed by codebase-tools,
with no change to its definition, shared logic or the framework's behavior rules. Reuse the public
binding and State contracts; keep pi native calls and text-resource loading in framework adapters,
and the extension assembly/discovery entrypoint thin. This supersedes the historical “no pi
implementation authorized” scope below, not the separation of responsibilities.

Injected messages use pi's native hidden, persisted custom-message path after the user's input;
the adapter does not choose prompt frequency or rewrite history/system instructions. The maintainer
accepts the native delivered role. Subagent integration is explicitly excluded, so the historical
future pi first-activation inheritance notice is not added for this implementation. No MCP/LSP
supply, pi source modification, full observation adapter or automatic compatibility gate is included.
Executed evidence and limitations belong solely to [the support record](../../framework/docs/harness-support.md#pi-codebase-tools-adapter-evidence).

## Repository ownership and migration references

The framework's authoritative design and implementation live in my-agent-toolkit. The original independent extensions remain in [my-omp-toolkit](../../../my-omp-toolkit/), which is the source of existing business contracts, proven implementations, and selectable rollback baselines. Replacements are developed here incrementally; this document's source layout describes the target, not a migration already performed.

Maintain one authoritative document for each fact. Framework architecture decisions belong here; terms belong in [GLOSSARY.md](../../framework/GLOSSARY.md); harness observations and integration evidence belong in [harness-support.md](../../framework/docs/harness-support.md) and its linked research; unresolved work belongs in the [framework backlog](../../framework/docs/semantic-extension-framework-backlog.md). Other documents link to the owner rather than maintaining another policy or schema copy. my-omp-toolkit remains an independent extension repository and does not retain framework documents or migration pointers. References are one-way: my-agent-toolkit may consult my-omp-toolkit, but the original repository does not need to know about this framework.

| Subject | Authoritative source |
| --- | --- |
| Existing extension behavior and business terminology | The original extension documents in the my-omp-toolkit checkout — the codebase-tools and model-cost READMEs and glossaries — as frozen at each migration's oracle revision (my-omp-toolkit `34d7c40` for codebase-tools, `fd3b507f` for model-cost). Both extension directories have since been removed from that checkout's working tree, so the frozen revision, not the current tree, is the historical source. |
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
    modules/                    # Harness-independent HTTP/files, not adapter-dependent

  adapters/                     # Framework contract mappings, grouped by harness
    pi/
      index.ts                  # Public assembly entry
      internal/                 # Native types, loader support and the binding port
      domain/                   # Capability domains: Session, Context, Subagent, Provider, ...
        session/                # Session facts and lifecycle, including Turn and Round mappings
    omp/
      index.ts
      internal/
      domain/
        session/

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
                  shared extension logic     adapters/<harness>
                           |                         |
                           +------------+------------+
                                        v
                            shared framework interfaces
                           (semantic core and behaviors)
```

Arrows represent loading/import dependencies, not shared in-memory State or the order of all harness events. Both harnesses use the same framework source tree and shared extension source; only the selected harness assembly and native integration differ. Actual loader resolution, reload behavior, and debugging remain deployment verification requirements.

Keep harness-independent framework source in `framework/`, with semantic core, reusable behaviors and general modules separated internally. Keep its native mappings in the sibling `adapters/<harness>/`, grouped directly by capability domain. Keep each independent extension's shared definition and logic plus its harness-specific implementations in `extensions/<extension>/`. Provide separate discovery roots `entrypoints/pi/` and `entrypoints/omp/`, each containing one thin entrypoint per supported extension. Configure each harness to scan only its own discovery root, not the shared implementation directories. Entrypoints import or re-export their extension's harness-specific assembly; they do not copy framework or business code and do not aggregate all extensions into one factory. Do not add a root `index.ts` that changes a discovery root into a single extension.

Extensions cross the framework's small public interfaces even though the code lives in the same repository. The framework must not depend on individual extension implementations, and shared logic must not import native harness types merely because both are locally available. Harness-specific code may use native capabilities directly. One source tree does not imply one harness instance or shared in-memory State between harness processes. This records the target layout, not a completed migration or a reason to create empty directories before implementation. The framework's small public interfaces are a stable contract surface; non-additive changes require an explicit decision here. The [model-cost assembly revision](#model-cost-assembly-revision) authorizes the clean-cut public binding/lifecycle changes and consumer migration, without a second legacy interface.

### Enforcement of the native boundary

The shared/native split above is enforced mechanically by [`tests/framework/import-boundary.test.ts`](../../tests/framework/import-boundary.test.ts). The test scans every `.ts` under `adapters/`, `framework/`, `extensions/` and `entrypoints/` and puts each module in exactly one class:

- **Escape hatch** — `adapters/**` and `extensions/<id>/harnesses/**`. Native access is permitted here and nowhere else.
- **Discovery entrypoint** — every module under `entrypoints/`. Each is a single re-export of its extension's harness assembly and nothing else, so reaching the escape hatch is what it is for, and the entrypoint assertion governs it.
- **Shared source** — everything else: the entire `framework/` tree, and every extension module outside its `harnesses/` (conventionally under the extension's `shared-logic/`).

No module outside the escape hatch may **name** a harness package (`@oh-my-pi/*`, `@earendil-works/*`) — an import, a dynamic import and an ambient `declare module` alike — and shared source may in addition not reach an escape-hatch module by relative import. The harness package's ambient declaration therefore sits with the adapter (`adapters/modules.d.ts`), beside the code allowed to import it.

The native escape hatch is exactly two locations: `adapters/**` and `extensions/<id>/harnesses/**`. The check reads specifiers lexically rather than through an AST, and only from `.ts` files: it is an alarm for the ordinary crossing, and the principle above is what binds. `require(...)`, computed or concatenated specifiers, aliasing, and a non-`.ts` module sit outside it, so a green run does not establish the boundary — it means only that the alarm found nothing to contradict it. A case the alarm cannot see is decided by the principle, and a case it flags is fixed rather than exempted.

Widening the escape hatch, adding an equivalent bypass, or moving native access outside these two locations is a non-additive architecture change and requires an explicit decision in this document, not an implementation detail. The connect-bot migration fixed the extension-side allow-list — that extension's only direct native use is its OMP harness assembly, limited to a managed interval timer for the 10-second heartbeat and the real session id, cwd and model read as plain data, with shared logic importing no native types and registering no native hooks — and restated the invariant in exactly the mechanical terms the test above checks: framework shared source (core, behaviors, definition) and extension modules outside `harnesses/` must not name native APIs, and native access lives only under `adapters/**` and `extensions/<id>/harnesses/**`.

### Capability-domain adapter organization (2026-10-19)

The maintainer approved moving the framework's native mappings to top-level `adapters/`, beside
`framework/` and `extensions/`. This explicitly replaces the earlier internal adapter placement and
its native allow-list paths, not its responsibility rule. There are no forwarding modules at the old
paths. Extension-specific presentation and other non-unified native implementations remain under
`extensions/<id>/harnesses/`.

Within each harness, the adapter root has exactly three entries: `index.ts` is the public assembly
entry, `internal/` is private native/loader and binding-port support, and `domain/` contains the
capability domains. Organize `domain/` directly by shared capability domain, not by consumer
extension or by `business`/`foundation` tiers. `domain/` is a navigation grouping, not a runtime
module or a new interface. Prefer an existing business domain when it and a support domain both
fit; keep genuinely shared support in one place. Framework-owned concepts supplement business
vocabulary: Session owns its Turn and Round mappings, context keeps its own domain, and provider
access and catalog pricing share the Provider domain. A native object's location does not decide
capability ownership. Framework Marker area and Extension feedback mappings remain adapter
responsibilities; extension presentation does not.

Within a capability domain, organize native mappings by their direction: `events.ts` converts
native observations to framework events, `queries.ts` reads native facts into framework values,
and `effects.ts` performs framework-requested native effects. Create only the mappings the domain
actually needs: a simple domain stays a single file, and complex Turn or Round protocols may remain
private implementation files within Session. Do not create forwarding-only entry files or split every
method into a module. Keep the domain's event construction near its native event mapping rather than
reassembling it in the harness port. Shared context types, diagnostics and other implementation
support belong with the code that owns their lifetime, not in a parallel capability taxonomy.
The complete domain map is Session, Context, Subagent, Provider, Control, Prompt, Feedback and
Marker. Both harnesses expose their Subagent domain: native parent/ancestor relationships and
integration-state reads belong there, while Session consumes those relations for its own facts and
Owner mapping. Ordinary child Session/Turn/Round events remain Session events; OMP does not add a
second child-event pipeline just to populate a Subagent `events.ts`. pi's provider announcements and
replies, liveness queries, and child-extension registration effects are organized within Subagent;
the third-party provider is its internal implementation, not the primary navigation category.
The offline inventory lives in `domain/subagent/declaration.ts` and is distinct from runtime queries.
Feedback and Marker are separate effect domains on both harnesses. Native types and loader hooks
live under each harness's `internal/`; `index.ts` is the public assembly entry and
`internal/port.ts` is per-binding assembly support, not a capability domain. Capability domains live
only under `domain/`. The authoritative path map is the adapter navigation in the framework capability index.
This refines the approved domain-first organization; it does not introduce a generic delivery module,
change framework interfaces, or unify commands, prompt effects and observation deliveries.

This is a navigation convention, not a one-requirement/one-file mechanism. The definition and harness
inventory retain the existing subagent capability vocabulary and per-execution-mode coverage. A new
harness implements what its selected consumers require, not automatically every framework capability;
this revision adds no general requirement expansion, registration system, runtime negotiation or
startup gate. Independent verification remains separate from declaration matching.

Each harness entry assembles its domain modules. Cross-domain collaboration uses explicit interfaces
and a single source for each shared fact, without circular dependencies. The harness-independent
`behaviors/assembly.ts` owns observation/State creation and implementation reuse after disposal;
native shutdown and subscription-release ordering remain with the adapter. Apply the deletion test:
extract only a module whose depth gives leverage and locality, not a shallow forwarding layer.
The interface is the test surface; preserve consumer behavior and real-loader verification rather
than mirroring each file with a test.

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

The model-cost migration applies the responsibility test above to extension-owned harness-specific widget fronts, shared business/presentation backends, and framework-owned viewed-session facts and effective-State marker projection. The confirmed split places the widget backend — field selection, money/token formatting, tree composition — in the extension's shared logic as read-only views with change subscriptions, restricts the harness-specific front to native components, layout, theme and width with no network, timer, file or authoritative-value work, and has the framework deliver the viewed session's identity/name, provider/model, effective effort and context facts plus change notifications, projecting that session's effective State into the one Marker area. Viewing never grants write or Owner authority and never changes accounting, inheritance or external effects; switching to a child session shows only that session's effort, context, effective marker and own-model totals while the tree totals stay main-session-scoped. The remaining native question is the host's public read/subscribe outlet for the viewed session; private-field and UI-text inference are excluded, so a patched host revision that exposes that outlet stays an implementation prerequisite rather than a claimed capability. Evidence limits: only isolated probes ran (ratio arithmetic, and a focus-controller probe against the installed host with a fixture session/UI, which is neither the public outlet nor a baseline certification); no production widget, public interface, real-model or remote-balance acceptance exists, and the stored support baseline is unchanged. This does not widen the native escape hatch or change State Owner, and does not certify an implemented public focus interface or a newer harness baseline.

## Scope map

The discussion covers nine areas: (1) extension definition/configuration and shared TypeScript logic; (2) control patterns, commands, and subfeatures; (3) semantic hooks and State orchestration; (4) State ownership, storage, restoration, archives, and shared-file concurrency; (5) ongoing work and lifecycle effects; (6) instruction contribution and mandatory history preservation; (7) basic status feedback driven by State; (8) harness adapters and declared version/capability support; and (9) framework verification as upgrade regression detection. This map records responsibilities and exclusions, not a claim that these modules or all five migrations have been implemented.

## HTTP capability scope (additive planning; model-cost migration)

The model-cost migration confirms framework-owned, harness-independent HTTP transport, consumed directly through the framework public interface rather than delivery-scoped injection. The approved contract is a single `request` taking the caller's method (default GET), headers, body, timeout budget and proxy choice and returning the runtime's own response without a business envelope: `proxy: false` or omitted is direct, a named proxy must be satisfied from the shared `framework/config.yaml` table, and a request whose named proxy is missing, unreadable, malformed or invalid is refused before anything is sent — no silent fallback to a direct connection (this explicitly replaces the earlier partial proxy policy that allowed that fallback), while a runtime proxy failure propagates without a second direct attempt. The timeout budget is the request's value, then the shared `http.defaultTimeoutMs`, then the built-in 30000 ms, covering the response body as well as the response head; no active-cancellation signal, retry or telemetry is added. Evidence limits: the confirmation is interview provenance plus a local smoke of the old body-timeout behavior; neither certifies the new module, the proxy protocols, the real provider queries or the connect-bot transport regression. The implemented module slice is recorded under [Model-cost assembly revision](#model-cost-assembly-revision).

Provider endpoints, parsers and business routing remain extension shared logic; current credential facts are mapped on demand by the framework adapter under the responsibility test above. The approved consumer scope includes model-cost queries and connect-bot transport, without transferring their business protocols into HTTP or claiming control over harness-owned networking. Concrete source organization and wiring are fixed by the assembly revision recorded below; acceptance evidence remains an implementation product rather than something this approval supplies. Approval is not an implemented capability or runtime certification.

## Initial control scope

The control vocabulary covers configuration switches applied after restart, idempotent selection of a named mode, and command toggles alternating between two modes, but the first release implements only **command toggle**. Configuration switches, mode selection, mixed control such as the current Build/Explore/Debug interaction, and the remaining control kinds are explicitly deferred rather than implicitly implemented through the initial pattern.

### Extension configuration (additive; connect-bot migration, decision 05)

The connect-bot migration adds an additive capability for an extension's own configuration **values**, distinct from the deferred configuration-switch control kind: the framework reads a fixed `config.yaml` from the extension's source directory (`extensions/<definition.id>/config.yaml`, overridable by a declared `path`), parses it with the pure-JS `yaml` package (zero external dependencies, ISC) in the framework's harness-independent config module behind an injectable seam, and validates the required keys and primitive types the extension declares as plain data in its definition (`config.fields`). An invalid `config` declaration (non-object, a `fields` entry outside `string | non-empty-string | number | boolean | milliseconds`, or a non-string/empty `path`) and missing, unreadable, malformed, non-object, missing-required, or wrong-type content all refuse the binding the same way — the extension is not loaded and a `configuration` binding failure with violation kind `config` is reported on the non-model diagnostic channel; there is no code-level default fallback, the shipped file is the default. Values reach the extension's shared logic through a harness-independent `getConfig(definition)` read, so no harness assembly handles configuration; `readConfig(path)` and `ExtensionConfigError` are the config module's single read/parse/validate/throw surface. The convention path and any relative `path` are relative to the **configuration base directory** the extension's own assembly supplies as plain data — its extension-repository root — because the loader discovers an entrypoint by absolute path while the process runs in an arbitrary project directory; an absolute declared path is used as declared, and an assembly that names no directory leaves a relative path to be read against the process's working directory, as before that option existed. This is additive: configuration switches, mode selection, mixed control and the remaining control kinds stay deferred, and the same file is their intended future carrier.

### Directed control and per-field State lifecycle (additive; connect-bot migration, decision 02)

The connect-bot migration adds a second bound control kind, **directed**: a command that names its target state explicitly with a fixed word form (empty argument = on, `off` = off; no `offline` alias — an unrecognized word is an error that changes nothing), repeats its side effect on every invocation, and is never deduplicated or short-circuited by the framework — idempotence is the extension's responsibility. The declaration only names the field the command owns; the extension's handler owns the write and decides it from the action's outcome (a successful register sets `true`, a failed one `false`, `off` sets `false` whether or not the panel is reachable), writing through the delivery's managed seam. The framework writes nothing before, after or instead of that write, so a handler that never writes leaves the value alone. `off` is filtered against the current value while arm is not, so a re-arm deliberately re-registers, and concurrency or late receipts are the handler's concern because the framework neither serializes nor collects in-flight actions. It is distinct from the deferred mode-selection, mixed-control and command-action kinds.

It also makes the State lifecycle **per field**, on three orthogonal axes:

- **Control kind** — `toggle` (existing) or `directed` (new).
- **Persistence** — `session-entry` (default: written to the owner's persistence medium, seeded from the target branch at session boundaries) or `memory` (never written and never seeded; an owner-identity change drops the value to the declared default, while navigation that keeps the identity preserves it).
- **Inheritance** — `follow` or `none` (default `none`: a subagent reads the declared default unless the field declares `follow`).

The framework's write authority is unchanged: the extension's handler owns the write through the delivery's managed seam and can read the pre-invocation value, and the framework records nothing on its behalf. `memory` is the choice for a value that declares a live external effect, because a restored value does not prove the effect is running (see [State and recovery seam](#state-and-recovery-seam)).

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

## Session capability interface cutover (2026-10-19)

The maintainer approved Session as the first complete capability under `framework/interface/`,
not merely a read facade or a directory move. That directory owns the extension-facing Session
facts, observations, event deliveries and Subscription group contracts; internal framework modules
and native adapters import those canonical declarations. Session declarations are removed from
`core/protocol.ts` and `public.ts`, without compatibility re-exports. Other capabilities retain their
existing authoring entries until their own migration; the small State, Feedback and Provider
contracts needed by Session are canonical interface dependencies, not permission to expose engines.

The implementation factory receives `context.session`: a Session observation reader and the
statement of a confirmed storage write. It no longer receives a concrete `SessionObservations`
instance or the separate `recordSessionCommit` member. The delivered reader has no observation
mutation, source withdrawal, owner-wide transport projection or constructor; its returned readings
cannot mutate the framework's retained observations. Extensions neither construct a replacement
source nor reach Session implementation through another capability. Source admission, deduplication,
Round/Turn identity, Local access and close-out remain behind the seam. Existing semantic
subscriptions keep one dispatch and their existing scope/ordering rules.

Session disposal remains an adapter-reported fact, not a new extension event or an alias for
`session_end`. Its extension-visible close-out contract stays with Round end. Native mappings remain
in the two existing harness adapters; this decision introduces no second adapter abstraction and
does not pre-split `HarnessPort`. The interface is the test surface: consumer behavior and actual
harness loading validate depth and leverage, while import checks protect locality. This is
engineering encapsulation, not a same-process security sandbox. It explicitly supersedes the earlier
public Session exports and factory fields; it does not revise State ownership, observed lifecycle
semantics, extension business rules, or harness support claims.

## Command capability interface cutover (2026-10-19)

Command follows Session as a complete capability under `framework/interface/command/`. Its public
`details/definition.ts` owns the closed control-kind declarations and `details/implementation.ts`
owns the implementation contracts, deliveries, `RecognizedDirective` and `CanAcceptInput`; internal
framework modules and both adapters import those same declarations. `CommandInvocation`,
`BoundCommand`, the internal `DirectedDirective`, argument parsing, binding validation and help
tooling stay internal, and the old mixed entry re-publishes none of them.

The actual delivery is explicitly constructed from the approved members rather than spread from the
invocation. A directed handler — on `run` and on the optional `unrecognized` path alike — receives
`args`, `owner`, `hasUI`, `canAcceptInput`, `provider`, `feedback`, the managed `state` seam and the
`capability` it may retain. An `actions` action receives only the first six: it owns no declared
State, so it has no seam, retained capability, persistence path or marker transport to reach. The
adapter's `persist` callback and the marker-area transport leave the extension-facing surface
entirely (the internal environment still records through the managed State write path), and the
old `CommandActions` combination type is deleted after its last consumer check. No compatibility
alias or forwarding shell is kept.

This is a non-additive public-contract change accepted by the capability-cutover spec: it removes
members an extension could previously observe. It preserves the three controls' existing semantics —
toggle owner scope and feedback, directed owner scope with empty-argument activation, `off`
deactivation and repeat execution without framework inference, optional `unrecognized` with no
automatic write/publication/feedback, actions routing/help/await/one-report failure without an Owner
gate, and the live three-valued idle query. It does not add a generic delivery factory, filter,
proxy or revocation system, and it does not revise State ownership, marker area ownership, extension
business rules, or harness support claims. Verification is the Command evidence record, not this
amendment.

## Full capability interface cutover (2026-10-19)

The maintainer approved, and the implementation completed, the non-additive public-contract switch
across all remaining capabilities: State, Prompt, Marker, Feedback, Provider, Subagent, the root
authoring contract, Command (recorded above) and General. This is the explicit decision the
"stable contract surface" rule requires. It supersedes the Session amendment's sentence that other
capabilities retain their existing authoring entries until their own migration: every approved
capability now has its canonical interface entry, and the old mixed `framework/public.ts` entry is
deleted with no alias, re-export or forwarding shell.

- **Ownership.** Each capability owns its declarations at its approved interface entry; internal
  framework modules and both adapters import the same declarations. The root authoring entry
  composes its own definition/implementation contract and publishes no capability. The single
  [`framework/runtime/port.ts`](../../framework/runtime/port.ts) is the framework/adapter interaction
  contract and refers to the canonical declarations instead of restating them.
- **Actual delivery.** Initialization carries only `owner`, `hasUI`, `feedback` and `subagents`;
  directed `run`/`unrecognized` carries `args`, `owner`, `hasUI`, `canAcceptInput`, `provider`,
  `feedback`, `state` and `capability`; an `actions` action carries the first six and no State writer
  or retained capability. No delivery carries the adapter's persistence callback, the marker-area
  transport or the internal invocation.
- **State and Session.** Managed State writes and retained capabilities keep their existing owner
  lifecycle. Session keeps its read-only observation reader, isolated readings, `recordCommit`, one
  dispatch, scope and close-out rules. Extension configuration keeps its approved limited exception
  (TypeScript `Readonly`, no runtime write protection); the exception is not extended to any other
  capability.
- **General.** HTTP, safe files and configuration are three direct, harness-independent entries with
  canonical error identities. There is no General aggregate entry, and General is not an
  adapter-backed capability.
- **Retirement.** The seven former extension import exceptions — `framework/public`,
  `core/assembly`, `core/definition`, `core/config`, `core/integration`, `modules/http` and
  `modules/files` — are cleared for extension consumers. Internal files that retain real duties stay
  internal; internal test seams remain available to tests and scripts.
- **Candidates not adopted.** Separate public `definition/` and `assembly/` runtime layers; a
  capability-grouped implementation context (`context.provider`, `context.config`); General as a
  capability or aggregate entry; a public Marker transport or extension-level marker-area
  operations.
- **Preserved semantics.** No change to Owner, session-entry recovery, history preservation, the
  marker area, extension business, storage contracts or harness support. Verification is the
  ticket-11 evidence record, not this amendment.

## Semantic lifecycle model

The framework owns one harness-independent lifecycle vocabulary for extensions. Its target places reusable semantic processing in the shared framework, with harness adapters supplying native fact mappings and necessary bridges; the model-cost migration explicitly permits refactoring existing placement and accepting reviewed edge-case accuracy tradeoffs to avoid repeating lifecycle logic per harness. That observation contract is happy-flow-first — normal request/response, tool continuation, per-actual-session Round and parent/child consumption are the design spine, and only reproducible gaps reopen it — with the accepted limits that missing or reordered signal combinations may mis-split or truncate a round and may leave an end undetected (no polling, no timeout guessing, no replay or backfill, and mismatched final usage counts as unavailable rather than guessed). Its feasibility evidence is probe-level on the OMP 18.5.0 baseline (request identification/usage/headers, subagent identity and direct-parent relations, and two normal happy-path runs in which the public settle and the awaited save follow the native callback); closing that planning work certifies neither a production adapter nor the refactor, and none of it is a support claim. The connect-bot migration fixed the first implemented model:

- **Session axis.** `session_start` (a session became the current owner; reason `initial`, `new`, `resume` or `fork`) and `session_end` (the current owner ceased; reason `transferred` or `disposed`) form a symmetric pair. A switch, branch or fork is `session_end(transferred)` followed by `session_start`; navigation that keeps the same owner emits neither. The framework seeds and retires State and refreshes the marker area on these boundaries; an extension may subscribe, and the migrating extension uses `session_end` to stop its own effect. The delivery carries this event rather than the earlier session `position`/`reason` pair: the event **replaces** those two fields, and the `SessionPosition`/`SessionChangeReason` types with them, instead of traveling beside them, because a position-described delivery can express neither a symmetric pair nor a start that carries no reason. That replacement is a non-additive interface change and is decided here; the delivery's redundant `previousOwnerKey` is removed with it and recorded in the capability section below.
- **Round axis.** A **Round** is one period of agent activity, from starting work to quiescence — no automatic work remains and it is waiting for the user. A round may contain several model-response turns and several low-level agent runs. `round_start` and `round_end` are edge-triggered transitions; `round_end` has no payload and fires only at quiescence (automatic continuations stay inside the round, while error and abort still reach it).
- **Activity axis.** `session_activity` states one actual session's current **Agent activity state** — `working` while its Round is open, `idle` once the framework confirmed that Round ended — and it is delivered only where the reading moved. It is *derived* rather than a third set of edge rules: the framework computes it from the transitions its own round synthesis dispatches (one rule, `ACTIVITY_OF_EDGE`), so an extension never answers for itself which native fact ends a session's work and two surfaces cannot answer it differently. The delivery is an observation and not an arm path: it grants no capability, dispatches no edge, and drives no Round, Turn or save — the same shape a reading obtained from another process's session arrives in. A session no reading has moved reads as nothing rather than as idle.
- **Idle is a query, not an event.** `canAcceptInput()` exposes the harness's idle fact independently of the events and supplies the initial value at activation.
- **Ownership and dispatch.** Public semantics and reusable lifecycle processing remain framework-owned; adapters map native facts. The assembly revision replaces the universal owner-only subscriber restriction with subscriptions declared per group: Owner subscriptions carry main-session effects only, while actual-Session subscriptions follow real main/child/grandchild session identity and never substitute the Owner key, a display name or agent nesting for the session id or its direct parent relation — both groups route through one public dispatch Module. Owner effects remain isolated; observing a child never grants Owner write or external-effect authority, and State `follow`/`none` is unchanged. Framework processing precedes handlers. Development must satisfy the complete required contract; normal startup no longer negotiates/refuses partial capability sets (see [independent compatibility verification](../../framework/docs/harness-support.md#independent-compatibility-verification)).
- **Effects stay with the extension.** Ongoing work such as timers, outbound queues, retry/failure budgets and network protocol remains the extension's business; the framework emits semantic events and does not add a continuous-task contract.
- **Native mapping.** OMP composes a round's quiescent end from the native end signal (no continued work) plus its own idle fact, with no running asynchronous job and no pending messages, and its owner gate derives from the agent kind and is therefore OMP-qualified; the pi adapter is unimplemented and no pi parity is claimed.

This fixes the first-release lifecycle vocabulary and refines the "Semantic hooks at the scope level" note above; the remaining hook inventory (for example model-response turns, provider and tool events) stays deferred until a concrete extension needs it. Everything else the migration added for these two axes is additive — an event union, deliveries, handler subscriptions, the idle query, the port's round hook, and the assembly-declared required semantics — so the session-axis replacement recorded above and the feedback replacement recorded in the feedback section are this migration's only non-additive interface changes.

## Owner-scoped effect capabilities (additive; connect-bot migration, decision 07)

An extension-owned background effect (for example a heartbeat timer or an outbound flusher) runs outside any handler delivery, so it cannot rely on delivery-scoped seams alone. The connect-bot migration settled how such a callback reaches framework capabilities: a retained owner-scoped handle taken from a delivery, not a framework API that resolves an owner from a key — the key-resolving form was rejected because it would let any callback write once it held the key and would hollow out the handler-owns-write rule:

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

- **Only State rules are accepted.** The constructor requires the resolved `StateRules` (`{ field, persistence }`) — exactly the pair `activationField(definition)` and `statePersistence(definition)` ([`definition.ts#L75`](../../framework/core/definition.ts#L75), [`#L80`](../../framework/core/definition.ts#L80)) already resolve for the definition an assembly serves. The store holds no definition, reaches into none, and applies no default of its own: what a definition leaves out is resolved where the defaults live. The effect shapes it consumes are exported beside it: `StateWriteTarget` (`ownerKey`, `persist(values)`, `publishMarker()`), `StateCapabilityTarget` (that plus `feedback`), and `StateSessionChange` (`owner`, `event`, `statePayloads`, `publishMarker(ownerKey)`) — the publication receives the owner key the boundary resolved, so the dispatcher does not repeat the owner gate.
- **Effects are supplied per delivery, not remembered by the store.** `writer(target)` returns the delivery's declared-value seam, `capability(target)` returns the owner-scoped handle, and `reconcile(change)` applies one boundary. No transport is resolved inside the store, and the store has no mutable current-session target: each writer or capability closes over the effects its own delivery supplied.
- **One store per assembly, not a process-global registry.** The store is constructed by [`createAssemblyBinding`](../../framework/behaviors/assembly.ts), once per adapter factory call, and shared by every session binding of that extension, so those bindings agree on one current value per owner and two extensions never share a store. State is deliberately not resolved from a process global keyed by definition id: the process-scoped resources remain the ones a duplicated framework module graph must still share — the unified marker area (see [Extension feedback, marker, and declared-value writes](#extension-feedback-marker-and-declared-value-writes-additive-connect-bot-migration-decision-04)) and the version judgement — and State is not one of them.
- **Owner lives stay private.** `OwnerLives` remains the implementation of "a capability lives exactly as long as its owner's cell", kept as the store's private `#ownerLives` composition rather than a member a behavior reaches. A start opens the life, the end that retires the cell revokes what was retained for it, and a handle asked for after that owner's life has ended is inert from birth; an owner not yet seen by a session event keeps the existing command-before-start behavior.

The refactor moves the same behavior behind that one interface; it does not revisit it:

- **Write order and best effort.** A write sets the value first and is authoritative for later reads whether or not the persistence attempt succeeds; a persistence failure is swallowed and does not stop the marker publication that follows, and a publication failure propagates without rolling back the value or the persistence attempt; a `memory` field is never persisted, and repeated writes of the same value are neither deduplicated nor short-circuited — each one records (where the field persists) and republishes.
- **Capability gating.** A retained handle's `read` is not gated or frozen: a handle kept from an earlier life still observes the current value, while its `write` and `feedback` are dropped once that life has ended. A handle minted for an owner whose life has already ended — including the one a `session_end` delivery mints — is inert from birth; a later start opens a life for newly minted handles only and never revives an old one. The `session_end` dispatch keeps its own feedback channel, independent of the capability, so the handler can still speak for the boundary after the owner it names has been retired.
- **Reconciliation.** A delivery whose session is not its own owner is ignored. An end drops the owner's cell and then revokes its retained capabilities, so a late write cannot recreate the cell, and publishes the marker area only for `disposed`. A start opens the life first, then, for a `session-entry` field only, seeds the cell from the **last** payload when that payload declares the field as a boolean — any other payload yields the declared default — and publishes the area; a `memory` field is never seeded, so navigation that keeps the owner keeps its value.

The extension-authoring contract is untouched: no definition, assembly option, delivery type or shared-logic call changes, and the read surface is the same `view`. What changes is `StateStore`'s own surface — `applyTransition`, `seed`, `retire` and the public `ownerLives` give way to `writer`, `capability` and `reconcile` — and that internal surface carries no extension compatibility promise; this section is the explicit decision for it. This records the agreed shape and the behavior it must preserve, not runtime verification of the implementation: the framework suites that pin those behaviors — [`declared-value-write.test.ts`](../../tests/framework/declared-value-write.test.ts), [`owner-capability.test.ts`](../../tests/framework/owner-capability.test.ts), [`session-events.test.ts`](../../tests/framework/session-events.test.ts) and [`owner-gate.test.ts`](../../tests/framework/owner-gate.test.ts) — remain the regression alarm for it.

## Subagent access lifetime and first-use readiness (2026-10-17)

Harness adapters select subagent access capability, not an exclusive process topology: OMP uses the
in-process implementation; pi permits cross-process access when its assembly states a child entry,
while owners served in the same process retain their direct path. This is not a general communication
mode, subagent scheduler or replacement provider. Native provider discovery, child loading, identity
and background-work mapping remain adapter-owned; extension accounting and storage stay extension-owned.

One internal framework module, `core/subagent-access.ts`, owns the assembly's value offers, followed
accesses, observation admissions, hand-over routing and release. State retains values, restoration and
write authority; binding retains observation adoption and semantic dispatch. They report lifecycle
facts to that module rather than owning separate communication lifetimes. The State constructor's
internal rules now accept this access instead of separate publisher/follow inputs; extension interfaces
and the explicit child-entry requirement are unchanged. Access ends after the harness's awaitable
session close-out, never before the last save and its commit notice; transfer does not end it.

The accepted State tradeoff preserves synchronous reads and cross-process initial-value-plus-push
following, not per-use remote confirmation or instantaneous visibility. At the awaitable pre-request
position, first prompt planning and Marker publication wait for the owner's first bounded access
attempt (joining an attempt a prior synchronous read started). Failure keeps the declared default,
without writing it back or treating it as the owner's confirmed value. Later reads retain existing
spaced recovery; later runs do not wait again. Local cells and fields declaring no inheritance need
no access wait. This intentionally changes only first-use waiting; it does not make every synchronous
handler read asynchronous or add a public readiness protocol.

## Two-sided subagent integration checklist (2026-10-17)

Extension authors declare the framework-owned subagent semantics needed for complete integration;
harness adapter authors declare their supported execution modes and supplied semantics per mode.
The extension does not choose or enumerate execution modes. An adapter is responsible for every mode
it declares: coverage in one cannot fill a gap in another, and no adapter is required to implement
both modes. The first checklist covers subagent integration only, not a general capability registry.

Keep two independently invoked stages separate. The integration completeness command compares these
declarations for actual extension/harness discovery entries and reports which extension lacks which
capability in which mode. It does not install or start a harness, inspect compatibility, run tests,
exercise an implementation or claim that the declared wiring behaves correctly. Behavior verification
remains in the existing test/dock/candidate paths and is not invoked by the completeness command.
An incomplete checklist can return a failing command status for developers without refusing an
extension, changing a supported baseline, publishing a user notice or affecting any runtime feature.

`ExtensionDefinition.subagentRequirements` is additive, declaration-only metadata. Each adapter owns
its offline inventory; the independently invoked script owns the catalog and discovers only actual
entrypoints, rather than demanding every extension support every harness. Missing catalog entries
are reported, never silently treated as complete. Declared coverage is maintained by the adapter
author, not inferred by scanning function names; behavioral correctness remains a separate obligation.
For pi, the declaration describes its integrated provider path with the extension's required child
entry, not the presence or health of a provider in a particular run.

This preserves the independent-verification/startup separation. Runtime negotiation, warning policy,
feature gating, `/budget detail` availability and subagent accounting behavior are intentionally
unchanged and are not abstracted by this checklist. Its terms live in the framework glossary and its
command, declarations and capability vocabulary in the capability index.

## Behavior orchestration around State

Treat State as the shared current-value source connecting control, commands, harness events, persistence, instruction contribution, feedback, and ongoing lifecycle effects. Ongoing effects depend on both State and their owning scope: entering an active condition may start work, leaving it or losing the scope must stop work, and restoring State alone does not prove earlier effects are still active. One-shot command actions remain distinct from ongoing effects; neither every State update nor every restore automatically replays side effects. Framework-managed model-context behavior observes the same State but is additionally bound by the mandatory history-preservation contract.

## Extension feedback, marker, and declared-value writes (additive; connect-bot migration, decision 04)

The connect-bot migration fixes the user-visible feedback and status surface so the extension's shared logic names no native UI type and its behavior can be exercised with mocks:

The severity and shared-output wording below was clarified during the [Feedback, Host facts and authoring decision](../../.scratch/framework-capability-cutover/lighthouse/04-host-feedback-authoring.md): the user chose the current three-level code contract (Q4), shared adapter output with separate upper-level wrappers (Q11), and approved publication (Q18). This corrects the earlier two-level wording and clarifies “not merged”; it is not evidence that the planned interface migration or harness verification has completed.

- **One feedback channel.** Extensions publish operator-facing notices through a single harness-independent channel with an `info | warning | error` severity, available on command and semantic-event handlers; the adapter maps it to a UI notification, or to a stderr line when the session has no UI. It is never model-visible — not an injected prompt, a conversation entry, or tool output. Framework notices (such as session warnings) may retain their own upper-level wrapper, while both wrappers share the adapter's single underlying UI/stderr notification implementation. Sharing that output does not merge their lifecycle or grant extensions the framework's internal notice interface. The channel **replaces** the delivery's earlier plain `notify(message)` member, which is removed rather than kept beside it, so an extension says everything it says to the operator in one place at one severity; that replacement is a non-additive interface change and is decided here. The existing toggle feedback keeps its two texts and is published on the new channel, and a `directed` command publishes no framework feedback of its own.
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

Harness version support remains a framework-owned evidence baseline, not an extension-owned runtime list. The approved [independent compatibility verification](../../framework/docs/harness-support.md#independent-compatibility-verification) replaces startup version membership/warnings and required-native-Interface shape guards with separately executed verification and scoped reports. Necessary configuration handling and business failures remain; no automatic verifier or report gate is added to startup. The stored 18.5.0 acceptance record is not changed or extended by this planning revision.

Only advertise a behavior as common when its semantic contract can be satisfied across all declared supported harness targets; identical native API names are not required. The framework may additionally own explicitly harness-qualified capabilities, initially subagent State inheritance on the integrated OMP path but not on pi, and the delivered authority of persisted instruction contributions, whose OMP mapping is recorded from provider serialization while other harnesses remain undecided. Their support conditions and absence must be visible rather than represented as cross-harness parity. This qualifies the earlier common-behavior-only scope; it does not permit silently weakening required semantics. Reject a behavior whose required role or insertion semantics cannot be met rather than silently substituting a weaker behavior. An extension may instead record an explicit, harness-scoped acceptance of a documented absence, as codebase-tools does on OMP for delivered contribution authority; that record is per harness and is not a cross-harness permission. Rejection is **fail-soft**: the unmet requirement is reported on a non-model channel (never in model instructions or conversation history), the affected capability or extension is not bound, no partial registration is left behind, and the harness continues. The same fail-soft rule covers invalid extension definitions, configuration conflicts (duplicate command names, competing State writers, multiple rules for one contribution slot), and initialization failures. Anchor the harness targets and evidence in a [version baseline file](../../framework/docs/harness-support.md), separating source inspection from runtime validation; a version number alone does not establish compatibility across provider protocols or operating modes. Run shared semantic contract scenarios against harness upgrades to detect regressions quickly: failure is an investigation signal, while success does not automatically approve support. A framework maintainer explicitly assesses source changes and/or additional evidence before declaring a new harness version supported.

## Model-cost assembly revision

The user confirmed the complete assembly specification in Q19 of the model-cost migration — source layout, the public binding seam and implementation factory, scope-grouped dispatch, the viewed-session prerequisite, consumer migration and the implementation limits — and the confirmation chain with its explicit old-to-new rulings and the pre-publication revision history are preserved with that migration's planning records. This is an approved target, not implemented code or certification. It supersedes only the interface/lifecycle/compatibility policies named below; existing business contracts, native-import responsibility test, State ownership/inheritance and history preservation remain.

- **Code placement:** separate common semantic core/behaviors, adapter-independent framework/modules, native framework adapters, extension shared logic, extension harness-specific implementation directories, thin harness assembly files and thin loader entrypoints. The first-release tree above remains historical context; the current target layout is the assembly revision recorded in this section. No pi implementation or unused scaffold is authorized.
- **Public binding seam:** common authoring contracts no longer belong to OMP-specific types. The framework owns required configuration processing, factory creation, binding failure cleanup, one-time initialization/first-request waiting and disposal; the extension factory connects business and selected native presentation. It does not create a DI container, public internal dispatch protocol, autodetection or duplicate registration system.
- **Scopes and async:** scoped groups provide Owner-only effects and actual-Session observation. Promise completion/rejection is received without making a save a Session-wide event barrier. Old owner-only dispatch assumptions apply only to Owner subscriptions; connect-bot keeps its behavior and model-cost observes children.
- **Presentation and provider facts:** read-only business views plus invalidation subscriptions separate shared computation from native drawing. A minimal public host Viewed session read/notification prerequisite precedes adapter integration; no private fields or UI-text inference. The framework projects the viewed effective State into its one Marker area without changing Owner.
- **Existing consumers:** migrate connect-bot, codebase-tools and Marker area affected seams together; no legacy production assembly/dispatch/transport shim. Reuse consumer-visible behavior tests, migrate necessary test wiring, retire implementation-detail and superseded-policy assertions rather than repinning them. HTTP consumer scope follows the approved HTTP contract stated above.
- **Compatibility:** the original support topic [independent compatibility verification](../../framework/docs/harness-support.md#independent-compatibility-verification) is the authority for moving native capability and version checks out of normal startup. Required-contract metadata, if retained, is development/verification input only. Reports never become startup gates; configuration/business error handling is not removed.

The assembly revision leaves interface/error/lifetime detail with the migration's decision records rather than duplicating it here. Acceptance and cutover are decided but unexecuted: a real host patch providing the minimal public Viewed-session outlet must be frozen to an exact revision/artifact before verification; scripted acceptance covers normal host flows (requests, multi-turn and tool execution, Round event correlation, pricing boundaries, model switches, mode commands, headless updates, renderer without business side-effects, cross-process storage, safe failures) and human acceptance covers real services, balance/quota values and the visual TUI; new statistics start from empty with old files kept; load-source mutual exclusion applies during the transition; backup, configuration and restart stay user-performed actions; completion is recorded lightly rather than in an evidence platform; and a support statement is an explicit maintainer decision, never inferred from passing tests. None of this has been executed, and the stored support record is unchanged.

**Implementation status (additive record, not a support claim).** One slice of this approved target now exists in the framework, delivered by the `02-public-binding-actions` implementation ticket: the generic assembly information moved out of the OMP-specific option type into the public authoring surface (then [`framework/core/assembly.ts`](../../framework/core/assembly.ts), re-exported through `framework/public.ts`; the authoring contract now lives in [`framework/interface`](../../framework/interface/index.ts)); the implementation factory the adapter calls once after the declared configuration validated; the one-time initialization at the owner session node, waited for by the first model request; the single cleanup on binding failure and on the disposal of the session the instance is serving — an ordinary session switch only moves that owner and cleans nothing — after which that binding delivers nothing, including through the injected implementations of commands the host still holds registrations for, and a binding that arrives after the cleanup builds a fresh instance; contained synchronous throws and promise rejections from handlers that are not awaited; and the `actions` control kind with the framework's routing, help, awaiting and one-report failure policy. Connect-bot's assembly was migrated to the same surface in the same change. A second slice — the general HTTP module ([`framework/modules/http.ts`](../../framework/modules/http.ts), published through the same entry) — exists as of the `03-http-proxy-body-timeout` implementation ticket: one `request` carrying the caller's method, headers, body, wait budget and proxy choice; the framework's own shared `framework/config.yaml` holding `http.proxies` and `http.defaultTimeoutMs`; a proxy selection the shared file cannot satisfy refused before anything is sent instead of falling back to a direct connection; the budget taking the request's value, then the shared default, then the built-in 30000ms, covering the response body as well as the response head; and the runtime's own response, its failures and the configuration refusals passed through without a business envelope. The request is made over the runtime's own `node:http`/`node:https` client rather than the process's `fetch`, whose process-level proxy environment redirects even a request that states a direct connection: a named proxy is connected to at its own address (an absolute request-target for a plain-HTTP target, a CONNECT tunnel for an HTTPS one, over TLS when the proxy's own address is `https://`), and a direct request reaches the target whatever the ambient environment says. The rest of the target — the file module, the HTTP consumers (model-cost's queries and connect-bot's transport), range subscriptions, the Viewed session projection, the pi adapter and the remaining consumer migration — is still unimplemented, and none of this records a real-host, provider or visual acceptance: the [support record](../../framework/docs/harness-support.md) is unchanged.

## Shared integration planning and inspectable authoring (2026-10-20)

The maintainer approved refactoring before implementing the broader integration checker. The framework will own one pure integration planner shared by runtime hook selection and future offline dependency analysis. It expresses actual semantic dependencies and port obligations rather than copying `bindExtension` conditions into a second diagnostic implementation. This change preserves the existing binding behavior; it does not authorize unrelated semantic corrections.

Implementation authoring separates lazy business-state creation from an inspectable subscription, command and lifecycle structure. One framework-owned authoring entry materializes that same structure at runtime. Migrate existing assemblies instead of retaining a raw-factory compatibility path. Business bodies may remain ordinary TypeScript, but the integration shape is intended to become a small statically analyzable language. This revises the earlier assumption that arbitrary factory-returned structures are the long-term authoring seam.

The trade-off is an explicit authoring migration and constraints on integration structure, in exchange for keeping semantic dependency knowledge local and avoiding either whole-program interpretation or duplicate hand-maintained usage inventories. Retain the single shared `HarnessPort`, existing native adapter domains, scoped dispatch and lifecycle semantics. Do not add per-extension ports, runtime registries or capability admission.

AST enforcement of the authoring language, dependency extraction, target comparison and editor integration are deferred. Type-level authoring constraints alone do not enforce literal syntax or prevent arbitrary dynamic construction. This refactor is not the completed checker or a semantic-compatibility proof. The implementation boundary and deferred work are recorded in [the refactor plan](../../.scratch/integration-contract-refactor/spec.md).

## Framework verification as a separate concern

Treat framework verification as a ninth scope area alongside definition/configuration, control/commands, semantic events and State orchestration, storage/recovery, ongoing lifecycle work, instruction contribution, status feedback, and harness adaptation. Shared semantic contract scenarios serve as upgrade regression alarms; the maintainer, not a green test run, decides when a harness version is supported. The first release fixes the scenarios and dock as two separated suites (extension acceptance and framework capability, the latter doubling as the upgrade alarm); later scenarios still belong to detailed design.

## Consequences and unresolved details

- This records the agreed direction, not implementation completion or compatibility of the existing five extensions.
- Existing `readonly-mode` mixed control cannot be claimed as a behavior-preserving migration within the first release. Its migration treatment remains out of first-release scope and to be decided later.
- The `codebase-tools` developer-role injection requirement in ADR-0001 is recast as a harness-qualified capability: the OMP adapter records the provider's serialized role for persisted contributions, and codebase-tools explicitly operates on OMP without developer authority. The recorded facts (2026-10-07, real outbound capture per provider path, see [provider-path role evidence](../../framework/docs/harness-support.md#provider-path-role-evidence-recorded-facts-not-a-gate)) are `user` on `deepseek/deepseek-flash` (`openai-completions`) and `developer` on `openai-codex/gpt-6-luna` (`openai-codex-responses`, shape-only layer 1) — an earlier statement here that both verified paths serialize `user` was a source inference, not a capture, and is superseded. A universal developer-role guarantee is not promised, the role is recorded as a fact rather than an activation or refusal condition, other harnesses remain undecided, and the original ADR-0001 is left untouched as the original extension's record.
- Restart versus extension reload: the implemented first release promises whole-process restart, not hot reload. The new [assembly revision](#model-cost-assembly-revision) specifies binding creation/disposal responsibilities without certifying hot reload. It explicitly authorizes non-additive public assembly/lifecycle migration and standalone compatibility verification, superseding the old runtime missing-capability guard/version warning route; existing consumers migrate together. Other deferred controls and harness support questions retain their original scope.
- For the first release, cross-behavior conflict rules are decided: exactly one rule per contribution slot, exactly one declared writer per State field, and one command name per extension; a conflict is an explicit configuration error handled fail-soft, and no behavior may be resolved implicitly by harness registration order. Composition and precedence among multiple rules per slot, multiple transitions triggered by one semantic event, and other multi-consumer cases remain deferred.
- For the first release, history preservation is enforced by restricting history-affecting writes to the framework's append-only contribution interface; request-only insertion, system-prefix treatment, and the precise shared-file coordination, failure, and freshness guarantees remain open or deferred. The scope of the history guarantee is framework-managed behavior; harness behavior and other extensions are excluded.
