# Fleet-runtime group — read-only source archaeology (pinned revisions)

Scope: `pi-cowboy`, `pi-herdsman`, `pi-agents`, `@arhen/pi-core-subagent`.
Method: shallow clone into `E:/Developer/myhub/wt/_cand/<slug>`, checkout of the release tag/commit, all
`file:line` citations are at the pinned SHA below. No package was installed, no build or test was run.

| candidate | pinned SHA | tag/version at that SHA | local clone |
|---|---|---|---|
| pi-cowboy | `4cf1cb9625e13cbf04fa4f480af82011c97cc13c` | `v0.14.1` (= HEAD, release commit `chore(release): 0.14.1`) | `_cand/pi-cowboy` |
| pi-herdsman | `9545e3ea0832745dfc960228ceda136763291efb` | `v0.27.0` | `_cand/pi-herdsman` |
| pi-agents | `ccdbfbafdffded19b7f47069c0efbefdf1b9bb6d` | `v0.32.2` (annotated tag `8515fb1b…`) | `_cand/pi-agents` |
| @arhen/pi-core-subagent | `4c837b131df4648b01ae786b333ba6faf2985ab6` | `@arhen/pi-core-subagent@1.3.68` (lightweight tag) | `_cand/arhen-pi-extensions` |

Cross-cutting answer up front (**per-turn usage/cost for subagent runs**):

| candidate | per-turn usage/cost of a subagent run? | source |
|---|---|---|
| pi-cowboy | **No.** None anywhere in `src/` (grep for `usage`/`cost` finds only unrelated prose). | — |
| pi-herdsman | **Aggregate-per-session yes; per-turn not surfaced.** Child session JSONL entries are summed (provider-reported `usage.cost.total`). | child Pi session file via `SessionManager.open` |
| pi-agents | **Yes, per turn available; exposed as per-agent totals.** Cost comes from the provider stream message `usage.cost.total`. | pi-durable commit state + live streaming message |
| @arhen/pi-core-subagent | **Yes, per turn available; exposed as per-task totals** (`turns`, tokens, cost). | in-process child `AssistantMessage.usage` (provider stream) |

---

## pi-cowboy (electric-dragon-80000v/pi-cowboy)

- **Identity**: npm `pi-cowboy`; repo `https://github.com/electric-dragon-80000v/pi-cowboy`; pinned
  `4cf1cb9625e13cbf04fa4f480af82011c97cc13c` (`v0.14.1`, HEAD `2026-10-15T15:28:56Z`); license **MIT**
  (`package.json` `"license": "MIT"`; `LICENSE:1-3` "MIT License / Copyright (c) 2026 electric-dragon-80000v").
  Latest version **0.14.1**, published **2026-10-15T15:31:45Z** (`registry.npmjs.org/pi-cowboy` `dist-tags.latest`,
  `time["0.14.1"]`); first publish `2026-10-05T08:20:53Z`, 24 versions. pi.dev monthly downloads **1,731/mo**
  (`api.npmjs.org/downloads/point/last-month/pi-cowboy`; pi.dev package page still renders **Version 0.12.2**, i.e.
  the page lags the registry). Install `pi install npm:pi-cowboy` (README §Install). Package kind per pi.dev:
  **extension** (`pi.extensions = ["./dist/index.js"]`, package.json `pi` field).
- **Execution model**: **child-pi-process + external-harness, in mux panes.** The parent shell-outs to the `herdr`
  CLI; the harness's argv is typed into a pane and started as a herdr agent:
  `pi.exec("herdr", args)` (`src/infrastructure/herdr/herdr-transport.ts:118-119`), command
  `herdr agent start <name> --kind <kind> --pane <paneId> --timeout <ms> -- <piArgs…>`
  (`src/infrastructure/herdr/agents.ts:100-115`). Six harnesses: `pi, pig, pi-bolt, opencode, codex, claude`
  (`src/agents/harness.ts:56-63`); `pi|pig|pi-bolt` run the pi CLI (`src/agents/harness/pi-compatible.ts:33-66`,
  launcher install `:128-133`), `codex` runs `command codex "$@" "$(cat <taskFile>)"`
  (`src/agents/harness/codex.ts:81-83`), `claude` and `opencode` stage config dirs and use their own binary.
  Per-subagent worktree + pane placement: `SubagentSession.launch()`
  (`src/agents/subagent-session.ts:450-608`, pane at `:527-534`, `harness.prepare` `:542-547`,
  `supervisor.start({name,cwd,piArgs,agentMuxKind})` `:555-564`). Extension is inert unless inside herdr and
  **refuses to load inside a subagent spawn** (`src/index.ts:47`, `:52-54` `detectSubagentSpawn()`); also requires a
  git repo (`:63`, `:70-76`).
- **Public surface**: registered tools `cowboy_agent`, `stop_cowboy_agent`, `merge_cowboy_branch`,
  `steer_cowboy_agent`, `cleanup_cowboy_agent` (`src/registration.ts:38-44`; registration `:151-200`); command
  `/cowboy` with `status | spawn | worktree | enable | disable | model` (`src/registration.ts:251-268`); config in the
  pi agent dir via `ConfigStore`. **Exported module surface for other extensions: none.** `package.json`
  `exports = { ".": "./dist/index.js" }` is the extension bundle (default export = the extension function,
  `src/index.ts:44`), and **no `pi.events` channel is registered or emitted anywhere** (grep for `.emit(`/`EventBus`
  in `src/` → only console/logging hits). Cross-run state stays in-process (`AgentManager`,
  `src/events.ts:46-65`) and dies with the session (`src/events.ts:166-191`).
- **Coverage per baseline dimension**:

