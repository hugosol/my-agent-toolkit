# pi 子代理扩展的接口证据与覆盖对照（研究产出）

Ticket: [decision/02-pi-subagent-candidates.md](../../decision/02-pi-subagent-candidates.md)（E:/Developer/myhub/my-agent-toolkit/.scratch/model-cost-pi-migration/decision/02-pi-subagent-candidates.md）
Owner: CandidateResearch。Research branch `research/pi-subagent-candidates`，worktree `E:/Developer/myhub/wt/pi-subagent-candidates`。
本报告只给事实与候选比较，不批准选型；用户最终决定提供方与取舍。

## 0. 方法与证据口径

- 一手来源优先级：候选仓库源码（固定 revision）> `package.json`/`LICENSE`/npm registry 元数据 > pi.dev 包页 > README 宣传语。README 声明本身不作为接口证据。
- 每个覆盖结论必须给 `file:line` 或标 `证据不足`。
- 明确区分三类东西：**(a) 第三方扩展可消费的公开接口**（导出模块、类型化 API、`pi.events` 频道、生命周期事件）、**(b) 只给模型看的工具输出**、**(c) 私有内部实现**。只有 (a) 能作为“已有公开接口”计入覆盖。
- 工具限制记录：本会话中 `find`（语义检索）对本地仓库返回 HTTP 451 失败，已改用 codebase-memory 符号视图 + 精确字面量 grep + 目录枚举，不影响结论。
- 未安装任何包，未改动生产仓库。

### 0.1 宿主基线（本报告的引用锚点）

| 资产 | revision / 版本 |
|---|---|
| pi 宿主源码 `E:/Developer/myhub/pi` | `4a5d37291531ad48b8e536c892557877d219463c`（2026-10-15 09:59:46 +0000） |
| `@earendil-works/pi-coding-agent` | 1.2.0，MIT（`packages/coding-agent/package.json`） |
| `@earendil-works/pi-agent-core` | 1.2.0，MIT |
| OMP 基线 | 框架契约行来自 BaselineResearch（见 §2 表首列） |

## 1. 候选发现范围（记录，不宣称穷尽）

发现通道：pi.dev 包目录的 `name` 过滤参数（`https://pi.dev/packages?name=<q>`，GET 表单 `action="/packages"` + `input name="name"`，实测 `?q=` 无效）。

执行的查询与命中量（2026-10-15 抓取）：

| query | pi.dev 报告命中 | 实际抓取 |
|---|---|---|
| `subagent` | 412 / 5567 | 412（9 页） |
| `delegate` | 71 | 71 |
| `orchestrat` | 190 | 190 |
| `worker` | 53 | 53 |
| `fleet` | 20 | 20 |
| `swarm` | 23 | 23 |
| `agent` | 3137 | 450（前 9 页，截断） |

去重后 **929** 个包；按名称/描述命中“子代理/委派/编排/并行/舰队/集群/worker/角色”语义的 **521** 个，按月下载量排序后人工筛选。

原始证据：同目录 `research/search-scope.json`（含全部 929 条名称+描述+月下载）与 `research/search-scope-focus.md`（521 条排序表）。

### 排除原因（记录）

| 排除类别 | 例子 | 原因 |
|---|---|---|
| 非子代理能力 | `pi-mcp-adapter`、`pi-web-access`、`pi-lens` | 不提供子代理执行/会话 |
| 纯 skill/prompt/主题包 | `bigpowers`、`pi-gauntlet`(skill)、`@mutmutco/pi-plugin` | 无扩展接口，只有提示词资产 |
| 只是一个 harness 发行版，不是可装扩展 | `@selesai/code`、`gentle-pi`、`pi-code` | 整机发行版/配置集合，非“提供子代理能力的扩展”；若需要应另立候选类别 |
| 角色/模型定义类 | `rolebox`、`@akagilnc/pi-workflow-roles` | 只定义角色提示与模型映射，不拥有子代理会话生命周期（未做深挖，标为证据不足） |
| 并行“旁路对话”类 | `pi-btw`、`@pi-unipi/btw` | 面向人的并行侧会话语义，非委派执行 |
| 远程/跨机沙箱运行时 | `@tangle-network/tcloud-agent`、`agent-comms` | 运行在外部传输上，是否产生 pi 子代理会话事实未知（证据不足，未深挖） |

未深挖的 521 条里仍有若干可能相关（如 `pi-maestro-flow`、`pi-extensible-workflows`、`@pi-unipi/long-horizon`、`pi-crew`、`trimegisto`、`@a-t-h-i/bot-lobby`、`@agimon-ai/doompi-*`）。**不承诺穷尽市场**；深挖集合按“月下载量 + 描述直接命中子代理执行/会话事实”选取。

## 2. pi 宿主侧事实（决定候选能拿到什么）

### 2.1 pi 宿主没有子代理语义，但随仓库附带一个参考实现

- 运行时/扩展 API 里没有子代理概念：`packages/coding-agent/src`、`packages/agent/src`、`packages/coding-agent/docs/*.md` 中 grep `subagent` 无命中；`ExtensionContext`/`ExtensionAPI` 没有 agent 身份、agent 注册表、派发或执行耗时（耗时只有工具级的 `ToolExecutionEndEvent.durationMs`）。**宿主不提供父子会话、Owner、Round、“查看子会话”等概念。**
- 但 **`packages/coding-agent/examples/extensions/subagent/`（未随 npm 发布，属仓库示例）是官方参考实现**：`index.ts` 注册 `subagent` 工具（`index.ts:469-471`），用 `node:child_process.spawn` 为每个子代理启动一个**独立 pi 进程**：`pi --mode json -p --no-session`（`index.ts:298`），逐行解析 JSONL，`message_end` 里累加 `input/output/cacheRead/cacheWrite/cost.total/totalTokens` 并统计 `turns`（`index.ts:355-375`）；另记 `model`、`stopReason`、`errorMessage`。子代理定义来自 `~/.pi/agent/agents/*.md` 与 `.pi/agents/*.md` 的 YAML frontmatter（`agents.ts`，字段 `name/description/tools/model`）。
- 该参考实现的**能力边界**（对本票很关键）：`--no-session` ⇒ **子代理没有会话文件、没有 session id、不可 resume、不可回看**；没有 executionId/runtimeMs；没有父子会话关联；没有 round；`usage` 全靠子进程 stdout 重建；模型/思考级别只能靠启动参数指定。README 自列的 Limitations 也确认只有输出截断与并发上限（`examples/extensions/subagent/README.md`）。
- 结论：**“pi 子代理”实际是第三方/示例扩展自建的一层**；任何候选提供的子代理身份、会话事实、用量、耗时、回看能力都属于“候选自有”，不是 pi 原生能力（区间划分见 §5）。

### 2.2 公开的扩展↔扩展接口

- **`pi.events: EventBus`**（`src/core/extensions/types.ts:1917`；文档 `docs/extensions.md` 的 “Communicate with another extension | `pi.events`” 行）。
  实现 `src/core/event-bus.ts:3-6`：`emit(channel: string, data: unknown)` / `on(channel, handler)`，底层是 Node `EventEmitter`。**同进程、字符串频道、`data` 为 `unknown`（无类型契约）**；没有跨进程、没有持久化、没有作用域或权限概念。频道命名冲突与版本兼容完全靠约定。
