# Candidate reports: `pi-subagents` lineage

Pinned revisions, evidence-only. All `file:line` citations are at the pinned SHA of the candidate named in that section.
Scratch clones: `E:/Developer/myhub/wt/_cand/git-nicobailon`, `git-esso`, `git-rhinos`.

**Verdict on the three candidates (answered up front):**

| # | Probe | npm | Forked from | Same lineage as #1? |
|---|---|---|---|---|
| 1 | `pi-subagents` v0.78.0 | `pi-subagents` | (upstream) | — |
| 2 | `@esso0428/pi-subagents` v0.17.40 | `@esso0428/pi-subagents` | **`tintinweb/pi-subagents`** | **No** — different codebase, different author, different tool names |
| 3 | `@rhinos0608/pi-subagents` v0.71.0-beta.0 | `@rhinos0608/pi-subagents` | **`nicobailon/pi-subagents`** | **Yes** — hard fork of #1 with a published delta ledger |

---

## pi-subagents (nicobailon/pi-subagents)

### Identity

| Field | Value | Evidence |
|---|---|---|
| npm pkg | `pi-subagents` | `package.json:2` |
| Repo | https://github.com/nicobailon/pi-subagents | `package.json:26-30` |
| Pinned revision | `a4c8ced69a8176cdf4179b127feddc8875e3418f` — commit subject `chore(release): v0.78.0`, Mon Oct 12 2026; equals npm `gitHead` | `git -C git-nicobailon log -1`; npm `pi-subagents@0.78.0.gitHead` |
| Version in tree | `0.78.0` | `package.json:3`, `CHANGELOG.md` `## [0.78.0] - 2026-10-12` |
| License | MIT (SPDX `MIT`) | `package.json:7`; `LICENSE:1-3` `MIT License` / `Copyright (c) 2026 Nico Bailon` |
| Latest version + publish date | 0.78.0, published Oct 13 2026 (npm tmp stamp `1791869949473`) | npm `/pi-subagents/latest`; pi.dev page |
| pi.dev monthly downloads | **609K/mo · 112.3K/wk** | pi.dev `/packages/pi-subagents` |
| Install command | `pi install npm:pi-subagents` | pi.dev page; `package.json:45-47` `bin.pi-subagents = install.mjs` |
| Package kind (pi.dev) | `extension`, `skill`, `prompt` — 3 resource types | pi.dev page "Types"; manifest `package.json:69-77` (`pi.extensions ./index.ts`, `pi.skills ./skills`, `pi.prompts ./prompts`) |
| Size / deps | 11.4 MB unpacked-ish (npm 11,950,300 B); 5 deps (`jiti`,`yaml`,`acorn`,`undici`,`@js-temporal/polyfill`), 5 optional peers | npm metadata; `package.json` peerDependencies |

Note `package.json:4` says `"private": true` in the checkout while npm publishes it; `scripts/build:pkg` (`package.json:58`) builds the published artifact, and the repo's `index.ts` is run directly in a Git checkout (`docs/extension-api.md` §Published package vs source checkout). Published entry is therefore `index.js`; source pin above is the same revision.

### Execution model — **mixed** (in-process + child-pi-process + external-harness)

| Path | Model | Exact call |
|---|---|---|
| Foreground child | **in-process** — a child `AgentSession` inside the parent Pi process | `pi.createAgentSession({...})` at `src/runs/shared/child-session.ts:527`; factory doc `src/runs/shared/child-session.ts:1-9` ("A child is a pi `AgentSession` created inside the process that owns it: the parent pi process for foreground children, the detached runner process for background children") |
| Background/async child | **child-pi-process** — a detached runner process hosts the child session | `spawn(spawnCommand!, spawnArgs, {...})` at `src/runs/background/async-execution.ts:787`, env `PI_SUBAGENT_CHILD` + `PI_SUBAGENT_PARENT_SESSION` set at `src/runs/background/async-execution.ts:784-785`; constants `src/runs/shared/child-runtime-config.ts:16,18`; runner entry `src/runs/background/subagent-runner.ts` (spawned with a launcher argv, `async-execution.ts:786`) |
| External CLI agent (`runner.type: "external-cli"`) | **external-harness** (Codex / Claude Code / Cursor / Grok CLI) | `spawn(launch.command, launch.args, {...})` at `src/runs/shared/external-cli-runner.ts:337`; adapters `src/shared/types.ts:1810` |
| External job provider (`runner.type: "external-job"`) | extension-owned job, mediated by request/response files in the async run dir | `docs/extension-api.md` §External job provider bridge |
| Child-runtime self-gating | a child process never re-registers the parent extension | `index.ts:1-13` (`PI_SUBAGENT_CHILD === "1"` → `registerExtension = undefined`), re-asserted at `src/extension/index.ts:280-282` |

### Public surface

**Registered tools (model-visible; a third extension cannot call these, but they are the model-visible outputs):**

| Tool | Where |
|---|---|
| `subagent` | `src/extension/index.ts:666` (registered `:1161` region via `registerSubagentToolActivation`) |
| `subagents_enable` (loader; optional per `toolActivation`) | `src/extension/tool-activation.ts:14`, `:102` |
| `bg_wait` | `src/runs/background/wait-tool.ts:50`; registered `src/extension/index.ts:730` |
| `subagent_supervisor` | `src/intercom/native-supervisor-channel.ts:23` |
| `contact_supervisor` | `src/extension/herdr-pi-bridge.ts:78` |
| `structured_output` (child-side only) | `src/runs/shared/subagent-prompt-runtime.ts:519` |
| All of the above are `exposure: "model-only"` | `src/shared/extension-context.ts:9` |

`subagent` model-callable actions: `SUBAGENT_ACTIONS` (57-entry registry) at `src/shared/types.ts:2904`; `options.view` enum `["fleet","transcript"]` at `src/extension/schemas.ts:184-186`.

**Slash commands** (registered in `src/slash/slash-commands.ts`): `/subagents` (`:648`), `/run` (`:655`), `/subagent-cost` (`:693`), `/subagents-doctor` (`:700`), `/subagents-inspect-rpc` (`:707`), `/subagents-guide` (`:724`), `/subagents-refine` (`:739`), `/subagents-fleet` (`:752`), `/subagents-detach` (`:781`), `/subagents-stop` (`:793`), `/subagents-steer` (`:840`), `/subagents-models` (`:911`), `/subagents-profiles` (`:929`), `/subagents-load-profile` (`:941`), `/subagents-refresh-provider-models` (`:994`), `/subagents-generate-profiles` (`:1028`), `/subagents-check-profile` (`:1066`), `/subagents-watchdog` (`src/watchdog/register-main.ts:385`), `/prompt-workflow` (`src/slash/prompt-workflows.ts:265`), `/subagents-bridge` (`src/extension/herdr-pi-bridge.ts:111`).

**Config files:** `~/.pi/agent/extensions/subagent/config.json` (or project `.pi/...`), agent frontmatter files, profiles — full key list in `docs/configuration.md` (756 lines).

