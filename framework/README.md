# Semantic Extension Framework

The shared harness foundation that owns extension behavior contracts and their mappings to the
supported harnesses (`pi` and `oh-my-pi`). Extensions import this source directly (see
[ADR 0002](../docs/adr/0002-semantic-extension-framework.md)); the framework must never depend on an
individual extension.

## Reading paths

Start with the [documentation map](docs/README.md), organized by audience:

- **Extension developers:** [finding capabilities and organizing extension code](docs/extension-development-map.md), with [model-cost layering](docs/capability-layering.md) as the worked example.
- **Harness integrators:** [adapter integration and semantic comparison](docs/harness-integration.md).
- **Framework maintainers:** [layering and inspectability principles](docs/capability-interface-architecture.md).

The two verification runbooks are separate: [integration check](docs/integration-check.md) checks source-derived demand against actual adapter wiring; [harness version verification](docs/harness-support.md#version-verification) checks an exact version through behavior suites and real-host observations. Neither replaces the other. This README owns the layout and human execution entry, not another copy of those runbooks.

## Layout

| Layer | What lives there |
| --- | --- |
| [`interface/`](interface/README.md) | Canonical capability interfaces. The root entry ([`index.ts`](interface/index.ts)) owns `defineExtension` and the definition/implementation authoring contract; Session, State, Prompt, Marker, Feedback, Provider, Subagent and Command each own their declarations, and General's three general modules are direct entries: HTTP owns `request`, its options and its configuration failure at [`general/http.ts`](interface/general/http.ts), safe files own `updateFile` and its option/error declarations at [`general/files.ts`](interface/general/files.ts), and configuration owns `getConfig` and `ExtensionConfigError` at [`general/config.ts`](interface/general/config.ts). Session implementation and the Prompt/Marker run facts, contribution result and area transport are not exported here. |
| `runtime/` | The single internal port between the framework and an adapter: [`port.ts`](runtime/port.ts) owns `HarnessPort`, the semantic deliveries and observations, the adapter-facing transports, the command invocation and the binding outcomes. It refers to the canonical declarations in `interface/` and re-exports none of them. Extensions never import this tree. |
| `core/` | The remaining internal contracts and harness-independent engines: `definition.ts` (the internal defaults, bound sets and resolution helpers over the canonical definition), `assembly.ts` (internal declaration guards and command-argument normalization), `state.ts`, `startup.ts` (the selected startup policy document: the per-extension initial activation choice, read through the configuration seam and applied by the State store at the process's first owner session start), `observations.ts` (the process's one session observation source: each observed session's activity and latest context reading, which is what a consumer attaching after the fact reads), `followed-owners.ts` (the reading half of the framework's local access: the owners one store follows and the spacing its recovery keeps to), `config.ts`, `requirements.ts` (the complete required-semantic vocabulary: the framework's own invariant plus the declarable lifecycle semantics), `owner-lives.ts`, v… |
| `behaviors/` | The semantic behaviors built over those contracts: `assembly.ts` (one observation source, State store and implementation-reuse life per adapter assembly), `binding.ts`, `actions.ts`, `control.ts`, `lifecycle.ts`, `injection.ts`, `marker.ts`, `subscriptions.ts` (the one scope rule and ordered dispatch every semantic delivery takes), `session-events.ts`, `session-context.ts` (one collected context reading per session: recorded in the source, delivered as the change it is), `round-events.ts` (round identities per actual session), `session-activity.ts` (each actual session's Working/Idle, derived from the round edges) and `turn-events.ts` (the Turn identity, in-flight association, dedup and conflict rules), plus the shared `state-scope.ts`. |
| [`../adapters/`](../adapters/) | `index.ts` is each harness's public assembly entry. Pi's native extension contract is under `native/core/extensions/`: structural `types.ts`, Node `text-imports.ts`, commands, prompt delivery and context readings. `native/core/session-manager/state.ts` owns its complete State entry naming, branch reads and append protocol; `native/core/model-registry.ts` owns its catalog prices and live provider access. These source paths are private implementation navigation, not new extension interfaces. The private port composes `HarnessPort` without interpreting these protocols. OMP's native mappings and Pi's remaining lifecycle/provider mappings are located in the [adapter navigation](docs/framework-capabilities.md#adapter-implementation-navigation). Extension presentation stays in `extensions/<id>/harnesses/`. |
| `modules/` | The harness-independent implementations behind the general functions shared logic imports directly rather than receiving through a delivery: `http.ts` (the deep implementation behind [`interface/general/http.ts`](interface/general/http.ts): the shared proxy table, the per-request choice and the wait budget), `files.ts` (the deep implementation behind [`interface/general/files.ts`](interface/general/files.ts): the one `updateFile`, the coordination it takes and the publication it makes) and `local-access.ts` (the one way a process offers the declared values of an owner it serves to a session this harness runs in another process, and the way such a session delivers its own observation back to that owner's process — adapter-facing, since an extension never touches it; see [the general HTTP module](docs/framework-capabilities.md#general-http-module), [the general safe-file module](docs/framework-capabilities.md#general-safe-file-module) and [local access](docs/framework-capabilities.md#local-access-adapter-facing)). |

**Capability interface cutover:** Every capability's canonical consumer contracts now live under
[`framework/interface`](interface/index.ts). Factories receive `context.session`
with isolated observation reads and confirmed-write statements, never the concrete observation
source. State, Prompt, Marker, Feedback, Provider, Subagent and Command each own their
declarations; the Prompt and Marker entries publish declarations only, and the runtime deliveries
carry no marker transport. The root authoring entry owns `defineExtension` and the whole
definition/implementation contract. Command's runtime delivery is narrowed to its approved members:
the adapter's persistence callback and the marker-area transport are not reachable from a handler.
General's HTTP, safe-file and configuration calls live at their own direct interface entries.
Session, State, authoring, Subagent, Command and General types have no compatibility re-export from
any mixed entry or the internal [`runtime/port.ts`](runtime/port.ts); extension imports cannot reach
framework internals. The former temporary `public.ts` mixed entry is removed, and the seven former
extension import exceptions are cleared. See the [interface reading map](interface/README.md) and
[overall direction and scope](docs/capability-interface-architecture.md).

[`docs/framework-capabilities.md`](docs/framework-capabilities.md) is the symbol → meaning → source
index of that public surface; the source it cites is authoritative for behavior, ordering and errors.
The native boundary is enforced by
[`../tests/framework/import-boundary.test.ts`](../tests/framework/import-boundary.test.ts).

**The assembly the authoring entry leads to.** An extension declares plain data with `defineExtension` and
its implementation with `defineImplementation`: `create(context)` builds the one business state, while
the declaration's static subscription groups, command slots, catalog selector and lifecycle entries name
handlers that receive that state. The authored declaration is inspectable before `create` runs, so the
framework can select a binding's requirements without executing extension code; it is the only requirement
inventory — there is no parallel list. An `ExtensionAssembly` supplies that authored implementation plus
the directory its relative configuration path is resolved against, and the startup policy document the
entrypoint's mode selected (`startupPolicy`) — the only thing the manual and automatic entrypoints of one
extension differ in. A harness adapter consumes the value unchanged, so an assembly names no harness. The
one-time `initialize` is still what the first model request waits for, and the one `cleanup` is still what
the disposal of the session the instance serves runs. See
[the authored implementation and its lifecycle](docs/framework-capabilities.md#the-authored-implementation-and-its-lifecycle)
and [extension startup modes and the startup policy](docs/framework-capabilities.md#extension-startup-modes-and-the-startup-policy).

## Quick start

```bash
bun run typecheck
bun run test:framework      # framework capabilities C1–C15 (the upgrade alarm)
```

The suites are described in the [root README](../README.md#quick-start).

## Human acceptance and cutover

The automated suites (`bun test`) prove the consumer-visible behavior at seams that do not need a
person. Four things are human-only, and this repository does **not** claim any of them yet — they are
recorded as `unverified` in [`docs/harness-support.md`](docs/harness-support.md) until a
human runs them:

| ID | Human action | Status |
| --- | --- | --- |
| H1 | Interactive TUI acceptance of the extension-visible behavior (marker, notify, the command) | Pending human run |
| H2 | `openai-codex` layer-2 capture: one real chatgpt.com round trip with a real credential | Pending human run (unverified if no credential) |
| H3 | Permanent cutover, once per migrated extension (remove its superseded implementation + make sure the new discovery root is configured + restart) and a cutover smoke | Pending human run; blocked until H1 passes (connect-bot: until its acceptance round is recorded) |
| H4 | Maintainer explicitly replaces the single supported version and updates the support record | Pending maintainer action |

Run them in order. H3 is blocked until H1 passes; it covers both migrated extensions and runs
per extension (codebase-tools first, then connect-bot). H4 is the same explicit action as step 4 of
[Upgrading the supported harness](#upgrading-the-supported-harness).

**The model-cost migration is a separate, later acceptance round** with its own H1 (real interactive
TUI) and H2 (real provider effect) checks, its own frozen combined host artifact and its own manual
cutover and rollback checklist; the per-promise scenarios and the prepared material are in
[`extensions/model-cost/README.md`](../extensions/model-cost/README.md#human-acceptance). Nothing in
that round is claimed until the user confirms it, and the same isolation rule below applies to every
command it runs.

**Isolation rule for every command below.** Run the isolated exact install
(`.cache/omp-baseline/18.5.0`, materialised by the first suite run), keep the agent state in a
throwaway directory via `PI_CODING_AGENT_DIR`, and pass `--no-extensions -e <repo>/entrypoints/omp`
(never the default global install, the formal configuration `~/.omp/agent/config.yml`, or a running
agent). The isolated agent state starts empty, so give it a credential for the model you intend to
run — `PI_CODING_AGENT_DIR=<state> bun <cli> login <provider>`, `--api-key`, or the provider's API-key
environment variable. The `--no-extensions -e` pair is the explicit-only root described in
[load-source mutual exclusion](docs/harness-support.md#load-source-mutual-exclusion).

The per-extension runbooks that carry H1 and H3 are:

- codebase-tools: [`extensions/codebase-tools/README.md`](../extensions/codebase-tools/README.md#h1--interactive-tui-acceptance-visual)
- connect-bot: [`extensions/connect-bot/README.md`](../extensions/connect-bot/README.md#h1d--automatic-startup-interactive-acceptance-p18-p19-visual)
  for the automatic startup's marker/failure display, and
  [`#h3b`](../extensions/connect-bot/README.md#h3b--cut-over-connect-bot) for the cutover round

### H2 — openai-codex layer-2 real-credential delivery

```bash
bun scripts/capture-codex-outbound.ts --prepare   # isolated settings + the wizard steps, changes nothing else
#   ... run the printed wizard step (login openai-codex, or auth-broker import) by hand
bun scripts/capture-codex-outbound.ts --run       # one real turn; the request JSON is recorded
```

`--prepare` prints the exact `PI_CODING_AGENT_DIR=… bun <isolated 18.5.0 cli> login openai-codex`
command; the credential lands in that directory's `agent.db` and never enters a prompt or this
repository. `--run` without a credential exits non-zero and re-prints those steps — that is the
expected not-yet-delivered state. A completed run records `rr-session-N.json` request bodies plus the
session JSONL under `.cache/codex-layer2/captures/`, and reports where the injected prompt landed and
under which role. Compare with layer 1 — the shape-only capture on this path recorded the injected
prompt as a trailing `input` item with role `developer`, while `instructions` does not carry it
(exercised by [`tests/codebase-tools/outbound-role.test.ts`](../tests/codebase-tools/outbound-role.test.ts)) — and
with the provider-path role table in
[`docs/harness-support.md`](docs/harness-support.md#provider-path-role-evidence-recorded-facts-not-a-gate).
When no credential or capture is available, record the path as `unverified`; it does not block the
first release and is never inferred from layer 1.

### H3 — permanent cutover and cutover smoke

Precondition: H1 passed, so the default environment and the superseded implementation are still intact.
Each migrated extension is cut over by replacing a frozen implementation that lives under the same old
discovery entry. The loader does not deduplicate by extension name, so mutual exclusion is by load
source: until its cutover each old implementation keeps its own discovery entry; the cutover removes it
and makes sure the new root is configured before restarting. Only a whole-process restart takes effect —
there is no hot reload, and the discovery root is never swapped inside a running process.

These two steps are shared by every extension's cutover. Run them once, with the first cutover, and
repeat the restart after any of these changes:

1. Add the new discovery root: add an entry for
   `E:/Developer/myhub/my-agent-toolkit/entrypoints/omp` to the `extensions:` list of the formal agent
   configuration `~/.omp/agent/config.yml`. That one root carries one thin entrypoint per migrated
   extension (`codebase-tools.ts`, `connect-bot.ts`), so it is added once for both cutovers.
2. Restart the harness as a whole process — there is no hot reload and the discovery root is
   never swapped inside a running process.

The per-extension runbooks are
[H3a — cut over codebase-tools](../extensions/codebase-tools/README.md#h3a--cut-over-codebase-tools)
and [H3b — cut over connect-bot](../extensions/connect-bot/README.md#h3b--cut-over-connect-bot).

Automatic contrast: the deployment/mutual-exclusion checks in
[`tests/framework/deployment.test.ts`](../tests/framework/deployment.test.ts) and the mechanism
description in [load-source mutual exclusion](docs/harness-support.md#load-source-mutual-exclusion);
they prove the loader behavior, not the human cutover.

### H4 — replace the supported version

This is the explicit maintainer action in step 4 of
[Upgrading the supported harness](#upgrading-the-supported-harness). Support is an evidence claim
recorded in this repository, not a runtime list: update the four-state support record in
[`docs/harness-support.md`](docs/harness-support.md), refresh
[`docs/harness-baseline.json`](docs/harness-baseline.json) (re-checked by
[`tests/harness-dock/baseline.test.ts`](../tests/harness-dock/baseline.test.ts)), then restart. No
framework source declares a supported version any more and normal startup reads none — the dock
selects the version to run from the record (or from `OMP_TEST_VERSION` for a candidate), and a
binding neither warns about nor refuses a harness the record does not list. The candidate
result record from [`scripts/verify-omp-candidate.ts`](../scripts/verify-omp-candidate.ts)
(`.cache/omp-baseline/<version>/candidate-verification.json`) is input to that decision, never the
decision itself.

## Upgrading the supported harness

The complete procedure now lives in [Harness version verification](docs/harness-support.md#version-verification): fixed-baseline checks, exact-version candidate verification, extension regressions, real-host scripts, evidence limits and the explicit maintainer promotion step.

The long-term upgrade alarm covers framework capabilities, not every extension promise. Candidate runs are on demand, isolated from the default installation, and do not automatically change support status. Support records, upgrade criteria and version evidence are maintained only in [`harness-support.md`](docs/harness-support.md), with the machine-checkable baseline in [`harness-baseline.json`](docs/harness-baseline.json).
