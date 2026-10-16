# 跨进程子会话 State follow 的事实核对（只读）

Ticket: [第三方能力适配的集中组织与公共语义复用](../decision/04-third-party-adapter-organization.md)（status: claimed）
性质：**证据资产，不是政策发布**。本文件只核对机制与现状，不批准目录/接口/IPC 路线，不改 map、ticket、Lighthouse 或任何生产源码，不运行程序或测试。

## 0. 方法与证据口径

- 本轮**只做静态核对**：读固定 revision 的源码、公开 docs 与类型。没有任何安装、加载、加载器往返、真实子代理或 provider 调用。凡是运行后果一律标 `[INFERENCE]` 或转引已发布实测。
- **已有实测**（本轮不重跑，只引用）：[nicobailon 运行时验证](../lighthouse/07-nicobailon-runtime-validation.md) 与 [真实运行报告](07-runtime-validation/report-live.md) 已实测根/前台同进程/后台独立进程/嵌套/workflow/调度子会话的实际 session 身份、有效 model/effort、请求边界、逐请求用量归并，以及 `registerRequiredChildExtensions` 在上述各类子会话中的实际加载与运行时 acknowledge。本文件涉及该报告的行只作转引，不新增结论。
- 固定参考：framework 与 pi 源码见 [研究勘误 §0.1](02-primary-candidates-correction.md)（pi `4a5d372`/1.2.0）；nicobailon 固定 clone `E:/Developer/myhub/wt/_cand/git-nicobailon`，revision `a4c8ced69a8176cdf4179b127feddc8875e3418f`（= `v0.78.0`，本轮 `git rev-parse` 复核）。本轮读的是 **git checkout 入口**（`index.ts` + `src/api/*.ts`），不是 npm JS 工件；两者的入口差异见研究勘误 §2.1，引用时不得混称。
- 分类词沿用研究勘误 §0：`[公开契约]` / `[模型工具输出]` / `[私有实现]` / `[宿主原生]`。

---

## 1. 当前 framework 怎样读 Owner current State；同进程为何可用；独立进程缺什么

### 1.1 读取路径只有一条：`stateValueFor` → `StateStore.view(ownerKey).read(field)`

- 读取规则集中在 [`framework/behaviors/state-scope.ts:20-35`](../../../framework/behaviors/state-scope.ts)：`owner.kind === "unresolved"` → 声明默认值；`owner.kind === "inherited"` 且该字段未声明 `follow` → 声明默认值；否则 `state.view(owner.key).read(activationField(definition))`。
- `OwnerReference` 三态与语义：[`framework/core/protocol.ts:19-33`](../../../framework/core/protocol.ts)；`RunDelivery.owner` 是「本次运行受其 State 治理的 owner」：`protocol.ts:976-978`。字段声明 `inheritance?: "follow" | "none"`（默认 `none`）：[`framework/core/definition.ts:53-61`](../../../framework/core/definition.ts)、[`framework/docs/framework-capabilities.md:90-96`](../../../framework/docs/framework-capabilities.md)。
- 同一条规则也是 marker 区的席位读取：`registerMarker` 的 `active: seat => stateValueFor(...)`（[`framework/behaviors/marker.ts:188-198`](../../../framework/behaviors/marker.ts)）。

### 1.2 值存在哪里：进程内、每个 adapter factory 一份的内存 cell

- `StateStore` 的当前值就是一个**私有内存 Map**：`readonly #cells = new Map<string, Map<string, StateValue>>()`（[`framework/core/state.ts:64-72`](../../../framework/core/state.ts)）；`view()` 只读它（`:77-81`），`#write()` 只在它里面建 cell（`:195-214`）。
- 生命周期与撤销也在进程内：`OwnerLives` 的 `#retained` / `#ended` 两个 Map（[`framework/core/owner-lives.ts:24-67`](../../../framework/core/owner-lives.ts)）。
- 每个 adapter factory 调用各建一个 store：OMP `framework/adapters/omp.ts:1028-1032`、pi `framework/adapters/pi.ts:236`。**没有**任何把 cell 传出该进程的代码路径（framework 全树只有 marker 区与文件协调模块用 `Symbol.for` 挂 `globalThis`，二者都是**进程内**作用域：[`marker.ts:157-174`](../../../framework/behaviors/marker.ts)、[`modules/files.ts:153-175`](../../../framework/modules/files.ts)）。