**Exported module surface** — this is the load-bearing part for a third extension. `package.json:9-27` declares 16 subpath exports (published; npm metadata confirms identical keys):

| Subpath | Exported symbols (source) |
|---|---|
| `.` (root) | `registerSubagentExtension` default — `index.ts:9` |
| `./agents` | `registerAgent`, `registerAgentViaEvents`, `RUNTIME_AGENT_REGISTER_EVENT`, `RUNTIME_AGENT_REGISTER_VERSION` — `src/api/agents.ts:1-12` |
| `./preflight` | `resolveSubagentLaunchContract` + result/contract types — `src/api/preflight.ts` |
| `./delegation` | `SUBAGENT_DELEGATION_REQUEST_EVENT`/`STARTED`/`UPDATE`/`RESPONSE`/`CANCEL` + types — `src/api/delegation.ts:6-10` |
| `./inspectors` | `INSPECTOR_REGISTER_EVENT`, `registerInspector`, `InspectorPlugin` et al — `src/api/inspectors.ts:6,20-27` |
| `./shared-types` | 30 public types incl. `Usage`, `AsyncStartedEvent`, `ControlEvent`, `SingleResult`, `ExternalJobStatus` — `src/api/shared-types.ts:1-29` |
| `./external-runs` | `registerExternalRun`, `updateExternalRun`, `unregisterExternalRun`, `snapshotExternalRuns`, `listExternalRuns` |
| `./project-panes` | `PROJECT_PANES_API_VERSION`, `openProjectPane`, `getProjectPaneStatus`, `focusProjectPane`, `closeProjectPane`, `readProjectPaneBinding`, `projectPaneBindingPath` + types — `src/api/project-panes.ts:7-32` |
| `./background-work` | `BACKGROUND_WORK_PROTOCOL_VERSION`, `BACKGROUND_WORK_REGISTRY_KEY`, `registerBackgroundWorkProvider`, `listBackgroundWorkProviders`, `listBackgroundWorkWakeChannels`, `snapshotBackgroundWork` — `src/api/background-work.ts:2,30,129,141,154,163` |
| `./child-tool-plan` | `resolvePiLaunchToolPlan` — `src/api/child-tool-plan.ts:1-5` |
| `./control-channel` | `requestAsyncStop` — `src/api/control-channel.ts:1-4` |
| `./intercom-bridge` | `resolveIntercomSessionTarget` — `src/api/intercom-bridge.ts:1-3` |
| `./capability-ceiling` | `registerSubagentCapabilityCeiling`, `resolveCurrentSubagentCapabilityCeiling`, encode/decode/parse/intersect + `SUBAGENT_CAPABILITY_CEILING_REGISTRY_KEY`, `SUBAGENT_CAPABILITY_CEILING_VERSION` — `src/api/capability-ceiling.ts:1-16` |
| `./workflow-resources` | `registerWorkflowResource` + types — `src/api/workflow-resources.ts:1-6` |
| `./external-job-provider` | `registerExternalJobProvider` + provider types — `src/api/external-job-provider.ts` |
| `./required-child-extensions` | `registerRequiredChildExtensions` — `src/api/required-child-extensions.ts:1-5` |

**EventBus channels** (all `pi.events`, in-process only):

| Channel | Constant | Emitted/received |
|---|---|---|
| `subagents:rpc:v1:ready` | `src/extension/rpc.ts:33` | emitted by the bridge on session start |
| `subagents:rpc:v1:request` | `src/extension/rpc.ts:32` | consumed by the bridge |
| `subagents:rpc:v1:reply:<requestId>` | `src/extension/rpc.ts:34` | emitted per request |
| `pi-subagents:runtime-agent-register:v1` | `src/agents/runtime-agent-events.ts:4` | consumed (synchronous) |
| `pi-subagents:inspector-register:v1` | `src/api/inspectors.ts:6` | consumed (synchronous) |
| `prompt-template:subagent:request/started/update/response/cancel` | `src/api/delegation.ts:6-10` | request consumed; started/update/response/cancel emitted |
| `subagent:async-started` | `src/shared/types.ts:2428` | emitted (`AsyncStartedEvent`, `types.ts:1724-1758`) |
| `subagent:async-complete` | `src/shared/types.ts:2436` | emitted at `src/runs/background/result-watcher.ts:599` |
| `subagent:child-status` | `src/shared/types.ts:2442` | emitted at `src/extension/rpc.ts:605-620` and `src/runs/background/async-job-tracker.ts:310` |
| `subagent:process-terminal` | `src/shared/types.ts:2437` | emitted |
| `subagent:foreground-complete` | `src/shared/types.ts:2438` | emitted at `src/runs/foreground/subagent-executor.ts:925` |
| `subagent:control-event` / `subagent:control-intercom` / `subagent:steering-notice` / `subagent:result-intercom` / `subagent:result-intercom-delivery` | `src/shared/types.ts:2439-2444` | emitted |
| `subagent:slash:request/started/response/update/cancel` | `src/shared/types.ts:2895-2899` | slash bridge |
| `subagent:acknowledge-extension` (child-side) | `docs/observability.md` §Runtime extension acknowledgement | consumed by the child-session host |
| `pi-intercom:*` (`intercom:session-identity`, `pi-intercom:detach-request/response`) | `src/shared/types.ts:2424-2427` | cross-process intercom |
| `Symbol.for("@agegr/pi-web/session-liveness/v1")` global registry | `src/integrations/pi-web-session-liveness.ts:4,30` | registered provider for the pi-web host |

**Cross-process non-event surface:** async run artifacts on disk (`status.json`, `events.jsonl`, `output-<n>.log`, `process-terminal.json`, `recovery-descriptor.json`, completion replay/archive) — `docs/observability.md` §Async run artifacts; result JSON read in `src/runs/background/async-resume.ts:290-306`. Also a host RPC widget protocol: `subagent-async` widget with `PI_SUBAGENT_ASYNC_JSON:` payload and `/subagents-inspect-rpc` replying on a `subagent-inspect` widget key with `PI_SUBAGENT_INSPECT_JSON:` (`docs/observability.md` §Host inspection protocol (RPC); implementation `src/runs/background/inspect-rpc.ts:371-384`).

### Coverage per baseline dimension

