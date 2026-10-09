# pi coding-agent 扩展表面：用户输入入队 vs 实际消费观测

调查基线：`E:/Developer/myhub/pi` HEAD `a276dabe57911253350bffb93cb7d7aff6a73261`，干净工作树。只读调查，未修改 pi 任何文件、正式配置或公共定义。本文是事实资产，不是已确认接口；每条结论标注 primary source 路径:行号，未由源码或 smoke 直接证实处集中在 §10 显式列出，并以 `[INFERENCE]` 标记。

来源约定：`agent-loop.ts` = `packages/agent/src/agent-loop.ts`；`agent.ts` = `packages/agent/src/agent.ts`；`agent-session.ts` = `packages/coding-agent/src/core/agent-session.ts`；`runner.ts` / `types.ts` = `packages/coding-agent/src/core/extensions/{runner,types}.ts`。

---

## 1. 路径判定：coding-agent 走 packages/agent，不走 durable

| 事实 | 证据 |
| --- | --- |
| coding-agent 生产路径使用 `@earendil-works/pi-agent-core` | `agent-session.ts:33` 从该包导入；`:363` `readonly agent: Agent`；`:1790` 调 `this.agent.prompt(...)`；`packages/coding-agent/package.json` dependencies 含 `@earendil-works/pi-agent-core` |
| `@earendil-works/pi-durable` 不是 coding-agent 依赖 | coding-agent `package.json` 的 dependencies / devDependencies / optionalDependencies 均无该项 |
| durable 在 `src` 下 17 处 import 全在 `src/experimental/` 内 | `packages/coding-agent/src/experimental/{durable,services,vacation,client-tui*}.ts` |
| `src/experimental` 被显式排除出构建 | `packages/coding-agent/tsconfig.build.json` `exclude: [..., "src/client", "src/experimental", "src/cli/experimental"]` |
| `src/experimental` 只被 test 引用 | 全仓搜索 `src/experimental/*` 的非 experimental 引用只有 `packages/coding-agent/test/*.test.ts` |
| 生产 bin 唯一 | `packages/coding-agent/package.json` `bin: { pi: "dist/bundle/cli.js" }`；`build` = `tsc -p tsconfig.build.json` + bundle |

结论：**durable 在本 HEAD 不是实际路径**，它是实验性/测试专用架构。主 agent 的 agent-core smoke 覆盖真实生产 runtime。durable 仍值得作为对照记录（§8）。

---

## 2. 事件实际派发处（扩展可见面）

扩展只见 `pi.on(...)` 列出的类型（`types.ts:1587-1612`）。下表是每个事件在 core 的**原生** emit 点，和它被转发给扩展的点。

| 扩展事件 | core 原生派发点 | 转发给扩展 | 说明 |
| --- | --- | --- | --- |
| `before_agent_start` | 无 core 事件 | `runner.ts:1411-1455`；唯一调用点 `agent-session.ts:2015` | 仅 `prompt()` 的空闲路径；带 `prompt`(已展开文本)/`images`/`systemPrompt`/`systemPromptOptions`（`types.ts:900-904`） |
| `agent_start` | `agent-loop.ts:117`（`runAgentLoop`）、`:146`（`runAgentLoopContinue`） | `agent-session.ts:1255-1258`（并把 `_turnIndex` 归零，`:1257`） | **无 payload**（`types.ts:913`） |
| `turn_start` | `agent-loop.ts:118`、`:147`、`:207` | `agent-session.ts:1261-1267` | `{turnIndex, timestamp}`；`turnIndex` 自 agent_start 起计数 |
| `message_start` | `agent-loop.ts:120`、`:212`、`:420`、`:452`、`:465`、`:938`；`agent.ts:544`（运行失败合成消息） | `agent-session.ts:1273-1278` | `{message}`（`types.ts:1026`） |
| `message_end` | `agent-loop.ts:121`、`:213`、`:454`、`:467`、`:939`；`agent.ts:545` | `agent-session.ts:1286-1301`（可替换消息） | `{message}` |
| `turn_end` | `agent-loop.ts:253`、`:287`；`agent.ts:545` | `agent-session.ts:1268-1272`（仅 `role==="assistant"` 才派发 boundary；随后 `_turnIndex++`） | `TurnEndEvent` 额外带 `messageEntryId`、`toolResultEntryIds`（`types.ts:1009-1019`） |
| `agent_end` | `agent-loop.ts:254`、`:290`、`:320`；`agent.ts:547` | `agent-session.ts:1259-1260` | `{messages}`；**扩展看不到 `willRetry`**（见 §6） |
| `agent_before_settle` | — | `agent-session.ts:1851`（`emitBoundary`） | 可请求一次续跑 |
| `agent_settled` | — | `agent-session.ts:1055`（扩展）+ `:1056`（订阅者） | **无 payload** |
| `input` | — | `runner.ts:1511-1548`；调用点 `agent-session.ts:1880`，由 `_runInputHandlers` 在 `:1946`（`prompt`）与 `:2136`（`_queueUserInput`）触发 | `{text, images, source, streamingBehavior?}`（`types.ts:1120-1130`） |
| `ui_prompt_start` / `ui_prompt_end` | — | `runner.ts:585` / `:595`（`withUIPrompt`），经 `queueMicrotask` 异步投递（`runner.ts:611-613`） | 仅包住扩展自己的 `ctx.ui.*` 调用 |

