# 03: 取得不修改 Agent 运行时的 OMP 扩展路径运行证据: Lighthouse

> Question and discussion: [03: 取得不修改 Agent 运行时的 OMP 扩展路径运行证据](../decision/03-extension-path-probes.md)

## Question

在已选择的候选运行组合中，实际运行现有扩展或临时 extension 探针，取得后续 State、贡献和部署决策所需的 Agent 运行时事实；哪些必要机制能通过扩展接口实现，哪些存在确切阻碍？

本票是执行验证以解除决策阻塞，不选择业务策略、不实现框架，也不是以重复源码阅读代替执行。

## Discussion

### 1. 候选可运行性与来源锚点
本地源码 checkout（`oh-my-pi @9348320` = v18.5.0）直跑完整会话在 native addon 装载期失败：`Failed to load pi_natives native addon for win32-x64 (modern)`（`packages/natives/native/pi_natives.win32-x64-*.node` 缺失）。`cli.ts --version` 可用只说明启动路径不加载 natives，不代表可运行。按 02 允许的隔离精确安装（`npm i --prefix <temp> @oh-my-pi/pi-coding-agent@18.5.0`）取得可运行候选；`loader.ts`/`runner.ts`/`types.ts`/`session-manager.ts`/`model-registry.ts`/`auth-storage.ts` 与该 revision 逐字节一致（6/6）。票面记录的已知失败（`createRatchetPrelude` not found）未复现：已安装 18.6.1 上 `smoke-omp.ts` 退出 0、8 项全过，与候选迁移无因果关联。

### 2. 薄入口发现、外置源码/Markdown 与依赖解析
真实 loader 的 `discoverExtensionPaths(root, cwd, undefined, { ambient:false })` 只扫配置根，恰好返回 `entrypoints/omp/` 下两个独立薄入口，不含 `entrypoints/pi/` 诱饵；无根 `index.ts` 聚合。`loadExtensions` 导入入口后，其从发现目录外 import 的共享 TS、`*.md`（`with { type:"text" }`）与裸依赖 `@oh-my-pi/pi-utils` 全部解析成功，0 error。目录解析优先级为 `package.json` 声明 > `index.ts/js` > 一层 `.ts/.js` 扫描。ADR-0002 的目标布局在真实 loader 下成立。

### 3. 真实会话：命令、状态、启动/切换/恢复、顺序、UI
RPC 模式执行扩展命令 `/codebase-tools` 返回 `agentInvoked:false` 且无模型请求；print 模式也能执行扩展命令但不派发 Agent 运行时内置命令，且命令轮不落会话文件；交互 TUI 是内置命令派发面。命令写 `codebase-tools:state {on,initInjected}`，首个启用轮写回 `initInjected=true` 并追加 init 消息；entry 顺序实测为 state(命令) → state(首轮写回) → user → custom_message(init) → assistant → user → custom_message(reminder) → assistant。恢复两分支均实测：`initInjected=true` → reminder；`initInjected=false` → init；`new_session` → off。UI marker 在 RPC 下转为 `extension_ui_request{method:"setWidget",widgetKey:"codebase-tools",widgetLines:["◈ codeBaseTools"],widgetPlacement:"aboveEditor"}`，实际视觉渲染仍属 Agent 运行时交互面。

### 4. 真实内建子代理路径
脚本化 provider 返回 `task` 工具调用后，真实子代理被创建；父侧 `before_subagent_spawn{agent:"task",invocationKind:"task",spawnKey:…}`，子侧 `ctx.agent={kind:"sub",id,name,depth:1,parentId:"Main"}`、`hasUI:false`。子代理重新绑定父已导入的扩展工厂，codebase-tools 在子会话生效：子首轮含 init（继承主会话 `on`），后续子轮含 reminder，init 进度独立。子代理被驱动到 yield（"Reminder N of 3"、`yield` 工具、末次 `tool_choice`），生命周期可观察；异步模式立即返回 “Spawned agent … Results auto-deliver”。

