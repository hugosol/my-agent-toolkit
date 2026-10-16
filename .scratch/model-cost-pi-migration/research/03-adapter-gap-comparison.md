# OMP 子代理 adapter 基线与两个候选的缺口语境对照：tintinweb vs nicobailon

日期：2026-10-16。作者：AdapterGapComparison（研究子任务）。
用途：为 [选择 pi 子代理扩展及缺口处理路线](../decision/03-subagent-provider-choice.md) 提供逐轴事实对照。**本文件不选择提供方、不批准 fork/上游路线、不编辑 ticket/map/lighthouse、不降低能力基线、不宣称运行通过。**

## 0. 口径与证据等级

- **固定工件**：
  - `TW` = tintinweb `@tintinweb/pi-subagents@0.22.0` @ `85a704cb`，本地 `.../research/candidates/_cand/tintinweb-pi-subagents`。
  - `NB` = nicobailon `pi-subagents@0.78.0` @ `a4c8ced`，本地 `E:/Developer/myhub/wt/_cand/git-nicobailon`。
  - `PI` = `E:/Developer/myhub/pi` @ `4a5d3729…`（`@earendil-works/pi-coding-agent@1.2.0`）。
  - 基线行语义与 model-cost 消费标注见 [OMP 能力基线报告](E:/Developer/myhub/wt/omp-capability-baseline/.scratch/model-cost-pi-migration/research/omp-subagent-capability-baseline.md)（`F-*`/`O-*`/`N-*`/`M-*`/`P-*`/`G-*`）与 [已发布对照](02-candidate-comparison-corrected.md)、[逐候选复核](02-primary-candidates-correction.md)。
- **证据等级**：本文件新增部分全部是**固定 revision 源码/文档阅读**（本次逐行复核，见各行引用）。候选运行事实仅来自 [ticket 06 真实运行报告](./06-runtime-validation/report-live.md)（仅 tintinweb，Windows + pi 1.2.0，隔离 `--no-extensions`）。nicobailon **无任何运行证据**。凡推断以 `[INFERENCE]` 标注。
- **一条会话内协作证据（未落盘，降级引用）**：Main 本次以零 provider 的 pi SDK `SessionManager.inMemory` 实验观察到：inMemory 子会话拿得到**真实且互异的 sessionId**，但**无文件，且不写 parent 引用**（header 仍在，仅 parent/file 缺失）。此结论与源码一致（`PI core/session-manager.ts:1156,1505`；`TW src/agent-runner.ts:1074`），但**无持久化证据文件**，仅供本文件标注为观察、不替代运行票。

### 0.1 关键概念：两条“自观察”填充路径

用户批准的路线是 **model-cost 自带扩展观察自身会话的原生 pi 事实**（用 pi JSON 持久化兜底），而非通用观察包。据此，每个轴要问的是候选**是否让我们的扩展在正确的会话里活起来**：

- **路径 A（子会话内激活自身扩展）**：候选在子会话里加载并 bind 我们的扩展 → 我们在子会话内直接收到 pi 原生事件（`before_provider_request`/`after_provider_response`/`input`/`message_end`/`agent_settled`/`session_start` + `ctx.model`/`ctx.thinkingLevel`/`ctx.sessionManager`）。
- **路径 B（根侧读子会话持久化 / 工具结果）**：根激活读子会话的 pi session JSONL（逐请求 usage/model/时间戳 + header `parentSession`），或从子代理工具结果 `details` 取身份/artifact。

**二者都未在本项目被证明**；本文件只判断“原生事实是否可达”。**注意**：路径 A 让我们的扩展在子会话里醒来，但 pi **没有**“我是子代理”的原生标记（`PI types.ts:325-364` 无 agent/kind），所以子会话内自我识别只能靠候选写入的 header/env——这是贯穿多轴的前提缺口（见 §4 P1）。

---

## 1. tintinweb `@tintinweb/pi-subagents@0.22.0`

**架构**：子会话是**同进程内** `createAgentSession`（`TW src/agent-runner.ts:1106`），自带独立 `DefaultResourceLoader`（`:826-860`），随后 `session.bindExtensions({onError})`（`:1117-1127`，在 `session.prompt` 之前）。公开总线是 `pi.events` 的版本化 RPC v2（`ping/spawn/stop/consume`）+ 11 个生命周期频道 + 进程级 manager registry。

