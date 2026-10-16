# pi Round 边界：本轮事实核查与验证限制

本文件只存证据与限制；批准策略唯一位于 [Round Lighthouse](../lighthouse/08-pi-round-boundaries.md)。来源为本票会话的两个只读调查（`FrameworkRoundFacts`、`PiRoundFacts`）及主会话后续直接核查。未执行生产迁移、宿主安装或付费模型调用。

## 1. 固定来源与版本核对

- pi 参考源码：`E:/Developer/myhub/pi`。既有检出标识 `4a5d37291531ad48b8e536c892557877d219463c`；`v1.2.0` 发布提交记录为 `06a466935536f8c9bcacb2d5efc0fc021be1bdff`。本轮对工作树相对 `v1.2.0` 的下列路径执行真实 diff：

  ```text
  git diff --exit-code v1.2.0 -- packages/coding-agent/src/core/agent-session.ts packages/coding-agent/src/core/extensions/types.ts packages/agent/src/agent.ts packages/agent/src/agent-loop.ts
  ```

  exit 1：唯一文件差异为 `agent-session.ts` 的工具 loadout 恢复注释、调用及 `_restoreToolsFromTranscript`；本轮依赖的 `_startRun`、`_emitAgentSettled`、原生队列/循环及事件类型没有 diff。发布版与工作树行号不能混用，下面引用工作树行号。不宣称整个检出等于发布工件。
- nicobailon 参考源码：`E:/Developer/myhub/wt/_cand/git-nicobailon`；既有记录的 v0.78.0 对应提交 `a4c8ced69a8176cdf4179b127feddc8875e3418f`。本地没有可用的 `v0.78.0` tag 名（第一次 diff exit 128），改用已记录提交执行：

  ```text
  git diff --exit-code a4c8ced69a8176cdf4179b127feddc8875e3418f -- docs/extension-api.md docs/observability.md src/extension/index.ts src/shared/parent-wake.ts src/runs/background/notify.ts src/integrations/pi-web-session-liveness.ts package.json
  ```

  exit 0、无差异。这里只确认所列证据文件，不重认证 npm 发布工件或全部第三方兼容性。

## 2. framework 与 OMP 现状