### 5. 出站消息形态、hook 重入与失败顺序
custom 贡献进入 provider 请求时表现为独立 **user role** 消息，位于该轮 user 消息之后，并随轮持久化、后续请求重放；`display:false`/`attribution:"agent"` 不产生 developer/system 授权。openai-completions 线格式已捕获（`POST /v1/chat/completions`，`stream:true`，`stream_options.include_usage`，`max_completion_tokens`，assistant tool_calls 回放，role:"tool" 结果）。一个用户轮即使有工具续轮也只触发一次 `before_agent_start`。中止 → `stopReason:"aborted"` 且已提交 user 与注入；HTTP 500 → `stopReason:"error"` 后 `auto_retry_start{attempt,maxAttempts:10,delayMs}`。候选 api（bundled catalog）：deepseek→`openai-completions`（已实测该类），openai-codex→`openai-codex-responses`（未实测）。

---

## Decision

真实 OMP 18.5.0 Agent 运行时经验证支持完整迁移所需的扩展路径：薄入口+外置共享源码/Markdown 的发现与依赖解析、扩展命令与 state 持久化、启动/切换/恢复、子代理身份/工厂重绑定/继承与独立 init、UI 反馈转发、出站序列化、以及中止与失败的事件/提交顺序均经扩展接口成立；唯一已确认的候选运行阻塞是本地源码 checkout 需先构建 natives，openai-codex transport 与 TUI 视觉验收仍未验证。

## User stories

1. 作为框架维护者，我想要一个经真实运行验证的候选 Agent 运行时组合，以便 04–08 的决策建立在实测事实上而非源码推断。
2. 作为框架维护者，我想要确认薄入口+共享源码+外置资源的发现约束在真实 loader 下成立，以便 07 的部署方案可直接采用该布局。
3. 作为扩展作者，我想要确认扩展命令、状态 entry、恢复与 UI 标记的真实 Agent 运行时行为，以便 04–06 契约与 Agent 运行时能力对齐。
4. 作为框架维护者，我想要确认子代理的身份、工厂重绑定与继承行为，以便 04 的 owner/继承契约有真实依据。
5. 作为扩展作者，我想要知道 custom 贡献的真实出站角色与位置，以便 05 能明确 developer-role 是否满足。
6. 作为维护者，我想要记录中止与提供方失败的事件/提交顺序，以便 05/06 的事务与拒绝反馈设计不靠猜测。
7. 作为维护者，我想要明确本地源码 natives 这一唯一阻塞及其解除方式，以便 02/07 决定基线运行方式。
8. 作为维护者，我想要区分已观察/源码推断/未验证三类证据，以便 Agent 运行时支持声明不越级。

## Preconditions

- 候选源码 `oh-my-pi @9348320` 只读可访问；隔离精确安装或构建 natives 可用。
- 01 的 C1–C15 契约与需求 oracle、02 的候选组合与隔离规则已成立。
- 本票是 04/05/06/07/08 的前置；03 曾等 01 与 02 关闭。

## Postconditions

- 04–08 可基于实测事实做决策；无需再为“Agent 运行时能否通过扩展接口实现”重复探针。
- 本地源码 natives 阻塞、openai-codex transport 未测、TUI 视觉验收三点成为明确的未决前提。
- 探针脚本、夹具、日志与出站捕获在 `.scratch/codebase-tools-omp-v1/assets/03/` 作为证据来源。
- custom 贡献的真实角色（user）与“启用轮=每用户轮一次”的 Agent 运行时依据固定，供 05 使用。

## Invariants

- 未修改 agent 源码或用户全局配置；探针全隔离（临时 `PI_CODING_AGENT_DIR`、`--no-extensions -e`、临时会话与本地捕获端点）。
- 证据分级：已观察 ≠ 源码推断 ≠ 未验证；未验证不写成兼容或支持。
- 沿用 Agent 运行时官方术语（State / instruction contribution / subagent State inheritance）。
- 与 01/02 的候选组合、C 能力清单及“必要语义不满足则拒绝、不静默降级”一致。

---

## Addendum（2026-10-07 traverse 审计）

- 本文件记录的 `codebase-tools:state {on,initInjected}` 与 init 进度写回是探针当次观察的历史事实，不是最终契约。最终契约（04/05/07）：state 只读写 `{enabled}`，init 进度按 branch 是否已有 `codebase-tools:init` 推导，持久化兼容已放弃。
- 探针其余结论（发现/依赖/命令/恢复/子代理/UI 出站/失败顺序）保持有效。
