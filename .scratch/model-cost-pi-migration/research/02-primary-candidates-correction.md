# 主候选公开事实复核与勘误：nicobailon / tintinweb / gotgenes / workflow

Ticket: [decision/02-pi-subagent-candidates.md](../decision/02-pi-subagent-candidates.md)（status: claimed；本文件为覆盖分类修订稿，不是发布产物）
输入：`research/candidates/pi-subagents.md`、`research/candidates/tintinweb-gotgenes-workflows.md`、`research/02-pi-subagent-candidates-report.md`（旧报告，均为证据快照，不再单独作为发布结论）
对照基线：`decision/01-capability-baseline.md` 与 `lighthouse/01-capability-baseline.md` 的 `F-*` 行语义

## 0. 方法与证据口径

- 本文件**只做事实复核与勘误**：不批准任何提供方，不批准 fork 或上游贡献路线，不改 ticket/map/lighthouse，不安装、不调用模型、不运行 build/lint/test/formatter。
- **静态证据 ≠ 运行通过**。以下全部结论来自固定 revision 的源码/公开文档/tarball/npm registry 快照阅读，**没有**任何安装、加载、RPC 往返、真实子代理或 provider 调用。运行时行为（事件时序、RPC 是否可达、耗时是否准确、跨进程是否成立）一律未验证，逐项标 `未运行验证`。
- 覆盖判据按 ticket 要求分层：**[公开契约]** = 第三方扩展无需读内部字段即可取得，且有 exports 入口或版本化协议/类型/文档；**[模型工具输出]** = 事实只经模型可见的 tool result 到达；**[私有实现]** = 源码可见的内部字段/内部回调/无类型无版本的全局槽；**[宿主原生]** = pi 自身提供（非候选）。
- 分类词：`已证实覆盖(公开)`／`可经适配`／`需修改提供方`／`未覆盖`／`证据不足`。分类针对**该候选能否给出基线行所需的原生事实**，不要求候选输出 framework 的最终语义（Turn 身份、Round 开闭合成、请求锚价由 framework/shared-logic 负责）。

### 0.1 固定 revision 与本地源码路径（本轮实际读取）

| 候选 | 包 | 固定 revision / 版本 | 本地证据路径 | 形态 |
|---|---|---|---|---|
| nicobailon | `pi-subagents`（unscoped） | `a4c8ced69a8176cdf4179b127feddc8875e3418f` = `chore(release): v0.78.0`（2026-10-12） | `E:/Developer/myhub/wt/_cand/git-nicobailon` | **浅克隆，仅 1 个 commit**（`.git/shallow` 存在）→ 无历史 |
| tintinweb | `@tintinweb/pi-subagents` | `85a704cb8f35c96c0cabfa665b572bab296942e5` = tag `v0.22.0`（2026-10-13） | `.../pi-subagent-candidates/.scratch/model-cost-pi-migration/research/candidates/_cand/tintinweb-pi-subagents` | 浅克隆（`git rev-list --count HEAD` = 1） |
| gotgenes | `@gotgenes/pi-subagents` | `63476ff869efd8ea339040f496fa734048b89e70` = tag `pi-subagents-v23.4.0`（2026-10-09），monorepo `packages/pi-subagents` | `.../candidates/_cand/gotgenes-pi-packages` | 浅克隆（1 commit）；**clone 内无 `dist/`**（prepack 生成），发布产物见下 |
| gotgenes（发布产物） | 同上 | npm tarball 23.4.0 | `.../candidates/_tarball/gg/package` | 注册表工件；`dist/public.d.ts`（12,461 B）、`dist/settings.d.ts` 存在 |
| workflows | `@quintinshaw/pi-dynamic-workflows` | 3.14.0（npm `gitHead` 不可核对，见 §6） | `.../candidates/_tarball/wf/package` | 注册表 tarball；含 `src/`、`dist/`（110 项）、`extensions/`、`LICENSE` |
| 宿主 pi | `@earendil-works/pi-coding-agent` | `4a5d37291531ad48b8e536c892557877d219463c` / 1.2.0 | `E:/Developer/myhub/pi`（`packages/coding-agent/…`） | 完整检出 |

次级证据（本轮仅引用、未重抓）：`research/npm-metadata.json`、`research/pidev-package-pages.json`（2026-10-15 快照）。

---

## 1. 同名项目与血统（先消除混淆）

名称相同 ≠ 同一项目。三处独立证据把 `pi-subagents`（unscoped）钉在 nicobailon 名下，并证明 tintinweb 是**另一条独立血统**：

| 项目 | 身份证据 |
|---|---|
| `pi-subagents`（unscoped npm）→ `github.com/nicobailon/pi-subagents` | npm 快照 `repo=git+https://github.com/nicobailon/pi-subagents.git`、`homepage=…/nicobailon/pi-subagents#readme`；树内 `LICENSE:1-3` = `Copyright (c) 2026 Nico Bailon`；克隆 commit 作者 `Nico Bailon <nico.bailon@gmail.com>` |
| `@tintinweb/pi-subagents` → `github.com/tintinweb/pi-subagents` | npm 快照 repo/homepage 指向 tintinweb；树内 `LICENSE:1-3` = `Copyright (c) 2026 tintinweb`；`package.json` `author: "tintinweb"`；nicobailon 树内**无任何** tintinweb/gotgenes 引用（`README.md`/`LICENSE` grep 无命中） |
| `@gotgenes/pi-subagents` = **tintinweb 的 hard fork** | `README.md:9`、"now an independently maintained hard fork"（`:506`）、归属 `:514`（MIT — tintinweb upstream + Chris Lasher fork）；`LICENSE:1-3` `Copyright (c) 2026 tintinweb`；`docs/comparison-with-upstream.md:3` 明示 fork 自 tintinweb；`usage.ts` 头部注释与 tintinweb `src/usage.ts` 同源（issue #38 措辞一致） |
| 血统佐证（非本次候选） | `@esso0428/pi-subagents` README:5 "Fork of `@tintinweb/pi-subagents`"；`@rhinos0608/pi-subagents` `LICENSE:1-3` `Copyright (c) 2026 Nico Bailon` 且 README 热链 `nicobailon/pi-subagents` 文档 → 分别对应 tintinweb 系与 nicobailon 系 |

结论：**不得**把 tintinweb 的公开接口、事件频道或 README 声明套用到 nicobailon 的 `pi-subagents` 上（反之亦然）。两个项目连事件频道命名都不同（见 §2.1/§2.2）。gotgenes 的分叉对象是 tintinweb，不是 nicobailon。

---

## 2. 逐候选复核

### 2.1 nicobailon `pi-subagents` 0.78.0（`a4c8ced`）

**身份/安装/许可/兼容（公开事实）**

