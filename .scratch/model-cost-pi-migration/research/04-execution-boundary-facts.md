# execution 开始/结束事实核对：OMP 与已选 nicobailon 路径（只读）

Ticket: [第三方能力适配的集中组织与公共语义复用](../decision/04-third-party-adapter-organization.md)（status: claimed）
性质：**证据资产，不是政策发布**。本文件只核对「自行计时所需的完整 execution 开始/结束事实」在各路径是否可靠可取；不批准接口/目录/IPC 路线，不改 map、ticket、Lighthouse 或任何生产源码，不替代 [decision/08](../decision/08-pi-round-boundaries.md) 定义 Round，不宣布覆盖成功。

## 0. 方法与证据口径

- 本轮**只做静态阅读**：读固定 revision 的源码、公开文档与类型。未启动宿主、未加载扩展、未调用模型、未跑构建/lint/测试。凡运行后果一律标 `[INFERENCE]` 或转引已发布实测。
- **已有实测**（本轮只转引，不重跑）：[nicobailon 运行事实 Lighthouse](../lighthouse/07-nicobailon-runtime-validation.md) 与 [真实运行报告](07-runtime-validation/report-live.md)。本文件涉及该报告的行只作转引（下称 `[已验证-07]`）。
- 分类词沿用研究勘误 §0：`[公开契约]` / `[模型工具输出]` / `[私有实现]` / `[宿主原生]` / `[文档]`。

### 0.1 固定参考修订（引用行号前必须先看这张表）

| 来源 | 修订 / 路径 | 本轮用途 |
| --- | --- | --- |
| OMP 参考检出 | `E:/Developer/myhub/oh-my-pi` @ `611c189fa2f6b8c9b368559ea6b98062b9b54539`（`main`，`@oh-my-pi/pi-coding-agent@18.10.4`，`git describe v18.10.4-208-g611c189fa2`） | 本轮读的 OMP 行号全部以此为准 |
| OMP 原生事实历史基线 | [omp-subagent-capability-baseline.md](E:/Developer/myhub/wt/omp-capability-baseline/.scratch/model-cost-pi-migration/research/omp-subagent-capability-baseline.md) @ 交付提交 `9ff584c` 的 `F-*`/`O-*`/`N-*` 行 | 标 `OMP185` 的行来自**冻结发布安装 18.5.0**，与本轮检出行号**不可混引** |
| nicobailon | `E:/Developer/myhub/wt/_cand/git-nicobailon` @ `a4c8ced69a8176cdf4179b127feddc8875e3418f`（= `v0.78.0`），读的是 **git checkout 入口**（`index.ts` + `src/**`），**不是** npm `index.js` 工件 | 候选行号以此为准确认 |
| pi | `E:/Developer/myhub/pi` @ `4a5d37291531ad48b8e536c892557877d219463c`（1.2.0） | 宿主原生事件形状 |
| framework | `E:/Developer/myhub/my-agent-toolkit`（当前 checkout） | 现有 OMP adapter 与公共语义 |

### 0.2 三个必须先分开的「时间」

以下是本次事实对照使用的分类，不是已批准的产品计时口径；尤其是否计入执行器 setup、进程/会话建立、扩展加载和排队，仍需明确决策。现有批准不能被解释为这些阶段均已决定纳入。缺少某一分类的公开边界，也不自动证明其他分类无法实现。

1. **execution 的完整区间**（含执行器 setup、进程/会话建立、扩展加载、排队等待）——本文件题目所指的「完整 execution」。
2. **agent 活跃区间**（子会话里模型循环的真实工作段，pi `agent_start`→`agent_settled` / OMP `agent_start`→`agent_end`）——**不含** setup，且一次 execution 内可能有多段。
3. **宿主自己测的 elapsed**（`durationMs` 之类）——各宿主各自选了不同的测量起点，既不是 1 也不是 2，见 §1.3、§2.3。

本文件给每条路径列 `start` / `end` / `identity` / `source` / `限制`，并注明它属于 1/2/3 中的哪一种。

---

## 1. OMP：task lifecycle started/terminal 与实际 execution 边界

### 1.1 公开面：两条路线 + 会话原生运行事件

