# Semantic Extension Framework

The shared runtime foundation that owns extension behavior contracts and their mappings to the
supported agent runtimes (`pi` and `oh-my-pi`). Extensions import this source directly (see
[ADR 0002](../docs/adr/0002-semantic-extension-framework.md)); the framework must never depend on an
individual extension.

## Layout

| Layer | What lives there |
| --- | --- |
| `core/` | The semantic contracts and the runtime-independent engines: `protocol.ts` (the delivery and capability types), `definition.ts` (the declaration shape and its closed sets), `state.ts`, `config.ts`, `admission.ts`, `baseline.ts`, `owner-lives.ts`, `violations.ts`. |
| `behaviors/` | The semantic behaviors built over those contracts: `admission.ts`, `binding.ts`, `control.ts`, `injection.ts`, `marker.ts`, `round-events.ts`, `session-events.ts`, `state-scope.ts`. |
| `adapters/` | The only native surface: `omp.ts` (the OMP port and assembly) and `modules.d.ts` (the agent-runtime package declarations). Native access is permitted here and nowhere else in the framework. |
| `public.ts` | The single authoring door: `defineExtension` and the definition/configuration types an extension may name. |

[`docs/framework-capabilities.md`](docs/framework-capabilities.md) is the symbol → meaning → source
index of that public surface; the source it cites is authoritative for behavior, ordering and errors.
The native boundary is enforced by
[`../tests/framework/import-boundary.test.ts`](../tests/framework/import-boundary.test.ts).

## Quick start

```bash
bun run typecheck
bun run test:framework      # framework capabilities C1–C15 (the upgrade alarm)
```

The suites are described in the [root README](../README.md#quick-start).

## Human acceptance and cutover

The automated suites (`bun test`) prove the consumer-visible behavior at seams that do not need a
person. Four things are human-only, and this repository does **not** claim any of them yet — they are
recorded as `unverified` in [`docs/agent-runtime-support.md`](docs/agent-runtime-support.md) until a
human runs them:

| ID | Human action | Status |
| --- | --- | --- |
| H1 | Interactive TUI acceptance of the extension-visible behavior (marker, notify, the command) | Pending human run |
| H2 | `openai-codex` layer-2 capture: one real chatgpt.com round trip with a real credential | Pending human run (unverified if no credential) |
| H3 | Permanent cutover, once per migrated extension (remove its superseded implementation + make sure the new discovery root is configured + restart) and a cutover smoke | Pending human run; blocked until H1 passes (connect-bot: until its acceptance round is recorded) |
| H4 | Maintainer explicitly replaces the single supported version and updates the support record | Pending maintainer action |

Run them in order. H3 is blocked until H1 passes; it covers both migrated extensions and runs
per extension (codebase-tools first, then connect-bot). H4 is the same explicit action as step 4 of
[Upgrading the supported agent runtime](#upgrading-the-supported-agent-runtime).

**Isolation rule for every command below.** Run the isolated exact install
(`.cache/omp-baseline/18.5.0`, materialised by the first suite run), keep the agent state in a
throwaway directory via `PI_CODING_AGENT_DIR`, and pass `--no-extensions -e <repo>/entrypoints/omp`
(never the default global install, the formal configuration `~/.omp/agent/config.yml`, or a running
agent). The isolated agent state starts empty, so give it a credential for the model you intend to
run — `PI_CODING_AGENT_DIR=<state> bun <cli> login <provider>`, `--api-key`, or the provider's API-key
environment variable. The `--no-extensions -e` pair is the explicit-only root described in
[load-source mutual exclusion](docs/agent-runtime-support.md#load-source-mutual-exclusion).

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
under which role. Compare with layer 1 — the shape-only capture
[`.scratch/codebase-tools-omp-v1/assets/11/captures/codex/`](../.scratch/codebase-tools-omp-v1/assets/11/captures/codex)
and [`tests/codebase-tools/outbound-role.test.ts`](../tests/codebase-tools/outbound-role.test.ts) — and
with the provider-path role table in
[`docs/agent-runtime-support.md`](docs/agent-runtime-support.md#provider-path-role-evidence-recorded-facts-not-a-gate).
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
2. Restart the agent runtime as a whole process — there is no hot reload and the discovery root is
   never swapped inside a running process.

The per-extension runbooks are
[H3a — cut over codebase-tools](../extensions/codebase-tools/README.md#h3a--cut-over-codebase-tools)
and [H3b — cut over connect-bot](../extensions/connect-bot/README.md#h3b--cut-over-connect-bot).

Automatic contrast: the deployment/mutual-exclusion checks in
[`tests/framework/deployment.test.ts`](../tests/framework/deployment.test.ts) and the mechanism
description in [load-source mutual exclusion](docs/agent-runtime-support.md#load-source-mutual-exclusion);
they prove the loader behavior, not the human cutover.

### H4 — replace the supported version

This is the explicit maintainer action in step 4 of
[Upgrading the supported agent runtime](#upgrading-the-supported-agent-runtime): change
`SUPPORTED_AGENT_RUNTIME_VERSIONS` in [`core/baseline.ts`](core/baseline.ts) — the framework-owned
baseline, since version support belongs to the framework and an extension assembly declares no version
list — update the four-state support record in
[`docs/agent-runtime-support.md`](docs/agent-runtime-support.md), refresh
[`docs/agent-runtime-baseline.json`](docs/agent-runtime-baseline.json) (re-checked by
[`tests/harness/baseline.test.ts`](../tests/harness/baseline.test.ts)), then restart. The candidate
result record from [`scripts/verify-omp-candidate.ts`](../scripts/verify-omp-candidate.ts)
(`.cache/omp-baseline/<version>/candidate-verification.json`) is input to that decision, never the
decision itself.

## Upgrading the supported agent runtime

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

   - change `SUPPORTED_AGENT_RUNTIME_VERSIONS` in
     [`core/baseline.ts`](core/baseline.ts)
     from `["18.5.0"]` to the new exact version — this list is the framework-owned Supported
     agent-runtime baseline, and no extension assembly carries one;
   - update the four-state support record and the upgrade standard in
     [`docs/agent-runtime-support.md`](docs/agent-runtime-support.md) with the new combination,
     evidence and conditions;
   - refresh [`docs/agent-runtime-baseline.json`](docs/agent-runtime-baseline.json) (revision
     anchor, acceptance artifact, lockfiles) so `bun run test:harness` checks the new
     combination instead of the old one;
   - restart the agent runtime. A whole-process restart is required: there is no hot reload and
     the discovery root is never swapped inside a running process.

Until that action is taken, the framework's baseline stays exactly `["18.5.0"]` and an installed
version outside it is warned about once per main session and then continues without a support
claim — that warning is expected behaviour, not a failure.
