# pi 排队输入消费与原生循环事实（只记录事实，不是决议）

来源仓库：`E:/Developer/myhub/pi`，HEAD `a276dabe57911253350bffb93cb7d7aff6a73261`（`git status --porcelain` 为空，工作树干净）。本次仅静态调查：未修改 pi 任何文件或配置，未联网、未安装依赖、未运行模型。

用途：为决策票「framework 如何提供请求、响应、Turn／Round 与模型事实观测？」提供 pi 侧事实基线。本文只陈述源码/文档/测试事实，**不含任何框架决议**；结论性取舍请留给决策票。

术语提示：pi 中**不存在**名为 "Round" 的公共概念（全仓库 `\bRound\b` 仅命中 `packages/tui/test/editor.test.ts:4347` 注释）。pi 的公共技术单位是 **turn**（一次 assistant 响应 + 该响应产生的全部工具调用与工具结果，见 `packages/coding-agent/docs/json.md:60`）与 **低层 agent run**（`agent_start`…`agent_end`）。

---

## 0. 主调用方确认：哪条是当前实际路径

| 层 | 事实 | 证据 |
| --- | --- | --- |
| CLI 入口 | `src/cli.ts` → `src/main.ts`（`setupCli()` + `main(argv)`） | `packages/coding-agent/src/cli.ts:1-6` |
| 会话层（当前实际） | 唯一 `AgentSession`（4348 行），由 `createAgentSession()` 构造并把 `Agent` 注入 | `packages/coding-agent/src/core/sdk.ts:175`、`sdk.ts:387`（`new Agent`）、`sdk.ts:417-418`（steeringMode/followUpMode 取自 settings）、`sdk.ts:437`（`new AgentSession`） |
| runtime 包装 | `AgentSessionRuntime` / `agent-session-services.ts` 只是创建/替换会话的外壳，模式统一用它 | `packages/coding-agent/src/core/agent-session-runtime.ts:4-5,430-434`；`main.ts:37-41,730-805` |
| 底层循环 | `@earendil-works/pi-agent-core` = `packages/agent`；`Agent`（agent.ts）→ `runLoop`（agent-loop.ts） | `packages/agent/src/agent.ts:188-613`；`packages/agent/src/agent-loop.ts:163-321` |
| 模式 | interactive（默认 TTY）/ rpc / print 三种模式共享同一 `AgentSession` | `main.ts:113-122`；`modes/interactive/interactive-mode.ts:4731-4773`；`modes/rpc/rpc-mode.ts:417-422` |

**易误认的非实际路径（都不是 CLI 主路径）**：

- `agentLoop()` / `agentLoopContinue()`（`packages/agent/src/agent-loop.ts:38,71`）：低层流式 API，仓库内调用者只有测试、README 示例与 `examples/mcp-codemode/main.ts`；`Agent` 类自身走的是 `runAgentLoop`/`runAgentLoopContinue`（`agent.ts:432-458`）。README 明确它只是观察流、不等待异步事件处理（`packages/agent/README.md:560`）。
- `packages/durable` + `coding-agent/src/experimental/{durable,vacation}`：另一套基于 inbox/boundary 的消费模型（`packages/durable/src/harness/inbox.ts:59-97`），由 `experimental/` 入口使用；发布包 `files` 排除 `dist/experimental`（`packages/coding-agent/package.json` 的 `files` 字段），不是 CLI 主线。
- `modes/rpc/rpc-client.ts:210-221` 的 `steer/followUp` 只是 RPC 客户端方法，服务端仍调用同一个 `AgentSession.steer/followUp`。
- `settings-manager.ts:505-507` 的 `queueMode → steeringMode` 迁移属历史兼容字段。

### 0.1 生产链与实验链的入口隔离（用于排除误导）