- **模块导入**：`@earendil-works/pi-coding-agent` 是宿主供给扩展的包（`docs/packages.md` 的 “Pi supplies these packages to extensions and skills” 列表），扩展可直接 `import` 其导出。公开导出包含 `createAgentSession`、`createAgentSessionRuntime`、`SessionManager`、`RpcClient`、`JsonAgentSessionEvent`、`createEventBus`/`EventBus`、`ExtensionAPI`（`src/index.ts:52,98,251-264,302,421-425`）。单一入口 `.`（`packages/coding-agent/package.json` exports）。
  → 这是“扩展如何拿到子代理事实”的唯一两条公开通道：**同进程 SDK** 与 **跨进程 CLI/RPC**。
- 已注册扩展之间没有“依赖另一个扩展”的机制（无扩展依赖解析、无服务注册表、无有序契约）；`pi.events` 是唯一约定通道。

### 2.3 进程内可观察的事实（SDK 路线）

- 进程内子会话：`createAgentSession()` 返回 `AgentSession`，公开 `session.messages`、`session.model`、`session.thinkingLevel`、`session.systemPrompt`、`getActiveToolNames()`，`session.subscribe(cb)` 拿 `AgentSessionEvent`，`prompt()/steer()/followUp()/abort()/waitForIdle()/dispose()`（`docs/sdk.md`）。`SessionManager` 可 `inMemory()` 或文件持久化，`getSessionId()`/`getSessionFile()` 给出身份（`src/core/session-manager.ts:1152-1156`；只读视图 `ReadonlySessionManager` 暴露 `getCwd/getSessionDir/getSessionId/getSessionFile/getLeafId/getLeafEntry/getEntry/getLabel/getBranch/buildContextEntries/buildSessionProjection/getHeader/getEntries/getTree/getSessionName`，`session-manager.ts:245-262`）。
- 扩展在自身进程内能拿到的当前会话事实：`ctx.sessionManager`（同上只读视图）、`ctx.model`、`ctx.thinkingLevel`、`ctx.mode`、`ctx.cwd`（`types.ts:349-380`）。
- **扩展事件不含会话标识**：`SessionStartEvent{type,reason:"startup"|"reload"|"new"|"resume"|"fork",previousSessionFile?}`（`types.ts:755-762`）没有 sessionId；`TurnStartEvent{turnIndex,timestamp}`、`TurnEndEvent{turnIndex,message,toolResults,messageEntryId,toolResultEntryIds}`（`types.ts:1058-1073`）没有 sessionId、没有 round、没有模型/价格（模型与 `usage` 在 `message` 里）。即：**同进程多会话时，事件流本身不足以区分是哪个会话**，必须由承载子代理的扩展自己记账。
- 用量：`Usage` 出现在 assistant `message.usage`、`AgentEndEvent`/`TurnEndEvent.message`、compaction/branch-summary `usage`、`sessionManager.appendUsage(kind,...)` 写 `usage` 条目（`docs/session-format.md` UsageEntry；`session-manager.ts:1244`）。工具若发起嵌套模型调用，文档要求把其 usage 计入工具结果（`docs/extensions.md` Tools 段）。

### 2.4 跨进程可观察的事实（CLI/RPC 路线）

- `pi --mode json <prompt>`：stdout 严格 JSONL，**首条为 session header `{type:"session",version,id,cwd,timestamp}`**，随后 `agent_start/turn_start/message_*/turn_end/agent_end/agent_settled`、工具事件（含 `durationMs`）、`queue_update`、`entry_appended`、`session_info_changed`、`thinking_level_changed`、compaction/retry 事件（`docs/json.md`）。一次性：给完 prompt 就跑完退出，不接受后续命令（`docs/cli-integration.md`）。
- `pi --mode rpc`：长驻双向 JSONL；`RpcClient`（Node/TS）是公开的类型化客户端；`get_state` 可取 session ID 与文件（`docs/rpc.md`、`docs/rpc-commands.md#get_state`、`docs/cli-integration.md`）。RPC 才有“事后继续驱动同一会话”的能力。
- 磁盘：会话 JSONL `~/.pi/agent/sessions/--<path>--/<timestamp>_<session-id>.jsonl`，树 `id/parentId`，`parentSession` 仅表示 **fork/clone 血缘**，不表示“子代理属于哪个主会话”（`docs/session-format.md` SessionHeader、Tree Structure）。`--session-id`/`--session`/`--continue`/`--resume` 可重建或续跑同一会话（`docs/cli.md`、`docs/sessions.md`）。

### 2.5 相对基线的宿主空缺（无论选哪个候选都要面对的）

| 基线要求 | 宿主现状 | 结论 |
|---|---|---|
| 子会话身份（kind=sub、parentSessionId、agentName/agentId、taskName） | 无宿主概念；仅有 sessionId 与 fork 血缘 | 只能由扩展或框架适配层自行定义并记账 |
| 启动锚点（provider+model+effort，且需“证明开始”） | `session_start.reason` 有 `startup/new/resume/fork`（无 `initial`，多了 `reload`）；模型/思考级别在 session 与事件里可取 | 需要“不是 resume/fork 且分支无消息”这类判定，宿主不提供现成标志 |
| Owner（最近祖先主会话） | 无 | 需扩展/适配层维护 |
| 观察范围（owner vs session）与效果权限分离 | 无 | 同进程可观察全量（若扩展自持注册表），但无契约、无权限语义 |
| Round（execution cycle 开关） | 事件层只有 turn；无 round 概念 | 需从 run/agent 边界合成（`agent_start`→`agent_end`/`agent_settled`） |
| Turn（turnId/session/round/price/outcome/usage/http/responseId） | `turnIndex`+message（含 usage/api/provider/model/stopReason）；无 turnId、无 round、无价格、无 http、无 responseId | 部分可推导，价格需 catalog，http/responseId 非宿主公开事实 |
| 执行耗时（executionId/runtimeMs/status） | 工具事件有 `durationMs`；会话无“执行”概念 | 子代理耗时要扩展自己计量 |
| 用户输入事件 | 无（user 消息在 message 事件里） | 扩展自行判定 |
| 查看子会话（seat + markers） | 无；RPC `get_state`/session 文件是仅有的“读一眼” | 需扩展实现只读订阅 |
| 反复执行/继续/steer | RPC 长驻可继续；JSON/print 一次性；SDK 可 `steer/followUp/prompt` | 取决于候选选哪条路线 |

BaselineResearch 独立复核后确认的 pi 缺失项（报告 `E:/Developer/myhub/wt/omp-capability-baseline/.scratch/model-cost-pi-migration/research/omp-subagent-capability-baseline.md`，branch `research/omp-capability-baseline`）：无 `getAsyncJobSnapshot`、扩展无托管定时器、无 `getViewedSession`/`subscribeViewedSessionChanged`（`viewSession` 是 TUI 内部实现）、无 `ctx.models` 目录查询、`ExtensionContext` 无 agent 身份/注册表/原生子代理派发、无 `task:subagent:*` 事件总线频道。本文档 §2.1 的“官方参考实现”结论与其一致。

### 2.6 基线子代理事实的来源形态（OMP vs pi）——候选必须替代的正是这一层

基线（BaselineResearch 报告 A/B/C 段）里子代理相关语义在 OMP 上的**来源形态**只有三类，全部是“宿主自己那套子代理实现”的产物，而不是通用宿主 API：