- `package.json`：`private: true`（checkout）/ license MIT / peers `@earendil-works/pi-ai >=0.86.1`、`pi-agent-core *`、`pi-coding-agent *`、`pi-tui *`、`typebox *`；`pi.extensions: ["./index.ts"]`、`pi.skills`、`pi.prompts`。
- **来源树与发布工件的入口不同名**：树内 `exports` 16 子路径全部指向 `./index.ts`、`./src/api/*.ts`；npm 快照 `main_exports` 指向 `./index.js`、`./src/api/*.js` + `.d.ts`，且 `pi.extensions` 为 `["./index.js"]`。故 git pin 与 npm pin **不是同一入口点**，引用时必须写明来源形态。
- 许可：`LICENSE:1-3` MIT / `Copyright (c) 2026 Nico Bailon`。
- 版本自检：`index.ts:1-17` —— `PI_SUBAGENT_CHILD === "1"` 时 `registerExtension = undefined`（子进程不重复注册）；安装版本与已加载版本不一致直接抛错（`/reload` 无法替换）。

**公开契约（第三方可达）**

| 面 | 证据 |
|---|---|
| 16 个 `exports` 子路径（含 `./agents`、`./delegation`、`./inspectors`、`./preflight`、`./shared-types`、`./background-work`、`./capability-ceiling`、`./workflow-resources`、`./project-panes`、`./control-channel`、`./external-runs`、`./external-job-provider`、`./child-tool-plan`、`./intercom-bridge`、`./required-child-extensions`） | `package.json`；npm 快照同键 |
| 版本化 RPC：`SUBAGENT_RPC_PROTOCOL_VERSION = 1`；`subagents:rpc:v1:request` / `:ready` / `:reply:<id>`；9 方法 `ping,status,manage,spawn,steer,interrupt,stop,resume,cost` | `src/extension/rpc.ts:31-37` |
| 具名观察频道（10 个 `pi.events`）＋两个版本化协议常量 | `src/shared/types.ts:2436-2444`；`src/api/background-work.ts:1-2`（protocol 1 + registry key）、`src/api/external-runs.ts:3-4`（registry v2）、`src/api/inspectors.ts:6`（`:v1`）、`src/api/delegation.ts:6-10`（5 频道） |
| `subagent:child-status` 载荷**自带 `version: 1`** | `src/shared/types.ts:2446-2463`（`runId,childId,status:started\|stopping\|stopped,ts,reason?,source?,asyncDir?,stepIndex?,agent?,childRunId?,workflowKey?,phase?,label?`） |
| 文档化的落盘事实与宿主 RPC：`status.json`/`events.jsonl`/`process-terminal.json`、`PI_SUBAGENT_ASYNC_JSON:`、`PI_SUBAGENT_INSPECT_JSON:`；跨会话读被拒 `foreign_session` | `docs/observability.md:178`（session-scoped）、`:215`（嵌套 fanout 只做 sidecar 合并，"full recursive status snapshots are not embedded"） |
| 3 个进程级注册表（键名经 `Symbol.for(...)` 挂 `globalThis`） | `src/api/background-work.ts:2,52`（`Symbol.for("pi-subagents.background-work.v1")`，另见 `:64,68` 的 malformed/unsupported 校验）、`src/api/capability-ceiling.ts`、`src/integrations/pi-web-session-liveness.ts` |

**与基线行相关的原生事实**

- **身份/父链/Owner**：`src/shared/session-identity.ts:6-10`（`resolveCurrentSessionId = sessionFile ?? sessionId`）；后台步骤摘要与运行摘要带 `runId/childId/stepIndex/agent/workflowKey/phase/label/sessionFile/sessionId`（`src/runs/background/async-status.ts:27-91`、`:92-105`，状态词表 8 值 `queued|running|complete|failed|partial|paused|stopped|rejected`）。
- **前台完成事件**（`src/runs/foreground/subagent-executor.ts:925-951`）载荷：`{ id: "<runId>:<index>", runId, source:"foreground", mode, agent, success, summary, exitCode, state, interrupted?, stopped?, processSignal?, timedOut?, turnBudgetExceeded?, timestamp, cwd, sessionFile, sessionId, taskIndex }` —— **带 `sessionFile` 与 `sessionId`，但不带 `durationMs`**。
- **后台 step 边**（每子执行的 open/close）：`subagent.step.started`（`src/runs/background/subagent-runner.ts:3820`）→ `subagent.step.completed|failed|paused|stopped`（`:3868`），载荷含 `{runId, stepIndex, childId, agent, exitCode, durationMs}`；`subagent.run.started`（`:3522`）、`run.paused`/`stopped`/`timed_out`、`step.stop_requested|stopped|stop_failed|stop_queued`（`:2318,2338,2353,2359`）。**仅后台**。
- **用量**：自有 `Usage{input,output,cacheRead,cacheWrite,cost,turns}`（`src/shared/types.ts:261-268`）——注意 `cost` 是标量、且**含 `turns`**；累计粒度是 child/step，不是逐请求。
- **耗时**：`durationMs` 由候选自算（`step` 事件里 `taskStartTime` 起算、`processTerminal`/`status` 快照内同名字段）；按 Main 的澄清，第三方执行器自测 per-execution 区间可算提供方原生事实，但这里要区分：**后台 step 区间**由拥有子会话的 runner 自己测量（合格候选），**前台完成事件不含 durationMs**（本 bus 上取不到）。

**结论（供正式对照引用）**：nicobailon 是该组里**唯一同时**给出「可导入版本化子路径 + 版本化 RPC（含 `resume`/`cost`）+ 版本化频道载荷 + 文档化落盘 artifact」的候选。`resume` 与 `cost` 是它相对 tintinweb/gotgenes 的实质差异点（tintinweb RPC 无 resume；gotgenes 无 cost 字段）。仍未提供：Turn/Round 级身份、逐请求 provider 边界、`kind:'sub'`/owner 的统一契约（含前台耗时）。

### 2.2 tintinweb `@tintinweb/pi-subagents` 0.22.0（`85a704cb`）

**身份/安装/许可/兼容**

- `package.json`：**无 `exports`、`main`、`types`**（本机 `node -e` 读键确认三者皆缺；npm 快照 `main_exports/main/types` 均为 `null`）；唯一入口 `pi.extensions: ["./src/index.ts"]`（运行 TS 源码）；deps `croner`、`nanoid`；peers `@earendil-works/pi-{ai,tui,coding-agent} >=1.1.0`、`typebox *`；`author: "tintinweb"`；`LICENSE:1-3` MIT / `Copyright (c) 2026 tintinweb`。
- "无 exports" **不等于**无公开接口：该项目有一份专门的跨扩展契约文档 `docs/rpc.md`。

**公开契约（本 ticket 重点，逐项复核）**

