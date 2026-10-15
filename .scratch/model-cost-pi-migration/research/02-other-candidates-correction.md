# 其余候选的事实复核与勘误（background-tasks / fleet-runtime / process-boundary 三组）

Type: research（勘误与事实收尾；**不批准**任何提供方）
Scope: `research/candidates/{background-tasks-group.md, fleet-runtime-group.md, process-boundary-group.md}` 的全部 12 个候选。
Method: 只读复读固定 revision 的第一方源码/类型/文档 + 定向 grep；主会话另复读 pi 检出 `E:/Developer/myhub/pi`（`@earendil-works/pi-coding-agent@1.2.0`）。**未安装、未构建、未运行、未调用模型**；无任何运行时观察。既有报告的行号在本次复核中普遍存在 ±1~±30 行漂移，本文的 `file:line` 是本轮重新锚定的结果；引用旧报告时应以本文为准。

---

## 0. 本票的修正对象

旧报告（三份组报告 + `02-pi-subagent-candidates-report.md`）有四处结论过强、必须撤回或收窄：

| # | 旧结论 | 裁决 | 依据 |
|---|---|---|---|
| R1 | Turn 身份 / Round 开闭 / 请求时刻锚价在三组候选与 pi 里都缺，「这是**需上游接口**的一致缺口」 | **撤回**。这三项属 framework 拥有的最终语义（`F-TURN` 的 `turnId` 与请求时刻 catalog 价、`F-ROUND-EDGE` 的开闭合成），候选不输出它们**不构成**需上游接口的缺口；本轮只问候选是否给了可归因的原生请求/用量/run-cycle 事实。 | 能力基线 `01-capability-baseline.md` A 段 `F-TURN`（`framework/core/protocol.ts:507,517-,633-,664-`）、`F-ROUND-EDGE`（`:402,449-451,465-`）；见 §3.1 |
| R2 | 「只有两家（pi-subagents / @gotgenes）给第三方可导入或版本化的公开契约；其余只有事件频道/文件/CLI」 | **收窄为分层表述**。按 §2 的分层口径，本三组里至少有：版本化 EventBus 服务（bg `:v1`、pi-agents `protocol:1`、herdsman bootstrap `protocol:1`）、版本化文件接口（herdsman mailbox `version: 5`、zhushanwen `EngineHandleData.v: 1`）、**带 `types` 的可导入模块**（ptc、@henryqw）、文档化 CLI+`--json`（durable）、跨包可导入 typed 契约（zhushanwen 四个 sibling 包）。旧结论把「可 import 的**扩展包**」当成唯一形态。 | §2、§4 |
| R3 | 「跨会话观察在进程内候选里**事先就被堵死**」 | **撤回「事先堵死」**。`resource-loader.ts:379` 只证明**默认不自动跨实例共享**：`this.eventBus = options.eventBus ?? createEventBus()`（`:280` 暴露 `eventBus?: EventBus` 注入点，`:319` 持有），且 pi 的 `EventBus` 只是 `node:events` 包装（`core/event-bus.ts:1-6`，无版本/无请求语义）——任何扩展都可用 `globalThis` 或注入的共享 bus 桥接。 | §3.3 |
| R4 | 「T-TURN 的 responseId / http status 在 pi 的 JSON 事件表里都不存在」 | **撤回（部分）**。`responseId` 是 pi 公开且已文档化的 assistant message 字段，随 `message_end.message` 原样上线；HTTP status/headers 是公开类型化的扩展事件 `after_provider_response`。**但不能反过来说「只剩 framework 的 turnId/catalog 价两项」**——那两项不是「缺口」，是 framework 拥有的最终语义；真正未定的是**各候选是否已把请求事实桥进可观察面、能否可靠归因到某次 execution/会话**，本三组**逐项未证**。 | §3.2 |

另有若干**具体事实修正**（非结论性），逐候选列在 §4：pi-cowboy 的 `exports` 实际存在、pi-agents 的 pi-durable/chord/codemode 是 `dependencies` 而非 peers、herdsman 的 `ControllerScope` 只有两个变体且 `@howaboua/pi-codex-conversion` 是 optional peer、@d3ara1n 有 `main`、@henryqw ephemeral 路径完全无 `model` 事实、durable 的若干行号、ptc 的 `TaskRecord` 声明位置、**以及 @arhen 确实写入 pi 原生 `parentSession`（见 §3.5，原「无一写入」的概括作废）**。

---

## 1. 候选清单：版本 / 安装 / 许可 / 兼容前提（固定 revision）

许可与版本为 `package.json` 字面值；「LICENSE 文件」为仓库/包目录内是否存在许可正文（供应链与再分发前提）。npm 发布元数据（发布日期、下载量）不在本轮复核范围。

| slug | 包名 | 固定 revision | 版本 | `license` | LICENSE 文件 | 安装 | 包种类 / 可口面 | 兼容前提（源码声明） |
|---|---|---|---|---|---|---|---|---|
| bg | `pi-background-tasks` | `799182ff65d7040732aea23b2001ea860b688531` | 2.6.10 | `ISC` | 有 | `pi install npm:pi-background-tasks`（README:94） | 扩展（两个 bundle）；无 exports/bin | `engines.node >=22.19.0`；peer `pi-coding-agent ^0.81.1 \|\| ^0.82.1 \|\| ^0.83.0 \|\| ^0.84.0`（硬区间） |
| better | `pi-better-subagents` | `64aeeaeca7f526431b2cd695962d3fa56d7054c0` | 0.18.0 | `MIT` | 有 | `pi install npm:pi-better-subagents` | 扩展（TS 入口 `./index.ts`）；无 exports/bin | 无 engines；peer `pi-coding-agent >=0.82.1`（开区间地板） |
| durable | `pi-durable-subagents` | `4271b94a330aae1f8e997baff56fe48a298e7522` | 1.0.40 | `MIT` | 有 | `pi install npm:pi-durable-subagents`；bin `pi-durable-subagents` | 扩展 + **CLI**；无 exports | `engines.node >=22.19`；README:37-38「needs pi 1.0.x and Node.js 22.19 or later … tested with pi 1.0.2 on Linux. CI covers Linux and macOS」 |
| cowboy | `pi-cowboy` | `4cf1cb9625e13cbf04fa4f480af82011c97cc13c` | 0.14.1 | `MIT` | 有 | `pi install npm:pi-cowboy` | 扩展；`exports` 指向 bundle（无 `types`） | `engines.node >=24.20.0`、`pnpm >=12`；Linux/macOS + `herdr >= 0.8` 外部二进制 |
| herdsman | `pi-herdsman` | `9545e3ea0832745dfc960228ceda136763291efb` | 0.27.0 | `Apache-2.0` | 有 | `pi install npm:pi-herdsman` | 扩展 + skills；无 exports | `engines.node >=22.19.0`；peer 含 `@howaboua/pi-codex-conversion ^3.0.45`（**optional**）；Linux/macOS + herdr |
| pi-agents | `pi-agents` | `ccdbfbafdffded19b7f47069c0efbefdf1b9bb6d` | 0.32.2 | `MIT` | 有 | `pi install npm:pi-agents` | 扩展（发布 TS）；`exports` → `./src/index.ts` | `engines.node >=22.19.0`；peer `pi-ai\|pi-coding-agent\|pi-tui\|typebox ^1.2.0`；**运行时依赖** `pi-durable 1.2.0`、`chord ^1.2.0`、`pi-codemode ^1.2.0`（旧报告误称 peer） |
| arhen | `@arhen/pi-core-subagent` | `4c837b131df4648b01ae786b333ba6faf2985ab6` | 1.3.68 | `MIT` | 有（repo + 包内） | `pi install npm:@arhen/pi-core-subagent` | 扩展（发布 TS）；`main` = `./src/index.ts`，无 exports | 无 engines；peer 含 `@earendil-works/pi-agent-core *` |
| zhushanwen | `@zhushanwen/pi-subagent-workflow` | **无 git revision**（npm tarball 9.5.1 为唯一证据） | 9.5.1 | `MIT`（声明） | **无** | `npm i @zhushanwen/pi-subagent-workflow@9.5.1` | 扩展 + skills；`main` = `index.ts`；无 exports/bin | `engines.node >=18`；peer 含 `typebox 1.3.27`、`@zhushanwen/pi-pending-notifications`、`pi-structured-output`；**无 `repository` 键** |
| bacnh85 | `@bacnh85/pi-subagent` | `85233b0ea14aa62104593140f9788bcb083e10e4`（包目录 `pi-subagent`） | 0.23.3 | `MIT`（声明） | **无**（repo 根、包目录、tarball 均无） | `pi install npm:@bacnh85/pi-subagent` | 扩展（TS 入口 `./extensions/index.ts`）；无 main/exports/bin | `engines.node >=20.18`；peer `pi-* >=0.80.0 <1.2.0`（旧 pi 区间） |
| ptc | `pi-ptc-subagents` | `9eef7666877e6bff71422609236a577b0dfba628`（tag `v3.2.0`） | 3.2.0 | `Apache-2.0` | 有 | `npm i pi-ptc-subagents@3.2.0` | 扩展；**exports + types** | `engines.node >=22.19.0`；peer `pi-coding-agent >=0.86.0`（开区间地板） |
| henryqw | `@henryqw/pi-subagent` | `7e57ac8e787ef189aea6599b8928839d09657868`（包目录 `extensions/pi-subagent`） | 27.2.0 | `MIT` | 有 | `npm i @henryqw/pi-subagent@27.2.0` | 扩展 + skills；**exports + types** | `engines.node >=22.19.0`；peer `pi-ai\|pi-coding-agent\|pi-tui ^1.1.0`；运行时依赖外部 `@henryqw/pi-herdr`（herdr 路径）；须宿主内 `PI_CODING_AGENT=true` 且 `process.title ∈ {pi, pi-rpc}`（`src/ephemeral.ts:231`） |
| d3ara1n | `@d3ara1n/pi-subagent` | 旧报告称 tag `a39552ba42da617c020f07c2fe35bb5719b76e1e`；**本地浅克隆不可验证**（`packed-refs` 0 命中，工作树 HEAD = `f68c412`） | 3.7.2 | `MIT`（声明） | **无** | `npm i @d3ara1n/pi-subagent@3.7.2` | 扩展；`main` = `src/index.ts`（**存在**），无 exports | 无 engines；peer 含 `@d3ara1n/pi-model-roles *` |

---

## 2. 统一口径：接口分层与覆盖分类

旧报告的「有/无公开契约」混淆了不同强度的接口。本轮统一按下列六层标注（(a)–(d) 属**公开契约**，(e) 属**模型工具输出**，(f) 属**私有实现**）：

- **(a) 公开契约·可导入模块**：npm `exports`（或 `main`）指向可消费产物且带类型声明。
- **(b) 公开契约·事件/协议通道**：`pi.events` 上的频道；**是否自带 `protocol`/版本字段**单列（pi 的 EventBus 本身无版本、无请求语义，见 §3.3）。
- **(c) 公开契约·落盘接口**：文档化或版本化的文件（journal / sidecar / mailbox / CLI 可读日志）；**是否带版本字段**单列。
- **(d) 公开契约·CLI / 工具 / 命令**：文档化 CLI（含 `--json`）或注册给模型的工具/命令面。
- **(e) 模型工具输出**：工具 `result`/`details` 中模型可见的字段。模型可消费，但**不是**第三方只读订阅接口。
- **(f) 私有实现**：进程内字段/常量/env，无发布入口。