| 来源形态 | OMP 事实 | pi 现状 |
|---|---|---|
| 扩展 context 上的 agent 身份 | `agent: ExtensionAgentIdentity{kind:'main'\|'sub', id, name, depth, parentId?}`（`N-AGENT-IDENTITY`） | `ExtensionContext` 无 `agent` 成员（`P-NO-AGENT`） |
| 进程级 agent 注册表 | `AgentRegistry.global()` → `get/list/listVisibleTo/onChange`，`AgentRef{id,kind,parentId,status,session}`，`session` 在 parked/aborted 时为 `null`（`N-AGENT-REGISTRY`，需深导入而非 context 成员） | 无注册表（`P-NO-AGENT`） |
| 宿主委派工具 details | `task` 工具 `details.results[]`/`details.progress[]`，条目含 `id`、`status`、`durationMs`（`N-TASK-TOOL`/`N-TASK-ENTRY`；adapter `O-RUNTIME-ROUTE-1`） | 无 `task` 工具；官方示例的 `subagent` 工具 details 含 `usage.input/output/cacheRead/cacheWrite/cost/contextTokens/turns`、`messages`、`model`、`stopReason`（`examples/extensions/subagent/index.ts:147-157,355-375`），**无 id/status/durationMs** |
| 事件总线频道 | `task:subagent:progress`（`payload.progress{id,status,durationMs}`）与 `task:subagent:lifecycle`（`{id,agent,agentSource,description?,status:'started'\|'completed'\|'failed'\|'aborted',sessionFile?,parentToolCallId?,index,detached?}`）（`N-CHANNELS`；adapter `O-RUNTIME-ROUTE-2`） | `pi.events` 只是通用 `EventBus{emit,on}`，**无任何内置子代理频道**（`P-NO-SUBAGENT`） |
| 重复执行的语义 | keep-alive 后由 peer/IRC 消息在**既有会话**里跑 follow-up turn，并再发一次 lifecycle `started`（`detached:true`）；无 `task resume`（`N-KEEPALIVE`）；adapter 用 `<agentId>#<n>` 编号同一 agent 的多次 execution（`O-RUNTIME-IDENTITY`） | 无对应概念；候选只能自建（如子进程重跑 / SDK 再 `prompt()`） |

即：**候选要替代的不是“pi 的一个 API”，而是“OMP 自己那套 task/registry/bus 三元组”**。因此候选评分必须问：它有没有把这三类事实中的任意一类**公开**给别的扩展（可导入模块 / `pi.events` 频道 / 工具 details），且身份在重复执行下是否稳定。

## 3. 候选清单（身份/许可/安装/发布事实）

元数据来源：npm registry（`registry.npmjs.org/<pkg>` 的 `dist-tags.latest` + 该版本 `license`/`repository`/`exports`/`peerDependencies`，抓取于 2026-10-15，原始落盘 `research/npm-metadata.json`、`research/top70-metadata.json`）与 pi.dev 包页（`research/pidev-package-pages.json`）。安装命令统一为 `pi install npm:<pkg>`（`docs/packages.md`）。

| # | 包 | 仓库 | 版本 | 许可 | 发布 | 版本数 | 月下载 | 包类型(pi.dev) | `exports` | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `pi-subagents` | nicobailon/pi-subagents | 0.78.0 | MIT | 2026-10-13 | 146 | 609K | extension | 有 | 事实上的默认选择 |
| 2 | `pi-background-tasks` | ismailsaleekh/pi-background-tasks | 2.6.10 | ISC | 2026-10-13 | 34 | 97.6K | extension | 无 | 后台任务+只读委派 agent |
| 3 | `pi-fabric` | fabric-runtime/pi-fabric | 0.117.1 | MIT | 2026-10-15 | 351 | 37.7K | extension | 有 | “programmable tool and agent runtime” |
| 4 | `@tintinweb/pi-subagents` | tintinweb/pi-subagents | 0.22.0 | MIT | 2026-10-13 | 59 | 36.2K | extension | 无 | Claude Code 风格 |
| 5 | `@kontextmind/kxm` | kontextmind/kxm | 0.7.183 | MIT | 2026-10-15 | 167 | 30.3K | extension | 有 | 多 agent 编排+操作台 |
| 6 | `@quintinshaw/pi-dynamic-workflows` | QuintinShaw/pi-dynamic-workflows | 3.14.0 | MIT | 2026-10-06 | 62 | 26K | extension | 有 | 成本核算+resume+worktree |
| 7 | `@henryqw/pi-subagent` | HenryQW/pi-harness | 27.2.0 | MIT | 2026-10-15 | 109 | 24.8K | extension | 有 | 有界委派+任务图 |
| 8 | `@mjasnikovs/pi-task` | mjasnikovs/pi-task | 0.42.63 | **AGPL-3.0-only** | 2026-10-15 | 369 | 18.1K | extension | 无 | 许可为强 copyleft，需注意 |
| 9 | `@gotgenes/pi-subagents` | gotgenes/pi-packages | 23.4.0 | MIT | 2026-10-09 | 197 | 14.5K | extension | 有 | 声称“typed API + 供其他扩展用的生命周期事件” |
| 10 | `@chankov/agent-fleet` | chankov/agent-fleet | 2.0.19 | MIT | 2026-10-07 | 36 | 14.3K | extension+skill+prompt | 无 | 派发器+验证契约 |
| 11 | `@agimon-ai/doompi-team` | AgiFlow/doompi | 0.0.1-alpha.128 | MIT | 2026-10-11 | 118 | 10.9K | extension | 有 | 异步具名子代理+intercom |
| 12 | `pi-herdsman` | boadij/pi-herdsman | 0.27.0 | **Apache-2.0** | 2026-10-15 | 59 | 9,243 | extension | 无 | herdr 面板 |
| 13 | `pi-subagent-manager` | championswimmer/pi-subagent-manager | 0.29.1 | MIT | 2026-10-14 | 40 | 7,500 | extension | 无 | 分层可 steer 子代理线程 |
| 14 | `@bacnh85/pi-subagent` | bacnh85/pi-extensions | 0.23.3 | MIT | 2026-10-11 | 52 | 3,533 | extension | 无 | 进程内 SDK 会话 |
| 15 | `pi-better-subagents` | 1aboveio/pi-better-harness | 0.18.0 | MIT | 2026-10-11 | 57 | 6,113 | extension | 无 | 分离式沙箱 |
| 16 | `pi-durable-subagents` | purboo/pi-durable-subagents | 1.0.40 | MIT | 2026-10-14 | 34 | 5,031 | extension | 无 | 崩溃安全 |
| 17 | `@arhen/pi-core-subagent` | arhen/pi-extensions | 1.3.68 | MIT | 2026-10-08 | 106 | 4,512 | extension | 无 | 依赖图+intercom |
| 18 | `pi-ptc-subagents` | a1121611810/pi-ptc-subagents | 3.2.0 | **Apache-2.0** | 2026-10-15 | 21 | 3,300 | extension | 有 | 每任务一个 pi 子进程 |
| 19 | `pi-agents` | mavam/pi-agents | 0.32.2 | MIT | 2026-10-15 | 42 | 3,191 | extension | 有 | durable 具名 agent+图 |
| 20 | `@d3ara1n/pi-subagent` | d3ara1n/pi-extensions | 3.7.2 | MIT | 2026-10-11 | 57 | 3,142 | extension | 无 | pi 子进程+模型角色 |
| 21 | `@zhushanwen/pi-subagent-workflow` | **npm 无 repository 字段** | 9.5.1 | MIT | 2026-10-14 | 66 | 3,896 | extension | 无 | 子进程运行时；源码位置不明 |
| 22 | `pi-cowboy` | electric-dragon-80000v/pi-cowboy | 0.14.1（pi.dev 页仍显示 0.12.2） | MIT | 2026-10-15 | 23 | 新发布 | extension | 有 | 跨 harness 编排（Codex/Claude/OpenCode/pi） |
| 23 | `@esso0428/pi-subagents` / `@rhinos0608/pi-subagents` | ESSO0428 / rhinos0608 | 0.17.40 / 0.71.0-beta.0 | MIT | 2026-10-15 / 2026-09-29 | 60 / 1 | 6,788 / 5,838 | extension | 无 / 有 | #1 的疑似 fork |

