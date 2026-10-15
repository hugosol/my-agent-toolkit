# OMP 子代理能力基线与 model-cost 迁移差距（事实基线）

Ticket: `.scratch/model-cost-pi-migration/decision/01-capability-baseline.md`（BaselineResearch 所有）
Map: `.scratch/model-cost-pi-migration/map.md`

## 目的与方法

本文件是**事实基线**，不是设计，也不批准任何提供方选择。它给出可供候选逐项对照的稳定行标识（`F-*` 框架语义、`O-*` OMP adapter 映射、`N-*` OMP 原生事实、`M-*` model-cost 消费子集、`P-*` pi 原生/adapter 缺口），每行都带源码位置。

方法：只读阅读源码与仓库文档；未运行任何生产迁移、未启动真实会话、未跑构建/lint/测试。凡本文件写“运行时行为”的行，都是**源码事实或仓库已记录证据**的重述，不是本次观察到的运行结果。

### 来源修订

| 来源 | 修订 | 说明 |
| --- | --- | --- |
| 框架/扩展仓库（本仓库） | `E:/Developer/myhub/my-agent-toolkit` @ `59f36fbf2ab6be22879f3bd5370dd09815352974`（分支 `pi-adapter`） | 所有 `framework/**`、`extensions/**` 行号以此为准 |
| OMP 参考检出 | `E:/Developer/myhub/oh-my-pi` @ `N-REV`（见 N 段） | 原生事实行号 |
| pi 参考检出 | `E:/Developer/myhub/pi` @ `P-REV`（见 P 段） | pi 原生事实行号 |
| 记录的支持基线 | `@oh-my-pi/pi-coding-agent@18.5.0`，检出 `9348320cc4a30a7195d36a1f05a6c11bcb701a17`，Windows x64，Bun 1.4.2（`framework/docs/harness-support.md`） | 支持状态由该文档拥有 |

### 隔离

- research 分支：`research/omp-capability-baseline`
- worktree：`E:/Developer/myhub/wt/omp-capability-baseline`
- 本报告在 worktree 内路径：`.scratch/model-cost-pi-migration/research/omp-subagent-capability-baseline.md`

---

## A. 框架公共语义（harness 无关契约）

这些是 framework `core` 拥有的语义，任何宿主 adapter 都必须映射；extension 只能消费，不能自带第二套。

| 行 | 事实 | 位置 |
| --- | --- | --- |
| F-OWNER | `OwnerReference = {kind:'owner'\|'inherited'\|'unresolved', key?}`。Owner = 最近的、自身即顶层 main 的祖先会话；subagent 本身不是 Owner（`inherited` 无自己的 State cell），链走出进程即 `unresolved`。key 是 adapter 的不透明身份，框架不解析。 | `framework/core/protocol.ts:30-33`；术语 `framework/GLOSSARY.md:159-161`（Owner） |
| F-SESSION-REASON | 会话轴：`session_start{reason: initial\|new\|resume\|fork}` 与 `session_end{reason: transferred\|disposed}` 是对称对；`session_facts` 既非边界也非转移（只报该会话说自己变了的事实，不做 reconcile、不发 marker）。一次换 owner 的转移 = 先 `session_end(transferred)`（被离开的 owner）再 `session_start(reason)`；不换 owner 的导航（tree jump、reload、同文件 resume、原地 context reset）不产生任何事件。 | `framework/core/protocol.ts:43,53,75-78` |
| F-SESSION-FACTS | `SessionFacts{sessionId, kind:'main'\|'sub', parentSessionId?, name?, taskName?, agentName?, agentId?, startup?, unavailable[]}`。`parentSessionId` 与 `kind` 是**位置**不是 Owner；`name` 是展示数据，永远不是身份；`taskName` 是 spawn 分配给该工作的 handle（不是 agent 定义名，也不是 registry id）；`unavailable` 逐项列出宿主拿不到的事实，绝不以当前会话/进程级标签/看似层级的字符串猜测。 | `framework/core/protocol.ts:163-266` |
| F-STARTUP | `SessionStartup{model?{provider,model}, effort?}` 只在**证明会话在该处开始**的那一次 start 交付上出现：reason 非 `resume`/`fork`，且该会话自己的 branch 尚未携带 user/assistant 消息。`effort` 是宿主解析后的有效 thinking level（配置里的 `auto` 不是 level）。拿不到的部分进 `unavailable`，不从当前设置回填。 | `framework/core/protocol.ts:137-152,213-226` |
| F-SCOPE | `ObservationScope = 'owner'\|'session'`；`SubscriptionGroup{scope, events}` 的 scope 对整组声明一次。`owner` 组只收 owner 自身的交付；`session` 组收 adapter 报告的**每个 actual session** 的交付（各自的 identity、直接 parent、latest name、spawn 的 task handle，以及证明该会话开始的那次 start 上的 model/level）。扩宽 scope 不授予 State 写权、不授予对外效应权、不改变 State 继承。 | `framework/core/protocol.ts:246,256-259`；术语 `framework/GLOSSARY.md:47-53` |
| F-SCOPE-GATE | 分发闸门实现只有一处：`admits(scope, owner)` = `scope==='session' \|\| owner.kind==='owner'`；`dispatchToGroups` 按组声明顺序把交付交给每个被准入的组。 | `framework/behaviors/subscriptions.ts:29-31`（`admits`）、`framework/behaviors/subscriptions.ts:63-…`（`dispatchToGroups`） |
| F-SESSION-DELIVERY | adapter 侧的会话交付 `SessionDelivery{event, session, owner, statePayloads, persist, hasUI, feedback, notices, markers}`：adapter 报“哪个会话、其 branch 持久化了什么、是否该会话自己的 startup”，**不**判断 payload 是否声明了可用值（那是框架的规则）。 | `framework/core/protocol.ts:271-…` |
| F-SESSION-HANDLER | 订阅者拿到的 `SessionEventDelivery{event, session, owner, hasUI, feedback, capability}`：没有 branch payload、没有框架 notice 通道；`capability` 是 owner 作用域的效果句柄（`session_end` 上出生即失效）；`feedback` 是该次 dispatch 自己的通道，dispatch 结束即关闭。 | `framework/core/protocol.ts:336-…` |
| F-ROUND-EDGE | 轮次轴是 `round_start`/`round_end` 这对**无 payload** 的边；框架拥有身份与开闭合成（`behaviors/round-events.ts`），adapter 只报本宿主的 run-cycle 事实。一次 settle 只是**end candidate**：框架在宿主的 `nextTask` 上做**一次**重检，只有届时 quiescence 成立（idle、无排队消息、无运行中的异步 job）才关轮，否则候选保留给下一个可能决定它的事实；不轮询、不等时长。 | `framework/core/protocol.ts:402,449-451,465-…`；行为 `framework/behaviors/round-events.ts`；端口 `framework/core/protocol.ts:1393-1413`（`onRound`/`nextTask`） |
| F-TURN | Turn = 一次可观察的模型请求/响应周期（工具执行不在其中）。`turn_start` 固定 `turnId`（框架铸造，绝不是 provider id）、actual session、所属 Round、真实开始时刻、请求当时的 provider/model、以及扩展自己的 catalog 在该时刻报的价；`turn_end` 重复同一身份并带 outcome/可靠 usage/HTTP 事实/两个 provider reference id。无法取得的事实逐项进 `unavailable`；usage 是“可靠读数或 unavailable”，绝不是默认 0；同一 Turn 只交付一次，读数不同的重复 settle 记为冲突并丢弃。 | `framework/core/protocol.ts:507,517-…,633-…,664-…`；`framework/docs/framework-capabilities.md`（“The Turn axis and the two observation scopes”） |
| F-RUNTIME | subagent-runtime 轴只有一种事件：一次**execution**（一次 spawn 的 subagent 会话，且它可能运行多次）的、**宿主自己测量的**耗时。`SubagentRuntimeFact = {kind:'reading', executionId, runtimeMs, status:'running'\|'ended'} \| {kind:'unavailable', reason}`。它既不是会话 span（含执行之间的空档），也不是 Round 边、不是 Turn；框架不合成、不持有状态、不做累积决策，逐条原样交付（含重复读数）。“无交付”= 尚无读数；“unavailable”= 本该有读数但拿不到（零是真读数）。创建窗口（会话尚未建立）是唯一静默：不报 unavailable，因为读数**累积**，第一次能归因的交付带全量耗时。 | `framework/core/protocol.ts:758-…`；`framework/docs/framework-capabilities.md`（“The subagent-runtime axis”） |
| F-RUNTIME-SCOPE | runtime 交付命名**该 execution 自己会话**的 identity/直接 parent/latest name，owner 经会话图解析：`owner` 组不会被子会话的工作牵动，`session` 组会——与子代理自己的 round 边和 Turn 完全一致。交付无 capability（观察不是授权）。 | `framework/core/protocol.ts:790-…`；`framework/docs/framework-capabilities.md` 同上 |
| F-INPUT | 输入轴只有一条边 `user_input`：宿主自己归因为**用户**提交、且被会话接收的一次 input；不区分普通 prompt、queued steer、follow-up、user-invoked skill，也不带文本/图片/来源细节。extension 自己提交的 input 不属于该事实。 | `framework/core/protocol.ts:830,843-…` |
| F-VIEWED | `ViewedSessionPort{read(): OwnerReference \| undefined, subscribe(listener(markers)): ()=>void}`：它是**席位**不是权限——读它不写 State、不留 capability、不驱动 owner 效应；“本宿主没有该出口” = `read()` 返回 `undefined`（框架回退到交付自带的位置），而“出口存在但取不到 owner” = 解析出 `unresolved`（投影为“无 cell”，空掉区域）。 | `framework/core/protocol.ts:941-…`；术语 `framework/GLOSSARY.md:163-165,187-193` |
| F-CAPABILITY | owner 作用域效果句柄：`state`（read 无门禁；write 只在其 owner 生命期内有效）与 `feedback`；owner 生命结束即失效（晚到的回调写入是 no-op，feedback 被丢弃）。 | `framework/core/protocol.ts:432-…`；`framework/docs/framework-capabilities.md`（“Owner-scoped effect capabilities”） |
| F-LIFECYCLE-IMPL | implementation `initialize` 每进程至多一次、在 owner 会话节点、且第一个模型请求等它 settle；`cleanup` 至多一次、在“它正在服务的会话被 dispose”时；普通切换不 dispose（`transferred` + 新 start 只是把服务对象换掉）。subagent 的 binding 从不 initialize、也不会交付那个 dispose，因此子会话流量不能拆掉 CLI 的实例。 | `framework/docs/framework-capabilities.md`（“The implementation factory and its lifecycle”）；术语 `framework/GLOSSARY.md:139-141` |
| F-HOOKS-CONDITIONAL | 端口钩子按需订阅：只有声明了相应事件种类的组存在时才注册 `onRound`/`onTurn`/`onSubagentRuntime`/`onUserInput`（`subscribesAny`）。 | `framework/behaviors/binding.ts:358-371`（round+turn）、`:391-405`（subagent-runtime）、`:407-…`（user-input） |
| F-PORT | `HarnessPort`：必备 `setLabel/reportDiagnostic/onSession/onRound/onTurn/onSubagentRuntime/onUserInput/nextTask/onRunInitiation/registerCommand`；**可选且可省**的事实出口 `modelPrices?`、`providerAccess?`、`viewedSession?`——adapter 拿不到就整体省略，extension 得到“没有这个事实”而不是空查询。 | `framework/core/protocol.ts:1347-…`（成员声明至 `:1526`） |
| F-COMMAND-FACTS | 命令调用事实：`args`、`owner`、`hasUI`、`canAcceptInput`（三值：`true`/`false`/`undefined`=该宿主不报空闲事实）、`provider`（该会话当前 model provider，不报则为 `undefined`）、以及 feedback/persist/marker 通道。 | `framework/core/protocol.ts:1139,1150-…`；`framework/docs/framework-capabilities.md`（“Notices, marker and owner scope”） |
| F-STATE-INHERIT | State 继承是**逐字段**轴：`none`（默认，读声明默认）或 `follow`（live 读 owner 当前值）；子代理各自独立的注入进度不属于继承。 | 术语 `framework/GLOSSARY.md:155-157`；`framework/docs/harness-support.md`（“Harness-qualified capability: subagent State inheritance”） |
| F-ONE-MAIN | Owner 解析（`parentId` + `AgentRegistry` 走到最近顶层 main）**只在进程内只有一个 main 会话时无歧义**：两个 main（ACP/cmux/嵌入式宿主，或活过 `/new` 的 subagent）是记录在案的**不支持**形状，无测试、绿套件不构成通过。 | `framework/docs/harness-support.md`（“First-release limitation: one main session per process”） |
| F-DECLARED-REQ | `requiredSemantics`（`session-lifecycle-events`/`round-lifecycle-events`）是**验证输入**，不是运行时开关；绑定不做任何兼容性/能力检查。 | `framework/core/protocol.ts`（`RequiredSemantic` 见 `framework/core/requirements.ts`）；`framework/docs/framework-capabilities.md`（“Declared requirements”） |