- **生产链唯一**：`src/cli.ts` → `src/main.ts` → `createRuntime`（`main.ts:730-860`：`createAgentSessionServices` `749` + `createAgentSessionFromServices` `838`）→ `createAgentSessionRuntime(...)`（`main.ts:862`）→ `runtime.session` 交给三种模式（`runRpcMode` `main.ts:949`、`runPrintMode` `main.ts:985`、interactive `main.ts:67`）。
- `createAgentSessionFromServices` 直接转调 `createAgentSession`（`agent-session-services.ts:14,214-217`），后者构造 `new Agent({...})`（`sdk.ts:387-433`，`streamFn` 为 `modelRuntime.streamSimple`，即生产供应商路径）并 `new AgentSession`（`sdk.ts:437`）。
- `main.ts` 中**没有**任何 `experimental`/`durable`/`vacation` 引用（grep 为空）；durable 客户端/服务端是独立入口 `src/experimental/cli.ts`（先试 `runExperimentalCommand`，命令仅 `client`/`server`，否则回落 `main()`），且发布包 `files` 排除 `dist/experimental`、`dist/cli/experimental`，`bin` 只有 `pi → dist/bundle/cli.js`。即：**durable 路径不可由生产 `pi` 二进制到达**。
- 因此"当前 coding-agent 用 core 还是 durable"的事实答案是：**生产 CLI（interactive/rpc/print）100% 使用 packages/agent 的 `Agent` 核心循环**；durable 是 `@earendil-works/pi-durable` 上的独立试验品（其自己的 harness 有 `steeringMode/followUpMode` 设置项 `packages/durable/src/harness/agent.ts:55-56`、boundary 取队 `harness/inbox.ts:59-97`），不参与 CLI 主线。

---

## 1. 入队时点

1. `AgentSession.steer(text, images?, {source})` / `followUp(...)` → `_queueUserInput`（`agent-session.ts:2164-2170`、`2180-2186`、`2126-2153`）。期间：扩展 `input` 事件拦截/改写、skill 与 prompt 模板展开；扩展命令**禁止**入队（抛错，`2221-2231`，测试 `test/suite/agent-session-queue.test.ts:440-475`）。
2. `_queueSteer` / `_queueFollowUp`（`agent-session.ts:2191-2206`、`2208-2216`）各写**两份**状态：
   - 真实消费源：`agent.steer(msg)` / `agent.followUp(msg)`（`agent.ts:299-306`）→ `PendingMessageQueue.enqueue`（`agent.ts:151-153`）；
   - 展示镜像：`_steeringMessages` / `_followUpMessages`（字符串数组，`agent-session.ts:378-380`），并触发 `queue_update` 事件（`1017-1023`）。
3. `prompt()` 在流式中必须显式给 `streamingBehavior: "steer" | "followUp"`，否则抛错（`agent-session.ts:1962-1976`）；`steer()/followUp()` 直接调用**没有**"必须在流式中"的前置条件——空闲时入队只是入队，不会启动任何执行。
4. 默认模式均为 `one-at-a-time`（`agent.ts:247-248`；settings 默认值 `settings-manager.ts:831,841`；文档 `docs/settings.md:29-30`）。模式变更入口：session `setSteeringMode/setFollowUpMode`（`agent-session.ts:2653-2665`）、RPC `set_steering_mode/set_follow_up_mode`（`rpc-mode.ts:520-525`）、reload 时 `syncQueueModesFromSettings`（`agent-session.ts:2644-2647,3621`）。

**关键事实：入队 ≠ 执行。** 消息只有在"某次运行的取队点"或 `Agent.continue()` 被调用时才被消费（见 §2）；空闲会话里排队不会自我驱动。

---

## 2. 取出（消费）时点：`runLoop` 全图（`agent-loop.ts:163-321`）