**市场级兼容信号**（`research/top70-metadata.json`，前 70 个焦点候选里去重命名空间）：以 `@earendil-works/*`（当前 pi 宿主命名空间）为 peer 的 59 个，仍依赖旧 `@mariozechner/pi-*` 的 2 个（`pi-extended-teams`、`@tangle-network/tcloud-agent`，两者最近发布分别为 2026-10-02 与 2026-07-01，后者已明显停滞）。未声明宿主 peer 的 9 个多为别名/聚合包。许可方面除表内标注外均为 MIT；`pi-maestro-flow`、`@selesai/code`、`pi-agent-suite` 等 npm 未声明 license（授权不明，接入前必须澄清）。

> 本地已有参照（非市场候选，用户自持）：`E:/Developer/myhub/pi-agent-extensions/parallel-agent`（进程内 SDK 子代理，`lib/agent-runner.ts` 用 `createAgentSession`，`lib/spawner.ts` 聚合 tokens/cost）。属于“已有可适配资产”，不是第三方候选。

## 4. 逐候选覆盖对照

深挖口径：每个候选在**固定 revision** 上读源码（浅克隆或 npm tarball），未安装、未构建、未运行。原始报告（含完整 `file:line`）在同目录 `research/candidates/` 下：`pi-subagents.md`、`tintinweb-gotgenes-workflows.md`、`background-tasks-group.md`、`fleet-runtime-group.md`、`process-boundary-group.md`。分类词：[公开]=第三方扩展可用的公开接口即已满足；[可适配]=事实已存在但需要适配层归一；[需上游]=需要 pi 或候选新增/公开接口；[不支持]=无事实来源；[证据不足]=未能证实。

### 4.1 总览（执行模型 / 第三方接口 / 关键事实粒度）