| dim | category | evidence |
|---|---|---|
| S-IDENT | **unsupported** (session identity) / partial for a cowboy id | Subagent identity is the extension's own spawn id + task name + branch + pane: `buildAgentSpawn` (`src/agents/subagent-session.ts:109-131`), name `cow-<task>-<id>` (`:499-504`), pane ref (`:527-534`), `--name <subagentId>` rides the argv (`src/agents/harness/pi-compatible.ts:39-40`). The **child's pi session id/file is never obtained**: `grep -rn "getSessionId\|sessionId" src` → 0 hits; the only session file reference is the *parent's*, for `--fork` (`src/agents/agent-runner.ts:178-187`, `:422-429`). |
| S-STARTUP | **adaptable** | model + thinking are argv-provable at launch (`--model`, `--thinking`, `src/agents/harness/pi-compatible.ts:43-45`), resolved per spawn from `options.modelSelection` / `options.thinkingLevel` (`src/agents/agent-runner.ts:436-450`). Fork is distinguished (`forkSessionFile`, `:422-429`). But nothing records provider+model+effort as a durable per-run "first start" fact for foreign harnesses (codex/claude only get `--model`, `src/agents/harness/codex.ts:104-109`). |
| S-OWNER | **unsupported** | Ancestry is positional only (`options.signal` parent abort binding, `src/agents/subagent-session.ts:736-747`; parent cwd `src/agents/subagent-session.ts:472`). No parent session id is captured or stored for a child. |
| S-SCOPE | **unsupported** | No observation API at all: no events emitted, no consumer hook. Observation exists only as the human's herdr pane (`src/agents/agent-host.ts:100-109` `observe`/`stop` are internal). No session-scope vs owner-scope distinction is expressible. |
| S-LIFECYCLE | **adaptable** | Phases are internal and rich — `queued | launching | active | settling | settled`, plus terminal outcomes `completed | stopped | failed | never-started | disposed | aborted` (`src/agents/run-state.ts`, projected via `projectLifecycle`, `src/agents/subagent-session.ts:266-269`, `:271-274`; aborted reason/initiator `:387-418`). Nothing is published outside the process. |
| R-ROUND | **unsupported** | No round/execution-cycle concept; the only edge is process/result-file settle (`src/subagent/supervisor.ts:8-21`, `:352-379`). |
| T-TURN | **unsupported** | No turn, provider, model, price, http status, responseId or usage captured. |
| R-RUNTIME | **adaptable** | Wall-clock exists internally (settle timestamps in `run-state.ts`, `queuedAt`/`Date.now()` at `src/agents/subagent-session.ts:116-123`, `:280`), and pane liveness is observable (`src/infrastructure/herdr/agents.ts:119-140` `listAgentRecords` with `idle|working|blocked|done|unknown`). No `{executionId, runtimeMs, status}` record is produced. |
| IN-INPUT | **adaptable** | `steer` delivers a message into the pane (`src/agents/subagent-session.ts:301-349` → `transport…deliver`), and `run_in_background:false` makes the parent block (`src/registration.ts:99`). Not a structured input event. |
| V-VIEWED | **adaptable** (human) / **needs-upstream-interface** (programmatic) | Pane is watchable and steerable by the human; `steer` re-runs a settled agent (`revive`, `src/agents/subagent-session.ts:335-385`; doc in `src/registration.ts:193`). Programmatic transcript read is impossible: no child session file/id is ever recorded (see S-IDENT), and the only parent-side read is the result file (`src/subagent/deliverable.ts:44-53`). |
| Process boundary | covered (foreign-facing) | Cross-process facts arrive via (a) herdr CLI JSON envelopes (`src/infrastructure/herdr/herdr-transport.ts:100-138`) and (b) one file the child writes: `<tmpdir>/pi-cowboy/<agentId>/result.md` (`src/paths.ts:66-81`, prompt staged at `:88-101`, read in `src/subagent/deliverable.ts:44-53`). |

- **Foreign harness → usage/turn facts: no.** The supervisor never parses harness output; the run's only exit channel
  is the result file (`src/subagent/deliverable.ts:5-8` — "a run's deliverable is a file on disk, not a message …
  No protocol carries it"). The only `JSON.parse` on harness stdout in the whole repo is codex's *model list*
  (`src/agents/harness/codex.ts:125-140`). So Codex/Claude/OpenCode subagents yield **zero** turn/usage/cost facts,
  and even pi-family subagents yield none.
- **Nested delegation**: **deliberately impossible.** The extension is a no-op inside a subagent spawn
  (`src/index.ts:52-54`), and children launch with `--no-extensions` or an explicit extension allow-list that the
  template controls (`src/agents/harness/pi-compatible.ts:57-62`); foreign harnesses get `noExtensions`-equivalent
  isolation via staged config dirs. There is no parent/child tree anywhere in the model — no depth field, no
  ancestor pointer.
- **Agent-to-agent messaging: none, and none public.** The only channel is the human typing into a pane
  (`agent send-keys`/`agent prompt`, `src/infrastructure/herdr/agents.ts:268`, `:283`) driven by `steer_cowboy_agent`.
- **Cross-process session facts/usage/ancestry**: only `{subagentId (extension-generated), paneId, herdr name,
  worktree branch/path, result.md content}`. No session id, no parent id, no usage.
- **Maintenance/compat prerequisites and risks**: Linux/macOS only + `herdr >= 0.8` with the pi integration
  (README §Requirements); `node >=24.20.0`; copy-on-write needs APFS/BTRFS/ZFS with a `checkout` fallback; the
  extension compensates for herdr dropping `agent start` names (`src/infrastructure/herdr/agents.ts:35-43`,
  `:119-140`) and for a fresh-pane busy race (README/`agents.ts:146`) — i.e. it already carries herdr-version
  workarounds. Version 0.14.1 published the same hour we pinned it (24 versions since 2026-10-05): highest churn of
  the four.
- **Evidence limits**: `dist/` is not in the repo, so the shipped bundle (`dist/index.js`) was not inspected; all
  claims are from `src/` at the release commit. No runtime observation was performed. Item: whether the pi-family
  child's JSONL is discoverable by a third party via the worktree cwd is out of scope of this candidate (cowboy
  itself never looks).

---

## pi-herdsman (boadij/pi-herdsman)

- **Identity**: npm `pi-herdsman`; repo `https://github.com/boadij/pi-herdsman`; pinned
  `9545e3ea0832745dfc960228ceda136763291efb` (`v0.27.0`, `2026-10-15T12:07:20+02:00`); license **Apache-2.0**
  (`package.json`; `LICENSE:1-3` "Apache License / Version 2.0, January 2004"). Latest **0.27.0** published
  **2026-10-15T10:11:06Z**; 59 versions since `2026-09-05T18:49:02Z`. pi.dev downloads **9,243/mo** (page agrees:
  "Version 0.27.0 … Downloads 9,243/mo · 2,265/wk"). Install `pi install npm:pi-herdsman`. Package kind: **extension
  + skill** (`pi.extensions=["./dist/index.js"]`, `pi.skills=["./SKILL.md","./skills"]`).
- **Execution model**: **child-pi-process in herdr panes** (the extension spawns *pi itself*). Single spawn point:
  `runHerdr(pi, ctx, ["agent","start", herdrAgent, "--kind","pi", "--pane", paneId, "--timeout", …, "--",
  "--extension", <self>, "--extension", HERDR_AGENT_STATE_EXTENSION, ...agentArgs])`
  (`extension/herdr.ts:1523-1554`), with `runHerdr` = `pi.exec("herdr", args, …)` (`extension/herdr.ts:466-478`).
  Child argv built by `agentLaunchArgs` (`extension/agent-definitions.ts:910-1010`: `--model`, `--thinking`,
  `--system-prompt`/`--append-system-prompt <bodyPromptPath>`, tool flags, `--no-builtin-tools`). Child identity is
  injected as env (`extension/agent-controller.ts:5764-5780`): `PI_HERDSMAN_MAILBOX`, `PI_HERDSMAN_RUN_ID`,
  `PI_HERDSMAN_OWNER_SESSION_ID`, `PI_SUBAGENT_PARENT_SESSION`, `PI_HERDSMAN_LABEL`,
  `PI_HERDSMAN_WORKSPACE_ID`, `PI_HERDSMAN_AGENT_DEFINITION`, `PI_HERDSMAN_ALLOWED_AGENT_DEFINITIONS`,
  `PI_OFFLINE=1`. Roles: `lead` (inside herdr) / `managed-agent` (has mailbox env) / `unmanaged`
  (`extension/index.ts:428-435`), with Manager/Chief supervision layers
  (`extension/index.ts:363-376`, `:1616-1702`).