| 轴（基线行） | 提供方执行能力 | 直接公开观察（第三方可达） | 自观察可填充（原生事实） | 残余缺口 / config 约束 / 未验证 |
| --- | --- | --- | --- | --- |
| **身份 / 直接父 / Owner**（F-SESSION-FACTS、F-OWNER、O-SESSION-FACTS） | spawn 返回 id；resume 复用同一 id；嵌套子代理**不产生独立 session 文件**（运行证实，report-live F-SESSION-FACTS） | 终态/`started`/`created` 载荷 = `{id,type,description[,status,usage,tokens,durationMs,toolUses]}`，**无 sessionId/parentSessionId/sessionFile/model/effort**（`TW src/index.ts:535-567,630-634`；报告 §2.2） | **路径 B 部分**：非嵌套子会话默认 `persistSession=rememberAgents` → `SessionManager.create(...,{parentSession: ctx.sessionManager?.getSessionFile?.()})`，子会话 header 记直接父的 **sessionFile 路径**（`TW src/agent-runner.ts:1059-1074`）；根可经私有 `record.sessionFile` 读转录 | 事件层**无身份**；Owner 无字段；**嵌套默认 `inMemory`**（`:1059` `options.nested ? false`）→ 无文件，header 也不引用父（parent 缺失，与 Main 的 inMemory 观察一致）；registry `getRecord` 仅对已知顶层 id 有效（`docs/rpc.md:141-155`） |
| **生命周期（含嵌套 / workflow）** | `created/started/completed|failed/steered/compacted` 顶层成立；**嵌套子代理在默认配置下零顶层事件、无独立 session 文件、工具结果不含其 id**（report-live 嵌套；`persist_session: true` 时嵌套可落文件，但公开顶层频道仍不发布其身份/事件）；**workflow 子代理运行期零 `subagents:*` 事件**（report-live workflow） | 生命周期边存在；`stop` 对 owned 记录抛 `Agent is owned by another agent or workflow`；`consume` 只查 `parentAgentId` 不查 `workflowId`（`TW src/index.ts:576-586,620-645,826-842`） | 路径 A 可补：我们的扩展若在子会话激活，可自行观察该子会话的 `session_start`/`agent_settled`；但嵌套子会话默认无文件、无顶层身份，仍是“看得见自己、看不见兄弟” | 嵌套是否激活我们的扩展需 `--no-extensions` 之外的真实重激活验证（ticket 06 明确**未覆盖** `F-LIFECYCLE-IMPL`）；workflow 子代理身份/用量公开面缺失（运行证实） |
| **启动证明 + 有效 provider/model/effort**（F-STARTUP、G-STARTUP） | 事件不含 model/effort；`invocation` 是内部字段且注释自陈“UI-only”（报告 §2.2） | `created`/`started` 只有 id/type/description；resume 与首次 spawn 事件形状相同（report-live） | **路径 A 可填**：子会话内 `session_start.reason ∈ {startup,reload,new,resume,fork}`（`PI types.ts:756-760`）+ `ctx.model`/`pi.getThinkingLevel()`（`PI types.ts:336-346`） | `F-STARTUP` 的“begins-here”**不能只看 reason**：还要求该会话自身 branch 尚无 user/assistant 消息（`F-STARTUP`）；reason 只是一个输入。且须子会话内激活且能识别子身份；顶层公开总线仍无 model/effort |
| **请求边界 / provider / model / usage / errors**（F-TURN、O-TURN-*） | 逐 assistant 消息 usage 只存在于**被 spawn 代理自己的 session 转录**；取消运行 `usage/tokens=null`（report-live F-TURN） | 公开总线**无逐请求事件**；终态是**累计** `usage`（含 `cacheRead` 与 provider 计价 `cost.total`）；`durationMs` 是本次运行区间 | **路径 A 强**：我们在子会话内可直接用 `before_provider_request`/`after_provider_response{status,headers}`/`message_end`（`PI types.ts:900-904,916-921`）逐请求取 provider/model/usage/HTTP；**路径 B 兜底**：子会话 JSONL 有逐 assistant usage（report-live §第二轮“逐请求”） | 根侧 `before_provider_request` 计数为 **0**（子会话各自激活、父侧看不到，report-live 关键运行事实 5）——**这正是路径 A 的动因**；tintinweb 的 `spawn` 会**覆写** `onAssistantUsage/onTurnEnd`（报告 §2.2），故“旁接回调”不可行，只能靠自身扩展在子会话激活 |
| **Round settle / 后台 / 自动继续**（F-ROUND-EDGE、O-ROUND-MAP） | 活动边有 `created`/`started`/终态；完成通知以 `custom_message` 进父会话并可**实测触发新的父轮次（自动继续）**（report-live） | 无 run-cycle 开闭边；无 `getAsyncJobSnapshot` 等价 quiescence 判据（报告 §3） | **路径 A 可填**：pi `agent_settled{aborted}` 是“不会再自动重试/压缩/排队续跑”的强语义（`PI types.ts:1032-1037`），`isIdle()`/`hasPendingMessages()` 存在（`:347-348`） | framework 的 quiescence 还要求“无运行中异步 job”；pi **无** `getAsyncJobSnapshot`（`G-ROUND`），但“无该函数”不等于“无等价来源”，等价判据仍需 framework 侧调查/设计 |
| **每 execution runtime**（F-RUNTIME、O-RUNTIME-IDENTITY） | 终态 `durationMs` = 本次运行区间，由**拥有会话的执行器自测**，resume 重置 `startedAt` 但不重置 `lifetimeUsage`（报告 §2.2；report-live F-RUNTIME） | 顶层终态有 `durationMs`；**无 running 期读数**；取消运行 `usage/tokens=null`（report-live） | 部分：`durationMs` 是合格原生测量；但**事件不带 session 归因**，需靠 registry/私有 `sessionFile` 补 | 归因与 running 读数缺失；`usage`（累计）与 `durationMs`（单次）同载荷**语义混装**，引用不得互推（复核 §5 第 9 条） |
| **resume identity**（N-KEEPALIVE、F-LIFECYCLE-IMPL 输入） | 模型面 `Agent(resume=<id>)` 可续跑，**同一 id 重发 `created`+`started`**；对运行中代理 resume 被拒（report-live 第二轮） | **公开总线/registry 无 resume**（`ping/spawn/stop/consume`；`docs/rpc.md:137-140,175-180`） | 路径 B：resume 复用同一 sessionFile（`SessionManager.open`）→ 跨 execution 保持同一 sessionId | 第三方无法经公开面发起 resume；identity 延续只能从 sessionFile 复用间接判断 |
| **输入归因**（F-INPUT、G-INPUT） | steer 走模型面工具 / 用户 `@handle` mention；事件仅 `steered{id,message}`（报告 §3） | 无对外“用户源”事实；内部 `pi.on("input")` 过滤 `event.source==="extension"`（报告 §3） | **路径 A 可填**：子会话/根会话内 `input{source:'interactive'|'rpc'|'extension'}`（`PI types.ts:1170-1186`）——但注意子会话的 prompt 来自父（`extension` 源），本就不是“用户输入” | “宿主归因为用户”仍需 framework 规则；steer/mention 输入路径 ticket 06 **未执行**，未验证 |
| **Viewed 席位**（F-VIEWED、G-VIEWED、M-HOST-VIEWED） | 有会话查看器/FleetView/`/agents` UI，但 `src/ui/` **零 emit**，查看目标只是组件 state（复核 §2.2） | 无“当前查看会话”的公开 read/subscribe；`get_commands` 仅 `agents`；UI 仅 `setStatus`/`setWidget`（report-live 查看席位） | **不可填**：pi 无 `getViewedSession`/`subscribeViewedSessionChanged` 或等价事实（`PI types.ts` grep 无命中，`P-NO-VIEWED`） | 席位出口在本宿主**事实源不存在**；model-cost widget 直连 `ctx.getViewedSession?.()`（`M-HOST-VIEWED`，本就在 OMP 侧是补丁门控）→ 属宿主/框架缺口，非候选缺口 |
| **State 继承 / 实例寿命**（F-STATE-INHERIT、F-LIFECYCLE-IMPL、F-CAPABILITY） | 子会话 `bindExtensions` 会**重新激活本扩展**，候选用 registry claim-once 处理**自身**（`TW src/index.ts:657-666`；`docs/rpc.md:141-155` #128） | 无面向消费方的寿命契约；`session_shutdown` 后 registry 置 null（report-live） | 路径 A 部分：子会话内可读 `ctx.sessionManager.getSessionId()/getSessionFile()/getHeader()`（`PI core/session-manager.ts:1156,1505`），header 含 `parentSession`（`:49,54`） | **子会话是否激活我们的扩展**取决于 child loader 是否发现它（见 §2/§3 约束）；F-LIFECYCLE-IMPL ticket 06 **未覆盖** |