| 候选（固定 revision） | 执行模型 | 给第三方扩展的接口 | 每次执行的 id+耗时 | 子会话 id/文件 + 父链 | 用量/成本粒度 | 结束后再执行/续跑 | 回看 |
|---|---|---|---|---|---|---|---|
| **`pi-subagents`** (nicobailon) `a4c8ced6` v0.78.0 MIT | 混合：前台子会话=**进程内** `createAgentSession`；后台=**分离 pi 进程**；另有 external-cli/external-job | **最强**：16 个 `exports` 子路径 + 事件总线 RPC `subagents:rpc:v1:*`（ping/status/manage/spawn/steer/interrupt/stop/resume/cost）+ 8 个具名事件频道 + `Symbol.for` 全局注册表 | **有**：`runId`/`childId` + `startedAt`/`endedAt`/`durationMs`（`async-status.ts`）；状态词表 8 值 | 有：子会话文件；子会话 header 写 `parentSession`；`status.json.sessionId` = owner 会话 | 子级累积（含 provider `cost.total`）；RPC `cost` 返回 `{parent,children,childTotal,unresolvedAsyncChildren}`（**下限语义**） | 有：RPC `resume`；`steer` 带 `deliveryStatus` | 有：`action:status` + `options.view:"transcript"\|"fleet"`，另有 `/subagents-inspect-rpc`（**限本会话**，跨会话返回 `foreign_session`） |
| **`@rhinos0608/pi-subagents`** `31030d93` 0.71.0-beta.0 MIT（#1 硬分叉） | 同 #1 | 同 #1，但**移除** `pi-subagents/inspectors`，**新增** `subagents:runtime:v1` 命名空间与 fork 专属 `result` RPC；模型面动作从 57 降到 6 | 同 #1 | 同 #1 | 同 #1 | 同 #1（`bg_wait` 工具被删） | 同 #1 |
| **`@esso0428/pi-subagents`** `044677ff` 0.17.40 MIT（`@tintinweb/pi-subagents` 的 fork） | 进程内 `createAgentSession` | **无 `exports`**；仅事件频道 `subagents:created/started/completed/failed/steered/compacted` + RPC `subagents:rpc:ping\|spawn\|stop`（协议版本 2）+ 未文档化的 `Symbol.for("pi-subagents:manager")` | 部分：`startedAt`/`completedAt`+状态枚举；无 `runtimeMs` 字段 | 有 `record.sessionId`（owner）与 `parentAgentId`（**不是** session 父链）；子会话**不写** `parentSession` | 仅累积 `lifetimeUsage`，**无 cost**，事件 payload 不带 session/成本 | `Agent` 工具 `resume`；事件无「重启后重放」保证 | TUI `/agents` 会话查看器 + 转录文件；**无机器可读读取接口** |
| **`@tintinweb/pi-subagents`** `85a704cb` v0.22.0 MIT | 进程内（SDK + `bindExtensions`） | 事件频道 `subagents:created/started/completed/failed/steered/compacted`（终态带完整 pi `Usage` 含 `cost.total`）；RPC `subagents:rpc:*` | 终态带 `durationMs`+`status`；`startedAt`/`completedAt`；**无 executionId** | `record.id`/`handle`/`parentAgentId`/`workflowId`；`rootSessionId` 内部存在但**事件不带**；`getRecord` 受 owner 限定 | 终态事件带 `tokens{input,output,total}` + 完整 `Usage`（provider 计价） | `steer`/`resume` 入口存在（模型面 mention 可恢复已完成 agent） | 有：会话查看器 + FleetView + `/agents` |
| **`@gotgenes/pi-subagents`** `63476ff8` 23.4.0 MIT（tintinweb 的友好分叉） | 进程内 | **真实类型化 API**：`exports["."] = {types: ./dist/public.d.ts, default: ./src/service/service.ts}`，值导出 `getSubagentsService`/`publishSubagentsService`/`unpublishSubagentsService`/`SUBAGENT_EVENTS` 与 `SubagentsService{spawn,getRecord,listAgents,abort,steer,resume,waitForAll,hasRunning,registerWorkspaceProvider}`；`pi-subagents-worktrees` 已作为外部消费者 import 它 | 终态 `durationMs`+`status`；`startedAt`/`completedAt`；无 executionId | 子会话用 `newSession({parentSession})` 建立父链；`SubagentRecord` 公开 | `LifetimeUsage = {input,output,cacheWrite}`，**完全没有 cost**（`cost` 在其 `src/` 无命中） | `resume` + `ask_parent` 问答式续跑 | 有：`/subagents:sessions` 原生查看器 |
| **`@quintinshaw/pi-dynamic-workflows`** 3.14.0 MIT（**声明的仓库 404**，证据仅 npm tarball） | 进程内 | 事件 `pi-dynamic-workflows:lifecycle`（run 级 `started\|resumed\|paused\|completed\|failed\|stopped`）；run 记录落盘可读 | run `durationMs` + 每 agent `startedAt`/`endedAt` + 实时 `activeMs` | `PersistedRunState{runId,sessionId,parentSessionId,parentSessionFile}` | `AgentUsage{input,output,cacheRead,cacheWrite,total,cost,estimated?}`，**成本真实**（provider 计价，仅求和）；provider 不报时退化为 `chars/4` 估算并标 `estimated:true`（渲染带 `~`） | run restart / phase 续跑 | 有：`/workflows` 逐 run→phase→agent 下钻 + 实时 tail |
| **`pi-background-tasks`** `799182ff` 2.6.10 ISC | **子 pi 进程**：`--mode text --print --session-id <随机> --session-dir <artifactDir>/child-session`，且**显式删除**父会话环境变量 | 两个带版本的 EventBus 服务，但只在**任务**粒度（delegate 只作为快照字段） | `BgTaskSnapshot{startTime,endTime,status,pid,bytesWritten}` | `childSessionId` 随机、**与父无关**；会话文件只能靠 glob 推导（它自己不读）；**无父链** | 用量只存 `<artifactDir>/result.json`；模型只看到 `usage: observed\|unavailable` | **明确拒绝**重跑（`host-api.ts:210`），`surviveReload` 对 agent 任务被拒；`session_shutdown` 杀全部 | 仅 stdout/stderr 日志流（`bg_logs`），无对话回看 |
| **`pi-better-subagents`** `64aeeaec` 0.18.0 MIT | **子 pi 进程**（detached + `unref`）：`-p --mode json --session-id <runId> --session-dir …` | 运行事实**无 EventBus 接口**（元数据目录即 API） | `RunMeta.startedAt/endedAt/exitCode` + 派生 `running\|exited` | **runId 就是子会话 id**；`RunCallbackOrigin{cwd,sessionId}` + `spawnPid` 按 origin 归属 | 子 JSON 流累积 `{input,output,cacheRead,costUSD,total}`（按 `message_end` 去重）；需 `include:["cost"]` 才返回 | **不支持**续跑；steer 仅限存活且非 idle 的子进程 | 有：`subagent_output` 分页/raw/history |
| **`pi-durable-subagents`** `4271b94a` 1.0.40 MIT | **子 pi 进程**：`--mode rpc --session <显式路径>`，由分离的 orchestrator 拉起 | 文档化的 JSON 事件日志 CLI；**EventBus 上无接口** | `time{exec,active}` 日记条目 + `ActiveTime/activeTotal` | 四段稳定身份 `wid`/`key`/`gen`/`exec`（`call="<wid>@<rev>/<key>@<gen>"`）；会话路径 `…/x/<key>@<gen>/session.jsonl` 按构造确定；owner 是 `main:<sessionId>` 字符串 | 每次调用与每个 workflow 的用量在 `status --json` 与 journal `usage`；按 provider message 身份去重 | **支持**：`follow-up` 开启同一 call 的新 generation；`resume`/崩溃恢复重发前代并**保留原生会话身份** | 有：`status <wid> --tail/--grep/--json` |
| **`pi-herdsman`** `9545e3ea` v0.27.0 Apache-2.0 | **子 pi 进程** in herdr pane（`--kind pi`），仅 pi | EventBus 协议 `pi-herdsman:managed-agent-bootstrap`（版本化、初始化参与）；另有文档化、带版本（v5）的**文件邮箱**；**无 import 入口** | `lastActivityAt`（≤5s 写一次）+ start 时间戳 + herdr 活性；非 `{executionId,runtimeMs,status}` | `ManagedAgentState{agentLabel,runId,ownerSessionId,workspaceId,paneId,piSessionId,piSessionFile}`（**最完整**） | `sessionUsageTotals`/`collectSessionUsage` 从**子会话 JSONL** 求和 `usage.cost.total`，带 `complete` 标志显式声明覆盖不全；**非 per-turn** | `continue_agent`/`steer_agent`/`resume_project`；跨重启靠邮箱+会话文件 | 有：`read_agent_transcript`/`read_staff_transcript` 读持久化子会话；`inspect_*` 读 herdr 终端 |
| **`pi-agents`** (mavam) `ccdbfbaf` v0.32.2 MIT | **进程内** pi-durable conversation（无 `child_process`） | 公开、版本化事件频道 `pi-agents:state`（`{protocol:1,sessionId,instanceId,sequence,type:snapshot\|stopped,agents[]}`）与 `pi-agents:state:request`；**频道刻意不含 prompt/结果/用量** | `endedAt` + `activity`（运行时工具/重试/压缩/委派进度）；无 executionId | `AgentInfo{id,name,profile,model,thinking,state,closed,createdAt,stateSince,lastActivityAt,endedAt,usage,activity,result,graph,delegates,queued}`；owner = 父 pi 会话（存储按 `getSessionId()` 分目录） | per-model + per-tool 桶含 `cost.total`（`summarizeUsage`）+ 流式 live partial；**不估算**；但**导出的 state 频道不含 usage** | `agent_send` 给已停 agent = 重启；跨重启由 per-session 持久化恢复 | 有：attach 视图（用 pi 原生组件）+ `/agents` |
| **`@arhen/pi-core-subagent`** `4c837b13` 1.3.68 MIT | **进程内** `createAgentSession` + 真实子会话文件（`SessionManager.create(…,{parentSession})`，resume 用 `SessionManager.open`） | 事件 `subagent:run-created/updated/completed`、`subagent:task-*`、`subagent:intercom` 等（**无协议版本、无文档**）；sidecar `<parentSessionFile>.subagents.json` 可被第三方读 | `startedAt`/`endedAt` + `maxRuntimeMs` 上限 + 超时报文含已耗时；非 `{executionId,runtimeMs,status}` | `TaskSnapshot{id,runId,agent,status,sessionId,sessionFile,model,provider,thinking,tools,usage,branch,diffStat,…}`；子会话 header 带 `parentSession` | per-turn 累积（`updateUsageFromMessage`，含 `cost.total`）→ 任务/run 聚合；另 `subagent_models` 打印目录价，无价时明说「provider 未报费率」 | `steer_subagent`/`resume_subagent`（在同一会话复活，保留 worktree 分支）；sidecar 不复活存活子会话（改写为 `aborted`） | 有：`subagent_status` 给出 `sessionFile` 供 external tail，`/subagents peek` 内部 tail |
| **`pi-cowboy`** `4cf1cb96` v0.14.1 MIT | herdr pane 里跑 `pi/pig/pi-bolt/opencode/codex/claude`；每个子代理独立 worktree | **无**：无 exports、全仓无 `pi.events` emit | 内部有阶段时间戳与 pane 活性；不产出记录 | **从不获取子会话 id/文件**（`getSessionId\|sessionId` grep 0 命中）；无父链 | **零**：唯一退出通道是 `<tmpdir>/pi-cowboy/<agentId>/result.md`；从不解析 harness 输出 | `steer` 可 revive 已 settle 的 agent（pane 内） | 人可以看 pane；程序化读取不可行 |
| **`@bacnh85/pi-subagent`** `85233b0` 0.23.3 MIT | 进程内 `createAgentSession` + `SessionManager.inMemory` | EventBus 频道 `pi-subagent:run` | 返回 model/usage/`durationMs`/status | **从不读 `session.sessionId`**（尽管 SDK 直接暴露），且用内存会话 ⇒ **无会话文件** | 从子 `AssistantMessage` 取用量（含 cost） | 未见续跑路径 | 工具可读结果；无会话回看 |
| **`pi-ptc-subagents`** `9eef766` v3.2.0 Apache-2.0 | 子 pi 进程：`spawn("pi",["--mode","json","-p","--no-session",…])`；后台换成 `--session-dir/--session-id <taskId>/--name` | 未见第三方接口（未在本次证据中给出行） | `DispatchResult{usage,durationMs,exitCode,status}` + 持久 `TaskRecord` | 后台：id 由构造决定；**会话文件显式未知**（`dispatch.ts:2030`，ADR 0022） | stdout `message_end` 累积 | 未见 | 未见 |
| **`@henryqw/pi-subagent`** `7e57ac8` 27.2.0 MIT | 子 pi 进程 `--mode json -p --no-session`（ephemeral）；herdr 路径走外部 harness | 未见第三方接口（未在本次证据中给出行） | usage/stopReason/outcome；**无 runtimeMs、无 session id** | ephemeral ⇒ 无会话；herdr 路径用 `--session <dir>/session.jsonl` 并直接读该文件取用量 | 从 stdout / 会话文件 | 未见 | herdr 路径可读会话文件 |
| **`@d3ara1n/pi-subagent`** `a39552b` 3.7.2 MIT | 子 pi 进程 `--mode rpc --no-session` | 未见第三方接口（未在本次证据中给出行） | `SubagentResult{usage,model,elapsedMs}`；**无子会话** | 无 | 从 RPC 流 | 历史按父会话 id 归档 | 未见 |
| **`@zhushanwen/pi-subagent-workflow`** 9.5.1 MIT（**npm 无 repository、无 LICENSE 文件**） | 两层进程：`EngineClient`→engine CLI→真 pi（`--mode rpc --session-dir … --model provider/id:thinking`） | 未见第三方接口（未在本次证据中给出行） | 最全：`AgentOutcome{usage,turns,durationMs,sessionId,sessionFile,exitCode}`；id/文件来自 pi RPC `get_state` | **有 sessionId + sessionFile**（来自 `get_state`） | RPC/契约类型带 usage/turns | 未见 | 未见 |
| （对照）pi 自带参考实现 `examples/extensions/subagent` | 子 pi 进程 `--mode json -p --no-session` | 无 | 无（仅 `turns`） | 无（`--no-session`） | stdout `message_end` 累加，含 cost | 无 | 无 |