| 项 | 复核结果 | 证据 |
|---|---|---|
| 4 个 RPC 频道 `subagents:rpc:ping/spawn/stop/consume` | **成立**；`PROTOCOL_VERSION = 2`；回复信封 `{success:true,data?}` / `{success:false,error}` 发到 `${channel}:reply:${requestId}`；`ping` 答 `{version}` | `src/cross-extension-rpc.ts:33,73-95,100-103,104-166,167-183,191-195`；文档 `docs/rpc.md:1-12,105-140` |
| 生命周期事件 + `subagents:ready` | **成立**，11 个频道名：`created/started/completed/failed/steered/compacted/scheduled/settings_loaded/settings_changed/ready/scheduler_ready`；`subagents:ready` 载荷为 `{}`，在 `session_start` 后才接线 | 发射点 `src/index.ts:584,586,630,638,842,937,1182,1452,2234,783,3001,3007`、`src/schedule.ts:311`、`src/settings.ts:630,647` |
| registry `globalThis[Symbol.for("pi-subagents:manager")]` | **成立**，成员仅 `{ waitForAll, hasRunning, spawn, getRecord }`；`getRecord` 经 `isTopLevelAgent` 过滤；**无 `list`/枚举成员，无 `resume`** | `src/index.ts:748-757`；predicate `src/agent-manager.ts:123-156`；文档 `docs/rpc.md:141-155`（**方法级**文档：签名、过滤行为、"prefer the bus" 建议都写了；**返回 record/session 字段的稳定类型/版本承诺未见**） |
| 事件里的**实际 session/parent 身份** | **不成立**。终态载荷 `buildEventData` = `{id,type,description,result,error,status,toolUses,durationMs,tokens,usage}`；`started` = `{id,type,description}`；`created` = `{id,type,description,isBackground}`；`compacted` 加 `{reason,tokensBefore,compactionCount}`；`steered` = `{id,message}`。**没有任何 sessionId / parentSessionId / sessionFile / model / effort** | `src/index.ts:535-567`（buildEventData）、`:630-634`、`:1178-1190`、`:1452-1457`、`:636-645`、`:937` |
| 嵌套 / workflow 子代理可见性 | **顶层过滤成立**：终态、`started`、`compacted` 三处回调均 `if (!isTopLevelAgent(record)) return;`；`stop` 对 owned 记录抛 `Agent is owned by another agent or workflow`；`consume` 只查 `parentAgentId`、**不查 `workflowId`**（不对称） | `src/index.ts:576-586,620-634,636-645`、`:826-842`（consume 用 `resolveAgentRef` 且 `if (!record \|\| record.parentAgentId) return false`）、`src/cross-extension-rpc.ts:178`；文档 `docs/rpc.md:156-175` |
| spawn 覆写回调 ⇒ 不能旁接逐请求事实 | **成立**：RPC 路径 `spawnTopLevel`→`spawnResolved` 用 `{...options, ...callbacks}`，`callbacks` 覆盖 `onToolActivity/onTextDelta/onTurnEnd/onSessionCreated/onAssistantUsage`；同时删掉 `parentAgentId/workflowId/depth/maxSubagentDepth/configCwd/rootSessionId/resumeSessionFile/reclaim/blocking` | `src/index.ts:698-732`；文档 `docs/rpc.md:57-78` |
| 累计 usage / duration | **成立但语义混装**：终态 `usage` 是 lifetime 累计（`Σ message_end`，含 `cacheRead` 与 provider 计价 `cost.total`），而 `durationMs` 是**本次运行**区间（resume 时 `startedAt = Date.now()` 重置、`lifetimeUsage` **不重置**）⇒ 同一载荷里"累计花费"与"单次耗时"并列 | `src/usage.ts:5-25,60-88`；`src/index.ts:535-567`；`src/agent-manager.ts:1240-1246`（前台 resume 重置）、`:1297-1300`（后台 startResume 重置） |
| 续跑可被第三方调用 | **不成立**。`resume` 只在模型面 `Agent` 工具参数与 `@handle` mention 路径；RPC 4 方法无 resume，registry 无 resume 成员。detached resume 会重发 `subagents:created` + `started`；`subagents:created` 还会在 ctrl+b handoff 时补发 | `docs/rpc.md:137-140,175-180`；`src/index.ts:1178-1190,1452-1457`；`src/cross-extension-rpc.ts:100-200` |
| 逐请求事实 | **无**。全 `src/` 无 `before_provider_request`/`after_provider_response` 引用；逐 turn 钩子只有内部 `session.subscribe` → `onTurnEnd/onAssistantUsage`（被 spawn 覆写，见上） | grep 无命中；`src/agent-runner.ts:1151-1195` |
| viewed session 是否真可订阅 | **不可**。会话查看器/FleetView/`/agents` 都在 `src/ui/`，该目录**零 `emit(`**；"当前查看目标"只是组件局部 state（`viewingAgentId`/`viewingWorkflowId`）；第三方既无席位事实，也无跨 agent 的转录读取 API（只有自己 top-level 记录的 `outputFile`/`sessionFile`，需先经 registry 的 `getRecord` 拿路径——该**方法**在 `docs/rpc.md:141-155` 有文档，但**返回 record/session 字段是否属稳定类型契约未证实**，且只对已知 top-level id 有效） | `src/ui/fleet-list.ts:457-461`；`src/ui/*` grep `emit(` 无命中；`src/types.ts:231-240` |

补充复核：子会话**自带独立 `DefaultResourceLoader`**（`src/agent-runner.ts:826` → `:1097 resourceLoader: loader` → `:1117 bindExtensions`），所以子会话里本扩展的重新激活拿到的是**另一条 bus**；这与 pi 的每-loader 一 bus 事实（`packages/coding-agent/src/core/resource-loader.ts:280,379`）一致，但**只证明"不自动共享"**（见 §5 勘误 3）。

**结论**：tintinweb 的公开面**足以**支撑「我 spawn 的顶层 agent：`ready`/`ping` 发现 → `spawn` 拿 id → `started`/终态事件（累计 usage 含 provider 计价 cost、本次运行 durationMs、status、toolUses）→ `stop` → `consume` 抑制通知」这条适配路径（前提是只观察自己 spawn 的顶层 agent，且接受事件不带 session 身份）。**steer 不在公开 bus 上**（只有模型面 `steer_subagent` 工具/用户 mention），**resume 也不在**（只有模型面 `Agent` 工具参数/用户 mention）。**不足**的部分见 §4。

### 2.3 gotgenes `@gotgenes/pi-subagents` 23.4.0（`63476ff`）

**身份/安装/许可/兼容**

- `packages/pi-subagents/package.json`：`exports["."] = {types: "./dist/public.d.ts", default: "./src/service/service.ts"}`、`exports["./settings"]`；`files` 含 `src`+`dist`（clone 内 `dist/` 缺失，prepack 生成；**发布 tarball 内含** `dist/public.d.ts` 与 `dist/settings.d.ts`）；peers `pi-* >=1.0.0`、`typebox *`；`engines.node >= 22`；**0 runtime deps**；npm 快照 `main_exports` 与树内一致。
- 许可 MIT / `LICENSE:1-3` `Copyright (c) 2026 tintinweb`（分叉保留上游版权）。
- `scripts/verify-public-types.sh` **存在**（clone `packages/pi-subagents/scripts/`），说明作者把"打包后公共类型可用"当作发布门禁。
- 真实同仓消费者：`packages/pi-subagents-worktrees` 声明 peer `@gotgenes/pi-subagents >=16.4.0`，运行时 import `getSubagentsService`（`src/index.ts:19`）、`loadLayeredSettings`（`src/config.ts:14`）、`WorkspaceProvider` 类型（`src/workspace-provider.ts:18`）。**同一 monorepo、同一维护者**，不是独立第三方采用。

**公开契约**

