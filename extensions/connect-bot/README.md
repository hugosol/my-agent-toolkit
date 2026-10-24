# connect-bot

Joins an agent session to the herdr-bot panel; `/connect-bot` registers the current session,
`/connect-bot off` disconnects it. The declaration is [`definition.ts`](definition.ts), its
harness-independent logic is under [`shared-logic/`](shared-logic). Its OMP assembly is
[`harnesses/omp-assembly.ts`](harnesses/omp-assembly.ts), and its Pi assembly is
[`harnesses/pi-assembly.ts`](harnesses/pi-assembly.ts), each behind one thin entrypoint per
[startup mode](#startup-modes).

## Registration completion failures

Register attempts remain serialized per owner. A failed configuration, state callback or feedback
continuation is diagnosed once through the framework's non-model stderr diagnostics, independently
of the feedback transport that may have failed. Diagnostics identify the failed operation without
printing arbitrary exception payloads. The failed attempt releases its processing slot;
already queued registrations and later `/connect-bot` commands can still run. This does not retry the
failed attempt or change invalidation at off/session end.

Unregister remains best-effort for ordinary request failures. Its disconnecting window is cleared
when preparation or the request settles, including configuration failures; a throwing completion
notification is diagnosed without preventing a later activation. A late unregister still clears
only its own window, never a newer owner's stop. Detached transferred-session row releases also
own unexpected preparation failures through diagnostics; ordinary request failures retain the
panel-expiry behavior.

## Session harness type

Every native registration reports `data.agentType`: the Pi assembly sends `pi`, and the OMP
assembly sends `omp`, for both manual and automatic startup. This fact comes from the native
assembly, never from a model, session name, or Bot template. It does not change state reporting,
heartbeat cadence, shutdown monitoring, or retry behavior.

The panel's open registration boundary accepts older extensions without this field and preserves
future string values. Its current UI recognizes only `pi` and `omp`; missing or unrecognized
values display `未知` beside the session name rather than being guessed as a known harness.

## History persistence feedback

An accepted registration and persistent history are separate results. A registered receipt with
`historySaved: false` still arms the session, retains its marker, starts the ordinary state reports
and heartbeat, and does not spend the connection failure budget. Pi and OMP both show a **warning**
to the operator saying the connection succeeded but history could not be saved. This uses the normal
UI/stderr feedback transport, never model context. Receipts from older panels that do not report
history status keep their existing connection-only meaning; they do not claim history was saved.

There is no autonomous re-register or history retry. After correcting the panel's storage fault,
explicitly run `/connect-bot` again to attempt saving history. Existing rows retain their first
successful persistence time; a previously unsaved conversation is collected only on success.

`history-warning.test.ts` observes the actual command, visible warning, marker and controlled
heartbeat cadence. `history-interop.test.ts` additionally uses real HTTP and isolated panel storage,
checks both native callers, explicit recovery and completion shutdown monitoring/countdown without
executing any real shutdown. The shared panel helper defaults to the sibling checkout's
`backend/target/debug/examples/safe_shutdown_shell(.exe)`, built with
`cargo build --example safe_shutdown_shell --manifest-path ../herdr-bot/backend/Cargo.toml`.
For a checkout elsewhere (including a temporary worktree), set `HERDR_BOT_BINARY` to that safe example
and `HERDR_BOT_METADATA` to its delivered `meta-data/bot-options.toml`. The helper rejects a missing
example with build instructions and rejects a non-safe backend before sending any panel requests;
it never falls back to the production executable, whose power-off action is real. Each instance
uses its own configuration and storage, binds an ephemeral loopback port, and reads both subscription
and snapshots over dedicated `node:http` connections to that listener, independent of process-wide
Bun fetch transport. It waits for the panel's initial event-stream snapshot before handing its
endpoint to a caller. Subscription failures surface
as fixture failures rather than being silently discarded; startup failures retain the endpoint,
child exit status before cleanup, structured cause, and fully drained process output. No reconnect
or retry is added.

## Startup modes

connect-bot is assembled in one of two **startup modes**. The mode is selected statically by the
entrypoint the host loads through its ordinary `-e`/`--extension` parameter; no profile argument,
environment value or command-line switch chooses it.

| Mode | OMP entrypoint | Pi entrypoint | Policy document | What starts |
| --- | --- | --- | --- | --- |
| Manual | [`entrypoints/omp/connect-bot.ts`](../../entrypoints/omp/connect-bot.ts) | [`entrypoints/pi/connect-bot.ts`](../../entrypoints/pi/connect-bot.ts) | [`manual.yaml`](../../entrypoints/startup/manual.yaml) | nothing — `/connect-bot` arms the session |
| Automatic startup | [`entrypoints/omp-auto/connect-bot.ts`](../../entrypoints/omp-auto/connect-bot.ts) | [`entrypoints/pi-auto/connect-bot.ts`](../../entrypoints/pi-auto/connect-bot.ts) | [`auto.yaml`](../../entrypoints/startup/auto.yaml) | the same arm operation, attempted at the process's first main session start |

Each harness's two entrypoints re-export its shared assembly and use the same extension
definition; the two policy blocks select the initial choice. Both assemblies use
[`startup-modes.ts`](harnesses/startup-modes.ts), which derives each document's absolute path from its own
module location, so the mode is not affected by the working directory. Load **one** mode's
entrypoint for this extension, never both: the host adds extension sources rather than merging
them, so two modes in one process would bind the extension twice. There is no duplicate-name
detection, automatic merge or misuse warning behind that rule — the load source is the only place
the choice exists.

**The choice is per extension, and the mode owns only the startup policy.** A session may load
codebase-tools' automatic entrypoint beside connect-bot's manual one by naming each extension's
chosen file; a discovery directory contributes only the modes it contains (`entrypoints/omp` is
manual-only, `entrypoints/omp-auto` is automatic-only). The panel endpoint and request budget are
not mode-specific: both entrypoints read the same [`config.yaml`](config.yaml) once per process,
so choosing a startup mode neither duplicates nor changes the business connection parameters, and
an edit to that file still takes effect only in the next process.

Pi loads the same shared business logic through the existing public `piAdapter`. Its assembly
reads the native session id, working directory, model display name and session name, and supplies
unref'd Node heartbeat timers because Pi has no context-owned interval API. The shared registration
lifecycle cancels each timer on off or owner end; binding cleanup also clears remaining timers.
No subagent integration is requested: connect-bot controls only its own main session. Configuration
and startup-policy paths resolve from the repository location, not the process working directory.

For explicit Pi loading, select exactly one entry (replace the path with this repository's absolute
path):

```sh
pi --no-extensions -e /absolute/path/my-agent-toolkit/entrypoints/pi/connect-bot.ts
# Or automatic startup:
pi --no-extensions -e /absolute/path/my-agent-toolkit/entrypoints/pi-auto/connect-bot.ts
```

Check the structural connection with
`bun run check:integrations --extension connect-bot --adapter pi --json`.
Entry availability and a complete static check do not promote a harness support status, prove
native semantic equivalence, or deploy anything formally. Version evidence belongs to the
[host support record](../../framework/docs/harness-support.md).

**Pi verification limit:** basic entrypoint/registration scenarios were observed, but full lifecycle
parity is not established. On the exercised Pi 1.4.0 RPC path, `new_session` triggered a new
automatic registration rather than preserving the process-first-start-only policy described below;
closing RPC stdin while armed did not produce an unregister within the observation window.
These are known runtime gaps, not a complete lifecycle acceptance. Use `/connect-bot off` before
closing that path. Exact evidence and limitations live in the
[Pi connect-bot record](../../framework/docs/harness-support.md#pi-connect-bot-entrypoint-evidence).

**Loading is not enabling, and a startup target is not a connection.** The automatic document states
`enabled: true`, and the framework hands that enabling intent to the same business operation
`/connect-bot` runs: it enqueues a panel registration. The extension is not "connected" because it
was loaded, because the intent was stated, or because the register request was enqueued. The
declared `enabled` value — and therefore the `◐ connectBot` marker — stays off until a valid panel
receipt arrives. A refusal — or any other answer that is not a valid registered receipt, including
a request that never completes — leaves it off with no marker, no state report and no heartbeat,
and reports the extension's existing failure text; the agent keeps working.

**The attempt never blocks the agent.** The registration is queued and the startup entry returns
immediately, exactly as the command path does. The process's first model request is issued whether
the panel has answered or not. The framework does not add a completion barrier, a retry, or a
general background queue for this: an attempt the panel refuses is simply over, and a later
`/connect-bot` is the operator's retry. An `off` while an attempt is on the wire invalidates it, and
the end of the owner's session invalidates every attempt that owner still has outstanding, so a
late receipt cannot enable a session that has moved on. The existing initialization and subagent
integration waits are untouched by this: the startup entry is called beside them, not added to
them.

**The startup attempt belongs to the process's first main session start.** A new, resumed or forked
session after it — and a navigation that keeps the same owner — follows the ordinary session rules:
it starts unarmed unless something in this process arms it, and the policy is not applied again. An
edit to the selected document likewise takes effect only in the next process; the running process
keeps the value and the connection it read at binding.

**State is not remembered across starts.** connect-bot still declares `memory` persistence and
`none` inheritance. A previous process's row, an old persisted payload, or a subagent's activity
never stands in for this process's own register; only a receipt from this session's attempt enables
it. A process that **starts by resuming** a session is still making its first owner start, so that
session takes the selected mode's choice: a manual-mode resume stays off, and an automatic-mode
resume attempts its register then. The old branch payload is never read (memory State is never
seeded from it) and the startup attempt writes no value of its own — the receipt-backed activation
is what writes `enabled`. After startup, `/connect-bot` and `/connect-bot off` keep their ordinary
directed-command semantics, including repeated invocations and the existing no-UI/subagent refusals.

Evidence: [`tests/connect-bot/startup-modes.test.ts`](../../tests/connect-bot/startup-modes.test.ts)
drives both entrypoints, the controlled latch, the failure shapes and the admission refusals at the
OMP assembly seam;
[`tests/connect-bot/startup-lifecycle.test.ts`](../../tests/connect-bot/startup-lifecycle.test.ts)
holds the attempt across an `off`, a transfer and a disposal on a controlled clock;
[`tests/harness-dock/connect-bot-startup.test.ts`](../../tests/harness-dock/connect-bot-startup.test.ts)
loads the real entrypoint files into the fixed harness, reads the panel double's requests and the
marker frames, and restores sessions across independent processes — including a planted old
`{enabled:true}` payload and the no-payload control (P19, P22, P24);
[`tests/harness-dock/connect-bot-lifecycle.test.ts`](../../tests/harness-dock/connect-bot-lifecycle.test.ts)
runs the races, the post-start navigation and a policy edit beside codebase-tools in real isolated
sessions.

## Transport and configuration

The extension's outbound call is the framework's general HTTP interface — `request` from
[`framework/interface/general/http.ts`](../../framework/interface/general/http.ts) — rather than a transport of its own: each panel
request states a direct connection (`proxy: false`) and the extension's own configured wait, and the
framework's client makes the connection and imposes the budget, over the whole exchange the body read
included. The protocol on the wire is unchanged: one route (`/api/sessions/events`), one
`{sessionId, kind, data?}` envelope per kind, JSON, and a non-2xx answer interpreted by the
extension rather than by the transport
([framework capabilities § General HTTP module](../../framework/docs/framework-capabilities.md#general-http-module)).

## Configuration

connect-bot's panel endpoint and its request budget are plain values in one file the framework reads
and validates at binding: [`config.yaml`](config.yaml)
(the convention `extensions/<id>/config.yaml`, overridable through `config.path`). That file is the
**only** source — the committed file *is* the repository's default, and there is no code default, no
environment override and no hot-reload entry — so a missing or illegal value refuses the extension at
binding instead of letting it run on an invented one.

| Key | Meaning |
| --- | --- |
| `endpoint` | The panel base URL. |
| `requestTimeoutMs` | The wait budget of **one** HTTP request, in **milliseconds** (a whole number, 1–2147483647). |

`requestTimeoutMs` is one budget for every request the extension makes — `register` (`/connect-bot`),
the explicit `unregister` (`/connect-bot off`), the session-end/switch `unregister`, and the
background heartbeat/state pushes — with no per-operation timeout left; the repository ships `1000`.
A validated configuration is read once per extension per process, so **a changed value takes effect
only after restarting the harness**, never inside the running process
([`tests/connect-bot/request-timeout.test.ts`](../../tests/connect-bot/request-timeout.test.ts)). The
behaviour is the same field the framework's `milliseconds` type and its "read once per process, no
environment or command-line override" rule describe
([framework capabilities](../../framework/docs/framework-capabilities.md#extension-configuration-declaration--file)).

Two facts this budget does not decide, and which the smoke list below must not confuse: a client that
has stopped waiting is **not** evidence that the panel did not receive or apply a request — a request
can be received, processed and applied while its answer is still on its way — and Panel session
registration (the panel's row) is a different thing from Panel session online status (the panel's own
judgement that a row has been heard from recently enough). The panel's two session windows
(`[sessions] online_timeout_seconds`, delivered default 10s, and `offline_retention_seconds`,
default 30s) and its fixed 5s scan cadence are server-side numbers derived from nothing this
extension sends, so adjusting `requestTimeoutMs` requires **no change to herdr-bot**
([`tests/connect-bot/panel-registration-lifecycle.test.ts`](../../tests/connect-bot/panel-registration-lifecycle.test.ts)).
Both terms are this context's vocabulary in [GLOSSARY.md](GLOSSARY.md).

## H1d — automatic startup interactive acceptance (P18, P19; visual)

The automated face of this round is
[`tests/harness-dock/connect-bot-startup.test.ts`](../../tests/harness-dock/connect-bot-startup.test.ts):
a held register keeps the marker off while the independent capture endpoint already received the
first model request; a refusal renders the existing failure text, sends no state report or
heartbeat, is not retried, and leaves later turns and the manual command working; the real
isolated panel's own table shows the startup row, its state report and the command's removal.
What remains to a person is the rendered terminal: no enabled marker before a valid receipt, the
marker after it, and the failure feedback with no marker. Prepare a throwaway deployment and an
isolated panel; do not point any of this at the formal panel, the default agent state or a running
session.

The real-panel test helper copies the sibling checkout's `meta-data/bot-options.toml` into each
run's temporary working directory. Current herdr-bot requires that catalog at startup; relative
paths resolve from the process working directory, not from `--config`. Only the delivered metadata
is copied: `.data/` and all runtime state stay isolated. `HERDR_BOT_BINARY` overrides the executable,
not the catalog source, so it must accept the current sibling checkout's metadata format.

```bash
ACCEPT_ROOT=.cache/connect-bot-accept
mkdir -p "$ACCEPT_ROOT/agent-state" "$ACCEPT_ROOT/sessions" "$ACCEPT_ROOT/work" \
  "$ACCEPT_ROOT/deployment/extensions" "$ACCEPT_ROOT/panel"

# The deployment copy the entrypoint imports; only its copied config.yaml is changed below.
cp -r framework adapters entrypoints "$ACCEPT_ROOT/deployment/"
cp -r extensions/connect-bot "$ACCEPT_ROOT/deployment/extensions/"

# An isolated herdr-bot: its own metadata and working directory, mDNS off.
# Reserve 18788 for this run; the formal panel uses 18787.
mkdir -p "$ACCEPT_ROOT/panel/meta-data"
cp ../herdr-bot/meta-data/bot-options.toml "$ACCEPT_ROOT/panel/meta-data/"
PANEL_BINARY=$(realpath "${HERDR_BOT_BINARY:-../herdr-bot/backend/target/release/herdr-bot.exe}")
cat > "$ACCEPT_ROOT/panel/herdr-bot.toml" <<'TOML'
listen_addr = "127.0.0.1:18788"

[herdr]
workspace_name = 'unused'

[sessions]
online_timeout_seconds = 30
offline_retention_seconds = 30

[operations.start]
script = 'unused.bat'
working_directory = '.'

[operations.stop]
script = 'unused.bat'
working_directory = '.'

[mdns]
enabled = false
TOML
(cd "$ACCEPT_ROOT/panel" && "$PANEL_BINARY" --config herdr-bot.toml)

# In another terminal, point only the deployment copy at that panel.
printf 'endpoint: "http://127.0.0.1:18788"\nrequestTimeoutMs: 1000\n' \
  > "$ACCEPT_ROOT/deployment/extensions/connect-bot/config.yaml"
```

The command's `${HERDR_BOT_BINARY:-…}` fallback names the sibling checkout's release build; set
`HERDR_BOT_BINARY` when the panel binary lives elsewhere. The isolated agent state starts empty, so
authenticate the chosen model for that state by the host's normal login/API-key step, as the
[framework isolation rule](../../framework/README.md#human-acceptance-and-cutover) describes — never
by reading the formal configuration. Launch the automatic entrypoint with that isolated state, and
start the recording before the process starts:

```bash
PI_CODING_AGENT_DIR="$PWD/$ACCEPT_ROOT/agent-state" bun \
  .cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts \
  --no-extensions -e "$PWD/$ACCEPT_ROOT/deployment/entrypoints/omp-auto/connect-bot.ts" \
  --session-dir "$PWD/$ACCEPT_ROOT/sessions" --cwd "$PWD/$ACCEPT_ROOT/work" \
  --model <provider>/<model>
```

**P18 — the marker follows the receipt.** At the session's start there is no `◐ connectBot` line
and no enabled notice. The startup register is attempted without a command; once the isolated panel
answers, the notification `已接入 herdr-bot 面板（当前 1 个在线会话）` appears (the count is the
panel's own) and the marker line appears with it. A recording from before launch through that
notice is the evidence; the first request may already have been sent while no marker was shown —
that is the non-blocking behavior, not a missing startup. The panel's read side
(`curl -N http://127.0.0.1:18787/api/sessions/events`) shows the same row arriving, so the
terminal and the panel's own table carry the same order. The pre-receipt interval is asserted
exactly by the held-register case above; the visual check confirms how those two states render.

**P19 — a failed registration stays off.** Stop the panel, exit the session, and launch the same
automatic entrypoint again in a fresh process. The terminal shows
`无法连接 herdr-bot，未启用；请确认面板已启动`, no marker and no enabled notice. Type a prompt: the
agent still answers. Restart the panel, then run `/connect-bot`; the marker and the connected
notice appear, showing the failure was not retried on its own and the original command remains the
operator's retry. Capture the failure terminal and the later command result.

Until the user confirms these rendered observations, the visual part of P18/P19 stays
**unverified**; the automated results prove the protocol, State latch and order, not how the
terminal draws them.

## H3b — cut over connect-bot

> Historical note: this section records the migration before the panel product was renamed. The
> panel is now `herdr-bot`; the extension id, command and route named below are unchanged.

Precondition: H1 passed and the connect-bot acceptance round has been run and recorded — this
repository claims neither yet — so the old implementation is still the one in use. That round is
manual and is never an automated gate: the
user loads this repository's entrypoints from the explicit-only root
(`--no-extensions -e entrypoints/omp`) on an isolated install, against a running omp-bot panel whose
`listen_addr` matches `config.yaml`'s `endpoint`, and records each step's observation (screenshots
or logs) — panel ready; `/connect-bot` registering the row (a new session is `空闲`); idempotent
re-register (one row, no flicker, count unchanged); round-end transitions (`工作中` →
`等待用户输入`, with the panel's own finished-round count and dot, cleared by its acknowledgement
while the dot stays); terminal states after an aborted or assistant-less turn; active
`/connect-bot off`; a killed process (the row stays, then passes offline); a panel outage (one
first-failure notice, auto-disarm about 30s later, no automatic reconnect); the guards (`--no-ui`,
unknown argument); multi-session isolation; coexistence with codebase-tools; load-source
exclusivity; and the configuration switch. Its record must name the frozen source baseline
(`my-omp-toolkit` `master@34d7c40`, extension commit `d3648a0`), the runtime
(`@oh-my-pi/pi-coding-agent@18.5.0` + `bun --version` + the lockfiles), the panel revision
(`omp-bot@d50e35c`), the `config.yaml` content, the executor and the date; the automated
precondition is the recorded release gate — `bun test` 367 pass / 0 fail across 42 files and a clean
`tsc --noEmit` on those baselines (recorded 2026-10-07). The two shared
cutover steps (add the discovery root once,
restart the harness) are in
[H3 — permanent cutover and cutover smoke](../../framework/README.md#h3--permanent-cutover-and-cutover-smoke);
what differs here is the configuration file, the panel rows the old implementation leaves behind, and
the smoke list.

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
   host (`http://127.0.0.1:18787`) instead of the old `config.json`'s `http://omp-bot.local:8787`: the
   panel listens on `0.0.0.0:18787`, a loopback address answers in milliseconds, and resolving the mDNS
   name can take longer than the configured request budget on first use (1000ms as shipped, which reads
   as a failed arm). Copy the old value only when the panel runs on another host; then write the address
   this machine can reach. There is no automatic conversion and no state migration — the new
   implementation persists only `{enabled}`.
4. Expect the old implementation's panel rows to expire without an `unregister`: it is no longer
   running, so its rows pass the panel's windows — offline after the online window (10s by default,
   ≤15s with the panel's 5s scan) and removed after both windows (≤45s by default) — and stay until
   an `unregister` or a panel restart. The new implementation starts unconnected, so no new row
   appears until a session runs `/connect-bot`.
5. Smoke once after the cutover: start the harness normally (no `--no-extensions`) against a running
   panel whose `listen_addr` covers `config.yaml`'s `endpoint`, and confirm:

   - **接入** — `/connect-bot` registers the current session: the marker `◐ connectBot` appears, the
     panel shows one row within the configured request budget (about 1s as shipped; a new session is
     `空闲`), and the notification reports the online-session count.
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

6. Roll back on failure: restore the deleted directory from the original git revision
   (`git -C ../my-omp-toolkit checkout 34d7c4061a74a73b478067882cba7956821f3c1d -- extensions/connect-bot`),
   which brings the old `config.json` back with it, drop the added configuration entry if no other
   migrated extension still needs that root, and restart. The rollback is symmetric: the new
   implementation also sends no `unregister`, so its rows age out the same way, and persistence
   compatibility was abandoned in both directions.
