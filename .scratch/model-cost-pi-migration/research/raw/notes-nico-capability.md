# Raw notes — nicobailon/pi-subagents v0.78.0 capability facts

Intended destination (not writable by this agent's tooling): `E:/Developer/myhub/my-agent-toolkit/.scratch/model-cost-pi-migration/research/raw/notes-nico-capability.md`
Actual sink: `local://notes-nico-capability.md`.

Studied revision: `nicobailon/pi-subagents` **v0.78.0**, tag `v0.78.0` = commit `a4c8ced69a8176cdf4179b127feddc8875e3418f`, clone root
`E:/Developer/myhub/wt/_cand/git-nicobailon` (read-only inspection; no build/lint/test/install/model calls).
All paths below are relative to that clone root. Nothing here is inferred from any other package.

Repo identity: `package.json:2` `"version": "0.78.0"`, `package.json:3` description "Pi extension for
single-agent delegation and scripted multi-agent workflows"; `package.json:4` author Nico Bailon; `package.json:6` `"private": true`.

---

## 0. Host / platform constraints

- Peer range (`package.json:80-85`, all optional via `package.json:87-98`):
  `@earendil-works/pi-agent-core: "*"`, `@earendil-works/pi-ai: ">=0.86.1"`, `@earendil-works/pi-coding-agent: "*"`,
  `@earendil-works/pi-tui: "*"`, `typebox: "*"`. Dev deps pin all four pi packages at `0.87.0` (`package.json:112-117`).
- Host-version constraints stated in docs:
  - `docs/configuration.md:83` — "On Pi 0.86.1 or newer, when the model can take a new tool mid-conversation … a fresh
    unrestricted parent starts with `subagents_enable`, `bg_wait`, and `subagent_supervisor` active while `subagent`
    stays registered but inactive." Hosts lacking `getAllTools`/`getActiveTools`/`setActiveTools` keep eager behavior
    and log one compatibility warning (`docs/configuration.md:85`; impl guard `src/extension/tool-activation.ts:91-93`).
  - `docs/standalone-background.md:3` — "Supported standalone target: **official Pi 0.86.1, Linux x64**. … Other versions,
    operating systems, architectures and packagers are outside the fully validated support target; limited experimental
    Windows coverage is described below."
  - `README.md:17` — same boundary; npm Pi keeps its detached Node runner, the Pi 0.86.1 Linux x64 standalone release
    loads the runner through Pi's embedded SDK.
  - `CHANGELOG.md:9` — "Background subagents work on Pi 1.2.0 again. With 0.77.0 they failed to start on that Pi version."
- Windows/POSIX constraints:
  - `docs/tool-reference.md:510` and `docs/configuration.md:225` — Orca progress tabs: "supports macOS and Linux and is
    disabled on Windows" (also requires `orca` on PATH or `PI_SUBAGENT_ORCA_BINARY`).
  - `docs/configuration.md:615` — Windows-specific worktree provider invocation: "On Windows, pi-subagents invokes
    Worktrunk through `git wt` to avoid Windows Terminal's conflicting `wt.exe` alias."
  - `docs/standalone-background.md:9-15` — Windows host recognition is **experimental** (Bun `B:/~BUN/` virtual
    entrypoint prefixes; `pi-native.exe` is not a required executable name); "the full standalone lifecycle matrix has
    not been validated there or for every Bun-compiled Pi host."
  - `docs/workflows.md:73` — a `workflow` string containing `/` (or `\` in a Windows path) is read as a script file.
  - No documented POSIX-only restriction beyond the Orca observer and the standalone gate above.

---

## 1. Autonomous tool invocation

### 1.1 Registered tool names (implementation anchors)

| Tool | Anchor |
|---|---|
| `subagent` (parent) | `src/extension/index.ts:665-669` (`name: "subagent"`, description `buildSubagentToolDescription`) |
| `subagent` (child-safe fanout variant) | `src/extension/fanout-child.ts:221-225` |
| `subagents_enable` (loader) | `src/extension/tool-activation.ts:14` `const LOADER_NAME = "subagents_enable"`; definition `:104-133` |
| `bg_wait` | `src/runs/background/wait-tool.ts:49-53` (`name: "bg_wait"`) |
| `subagent_supervisor` | `src/intercom/native-supervisor-channel.ts:741-743` (registered through `NATIVE_SUPERVISOR_TOOL_NAME`) |
| `contact_supervisor` (child-facing) | `src/extension/herdr-pi-bridge.ts:77-81` |
| `watchdog_warn`, `watchdog_ask` | `src/watchdog/review.ts:194-198`, `:308-312` |
| `watchdog_diff` (reviewer-only) | `src/runs/shared/subagent-prompt-runtime.ts:565-567` |
| `structured_output` (child) | `src/runs/shared/subagent-prompt-runtime.ts:518-522` |
| `subagent_command` (child, opt-in) | `src/runs/shared/child-session.ts:467-469` via `commands.tool()` |

`bg_wait` is described as "the only registered wait tool" (`docs/configuration.md:374-376`, `waitTool` key).
`subagents_enable` is registered instead of `subagent` only when the loader path applies; `--exclude-tools
subagents_enable` forces eager availability (`src/extension/tool-activation.ts:89-90`, `docs/configuration.md:87`).

### 1.2 Does the model autonomously choose to dispatch?

Yes, model-initiated dispatch is the primary path, but delegation authority must come from the request/instructions:

- `README.md:39` — "That is enough to start. Pi decides whether to call the `subagent` tool, which agent to use, and how
  to compose the work."
- `README.md:47` / `docs/configuration.md:83-87` — in a fresh parent session the small `subagents_enable` loader is
  exposed first; "When your request or applicable instructions authorize delegation, Pi can call the loader itself; the
  unchanged `subagent` tool is available on the next model request." Task complexity alone does not authorize
  delegation; `bg_wait` and supervisor replies remain available without activation.
- `docs/tool-reference.md:5` — "Pi may call it when delegation is authorized by the current request or applicable
  instructions, or to manage existing runs. Direct execution remains the default; task complexity does not grant
  delegation authority."
- Loader text registered with the model: `src/extension/tool-activation.ts:105-106` — "…complexity alone never authorizes
  delegation" and the prompt snippet "Authorization must come from the current request or applicable instructions;
  complexity alone is not authorization."
- Always-on safety guidance injected into the parent tool description: `src/extension/tool-description.ts:17-21`
  ("Delegate only when the operator asked, directly or through applicable user/project instructions; size, complexity or
  risk alone is not authorization.").
- `toolActivation` config default `"auto"` (`docs/configuration.md:89-101`): `auto` | `dynamic` (`subagents_enable`
  always) | `eager` (no loader, `subagent` active from first request). Invalid value is a config error. Session start /
  tree navigation decide, only for a session with no messages (`docs/configuration.md:100-101`).
- User-facing entry points also exist but are alternatives, not prerequisites: `/run <agent> [task] [--bg] [--fork]`
  (`docs/workflows.md:438-440`), prompt shortcuts `/parallel-review`, `/review-loop`, `/parallel-research`,
  `/gather-context-and-clarify`, `/parallel-cleanup` (`docs/workflows.md:36-48`), `/council` (`README.md:76-86`),
  `/prompt-workflow` (`docs/workflows.md:553-577`).
- Autonomy of the parent is reinforced by async notifications: "Native completion wakes the parent session, so the
  parent returns control instead of sleeping or polling" (`docs/workflows.md:16`).

### 1.3 Dispatch parameter surface (as documented)

Top-level schema names: `agent`, `task`, `workflow`, `args`, `async`, `model`, `cwd`, `worktree`, `output`, `action`,
`id`, `message`; every other field lives inside `options` (`docs/tool-reference.md:70`). Management fields and the
`runId`, `maxRuntimeMs`, `isolation` aliases also work at top level; a field given in both places with different values
is rejected (`docs/tool-reference.md:70`).

Target/management rows (`docs/tool-reference.md:72-97`):
- `agent` string — one direct child or agent-management target; workflow child agents are set inside `runs.run`/`runs.all`.
- `task` string — direct child's task, requires `agent`, excludes `action` and workflow inputs.
- `action` string — offline workflow `validate`, agent management (incl. `guide`, `children.list`, `refine*`), lane
  evidence, `mission.*`, Inspect (`inspector.*`), Herdr (`project.*`), status/control, reviewed `worktree.cleanup`,
  schedule, watchdog, doctor.
- `options.topic` — packaged guide topic for `action: "guide"`.
- `options.config` — agent config for management create/update.
- `options.context` — `fresh | fork | profile`; explicit `fresh`/`fork` overrides every workflow child; packaged
  `worker` defaults fresh, `oracle`/`advisor` default fork (see also "Fork context details", `docs/tool-reference.md:130-136`).
- `model` string — exact `provider/id`, bare ids resolve only if unique, optional `:level` suffix
  (`off/minimal/low/medium/high/xhigh/max`); `{action:"models"}` lists all.
- `options.missionId` / `options.mission` — attach to or create a mission; `mission: false` = ephemeral.
- `options.handoffPath`, `options.repo`, `options.planId`, `options.mode`, `options.laneId`, `options.merge`,
  `options.supersession`, `options.focus`, `options.view`, `options.lines` (≤500), `options.agentScope`,
  `options.capabilities`.

Execution rows (`docs/tool-reference.md:99-123`):
- `async` — default-on background execution; workflows default to background; `async:false` blocks the parent until
  completion; a local foreground child runs inside the parent Pi process and never loads the parent's ambient
  extensions; MCP-tool agents must run as background children.
- `options.chatProgress` — `auto | off | live-card`; `live-card` requires `async:false` and the same Git repo.
- `isolation` / `worktree` — `none | worktree`; `worktree` requires a managed Git worktree; `options.baseRef` default
  `HEAD`, only `HEAD` or a supported named ref (no 40/64-char SHAs, no `HEAD~1`).
- `options.timeoutMs` / `maxRuntimeMs` — run-level deadline; default from config `timeoutMs`, else 30 min for
  foreground and plain single-agent async; composite async runs (chains, parallel tasks, workflows) stay unbounded at
  top level; expiration is terminal.
- `options.toolTimeoutMs`, `options.checkpointBeforeDeadlineMs` (async single-agent only), `options.toolBudget`
  `{soft?, hard, block?}`, `options.usageBudget` `{tokens?, costUsd?}` (root-only; hard limits block later launches,
  never stop running children).
- `options.extensionBindings`, `options.preflight` (raw scripts only).
- `cwd`, `options.machine` (Herdr saved machine).
- `options.maxOutput` `{bytes?, lines?}` — final-output truncation; "For child runs it is only applied when set; there
  is no default cap on the inline path, so use `outputMode: "file-only"` for large outputs. For workflow script
  results, the Return, Emitted, and Console sections are always capped, at 200 KB / 5000 lines unless `maxOutput` sets
  other limits."
- `options.artifacts` boolean default `true` — write debug artifacts; `options.includeProgress` default false;
  `options.share` default false (GitHub Gist upload, `docs/tool-reference.md:531-536`); `options.sessionDir`.
- `options.acceptance` / `options.gate` — evidence gates (`docs/tool-reference.md:396-495`); typed gate
  `{command, output:"json", schema?, timeoutMs?}` makes passing stdout the child's `structuredOutput`.
- Output binding/truncation detail (`docs/tool-reference.md:159-168`): `outputMode: "file-only"` returns
  `Output saved to: /abs/report.md (48.2 KB, 2847 lines). Read this file if needed.`; `output` is the API binding, a
  filename mentioned in task text does not override runtime routing; children return `outputReference`,
  `outputPathMapping`, `artifactPaths`.

Explicit negative findings (searched, not documented):
- There is **no** model-facing `name` parameter to name a child. Child identity is the run id (plus a workflow `key`);
  `options.name` exists only for `schedule.create` (`docs/missions.md:101-107`) and `agent create` uses
  `options.config.name` (`docs/tool-reference.md:236-240`). Unknown: whether any undocumented alias exists — none found
  in the tool-reference tables or `src/extension/index.ts` schema.
- There is **no** `background` parameter; background execution is the `async` field.

---

## 2. Nested delegation

- Default: children do **not** get the tool. `docs/workflows.md:21-22` — "By default, children do not register the
  `subagent` tool and receive boundary instructions that they are not the parent orchestrator and must not propose or
  run subagents. The explicit exception is an agent whose resolved builtin `tools` includes `subagent`; that child gets
  a child-safe `subagent` tool for the fanout work the parent assigned, still bounded by `maxSubagentDepth`."
- Opt-in mechanisms (per-agent frontmatter, `docs/agents.md:394-398`, `:420-421`, `:512-514`, `:534-536`):
  - `tools: subagent` (explicit allowlist entry) grants the child-safe nested `subagent` runtime.
  - `allowNestedSubagents: true` — "Set `true` to authorize the child-safe nested `subagent` runtime without making
    omitted `tools` an allowlist. Inherited depth and capability ceilings remain authoritative."
  - `allowedAgents: scout, reviewer` narrows an existing nesting grant; empty list denies all descendants; inherited
    allowlists are intersected and cannot be widened. No config-file switch enables nesting globally.
  - Impl: `src/runs/shared/child-tool-plan.ts:330-334` computes `fanoutAuthorized` from declared builtin tools
    including `subagent` or `allowNestedSubagents === true` (minus `excludeTools`/allowlist); `:335-336` — requesting
    `subagent_supervisor` without fanout authorization throws at launch.
- Depth limit and defaults:
  - `docs/workflows.md:533-537` — "Subagents can call `subagent` only when their resolved builtin tools explicitly
    include `subagent` … A depth guard prevents unbounded nesting. By default, nesting is limited to two levels: main
    session → subagent → sub-subagent. Deeper calls are blocked with guidance to complete the current task directly."
  - `docs/configuration.md:539-545` — `maxSubagentDepth` config: default is `2` when neither the runtime limit,
    `PI_SUBAGENT_MAX_DEPTH`, nor this setting supplies a limit; per-agent `maxSubagentDepth` can only tighten; at the
    cap "execution fanout is blocked instead of silently hid[den]".
  - Precedence list (`docs/workflows.md:539-551`): `PI_SUBAGENT_MAX_DEPTH` (before starting Pi) → `config.maxSubagentDepth`
    → agent-frontmatter `maxSubagentDepth`. Env applies to the top-level parent; children inherit through runtime config.
  - Agent frontmatter field (`docs/agents.md:444`) "Tightens nested delegation for this agent's children."
  - Block messages in impl: `src/runs/foreground/subagent-executor.ts:1802-1804`, `:1974-1977`
    ("Nested subagent resume blocked (depth=…, max=…). Complete the follow-up directly instead.").
- Nested visibility/control: nested runs appear in the parent status widget and `status` output as a tree; `status`,
  `interrupt`, and `resume` accept a nested run id (`docs/workflows.md:537`; `docs/tool-reference.md:315-316`, `:366-368`;
  `docs/observability.md:110` — "When a child is explicitly allowed to fan out with `tools: subagent` or
  `allowNestedSubagents: true`, its nested runs appear under that parent child in the main status tree").
- Other documented restrictions:
  - Child-safe fanout mode: bare `status` requires an id so children cannot enumerate unrelated top-level async runs;
    bare `interrupt` targets only the visible top-level run (`docs/tool-reference.md:334-335`).
  - External CLI runners do not support nested subagents (`docs/tool-reference.md:529`).
  - Coordinator children that need both directions must declare `subagent` + `contact_supervisor` +
    `subagent_supervisor` (`docs/workflows.md:511-525`).
  - Capability ceilings and inherited runtime allowlists remain authoritative (`docs/agents.md:420-421`).

---

## 3. Parallel / resume / cancel

### 3.1 Parallel fan-out and concurrency caps

- Ordinary parallel fan-out is `await runs.all([{ key, agent, task }, ...])`, which "resolves to an ordered array, not a
  key map" (`docs/tool-reference.md:11`, `docs/workflows.md:52`).
- Documented caps:
  | Cap | Default | Anchor |
  |---|---|---|
  | `globalConcurrencyLimit` (simultaneously running children inside **one run**) | `20` | `docs/configuration.md:438-446` |
  | `parallel.maxTasks` / `parallel.concurrency` (legacy parallel/chain mode) | `8` / `4`; per-call `concurrency` wins | `docs/configuration.md:510-521` |
  | `maxSubagentSpawnsPerRun` (cumulative logical child admissions per top-level run tree) | `64` | `docs/configuration.md:458-468`; `README.md:103` |
  | `maxSubagentSpawnsPerSession` (cumulative per parent session) | unlimited (unset) | `docs/configuration.md:448-456` |
  | `maxActiveAsyncRunsPerSession` (concurrent top-level async runs) | unlimited (unset or `0`) | `docs/configuration.md:470-492` |
  | `runs.lanes` inventory | 32 lanes / 16 stages per lane / 64 total stages / 64 KiB JSON | `docs/tool-reference.md:66`; `docs/workflows.md:220` |
- Queueing semantics: "Queued workflow children retain their stable keys and begin when a running sibling releases
  capacity" (`docs/configuration.md:442`); spawn-budget "Claims are never released or refunded"
  (`docs/configuration.md:468`).
- Re-entry dedupe: re-launching a workflow with the same `args` returns `reused: true` for same-key/same-param children
  and waits for still-running ones instead of launching another (`docs/workflows.md:72-76`).
- Isolation for parallel writers: per-child `worktree: true` (`docs/workflows.md:442-464`); `worktree: true` at the
  top-level of a workflow makes isolation the default for every child. Guidance: "One writer per cwd/worktree; isolate
  concurrent writers" (`src/extension/tool-description.ts:20`); "Keep one writer when parallel writes are not
  intentionally isolated" (`docs/workflows.md:462`).

### 3.2 Resume

- Action semantics (`docs/tool-reference.md:362-370`): "`resume` revives a paused, completed, or failed
  async/foreground child by starting a new child from its stored session file. Stopped runs remain non-resumable, and it
  does not interrupt a live top-level async child."
  - Requires the chosen child to have a persisted `.jsonl` session file; it starts a **new** child session from the old
    session context ("it does not resume the live session").
  - "Direct revival takes an exclusive cross-process lease on the canonical session file until the new child finishes.
    A concurrent attempt fails before Pi is spawned and identifies the owning revived run; dead-owner leases are
    reclaimed only when staleness can be proved."
  - Multi-child async runs and remembered foreground single/parallel/chain runs revive by `index`; nested runs revive by
    nested id when the live route or persisted nested session metadata is available; completed external-job runs can use
    `resume` as a provider follow-up when the provider exposes `followUp(input)` (running external-job parents fail
    closed).
- Workflow-scoped resume (`docs/tool-reference.md:169-188`): completed workflow children stay addressable as retained
  children; `{action:"children.list"}` lists up to the last 10 with explicit `resumable` / `not resumable`; "Resume only
  rows reported `resumable`"; status is advisory and resume may reject the attempt; `await runs.run(key, {resume, task})`
  waits and returns a new `runId`, so loops must continue from the latest id; `resume` and `agent` are mutually
  exclusive; the revived child keeps its stored agent, model and tool contract; `gate` is rejected on retained resume.
- Lane-stage resume: `resume: "previous"` continues the preceding retained child and "requires that child's returned
  `runId`" (`docs/tool-reference.md:60-66`, `docs/workflows.md:216-218`).
- Session sharing constraint for resume: it depends on a persisted session file, and `context: "fork"` needs a persisted
  parent session file plus current leaf (implicit fork falls back to fresh, explicit fork is strict —
  `docs/tool-reference.md:132`). Session files live under a per-run session directory; background children receive the
  branched session as `--session` (`docs/observability.md:307-309`). `share: true` (Gist export) is opt-in and off by
  default (`docs/tool-reference.md:531-536`).
- Nested delegation resume is depth-checked and blocked at the cap (`src/runs/foreground/subagent-executor.ts:1802-1804`).

### 3.3 Cancel / abort / kill

- `interrupt` (`docs/tool-reference.md:315-316`, `:335`): targets the visible top-level run; interrupting a nested run
  requires its explicit nested id. It is the pause-leaning control used with `steer` recovery.
- `stop` (`docs/tool-reference.md:372-382`): "`stop` ends a current-session top-level async run. It is deliberately
  stronger than `interrupt`: It is not a resumable pause; stopped runs should be restarted as new runs. Foreground and
  nested targets are rejected." Child-level stop: `/subagents-stop <run-id> <child-id>` (equivalent to
  `subagent({ action: "stop", id, childId })`) stops one child while the rest continue; only pending/running children are
  stoppable and the request is rejected for anything else "instead of widening to a run-level stop". Inactive schedules
  in the selector route through `schedule.pause`.
- `/subagents-stop` with no id opens a TUI selector with confirmation; first row is "stop all" when ≥2 current-session
  async runs are active; non-TUI contexts print exact commands (`docs/tool-reference.md:377-381`).
- Per-command cancel inside a child (`docs/tool-reference.md:337-360`): `command.yield` releases a blocking bash call,
  `command.cancel` "aborts only that command through Pi's native bash cancellation; the child receives a tool error and
  can continue"; states `cancel_requested` (acknowledged) vs `cancelled` (backend settled). Requires the child to select
  both `bash` and `subagent_command`.
- Terminal states a cancelled run can end in: run states are `pending`→`running`→terminal
  `complete`/`failed`/`paused`/`stopped` (`docs/workflows.md:466-493` state table); events
  `subagent.step.completed/failed/paused/stopped` and `subagent.run.completed`/`stopped`
  (`docs/observability.md:250-252`); stopped is non-resumable and process proof is "separate from execution success or
  stopped/non-resumable state" (`docs/observability.md:260`).
- Runtime-replacement cancellation: `/reload`, session resume, or a project switch stops a running async workflow with
  `workflow.stopCause: "runtime-replaced"`, its awaited async children keep running, and in-process foreground children
  (including detached ones) are stopped (`docs/workflows.md:78-82`). A detached foreground child is stopped on runtime
  replacement and shows as stopped with reason; `resume` continues it (`docs/observability.md:135`).
- Esc in the parent stops the parent turn and its foreground children; background children keep running
  (`docs/observability.md:5-20`; `CHANGELOG.md:22`).
- Timeout kill: expiring the run-level deadline is terminal (`docs/tool-reference.md:107`); tool-level deadlines
  terminate with `timedOut: true` (`docs/tool-reference.md:108`).
- Steering is separate from cancel: `steer` returns a correlated receipt (`delivered/scheduled/pending/partial/recovered/failed`)
  and only "a top-level single run may interrupt after the acknowledgment deadline and recover after a further 15-second
  pause/revival bound; durable multi-child and nested runs never auto-interrupt" (`docs/tool-reference.md:384-392`).
- Status views: `status` resolves exact foreground/top-level async/nested ids before prefix matching; `view:"fleet"` is
  read-only (no steering/stop controls); `view:"transcript"` tails `output-<index>.log` with `lines` ≤ 500
  (`docs/tool-reference.md:327-335`).

---

## 4. Workflow design (`docs/workflows.md`)

- What a workflow is: **model-authored JavaScript** statement body, not a declarative config file. The model writes one
  ` ```js workflow ` fenced block in the same assistant reply and calls `subagent({ workflow: true, ... })` in that
  reply (`docs/tool-reference.md:11`; `docs/workflows.md:52-60`). Variants: a string containing `/` (or `\` on Windows)
  is a script file (`workflow: "./workflows/review.js"`); any other string is a **named workflow resource**
  (`"review"`, `"run-ci"`, `"parallel"`); `"true"` is read as boolean true (`docs/workflows.md:64-75`).
- Constraints on the script: ordinary JavaScript statement bodies with top-level `await`; "nested async functions, async
  arrows, and async methods are rejected"; exactly one ` ```js workflow ` block and one `workflow: true` call per reply
  (`docs/workflows.md:53-60`). Sandbox helpers: `runs.run`, `runs.all`, `runs.lanes`, `runs.steer`, `runs.status`,
  `runs.ref`/`runs.refs`, `emit`, `console`, standard JS, mission `state`; "No filesystem, shell, arbitrary Pi tools, or
  host globals are available; named resources alone may grant `runs.host` authority" (`docs/workflows.md:97-101`).
- Invocation paths: model tool call (`workflow: true`), script path, named resource, slash (`/run`, `/prompt-workflow`),
  RPC, schedules (`docs/workflows.md:64-75`, `:438-440`, `:553-577`; `docs/tool-reference.md:11`). Static check without
  launching: `{ action: "validate", workflow: true }` returns `{ ok, errors }` and fails the tool call when `ok` is false
  (`docs/tool-reference.md:15`).
- Deterministic vs model-driven steps:
  - Model-driven steps: `runs.run`/`runs.all` children (agent + task), which are model sessions.
  - Deterministic steps: **typed steps** = an agent whose `runner.type: external-cli` command receives the prompt on
    stdin and returns stdout as the child output (async-only; direct `async:false` refused) (`docs/workflows.md:224-268`);
    **host command steps** = the named `run-ci` resource running only `npm test` / `npm run typecheck` via
    `runs.host("ci", …)` with bounded timeouts (`docs/workflows.md:270-278`); **typed gates** = a post-child host command
    whose JSON stdout becomes `result.structuredOutput` (`docs/workflows.md:224-250`, `docs/tool-reference.md:430-455`).
  - No per-step `cwd` for host steps; set `cwd` on the outer request (`docs/workflows.md:277`).
- Fan-out / fan-in:
  - `runs.all([...])` = one batch of independent children, ordered array result (`docs/tool-reference.md:11`).
  - `runs.lanes([...])` = parallel sequential lanes: first stage of every lane launches in one `runs.all` batch, later
    stages run in lane order, `resume: "previous"` chains a lane's stages; child keys are `<lane>.<stage>`; a failed,
    stopped, detached stage (or `structuredOutput.verdict === "blocked"`) blocks only its lane and marks later stages
    `skipped` (`docs/tool-reference.md:58-66`; `docs/workflows.md:181-222`).
  - Advanced rolling fan-out: keep `runs.run` promises only when observed with direct `await`, `Promise.race`, or
    `Promise.all`; `runs.steer(key, msg)` challenges a live keyed sibling; there is no `runs.start`/`runs.next`/`runs.collect`
    (`docs/tool-reference.md:138-158`, `docs/workflows.md:295-366`).
  - Aggregation: script `return` value crosses into the parent as plain JSON (non-JSON host metadata omitted); durable
    cross-workflow state via `await state.get/set(key)` on a mission, whole state file capped at 256 KiB
    (`docs/tool-reference.md:159-168`; `docs/missions.md:38-40`).
- Documented limits: composite workflows have **no default parent deadline** at the top level
  (`docs/workflows.md:118-120`; `docs/tool-reference.md:107`); `args` bounded plain JSON, 16 KiB
  (`docs/workflows.md:407`; `docs/tool-reference.md:25-27`); workflow child task 1 MiB, path fields 32 KiB
  (`docs/workflows.md:220`); lanes inventory caps (see §3.1); `globalConcurrencyLimit` / `maxSubagentSpawnsPerRun` can be
  overridden inline for one workflow but are not forwarded to child calls (`docs/configuration.md:444-446`, `:466`).
- Legacy shapes removed in a hard cutover: top-level `chain`, `tasks`, `parallel`, `chainDir`, `/chain`, `/parallel`,
  `/run-chain`, durable `.chain.md`; the only exception is `disabledFeatures: ["workflow-scripts"]`, which replaces
  scripts with top-level `chain`/`tasks` (`docs/workflows.md:367-370`; `docs/configuration.md:149-162`;
  `docs/tool-reference.md:11`).
- Worktree isolation inside workflows: `worktree: true` per child, branched from `HEAD` or a supported named `baseRef`;
  requires clean sources, journals ownership, captures patch + handoff manifest, removes cleanly captured worktrees
  (`docs/workflows.md:442-464`).

---

## 5. Scheduling restrictions, missions, watchdog, background runners

### 5.1 Missions (`docs/missions.md`)

- "Missions are durable wrappers around runs" (`docs/missions.md:7`); noun map project/mission/run/receipt
  (`docs/missions.md:9-12`). "Ordinary workflow launches create one enclosing mission by default, with detailed JSON
  records under `~/.pi/agent/missions/projects/<project-hash>/`… Workflow children do not create separate missions"
  (`docs/missions.md:14`).
- Storage/config: `missions.enabled` (auto-creation, default on), `globalIndex`, `retainTerminal` default `200`,
  `directory` (`docs/configuration.md:644-661`); `retainTerminal` prunes only oldest completed/failed/cancelled records.
- **A mission is not a scheduler.** Goal missions (`goal: true` + `budget.tokens`) only send one needs-attention notice
  after each parent turn with remaining budget and a next ready action: "The extension never launches or replans goal
  work by itself" (`docs/missions.md:44-64`). `mission.show` "is a recovery record only. It does not schedule or restart
  children" (`docs/missions.md:71`). Receipts only record delivery state; pi-subagents "does not merge, poll CI, or
  deploy" (`docs/missions.md:72`).
- Mission actions: `mission.create/list/show/update/resolve-decision/attach-run/close` (`docs/missions.md:68`,
  `docs/tool-reference.md:76`). Cross-project work is explicitly steered away from child nesting toward Herdr project
  panes (`docs/missions.md:77-83`).

### 5.2 Schedules — the real timer surface

- "Durable schedules are enabled by default and stored per project under `.pi/subagents/schedules/<id>/`"
  (`docs/missions.md:87`). They are the only interval/calendar trigger.
- Triggers: one-shot `at: "+30m"` or ISO timestamp with timezone; fixed intervals with `m`/`h`/`d`/`w`; calendar
  `every: "day"|"week"` with `at: "HH:mm"` plus an explicit IANA `timezone` (or `UTC`) and weekly `on: [mon..sun]`
  (`docs/missions.md:88-130`; `docs/tool-reference.md:259`).
- Restrictions: "`overlap` is currently fixed to `skip`; `catchUp` supports `latest` (default) and `none`"
  (`docs/missions.md:154`). Schedules require a workflow, not a direct child (`docs/tool-reference.md:259`). "Runs
  always launch async with fresh context. Without `missionId`, they disable mission creation and have no `state` global"
  (`docs/missions.md:150`). Project-wide schedules fire in whichever Pi session in the project claims the fire first;
  `sessionOnly: true` binds restoration and every fire to the creating session (`docs/missions.md:151`). Missing local
  times are skipped; a repeated local time fires once at its first instant (`docs/tool-reference.md:259`).
  `quiet: true` persists only on recurring (`every`) schedules; one-shot/`schedule.run` stay noisy unless the launch
  passes `quiet` (`docs/missions.md:157`). Definitions/history/events use mode `0600` (`docs/missions.md:153`).
- **No cron and no daemon**: "`schedule.run-due` lets an external launcher start due project work without making
  `pi-subagents` a daemon" (`docs/missions.md:158`); "Month/year recurrence, cron, queue/replace overlap, and the
  schedule TUI inspector are intentionally deferred to the next slice" (`docs/missions.md:159`).
- Management actions: `schedule.list/show/history/pause/resume/run/run-due/delete` (`docs/missions.md:132`).
- Config: `scheduledRuns.enabled` (removes schedule parameters and rejects `schedule.*` when false), `maxPending` 20,
  `storeRoot` (`docs/configuration.md:494-508`). Mission-bound definitions use schedule schema version 2 so older
  versions reject them (`docs/missions.md:146`).

### 5.3 Watchdog (`docs/watchdog.md`)

- "The watchdog is an opt-in second model that reviews what the agent just did and pushes findings back into the
  transcript… It is not the `reviewer` subagent" (`docs/watchdog.md:3`).
- Triggers (`docs/watchdog.md:7-14`): boundary review on `agent_end` of every main/child turn gated on repo change;
  main-activity review only with `clarification: true` (≤1 extra review per user prompt); opt-in cadence review every
  `cadence.everyNTools` tool results (minimum 5); LSP pre-pass before boundary review without a model call.
  "There are no idle timer reviews" (`docs/watchdog.md:14`).
- Finding importance `low|medium|high`; low/medium never enter model context; stalemate after `stalemateRepeats`
  (default 3) identical warnings ends the turn (`docs/watchdog.md:39-56`).
- Model selection is separate from `subagents.defaultModel`; recommendations default to Opus 4.8 or GPT-5.5 at thinking
  high (`docs/watchdog.md:78-115`). Launch rules `subagents.watchdog.rules` gate which models a role may run on, with
  `action: "warn"` or `action: "block"` (`docs/watchdog.md:145-166`).
- Child watchdogs opt in under `subagents.watchdog.children`; native child tool permissions are opt-in, Pi-child-only,
  bash always passes through, external CLI agents with effective `ask`/`deny` rules are rejected
  (`docs/watchdog.md:141-190`).

### 5.4 Background / standalone runners

- Foreground child = pi session inside the parent Pi process; background child = pi session inside the detached runner
  process (`README.md:45`; `docs/observability.md:5-20`). "A foreground child is a pi session created inside the parent
  Pi process, not a second `pi` process" (`docs/observability.md:9`).
- Supported runner boundary: npm Pi keeps its Node runner with peer aliases; the **official standalone validated target is
  Pi 0.86.1 on Linux x64** (adjacent release assets must be kept with the executable); other versions/OSes/architectures
  are outside the validated support target, Windows is experimental (`docs/standalone-background.md:3-15`, `README.md:17`).
  "Each independent run has its own host; native sessions inside that run share it" (`docs/standalone-background.md:5`).
  Official gate requires Linux x64 with Node, npm, tar and bubblewrap; missing sandbox support fails rather than skips
  (`docs/standalone-background.md:17-38`).
- Documented background restrictions:
  - Agents that need MCP tools "must run as background children, which load them inside the detached runner process";
    foreground children never load the parent's ambient extensions but do inherit registered providers
    (`docs/tool-reference.md:99-123`).
  - External CLI runners are async-only and do not support foreground/clarify, steer/resume/interrupt-as-pause, nested
    subagents, model override, structured output, acceptance/agent contract, tool budgets, fast mode, fork context,
    skills, or native Pi tools (`docs/tool-reference.md:514-529`).
  - Async completion notices belong only to the originating session; background completions are quiet, failed/paused
    ones notify (`docs/observability.md:313-317`).
  - A launcher (sandbox wrapper) must keep the runner running and sharing files with the parent; "A launcher that
    submits the work elsewhere and returns immediately is not supported" (`docs/agents.md:330-335`).
  - Parent-session interactivity is TUI-side (FleetView, `/subagents-fleet`, `/subagents-stop`); no doc states a
    background run cannot run without a TUI. Unknown: whether a background child can use clarify/interactive prompts —
    the docs only state `forceTopLevelAsync` forces `clarify: false` for depth-0 runs (`docs/configuration.md:394-398`)
    and that external CLI runners do not support `foreground/clarify`.
- Related config keys: `asyncByDefault` (`docs/configuration.md:229-235`), `forceTopLevelAsync` (`:394-398`),
  `waitTool` enabled/default 120000 ms (`:372-392`), `timeoutMs` (`:400-436`), `toolTimeoutMs` (`:437-…`),
  `fleetView`/`asyncWidget`/`programStatus`/`activeRunsPrompt` (TUI observability).

---

## 6. Explicit unknowns (not documented in this revision)

- No model-facing `name` or `background` parameter on `subagent`; no doc'd alias for either.
- No documented hard cap on the length of a single `runs.all` array (only spawn-budget and `globalConcurrencyLimit`
  caps, plus the `runs.lanes` inventory caps). Unknown whether an undocumented array cap exists in code.
- No documented cron/`overlap: replace`/queue overlap; explicitly deferred (`docs/missions.md:159`).
- No documented per-child "autonomous depth>2" escape hatch; deeper calls are blocked and told to finish directly.
- Whether the detached background runner is functional on Windows is not stated as supported or unsupported — only
  "experimental" host recognition and an unvalidated lifecycle matrix (`docs/standalone-background.md:3-15`).
- Nothing in the studied docs states a minimum Pi *minor* for background runners other than the 0.86.1 standalone target
  and the Pi 1.2.0 regression note (`CHANGELOG.md:9`).