| 面 | 证据 |
|---|---|
| 类型化服务 `SubagentsService{spawn,getRecord,listAgents,abort,steer,resume,waitForAll,hasRunning,registerWorkspaceProvider}` | `src/service/service.ts:131-170`；声明导出 `dist/public.d.ts:292-293`（值 4 个 + 类型 16 个） |
| 快照 `SubagentRecord{id,type,description,status,isBackground,result?,pendingQuestion?,error?,toolUses,turnBudget?,startedAt,completedAt?,lifetimeUsage,compactionCount,outputFile?,resumeRefusal?}` | `src/service/service.ts:55-84`（`outputFile` = "Path to the agent's session JSONL"） |
| 8 个频道名常量 `SUBAGENT_EVENTS`（started/completed/failed/resuming/resumed/compacted/created/steered） | `src/service/service.ts:173-183`；**仅频道名是 API，载荷未进 `public.d.ts`**（载荷由内部 `buildEventData` 生成，见下） |
| 子会话生命周期 5 频道 `subagents:child:spawning/session-created/bound/completed/disposed` | 常量 `src/lifecycle/child-lifecycle.ts:21-45`；载荷含 `sessionId`+`parentSessionId`（`:47-80`）；**故意发到父进程 bus**：`src/index.ts:177` `createChildLifecyclePublisher((channel,data)=>pi.events.emit(channel,data))` |
| 进程级服务槽 `Symbol.for("@gotgenes/pi-subagents:service")` | `src/service/service.ts:186-204`；发布 `src/index.ts:205`，shutdown 反注册 `:211` |
| 续跑拒绝词表 `ResumeRefusal = "still-running"｜"no-session"｜"session-released"｜"workspace-disposed"`、`ResumeResult = {kind:"resumed"\|"refused",…}` | `src/service/service.ts:100-133`、`:60-70` |

**与基线行相关的原生事实**

- 终态载荷 `buildEventData`（`src/observation/notification.ts:160-181`）= `{id,type,description,result,error,status,turnBudget,toolUses,durationMs,tokens}`，`tokens` 在零用量时省略 ⇒ **agent 生命周期事件同样不带 sessionId/parentSessionId，也不带 cost**。
- 子会话父链：`sessionManager.newSession({ parentSession: params.parentSession?.parentSessionId })`（`src/lifecycle/create-subagent-session.ts:282`），并在 `bindExtensions()` **之前**同步发 `subagents:child:session-created{sessionId,parentSessionId}`（`:311`、`:319`）。
- 迁延：`durationMs = completedAt - startedAt`（`src/observation/notification.ts:49,148,167`）；`resetForResume(startedAt)` 重建 status/startedAt/completedAt/result/error/consumedAt/turnBudget/pendingQuestion/updates，并自增内部 `_run`，**不重置 `lifetimeUsage`** ⇒ 与 tintinweb 相同的"单次耗时 + 累计用量"混装（`src/lifecycle/subagent-state.ts:417-444`、`src/lifecycle/subagent.ts:685-687`）。
- 用量：`LifetimeUsage = {input,output,cacheWrite}`（`src/lifecycle/usage.ts:8`）；**全 `src/`、`dist/` 无 `cost` 字段**（grep 仅命中 UI 注释里的英文单词）⇒ 无成本事实。
- Room/Round：无 round；只有 `TurnBudget{maxTurns,used,phase}`（`dist/public.d.ts` 类型 + `src/lifecycle/turn-limits.ts`）；`pi.on("turn_start")` 仅用于中断与 widget（`src/index.ts:245-246`）。
- 输入：`ask_parent`（子问父，问题入 `record.pendingQuestion`）+ `steer`（服务方法）+ `subagents:steered`；用户答复 = 一次 resume。
- 枚举：`listAgents()` 公开（`src/service/service-adapter.ts:89-90`），**可枚举本进程激活追踪的所有 agent**（比 tintinweb 的"无枚举"更强）。

**⚠️ 集成风险（源码事实 + [INFERENCE]）**

- `publishSubagentsService(service)` 在 `src/index.ts:205` **无条件调用，没有任何"已被占用则不覆盖"的守卫**；子会话会 `bindExtensions({})` 重新激活本扩展，且 shutdown 会 `unpublishSubagentsService`（`:211`）。参照 tintinweb 为同类问题显式加守卫（`docs/rpc.md:141-155` 的 #128 说明），**推断**子会话激活可能覆盖/清空根激活发布的服务槽 —— **运行后果属 [INFERENCE]，未运行验证**，但"缺少守卫"本身是源码事实。
- 公开事件载荷无类型无版本（只有频道名常量是 API）；服务对象无协议版本字段。

**结论**：gotgenes 的公开面**足以**支撑「枚举 + 按 id 快照/续跑/中断/steer + 子会话 sessionId/parentSessionId 归属 + 子会话 JSONL 路径可读 + 续跑拒绝原因可判」这条适配路径，是四个候选里**最能支撑按 actual session 归因**的（唯一公开 `sessionId`+`parentSessionId` 的组），但**没有任何成本事实**、agent 级事件无 session 身份、无逐请求事实。

### 2.4 workflows `@quintinshaw/pi-dynamic-workflows` 3.14.0（npm tarball）

**身份/安装/许可/兼容**

- `package.json`：`exports["."] = {types:"./dist/index.d.ts", import:"./dist/index.js"}`，`main`/`types` 已设，`files` 含 `dist/`+`src/`+`skills/`+`extensions/`；peers `pi-coding-agent >=0.80.8`、`pi-tui >=0.80.6`、`typebox *`；dep `acorn`。
- **`LICENSE` 存在**：MIT，`Copyright (c) 2026 QuintinShaw` + `Copyright (c) Michael Livs (original pi-dynamic-workflows)`。→ 与 decision/02 Comments 里"workflows 无 LICENSE 文件"的说法**不符**，该说法应改挂到 `@zhushanwen/pi-subagent-workflow`（其 tarball 本轮未复核 ⇒ 证据不足）。
- 声明仓库 `git+https://github.com/QuintinShaw/pi-dynamic-workflows.git` —— 旧报告记为 404，**本轮未复核网络**（见 §6）。
- 只有编译产物在跑：扩展入口 `extensions/workflow.ts:1-12` import `../dist/pi-extension.js`，并调用 `installHostCreateAgentSession(host.createAgentSession, host)`、`installHostSessionCapture(host.AgentSession)`；即**加载期就抓取宿主 SDK 句柄**，对宿主 SDK 形状强耦合（`src/agent.ts:61`）。

**公开契约**