### 1.3 Owner 怎样解析：唯一实现是 OMP 的「进程内注册表上行」

- OMP 的 `ownerReferenceOf` 对 main 会话给 `{kind:"owner", key:"main:<sessionId>"}`；对子代理会话调 `mainAncestorOf`，沿 `ctx.agent.parentId` + 宿主注入的 `AgentRegistry.global()` 逐级上溯到最近的顶层 main，返回 `{kind:"inherited", key:"main:<祖先 id>"}`；**上溯链一旦离开进程（注册表不持有该祖先、链成环、owner 会话已消失）就返回 `unresolved`，不猜 owner**：[`framework/adapters/omp/session/facts.ts:22-70`](../../../framework/adapters/omp/session/facts.ts)。
- pi adapter 没有这条解析：`ownerOf` 只按当前 context 的 `sessionManager.getSessionId()` 返回 `{kind:"owner", key:"main:<该会话 id>"}`（[`pi.ts:100-103`](../../../framework/adapters/pi.ts)），且 `onSubagentRuntime` 直接 `unsupported`（`pi.ts:202`）。也就是说**在 pi 映射里，任何有身份的会话都成为它自己的 Owner**；`inherited` 根本不会产生，`follow` 在 pi 路径上不可表达。子会话若自行激活该扩展，读到的是它自己的（空）cell，而不是父的。

### 1.4 同进程为何可用

1. 同一进程内，某个 factory 调用建立的 store 服务同进程内被解析为同一 owner key 的全部交付；子代理执行由**父会话所在进程的那个 binding** 解析并按 `session` scope 派发（`OwnerReference` doc：`inherited` 交付「读其 owner 的值」），因此 `state.view(ownerKey)` 命中的正是 owner 自己的 cell。
2. 进程内公共区只能解决「谁的值」，不能跨越进程：marker 区是进程全局（`Symbol.for("my-agent-toolkit.semantic-extensions.marker-area")`），发布时**逐个问每个 store「你服务这个 owner 吗」**（`StateStore.serves`，[`state.ts:96-98`](../../../framework/core/state.ts)），由服务该 owner 的那个 store 回答（`marker.ts:240-256` 注释：一个子代理自己的运行是「re-assert the owner's rendering」，而不是读自己空 store）。
3. OMP 能成立的前提是其 subagent 绑定与父共享模块全局（[`framework/docs/harness-support.md:175`](../../../framework/docs/harness-support.md)），并且注册表是进程级的——这两点在独立进程里都不成立。

### 1.5 独立进程缺什么

- 缺 **(a) owner 解析**：`AgentRegistry.global()` 是进程级；跨进程的祖先查不到 → `unresolved` → 读声明默认值（`facts.ts:32-34,51-53` 明写这条规则）。
- 缺 **(b) 值本身**：即使两端都算出同一个 owner key，cell 只存在于 owner 进程的 store 里，没有任何通道把它搬到子进程。子进程自己的 store 对该 key 没有 cell，`view().read()` 返回 `DEFAULT_STATE_VALUE = false`（`state.ts:21, 77-81`）。
- 缺 **(c) 持久化替代也不存在**：framework 唯一的落盘是 `session-entry`（见下），而它是 owner **自己**写进 owner 自己分支的；pi adapter 读 payload 用的是**当前会话自己的** `getBranch()`。

### 1.6 memory State 不得被恢复为持久化值（现行规则）

- `reconcile` 只在 `this.#persistence === "session-entry"` 时才建 cell 并写种子值；`memory` 字段既不落盘也**从不**种子：[`framework/core/state.ts:166-193`](../../../framework/core/state.ts)（`#restoredValue` 只接受 boolean，其他载荷回落声明默认值）。`#write` 同样只在 `session-entry` 时调用 `target.persist`（`:204-214`，且落盘失败被吞、当前值仍权威）。
- 政策表述：[`docs/adr/0002-semantic-extension-framework.md:186-189`](../../../docs/adr/0002-semantic-extension-framework.md)、`:270-272`。GLOSSARY 也把 `memory` 记为「kept only in memory and never seeded（the choice for a value whose live external effect must not be assumed from a restored value）」（[`framework/GLOSSARY.md:151-152`](../../../framework/GLOSSARY.md)）。
- 因此：**任何跨进程方案都不能用「读 owner 持久化介质」来兑现 `memory` 字段的 follow**；只有 live 读才符合 `memory` 的语义。反过来，`session-entry` 的持久化入口（见 §2.2#9）也不是「current value」——写入后落盘失败被吞、以及当前值才是权威，都在 `state.ts` 里。