| 时点 | 行为 | 行号 |
| --- | --- | --- |
| run 起点 | 先 poll 一次 steering（"用户可能在等待期间输入"），作为第一轮 pendingMessages | `175-176` |
| 内层循环条件 | `while (hasMoreToolCalls \|\| pendingMessages.length > 0)` | `183` |
| 轮前准备 | `prepareNextTurn`（压缩、系统提示刷新等长耗时操作）→ **若 pendingMessages 为空**才再 poll steering（注释：否则 one-at-a-time 会在一轮内送两条）→ `turn_start` | `185-207` |
| 注入 | 对 `preparedMessages + pendingMessages` 逐条发 `message_start` + `message_end` 并推入 context（即注入发生在**下一轮 `turn_start` 之后**） | `202-213` |
| 请求 | `prepareRequest` → `streamAssistantResponse`（provider 调用） | `216-235` |
| 错误/中止响应 | `finishTurn` → `turn_end`（`toolResults: []`）→ `agent_end` → **直接 return**，不再 poll 任何队列 | `243-256` |
| 工具批 | `executeToolCalls`：整批执行（sequential `530-584` / parallel `586-660`），**批内不 poll 队列** | `261-278` |
| 轮末 | `finishTurn`（在 `turn_end` 之前）→ `turn_end` → poll steering | `286-297` |
| `action:"end"` | `finishTurn` 返回 end → `agent_end` → return（跳过队列 poll 与下轮准备） | `289-292`；测试 `packages/agent/test/agent-loop.test.ts:1176` |
| 外层 follow-up | 仅当内层退出（无工具调用、无 steering）时 poll follow-up；有则塞回 pendingMessages 并 `continue`（**同一次 run**，中间不发 `agent_end`） | `301-308` |
| 显式续跑 | `finishTurn` 返回 `continue` → 恰好一次纯上下文轮 | `311-314`；测试 `agent-loop.test.ts:1232,1266` |
| 收尾 | `agent_end` | `320` |

取队的实现：`Agent.createLoopConfig()` 把 `getSteeringMessages/getFollowUpMessages` 绑定到 `PendingMessageQueue.drain()`（`agent.ts:496-503`）。`peek/drain` 语义（`agent.ts:159-169`）：`"all"` 取整队；`"one-at-a-time"` 只取最旧一条，其余留到下一个取队点。

`Agent.continue()`（`agent.ts:384-411`）：若尾部消息是 assistant 且 steering 队列非空 → 直接 drain（`skipInitialSteeringPoll: true` 防止起点重复取队）并发起新 run；否则 drain follow-up；两者皆空则抛错。

**AgentSession 侧"被消费"的可观测边界**：`message_start(role === "user")` 到达时，先按文本 `indexOf` 从镜像队列摘除并 `queue_update`，再向扩展/监听者派发（`agent-session.ts:1094-1106`；`_emitQueueUpdate` `1017-1023`）。测试断言监听者收到该 `message_start` 时 `pendingMessageCount` 已为 0（`test/suite/agent-session-queue.test.ts:409-437`）。注意其实现是**文本匹配**（重复文本按先入者摘除），不是身份匹配。

**`agent_end` 不是队列边界**：低层循环在 `agent_end` 前排空两个队列，`agent_end` 处理器里新入队的消息需要一次新 run；`AgentSession._runAgentPrompt` 的循环用 `_handlePostAgentRun()` 判断是否 `agent.continue()`（`agent-session.ts:1775-1804,1806-1844`，注释见 `1838-1840`；测试 `agent-session-queue.test.ts:476-498`）。

---

## 3. one-at-a-time / all：多输入一次取出的事实

- `one-at-a-time`（默认）：多输入时每轮只取 1 条 → **每条 steering 会额外消耗一轮**（多次 provider 请求）。测试：`agent-session-queue.test.ts:206-226`（steering 顺序）、`227-253`（follow-up 顺序）；`packages/agent/test/agent.test.ts:1024-1055`（continuation 起点：one-at-a-time=2 次请求，all=1 次）。
- `all`：一次全取，同一请求前全部注入。测试：`agent-session-queue.test.ts:254-280`、`281-308`（断言一次上下文即含 "steer 1"、"steer 2"）。
- 文档口径：`docs/rpc-commands.md:336-364`（all=当前 assistant 轮及其工具调用完成后全量送达；one-at-a-time=每个完成轮送一条 / 每次 agent 完成送一条）；`docs/sdk.md:66-68`。
- 顺序保证：steering 优先于 follow-up；同一 run 内 steering 在 tool-result 之后、下一请求之前（`agent-loop.ts:295-308`；测试 `packages/agent/test/agent.test.ts:1057-1085`）。

---

## 4. tool batch 中途