| 面 | 证据 |
|---|---|
| 模块导出（`dist/index.js` + `dist/index.d.ts`，110 个 dist 项） | `package.json`；`dist/index.d.ts`/`index.js` 存在 |
| 唯一事件频道 `pi-dynamic-workflows:lifecycle`，载荷 `{status:"started"｜"resumed"｜"paused"｜"completed"｜"failed"｜"stopped", runId, name, sessionId?}` | `src/task-panel.ts:656-661`；发射 `:1304` `pi.events?.emit(...)` |
| 落盘 run 记录/日志/检查点（可读） | `PersistedRunState`：`src/run-persistence.ts:85-175`（`runId, workflowName, script, args?, sessionId?, parentSessionId?, parentSessionFile?, status, error?, pauseReason?, resetHint?, checkpoint?, phases, phaseBudgets?, currentPhase?, agents, logs, result?, startedAt, updatedAt, completedAt?, durationMs?, tokenUsage?, journal?, tokenBudget?, toolset?`），注释明示 `sessionId` 可变而 `parentSessionId/parentSessionFile` 不可重挂（`src/workflow-manager.ts:1688-1694` 区域）；导航器只见当前会话的 run（`src/run-persistence.ts:88-93`） |
| 子代理级记录 | `PersistedAgentState{id, callId?, label, phase?, prompt, status:queued｜running｜done｜error｜skipped, result?, error?, startedAt?, endedAt?, tokens?, tokenUsage?, model?, sessionId?, sessionFile?}`（`:31-57`） |
| 用量（唯一明确标注估算的候选） | `AgentUsage{input,output,cacheRead,cacheWrite,total,cost,estimated?}`（`src/agent-usage.ts:1-15`），`estimated` 经 `sumAgentUsage` 传播（`:24-36`）；run 级 `tokenUsage{…,cost?,estimated?}`（`src/run-persistence.ts:132-141`）；模型面 `workflow_control` 报 `tokenTotal`(+`tokenTotalEstimated`) |
| 耗时 | agent 级 `startedAt`/`endedAt` 为 **ISO 字符串**（`src/run-persistence.ts:46-47`）；run 级 `durationMs` 由候选自算：`managed.result?.durationMs ?? (terminal ? now - startedAt : undefined)`（`src/workflow-manager.ts:1768`）⇒ 有 per-run 区间且非"工具总耗时"，但**run 区间包含 phase 之间的空档**，不等于单个 subagent execution 的区间 |
| 观察范围 | run/会话内：navigator 仅当前会话；无跨会话观察频道 |

**结论**：workflows 提供 run 级身份 + 每 agent `sessionId`/`sessionFile`/`model` + provider 计价成本（带 `estimated` 标记）+ 续跑/checkpoint；**不提供** agent 级 start/end 事件、thinking level、per-execution 区间（只有 run 区间与 agent 时间戳）、逐请求事实、跨会话观察。

---

## 3. 按基线行的公开事实对照（供 Lighthouse 引用）

表内每格：事实 + 分类。`PG`=公开契约，`MT`=模型工具输出，`PI`=私有实现，`HS`=宿主原生。

三条读表规则（防止把分类读成完整覆盖）：

- 每格 `可经适配` 只表示**该候选已存在的事实**足以让适配层归一，**不表示该基线行已被完整覆盖**；该行其余语义（身份合成、开闭判定、归因、`unavailable` 逐项）仍需 framework/适配层补齐或由决策票裁定。
- 候选的**原生输入通道**（steer / checkpoint / mention 等）与 framework 的 `user_input` 边不是同一事实：前者只证明"有消息进入候选"，后者要求"宿主归因为用户提交且被该会话接收"。二者分开记，不得互推。
- **framework 的实例管理**（initialize/cleanup 寿命、owner 会话节点）与**候选的自身清理**（`session_shutdown` 拆卸、registry claim-once）是两件事：候选没有面向消费方的寿命公开契约，只说明该事实 `证据不足`，不等于"必须修改提供方"。