| # | 面 | 载体 | 携带的耗时/边界事实 | 证据 |
| --- | --- | --- | --- | --- |
| R1 | 委派工具路线 | `tool_execution_update` / `tool_execution_end`（`toolName === "task"`）→ `payload.details.progress[]`（running）或 `details.results[]`（ended） | 条目 `id`（spawn 的 registry 身份）、`status`、`durationMs` | `framework/adapters/omp/subagents.ts:30,50-58,363-399`；发布行 `O-RUNTIME-ROUTE-1` |
| R2 | 事件总线 progress | 通道 `task:subagent:progress`，`payload.progress{id,status,durationMs}` | 每个 execution 的**运行中**与**终态**另一次读数；`status` 词表 `running/pending`→running，`completed/failed/aborted`→ended，其它不发 | `framework/adapters/omp/subagents.ts:33,319-356`（`:337-341`）；发布行 `O-RUNTIME-ROUTE-2` |
| R3 | 事件总线 lifecycle | 通道 `task:subagent:lifecycle`，payload `{id, agent, agentSource, description?, status:'started'\|'completed'\|'failed'\|'aborted', sessionFile?, parentToolCallId?, index, detached?}` | **只有边界与身份，没有时间戳**。框架只用 `status==='started'` 帧来开启一次 execution 的计数 | `E:/Developer/myhub/oh-my-pi/packages/tui/src/overlays/session-observer-registry.ts:4-41`；`framework/adapters/omp/subagents.ts:148-153,399` |
| R4 | 会话原生运行事件 | `pi.on("agent_start")`（无 payload）/ `agent_end{messages, willContinue?}` | agent 活跃段（类 2）；`willContinue: true` 表示已排定自动续跑，**不是**终局 settle | 检出 `packages/coding-agent/src/extensibility/extensions/types.ts:1646-1647`、`lifecycle-mirror.ts:126-127`；发布行 `N-RUN-EVENTS` |

R1/R2/R3 的三条 payload 都**没有**任何绝对开始时刻；R4 的 `agent_start` 连 payload 都没有。

### 1.2 `started` 帧相对 session attach 的位置（逐路径，行号 = 检出 @611c189f）

| 路径 | 函数 | duration 时钟起点 | `started` 帧发出点 | 发出时子会话是否已存在/已登记 |
| --- | --- | --- | --- | --- |
| 首次 spawn（前台/后台内联） | `runSubprocess` `executor.ts:3940` | `:3959 const startTime = Date.now()`（**在会话创建之前**） | `:4571` | **是**。会话对象已建立（`:4519 sessionCreatedAt = performance.now()`），并已 `monitor.setActiveSession(session)` `:4521`、`registry.syncSessionStatus(id, session)` `:4524` |
| IRC wake turn（keep-alive 自主唤醒） | `attachIrcWakeTurnMonitor` `:3146`（`session` 由调用方传入，必然已存在） | `:3172 turnStartTime = Date.now()` | `:3242` | 会话在函数入口即已存在；但 `started` **先于** `turnMonitor.setActiveSession(session)` `:3244` |
| 完成后续跑 turn | `runSubagentFollowUpTurn` `:3557` | `:3559 startTime = Date.now()` | `:3642` | 同上：`:3560 await AgentLifecycleManager.global().ensureLive(id)` 已让会话存在；`started` 先于 `setActiveSession` `:3644` |

结论（针对「开始是否早于 Session attach」）：
- **事件事实不早**：三条路径的 `started` 帧发出时，该 execution 的会话都已存在，且在首次 spawn 路径上已在 `AgentRegistry` 中可解析。因此「先拿 started、事后补关联 actualSession」**不是**这一帧的问题。
- **测量事实早于会话**：duration 时钟（`:3959`，或 wake/follow-up 的 `turnStartTime`）在会话创建之前起算。这正是发布行 `O-RUNTIME-ABSENCE`／`F-RUNTIME` 所述「创建窗口」：会话尚未建立、且该 identity 从未被归因的 **running 读数不产生交付**（`subagents.ts:213-218` 的显式条件），因为**读数是累积的**，第一条能解析出会话的读数已带全量 elapsed（`subagents.ts:239` 记下归因）。
- 因此「保留开始」在本宿主只能保留成 **elapsed**，不能还原成**一个开始时刻**。

### 1.3 `durationMs` 的起点因路线而不同（同一 execution 两套原点）