### 1.7 framework 自己声明的现状（不是本轮结论）

- ADR：「harness adapter 自己负责跨**受支持**子代理执行路径的 State 关系」（`0002:247`）；继承绑定在「显式集成的子代理执行路径」上，首版目标是 OMP 内置路径，**首版不发 pi adapter，所以 pi 子代理 State 继承不是「不支持」而是「未实现」**（`0002:251`、[`harness-support.md:150-161`](../../../framework/docs/harness-support.md)、`:203` 的 `state.subagent-follow` 行）。
- ADR 另有一句与本题直接相关的开放项：`0002:257` 明确「跨进程 freshness 仍属未决，不由 'single source of truth' 推定」。

---

## 2. nicobailon 0.78.0 与 pi 原生提供的父子通道：能传什么、足够传 Owner State 吗

### 2.1 先定方向与载体

| # | 机制 | 方向 | 载体 | 载荷 | 是否公开 |
|---|---|---|---|---|---|
| 1 | `pi.events`（宿主 EventBus） | 同进程扩展间 | 内存 EventEmitter | 任意（同进程） | `[宿主原生]` |
| 2 | `registerRequiredChildExtensions` | 父 → 子（启动配置） | 序列化快照 + 子进程加载模块 | **仅 `{id, path}`** | `[公开契约]` |
| 3 | 各类 `Symbol.for` 进程注册表（runtime agent / inspector / bg-work / capability-ceiling / external-runs） | 同进程 | `globalThis` | 各自固定记录 | `[公开契约]`，**明示不跨进程** |
| 4 | async run artifacts（`status.json` / `events.jsonl` / `process-terminal.json` / result·meta 文件） | 子 → 父 | 文件系统 | 包自有投影 | `[公开契约]`，文档指名的跨进程通道 |
| 5 | control channel（run 目录内文件 inbox） | 父 → 子 | 文件系统 | 固定请求类型：interrupt/timeout/stop/steer/command | 公开子路径**只导出 `requestAsyncStop`/`StopRequest`** |
| 6 | external-job provider bridge | 子(runner) ↔ 父（相对启动会话所在进程） | run 目录内文件请求/应答 | 固定操作：start/follow-up/status/result/reattach + provider 自定义 `options` | `[公开契约]`（external-job 子集） |
| 7 | supervisor / intercom channel | 子 ↔ 监督会话 | 文件 `requests/` + `replies/` | **模型面消息** + 固定信封字段 | `[公开契约]`（面向模型协调，不是扩展数据面） |
| 8 | runtime extension acknowledgement | 子 → 父（经 run 结果/状态） | 子进程内闭包 → 落盘投影 | **仅扩展 id 列表（≤32）** | `[公开契约]`（`ping.capabilities` 宣告） |
| 9 | pi session 文件（header `parentSession` + `custom` entry） | 跨进程可读的文件 | 文件系统 | 由写入方决定 | `[宿主原生]`；framework 当前不用 |

### 2.2 逐项要点与出处