| 基线行（语义见基线报告 §F） | nicobailon 0.78.0 | tintinweb 0.22.0 | gotgenes 23.4.0 | workflows 3.14.0 |
|---|---|---|---|---|
| **F-SESSION-FACTS 子会话身份/直接父** | `可经适配`：`runId/childId/stepIndex/agent` + `sessionFile` + `sessionId`（前台完成事件、status/step artifact）`PG/PI` | `证据不足`：事件无 sessionId/parent；只有 record 内部 `sessionFile`/`parentAgentId`/`rootSessionId` `PI` | `已证实覆盖(公开)`：`subagents:child:session-created{sessionId,parentSessionId}` `PG`；agent 级 `outputFile`（session JSONL 路径）`PG`；但 agent 生命周期事件不带 session 身份 | `可经适配`：per-agent `sessionId?`/`sessionFile?`/`model?` 落盘 `PG`；无 agent 级事件 |
| **F-OWNER（最近祖先 main）** | `可经适配`：owner=`status.json.sessionId`；嵌套只做 sidecar 合并（`docs/observability.md:215`） | `未覆盖`（公开面）/`PI`（`rootSessionId` 内部存在） | `可经适配`：直接父可归因（child 事件），**无 owner 字段**；`listAgents()` 只能给"本进程激活"集合 | `未覆盖`：run 级 `parentSessionId` 是 run 的父，不是每个 agent 的 owner |
| **F-STARTUP（证明"在此开始" + 有效 model/effort）** | **部分** `可经适配`：有效 `model`/`thinking`/`requestedModel`/`launchContractDigest` 在 status/result `PG`；**缺"开始证明"**（无 first-start vs resume/fork 判别）⇒ 该项 `证据不足` | `证据不足`（两项皆缺）：`invocation` 内部且注释自陈"UI-only，仅 Agent 工具路径填充"（`src/types.ts:259-261`），事件不 echo；亦无开始证明 | **部分** `可经适配`：`SpawnOptions.model/thinkingLevel` 是**输入**公开、`resuming`/`resumed` 可反推续跑；**解析后的有效 model/effort 从不发布**、无开始证明 ⇒ 该两项 `证据不足` | **部分** `可经适配`：per-agent `model` + `ModelSource`（explicit/tier/phase/default/session）持久化；**thinking level 不持久化/不暴露**、无开始证明 ⇒ 该两项 `证据不足` |
| **F-SESSION-REASON / 换会话寿命（F-LIFECYCLE-IMPL 输入）** | `可经适配`：run 级 `started/paused/stopped/timed_out/repaired_stale` + `process-terminal` | `可经适配`：`created`+`started`+终态；resume 会重发 `created`/`started`（隐式判别）；无 dispose/transfer 词表 | `已证实覆盖(公开)`：`subagents:resuming`/`resumed` 显式区分续跑，`ResumeRefusal` 四值词表 `PG` | `已证实覆盖(公开)`：run 级 `started｜resumed｜paused｜completed｜failed｜stopped` + `pauseReason`/`resetHint`/`checkpoint` |
| **F-LIFECYCLE-IMPL（子会话不得拆掉根实例）** | `证据不足`：后台子为**独立进程**且 `index.ts:1-13` 自屏蔽（属候选**自身**清理，不是面向消费方的寿命契约）；前台子会话是否重新激活本扩展需读 `src/extension/index.ts` 全文才可定论 | `证据不足`（不是"需修改提供方"）：子会话 `bindExtensions` 会重新激活本扩展，候选用 registry claim-once 处理**自身**（`docs/rpc.md:141-155`）；**面向消费方的寿命契约不存在**（既无"子会话不激活"的承诺，也无"本激活属子会话"的公开标记）⇒ framework 实例管理需另行取证 | `证据不足`：`bindExtensions({})` 会重新激活，且服务槽**无覆盖守卫**（`src/index.ts:205`）⇒ 第三方 harness 的 initialize/cleanup 寿命未定义 | **部分** `可经适配`：子会话默认**不加载宿主扩展**（`src/agent.ts:855-866` "By default we keep host extensions disabled"）⇒ 天然无子激活；但这不构成对消费方的寿命契约，且同理观察不到子内部 |
| **F-SCOPE（owner vs session 观察范围）** | `可经适配`（单会话读路径 + `foreign_session` 拒绝；无 all-session 模式） | `未覆盖`：bus 每 loader 一份，registry 无枚举 ⇒ 无法**发现**外部 agent（`getRecord` 仅对已知 id 有效） | `可经适配`：`listAgents()` 可枚举本进程激活追踪的 agent（`PG`），但服务槽覆盖风险见上 | `未覆盖`：run/会话范围 |
| **F-STATE-INHERIT（需可归因 actual session/Owner + 持久化事实）** | `可经适配`：`sessionFile`+owner `sessionId` 在落盘 artifact；逐项归属需自建 | `证据不足`：无公开 session 归因（只有私有字段） | `可经适配`：唯一公开 `sessionId`+`parentSessionId`（children）且子会话持久化 JSONL | `未覆盖`（只到 run 级父） |
| **F-ROUND-EDGE（候选只需报本宿主 run-cycle 事实）** | **活动边部分** `可经适配`：后台 `subagent.step.started` → `completed\|failed\|paused\|stopped`（带 `{runId,stepIndex,childId,exitCode,durationMs}`）`PG`，另有 `created`/`started`/终态/`control`/`steering` 活动边；**前台无 step 边**；**无 quiescence 判据**（无 `getAsyncJobSnapshot` 等价公开事实）⇒ `证据不足` | **活动边部分** `可经适配`：`created`/`started`/`completed\|failed`/`steered`/`compacted` 边存在；**无 run-cycle 开闭边**（逐 turn 计数只在内部 `onTurnEnd`，且被 spawn 覆写 `PI`）；quiescence/自动继续 `证据不足` | **活动边部分** `可经适配`：`created`/`started`/`completed\|failed`/`resuming`/`resumed`；**无 cycle 边**（只有 `TurnBudget` 上限/进度）；quiescence/自动继续 `证据不足` | **活动边部分** `可经适配`（**仅 run 级**：`started\|resumed\|paused\|completed\|failed\|stopped`）；agent 级无边（phase 只是近似单位）；quiescence/自动继续 `证据不足` |
| **F-TURN（逐请求/逐 Turn 原生事实）** | **累计部分** `已证实覆盖(公开)`：child/step 聚合 `Usage{…,turns}`、`turnCount/toolCount` `PG`；**逐请求边界 / 单请求可靠 usage 归因**`证据不足`（无 per-request 出口、无 HTTP）⇒ 需提供方出口 | **累计部分** `已证实覆盖(公开)`：终态聚合 `Usage`（provider 计价，含 `cacheRead`）；**逐请求边界 / 单请求归因**`证据不足`（无 per-request 出口、无 HTTP）⇒ 需提供方出口 | **累计部分** `已证实覆盖(公开)`：`tokens{input,output,total}` + `lifetimeUsage`；**无 cost**；**逐请求**`证据不足`⇒ 需提供方出口 | **累计部分** `已证实覆盖(公开)`：per-agent + per-run `AgentUsage`（含 cost，`estimated` 标记）；**逐请求**`证据不足`⇒ 需提供方出口 |
| **F-RUNTIME / F-RUNTIME-SCOPE（每 execution 的宿主测量耗时 + 该 execution 会话归因）** | **部分** `可经适配`：后台 step 区间由拥有子会话的 runner 自测（合格来源），事件带 `runId/stepIndex/childId`；**前台完成事件无 durationMs** ⇒ 前台 `证据不足`；无 "running" 读数（仅 settle-time） | **部分** `可经适配`：终态 `durationMs` = 本次运行区间（resume 重置 startedAt，**不含 executions 间空闲**），由拥有会话的扩展自测；**事件不带 session 归因** ⇒ 归因部分 `证据不足`；无 running 读数 | **部分** `可经适配`：`durationMs = completedAt - startedAt`，resume 重建 → 单次区间不含空闲；`outputFile` 提供会话归因（经 `listAgents`/`getRecord`）；无 running 读数 | `证据不足`：只有 run 区间（含 phase 间空档）+ agent ISO 时间戳，无 per-execution 区间，无 running 读数 |
| **F-INPUT（`user_input` 边 vs 候选原生输入通道）** | 候选原生输入 `已证实覆盖(公开)`：`steer` 回执 `deliveryStatus: delivered\|queued` + `subagent.steer.requested/scheduled/routed/queued/delivered/failed/recovered` 落盘（`docs/observability.md:204`）+ `subagent:steering-notice`（`src/shared/types.ts:2441`）。**宿主归因为用户、且被会话接收**`证据不足`（回执只证投递，不证来源归因） | 候选原生输入 **部分** `可经适配`：`steered{id,message}`（`src/index.ts:937,3001,3007`）；mention 面 `pi.on("input")`（`src/index.ts:884-887`）是**候选内部消费**且过滤 `event.source === "extension"`，不对外发布用户源事实。**用户源归因**`证据不足` | 候选原生输入 **部分** `可经适配`：`steer`（服务）+ `subagents:steered{id,message}`（`src/tools/steer-tool.ts:53,58`）+ `ask_parent`/`pendingQuestion`（子问父）+ `subagents:update`。**用户源归因**`证据不足` | 候选原生输入 **部分** `可经适配`：durable `checkpoint(kind:confirm\|input\|select)` + `pause/resume/stop`；是**落盘状态**不是事件。**用户源归因 / 答案事件**`证据不足` |
| **F-VIEWED（席位 port：read/subscribe"当前查看会话"）** | `未覆盖`：`action:status view:transcript\|fleet` 是**调用者主动读**，不是"当前席位"；跨会话 `foreign_session` | `未覆盖`：viewer 存在但 `src/ui/` 零 emit、查看目标只是组件 state ⇒ **UI 存在 ≠ 可读订阅** | `未覆盖`：`/subagents:sessions` 原生 viewer（ADR 0007 "transcript-viewer-is-not-an-overlay"）+ 公开 `outputFile` 可自行读，但无席位事实 | `未覆盖`：`/workflows` 下钻 + per-agent `sessionFile` 可读，无席位事实 |

**宿主原生（pi 1.2.0 / `4a5d372`）行**（本轮直接复读，用于纠正旧报告）：`packages/coding-agent/src/core/extensions/types.ts:1171-1180` `InputEvent{type,text,images?,source:"interactive"|"rpc"|"extension",streamingBehavior?}` 与 `:1664 on("input",…)`；`:917-921` `AfterProviderResponseEvent{status:number,headers}`、`:1636 on("after_provider_response",…)`；`:901-904` `BeforeProviderRequestEvent{payload}`、`:1632`；`:906-912` `before_provider_headers`、`provider_stream_event`；`:328-347` `ExtensionContext` 有 `sessionManager: ReadonlySessionManager`、`modelRegistry`、`model`、`thinkingLevel?`，**无** agent 身份/注册表；`core/event-bus.ts:1-31` 每次 `createEventBus()` 一个 `EventEmitter`，`core/resource-loader.ts:280` `eventBus?` 可注入、`:379` 缺省自建。

