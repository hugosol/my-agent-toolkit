# my-agent-toolkit

Shared semantic-extension framework plus the `codebase-tools` extension, deployed into the
`oh-my-pi` (`omp`) agent runtime. The framework lives once under [`framework/`](framework) and
extensions import that source directly; `omp` discovers the thin entrypoints under
[`entrypoints/omp/`](entrypoints/omp), which in turn use the implementations under
[`extensions/`](extensions). The architecture decision is
[ADR 0002](docs/adr/0002-semantic-extension-framework.md).

The supported agent runtime is one **exact** version combination, not a range:
`@oh-my-pi/pi-coding-agent@18.5.0` + Windows x64 + Bun 1.4.2. The record, its evidence and the
upgrade rules live in [`docs/agent-runtime-support.md`](docs/agent-runtime-support.md).

## Quick start

```bash
bun install                 # once
bun run typecheck
bun run test:framework      # framework capabilities C1–C15 (the upgrade alarm)
bun run test:codebase-tools # extension behavior (permanent)
bun run test:harness        # the harness and the fixed baseline record
```

The suites that drive a real session materialise the isolated exact install of the supported
version into the gitignored `.cache/omp-baseline/18.5.0` on first run and reuse it afterwards.
Every run uses a temporary agent state directory, so the default global install, the formal
configuration and any running agent are untouched. `bun run test` runs all three suites.

## Document index

| Document | What it is | Read it when |
| --- | --- | --- |
| [`docs/agent-runtime-support.md`](docs/agent-runtime-support.md) | **Authority** for agent-runtime version compatibility: the four-state support record (`verified-supported` / `verified-unlisted` / `unverified` / `unsupported`), its evidence and conditions, the provider-path role evidence, and the long-term upgrade standard and its triggers. | You need to know what is supported, what is not, and how a version becomes supported. |
| [`docs/agent-runtime-baseline.json`](docs/agent-runtime-baseline.json) | Data record of the fixed baseline: the revision anchor, the artifact that actually runs, and the dependency lockfiles. Re-checked by `tests/harness/baseline.test.ts`. | You need the machine-checkable correspondence behind the supported row; refresh it after a deliberate dependency or version change. |
| [`docs/framework-capabilities.md`](docs/framework-capabilities.md) | Index of the framework's public authoring surface: what every `defineExtension` / `ompAdapter` parameter means, each symbol cited to source. | You are writing or reading framework code and need to find an entry point. |
| [`docs/adr/0002-semantic-extension-framework.md`](docs/adr/0002-semantic-extension-framework.md) | The architecture decision for the semantic extension framework. | You are changing the framework's shape or asking why it is built this way. |
| [`docs/semantic-extension-framework-backlog.md`](docs/semantic-extension-framework-backlog.md) | Deferred work and open research gaps. | You are picking up work outside the first-release scope. |
| [`docs/research/prompt-injection-research.md`](docs/research/prompt-injection-research.md) | Source references and exercised scenarios behind the contribution contract. | You are changing contribution timing, placement, retention or role. |
| [`GLOSSARY.md`](GLOSSARY.md) | The project's domain vocabulary, including the supported agent-runtime baseline. | You are naming things in code, tests or docs. |
| [`AGENTS.md`](AGENTS.md) | Repository working agreement for agents. | You are an agent starting work here. |
| [`tests/framework/`](tests/framework) | The framework capability suite (C1–C15). The upgrade regression alarm. | You changed the framework, or you are verifying a candidate version. |
| [`tests/codebase-tools/`](tests/codebase-tools) | The extension behavior suite; runs permanently against the fixed supported version. | You changed the extension. |
| [`tests/harness/`](tests/harness) | The shared harness (isolated install, controlled session, capture) and its self-test. | You are writing a test that drives a real session. |
| [`scripts/verify-omp-candidate.ts`](scripts/verify-omp-candidate.ts) | On-demand candidate verification: isolated exact install + framework suite + result record. | You are verifying another agent-runtime version. |
| [`scripts/capture-codex-outbound.ts`](scripts/capture-codex-outbound.ts) | Prepared layer-2 capture of a real `openai-codex` round trip; needs a human-supplied credential. | You are recording the real-credential role evidence. |
| [`.scratch/connect-bot-migration/`](.scratch/connect-bot-migration) | The migration design record: spec, contract, map, decisions, lighthouse documents, implementation tickets and the run record. | You need the reasoning behind a requirement. |

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

### H1 — interactive TUI acceptance (visual)

```bash
# from the repository root; <state> is a throwaway directory, e.g. .cache/tui-accept/agent-state
PI_CODING_AGENT_DIR=<state> bun \
  .cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts \
  --no-extensions -e entrypoints/omp --model <provider>/<model>
```

Accept only when all of these hold in the real TUI:

1. a clean session starts default-off: no marker, nothing contributed;
2. `/codebase-tools` → notification `codeBaseTools enabled` and the marker `◈ codeBaseTools` appears;
3. the marker is republished on every enabled turn (run two turns and watch it settle again);
4. `/codebase-tools` again → notification `codeBaseTools disabled` and the marker is cleared.

