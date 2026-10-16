# tintinweb `@tintinweb/pi-subagents` v0.22.0 — capability facts — RAW NOTES

Intended path: `E:/Developer/myhub/my-agent-toolkit/.scratch/model-cost-pi-migration/research/raw/notes-tintinweb-capability.md`
(not writable from this subagent: the `write` tool accepts only `xd://` devices and `local://` scratch, and no
filesystem-write device is mounted. This file is the same content under `local://notes-tintinweb-capability.md`.)

Pinned revision: tag `v0.22.0` = commit `85a704cb8f35c96c0cabfa665b572bab296942e5`, clone at
`E:/Developer/myhub/wt/pi-subagent-candidates/.scratch/model-cost-pi-migration/research/candidates/_cand/tintinweb-pi-subagents`.
All paths below are relative to that clone. Read-only investigation; nothing was executed, installed or built.

Package identity: `package.json:2-4` name `@tintinweb/pi-subagents`, version `0.22.0`; extension entry
`package.json:62-66` (`"pi": { "extensions": ["./src/index.ts"] }`).

---

## 1. Autonomous tool invocation

### 1.1 Registered tool names

Single source of truth:

```
src/agent-runner.ts:44-49
export const SUBAGENT_TOOL_NAMES = {
  AGENT: "Agent",
  WORKFLOW: "SubagentWorkflow",
  GET_RESULT: "get_subagent_result",
  STEER: "steer_subagent",
} as const;
```

Registration sites (all in `src/index.ts`, via `pi.registerTool`; `defineTool` imported from the host at
`src/index.ts:15` as `import { defineTool, ... } from "@earendil-works/pi-coding-agent"`):

| Tool | Registration | Definition |
|---|---|---|
| `Agent` | `src/index.ts:2457-2458` `pi.registerTool(registeredAgentTool)` | `src/index.ts:1695-1699` `defineTool({ name: SUBAGENT_TOOL_NAMES.AGENT, label: "Agent", description: agentToolDescription, promptSnippet: "Launch autonomous sub-agents for complex multi-step tasks", ... })` |
| `SubagentWorkflow` | `src/index.ts:2735` `if (isWorkflowsEnabled()) pi.registerTool(workflowTool)` | `src/index.ts:2561-2565` |
| `get_subagent_result` | `src/index.ts:2885-2886` (via `registerToolReportingUsage` → `pi.registerTool(withUsageReporting(tool))`, `src/index.ts:2451-2453`) | `src/index.ts:2885-2890` |
| `steer_subagent` | `src/index.ts:2974-2975` | `src/index.ts:2974-2981` |

Exactly four registration call sites exist (`src/index.ts:2452` wrapper, `2458`, `2735`, and the two
`registerToolReportingUsage(...)` calls at `2885`/`2974`). There is **no** model-facing stop/cancel/kill tool
(§3.3). `grep registerCommand` over `src/` returns a single hit — `/agents`
(`src/index.ts:4210-4213`) — so no slash command spawns subagents either.

### 1.2 How the tool is described to the model

- `promptSnippet` + `promptGuidelines` are part of the tool definition: `src/index.ts:1699-1707` for `Agent`
  (parallelizing, background notification, "Trust but verify"), `src/index.ts:2565-2570` for
  `SubagentWorkflow` (prefer `pipeline` over `parallel`, "do not poll").
- Three description modes resolved at registration: `src/index.ts:1681-1691`
  (`getToolDescriptionMode()` → `compact` | `custom` | `full`; `custom` reads a local
  `agent-tool-description.md` via `loadCustomToolDescription()`), matching setting `toolDescriptionMode`.
- Compact prose instructs autonomous fan-out, `src/index.ts:1591-1600` region: "- Parallel work: one message,
  multiple Agent calls — they run concurrently." / "Subagents run in the background by default; you'll be
  notified when one completes."

### 1.3 Model-invoked vs user-invoked

- **Model-invoked.** `Agent` is an ordinary registered tool; README: "The parent agent spawns sub-agents using
  the `Agent` tool" (`README.md:65`). No forcing or confirmation gate for the spawn itself.