---

## 4. 公开接口足以适配什么 / 哪些必须补提供方

**适配充分（可用现状 + 适配层归一）**

- **tintinweb**：只观察自 spawn 的顶层 agent 的 `ready → spawn(id) → started → 终态(累计 usage（含 provider cost）/本次运行 durationMs/status/toolUses) → stop → consume`。**公开 bus 只有 `ping/spawn/stop/consume`：没有 steer、也没有 resume** —— steer 只走模型面 `steer_subagent` 工具或用户 `@handle` mention 面，resume 只走模型面 `Agent` 工具参数与用户 mention 面（`docs/rpc.md:137-140,175-180`）。子会话 JSONL 可读，但路径要先经 registry `getRecord` 拿 —— 该**方法**在 `docs/rpc.md:141-155` 有文档，而**返回的 record/session 字段是否属稳定类型契约未证实**。
- **gotgenes**：`getSubagentsService()` → `listAgents()/getRecord()/spawn/steer/abort/resume/waitForAll` + `subagents:child:*` 的 sessionId/parentSessionId 归因 + `outputFile` 读子会话；续跑是**公开服务方法**（唯一把 resume 放进公开契约的 in-process 候选）。
- **nicobailon**：`subagents:rpc:v1:*`（含 `resume`/`cost`）+ 10 个频道 + 落盘 artifact（status.json/events.jsonl/process-terminal.json）+ `foreign_session` 语义；后台 step 边是四个候选里最接近 run-cycle 的原生事实。
- **workflows**：run 记录/journal + run 级 `durationMs` + per-agent `sessionId/sessionFile/model/tokenUsage(cost,estimated)`；适合"按 run 观察 + 事后读记录"。

> 上述四条只列**已存在事实**的可用路径；每行的其余缺口（§3 每格标 `证据不足`／`需提供方出口` 的部分）不在"适配充分"之列。

**必须补提供方（缺口，由选型/组织票决定供应商：上游贡献 / 适配层 / 例外 fork——本文件不批准任何一条）**

1. **事件载荷的 session/owner 身份**：tintinweb/gotgenes 的 agent 级事件都不带 sessionId（gotgenes 只在自己的 `child:*` 家族带）；tintinweb 连宿主原生 `parentSession` 写没写、`rootSessionId` 是否可靠都只能读内部字段。→ 需要提供方在公开载荷里给出 `{sessionId, parentSessionId, owner}` 或等价只读接口。
2. **嵌套/workflow 子代理的可见性**：tintinweb 明确把 owned children 从全部顶层频道剔除、`stop` 拒绝、`consume` 半放行；需要一个受支持的只读入口（否则嵌套事实只能靠内部字段/落盘）。
3. **逐请求（provider 边界）事实**：四个候选全无。宿主**有** `before_provider_request`/`after_provider_response{status,headers}`/`provider_stream_event`，但那是**每激活**的，父进程看不到子会话的请求；且 tintinweb 的 spawn 会覆写 `on*` 回调 ⇒ 想旁接也接不上。→ 需要提供方桥接（子侧激活转发到父 bus / 或在 spawn 选项里保留一个 observer 位），或由适配层接受 `unavailable`。
4. **第三方续跑**：tintinweb 公开面无 resume（RPC 4 方法、registry 4 成员都没有）；nicobailon RPC 有 `resume`；gotgenes 服务有 `resume`。
5. **枚举/发现**：tintinweb 无枚举（`getRecord` 只认已知 id），无法发现"不是自己 spawn 的顶层 agent"。
6. **viewed 席位**：四个候选都没有"当前查看会话"的 read/subscribe；UI 存在不构成事实接口（tintinweb `src/ui/` 零 emit 即为反证）。
7. **resolved model/effort 与 first-start 证明**：nicobailon 有模型/思考（落盘），但仍无 first-start vs resume 判别；tintinweb/gotgenes 连有效值都不发布。
8. **成本事实**：gotgenes **完全没有 cost**（全 `src/` 无命中）；workflows 的 cost 在 provider 未报用量时退化为 `chars/4` 估算（`estimated:true`）——两者不可当同一可信度引用。nicobailon/tintinweb 是 provider 计价直读。

**共同边界（与 Main 的澄清一致）**：framework 的 Turn 身份/turnId、Round 开闭与身份合成、请求锚价、State 继承决策由 framework 负责；候选只要给出**原生请求起止、模型、用量、队列/执行事实**即可，不要求候选输出这些最终语义；`durationMs` 只要由**实际拥有该 execution 的执行器**测量、区间为单次执行（不含 executions 间空闲）、且公开可读并归因到 actual session，就算提供方原生事实（in-process 候选的 `Date.now` 差本身不失格）；反之，"adapter 从时间戳自行猜"、"工具总耗时/会话跨度"都不算已证实覆盖。

---

## 5. 旧结论应撤销 / 收紧（逐条）