- [Round 输入契约](../../../framework/core/protocol.ts#L438-L483)：`activity_started`、`settled{willContinue}`；adapter 提供延后查询 `quiescent()`；只有 true 才确认静止，undefined 不等于没有工作。
- [Round 合成](../../../framework/behaviors/round-events.ts#L127-L201)：已有轮中的原生开始不会再开轮；结束候选在一次 next-task 重检时确认；不是定时轮询。
- [身份簿记](../../../framework/behaviors/round-events.ts#L59-L87) 有开始替代旧身份的截断逻辑，但不能据此断言当前普通合成会在任何新的原生开始时截断；正常继续的开始会被合并。恢复/重载与缺失边界应按公共语义核对。
- [OMP adapter](../../../framework/adapters/omp/round.ts#L28-L64)：`agent_start` / `agent_end.willContinue`；静止条件为 idle、无消息、无 running async job，没有显式取消/失败豁免。
- [pi adapter](../../../framework/adapters/pi.ts#L199-L203)：已提供 next-task 调度，但 `onRound` 仍 unsupported。本决定不是当前能力已实现。
- model-cost 在 [runtime](../../../extensions/model-cost/shared-logic/runtime.ts#L391-L408) 消费公共 Round，在 [accounting](../../../extensions/model-cost/shared-logic/request-accounting.ts#L1060-L1096) 建立边界及有新增消费时保存；父完成通知不能证明子侧已经提交。公开终止语义与现有 OMP/普通合成差异须由完整迁移方案核对。

## 3. pi 原生边界

以下路径以 `E:/Developer/myhub/pi/` 为根：

| 事实 | 源码锚点 | 使用限制 |
| --- | --- | --- |
| `_startRun` 的原生循环 | `packages/coding-agent/src/core/agent-session.ts:1837-1883` | `agent.prompt()` 后可反复 `agent.continue()`，不是一对低层事件即一轮 |
| post-run 继续判据 | 同文件 `1943-1977` | 重试、压缩与底层排队继续在最终结算之前处理 |
| before-settle 仍可继续 | 同文件 `1983-2010` | `outcome` 不是独立充分结束证据，handler/队列仍可能让它继续 |
| 最终结算 | 同文件 `1079-1101` | 先撤销 active 再发 `agent_settled{aborted}`，然后执行 deferred actions；callback 内 idle 不能单独决定 Round |
| idle | 同文件 `1463-1471` | 只覆盖 pi 自身活动/压缩，不是第三方后台工作快照 |
| pending | 同文件 `2442-2445`，`packages/agent/src/agent.ts:299-327` | 会话 pending 计数与底层队列不是所有路径都同源，不能用一次 pending=false 替代最终结算 |
| 原生结局 | `agent-session.ts:850-875,1989`；`extensions/types.ts:1015-1036` | `agent_before_settle.outcome` 是 completed/aborted/error；`agent_settled` 只有 aborted，需保持本次活动对应关系，不解析 provider 文案 |
| 请求前上下文 | `extensions/types.ts:885-888` | 存在 `context` 不等于已证明最终请求读到通知；本票不采用逐请求阅读证明 |

本轮没有运行真实 pi 会话；既有 [真实验证](07-runtime-validation/report-live.md) 提供原生事件/idle/pending/取消的有限场景证据，不证明新 Round 集成通过。

## 4. nicobailon 公开协议与现有接线

以下路径以 `E:/Developer/myhub/wt/_cand/git-nicobailon/` 为根：

- `docs/extension-api.md:595-623`：明确的 Host session lifetime and completion wakes 公开约定。版本化 `Symbol.for("@agegr/pi-web/session-liveness/v1")` 协议报告后台工作、未投递结果、通知/唤醒待启动；未来 schedules、终态历史、wait subscriptions 本身不保活。
- `src/integrations/pi-web-session-liveness.ts:4-17,57-74`：版本 1 注册接口，provider 带 name/sessionId/可选 sessionFile 及 `isActive(): boolean`，返回释放函数。它是公开文档描述的 host 集成协议，不是通过包私有导入获得任意内部 state 的授权。
- `src/extension/index.ts:1111-1133`：session_start 注册，活动查询组合 `owedResultRunIds`、`hasLiveSubagentWork`、`completionNotifier.hasPendingDelivery()` 与 `parentWake.isPending()`；未注册的适用范围必须与正常 false 区分。
- 同文件 `350-370,473-504`：已有结果投递前持有/投递后释放接线，说明不必由 framework 重建逐结果阶段。
- `docs/extension-api.md:601-609` 与 `src/runs/background/notify.ts:630-679`：通知有结构化 `details.runs`，但本票已放弃逐通知/逐请求阅读追踪；不需解析文本。
- `docs/observability.md:266-283,313-335`：批处理会延后投递；send accepted 不等于模型已读；in-process 事件不能泛化为跨进程总线。状态变化的通知本身不是最终生命周期权威。
- `src/shared/parent-wake.ts:17-34,57-89`：空闲完成通知先追加，再发送 user wake；追加路径没有对应 extension message_start。现有 wake reservation 在空闲且超过 10 秒时不再 pending；这是保活政策，不是我们的新超时器。
- `src/extension/index.ts:732-739`：UI 且原生 signal aborted 时 `userAborted()`；`parent-wake.ts:62-65,83-90`：held 期间只追加，下一次 agentStarted 解除 hold。不能外推所有 headless/RPC 取消路径都阻止自动唤醒。

公开协议存在不证明 toolkit 已实现 registry 或已在根、前台、后台、嵌套各适用接入中获得注册。真实装配、身份、释放/重载、原生事件与框架事件的对应，仍须后续验收。

## 5. 本轮真实执行的窄范围 smoke

主会话通过 Python subprocess 调用实际 Node：

```text
node --experimental-strip-types --input-type=module -e <内存脚本>
```

脚本直接导入实际 `src/shared/parent-wake.ts` 的 `createParentWake`，注入可控时钟、idle 查询及记录发送的宿主回调；未替换模块实现。先空闲发送完成消息，推进时钟到 10001ms，再调用 agentStarted/userAborted、追加晚到结果并观察下一次 agentStarted。脚本在内存执行，无临时源码或安装残留。

实际结果：exit 0，stdout：

```text
PASS idle completion reserves one wake
PASS provider idle wake reservation expires after its existing deadline
PASS held cancellation appends result without starting a wake
PASS next observed activity releases cancellation hold
SCOPE real parent-wake module, injected clock and host callbacks; not pi or framework integration
```

这是提供方模块行为 smoke，宿主调用为注入回调，不是原生 UI/RPC、公开 registry 注册、pi/framework Round、终态失败或 model-cost 保存的端到端证明。未执行仓库测试/构建/格式化，未调用模型；正式验收仍按 Lighthouse 清单执行。
