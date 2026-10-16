# 事件驱动消费视图刷新的事实前提与现有合并接口

日期：2026-10-16。作者：RefreshTriggerFacts（研究子任务，只读）。
用途：为 grilling 票 [第三方能力适配的集中组织与公共语义复用](../decision/04-third-party-adapter-organization.md) 与 [pi 原生事实到 Round 边界的映射](../decision/08-pi-round-boundaries.md) 提供事实底稿。
**本文件不批准设计、不批准提供方补丁、不改 ticket/map/lighthouse/生产源码、不安装、不调用模型、不跑 build/lint/test/formatter、不新增 poll/retry 路线。**

## 0. 口径与证据等级

- 三档标注：**[静态]** = 固定 revision 源码/文档逐行读取；**[实测]** = 已发布真实运行结论（只引用，不重跑）；**[INFERENCE]** = 由上述两类推出的判断，随文标注。未运行项集中列在 §4。
- **源码与 npm 工件分开**：源码 pin `pi-subagents@0.78.0` @ `a4c8ced69a8176cdf4179b127feddc8875e3418f`，本地 `E:/Developer/myhub/wt/_cand/git-nicobailon`（浅克隆）。07 票真实运行对象是 **npm 发布工件 `index.js`**，不以源码检出冒充发布内容（[report-live](07-runtime-validation/report-live.md) §授权/环境）。
- 宿主 pi 1.2.0 @ `4a5d37291531ad48b8e536c892557877d219463c`；model-cost 源码为工作树 `extensions/model-cost/**`（分支 `pi-adapter`）。
- 本文出现的"根侧事件"= 在**根进程**内可达的事件（框架交付、pi 原生、第三方 bus 频道）；"子侧"= 只在子会话/子进程内可达的事实。

---

## 1. 现有存储与记账：合并接口的事实（Q1）

### 1.1 初始化 `load`（`shared-logic/consumption-store.ts:273-296`）**[静态]**

`mkdir(storageDirectory, {recursive:true})` → `readFile(consumptionFile)` → `JSON.parse` → `readConsumptionDocument` → `#adopt`。四条出口：

| 情形 | 结果 | 对实例状态的影响 |
| --- | --- | --- |
| 文件不存在 | `{kind:"fresh"}` | `#adoptFresh()`（`:500-504`）：period = 固定 `"period-fresh"`（`:80`），records 清空，**pause 清除** |
| 可读且合规 | `{kind:"loaded", faults}` | `#adopt(document)`（`:477-490`）：period/records 全量替换，pause 清除 |
| 目录创建/读文件抛非 ENOENT | `#pause(reason)` | period = `undefined`、records 清空、pauseReason 记下（`:520-525`） |
| 非 JSON / 非本 schema | `#pause(reason)` | 同上 |

paused 之后：`commit` 立刻返回 `{kind:"paused"}` 且**不触碰文件**（`:312-315`），`reset` 返回 `unusable`（`:377-380`），`#records` 全空。清 pause 的唯一路径是再一次成功的 `load`（`#adopt`/`#adoptFresh` 都置 `#pauseReason = undefined`）。全扩展**只有一处**调用 `load()`：初始化（`runtime.ts:318`）；读 `consumption.json` 的也只有这里与 `updateFile` 协调区内的重读（见 1.2）——grep `consumptionFile` 的读点仅 `consumption-store.ts:277`。

### 1.2 `commit` 采用完整文档（`consumption-store.ts:312-354`）**[静态]**

`updateFile(consumptionFile, read => ...)` 在协调区内对**刚刚重读的磁盘文档**做 `#decide`（`:444-474`）：periodId 不符 → `stale-period`；同 period 内按 harness+session id 比 `saveVersion`：更旧 `stale-version`、同版本同业务内容 `unchanged`、同版本异内容 `conflict`、更大版本替换该条并保留其他条 `saved`。