覆盖分类沿用基线词表：**已证实覆盖**（公开事实即可满足）/ **可经适配**（事实存在，需适配层归一）/ **需修改提供方**（需候选改）/ **未覆盖**（宿主侧事实不存在）/ **证据不足**（本轮读不到或不可判定）。

**分类硬约束（全文表格同口径）**：

1. 分类只描述「该项事实能否从**公开面**（上列 (a)–(d)）取得，并能否**可靠归因**到 actual session / execution」。
2. **「可经适配」只允许用于「事实已经存在且可从公开面读到，仅需归一/重命名」的情形。** 如果必须读**私有实现（(f)）**，或必须由适配层**新增测量**，一律不得记为「可经适配」；应记为**「需提供方测量/公开出口」**（要求候选改）或**「测量覆盖证据不足」**（现有事实不足以证明覆盖）。
3. 对观测类事实（尤其 `F-RUNTIME` 的耗时），「可读的时间戳」与「可用的测量」是两件事：只可读起止时间戳的，记为「时间戳可读、测量未证明」；把两个时间戳相减得到派生差**不构成**满足 `F-RUNTIME` 的证据。

### 关于「执行耗时」的判定边界（按主会话要求显式说明）

`F-RUNTIME` 只要「**宿主自己测量的**一次 execution 耗时」。候选**自己拥有子代理执行机制**（它 spawn 子进程/建 in-process 会话），因此候选执行器产出的耗时**可以**作为提供方原生事实，不能因为它是 wall clock 就直接否定。判定看四条：

1. 是否**一项 actual execution**（一次 spawn 的 subagent 会话），而不是一次工具调用或一次 delegate 调用（含重试/回退？要单列）；
2. 是否排除**execution 之间的空档**（会话 span 含空档，不算）；
3. 能否经**公开面**读取（(a)–(d) 之一），而不是只能由适配层猜；
4. 有**可归因的执行身份**（executionId 或等价物）。

按此口径（并遵守上节硬约束 2/3）：

| 候选 | 耗时事实（可读） | 性质 | 判定 |
|---|---|---|---|
| durable | ① 公开：`status --json` 的 `startedAt/endedAt`（`src/orchestrator/snapshot.ts:804`）与 `usage`；② **私有**：journal `time{exec,active}`（`src/orchestrator/executor/time.ts:1,6-35,38-42`） | ② 是候选测量、per-exec 且排除 idle（`ActiveTime` 只在非 `asking` 期间累加）——但**只存在于私有 journal**，公开面没有任何字段承载它（`StatusCall` 无 active-time 字段，`cli`/`ui`/`agent` 内 `activeMs`/`activeTotal` 0 命中） | **时间戳可读、测量未证明**：不得因可读起止时间戳或可读私有 journal 就记为「可经适配」；准确记为**「需提供方公开出口」**（把 `time{exec,active}` 或其合计暴露到 (c)/(d)） |
| ptc | `TaskRecord.durationMs`（`src/runtime/task-registry.ts:753-754`）；`TaskRecord` 是落盘记录 | 候选测量，per task（一次后台 spawn） | **部分测量已证实（providers' own executor, per task），完整未证**：`startedAt` 起算点是否含排队/启动等待、是否等同一次 execution 的 active 时间，属提供方事实，须由提供方确认（不是简单适配可解决） |
| better | `startedAt/endedAt/exitCode`（`registry.ts:127-135`）+ `effectiveStatus`（派生） | 两个观测时间戳；无候选测量的耗时字段 | **测量覆盖证据不足 + 需提供方测量出口**（时间戳可读事实保留；派生差不计为 runtime 证据） |
| arhen | `startedAt/endedAt`（`types.ts:27-31`）+ `maxRuntimeMs` 超时报文含 elapsed | 观测时间戳 + 上限 | **测量覆盖证据不足 + 需提供方测量出口**（同上） |
| bg | `startTime/endTime`（`common.ts:229-230`），展示为 `formatDuration(end-start)`（`common.ts:1205`） | 观测时间戳 + 派生差 | **测量覆盖证据不足 + 需提供方测量出口**（时间戳可读；派生差不计为 runtime 证据） |
| pi-agents | `createdAt/stateSince/lastActivityAt/endedAt`（`types.ts:109-118`），注释自述为「when this process last saw the state change」 | 观测时间戳 | **测量覆盖证据不足 + 需提供方测量出口**；且 in-process 候选的「execution」＝会话本身，与 `F-RUNTIME` 的「一次 spawn」语义待对齐 |
| herdsman | `lastActivityAt` 节流写入（`mailbox.ts:38`，`managed-agent-runtime.ts:2095`）+ herdr 活性 | 观测时间戳 | **测量覆盖证据不足 + 需提供方测量出口** |
| bacnh85 | `durationMs = Date.now() - startedAt`（`runner.ts:135`，注释「Wall-clock duration of the run」，赋值 `:349`）；实时 `SubAgentProgress.elapsedMs`（`:107-112`） | 候选测量、per run（in-process 会话）；**无 execution 身份，也无会话归因**（`SubAgentResult` 无 id/owner） | **部分测量已证实（候选自测的单次 run 墙钟），完整未证**：缺执行身份与可归因会话，无法归因到 actual session/execution |
| d3ara1n | `elapsedMs`（`types.ts:182`，注释「spans the whole delegate interval (**incl. fallback retries**)」） | 候选测量，**含回退重试**，即**不是**单一 execution 的耗时 | **需提供方事实**：要拆成 per-execution，必须由提供方给出每次尝试的边界（不是适配层能拆的） |
| zhushanwen | `AgentOutcome.durationMs`（`contract-types-jSa1g28F.d.ts:343`） | 引擎侧产出字段，无墙钟起止，来源与是否含空档不明 | **测量覆盖证据不足**（不可判定） |
| henryqw | 结果上**无**任何时长字段；只有 idle/max 超时记账（`ephemeral.ts:503-506,899-911`） | 非耗时事实 | **未覆盖**（ephemeral）；herdr 侧仅有 lease/session 文件，未复核 |
| cowboy | 仅进程内戳 + `result.md` 的 mtime（`deliverable.ts:44-56`） | 观测时间戳，无 execution 身份 | **未覆盖** |

无一候选在本轮证据下达到 `F-RUNTIME` 的「可经适配」：要么只有可读时间戳（测量未证明），要么测量存在但缺执行身份/会话归因（完整未证），要么测量本身含非 execution 区间（须提供方拆）。`F-RUNTIME` 的可满足形态因此是**候选补公开测量出口 + 可归因执行身份**，而不是适配层读时间戳或读私有 journal。

对照：pi 侧 `ToolExecutionEndEvent.durationMs` 是**工具调用**级（基线 `P-NO-EXEC-DURATION`），一律不可当 subagent execution 耗时。

---

## 3. pi 宿主侧复核（纠正 R1–R4 的依据）

### 3.1 Turn / Round / 锚价属 framework，候选不产出不是缺口

能力基线 A 段已定：Turn 的身份（框架铸造的 `turnId`）、所属 Round、请求当时的 provider/model、**扩展自己的 catalog 在该时刻报的价**、以及 Round 的开闭合成，全部由 `framework/core` + `behaviors` 拥有（`F-TURN`、`F-ROUND-EDGE`、`F-RUNTIME`，`framework/core/protocol.ts:507,517-,633-,664-,402,449-451,465-,758-`）。候选只需给可归因的**原生**事实。因此：

- 任何候选「没有 round 记录」「`turnId` 不是 provider id」「没有请求时刻目录价」**不构成**「需上游接口」；
- 正确的问法是：候选是否公开了「本宿主 run-cycle 的开/闭事实」「逐 assistant 消息的可靠 usage」「发起请求时的 provider/model」。**判定必须按路径逐项做**，不能从「候选整体具备某项事实」反推「某项子事实已覆盖」：例如「有聚合 usage」**不能**推出「有逐请求/逐 turn 请求事实」，`F-TURN` 要的是可归因到单次请求的 provider/model/usage；「有 run 边界」也不能自动算作 round 事实。每一项按 §2 的硬约束单独判：只能读私有内部、或需要候选新增出口/新增测量的，记为**需提供方出口**或**证据不足**，不得写「可经适配」。故三份旧报告的 R-ROUND/T-TURN「需上游接口」列应改为「由 framework 合成」+「候选事实**按路径逐项核**」。

### 3.2 `responseId` 与 HTTP status 是 pi 的公开事实（R4）

- assistant message **有** `responseId`（`packages/ai/src/types.ts:576-577`，注释「Provider-specific response/message identifier when the upstream API exposes one」），并有 `responseModel`、`providerThinkingLevel`、`diagnostics`；`docs/message-types.md:127-143` 明列为公开字段。各 provider 实现均写入（anthropic `api/anthropic-messages.ts:698`、openai-completions `:564`、openai-responses `:583/:627`、google `:110`/`vertex:119`、mistral `:614`、bedrock 经 headers）。
- JSON 模式**原样透传**该消息：`modes/json-event.ts:48-51` 只对 `message_update` 做投影，其余事件原样返回；故 `message_end.message.responseId` 就在线上（`docs/json.md:40-43,66-68`）。也就是说：**已在解析 `message_end` 的候选（bg/better/durable/ptc/henryqw/d3ara1n/arhen/bacnh85）在其收到的 message 对象里就带着 `responseId`（当该 provider 提供时）**，只是**没有外露**——它们自己吃掉了解析结果，未把该字段纳入任何 (a)–(d) 公开面；因此这是「候选未桥接」，不是「宿主没有」。**分类规则**：只有当某候选把这条 `message_end` 消息（或其中的 `responseId`）**保留到它的公开通道**（(a)–(d)：事件 payload / 工具 `details` / 落盘记录）时，才可记为**可经适配**；解析后即丢弃、只在内部使用的，记为**需候选出口**（HTTP status 同理——须由子进程内扩展抓取并公开，pi 侧不会自动把它送进候选的公开面）。
- HTTP status/headers 是公开类型化的扩展事件：`AfterProviderResponseEvent{type, status: number, headers: Record<string,string>}`（`extensions/types.ts:917-921`），注册面 `on("after_provider_response", …)`（`:1636`）；配套 `before_provider_request{payload}`（`:901-904`，注册 `:1632`）与 `provider_stream_event`（`:923-927`，`docs/extensions.md:108-112`）。它是**子进程内扩展**能拿到的观察点（`pi -e <file>`，`docs/cli.md:194-195`；`--no-extensions` 仍可显式 `-e`，`:196-197`），所以让子进程带一个自带扩展即可把 HTTP 事实带出来——**需候选配合，但不需改动 pi**。
- 结论：`responseId` 与 HTTP status **不是**宿主缺口，而是「候选尚未桥接 / 未外露」的事实。要成为可用事实，还须逐项确认：(i) 该候选是否真把 `message_end.message` 的 `responseId`、或子进程内 `after_provider_response` 的 status/headers 带进 (a)–(d) 的公开面；(ii) 能否**可靠归因**到具体的 actual session / execution。这两点在本三组候选里**逐项未证**（见 §4 各候选的「用量与请求」段）。
- 反向表述同样要避免：不因为候选没外露就说「宿主没有」；也不因为宿主有就说「候选已覆盖」。framework 的 `turnId` 与请求时刻 catalog 价由框架铸造/扩展自报（`F-TURN`），既不属宿主缺口，也不由候选提供。

### 3.3 EventBus 的共享语义（R3）