- **User-side surfaces** (no model tool call needed):
  - `/agents` interactive menu — the only registered command (`src/index.ts:4210-4213`, `README.md:553-557`).
  - `@handle <message>` prompt mentions — `pi.on("input", ...)` handler (`src/index.ts:~1040-1106`, notify at
    `src/index.ts:1100-1104`); `README.md:174-176`, `README.md:242`.
  - CLI flag `--subagents-workflow-file=<path>` runs a workflow at session start with no LLM round-trip
    (`src/index.ts:299`, `:391-395`, read at `:2836-2840`; `README.md:588-595`).

### 1.4 `Agent` tool parameter surface

Code: `src/index.ts:1711-1761`. Documented table: `README.md:474-491`.

| Param | Type | Notes (code citation) |
|---|---|---|
| `prompt` | string, required | `src/index.ts:1712-1714` |
| `description` | string, required | 3-5 words, UI only — `src/index.ts:1715-1717` |
| `name` | string, optional | memorable handle, `@name`, accepted by steer/get_subagent_result — `src/index.ts:1718-1725` |
| `subagent_type` | string, required | list built from `getAvailableTypes()` — `src/index.ts:1726-1729` |
| `model` | string, optional | `provider/modelId` or fuzzy — `src/index.ts:1730-1735` |
| `thinking` | string, optional | thinking level — `src/index.ts:1736-1740` |
| `max_turns` | number, optional | min 1, omit = unlimited — `src/index.ts:1741-1746` |
| `run_in_background` | boolean, optional | "Defaults to true" — `src/index.ts:1747-1751` |
| `resume` | string, optional | agent ID to resume — `src/index.ts:1752-1757` |
| `isolated` | boolean, optional | no extension/MCP tools — `src/index.ts:1758-1761` |
| `inherit_context` | boolean, optional | fork parent conversation, default false — `src/index.ts:1762-1765` |
| `isolation` | literal, conditional | spread `isolationParam(isWorktreeIsolationEnabled())` — `src/index.ts:1766`, `src/invocation-config.ts:1-10`; absent from schema when worktree isolation is off |
| `schedule` | string, conditional | spread `scheduleParam` — `src/index.ts:1767`; shape at `src/index.ts:1555-1565`, gated on `isSchedulingEnabled()` |

Background default: `backgroundByDefault = true` (`src/index.ts:1278-1280`; setting `src/settings.ts:50-59`);
"following Claude Code"; nested spawns ignore it.

---

## 2. Nested delegation

### 2.1 Opt-in key, default, semantics

