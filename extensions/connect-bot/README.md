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

## Managed launch observations

When the launcher supplies both `HERDR_BOT_LAUNCH_ID` and `HERDR_BOT_LAUNCH_TARGET_ID`,
connect-bot publishes through the existing `POST /api/sessions/events` interface. The envelope is
`{sessionId, kind, data: {launchId, targetId, agentType, pid, cwd, sessionFile?}}`. `sessionId` and the
optional `sessionFile` are native session manager readings; a native path need not have been
persisted yet. `targetId` is an opaque correlation, not a claimed Pane or Terminal ID. The receiver
must independently bind it to the live target in the selected host instance and validate the
publishing process (`pid`, a number). Each event carries the same tuple; HTTP arrivals may reorder.

The App launcher's host binding is separate from these native observations. The launcher can read
core's existing `HC_TERMINAL_ID` and `HC_TERMINAL_SOCKET` inside its newly created terminal and
publish that source through its own invocation-bound receipt. The panel must match the actual
terminal, core instance, and owner process before using that endpoint. These launch events do not
supply a socket path or authorize changing an existing binding. No extension change or forced
connect-bot loading is needed to acquire host evidence for a native-default Resume. Native
conversation confirmation still requires the existing identity evidence; a host receipt is not a
`launch_identity` or `launch_ready` event.

- `launch_identity` identifies the first owner of this managed invocation.
- `launch_ready` adds the framework's `session_ready` observation for that same owner.
- `launch_ended` withdraws the evidence when that owner transfers or ends. In-flight publications
  are cancelled locally; a replacement owner cannot reuse the launch association. Withdrawal is
  best effort on process exit, so the receiver must also check live target/owner validity and
  reject late reports after withdrawal.

The events neither require nor establish panel registration, online status or idleness. Ordinary
manual/automatic registration is unchanged. A ready report does not permit bypassing the host's
input admission check when submitting a message.

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
and `HERDR_BOT_METADATA` to its delivered `meta-data/task-options.toml`. The helper rejects a missing
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

**Pi verification limit:** full lifecycle parity is not established. Do not rely on RPC stdin close to unregister an armed session. Run `/connect-bot off` before closing it. See the [Pi connect-bot evidence](../../framework/docs/harness-support.md#pi-connect-bot-entrypoint-evidence) for the historical startup observation and the remaining unregister gap.

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
`{enabled:true}` payload and the no-payload control;
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
| `endpoint` | The panel base URL. For a same-host panel, use loopback to avoid spending the request budget on mDNS resolution. |
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

The real-panel test helper copies the sibling checkout's `meta-data/task-options.toml` into each
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
cp ../herdr-bot/meta-data/task-options.toml "$ACCEPT_ROOT/panel/meta-data/"
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
PI_CODING_AGENT_DIR="$PWD/$ACCEPT_ROOT/agent-state" "${OMP_CLI:-omp}" \
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
(`curl -N http://127.0.0.1:18788/api/sessions/events`) shows the same row arriving, so the
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

Check registration, state changes and explicit disconnect on an isolated panel before replacing a deployed implementation. For automatic startup, use the interactive drill above. Follow the load-source and restart rules in [H3](../../framework/README.md#h3--permanent-cutover-and-cutover-smoke).

1. Back up the current load configuration and preserve the implementation it selects. Before stopping it, run `/connect-bot off` and check the old panel row. Disconnect stops local reports and attempts unregister. If the panel did not confirm removal, check its row and expiry settings rather than treating a timeout or process exit as an unregister.
2. Set `endpoint` in the replacement's [`config.yaml`](config.yaml) to the intended panel. Use `http://127.0.0.1:18787` for a same-host panel on the default port. The panel listener must accept that address.
3. Switch to exactly one replacement entrypoint in the desired startup mode. Stop discovering the old implementation without removing other extensions you still use. Restart the harness as a whole process.
4. Check that the panel shows one row for the current session and the TUI shows `◐ connectBot` after the registration receipt. Use `/connect-bot` to register in manual mode. A second `/connect-bot` must reuse the row. Run a turn and check that the panel moves from `工作中` to `等待用户输入`. Run `/connect-bot off` and verify both marker and row are gone.
5. To roll back, explicitly disconnect the replacement before stopping it. Restore the previous configuration and implementation as the only load source, then restart and verify against the intended panel.