**tintinweb 自观察加载条件（源码）**：子会话 loader 用 `new DefaultResourceLoader({cwd: configCwd, agentDir, noExtensions, additionalExtensionPaths, extensionsOverride,…})`（`TW src/agent-runner.ts:826-860`）。`extensions` 解析：`inheritField` **默认 `true`**（未写 `extensions:` → 全部默认发现的扩展），`false`/`isolated`→`noExtensions`，`string[]`→名字/路径 allowlist（`TW src/custom-agents.ts:410-418`；`src/agent-runner.ts:772-802`）。故：**若 model-cost 作为 agentDir/项目下的正常扩展被发现，在 tintinweb 子会话里默认会加载并 bind（路径 A 默认成立）**；若仅在根以 `-e` 临时挂载、未落到 agentDir，则子会话 loader **发现不到**（`additionalExtensionPaths` 只来自 agent frontmatter，`src/agent-runner.ts:786`）。`[INFERENCE]` 基于 pi 扩展发现机制与 TW loader 构造；未运行验证。

---

## 2. nicobailon `pi-subagents@0.78.0`

**架构**：前台子会话在**父进程内**、后台子会话在**独立 runner 进程内**，均为 `pi AgentSession`（`NB src/runs/shared/child-session.ts:1-8` “foreground children… the parent pi process… background children… the detached runner process”）。child loader：`new pi.DefaultResourceLoader({…, noExtensions: !launch.ambientExtensions, additionalExtensionPaths: launch.extensionPaths …})`（`NB src/runs/shared/child-session.ts:455-471`）。公开面：版本化 RPC v1（9 方法含 `resume`/`cost`，`NB src/extension/rpc.ts:31-37`）、10 个 `pi.events` 频道、3 个 `Symbol.for` 进程级注册表、落盘 artifact、以及**显式面向合作子扩展的契约**。