### A.1 framework 复用面（迁移时不得重建的部分）

- 会话/轮次/Turn/runtime/input 五轴的**语义、身份、顺序、去重、冲突与观察范围**全部在 framework `core` + `behaviors`（`subscriptions.ts`、`round-events.ts`、`turn-events.ts`、`session-events.ts`、`state.ts`、`lifecycle.ts`）。adapter 只做“原生事实 → 语义交付”的映射。
- 通用基础能力：`request`（`framework/modules/http.ts`）、`updateFile`（`framework/modules/files.ts`）、`readConfig`/`getConfig`（`framework/core/config.ts`）。扩展直接 import，不经宿主。
- 生命周期/绑定/持久化/标记区/反馈通道：framework 拥有（`behaviors/binding.ts`、`core/state.ts`、marker area 为每进程一个、注册在进程 global）。

---

## B. OMP adapter 映射（原生事实 → 框架语义）

这一层是 `framework/adapters/omp/**` 的实现事实：**哪些原生事实被读、映射成什么、拿不到时怎么命名**。它不等于原生 API 全貌（见 N 段）。

| 行 | 事实 | 位置 |
| --- | --- | --- |
| O-NATIVE-API | adapter 只命名它用到的原生成员：`setLabel`、`registerCommand`、`appendEntry`、`on('session_start'\|'session_switch'\|'session_branch'\|'session_tree'\|'session_shutdown')`、`on('agent_start'\|'agent_end')`、`on('before_agent_start')`、`on('before_provider_request'\|'after_provider_response'\|'message_start'\|'message_update'\|'message_end')`、`on('tool_execution_update'\|'tool_execution_end')`、`on('input')`、`getThinkingLevel?()`、`pi?`（SDK：`AgentRegistry.global()`）、`events?`（事件总线，读两个 subagent channel）。未命名成员即使原生存在也不被读。 | `framework/adapters/omp.ts:405-504`（`OmpExtensionApi`）、`:550-580`（`OmpAgentRef`/`OmpAgentRegistry`/`OmpSdkSurface`） |
| O-NATIVE-CONTEXT | 每次交付的 context 读取面：`agent{kind:'main'\|'sub', id, name?, parentId?}`、`sessionManager{getSessionId, getBranch, getSessionName?, onSessionNameChanged?}`、`model?{id,provider}`、`models?.list()`（含每 model 的 cost 四桶）、`hasUI`、`ui`、`getViewedSession?`、`subscribeViewedSessionChanged?`、`modelRegistry?{getProviderBaseUrl?, getApiKeyForProvider?}`、`isIdle?`、`hasPendingMessages?`、`getAsyncJobSnapshot?`。 | `framework/adapters/omp.ts:124-259` |
| O-OWNER | `ownerReferenceOf`：`kind==='main'` → `{owner, key:'main:<sessionId>'}`；否则 `mainAncestorOf(parentId)` 沿注入的 `AgentRegistry` 走，命中 main → `{inherited, key:'main:<其sessionId>'}`；链断/环/会话消失 → `unresolved`。会话身份用 sessionManager 的 id，绝不用进程级 `"Main"` 标签或嵌套深度。 | `framework/adapters/omp/session/facts.ts:21-23,36-43,55-70` |
| O-OWNER-VIEWED / O-OWNER-EXEC | 显示会话的席位用同一套 walk（`viewedOwnerOf`）；一次 execution 自己的会话 owner 也用同一套（`executionOwnerOf`，不是观察 binding 的 owner）。 | `framework/adapters/omp/session/facts.ts:84-92,287-290` |
| O-SESSION-MAP | `createSessionObserver`：订阅 `session_start`（→`initial`）、`session_switch`/`session_branch`（→ `startReasonOf`）、`session_shutdown`（→`session_end(disposed)`）；`session_tree` **不订阅、不映射**（同一 owner、不同 leaf 的导航，无事件）。判据是 binding 当前的 `activeOwnerKey`：owner key 不变即无事件；变了则先 `session_end(transferred)` 再 `session_start(reason)`；shutdown 只结束 binding 当前服务的那个 key。 | `framework/adapters/omp/session/lifecycle.ts:26-48,71-176` |
| O-SESSION-REASON | 原生 reason → 语义 reason：`new→new`、`resume→resume`、`fork→fork`、`branch→new`、`btw→new`；无 reason 视为 `new`。 | `framework/adapters/omp/session/facts.ts:122-145` |
| O-SESSION-FACTS | `sessionFactsOf` 读取：kind、直接 parent（`parentId` 一跳 + registry 的 live session）、`getSessionName?.()`（空/缺失 → `unavailable`）、`agent.name`→`agentName`、`agent.id`→`agentId`，并令 `taskName = agentId`（仅 sub）；start 交付上且 `beginsHere` 时才带 `startup`。每一项拿不到都 push 进 `unavailable`（中文/英文事实名）。 | `framework/adapters/omp/session/facts.ts:177-232` |
| O-BEGINS-HERE | `beginsHere`：reason 非 `resume`/`fork`，且 branch 上没有任何 `type==='message'` 且 role 为 user/assistant 的条目 → 该 start 证明会话在此开始。 | `framework/adapters/omp/session/facts.ts:238-245` |
| O-STARTUP | `startupFactsOf`：model 取 `ctx.model` 的 `{provider,id}`（缺一即 `unavailable('startup model')`）；effort 取 `pi.getThinkingLevel()`（该 getter 不存在 → `unavailable('startup effort')`；存在但答空 → 无 effort，不伪造）；两者皆无 → 整个 `startup` 不出现。 | `framework/adapters/omp/session/facts.ts:258-281` |
| O-NAME-CHANGE | 每个 session manager 只订阅一次 `onSessionNameChanged`（`WeakSet` 去重），回调交付 `{kind:'session_facts'}`；subscribe 用 `ownerOf(ctx)` 重新解析。管理器不提供该方法 → 该桥惰性，退化为在其它交付上读名字。 | `framework/adapters/omp/session/lifecycle.ts:102-112` |
| O-SCOPE-ASSEMBLY | 每个交付都带 `ownerOf(catalogued(ctx))`：解析不出 owner 时**每 binding 只报一次**诊断（`no owning main session resolved for this session; the extension stays off`），extension 仍然绑定并继续运行。 | `framework/adapters/omp.ts:808-831` |
| O-ROUND-MAP | `observeRounds`：`agent_start`→`{kind:'activity_started'}`；`agent_end`→`{kind:'settled', willContinue: event.willContinue===true}`。settle 时**不**读空闲；`quiescent()` 作为延迟读挂在每次 observation 上，在框架重检时才求值：`isIdle() && !hasPendingMessages() && (getAsyncJobSnapshot()?.running.length ?? 0)===0`；三个事实任一缺失 → `reportMissingFact(...)` → 返回 `undefined`（不成立，不关轮）。 | `framework/adapters/omp/round.ts:10-65` |
| O-NEXT-TASK | `nextTask(callback)` = `setTimeout(callback, 0)`（宿主自己的任务队列，作为框架唯一一次重检的时点）。 | `framework/adapters/omp.ts:887-892` |
| O-TURN-MAP | `before_provider_request` → `request_started`（`at: Date.now()`、`provider`/`model` 取自 `ctx.model`；缺 model 身份 → `reportMissingFact('model identity at a request start')` 且**不**发信号）；`after_provider_response` → `response_received`（status/headers/metadata/requestId）；`message_start` 清该 session 的流式读数缓存；`message_update`（仅 assistant）→ `usage_streamed`，按 session 去重（与上次读数相同则不发）；`message_end`（仅 assistant）→ `response_settled`（`at: Date.now()`、outcome、readings、responseId）。 | `framework/adapters/omp/turn.ts:61-147` |
| O-TURN-ZERO | assistant message 的 usage 恒存在，但宿主在 provider 未报 usage 时填全零对象：与 `ZERO_READING` 逐桶相等的读数**视为没有读数**（返回 `undefined`），非零读数原样交付。outcome：`stopReason==='aborted'`→`cancelled`；`stopReason==='error'` 或有 `errorMessage`→`failed`；其余（含只请求工具）→`completed`。 | `framework/adapters/omp/turn.ts:11,23-32,43-47` |
| O-RUNTIME-ROUTE-1 | 委派工具路线：`on('tool_execution_update'\|'tool_execution_end')` 且 `event.toolName==='task'`；从 `payload.details.progress[]`（running）或 `details.results[]`（ended）取条目，条目字段 `id`（spawn 的 registry 身份）与 `durationMs`；首选列表按 status 选，另一列表作为 fallback。 | `framework/adapters/omp/subagents.ts:30,50-59,391-397` |
| O-RUNTIME-ROUTE-2 | 事件总线路线：`task:subagent:progress` 的 `payload.progress{id,status,durationMs}`（status `running`/`pending`→running；`completed`/`failed`/`aborted`→ended；其它 → 不发）；`task:subagent:lifecycle` 的帧仅用于“开启一次 execution”的计数（`status==='started'` 且 `id` 非空）。总线帧没有自己的 context，使用 binding 的**最新一次实际交付** context；无 context 则丢弃。 | `framework/adapters/omp/subagents.ts:33-36,319-360,391-399` |
| O-RUNTIME-IDENTITY | execution 身份 = 宿主自己的 agent id；同一 agent 的后续 execution 用 `<agentId>#<n>`（n 由 lifecycle `started` 帧计数，首执行保留裸 id）。计数与归因记忆（`attributedBefore`/`recordAttribution`）**每次订阅各建一份**，不跨 binding 共享。 | `framework/adapters/omp/subagents.ts:89-163` |
| O-RUNTIME-ABSENCE | running 读数且 identity 已知但 registry 解析不出 session、且该 identity 此前从未被归因 → **不产生交付**（创建窗口，不报 unavailable；因为读数累积，首个可归因交付带全量）。identity 未知 / registry 无该 agent / 有 agent 无 session → `unavailable{reason}`（锚定到“观察到该 execution 的那个会话”，`frame.session`）。durationMs 非有限数或负数 → `unavailable`。`status==='ended'` 的读数即使尚无 session 也报 `unavailable`。 | `framework/adapters/omp/subagents.ts:181-274` |
| O-RUNTIME-FACTS | execution 的会话事实由 `executionSessionFacts` 从 registry 读（parent 一跳、sessionManager 命名），拿不到的部分进该 delivery `session.unavailable`；owner 用 `executionOwnerOf`。 | `framework/adapters/omp/subagents.ts:70-87` |
| O-INPUT-MAP | `onUserInput`：注册 `pi.on('input')` 并过滤 `event.source==='extension'`；其余（interactive/rpc）视为用户提交，交付 `{kind:'user_input'}` + owner/session/hasUI/feedback。宿主拒绝该注册 → 捕获异常、每 binding 报一次诊断（`this harness publishes no submission event (input); the framework reports no user input rather than inventing one`），其余绑定照常。 | `framework/adapters/omp.ts:893-922` |
| O-VIEWED-MAP | `createViewedSession`：`read()` 经最新 context 调 `ctx.getViewedSession()` 并用 `viewedOwnerOf` 解析席位（无 context 或无出口 → `undefined`）；`subscribe(listener)` 维护 binding 自己的 listener 集合，并把宿主订阅按最新 context 重新指向（同一 context 不重复订阅）；最后一个 listener 退出时释放宿主订阅。 | `framework/adapters/omp/viewed-session.ts:58-117` |
| O-PRICES | `modelPrices`：从最新 context 的 `models.list()` 取 model 的 cost 四桶（`input`/`cacheRead`/`cacheWrite`/`output`），单位 USD/百万 token（`HARNESS_PRICE_CURRENCY='USD'`、`HARNESS_PRICE_UNIT='USD/百万 token'`）；catalog 没有该 provider+exact model，或四桶全零 → 不答（不是零价）。 | `framework/adapters/omp.ts:590-649` |
| O-PROVIDER-ACCESS | `providerAccess`：从 `ctx.modelRegistry` 命名两个成员 `getProviderBaseUrl(provider)` 与 `await getApiKeyForProvider(provider, sessionId?)`；registry 的无 key 哨兵值映射为“无凭据”；两者都取不到 → 不答。 | `framework/adapters/omp.ts:659-705` |
| O-MARKER-FEEDBACK | marker：`ctx.ui.setWidget(MARKER_AREA_KEY, lines|undefined, {placement: MARKER_AREA_PLACEMENT})`，无 UI 直接 no-op（无文本等价物）。notice 与 feedback 都走 `publishNotice`：有 UI 用 `ctx.ui.notify(message, level)`，无 UI 写一行 stderr。框架诊断一律 stderr（启动时还没有 UI）。 | `framework/adapters/omp.ts:72,75,716-723,778-806,741-743` |
| O-COMMAND-FACTS | 命令交付：`args`、`owner`、`persist`（`pi.appendEntry(stateEntryType,…)`）、`hasUI`、`canAcceptInput: () => ctx.isIdle()`（无该原生方法 → `reportMissingFact('idle fact (isIdle)')` 返回 `undefined`）、`provider: ctx.model?.provider`、feedback、markers。 | `framework/adapters/omp.ts:837-840,972-1002` |
| O-FACTORY | `ompAdapter(definition, options)` 返回 `(pi) => BindingResult`；工厂每进程最多调用一次（`resolveImplementation`，已 dispose 则重建），之后的每个 binding（另一会话、子代理）复用同一 implementation。 | `framework/adapters/omp.ts:1028-1061`；`framework/docs/framework-capabilities.md`（“The implementation factory and its lifecycle”） |
| O-EXTENSION-ENTRY | model-cost 的宿主入口是 thin re-export：`entrypoints/omp/model-cost.ts` 默认导出 `extensions/model-cost/harnesses/omp.ts` 的 `modelCost`。 | `entrypoints/omp/model-cost.ts`；`extensions/model-cost/harnesses/omp.ts:189-223` |