- 成功/幂等：`#adopt(document)`（`:337`）—— document 是**协调区读到的整份文档**（含其它进程写的记录），采用它即把外部记录并入本实例。
- 业务拒绝：`#rebase(current)`（`:511-514`）把**磁盘当前有效快照**设为基线（拒绝是对文件真实内容做的判定）。
- `SafeFileUpdateError.kind === "corrupt"`：**pause**（`:349`，"不是 JSON 文档"）；其余失败类别（`timeout`/`cancelled`/`io`）返回 `failed`，保留上一基线。

⇒ 在现状下，`commit` 是**除 `load` 之外唯一**会把别的进程记录并入本实例的路径，而且它自带一次写。

### 1.3 未提交的本地 ledger（`shared-logic/request-accounting.ts`）**[静态]**

- `ledgers`（按 sessionId）与 `ConsumptionStore` 是两套状态。`ledgerFor`（`:649-673`）**只播种一次**：`saved = storage.session(harness, sessionId)`，把该记录的 `own` tokens 抄进 ledger，`revision = 0`、`savedRevision = 0`；`runtimes` 用 `record.runtimeMs` 播种。
- store 的 `#adopt`/`#rebase`/`#pause` **不会**重播种已有 ledger，也不会清它。
- 读取：`own`（`:932-936`）有 ledger 读 ledger（= 基线 + 本实例新增），无 ledger 读 `storage.session(...)`；`identities`（`:943-959`）与 `inclusiveTotalsOf`（`:721-748`）同样以 `storage.sessions(...)` ∪ `reported` ∪ `ledgers` 为全集。
- 写：`save`（`:862-929`）构造 `record.saveVersion = (ledger.saved?.saveVersion ?? 0) + 1` —— **版本链只从本实例自己上次构造的快照走**（注释明说"not from what the store has already adopted"）；提交前先推进 `ledger.savedRevision`，因此"上一次保存还在飞行时结束的 Round"不会重复提交同一批累计。失败 → 通知 + `discard(sessionId | undefined)`（`:816-842`）：单会话失败只丢该会话 ledger/openRounds/endedRounds；**period 被替换**则全丢，但 `handled`（已处理的 Turn 身份）与 `reported`（身份事实）保留。
- 本地 Round 与 Session span 是**内存态**：`openRounds`/`endedRounds`（`:561-563`）、`spans`（`session-span.ts`）都不持久化，也不受 store 采纳影响（除 `discard`）。

### 1.4 period 变化 **[静态]**

- **本实例自己做的 reset**：`reset`（`:377-441`）在协调区内归档文件真实持有的文档、发布新 generation，成功后 `#adopt`；`runtime.ts` 在 `onReset` 里调 `periodSwitched()`（`:1169-1176`）→ `discard(undefined)`：所有 ledger、Round 边界、spans 一起丢弃，`handled`/`reported` 保留。
- **别的进程做的 reset**：本实例**不会**收到 `periodSwitched`。恢复发生在**下一次保存尝试**：`#decide` 判 `stale-period` → 拒绝 → `#rebase` 采纳新文档 → `save` 里 `samePeriod = storage.period()?.periodId === periodOfThisSnapshot` 为 false（`request-accounting.ts:898,912,928`）→ `discard(undefined)` 全丢。期间（无新消费、无保存）本实例仍持有已关闭周期的累计与边界；`roundTotals` 有 periodId 守卫（`:963-976`）会隐藏跨周期 Round，但 `own` 仍会读到 ledger 里已关闭周期的累计。

### 1.5 并发保存 **[静态]**

底层是框架的 `updateFile`（`framework/modules/files.ts:638-671`；契约文档 `:1-80`）：

- 同文档在**进程内**按提交顺序串行（per-key promise 链，FIFO），**跨进程**用目标同目录的一份锁目录互斥；两者共享一个等待预算，默认 `DEFAULT_WAIT_MS = 15000`（`:121`）。
- 发布 = 同目录临时文件 + rename 覆盖（`:360-390`），因此在遵循该发布机制的读写范围内，读者不会看到撕裂写；这不排除文件首次尚未创建、外部删除或其他 I/O 错误，不能把运行中文件缺失一律解释成首次使用。
- `updateFile` 以 `SafeFileUpdateError` 拒绝，类别 `timeout | cancelled | io | corrupt`（`:83`）；`ConsumptionStore.commit` 捕获并转换为其结果或暂停状态。`corrupt` 时 update 函数不会被调用；现有消费存储路径不为此次失败自动重试。
- model-cost 侧：`savesPublishing` 计数（`:571`）包住 `storage.commit`（`:902-907`），`savePending()`（`:1168`）让 period switch 不会与正在发布的写入竞态（`period-switch.ts` 消费该读数）。