1. **`pi.events` 是纯进程内**：宿主实现就是 `node:events` 的 `EventEmitter`（`E:/Developer/myhub/pi/packages/coding-agent/src/core/event-bus.ts:1-31`；`ExtensionAPI.events: EventBus` 于 `src/core/extensions/types.ts:1917`；pi docs 把「与另一个扩展通信」的唯一原生手段列为 `pi.events`：`packages/coding-agent/docs/extensions.md:87`）。nicobailon 在两处把这一点写成明确边界：「`pi.events` is in-process only. It does not reach separate Pi processes or child subagents; use the file lifecycle artifacts or `pi-intercom` for cross-process coordination.」（`docs/extension-api.md:170`、`docs/observability.md:335`）。
2. **`registerRequiredChildExtensions` 只传「要加载哪个模块」，不传数据**：`RequiredChildExtension = { id, path }`，`registerRequiredChildExtensions({sessionId, extensions, requireForAllRunners?})`（`src/shared/required-child-extensions.ts:9-25,74-84`；公开子路径 `src/api/required-child-extensions.ts:1-6`；`package.json` 的 `./required-child-extensions`）。注册表本身是**进程内** `Symbol.for("pi-subagents.required-child-extensions.v1")`（`:58-71`）；快照靠启动配置序列化下发（`child-runtime-config.ts:82-83`、`child-launch.ts:86-87,191-192`），mandatory 的另写 run 目录 `required-child-extensions.json`（`:103-115`）。公开文档：`docs/agents.md:449-455`——「Paths resolve to existing files and are canonicalized into an immutable launch snapshot；bounded safe IDs appear in evidence instead of paths. One registration is allowed per parent session until its idempotent `dispose()` runs, normally on `session_shutdown`.」。子侧确实会加载它：子会话新建 `DefaultResourceLoader` 并把 required path 放进 `additionalExtensionPaths`（`src/runs/shared/child-session.ts:455-466`），required 加载失败会拒绝启动。
   - 结论：这条路能给出**扩展激活**（因此子会话里可以有本 framework 的一份副本），但**不能**给出任何 State 值；payload 里没有值槽。
3. **进程级注册表都明示不跨进程**：`docs/extension-api.md:211`（runtime agent registration：「This contract is process-local. It does not register agents in child sessions or other Pi processes」）、`:428`（bg provider 经 `Symbol.for("pi-subagents.background-work.v1")`「allowing independently loaded extension modules to meet in one Pi process」）。它们在同一 OS 进程内跨 loader 可见，跨进程不可见。
4. **run artifacts 是文档指名的跨进程通道，但为单向、包自有投影**：`docs/extension-api.md:170`/`observability.md:335` 指向它；`observability.md:178` 还给跨会话读加了 `foreign_session` 拒绝语义。它是「子写、父读」的既成路径，载荷是 status/event/result 投影，不是通用键值面。
5. **control channel 只能控制，不能传值**：模块头明写它是 Windows 上替代 `process.kill` 的**文件控制 inbox**（`src/runs/background/control-channel.ts:1-17`），请求类型封闭为 `interrupt | timeout | stop | steer | command{status|yield|cancel}`（`:41-96`，`requestAsyncStop` 于 `:255`）；公开 `pi-subagents/control-channel` 只导出 `requestAsyncStop` 与 `StopRequest`（`src/api/control-channel.ts:1-4`）。
6. **external-job bridge 是真实的跨进程请求/应答，但被包自有操作封闭**：runner 进程把操作请求写进 async run 目录，启动该 run 的 Pi 进程（或启动该 run 的子会话）对已注册 provider 服务这些请求并写回应（`docs/extension-api.md:456`；`src/api/external-job-provider.ts:1,12` 的协议版本与操作词表）。它证明「跨进程文件请求/应答」这条形态在本包内已存在，但对外语义是 provider 操作，不是扩展间数据通道。
7. **supervisor/intercom 是模型面消息通道**：channel 根目录在 Temp 下的 `supervisor-channels`，固定 `requests/`、`replies/` 与请求/应答信封（`src/intercom/native-supervisor-channel.ts:9-14,42-66`，单条消息上限 64 KiB `:29`）；工具名 `subagent_supervisor`、桥接指令要求子代理用它向监督提问（`native-supervisor-channel.ts:20-21`、`src/intercom/intercom-bridge.ts:20-30`）。按题面约束，**模型消息不算机制**：它不经扩展 API，也不保证被监督会话接收，不能当 State 载体。`intercomBridge` 还需要显式配置，且在 mode 关闭 / `fork-only` 不匹配 / 拿不到 orchestrator target 时不激活（`inactiveReason`）。
8. **runtime acknowledgement 是唯一的「子进程扩展来源 → 父可见」通道，且按设计只带 id**：子侧 `subagent:acknowledge-extension` 事件被子进程自己的 hook 闭包收集（`src/runs/shared/subagent-prompt-runtime.ts:73-98`），在 `agent_end`/`session_shutdown` 落入 capture，再由 runner/executor 写进结果与状态；投影类型 `RuntimeAcknowledgedChildExtensions { version:1, source:"child-runtime", ids[], omitted }`（`src/shared/types.ts:1240-1246`，注释：**Best-effort child-runtime registration acknowledgement, not extension health**），校验只接受 id 形状且上限 32×128 字符（`src/runs/shared/runtime-acknowledged-extensions.ts:1-30`）。它给的是「哪些扩展在子运行时注册了」，不是值。
9. **pi 原生文件面**：session v3 header 带 `parentSession`（`packages/coding-agent/docs/session-format.md:72-75`）、`custom`/`customType`/`data` entry（`:169-172`）。身份与持久化条目跨进程**按路径可读**——但这是 pi 的会话格式事实，不等于 framework 有读它的接口（见 §1.5c、§3）。