- **Public surface**:
  - **Tools (agent tree)**: `list_agents`, `delegate_agent`, `continue_agent`, `steer_agent`, `interrupt_agent`,
    `reply_agent`, `close_agent`, `inspect_agent`, `read_agent_transcript`
    (`extension/agent-definitions.ts:143-153`; `registerTool` calls `extension/agent-controller.ts:6397,6407,6435,
    6463,6491,6519,6547,6569,6591`), plus child-only `ask_owner` (`extension/agent-controller.ts:990-991`).
  - **Tools (supervision)**: `message_supervisor`, `list_peers`, `message_peer`, `list_staff`, `inspect_staff`,
    `read_staff_transcript`, `message_staff`, `delegate_project`, `resume_project`, `stop_lead`,
    `remove_worktree` (`extension/index.ts:332-355`, registrations `:1703-1983`).
  - **Commands**: `/herdsman`, `/agents` (alias), `/lead`, `/takeover`, `/manager`, `/chief`
    (`extension/index.ts:1617-1702`, `:1984-2008`).
  - **EventBus channel (third-extension interface, documented as a protocol)**:
    **`pi-herdsman:managed-agent-bootstrap`** (`extension/core.ts:31-32`), emitted with `{protocol: 1, phase:
    "prepare"|"initialize", context, agent, register(id, prepare)/accept(callback)}` at
    `extension/agent-controller.ts:5700-5712` and `extension/managed-agent-runtime.ts:2865-2877`. This is a
    participant-registration/initialization protocol another co-loaded extension can join — the *only* exported
    inter-extension seam besides the tools.
  - **File protocol (durable, versioned, readable by a third party)**: mailbox root
    `~/.pi/agent/pi-herdsman/…` (`extension/storage.ts:56-58`), per-agent dir keyed by sha256 of
    workspace+label (`extension/mailbox.ts:232-240`) containing `state.json` v5, `request-<id>.json`,
    `ask.json`, `result-<id>.json` (`extension/mailbox.ts:849-990`), with typed records
    `ManagedAgentState` (`:27-59`, fields include `runId, ownerSessionId, workspaceId, agentLabel, paneId,
    piSessionId, piSessionFile, agentDefinition, activeRequestId, lastActivityAt`), `RequestRecord` (`:76-90`,
    `kind: task|steer|interrupt|reply`), `ResultRecord` (`:105-130`, incl. `contextUsage{tokens,contextWindow,percent}`).
    Result refs are canonical `result:<uuid>` (`extension/storage.ts:14-42`, `:72-80`).
  - **No importable API**: `package.json` has no `exports`, `files` ships only `dist` (bundled) — `extension/*.ts`
    is not a published import path.
- **Coverage per baseline dimension**:

| dim | category | evidence |
|---|---|---|
| S-IDENT | **covered** | Child identity is durable and typed: `agentLabel`, `runId`, `ownerSessionId`, `workspaceId`, `paneId`, **`piSessionId` + `piSessionFile`** in `ManagedAgentState` (`extension/mailbox.ts:27-59`), validated against the environment (`extension/agent-controller.ts:1109-1143`, env compare `:1131-1132`), plus `durableIdentityKey` / `assertUniqueDurableIdentities` (`:783-790`, `:871-886`). Child session id is also read back from herdr (`agent_session`, matched by `matchesExpectedSession`, `extension/herdr.ts:346-364`, `:389-402`). |
| S-STARTUP | **covered** | Launched provider+model+effort are argv-provable (`--model`/`--thinking` at `extension/agent-definitions.ts:939-954`) and the child publishes live `{model, thinking, context%, activity{requestId,task,startedAt}}` to herdr pane metadata at `turn_start`/`turn_end`/`model_select`/`thinking_level_select` (`extension/managed-agent-runtime.ts:1360-1433`, metadata patch type `:357-362`, flush via `herdr pane report-metadata` `:499-527`). Resume is distinguished at launch: inherited model only when `!resumed` (`extension/agent-controller.ts:5789-5797`). |
| S-OWNER | **covered** | `ownerSessionId` in every state/request/result record (`extension/mailbox.ts:31, 81, 109`) and `PI_HERDSMAN_OWNER_SESSION_ID` in the child env (`extension/agent-controller.ts:5767`); delegation depth ≤ 2 is enforced by the extension allow-list (`PI_HERDSMAN_ALLOWED_AGENT_DEFINITIONS`, `:5773-5775`) and the tree is derived by `ownedAssignmentChildren` (`extension/agent-controller.ts:1587-1632`). |
| S-SCOPE | **covered** | Three explicit scopes (`ControllerScope`, `extension/agent-controller.ts:1742-1748`): a Managed Agent sees only its owner boundary, a Lead its owned Agent tree, Manager/Chief their verified staff (`visibleAgentCapabilities` `:1749-1793`; `docs/reference/agent-states.md:32-40` "descendant visibility does not imply authority"). Observation is explicitly separated from authority: "Supervision snapshots and received messages are non-authoritative coordination data" (`extension/index.ts:376`) and `available_tools` is the authority gate (`docs/reference/agent-states.md:16-29`). |
| S-LIFECYCLE | **covered** | Public state projection `working|blocked|settling|unknown|lost` (`docs/reference/agent-states.md:8-14`), request kinds `task|steer|interrupt|reply` (`extension/mailbox.ts:85`), resume via `resume_project`/`continue_agent` (`extension/index.ts:1902-1928`, `:6435`), stop via `stop_lead`/`close_agent`, and a durable run entry `{phase: "started"|"finished", sessionId, startedAt, completedAt}` (`extension/index.ts:324-331`, constant `:322`). |
| R-ROUND | **adaptable** | Round edges exist *inside the child* (`turn_start`/`turn_end`, `agent_start`/`agent_before_settle`/`agent_settled`, `extension/managed-agent-runtime.ts:1360-1405`, `:1436-1440`) and are used to stamp activity/outcome (`RequestRecord`→`ResultRecord` with `completedAt`, `extension/mailbox.ts:129`). There is no per-round record with an open/close identity on the parent side. |
| T-TURN | **adaptable (facts), needs-upstream-interface (ingestion)** | Per-turn identity/outcome exist in the child: `observation = {requestId, outcome, responseEntryId, responseText}` (`extension/managed-agent-runtime.ts:1364-1388`) and per-turn metadata (model/thinking/context%) is published (`:1389-1400`). Turn *usage* is not published per turn; it is recoverable only by re-walking the child session file (see next row). No http status / responseId field. |
| R-RUNTIME | **adaptable** | `lastActivityAt` is written at most every 5s from turn/tool/message events (`extension/managed-agent-runtime.ts:2095-2108` with `activityWriteMinMs` from `extension/index.ts:368`), `startAgent()` returns a start timestamp (`:1021`, `:1290`), herdr agent state is readable (`extension/herdr.ts:774-780` `listAllHerdrAgents`). Not a `{executionId, runtimeMs, status}` triple. |
| IN-INPUT | **covered** | Reserved-marker inputs are intercepted in the child (`pi.on("input")`, `extension/managed-agent-runtime.ts:1024-1030`) and requests of kind `task|steer|interrupt|reply` are durable records (`extension/mailbox.ts:76-90`); `currentTurnIsSoleToolCall` gates `ask_owner` (`extension/core.ts:19-29`). |
| V-VIEWED | **covered** | `read_agent_transcript` / `read_staff_transcript` read the child's **persisted Pi session** (`readAgentTranscript` `extension/agent-controller.ts:1462-1480`; `readPersistedTranscript` `:1444-1460`; requires `piSessionId`+`piSessionFile`, fail-closed otherwise `:1467-1472`); `inspect_staff`/`inspect_agent` read bounded live terminal output via `herdr agent read` (`extension/herdr.ts:368-412`). Re-run/steer-after-end: `continue_agent`/`steer_agent`/`resume_project` (`extension/index.ts:1902-1928`), `ask_owner` → `reply_agent` (`extension/agent-controller.ts:6519-6545`, `:4929`). Cross-restart resume: durable mailbox + session files (ADR 0007 `docs/adr/0007-store-durable-state-under-pi-agent-data.md`; recovery `docs/guides/recovery.md`). |
| Process boundary | covered | Child = separate `pi` process in a herdr pane (`extension/herdr.ts:1523-1554`); facts cross via **env at launch**, the **mailbox files**, and the **child's persisted Pi session files**; the child also pushes metadata through `herdr pane report-metadata` (`extension/managed-agent-runtime.ts:512-526`) and reads back `agent_session` identity (`:358-361`). |