### 1.6 可复用 / 不可直接当作刷新的部分 **[静态 + INFERENCE]**

**可复用（已存在、语义明确）**

| 现有件 | 位置 | 可复用的性质 |
| --- | --- | --- |
| `updateFile` 协调读-改-发布 | `framework/modules/files.ts:638-671` | 同进程序列化 + 跨进程锁 + 原子发布 + 有界等待 + 失败分类 |
| `commit` 的**全文档采纳** | `consumption-store.ts:337`、`:511-514` | 唯一会把外部进程记录并入本实例的既有路径 |
| 变更通知缝 | `request-accounting.ts:751-753`（`announce`）、`:984-989`（`view.subscribe` 返回 release） | 所有来源共用一条"结果变了"通知；`announceChanged()`（`:1165-1167`）供兄弟来源复用 |
| 保存中读数 | `savePending`（`:1168`） | 供 period switch 判定 |
| 只读投影 | `storage.session()/sessions()`、`view.own/identities/inclusiveTotals` | 展示层与测试读同一处 |
| 按 Round 边驱动的非持久读数 | `presentation/session-activity.ts`（头部注释）、`sessionContext` | 先例：UI 读数由事件顺带更新，不写盘 |

**不能直接调 `load()` 当刷新（三条互相独立的理由）**

1. **它会暂停整个实例。** 一次瞬时 `io`/外来非 JSON 会走 `#pause`：period/records 清空、统计与保存全停，且**不可自愈**（`commit` 返回 `paused` 且不重读；只有下一次 `load` 能清 pause）。把 `load` 放到事件上，等于把一次读失败升级为持久故障。
2. **它会把"文件缺失"读成 fresh period。** `#adoptFresh` 会把 period 换成 `period-fresh` 并丢掉已采纳的 records —— 这不是"采纳磁盘"而是"假设磁盘没有文档"。
3. **它另有副作用且不动本地状态。** `mkdir` 创建目录；同时它完全不触碰 `ledgers`/`openRounds`/`endedRounds`/`spans` —— 采纳了外部文档却留下按已关闭周期度量的本地累计，与 §1.4 的 `stale-period` 恢复路径不同步。

⇒ **现状没有一个"只读重读并采纳"的入口**：要么 `load()`（初始化语义 + 可能暂停/重置），要么 `commit()`（必须写）。任何"事件驱动刷新"在当前接口上都缺一个明确的采纳点；新增该入口属于生产改动，不在本票范围内。

---

## 2. 已选 nicobailon 的公开根侧事件（Q2）

### 2.1 频道与发射方 **[静态]**

频道常量：`src/shared/types.ts:2427-2444`（10 个 `pi.events`）；`subagent:child-status` 的版本化载荷 `type:"subagent.child-status", version:1, runId, childId, status:"started"|"stopping"|"stopped", ts, reason?, source?, asyncDir?, stepIndex?, agent?, childRunId?, workflowKey?, phase?, label?`（`:2446-2463`）。RPC：`SUBAGENT_RPC_PROTOCOL_VERSION = 1`、请求/就绪/回复频道、9 方法 `ping,status,manage,spawn,steer,interrupt,stop,resume,cost`（`src/extension/rpc.ts:31-37`）；`ping` 的 capabilities 明确列出 `events.asyncComplete/childStatus/processTerminal`（`:468-475`）与 `processTerminalProof`、`cost` 版本（`:452-467`）。