`agent_start` 的 native emit 只有两处，且 `runAgentLoop`/`runAgentLoopContinue` 各一次；**一个 `runLoop` 调用内部不会重发 agent_start**。主 agent smoke 的「只有 1 agent_start/agent_end」正对应单次 `agent.prompt()`。

---

## 3. 关键：agent_start 不是 Round 标记（coding-agent 层会多次派发）

`agent-session.ts:1777-1801` `_runAgentPrompt`：

```
this._isAgentRunActive = true;                       // :1783
await this.agent.prompt(messages);                   // :1790
while (!this._agentRunAbortRequested) {
  if (await this._handlePostAgentRun()) {            // :1792 重试/压缩/排队续跑
    await this.agent.continue();  continue;          // :1794
  }
  if (aborted || !(await this._runBeforeSettleBoundary())) break;  // :1796
  await this.agent.continue();                       // :1799
}
```

每次 `agent.continue()` 都会重新走 `runAgentLoopContinue`（`agent.ts:384-411`）：队列非空时走 `runPromptMessages(...)`（`agent.ts:432-446`）→ `runAgentLoop`，否则 `runContinuation()`（`:448-458`）→ 两者都在 `agent-loop.ts:117` / `:146` 再发一次 `agent_start` + `turn_start`。

因此一次用户提交内，`agent_start` 会出现多次：初始 prompt、每次**自动重试**（`_handlePostAgentRun` 在 `:1817` 判 `_isRetryableError` + `_prepareRetry`）、每次溢出/阈值压缩后续跑、`agent_before_settle` 请求的续跑、以及结算窗口内入队消息触发的 `continue`（`:1843` 返回 `agent.hasQueuedMessages()`）。

官方文档同口径：`docs/rpc.md:69`「`agent_end` marks the end of one low-level agent run, but retries, overflow recovery, compaction, steering, or follow-up work can still follow. Wait for `agent_settled`...」；`docs/extensions.md:62-67` 同义，并写明「`agent_settled` is final and notification-only」。

`turnIndex` 也不可当 Round 序号：它在每次 `agent_start` 被重置为 0（`agent-session.ts:1257`）。

---

## 4. 入队 vs 消费：两条路径与精确消费时点

### 4.1 提交（submission）分叉，位于 `agent-session.ts:1921` `prompt()`

顺序（行号即派发顺序）：

1. `:1930-1937` 扩展命令 `/cmd` → 执行后 `preflightResult("handled")` 并 return（**不发 `input`**）。
2. `:1939-1943` 压缩中 → throw。
3. `:1946` `_runInputHandlers` → **`input` 事件**（`source` 默认 `"interactive"`）。
4. `:1958-1963` skill/模板展开（`input` 之后，故事件里是未展开文本；`before_agent_start` 里是已展开文本）。
5. `:1965-1979` **正在 streaming** → 必须有 `options.streamingBehavior`（否则 throw），然后 `_queueFollowUp` / `_queueSteer`，`preflightResult("queued")`，**return**（不发 `before_agent_start`、不发 `agent_start`）。
6. `:1985-2001` 模型/凭据校验（**在 `input` 之后** → `input` 可以出现于最终 throw 的提交上）。
7. `:2004-2007` 提交前压缩检查。
8. `:2012-2015` **`before_agent_start`**，随后 `:2063` `_runAgentPrompt(messages)`。

扩展侧可见的「提交已入队」证据：`input` 事件的 `streamingBehavior === "steer" | "followUp"`（`types.ts:1127-1129` 注释：undefined 表示空闲）；RPC 另有 `PromptDisposition = "handled" | "queued" | "started"`（`agent-session.ts:294-295`，`preflightResult` 钩子 `:307-308`），但该 hook 是 **RPC 专用内部钩子，不在扩展 API 上**。