### 2.3 「身份已知」与「State 可读」必须分开记

- **身份已知（够用）**：子会话知道自己是谁（当前 `sessionManager`），direct parent 身份在子会话文件 header/run meta 有（`child-session.ts:510-522`、`runner-child-launch.ts:41-42`）；detached runner 另收 `PI_SUBAGENT_PARENT_SESSION`（**仅 detached 进程**，root 与同进程前台不发布这条全局身份，`docs/watchdog.md:187`；变量定义 `src/runs/shared/child-runtime-config.ts:16-18`，赋值 `async-execution.ts:784-785`）。已发布实测也印证：前台同进程与后台独立进程都能观察到实际 session 身份与直接父链（[lighthouse 07](../lighthouse/07-nicobailon-runtime-validation.md)）。
- **State 可读（不够）**：没有任何公开机制把 owner 进程的**当前** State 值交给子进程，也没有 live 订阅。owner 的值只在 owner 进程 store 的私有 Map 里（§1.2）。
- 因此「对象身份（Owner/session）已知」这个事实**不能**被读成「Owner State 可读」。

### 2.4 对本题的直接回答

**不足够。** 现有公开机制合起来能给：扩展在子会话里被激活（#2）、子会话认识自己的身份与直接父（§2.3）、子进程把「哪些扩展注册了」回告父（#8）、以及经包自有控制/操作/工件通道的受限通信（#4–#6）。它**不能**给：owner 的当前 State 值（launch 时或 live 都没有），也不能给 `memory` 字段可用的 live 读。framework 侧的 `follow` 读取本身（`state.view(ownerKey).read(field)`）也不接受任何「外部提供的值」——值只能来自 store 自己的 cell。

---

## 3. 缺口与可研究的最小接口方向（不宣布不可能，也不批准任何 IPC）

### 3.1 缺口的准确表述

要让「独立进程子会话的某个 `follow` 字段读到 owner 当前值」成立，需要同时满足两件**目前都不存在**的事：

- **G1 owner 解析跨进程**：framework 现在只有 OMP 的进程内注册表上溯（§1.3）；pi 路径没有子代理 owner 解析。需要「子进程能得出 owner 身份（最近顶层 main）」的事实来源——注意这只解决 §2.3 的「身份已知」，本身不给值。
- **G2 owner 当前值跨进程可读**：需要一个**值通道**，且它与 `memory` 语义相容（`memory` 只能 live 读、绝不落盘复活，§1.6），并与 `session-entry` 的语义相容（持久化载荷不是 current value，§1.6）。

### 3.2 可研究的方向（每条只写「需要什么、代价/边界在哪」，均未获批准）