| 根 bus 事件 | 发射点（进程） | 载荷能说明 | 载荷不能说明 |
| --- | --- | --- | --- |
| `subagent:async-started` | `src/runs/background/async-execution.ts:1778`、`:2392`（父进程 spawn runner）；workflow root `src/runs/foreground/subagent-executor.ts:5821` | 一个新 runner/子会话已被启动；workflow root 在 `status.json` 落盘后发（`mode:"workflow"`，文档 `docs/observability.md:326`） | 子是否开始跑、是否写过任何东西 |
| `subagent:async-complete` | `src/runs/background/result-watcher.ts:599`（拥有结果目录的进程）；`subagent-executor.ts:3410`；`src/runs/background/workflow-detach-reconcile.ts:281` | 该 run 的结果文件已持久化、通知已投递（"belong only to the originating session"，`docs/observability.md:315`；awaited workflow child 带 `awaitedByWorkflow:true, triggerTurn:false`） | 子扩展是否已提交消费 |
| `subagent:process-terminal` | `async-execution.ts:664-671`（回调注册见 `:1685`、`:2334`，由**父进程**在观察到 runner `close` 后发） | `proof.state === "observed"` 时：父进程观察到该 detached runner 的 close，且相关 canonical-session 租约已释放（`docs/observability.md:254-260`） | 执行成功与否（文档 `:260` 明说独立于 execution success）；proof 可以是 `unknown`；**不证明该进程写过消费** |
| `subagent:child-status` | 后台 step 由 runner 写进自己的 `events.jsonl`（`src/runs/background/subagent-runner.ts:2286-2290`，仅 `stopping`/`stopped`），父侧 `src/runs/background/async-job-tracker.ts:274-350` 用 `fs.watch`/间隔轮询 tail 该文件后**转发**到父 bus（watch `:103-104`、轮询 `:698-722`）；workflow child 的 `"started"` 由 `subagent-executor.ts:5998-6019` 直接 emit；RPC stop 时 `src/extension/rpc.ts:617` | 某个 step/关键 workflow 子获得了身份或正在停止 | 文档自陈 `docs/observability.md:228-230`："observer hints only … can duplicate … **not replayed after a host restart**。Status snapshots remain authoritative" |
| `subagent:foreground-complete` | `src/runs/foreground/subagent-executor.ts:924-951`，前置条件 `input.sessionId === state.currentSessionId` | 本进程内的前台 run 完成（发给拥有它的那个会话） | 跨进程任何事（前台子本来就在父进程内） |
| `subagent:control-event` / `control-intercom` / `steering-notice` / `result-intercom*` | `async-job-tracker.ts:236,239,345`、`result-watcher.ts`、`src/intercom/result-intercom.ts:360` | 有控制/注意力消息进入父会话 | 不是 run 完成边 |

**进程边界（关键，文档原文）**：`docs/observability.md:335` —— "`pi.events` is in-process only. It does not reach separate Pi processes or child subagents; use the file lifecycle artifacts or `pi-intercom` for cross-process coordination." **[静态]**

⇒ 根 bus 上关于某个后台子的频道，是**根进程自己从子工件读出来再发**的（`async-job-tracker` 转发、`result-watcher` 读结果文件）；子进程内发生的事不会自己出现在根 bus 上；子进程 bus 上的事件也不会到达根。**根侧事件不是子会话的直连通道。**

### 2.2 覆盖：嵌套 / workflow / 后台 / 续跑 **[静态 + 实测]**

