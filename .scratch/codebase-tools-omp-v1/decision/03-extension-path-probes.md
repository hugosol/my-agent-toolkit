# 取得不修改宿主的 OMP 扩展路径运行证据

Type: task
Labels: wayfinder:task
Status: resolved
Interaction: AFK
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 01, 02
Lighthouse: [03-extension-path-probes](../lighthouse/03-extension-path-probes.md)

## Question

在已选择的候选运行组合中，实际运行现有扩展或临时 extension 探针，取得后续 State、贡献和部署决策所需的宿主事实；哪些必要机制能通过扩展接口实现，哪些存在确切阻碍？

本票是执行验证以解除决策阻塞，不选择业务策略、不实现框架，也不是以重复源码阅读代替执行。前置票解决后再认领。

### 工作与完成证据

- 使用隔离配置、临时会话和原始未改动宿主。先使选定真实 loader/runner 路径可执行，记录来源、版本、命令、平台与失败阶段。不修改 agent 源码或用户全局配置；需要用户提供凭据或安装授权时说明精确前提并暂停该路径，不用 mock 宣称通过。
- 验证薄 entrypoint 导入发现目录之外的 TypeScript 及 Markdown 文本资源、依赖解析与独立扩展发现。Markdown 文本 import 不是宿主 prompts capability 发现，不据此要求改用扩展包目录。
- 经真实会话验证命令、状态 entry、启动/切换/恢复、消息追加顺序和 UI 标记；按候选模式分别记录实际可见 UI 与无 UI 条件。验证 02 选定的 restart 生效路径（[02 lighthouse](../lighthouse/02-candidate-support.md)）；代码热重载已由 02 延后到框架 backlog，本票不把它列为验收项，最多作为附带观察记录。
- 经 OMP 内建子代理执行路径观察工厂绑定、身份与 parent 关联、独立 init 进度和可观察生命周期；多 owner 隔离与恢复设计需要什么信息？不要把手工传入假身份的 runner 测试称作真实 task 子代理验证。
- 捕获候选 provider 路径的真实出站消息形态，检查角色、位置、持久化与后续请求保留。可使用隔离的本地协议捕获端点，但须明确它只证明序列化/请求路径，不证明真实服务或模型服从性。观察 hook 重入、中止或准备失败时的事件/提交顺序，为后续策略提供事实，不在探针中提前实现框架事务。
- 对每条路径分别给出已观察、源码推断、未验证及阻碍；临时探针与日志作为资产从本票链接，证据进入宿主记录的单一事实来源。清理临时配置、会话与进程，不留下运行时脚手架充当产品代码。

### 已知失败与入口

绘图阶段在原仓库运行 `bun tests/codebase-tools/smoke-omp.ts`，退出码为 1，错误为 `Export named 'createRatchetPrelude' not found .../src/ratchet/prelude.js`。失败发生在宿主导入期，未进入扩展行为断言；原因未诊断，不将其归因于迁移，也不视为已知必需修补宿主。

[原 smoke](../../../../my-omp-toolkit/tests/codebase-tools/smoke-omp.ts) 使用机器相关安装路径，只能作起点，不能替代真实 UI、task、出站角色或旧新往返验收。[既有宿主证据](../../../docs/host-support.md) 与 [提示词研究](../../../docs/research/prompt-injection-research.md) 指明需要补足的证据级别。

若出现可通过额外外部知识调查解决的未知，另建精确 research 票；若候选确实无法满足要求，把阻碍交回候选支持决策，不改变用户边界。

## 结果（2026-10-06 探针执行）

所有探针均使用隔离 agent state（临时 `PI_CODING_AGENT_DIR`）、`--no-extensions -e <explicit>`、临时会话目录与本地协议捕获端点；未修改任何 agent 源码或用户全局配置。

### 0. 运行锚点、来源与已知失败

- 候选宿主：本地源码 `E:/Developer/myhub/oh-my-pi` @ `9348320`（v18.5.0，Windows x64，Bun 1.4.2）。日常安装 `omp` 为 18.6.1，不是候选。
- 为绕开本地 natives 阻塞，按 02 允许的隔离安装方式，把 `@oh-my-pi/pi-coding-agent@18.5.0` 装进临时前缀；`loader.ts`/`runner.ts`/`types.ts`/`session-manager.ts`/`model-registry.ts`/`auth-storage.ts` 与该 checkout 逐字节一致（6/6 SAME），可作候选行为来源。
- **本地源码阻塞**：直接跑本地 checkout 的完整会话在 native addon 装载期失败——`Failed to load pi_natives native addon for win32-x64 (modern)`（`packages/natives/native/pi_natives.win32-x64-*.node` 全部缺失）。`bun packages/coding-agent/src/cli.ts --version` 能返回 `omp/18.5.0`（不加载 natives），但 `-p` 完整会话不可用。可选的解除方式：`bun --cwd=packages/natives run build`（host 走 Cargo/N-API，不需 bazel）或在候选部署里用隔离精确安装；未执行 build，以免重生成 checkout 内受版本控制的 bindings。
- 票面记录的已知失败（`Export named 'createRatchetPrelude' not found`）**未复现**：在已安装 18.6.1 上 `bun tests/codebase-tools/smoke-omp.ts` 退出码 0，8 项断言全过。该失败与本次迁移候选无因果关联。

