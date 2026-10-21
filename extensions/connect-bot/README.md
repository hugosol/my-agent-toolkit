# connect-bot

Joins an agent session to the herdr-bot panel; `/connect-bot` registers the current session,
`/connect-bot off` disconnects it. The declaration is [`definition.ts`](definition.ts), its
harness-independent logic is under [`shared-logic/`](shared-logic), and its shared OMP assembly
is [`harnesses/omp-assembly.ts`](harnesses/omp-assembly.ts) behind one thin entrypoint per
[startup mode](#startup-modes).

## Startup modes

connect-bot is assembled in one of two **startup modes**. The mode is selected statically by the
entrypoint the host loads through its ordinary `-e`/`--extension` parameter; no profile argument,
environment value or command-line switch chooses it.

| Mode | OMP entrypoint | Policy document | What starts |
| --- | --- | --- | --- |
| Manual | [`entrypoints/omp/connect-bot.ts`](../../entrypoints/omp/connect-bot.ts) | [`manual.yaml`](../../entrypoints/startup/manual.yaml) | nothing — `/connect-bot` arms the session |
| Automatic startup | [`entrypoints/omp-auto/connect-bot.ts`](../../entrypoints/omp-auto/connect-bot.ts) | [`auto.yaml`](../../entrypoints/startup/auto.yaml) | the same arm operation, attempted at the process's first main session start |

Both entrypoints re-export one shared OMP assembly
([`harnesses/omp-assembly.ts`](harnesses/omp-assembly.ts)) and one definition, and the two policy
blocks select the initial choice. The shared assembly's
[`startup-modes.ts`](harnesses/startup-modes.ts) derives each document's absolute path from its own
module location, so the mode is not affected by the working directory. Load **one** mode's
entrypoint for this extension, never both: the host adds extension sources rather than merging
them, so two modes in one process would bind the extension twice.

**Loading is not enabling, and a startup target is not a connection.** The automatic document states
`enabled: true`, and the framework hands that enabling intent to the same business operation
`/connect-bot` runs: it enqueues a panel registration. The extension is not "connected" because it
was loaded, because the intent was stated, or because the register request was enqueued. The
declared `enabled` value — and therefore the `◐ connectBot` marker — stays off until a valid panel
receipt arrives. A refusal leaves it off and reports the extension's existing failure text; the
agent keeps working.

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
it. After startup, `/connect-bot` and `/connect-bot off` keep their ordinary directed-command
semantics, including repeated invocations and the existing no-UI/subagent refusals.

Evidence: [`tests/connect-bot/startup-modes.test.ts`](../../tests/connect-bot/startup-modes.test.ts)
drives both entrypoints and the controlled latch at the OMP assembly seam;
[`tests/connect-bot/startup-lifecycle.test.ts`](../../tests/connect-bot/startup-lifecycle.test.ts)
holds the attempt across an `off`, a transfer and a disposal on a controlled clock;
[`tests/harness-dock/connect-bot-startup.test.ts`](../../tests/harness-dock/connect-bot-startup.test.ts)
loads the real entrypoint files into the fixed harness and reads the panel's own table;
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
   host (`http://127.0.0.1:8787`) instead of the old `config.json`'s `http://omp-bot.local:8787`: the
   panel listens on `0.0.0.0:8787`, a loopback address answers in milliseconds, and resolving the mDNS
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