---

## C. OMP 原生事实（宿主机制）

三个来源要分开看，行标记注明出处：

- `OMP185` = 冻结的受支持安装 `.cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent`（**18.5.0 未打补丁**）
- `OMP185P` = 冻结的合并补丁安装 `.cache/omp-baseline/18.5.0-viewed-session-codex-response/node_modules/@oh-my-pi/pi-coding-agent`（Viewed session 补丁 + Codex response-boundary 补丁）
- `OMPCHK` = 本地参考检出 `E:/Developer/myhub/oh-my-pi` @ `611c189fa2f6b8c9b368559ea6b98062b9b54539`，`@oh-my-pi/pi-coding-agent@18.10.4`

> 证据限制：`OMP185`/`OMP185P` 是**已发布 tarball 的源码**（受支持工件），`OMPCHK` 是**未构建完整会话的检出**（框架文档已说明本地检出不能跑完整会话）。两者都是**读源码**，不是运行观察。

| 行 | 原生事实 | 位置 |
| --- | --- | --- |
| N-AGENT-IDENTITY | `ExtensionAgentIdentity{kind:'main'\|'sub', id, name, depth, parentId?}`，注释明确“用 `kind` 而不是 `depth` 区分 subagent：`/tan` 克隆是 depth 0 的 subagent”。context 上是 `agent: ExtensionAgentIdentity`。 | `OMP185` `src/extensibility/extensions/types.ts:464-486`、`:517`；`OMPCHK` 同文件 `:487-509`、`:698-699`（18.10.4 行号不同） |
| N-AGENT-REGISTRY | 进程级 agent 注册表：`AgentRegistry.global()`（惰性单例）、`get(id)`、`list()`、`listVisibleTo(id)`、`onChange`；`AgentRef{id, displayName, kind:'main'\|'sub'\|'advisor', parentId?, status, session: AgentSession\|null, …}`，`session` 恰在 parked/aborted 时为 `null`。**扩展 context 上没有 registry 成员**，只能深导入 `AgentRegistry.global()`。 | `OMP185` `src/registry/agent-registry.ts:63-77,112-115`；`OMPCHK` 同文件 `:74-95,121-149,317-331`（列出扩展取用点 `internal-urls/agent-protocol.ts:26`） |
| N-TASK-TOOL | 宿主自己的委派工具 `TaskTool`，`name = "task"`；参数含 `name?`、`agent?`、`task?`、`tasks?`、`isolated?` 等；工具 details 里带 `results: SingleResult[]`、`progress?: AgentProgress[]`、`totalDurationMs`、`usage?`、`async?`。 | `OMP185` `src/task/index.ts:556`（`class TaskTool`）、`:138`（导出 `AgentProgress/SingleResult/TaskToolDetails`）；`pi-tui` 侧类型 `pi-tui/src/tools/task.ts`（`AgentProgress` 字段起 `:2265`，`SingleResult` 起 `:2362`） |
| N-TASK-ENTRY | 每 spawn 条目含 `id`（spawn 的 registry 身份）、`status: 'pending'\|'running'\|'completed'\|'failed'\|'aborted'`、`durationMs`（running 条目与 settled 条目都有）；progress 与 results 两个列表都可能由某个宿主模式填充。 | `OMP185` `pi-tui/src/tools/task.ts:2265,2268,2305`（progress）、`:2362,2378`（result） |
| N-CHANNELS | 两个事件总线通道（常量名即字符串）：`TASK_SUBAGENT_PROGRESS_CHANNEL = "task:subagent:progress"`、`TASK_SUBAGENT_LIFECYCLE_CHANNEL = "task:subagent:lifecycle"`；payload：progress 里 `progress: AgentProgress`，lifecycle 里 `{id, agent, agentSource, description?, status:'started'\|'completed'\|'failed'\|'aborted', sessionFile?, parentToolCallId?, index, detached?}`。发出点：progress `executor.ts:1487`，lifecycle `started` `executor.ts:3062`、settled `executor.ts:2754`。 | `OMP185` `pi-tui/src/overlays/session-observer-registry.ts:3-45`、`src/task/executor.ts:1487,2754,3062`；`OMPCHK` 同文件（lifecycle `started` 另有两个发点：IRC wake turn、kept-alive/revive turn） |
| N-KEEPALIVE | keep-alive 是 spawn 选项（`keepAlive`）；保活后的后续执行由 **peer/IRC 消息**触发，不是第二次 `task` 调用：`attachIrcWakeTurnMonitor`（`executor.ts:2975`）与 `runSubagentFollowUpTurn`（`executor.ts:3354`）在**既有会话**里跑，并产生新的 lifecycle `status:'started'` 帧（`detached: true`）。无 `task resume` 路径。 | `OMP185` `src/task/executor.ts:563,2975,3354,3282,4498-4499`；`OMPCHK` 另见 `executor.ts:3235-3242`（wake turn 发 started）、`:3932`、`registry/persisted-revive.ts:295` |
| N-SESSION-ID | `sessionManager.getSessionId()`、`getSessionName()`、`onSessionNameChanged(cb): () => void`、`setSessionName`、`getCwd`。 | `OMP185` `src/session/session-manager.ts:3113`（`onSessionNameChanged`）、`getSessionId`/`getSessionName` 同文件；框架文档引用 checkout 的 `:3217`，与发布 tarball 的 `:3113` 行号不同（同一事实，不同修订） |
| N-MODEL | `ctx.model: Model \| undefined`（`id`/`provider`/`name`）；`ctx.models: ExtensionModelQuery`（`list()` 等，含每 model 的 cost 四桶）；`ctx.cwd` 是 live getter；`ctx.modelRegistry`。 | `OMP185` `src/extensibility/extensions/types.ts:495-505`（`cwd`/`sessionManager`/`modelRegistry`/`model`/`models`/…） |
| N-THINKING-LEVEL | `pi.getThinkingLevel(): ThinkingLevel \| undefined` 返回**解析后的有效 level**（`auto` 不是 level；`configuredThinkingLevel()` 才返回 `auto`）。 | `OMP185` `src/extensibility/extensions/types.ts:1622`（框架文档同引用） |
| N-IDLE | `ctx.isIdle()`（无 active run/compaction/retry/queued continuation）、`ctx.hasPendingMessages()`、`ctx.getAsyncJobSnapshot(): AsyncJobSnapshot \| null`（`{running: …}`）。 | `OMP185` `src/extensibility/extensions/types.ts:489,491,509,513` |
| N-RUN-EVENTS | `agent_start`（无 payload）、`agent_end{messages, willContinue?}`（`willContinue: true` = 已排定自动续跑，订阅者不得当作终局 settle）。镜像层把会话层的 `isTerminal === false` 映射为 `willContinue: true`。 | `OMP185` `src/extensibility/extensions/types.ts:1415-1416`；`src/extensibility/shared-events.ts:201-216`；`src/extensibility/extensions/lifecycle-mirror.ts:23-25,126` |
| N-TURN-EVENTS | `before_provider_request`、`after_provider_response{status,headers,…}`、`message_start`、`message_update`、`message_end`（finalized assistant message 带 usage）、`tool_execution_update`、`tool_execution_end`、`input{text,images?,source:'interactive'\|'rpc'\|'extension'}`。 | `OMP185` `src/extensibility/extensions/types.ts:833,839,877,883,895,931,940,1036`（事件形状）与 `:1406-1440`（`on` 注册） |
| N-RESPONSE-BOUNDARY-COVERAGE | `after_provider_response` 由各 transport 的 `notifyProviderResponse` 发出；**Codex 的 `openai-codex-responses`/websocket transport 不通知它**——这正是 `OMP185P` 补丁存在的原因（框架文档把该缺口记为 `turn.provider-response-boundary`）。 | `OMPCHK` `packages/ai/src/utils/provider-response.ts:21-29` 及其调用者（`anthropic`/`openai-completions`/`openai-responses`/`pi-native-client`/`factory-droid`）；`OMP185P` 下模型消息仍带 provider reference id |
| N-VIEWED | **基线 18.5.0 没有** `getViewedSession`/`subscribeViewedSessionChanged`；只在与 `OMP185P` 中作为补丁出现（`types.ts:507,514`、`runner.ts:1388-1390`、`agent-session.ts:7700`、专用模块 `src/extensibility/extensions/viewed-session.ts`）。 | `OMP185`（grep 无命中）对比 `OMP185P`（上述位置） |
| N-CONTEXT-USAGE | `ctx.getContextUsage(): ContextUsage \| undefined`；`ContextUsage{tokens, contextWindow, percent}`。 | `OMP185` `src/extensibility/extensions/types.ts:605`（另见 `:489`）；`OMPCHK` `session/session-stats.ts:355-364` |
| N-TIMERS | `ctx.setInterval/ctx.setTimeout/ctx.clearTimer`：回调有 dispatch 隔离，handle 被 `unref()`，并在 `session_shutdown` 自动清理。 | `OMP185` `src/extensibility/extensions/types.ts:540-555` |
| N-UI | `ctx.hasUI`、`ctx.ui`：`ui.notify(message, level)`、`ctx.ui.setWidget(key, lines\|undefined, {placement})`；`setFooter`/`setHeader` 在 runner/acp/interactive 控制器里是 **no-op**。 | `OMP185` `src/extensibility/extensions/runner.ts:454`、`src/modes/controllers/extension-ui-controller.ts:163`、`src/modes/acp/acp-agent.ts:561`；`OMPCHK` `docs/extensions.md:884-886` 明说这两者是 no-op |
| N-SESSION-EVENTS | `session_start`、`session_switch`、`session_branch`、`session_tree`、`session_shutdown`；另有 `before_subagent_spawn`（每次真实子派发前一次，带 `agent`、`invocationKind:'task'\|'eval'`）。 | `OMP185` `src/extensibility/extensions/types.ts:1380-1412`（注册）、`:854`（`before_subagent_spawn` 形状） |
| N-USAGE | finalized assistant message 的 `usage` 四桶 + `totalTokens`；provider 未报时宿主会给出全零对象（这正是 `O-TURN-ZERO` 存在的原因：全零无法与“确实为零”区分）。 | `OMP185`（`Usage` 类型在 `pi-catalog`/`pi-ai`）；框架文档把该宿主默认记为 `turn` 轴的既有事实（`framework/docs/framework-capabilities.md`） |