### 4.2 关键判断（写成分项，便于决策票引用）

1. **“是否给第三方扩展公开接口”把候选分成两档**。只有 `pi-subagents`（16 子路径 + 版本化 RPC + 8 频道）与 `@gotgenes/pi-subagents`（真实 `exports` + 类型化 `SubagentsService` + 有外部消费者）提供了**可导入或版本化的公开契约**。tintinweb、esso0428、arhen 只有事件频道（前者终态带完整 Usage，后两者更薄且无版本）；herdsman 有版本化文件邮箱与一个 bootstrap 协议但**不可 import**；background/better/durable 走 CLI/JSON/文件。
2. **没有任何候选提供 OMP 意义上的“registry + 每 execution 读数”三元组**。最接近的：`pi-subagents`（`runId/childId` + `durationMs` + 8 值状态 + owner 会话 id）、`pi-durable-subagents`（`wid/key/gen/exec` + active 时间 + `main:<sessionId>` owner）、`pi-herdsman`（`runId/ownerSessionId/piSessionId/piSessionFile`）、`@arhen/pi-core-subagent`（`runId/sessionId/sessionFile` + `maxRuntimeMs`）。
3. **R-ROUND（无 payload 的开/闭边）在全部候选中都不存在**；最接近的是 `pi-subagents` 的 `subagent.step.started` → `subagent.step.completed|failed|paused|stopped`（带 `{runId,stepIndex,childId,durationMs}`），以及各候选的 turn 钩子（`turn_start`/`turn_end`），以及 pi-durable 的 `follow-up` generation。
4. **T-TURN 的 turnId/价格/http status/responseId 在全部候选与 pi 的 JSON 事件表里都不存在**（`docs/json.md` 的事件表没有 http 字段）。这是“需上游接口”的一致缺口。
5. **成本事实的可信度分层**：provider 计价直读（pi-subagents / tintinweb / gotgenes 的 tokens-only / pi-agents / arhen / workflows 的 metered 部分）> 会话文件求和（herdsman，带 `complete` 标志）> 估算（workflows 的 `estimated:true`，`chars/4`）> 无（cowboy、background-tasks 的模型面）。
6. **跨会话观察（session scope）在进程内候选里事先就被堵死**：`pi.events` 是**每个 `ResourceLoader` 一个 `EventBus`**（`core/resource-loader.ts:379`，`options.eventBus` 可注入），而这些候选给每个子会话各自建 loader/服务 ⇒ 每个 `pi.events` 只能看到自己那一份。`@gotgenes/pi-subagents` 的 service 是 `globalThis` 上 `publishSubagentsService` 发布的**每进程每激活**一份，`pi-agents` 的频道按 `sessionId+instanceId` 自描述——**都不是“观察所有会话”**。
7. **`parentSession` 头字段只有少数候选写**（`pi-subagents` 后台路由、`@arhen/pi-core-subagent`、`@gotgenes/pi-subagents`）；background-tasks / better-subagents / durable-subagents 都**不写** pi 原生父链，ancestor 归属要靠各自 sidecar/owner 字符串重建。
8. **重复执行/续跑语义差异极大**：`pi-durable-subagents` 的 `follow-up`（新 generation，保留会话身份）在语义上最接近 OMP 的“保活后后续执行”（`N-KEEPALIVE`，新 lifecycle `started`）；`pi-herdsman` 的 `continue_agent`/`resume_project`、`pi-agents` 的 `agent_send` 重启、`@arhen` 的 `resume_subagent` 次之；`pi-background-tasks` **明确拒绝**重跑；`pi-better-subagents` 不支持；`pi-cowboy` 只能靠 pane steer。
9. **回看（V-VIEWED）能力与“持久化方式”绑定**：进程内候选（gotgenes/tintinweb/arhen/pi-agents）有原生会话文件或 viewer；`pi-herdsman` 能读子会话文件且 fail-closed；`pi-subagents` 有 transcript/fleet 视图但**跨会话读取被 `foreign_session` 拒绝**；`pi-cowboy` 程序化不可读；`@bacnh85` 用内存会话 ⇒ 无文件可读。

## 5. 覆盖分类汇总

按 §4 的分类口径，对“某候选能否作为该基线行的提供方”给出类别（同一行可能有多个候选落不同类别）。