### 2.1 关键前提：`PI_SUBAGENT_CHILD` 守卫只屏蔽它自己，不屏蔽我们

- `NB index.ts:5-12`：`PI_SUBAGENT_CHILD==="1" ? undefined : import("./src/extension/index.ts")` —— 该守卫使 **nicobailon 自己的** entry 在子进程 `registerExtension=undefined`；`NB src/runs/background/subagent-runner.ts:170` 在 runner 进程置 `PI_SUBAGENT_CHILD=1`；`NB src/extension/index.ts:280` 在子进程直接 `return`。**它不阻止其它扩展**。
- 我们的扩展是否进子会话由 child 扩展加载逻辑决定（下）。

### 2.2 子会话扩展加载（决定路径 A）

| 形态 | host | `ambientExtensions` | 载入的扩展 | 依据 |
| --- | --- | --- | --- | --- |
| **前台子**（in-parent） | `parent` | **false** | 仅 `extensionPaths`（来自 agent `extensions:` 路径）+ `requiredExtensions` + 内联 hooks | `NB src/runs/shared/child-launch.ts:316`；`child-session.ts:459,466` |
| **后台子**（runner 进程） | `runner` | **true**（除非 `disableAmbientExtensions`） | 环境发现（agentDir/项目/settings）**+** 同上 | `NB src/runs/shared/child-launch.ts:316`；`child-session.ts:448-466` |

- `disableAmbientExtensions = capabilityCeiling.denyExtensions || input.extensions !== undefined`（`NB src/runs/shared/child-tool-plan.ts:414-416`）。
- `extensionArgs = [ ...runtimeExtensions, ...configuredExtensions ]`（禁环境时）或 `[ ...runtimeExtensions, ...toolExtensionPaths, ...subagentOnlyExtensions ]`，**再并上 `requiredExtensions` 路径，最终优先且不可被 agent 覆盖**（`child-tool-plan.ts:427-444`）。
- **`registerRequiredChildExtensions` 是公开导出**（`NB src/api/required-child-extensions.ts` → `shared/required-child-extensions.ts:61,86`，`Symbol.for("pi-subagents.required-child-extensions.v1")`）→ **第三方可把 model-cost 注册为“所有 runner 必需子扩展”**，从而在前后台子会话都 fail-closed 加载（`requireForAllRunners`）。这是本候选**最明确的路径 A 接线点**。**窄口径实现证据（会话内协作，未落盘）**：Main 以零 provider node smoke 导入 `NB src/api/required-child-extensions.ts`，注册 `sessionId=wayfinder03-zero-provider-smoke` 并置 `requireForAllRunners=true`，snapshot 返回规范绝对路径/id/flag，native Pi 被 admit，非 native runnerType 以 “requires local native Pi” 拒绝，dispose 后 resolve 长度为 0。**该证据只证注册/admission/disposal 的实现可运行，不证真实子加载、model-cost 装载或跨进程传输**。
- 合作子扩展的公开握手：子会话里 `pi.events.emit("subagent:acknowledge-extension",{id})`，宿主进程捕获并计入 `runtimeAcknowledgedExtensions`（`NB docs/observability.md:244`；status 字段 `:236`）。`PI_SUBAGENT_EXTENSION_BINDINGS` 是带 `/<version>` 命名空间校验的 JSON env，专供外部子扩展读取（`NB src/runs/shared/extension-bindings.ts:1,71`；`child-launch.ts:168`）。
- `[INFERENCE]`：因此 model-cost 可在**后台子**里靠 ambient 被发现（若装在 agentDir），或在**前后台子**里靠 `extensions:`/`requiredExtensions` 显式加载；**前台子不能靠 ambient**（与 tintinweb 默认相反）。