- 一个 assistant 消息里的**所有**工具调用整批执行完（含并行完成）之后才回轮末取队（`agent-loop.ts:261-297`）。批内没有 steering/follow-up 取队点。
- 测试：`packages/agent/test/agent-loop.test.ts:721-820` 断言 interrupt 消息的 `message_start` 出现在**两个 toolResult 的 `message_start` 之后**，且同 turn 的下一次 provider 请求已包含该消息。
- 并行批的顺序细节：`tool_execution_end` 按完成顺序、tool 结果消息按源顺序写回/发出（`agent-loop.ts:586-660`；测试 `agent-loop.test.ts:627-720`）。

---

## 5. 取消 / 自动续跑 / 重试

**取消（会话级）**：`AgentSession.abort()`（`2387-2397`）标记 `_agentRunAbortRequested`、abort retry/compaction/branchSummary、`agent.abort()`、`waitForIdle()`。

- 队列**不会**因 abort 清空；只有 `clearQueue()`（`2355-2363`）与 `Agent.reset()`（`agent.ts:355-368`）清空。
- 响应级中止：assistant 消息 `stopReason === "aborted"`（或 error）→ `turn_end` + `agent_end` 直接返回（`agent-loop.ts:243-256`）；队列保留且不再被消费，即使 `finishTurn` 要求 continue（测试 `packages/agent/test/agent.test.ts:1086-1122`；`1123-1149` 为 `action:"end"` 情形）。
- 工具批内中止：sequential 在当前工具后 `break`，parallel 对未开始条目产出 `"Operation aborted"` 错误结果（`agent-loop.ts:530-660`）。
- 交互层取消语义不同：交互模式 Esc（streaming 中）调用 `restoreQueuedMessagesToEditor({abort:true})` → 先 `clearQueue()` 把排队文本放回编辑器，再 `abort()`（`interactive-mode.ts:3021-3024`，实现 `4665-4690`；dequeue 快捷键 `3068`）。即"用户取消"在 TUI 会把队列还原到编辑器，而裸 `session.abort()` 保留队列。

**自动续跑**：每次 `agent.continue()` 都是一次新的低层 run（重新发 `agent_start`），但同一会话 run 直到 `agent_settled`。触发条件见 `_handlePostAgentRun`（`1806-1844`：可重试错误 → 重试；压缩；`hasQueuedMessages()`）与 `_runBeforeSettleBoundary`（`1846-1868`：`agent_before_settle` 扩展可请求继续）。`agent_end` 事件被追加 `willRetry`（`1169-1183`；事件类型 `192-196`）。重试实现 `_isRetryableError`/`_prepareRetry`（`3660-3753`）。

---

## 6. 事件顺序（一次典型 run）

文档给出的事件序列（`docs/json.md:35-48`）：

```
agent_start → turn_start → message_start/end(user)
→ message_start(assistant) → message_update* → message_end(assistant)
→ [tool_execution_start/update/end ×N → message_start/end(toolResult) ×N]
→ turn_end → agent_end → agent_settled
```

与源码对照的补充事实：

- 首轮 `turn_start` 由 `runAgentLoop`/`runAgentLoopContinue` 发出（`agent-loop.ts:117-118`、`146-147`）；后续轮的 `turn_start` 在 `runLoop:207`。即"一轮一个 `turn_start`"，但发出位置有两处。
- 排队消息的注入以**成对 `message_start`+`message_end`** 出现（无 `message_update`），且在下一轮 `turn_start` 之后（`202-213`）。这是"队列被消费"最直接的公共观测事实。
- `finishTurn` 在 `turn_end` **之前**调用（`agent-loop.ts:286-287`）；扩展的 `turn_end` 边界走同一路径（`agent-session.ts:818-856`）。
- `turnIndex` 在扩展事件层面：`agent_start` 归零、`turn_end` 自增（`agent-session.ts:1253-1275`）。
- 一次 `prompt()` 可以包含多次 `agent_start`/`agent_end`（自动续跑、重试、压缩恢复），但只有一个 `agent_settled`（`docs/json.md:48`、`docs/rpc.md:69`；实现 `agent-session.ts:1050-1071`）。
- `message_start`/`message_end` 是**队列消费与请求构成的观测点**；`agent_end` 只代表一次低层 run 结束，**不**代表"等待用户"。

---

## 7. 原生可观测接口清单（事实）