---

## D. model-cost 消费子集（基线之上的额外标注）

框架语义是验收基线；这一节只标注 model-cost **实际消费**了哪些行，以及它**没有**消费哪些行。

| 行 | 事实 | 位置 |
| --- | --- | --- |
| M-GROUP | 只声明**一个**订阅组：`subscriptions: [{ scope: "session", events }]`。没有任何 `owner` 组。 | `extensions/model-cost/shared-logic/runtime.ts:469` |
| M-HANDLERS | 处理的事件种类：`turn_start` `:371`、`turn_end` `:375`、`round_start` `:399`、`round_end` `:404`、`user_input` `:412`、`session_facts` `:418`、`session_start` `:426`、`subagent_runtime` `:434`。**不订阅 `session_end`**（events 对象在 `:438` 结束）——实例寿命交给框架的 `cleanup`（`runtime.ts:497-501`）。 | `extensions/model-cost/shared-logic/runtime.ts:370-438` |
| M-TURN-FACTS | 读 `turn.session`（`:996`）、`turn.turnId`（`:1000`）、`turn.provider`/`turn.model`/`turn.startedAt`（`:1002-1004`）、`turn.price`（`:1009` → `request-price.ts:164-168`）、`end.endedAt`（`:1030`）、`end.usage`（`:1041`）。 | `extensions/model-cost/shared-logic/request-accounting.ts:995-1057` |
| M-TURN-NOT-READ | **不读** `end.outcome`、`end.http`、`providerRequestId`/`providerResponseId`、`turn.roundId`、`SessionFacts.kind`、`SessionFacts.unavailable`、`delivery.owner`。`host-patches/omp-18.5.0-codex-response-boundary/README.md:6-12` 明确记载 model-cost 已不再消费该补丁发布的 HTTP 事实。 | 同上（grep 缺证） |
| M-SESSION-FACTS | `remember(session)` 保存 `sessionId`/`name`/`taskName`/`agentName`/`agentId`/`parentSessionId`（`:623-646`），命名回退链在 `:594`，树 walk 用 `parentSessionId`（`:729`）；`session_start` 只额外读 `session.startup`（`:1116-1125`）。 | `extensions/model-cost/shared-logic/request-accounting.ts` |
| M-RUNTIME-ACCUM | 消费 `SubagentRuntimeFact` 的累积规则：同一 execution 只计一次（`:98`）、`unavailable` 不改累积且报错（`:93`）、非有限/负毫秒拒绝（`:95-96`）、开启中的 execution 被新 execution 的读数替换（`:101`）、`status==='ended'` 立即计入并退休身份（`:102-105`）、`available()` 在“有保存值或有 accepted 读数”前返回 `undefined`（`:112-116`）、`knownExecutions()` 供跨周期携带（`:118-124`）。 | `extensions/model-cost/shared-logic/subagent-runtime.ts:81-124` |
| M-SPAN | 会话跨度：start 只取**第一次**用户输入（`session-span.ts:171`，文档优先 `:133`）、end 取**最新** Turn end（`:178`）、两端齐备才算，`elapsedMs = max(0, end-start)`（`:141-143`）、只在读数变化时发布（`:147-163`）、周期切换时 `clear()`（`:183-186`）。 | `extensions/model-cost/shared-logic/session-span.ts` |
| M-COMMIT | 唯一的持久化提交点是 `round_end` → `roundEnded` → `storage.commit(harness, record)`（`request-accounting.ts:905`，仅在自消费增长时 `:1097`）；记录含 `own`/`startup`/`runtimeMs`/`span`（`:880-892`）。 | `extensions/model-cost/shared-logic/request-accounting.ts`；`consumption-store.ts:312` |
| M-COMMAND | `/budget` 三个 action：`detail` 翻转入口偏好、`holiday`/`clear` 走周期动作；`holiday`/`clear` 读 `delivery.canAcceptInput()`（`period-switch.ts:89`，三值处理 `:90-102`）与 `delivery.provider`（`:78-84`，非 DeepSeek 直接拒绝）。 | `extensions/model-cost/shared-logic/runtime.ts:477-493`；`shared-logic/period-switch.ts:78-102` |
| M-FEEDBACK | 只用 `delivery.feedback.notify(level, …)`，且 `stateProviderFailures` 仅在 `hasUI !== true` 时发声（`runtime.ts:295-296,304,313`）。**不用**框架的 `NoticeTransport`（`notices`），**不用** marker（`definition.ts` 无 `marker` 字段）。 | `extensions/model-cost/shared-logic/runtime.ts` |
| M-CATALOG | `catalog` 由 `composedCatalog(data, inputs.modelPrices)` 组成（维护数据优先，宿主目录补其余，`runtime.ts:542-547`，挂到 implementation `:466`）；`modelPrices` 来自 `context.modelPrices`（`harnesses/omp.ts:149`）；`providerAccess` 来自 `context.providerAccess`（`:153`，用于余额/额度查询 `provider-balance.ts:209-218`、`codex-quota.ts:272-283`）。 | `extensions/model-cost/shared-logic/runtime.ts`；`extensions/model-cost/harnesses/omp.ts` |
| M-LIFECYCLE | 进程内单实例：`ompAdapter(MODEL_COST, {configBaseDir, factory})`（`harnesses/omp.ts:134-135`），factory 内建 runtime 并复用（`:155`）；仅当绑定成功且有 runtime 时挂 widget（`:218`）；每个绑定都跑 `observeSessionContext`（`:222`）。 | `extensions/model-cost/harnesses/omp.ts` |