- `EventBus{emit(channel, data), on(channel, handler)}`，实现是 `node:events` 的薄包装（`core/event-bus.ts:1-6`）；**无版本、无请求/应答、无跨进程传输**。
- `ExtensionAPI.events: EventBus`（`extensions/types.ts:1916-1917`）是公开成员。
- `DefaultResourceLoader` 默认**每实例**一个：`this.eventBus = options.eventBus ?? createEventBus()`（`core/resource-loader.ts:379`），但构造参数暴露 `eventBus?: EventBus`（`:280`），并在装载扩展时一路透传（`:699,724,737,1147`）。
- 结论：pi 只**没有自动跨实例共享**；共享 bus 可由宿主注入，任何扩展也可用 `globalThis`。旧报告「事先堵死」不成立；正确的表述是「跨 owner 的 session-scope 观察需要一处进程级登记（宿主注入共享 bus，或候选把事实落到 `globalThis`/文件），而不是被 pi 禁止」。

### 3.4 子会话身份：`--no-session` 仍发布 header id

旧报告把 `--no-session` 的候选（ptc 前台、@d3ara1n、@henryqw ephemeral）判为「没有 session id 可言」。复核：

- `--no-session` = 「Utilizes an in-memory session that is not persisted」（`docs/cli.md:98-99`），实现为 `SessionManager.inMemory(cwd, {id?})`（`src/main.ts:364-365`）。
- `SessionManager.inMemory` → `new SessionManager(cwd, "", undefined, /*persist*/ false, options, entries)`（`core/session-manager.ts:1804-1806`）；构造函数在无 session file 时调用 `newSession()`（`:1015-1020`），后者**无条件**铸造 `this.sessionId = options?.id ?? createSessionId()` 并写 header（`:1061-1071`）；`getHeader()` 返回它（`:1505-1508`）。只有**文件路径**受 `persist` 门控（`:1078-1082`）。
- JSON 模式在启动时把 header 作为第一条记录写出：`if (mode === "json") { const header = session.sessionManager.getHeader(); if (header) writeRawStdout(...) }`（`modes/print-mode.ts:122-127`；文档 `docs/json.md:23-27`）。
- 因此：`--mode json --no-session` 的子进程**在 stdout 第一条 JSON 记录里就带 `id`**，只是**不落盘**。RPC 模式不发 header，但 `get_state` 返回 `sessionId` + `sessionFile`（`docs/rpc-commands.md:155-179`）。
- **分类（按路径，不按整项）**：宿主侧——**pi 公开可用**（JSON 第一条记录 / RPC `get_state`），即该事实并不缺；候选侧——**公开归因证据不足 / 需候选出口**：三个候选都不读它（ptc `src/runtime/` 无 header/`get_state` 处理；@henryqw `extensions/pi-subagent/src` `grep sessionId` **0 命中**；@d3ara1n 手写 RPC 帧，代码中 `RpcClient` 0 命中，只把 ack 丢弃，`spawn.ts:445` 区段），因此**无法从任何候选公开面归因到该子会话**。**不得**把整项 S-IDENT 记为「可经适配」，也**不得**因宿主可用就写「已覆盖」（适配层读不到候选吞掉的子进程 stdout）。

### 3.5 关于 pi 原生 `parentSession`（语义是 fork 血缘；12 个候选里只有 @arhen 写入）

- 会话 header 的 `parentSession` 只在 fork/clone/`newSession({parentSession})` 时写入（`core/session-manager.ts:1681`（fork）、`:1854`（clone）、`:1069`（显式传参）；文档 `docs/session-format.md:72-76`）。`SessionManager.findById` 靠读 header 的 `id` 发现文件（`:1880-1884`）。
- 文件命名 `<fileTimestamp>_<sessionId>.jsonl`，`fileTimestamp = timestamp.replace(/[:.]/g, "-")`（`:1078-1082`）——zhushanwen 的回退查找正是按 `_${sessionId}.jsonl`（`pi-subagent-cli dist/chunk-K3KTNCBH.js:733`）。
- **修正：原「12 个候选无一写 `parentSession`」不成立。** @arhen **确实写了**——`SessionManager.create(childCwd, undefined, { parentSession: getParentSessionFile(ctx) })`（`arhen …/packages/core/pi-core-subagent/src/manager.ts:625`，解析器 `:93-99` = `ctx.sessionManager.getSessionFile?.()`）；该参数经 pi 的公开 SDK 路径落成子会话 header：`SessionManager.create` = `new SessionManager(cwd, dir, undefined, /*persist*/ true, options)`（`pi …/core/session-manager.ts:1755-1758`）→ 构造函数 `newSession(options)`（`:1015-1020`）→ header `parentSession: options?.parentSession`（`:1069`）→ 因 `persist` 为真而写入子 JSONL。**故 arhen 的子会话文件里 `parentSession` = 父会话文件路径**，第三方读该 header 即可拿到直接父链（本三组里唯一如此者）。
- **否定结论的范围**：其余 **11** 个候选在上列固定 revision 的源码/发布物的 `grep 'parentSession|parent_session'` 中 **0 命中**（唯一命中是 zhushanwen `pi-subagent-cli dist/index.d.ts:405` 的**类型声明**，无赋值点，且其 spawn argv 无 `--parent-session`）。这一否定结论的边界：它只覆盖本轮固定的那些树（对 `@zhushanwen` 即其 tarball 与依赖 dist；对无 `dist` 的候选即 `src`）；若某候选经本树之外的中介（例如另行安装的 helper 包）间接写入，本轮的 grep 会漏。判定以「本轮固定树」为准。
- 语义提醒：pi 把 `parentSession` 定义为 fork/clone 血缘（`docs/session-format.md:72-76`）。arhen 是把该字段**兼作**「子代理的父会话」；对消费者来说它是可读的直接父链事实，但**不等于** F-STATE-INHERIT 的 Owner 解析（Owner 仍是「最近的顶层 main」），需在适配层按会话图解析。
- pi **不**提供「子代理属于哪个主会话」的原生字段；`PI_SESSION_ID/…/PI_REASONING_LEVEL` 是**shell 工具**的会话环境（`docs/environment-variables.md:25-30`），且在显式关闭会话元数据时会被移除以免嵌套 pi 读到过期父会话信息（`:73`）。`PI_SUBAGENT_PARENT_SESSION` 在 pi 源码 **0 命中**——那是 herdsman 自造的约定。
- 其余候选的父链仍须由候选自有记账（owner 字符串/邮箱/侧车/目录名）或适配层重建；**不要**把「没写 `parentSession`」当作上游缺口（pi 的这个字段从来不是为「子代理父链」设计的）。

### 3.6 用户输入与「查看会话」（F-INPUT / F-VIEWED 的宿主边界）

- `InputEvent{text, images?, source: "interactive" | "rpc" | "extension", streamingBehavior?: "steer" | "followUp"}`（`extensions/types.ts:1170-1181`），注册面 `on("input", …)`（`:1664`），结果 `continue|transform|handled`（`:1184-1187`）；文档把「raw input」列为事件覆盖范围（`docs/extensions.md:104`）。→ pi 侧**存在**宿主归因的用户输入事实，且 `source` 正好用于区分扩展自己提交的输入。旧报告 §2.5「用户输入事件：无」是错的（该票 Handoff 已记录同一勘误，本文确认）。
- pi **没有** viewed-session 事实（基线 `P-NO-VIEWED`）；而 `F-PORT` 明确 `viewedSession?` 是**可选且可省**的出口，adapter 拿不到就整体省略，extension 得到「没有这个事实」。→ 三组候选中任何「会话查看器/转录读取」都只是**读一份转录**，不构成 `F-VIEWED` 的席位+markers 订阅；宿主侧未覆盖，**不是候选缺陷**。

---

## 4. 逐候选复核

每组先给「接口分层」，再给基线与 F-* 边界。所有 `file:line` 均为本轮在固定 revision 上重读所得。

### 4.1 `pi-background-tasks` (bg) — background-tasks 组

**接口分层**
- (b) 两个**版本化** EventBus 服务（任务粒度）：`pi-background-tasks:request:v1` / `:response:v1` / `:terminal:v1`（`src/core/extension-api.ts:12-14`，schema 名也带 `.v1` `:15-17`），ops `capabilities|run|status|logs|kill`（`:34`）；宿主侧 `pi-background-tasks:host:request:v1` / `:response:v1` / `:changed:v1`（`src/core/host-protocol.ts:14-19`），`HOST_OPERATIONS` 见 `:41-52` 与 `:54-66`（**旧报告 `:13-18`/`:48-72` 行号不准**）。
- (c) 落盘：`<cwd>/.pi/delegate/<session>-<pid>/<taskId>/` 的 manifest/result（`src/core/delegate/artifacts.ts:44-48`，`:186` `state: 'launched'`），含 `child_session_id`/`child_session_dir`（`:69-70`）。
- (d) 模型工具面 11 个（`bg_delegate`/`bg_result`/`bg_run`/`bg_run_pi_attested`/`bg_status`/`bg_logs`/`bg_kill`/`fusion_*`）+ 命令；**无 CLI、无 `bin`**。
- (e) delegate 在公开面只作为一个快照字段 `delegate?: DelegateTaskFacts`（`src/core/common.ts:251`）。
- (f) delegate 生命周期**没有**专用频道、没有导出 API（`extension-api.ts` 内 grep `delegate` 只命中类型引用）。

**身份与父链**：子会话 id 随机且与父无关——`makeDelegateChildSessionId()` = `` `delegate-${randomBytes(16).toString('hex')}` ``，注释「Child session ids are random and never derived from the parent session」（`launch.ts:50-52`）；经 `--session-id`/`--session-dir` 下发（`:303-306`）；子进程 env **显式删除** `PI_SESSION_ID/PI_SESSION_FILE/PI_PROVIDER/PI_MODEL/PI_REASONING_LEVEL`（`:330-336,351`）。无 `parentSession`（全仓 grep 0 命中）。owner 只体现在 artifact 目录名（`artifacts.ts:157-162`）与内部 `parent_leaf_id`（`src/core/delegate/types.ts:124`）。→ 子会话 **id/目录可经适配**（二者都在模型可见 `details` 与 manifest 里，`(c)`/`(e)` 可读）；**父链未覆盖**（无任何公开的 parent link，适配层必须自己记账 owner，不得从 artifact 路径「推断即断言」）。

**用量与请求**：结果包 `parseUsage` 产出 `{input,output,cacheRead,cacheWrite,totalTokens,cost{…total}}`（`result-package.ts:162,207-220,465`），来源是子消息的 provider usage（`delegate-child-extension.ts:897-925`，其中 `message_end` 也读到 `provider`/`model`）；模型可见面**只有** `usage.status`（`delegate-extension.ts:1007`，文本行 `:1013`）。旧的「`src/` 内无 `turnId|responseId|httpStatus`」表述**不成立**：`src/core/anthropic-attribution.ts:443,653,1684,2355,2506,3271` 有 `readonly responseId?: string`（属另一扩展，非 delegate 事实）——结论（delegate 不暴露逐 turn 请求事实）仍成立。

**执行耗时**：`BgTaskSnapshot{status,startTime,endTime,pid,bytesWritten}`（`common.ts:221-234`）；无 `runtimeMs`（grep 0），展示为 `formatDuration(endTime-startTime)`（`common.ts:1205`）。→ **测量覆盖证据不足 + 需提供方测量出口**（起止时间戳可读；`formatDuration` 的派生差不计为 runtime 证据）。