### 4.2 队列语义

| 层 | 状态 | 证据 |
| --- | --- | --- |
| `Agent` | 两个 `PendingMessageQueue`（`agent.ts:143-174`），`mode: "all" \| "one-at-a-time"`（`peek` `:159-163`、`drain` `:165-169`） | `steer` `:299-301`、`followUp` `:304-306`、`steeringMode` `:285-287`、`followUpMode` `:294-296` |
| `AgentSession` | 平行的**纯文本**数组 `_steeringMessages` / `_followUpMessages`（`:378`、`:380`） | `_queueSteer` `:2191-2203`、`_queueFollowUp` `:2205-2216`、`clearQueue` `:2355-2363` |

`_queueSteer` 同时 `_steeringMessages.push(text)` + `_emitQueueUpdate()` + `agent.steer({role:"user",...})`：**入队即双写**，文本队列是 `hasPendingMessages()` 的来源，`Agent` 队列是真正取用处。

### 4.3 消费时点（唯一真正取用点）

`runLoop`（`agent-loop.ts:163-321`）是唯一取用队列的地方：

- `:176` 循环入口首次 `getSteeringMessages()`（注释「user may have typed while waiting」）→ 空闲期排队的 steer 在下一次运行开头被取用。
- `:195-207` 若 `lastCompletedTurn` 存在 → `prepareNextTurn` → **`turn_start`**（`:207`）。
- `:211-216` `[...preparedMessages, ...pendingMessages]` → **`message_start` / `message_end`**，随后才 push 进 context。
- `:295` 一轮结束后再取 steering；`:302` 外层停止点取 follow-up。

取用点与 `_queueSteer` 的文本队列在两处对齐：`agent-session.ts:1090-1108` 在 **`message_start` 且 `role==="user"`** 时按**文本内容** `indexOf` 移除对应项并 `_emitQueueUpdate()`，且这是在 `:1111` 转发给扩展**之前**完成的。

精确顺序（主 agent smoke 与源码一致）：`turn_start` → `message_start(user)` → `message_end(user)` → （provider request）→ assistant 流。排队的 steer/followup **不产生新的 `agent_start`**，只产生新的 `turn_start`/`turn_end` 对。

**steering 与 followup 是同一个原生 `runLoop`、同一组事件**，差别只是取用时机：steer 在 `:295`（每轮 tool 批次后）取，follow-up 在 `:302`（内层循环再也无 tool/steering，agent 即将停止时）取。`one-at-a-time` 与 `all` 只影响一次取几条（`agent.ts:159-169`）。主 agent smoke 的差异化时序（steer 有 tool 时第二请求即含 B；followUp 有 tool 时第三请求才含 B）与该结构一致。

---

## 5. message identity / origin / type

| 问题 | 事实 | 证据 |
| --- | --- | --- |
| user 消息有 id 吗 | **没有**。`UserMessage = { role: "user"; content; timestamp }` | `packages/ai/src/types.ts:540-544` |
| 有 origin/source 吗 | **没有**。消息上不存在 origin/source/delivery 模式字段 | 同上；`AgentMessage` 并集 `packages/agent/src/types.ts:374`（`Message \| CustomAgentMessages[keyof ...]`） |
| 身份怎么保持 | JS 对象身份：同一对象引用经事件传入并 push 进 agent state（`agent-loop.ts:212-215`），`message_end` 可被替换但会在原对象上原地改（`agent-session.ts:1239-1253`） | `_entryIdsByMessage` 是 `WeakMap<object,string>`（`agent-session.ts:410`） |
| 持久化 entry id 何时可见 | `TurnEndEvent.messageEntryId` / `toolResultEntryIds`（仅 assistant turn 边界）；`MessageStartEvent`/`MessageEndEvent` **不带** entryId，且 `_entryIdsByMessage.set` 在转发之后（`:1135`） | `types.ts:1009-1019`；`agent-session.ts:1111-1135` |
| 扩展能自己关联吗 | 可以，但只能事后：`ReadonlySessionManager` 暴露 `getEntry/getBranch/getEntries/getLeafId/getTree/getHeader/getSessionName` 等（**无** `appendMessage`） | `packages/coding-agent/src/core/session-manager.ts:245-261`；`types.ts:335` |
| 类型/角色 | `role`: `system` / `user` / `assistant` / `toolResult`（core）+ coding-agent 扩展的四类 `bashExecution` / `custom` / `branchSummary` / `compactionSummary` | `packages/coding-agent/src/core/messages.ts:29-69`（declaration merging 到 `CustomAgentMessages`） |
| 唯一带 origin 的地方 | `InputEvent.source: "interactive" \| "rpc" \| "extension"`（`types.ts:1119`）+ `streamingBehavior`。这是**提交**的属性，不是消息的属性 | `types.ts:1120-1130` |