- **后台**：`async-started` / `async-complete` / `process-terminal` / `child-status` 四条都在根侧可达（由上表的转发或父侧观察产生）。
- **workflow**：`async-started(mode:"workflow")`、`child-status("started")`（workflow coordinator 直接 emit）、`async-complete(awaitedByWorkflow:true, triggerTurn:false)`、detach-reconcile 路径（`workflow-detach-reconcile.ts:281`）。07 票实测根确实收到完成通知（[report-live](07-runtime-validation/report-live.md) 场景"并发 workflow"）。
- **嵌套：不经根 bus。** 嵌套事件写进 `NESTED_EVENTS_DIR` 路由文件（`src/runs/shared/nested-events.ts:24`），由 `projectNestedEvents`（`:725`）投影合并进**父的**状态视图；文档 `docs/observability.md:215`："Nested fanout status is stored as compact sidecar event/registry metadata and merged into parent status views … full recursive status snapshots are not embedded in parent result files." 实测旁证：根 RPC `cost` 快照比同一时点独立观察少恰好两个嵌套叶与一个定时 workflow 叶（[cost-scope-comparison.json](07-runtime-validation/cost-scope-comparison.json)；report-live §逐请求/归因）。⇒ **根侧事件不足以得知嵌套子会话的存在或写入**。
- **续跑**：实测续跑产生新 run/新进程但**复用同一 actual session id 与 sessionFile**（report-live 场景"完成后续跑"；`resume` 亦在 RPC 9 方法内）。新 run 走同一 spawn 路径，因此 `async-started`/`process-terminal`/`async-complete` 形状相同；但"resume 具体在根 bus 上发哪几条"未在 07 报告逐项列证 ⇒ 记为 §4 未验证。以会话 id 为键的刷新会把两次执行的记录视为同一行（与 `saveVersion` 链一致）。

### 2.3 事件与"子扩展异步 round_end 保存已落盘"的次序 **[静态 + 实测]**

- **没有任何代码关系。** 子进程里 model-cost 用自己的 `updateFile` 写 `consumption.json`（§1.5）；nicobailon 写的是 `events.jsonl` / `status.json` / `process-terminal.json` / 结果文件。两套写者互不知情，没有任何事件在 model-cost 的提交点上发出。
- `async-complete` 只证明"结果文件已持久化 + 通知已投递"；`child-status` 是父侧 tail 子工件的 hint（可重复、重启后不重放）；`async-started` 只证明启动。
- `process-terminal`(observed) 是唯一带**边界语义**的一条：它只在父进程观察到该 runner 的 close 后发出，因此**在其之后**任何对 `consumption.json` 的读取不会再被该 runner 改动。但它不证明该 runner 曾经提交过——若该 run 从未到达 Round 结束，就根本没有保存。
- **保存本身的条件**：`roundEnded`（`request-accounting.ts:1072-1099`）在"该会话消费确有增长"（`ledger.revision > ledger.savedRevision`）时才 `save`；`cleanup` 只做 `dispose`（`runtime.ts:497-501`，`accounting.dispose` `:1177-1181` 清 anchors/listeners），**没有任何 shutdown/退出时保存**。所以"子进程最后一段消费是否落盘"取决于它是否真有关轮边界——这是 [Round 边界票](../decision/08-pi-round-boundaries.md) 的问题，不是刷新能补的。
- **结论**：**未证明**"发事件时子扩展的 round_end 保存已落盘"；反之也**未证明**事件一定晚于保存。必须保留**顺序不明**的限制。**不得**用父完成/进程退出推定子提交；不得把"事件即已保存"写进任何设计前提。

### 2.4 候选之外的两条根侧事实源 **[静态]**

- **RPC 主动读**（`status`/`cost`）：`rpc.ts:794-797` 注释原文 —— "Read-only: it walks the current session branch and existing artifacts, **so callers should request it on their own turn boundaries, not on a timer**"。这与"不新增 poll"一致；但它是主动请求，不是事件驱动。
- **required-child-extensions / 扩展 ack**：07 票实测根、前台子、后台子、嵌套与 workflow 子会话都能加载并 acknowledge 探针（report-live；ack 经子 `capture.runtimeAcknowledgedExtensions()` 随结果/状态投影，`src/runs/shared/child-hooks.ts:143`、`subagent-runner.ts:4928`）。这条证明"子进程里我们的扩展活着"，**不证明**它写过消费。

---

## 3. 集中刷新的候选与事实支撑的接口约束（Q3）

### 3.1 候选清单 **[静态]**