**续跑/保活**：明确拒绝——`host-api.ts:210`（「agent shell tasks launch model work and are not rerun from the host interface; start a new run through bg_run or /bg --agent」）；dock rerun 只允许 shell 任务（`extension.ts:595-601`，`isAgent` shell 任务仍可）；`surviveReload` 对 agent 任务抛错（`registry.ts:1378-1383`）。→ **未覆盖**（派生新 run）。

**观察范围**：服务安装在进程内、任务粒度，ops 把 `run|kill|stop|stop_all|rerun` 与 `list|detail|logs` 放在**同一个**服务与同一 ops 表里（`host-protocol.ts:54-66`）→ **观察与授权未分离**；「单 sessionId 绑定」（`host-api.ts:243,296-297`）本轮**未复核**，记为证据不足。

**F-* 边界**：`F-STARTUP` **可经适配**——`DelegatePinnedRoute{qualified_id,context_window_tokens,thinking_level,origin}`（`types.ts:56-61`）写入 manifest（`artifacts.ts:72,180-181`），可作「首启 provider+model+有效 effort」的持久证明；`F-STATE-INHERIT` 仅**路径**可归因（无 header）；`F-LIFECYCLE-IMPL` **证据不足**（旧报告自述未读完 `registry.ts`）；`F-INPUT` **未覆盖/不适用**（子进程只吃一次 stdin prompt：`launch.ts:299-302,410`，投递 `registry.ts:779-791`）；`F-VIEWED` **未覆盖**（`bg_logs/bg_status/bg_result` 存在，但 bg 从不读子会话文件，`grep session.jsonl` 0 命中，路径只能靠 glob 推导）。

### 4.2 `pi-better-subagents` (better) — background-tasks 组

**接口分层**
- (b) **无**运行观察频道：全包 bus 只用于 harness 管线（sandbox policy/delegation mode/goal provider），grep 后**不存在** run 级通道。
- (c) `<tmpdir>/pi-better-subagents/runs/<id>/meta.json` + `output.log`（`registry.ts:185-199`）；`sessionsDir()` = `<baseDir>/sessions`（`:191-193`）。
- (d) 模型工具 `subagent_spawn|_spawn_batch|_list|_output|_result|_stop` + `agents_catalog` + `failure_disposition`；命令 `/agents`、`/subagents`；无 CLI/bin。
- (e) 成本行只在 `include:["cost"]` 时出现（`output-payload.ts:429-431`）。
- (f) `RunMeta` 内部字段（`registry.ts:78-190`，**旧报告 `69-181` 偏移**）。

**身份与父链**：run id **就是**子会话 id——`["-p","--mode","json","--session-dir",childSessionDir,"--session-id",id,…]`（`index.ts:1804-1807`），`RunMeta.sessionId`（`registry.ts:139`）与 meta 写入（`index.ts:1866-1880`）；父位以 `spawnPid` + `spawnPidStartTime`（`registry.ts:109,117`）+ `callbackOrigin{cwd,sessionId?}`（`:32-35,141`）表达；无 `parentSession`（grep 0）。→ **已证实覆盖**（归属是真实谓词 `belongsToOrigin`，`registry.ts:1183-1196`）。

**用量与请求**：`parse.ts:1239-1253` 按 `message_end` 累计 `{input,output,cacheRead,costUSD,total}`，cost = `usage.cost?.total`（provider 上报）；无 turnId/responseId/httpStatus 外露。

**执行耗时**：`RunMeta.startedAt/endedAt/exitCode`（`registry.ts:127-135`）+ `effectiveStatus`（`:1206-1211`）；另有持久化 `timing` 策略（`:173-181`）。→ **测量覆盖证据不足 + 需提供方测量出口**（时间戳可读事实保留；派生差不构成 runtime 证据）。

**续跑/保活**：steer 走文件 + 子侧扩展，**仅存活期**——`STEER_FILE_ENV = "PI_SUBAGENT_STEER_FILE"`（`child-steer.ts:23`），idle 检查 `:66`，`pi.sendUserMessage(text,{deliverAs:"steer"})` `:70`，`.delivered` 回执 `:76-80`；工具清单里**没有** resume/continue。

**观察范围**：`runInListScope` 支持 `all:true` 机器全局（`output-payload.ts:157-168`，`ownership()` 在 `:175`——**旧报告把 157-168 标为 `ownership()` 有误**），`tools.ts:325-328` 文档化该开关；**缺口**：`subagent_stop` 只收 `{id}`（`tools.ts:508-515`），无 `all:true` 逃逸。→ 观察/授权在工具层分离，但 stop 面不完整。

**F-* 边界**：`F-STARTUP` **可经适配**（`RunMeta.model`/`effort` 注释「Reasoning effort passed to the child via Pi's --thinking option」，`registry.ts:124-126`；无 resume/fork 可歧义）；`F-STATE-INHERIT` 由 owner 会话 + `by-origin/<sha256(cwd\0sessionId)[0:24]>` 索引承担（`registry.ts:1190-1196`）；`F-INPUT` 仅存活期（同上）；`F-VIEWED` 读 `output.log` 解析结果，**从不读**子会话文件——但 `cleanup.ts:238-278` 会遍历 `sessionsDir()` 按 mtime 清理（仅删除匹配，不解析内容），故「never reads」应写为「never parses」。

### 4.3 `pi-durable-subagents` (durable) — background-tasks 组

**接口分层**
- (a) 无 importable 模块；有 **bin** CLI。
- (c) **文档化的公开事件日志**：`src/events/types.ts:1-5`「The public shape of the cross-workflow event log. Changing a field here changes the public contract.」；README:423-426 明说 `events --all` 供无守护进程的程序轮询。**注意该公开契约的范围**：它承载生命周期/状态类事件（`submitted/started/sealed/fenced/workflow-done/waiting/moving/attention…`，`events/types.ts:16-46`），**不承载 `time`/`usage` 数值**。
- (d) **CLI 契约**：`parseArgs` 命令集（`src/cli/main.ts:22`）为 `smoke|tail|status|events|start|resume|drain|stop|stop-all|prune|restart|leases|doctor|install-service|uninstall-service|help`；`hold|chaos|drill|run|send|describe` 在 `main()` 里**预分派**（`:168-170,177`）；`--json` 白名单严格为 `status|events|tail|doctor|leases`（`:62`）。**旧报告把预分派命令混进 :22 的集合，需修正。**公开 JSON 里可读的是 `usage` 与 `startedAt/endedAt`（`snapshot.ts:776,802-804`），**不是** per-execution active 时间。
- (f) journal 里的 `usage`/`time` 条目是**私有**（`src/orchestrator/executor/usage.ts:1`「Private entries (P31)」、`time.ts:1`「Private journal entries (P18, V6)」）；公开事件联合**不含** usage/time 字段（`events/types.ts:16-43`）。**(c)+(f) 不矛盾**：公开的是事件日志与 `status --json`，私有的是 journal 的 `usage`/`time` 数值；`time{exec,active}` **没有任何公开 CLI/JSON 读出口**（见本节「执行耗时」与 §2）。
- (e) 模型工具 `subagents`（9 个 action，`src/agent/main/schema.ts:6`；send kind `steer|notify|follow-up|answer|model`，`:15-16`）。
- (b) 无 `pi.events`（grep 0）。

**身份与父链**：`wid`/`key`/`gen`/`exec` + `call="<wid>@<rev>/<key>@<gen>"`；owner 是持久字符串 `` `main:${context.sessionManager.getSessionId()}` ``（`src/agent/main.ts:132`）与 `orchestrator.jsonl` 的 `{rid,wid,origin}`（`src/types.ts:161`）；fork 语境带 `origin{sessionFile,leafId}`（`types.ts:205-206`，发布点 `main.ts:285-286`）；**不写** pi `parentSession`（grep 0）。子会话文件路径确定：`callSession = <home>/w/<wid>/x/<key>@<gen>/session.jsonl`（`src/paths.ts:27-28`），并由 question 关注项直接交出（`src/orchestrator/executor/index.ts:682`）。→ **已证实覆盖（本组最强）**。

**用量与请求**：`messageUsage()` 按 `message.id ?? timestamp ?? contentHash` 去重（`usage.ts:9-15`），`costUsd: raw.cost?.total ?? 0`（`:14`）；逐 turn provider/model 作为私有观察存在（`message_start → {provider, model}`，`:47`）；公开面是 `status --json` 的 per-call/per-workflow `usage`（`snapshot.ts:45,85,776,804`）。**旧报告引用的 `usage.ts:59-63/79-95/107-111` 与 `time.ts:15-59` 在该文件不存在**（文件只有 50/42 行）——结论成立、行号须替换为本文值。

**执行耗时**：**分开两件事**——(i) 公开面：`status --json` 的 `startedAt/endedAt`（`snapshot.ts:804`）与 `usage`，属观测时间戳/用量；(ii) **私有面**：per-execution 的 active 时间只在私有 journal `time{exec,active}`（`time.ts:1,6-35,38-42`，`ActiveTime`/`activeTotal`），**没有任何公开 CLI/JSON 字段承载它**（`StatusCall` 无 active-time 字段；`cli/`、`ui/`、`agent/` 内 `activeMs`/`activeTotal` 0 命中；`snapshot.ts:802` 的 `active?: true` 只是「仍在跑」的布尔）。公开事件联合亦无耗时（`events/types.ts:36,40` 只有 `exec` 身份）。→ **时间戳可读、测量未证明 + 需提供方公开出口**：不得记为「可经适配」。

**续跑/保活**：sealed call 的 steer 被拒并指明正确动词（`src/orchestrator/engine.ts:389`），follow-up 开新 generation（**旧报告 `executor/index.ts:1035-1043` 实为 `observeExecution` 选项块**；正确位置 `engine.ts:557 openGeneration` / `:583`、`executor/generation.ts`）；follow-up 未送达可恢复（`executor/index.ts:331-334`）。

**观察范围**：session 作用域 helper（`main.ts:154 ownWorkflows`）与机器全局 `events --all`（`paths.ts:11`）；事件日志**不带** owner/session（`events/types.ts:16-36`），纯日志消费者必须经 `status`/`describe` join；`send`/`stop` 在 orchestrator 侧**无 owner 校验**（`engine.ts:388-418` 只按 seal/epoch/内容拒绝）。

**F-* 边界**：`F-INPUT` **已证实覆盖**——子邮箱 kind `['task','steer','notify','follow-up','continue']`（`src/agent/child.ts:18`）加 `answer`（`:27-30`），落在 `turn_end`/`agent_before_settle`（`:16,227,229`），交付词表 `steered|held-until-answer|noted`（**实际 `src/agent/main/tool.ts:73-81`，旧报告 `:22-27` 错**）；`F-STARTUP` **已证实覆盖**（`--model/--thinking` 仅在 `!continuation` 时施加，`src/compat/pi-args.ts:18,29-36`）；`F-LIFECYCLE-IMPL` **证据不足**（会话切换寿命未读完 `snapshot.ts`/`engine.ts`）；`F-VIEWED` 读 CLI `status/events` 与 in-session UI，**不**是席位订阅。

### 4.4 `pi-cowboy` — fleet-runtime 组