| 轴（基线行） | 提供方执行能力 | 直接公开观察（第三方可达） | 自观察可填充（原生事实） | 残余缺口 / config 约束 / 未验证 |
| --- | --- | --- | --- | --- |
| **身份 / 直接父 / Owner** | 前台/后台子会话均持有 `sessionFile`/`sessionId`（`NB child-session.ts:116-120`）；`context:"fork"` 是真 fork（`docs/observability.md:309`） | 前台完成事件带 `sessionId`+`sessionFile`（`NB src/runs/foreground/subagent-executor.ts:925-951`）；后台 `status.json`/result 带 `runId/sessionId/sessionFile/outputFile/model`（`docs/observability.md:236`）；`subagent:child-status` v1 带 `runId/childId/status/stepIndex/agent/childRunId/workflowKey/…`（`NB src/shared/types.ts:2446-2463`） | **路径 B 强（有文档契约）**：子会话 header 记发起会话的**文件**为 `parentSession`，**嵌套子指向直接父**；`{runId}_{agent}_meta.json` 另记 `parentSessionId`（`NB docs/observability.md:311`）。子扩展内亦可读 `ctx.sessionManager.getHeader().parentSession`（`PI core/session-manager.ts:1505`） | Owner 无单字段；nesting 的 owner 链需沿 header/meta 上溯；后台子跨进程，根侧须读 artifact 或经子扩展回传 |
| **生命周期（含嵌套 / workflow）** | 后台 step 边 `subagent.step.started → completed|failed|paused|stopped`（每子执行 open/close，`NB src/runs/background/subagent-runner.ts:3820,3868`）；`subagent.run.*`；**嵌套 fanout 出现在父 status 树**（`docs/observability.md:110` “nested runs appear under that parent child…instead of being hidden”） | run/step 频道 + `status.json`/`events.jsonl` artifact（`docs/observability.md:207,252`）；NB 自身有 `subagent` 工具的 `workflow` mode（`NB src/extension/index.ts:8,666,688`）；workflow child 的 run 级记录属另一候选 `@quintinshaw/pi-dynamic-workflows`（report §2.4），**非 NB 工件**） | 路径 A 可补：子扩展在子会话内观察自身生命周期 | **前台**活动边只有 created/started/终态，**无 step 边**（报告 §3）；quiescence 的等价来源未定（见 Round settle 行与 §4 P6）；NB **无运行证据** |
| **启动证明 + 有效 provider/model/effort** | 落盘 `status/result` 带 `model`/`requestedModel` 与 `launchContractDigest`（报告 §2.1、`docs/observability.md:236`） | 有 resolved model（artifact）；thinking level 未在公开事件 echo | 路径 A 可填 `session_start{reason}` + `ctx.model`/`getThinkingLevel()`（同 §1） | **无 first-start vs resume 判别**（报告 §3，标 `证据不足`）；`session_start.reason` 亦只是输入，`F-STARTUP` 还需 branch 为空；thinking level 公开面未证实 |
| **请求边界 / provider / model / usage / errors** | 后台 step 有 `durationMs`；usage 是 child/step 聚合（`Usage{input,output,cacheRead,cacheWrite,cost,turns}`，报告 §2.1） | RPC `cost` 方法；`subagent:child-status`；artifact `events.jsonl` 含“child Pi JSON events annotated with run and step metadata”（`docs/observability.md:252`）；**扩展可观察 `tool_result` 事件读取 run/artifact 身份**（`docs/observability.md` §Async run artifacts） | **路径 A 强 + 路径 B 强**：子扩展内直接拿逐请求 pi 事件；或根侧读子会话 JSONL（`sessionFile`/`outputFile` 在 status 字段） | 逐请求边界**无公开事件**（同 tintinweb）：属需桥接，或作为**未决缺口**保留；通用 `unavailable` 不是已批准豁免（仅 runtime 轴经用户批准）；`events.jsonl` 是 wrapper+child JSON 注释，是否等于可靠逐请求读数**未运行验证** |
| **Round settle / 后台 / 自动继续** | 后台运行/暂停/停止/超时日志语义丰富（`subagent.run.paused/stopped/timed_out`，报告 §2.1）；自动继续通知（异步完成 → `subagent:async-complete`，`docs/observability.md` §Completion notifications） | run/step 边 + 通知频道 | 路径 A：`agent_settled`/`isIdle`/`hasPendingMessages`（同 §1） | pi 无 `getAsyncJobSnapshot`；NB 有公开 `./background-work`（v1 注册表，`snapshotBackgroundWork(sessionId)`→`{providers,items}`、`listBackgroundWorkWakeChannels`、`registerBackgroundWorkProvider`，`NB src/api/background-work.ts:1-2,129,141,163`）可作 quiescence 的**可能输入**，但它是**外部 provider 登记面**、非 NB 自身运行子作业的公开快照，**未证明与 `getAsyncJobSnapshot` 等价** |
| **每 execution runtime** | **后台 step** 区间由拥有会话的 runner 自测，事件带 `runId/stepIndex/childId`（报告 §2.1；`NB subagent-runner.ts:3870` 的 `durationMs`） | 后台 step 事件有 `durationMs`；status 有 `startedAt/endedAt/durationMs`（`docs/observability.md:236`） | 路径 A/B 可补归因（子会话内 self-measure 或读 artifact） | **前台完成事件无 `durationMs`**（`NB subagent-executor.ts:925-951` 已核实）；**无 running 读数**；前台 per-execution 公开来源**未在 bus 上确认**（报告 §6 标证据不足） |
| **resume identity** | RPC **有** `resume`（`NB src/extension/rpc.ts:31-37`）；`resumeSessionFile` → `SessionManager.open` 复用同一会话（报告 §2.1） | RPC `resume` + `cost` 是它相对 tintinweb/gotgenes 的实质差异 | 路径 B：resume 复用 sessionFile → 同一 sessionId | resume 的 execution 分界/归因需逐路径核验（未运行） |
| **输入归因** | `steer` 回执 `deliveryStatus: delivered|queued` + `subagent.steer.*` 落盘（报告 §3） | 落盘投递事实；`steer` RPC | 路径 A：子/根会话内 `input{source}`（同 §1） | “用户源归因”仍 `证据不足`（回执只证投递）；同 §1 caveat |
| **Viewed 席位** | 无 | 无“当前查看会话”公开 read/subscribe | **不可填**（同 §1，pi 无该事实源） | 属宿主/框架缺口，非候选缺口 |
| **State 继承 / 实例寿命** | 前台子共享父进程、后台子独立进程；`PI_SUBAGENT_CHILD=1` 使**本扩展**在后台子惰性（`NB index.ts:5-12`；`child-runtime-config.ts:13-17`）；`NB src/extension/index.ts:907` 在非子进程删除 `PI_SUBAGENT_PARENT_SESSION`（避免进程级父身份误用） | 无面向消费方的寿命契约；`session_shutdown` 生命周期由宿主驱逐（`child-session.ts` `shutdownSession`） | 路径 A 可读 `ctx.sessionManager` + header；子扩展可经 `subagent:acknowledge-extension` 握手 | **前台子为 in-parent**：若加载我们的扩展，需自行避免根专用行为（widget/initialize/state）——子身份识别仍靠 header/env（见 §4 P1）；F-LIFECYCLE-IMPL 对 NB **未验证** |