| Dim | Verdict | Evidence / notes |
|---|---|---|
| **S-IDENT** | **covered** | Child session id = session **file path** (`src/shared/session-identity.ts:6-7`, `getSessionFile() ?? getSessionId()`). Child's `parentSession` header = launching session file, set on the child's own session file (`src/runs/shared/child-session.ts:510,521-522`) — the same field Pi uses for its own forks. Child **display** identity = `deriveChildSessionName(agent, task, label)` (`src/shared/child-session-name.ts:27-47`, cap `:25`), threaded into the child's runtime config as `sessionName` and written with `pi.setSessionName` (`src/shared/child-session-name.ts:9-12`). Operational identity in status = `runId` + `index`/`childId` + `workflowKey` + `agent` (`src/runs/background/async-status.ts:31-46,60-72` for the record shape; `childId` serialized at `:335`; `docs/observability.md` §The fleet inspector, `childId` definition). `subagent:child-status` carries `runId`,`childId`,`childRunId`,`workflowKey`,`stepIndex`,`phase`,`label` (`docs/observability.md` §Status and result fields…). **Stability caveat:** `runId` is per-run and a new `runId` is allocated by `resume`/revive (`docs/extension-api.md` §In-process event-bus RPC, `resume` "returning the new async run details"); the child session file path and `workflowKey` persist. `sessionName` is display-only and derived from task text. |
| **S-STARTUP** | **adaptable** | Effective `model`, `requestedModel`, `thinking` and `launchContractDigest` are recorded per child and reported in results/status/events (`src/runs/background/async-status.ts:60-72` `model`/`thinking`/`requestedModel`; `docs/observability.md` §Status and result fields; `launchContractDigest` defined in `docs/extension-api.md` §Launch contract preflight). Preflight proves the resolved launch (provider/model/thinking/tools) **before** the child starts, with `host_required` diagnostics for host-owned facts (`docs/extension-api.md` §Launch contract preflight). **Gap:** no explicit first-start vs resume/fork discriminator on the event stream. Fork is inferable only from launch `context` (`DEFAULT_FORK_PREAMBLE`, `src/api/shared-types.ts:2` re-export of `src/shared/types.ts`) and the `parentSession` header; resume is inferable from `recovery-descriptor.json` / `sourceRunId` (`src/runs/background/async-resume.ts:326-331`). No `sessionStartEvent.reason` equivalent is published. |
| **S-OWNER** | **covered** | `status.json.sessionId` is the **owner** session (`resolveCurrentSessionId`, `src/shared/session-identity.ts:6-7`; written at `src/runs/background/subagent-runner.ts:2255,5033`). `AsyncStartedEvent.sessionId` + `completionOwnerId` (`src/shared/types.ts:1724,1733-1734`). Run metadata `{runId}_{agent}_meta.json` records `parentSessionId` (`docs/observability.md` §Sessions). Nested children carry a nested route with `rootRunId` (`docs/observability.md` §Nested fanout…; `inheritedNestedRouteOf` used at `src/runs/background/async-execution.ts:72`). A **nested** child points at its direct parent session, not the ancestor main session — the ancestor is reachable only via the nested route/root run, so "attribute to the ancestor main session" is covered transitively, not as a first-class field. Ownership is enforced: `subagents:async-complete` is delivered only to the originating session (`src/runs/background/notify.ts:1024+`; `docs/observability.md` §Completion notifications), and stale-session foreground completions are dropped (`src/runs/foreground/subagent-executor.ts:923`). |
| **S-SCOPE** | **adaptable** | Observing and acting are separated: read-only `status`/`cost`/`inspector.status` vs effectful `spawn`/`steer`/`stop`/`resume` (`docs/extension-api.md` §In-process event-bus RPC). Public read paths are **session-scoped**: `/subagents-inspect-rpc` fails `foreign_session` for another session's runs (`docs/observability.md` §Host inspection protocol (RPC) — "Session-scoped"), RPC `status`/`cost` walk the current session branch (`docs/extension-api.md` §In-process event-bus RPC, `cost`). External-run snapshots are keyed by `sessionId` (`docs/extension-api.md` §External jobs in FleetView). **No "observe all sessions" mode exists** via a public interface; `pi.events` is process-wide but carries per-run `sessionId` rather than offering an all-session enumeration. Explicitly documented: "`pi.events` is in-process only. It does not reach separate Pi processes or child subagents" (`docs/extension-api.md` §Scope). |
| **S-LIFECYCLE** | **covered (background) / adaptable (foreground)** | Background: `events.jsonl` lifecycle transitions `subagent.run.started` (`src/runs/background/subagent-runner.ts:3522`), `subagent.step.started` (`:3820`, `:4187`, `:4534`), `subagent.step.completed\|failed\|paused\|stopped` (`:3868`, `:4249`, `:4695`), `subagent.run.paused` (`:3394`), `subagent.run.stopped` (`:3426`), `subagent.run.timed_out` (`:3458`), `subagent.step.stop_requested/stopped/stop_failed/stop_queued` (`:2318,2338,2353,2359`), `subagent.run.process_terminal` (`src/runs/background/process-terminal.ts:226`), `subagent.run.repaired_stale` (`src/runs/background/stale-run-reconciler.ts:306`). Live hint: `subagent:child-status` with `status: "started"\|"stopping"\|"stopped"` (`src/extension/rpc.ts:617-620`; `docs/observability.md` §Async run artifacts). Terminal classification for completion notices: `completed\|failed\|paused\|stopped` (`docs/extension-api.md` §Host session lifetime…, `details.runs[].status`; emit `src/runs/background/notify.ts:662`). **Foreground** has only a terminal event (`subagent:foreground-complete`, `src/runs/foreground/subagent-executor.ts:925`) plus in-conversation progress; there is no separate foreground `started` event. **Reasons** exist for stopped/timeout/interrupted/paused (`stopped`, `timedOut`, `interrupted`, `exitCode`) but there is **no `new/resume/fork/transferred/disposed` reason enum**; `resume` is visible as a new run (`sourceRunId` in `recovery-descriptor.json`, `src/runs/background/async-resume.ts:326-331`) and `/subagents-detach` reload-stop shows "stopped with the reason" (`docs/observability.md` §The fleet inspector). |
| **R-ROUND** | **adaptable** | No `round_start`/`round_end` name exists anywhere. The per-execution-cycle edge pair is `subagent.step.started` → `subagent.step.completed\|failed\|paused\|stopped` with `{runId, stepIndex, childId, agent, exitCode, durationMs}` (`src/runs/background/subagent-runner.ts:3820,3868`), i.e. identity + open/close per child execution. Workflow script roots additionally emit `subagent:child-status` `"started"` once the keyed child has a concrete launch identity (`docs/observability.md` §Status and result fields — `events.childStatus`). **Background only**; foreground exposes no cycle-boundary event. |
| **T-TURN** | **needs-upstream-interface** | Present per child/step: aggregate `Usage { input, output, cacheRead, cacheWrite, cost, turns }` (`src/shared/types.ts:261-267`), `turnCount`, `toolCount`, `tokens {input,output,total}`, `totalCost`, per-step `model`/`thinking`/`requestedModel` (`src/runs/background/async-status.ts:60-72`), `durationMs`. Cost/turns are also exposed as data by RPC `cost` (`{parent, children, childTotal, total, unresolvedAsyncChildren}`, `docs/extension-api.md` §In-process event-bus RPC) and by `/subagent-cost` (`src/slash/slash-commands.ts:693`). Catalog pricing exists in the model registry and is surfaced as `ModelInfo.cost` (`src/shared/model-info.ts:20-21`, `ModelCost` from `@earendil-works/pi-ai`) — but it is launch/registry metadata, not attached to a turn record. **Missing entirely:** per-turn record with a `turnId`, `round`, `startedAt`; per-turn HTTP status; `responseId`. Evidence of absence: `responseId` occurs in `src/` only as a *negative* guard — `Object.hasOwn(message, "responseId")` used to reject a message (`src/workflows/scripted-workflow.ts:2099`); `statusCode`/`httpStatus` have no hit in `src/` at all. `turnCount` is a counter (`src/runs/background/subagent-runner.ts:3193` `step.turnCount = (step.turnCount ?? 0) + 1` on each assistant `message_end`), not per-turn identity. |
| **R-RUNTIME** | **adaptable** | Per-execution reading available: `runId`/`childId` + `startedAt`, `lastUpdate`, `endedAt`, `durationMs` (`src/runs/background/async-status.ts:100` region; `docs/observability.md` §Status and result fields). Status vocabulary is 8-valued, not `running\|ended`: `queued\|running\|complete\|failed\|partial\|paused\|stopped\|rejected` (`src/runs/background/async-status.ts:100`). Liveness flags: `activityState`, `lastActivityAt`, `currentTool`, `currentToolStartedAt` (`src/runs/background/async-status.ts:53-58`). Process-level proof: `process-terminal.json` `observed\|unknown` + `subagent:process-terminal` + `ping.capabilities.processTerminalProof` (`docs/observability.md` §Process-terminal proof). **No field named `executionId` or `runtimeMs`**; `runId`+`stepIndex`/`childId` and `durationMs` are the substitutes. `docs/observability.md` explicitly warns `lastUpdate` is not a heartbeat. |
| **IN-INPUT** | **covered** | Model-facing `subagent({ action: "steer", id, message, options: { index, mode: "steer"\|"follow_up"\|"auto" } })` and RPC `steer` (`docs/extension-api.md` §In-process event-bus RPC, `steer`). Acknowledged delivery: replies carry `deliveryStatus: "delivered" \| "queued"` (`docs/extension-api.md`; implementation `src/runs/background/steering.ts:156-157`, `src/runs/background/run-child-session.ts:501,694`). Input events are persisted: `subagent.steer.requested`, `scheduled`, `routed`, `queued`, `delivered`, `failed`, `recovered` in `events.jsonl` (`docs/observability.md` §Async run artifacts), plus the live `subagent:steering-notice` channel (`src/shared/types.ts:2441`). Also `command.yield`/`command.cancel` for native child shell calls (`docs/observability.md` §Foreground runs). |
| **V-VIEWED** | **covered** | View: `subagent({ action: "status", id, options: { view: "transcript"\|"fleet", index, lines } })` (`src/extension/schemas.ts:184-186`) reading the child session transcript via `readSessionMessagesTail` / `readSessionTranscriptTail` (`src/runs/background/fleet-view.ts:234,256`) with trusted-root containment; interactive `/subagents-fleet` inspector and FleetView (`docs/observability.md` §FleetView, §The fleet inspector); host RPC `/subagents-inspect-rpc` returns bounded task+transcript+output with no paths and `foreign_session`/`not_found`/`stale` errors (`docs/observability.md` §Host inspection protocol (RPC); `src/runs/background/inspect-rpc.ts:371-384`, `docs/extension-api.md` §Fleet status DTO). Re-run/continue/steer after end: `action: "resume"` with `message` + RPC `resume` (`docs/extension-api.md` §In-process event-bus RPC, `resume`) and `followUp` for `external-job` runners (`docs/extension-api.md` §External job provider bridge). Resume across host restarts: retained-session recovery + resume-from-disk (`src/runs/background/async-retention.ts:196-208` `hasResumableContract`; `src/runs/background/async-resume.ts:450-455` validates the `.jsonl` exists; `/subagents-detach` reload semantics documented in `docs/observability.md`). Also `subagent({action:"inspector.open"})` seat/read via the Inspect plugin surface (`docs/extension-api.md` §Inspect integration). |