### D.1 model-cost 的宿主直连（框架公共契约之外的宿主事实）

| 行 | 事实 | 位置 |
| --- | --- | --- |
| M-HOST-CONTEXT-USAGE | 直接读 `ctx.getContextUsage?.()`，并把 `{tokens, provider, model}` 记进 runtime 的按会话上下文读数表。`getContextUsage` **不在** `OmpSessionContext` 声明里（`framework/adapters/omp.ts:124-259` 无该成员），扩展在 `harnesses/omp.ts:170` 自行加宽类型。 | `extensions/model-cost/harnesses/omp.ts:179,193-209`；`presentation/session-context.ts:36-47` |
| M-HOST-TIMER | 直接用 `ctx.setTimeout`/`ctx.clearTimer`（会话托管定时器），类型自行声明；一个进程一个“季节边界等待”由 widget 提供 host seam。 | `extensions/model-cost/harnesses/omp/widget.ts:175-176,1020-1029`；`harnesses/omp/boundary-timer.ts:35-40,92-124` |
| M-HOST-VIEWED | widget 直接读 `ctx.getViewedSession?.()` 与 `ctx.subscribeViewedSessionChanged?.()`（**补丁门控**：`OMP185` 无此成员），无出口时回退到绑定会话。它不经过框架的 `ViewedSessionPort`（那个出口只服务 marker 投影）。 | `extensions/model-cost/harnesses/omp/widget.ts:138-142,154-155,948-955,1017` |
| M-HOST-EVENTS | widget 为“切换会话即重绘”自己订阅原生 `session_start`/`session_switch`/`session_branch`（框架 adapter 同时也订阅同一批原生事件做语义合成）。 | `extensions/model-cost/harnesses/omp/widget.ts:1034-1036` |
| M-HOST-SESSION-READS | widget 自己读 `ctx.sessionManager.getSessionId()`、`ctx.model?.provider/id`、`api.getThinkingLevel?.()`、`context.agent.kind === 'main'` 来构造展示目标。 | `extensions/model-cost/harnesses/omp/widget.ts:955-959,1028` |
| M-HOST-TTY | `process.stdout.isTTY` 决定 widget 是 `component` 还是 `lines` 形态；`homedir()` 用于 `~/` 规则；`import.meta.url` 推导仓库根与 config 目录。 | `extensions/model-cost/harnesses/omp.ts:18-20,53,144` |
| M-HOST-WIDGET-KEY | 扩展自己的 widget key 是 `"z-model-cost"`（与框架 marker key `semantic-extensions`/`MARKER_AREA_KEY` 不同，`framework/adapters/omp.ts:72`）。 | `extensions/model-cost/harnesses/omp/widget.ts:75` |