**nicobailon 路径 A 结论**：后台子可用 ambient 发现（若装 agentDir）；前台子**不能**，只能靠 agent `extensions:` 路径或 `registerRequiredChildExtensions`。相对 tintinweb（子默认加载全部已发现扩展），NB 的前台子需要**显式登记**才能让我们的扩展观察。

---

## 3. 逐轴差异要点（只列会改变接线方式的）

1. **子扩展默认加载**：TW 子会话 `extensions` 默认 `true` → 已发现的 model-cost **默认进子**；NB 前台子 `ambientExtensions=false` → **默认不进**，需 `extensions:` 路径或 `requiredExtensions`。这是两者**最大的路径 A 接线差异**。
2. **子会话进程位置**：TW 子 = 同进程；NB 前台子 = 同进程、后台子 = 独立 runner 进程。跨进程形态下路径 A 的“回传”需要 artifact/文件（NB 有 `status.json`/`events.jsonl`/meta）或 `PI_SUBAGENT_EXTENSION_BINDINGS` env。
3. **直接父的原生事实**：两者都把发起会话的**文件**写进子会话 header `parentSession`（TW `src/agent-runner.ts:1072`；NB `docs/observability.md:311`）；NB **另有** `parentSessionId` 落 meta，且文档明确“嵌套子指向直接父”。TW **嵌套默认 inMemory → 无文件，header 的 parent 引用缺失**。→ 直接父链在 NB 更可得，但都**不是**公开事件字段。
4. **嵌套/workflow 可见性**：TW 在**当前公开顶层频道、默认配置**下不发布嵌套身份（零顶层事件、无独立文件、工具结果无 id，运行证实；`persist_session` 可落文件但公开频道仍不发身份）；NB **status 树合并展示嵌套**、有 run/step 边与 artifact。→ **嵌套是用户的必需项（非加分）**，**workflow/scheduling 才是加分项**；二者观察成本各自条件化（见 §5），不作全局高低结论。
5. **逐请求事实**：两者公开面都**没有**；都要靠“我们的扩展在子会话内自观察”（路径 A）或读子会话 JSONL（路径 B）。TW 的 `spawn` 覆写回调使旁接不可行，进一步指向路径 A。
6. **resume 公开性**：NB RPC 有 `resume`/`cost`；TW 无（仅模型面）。对“第三方续跑”需求差异实质。
7. **Workflow**：TW workflow 子代理零事件（运行证实）；NB 有 workflow mode 与 workflow child 记录（源码，未运行）。**workflow/scheduling 的观察成本应在选型时单列**（本文件 §5）。