- **D1 启动时快照下发（父 → 子，随 launch 配置）**：需要给子会话的启动配置增加一个值槽（现有 `requiredExtensions` 只带 `{id,path}`，§2.2#2），或让父写一个子进程能读的文件。边界明确：这是**一次性快照**，与 GLOSSARY `follow` 的「read the owner's current value **live**」定义（`framework/GLOSSARY.md:155-157`）不一致，单独用它不足以兑现 `follow`；对 `memory` 字段还会把「活效应」的值冻结进介质，需先解决 §1.6 的约束。
- **D2 子侧读 owner 的持久化介质（子 → 父，事后读）**：需要拿到 owner 的会话文件路径（pi adapter 现在的 `PiSessionManager` 接口只有 `getSessionId/getSessionName/getBranch`，`pi.ts:28-32`），再按 pi 的 `custom` entry 约定去读（`session-format.md:169-172`）。边界：只可能对上 `session-entry`；对 `memory` 必须**禁止**这条路径；读到的是持久化值而非 current value。
- **D3 包自有 live 通道（父 ↔ 子，常驻）**：形态上本包已有先例（run 目录文件 inbox、artifacts、external-job 请求/应答，§2.2#4–#6），但**没有**任何一条对外提供「扩展可读的 owner 值」；走这条要么用既有通道的既有语义（控制/操作，语义不匹配），要么是对提供方的接口补充/上游贡献——那是决策票 03/04 的取舍范围，本轮不批准。
- **D4 不实现 pi 路径的 inheritance（现状事实，不是新决定）**：framework 现有政策已把 pi 子代理 State 继承记为**未实现/推迟**，并要求将来 pi adapter 在首次激活时一次性告知「框架不会把激活传播到子代理」（`harness-support.md:157-161`、`0002:251-253`）。记录它是为了说明「缺口当前由哪条既有措辞承接」，而不是替用户选择。
- 若这些方向都不采纳，框架侧现有的兜底是**逐项 `unavailable`/读声明默认值**（`state-scope.ts:32-34` 的默认分支、`protocol.ts:19-23` 的三态语义），但那是能力缺失的可见表达，不是覆盖。

### 3.3 与现行约束的关系（只陈述，不裁定）

- ADR 把「跨受支持子代理路径的 State 关系」放在 **harness adapter** 职责内，且不要求框架引入子代理调度器（`0002:247`）；`framework/docs/extension-development-map.md:59` 也把「观察范围」与「效果权限/State Owner」分开。
- 本票的组织约束：第三方适配集中在一个文件或目录、不向业务泄漏第三方 context/registry、不为缺失依赖默默降级。上述任何方向都必须落在 adapter/harness 层，business 只经 framework 的公共读取面（`stateValueFor` / `RunDelivery.owner`）感知结果。

---

## 4. 注销 / 父退出相关的公开事实

### 4.1 framework 侧

- owner 的 `session_end`：删 cell（`#cells.delete`）→ 撤销该 owner 已保留的 capability（`#ownerLives.end`），只有 `reason === "disposed"` 才发布 marker（[`state.ts:166-175`](../../../framework/core/state.ts)）；`OwnerLives.retain` 对一个已结束的 owner 立刻判死（`owner-lives.ts:52-56`），`begin` 才重新开放。`serves(ownerKey)` 对已退役 owner **仍为真**，以便由服务过它的 store 回答声明默认值（`state.ts:88-98` 注释）。
- 因此：owner 会话结束后，framework 不存在任何「该 owner 的当前值」可供 follow；能留下的只有 `session-entry` 介质里的历史载荷。

### 4.2 nicobailon 侧（公开事实）