| 基线行（来自能力基线） | 已存在的公开 | 可经适配 | 需上游接口 | 不支持 | 证据不足 |
|---|---|---|---|---|---|
| S-IDENT 子会话身份 + 直接父 + owner + taskName/agentName/agentId | pi-subagents（`status.json.sessionId`=owner、子会话 `parentSession`、`runId/childId/agent`）、pi-herdsman（`ownerSessionId`+`piSessionId`+`piSessionFile`+`agentLabel`）、pi-agents（`AgentInfo.id`+父会话分目录）、@arhen（`TaskSnapshot.sessionId/sessionFile`+`parentSession`）、gotgenes（`SubagentRecord`+`parentSession`） | background-tasks（随机子 id、无父链）、better-subagents（runId=sessionId、`RunCallbackOrigin`）、durable-subagents（四段身份+owner 字符串）、tintinweb（`parentAgentId`/`rootSessionId` 在内部） | `kind:'sub'` 语义、`taskName` 与 `agentName` 的区分、`unavailable[]` 逐项命名 | — | esso0428（有 `record.sessionId` 但事件不带） |
| S-STARTUP 启动锚点（provider+model+effort，且证明“在此开始”） | background-tasks（`DelegatePinnedRoute`）、better-subagents（`RunMeta.model/effort`）、durable-subagents（continuation 时才不发 `--model/--thinking`）、pi-herdsman（argv+resume 判别）、pi-agents（写入创建提交内）、@arhen（launch 时记录+resume 判别） | pi-subagents（模型/思考/launchContract 有，但无 first-start vs resume 判别）、cowboy（argv 可证） | 「证明开始」（branch 无 user/assistant）的判别标志 | — | esso0428（`sessionStartEvent.reason` 是常量 `"fork"`） |
| S-OWNER 归属到最近祖先 main | pi-subagents、pi-herdsman、pi-agents、durable-subagents、better-subagents、gotgenes、@arhen | background-tasks（只用于命名目录）、tintinweb | `kind/parentSessionId` 是位置不是 owner 的语义需适配层实现 | cowboy | — |
| S-SCOPE owner/session 观察范围 + 观察≠授权 | better-subagents（显式 `all:true` 机器全局 + 会话默认）、durable-subagents（`ownWorkflows`/`pausedElsewhere`）、pi-herdsman（三档 scope + 明说“可见不等于有权”）、gotgenes（服务发布在 `globalThis`） | pi-subagents（读接口会话内、RPC 有 `foreign_session` 拒绝）、pi-agents（频道自描述 sessionId+sequence） | **“观察所有 actual session”**：pi 的 EventBus 每 ResourceLoader 一份，进程内候选各自 loader ⇒ 需要新接口（见 §6.1） | cowboy、tintinweb、workflows、@arhen | esso0428 |
| S-LIFECYCLE 起止 + reason（new/resume/fork/transferred/disposed） | pi-subagents（后台 `events.jsonl` 全套转移 + `subagent:child-status`）、better-subagents（`running/completed/failed/killed/orphaned/lost`）、durable-subagents（`sealed{status∈6}` + `follow-up` 新 generation）、pi-herdsman（`working/blocked/settling/lost` + 请求种类） | tintinweb、gotgenes、@arhen、cowboy、background-tasks | reason 词表（`transferred/disposed`）与对称的 owner 转移事件 | — | — |
| R-ROUND 无 payload 开/闭边 + 身份合成 | — | pi-subagents（`subagent.step.started`→`completed\|failed\|paused\|stopped`）、durable-subagents（turn 边界+generation）、pi-herdsman（子侧 `turn_start/turn_end`+settle） | **round 记录本身**：框架的 open/close 与身份合成需要一个候选可报的 run-cycle 事实 | tintinweb、gotgenes、workflows、cowboy、@arhen、background-tasks、better-subagents（均无 round 概念） | — |
| T-TURN turnId + 价格锚点 + outcome/usage + http + responseId + `unavailable[]` | （usage 部分）pi-subagents、tintinweb、pi-agents、@arhen、workflows（metered 部分）、gotgenes（tokens，无 cost） | 其余候选的 usage 聚合 | **turnId、http status、responseId、请求时刻的目录价**：全部候选都不提供；pi 的 JSON 事件表也没有 http 字段 | — | — |
| R-RUNTIME `{executionId, runtimeMs, status:running\|ended}` 或具名 unavailable | pi-subagents（`runId/childId`+`durationMs`+8 值状态）、better-subagents（`startedAt/endedAt/exitCode`+派生状态）、durable-subagents（`time{exec,active}`+`call` 身份）、workflows（run `durationMs`+per-agent `activeMs`）、background-tasks（`startTime/endTime/status/pid`） | tintinweb、gotgenes（`durationMs`+status）、@arhen（`startedAt/endedAt`+`maxRuntimeMs`）、pi-herdsman（`lastActivityAt`+活性）、pi-agents（`endedAt`+`activity`）、cowboy（内部阶段时间戳） | `executionId` 命名与 `running\|ended` 二值化；`unavailable{reason}` 具名 | — | esso0428（无 `runtimeMs` 字段） |
| IN-INPUT 用户提交输入事件 | pi-subagents（`steer`+`deliveryStatus`+`subagent.steer.*` 全套）、pi-herdsman（`task/steer/interrupt/reply` 持久记录 + `pi.on("input")` 拦截）、pi-agents（`agent_send` + 持久消息日志）、@arhen（`steer_subagent`/`reply_subagent` + `pi.on("input")`） | tintinweb、gotgenes（`ask_parent` 问答）、better-subagents（仅存活子进程）、durable-subagents（`task/steer/notify/follow-up/continue` 邮箱）、workflows（durable human gates） | 「宿主自己归因为用户提交」与扩展提交的区分（OMP 用 `event.source==='extension'` 过滤，pi 的 `input.source` 有 `interactive\|rpc\|extension`） | background-tasks（子进程只吃一次 stdin prompt） | esso0428 |
| V-VIEWED 席位读取 + markers 订阅 | pi-herdsman（读持久化子会话，fail-closed）、gotgenes（原生查看器）、tintinweb（会话查看器+FleetView）、@arhen（`sessionFile` 供 tail）、pi-agents（attach 视图）、workflows（`/workflows` 下钻） | pi-subagents（transcript/fleet，但跨会话被拒）、better-subagents（分页日志） | 「当前显示会话」事实（pi 无 `getViewedSession`）与 markers 订阅 | cowboy（程序化不可读）、background-tasks（仅日志） | esso0428（转录路径在 tmpdir） |

## 6. 需要的接口补充（列出缺口，不替用户选型）

以下每一项都是“要让候选覆盖基线所必需、且当前 pi 或候选未提供”的东西；供应商（pi 上游 / 候选上游贡献 / 本项目适配层）由决策票决定。

1. **跨 owner 的观察范围（F-SCOPE 的 session scope）**
   - 现状：`pi.events` 每个 `ResourceLoader` 一份（`core/resource-loader.ts:379`，可 `options.eventBus` 注入）；进程内候选各自建 loader ⇒ 结构上无法互相观察。
   - 需要的接口（任一）：(a) 宿主提供进程级共享事件总线/注册表；(b) 候选改为发布到 `globalThis` 上的版本化注册表（`@gotgenes` 的 `publishSubagentsService`、`pi-subagents` 的 `Symbol.for` 注册表已是此形态的雏形）；(c) 走候选自己的落盘事实（durable/herdsman/workflows 的 journal/sidecar/mailbox）。
2. **每 execution 的 `{executionId, runtimeMs, status: running|ended}` 归一**
   - 现状：字段名与状态词表各不相同（8 值 / 6 值 / 5 值 / `running|exited` / `wid@rev/key@gen/exec`）。需要一处适配层统一命名，或候选新增该三元组；`unavailable{reason}` 需要候选显式声明（herdsman 的 `complete` 标志是可借鉴形态）。
3. **Round 记录**
   - 现状：无一候选有 round。可选：以候选的 step/run 边（`pi-subagents` 最全）或 turn 边界在适配层合成；若要求候选直供，则是候选上游变更。
4. **Turn 级身份与 provider 边界事实**
   - `turnId`、请求时刻目录价、http status、responseId 在 pi 与候选中都不存在；pi 侧只有 `before_provider_request`/`after_provider_response`（父进程）与 JSON 流的 `message_end`。需要：上游新增字段，或在候选/适配层用 provider 流事件与目录价补算（并把拿不到的部分列入 `unavailable[]`）。