重要不对称：扩展注入的 `custom` 消息若不带 turn（`sendCustomMessage` 的 `triggerTurn=false` 空闲分支）走 `_appendCustomMessage`（`agent-session.ts:2293-2294`），它用 `this._emit(...)`（订阅者/SDK）而**不是** `_emitExtensionEvent`，因此**扩展处理器看不到这条 `message_start`/`message_end`**。

---

## 6. hasPendingMessages / isIdle

| API | 实现 | 含义与限制 |
| --- | --- | --- |
| `ctx.hasPendingMessages(): boolean`（`types.ts:356`） | `agent-session.ts:3402` `() => this.pendingMessageCount > 0`；`pendingMessageCount = _steeringMessages.length + _followUpMessages.length`（`:2366-2368`） | 只有布尔；**不暴露内容、条数、id、steer/followUp 区分、入队时间**。来源是 §4.2 的文本数组 |
| `ctx.isIdle(): boolean`（`types.ts:348`） | `agent-session.ts:3392`；实现 `:1435-1437` `!this._isAgentRunActive && !this.isCompacting` | 整段 `_runAgentPrompt`（含自动重试等待、`agent_before_settle`）内恒为 false；`_isAgentRunActive=false` 只在 `_emitAgentSettled`（`:1052`） |
| `ctx.waitForIdle()` | 仅 `ExtensionCommandContext`（`types.ts:406`），`agent-session.ts:2399-2404` | 事件处理器上下文里没有；由 `_resolveIdleWaitIfIdle`（`:1041-1048`）在 settle 后兑现 |

`queue_update` 事件（`agent-session.ts:198-202`，派发于 `_emitQueueUpdate` `:1017-1023`）属于 **AgentSessionEvent（订阅者/SDK/RPC）**，**不在扩展 `on()` 面上**（`runner.ts:175-192` 的 `RunnerEmitEvent` 与 `types.ts:1587-1612` 均无）。所以扩展只能轮询布尔，不能订阅入队/出队。

同一原因，`auto_retry_start` / `auto_retry_end` / `compaction_start` / `compaction_end` / `entry_appended`、以及 `agent_end.willRetry`（`agent-session.ts:190-217`）都是订阅者事件，**扩展看不到**。

---

## 7. 批准交互（工具批准）

pi **没有内建工具批准层**。权限由扩展在 `tool_call` 处理器里实现，官方范例即 `ctx.ui.confirm(...)` + `return { block: true, reason }`：

- `docs/extensions.md:174` 给出完整模式（用 `pi.getAllTools()` 的 `annotations` 判 `destructiveHint`/`readOnlyHint`/`openWorldHint`）。
- `ToolCallEventResult = { block?: boolean; reason?: string; terminate?: boolean }`（`types.ts:1402-1411`）。
- `annotations` 语义见 `types.ts:512-525`（来自作者、不校验，供权限扩展决定是否 confirm）。

批准交互对 Round 观测的含义：

- 等待批准期间**不产生** `agent_start`、`turn_start`、`input`、`message_start`；批准完成后原 turn 继续。批准是 `tool_call` 处理器内部的 `await`。
- 唯一扩展可见的「正在等待用户」信号是 `ui_prompt_start`/`ui_prompt_end`（`types.ts:993-1004`），kind 为 `"confirm"` 等，**仅在扩展自己调 `ctx.ui.*` 时触发**（`runner.ts:569-580` 包装），且经 `queueMicrotask` 异步投递（`runner.ts:611-613`），嵌套调用只报最外层（`:582-584`）。
- 专门批准可以走 UI prompt，不走普通消息队列；等待这种专门交互期间执行尚未 settled，isIdle 为 false。普通文本澄清若随本次回答完成且没有自动续跑，则会走 agent_settled，isIdle 可为 true；不能把两者混为同一种等待。ui_prompt_* 仅观测其包裹的专门交互，是否覆盖宿主所有交互未在此证明。

---

## 8. 对照：packages/durable（非实际路径，但模型更完整）