### D.2 绘制与装配需求（迁移必须覆盖的部分）

| 行 | 事实 | 位置 |
| --- | --- | --- |
| M-DRAW-INPUTS | widget 需要宿主提供：widget key + 可选 placement（扩展从不传 placement）、每次渲染的宽度、主题（`theme.fg(token, text)`、`theme.getThinkingBorderColor(level)`）、以及 `component`/`lines` 两种形态的选择。 | `extensions/model-cost/harnesses/omp/widget.ts:86,95-98,189-196,217,850-898,967-974,998-1007` |
| M-DRAW-NO-FOOTER | widget **不**用 footer/header，也不使用 `belowEditor`，只在编辑器区 widget 内绘制。 | `extensions/model-cost/harnesses/omp/widget.ts:194` |
| M-LAYOUT-SHARED | 布局/字段选择/缩写/换行/裁剪全在 shared logic 输出**纯数据**（`DisplayLine`/`DisplayPiece`），宿主层只做主题与绘制；`display.ts` 不 import `node:`、adapter 或 `process`；唯一的宿主形状输入是宽度。 | `extensions/model-cost/shared-logic/presentation/display.ts:69-88,459,900,1281-1293,1581-1620` |
| M-NATIVE-TIMER-SEAM | boundary timer 通过注入的 host seam（`{schedule,cancel}`）使用会话定时器，进程内一个等待，随绑定的 `cleanup` 释放。 | `extensions/model-cost/harnesses/omp/boundary-timer.ts:35-40,92-138`；`harnesses/omp.ts:84,101-113,122,218` |

---

## E. pi 原生事实（当前检出）

出处：`E:/Developer/myhub/pi` @ `4a5d37291531ad48b8e536c892557877d219463c`（`main`），`@earendil-works/pi-coding-agent@1.2.0`；扩展 API 在 `packages/coding-agent/src/core/extensions/types.ts`（2304 行）。**读源码，非运行观察。**