1. **撤销**：`02-pi-subagent-candidates-report.md` §2.5 "用户输入事件｜无"。pi 有 `InputEvent`（`types.ts:1171-1180`）与 `on("input")`（`:1664`）。基线报告与 lighthouse 的表述（"不得将尚未映射写成所有 pi 公开接口都没有事实"）为准。
2. **撤销/收窄**：同报告 §2.5、§4.2-4、§6.4 把 "http status / responseId" 说成 "pi 与候选中都不存在，需要上游新增字段"。pi **扩展 API 有** `after_provider_response{status,headers}`（`:917-921,1636`）与 `before_provider_request`/`before_provider_headers`/`provider_stream_event`。正确表述：CLI JSON 流的事件表没有 http 字段，而扩展 API **有该事实但未映射**，且**每激活作用域**限制使父进程看不到子会话的请求 —— 这是"映射/桥接"问题，不是"事实不存在"。
3. **收窄**："跨会话观察在进程内候选里事先就被堵死"。每 `ResourceLoader` 一份 EventBus 只证明**不自动共享**（`resource-loader.ts:280,379`），不证明提供方无法桥接：tintinweb 用 `Symbol.for("pi-subagents:manager")`、gotgenes 用 `publishSubagentsService`、nicobailon 有 3 个 `Symbol.for` 注册表，都是**进程级**（非 bus 作用域）的观察面。真实限制是：tintinweb **无枚举成员**（无法发现），gotgenes 能枚举但有服务槽覆盖风险，nicobailon 靠落盘 artifact。
4. **收窄**："只有 `pi-subagents` 与 `@gotgenes/pi-subagents` 提供可导入或版本化的公开契约，tintinweb/esso0428/arhen 只有事件频道"。tintinweb 有**版本化 RPC 协议**（`PROTOCOL_VERSION=2`，`cross-extension-rpc.ts:33`）与文档化的 registry；nicobailon 自己的 `subagent:child-status` 载荷带 `version:1`。正确表述：只有 nicobailon 与 gotgenes 有**可导入模块入口**；"无 exports" ≠ "无公开接口"。
5. **撤销**：tintinweb 报告把 V-VIEWED 判为 `covered`（依据 conversation viewer / FleetView / `/agents`）。UI 存在不等于提供"当前查看席位"的可读订阅：`src/ui/` 零 `emit(`，`viewingAgentId`/`viewingWorkflowId` 只是 `fleet-list.ts:457-461` 的组件 state。应判 `未覆盖`。
6. **撤销**：把 tintinweb 的 `record.id/handle/parentAgentId/workflowId/rootSessionId/sessionFile/outputFile/invocation` 当作"公开面证据"。它们是**私有实现字段**：`getRecord` 的**方法**有文档（`docs/rpc.md:141-155`：签名、过滤行为、可用性探测都写了），但**返回 record/session 字段的稳定类型/版本承诺未见**，且只对已知 top-level id 有效。线上公开载荷只有 `{id,type,description[,status,usage,tokens,durationMs,toolUses]}`。
7. **收紧**：任何把候选 `durationMs` 直接当作"execution 耗时已覆盖"的表述。要同时满足：由拥有 execution 的执行器测量、单次区间（不含 executions 间空闲）、公开可读、可归因 actual session。据此：tintinweb（区间合格、归因缺失）、gotgenes（区间合格、归因经 `outputFile`）、nicobailon 后台（区间合格、归因经 `childId`）、nicobailon **前台**（bus 上无 durationMs）、workflows（只有 run 区间 ⇒ 不合格）。
8. **分层**：T-TURN 的 "usage 已覆盖" 必须拆开。nicobailon/tintinweb = provider 计价直读（含 `cost`）；**gotgenes 无任何 cost**（`LifetimeUsage` 仅 `{input,output,cacheWrite}`，全 `src/`、`dist/` 无 cost 字段）；workflows 有 cost 但可能为 `chars/4` 估算并标 `estimated:true`。且四者都是 per-agent/per-run 聚合，非逐请求。
9. **收窄**：把"事件带 Usage + durationMs"当作"载荷语义一致"。tintinweb 与 gotgenes 都存在**同一载荷里 `usage` 是 lifetime 累计（resume 不重置）而 `durationMs` 是单次运行区间**的混装；引用时必须分别声明语义，不能相互推导。
10. **纠正数据源**：`pidev-package-pages.json` 的 `kinds` 与 `repo_url` 对四个包**取值完全相同**（`repo_url` 恒为 `github.com/earendil-works/pi`，即宿主仓库）⇒ 该快照的这两列不可用于"包类型/仓库"结论；报告 §3 的"包类型(pi.dev)"列与 tintinweb 报告的 "pi.dev kind extension" 需标注来源不可靠。
11. **纠正归属**：decision/02 Comments 的"workflows 无 LICENSE 文件且无仓库"应改挂 `@zhushanwen/pi-subagent-workflow`（其 tarball 本轮未复核 ⇒ 证据不足）；`@quintinshaw/pi-dynamic-workflows` 的 tarball **确有** `LICENSE`（MIT，QuintinShaw + Michael Livs）。
12. **纠正体量口径**：tintinweb 报告的 "tarball 193 files / 2.64 MB" 与本轮 git clone（`git ls-files` 249、工作区 26 MB，含 `media/`）不是同一度量；本轮未取该包 tarball，不得混用。（nicobailon 报告已标 11.4 MB / 1,331 files 同理属旧快照，本轮未复核。）
13. **降级**：把"steer 回执 / `subagents:steered` / `checkpoint`"当作 F-INPUT（`user_input` 边）已覆盖。这些只证明"有消息进入候选"；framework 的边要求"宿主归因为**用户**提交且被该会话接收"，四项候选均 `证据不足`（tintinweb 的 `pi.on("input")` 过滤 `event.source === "extension"`，只供其内部使用，不对外发布来源）。候选原生输入通道与 `user_input` 边分开记。
14. **降级**：把"候选在子会话里会重新激活、且无消费方寿命契约"直接判为 `需修改提供方`。这首先是**证据不足**：需区分 framework 的实例管理（initialize/cleanup 寿命、owner 会话节点）与候选的自身清理（`session_shutdown` 拆卸、registry claim-once）；候选没有面向消费方的寿命公开契约，只说明该事实拿不到，不自动等于需要改提供方。

---

## 6. 证据不足 / 本轮无法验证（显式列表）

- **一律未运行验证**：四个候选与 pi 宿主均无安装、无加载、无 RPC 往返、无真实子代理、无 provider 调用；事件时序（含 tintinweb 文档描述的 `consume` 通知竞态）、耗时准确性、跨进程行为均未观测。
- **网络类事实未复核**：`@quintinshaw/pi-dynamic-workflows` 声明仓库 404、`raw.githubusercontent.com` 不可达、各包 npm `gitHead` 与 tag 对应关系 —— 本轮沿用旧快照记录，未发起网络请求。gotgenes/nicobailon/tintinweb 的 pin 是**本地 clone 实测**（tag/提交信息已核对）。
- **浅克隆**：nicobailon 与 tintinweb clone 均只有 1 个 commit ⇒ 无提交历史；"分叉/血统"结论依据 LICENSE/README/npm 元数据，非 git 历史。
- **nicobailon 前台路径**：`subagent:foreground-complete` 无 `durationMs`（已核）；前台 per-execution 耗时的公开来源**未在 bus 上确认**（`docs/observability.md` 的 status/result 字段本轮未逐行复核）⇒ 标证据不足。
- **nicobailon 前台子会话是否重新激活本扩展**（F-LIFECYCLE-IMPL 关键）本轮未读 `src/extension/index.ts` 全文 ⇒ 证据不足。
- **gotgenes 服务槽覆盖的实际后果**：缺守卫是源码事实；"子会话覆盖/清空根服务槽"是 [INFERENCE]，需运行验证（决策票 06 的场景可覆盖）。
- **gotgenes `dist/settings.d.ts` 内容**：仅确认 tarball 内存在两个 `.d.ts` 与 `public.d.ts` 的导出清单（`:292-293`），未逐符号核对。
- **workflows**：`tests/**` 不随 tarball 发布；`dist/*.js` 与 `src/*.ts` 未做逐一对账；run 记录"公开可读"依赖其落盘路径约定（`workflow-paths.ts`）本轮未展开。
- **pi.dev 快照字段**见 §5 第 10 条（`kinds`/`repo_url` 不可用）；下载量（609K / 36.2K / 14.5K / 26K per month）为 2026-10-15 快照，非趋势。
- **essso0428 / rhinos0608 / zhushanwen 等其余候选**不在本文件复核范围（仅作血统佐证引用）。

## 7. 结论性质

- 本文件只交付**固定 revision 的公开事实复核、分层分类与勘误**；不批准提供方选择，不批准 fork/上游贡献/私有依赖任一路线，不构成能力基线降级，不替代决定票 03/04/05 与隔离验证票 06。
- 可供 Lighthouse 直接引用的是：§2 的逐候选公开面与私有实现边界、§3 的逐基线行分类、§4 的"足以适配 / 必须补提供方"清单、§5 的撤销项。旧报告（`research/candidates/*.md`、`research/02-pi-subagent-candidates-report.md`）保留为证据快照，其概括**不得**直接用作完整覆盖结论。