5. **Owner 归属的统一记账**
   - 只有部分候选写 `parentSession` 或等价 owner 字段；需要适配层或候选提供 `sessionId → {kind, parentSessionId, owner, name}`。
6. **“当前显示会话”与 markers 订阅**
   - pi 无 viewed-session 事实（TUI 的 `viewSession` 不是扩展 API）。需要上游接口，或由扩展自持一个只读席位（候选已有只读转录读取的，可复用）。
7. **保活/后续执行的身份延续**
   - OMP 用「既有会话里的新 turn」并发新的 lifecycle `started`；候选里只有 `pi-durable-subagents` 的 `follow-up` generation 与之同构。若要等价语义，需要候选/上游提供“同一 call 的新 generation + 保留会话身份”。
8. **异步 job 静默判据（关轮用）**
   - 框架判据需要 `无运行中异步 job`；pi 无 `getAsyncJobSnapshot`（BaselineResearch 已证）。需要宿主新增，或在候选可报“是否仍有后台子代理”的前提下由适配层合成。

### 6.1 外部前提（非接口，但缺一不可）

| 前提 | 影响候选 | 证据 |
|---|---|---|
| herdr ≥ 0.8（Linux/macOS） | pi-cowboy、pi-herdsman、`@henryqw` 的 herdr 路径 | cowboy README §Requirements；`herdsman extension/herdr.ts:1523-1554` |
| Node 版本地板 | cowboy `>=24.20.0`；herdsman/pi-agents `>=22.19.0` | 各自 `package.json` engines |
| pi 宿主版本与 peer 地板 | pi-subagents 要求 `@earendil-works/pi-ai >= 0.86.1`（宿主为 1.2.0）；herdsman 额外硬依赖 `@howaboua/pi-codex-conversion`；pi-agents 依赖 `pi-durable 1.2.0`/`chord`/`pi-codemode` | 各 `package.json` peerDependencies |
| 许可澄清 | `@zhushanwen/pi-subagent-workflow`（manifest MIT 但**无 LICENSE 文件**且**无仓库**）、`@mjasnikovs/pi-task`（AGPL-3.0-only）、`pi-maestro-flow`/`@selesai/code`/`pi-agent-suite`（npm 无 license） | npm metadata；§3 |
| git worktree / CoW 文件系统 | cowboy（APFS/BTRFS/ZFS 或回退 checkout）、@arhen、workflows、pi-subagents | 各自源码；cowboy README |
| 包发布面 | 只有 `pi-subagents`、`@gotgenes/pi-subagents`（以及 `pi-agents`/`pi-fabric` 等）有 `exports` 映射；其余扩展若要被第三方 import 需上游补 `exports` | §3 表 `exports` 列 |
| 版本升级通道 | pi-subagents 在加载时做版本一致性检查（不一致直接抛错并要求重启，`/reload` 无法替换扩展模块）；pi-herdsman 有 build-identity 校验 | pi-subagents `index.ts:14-17`；herdsman `extension/index.ts:2111-2137` |

## 7. 结论状态

- 候选发现、宿主侧事实、逐候选覆盖对照、分类与接口缺口**已完成**（依据 §3/§4/§5/§6，全部带固定 revision 与 `file:line`）。
- **覆盖结论已与能力基线对账**：BaselineResearch 的基线行（F-/O-/N-/M-/P-/G- 段）已用于本次分类（§5 表首列）。两侧在“pi 无原生子代理身份/注册表/执行耗时、无 `getAsyncJobSnapshot`、无 viewed session”上一致，本文档另证：`pi.events` 是每 `ResourceLoader` 一份（这也是 §5 中 S-SCOPE 一行“需上游”的直接原因）。
- 本票**不批准**任何提供方；不宣称穷尽市场（§1 已记录范围与排除原因）。选型与取舍由 ticket 03 的用户决定。
- 仍**未**验证的事实见 §8；这些不构成对已给结论的撤回。

## 8. 不确定性与下一步问题

1. **运行时行为一概未验证**：全部为固定 revision 的源码/文档/tarball 阅读，没有安装、构建、运行或真实会话。任何“实际观测到的用量/耗时准确性”都需要一次运行验证。
2. **`@quintinshaw/pi-dynamic-workflows` 只有 npm tarball 证据**：声明仓库 404，`raw.githubusercontent.com` 在该环境不可达，`gitHead` 无法核对；其“成本真实但 provider 不报时退化为 `chars/4` 估算”是最值得在选定后实测的一条。
3. **`@zhushanwen/pi-subagent-workflow` 无仓库、无 LICENSE 文件**：只能读 npm tarball 与依赖声明，供应链与再分发许可不明；其“最全的 `AgentOutcome{sessionId,sessionFile,durationMs,usage}`”来源是 pi RPC `get_state`，值得单独核实。
4. **`@gotgenes/pi-subagents` 的类型化 API 只被同一维护者的另一个包消费**：事件 payload 本身**不是**类型化公开契约（只有频道名常量）。若选它，需要上游把 payload 类型也纳入 `dist/public.d.ts`。
5. **`pi-subagents` 的公开面非常宽（16 子路径 + 9 个 RPC 方法 + 8 个频道）**：本次只做了源码阅读，未验证这些接口的向后兼容承诺（无 `docs/` 之外的兼容政策证据）；同时发布节奏快（v0.78.0 于 2026-10-12），pinned-SHA 漂移是主要集成风险。
6. **pi.dev 是市场信号而非能力证据**：页面对 `pi-cowboy` 显示过期版本（0.12.2 vs 0.14.1），且 **没有** `@arhen/pi-core-subagent` 页面（404，但 npm 有 4,512/mo）。
7. **下一步问题（供 ticket 03/04）**：
   - 选择路线时，是优先要“候选提供可导入的公开契约”（pi-subagents / gotgenes），还是优先要“候选把事实落盘、由本项目适配层读”（durable-subagents / herdsman / background-tasks）？
   - 若选择子进程路线，是否需要向 pi 上游请求 turn 级 http/responseId、round 事实、`getAsyncJobSnapshot` 这三项宿主事实？还是接受在适配层补算并把拿不到的部分列入 `unavailable[]`？
   - “跨 owner 的 session scope 观察”是否属于本轮必须？若是，是否接受引入 `globalThis` 版本化注册表（候选上游变更 + 本项目适配）？
   - 是否存在“允许长期 fork”的例外，用于补齐上游不会接受的接口（例如 `parentSession` 写入与 round 记录）？

## 9. 证据限制

- 市场范围是**有界抽样**：pi.dev 的 7 个 `name` 查询（929 个唯一包，521 个焦点候选）加人工排序筛选；`?q=` 参数无效（真实参数是 `name`），`agent` 查询超出 9 页被截断（3137 命中只取 450）。不承诺穷尽。
- 下载量/发布时间为 2026-10-15 的 pi.dev 与 npm 快照（npm `last-month` 窗口约 2026-09-13…2026-10-12），不是趋势。
- 本会话 `find`（语义检索）返回 HTTP 451，本地仓库检索改用精确字面量 grep + 目录枚举 + codebase-memory 符号视图完成。
- 所有候选结论都带固定 revision；`@esso0428`、`@bacnh85`、`@d3ara1n`、`pi-background-tasks`、`@henryqw` 无可用 tag，pin 的是与已发布版本对应的 commit/tarball，报告中已逐条注明。
- 本次**没有**核实各候选的运行时兼容性矩阵（真实 pi 版本 × Windows），也没有核实其在 Windows 上的可用性（cowboy 与 herdsman 明确 Linux/macOS）。