**接口分层**：(a) `exports` **存在**但只指向打包 bundle——`{".": "./dist/index.js", "./package.json": "./package.json"}`，**无 `types`**（旧报告正文承认、摘要的「no exports」不成立）；(b) **0 通道**（`grep 'pi\.events|emit\('` 于 `src/` 0 命中）；(c) 唯一跨进程事实是 `<tmpdir>/pi-cowboy/<agentId>/result.md`（`src/paths.ts:66-68,79-81`；`src/subagent/deliverable.ts:5-8`「a run's deliverable is a file on disk, not a message … No protocol carries it」）；(d) 5 个工具（`src/registration.ts:38-44`）+ `/cowboy`（描述 `:262-264`），无 `--json`；(f) 阶段机 `queued|launching|active|settling|settled` 等纯内部。

**身份与父链**：子代理身份是扩展自造的 spawn id + `cow-<task>-<id>` + pane + worktree/branch；`grep sessionId` 于 `src/` **0 命中**，唯一 session 文件引用是**父**会话（`agent-runner.ts:178-187,422-425`，用于 `--fork`）。→ **未覆盖**。

**用量/请求**：**零**（结构字段 0 命中；只解析 codex 的模型列表）。**执行耗时**：进程内戳 + result.md mtime（`deliverable.ts:44-56`），无 execution 身份 → **未覆盖**。

**续跑**：`steer` 可唤醒已 settle 的 agent（`subagent-session.ts:301,320,335`，`revive` 体自 `:357-359`；**旧报告 `:335-385` 与 `src/index.ts:47` 锚点不准**，`:47` 实为 `}`，有效锚点 `:52`（须在 herdr 内）与 `:54`（`detectSubagentSpawn()`））。

**嵌套**：**刻意禁止**（同上 `:52,54`；子进程 `--no-extensions` 见 `harness/pi-compatible.ts:56-62`）。

**观察范围**：无程序化观察面；只有人看 pane。→ **未覆盖**。

**F-* 边界**：`F-STARTUP` 仅 argv 可证（`harness/pi-compatible.ts:43-47`），无可落盘回读的「首启 provider+model+effort」；`F-STATE-INHERIT` 不可用（`--fork` 只传父会话文件，无 owner/session 字段）；`F-INPUT` 非结构化（把文本投进 pane）；`F-VIEWED` 程序化不可读（无子会话 id）。前提：Linux/macOS + `herdr >= 0.8` + `node >= 24.20.0`。

### 4.5 `pi-herdsman` — fleet-runtime 组

**接口分层**：(b) **带协议版本的** EventBus 协议 `pi-herdsman:managed-agent-bootstrap`，payload `{protocol: 1, phase: "prepare"|"initialize", …}`（`extension/core.ts:31-32`；发射 `extension/agent-controller.ts:5700-5701`、`extension/managed-agent-runtime.ts:2865-2866`）；(c) **带版本的文件邮箱** `ManagedAgentState{version: 5, …}`（`extension/mailbox.ts:27-28`），目录按 `sha256(workspaceId\0agentLabel)`（`:237-241`），记录 `RequestRecord`（`kind: task|steer|interrupt|reply`，`:76-90`）与 `ResultRecord`（含 `contextUsage{tokens,contextWindow,percent}`，`:105-130`）；(d) 两套工具/命令（agent tree + supervision）；(f) 子进程 env `PI_HERDSMAN_*`（`agent-controller.ts:5764-5780`）为私有传递面。

**身份与父链**：`ManagedAgentState` 含 `ownerSessionId`（`:31`）、`piSessionId`/`piSessionFile`（`:35-36`）——本组最完整；子会话身份还可从 herdr `agent_session` 回读。→ **已证实覆盖**。修正：`ControllerScope` **只有 2 个变体** `lead`/`managed-agent`（`agent-controller.ts:1742-1748`），第三个是 *Role* 枚举值 `unmanaged`（`extension/index.ts:377`）——旧报告「three explicit scopes」把角色与 scope 类型混述。

**用量与请求**：`sessionUsageTotals`/`collectSessionUsage` 遍历子会话 JSONL 的 `usage` 条目与 assistant `message.usage`，键 `${provider}/${model}`，`totals.cost += usage.cost.total`，并以 `complete=false` 命名不完整覆盖（`agent-controller.ts:7658,7692,7747`）。来源 = provider 持久化 usage，**非估算**；**无** per-turn 表、无 httpStatus/responseId。

**执行耗时**：`lastActivityAt` 节流写入（≤5s；`mailbox.ts:38`，`managed-agent-runtime.ts:2095`）+ herdr 活性 → **测量覆盖证据不足 + 需提供方测量出口**（`lastActivityAt` 等时间戳可读事实保留；无候选测量的 per-execution 耗时）。

**续跑/保活**：`continue_agent`/`resume_project`/`steer_agent`/`reply_agent` + durable mailbox；转录读回 **fail-closed**——缺 `piSessionId`/`piSessionFile` 时 `fail("target_not_found", "Agent has no persisted Pi session identity", "transcript")`（`agent-controller.ts:1471-1476`，**旧报告 `:1467-1472` 偏移**）。

**观察范围**：scope 类型化并在文档里明说「descendant visibility does not imply authority」；build-identity 门禁 `BUILD_COMPATIBILITY_ERROR_PREFIX = "Incompatible Pi Herdsman build:"`（`index.ts:385`）与 `requireCompatibleBuild/sameRuntimeBuild`（`:2111-2112`）。**旧报告称 `@howaboua/pi-codex-conversion` 是 hard peer 不准确**：`peerDependenciesMeta` 标 `optional: true`。

**F-* 边界**：`F-STARTUP` **过度陈述需收窄**——`ManagedAgentState` **不含** model/thinking（`mailbox.ts:27-49`），有效 model/effort 只有 argv（`agent-definitions.ts:949-953`）与**逐 turn** pane metadata（`managed-agent-runtime.ts:1385-1400`，非首启）→ `F-STARTUP` 归为**需提供方出口（部分）**：首启事实在公开面缺位，逐 turn 的 model/thinking 虽已在 herdr pane metadata 面可读，但不满足「首启证明」；`F-INPUT` **已证实覆盖**（`pi.on("input", …)` 保留前缀拦截，`managed-agent-runtime.ts:1024-1027`）；`F-VIEWED` 读持久子会话（fail-closed）+ `inspect_*` 读 herdr 活终端——是转录读取，不是席位订阅。

### 4.6 `pi-agents` (mavam) — fleet-runtime 组

**接口分层**：(a) `exports {".": "./src/index.ts"}`（发布 TS）；(b) **版本化公开频道** `pi-agents:state` + `pi-agents:state:request`，快照 `{protocol: 1, sessionId, instanceId, sequence, type: "snapshot"|"stopped", agents:[{id,name,state,closed}]}`（`src/pi/events.ts:10,14,26-30`，发布 `:135-148`），并**刻意只含生命周期**（`:17-19`「excludes prompts, results, and mutable activity」）；(c) 另在**父会话**里追加自定义转录条目类型 `pi-agents:message`（`src/pi/transcript.ts:22`）；(d) 6 个工具 + 3 个命令；(f) pi-durable 的 `UsageState` 为内部依赖。

**身份与父链**：`AgentInfo{id,name,profile,job,cwd,model,thinking,tools,state,closed,createdAt,stateSince,lastActivityAt,endedAt,usage,activity,result,graph,delegates,queued}`（`src/agents/types.ts:99-134`；**旧报告漏列实际存在的 `unanswered`/`jobAnswer`，`:124-128`**）；存储按**父会话 id** 分目录（`src/pi/session.ts:47-48,104-107`），快照带 `sessionId`。→ **已证实覆盖**（归因依据是公开的目录键 + 快照字段）。

**用量与请求**：`summarizeUsage` 按 per-model/per-tool 桶汇总 `cost?.total`（`src/agents/derive.ts:93-108`）+ 在途 partial（`:111-125`）；receipt `ReceiptUsage` 带 `RECEIPT_VERSION = 1`（`src/agents/receipts.ts:22-29`）。无 per-turn provider/httpStatus/responseId。修正：pi-durable / chord / pi-codemode 是 **`dependencies`**（`package.json`），不是 peer。

**执行耗时**：`createdAt/stateSince/lastActivityAt/endedAt`（`types.ts:109-118`，注释明说「when this process last saw the state change」）→ **测量覆盖证据不足 + 需提供方测量出口**（时间戳可读）；且 in-process 候选的「execution」＝会话本身，与 `F-RUNTIME` 的「一次 spawn」语义待对齐。

**续跑/保活**：`agent_send`（steer 或排队 follow-up，带请求 id memo 防重放，`src/agents/messaging.ts:1-17,9-15`）；会话切换重开存储并 `epoch++` 终止旧恢复（`src/pi/session.ts:100-110,114-118`），另一 pi 进程持锁时报告 `unavailable`（`:175-187`）。→ **已证实覆盖**。

**观察范围**：bus 只读、控制走工具；快照**不含** usage/prompt/result → 第三方要成本必须读工具结果。→ 观察与授权分离（**已证实**）。

**F-* 边界**：`F-STARTUP` **已证实覆盖**——model/thinking 与 `createdAt/job` 写在**同一 commit**（`src/agents/creation.ts:43-44,64-93`，`configure(...)` 于 `:75-81`）；`F-LIFECYCLE-IMPL` 会话切换寿命有可引用行为（`session.ts:100-118`）；`F-VIEWED` 为 attach 视图（读 durable 会话），非席位。

### 4.7 `@arhen/pi-core-subagent` — fleet-runtime 组

**接口分层**：(b) **未版本化**事件面：单一 `emit(type, payload)` 帮助函数，payload 为 `{type, timestamp, …}`（`src/manager.ts:315-317`），频道名散在发射点（`subagent:runs-restored|run-updated|task-updated|session-event|run-created|run-completed|task-resumed|task-aborted|notification|intercom`，`manager.ts:287,322,337,419,942,1037,1090,1205,1178,1243` 与 `src/delivery.ts`）；**全包 `grep protocol` 0 命中**，无请求通道。(c) sidecar `<parentSessionFile>.subagents.json`（`manager.ts:296`，写 `:293-312` 含 `slice(0,50)` + 原子 rename，读 `:239-290`），**无版本字段**。(d) 9 个工具 + `/subagents` + peek。(a) **无 exports**（`main` = `./src/index.ts`）。

**身份与父链**：`TaskSnapshot{sessionId?, sessionFile?, …}`（`src/types.ts:18,25-26`）拿到**真实子会话**：创建走 `SessionManager.create(childCwd, undefined, { parentSession: getParentSessionFile(ctx) })`、resume 走 `SessionManager.open(resume.sessionFile, …)`（`manager.ts:623-625`，解析器 `:93-99` = `ctx.sessionManager.getSessionFile?.()`）。**该 `parentSession` 会真的落成子会话 header**（pi 公开 SDK 路径：`session-manager.ts:1755-1758` persist=true → `:1069` header 字段）→ 第三方读子 JSONL 即可拿到直接父链，**本三组唯一**。`grep ownerSessionId` 于本包 0 命中：没有独立 owner 字段，只有 `runId`/`taskId` 回指 leader run。

**用量与请求**：`updateUsageFromMessage` 每 assistant 消息 `turns++` 并累加 input/output/cacheRead/cacheWrite/`cost.total`（`src/outcome.ts:23-34`），`aggregateUsage` 按 run 汇总（`:10-21`）；字段 `{turns,input,output,cacheRead,cacheWrite,cost}`（`types.ts:9-14`）。无 per-turn 时间戳/httpStatus/responseId。