| 读数 | 起点 | 代码 |
| --- | --- | --- |
| R1 运行中条目（`details.progress[]`）、R2 progress 帧 | **monitor 创建时刻**：`createSubagentRunMonitor` 内 `executor.ts:1328 const startTime = Date.now()`（在 `runSubprocess` 里于 `:4093` 创建；初始 `durationMs: 0` `:1346`；刷新 `:1592 progress.durationMs = Date.now() - startTime`） | `:1328,1346,1592,1608` |
| R1 终态条目（`details.results[]`）、R3 后的 settled payload | **`runSubprocess` 入口**：`executor.ts:3959` 的 `startTime` 经 `:4869` 传入 `finalizeRunResult`，`:2931 durationMs: Date.now() - args.startTime` | `:2931,4841,4869` |
| wake / follow-up turn 的终态 | 各自的 `turnStartTime` `:3172` / `startTime` `:3559`（经 `:3325`/`:3726` 传入） | `:3291,3701-3727` |

两个后果：
1. 同一次 execution 的**运行中读数**与**最终读数**原点不同（monitor 创建 vs runSubprocess 入口），最终读数系统性略大；框架按 `F-RUNTIME` 逐条原样交付、不合成，**不会**消掉这个差。
2. 两者都**不含**：并发信号量排队（`acquiredAt - invokedAt`）与取得信号量后的 pre-run setup（`startTime - acquiredAt`）。这三段只有在 `logger.debug("subagent launch timing", {...queueMs, preRunMs, resolveMs, sessionOpenMs, createSessionMs, readyMs, promptToFirstChatMs, setupToFirstChatMs, invokeToFirstChatMs})`（`:4813-4834`）里出现——**`[私有实现]` 调试日志**，不是公开事实。

### 1.4 续跑 execution identity