### Cross-process session facts / usage / ancestry

- **Session id/file/parent (background, cross-process):** the detached runner writes `status.json` (`sessionId` = owner session id, `sessionFile` = the child session file) and mirrors the child session's event stream into `events.jsonl`; "Both launch paths subscribe to the child session's event stream directly; there is no stdout protocol" (`docs/observability.md` §Child session events). Ancestry is recorded twice: the child session's `parentSession` header (`src/runs/shared/child-session.ts:521-522`) and the run metadata `parentSessionId` (`docs/observability.md` §Sessions).
- **Usage/cost:** the runner accumulates it into `status.json`/result JSON; the live parent reconciles it for the RPC `cost` report, with `unresolvedAsyncChildren` making `childTotal` an explicit lower bound (`docs/extension-api.md` §In-process event-bus RPC, `cost`; `docs/observability.md` §Usage and cost accounting). Pi's built-in session totals do **not** include async child usage — documented as a named limitation.
- **Child-runtime acknowledgement (cross-process):** a cooperating child extension emits `subagent:acknowledge-extension` `{id}` on the child's own `pi.events`; the process hosting the child captures it and reports `runtimeAcknowledgedExtensions { version: 1, source: "child-runtime", ids, omitted }` (`docs/observability.md` §Runtime extension acknowledgement; capability flag `runtimeAcknowledgedExtensions` in `ping`).
- **Facts the framework must not silently zero:** `unresolvedAsyncChildren` (cost lower bound), `processTerminal: "unknown"` (never infer exit), `host_required` preflight diagnostics, `runtimeAcknowledgedExtensions` absence (best-effort only), and `sessionId` matching "both forms" (file path or bare id).

### Third-extension consumption — **YES, extensively** (this is the headline finding)

There is no single answer; there are **eight documented, versioned seams**, plus one process-global symbol registry:

1. **In-process event-bus RPC** — `subagents:rpc:v1:ready` / `:request` / `:reply:<requestId>`, methods `ping, status, manage, spawn, steer, interrupt, stop, resume, cost` (`src/extension/rpc.ts:32-37`; bridge `registerSubagentRpcBridge` `src/extension/rpc.ts:850`, wired at `src/extension/index.ts:655`; `ping` capability advertisement `src/extension/rpc.ts:449-476`). Documented: `docs/extension-api.md` §In-process event-bus RPC.
2. **Structured delegation API** — `prompt-template:subagent:request/started/update/response/cancel` (`src/api/delegation.ts:6-10`), request/response typed contract exported from `pi-subagents/delegation`. Documented: `docs/extension-api.md` §Structured delegation API.
3. **Runtime agent registration** — `pi-subagents:runtime-agent-register:v1`, synchronous result written onto the request (`src/agents/runtime-agent-events.ts:4-5`; `pi-subagents/agents` re-exports `registerAgentViaEvents`). Documented: `docs/extension-api.md` §Runtime agent registration from independent extensions.
4. **Inspector registration** — `pi-subagents:inspector-register:v1` + `registerInspector()` (`src/api/inspectors.ts:6,20-27`). Documented: `docs/extension-api.md` §Register an external inspector.
5. **Background-work provider** — `registerBackgroundWorkProvider` sharing a registry via `Symbol.for("pi-subagents.background-work.v1")` (`src/api/background-work.ts:2`, `:129`). Documented: `docs/extension-api.md` §Background-work provider API.
6. **External job provider** — `registerExternalJobProvider` for `runner.type: "external-job"` agents (`src/api/external-job-provider.ts`). Documented: `docs/extension-api.md` §External job provider bridge.
7. **External runs (display-only)** — `registerExternalRun`/`updateExternalRun`/`unregisterExternalRun`/`snapshotExternalRuns`/`listExternalRuns` (`pi-subagents/external-runs`). Documented: `docs/extension-api.md` §External jobs in FleetView.
8. **Capability ceiling**, **preflight**, **workflow resources**, **project panes**, **required child extensions**, **control channel** — `pi-subagents/capability-ceiling`, `/preflight`, `/workflow-resources`, `/project-panes`, `/required-child-extensions`, `/control-channel` (`src/api/capability-ceiling.ts:8-11`, `src/api/preflight.ts`, `src/api/workflow-resources.ts:1-6`, `src/api/project-panes.ts:7-32`, `src/api/required-child-extensions.ts:1-5`, `src/api/control-channel.ts:1-4`).
9. **Process-global registries** — `Symbol.for("pi-subagents.background-work.v1")` (`src/api/background-work.ts:2`), `SUBAGENT_CAPABILITY_CEILING_REGISTRY_KEY` (`src/api/capability-ceiling.ts:2`), `Symbol.for("@agegr/pi-web/session-liveness/v1")` (`src/integrations/pi-web-session-liveness.ts:4`).
10. **Live observation channels** — `subagent:async-started`, `subagent:async-complete`, `subagent:child-status`, `subagent:process-terminal`, `subagent:foreground-complete`, `subagent:control-event`, `subagent:steering-notice`, `subagent:result-intercom` (`src/shared/types.ts:2428-2444`), plus `tool_result` consumption of `bg_wait` `details.completions` (`docs/observability.md` §Async run artifacts).
11. **Cross-process, non-event:** async run artifacts on disk and the host RPC widget protocol (`PI_SUBAGENT_ASYNC_JSON:` / `PI_SUBAGENT_INSPECT_JSON:`) — the documented cross-process answer for a host that is not on the same `pi.events` bus (`docs/observability.md` §Async run artifacts, §Host inspection protocol (RPC); `docs/extension-api.md` §Scope).

Limits to state alongside the "yes": every `pi.events` channel is **same-process only** and does not reach child subagents; `subagent:child-status` events "are not replayed after a host restart" and "can duplicate across the live event bus and async replay paths"; the RPC's `status` untargeted path may read restored in-memory projections while targeted/rich status stays executor-backed (`src/extension/rpc.ts:452-467`); and the delegation API is foreground-only while the RPC is async-only.

### Maintenance/compat prerequisites and risks