`packages/durable` 走完全不同的抽象，其对照价值在于它**显式建模了入队与消费**：

- `harness/inbox.ts:12-16` `InboxItem` 带 `SubmissionId`，`mode: "steer" | "followUp" | "write"`；`InboxDoc` 是持久化文档。
- `harness/inbox.ts` `applyBoundary(tx, boundary, at: "postTools" | "final", now)` 在边界上把选中的 item 落成真实 entry，并 `tx.placeSubmission(item.id, entry.id)`（消费即绑定 submission→entry id），移除时才 splice；stale 项 `settleSubmission(..., {status:"unanswered", reason:"stale"})`，abort 走 `withdrawQueuedInputs(... reason:"aborted")`。
- `harness/submissions.ts` 提供 `submit/get/status/wait/abort`，`Waiters` 可等某个 submission 结算（`submissions.ts:33-61`）。
- `session/observation.ts` 是 chord 复制状态源，用于把已提交文档状态以 frame 形式对观察者发布。

即：durable 有 **submission id、显式终态（done/unanswered + reason）、可等待结算**；coding-agent 扩展面只有布尔 `hasPendingMessages()` 与无 id 的 `message_start`。本 HEAD 无法从 CLI 走到 durable（§1），所以这是未来方向而非可用能力，**不能作为当前 pi adapter 的支持依据**。

---

## 9. 对「能否靠 public extension surface 可靠标识新普通用户消息驱动执行」的直接回答

**能不依赖 `agent_start` 做到「有一条 user 消息被消费并驱动执行」，但做不到「普通（人类）用户输入」这一限定。**

可用信号（按可靠性排序）：

1. **`message_start` 且 `message.role === "user"`** — 唯一在**消费时点**派发的信号。它覆盖 §4.3 的全部三种路径（新提交、steer 消费、followup 消费），且都发生在消息进入 context 之前（`agent-loop.ts:211-215`）。主 agent smoke 已验证其位置：后续 `turn_start` 之后、provider request 之前。
2. **`input` 事件**（`streamingBehavior === undefined`）标记「一个提交走空闲路径，将要启动运行」，但它**早于模型/凭据校验**（`:1985-2001`），可出现在最终 throw 的提交上；且 `source` 可为 `"extension"`。
3. **`agent_settled`** 标记「不会再有自动续跑」，配 `agent_before_settle` 用于回合收尾；不要用 `agent_end`（一次提交内多次）。

不能靠扩展面分辨的部分：

- **人类 vs 扩展注入**：`sendUserMessage` 走同一条 `prompt()`，产出同样的 `role:"user"` 消息与 `message_start`；消息上没有 origin（§5）。只能靠 `input` 的 `source` 旁证，或在 adapter 里拒绝把 `source:"extension"` 的提交计为用户回合 —— 但 `message_start` 本身不带该信息，需要跨事件关联（无 id，仅文本+时序）。
- **「仅排队」与「已消费」的区分**：入队本身不发任何扩展事件；只有 `input`（提交时刻）与轮询布尔。消费由 `message_start(user)` 暴露，且此时 `hasPendingMessages()` 已被扣减（`:1090-1108` 早于 `:1111`），无法事后得知该消息是从队列消费还是新提交 —— 同样需要靠 `input` 时序关联。
- **哪条 message_start 对应哪次提交**：无 id。文本内容可作弱关联（`_queueSteer` 存的就是文本），但重复文本会误配（`indexOf` 取首个，`agent-session.ts:1095`）。
- **被清除的队列项**：`clearQueue()`（`:2355-2363`，RPC `clear_queue`、abort 恢复编辑器路径）静默丢弃，不派发任何扩展事件 → 「入队但永不消费」在扩展面**不可观测**，只能靠 `hasPendingMessages()` 由 true 变 false 推断。

---

## 10. 不可见 / 不确定处（明确列出，不代偿）