- `AgentEvent`（`packages/agent/src/types.ts`，`agent-loop.ts` 全程 emit）：`agent_start`、`turn_start`、`message_start|update|end`、`tool_execution_start|update|end`、`turn_end`、`agent_end`。
- `Agent`：`hasQueuedMessages()`（`agent.ts:325-327`）、`peekQueuedMessages()`（`330-333`，steering 优先，非消费）、`steeringMode/followUpMode`（`280-296`）、`state.isStreaming/pendingToolCalls`、`signal`/`abort()`、`waitForIdle()`（`350-352`；resolve 于 `agent_end` 监听器 settle 之后）。
- `AgentSession`：`pendingMessageCount`（`2366-2368`）、`getSteeringMessages/getFollowUpMessages`（`2371-2378`，**文本镜像**）、`queue_update` 事件（`1017-1023`，JSON 形态 `docs/json.md:121`）、`isStreaming`（= `_isAgentRunActive`，`1430-1432`）、`isIdle`（`1435-1437`）、`agent_settled`（`1050-1071`）、`agent_end.willRetry`（`1169-1183`）。
- "等待用户"没有专门事件；只能用上述代理信号组合（例如 `agent_end` 且 `!hasQueuedMessages()` 且 session `isIdle`）。[INFERENCE] 该组合是本文从源码推出的观测方法，pi 没有对应的公共谓词。
- RPC 通道：`steer`/`follow_up` 命令（`rpc-mode.ts:416-422`）、`get_state.pendingMessageCount`（`rpc-mode.ts:461`）、`clear_queue`（`432`）；事件 JSON 见 `docs/json.md`。
- 扩展可见面（本票同组另有一票专门调查）：`input` 事件只在 streaming 时收到 `streamingBehavior`（`agent-session.ts:1880,1950`）；`sendUserMessage(..., {deliverAs})` 与 `sendMessage` 在流式中入队（`2318-2348`；测试 `agent-session-queue.test.ts:92-124,309-375`）。

---

## 8. 值得主 agent smoke 的最小真实接口与加载方法

### 8.1 本机现状（重要）