---

## 4. 关键未决前提（critical unresolved prerequisites）

- **P1（最高）——子会话自我识别**：pi 无“我是子代理/我的直接父”原生标记；我们的扩展在子会话内醒来时，只能靠 (a) 子会话 header `parentSession`（存在时）、或 (b) 候选 env（NB `PI_SUBAGENT_CHILD`/`PI_SUBAGENT_PARENT_SESSION`，仅后台 runner）。**若子会话 inMemory 且无 env，则路径 A 拿不到父链，也难判定“非根”**（TW 嵌套默认即如此；Main 的 inMemory 观察佐证：有 id、无 file、无 parent）。这是自观察路线能否成立的**前置事实**，未验证。
- **P2——子会话持久化是否开启**：路径 B 依赖子会话落盘。TW 顶层默认持久化、**嵌套默认 inMemory**；NB 前台子 `sessionEnabled = Boolean(sessionFile||sessionDir)||shareEnabled`（`NB src/runs/foreground/execution.ts:1763`），后台子可 file/dir/memory。若用户接受嵌套持久化，路径 B 才通。
- **P3——安装位置**：路径 A/B 都要求我们的扩展被发现。根以 `-e` 临时挂载**不会**传播到子 loader（TW child loader 只从 agentDir/项目发现；NB runner 进程独立发现）。必须确认“model-cost 作为常规扩展安装”而非仅 CLI `-e`。
- **P4——路径 A 与 F-LIFECYCLE-IMPL 冲突**：子会话激活我们的扩展后，须避免 initialize/widget/state 等根专用行为；框架语义是“subagent binding 从不 initialize”。判定依赖 P1。
- **P5——Viewed 席位无解于候选**：`F-VIEWED`/`M-HOST-VIEWED` 在本宿主**事实源不存在**，两候选都无出口（运行证实 TW）。这是**宿主/框架缺口**，不应记作候选缺口或“必须改上游”。
- **P6——quiescence（保持开放）**：`F-ROUND-EDGE` 需要“无运行中异步 job”，pi 无 `getAsyncJobSnapshot`（`G-ROUND`）。这**不证明没有等价来源**：NB 有公开 `./background-work`（`snapshotBackgroundWork(sessionId)`/`listBackgroundWorkWakeChannels`/`registerBackgroundWorkProvider`）可能作为输入，`agent_settled`/`isIdle`/`hasPendingMessages` 也是候选输入；是否足以构成等价判据**未定，属 framework 侧待调查输入**。
- **P7——nicobailon 零运行证据**：NB 全部结论为静态；ticket 06 只验证了 TW。任何 NB 路线在选型前需独立隔离验证。

