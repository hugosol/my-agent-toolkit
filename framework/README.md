# Semantic Extension Framework

The shared harness foundation that owns extension behavior contracts and their mappings to the
supported harnesses (`pi` and `oh-my-pi`). Extensions import this source directly (see
[ADR 0002](../docs/adr/0002-semantic-extension-framework.md)); the framework must never depend on an
individual extension.

## Layout

| Layer | What lives there |
| --- | --- |
| [`interface/`](interface/README.md) | Canonical capability interfaces. The root entry ([`index.ts`](interface/index.ts)) owns `defineExtension` and the definition/implementation authoring contract; Session, State, Prompt, Marker, Feedback, Host facts, Subagent and Command each own their declarations. Session implementation and the Prompt/Marker run facts, contribution result and area transport are not exported here. |
| `core/` | The remaining contracts, internal adapter protocol and harness-independent engines: `protocol.ts` (adapter-facing signals and the internal command invocation types; Command consumer types live in `interface/command`), `definition.ts` (the internal defaults, bound sets and resolution helpers over the canonical definition), `assembly.ts` (internal declaration guards and command-argument normalization), `state.ts`, `observations.ts` (the process's one session observation source: each observed session's activity and latest context reading, which is what a consumer attaching after the fact reads), `followed-owners.ts` (the reading half of the framework's local access: the owners one store follows and the spacing its recovery keeps to), `config.ts`, `requirements.ts` (the complete required-semantic vocabulary: the framework's own invariant plus the declarable lifecycle semantics), `owner-lives.ts`, `violations.ts`. |
| `behaviors/` | The semantic behaviors built over those contracts: `assembly.ts` (one observation source, State store and implementation-reuse life per adapter assembly), `binding.ts`, `actions.ts`, `control.ts`, `lifecycle.ts`, `injection.ts`, `marker.ts`, `subscriptions.ts` (the one scope rule and ordered dispatch every semantic delivery takes), `session-events.ts`, `session-context.ts` (one collected context reading per session: recorded in the source, delivered as the change it is), `round-events.ts` (round identities per actual session), `session-activity.ts` (each actual session's Working/Idle, derived from the round edges) and `turn-events.ts` (the Turn identity, in-flight association, dedup and conflict rules), plus the shared `state-scope.ts`. |
| [`../adapters/`](../adapters/) | Each adapter root has exactly three entries: `index.ts` (public assembly entry), `internal/` (private native types, loaders and the per-binding `port.ts`), and `domain/` (the eight capability domains). `index.ts` assembles the port; `domain/session/events.ts` owns event mappings, `domain/session/queries.ts` reads identity and Session facts, and `domain/session/effects.ts` writes native State entries. Complex Turn and Round protocols remain internal to Session. OMP uses `domain/context/events.ts` and `domain/context/queries.ts`; pi keeps its simple context collection in `domain/context.ts`. `domain/host-facts.ts` reads the harness model catalog and its current provider credentials/addresses. Control, prompt, marker and feedback stay simple single-file mappings under `domain/`; both harnesses expose `domain/subagent/` for their native relationships and integration mappings, with pi's provider protocol kept inside that domain. `internal/native.ts` holds native types and pi's `internal/text-imports.ts` owns Node text loading. These internal files and the assembly are support, not capability domains: `index.ts` is the public adapter entry and `internal/port.ts` is the per-binding `HarnessPort` composition/wiring; neither is a capability. The complete eight-domain path map is in the [adapter navigation](docs/framework-capabilities.md#adapter-implementation-navigation). Extension presentation stays in `extensions/<id>/harnesses/`. |
| `modules/` | The harness-independent capabilities shared logic imports directly rather than receiving through a delivery: `http.ts` (the one `request`, the per-request proxy choice and the wait budget), `files.ts` (the one `updateFile`, the coordination it takes and the publication it makes) and `local-access.ts` (the one way a process offers the declared values of an owner it serves to a session this harness runs in another process, and the way such a session delivers its own observation back to that owner's process — adapter-facing, since an extension never touches it; see [the general HTTP module](docs/framework-capabilities.md#general-http-module), [the general safe-file module](docs/framework-capabilities.md#general-safe-file-module) and [local access](docs/framework-capabilities.md#local-access-adapter-facing)). |
| `public.ts` | The temporary mixed entry for capabilities whose cutover has not landed: the Command delivery/invocation types and the general HTTP module's `request` and `HttpConfigurationError` plus the general safe-file module's `updateFile` and `SafeFileUpdateError`. Authoring is in [`interface/`](interface/index.ts); this entry shrinks as each capability lands and is removed with the final retirement. |

**Session capability cutover:** Session's canonical consumer contracts now live under
[`framework/interface/session`](interface/session/index.ts). Factories receive `context.session`
with isolated observation reads and confirmed-write statements, never the concrete observation
source. Session types are no longer exported by `public.ts` or `core/protocol.ts`; extension imports
cannot reach Session internals. Small supporting State, Prompt, Marker, Feedback and Host facts
contracts live in neighboring interface entries; the Prompt and Marker entries publish declarations
only, and the runtime deliveries no longer carry a marker transport. The root authoring entry now
owns `defineExtension` and the whole definition/implementation contract, and Subagent and Command
have their own canonical entries; Command's runtime delivery cutover and General's public functions
remain in place until their batches. See the [interface reading map](interface/README.md) and
[overall direction and scope](docs/capability-interface-architecture.md).

[`docs/framework-capabilities.md`](docs/framework-capabilities.md) is the symbol → meaning → source
index of that public surface; the source it cites is authoritative for behavior, ordering and errors.
The native boundary is enforced by
[`../tests/framework/import-boundary.test.ts`](../tests/framework/import-boundary.test.ts).

**The assembly the authoring entry leads to.** An extension declares plain data with `defineExtension`, and
what the framework connects to that declaration is an `ExtensionAssembly`: a factory called once the
declared configuration validated — handed the validated values, expected to build the extension's business
instance without sending a remote request or starting a timer — plus the semantics the extension
additionally depends on and the directory its relative configuration path is resolved against. A harness
adapter consumes that value unchanged, so an assembly names no harness. What the factory returns carries
the commands and lifecycle handlers the declarations need and, optionally, the one-time `initialize` the
first model request waits for and the one `cleanup` the disposal of the session the instance serves runs. See
[the implementation factory and its lifecycle](docs/framework-capabilities.md#the-implementation-factory-and-its-lifecycle).

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
- connect-bot: [`extensions/connect-bot/README.md`](../extensions/connect-bot/README.md#h3b--cut-over-connect-bot)

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

The upgrade standard covers **framework capabilities only** (C1–C15, `tests/framework`).
Extension capabilities are covered by `tests/codebase-tools` (permanent, on the fixed version)
plus the human user acceptance at the end of development — they are not part of the long-term
standard.

Verification of another version happens **on demand**, when a maintainer proposes a candidate.
Default and CI always run the fixed supported version; never add a candidate run to CI. Steps 1–2
are mechanical and can be run by a human or an agent; steps 3–4 are human/maintainer actions.

1. **Candidate basic verification (regression alarm).**

   ```bash
   OMP_TEST_VERSION=18.6.1 bun run verify:omp-candidate
   ```

   This installs that exact version into its own isolated prefix `.cache/omp-baseline/18.6.1`,
   runs `bun test tests/framework` against it, and writes a checkable result record to
   `.cache/omp-baseline/18.6.1/candidate-verification.json` (version, prefix, isolation,
   suite exit code and pass/fail counts, and the alarm verdict).

   - `--dry-run` prints the resolved version, prefix and command and changes nothing.
   - `--install-only` materialises the isolated install without running the suite.
   - With `OMP_TEST_VERSION` unset, the same command verifies the fixed supported version.
   - Nothing here touches the default global install, the formal configuration or a running
     agent: all writes stay under `.cache/omp-baseline/`, and every session the suite starts
     runs from the isolated install under a temporary agent state.

   The result is a **regression alarm**: a green run means the framework suite still passes on
   that version. It does **not** certify the version and does not change any support claim.

2. **Extension regression (permanent, fixed version).**

   ```bash
   bun run test:codebase-tools
   ```

3. **Human TUI spot check — only when the upgrade touches an extension-visible surface.**
   Marker rendering, the command, contribution order or role, and session resume are
   extension-visible. When the candidate changes any of them, the maintainer appends one
   interactive TUI spot check of the deployed extension to the checks above (the acceptance
   checklist in
   [H1](../extensions/codebase-tools/README.md#h1--interactive-tui-acceptance-visual) is the same
   surface). When it does not, the candidate suite alone is the alarm.

4. **Replace the supported version — an explicit maintainer action.**
   Only after reviewing the candidate result (and the spot check where step 3 applied):

   - update the four-state support record and the upgrade standard in
     [`docs/harness-support.md`](docs/harness-support.md) with the new combination,
     evidence and conditions;
   - refresh [`docs/harness-baseline.json`](docs/harness-baseline.json) (revision
     anchor, acceptance artifact, lockfiles) so `bun run test:dock` checks the new
     combination instead of the old one;
   - restart the harness. A whole-process restart is required: there is no hot reload and
     the discovery root is never swapped inside a running process.

No framework source declares a supported version, so there is no runtime list to edit: the dock
selects the version it runs from the record (or from `OMP_TEST_VERSION` for a candidate), and a
binding neither warns about nor refuses a harness the record does not list. Until the maintainer
takes that action, the support record stays exactly `18.5.0` and the dock keeps running it — a
harness outside the record is simply not claimed as supported, which is what
[independent compatibility verification](docs/harness-support.md#independent-compatibility-verification)
covers instead of a startup check.