### 1. 薄入口发现、TS/Markdown 外置导入与依赖解析（C11/C12）

- `discoverExtensionPaths(root, cwd, undefined, { ambient:false })` 只扫 `entrypoints/omp/`，恰好返回两个薄入口 `alpha.ts`/`beta.ts`，不含 `entrypoints/pi/gamma.ts`；根目录无 `index.ts`，故每个文件是独立扩展，无聚合根。
- `loadExtensions` 经真实 loader 导入两个入口；每个入口从发现目录之外 import 了 TypeScript 宿主编排、`../logic` 共享逻辑与 `../prompts/*.md`（`with { type: "text" }`），并 import 了裸依赖 `@oh-my-pi/pi-utils`（从 host 依赖树解析）。两个扩展 0 error，命令描述即 Markdown 文本；未发现“外置源码/Markdown 不被发现”的问题。
- 目录解析优先级（源码）：`package.json` 的 `omp/pi.extensions` 声明 > `index.ts`/`index.js` > 一层扫描 `.ts`/`.js`。
- 证据：`assets/03/discovery/`、`assets/03/probes/discovery-probe.ts`、`assets/03/logs/03-B-discovery.log`。

### 2. 真实会话：命令、状态 entry、启动/切换/恢复、消息顺序、UI 标记（C4/C5/C7/C8/C10）

- **命令**：RPC 模式（`--mode rpc`）下 `{"type":"prompt","message":"/codebase-tools"}` 执行扩展命令并返回 `prompt_result{agentInvoked:false}`，不产生模型请求。print 模式在 `agent-session.ts:6889` 也会执行 `pi.registerCommand` 扩展命令，但**不派发宿主内置命令**（`/help` 被当普通提示发给模型），且仅在命令无 agent 轮时不落盘会话文件；交互 TUI 是内置命令的派发面。
- **状态 entry 与提交顺序**（session JSONL）：`model_change` → `thinking_level_change` → `custom codebase-tools:state {on:true,initInjected:false}`（命令）→ `custom codebase-tools:state {on:true,initInjected:true}`（首个启用轮）→ `user` 轮消息 → `custom_message codebase-tools:init` → `assistant` → 下一轮 `user` → `custom_message codebase-tools:reminder` → `assistant`。
- **出站角色/位置/保留**：init 与 reminder 在 provider 请求里都表现为**独立的 user role 消息**（content blocks），位于该轮 user 消息之后；`display:false` / `attribution:"agent"` **不产生** developer/system 授权。它们随轮持久化，后续请求会重放（第二轮请求含第一轮 init）。这与 host-support「custom-message 路径产生 user 消息」一致。
- **恢复（进程重启 + `--continue`）**：已持久化 `{on:true,initInjected:true}` → 追加 `codebase-tools:reminder`，不重复 init；构造并持久化 `{on:true,initInjected:false}` → 追加 `codebase-tools:init`。last-wins 生效。
- **切换**：RPC `new_session` 得到无 state entry 的新会话 → off，随后整轮无注入。
- **UI 标记**：RPC 下 `ctx.ui.setWidget("codebase-tools", ["◈ codeBaseTools"], {placement:"aboveEditor"})` 被转发为 `extension_ui_request{method:"setWidget",widgetKey:"codebase-tools",widgetLines:["◈ codeBaseTools"],widgetPlacement:"aboveEditor"}`，在开关与每个启用轮各出现一次。实际 TUI 渲染仍在宿主侧，交互式视觉验收留待用户/08。`ctx.hasUI`：主会话 true，子代理 false。
- 证据：`assets/03/logs/03-C-*.log`、`assets/03/captures/main-session/`、`assets/03/captures/restore-uninitized/`、`assets/03/logs/03-C-restore-*.log`。

### 3. OMP 内建子代理真实执行路径（C3）

