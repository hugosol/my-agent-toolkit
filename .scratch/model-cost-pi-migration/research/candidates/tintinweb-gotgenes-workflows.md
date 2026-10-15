# Subagent-extension candidates — source archaeology (pinned revisions)

Scope: which pi extension can supply the subagent capabilities the OMP (oh-my-pi) adapter semantics
currently provide, and which baseline dimensions would need new **public pi interfaces**.

Convention: every claim carries `path:line` at the pinned revision. Paths are repo-relative to the
checkout listed in Provenance (candidate 3 is a published-tarball path, prefixed `tar:`).
`unavailable[]` names every fact the baseline requires that is **not obtainable** — never silently zeroed.

## Provenance / method

| # | Candidate | npm | Repo | Pin | How pinned | Local checkout |
|---|---|---|---|---|---|---|
| 1 | `@tintinweb/pi-subagents` | 0.22.0 | github.com/tintinweb/pi-subagents | `85a704cb8f35c96c0cabfa665b572bab296942e5` | tag `v0.22.0` == registry `gitHead` for 0.22.0 | `.scratch/.../candidates/_cand/tintinweb-pi-subagents` (git clone) |
| 2 | `@gotgenes/pi-subagents` | 23.4.0 | github.com/gotgenes/pi-packages (`packages/pi-subagents`) | `63476ff869efd8ea339040f496fa734048b89e70` | tag `pi-subagents-v23.4.0` ("chore(release): pi-subagents 23.4.0") | `_cand/gotgenes-pi-packages` (git clone) |
| 3 | `@quintinshaw/pi-dynamic-workflows` | 3.14.0 | declared `github.com/QuintinShaw/pi-dynamic-workflows` — **404** | registry `gitHead` `3a52f19ab1f01e09535b6b3e1d8200b6f3bcb63a` (**unverifiable**) | npm tarball `_tarball/wf/package` (registry artifact, ships `src/` + `dist/`) | `_tarball/wf/package` |

Tool-availability caveats (all failures recorded, not worked around silently):

- `https://api.github.com/users/QuintinShaw` → 404; `.../repos/QuintinShaw/pi-dynamic-workflows` → 404;
  `git ls-remote https://github.com/QuintinShaw/pi-dynamic-workflows` → *Repository not found*.
- `raw.githubusercontent.com` is **unreachable from this environment** (curl HTTP `000` for both
  candidates' own repos, e.g. `tintinweb/pi-subagents/master/package.json`), so the "raw URL fallback"
  prescribed for a failed clone is itself unavailable. Candidate 3 therefore has **no repo-level
  evidence at all**; its evidence is the published npm tarball at 3.14.0 (which contains `src/*.ts`,
  `dist/*.js`, `dist/*.d.ts`), cited as `tar:<path>`.
- `@gotgenes/pi-dynamic-workflows` does not exist under that owner; a GitHub search for the name returns
  43 unrelated forks (`Michaelliv/pi-dynamic-workflows`, `owainlewis/…`, `n-WN/…`, …). The tarball's
  `package.json` credits `michaelliv (original author)` and `LICENSE` credits "Michael Livs (original
  pi-dynamic-workflows)" — i.e. this is a maintained fork of an upstream that is **not** the declared URL.

## Summary

| | 1 tintinweb 0.22.0 | 2 gotgenes 23.4.0 | 3 quintinshaw 3.14.0 |
|---|---|---|---|
| Model | in-process | in-process | in-process |
| Public third-party surface | `pi.events` bus + `Symbol.for("pi-subagents:manager")`; **no module export path** | **published typed API** (exports map + `dist/public.d.ts`), real sibling consumer | published `exports "."` module (dist js+d.ts), 1 `pi.events` channel |
| Session/agent identity on the wire | id, type, description (+status/usage on terminal) | id, type, description, isBackground / status, durationMs, tokens | runId, name, sessionId (run lifecycle only) |
| Per-run tokens | yes; **cost yes** (`usage.cost.total`) | yes (`input/output/cacheWrite`, **no cost**) | yes; per-agent + run, `estimated` flag honoured |
| Per-turn identity/outcome | no | no | no |
| Round events | no | no | no |
| Ownership / ancestry | internal `parentAgentId`/`workflowId`/`rootSessionId`, not on the wire | internal `parentSessionId` (`subagents:child:*` only) | run record `parentSessionId`/`parentSessionFile`, not on the wire |
| Cross-session (all-sessions) observation | no (per-ResourceLoader bus, top-level only) | no | no |

Root pi facts both in-process candidates rest on (verified in the local pi clone,
`E:/Developer/myhub/pi/packages/coding-agent`):

- `EventBus` is one `node:events` `EventEmitter` per `ResourceLoader` instance
  (`src/core/event-bus.ts:3-12`, `src/core/resource-loader.ts:379`), and each SDK session builds its own
  `DefaultResourceLoader` unless one is passed (`src/core/sdk.ts:203-206`,
  `src/core/agent-session-services.ts:148-153`). `pi.events.emit/on` delegate to that bus
  (`src/core/extensions/loader.ts:516-526`).
- Extension modules are loaded through **jiti**, which transpiles TypeScript entries and their
  bare-package imports (`src/core/extensions/loader.ts:1-3, 575-581`). This is what makes the
  candidate-2 `exports` → `./src/service/service.ts` (TS) runtime path legitimate for a third extension.
- Consequence for **S-SCOPE** on all three candidates: a consumer's `pi.events` listener is scoped to the
  emitting extension activation's bus. Both in-process candidates give each child its **own**
  `ResourceLoader` (cand.1 `src/agent-runner.ts:1090-1117`; cand.2
  `src/lifecycle/create-subagent-session.ts:264-296`), so child-session extension emissions do **not**
  reach the parent's bus unless the parent activation emits them itself — which cand.2 does deliberately
  (cand.2 `src/index.ts:177`) and cand.1 does not.

---

## @tintinweb/pi-subagents (tintinweb/pi-subagents)

- **Identity**: npm `@tintinweb/pi-subagents`; repo `https://github.com/tintinweb/pi-subagents`; pin
  `85a704c` (= `v0.22.0`); license **MIT** (`LICENSE:1-3`, 21 lines, "Copyright (c) 2026 tintinweb");
  latest 0.22.0, published `2026-10-13T12:15:01Z` (registry), 59 versions since 2026-03-05; pi.dev
  **36.2K/mo** (11.2K/wk); install `pi install npm:@tintinweb/pi-subagents`; pi.dev kind **extension**;
  tarball 193 files / 2.64 MB; deps `croner`, `nanoid`; peers `typebox *`,
  `@earendil-works/pi-{ai,tui,coding-agent} >=1.1.0` (`package.json`).