- `E:/Developer/myhub/pi` **未安装依赖**：仓库根、`packages/agent`、`packages/coding-agent`、`packages/ai` 均无 `node_modules`；`packages/*/dist` 不存在；`E:/Developer/myhub` 下任何项目都没有 `@earendil-works/pi-*` 安装树。Node v24.18.0 / npx / bun 可用。
- 不能据上述依赖目录检查断言 Bun 无法直接加载源码：主 agent 已实际直接 import 当前 Agent 源码并完成 8 场景 smoke，未安装依赖（见 [运行证据](pi-queue-smoke.md)）。若要运行依赖完整测试环境的 vitest 套件，可在**隔离副本**里使用 CI 命令 `npm ci --ignore-scripts`（`.github/workflows/ci.yml:33,42`）。生产包 `exports` 指向 `dist`，但 vitest 配置已把 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` 等别名到 **源码**（`packages/coding-agent/vitest.config.ts` 的 `resolve.alias` + `../../vitest.base.ts` 的 `workspaceSourcePaths`；`packages/agent/vitest.config.ts` 同款 `conditions: ["source"]`），所以测试无需先构建即可跑源码。
- 禁止项提醒：不要用 `packages/coding-agent/src/sdk.ts:387-437` 直连真实 provider；不要跑 `packages/agent/test/e2e.test.ts`（真模型/网络）。

### 8.2 推荐：会话级 smoke（零网络，推荐验收接口）

真实接口 = `AgentSession` + 真实 `Agent` + **faux provider**（`registerFauxProvider` + `streamSimple`，来自 `@earendil-works/pi-ai/compat`）。

- 现成 harness：`packages/coding-agent/test/suite/harness.ts:150-275` 的 `createHarness(options)` —— 内部 `registerFauxProvider`（`152`）、`new Agent({ streamFn: streamSimple, ... })`（`193-240`）、`new AgentSession({...})`（`232-244`），返回 `session / setResponses / getPendingResponseCount / events / eventsOfType / cleanup`。无网络、无 TUI。
- 现成断言（直接覆盖本笔记 §2-§3）：
  - `test/suite/agent-session-queue.test.ts:206 / 227 / 254 / 281`（one-at-a-time 顺序、all 批）
  - `:409`（`pendingMessageCount` 在 `message_start` 派发前已清零）
  - `:92 / :125`（steering 在下一 LLM 调用前、follow-up 在 run 结束后）
  - `:476`（`agent_end` 里入队的 follow-up 触发续跑）
- 运行命令（隔离副本内）：
  ```bash
  cd <pi-copy> && npm ci --ignore-scripts
  cd packages/coding-agent && npx vitest --run test/suite/agent-session-queue.test.ts
  ```
  `vitest.config.ts` 默认 `env: { PI_OFFLINE: "1" }`（测试离线）；已安装依赖后也可 `npx vitest --run` 全量。
- 若自写脚本（不依赖 vitest 断言风格）：从 harness 抄最小构造顺序 —— `registerFauxProvider()` → `faux.setResponses([fauxAssistantMessage(fauxToolCall("wait", {}), { stopReason: "toolUse" }), ...])` → `new Agent({ streamFn: streamSimple, getApiKey: () => "faux-key", initialState: { model, systemPrompt: "", tools: [] } })` → `new AgentSession({ agent, sessionManager: SessionManager.inMemory(), settingsManager: SettingsManager.inMemory(), cwd, modelRuntime: getModelRuntime(...), resourceLoader: createTestResourceLoader(), baseToolsOverride })`。`session.agent` 是公开字段，可直接 `steer/followUp/abort/waitForIdle` 并 `session.subscribe` 收事件流。

### 8.3 备选：agent 层最小 smoke（更小、更快）

只要验证"入队→取队→注入"的循环语义时，可直接用 `packages/agent`（Mock stream，无网络）：

```bash
cd <pi-copy> && npm ci --ignore-scripts && cd packages/agent
npx vitest --run test/agent.test.ts      # 663/673 队列 API；1024 模式；1086 错误/中止保留；1123 action:end；1150 peek
npx vitest --run test/agent-loop.test.ts # 721 tool batch 后注入；1176 action:end 跳过 poll；1539 prepareNextTurn 期间入队
```

手工最小复现（无需 faux provider）：`new Agent({ streamFn: () => mockStream })`，其中 mockStream 逐帧 `push({type:"done"|"error", ...})` —— 参照 `packages/agent/test/agent.test.ts` 顶部 `MockAssistantStream` 工具。

### 8.4 不值得作为 smoke 的接口

- `agentLoop()` / `agentLoopContinue()` 流式 API：非当前 CLI 路径，且不等待异步事件处理 settle（`packages/agent/README.md:560`）。
- `packages/durable` 的 inbox/boundary：试验性、独立模型，不代表当前路径。
- `rpc-client`：只是传输层。

---

## 9. 供决策票直接引用的事实清单（一屏版）

1. 队列真正的消费源是 `packages/agent` 的 `PendingMessageQueue`；`AgentSession` 的字符串队列只是展示镜像（文本匹配摘除）。
2. 取队点只有 3 个：run 起点、`prepareNextTurn` 之后（且此前 poll 为空）、每个 `turn_end` 之后；follow-up 多一个"内层循环将退出"点。
3. 一次取出量由 `steeringMode`/`followUpMode`（`all` | `one-at-a-time`，默认 one-at-a-time）决定；one-at-a-time 下每条消息额外消耗一轮（一次 provider 请求）。
4. 工具批不打断：一批工具全部完成、工具结果全部落盘后，才注入排队消息。
5. 队列消费的公共观测事实是 `message_start(role=user)`（成对 `message_end`）出现在下一轮 `turn_start` 之后、下一请求之前；AgentSession 还会在派发前发出 `queue_update`。
6. `agent_end` 只关闭一次低层 run；之后仍可能因重试、压缩恢复、排队消息、`agent_before_settle` 继续（新的 `agent_start`）；`agent_settled` 才是"不会自动继续"。
7. 取消（`abort()`）不清队列；TUI 的取消路径（Esc/dequeue）会清队列并把文本还原到编辑器。
8. pi 没有 "Round" 术语；公共技术单位是 turn（assistant 响应 + 其工具调用与结果）与低层 run。