- 用脚本化 provider 返回 `task` 工具调用（`async: {enabled:false}` 时同步执行），触发真实内建子代理。
- 父侧观察 `before_subagent_spawn`：`{agent:"task", invocationKind:"task", patterns:["probe-gateway/probe-model"], spawnKey:"SpatialParakeet"}`。
- 子代理身份（`ctx.agent`，来自 `session_start`/`before_agent_start`）：`{kind:"sub", id:"SpatialParakeet", name:"task", depth:1, parentId:"Main"}`，`hasUI:false`。
- 子代理重新绑定父进程已导入的扩展工厂（`bindPreparedExtensions`）：codebase-tools 在子会话生效；子首个 provider 请求即含 init（子继承主会话当前 `on`），后续子轮含 reminder → **独立 init 进度**成立。
- 子代理生命周期可观察：被驱动到 yield；宿主发送 “Last turn had no tool call → session idle. Reminder 1/2/3 of 3” 用户消息，最后一个 reminder 设 `tool_choice`；工具表含 `yield`。子系统提示与主不同（10887 vs 8236 字符）。
- 异步模式（默认）立即返回 “Spawned agent … Results auto-deliver”，子代理后台跑；同步模式内联完成，工具结果为 `<task-result … status="completed">`。
- 证据：`assets/03/logs/03-D-subagent*.log`、`assets/03/logs/03-D-identity-{sync,async}.log`、`assets/03/captures/subagent/`。

### 4. 出站消息形态、hook 重入、中止与准备失败顺序（C6/C8/C9）

- openai-completions 线格式（deepseek 所用 api）：`POST {baseUrl}/v1/chat/completions`；body `{model,messages,stream:true,stream_options:{include_usage:true},store:false,tools:[{type:"function",function:{name,description,parameters}}],max_completion_tokens}`；assistant 工具调用回放 `[{id,type:"function",function:{name,arguments}}]`，工具结果 `{role:"tool",tool_call_id,content}`。
- system 提示在本探针模型（`compat.supportsDeveloperRole:false`）序列化为 `role:"system"`；源码推断仅当 `model.reasoning && compat.supportsDeveloperRole` 才用 `role:"developer"`。
- 候选 provider 的 api（bundled catalog，源码推断）：`deepseek` 4 个模型 → `openai-completions`；`openai-codex` 10 个模型 → `openai-codex-responses`（**未实测**，是另一条 transport）。
- **hook 重入**：一个用户轮即使包含工具续轮（多次 provider 请求）也只触发一次 `before_agent_start`（主会话第 1 轮 = 请求 001 初次 + 请求 006 工具续轮，`before_agent_start` 仅一次）；子代理 4 轮对应 4 次。
- **中止**：`turn_end` assistant `stopReason:"aborted"`、`errorMessage:"Interrupted by user"`；轮内 user 消息与注入的 `custom_message` 已提交，aborted assistant entry 也落盘；`prompt_result{status:"aborted"}`。
- **准备/提供方失败**：HTTP 500 → `turn_end` `stopReason:"error"`、`errorStatus:500`、`errorMessage`；随后 `auto_retry_start{attempt:2,maxAttempts:10,delayMs,errorMessage}`（`fetchWithRetry` 重试；kill 前观察到 6 次 error turn_end）。
- 证据：`assets/03/captures/{main-session,subagent,abort,fail}/`、`assets/03/logs/03-E-*.log`。

### 5. 逐路径状态

- **已观察**：隔离 18.5.0 loader 导入；薄入口 + 外置 TS/Markdown + 裸依赖解析 + 独立发现 + 宿主选择；RPC 命令执行与 `agentInvoked:false`；state entry 与消息提交顺序；两种恢复分支；`new_session` → off；真实子代理身份/绑定/独立进度/生命周期；RPC UI widget 转发；openai-completions 线格式与角色；工具续轮的一次 `before_agent_start`；中止与 500 失败顺序。
- **源码推断**：候选 deepseek/openai-codex 的 api 类型；developer-role 的条件映射；print 不派发内置命令（无头会话可用性靠扩展命令）。
- **未验证**：交互 TUI 的视觉 marker（需用户）；deepseek/openai-codex 真实出站（无凭据）；openai-codex-responses transport；本地源码完整会话（natives 未构建）；代码热重载（02 已明确不在首版）。
- **阻碍与前提**：本地源码基线直跑需要先构建 natives；openai-codex transport 需要可运行的 codex 授权路径或等价隔离端点；UI 验收需要交互 TUI 会话。

### 6. 资产入口

- 探针脚本：`assets/03/probes/{discovery-probe.ts,capture-server.ts,provider-ext.ts,rpc-drive.ts,identity-probe-ext.ts,inspect.mjs,summarize.mjs,api-summary.mjs}`
- 发现夹具：`assets/03/discovery/`（薄入口、外置 TS/Markdown、pi 侧诱饵）
- 日志：`assets/03/logs/`
- 出站请求捕获：`assets/03/captures/{main-session,subagent,abort,fail,restore-uninitized}/`