- **Execution model**: **in-process**. Children are real pi sessions created with the SDK inside the host
  process and extension-bound in place: `createAgentSession(sessionOpts)` with
  `resourceLoader: loader` then `await session.bindExtensions({...})` (`src/agent-runner.ts:1090-1097`,
  `:1117`). Mentions fork an in-memory `SessionManager` (`src/mention-clone.ts:163-167`). The extension
  re-activates inside child sessions in the same process (`src/index.ts:657-662`). There is no `pi` CLI
  spawn and no external harness. Cross-process is explicitly out of scope: "the bus is in-process …
  none of this survives a real process boundary" (`docs/rpc.md:8-12`).
- **Public surface** (what a *third extension* can use):
  - Tools (model-visible): `Agent` (`src/agent-runner.ts:44-46`; registered `src/index.ts:2457-2458`),
    `SubagentWorkflow` (`src/index.ts:2561-2562`, enabled `:2735`), `get_subagent_result`
    (`src/index.ts:2885-2886`), `steer_subagent` (`src/index.ts:2974-2975`). Child-only
    `StructuredOutput` (`src/structured-output.ts:37`). Usage is attached to tool results
    (`src/index.ts:2451-2452`).
  - `pi.events` channels (documented `docs/rpc.md:1-12`): `subagents:created|started|completed|failed|
    steered|compacted|scheduled|settings_loaded|settings_changed|ready|scheduler_ready` and RPC
    `subagents:rpc:ping|spawn|stop|consume`. Emission sites: `src/index.ts:584,586` (completed/failed),
    `:630` (started), `:638` (compacted), `:842` (ready), `:937`,`:3001`,`:3007` (steered),
    `:1182`,`:1452`,`:2234` (created), `:783` (scheduler_ready); `src/schedule.ts:311`;
    `src/settings.ts:630,647`; `src/cross-extension-rpc.ts:100,105,168,192`.
  - Session entry (append-only history, not a channel): `pi.appendEntry("subagents:record", {id, type,
    description, status, result, error, startedAt, completedAt})` (`src/index.ts:590-594`) — **no usage,
    no session id** in the entry.
  - Registry singleton: `globalThis[Symbol.for("pi-subagents:manager")]` (`src/index.ts:664`) exposing
    `waitForAll()`, `hasRunning()`, `spawn()`, `getRecord(id)` — the latter filtered by
    `isTopLevelAgent` (`docs/rpc.md:131-144`, "The manager registry").
  - Command: `/agents` (`src/index.ts:4210`). Config: `<agentDir>/subagents.json` (global) and
    `<cwd>/.pi/subagents.json` (project) (`src/settings.ts:2-3,528,532`), agent files
    `.pi/agents/<name>.md` / `.agents/agents/<name>.md`, package-declared agents via
    `"pi": {"subagents": {"agents": [...]}}`.
  - **No exported module**: `package.json` has **no `exports`, `main`, or `types`** field (whole file
    read); the only declared entry is `pi.extensions: ["./src/index.ts"]`. Anything deeper is a
    deep-import of unversioned source — there is no public module API.
- **Coverage**:

| Dim | Verdict | Evidence |
|---|---|---|
| S-IDENT | **adaptable (internal only)** | Record: `id = randomUUID().slice(0,17)` (`src/agent-manager.ts:499`), `handle`/`alias` (`:507-548`), `parentAgentId`/`workflowId` (`src/types.ts:293-301`), `rootSessionId` (`:303-308`), `toolCallId`/`outputFile`/`sessionFile` (`src/types.ts:231,233,240`), `depth`. **On the wire only** `id,type,description[,status,usage]` (`src/index.ts:535-567`) — no session id, handle, parent, or model. Stability: UUID per spawn → fresh runs differ; a resume reuses the id and `reclaim` restores handles (`src/agent-manager.ts:183-193`, tombstone `:1515-1527`); handles are cleared on new session (`:1561`). |
| S-STARTUP | **needs-upstream-interface** | `AgentInvocation{modelName,modelId,thinking,requestedThinking,requestedModel,…}` is captured at spawn (`src/types.ts:310-327`) but is "UI-only … only the Agent-tool path populates" (`src/types.ts:259-261`) and never emitted; RPC spawns accept `model`/`thinkingLevel` (`docs/rpc.md:9-69` spawn options) with no event echo. No channel carries provider+model+effort at first start, and none distinguishes fresh vs resume. |
| S-OWNER | **needs-upstream-interface** | Ancestor main session exists internally as `rootSessionId` (`src/types.ts:303-308`) / `parentAgentId` / `workflowId`, but no event payload carries session identity, and `getRecord` hides another owner's child (`docs/rpc.md:98-108` ownership, `:131-144` registry). A consumer can attribute only agents it spawned itself. |
| S-SCOPE | **unsupported** | Bus is per-`ResourceLoader` (pi `src/core/event-bus.ts:12`); every lifecycle event is top-level only — owned children "report only through their owner" (`src/index.ts:572-578`, `docs/rpc.md:156-163` "Every lifecycle event is top-level only"; a session that excludes the extension is indistinguishable from not-installed). Observation vs authority *is* partly separated: `getRecord`/events observe, `spawn`/`stop`/`consume` act, and `stop` refuses `Agent is owned by another agent or workflow` (`src/cross-extension-rpc.ts:168-176`). |
| S-LIFECYCLE | **adaptable** | start/end exist edge-triggered: `started` (`src/index.ts:630`), `completed`/`failed` discriminated by `record.status` (`:584-586`), plus `created`, `steered`, `compacted`. No reason vocabulary (no `new|resume|fork|transferred|disposed`): resume is announced only implicitly (a detached resume emits `created`, `docs/rpc.md:156-163`), and there is no dispose/transfer channel; `session_shutdown` just tears handlers down (`src/index.ts:1112-1115`). |
| R-ROUND | **unsupported / needs-upstream-interface** | Turn counter is in-process only: `session.subscribe(...)` on `turn_end` (`src/agent-runner.ts:1153-1156`) → `onTurnEnd` callback → widget/tool text. No round channel, no per-round payload. |
| T-TURN | **adaptable** (aggregate), per-turn **unavailable** | Terminal events carry `tokens{input,output,total}` **and** the full pi `Usage` incl. `cost.total` (`src/index.ts:535-567`; builder `src/usage.ts:76-92`). Provenance: accumulated per assistant `message_end`; `cost` is "what pi charged for that one message (`usage.cost.total`, priced from the model's rates)" (`src/usage.ts:17-20`, `src/agent-runner.ts:523,1187`). `showCost` governs human display only — the event is "Ungated by showCost" (`src/index.ts:543-556`). `unavailable[]`: per-turn `turnId`, `responseId`, per-turn http status, per-turn outcome — no such field anywhere (only `status`, `toolUses`, `durationMs`). |
| R-RUNTIME | **adaptable** | Terminal events carry `durationMs` + `status` (`src/index.ts:535-537`); live readings only through the registry `getRecord(id)` (`record.status` `queued|running|completed|steered|aborted|stopped|error`, `src/types.ts:181`) or the widget. `unavailable[]`: a live `{runtimeMs, running}` reading pushed to a consumer — none exists; `unavailable[]` executionId (record `id` is the only key). |
| IN-INPUT | **adaptable (partial)** | User text enters through the prompt mention handler `pi.on("input", …)` (`src/index.ts:884-887`); a mention can message a running agent, resume a finished one, or spawn a type — and steering is announced (`subagents:steered`, `src/index.ts:3001`,`:3007`). No general "user submitted input for subagent X" event, and `handled` mentions never reach the model (`src/index.ts:886-892`). |
| V-VIEWED | **covered** | Read: conversation overlay (`src/ui/conversation-viewer.ts`, fullscreen + mouse + steering composer), FleetView list (`src/ui/fleet-list.ts`), `/agents` menu (`src/index.ts:4210`); streaming transcript file (`src/output-file.ts:100-143`, flushed on `turn_end`). Repeat execution: `resume` (`Agent` `resume` param / `@handle`), `steer_subagent`, ctrl+b handoff (`src/ui/conversation-viewer.ts:269-276,651-653`). Cross-restart: recorded `sessionFile` reopens the conversation after eviction (`src/agent-manager.ts:1515-1527`; `resumeSessionFile: entry.sessionFile` `src/index.ts:1005`). |
| Process boundary | **in-process only** | `src/agent-runner.ts:1090-1117`; no CLI spawn anywhere in `src/`. |
| Cross-process facts | **n/a / unsupported** | No cross-process path; child facts reach a consumer only via the in-process bus/registry or the child's session/output JSONL on disk (`outputFile`, `sessionFile`). |