- Key: `allowed_subagents` frontmatter. Types: `src/types.ts:63-67` ("Nested delegation, off by default:
  undefined = no nested tools; `all` = any enabled agent; string[] = only those agent types"); parser
  `src/custom-agents.ts:339-345` (`parseAllowedSubagents`: boolean → `"all"`/undefined, then CSV); rationale
  comment `src/custom-agents.ts:330-334` (omitted/empty/`none`/`false` → undefined; `all`/`*`/`true` → "all");
  wired at `src/custom-agents.ts:205`.
- Documented: `README.md:349` (frontmatter row), `README.md:364-384` (Nested subagents), `README.md:22`
  ("opt-in, default-off delegation ... depth-capped from the main session (default 2). It can control only its
  own children, they are stopped when it finishes, and their transcripts and token spend roll up to it").
- Children reachable only by their owner: nested records get no handle and are hidden from every top-level
  surface (`src/agent-manager.ts:503-507`, `src/types.ts:168-172`).
- Children aborted when the parent settles: `src/agent-manager.ts:1015-1024` (`abortOwnedChildren`,
  transitive to grandchildren).

### 2.2 Depth limit / spawn budget

- Default max depth: `let maxSubagentDepth = 2;` — `src/nested-tools.ts:45-48`
  (`getMaxSubagentDepth` / `setMaxSubagentDepth`, floored at 0). Documented `src/settings.ts:221-227`
  ("counted from the main session: main = 0, its subagents = 1, their children = 2. Defaults to `2`; `0` or
  `1` disables nesting project-wide"), `README.md:380`, `README.md:693`.
- Setting key `maxSubagentDepth` in `subagents.json` / `/agents → Settings → Nested depth`
  (`src/settings.ts:445-451`; validation ceiling `SUBAGENT_DEPTH_CEILING = 16` at `src/settings.ts:389`;
  UI row `src/index.ts:3743-3748`); applied via `appliers.setMaxSubagentDepth` (`src/settings.ts:580`).
- Per-call enforcement: `src/nested-tools.ts:195-200` — at/over the cap returns
  "Nested subagent call blocked (depth=..., max=...)"; depth is an error, not a clamp.
- Injection rule: nested tools injected only when the child is below the cap AND the agent opted in AND it is
  not isolated — `src/agent-runner.ts:942-960` (comparison at `:946-953`: "At (or past) the cap this agent can
  never spawn ... inject nothing rather than three tools whose every call is an error").
  Grandchild depth = `context.depth + 1` (`src/nested-tools.ts:256-257`).
- **No spawn budget / rate limit exists.** Only the depth ceiling is numeric. Explicit in
  `src/agent-manager.ts:104-106` ("the depth cap limits how DEEP nesting goes, not how WIDE") and
  `README.md:382` ("Pair `allowed_subagents` with a `max_turns` ... if you want a hard ceiling on its
  fan-out"). No `spawnBudget`/`maxChildren` symbol in `src/`.

### 2.3 Nested tool surface

`createNestedSubagentTools` (`src/nested-tools.ts:158-420`); names deliberately identical to top-level
(`src/nested-tools.ts:50` `NESTED_TOOL_NAMES = ["Agent","get_subagent_result","steer_subagent"]`; rationale
`src/agent-runner.ts:942-945`):

- nested `Agent` — `src/nested-tools.ts:160-181`: `prompt`, `description`, `subagent_type`, `model`,
  `thinking`, `max_turns`, `background` ("Defaults to false for nested spawns ... a detached child is stopped
  when you finish", `:173-177`), `resume`, `isolated`, `inherit_context`, `isolation`. No `name`, no `schedule`.
- nested `get_subagent_result` — `src/nested-tools.ts:365-373`: `agent_id`, `wait`.
- nested `steer_subagent` — `src/nested-tools.ts:392-399`: `agent_id`, `message`.
- Strict resolution: unknown/disabled/out-of-list types rejected, never `fallbackSubagent`
  (`src/nested-tools.ts:205-215`).
- Nested spawns default to foreground regardless of `backgroundByDefault`
  (`src/invocation-config.ts:85-90`, `src/nested-tools.ts:225-227`, `src/settings.ts:50-53`).

### 2.4 Nested events: propagated or filtered?

**Filtered.** The manager fires lifecycle callbacks for every record it owns, nested included
(`src/agent-manager.ts:35-40`); the host wrapper drops non-top-level records:

- `subagents:completed` / `subagents:failed`: `src/index.ts:577-587` (`if (!isTopLevelAgent(record)) return;`
  immediately before the emit).
- `subagents:started`: `src/index.ts:620-634` (guard at `620`).
- `subagents:compacted`: `src/index.ts:636-645` (guard at `636`).
- `subagents:created`: only on top-level spawn/resume paths (`src/index.ts:1181-1186`, `1451-1456`, `2233-2238`).
- README: "The four agent-lifecycle events ... are emitted for **top-level agents only**. Nested subagents and
  a workflow's children emit nothing at all" (`README.md:815`).
- Nested children are outside both concurrency pools (`src/agent-manager.ts:99-103`, `README.md:382`,
  `README.md:643`); a subagent session never activates this extension, so a child gets no `/agents`, no RPC
  handlers and no `subagents:ready` (`README.md:384`).

---

## 3. Parallel / resume / cancel

### 3.1 Parallel fan-out and concurrency

- Fan-out = several `Agent` calls in one assistant message; pi dispatches a message's tool calls through
  `Promise.all` (`README.md:637`). Taught to the model (`src/index.ts:1596`).
- Two independent pools (`src/agent-manager.ts:5-10`, `README.md:631-645`):
  - background `maxConcurrent`, default `10` (`const DEFAULT_MAX_CONCURRENT = 10;` `src/agent-manager.ts:56`;
    setting `src/settings.ts:11-18`; raised 4 → 10 in 0.18.0);
  - foreground/blocking `maxConcurrentForeground`, default `0` = unlimited
    (`const DEFAULT_MAX_CONCURRENT_FOREGROUND = 0;` `src/agent-manager.ts:68`; setting `src/settings.ts:12-34`);
  - ceiling both: `MAX_CONCURRENT_CEILING = 1024` (`src/settings.ts:386`).
- Queue: `drainQueue` FIFO per pool (`src/agent-manager.ts:1030-1055`); a queued foreground agent is visible
  and stoppable (`README.md:637`).
- Workflow runs cap themselves at `max(1, min(16, cpus - 2))` (`src/workflow/runtime.ts:48-50`) and their
  agents take no session pool slot (`src/agent-manager.ts:222-227`, `src/workflow/host.ts:64-69`).
- Scheduled fires bypass the queue: `bypassQueue: true` (`src/schedule.ts:251-253`).

### 3.2 Resume semantics

- `Agent({ resume })` — `src/index.ts:1744-1750` ("Resumes detached like any other spawn; pass
  run_in_background: false to block ... An agent can only be resumed once its current run has finished").
- Background resume detaches and notifies like a background spawn — `src/index.ts:2102-2130`
  (`startBackgroundResume`); manager side `src/agent-manager.ts:1171-1225` (queues when the background pool is
  full, `:1207-1223`).
- Foreground (inline) resume runs inline and **forwards the tool-call `signal`**:
  `src/index.ts:2132` `await manager.resume(params.resume, params.prompt, signal)`;
  `src/agent-manager.ts:1237-1257` passes `signal` to `resumeAgent`; `src/agent-runner.ts:1256-1290` installs
  `forwardAbortSignal(session, options.signal)` and skips prompting if already aborted (`:1287-1289`).
- Resume of a live run refused: `src/index.ts:2103-2114`; manager guard `src/agent-manager.ts:1196-1204`
  ("Never re-enter a run that is still in flight ... Refuse instead").
- Resume of an owned/nested record refused by the top-level tool: `src/index.ts:2092-2095`.
- **"stoppable inline resume": the phrase does not exist in the pinned tree.** `grep -i stoppable` over the
  clone hits only `src/ui/conversation-viewer.ts:281-283` and `:580-583` (`isStoppable()` = stop handler exists
  and record is running/queued — a viewer keybinding gate, unrelated to resume). The `[0.22.0]` CHANGELOG
  section (`CHANGELOG.md:10-28`) has no resume entry: Added = package-shipped agents/workflows; Changed =
  background completion delivery + Esc handling + join modes; Fixed = `session_shutdown` teardown. Closest
  facts: foreground resume is inline and abortable via the tool-call signal (above), and `ctrl+b` hand-off is
  explicitly not offered for a foreground `resume` (`README.md:88`).

### 3.3 Stop / cancel / kill

Manager primitives:

- `abort(id)` — `src/agent-manager.ts:1471-1490`: `queued` → `dequeue(q => q.id === id)` then `stopped`;
  `running` → `abortController.abort()` then `stopped`; otherwise false.
- `abortAll()` — `src/agent-manager.ts:1572` (queued first, then running; shutdown path `src/index.ts:1124-1130`).
- `abortOwnedChildren(parentId)` — `src/agent-manager.ts:1015-1024`.
- Hand-off (not a kill): `sendToBackground(id)` — `src/agent-manager.ts:1152-1166`; raced against the run in
  the `Agent` tool via `foregroundHandoffs` (`src/index.ts:2337-2375`); bound to `ctrl+b` (`README.md:80`;
  hint delay `src/index.ts:101-102`).

User surfaces:

| Surface | Effect | Citation |
|---|---|---|
| Conversation viewer `x` (twice) | stop the running/queued agent | `src/ui/conversation-viewer.ts:281-287`, `:538-540` |
| `/agents → Running agents` `x` | stop selected agent | `README.md:19`, `README.md:253-255` |
| FleetView `x` | stop selected agent | `README.md:571` |
| `ctrl+b` / viewer `b` | hand a foreground run to the background (not a kill) | `README.md:80-88` |
| Workflow inspector `x` | stop the run | `README.md:580` |
| Workflow inspector `p` | pause: stop *starting* agents; running ones finish | `README.md:581`, `src/workflow/task.ts:172-184` |
| Workflow inspector `s` | skip agent → its `agent()` returns `null` | `README.md:582` |
| Workflow inspector `r` | stop selected child, re-run the same call | `README.md:583` |

RPC `subagents:rpc:stop`: `src/cross-extension-rpc.ts:4` (channel list), `:170-181` (refuses agents owned by
another agent or a workflow), routed to `manager.abort` (`src/index.ts:826-830`); documented `README.md:882-893`,
errors `docs/rpc.md:96-98`.

What can be cancelled:

- a running top-level subagent (all surfaces above and RPC);
- a **queued** agent: `abort()` dequeues it (`src/agent-manager.ts:1475-1483`); queue release path
  `src/agent-manager.ts:1064-1071`;
- a `get_subagent_result` `wait: true` — cancelling stops only the wait; the child keeps running and its result
  stays unconsumed (`src/abortable.ts:4-8`, `src/index.ts:2912-2925`, `README.md:542`);
- a scheduled job only by deletion via `/agents → Scheduled jobs` → `removeJob` (`src/schedule.ts:135-142`,
  `README.md:112`) — there is no cancel tool for it;
- **not** a workflow's agent over RPC (`docs/rpc.md:98`, `docs/workflows.md` "What workflows can't do"), and
  not a nested child from outside its owner (`src/cross-extension-rpc.ts:178`, `src/nested-tools.ts` ownership
  guards).
- No model-facing cancel tool; the model's mid-run control is `steer_subagent` (`src/index.ts:2974-2981`,
  `README.md:544-550`).

---

## 4. Workflow design

### 4.1 What a workflow is here

- A small JavaScript program that coordinates many subagents; model-authored:
  `docs/workflows.md:1-5` ("**you do not write these — the model does.** You describe the work; it emits the
  script; you keep the file and re-run it").
- Deterministic by construction: runs in `node:vm` inside a worker thread; `Date.now()`/`new Date()`/
  `Math.random()` throw (they break journal replay); `eval`/`Function` throw `EvalError`
  (`docs/workflows.md:369`; codegen off at `src/workflow/worker-source.ts:740-743`; `CHANGELOG.md:78`-region).
- Tool description is Claude Code's ported verbatim (~22 KB) → "~5k tokens more system prompt"
  (`CHANGELOG.md:74`).

### 4.2 Declaration

- Every script opens with a pure literal `export const meta = { name, description, phases?, whenToUse? }`,
  read before execution so phases render from the first frame (`src/workflow/meta.ts:31-37`, `:60-74`,
  `:216-230`; bounded eval `META_EVAL_TIMEOUT_MS = 100` at `:55`, `:245-255`; `docs/workflows.md:213-228`).
- Saved workflows: `<cwd>/.pi/workflows`, `<cwd>/.agents/workflows`, then user/package roots
  (`src/workflow/saved.ts:64-70`, `:176-186`; `docs/workflows.md:126-131`); a file counts only if it carries
  the `export const meta =` declaration, detected by regex without executing anything
  (`src/workflow/saved.ts:29-33`, `:109-113`).

### 4.3 Invocation

- **A tool the model calls**, not a slash command and not a user-authored artifact per se:
  "There is no `/workflows` command. The tool is model-invoked" (`docs/workflows.md:23`);
  parameters `script` | `scriptPath` | `name` | `args` | `resumeFromRunId` (+ `title`/`description` accepted and
  ignored for Claude Code parity) at `src/index.ts:2574-2613`; documented `README.md:493-506`,
  `docs/workflows.md:236-250`. At least one of `script`/`scriptPath`/`name` required; precedence
  `scriptPath` > `script` > `name` (`src/workflow/saved.ts:228-232`).
- Registered only when enabled: `src/index.ts:2735`; `workflowsEnabled` (`src/settings.ts:216-220`) defaults to
  *auto* — on unless another extension already registers `Workflow`/`SubagentWorkflow`, in which case this one
  warns and withdraws (`src/workflow/collisions.ts:53-58`, `src/index.ts:2737-2755`, `docs/workflows.md:325-329`).
- Background run: returns immediately with task id `wf_<12 hex>`; notifies on completion (`src/index.ts:2700-2730`;
  `src/workflow/task.ts:24-27`).
- Alternate entry: CLI flag `--subagents-workflow-file=<path>` (`src/index.ts:299`, `:391-395`, `:2836-2840`);
  that path never journals, so it cannot be resumed (`docs/workflows.md`).
- Not reachable from other extensions (no RPC to start/steer; its agents emit no lifecycle events).

### 4.4 Phases, fan-out/fan-in

- `phase(title)` groups subsequent `agent()` calls; declared phases seed the UI from the first frame
  (`src/workflow/meta.ts:23-29`, `src/workflow/progress.ts:41-50`, `:298-301`; `docs/workflows.md:296-300`).
- `parallel(thunks)` = barrier; `pipeline(items, ...stages)` = no barrier between stages; each stage gets
  `(previousResult, originalItem, index)`; a throwing stage drops that item to `null`
  (`docs/workflows.md:270-286`).
- `agent(prompt, opts)` options `label`, `phase`, `agentType`, `model`, `effort`, `isolation`, `gate`,
  `resume`, `schema`; unknown keys rejected by name (`docs/workflows.md:252-268`).
- Composition `workflow(nameOrRef, args?)` — inline, **one level only**, sharing the parent's concurrency cap,
  agent counter, abort signal, journal and budget (`docs/workflows.md:288-295`;
  `src/workflow/worker-source.ts:633-644`, host side `:1155-1165`).
- Caps: 1000 agents/run, 4096 items per `parallel`/`pipeline` call, 256 nested `workflow()` calls, 512 KiB
  script, concurrency `max(1, min(16, cpus - 2))` (`src/workflow/runtime.ts:25-50`; `docs/workflows.md:303-310`).
- `resumeFromRunId`: journal `<run id>.workflow.jsonl`; replays the unchanged *prefix* of settled `agent()`
  calls; first changed/failed call and everything after runs live (`src/workflow/journal.ts:51-53`, `:93-100`;
  `docs/workflows.md:155-180`).

### 4.5 Claude Code compatibility

- `docs/workflows.md:405-425`: a port of Claude Code's `Workflow` tool down to its state model; a Claude Code
  script "runs here unchanged", verified by `test/workflow-claude-code-compat.test.ts`. Differences: tool named
  `SubagentWorkflow`; `budget.total` always `null` (pi has no token-target directive) so guarded patterns don't
  fire; `schema` pressured not forced (`constrainedSampling: strict: "prefer"` + description + validation
  retry; `toolChoice` is not plumbed through pi's `AgentSession`); if both extensions are loaded this one stands
  down. Additions: `gate`, `resume`, `effort`, journal-backed `resumeFromRunId`, un-awaited-`agent()` check.
- Sandbox boundary statement: `docs/workflows.md:427` — a determinism/accident boundary, not defence against a
  hostile script.

---

## 5. Scheduling restrictions (`croner`)

- Dependency `"croner": "^10.0.1"` (`package.json:33`); earlier bump 8 → 10 with the `?`-as-wildcard note
  (`CHANGELOG.md:446`). Sole consumer `src/schedule.ts` — import `:19`, `private jobs = new Map<string, Cron>()`
  `:51`, armed at `:193-195`, used to validate expressions at `:363-368`.
- Engine shape: two maps — croner `Cron` jobs plus `setInterval`/`setTimeout` for interval/once
  (`src/schedule.ts:4-8`, `:51-52`, `:171-197`).
- Declaration: the `Agent` tool's optional `schedule` string parameter, not a separate tool or command
  (`src/index.ts:1555-1565`; accepted in the handler `src/index.ts:2048-2079`). Formats: 6-field cron, interval
  (`5m`/`1h`/`30s`/`2d`), one-shot relative (`+10m`), one-shot ISO — `src/schedule.ts:328-352`; `README.md:98-104`.
- **Schedules fire real runs** (not discovery-only): `executeJob` calls
  `manager.spawn(pi, ctx, ..., { isBackground: true, bypassQueue: true, ... })` (`src/schedule.ts:245-270`);
  results arrive via the ordinary background completion notification (`src/schedule.ts:11-15`, `README.md:106`);
  `{type:"fired"}` / `{type:"error"}` events at `src/schedule.ts:275-278`, `:270-272`.
- Persistence/scope: session store `<cwd>/.pi/subagent-schedules/<sessionId>.json` with a PID lock
  (`src/schedule-store.ts:14-18`, `:52-54`); armed from the store on `session_start` (`src/schedule.ts:60-67`,
  `src/index.ts:776-783`, `:844`); `scheduler.stop()` on `session_before_switch` and `session_shutdown`
  (`src/index.ts:1104-1107`, `:1124`). Documented: "Schedules are **session-scoped**: they reset on `/new` and
  restore on `/resume`" (`README.md:112`).
- Restrictions documented at `README.md:116-119`, plus code:
  - cannot combine with `inherit_context` or `resume` — `README.md:117`, enforced `src/index.ts:2048-2052`;
  - `run_in_background: false` refused; jobs always run in background (`README.md:118`);
    the param says "Forces run_in_background" (`src/index.ts:1560`);
  - fires bypass `maxConcurrent` (`README.md:119`, `src/schedule.ts:11-13`, `:251-253`);
  - `schedulingEnabled` (default `true`, `src/index.ts:1282-1290`, `src/settings.ts:60-68`) strips the `schedule`
    param + guideline from the Agent spec and stops the scheduler immediately
    (`src/index.ts:3974-3980`, `README.md:114`); schema change effective next session;
  - "Headless `pi -p` doesn't wait for scheduled subagents" (`README.md:119`);
  - a one-shot whose timestamp is already past is disabled and never fires (`src/schedule.ts:186-191`);
  - nothing fires while no pi session holds the scheduler — timers are in-process; no daemon/cron table/OS
    trigger exists in the tree;
  - workflows cannot be scheduled: "No scheduled workflows. The scheduler runs agents, not workflows."
    (`docs/workflows.md`, "What workflows can't do").
  - **Not found:** any documented "schedules are only discovered, not fired" restriction — the opposite holds
    (`executeJob` spawn citation above). Such a claim is unsupported by this tree.
- Other time-based/background features (internal timers): workflow `gate` timeout 10 min
  (`src/workflow/host.ts:51`); completion-notification hold 200 ms (`src/completion-outbox.ts:23-24`,
  `README.md:649`); agent-record cleanup every 60 s with a 10-minute sweep (`src/agent-manager.ts:425-427`);
  widget render 80 ms (`src/ui/agent-widget.ts:344-346`); FleetView tick 200 ms / linger 4 s
  (`src/ui/fleet-list.ts:26-29`); workflow card tick 1 s (`src/ui/workflow-card.ts:55`); dialog spinner 80 ms
  (`src/ui/workflow-dialog.ts:105-106`); `meta` eval bound 100 ms (`src/workflow/meta.ts:55`); background-hint
  delay 2 s (`src/index.ts:101-102`).

---

## 6. Peer range / host constraint

- `package.json:26-31`: `"@earendil-works/pi-ai": ">=1.1.0"`, `"@earendil-works/pi-coding-agent": ">=1.1.0"`,
  `"@earendil-works/pi-tui": ">=1.1.0"`, `"typebox": "*"` (mirrored `package-lock.json:27-32`). DevDependency
  pins are exactly `1.1.0` for the three `@earendil-works/pi-*` packages (`package.json:41-45`).
- Reason for the floor: `CHANGELOG.md:62` — moved `>=0.84.0` → `>=1.1.0` because the `@handle` mention clone
  uses `SessionManager.inMemory(cwd, undefined, entries)` and a resource-loader prompt override (0.20.0,
  "requires pi 1.1.0 or newer"); `CHANGELOG.md:63` records `typebox` as a `"*"` peer with `@sinclair/typebox`
  no longer declared.
- CI enforces the floor with a dedicated job (`.github/workflows/ci.yml:27-31`).
- Host in use is pi 1.2.0 → satisfies `>=1.1.0`. `src/package-resources.ts:402-406` notes the open-ended range
  is feature-detected for package discovery.
- No upper bound / maximum host version is documented anywhere in the tree.

---

## 7. Explicit unknowns

- **"Stoppable inline resume"** as a named v0.22.0 feature: not present. `stoppable` appears only in
  `src/ui/conversation-viewer.ts` keybinding code; the 0.22.0 CHANGELOG section has no resume entry
  (`CHANGELOG.md:10-28`). What does exist: inline foreground resume forwards the tool-call abort signal
  (`src/agent-runner.ts:1256-1290`), and `ctrl+b` hand-off is refused for a foreground resume (`README.md:88`).
- **Nested spawn budget**: none found. Only the depth ceiling (`maxSubagentDepth`, default 2, max 16);
  `README.md:382` states width is unbounded except by the parent's own turns. No `spawnBudget`/rate-limit
  symbol in `src/`.
- **Model-facing stop/cancel tool**: none. Cancellation is UI/RPC only (§3.3).
- **Slash commands other than `/agents`**: none registered by this extension.
- **Schedules fired by any external/OS trigger**: none; timers live inside the pi process (start/stop sites
  cited in §5).
- **Resumability of `--subagents-workflow-file` runs**: documented as not resumable (they never journal).