- **Per-turn usage/cost**: **not per-turn on the wire; aggregated from the child session file.**
  `sessionUsageTotals` walks `SessionEntry`s and sums `entry.type === "usage"` (keyed `${provider}/${model}`),
  assistant `message.usage`, tool-result usage and compaction/branch-summary usage, reading `usage.cost.total`
  (`extension/agent-controller.ts:7658-7690`); `collectSessionUsage` recurses over owned child sessions opened with
  `SessionManager.open` and returns `{current, leads, agents, leadSessions, agentSessions, complete, breakdown}`
  (`:7692-7794`), with an explicit `complete` flag so missing coverage is named, not zeroed (`:7719`, `:7746-7774`).
  Presented by `/herdsman stats` (`formatSessionUsage`, `extension/presentation.ts:179-219`; documented
  `docs/reference/commands.md:67-92`, including "Coverage incomplete: some managed project session usage is
  unavailable"). **Source of the numbers: provider-reported usage persisted by pi in the child's session JSONL —
  not an estimate, not harness scraping.** Note the staleness risk: it counts what has been *committed to the child
  session file*, and there is no per-turn table.
- **Foreign harness → usage/turn facts**: **N/A — there is no foreign harness path.** The only `--kind` is `pi`
  (`extension/herdr.ts:1531-1532`); the one integration with another CLI is
  `extension/integrations/pi-codex-context-sharing.ts` (context sharing, not execution).
- **Nested delegation**: **fully represented as a durable Agent tree.** Child env carries the owner session, the
  label, the definition and the explicit allow-list of definitions the child may delegate
  (`extension/agent-controller.ts:5764-5780`); nesting is bounded to depth 2 ("Helpers are depth 2 by
  construction" is pi-agents' wording — herdsman's equivalent is the allow-list plus
  "`available_tools` never includes `delegate_agent`; an agent generation handles one assignment only",
  `docs/reference/agent-states.md:27-29`). Ancestry is read back from the parent's own session entries
  (`sessionAgentIdentity` `extension/agent-controller.ts:1062-1108`, `ownedAssignmentChildren` `:1587-1632`).
- **Agent-to-agent messaging — public?** Yes, two layers, both model-facing and file-backed:
  (1) child↔owner via `ask_owner` / `reply_agent` and `message_supervisor` (`extension/index.ts:1703-1726`);
  (2) peer↔peer via `list_peers` / `message_peer` (`extension/index.ts:1727-1749`, `:2205-2249`), documented in
  `docs/coordination-api.md:74-86`. Transport is the shared mailbox with a process lock
  (`claimAgentMailbox`/`MailboxClaimOccupiedError`, `extension/mailbox.ts:20`, `extension/index.ts:390-406`) and a
  coordination inbox drained per role (`drainCoordinationInbox`, `extension/supervision.ts:241`,
  `extension/index.ts:2167`). It is "public" in the sense of documented + durable + versioned (`version: 5`
  records), but it is **role-gated** (peer tools only exist for `lead` scope) and the wire format is
  internal-to-herdsman; the *supported* third-party seam is the bootstrap EventBus protocol.
- **Maintenance/compat prerequisites and risks**: `node >=22.19.0`; hard peer deps on exact pi packages plus
  `@howaboua/pi-codex-conversion ^3.0.45` (`package.json` peerDependencies); a build-identity check gates
  interop — mismatched extension builds fail closed (`sameRuntimeBuild`/`requireCompatibleBuild`,
  `extension/index.ts:2111-2112`, `:2137`; error prefix at `:385`). Very large surface (~11k lines in
  `lead-runtime.ts`, ~7.8k in `agent-controller.ts`) with 20 ADRs (`docs/adr/`) and 22 test files — high
  operational richness, high coupling to herdr semantics and to pi's `SessionManager`/`buildSessionProjection`
  exports.
- **Evidence limits**: extension is consumed as a bundle; the `extension/*.ts` line numbers are the source of the
  bundle at the tag. `collectSessionUsage`'s `breakdown` map keys are per-model (not per-turn); I did not verify by
  running herdsman whether `complete` is true in a live multi-lead scenario. No runtime observation was performed.

---

## pi-agents (mavam/pi-agents)

- **Identity**: npm `pi-agents`; repo `https://github.com/mavam/pi-agents`; pinned
  `ccdbfbafdffded19b7f47069c0efbefdf1b9bb6d` (`v0.32.2`, `2026-10-15T04:45:41Z`); license **MIT**
  (`package.json`; `LICENSE:1-3` "MIT License / Copyright (c) 2026 Matthias Vallentin"). Latest **0.32.2**
  published **2026-10-15T04:48:39Z**; 42 versions since `2026-03-01T14:12:22Z`. pi.dev downloads **3,191/mo ·
  2,362/wk** (page agrees). Install `pi install npm:pi-agents`. Kind: **extension**
  (`pi.extensions=["./src"]`; ships TS source: `files: ["src","README.md"]`, `exports: {".": "./src/index.ts"}`).
- **Execution model**: **in-process.** Agents are pi-durable conversations opened inside the running pi process:
  `Harness.open(storage, {models, registry, settings, env}, BACKGROUND_CONTEXT)`
  (`src/host/harness.ts:48-79`), with `createConversation`/`configure` per agent inside one commit
  (`src/agents/creation.ts:64-96`). **No `child_process` anywhere** (grep for `spawn|execFile|child_process` in
  `src/` → no process spawns; `src/pi/spawn.ts` is *project-trust* resolution, not process spawning). Storage per
  parent session: `~/.pi/agent/pi-agents/sessions/<session-id>/` (`src/pi/session.ts:43-49`, `:104-107`), so a
  session with agents resumes them at `session_start` (`src/index.ts:104-114`).
- **Public surface**:
  - **Tools**: `agent_spawn`, `agent_spawn_graph`, `agent_send`, `agent_wait`, `agent_status`, `agent_stop`
    (`src/pi/tools.ts:408,458,506,548,576,612`), plus in-agent `delegate_graph` (`src/agents/delegation.ts:71`),
    `agent_send` (`src/agents/messaging.ts:48`), `agent_status` (`:49`).
  - **Commands / UI**: `/messages` (`src/pi/commands.ts:483`), `/agents` (`:495`), `/agent` (`:507`), `ctrl+q`
    focus shortcut (`src/index.ts:69-72`), attach view (`src/ui/attach.ts:1-20`).
  - **EventBus channels — explicitly exported for co-loaded extensions**
    (`src/pi/events.ts:1` "Structured child-agent state for co-loaded extensions"):
    **`pi-agents:state`** (complete lifecycle snapshots `{protocol:1, sessionId, instanceId, sequence, type:
    "snapshot"|"stopped", agents:[{id,name,state,closed}]}`, `src/pi/events.ts:10`, `:19-33`, published `:135-148`)
    and **`pi-agents:state:request`** (accepts `{protocol:1}` to force a snapshot, `:14`, `:55-64`). These carry
    *lifecycle only* — the type deliberately "excludes prompts, results, and mutable activity" (`:17`).
  - **Session transcript entries**: `pi-agents:message` custom entries appended to the parent's Pi session
    (`src/pi/transcript.ts:22`, `:99`), rendered by a registered entry renderer (`:53-58`).
  - Exported module: only the default extension (`src/index.ts:27`); the channel names are the intended interop
    contract.
- **Coverage per baseline dimension**:

| dim | category | evidence |
|---|---|---|
| S-IDENT | **covered** | `AgentInfo{id, name, profile, job, cwd, model, thinking, tools, state, closed, createdAt, stateSince, lastActivityAt, endedAt, usage, activity, result, graph, delegates, queued}` (`src/agents/types.ts:99-134`); `id` is the pi-durable conversation id assigned at creation (`src/agents/creation.ts:72-94`), names are uniquely claimed (`claimName`, `:66-71`) and stable across re-runs (name→id via `service.get/find`, `src/pi/tools.ts:512`). |
| S-STARTUP | **covered** | Provider+model+thinking are written **in the creating commit**: `configure(tx, conversation.id, {cwd, model, thinkingLevel, instructions})` (`src/agents/creation.ts:75-81`), and `ThinkingLevel` is validated before commit (`src/agents/creation.ts:43-44`). `createdAt` and `job` are in the same record (`:82-93`). Fork/resume are distinguishable: forked sessions copy transcript entries but start a new agent store (`src/pi/transcript.ts:47-51`). |
| S-OWNER | **covered** | Ownership is the parent Pi session: storage directory keyed by `ctx.sessionManager.getSessionId()` (`src/pi/session.ts:104-107`, `:43-49`) and results delivered to that session's parent (`src/pi/parent.ts:2-3`, `src/agents/parent.ts:1-13`, `:37-40`). Lineage of nested work is a graph record: `AgentInfo.graph` (`src/agents/types.ts:129`) + `GraphNode{agentId,name,inputs,end}` (`src/agents/types.ts:174-180`). |
| S-SCOPE | **covered (lifecycle only)** | The exported channel is session-scoped and self-describing: `sessionId` + `instanceId` + monotonic `sequence` per publisher instance, and a `stopped` snapshot on teardown (`src/pi/events.ts:26-33`, `:100-123`) so a consumer can tell "no agents" from "not mine". It is observation-only — no channel grants control; control stays with the tools. Note the snapshot is intentionally minimal (`:17`), so an observer cannot see prompts/results/usage. |
| S-LIFECYCLE | **covered** | `AgentState` derived from live run + durable settlement (`deriveState`, `src/agents/derive.ts:74-87`), `UnansweredTurn{reason, detail, current}` (`src/agents/types.ts:150-159`), `RequestOutcome` (`:81-83`), graph/node outcomes incl. `interrupted|stopped|skipped` (`:164-172`), `MessageStatus{queued|delivered|dropped}` (`:138`). Reason strings reach the model (`settlementOf`/`EndedTurn`, `src/agents/derive.ts:30-46`; `stopReason` classification `src/outcome.ts:36-48`). |
| R-ROUND | **covered** | Turns are first-class: the observer records the latest assistant entry and the ended turn per agent (`src/agents/observer.ts:48-60`, `endedTurnOf`/`settlementOf` from pi-durable commits `:15-23`), `TurnSettlement` gates `deriveState` (`src/agents/derive.ts:74-87`), and every turn's usage is accumulated (next row). |
| T-TURN | **covered (usage), partial (identity)** | Usage buckets are per **model** and per **tool** with cost (`summarizeUsage`, `src/agents/derive.ts:93-108`) and a live partial from the streaming message (`addPartialUsage`, `:110-125` — reads `AssistantMessage.usage.cost.total`). Per-agent `usage: AgentUsage` (`src/agents/types.ts:119`) and receipt `ReceiptUsage{input,output,cacheRead,cacheWrite,cost}` (`src/agents/receipts.ts:22-40`, `:55-56`). **No per-turn timestamp/provider/http-status/responseId field** — a turn's identity is its committed entry index, not a tuple. |
| R-RUNTIME | **adaptable** | `endedAt` from durable task times (`src/agents/types.ts:116-118`), `activity` with running tool / reasoning headline / retry / compaction / delegation progress (`:86-97`), and `working` while `live.run !== undefined` (`src/agents/derive.ts:79`). No `{executionId, runtimeMs, status}` record and no named unavailability reason. |
| IN-INPUT | **covered** | `agent_send` submits input to another agent — steering a busy recipient or queueing a follow-up (`src/agents/messaging.ts:1-17`, `:66-76`), memoized by request id so a restart replays instead of duplicating (`:9-15`), with a durable message log and `MessageInfo` (`src/agents/types.ts:140-148`) and a `MessagesDoc` (`src/agents/records.ts:140`). |
| V-VIEWED | **covered** | Attach renders the agent's durable conversation with pi's own components and gives it an editor (`src/ui/attach.ts:1-20`); the panel lists agents (`/agents`, `src/pi/commands.ts:495`); re-run/continue = `agent_send` to a stopped agent restarts it (`src/pi/tools.ts:614` "Messaging an agent later starts it again"; `agent_spawn` only creates). Resume across host restarts = durable per-session storage reopened at `session_start` (`src/pi/session.ts:104-118`) and pi-durable's checkpointing (README). |
| Process boundary | **in-process** | No child process; the cross-boundary analogue is pi-durable's commit/`SubmissionRecord` stream consumed by `HarnessObserver` (`src/agents/observer.ts:1-31`) and the EventBus snapshot (`src/pi/events.ts`). |

- **Per-turn usage/cost**: **yes at the data level, per-agent totals at the interface level, from the provider
  stream.** Numbers originate from committed usage state (per model bucket + per tool bucket, each with
  `cost.total`) read by `summarizeUsage` (`src/agents/derive.ts:93-108`), summed across a graph and its nested
  helpers (`src/agents/projection.ts:454-491`, `src/agents/delegation.ts:463-493`), plus a live partial for the
  in-flight message (`src/agents/derive.ts:110-125`). Delivery to the parent is a receipt:
  `{input, output, cacheRead, cacheWrite, cost}` (`src/agents/receipts.ts:22-40`). No estimation anywhere and no
  harness scraping — it is pi-ai/pi-durable committed usage. The *exported* `pi-agents:state` snapshot does **not**
  contain usage (`src/pi/events.ts:17-21`), so a third extension wanting cost must read tool results/details, not
  the bus.
- **Foreign harness → usage/turn facts**: **N/A — in-process only, one harness (pi-durable).** Agents run on the
  host's `Models` (`src/host/harness.ts:35, 56-71`), so every turn is a normal pi generation with pi's own usage.
- **Nested delegation**: **explicit and first-class, one level deep by construction.** A `delegates` agent gets
  `delegate_graph` (`src/agents/delegation.ts:71`), which starts a graph whose task owns node tasks, each owning a
  helper conversation (`src/agents/delegation.ts:1-20`, tree diagram at `:6-10`); interrupting/stopping a parent
  cascades (`:11-14`); helpers are depth 2 by construction and are stripped of `delegate_graph`/`agent_send`/
  `agent_status` (`:19`, `:604-607`). Depth-2 work is nevertheless *visible* to the parent's accounting: a graph's
  usage includes nested nodes' usage (`src/agents/projection.ts:474-491`). Graphs require 2..N agents
  (`src/agents/creation.ts:109-113`) and edges are `GraphSpec` inputs resolved by `resolveEdges`
  (`src/agents/topology.ts`), with `GraphPolicy = allSettled | failFast` (`src/agents/types.ts:161-162`).
- **Agent-to-agent messaging — public?** **Yes, and it is a documented public interface.**
  `agent_send` / `agent_status` (`src/agents/messaging.ts:48-49`, registered for agents at `:183`, `:233`) let any
  non-helper agent message any other agent of the same session, with durable `MessageInfo` records
  (`src/agents/types.ts:140-148`), a message log document, a `/messages` command for the human
  (`src/pi/commands.ts:483`), and transcript cards (`src/pi/transcript.ts:53-58`). Helpers are excluded both ways
  (`src/agents/messaging.ts:17` "Helpers stay private: they can't send, and nobody can message them"). The
  EventBus snapshot and the transcript entry type are the other public seams.
- **Maintenance/compat prerequisites and risks**: `node >=22.19.0`; hard-dependency on the pi-durable/chord/codemode
  stack (`@earendil-works/pi-durable 1.2.0`, `chord ^1.2.0`, `pi-codemode ^1.2.0`) meaning model-cost visibility is
  only as good as pi-durable's `UsageState`; ships raw `.ts` (`pi.extensions: ["./src"]`), so it depends on pi's
  TS-loading path and on a fairly wide slice of `pi-coding-agent` + `pi-durable` + `chord` view types
  (`src/ui/attach.ts:22-52`). The `pi-agents:state` contract is `protocol: 1` and frozen/minimal — adding usage to
  it would be an upstream change.
- **Evidence limits**: no runtime observation; pi-durable's internal `UsageState`/`SubmissionRecord` shapes were
  read only through its type imports, not from its source. Whether `AgentUsage` can be sliced per turn from the
  public tool outputs was not verified end-to-end (per-agent totals were).

---

## @arhen/pi-core-subagent (arhen/pi-extensions)

- **Identity**: npm `@arhen/pi-core-subagent`; repo `https://github.com/arhen/pi-extensions` (monorepo,
  `repository.directory = "packages/core/pi-core-subagent"`); pinned
  `4c837b131df4648b01ae786b333ba6faf2985ab6` (tag `@arhen/pi-core-subagent@1.3.68`, `2026-10-08T21:29:18+08:00`);
  license **MIT** (`package.json`; `packages/core/pi-core-subagent/LICENSE`, root `LICENSE` "MIT License /
  Copyright (c) 2026 arhen"). Latest **1.3.68** published **2026-10-08T13:30:13Z**; 106 versions since
  `2026-08-16T05:37:59Z`. npm monthly downloads **4,512/mo**. **pi.dev page: absent** —
  `https://pi.dev/packages/pi-core-subagent` returns "There are many packages, but this one does not exist", and the
  catalog search for the name returns no row; per pi.dev's own manifest this is an **extension**
  (`pi.extensions=["./src/index.ts"]`). Install `pi install npm:@arhen/pi-core-subagent`.
- **Execution model**: **in-process.** Children are pi agent sessions created in the same process:
  `createAgentSession({cwd, agentDir, modelRuntime, resourceLoader, sessionManager, model, thinkingLevel, tools,
  customTools})` (`src/manager.ts:618-631`), each with a real pi session file —
  `SessionManager.create(childCwd, undefined, {parentSession: getParentSessionFile(ctx)})` or
  `SessionManager.open(resume.sessionFile, …)` on resume (`src/manager.ts:623-625`). Children run with
  `noExtensions: true` and only the codemode factory (`src/manager.ts:604-614`). The extension is explicit that
  this is a fast in-process path (`README.md:17`, `docs/native-modes.md`, and a `bench/spawn-cost.ts` harness).
  Optional git-worktree isolation per write task (`src/worktree.ts`).
- **Public surface**:
  - **Tools**: `subagent_models`, `subagent`, `subagent_status`, `subagent_result`, `await_subagent`,
    `reply_subagent`, `steer_subagent`, `resume_subagent`, `subagent_cancel`
    (`src/index.ts:220, 232, 368, 389, 405, 425, 446, 473, 502`); child-only tools
    `ask_parent, notify_parent, send_agent_message, poll_agent_messages` (`src/child.ts:6`, built `:22-60`).
  - **Command / UI**: `/subagents [peek | mode … | auto-limit …]` (`src/index.ts:94-144`), shortcut `ctrl+shift+a`
    (`:146`), peek overlay tailing child session files (`src/peek.ts:1-37`).
  - **EventBus channels (per-process `pi.events`, no protocol version / no request channel)**:
    `subagent:run-created`, `subagent:run-updated`, `subagent:run-completed`, `subagent:task-updated`,
    `subagent:task-resumed`, `subagent:task-aborted`, `subagent:intercom`, `subagent:notification`,
    `subagent:session-event`, `subagent:runs-restored` (all emitted through one helper,
    `src/manager.ts:315-317`; payloads at the emit sites, e.g. `:287`, `:322`, `:322-326`). These are **unversioned
    and undocumented** (no `protocol` field, unlike pi-agents' channel) — usable but a loose contract.
  - **Sidecar file (readable by a third party)**: `<parentSessionFile>.subagents.json` — the full
    `RunSnapshot[]` (JSON, capped at 50 runs) written atomically next to the parent's session JSONL
    (`src/manager.ts:291-313`, path derivation `:296`) and re-read at `session_start` via `restoreFromSidecar`
    (`:255-290`, called `src/index.ts:182`).
  - No importable module API: the package has no `exports`; `main` is `./src/index.ts` (the extension).
- **Coverage per baseline dimension**:

| dim | category | evidence |
|---|---|---|
| S-IDENT | **covered** | Per task: `TaskSnapshot{id, runId, agent, task, status, sessionId, sessionFile, model, provider, modelNote, toolsNote, thinking, tools, usage, roster, agentFile, branch, diffStat, changedFiles, isolation, stackedOn, …}` (`src/types.ts:18-60`), populated at child start with the real `child.sessionId`/`child.sessionFile` and clamped thinking (`src/manager.ts:633-645`). `runId` and `taskId` are the addressing pair (`/^[A-Za-z0-9_-]{1,64}$/`, `src/manager.ts:80`). Stability across re-runs: the task keeps `sessionFile` and is revived by `resume_subagent` (`src/index.ts:473-499`). |
| S-STARTUP | **covered** | Provider/model/thinking are recorded on the task at launch (`src/manager.ts:633-645`: `provider: child.model?.provider`, `thinking: child.thinkingLevel`) alongside the caller's request (`src/schemas.ts` `SubagentParams`); resume is explicitly distinguished and may swap model with a clamped thinking level (`clampResumeThinking`, `src/runtime.ts:34-40`; `resume_subagent` "Optional `model` swaps provider", `src/index.ts:476`). |
| S-OWNER | **covered (pi-native)** | The child session file is created with `parentSession: <parent session file>` (`src/manager.ts:623-625`, resolver `:93-99`), i.e. pi's own parent-session linkage, and the task carries `runId` back to the leader's run. Not an "ancestor main session" attribution table, but pi's native parent pointer plus `RunSnapshot` is sufficient to reconstruct it. |
| S-SCOPE | **adaptable** | Scope is the leader's own process and its `SubagentManager` runs (no cross-session view); the sidecar is per parent session (`src/manager.ts:294-296`) and `session_shutdown` clears runs (`src/index.ts:210-217`). Observation is separated from effect only by convention: the EventBus channel is read-only, while control requires tool calls. No session-scope observer. |
| S-LIFECYCLE | **covered** | `RunStatus`/`TaskStatus` with `TERMINAL` (`src/types.ts:29`, used `src/index.ts:72`, `:259`), reasons: `classifyFailure` for `stopReason` (`src/outcome.ts:36-40`), `lastAssistantFailure` (`:42-48`), plus `subagent:task-aborted` / `task-resumed` / `run-completed` events (`src/manager.ts` emit sites). |
| R-ROUND | **adaptable** | Child session events are subscribed per run (`child.subscribe(...)` → `onChildEvent`, `src/manager.ts:654-656`) and surfaced as `subagent:session-event`; there is no paired round open/close record with its own identity. |
| T-TURN | **covered (usage) / partial (identity)** | Each assistant message increments `usage.turns` and adds input/output/cacheRead/cacheWrite/`cost.total`, and captures `message.model` if not yet known (`updateUsageFromMessage`, `src/outcome.ts:23-34`); aggregated per task and per run (`aggregateUsage`, `:10-21`; `run.aggregateUsage` set on every update, `src/manager.ts:319-321`). **No per-turn timestamp, http status, responseId or price-at-turn field.** |
| R-RUNTIME | **adaptable** | `startedAt`/`endedAt` on task and run (`src/types.ts:28-29`, `:68-69`), `toolCalls`, `lastActivity` (`:30-31`), an explicit runtime ceiling (`maxRuntimeMs`, default 1h or 6h: `src/manager.ts:73-74`, `:686`), and a timeout error with the elapsed ms (`:695`). Not a `{executionId, runtimeMs, status}` record. |
| IN-INPUT | **covered** | `steer_subagent` injects steering into a running child (`src/manager.ts:678-684`, tool `src/index.ts:446-470`); `reply_subagent` answers a parked `ask_parent` (`src/index.ts:425-443`); leader input is observed (`pi.on("input")`, `src/index.ts:148-150`). |
| V-VIEWED | **covered** | Read: `subagent_status` returns **each child's `sessionFile` path for `tail -f`** (`src/index.ts:368-385`), `/subagents peek` tails it in-process (`src/peek.ts:19-30`), and `subagent_result` returns finalText+usage (`src/index.ts:388-402`). Re-run/continue/steer after end: `steer_subagent`, `resume_subagent` (revives a failed/aborted task in its original session, preserving worktree branch; refuses tasks that never started — `src/index.ts:473-499`, reason at `src/manager.ts:1108-1110`). Cross-host-restart resume: the sidecar restores runs and marks interrupted tasks (`src/manager.ts:255-290`), though `restoreFromSidecar` **does not resurrect live children** (tasks that were not terminal are rewritten to `aborted`, `:258-274`). |
| Process boundary | **in-process** | Single process; the observable boundary is the child's **pi session file on disk** (`child.sessionFile`, `src/manager.ts:639`) plus the leader's sidecar JSON (`:296`). |

- **Per-turn usage/cost**: **yes, per turn accumulated, from the provider stream.**
  `updateUsageFromMessage` is fed by the child's own `AssistantMessage` (`src/outcome.ts:23-34`, `cost.total` from
  pi-ai's usage), giving `UsageStats{turns, input, output, cacheRead, cacheWrite, cost}` per task
  (`src/types.ts:50`) and `aggregateUsage` per run (`src/types.ts:72`). Rendering: `formatUsage`
  (`src/format.ts:34-39`, cost rendered to 4 decimals) in the tool result, the status line and the widget
  (`src/index.ts:350-361`, `src/format.ts:63-64`, `:222-223`, `:262`). Additionally, catalog **price** is exposed
  (not estimated) by `subagent_models`, which prints per-model rates and explicitly says "unavailable (provider did
  not report rates)" when there are none (`src/format.ts:327-357`, tool `src/index.ts:219-229`). No estimation
  anywhere.
- **Foreign harness → usage/turn facts**: **N/A — in-process only.** Children are pi sessions on the host's
  `ModelRuntime` (`createChildModelRuntime`, `src/manager.ts:621`; `src/runtime.ts:1-9` imports `ModelRuntime` from
  `pi-coding-agent`). No CLI is spawned, so a "foreign harness" cannot appear.
- **Nested delegation**: **not represented — children are prevented from delegating.** The child system prompt says
  "Do not call subagent/delegation tools unless the parent explicitly asks" (`src/manager.ts:602`), and more
  decisively children get `noExtensions: true` with only codemode installed (`src/manager.ts:604-608`), so the
  subagent tool does not exist in a child. Ordering is expressed *within* one leader call as a DAG:
  `needs` edges gate tasks and prepend upstream output (`applyUpstream`/`resolveNeeds`/`runWaveScheduler`,
  `src/graph.ts:21`; documented `README.md:389` as Graph Protocol), with `chain` and flat `tasks` modes
  (`src/index.ts:235-243`, `src/index.ts:301-307`). There is no parent/child agent tree and no depth counter.
- **Agent-to-agent messaging — public?** **Yes between siblings, via an in-memory mailbox; not a public API.**
  Children get `send_agent_message` / `poll_agent_messages` (`src/child.ts:6`, handlers `:18-19`), backed by
  `createMailbox()` whose store is a **plain in-memory `Map`** with `open/send/poll/close`
  (`src/mailbox.ts:1-35`) — no file, no versioned record, and `poll` is destructive `splice(0)`
  (`src/mailbox.ts:26-30`). The leader-facing intercom (`subagent:intercom`, `src/manager.ts` emit sites;
  leader rendering `src/index.ts:33-49`) and `reply_subagent`/`ask_parent` are the child↔leader channel
  (`src/child.ts:23-50`). A third extension can *observe* these only via the unversioned `subagent:*` bus events;
  it cannot join the mailbox. The package exports no module.
- **Maintenance/compat prerequisites and risks**: peer deps on five pi packages including `@earendil-works/pi-agent-core`
  (`package.json`); ships raw `.ts` (`pi.extensions=["./src/index.ts"]`), so it depends on pi's TS loading and on
  internal-ish `pi-coding-agent` exports (`createAgentSession`, `DefaultResourceLoader`, `SessionManager.create`
  with `{parentSession}`, `getAgentDir`, `ModelRuntime` — `src/manager.ts:6-15`, `src/runtime.ts:4-9`); a
  documented remediation exists for the `1.3.63` exposure-mode regression (`docs/native-modes.md:1-33`,
  "it does not retroactively change the existing npm tarball"). Release cadence is the fastest of the group
  (106 versions in ~7 weeks) but the pinned release is **7 days older** than the pinned releases of the other three.
  Missing from pi.dev (page 404) while the npm package has 4,512 downloads/mo — discovery/verification via pi.dev
  is not available.
- **Evidence limits**: no runtime observation; `agentfile.ts`/`presentation.ts` (tool exposure modes) were read only
  at the level needed for the surface claims. The `subagent:*` bus channel list was extracted by grepping emit
  sites, so a channel emitted through an indirection outside `src/*.ts` would be missed.

---

## Comparison of the three requested emphasis points

**(a) Which harness executes the subagent, and does a foreign harness still yield usage/turn facts**

| candidate | executing harness | foreign harness possible? | foreign harness usage/turn facts |
|---|---|---|---|
| pi-cowboy | herdr pane running `pi`/`pig`/`pi-bolt`/`opencode`/`codex`/`claude` (`src/agents/harness.ts:56-63`; start `src/infrastructure/herdr/agents.ts:100-115`) | **yes**, 3 foreign CLIs | **none** — only a result text file (`src/subagent/deliverable.ts:5-8`, `:44-53`); no stream parsing for runs |
| pi-herdsman | herdr pane running **pi only** (`--kind pi`, `extension/herdr.ts:1529-1544`) | no | n/a (all pi: usage recoverable from child session files) |
| pi-agents | **in-process** pi-durable conversations (`src/host/harness.ts:56-71`) | no | n/a (provider stream usage is native) |
| @arhen/pi-core-subagent | **in-process** pi agent sessions (`src/manager.ts:618-631`) | no | n/a (provider stream usage is native) |

**(b) Nested delegation**

| candidate | representation | depth |
|---|---|---|
| pi-cowboy | none; extension is inert inside a child (`src/index.ts:52-54`) | 1 |
| pi-herdsman | durable tree: child env carries owner/label/definition + allow-list of definitions (`extension/agent-controller.ts:5764-5780`); ancestry re-derived from parent session entries (`:1062-1108`, `:1587-1632`) | bounded, `delegate_agent` withheld from a running generation (`docs/reference/agent-states.md:27-29`) |
| pi-agents | explicit `delegate_graph` → graph task → node tasks → helper conversations (`src/agents/delegation.ts:1-20`); helpers stripped of delegation (`:604-607`); nested usage rolls up (`src/agents/projection.ts:474-491`) | 2 by construction |
| @arhen/pi-core-subagent | none; children get `noExtensions` + prompt instruction not to delegate (`src/manager.ts:602, 604-608`); ordering is a DAG within one run (`src/graph.ts:21`) | 1 |

**(c) Agent-to-agent messaging interface, and is it public**

| candidate | mechanism | public? |
|---|---|---|
| pi-cowboy | none (only human typing into a pane, `src/infrastructure/herdr/agents.ts:268,283`) | no |
| pi-herdsman | file mailbox under `~/.pi/agent/pi-herdsman/…` (`extension/mailbox.ts:232-240`, records `:27-130`), role-gated tools `ask_owner`/`reply_agent`/`message_supervisor`/`message_peer` (`extension/index.ts:1703-1749`); documented in `docs/coordination-api.md:40-86` | **closest to public**: documented, versioned (`version: 5`), durable; plus a real EventBus protocol `pi-herdsman:managed-agent-bootstrap` (`extension/core.ts:31`, emitted `extension/agent-controller.ts:5700`, `extension/managed-agent-runtime.ts:2865`) |
| pi-agents | `agent_send`/`agent_status` for any non-helper agent (`src/agents/messaging.ts:48-49,183,233`), durable `MessageInfo` log (`src/agents/types.ts:140-148`), `/messages` (`src/pi/commands.ts:483`) | **yes** — documented tool contract + versioned public EventBus channels `pi-agents:state` / `pi-agents:state:request` (`src/pi/events.ts:10,14,19-33`) |
| @arhen/pi-core-subagent | in-memory mailbox among siblings (`src/mailbox.ts:1-35`, tools `src/child.ts:6`) + child↔leader `ask_parent`/`notify_parent` (`src/child.ts:23-56`) | **no** — in-memory, unversioned bus events `subagent:*` (`src/manager.ts:315-317`), no exported module |

## Cross-candidate uncertainty

- **Not verified:** anything requiring execution. All four are read-only assessments of `src/` at the pinned SHA.
- pi-cowboy is pinned to a release published minutes before this analysis; its public shape (tool names, harness
  list, result file contract) may change.
- `@arhen/pi-core-subagent` pinned release predates `HEAD` of its monorepo by 6 days and differs from the current
  source; the *npm tarball* for 1.3.68 was not downloaded, so its bundled contents were not compared to the tag.
- pi.dev renders a stale version for pi-cowboy (0.12.2 vs 0.14.1) and has **no** page for
  `@arhen/pi-core-subagent`; download counts there were cross-checked against `api.npmjs.org`.