| 行 | 事实 | 位置 |
| --- | --- | --- |
| P-NO-AGENT | `ExtensionContext` **没有** `agent` 成员（成员恰为 `ui, mode, hasUI, cwd, sessionManager, modelRegistry, model, scopedModels, thinkingLevel?, isIdle(), isProjectTrusted(), signal, abort(), hasPendingMessages(), shutdown(), getContextUsage(), compact(), getSystemPrompt()`）。**没有** agent registry。 | `types.ts:325-364` |
| P-NO-SUBAGENT | 没有原生 subagent 关系：无 registry/枚举/spawn API；无 `task:subagent:*` 通道；事件总线只是通用 `EventBus{emit,on}`。子代理只以**示例扩展**形式存在：另起一个 `pi` 进程。 | `types.ts:1585-1918`（API 方法表）、`core/event-bus.ts:3-6`、`types.ts:1916-1917`、`examples/extensions/subagent/index.ts:342-345,470-479`、`examples/extensions/subagent/README.md:7` |
| P-NO-EXEC-DURATION | 该示例的 `SingleResult` 无 duration 字段；仅**工具调用**级有 `ToolExecutionEndEvent.durationMs`。 | `examples/extensions/subagent/index.ts:147-157`；`types.ts:1121-1122` |
| P-SESSION-EVENTS | `session_start{reason:'startup'\|'reload'\|'new'\|'resume'\|'fork'}`、`session_shutdown{reason:'quit'\|'reload'\|'new'\|'resume'\|'fork'}`（shutdown 词表无 `startup`）。 | `types.ts:754-760,823-828` |
| P-RENAME | 改名通知存在，但名字不同：`session_info_changed{name?}`（不是 `onSessionNameChanged`）。 | `types.ts:763-767,1603`；`core/agent-session.ts:3972-3977` |
| P-TURN-FACTS | `before_provider_request`、`after_provider_response{status,headers}`、`message_start`、`message_update{message,assistantMessageEvent}`、`message_end{message}`（结果可替换 finalized message）、`turn_start/turn_end`、`agent_start/agent_end`（**扩展版** `agent_end` 只带 `messages`；会话版另有 `willRetry`）。 | `types.ts:900-904,916-921,1076-1091,1057-1072,959-968`；`core/agent-session.ts:199-202` |
| P-SETTLED | 有 `agent_settled{aborted}`（“一轮 agent 完全 settle、不会再自动重试/压缩/消费排队续跑之后”）与 `agent_before_settle`。**没有** OMP 式 `hasPendingMessages`+`getAsyncJobSnapshot` 的 quiescence 组合，但 `isIdle` 的语义已包含 queued continuation。 | `types.ts:1032-1037,1027-1030`；`core/agent-session.ts:1084-1086,1469-1471` |
| P-INPUT | `input{text,images?,source:'interactive'\|'rpc'\|'extension'}`（结果 `continue`/`transform`/`handled`）。 | `types.ts:1170-1186` |
| P-IDLE | `ctx.isIdle()`、`ctx.hasPendingMessages()` 存在；`getAsyncJobSnapshot()` **不存在**（全仓 grep 无命中）。 | `types.ts:347-348,355-356`；`core/agent-session.ts:1469-1471,2442-2445,3478-3479` |
| P-CONTEXT-USAGE | `ctx.getContextUsage(): ContextUsage\|undefined`，`ContextUsage{tokens: number\|null, contextWindow, percent: number\|null}`。 | `types.ts:359-360,306-312`；`core/agent-session.ts:4267-4303` |
| P-MODEL | `ctx.model`（`id/name/api/provider/baseUrl/cost/…`）、`ctx.scopedModels`、`ctx.modelRegistry`（`getAll/getAvailable/find/getProvider/getApiKeyForProvider/getApiKeyAndHeaders/hasConfiguredAuth/…`）。**没有** `ctx.models` 目录查询；`ctx.modelRegistry` 是路径。 | `types.ts:336-344`；`packages/ai/src/types.ts:825-861`；`core/model-registry.ts:64-126,190-208` |
| P-THINKING | `ctx.thinkingLevel?`（可选）与权威 getter `pi.getThinkingLevel()`；setter `pi.setThinkingLevel()`。 | `types.ts:345-346,1793-1800`；`core/agent-session.ts:3471-3472` |
| P-SESSION-GETTERS | `sessionManager.getSessionId()/getSessionName()/getSessionFile()/getBranch()/getEntries()`（只读白名单恰为这些）。 | `core/session-manager.ts:248-262,1152-1158,1318-1330,1469-1484,1520-1522` |
| P-NO-VIEWED | **没有** `getViewedSession`/`subscribeViewedSessionChanged` 或等价“当前显示会话”事实（全仓 grep 无命中）；只有 TUI 内部 `viewSession` 与命令上下文的 `newSession/fork/switchSession/navigateTree`+`withSession`。 | grep 无命中；`modes/interactive-mode.ts:1608-1611`（TUI 内部） |
| P-UI | `ui.setWidget(key, lines\|component, {placement?})`（placement 默认 `aboveEditor`，TUI 真的按它分上下区；RPC 只转发 `widgetLines`，**忽略 component factory**）；`ui.notify(message, type?: 'info'\|'warning'\|'error')`；`setFooter`/`setHeader` 在 TUI 是真实实现，在 RPC/JSON/print 是 no-op。`ctx.mode: 'tui'\|'rpc'\|'json'\|'print'`、`ctx.hasUI`（TUI 与 RPC 为 true）。 | `types.ts:187-208,159-160,321-322,330-331`；`modes/interactive/interactive-mode.ts:2398-2438,2651-2652`；`modes/rpc/rpc-mode.ts:195-216`；`core/extensions/runner.ts:331-362,572-575` |
| P-NO-TIMERS | `ExtensionContext` **没有** timer 成员；无 managed-timer/unref 包装 API；docs 要求扩展自持 `setInterval` 并在 `session_shutdown` 清理。 | `types.ts:325-364,2209-2224`；`docs/extensions.md:58-60,265-266` |
| P-INJECT | `before_agent_start` 返回 `{message?: Pick<CustomMessage,'customType'\|'content'\|'display'\|'details'>, systemPrompt?}`（无 role 字段）；隐藏 custom message 经 `convertToLlm()` **无条件**变 `user`；**不存在 `developer` 角色**；有 `systemPrompt`/`systemPromptOptions` 与 `context_with_system` 两条 system 权威路径。 | `types.ts:1496-1500,932-956,889-898`；`core/messages.ts:163-169`；`packages/ai/src/types.ts:546-547,644` |

---

## F. 完整迁移缺口（逐基线行对照 pi 现状）

判定只依据上表的事实；**不含任何设计或取舍**。`缺失` = 该原生事实在当前 pi 检出中不存在（带 grep 证据）；`未映射` = 原生事实存在但框架 pi adapter 仍未实现（`framework/adapters/pi.ts` 现状）。

| 缺口行 | 受影响基线行 | pi 现状 | 说明 |
| --- | --- | --- | --- |
| G-SUBAGENT-IDENTITY | F-SESSION-FACTS（`kind`/`parentSessionId`/`taskName`/`agentName`/`agentId`）、F-OWNER、O-SESSION-FACTS、O-OWNER | **缺失**（P-NO-AGENT、P-NO-SUBAGENT）。现有 pi adapter 恒 `kind:'main'`，`agentName`/`agentId` 恒 unavailable（`framework/adapters/pi.ts:107-112`），`ownerOf` 只认本会话为 owner（`pi.ts:100-104`）。 | 子代理身份、父子关系、owner 解析在 pi 上**没有原生输入**：不是映射未做，而是事实源不存在。 |
| G-SUBAGENT-RUNTIME | F-RUNTIME、F-RUNTIME-SCOPE、O-RUNTIME-* | **缺失**（P-NO-SUBAGENT、P-NO-EXEC-DURATION）。pi adapter 明确 refuse（`pi.ts:200-203`）。 | 既没有 subagent 概念，也没有每 execution 的宿主测量耗时；`ToolExecutionEndEvent.durationMs` 是**工具调用**级，不是 subagent execution 级。 |
| G-SCOPE-SESSION | F-SCOPE（`session` 组对“每个 actual session”的观察） | 原生只存在一个会话（无 subagent 会话概念）→ `session` 组在 pi 上等价于单会话观察。 | 基线的 scope 语义本身已实现（`subscriptions.ts:29-31`），但“多个 actual session”这一前提在 pi 上不成立。 |
| G-ROUND | F-ROUND-EDGE、O-ROUND-MAP、O-NEXT-TASK | **未映射**（`pi.ts:200` refuse）。原生可选输入：`agent_start`/`agent_end`/`agent_settled`/`isIdle`/`hasPendingMessages`（P-SETTLED、P-IDLE）；**缺** `getAsyncJobSnapshot`；`nextTask` 可用 `setTimeout(cb,0)`（pi adapter 已如此做，`pi.ts:199`）。 | 框架的 quiescence 判据含“无运行中异步 job”，pi 无该事实。 |
| G-TURN | F-TURN、O-TURN-MAP | **未映射**（`pi.ts:201` refuse）。原生输入基本齐备：`before_provider_request`、`after_provider_response`、`message_start/update/end`、assistant usage（P-TURN-FACTS）；且 pi 的 usage 带 `cost` 桶。 | 未映射 ≠ 事实缺失；本轮只记录事实与拒绝现状。 |
| G-INPUT | F-INPUT、O-INPUT-MAP | **未映射**（`pi.ts:203` refuse）。原生 `input{source}` 存在（P-INPUT）。 | 同上。 |
| G-NAME-CHANGE | F-SESSION-FACTS 的“改名即时交付”、O-NAME-CHANGE | **未映射**：pi 的通知名字与形状不同（`session_info_changed`，P-RENAME），adapter 未订阅。 | pi 上 `session_facts` 目前只在边界上产生。 |
| G-STARTUP | F-STARTUP、O-BEGINS-HERE、O-STARTUP | 部分映射：pi adapter 有 `beginsHere` 逻辑与 `ctx.model`/`ctx.thinkingLevel`（`pi.ts:107-133`），但 `ctx.thinkingLevel` 是**可选**成员，而 OMP 侧用 `getThinkingLevel()`。 | pi 的权威 getter 是 `pi.getThinkingLevel()`（P-THINKING）。 |
| G-VIEWED | F-VIEWED、O-VIEWED-MAP | **缺失**（P-NO-VIEWED）。pi adapter 不提供 `viewedSession` 出口。 | model-cost 的 widget 直接消费 viewed session（M-HOST-VIEWED），它在 pi 上没有任何等价事实；TUI 内部 `viewSession` 不是扩展 API。 |
| G-CATALOG | F-TURN 的 catalog price anchor、O-PRICES | pi adapter 不提供 `modelPrices`（`pi.ts` 无该成员）。原生每 model 有 `cost` 桶与 `ctx.modelRegistry`（P-MODEL）。 | 框架把 `modelPrices` 作为可选出口，extension 自行决定是否使用。 |
| G-PROVIDER-ACCESS | O-PROVIDER-ACCESS | pi adapter 不提供 `providerAccess`；原生 `ctx.modelRegistry.getApiKeyForProvider/getApiKeyAndHeaders` + `baseUrl` 存在（P-MODEL）。 | model-cost 的余额/额度查询依赖该出口（M-CATALOG）。 |
| G-TIMERS | `execution.managed-timer`、M-HOST-TIMER、M-NATIVE-TIMER-SEAM | pi **无** managed timer（P-NO-TIMERS）；OMP 有（N-TIMERS）。 | model-cost 的季节边界等待用会话托管定时器（随 `session_shutdown` 清理）；pi 上只剩 Node 全局定时器 + 自行清理。 |
| G-CONTEXT-USAGE | M-HOST-CONTEXT-USAGE、`session.context` | pi 有 `ctx.getContextUsage()`（P-CONTEXT-USAGE），形状与 OMP 不同（`tokens: number\|null`、`percent: number\|null`）。 | OMP 侧该成员也**不在**框架契约内（扩展自行加宽类型）。 |
| G-UI-DRAWING | M-DRAW-INPUTS、M-DRAW-NO-FOOTER、`ui.native-presentation` | pi：`ui.setWidget` 支持 `aboveEditor/belowEditor` 与 component；**RPC 忽略 component、只转发 lines**；`setFooter/setHeader` 在 TUI 真实、其它模式 no-op（P-UI）。OMP：`setFooter/setHeader` 是 no-op，widget 可用 component + theme（N-UI，`framework/adapters/omp.ts:778-785`）。 | 两边的 widget/theme/宽度契约不同；`ui.native-presentation` 在 capability register 里已记为“复杂布局归扩展、原生呈现不作通用承诺”。 |
| G-ASSEMBLY | M-LIFECYCLE、O-FACTORY、O-EXTENSION-ENTRY、F-LIFECYCLE-IMPL | 现状：`entrypoints/pi/` 只有 `codebase-tools.ts`，**没有** model-cost 的 pi 入口；pi adapter 可装配（`pi.ts:231-251`）。 | 迁移需要新的 discoverable entrypoint 与（若走 native 直连）扩展自己的 pi harness 实现；框架侧装配语义可直接复用。 |
| G-INJECT-ROLE | `context.required-role` | pi 隐藏注入恒为 `user` 角色，无 `developer`（P-INJECT）；record 已把该事实按 provider path 记录为 harness-qualified。 | model-cost 目前**不使用**注入提示词，故不是 model-cost 的消费缺口，但属于完整能力基线的一部分。 |
| G-MULTI-MAIN | F-ONE-MAIN | pi 上不存在多 main 的已实现形状；OMP 记录为不支持。 | 基线限制，不是 pi 特有。 |