Compare the visuals against the automatic equivalents — same strings, observed as RPC/UI frames
rather than rendered output: notify frames in
[`tests/codebase-tools/command-toggle.test.ts`](tests/codebase-tools/command-toggle.test.ts), the marker
area (`semantic-extensions`, above the editor, text `◈ codeBaseTools`) in
[`tests/codebase-tools/marker-lifecycle.test.ts`](tests/codebase-tools/marker-lifecycle.test.ts), the
declaration in [`extensions/codebase-tools/definition.ts`](extensions/codebase-tools/definition.ts), and
the recorded green run
[`.scratch/codebase-tools-omp-v1/assets/12/codebase-tools-run1.txt`](.scratch/codebase-tools-omp-v1/assets/12/codebase-tools-run1.txt).
The ticket-12 evidence record itself lists H1 as human-led
([`assets/12/README.md`](.scratch/codebase-tools-omp-v1/assets/12/README.md) §5).

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
[`.scratch/codebase-tools-omp-v1/assets/11/captures/codex/`](.scratch/codebase-tools-omp-v1/assets/11/captures/codex)
and [`tests/codebase-tools/outbound-role.test.ts`](tests/codebase-tools/outbound-role.test.ts) — and
with the provider-path role table in
[`docs/agent-runtime-support.md`](docs/agent-runtime-support.md#provider-path-role-evidence-recorded-facts-not-a-gate).
When no credential or capture is available, record the path as `unverified`; it does not block the
first release and is never inferred from layer 1.

### H3 — permanent cutover and cutover smoke

Precondition: H1 passed, so the default environment and the superseded implementation are still intact.
Two extensions are cut over here, each replacing a frozen implementation that lives under the same old
discovery entry: codebase-tools ([H3a](#h3a--cut-over-codebase-tools)) and connect-bot
([H3b](#h3b--cut-over-connect-bot)). The loader does not deduplicate by extension name, so mutual
exclusion is by load source: until its cutover each old implementation keeps its own discovery entry;
the cutover removes it and makes sure the new root is configured before restarting. Only a whole-process
restart takes effect — there is no hot reload, and the discovery root is never swapped inside a running
process. Step 2 and step 3 below are shared: the new root is added once, with the first cutover, and the
restart is required after any of these changes.

#### H3a — cut over codebase-tools

1. Remove the superseded implementation: delete `my-omp-toolkit/extensions/codebase-tools` (repository
   `my-omp-toolkit` at revision `@34d7c40`). The parent discovery entry
   `E:/Developer/myhub/my-omp-toolkit/extensions` stays for the remaining unmigrated extensions.
2. Add the new discovery root: add an entry for
   `E:/Developer/myhub/my-agent-toolkit/entrypoints/omp` to the `extensions:` list of the formal agent
   configuration `~/.omp/agent/config.yml`. That one root carries one thin entrypoint per migrated
   extension (`codebase-tools.ts`, `connect-bot.ts`), so it is added once for both cutovers.
3. Restart the agent runtime as a whole process — there is no hot reload and the discovery root is
   never swapped inside a running process.
4. Smoke once after the cutover: start the runtime normally (no `--no-extensions`) and run
   `/codebase-tools` on→off, confirming the marker and both notifications, and that exactly one
   `codebase-tools` implementation loads (no duplicate registration).
5. Roll back on failure: restore the deleted directory from the original git revision
   (`git -C ../my-omp-toolkit checkout 34d7c4061a74a73b478067882cba7956821f3c1d -- extensions/codebase-tools`),
   drop the added configuration entry if no other migrated extension still needs that root, and restart.
   Persistence compatibility was deliberately abandoned in both directions, so rollback does not read or
   migrate the new `{enabled}` data.

#### H3b — cut over connect-bot

Precondition: the connect-bot acceptance round has been run and recorded — the M-layer observation
checklist in
[lighthouse 06 §6](.scratch/connect-bot-migration/lighthouse/06-acceptance-contract.md) — so the old
implementation is still the one in use. The cutover is the same load-source swap as H3a (reuse steps 2
and 3 above); what differs is the configuration file, the panel rows the old implementation leaves
behind, and the smoke list.

1. Recommended before switching: with the implementation still loaded, disconnect best-effort with
   `/connect-bot off`. It stops the heartbeat locally, unregisters the session with the panel and
   removes the row, so the cutover does not leave a row to age out.
2. Remove the superseded implementation: delete `my-omp-toolkit/extensions/connect-bot` (repository
   `my-omp-toolkit` at revision `@34d7c40`). The parent discovery entry stays for the remaining
   unmigrated extensions.
3. Move the endpoint by hand. The new implementation reads
   `my-agent-toolkit/extensions/connect-bot/config.yaml`, and the framework reads and validates that
   file before the extension registers anything: a missing or illegal file refuses the extension instead
   of letting it connect to an invented address. The committed file points at the panel on the same
   host (`http://127.0.0.1:8787`) instead of the old `config.json`'s `http://omp-bot.local:8787`: the
   panel listens on `0.0.0.0:8787`, a loopback address answers in milliseconds, and resolving the mDNS
   name can take longer than the register's 1s budget on first use (which reads as a failed arm). Copy
   the old value only when the panel runs on another host; then write the address this machine can
   reach. There is no automatic conversion and no state migration — the new implementation persists
   only `{enabled}`.
4. Restart the agent runtime as a whole process (step 3 above).
5. Expect the old implementation's panel rows to expire without an `unregister`: it is no longer
   running, so its rows pass the panel's 30s keep-alive (a ≤35s scan, worst case about 45s), turn
   "offline" and stay until an `unregister` or a panel restart. The new implementation starts
   unconnected, so no new row appears until a session runs `/connect-bot`.
6. Smoke once after the cutover: start the runtime normally (no `--no-extensions`) against a running
   panel whose `listen_addr` covers `config.yaml`'s `endpoint`, and confirm:

   - **接入** — `/connect-bot` registers the current session: the marker `◈ connectBot` appears, the
     panel shows one row within about 1s (a new session is `空闲`), and the notification reports the
     online-session count.
   - **重注册** — `/connect-bot` again reuses and refreshes the same row: one row, no flicker, count
     unchanged.
   - **轮次结束** — the row moves `工作中` → `等待用户输入` when a turn ends.
   - **主动离线** — `/connect-bot off` notifies the disconnect, clears the marker and removes the row.
   - **失联** — with the panel stopped, the first failed push notifies once, and about 30s (three
     consecutive failures) later the extension disarms itself with a notice and the marker disappears;
     it does not reconnect on its own.
   - **切会话** — a session switch unregisters the old id best-effort, drops the local connection and
     leaves the new session unconnected, while `/reload`, a same-file `/resume`, `/clear` and `/tree`
     change nothing.
   - **多会话隔离** — two instances keep two independent rows, and subagent activity neither adds a row
     nor changes the parent's state.
   - **与 codebase-tools 共存** — both markers share the framework's marker area in id order, and both
     commands work without affecting each other.
   - and exactly one `connect-bot` implementation loads (no duplicate registration).

7. Roll back on failure: restore the deleted directory from the original git revision
   (`git -C ../my-omp-toolkit checkout 34d7c4061a74a73b478067882cba7956821f3c1d -- extensions/connect-bot`),
   which brings the old `config.json` back with it, drop the added configuration entry if no other
   migrated extension still needs that root, and restart. The rollback is symmetric: the new
   implementation also sends no `unregister`, so its rows age out the same way, and persistence
   compatibility was abandoned in both directions.

Automatic contrast: the deployment/mutual-exclusion checks in
[`tests/framework/deployment.test.ts`](tests/framework/deployment.test.ts) and the mechanism description
in [load-source mutual exclusion](docs/agent-runtime-support.md#load-source-mutual-exclusion); they prove
the loader behavior, not the human cutover.

### H4 — replace the supported version

This is the explicit maintainer action in step 4 of
[Upgrading the supported agent runtime](#upgrading-the-supported-agent-runtime): change
`supportedVersions` in [`extensions/codebase-tools/runtimes/omp.ts`](extensions/codebase-tools/runtimes/omp.ts),
update the four-state support record in [`docs/agent-runtime-support.md`](docs/agent-runtime-support.md),
refresh [`docs/agent-runtime-baseline.json`](docs/agent-runtime-baseline.json) (re-checked by
[`tests/harness/baseline.test.ts`](tests/harness/baseline.test.ts)), then restart. The candidate result
record from [`scripts/verify-omp-candidate.ts`](scripts/verify-omp-candidate.ts)
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
   checklist in [H1](#h1--interactive-tui-acceptance-visual) is the same surface). When it does
   not, the candidate suite alone is the alarm.

4. **Replace the supported version — an explicit maintainer action.**
   Only after reviewing the candidate result (and the spot check where step 3 applied):

   - change `supportedVersions` in
     [`extensions/codebase-tools/runtimes/omp.ts`](extensions/codebase-tools/runtimes/omp.ts)
     from `["18.5.0"]` to the new exact version;
   - update the four-state support record and the upgrade standard in
     [`docs/agent-runtime-support.md`](docs/agent-runtime-support.md) with the new combination,
     evidence and conditions;
   - refresh [`docs/agent-runtime-baseline.json`](docs/agent-runtime-baseline.json) (revision
     anchor, acceptance artifact, lockfiles) so `bun run test:harness` checks the new
     combination instead of the old one;
   - restart the agent runtime. A whole-process restart is required: there is no hot reload and
     the discovery root is never swapped inside a running process.

Until that action is taken, `supportedVersions` stays exactly `["18.5.0"]` and an installed
version outside it is warned about once per main session and then continues without a support
claim — that warning is expected behaviour, not a failure.