- Pi peer floor: `@earendil-works/pi-ai >= 0.86.1`, peers optional; devDeps pin `0.87.0` (`package.json` peerDependencies + peerDependenciesMeta).
- Version guard at load: `index.ts:14-17` throws if the installed package version differs from the loaded module version ("Restart Pi to load the update; `/reload` cannot replace extension modules").
- Published artifact is built (`scripts/build-package.mjs`) — the repo runs `index.ts` directly (`docs/extension-api.md` §Published package vs source checkout), so a Git pin and an npm pin are not byte-identical entry points.
- Background children need the host's SDK: "npm Pi keeps its detached Node runner; the official Pi 0.86.1 Linux x64 standalone release loads the same runner through Pi's embedded SDK" — a named compat boundary in `docs/standalone-background.md` (README on pi.dev).
- Runner aliases host peer packages to the installed pi package via `JITI_ALIAS` (`docs/extension-api.md` §Runtime files, `src/runs/background/runner-aliases.ts`) — a version-skew surface between host Pi and the extension's peer expectations.
- Rapid release cadence (~0.78.0 at 2026-10-12; 1,331 files, 11.4 MB, 3,900+ unit tests per the rhinos fork's footer narrative) makes pinned-SHA drift the main integration risk.

### Evidence limits

- Reported: source at the pinned SHA, `package.json`, `LICENSE`, `CHANGELOG.md`, `docs/*.md` in-tree, npm registry metadata, pi.dev package page. **Not executed:** no install, no build, no test run, no live Pi session; runtime behaviour claims are read from source/docs only.
- The published npm tarball was **not** unpacked; npm metadata (exports map, `gitHead`, `pi` manifest) is quoted from the registry JSON and cross-checked against the source tree at the same revision.
- `docs/` is first-party prose; where a doc claim is load-bearing it is paired with a source `file:line` above. Doc-only claims are marked as such (e.g. `unresolvedAsyncChildren` semantics, `process-terminal` proof rules).
- Download counts are pi.dev/registry snapshots for the trailing month at the time of reading (window `2026-09-13`…`2026-10-12`), not a trend.

---

## @esso0428/pi-subagents (ESSO0428/pi-subagents)

**Not a fork of candidate 1.** It is a fork of **`tintinweb/pi-subagents`** — a different codebase with a different author and different tool names.

### Identity

| Field | Value | Evidence |
|---|---|---|
| npm pkg | `@esso0428/pi-subagents` | `package.json:2` |
| Repo | https://github.com/ESSO0428/pi-subagents | `package.json:6-9` |
| Pinned revision | `044677ffedd0b92576a4c83ec9e46ca2b5d1b965` — default-branch tip at clone time; in-tree version equals npm latest | `git -C git-esso rev-parse HEAD`; `package.json:3` = `0.17.40`; npm `/@esso0428/pi-subagents/latest.version` = `0.17.40` |
| Fork provenance | README line 5: "**Fork of [`@tintinweb/pi-subagents`]** … integrating `npm:pi-subagents`-style JSON agent overrides"; `LICENSE:3` `Copyright (c) 2026 tintinweb`; package `pi.image`/`pi.video` point at `github.com/tintinweb/pi-subagents/raw/master/media/...` | `README.md:5`; `LICENSE:3`; `package.json:50-56` |
| License | MIT | `package.json:14`; `LICENSE:1,3` |
| Latest version + publish date | 0.17.40, published Oct 15 2026 | npm metadata; pi.dev page |
| Downloads | 6,788/mo · 429/wk (pi.dev, same as npm `last-month` 6788) | pi.dev `/packages/@esso0428/pi-subagents`; `api.npmjs.org/downloads/point/last-month/@esso0428/pi-subagents` |
| Install command | `pi install npm:@esso0428/pi-subagents` | pi.dev page |
| Package kind | `extension` only (no skills/prompts) | pi.dev "Types: extension"; `package.json:50-53` |
| npm `gitHead` | **absent** from registry metadata (no provenance/attestation block) | npm `@esso0428/pi-subagents@0.17.40` JSON |

### Relationship to candidate 1

| Aspect | Finding |
|---|---|
| Fork of #1? | **No.** No `nicobailon` reference anywhere in the tree; upstream is `tintinweb/pi-subagents` (`README.md:5`, `LICENSE:3`, `package.json:54-55`). |
| Interop with #1 | Interop is **config-format only**: the description and README advertise "`npm:pi-subagents`-style JSON agent overrides — configure agents via `settings.json` without writing `.md` files" (`package.json:4`, `README.md:5`). The implementation is `src/nico-overrides.ts`. There is no shared code, no shared event namespace semantics, no shared RPC protocol. |
| Tool-name divergence | #1 exposes one `subagent` tool; #2 exposes Claude-Code-style names: `Agent`, `get_subagent_result`, `steer_subagent`, `subagent_wait_group` (`src/agent-runner.ts:38-43`), plus nested `Agent` / `wait_for_nested_agent` / `steer_subagent` (`src/nested-tools.ts:36`). |
| RPC divergence | #1: `subagents:rpc:v1:*`, 9–10 methods, reply `{version, requestId, success, data\|error}`. #2: `subagents:rpc:ping\|spawn\|stop`, reply on `<channel>:reply:<requestId>` with `{success, data\|error}` and `PROTOCOL_VERSION = 2` (`src/cross-extension-rpc.ts:25,78,83,116`, envelope helper `:56-72`). |

### Execution model — **in-process / child-pi-process mixed**

| Path | Model | Evidence |
|---|---|---|
| Agent session | **in-process** child session in the parent Pi process | `createAgentSession` imported from `@earendil-works/pi-coding-agent` at `src/agent-runner.ts:13`, invoked at `src/agent-runner.ts:874`; session storage `SessionManager.create(...)` / `SessionManager.inMemory(...)` at `src/agent-runner.ts:834-836`; comment `src/agent-runner.ts:863-865` "Child subagent sessions run inside the parent Pi process; they are not a fresh interactive app startup". |
| Child startup event | child sessions are started with `sessionStartEvent: { type: "session_start", reason: "fork" }` — a fixed constant, not a new/resume discriminator | `src/agent-runner.ts:867` |
| Git worktree isolation | external `git` via worktree helper | `src/worktree.ts` |
| Scheduled runs | in-process `croner` timers + PID-locked JSON store at `<cwd>/.pi/subagent-schedules/<sessionId>.json` | `src/schedule.ts:10-14`; `src/types.ts:213` |

No child-`pi`-CLI spawn and no external Codex/Claude harness path found in `src/` (no `spawn(` of a `pi` binary; only `croner`/session APIs).

### Public surface (delta vs #1: much narrower)

- **Package exports: none.** `package.json` has no `exports`, `main`, or `types` field; the only entry is the pi manifest `pi.extensions: ["./src/index.ts"]` (`package.json:50-53`). A third extension cannot `import` anything from this package's published entry points (it would have to deep-import `src/*.ts`, which is not a contract).
- **Tools:** `Agent`, `get_subagent_result`, `steer_subagent`, `subagent_wait_group` (`src/agent-runner.ts:38-43`, registered `src/index.ts:995,1553,1628,1484`); nested-only `Agent`, `wait_for_nested_agent`, `steer_subagent` (`src/nested-tools.ts:36`, `:142,318,342`).
- **Commands:** `/agents` (`src/index.ts:2678`) — the single documented slash entry point (settings, scheduled jobs, viewer).
- **EventBus channels (in-process only):**

| Channel | Line |
|---|---|
| `subagents:created` | `src/index.ts:1455` |
| `subagents:started` | `src/index.ts:494` |
| `subagents:completed` | `src/index.ts:445` |
| `subagents:failed` | `src/index.ts:443` |
| `subagents:steered` | `src/index.ts:1654,1660` |
| `subagents:compacted` | `src/index.ts:504` |
| `subagents:ready` | `src/index.ts:610` |
| `subagents:scheduled` | `src/schedule.ts:290` |
| `subagents:scheduler_ready` | `src/index.ts:560` |
| `subagents:settings_loaded` / `subagents:settings_changed` | `src/settings.ts:276,293` |
| `subagents:rpc:ping` / `spawn` / `stop` | `src/cross-extension-rpc.ts:78,83,116` |
| reply channel `<channel>:reply:<requestId>` | `src/cross-extension-rpc.ts:56-72` |

- **Process-global registry:** `Symbol.for("pi-subagents:manager")` on `globalThis`, exposing a manager object with `spawn`, `abort`, `getRecord` (`src/index.ts:514-533`, using `src/index.ts:527-529`). This is the deepest cross-extension seam and is **undocumented symbol-level API**, not a versioned contract.

### Coverage per baseline dimension (short)

| Dim | Verdict | Note / evidence |
|---|---|---|
| S-IDENT | **adaptable** | Per-agent id is a nanoid (`record.id`); `type`, `description`, `depth`, `parentAgentId` (parent **agent** id, not session id) at `src/types.ts:87-148`. `sessionId` on the record (`src/types.ts:148`, stamped at `src/agent-manager.ts:401`). Session name set via `session.setSessionName(base#<id8>)` (`src/agent-runner.ts:877-880`). **No `parentSession` header** is written on child sessions (`grep parentSession src` → no hits) — ancestry is agent-id-based only. No stable subagent *task name* beyond the display description. |
| S-STARTUP | **insufficient-evidence** | `model`/`thinkingLevel` are set at construction (`src/agent-runner.ts:868-871`), `sessionStartEvent.reason` is the constant `"fork"` (`src/agent-runner.ts:867`). No published per-child launch record (model/effort) reachable by a consumer, and no new-vs-resume discriminator. |
| S-OWNER | **adaptable** | `AgentRecord.sessionId` = owner session (`src/agent-manager.ts:401`); events do **not** carry it (`buildEventData` returns `{id,type,description,result,error,status,toolUses,durationMs,tokens}`, `src/index.ts:406-428`). Attribution requires the undocumented `Symbol.for("pi-subagents:manager")` + `getRecord(id)`. |
| S-SCOPE | **needs-upstream-interface** | No session-scoped read API; event bus carries no session id; no observe-all vs own-owner distinction. `subagents:ready` is a bare broadcast (`src/index.ts:610`). |
| S-LIFECYCLE | **adaptable** | `created`/`started`/`completed`/`failed`/`steered`/`compacted` (`src/index.ts:1455,494,443,445,1654,504`) with terminal status in `status` (`src/types.ts:91`). **No reason field** for new/resume/fork/transferred/disposed. |
| R-ROUND | **insufficient-evidence** | No round/cycle boundary event; only per-agent state transitions. |
| T-TURN | **needs-upstream-interface** | `lifetimeUsage: LifetimeUsage` accumulated on `message_end` (`src/types.ts:122-127`, `src/usage.ts`); `tokens {input,output,total}` in the completion payload (`src/index.ts:412-416`) and `toolUses`/`durationMs` (`src/index.ts:424-425`). No `turnId`, no `round`, no per-turn record, no cost, no HTTP status, no `responseId`. |
| R-RUNTIME | **insufficient-evidence** | `startedAt`/`completedAt` (`src/types.ts:95-96`) and a status enum; no `runtimeMs`/`executionId` field name, and no published snapshot for a consumer. |
| IN-INPUT | **adaptable** | `steer_subagent` tool + `subagents:steered` event with `{id, message}` (`src/index.ts:1654`); no acknowledged-delivery status in the payload. |
| V-VIEWED | **adaptable** | In-TUI `/agents` conversation viewer and durable transcripts (`record.outputFile`, `record.historyFile`, `record.transcriptPath` — `src/types.ts:114-119`); resume via `resume` in the `Agent` tool; recovery on catchable shutdown (`README.md` "Durable interruption recovery"). No machine-readable transcript read API for a third extension; the documented transcript path is a tmp path (`README.md`: `<os-tmpdir>/pi-subagents-<uid>/.../tasks/<agent-id>.output`). |

### Third-extension consumption — **yes, but thin and partly undocumented**

- Documented (README "Event bus" / "Cross-extension RPC" bullets): lifecycle events `subagents:created/started/completed/failed/steered/compacted` (`src/index.ts:1455,494,443,445,1654,504`) and RPC `subagents:rpc:ping|spawn|stop` with a versioned envelope (`src/cross-extension-rpc.ts:25,78-120`) plus `subagents:ready` (`src/index.ts:610`).
- Undocumented but source-visible: `Symbol.for("pi-subagents:manager")` global registry (`src/index.ts:523`) — the only way to read a record's `sessionId`, transcript paths, or usage from another extension.
- **Not available:** no package `exports` map, so no typed importable API; no session-scoped observability API; the emitted event payloads omit session identity and cost (`src/index.ts:406-428`).

### Evidence limits

Source + README + LICENSE + npm/pi.dev metadata at the tip revision; no `gitHead` in the registry, so the pin is the default-branch tip whose `package.json` version equals the published version. Not executed. The README is long (1,012 lines) and only the sections needed for identity/fork/surface were read in full.

---

## @rhinos0608/pi-subagents (rhinos0608/Pi-Subagents)

**Yes — a direct fork of candidate 1** (`nicobailon/pi-subagents`), with a published per-commit delta ledger and a narrowed public surface.

### Identity

| Field | Value | Evidence |
|---|---|---|
| npm pkg | `@rhinos0608/pi-subagents` | `package.json:2` |
| Repo | https://github.com/rhinos0608/Pi-Subagents | `package.json` repository.url; npm metadata |
| Pinned revision | `31030d936b49c9b72207f7bed2f04759c9e69e68` — equals npm `gitHead` for 0.71.0-beta.0 | `git -C git-rhinos rev-parse HEAD`; npm `@rhinos0608/pi-subagents@0.71.0-beta.0.gitHead` |
| Version | `0.71.0-beta.0` | `package.json:3` |
| License | MIT; `LICENSE:3` `Copyright (c) 2026 Nico Bailon` (upstream copyright **retained**) | `package.json:6`; `LICENSE:1-3` |
| author | `Nico Bailon` (upstream author retained in the fork's package.json) | `package.json` author |
| Published | npm tmp stamp `1790644124429` (≈2026-09-29) | npm metadata |
| Downloads | 5,838/mo (npm `last-month`, window 2026-09-13…2026-10-12) | `api.npmjs.org/downloads/point/last-month/@rhinos0608/pi-subagents` |
| Install command | `pi install npm:@rhinos0608/pi-subagents` | scoped name; `package.json` exports use scoped specifiers |
| Fork declaration | `README.md:11` — "This is a fork — see [FORK.md](FORK.md) for fork policy and [docs/fork-delta.md](docs/fork-delta.md) for the upstream delta ledger" | `README.md:11` |
| Manifest | `pi.extensions ./index.ts`, `pi.skills ./skills`, `pi.prompts ./prompts`; `bin.pi-subagents = install.mjs` | npm metadata |

### Fork evidence and provenance

- `README.md:2` still hot-links `raw.githubusercontent.com/nicobailon/pi-subagents/main/banner.png`; `README.md:11` declares the fork; the whole `docs/` tree is upstream's with fork edits.
- `docs/fork-delta.md` (261 lines) is an explicit, dated ledger: baseline `git merge-base HEAD upstream/main → 2e9c51bada2da6a9ba73b6973e1545a9afa0d057` (2026-09-24), upstream `package.json` version `0.73.1`, fork `0.71.0`, "**46 behind**"; then a "Second-pass upstream triage (2026-10-16)" against upstream `2ac33ce1` / **v0.78.0** recording 61 TAKE / 105 ADAPT / 28 SKIP, and a "Promotion to main (2026-10-16)" note. The fork explicitly states: "This is **not** complete upstream parity".
- Delta comparison below is quoted from that ledger **and** verified against the pinned source tree where the ledger cites code.

### Delta in public surface / capabilities (vs candidate 1 @ v0.78.0)

| Area | #1 upstream | #3 fork | Fork evidence (pinned) |
|---|---|---|---|
| Package exports | 16 subpaths incl. `./inspectors` | 16 subpaths, **`./inspectors` removed**, **`./runtime-rpc` added** | npm exports map; `ls src/api` has `runtime-rpc.ts`, no `inspectors.ts` |
| Inspector registration for third parties | `pi-subagents:inspector-register:v1` + `registerInspector()` (`src/api/inspectors.ts:6,20-27`) | **removed** — no `INSPECTOR_REGISTER_EVENT` in `src/` (grep: no hits) | `grep -rn "INSPECTOR_REGISTER_EVENT\|inspector-register" src` → none; `docs/extension-api.md:438-447` keeps a rewritten Inspect section without the registration API (doc drift) |
| RPC methods | `["ping","status","manage","spawn","steer","interrupt","stop","resume","cost"]` | **+`"result"`** (finished-run result query, fork-only) | `src/extension/rpc.ts:37`; ledger `docs/fork-delta.md:40` |
| Second RPC namespace | absent | **`subagents:runtime:v1`** — `ready`/`request`/`reply:<id>`, methods `negotiate, start, status, result, cancelAndSettle`; exported from `./runtime-rpc`; disabled by `PI_SUBAGENTS_RUNTIME_RPC_DISABLED=1` | `src/api/runtime-rpc.ts:14-22,52`; `src/extension/runtime-rpc.ts:16,52,108,340`; `docs/extension-api.md:522-526` |
| Model-facing tool surface | 82 top-level `subagent` params; 57 actions | **9 params** (`agent task action id message topic workflowScript args cwd`); **6 model-visible actions** (`steer resume interrupt status guide validate`) | `src/extension/schemas.ts:238-251`; `src/shared/types.ts:2805`; ledger `docs/fork-delta.md` surface table |
| Tool names | `subagent` + `bg_wait` + `subagents_enable` + `contact_supervisor` | `subagent` (`src/extension/index.ts:866`) + `contact_supervisor` (`src/extension/herdr-pi-bridge.ts:84`, `src/intercom/native-supervisor-channel.ts:328`). **`bg_wait` tool deleted** (`src/runs/background/wait-tool.ts` does not exist; `registerWaitTool` has no refs) and **`subagents_enable` deleted** (no refs in `src/`) | `ls src/runs/background/wait-tool.ts` → missing; `grep bg_wait\|subagents_enable src` → none |
| `context: fork` | `fresh\|fork\|profile`, real session fork | **removed — always fresh** | ledger `docs/fork-delta.md` "Fork context" row; `src/extension/tool-description.ts` referenced there |
| Per-call model/thinking/fast, `skill`, `toolBudget`, `usageBudget`, `timeoutMs`, `maxRuntimeMs` | available per call | **removed** — operator-owned via agent frontmatter/`agentOverrides` | ledger `docs/fork-delta.md` "Removed capabilities and replacements" |
| `output` / `outputMode`, named `workflow`, `workflowScriptPath` | available | **removed** | same ledger |
| Workflow child fields | loose | strict **11-field** allowlist (incl. restored `outputSchema`, `worktree`, `args`) | ledger `docs/fork-delta.md` + FD-010 reversal note |
| `background-work` API | provider contract consumed by `bg_wait` | **still exported** but its `bg_wait` consumer is gone — likely vestigial | `src/api/background-work.ts:1-2` present; no `bg_wait` in `src/` |
| Retained third-party seams | all of the above | **retained**: `./agents`, `./delegation`, `./preflight`, `./external-runs`, `./project-panes`, `./background-work`, `./child-tool-plan`, `./control-channel`, `./intercom-bridge`, `./capability-ceiling`, `./workflow-resources`, `./external-job-provider`, `./required-child-extensions`, `./shared-types`; RPC bridge + `subagent:child-status`/`async-complete`/`process-terminal` channels all present | npm exports map; `src/extension/rpc.ts:33-37,449-476,605` |

Reading the delta against the assessment dims: **S-STARTUP gets worse** (`context: fork` removed ⇒ no genuine fork starts, and per-call model/effort removed from the model surface, though status/result still report the resolved `model`/`thinking`); **T-TURN improves slightly** only via the fork-only `result` RPC method, which returns a finished run's result text — still no turnId/HTTP status/responseId. **R-ROUND, S-IDENT, S-OWNER, S-SCOPE, IN-INPUT, V-VIEWED, R-RUNTIME are unchanged from #1** (same modules, same artifacts, same events), with the caveat that `bg_wait`-mediated input/completion observation is gone.

### Third-extension consumption — **same as #1 minus one seam, plus one**

- Retained: the in-process RPC (`subagents:rpc:v1:*`, now 10 methods incl. `result`) with the same `ping` capability advertisement (`src/extension/rpc.ts:449-476`), delegation events (`src/api/delegation.ts`), runtime agent registration (`src/api/agents.ts` → `pi-subagents:runtime-agent-register:v1`), external runs, preflight, capability ceilings, workflow resources, project panes, background-work provider, external-job provider, required child extensions, control channel, and the live channels `subagent:child-status` / `subagent:async-complete` / `subagent:process-terminal` (`src/extension/rpc.ts:605-620`, `src/shared/types.ts:2437-2442`).
- **Removed:** third-party inspector registration (`pi-subagents:inspector-register:v1`, `pi-subagents/inspectors`) — `grep` finds no `INSPECTOR_REGISTER_EVENT` in the pinned tree.
- **Added:** `subagents:runtime:v1` leaf-model runtime RPC, importable from `@rhinos0608/pi-subagents/runtime-rpc` (`src/api/runtime-rpc.ts:14-22`; bridge `src/extension/runtime-rpc.ts:108`), documented at `docs/extension-api.md:522-526` with an opt-out env var (`PI_SUBAGENTS_RUNTIME_RPC_DISABLED=1`, `src/extension/runtime-rpc.ts:52`). It is a *separate* namespace; the ledger states the legacy `subagents:rpc:v1` namespace is "untouched".
- **Helper-name migration for consumers:** every host import specifier moves from `pi-subagents/...` to `@rhinos0608/pi-subagents/...` (ledger §Owner decisions item 6).

### Evidence limits

Source at the npm-`gitHead` revision + `docs/fork-delta.md` + `README.md` + `LICENSE` + npm registry metadata. The repository's default-branch tip is ahead of the pinned npm revision (`88a0dbd…`, `Fri Oct 16 2026`, subject "test(smoke): locate installed package by scoped manifest name"), and the ledger records further 2026-10-15/16 work that is **not** in the pinned revision — so the fork-delta numbers quoted above describe the pinned 0.71.0-beta.0 artifact, not the moving tip. Not executed; no build/test run.

---

## Cross-candidate summary for the comparison table

| Dimension | #1 `pi-subagents` 0.78.0 | #2 `@esso0428/pi-subagents` 0.17.40 | #3 `@rhinos0608/pi-subagents` 0.71.0-beta.0 |
|---|---|---|---|
| Fork of #1 | — | **No** (fork of `tintinweb/pi-subagents`) | **Yes** (upstream ledger in `docs/fork-delta.md`) |
| Execution model | mixed (in-process foreground / detached child-pi runner / external CLI harness) | in-process `createAgentSession` only | mixed, same as #1 |
| Third-party importable API | 16 subpath exports + 11 event channels + 3 `Symbol.for` registries | **none** (no `exports` map); events + `Symbol.for("pi-subagents:manager")` only | 16 subpath exports (swapped `./inspectors` → `./runtime-rpc`); event channels same as #1 |
| S-IDENT | covered | adaptable | covered (unchanged) |
| S-STARTUP | adaptable | insufficient-evidence | adaptable, weaker (`context: fork` removed) |
| S-OWNER | covered (ancestor via nested route) | adaptable | covered (unchanged) |
| S-SCOPE | adaptable (session-scoped reads; no all-session mode) | needs-upstream-interface | adaptable (unchanged) |
| S-LIFECYCLE | covered (bg) / adaptable (fg) | adaptable | covered (bg) / adaptable (fg) |
| R-ROUND | adaptable (bg `subagent.step.*` pair) | insufficient-evidence | adaptable (unchanged) |
| T-TURN | needs-upstream-interface (no turnId/HTTP status/responseId) | needs-upstream-interface | needs-upstream-interface (fork-only `result` RPC helps only result retrieval) |
| R-RUNTIME | adaptable | insufficient-evidence | adaptable |
| IN-INPUT | covered (acknowledged steer + persisted steer events) | adaptable (unacknowledged) | covered |
| V-VIEWED | covered | adaptable | covered |
| Downloads | 609K/mo | 6,788/mo | 5,838/mo |