**执行耗时**：`startedAt/endedAt/toolCalls/lastActivity`（`types.ts:27-31`）+ `maxRuntimeMs` 超时（`manager.ts:686`）→ **测量覆盖证据不足 + 需提供方测量出口**（时间戳可读；无 execution 身份）。

**续跑/保活**：`resume_subagent`「Revive a failed/aborted task in its original session」（`src/index.ts:473,476`）；`steer` 经 `child.prompt(msg,{streamingBehavior:"steer"})`（`manager.ts:678-684`）；`session_start` 恢复 sidecar 并把非终态任务改写为 `aborted`（`manager.ts:257-281`）。

**观察范围**：状态工具把每个子会话 `sessionFile` 交给模型以便 `tail -f`（`index.ts:377-385`）；观察（只读 emit）与授权（工具）分离靠约定。→ 可经适配。

**F-* 边界**：`F-STARTUP` **已证实覆盖**（launch 时写入 `provider/thinking/sessionId/sessionFile`，`manager.ts:633-645`，持久到 sidecar）；父链维度**是本三组唯一有 pi 原生可读事实者**（子会话 header `parentSession`，见 §3.5）；`F-LIFECYCLE-IMPL` 会话切换寿命有行为（`index.ts:182` 恢复、`:217` `clearRuns()`）；`F-INPUT` steer 注入（**注意**：其 `pi.on("input")`（`src/index.ts:148`）也要按 §5.4 区分「宿主归因输入」与扩展提交）；`F-VIEWED` peek/status/result 读子会话。

### 4.8 `@zhushanwen/pi-subagent-workflow` — process-boundary 组

**接口分层**：(a) **可导入 typed 契约存在于 sibling 包**（各有 `exports` + `types`）：`@zhushanwen/subagent-core` 1.5.1、`@zhushanwen/subagent-engine-sdk` 0.10.1、`@zhushanwen/pi-subagent-cli` 0.7.2、`@zhushanwen/pi-rpc` 1.3.0（全部 **无 `repository`**，仅 tarball 证据）。**修正**：workflow 包把 engine-sdk 列为 **devDependency**，故它作为本包运行时契约不成立，只作为同发布方公开物成立。(b) 仅 messageRenderer 的 customType（`src/index.ts:150`，常量来自依赖 `@zhushanwen/extension-protocol@0.20.0`，`package.json`）——**该依赖包在本机 tarball 中不存在，定义站点不可复核**。(c) **带版本**的引擎句柄/日志：`EngineHandleData{v: 1, … eventsPath?}`（`subagent-engine-sdk dist/contract-types-jSa1g28F.d.ts:143-156`）；core 只落 pidfile 存活记录（`subagent-core dist/chunk-4RPMGJDN.js:1222`，无版本）。(e) 本包 barrel **只导出工厂**（`package/index.ts:1`）→ **无 importable API**。

**身份与父链**：两跳：host→引擎 CLI（`subagent-core dist/chunk-4RPMGJDN.js:1443` spawn、`:1461` stdout 协议流），引擎→真 pi（`subagent-engine-sdk dist/chunk-HSNDUHFH.js:14-34 spawnEngineChild`，**旧报告 `:14-28` 偏窄**）；pi argv 由 cli 包构造 `["--mode","rpc","--session-dir",…]` + 可选 `--session` + `--model <provider>/<id>[:<thinking>]`（`pi-subagent-cli dist/chunk-K3KTNCBH.js:31,33,35,38`，`--no-extensions`/`--extension` `:430-431`）。**sessionId + sessionFile 经 pi 自己的 RPC `get_state` 握手取回**（`sendGetStateCommand :203`，`extractGetStateFields :538-547`，`performGetStateHandshake :549-574`），并有按 `_${sessionId}.jsonl` 的回退查找（`:726-733`）。**不写** `parentSession`；归属经 env 传 `PI_SUBAGENT_ROOT_SESSION_ID`/`…RECORD_ID`（cli `:1335-1338`），core 侧持久身份带 `rootSessionId`（并保留 deprecated `parentSessionId` 兼容，`subagent-core dist/index.d.ts:3901,4057`）。→ **session 身份维度已证实覆盖**；**owner 维度部分**：归属经 env（私有传递面）下发、core 侧以 `rootSessionId` 持久（可经发布方的引擎句柄/日记接口读到）→ 记为**部分可经适配 + 部分需提供方出口**，不作「已覆盖」。

**用量与请求**：逐 turn `usageDelta`（`contract-types…d.ts:43-52`，`journal-replay.d.ts` 提供聚合投影）；`AgentOutcomeUsage{input,output,cacheRead,cacheWrite,cost,contextTokens,turns}`（`:307-315`）；**无** per-turn model 字段，**cost 类型不标注来源**（provider/catalog/estimate 无从判定）。

**执行耗时**：`AgentOutcome.durationMs`（`:343`），引擎侧字段，无墙钟起止 → **测量覆盖证据不足**（见 §2；不可判定）。

**续跑/保活**：resume 经 `sessionRef.sessionFile`（cli `:1550,1870-1871,1903-1906`）；**不保活**：注释「每轮一进程，续聊 = 新 run + resume 锚点，进程不再保活」（`:1492-1493`）；能力表 `steer:"unsupported"` / `resume:"native"` / `interrupt:"kill-only"` / `setModel:"native"`（`:1685,1697-1700,1709`）。

**观察范围**：观察面 = 引擎协议 + `AgentOutcome`，须同宿主进程内经 core 引擎注册表；历史读取 = journal 重放（cli `:1773-1777`）。→ session-scoped、观察（read）与授权（run/abort/setModel）分属不同方法。

**F-* 边界**：`F-STARTUP` **部分**——启动参数在 argv 声明式确定，但**无启动回读**（`extractGetStateFields` 只取 session 字段），有效 model 只在运行中 `set_model` 路径有证据（`:1089-1092`）；`F-STATE-INHERIT` 有 resume 锚点与带版本 journal；`F-INPUT` = 新 run + resume（无终态 steer）；`F-VIEWED` = journal 重放。

### 4.9 `@bacnh85/pi-subagent` — process-boundary 组

**接口分层**：(b) 跨扩展频道 `pi-subagent:run`（`extensions/service.ts:16`），**带类型的请求/响应** `SubagentRunRequest`（含 `accept?`、`respond`、`onProgress?`，`:18,29-31`）与 `SubagentRunResponse`（`:38`）——**无协议版本字段**。(d) 工具 `subagent`（`index.ts:663-664`）、`herdr`（`:1974-1975`）；命令 `subagent`、`agent`。(a) **无 main/exports** → 无 importable API。观察与授权混在同一请求对象（`accept`/`respond` 与 `onProgress` 同处，`:29-31`）。

**身份与父链**：`createAgentSession({…, sessionManager: SessionManager.inMemory(childCwd), …})`（`extensions/runner.ts:256-261`），订阅 `:273`，prompt `:304`，`session.dispose()` `:338`。**从不读子会话 id**：`pi-subagent/extensions/` 内 `sessionId`（含大小写变体）**0 命中**；`SubAgentResult`（`runner.ts:116-136`）无 id/owner。→ **未覆盖**（子会话 id 其实一行可取，但候选未取）。修正：旧报告称 grep 只命中 `auto-review.ts:242` 用来取子会话 id——**该行实为读宿主 session 条目**（`const entries = ctx.sessionManager.getEntries() as any[]`），括号说明不成立，实质结论成立。

**用量与请求**：`UsageStats{input,output,cacheRead,cacheWrite,cost,contextTokens,turns}`（`runner.ts:44-52`），累加 `:283-284`（cost = `msg.usage.cost?.total`）；model 由子消息回填 `` `${msg.provider || "?"}/${msg.model}` ``（`:285`）。无 httpStatus/responseId/turnId。

**执行耗时**：`durationMs?: number`，注释「Wall-clock duration of the run, set by runSubAgent (Date.now() - startedAt)」（`:135,349`）；实时 `SubAgentProgress.elapsedMs`（`:107-112`）。→ **部分测量已证实（候选自测的单次 run 墙钟），完整未证**：`SubAgentResult` 无执行身份、也无会话归因，无法归因到 actual session/execution。

**续跑/保活**：**仅 `session.abort()`**（`:301`），无 steer/resume；in-memory 会话无持久化。

**风险**：以 `as any` 转发宿主 model runtime/auth（`service.ts:68-69`、`runner.ts:261`）→ SDK 版本耦合；子会话崩溃可拖垮宿主，且无审计痕迹。

**F-* 边界**：`F-STARTUP` 部分（构造参数 + 子消息回填，无 start 记录外发）；`F-STATE-INHERIT` 无 session 文件、无 owner；`F-LIFECYCLE-IMPL` 单次 prompt 后 dispose（`runner.ts:304,338`）；`F-INPUT` 不支持；`F-VIEWED` 仅内存 thread。

### 4.10 `pi-ptc-subagents` — process-boundary 组

**接口分层**：(a) **exports + types**（`package.json`），导出 `runPtcProgram`、`PtcRunOutcome`、`WorkerPool`、`TurnPools`、`createWorkerEnv`/`resolveConfig`/`DEFAULT_CONFIG`、绑定表、`HOST_FRAME_KIND`/`WORKER_FRAME_KIND` 等（`src/index.ts:76-192`）；(c) 落盘 `TaskRecord`＋`output.log`（`<sessionDir>/tasks/<id>/output.log`）；(d) 工具 `ptc_subagent`（`src/tools/subagent.ts:87`，**旧报告 `:86`**）、`ptc_run_code`、`ptc_workflow`、`ptc_task_list|output|stop`；配置 `~/.pi/agent/ptc.json`。修正：`TaskRecord` **声明在 `src/runtime/task-storage.ts:84`**（不是 `task-registry.ts:134-177`），字段含 `startedAt/finishedAt?/durationMs?/stopReason?/errorMessage?/exitCode?/parentTaskId?/sessionFile?/ownerPid?/ownerBootMs?/report?`，**persist as-is、无版本字段**（`protocol.ts`/`task-storage.ts` grep `version` 0 命中）。

**身份与父链**：前台 argv `["--mode","json","-p","--no-session"]` + `--model`（可解析时）+ `--thinking` + `--append-system-prompt` + `Task: …`（`src/runtime/dispatch.ts:1530,1535,1537,1544,1546,1555-1556`）；后台把 `--no-session` 换成 `--session-dir/--session-id <taskId>/--name bgdispatch:<taskId>`（`src/runtime/child-process-lifecycle.ts:290-297`，调用侧 `dispatch.ts:1993-1996`）。**sessionFile 故意不填**——`dispatch.ts:2030-2032` 与 `docs/adr/0022-background-dispatch.md:151` 明说「extension cannot know the filename pi chose」。溯源 = `parentTaskId` + env `PI_PTC_DEPTH`/`PI_PTC_TASK_ID`（`dispatch.ts:1988,2021`）。**修正**：`ownerPid` + `ownerBootMs`（ADR-0023，创建该记录的扩展进程身份 + 启动时刻）使 Owner 归属**强于**旧报告的「adaptable」——它给出可归因、可跨重启对账的持久事实。仍**不写** `parentSession`（grep 只命中 `parentSessionDir` 字样，`background-runtime.ts:58`）。

**用量与请求**：`accumulateUsage` 折叠 assistant `message_end`，`total.cost += message.usage.cost?.total ?? 0`、`turns++`（`dispatch.ts:1654,1673-1674`；doc `:1648-1652`「ADR-0032: usage is observed, never declared」）；`DispatchResult{text,status,started,agentName,durationMs,exitCode,usage?,…,reportChannel}`（`:404-431`）。无 httpStatus/responseId/turnId。