- **Maintenance/compat prerequisites and risks**: active (HEAD 2026-10-13, 59 releases since 2026-03,
  CI workflow + biome + vitest in `package.json`); requires pi **>= 1.1.0** (peerDeps; 0.86/0.87 moved
  the system prompt into the transcript); third-party host adapters exist but are untested upstream
  (README "Other hosts", DeepSeek Harness `#258`). Main risk for us: **no exported module and no
  documented stable payload versions** — the RPC envelope is versioned (`ready`/`ping`) but the
  lifecycle event payloads are not, and `ids are UUIDs`, so a consumer's cross-run identity must be
  invented on its own side. Second risk: bus/`consumer` integration is undocumented for session scope
  (all events top-level only).
- **Evidence limits**: all cited lines are from the pinned clone; pi.dev README claims were only used
  where corroborated by source. `unavailable[]`: any DeepSeek-Harness/`dsh` behaviour, `package-lock`
  dependency tree health, and pre-release tag history (tags fetched shallowly).

---

## @gotgenes/pi-subagents (gotgenes/pi-packages → packages/pi-subagents)

- **Identity**: npm `@gotgenes/pi-subagents`; repo `https://github.com/gotgenes/pi-packages`
  (`directory: packages/pi-subagents`); pin `63476ff` = tag `pi-subagents-v23.4.0`; license **MIT**
  (`packages/pi-subagents/LICENSE:1-3`, 21 lines, "Copyright (c) 2026 tintinweb"); latest 23.4.0,
  published `2026-10-09T05:48:34Z`, 197 versions since 2026-05-12; pi.dev **14.5K/mo** (4,845/wk);
  install `pi install npm:@gotgenes/pi-subagents`; pi.dev kind **extension**; tarball 116 files /
  1.34 MB; **0 runtime deps**, peers `typebox *`, `@earendil-works/pi-{ai,tui,coding-agent} >=1.0.0`;
  `engines.node >= 22` (`package.json`).
- **Execution model**: **in-process**. `deps.io.createSession({… resourceLoader: loader, thinkingLevel})`
  then `await session.bindExtensions({})` (`src/lifecycle/create-subagent-session.ts:286-298`, `:319`),
  with a per-child `DefaultResourceLoader` built in-process (`:264-273`). Child pi session is persisted
  in pi's JSONL format with `sessionManager.newSession({parentSession: …})` (`:282-283`). No CLI spawn,
  no external harness.
- **Public surface** — see the dedicated section below. Short form: an **exports-mapped typed API**
  (`.` → `dist/public.d.ts` + `src/service/service.ts`; `./settings` → `dist/settings.d.ts` +
  `src/layered-settings.ts`), tools `subagent` / `get_subagent_result` / `steer_subagent`, plus child
  tools `ask_parent` (`src/session/ask-parent-tool.ts`) and `notify_parent`
  (`src/session/notify-parent-tool.ts`), commands `/subagents:settings` (`src/index.ts:264`) and
  `/subagents:sessions` (`:275`), and the `subagents:*` / `subagents:child:*` channels.
- **Coverage**:

| Dim | Verdict | Evidence |
|---|---|---|
| S-IDENT | **covered (on the public service), partial on the bus** | `SubagentRecord.id`, `.type`, `.description`, `.status` (`src/service/service.ts:55-84`) are public and value-snapshotted; a stable name is `record.id`; session identity is public as `outputFile` ("Path to the agent's session JSONL", `:83-84`) but **not** a session id, and `parentSessionId` is only internal (`src/types.ts:135`). Event payloads carry `id,type,description` (`src/observation/subagent-events-observer.ts:37-44`, `src/observation/notification.ts:166-181`). Ids are per-spawn; resumed runs append a second `subagents:record` entry under the same id (`src/persisted-record.ts:70-79`). |
| S-STARTUP | **adaptable** | Spawn-time inputs are typed and public: `SpawnOptions{model, thinkingLevel, maxTurns, inheritContext, foreground, bypassQueue}` (`src/service/service.ts:115-129`) and the adapter resolves thinking (`src/service/service-adapter.ts:71`). Nothing on a channel reports the *resolved* provider+model+effort, and the record has no model field; a consumer can read the child session JSONL at `record.outputFile`. `unavailable[]`: resolved model/thinking level at first start as a structured fact; fresh-vs-resume is only inferable from `subagents:resuming`/`resumed`. |
| S-OWNER | **covered for the caller, not for arbitrary ancestry** | Children are created with `newSession({parentSession: params.parentSession?.parentSessionId})` (`src/lifecycle/create-subagent-session.ts:282`), and the parent identity is captured at the tool/service boundary (`src/types.ts:130-138`, `src/service/service-adapter.ts:63-69`). A third extension sees its **own** agents (`listAgents()`) and the child-session registry keyed by child session id — but the public record exposes no owner field, so attribution is positional, not by ancestor main session. |
| S-SCOPE | **unsupported as "all sessions"; observation/authority are separated** | The service is per-process but per-activation: `publishSubagentsService` on `globalThis` (`src/service/service.ts:188-192`, published at `src/index.ts:204-205`); `listAgents()` returns the manager's own agents only. Child-session lifecycle **is** surfaced on the parent bus by design — `createChildLifecyclePublisher((channel, data) => pi.events.emit(channel, data))` (`src/index.ts:177`) emitting `subagents:child:spawning|session-created|bound|completed|disposed` (`src/lifecycle/child-lifecycle.ts:21-45`) with `sessionId` + `parentSessionId` (`:53-66`), explicitly justified by the synchronous bus (`:23-29`, `:310-315` in `create-subagent-session.ts`). Observation is cleanly separated from effect: `getRecord/listAgents` + events observe; `spawn/abort/steer/resume/registerWorkspaceProvider` act (`src/service/service.ts:131-170`). |
| S-LIFECYCLE | **covered** | `subagents:created` (`:131-138`), `started` (`:37-44`, emit `:39`), `completed`/`failed` (`:46-57`, emits `:51,:53`, discriminated by `isTerminalError`), `resuming` (`:65-71`, emit `:66`), `resumed` (`:73-79`, emit `:77`), `compacted` (`:119-128`, emit `:121`), `update` (`:99-105`, emit `:100`, mid-run `notify_parent`), plus the child-lifecycle family above. Reasons: resume refusal is a first-class public vocabulary `ResumeRefusal = "still-running"|"no-session"|"session-released"|"workspace-disposed"` (`src/lifecycle/subagent.ts:66-70`) and surfaces as `record.resumeRefusal` / `ResumeResult{kind:"refused",reason}` (`src/service/service.ts:100-113`). `unavailable[]`: no fork/transferred/disposed channel for *agents* (disposal is announced only per child session, `subagents:child:disposed`). |
| R-ROUND | **unsupported / needs-upstream-interface** | No round channel. Closest facts are `TurnBudget{maxTurns,used,phase:"within"|"warned"|"exhausted"}` (`dist/public.d.ts:26-35`; `src/lifecycle/turn-limits.ts`) and `record.turnBudget` (live), plus `turn_start` used internally to gate interrupts (`src/index.ts:245`). `unavailable[]`: round_start/round_end, per-round open/close. |
| T-TURN | **adaptable (per-run), per-turn unavailable** | `SubagentRecord.lifetimeUsage: LifetimeUsage = {input, output, cacheWrite}` (`src/service/service.ts:75`, `src/lifecycle/usage.ts:10`), accumulated on `message_end` and deliberately excluding `cacheRead` (#38) (`src/lifecycle/usage.ts:4-8`); events carry `tokens{input,output,total}` where `total=input+output+cacheWrite` and `tokens` is omitted when nothing ran (`src/observation/notification.ts:166-181`). **No cost, no cacheRead, no responseId, no turnId, no http status** — `cost` does not occur anywhere in `src/` (grep over the pinned tree). `unavailable[]`: per-turn identity/outcome/usage/cost/http status. |
| R-RUNTIME | **adaptable** | `durationMs` on every terminal event (`src/observation/notification.ts:167`) and `status` on the record; `startedAt`/`completedAt` (`src/service/service.ts:77-78`). Live per-execution `{executionId, runtimeMs}` readings are not pushed — `getRecord` gives `status`+`startedAt` and a `queued|running` status (`src/lifecycle/subagent-state.ts` statuses; widget polls `listAgents()`). `unavailable[]`: executionId (agent id only), live runtime duration. |
| IN-INPUT | **covered (agent→parent question and user answer)** | A child that needs input calls `ask_parent` (`src/session/ask-parent-tool.ts:46`, contract: "a pending question — with the exact resume call while the record is still …" `:9-13`) and ends its turn; the question is stored (`src/lifecycle/subagent-state.ts:377`) and surfaces publicly as `record.pendingQuestion` (`src/service/service.ts:69-70`, getter `src/lifecycle/subagent.ts:158`) and in the final result text (`src/lifecycle/subagent.ts:560`); the user's answer is a resume. Mid-run `notify_parent` → `subagents:update` (`src/observation/subagent-events-observer.ts:99-105`). Steering is the third input path (`steer` on the service, `steer_subagent` tool). `unavailable[]`: a user-input event channel itself. |
| V-VIEWED | **covered** | Read-only native viewer: `/subagents:sessions` (`src/index.ts:275-280`, handler `src/ui/session-navigator.ts:158` with params `:126`, content rows `src/ui/transcript-content.ts:1-6`) listing running **and** previously finished runs, incl. after `/reload` and resumed runs. Repeat execution: `resume(id, prompt, {claimOutcome, signal})` (`src/service/service.ts:156`) whose refusal is precisely typed; steering; `waitForAll()`. Cross-restart: terminal runs are appended to the parent session as `subagents:record` entries (`src/persisted-record.ts:16-30`) and re-read newest-first (`:64-79`), with `outputFile` reopening the transcript after the live session is gone. |
| Process boundary | **in-process only** | `src/lifecycle/create-subagent-session.ts:264-298,319`. |
| Cross-process facts | **n/a** | Facts travel via the parent's in-process bus, the global service, or the child session JSONL (`outputFile`) / `subagents:record` session entry. |

- **Maintenance/compat prerequisites and risks**: actively maintained fork (pin is the 23.4.0 release
  commit, 197 releases since 2026-05); monorepo `packages/*` includes `pi-subagents-worktrees`, which is
  its own npm package and a real consumer of the API (below). Peers `>=1.0.0`; `node >=22`; runtime path
  depends on pi loading **TypeScript through jiti** (pi `src/core/extensions/loader.ts:575-581`) — under a
  non-TS host the `default` export condition (`./src/service/service.ts`) would not load; only the
  `types` condition is prebuilt (`dist/public.d.ts`), there is **no JS runtime build** for the API entry.
- **Evidence limits**: line-level evidence from the pinned tag; README claims (ask-back, workspace
  resumability) were only counted where I read the corresponding source. `unavailable[]`: behaviour under
  a host that does not transpile TS; whether third-party (non-monorepo) consumers exist besides
  `pi-subagents-worktrees`; the retention policy for `subagents:record` history.

### Deliverable 2 — is the "typed API and lifecycle events other extensions build on" real?

**Yes — verified in source, published, and consumed by a second npm package.** Not just a README claim.

Exported symbols and the exact interface (all at pin `63476ff`):

| Surface | Where | Contents |
|---|---|---|
| Package entry (`.`) | `package.json` `exports["."]` = `{types: "./dist/public.d.ts", default: "./src/service/service.ts"}`; `files` includes `src`, `dist` | value exports `getSubagentsService`, `publishSubagentsService`, `unpublishSubagentsService`, `SUBAGENT_EVENTS` (`dist/public.d.ts:292`), type exports `SubagentRecord`, `SubagentsService`, `SpawnOptions`, `ResumeOptions`, `ResumeResult`, `ResumeRefusal`, `ResumeRefusalReason`, `SubagentStatus`, `LifetimeUsage`, `TurnBudget`, `TurnBudgetPhase`, `Workspace`, `WorkspacePrepareContext`, `WorkspaceDisposeOutcome`, `WorkspaceDisposeResult`, `WorkspaceProvider` (`dist/public.d.ts:293`) |
| Settings entry (`./settings`) | `exports["./settings"]` = `{types: "./dist/settings.d.ts", default: "./src/layered-settings.ts"}` | `loadLayeredSettings`, `LayeredSettingsSource<T>` (`dist/settings.d.ts:81-82`; `src/layered-settings.ts:52,84`) |
| Service contract | `src/service/service.ts:131-170` | `spawn(type,prompt,SpawnOptions): string` (`:133`), `getRecord(id): SubagentRecord \| undefined`, `listAgents(): SubagentRecord[]`, `abort(id): boolean`, `steer(id,message): Promise<boolean>`, `resume(id,prompt,ResumeOptions): Promise<ResumeResult>`, `waitForAll()`, `hasRunning()`, `registerWorkspaceProvider(provider): () => void` (`:169`) |
| Snapshot type | `src/service/service.ts:55-84` | `SubagentRecord{id,type,description,status,isBackground,result?,pendingQuestion?,error?,toolUses,turnBudget?,startedAt,completedAt?,lifetimeUsage,compactionCount,outputFile?,resumeRefusal?}` |
| Event channels | `src/service/service.ts:173-183` | `SUBAGENT_EVENTS = { STARTED:"subagents:started", COMPLETED:"subagents:completed", FAILED:"subagents:failed", RESUMING:"subagents:resuming", RESUMED:"subagents:resumed", COMPACTED:"subagents:compacted", CREATED:"subagents:created", STEERED:"subagents:steered" }` — a *const object of channel names*, emitted via `pi.events` (`src/index.ts:177` for the child family; `src/observation/subagent-events-observer.ts` for the rest). Payload shape is a single untyped `buildEventData(record)` (`src/observation/notification.ts:166-181`) — the *channel names* are API, the *payload* is not declared in `public.d.ts`. |
| Registry | `src/service/service.ts:186-204` | `Symbol.for("@gotgenes/pi-subagents:service")` on `globalThis`; publish at init `src/index.ts:205`, unpublish on shutdown (`:211`) |

**Reachable by a third extension? Yes.** Three independent proofs:

1. The **published tarball** `@gotgenes/pi-subagents@23.4.0` (registry artifact, extracted locally)
   contains `dist/public.d.ts` (293 lines), `dist/settings.d.ts`, `src/service/service.ts` and
   `src/layered-settings.ts`, and `package.json` in the tarball carries both `exports` entries — so the
   `types` condition resolves for `tsc` and the `default` condition resolves at runtime under pi's jiti
   loader.
2. A **second published package in the same monorepo consumes it**: `pi-subagents-worktrees` declares
   `peerDependencies: {"@gotgenes/pi-subagents": ">=16.4.0"}` and imports at runtime
   `import { getSubagentsService } from "@gotgenes/pi-subagents"` and
   `import { loadLayeredSettings } from "@gotgenes/pi-subagents/settings"`
   (`packages/pi-subagents-worktrees/src/index.ts:19`, `src/config.ts:14`), using it as
   `WorkspaceProvider` (`src/workspace-provider.ts:18`), with a documented load-order requirement and a
   no-op path when the service is absent (`src/index.ts:10-14,28-31`).
3. The project **verifies the packaged surface for external developers**:
   `packages/pi-subagents/scripts/verify-public-types.sh` packs the real tarball, asserts
   `dist/public.d.ts`/`dist/settings.d.ts` are self-contained (no `#src/*` aliases) and contain
   `getSubagentsService`, `WorkspaceProvider`, `SubagentsService`, `LifetimeUsage`, `Workspace`,
   `WorkspacePrepareContext`, `WorkspaceDisposeOutcome`, `WorkspaceDisposeResult`,
   `loadLayeredSettings`, `LayeredSettingsSource`, then type-checks a throwaway consumer project against
   the packed tarball. The declaration is produced by `rollup-plugin-dts` at `prepack`
   (`rollup.dts.config.mjs:13-25`).

Two honest qualifications: (a) the only known consumer is authored in the same monorepo (same
maintainer), so "other extensions build on it" is demonstrated but not yet independently adopted;
(b) the *event payloads* are not typed public API — only the channel-name constants and the
service/snapshot/workflow-seam types are.

---

## @quintinshaw/pi-dynamic-workflows (QuintinShaw/pi-dynamic-workflows)

- **Identity**: npm `@quintinshaw/pi-dynamic-workflows`; declared repo
  `https://github.com/QuintinShaw/pi-dynamic-workflows` (**404** — repo and owner both absent, and
  `raw.githubusercontent.com` unreachable, so **no repo-level evidence exists**); evidence base = registry
  tarball 3.14.0; license **MIT** (`tar:LICENSE:1-4`, 22 lines, "Copyright (c) 2026 QuintinShaw /
  Michael Livs (original pi-dynamic-workflows)"); latest 3.14.0, published `2026-10-06T14:55:52Z`,
  62 versions since 2026-05-30; pi.dev **26K/mo** (5,042/wk); install
  `pi install npm:@quintinshaw/pi-dynamic-workflows`; pi.dev kind **extension, skill**; tarball 204
  files / 2.86 MB; dep `acorn ^8.16.0`; peers `typebox *`,
  `@earendil-works/pi-tui >=0.80.6`, `@earendil-works/pi-coding-agent >=0.80.8` (`tar:package.json`).
- **Execution model**: **in-process**. The extension entry imports compiled ESM
  (`tar:extensions/workflow.ts:5-8`: `installHostCreateAgentSession(host.createAgentSession, host)`) and
  spawns children through the SDK in the host process:
  `await agentSessionFactory({…})` where `agentSessionFactory = createAgentSession`
  (`tar:src/agent.ts:55-56`, `:1290`). Child sessions are pi sessions with
  `manager.newSession({parentSession: this.parentSessionFile})` for lineage (`tar:src/agent.ts:1047-1052`)
  and, by default, **host extensions disabled** — "Without a resourceLoader, createAgentSession() builds a
  fresh loader per subagent and re-runs every installed extension factory. By default we keep host
  extensions disabled." (`tar:src/agent.ts:861-866`). No CLI spawn; no external harness.
- **Public surface** (third-party reachable):
  - Tools: `workflow` (`tar:src/workflow-tool.ts:214`, registered `tar:src/pi-extension.ts:185`) and
    `workflow_control` (`tar:src/workflow-control-tool.ts:93`, registered `tar:src/pi-extension.ts:186`),
    both registered `exposure: "deferred"` (`:184-186`).
  - Commands: `/workflows`, `/workflows-trigger`, `/workflows-progress`, `/workflows-models`,
    `/deep-research`, `/adversarial-review`, `/code-review`, `/multi-perspective`, `/codebase-audit`,
    `/effort`, `/ultracode`, plus saved workflows (`tar:src/workflow-commands.ts:152`,
    `tar:src/builtin-commands.ts:413,441,456,576,595`, `tar:src/effort-command.ts:51,71`,
    `tar:src/saved-commands.ts:67`).
  - `pi.events` channel (exactly one): `pi-dynamic-workflows:lifecycle`
    (`tar:src/task-panel.ts:656`), payload `{status: "started"|"resumed"|"paused"|"completed"|"failed"|
    "stopped", runId, name, sessionId?}` (`:658-660`, emitter `:1304`, `:1304-1330`).
  - **Exported module**: `package.json` `exports["."] = {types: "./dist/index.d.ts", import: "./dist/index.js"}`
    with `main`/`types` set and `files` shipping `dist/`, `src/`, `skills/`, `extensions/`
    (`tar:package.json`). `dist/index.d.ts` re-exports a wide concrete surface — `runWorkflow`,
    `parseWorkflowScript`, `WorkflowManager`, `createWorkflowTool`, `createWorkflowControlTool`,
    `sumAgentUsage`-adjacent usage types via `AgentUsage`/`AgentRunResult`, `WorkflowLifecycleEvent`,
    `WORKFLOW_LIFECYCLE_EVENT`, `resolveTierModel`, `createWorktree`, … (`tar:dist/index.d.ts:1-60`) —
    plus two packaged skills (`skills/workflow-authoring`, `skills/workflow-patterns`).
  - Config: model-tier config (`tar:src/model-tier-config.ts`), workflow settings
    (`tar:src/workflow-settings.ts`), saved workflows and run records under `~/.pi`-style
    workflow dirs (`tar:src/workflow-paths.ts`, `tar:src/run-record-store.ts`).
- **Coverage**:

| Dim | Verdict | Evidence |
|---|---|---|
| S-IDENT | **covered within the run** | Agent identity is `callId = ${runId}:${callIndex}` (deterministic, survives resume) (`tar:src/run-persistence.ts:34`), with `id`/`label`/`phase`/`prompt` (`:32,35,36,37`); child `sessionId`/`sessionFile` are captured before the first prompt (`:55,57`; callback `tar:src/workflow.ts:409,1412`), and `model` is recorded per agent (`:53`). Name/label default: "derived from phase and call count" (pi.dev capabilities table for `agent()`) and `AgentRunOptions.label` (`tar:src/agent.ts:633-636`). Stable across re-runs by construction (call index), unlike the UUID-based candidates. `unavailable[]`: a stable *human* name beyond label/thread; agent-type identity only as `agentType` routing. |
| S-STARTUP | **adaptable** | Model intent is resolved then recorded: `ModelSource = "explicit"|"tier"|"phase"|"default"|"session"` (`tar:src/pre-spawn-model.ts:15`), `resolveModelForPhase`/`parseModelRoutingFromMeta` (`tar:src/model-routing.ts`), spec helpers incl. thinking suffix (`tar:src/model-spec.ts`: `splitModelSpecThinking`, `formatModelSpecWithThinking`, `THINKING_LEVELS`), and per-agent `model` persisted (`tar:src/run-persistence.ts:52-53`) and journaled (`:67-68`); optional host policy hook `preSpawnModel` (`tar:src/agent.ts:365-369`). Child lineage anchored at start (`tar:src/agent.ts:1047-1052`). `unavailable[]`: **thinking level is not persisted or exposed per agent** (grep for `thinking` finds it only in options/spec parsing, never in `PersistedAgentState`/snapshot); fresh-vs-replay is only implied by journal `replayed` bookkeeping (`tar:src/workflow-manager.ts:1138-1141`). |
| S-OWNER | **adaptable (run-scoped, not session-tree)** | The run owns its children and records immutable lineage: `PersistedRunState{runId, sessionId, parentSessionId, parentSessionFile}` (`tar:src/run-persistence.ts:85-97`), with the explicit note that `parentSessionId/File` are never re-homed while `sessionId` may be (`tar:src/workflow-manager.ts:1688-1694`); child sessions get `parentSession = parentSessionFile` (`tar:src/agent.ts:1047-1052`). `unavailable[]`: per-agent `parentSessionId`/root-session id; a consumer sees the run's lineage, not each agent's ancestry. |
| S-SCOPE | **unsupported (session-scoped, run-scoped)**; observation/authority separated | Consumers observe only the run lifecycle event on the caller's own bus (`tar:src/task-panel.ts:1304`), or read persisted run records; there is no channel for other sessions' runs, and the navigator "shows only the current session's runs" (`tar:src/run-persistence.ts:91-93`). Authority is the `workflow_control` tool (`list/status/pause/resume/stop`, `tar:src/workflow-control-tool.ts:93-97`) and slash commands — a distinct surface from observation. |
| S-LIFECYCLE | **adaptable** | Run-level: `started|resumed|paused|completed|failed|stopped` on `pi-dynamic-workflows:lifecycle` (`tar:src/task-panel.ts:656-663`), run status also `pending|running|paused|completed|failed|aborted` (`tar:src/run-persistence.ts:29`), with pause reasons (`pauseReason`, `resetHint`, `:110,112`) and durable suspension (`checkpoint`, `:114`). Per-**agent** lifecycle is persisted, not emitted: `status: "queued"|"running"|"done"|"error"|"skipped"` (`:38`) with `startedAt`/`endedAt` (`:46-47`), `skipped` written for interrupted agents (`tar:src/workflow-manager.ts:1596-1606`). `unavailable[]`: agent-level start/end events on the bus; a `disposed`/`transferred` vocabulary (adoption is internal: `adoptLiveRunsToSession`, `tar:src/workflow-manager.ts:608`). |
| R-ROUND | **insufficient-evidence / needs-upstream-interface** | Phases are the only round-like unit (`phase()` with optional budget; run record `phases` `tar:src/run-persistence.ts:115`, `phaseBudgets`/`currentPhase` `:123-124`), and per-agent retries/attempts exist (`agentRetries`; usage tracker "across retries" `tar:src/agent-usage.ts:44-52`). No edge-triggered `round_start`/`round_end` with identity+open/close anywhere (`grep round` finds only `loopUntilDry`'s script-level `round` callback and the capability table entry). |
| T-TURN | **adaptable (per-agent + per-run), per-turn unavailable** | See the dedicated cost section: `AgentUsage{input,output,cacheRead,cacheWrite,total,cost,estimated?}` (`tar:src/agent-usage.ts:2-15`), per agent (`tar:src/run-persistence.ts:48-53`, `tar:src/display.ts:25-33`) and per run (`:132-141`), surfaced to the model as `tokenTotal`(+`tokenTotalEstimated`) (`tar:src/workflow-control-tool.ts:69-76`). `unavailable[]`: `turnId`, `responseId`, per-turn http status, and any per-turn (rather than per-agent/per-run) reading. |
| R-RUNTIME | **covered** | Run `durationMs` (`tar:src/run-persistence.ts:131`, also in progress snapshots `tar:src/workflow-progress.ts:101`), per-agent `startedAt`/`endedAt` (`tar:src/run-persistence.ts:46-47`) with a live "no `endedAt` while running" rule (`tar:src/workflow-manager.ts:192-196`) and statuses incl. `running`/`paused` (`:29`); live token rate "tok/s" in the panel (`tar:src/task-panel.ts:1690-1693`). `unavailable[]`: a single structured `{executionId, runtimeMs, status}` reading pushed to a consumer (the `workflow_control` status returns counts + `tokenTotal`, not timings). |
| IN-INPUT | **covered (durable human gates)** | `checkpoint(prompt, opts)` with `kind: "confirm"|"input"|"select"`, `choices`, `timeoutMs`, and `headless: "default"|"abort"` fallback (pi.dev capability table; durable in the run record — `checkpoint?: WorkflowCheckpoint` `tar:src/run-persistence.ts:114`, described as "Durable workflow-controlled suspension and its at-most-once response"), CLI keyword arming (`tar:src/workflow-editor.ts:177`), and run control `pause/resume/stop` (`tar:src/workflow-control-tool.ts:93-97`). `unavailable[]`: an *event* announcing that a human answered a checkpoint (the run record carries the state). |
| V-VIEWED | **covered** | `/workflows` navigator with per-run → phase → agent drill-down, agent detail pager with live tail (`t`, `tar:src/workflow-ui.ts`), run restart/save/rename/delete, `/workflows status <id>` watch-then-print, task panel (`tar:src/task-panel.ts`, `installTaskPanel`); transcripts: per-agent `sessionFile` (`tar:src/run-persistence.ts:56-57`) and optional persistence flag (with a secrets warning, `tar:src/agent.ts:520-529`). Repeat execution: journaled resume `resumeFromRunId` with `resumeMode: "prefix"|"replay-completed"` and edited-script resume (`tar:src/workflow-control-tool.ts:40-48`; journal `PersistedJournalEntry{index,runId,hash,result,model}` `tar:src/run-persistence.ts:61-69`). Cross-restart: runs persist on disk with a lease and pending-delivery marker (`tar:src/run-record-store.ts:459-480`, `tar:src/workflow-manager.ts:2114-2119`) and are re-adopted on `session_start` (`tar:src/pi-extension.ts:364-366`), plus a usage-limit auto-resume scheduler (`tar:src/usage-limit-scheduler.ts`). |
| Process boundary | **in-process** | `tar:src/agent.ts:55-56,1290`; `tar:extensions/workflow.ts:5-8`. |
| Cross-process facts | **n/a (no cross-process path)** | Facts reach a consumer in-process (module exports, `pi.events` run lifecycle, `workflow_control` tool output) or on disk via run records/journals and per-agent `sessionFile` JSONL. |

- **Maintenance/compat prerequisites and risks**: `peerDependencies` require pi
  `>=0.80.8`/`>=0.80.6` (older floor than both subagent candidates → wider host range, but also an older
  API baseline); the tarball ships both `src/` and `dist/`, and the pi-loaded entry imports **`dist/`**
  (`tar:extensions/workflow.ts:5-8`), so what runs is compiled output whose source is only for reading.
  It contains explicit runtime branching for **two host shapes, including oh-my-pi** — "omp's bundled pi
  exports `discoverAuthStorage`", "omp's fork is auth-storage-backed (registry has no `runtime` field
  and `createAgentSession` takes `modelRegistry` instead)" (`tar:src/agent.ts:396-457`, `:748-751`,
  `:1280-1287`) — directly relevant to our migration, but **unverified against an actual omp build here**.
  Main risk: **the declared repository does not exist** (404), so there is no issue tracker, CI, tag
  history, or commit provenance to audit; `gitHead` cannot be confirmed; and MIT/attribution rests on the
  tarball's `LICENSE`, which credits an upstream (`Michael Livs`) whose repo is not the declared one.
- **Evidence limits**: no repo, so no tags/branches/CI/commit history; no `.d.ts`↔`src` cross-check beyond
  reading both; `tests/**` are not shipped in the tarball (only reachable through `scripts` in
  `package.json`), so behaviour claims rest on shipped source + capability metadata.
  `unavailable[]`: published test results/CI status; whether `QuintinShaw` is the upstream or a
  re-publisher; any release notes.

### Token/cost accounting verification for candidate 3 (acceptance item)

**Verified in source. Fields, provenance, and the estimate path:**

| Field | Type/location | Provenance |
|---|---|---|
| `AgentUsage.input / output / cacheRead / cacheWrite / total / cost` | `tar:src/agent-usage.ts:2-8` | per logical agent call, summed across retries (`sumAgentUsage` `:24-36`, `estimated` propagation `:33`) |
| `AgentUsage.estimated?: boolean` | `tar:src/agent-usage.ts:9-15` | "True when these figures come from a character-count heuristic because the provider reported no usage — NOT a measurement … Rendering uses a `~` prefix" |
| Metered path | `tar:src/agent.ts:536-550` (`usageFromStats`) and `:552-568` (`estimateStreamingAssistantUsage`) | session stats (`tokens{input,output,cacheRead,cacheWrite,total}` + `cost`) and per-message `message.usage` including `cost.total` (`:568-569`); returns `undefined` when the provider reported nothing (`:541`) |
| Per-turn/streaming progress | `tar:src/agent.ts:624` (`usageFromSessionProgress`), deltas via `subtractSessionUsageStats` (`:602-616`, `cost: max(0, stats.cost - baseline.cost)`), fed by `onUsageProgress`/`onUsage` from the turn loop (`tar:src/workflow.ts:1408-1409`; `tar:src/agent.ts:1358,1414-1419,1516-1519`) | child session `getSessionStats()` deltas — i.e. **provider-reported**, per attempt, with uncommitted progress shown live |
| Heuristic fallback | `tar:src/agent-usage.ts:96-105` (`commitWithFallback`), call sites `tar:src/workflow.ts:1439,1482`, estimator `tar:src/workflow.ts:2856-2858` (`Math.ceil(JSON.stringify(value ?? "").length / 4)`) | only when the terminal usage was all-zero: `total = estimateTokens(result)+estimateTokens(prompt)` (failure path: prompt only), tagged `estimated: true`; streamed-character fallback also `/4` (`tar:src/agent.ts:571-597`) |
| Per-agent persistence | `tar:src/run-persistence.ts:48-53` (`tokens?: number` scalar estimate, `tokenUsage?: AgentUsage` breakdown, `model`, `sessionId`, `sessionFile`), mirrored in the live snapshot `tar:src/display.ts:25-33` | copied from the live snapshot on persist (`tar:src/workflow-manager.ts:1740-1762`) |
| Per-run totals | `tar:src/run-persistence.ts:132-141` (`tokenUsage{input,output,total,cost?,cacheRead?,cacheWrite?,estimated?}`) | `sumAgentUsage` across agents, `estimated` propagates (`tar:src/agent-usage.ts:33`) |
| Run/phase surface | `tar:src/workflow-progress.ts:99-101`, `tar:src/workflow-ui.ts:302-303,397-400`, `tar:src/workflow-control-tool.ts:69-76` | panel/navigator show `cost` and `estimated`; `workflow_control` status returns `tokenTotal` + `tokenTotalEstimated` |
| Script-facing budget | pi.dev capability table: `budget: {total, spent(), remaining()}`, and "`budget.spent()/remaining()` are raw numbers and cannot carry the marker" | script API reports raw numbers; the `~` marker is a UI/log convention |

Precision statement: **cost is `usage.cost.total` from the provider message** (pi's priced figure), not
computed by the extension from a model rate table — the extension only *sums* it. Tokens are
provider-reported `input/output/cacheRead/cacheWrite`; when a provider reports none, the totals become
character-count estimates explicitly flagged `estimated: true` and rendered with `~` — "never silently as
metered figures". `unavailable[]`: per-turn granularity (usage is per agent call and per run, not per
turn), `responseId`/http status, and a currency/cost provenance split (the code keeps only `cost` as a
scalar; the per-kind cost breakdown is not tracked).

---

## Coverage-gap roll-up (what would need new public pi interfaces)

| Baseline need | 1 tintinweb | 2 gotgenes | 3 workflows | Nature of the gap |
|---|---|---|---|---|
| Observe sessions other than one's own owner (S-SCOPE session scope) | ✗ | ✗ | ✗ | pi `EventBus` is per-`ResourceLoader` (pi `core/event-bus.ts:12`, `core/resource-loader.ts:379`, `core/sdk.ts:203-206`); no session-scope bus or subscription API exists |
| Structured subagent identity + ancestry on the wire (S-IDENT/S-OWNER) | id only | id + `subagents:child:*` sessionId/parentSessionId (children only) | runId/sessionId on run lifecycle | no pi-level "subagent vs main session" or "parent/main session" fact; each extension invents its own |
| Startup anchor (provider+model+effort, fresh vs resume) | ✗ (internal `invocation`) | ✗ (internal, later readable from session file) | partial (model recorded; thinking not) | no pi event carrying a session's resolved provider/model/effort at start |
| Round open/close (R-ROUND) | ✗ | ✗ | ✗ | no pi `round`/turn-edge channel exposed to extensions; turns are observable only through the session event stream |
| Per-turn identity/outcome/usage/http status/responseId (T-TURN) | aggregate + cost | aggregate, no cost | per-agent + run, with `estimated` | pi exposes per-message `usage` (incl. `cost.total`) but no per-turn id/response-id/http-status surface |
| Live per-execution `{executionId, runtimeMs, status}` (R-RUNTIME) | settle-time only | settle-time only | run/agent timestamps | no pi reading API for per-execution runtime |
| User-input events for a subagent (IN-INPUT) | steer only | ask_parent/notify_parent/steer | checkpoints (durable, not an event) | no pi input-event channel scoped to a subagent |
| Cross-process subagent facts | ✗ (in-process only) | ✗ (in-process only) | ✗ (in-process only) | none of the three has a child-process/IPC path; the OMP baseline's cross-process facts would have to come from child stdout/session JSONL |