| 候选根事实 | 今天是否可用 | 能提供什么 | 硬限制 |
| --- | --- | --- | --- |
| 框架语义交付 `round_end` / `turn_end`（根会话） | **否**：pi 适配器显式拒绝 —— `framework/adapters/pi.ts:200-203` `onRound: () => unsupported("round")`、`onTurn`、`onSubagentRuntime`、`onUserInput` 全部抛错；`onSession` 只处理 `session_start`/`session_shutdown`（`:171-198`） | 将来是唯一与"本会话计费边界"同源的边 | 需先由 Round 边界票与适配组织票定义；今天在 pi 上根本不产生 |
| pi 原生会话事件（`session_start`/`session_shutdown`/`before_agent_start` 已映射；`agent_settled`/`message_end`/`input` 等在 pi 侧存在，行号见 [02-primary-candidates-correction](02-primary-candidates-correction.md) §3 宿主原生行） | 部分 | 生命周期/活动提示；`session_shutdown` 是适配器已映射的唯一会话终止边 | 与"另一个进程是否写过文件"无关；OMP 侧已有先例仅用于**非持久 UI 读数**（`harnesses/omp.ts:179,192-210`） |
| nicobailon 根 bus：`async-started` / `async-complete` / `process-terminal` / `child-status` / `foreground-complete` | 是（公开频道） | 见 §2.1；`process-terminal`(observed) 是唯一"该 runner 已退出"的边界事实 | hint 语义、可重复、重启不重放（文档 `:228-230`）；proof 可为 `unknown`；与消费提交无次序关系（§2.3） |
| nicobailon RPC `status`/`cost`（主动读） | 是 | 权威状态快照（文档 `:230` "Status snapshots remain authoritative"） | 明确定位为"on your own turn boundaries, **not on a timer**"（`rpc.ts:794-797`） |
| 子进程内的自观察（required-child-extensions + 本扩展实例） | 是（实测可加载） | 子进程自己观察自己的 Turn/Round 并写同一份文件——**这才是账的权威来源** | 不产生根侧事件；根要看到它必须重新采纳文档 |

### 3.2 事实支撑的接口约束（约束，不是补丁）

以下每条都由上文事实直接支撑，留给源票作为设计输入：

1. **单一订阅缝。** 刷新必须集中在一处（一个订阅点把少量根事实映射为"文档可能已变，需要重新采纳"），不得写进每个 handler。根侧今天唯一存在的"多来源共用一条通知"先例是 `announce`/`view.subscribe`（`request-accounting.ts:751-753,984-989`）。
2. **不得新增 poll/retry。** RPC `cost`/`status` 的注释（`rpc.ts:794-797`）已把"按定时器轮询"排除；第三方文档也把 child-status 归类为 hint。刷新只能挂在既有事件上。
3. **刷新必须幂等、只读、可丢。** 事件本身可重复、可缺（`docs/observability.md:228-230`），因此刷新不得消耗或清空任何本地累计（`ledgers`/`revision`/`savedRevision`/`openRounds`/`endedRounds`/`spans`），也不得改变 `saveVersion` 链。
4. **采纳点必须明确且带 period 语义。** 采纳到的文档其 `periodId` 必须与本地 period 一致；不一致只能走既有 `stale-period` 恢复语义（`#rebase` + `discard(undefined)`，§1.4），不得把已关闭周期的累计并入新周期。现状**没有**一个无写的采纳入口：`load()` 带 pause/fresh/mkdir 副作用（§1.6），`commit()` 必须写。是否新增只读采纳入口属源票决定。
5. **保存/关轮不得由刷新替代。** 保存条件在 `roundEnded` + 消费确有增长（`:1072-1099`），且无 shutdown 保存（`runtime.ts:497-501`）。刷新只能改变"本实例读到的行"，**不能**让从未保存的消费出现，也不能补上缺失的关轮判据（属 [08](../decision/08-pi-round-boundaries.md)）。
6. **不得用父完成推定子提交。** §2.3：`async-complete`/`process-terminal`/`child-status` 与 model-cost 的提交无次序证据；这条限制必须原样保留到任何验收场景里。
7. **非持久 UI 读数可以顺带更新，计费/关轮事实不可省。** 允许顺带更新的现成先例与对象：`SessionActivityRegistry`（由 Round 边移动，`presentation/session-activity.ts`）、`SessionContextRegistry`（`harnesses/omp.ts:192-210`）、season/边界等待（`harnesses/omp/boundary-timer.ts` 头注）、balance/quota TTL（`runtime.ts:237-261`）。**不可省的是** Round 身份与开闭、Turn 身份与请求锚价、消费/金额累计与 `saveVersion` —— 这些不能由 UI 读数或刷新推导。
8. **订阅寿命必须与实例寿命同源。** `view.subscribe` 返回 release（`:984-989`），widget 在 detach 释放（`harnesses/omp/widget.ts:1038-1050`）；pi 适配器 `keepSubscription` 收集的 release 只在绑定成功时保留（`framework/adapters/pi.ts:238-249`：绑定失败则逐个 release）。刷新订阅必须挂同一寿命，不得留下无人释放的订阅。