**执行耗时**：`TaskRecord.durationMs = now - record.startedAt`（`task-registry.ts:753-754`）→ **部分测量已证实（候选执行器测量、per task），完整未证**：起算点是否含排队/启动等待、是否等同一次 execution 的 active 时间，属**提供方事实**，须由提供方确认——不是适配层可解决的。修正：spawn 三参形态实际在 `child-process-lifecycle.ts:369-374`（`shell:false`、`stdio:["ignore","pipe","pipe"]`）。

**续跑/保活**：重试幂等经 `--session-id <taskId>`（`child-process-lifecycle.ts:280-281` 注释「retry idempotence」）；**无** fork、无 `--session` 续写、无 steer（工具面只有 `ptc_task_stop`）。

**观察范围**：读（`ptc_task_list`/`ptc_task_output`）与控（`ptc_task_stop`）分属不同工具，回收按 `ownerPid`/`ownerBootMs` 限定。→ 已证实（工具层）。

**F-* 边界**：`F-STARTUP` 部分（无回读/有效 model 确认）；`F-STATE-INHERIT` 由 `parentTaskId`+env+`ownerPid` 承担（**可经适配**：`TaskRecord` 为落盘可读记录；env 本身是私有传递面，归因靠落盘字段而非 env 读取）；`F-LIFECYCLE-IMPL` 状态机 `running→succeeded|failed|canceled|stopped` 有注释化契约（`task-registry.ts` transition 注释）；`F-INPUT` 未覆盖；`F-VIEWED` `output.log` sidecar。

### 4.11 `@henryqw/pi-subagent` — process-boundary 组

**接口分层**：(a) **exports + types** → `dist/index.d.ts`（`package.json:27-33`），barrel `src/index.ts:30-65`（`createEphemeralSubagentExecutor`、`EXECUTION_BUDGET_ENV`、`capEphemeralSubagentOutput`、`EphemeralSubagentError/Result/RunInput`、worktree/review 帮助）与 `PiLaunch|ResolvedRoleLaunch|PreparedRoleLaunch`（`:170-186`）、env 旗标（`:72-75`）。(c) 父会话 entry `DIRECT_TAB_TYPE` 记录 `{taskId,entryId,display,…tab}`（`extensions/subagent.ts:768-770`，**无版本字段**）。(d) 工具 `delegate_task`（`extensions/subagent.ts:621-622`）、`subagent_status/resume/stage/integrate/abort`（`isolated.ts:692,709,725,738,766`）、`git_read`（`git-read.ts:113`）+ 命令 `subagent`（`subagent-command.ts:139`）。(b) 无 EventBus 频道。

**身份与父链**：ephemeral argv `[...invocation.args,"--mode","json","-p",…]`（`src/ephemeral.ts:452`），角色参数 `["--no-session","--no-extensions","--no-skills","--exclude-tools",…,"--model",…,"--thinking",…,"--approve"|"--no-approve"]`（`src/index.ts:656-666`），spawn `detached: process.platform !== "win32"`（`ephemeral.ts:463-473`）；**stdin 被 ignore**（`:471`）→ 不可注入、无会话文件；`grep sessionId` 全 `src/` **0 命中**。herdr 路径由**父**持有 `<sessionDir>/session.jsonl`（`src/direct-herdr.ts:298,304-305,335`）并从记录恢复（`:286`）。无 `parentSession`/`--fork`/`--session-id`（0 命中）。

**用量与请求**：事件白名单 `PI_JSON_EVENTS` + `CONSUMED_JSON_EVENTS`（`ephemeral.ts:26-51`），处理体 `:682-734`；`addUsage`（`:413-434`）含 `cacheWrite1h`/`reasoning` 可选与 `cost{…}`，结果 `:592`。**修正（实质性）**：`grep '\bmodel\b'` 于 `ephemeral.ts` **只命中白名单行**，结果类型无 model 字段 → 旧报告「T-TURN 覆盖含 usage + model」在 ephemeral 路径**不成立**；只能归因**请求侧 argv 的 `--model`**，没有可归因的实际模型。无 httpStatus/responseId/turnId（grep 命中的是 herdr 自有的 `requestId` 控制键）。

**执行耗时**：结果**无**任何时长字段（`:92-104`）；只有 idle/max 超时记账（`:503-506,899-911`）与不外露的内部 `startedAt`（`:453`）→ **未覆盖**（ephemeral）。

**续跑/保活**：ephemeral 不可注入；herdr 支持 resume 但须终局证明——`assertSettledDirectSession`（`direct-herdr.ts:90-91`「Refuse continuation unless the saved session's exact recorded turn is terminal and no later user turn exists」）；活 worker 追加输入 `agent prompt`（`herdr-runtime.ts:622-627`，**旧报告 `:634` 是失败诊断行**）；isolated 路径 follow-up 队列（`runner.ts:940-967`）暴露为 `subagent_resume`（「same-worker correction」）。

**观察范围**：ephemeral 仅父进程内回调（`ephemeral.ts:79-89`）；herdr 父持有 pane/tab/workspace/lease 并自读子会话（`direct-herdr.ts:333-337`，`directSessionUsage` 定义 `:140`/调用 `:358`，`directPartialText` 定义 `:186`/调用 `:365`）→ 观察（`subagent_status`）与授权（resume/stage/integrate/abort）分属不同工具。会话切换寿命：`session_shutdown` 收尾（`subagent.ts:546`、`isolated.ts:545`、`admission.ts:57` 注释「Session replacement is not proof that a held direct worker stopped.」）。

**前提风险**：须在 pi 内且 `PI_CODING_AGENT === "true"` 与 `process.title ∈ {pi,pi-rpc}`（`ephemeral.ts:231`）；herdr 路径依赖外部 `@henryqw/pi-herdr`（`herdr-runtime.ts:8-11`），其 `agent start` argv 形状与 schema **本轮未复核**。

### 4.12 `@d3ara1n/pi-subagent` — process-boundary 组

**接口分层**：(d) 工具 `subagent_delegate|_wait|_check|_steer|_cancel`（`src/index.ts:468,713,846,882,930`）+ 5 个命令（`:293,1018,1033,1123,1159`）+ message renderer（`:463`，常量 `:74`）。(c) 历史 JSON `~/.pi/subagent/history/{父sessionId}/{toolCallId}.json`，**语义写在工具描述里**（`index.ts:402`，公开事实），**无版本字段**。(a) **`main` 存在**（`"main": "src/index.ts"`）但无 `exports` → 结论「无 importable module API」仍成立，**旧报告依据的字段事实错误**。(b) 无频道。

**身份与父链**：子进程 `["--mode","rpc","--no-session","--model",modelRef]` + 可选 `--thinking`、`--tools|--no-tools|--exclude-tools`、`--append-system-prompt`（内联，无临时文件）（`src/spawn.ts:161,172,174-175,178-186,195`）→ **无子会话 id/文件**；历史分区键 = **父**会话（`history.ts:46-47`，挂载 `index.ts:418-420`）；无 `parentSession`/`--fork`/`--session-id`（0 命中）。

**用量与请求**：`spawn.ts:492-503`（`turns++`、input/output/cacheRead/cacheWrite、`cost += usage.cost?.total || 0`、`contextTokens`），类型 `SubagentUsage`（`types.ts:112-119`）；**per-turn provider/model**由子消息回填 `` `${msg.provider}/${msg.model}` ``（`spawn.ts:509-510`）。无 httpStatus/responseId/turnId（grep 0）。`fallbackFrom` 记录回退（`types.ts`）。

**执行耗时**：`startTime?/elapsedMs?/budgetMs?/graceMs?`（`types.ts:180-187`），`elapsedMs` 注释「Total elapsed time (ms) for terminal frames … spans the whole delegate interval (**incl. fallback retries**)」→ **需提供方事实**：该值**混入回退重试**，要拆成 per-execution 必须由提供方给出每次尝试的边界（不是适配层能拆的）；超时错误文本含轮数与预算（`spawn.ts:667-668`）。

**续跑/保活**：`steer` 走 stdin 帧 `{type:"steer",message}`（`spawn.ts:753-765`），只对运行中有效（`:754`），工具描述「Only running runs accept steering; queued and terminal runs reject it」（`index.ts:886`）；首 prompt 帧 `{id:"init",type:"prompt"}`（`:768`）；无头对话框自动取消 `{type:"extension_ui_response",cancelled:true}`（`:462-466`）；`agent_settled` 后 `stdin.end()`（`:474-482`）→ 终局不再续跑。

**观察范围**：进程内注册表按父会话恢复（`store.ts:52-60`，挂载 `index.ts:419-423`）；`subagent_check`（只读）与 steer/cancel 分属不同工具；终端结果幂等重投（`:850`）；`session_shutdown` 收尾避免 `/reload`、`/new` 后留下不可等待的孤儿（`:448-453`）。**手写 RPC 帧**：源码内 `RpcClient` 0 命中（仅计划文档提及）→ 逐字跟踪 pi 的 RPC 记录形状。

**证据不足**：tag `a39552ba…` 在本地浅克隆**不可验证**（`packed-refs` 0 命中；工作树 HEAD = `f68c412`），故全部引证实际读自 `f68c412`。

---

## 5. 基线行对照（F-STARTUP / F-STATE-INHERIT / F-LIFECYCLE-IMPL / F-INPUT / F-VIEWED）

按主会话要求，这些行以**共同边界**说明，不要求候选新增最终语义。

### 5.1 `F-STARTUP`（首启证明 + 有效 model/effort）

要求：`SessionStartup{model?{provider,model}, effort?}` 只在**证明会话在该处开始**的那次 start 上出现；`effort` 是**宿主解析后的有效** thinking level；拿不到就进 `unavailable`，**不从当前设置回填**。

| 候选 | 首启事实的**公开面** | 有效 effort 的公开面 | 分类（同一口径：只有「公开可读记录」才可写可经适配） |
|---|---|---|---|
| bg | `DelegatePinnedRoute`（`types.ts:56-61`）持久到 manifest（`artifacts.ts:72,180-181`）——(c) 可读 | 有（`thinking_level`，同上记录） | 可经适配 |
| better | `RunMeta.model/effort`（`registry.ts:124-126`）随 meta 落盘——(c) 可读 | 有（注释即 `--thinking` 值） | 可经适配 |
| pi-agents | model/thinking 与 `createdAt/job` 同 commit（`creation.ts:75-81,82-93`），并由 `AgentInfo` 经工具输出可读——(d)/(e) | 有 | 可经适配（不经私有内部） |
| arhen | launch 时写 `provider/thinking/sessionId/sessionFile` 到 task 并持久到 sidecar（`manager.ts:633-645`）——(c) 可读 | 有（clamped thinking） | 可经适配 |
| durable | 公开面只有 `status --json` 的 per-call `model?`（`snapshot.ts:776`），**不含**「首启 vs continuation」区分（该区分只在内部决策里，`pi-args.ts:18,29-36`） | 有（`model`；effort 不在公开字段内） | **部分可经适配 + 首启/续跑区分需提供方出口**（不得把内部 continuation 决策当公开事实） |
| d3ara1n | argv 固定（`spawn.ts:172-175`）+ 子消息回填有效 model 进 `SubagentResult`（`:509-510`）——(e) 可读 | 有（运行后回填，**非首启事实**） | **部分可经适配**（首启仍缺，回填发生在运行后） |
| zhushanwen | argv 声明式（cli `:31,33,35,38`）；`extractGetStateFields` 只取 session 字段 | 仅 `set_model` 路径（`:1089-1092`，经引擎协议 (a)） | **部分可经适配**（仅切换路径；首启缺） |
| herdsman | **`ManagedAgentState` 无 model/thinking**（`mailbox.ts:27-49`）；只有 argv（`agent-definitions.ts:949-953`）与逐 turn pane metadata（`managed-agent-runtime.ts:1385-1400`） | 仅逐 turn | **需提供方出口**（首启事实在公开面缺位）；旧报告「covered」过度陈述 |
| ptc | argv 声明式（`dispatch.ts:1536-1537,1546`），**无 `get_state` 回读** | 无回读 | **需提供方出口** |
| henryqw | ephemeral argv 固定（`index.ts:656-666`）；herdr 有 `agent_started` 身份校验但未见 model 回显（`direct-herdr.ts:337`） | ephemeral **无**；herdr 未复核 | **需提供方出口** / 证据不足 |
| bacnh85 | 构造参数给定（`runner.ts:257`），无 start 记录外发 | 无 | **需提供方出口** |
| cowboy | 仅 argv（`harness/pi-compatible.ts:43-47`） | 无 | **需提供方出口**（本轮无任何可读首启事实） |