- **子扩展登记的寿命**：一个父 session 只允许一次注册，直到幂等的 `dispose()`（通常 `session_shutdown`）才释放（`docs/agents.md:449`）；重复注册抛错（`src/shared/required-child-extensions.ts:80-84`）。登记**不随处置消失于在途 run**：requirement 随 nested/detached/resumed/recovered/workflow-script/appended 启动保留，处置登记或 `extensions: []` 都不能丢掉它（`docs/agents.md:451-455`）；mandatory 快照另写 run 目录 `required-child-extensions.json`（`required-child-extensions.ts:103-115`）。子扩展自身抛错会影响启动（required extension 的 `session_start` 抛错 → 处置子会话并拒绝 launch，`docs/agents.md:451`）。
- **父退出与在途子进程**：detached 子「do not stop when the session does」——它们是宿主进程的子进程，run 会继续、完成，但**无人被通知**；丢的是通知不是工作（`docs/extension-api.md:611`）。
- **进程级注册表的处置**：bg provider 注册「reload-safe：同名新 provider 替换旧的，旧 disposer 不能移除新者」，并在 provider 消失时**fail closed**（`docs/extension-api.md:426-429`）；runtime agent 登记是进程级、不进入子会话或其他 Pi 进程（`:211`）。
- **`ownerState` 的语义本轮未证实，不得当 framework Owner 或 State 事实引用**：nested run summary 带 `ownerState: "live"|"gone"|"unknown"`（`src/shared/types.ts:1617,1672`；过 sanitize `nested-events.ts:367,423`，缺省 `"unknown"`；发射 `subagent-executor.ts:7914`（`state === "running" ? "live" : "gone"`）、`async-execution.ts:1761`（恒 `"live"`））。事实是：**没有任何公开 doc 定义它，`src/` 里也没有消费方解释它**（只有 `result-intercom.ts:116` 的透传），因此它的语义在本轮属于证据不足；`[INFERENCE]` 从字段名与相邻的 `*IntercomTarget` 字段看，它更像 intercom 监督/路由侧的存活标记，而非 framework 语义里的 Owner，尤其不是任何 State 值（framework 的 Owner 定义见 [`framework/GLOSSARY.md:159-161`](../../../framework/GLOSSARY.md)）。已发布实测里出现过 `"ownerState":"gone"`（`research/07-runtime-validation/raw/live-main.stdout.jsonl`，经 lighthouse 07 转引），同样只作事实记录。
- **监督通道的激活条件**：intercom 桥接在 mode 为 `off`、`fork-only` 而 context 不是 fork、或拿不到 orchestrator target 时不激活（`src/intercom/intercom-bridge.ts` 的 `inactiveReason`）；`contact_supervisor` 是模型面、且不是可靠的父存活探测。

---

## 5. 未决项与证据边界

- **本轮零运行**：§1–§3 中所有「能/不能」都是静态读码结论；涉及运行后果的已标 `[INFERENCE]`，其余转引已发布实测。
- **`pi-intercom` 只被点名、未被核对**：nicobailon 文档把它列为跨进程协调手段（`docs/extension-api.md:170`、`observability.md:335`），但本轮**没有**核对该包自身的契约/版本/是否已安装。若要把它列为候选通道，必须另行取证（不得据文档一句话当机制）。
- **来源形态**：本轮读 git checkout（`index.ts` + `src/api/*.ts`）；npm 工件的入口与 `pi.extensions` 指向 `.js`（研究勘误 §2.1），比较时必须写明形态。
- **未逐符号核对的项**：`external-job-provider` 的 `options: Record<string,unknown>` 具体透传范围与边界（本轮只读到接口与文档段落，未读服务端实现全文）；`native-supervisor-channel` 的 1000+ 行实现只读了头部与信封类型。
- **[INFERENCE]**：子会话新建 loader（`child-session.ts:455-466`）意味着即使前台同进程，子里的扩展激活也是**另一条 loader/bus 与另一个 store**；`Symbol.for` 进程注册表在同进程内仍互通，但 framework 的 State 值不在其中。此点由源码结构推出，未运行验证。
- **[INFERENCE]**：`ownerState: "gone"` 对「父进程已退出」只是**代理证据**（它就是 intercom owner 会话的运行态），不能直接当父进程生死判据。

---

## 6. 主会话下一可讨论的问题（不预设答案）

1. **pi 路径的 `follow` 到底算「已实现」还是「按既有政策记为未实现」**：现行 ADR/harness-support 已把 pi 子代理 State 继承写成未实现并规定一次告知；若沿用，本票只需决定「告知与可用性可见行为」落在哪个 adapter/harness 文件；若要求兑现，则必须回答 G2 走 D1/D2/D3 中的哪类方向。
2. **若要求一条值通道，语义边界怎么定**：快照型（D1）与 `follow` 的 GLOSSARY 定义冲突，是否需要收紧定义或改用 `none` + 默认值；`memory` 字段如何保证不被任何持久化路径复活（§1.6）。
3. **owner 解析归属**：把 G1 落在 pi adapter（对应 OMP 的 `ownerReferenceFor` 位置），还是落在 model-cost 的内置观察（组织票已确认内置观察随 model-cost 交付）——两者都不得让 model-cost 复制公共 Owner 语义。
4. **与 decision/08 的边界**：子会话身份/直接父事实与 Round 开闭事实同源，接口草案不得替 decision/08 定义 Round 语义。