---

## 5. 相对集成复杂度小结（无数字评分）

**先分清缺口性质（避免把所有“第三方缺事件”等同）：**

| 缺口性质 | 例子 | 谁来解 |
| --- | --- | --- |
| 候选公开面缺，但**候选原生已具备、可补出口** | 事件缺 session/owner 身份；嵌套可见性（TW）；前台 duration（NB） | 候选/上游贡献或适配层归一；**读私有字段/artifact 不是自动获批路径**，仅证明事实存在位置，需选型时单独决定 |
| **pi 事实源不存在**（等价来源未定者保持开放） | Viewed 席位（确无出口）；pi 原生无 `getAsyncJobSnapshot`；子代理身份/父在 pi 原生层 | 框架 adapter / 宿主出口；**除 runtime 轴外，通用 `unavailable` 不是用户已批准的豁免**；非候选责任，但等价来源须逐项调查 |
| **config/安装前提** | 子 loader 发现 model-cost；嵌套持久化开启 | 部署与 agent frontmatter 配置，非代码 fork |
| **未验证** | 子会话重激活、路径 A 回传、NB 一切 | 需真实运行票 |

**tintinweb（条件化）**：路径 A 的**接线条件**是其子 loader 默认加载已发现扩展（`extensions` 默认 `true`），故若 model-cost 常规安装，它可在子会话内直接观察 pi 原生请求/usage/settle/input。**嵌套/workflow/owner/取消费用**在公开顶层频道缺失（运行已证），但**路径 A 本身也可能补**——只要子会话内激活且能经 header/env 取到身份；否则才需路径 B（子会话 JSONL；嵌套默认 inMemory，需 `persist_session`）。**不宜断言“必须走 B 或补上游”**；成本取决于 P1/P2/P3 是否成立。

**nicobailon（条件化）**：公开面**更广**（RPC 含 resume/cost、run/step 边、落盘 meta 含 `parentSessionId`、嵌套在 status 树可见、有面向合作子扩展的 `acknowledge-extension` 与 `requiredExtensions`/`background-work` 公开服务），路径 B 事实较全。**路径 A 对前台子默认关闭**，需把 model-cost 显式登记为子扩展（`extensions:` 路径或 `registerRequiredChildExtensions`）——这本身是**一处小配置/登记**，不比 TW 的子扩展配置/登记天然更复杂。**真正的增量复杂度是后台子跨进程**：回传需 artifact/文件或 env。**零运行证据**；成熟度判断不可依赖 commit/星标。

**共同**：逐请求事实与 Round quiescence 两点在两候选公开面上都不完整，**但可达路径未定**——路径 A 自观察、NB `background-work`/`agent_settled` 等输入都只是候选，需选型后确认；Viewed 席位则属宿主/框架事实缺口（候选无出口）。

---

## 6. 未验证 / 未运行清单（不得当通过）

- 本文件新增结论全部为**固定 revision 源码/文档阅读**；无安装、无加载、无 RPC 往返、无真实 provider。
- **nicobailon**：无任何运行证据（子会话扩展发现、跨进程回传、resume、workflow、`acknowledge-extension` 时序均未观测）。
- **tintinweb**：仅 ticket 06 的运行事实（隔离 `--no-extensions`，**未测子会话重激活**）；steer/mention 输入路径、强制 error 终态、取消运行费用读数、跨平台均未覆盖（report-live）。
- **路径 A/B 本身**：model-cost 自带扩展在子会话内激活并回传/读持久化，**未在本项目验证**；不得把本文的“可填充”读成“已验证可行”。
- **pi inMemory 观察**：来自会话内协作、未落盘，降级引用。
- **Viewed / 子代理身份**：pi 原生缺失，属框架/宿主前沿，未解；**quiescence** 的等价来源未定（NB `background-work` 是否可用属开放问题）。

## 7. 结论性质

本文件只交付**固定 revision 的逐轴事实对照与集成复杂度定性判断**；不选提供方，不批准 fork/上游/私有依赖路线，不构成基线降级，不编辑 ticket/map/lighthouse，不替代 ticket 03/04/05 与独立隔离验证。所有 `[INFERENCE]` 与未运行项必须随选型讨论保留。