共同边界：**没有一个候选通过公开契约交付「首启 model/effort」**；可读的只有「候选自己落盘的启动记录」（bg/better/pi-agents/arhen）与「运行后回填的模型」（d3ara1n）。适配层若要从候选读回，必须以「该 execution 自己的公开记录」为准，且**不得**用当前设置回填（基线原文），也**不得**拿 argv/内部决策当公开事实。

### 5.2 `F-STATE-INHERIT`（逐字段 none/follow）

这是 framework 拥有的**公共机制**（`framework/GLOSSARY.md:155-157`、`framework/docs/harness-support.md`），**候选不需要提供**。候选需要提供的是「可归因到 actual session/Owner 的持久事实」：

| 候选 | 可归因事实 | 公开性 |
|---|---|---|
| durable | `main:<sessionId>` owner（`types.ts:161`、`main.ts:132`）+ fork `origin{sessionFile,leafId}`（`types.ts:205-206`） | 公开（事件日志/`status --json`；日志本身不带 owner，需 join） |
| herdsman | `ownerSessionId` + `piSessionId` + `piSessionFile`（`mailbox.ts:31,35-36`） | 公开（带 `version: 5` 的文件邮箱 + 协议频道） |
| ptc | `parentTaskId` + `ownerPid`/`ownerBootMs`（`task-storage.ts:107,127-131`、`dispatch.ts:1988,2021`） | 公开（落盘 `TaskRecord`） |
| better | `callbackOrigin{cwd,sessionId?}` + `by-origin/<hash>` 索引（`registry.ts:32-35,1190-1196`） | 公开（meta 目录） |
| pi-agents | 存储按父会话 id 分目录 + 快照 `sessionId`（`pi/session.ts:47-48,104-107`、`pi/events.ts:28`） | 公开（`exports` + 频道） |
| arhen | sidecar 按父会话文件命名（`manager.ts:296`）；**且子会话 header 的 `parentSession` = 父会话文件**（`manager.ts:625` + pi `session-manager.ts:1069`）；无独立 owner 字段 | 公开（子 JSONL header 与 sidecar 均可读） |
| bg | 仅 artifact 目录名（`artifacts.ts:157-162`）+ 内部 `parent_leaf_id`（`types.ts:124`） | 私有/路径推导 |
| d3ara1n | 历史目录以**父**会话 id 分区（`history.ts:46-47`，工具描述公开） | 公开（父会话推断） |
| henryqw | herdr：父会话 entry（`subagent.ts:768-770`）；ephemeral：**无** | 部分 |
| cowboy / bacnh85 | 无 | 未覆盖 |
| 除 @arhen 外的 11 个 | **均不写** pi 原生 `parentSession`（本轮固定树 grep 0 命中，见 §3.5 的范围说明） | — |

### 5.3 `F-LIFECYCLE-IMPL`（initialize/cleanup 的会话切换寿命）

framework 拥有：实现工厂每进程至多一次 `initialize`、在 owner 会话节点；`cleanup` 至多一次、在服务会话被 dispose 时；普通切换只换服务对象。**候选不需要提供**；有意义的是候选对「会话切换/宿主重启」的处理，必须能区分「服务对象被换掉」与「本该 dispose」：

- **已证实有对应行为**：durable（`resume`、`fenced{reason:'restart-force'|'orchestrator-crash'|'process-died'}`）；pi-agents（`session.ts:100-110` 重开 + `epoch++`，`:175-187` 另一 pi 进程持锁 → `unavailable`）；arhen（`session_start` 恢复 sidecar、非终态改写为 `aborted`、`session_shutdown` `clearRuns()`）；henryqw（`session_shutdown` 收尾，注释明说「Session replacement is not proof that a held direct worker stopped」）；d3ara1n（`:448-453` 注释解释为何要在 shutdown 收尾）；bg（`session_shutdown` 时把 `registry.allTasks()` 里所有 `status === 'running'` 的任务逐个 `stopTask`，`src/extension.ts:732-748`，另有 `:355-358` 的 activation 关闸）；better（元数据与日志存活并按 origin 重新归属）。
- **证据不足**：durable 与 herdsman 的完整切换寿命语义（本轮未读完 `snapshot.ts`/`engine.ts`；herdsman 未跑多 lead 场景）。

### 5.4 `F-INPUT`（宿主归因的用户输入）

framework 只要一条边：**宿主自己归因为用户提交、且被会话接收**的 input；extension 自己提交的不算。

- pi 侧事实齐备：`InputEvent{source: interactive|rpc|extension, streamingBehavior?: steer|followUp}`（`extensions/types.ts:1170-1181`）+ 注册面（`:1664`）。
- 候选侧：只有 herdsman 直接消费 `pi.on("input")`（保留前缀拦截，`managed-agent-runtime.ts:1024-1027`）；arhen 也订阅 `pi.on("input")`（`src/index.ts:148-150`）。**其余候选的「输入」都是面向模型的 steer/reply 机制**（durable 邮箱、pi-agents `agent_send`、better 文件 steer、d3ara1n stdin steer、henryqw herdr `agent prompt`、bg 单次 stdin、bacnh85/ptc/cowboy 无），属**扩展自己提交**，按基线**不属于** `F-INPUT` 事实——适配层不得把它们当作 `user_input` 交付。
- 旧报告 §5 的 IN-INPUT 行在此意义上需改写：区分「宿主归因输入」与「模型面转向接口」。

### 5.5 `F-VIEWED`（席位 + markers 订阅）

- pi 无 viewed-session 事实（`P-NO-VIEWED`）；`F-PORT` 把 `viewedSession?` 列为**可选可省**出口 → 宿主侧**未覆盖**，且**不是候选缺陷**。
- 三组候选的相关能力全是「读一份转录/结果」：herdsman `read_agent_transcript`（fail-closed，`agent-controller.ts:1471-1476`）、arhen `/subagents peek`（tail 子会话文件）、pi-agents attach 视图、d3ara1n `subagent:view`+activityLog+历史 JSON、henryqw `subagent_status`+herdr 子会话读取、ptc `output.log`、better `output.log` 分页、bg `bg_logs/bg_result`、bacnh85 in-memory thread、cowboy 仅人看 pane。
- 结论：这些可作**适配层读取来源**，但**都不能**证明「当前显示会话」这一席位事实，也没有 markers 订阅。

---

## 6. 证据不足 / 本轮未复核清单

1. **运行兼容性**：全部 12 个候选与 pi 的**运行时**兼容（真实 pi 版本 × Windows）均未验证；无安装、无构建、无运行。
2. **两处 npm 元数据**：`@zhushanwen`/`@d3ara1n` 的发布元数据（发布日期、下载量）未复核；`@d3ara1n` 的 tag pin 在浅克隆中不可验证（工作树 HEAD 与 tag 不同）。
3. **@zhushanwen**：无 git revision、无 `repository`、无 LICENSE 文件；`@zhushanwen/extension-protocol` 在本机 tarball 缺失 → `SUBAGENT_BG_NOTIFY_CUSTOM_TYPE` 定义站点不可复核；`AgentOutcome.durationMs` 的测量范围（是否含执行间空档）不可判定。
4. **@arhen**：`SessionManager.create(..., {parentSession})` **已在本轮通过 pi 检出确认会落成子会话 header**（`session-manager.ts:1755-1758,1069`，见 §3.5）——该疑点已结；未复核的是 sidecar 「capped at 50」的对外语义，与「在真实运行中 `parentSession` 解析出的常量是否与消费方预期一致」（静态可读，未运行）。
5. **bg**：`host-api.ts` 单 sessionId 绑定与 `host-api.ts:229-235,243,296-297,374-382`、`artifacts.ts:157-162` 未逐行复读。
6. **better**：`registry.ts` 的多数区间引用整体偏移约 +9 行（字段存在、行号须替换）；`parse.ts:38-46,1345-1353` 未复读。
7. **durable**：`usage.ts`/`time.ts` 实际只有 50/42 行，旧报告的 `:59-63/79-95/107-111`、`:15-59` 不存在；`snapshot.ts` 的 owner helper（`:662,735,744,1112-1114`）与 `session.ts:23-50`、`observe.ts` 未复读。
8. **herdsman**：`herdr pane report-metadata` 的字节语义；`collectSessionUsage` 的 `complete` 在真实多 lead 场景是否为 true（未运行）。
9. **henryqw**：外部 `@henryqw/pi-herdr` 的 `agent start` argv 与 schema；`herdr-runtime.ts` 多处锚点为类/邻接行而非动词行。
10. **ptc**：子端结构化 report 通道（`child-report.ts:115`、`dispatch.ts:1972`）未复核；`TaskRecord` 的 `ownerPid`/`ownerBootMs` 精确定义区间未逐行复读（结论按 ADR-0023 注释）。
11. **cowboy**：`dist/` 不在仓库，发布 bundle 未验。
12. **pi 侧**：`docs/` 未收录 `after_provider_response`（仅存在于公开类型声明 `extensions/types.ts:917-921,1636`）——即「公开导出」与「散文文档」在本项上不一致，本文按公开导出计。

---

## 7. 结论状态

- 本票**只做事实复核与勘误**，**不批准**任何提供方、不排序、不推荐路线；选型与缺口处理路线仍属 ticket 03/04 与用户。
- 已撤回/收窄的旧结论集中在 §0（R1–R4）；其余为逐候选事实修正（§4）。
- 本轮对原报告的一处**证据升级**（非选型暗示）：@arhen 的 `parentSession` 从旧研究的「未验证/判为 pi-native 但未证」升为**已证实写入**（`manager.ts:625` + pi `session-manager.ts:1755-1758,1069`），是本三组里唯一具有 pi 原生父链可读事实的候选；同时取消「12 个候选均不写 `parentSession`」的概括（§3.5）。
- §2 的接口分层与 §5 的基线边界是本文件的**判读口径**：后续引用候选覆盖时，须同时给出「哪一层接口」与「公开 / 模型工具输出 / 私有实现」的属性，并注明 `F-*` 行是「候选事实」还是「framework 拥有的最终语义」；判定按路径逐项，不按候选整体。
- 未复核项见 §6；这些不构成对已给结论的撤回，但**不得**被当作已验证事实引用。