- **`message_start` 一定先于 provider request 吗？** 源码上：`:211-216` 先发消息事件，`:219` 才 `prepareRequest`（`streamAssistantResponse` 紧随其后）。`streamAssistantResponse` 内部 `:420` 会为部分流发 `message_start(assistant)`。顺序成立，但**没有**扩展 handler 顺序与 provider request 的现成测试断言；主 agent smoke 只在 Agent core 层验证了请求内容含 B/C。
- **`handleRunFailure`（`agent.ts:532-548`）在 `runWithLifecycle` 抛错时发出 `message_start`/`message_end`/`turn_end`/`agent_end`，但不发 `agent_start`/`turn_start`。** 扩展若用 `turn_end` 计数会多记一次；此路径未被 smoke 覆盖，属 [INFERENCE]（源码可读，未见测试）。
- **`message_start` 对 `role:"custom"`**：`sendCustomMessage(triggerTurn=true)` 走 `_runAgentPrompt(appMessage)`（`:2269/:2272`），绕开 `prompt()`，因此**不发 `input`、不发 `before_agent_start`**，但 `runAgentLoop` 会为 custom 消息发 `message_start`/`message_end`（`agent-loop.ts:120-121`，role 为 `custom`）。已在源码确认；未跑链路 smoke。
- **`session_start`/branch/switch/tree 路径下的 `before_agent_start` 行为未展开调查**（本票不涉及）。
- **RPC `preflightResult` 不是扩展 API**：`PromptDisposition`（"handled"/"queued"/"started"）只在 `rpc-mode.ts:394-411` 内部使用；扩展拿不到等价的三态。
- **durable 的 submission 终态与 coding-agent 的映身关系未调查**（durable 非实际路径，本票不扩大）。
- 未修改 pi、未跑 pi 测试；结论来自源码阅读 + 主 agent 的 Agent core smoke（`.cache/pi-queue-smoke.ts`，artifact `artifact://110`），**未**验证扩展 handler 视角的事件序列（无隔离 smoke）。

---

## 11. 抽象影响（对决策票 03）

1. **Round 的开始不能锚在 `agent_start`。** coding-agent 层一次用户提交内 `agent_start` 多次（重试/压缩/续跑/结算窗口入队）。若 OMP adapter 仍用 `agent_start`↔`agent_end` 配对开合 Round，会把自动续跑误切成新 Round —— 与 Q3「自动续跑／重试不另开 Round」直接冲突。
2. **每个被消费的 user 消息才是 Round 边界，`message_start(role=user)` 是最接近的原生事实。** 它同时覆盖空闲提交与 streaming 期 steer/followUp 消费，符合 Q4「每条被接受用于驱动执行的普通用户消息开启新 Round，键盘输入、命令操作及仅排队消息不因此启动 Round」。
3. **整体执行静止优先观测 `agent_settled`，不是 `agent_end`；输入消费导致的 Round 切换另行处理。** `agent_settled` 是扩展面唯一的「不会再有自动续跑」信号（`types.ts:985`、`agent-session.ts:1055`），与官方文档 `docs/rpc.md:69` 一致。Q4 已替代 Q1 的普通文本澄清例外；专门批准可以在同一执行里等待 ctx.ui.confirm，不产生新 user 消息。ui_prompt_* 可用于识别所包裹的专门交互，但是否覆盖所有宿主交互未证明。不能把 agent_settled 当成每次排队输入消费的边界。
4. **「入队 vs 消费」必须分两个观测面。** 入队只有 `input`（提交时刻）与 `hasPendingMessages()` 布尔（无内容/无 id，且 `queue_update` 不给扩展）；消费只有 `message_start(user)`。二者之间没有 id 级关联，adapter 只能靠「文本 + 时序 + 同一 handler 上下文」做弱关联 —— 应当在能力声明里写成已知限制，而不是承诺逐消息身份。
5. **逐消息身份在 pi 侧不存在。** 消息无 id/origin；扩展只拿到对象引用（无法跨 `message_end` 的替换与持久化边界稳定使用）和 `TurnEndEvent.messageEntryId`。若要满足 02 票的「逐请求身份必须区分重复通知与实际重发」，需要 framework 自己发 id，或在 adapter 里以「事件序号 + 消息对象身份 + session entry id 事后补齐」合成，并明确 id 的生成者与生命周期。
6. **steer 与 followUp 可以映射成同一种 Round 事件。** 原生上是同一 `runLoop`、同一组事件，只差取用时机；framework 不需要为二者建不同 Round 语义，只需暴露（或忽略）交付时机差异。
7. **pi 的 `isIdle()` ≠ 等待输入。** 它在整段提交（含重试等待）内为 false；「等待用户」只能由 `agent_settled` + 无 pending 组合推断，批准等待则需 `ui_prompt_*` 且依赖扩展主动弹 UI。framework 的「活动状态」与「Round 是否结束」应据此**分离**建模，正如 Q4 已要求。
8. **durable 的 submission 模型是 framework 值得参考的形状**（id、显式终态 `done`/`unanswered`+`reason`、可等待结算），但本 HEAD 不可达，不能当既有支持能力写进契约。