- 宿主自己的 execution 名字就是 **agent id**（`registry` 身份）：首次 spawn 由 `TaskTool` 在**规划期**分配（`packages/coding-agent/src/task/index.ts:1058-1059 agentId = run?.identity.agentId ?? await outputManager.allocate(...)`，随后 pending 行 `:1061-1082` 已经带 `id` 与 `durationMs: 0`），count = 0。
- 续跑**复用同一个 id**：keep-alive 的后续执行由 peer/IRC 消息触发（`attachIrcWakeTurnMonitor` / `runSubagentFollowUpTurn`），不是第二次 `task` 调用；两者都再发一次 `status:'started'` 的 lifecycle 帧，且 `detached: true`（发布行 `N-KEEPALIVE`；检出 `:3242,3642`）。
- 框架侧把「同一 agent 的第 n 次 execution」命名为 `<agentId>#<n>`：`subagents.ts:142-147`
  ```ts
  const count = openedCounts.get(agentId) ?? 1;
  openedCounts.set(agentId, count);
  return count === 1 ? agentId : `${agentId}#${count}`;
  ```
  计数由 `:148-153 opened()` 只对 `payload.status === "started"` 帧递增。
- **可统一到什么程度**：只要计数器从该 agent 的**第一条** `started` 帧起就一直跟着，n 就能把「首次 / 第 2 次 / 第 3 次…」分开，续跑就是新的 execution identity。但：
  - 计数是**每次订阅各建一份**（`observeSubagentRuntime` `:363-368` 里 `subagentExecutions()`），不跨 binding 共享；同一进程内仅一个 binding 时等价，重新订阅即从零开始。
  - 中途才开始观察的订阅会把某次续跑当成「第一次」（`?? 1` 分支，adapter 自己的注释也承认为此设计）。
  - 该计数**同时被 `identityOf` 的隐式递增**（`:144` 未命中时写回 1）与 `opened()` 的显式递增**共用一张表**；两条路线的到达顺序变了，编号就可能错位——依赖「`started` 帧先于该 execution 的任何读数、且两条读取路线同进程」（adapter 注释明写这一前提）。
- **结论**：续跑 execution identity 在「同一订阅、同进程、不漏帧」条件下**可统一**；它是 adapter 自己的观察计数，不是宿主给出的身份。

### 1.5 取消 / 失败 / 未启动 / 崩溃

| 情形 | 终点事实 | 证据 |
| --- | --- | --- |
| 在 `runSubprocess` 入口前已被取消（`signal.aborted`） | **不发任何 lifecycle 帧**，直接返回 `durationMs: 0`、`exitCode: 1`、`aborted: true`，且无会话 | `executor.ts:3964-3989` |
| 运行中取消（模型发 stop / 信号） | 走 `finalizeRunResult`：`progress.status = "aborted"`，settled 帧 `status:"aborted"`；`finalizeSubagentLifecycle`（`:3389`）按 abort kind 决定 disposition/tombstone，**不额外发事件** | `:2750,2900-2915,3389-3460` |
| 失败（`exitCode !== 0`） | settled 帧 `status:"failed"` | `:2899-2915` |
| 中途才开始观察、从未归因 | running 读数**静默**；ended 读数即使无会话也报 `unavailable`（`subagents.ts:220-235`） | `subagents.ts:213-235` |
| 宿主进程整体崩溃 | 无帧、无 settled；该 execution 的 elapsed 只能靠外部持久化（如子会话文件）推断 | `[INFERENCE]`（本轮未运行） |

### 1.6 OMP 侧限制清单

1. **没有公开的开始时刻**：R1/R2/R3 只有相对 elapsed 或边界帧；`AgentProgress`（`packages/tui/src/tools/task.ts:2316-2358`）的时间字段只有 `durationMs`、`currentToolStartMs`、`recentTools[].endMs`——**没有 run 级 startedAt**。
2. **同 execution 两套 duration 原点**（§1.3），且都不含排队与 pre-run setup。
3. **排队/初始化分段只有私有 debug 日志**。
4. **计数式 identity** 依赖订阅起点与到达顺序，不跨 binding 共享。
5. **R3 帧只有身份与边界，没有 `reason`**：无法从帧本身区分「首次 start」与「续跑 start」，只能靠计数。
6. running 帧的 `durationMs` 初值可为 `0`，而框架规则是「零是真读数」；把 0 与「尚无读数」分开**只靠**创建窗口条件（会话可解析 + 该 identity 已被归因过）——`subagents.ts:213-218`。

### 1.7 若缺口成立，最小需补的公开事实（只列所需，不指定接口形态）

要让 framework 自己持有「execution 开始/结束事实」而不是转述宿主 elapsed，至少需要**公开**：
- **每条 execution 一个 identity**（能与续跑区分），且该 identity 的**开启帧带一个可比时刻**——当前 lifecycle 帧有 identity、无时刻；
- **同一 execution 的开启与结束事实使用同一时钟口径**（避免 §1.3 的双原点）；
- 若要覆盖类 1（含 setup/排队），需要把当前只在 `logger.debug` 里的 launch 分段提升为公开事实，或在 `runSubprocess` 入口给出公开的开启时刻；
- 若要在 framework 侧而不是 adapter 侧聚合，公开事实必须能跨订阅/重新订阅稳定（当前计数是订阅私有）。

以上四条**均不得**用私有字段、不公开回调或未来接口补全（本轮未发现现有公开面能替代）。

---

## 2. nicobailon 0.78.0（+ pi 1.2.0）各路径的公开 start/end

### 2.1 公开面清单

| 面 | 载体 | 是否公开 | 关键限制（文档原文要点） |
| --- | --- | --- | --- |
| 异步 run 工件 | `<tmp>/pi-subagents-<scope>/async-subagent-runs/<id>/{status.json, events.jsonl, output-<n>.log, subagent-log-<id>.md}` | `[文档]`/`[公开契约]` | 只由 **async（后台）** run 写；`events.jsonl` 是 append/update 工件 |
| `status.json` 字段 | `runId/id, sessionId, mode, state, startedAt, lastUpdate, endedAt, durationMs, …` | `[文档]` | `startedAt: number`（`async-status.ts:114`，epoch ms）、`endedAt?: number`（`:116`） |
| `events.jsonl` 生命周期事件 | `subagent.run.started/completed/stopped`、`subagent.step.started/completed/failed/paused/stopped`、`subagent.workflow.started/completed`、`subagent.parallel.started/completed`、`subagent.nested.started/completed/updated` 等，均带 `ts` | `[文档]` | 事件种类可扩展，消费者须忽略未知类型 |
| 进程终局证明 | `<id>/process-terminal.json`（公开投影）+ `process-terminal-candidate.json`（私有） | `[文档]`/`[公开契约]` | 只有**活着的父进程观察到 detached runner 的 `close`** 且会话租约空闲时才 `observed`，否则 `unknown`；文档明写「**不要**从 `endedAt`、结果文件存在、PID 消失或租约目录不存在推断进程退出」 |
| in-process 事件（`pi.events`） | `subagent:async-started`、`subagent:async-complete`、`subagent:foreground-complete`、`subagent:child-status`、`subagent:process-terminal` 等（`src/shared/types.ts:2428-2442`） | `[公开契约]`，但**仅同进程** | 文档明写 `pi.events` is in-process only；`child-status` 是「observer hints only」：**可在 live bus 与 async replay 之间重复**、宿主重启后**不重放**；权威状态以 status 快照为准 |
| 结构化委派 API | `pi-subagents/delegation`：`SubagentDelegationStarted{requestId, ownerRunId, nodeId}`、`…Update{…, runId?, durationMs?}`、`…Usage{…, durationMs}` | `[公开契约]`（`docs/extension-api.md:300-370`；`src/api/delegation.ts:45-118`） | **前台 leaf only**；更新是有界进度快照、非 patch；duration-only 心跳被合并；started 通知**不含时刻** |
| 子会话原生事件 | 子会话的 pi 事件流：`agent_start` / `agent_end` / `agent_settled`；两条启动路径都直接订阅（`docs/observability.md`「Child session events」） | `[宿主原生]` | `agent_end.willRetry` 推迟完成；**`agent_settled` 是终局水位**；「不 settle 的子会话在终局事件后不久被 abort 并**不带它**结束」 |
| 逐 run 元数据 | `{runId}_{agent}_meta.json`（含 `durationMs: target.progressSummary?.durationMs`，`foreground/execution.ts:159`） | `[文档]` | 由前台 run 写；metadata 记录「timing, usage, exit code, resolved model」 |

### 2.2 逐路径（start / end / identity / source / 限制）

| 路径 | start 事实 | end 事实 | identity | source 类别 | 覆盖哪一类区间 | 限制 |
| --- | --- | --- | --- | --- | --- | --- |
| **前台同进程** | 无公开"started"事件；唯一计时起点是 `foreground/execution.ts:482 const startTime = Date.now()`（**在子会话创建之前**），经 `progress.durationMs`（`:973,1047,1216,1267,1378,1460,1528`）与 meta `:159` 露出 | `subagent:foreground-complete` 事件（`subagent-executor.ts:925`，带 `timestamp: Date.now()`、`stopped/timedOut/interrupted/processSignal`）+ 终态结果对象 | `runId` + `index`，关联键 `(runId, index)`（`docs/extension-api.md:142`） | `[公开契约]`（in-process）/`[文档]` | **类 3**（含 setup，不含父进程排队） | 前台**不写** `status.json`（async only）；没有对外绝对 start 时刻，只有 elapsed；`foreground-complete` 是**in-process**，跨进程不可见；前台 run 的持久化历史（`foreground-history.ts:90-101 compactRun`）只留 `runId/mode/cwd/sessionId/updatedAt/children`，**不含 timing** |
| **后台独立进程** | `subagent-runner.ts:1888 const overallStartTime = Date.now()` → `status.json.startedAt`（`:2053`）+ `events.jsonl` `subagent.run.started{ts: overallStartTime}`（`:3522`）；父进程另有 in-process `subagent:async-started`（`async-execution.ts:1778`，**不含** ts） | `statusPayload.endedAt = runEndedAt`（`:4902,4925`）+ `subagent.run.completed{ts, durationMs, status}`（`:5059-5068`）/ `subagent.run.stopped`（`:3426`）；结果文件 `durationMs = runEndedAt - overallStartTime`（`:5022,5064`） | `id/runId`、`sessionId`、`asyncDir`；每 child 有 `stepIndex` 与 `{runId}_{agent}_meta.json` | `[文档]`/`[公开契约]`，**跨进程按文件路径可读** | **类 3**（runner 进程内从入口起算） | `startedAt` 是 **wall clock**（`Date.now()`），非单调；父进程 `subagent:async-started` 无时刻；`overallStartTime` 在 runner 进程内，**不含**父进程启动 runner 的排队/建进程时间 |
| **嵌套（子代理再 spawn）** | 嵌套 run 有自己的 run 目录与 `subagent.nested.started/completed/updated` 事件；另有 `subagent:child-status{childId, childRunId, status:"started", ts}`（`async-job-tracker.ts:310` 把 events.jsonl 的 child-status **重放到** in-process bus） | 同 layer 的 `nested.completed` / `child-status "stopped"` / 子 run 自己的 status.json | `childId`、`childRunId`；嵌套 async root 下有独立 `<id>/` | `[公开契约]` | **类 3**（子 run 自己） | 嵌套 fanout 在父 status 里只以**压缩 sidecar 摘要**合并（`docs/observability.md`）；`child-status` 是 hint 且会重复 |
| **workflow（含并发 parallel）** | workflow 根：`subagent-executor.ts:5585 const startedAt = Date.now()` → `status.json.startedAt`（`:5616`/`:5805`）+ `appendWorkflowEvent({type:"subagent.workflow.started"})`（`:5819`）+ `subagent:async-started{mode:"workflow"}`（`:5821`）。**每个并发 child**：`announceWorkflowChild` 在该 child 有具体 `runId` 后**只发一次** `subagent:child-status{status:"started", ts, workflowKey, stepIndex, childRunId}`（`:6007-6020`，`announcedWorkflowChildren` 去重），并同时 `appendWorkflowEvent` | `appendWorkflowEvent({type:"subagent.workflow.completed"})`（`:6382,6436`）+ `subagent.parallel.completed`；每 child 的 step 终态与自己的 run 工件 | workflow `runId` + `workflowKey`/`stepIndex`/`childRunId` | `[公开契约]` | **类 3**（每个 child 各自） | **不能**用一条 `subagent` 工具调用的开始去猜每个 child 的开始：并行 child 的 started 是**逐 child、在拿到 launch identity 后**才发；且该 hint 会经 replay 重复、重启后不重放 |
| **调度（schedule）** | 调度记录 `ScheduleRunRecord{plannedAt, startedAt?, asyncId?, …}`（`scheduled-runs.ts:62-83`，ISO 字符串）+ `schedule.run.*` 事件；`startedAt` 是**抢占 launch 的时刻**，真正边界仍来自被点火的 run | `completedAt` / `state ∈ {completed, failed_run, failed_launch, skipped, missed}`；`failed_launch`：claim 后 5 分钟仍无 `asyncId` 即判失败（`STALE_LAUNCH_CLAIM_MS`, `:842-870`） | `scheduleId` → `activeRunId`/`lastRunId`/`asyncId` | `[公开契约]` | 类 3（run 自己）+ 调度的 claim 区间 | 调度的 `startedAt` **早于**被点火 run 的 `startedAt`（claim 早于 attach）；两者不能当同一条边界 |
| **续跑 / resume** | resume 产生**新 run**（新 runId、新进程），重新走上面的 start 路径；同一 **session id / sessionFile** 被复用（`[已验证-07]`：新 run `9784f019…`、新 PID 22864、同 session id 与 sessionFile） | 新 run 自己的终态 | execution identity = **新 runId**；会话 identity = **同一 sessionId** | `[已验证-07]` + 上述工件 | 类 3（新 run 自己） | `session_start.reason` 仍是 `startup`、branch 已有消息，**不能**据 reason 重报首次 startup（`[已验证-07]`）；stopped 的 run 不能再 resume（`async-resume.ts:492,570`） |

### 2.3 「子扩展初始化后的 agent 活跃区间」vs「完整 execution（含 setup）」

- **agent 活跃区间（类 2）** = 子会话里的 pi `agent_start` → `agent_settled`（`E:/Developer/myhub/pi/packages/coding-agent/src/core/extensions/types.ts:960-962,1033-1037`；`agent-session.ts:1079-1087,1289-1291`）。两者都是**无时刻**事件：`AgentStartEvent` 只有 `{type}`，`AgentSettledEvent` 只有 `{type, aborted}`。任何消费者要得到区间，都得**自己观测时打时钟**——本包自己的观察探针就是这么做的（`[已验证-07]`：探针测了 14 个子执行的 `agent_start`→`settled` 活跃区间）。
  - 一次 execution 内可有**多段**（重试/压缩/排队续跑各自成段），`agent_settled` 只在「不会再有自动重试、压缩或排队续跑」时发一次。
  - 它要求扩展先在**子会话**里被激活才能观察到（`registerRequiredChildExtensions` 路线，已实测在各路径加载成功，`[已验证-07]`）。
- **完整 execution（类 1/3）** = 本包自己的计时：前台 `foreground/execution.ts:482`（早于子会话创建）、后台 `subagent-runner.ts:1888`（runner 进程入口）、后台**每 child** `run-child-session.ts:174 const startedAt = Date.now()`（在 `runChildSession` 入口，早于该子会话建立；结束 `:626 durationMs: Date.now() - startedAt`）。
- 两者**不能混装**。`[已验证-07]` 的实证：一次启动失败 `meta.durationMs = 16195ms`，而观测到的 agent 活跃区间只有 `12ms`——差值就是执行器 setup / 会话建立 / 失败发现。反过来把活跃区间当 execution 时长会漏 setup，把 execution 时长当活跃区间会把 setup 算成工作。

### 2.4 并发 workflow：不能从一条工具开始推每个 child 开始

- 一条 `subagent` 工具调用（或一个 workflow 脚本）是**父容器**边界：`tool_execution_start/end` 是父调用的边界，`mode:"parallel"` 时它包住所有 child。
- child 级开始事实存在，但形态是**候选自定义**的：`subagent:child-status{status:"started", ts, workflowKey, stepIndex, childRunId}`（`subagent-executor.ts:6007-6020`），前提是「该 keyed child 有了具体 launch identity」。这证明**不可**用父调用开始替代；也确实**不必**用父开始去猜。
- 但该 child 级 start 是 **hint**：`docs/observability.md` 明写它会跨 live bus 与 async replay **重复**、宿主重启后**不重放**；`async-job-tracker.ts:305-330` 就是从 `events.jsonl` 重放同一事件到 bus。权威仍是 status 快照 + `events.jsonl` 本身（append/update 工件）。
- `[已验证-07]` 实测：并发 workflow `bab92fb3…` 两条 child 请求区间**实际重叠**，childRunId 分别 `a82b4c2b…`/`98b70e09…`；**同一 started hint 有重复交付，不能当作重复 execution 或收费依据**。

### 2.5 取消 / 失败 / 崩溃：哪些有可靠结束

| 情形 | 是否有可靠结束 | 事实 |
| --- | --- | --- |
| 后台 stop（`/subagents-stop`、`subagent({action:"stop"})`、control channel `stop`） | 有 | `statusPayload.state = "stopped"`、`subagent.run.stopped`/`step.stopped`；`process-terminal.json` 可在观察到 runner `close` 后由 `pending` 变 `observed` |
| 后台失败（exitCode≠0 / provider 错 / budget） | 有 | `state ∈ {failed, partial}`、`subagent.step.failed`/`run.completed{status:"failed"}`；`usageBudget.exhausted` 也走 failed |
| 后台超时 | 有 | `timedOut: true`、`subagent.step.failed`（`:3868` 三态选择） |
| 前台取消（Esc / stop / timeout / interrupt） | 有（in-process） | 终态结果带 `stopped/timedOut/interrupted/processSignal`，并用 `subagent:foreground-complete` 投递；run 超时/工具超时/中断会 abort 并 dispose 子会话 |
| 子会话**不 settle** | 有（合成结束） | 「a child whose run does not settle shortly after its terminal event is **aborted and finished without it**」（`docs/observability.md`）——即该结束是**主动 abort 的结果**，不是自然 settle |
| 前台所属进程崩溃 | **不可靠** | 前台 run 不落 `status.json`；父进程消失即证据消失。`process-terminal.json` 只覆盖 detached **runner** 进程，且需要活着的父进程观察 `close`，否则 `unknown` |
| 后台 runner 崩溃 / 被杀 | 部分 | 剩下 `status.json` 可能是非终态；`stale-run-reconciler.ts` 负责把 stale/死 PID 的 run 收敛成终态并补结果文件（`readProcessTerminal`；`PidLiveness = alive|dead|unknown`）。**但文档明写不得**从 `endedAt`、结果文件存在、PID 消失或租约目录不存在推断进程退出 |
| 参数拒绝 / 未启动 | 不是 execution | `[已验证-07]`：`resume` 不接受 model override、`schedule` 不接受 `mission:false` 两次参数拒绝**未开始** execution，也未计入次数 |

### 2.6 时钟与跨进程可关联性（准确列出）

**时钟**：
- 工件里所有时间戳都是 **wall clock**：`Date.now()`（epoch ms，如 `overallStartTime`、`startedAt`、`ts`、`observedAt`）或 `new Date(...).toISOString()`（调度记录的 `plannedAt/startedAt/completedAt`、`createdAt/updatedAt`）。`durationMs` 一律是两次 `Date.now()` 之差。
- 本包确实用 `performance.now()` 的地方只有三处**进程内、不落盘**的用途：外部 git 探测节流（`subagent-runner.ts:2629,3258-3259`）与文件租约等待截止（`file-lease.ts:65-68`）。**没有任何持久化的单调时间戳。**
- pi 侧同样：`agent_start`/`agent_settled` 无时刻（§2.3）。
- 后果：`Date.now()` 受 NTP/手动调时影响；跨机/跨进程比较只需同一挂钟假设；Durations 相互可减，但**绝对时刻**不可当单调事实。

**跨进程可关联性**：

| 关联键 | 载体 | 跨进程? |
| --- | --- | --- |
| `runId` / `id`（+ `childRunId`, `workflowKey`, `stepIndex`） | status.json、events.jsonl、结果文件、meta、工具 details | ✅ 文件路径可读 |
| `sessionId` + session 文件 header `parentSession` | pi session 文件（`docs/observability.md`「Sessions」） | ✅ 按路径可读 |
| `parentSessionId` / `parentSessionFile` | `{runId}_{agent}_meta.json`、session header | ✅ |
| `asyncDir` | status/details | ✅ |
| `pid` / `runnerProcessInstanceId` / `process-terminal.json` | 进程终局证明 | ✅ 但只有 `observed` 才是证明，`unknown` 时不成立 |
| `pi.events` 上的一切（`async-started`/`child-status`/`foreground-complete`…） | 内存 EventEmitter | ❌ 仅同进程；文档明写不跨进程、`child-status` 重启不重放 |
| 前台 run 的「本进程内计时」 | `progress.durationMs` / meta | ❌ 跨进程只能读 meta 文件（若 artifacts 开启） |

### 2.7 nicobailon 侧的最小需补公开事实

若要在**不使用私有字段/不公开回调/未来接口**的前提下，让 framework 得到「每条 execution 的公开开始与结束事实」，缺口是：
1. **前台同进程路径没有公开的 start 事实**：只有 elapsed（`progress.durationMs`）与 in-process 完成事件；`status.json` 仅后台有。需要前台 run 的公开开始事实（带 identity 与可比时刻）。
2. **pi 原生运行事件无时刻**（`agent_start`/`agent_settled` 无 payload 时间）。若要以 agent 活跃区间作为边界输入，需要宿主给出时刻，或在子会话侧公开一个带时刻的边界事实。
3. **child 级开始只是 hint**：`subagent:child-status` 会重复、重启不重放。需要一个可权威读取、可去重的 child 级开始/结束事实（`events.jsonl` 本身是 append/update 工件，但文档只承诺「读 JSON 而不是抓终端输出」，未承诺它是完整账本）。
4. **跨进程时钟口径**：所有持久化时刻是 wall clock，没有单调时钟。若要跨进程比较/累计，需要一个明确口径（同一挂钟，或另带单调基准）。

---

## 3. 与 decision/04 的边界（不替 decision/08 定义 Round）

- 本文件只回答「execution 的完整开始/结束事实在各路径是否可靠可取」。**Round / Turn / Working / Idle 的定义与判据不在本文件**，仍归 [decision/08](../decision/08-pi-round-boundaries.md) 与 framework/GLOSSARY.md。
- 本文件不主张任何一条路线「已覆盖」：OMP 侧只有 elapsed + 无时刻的边界帧；nicobailon 侧前台缺公开 start、child 级 start 是 hint、时钟是挂钟。
- 既有实测（`[已验证-07]`）证明的是「一种最小观察接入与离线汇集路线」，**不是**生产共享 JSON 的并发写入、崩溃恢复或增量订阅已实现。
- 与 [State follow 事实](04-state-follow-facts.md)、[刷新触发事实](04-refresh-trigger-facts.md) 交叉引用的部分（子会话身份/直接父、子扩展激活、关轮输入）在本文件中只作边界陈述，不重复其结论。
