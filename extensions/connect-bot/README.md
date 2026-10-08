# connect-bot

Joins an agent session to the omp-bot panel; `/connect-bot` registers the current session,
`/connect-bot off` disconnects it. The declaration is [`definition.ts`](definition.ts), its
agent-runtime-independent logic is under [`shared-logic/`](shared-logic), and its OMP assembly is
[`runtimes/omp.ts`](runtimes/omp.ts).

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
only after restarting the agent runtime**, never inside the running process
([`tests/connect-bot/request-timeout.test.ts`](../../tests/connect-bot/request-timeout.test.ts)). The
behaviour is the same field the framework's `milliseconds` type and its "read once per process, no
environment or command-line override" rule describe
([framework capabilities](../../framework/docs/framework-capabilities.md#extension-configuration-declaration--file)).

Two facts this budget does not decide, and which the smoke list below must not confuse: a client that
has stopped waiting is **not** evidence that the panel did not receive or apply a request — a request
can be received, processed and applied while its answer is still on its way — and Panel session
registration (the panel's row) is a different thing from Panel session online status (the panel's own
judgement that a row has been heard from recently enough). The panel's online window (30s) and scan
cadence (5s) are server-side numbers derived from nothing this extension sends, so adjusting
`requestTimeoutMs` requires **no change to omp-bot**
([`tests/connect-bot/panel-registration-lifecycle.test.ts`](../../tests/connect-bot/panel-registration-lifecycle.test.ts)).
Both terms are this context's vocabulary in [GLOSSARY.md](GLOSSARY.md).

## H3b — cut over connect-bot

Precondition: H1 passed and the connect-bot acceptance round has been run and recorded — the M-layer
observation checklist in
[lighthouse 06 §6](../../.scratch/connect-bot-migration/lighthouse/06-acceptance-contract.md) — so the
old implementation is still the one in use. The two shared cutover steps (add the discovery root once,
restart the agent runtime) are in
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
   running, so its rows pass the panel's 30s keep-alive (a ≤35s scan, worst case about 45s), turn
   "offline" and stay until an `unregister` or a panel restart. The new implementation starts
   unconnected, so no new row appears until a session runs `/connect-bot`.
5. Smoke once after the cutover: start the runtime normally (no `--no-extensions`) against a running
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