### 3.3 不许的降级（与 §3.2 同源，逐条可检验）

- 不许把"事件驱动刷新"写成关轮判据（关轮属 08 票）。
- 不许在缺 Round 边界时把子会话消费记零或略过。
- 不许用父完成 / 进程退出 / child-status 推定子已提交。
- 不许以新增 timer / `fs.watch` / retry 轮询 `consumption.json` 或 RPC 代替事件。
- 不许把"刷新后展示正常"当作账目完整的证据（文件才是权威；本实例的读是投影）。

---

## 4. 限制与未验证清单

1. **pi 侧整体未运行**：`framework/adapters/pi.ts:200-203` 明确拒绝 round/Turn/subagent-runtime/user-input 观察；pi 上的根侧框架交付、Round 边界、子扩展加载与"每进程一实例"装配均未实现/未验证（[07](../decision/07-nicobailon-runtime-validation.md) 的 F-LIFECYCLE-IMPL、F-ROUND-EDGE、O-FACTORY 行）。
2. **次序未验证**：nicobailon 根 bus 事件与子扩展保存之间的先后、重复、丢失，全部**未运行验证**；本文只给静态文档 + 07 已发布实测的间接事实。
3. **resume 的根 bus 事件**未逐项列证（07 只证了新 run/新进程 + 复用同一 session id/file）。
4. **写入者数量未验**：真实 pi 装配下"同一 actual session 是否可能同时有两个进程写同一记录"未验证；§1.3 的版本链只在"单写者"前提下自然成立。
5. **跨进程同一文件的键**：`storageDir` 默认 `~/cost-archive` → `<user home>/.omp/cost-archive`（`config.yaml`、`storage-root.ts`），是**用户级绝对路径**，与项目/扩展安装目录无关 ⇒ 同机同用户的根与子进程指向同一 `consumption.json`；但 `coordinationKey` 取"已存在父目录 realpath + 文件名"（`framework/modules/files.ts:273-294`），网络盘/云同步目录明确不在正确性范围内（模块头注）。
6. **`load()` 的 pause/fresh 后果是静态源码事实**，其在实际运行中的发生概率未测。
7. **07 的 cost 快照缺口**（少两个嵌套叶 + 一个定时 workflow 叶）是候选累计接口的范围问题，**不是**刷新接口的证据，不可反推刷新方案。
8. 未测：多 main / 根切换后存活子会话、崩溃恢复、跨平台、其他 provider 的响应边界。

## 5. 结论性质

- 本文只交付**固定 revision 的只读事实、次序限制与接口约束**；不批准目录/接口/接线/寿命设计，不批准私有 API 或 fork，不构成基线降级，不替代 08 票的 Round 决策与 04 票的用户确认。
- 可被源票直接引用的三条硬事实：
  1. `commit` 是现有唯一的"全文档采纳"路径，`load()` 是唯一无写采纳路径且带初始化语义（pause/fresh）；**没有**独立的只读采纳入口。
  2. `pi.events` **仅进程内**（`docs/observability.md:335`），根侧频道是父进程自读工件后的转发/hint；嵌套子会话不经根 bus。
  3. 没有任何已发布证据证明"nicobailon 根侧事件发生时，子扩展的 round_end 保存已落盘"；**顺序不明**必须保留，不得由父完成推定子提交。