---

## G. 证据等级与验证限制

1. **本次没有运行任何东西。** 所有行来自源码/类型/文档阅读与 grep；没有启动会话、没有跑构建/lint/测试、没有跑 harness dock。任何“宿主实际这样表现”的运行时结论都不在本基线的证据等级内（框架文档自身把“源码检查 / 可执行启动 / 实际行为”列为不同等级）。
2. **OMP 原生事实有两个不同修订。** 受支持工件是 `18.5.0`（+ 两个本地补丁），本地检出是 `18.10.4`（`611c189f`）。C 段中凡引用 `OMP185`/`OMP185P` 的行都来自**发布安装的源码**；`OMPCHK` 只用于交叉确认（例如 keep-alive 的两个函数名）。框架文档里以 checkout `9348320` 给出的行号（如 `types.ts#L464`）与发布 tarball 的行号一致（已核对 18.5.0 安装），但 `session-manager.ts` 的 `onSessionNameChanged` 在发布 tarball 中是 `:3113`，而文档引用 `:3217`——同一事实、不同修订的行号差异，引用时需注明。
3. **Viewed session 是补丁事实，不是基线事实。** `getViewedSession`/`subscribeViewedSessionChanged` 在未打补丁的 18.5.0 安装中不存在，只存在于 `18.5.0-viewed-session-codex-response`（并另有 `18.5.0-viewed-session`、`18.5.0-codex-response-boundary` 两个单补丁安装）。因此与 viewed session 相关的能力行都标记为“补丁门控”。
4. **未验证项（明确不声称）**：真实 TUI 观感与交互；真实 provider 交付；`18.10.4` 上这些原生成员的实际运行行为（只读源码）；pi 的真实 subagent 方案（示例扩展另起进程，不是受支持能力）；两个 main 会话一进程。
5. **本基线的“未映射”不等于“pi 做不到”。** F 段区分了三种情况：原生事实**缺失**（带 grep 证据）、原生事实**存在但未映射**、以及**需要扩展自持**（如 timer/绘制）。任何“补第三方接口/向上游贡献/长期 fork”的路线属于候选决策（ticket 03/04），本基线不选。

### 与其他研究的分工

- `decision/02-pi-subagent-candidates.md`（CandidateResearch）：候选扩展的实际接口与覆盖对照。已向其发送 A/B/M 段的框架侧行标识，供其独立发现对照。
- 本基线不评价任何候选，也不批准任何提供方。

## H. 尖锐的未决问题（供后续 ticket 接手）

1. **pi 上没有子代理身份事实源**：`G-SUBAGENT-IDENTITY`/`G-SUBAGENT-RUNTIME` 是“事实源缺失”，不是“映射缺失”。基线里的 subagent 相关行（identity/parent/owner/taskName/agentName/agentId、每 execution 耗时、`session` scope 的多会话语义）在 pi 上要么无输入，要么需要宿主侧新增事实（属于 Q2/Q3 的路线选择）。**问题：pi 侧是否必须保有“子代理会话 + 每次执行耗时 + owner 继承”的全部语义？**（用户已声明 OMP 全部子代理语义是验收基线，故这不是可以默默缩小的项。）
2. **Round 的 quiescence 判据在 pi 缺少 `getAsyncJobSnapshot`**：框架判据是 `idle ∧ ¬pending ∧ 无运行中异步 job`。pi 只有前两项（`isIdle` 的语义已含 queued continuation、`hasPendingMessages` 存在），且另有 `agent_settled` 这一更强语义（“不会再自动重试/压缩/排队续跑”）。**问题：pi 上“关轮”的等价判据是什么，是否需要框架侧的第三种输入？**
3. **`session_end` 语义**：model-cost 不订阅 `session_end`（只靠框架 `cleanup`）；pi 的 shutdown 词表无 `startup` 且有 `reload`（映射到 `disposed`，见 `framework/adapters/pi.ts:96-98`），OMP 的 `session_shutdown` 只有一个 dispose 口径。**问题：跨宿主 `cleanup` 触发时机是否需要统一口径？**
4. **viewed session / context usage / session 托管定时器在当前 model-cost 里都是宿主直连**：这些读取不在框架契约内，pi 上分别缺失/形状不同/不存在。**问题：这些是“扩展自己的宿主实现”，还是需要提升为公共能力？**（属于 ticket 04 的组织问题，本基线只给事实。）
5. **注入提示词的 authority**：pi 隐藏注入恒为 `user`，OMP 在已验证路径上分别为 `user`/`developer`。model-cost 当前不使用注入，故未受影响，但 `context.required-role` 是完整基线的一部分。**问题：未来若迁移后的扩展需要注入，角色事实如何声明？**
6. **装配落点**：`entrypoints/pi/` 目前无 model-cost 入口；pi adapter 的装配面可用。若扩展需要原生 subagent 事实，它必须与候选提供方一起落在扩展自己的 pi harness 实现里（`G-ASSEMBLY`）。**问题：这批宿主专属代码的集中组织尚未决定**（ticket 04）。

## I. 交付物清单

- 本报告：`research/omp-capability-baseline` 分支，worktree `E:/Developer/myhub/wt/omp-capability-baseline`，路径 `.scratch/model-cost-pi-migration/research/omp-subagent-capability-baseline.md`。
- 基线行标识（表格行数）：`F-*` 22、`O-*` 28、`N-*` 19、`M-*` 23（12 消费 + 7 宿主直连 + 4 绘制/装配）、`P-*` 17、`G-*` 17。

