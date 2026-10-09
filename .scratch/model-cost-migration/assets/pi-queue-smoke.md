# pi 队列与原生循环：隔离 smoke 证据

事实资产，不是用户已批准的契约，也不宣称 pi adapter 已实现或验证。

## Revision 与执行范围

- 源码：`E:/Developer/myhub/pi`，HEAD `a276dabe57911253350bffb93cb7d7aff6a73261`；检查时工作树干净。
- 运行：Bun 1.4.2，直接 import 当前源码 `packages/agent/src/agent.ts` 的真实 `Agent` 和 `packages/ai/src/utils/event-stream.ts` 的真实 `AssistantMessageEventStream`。
- 命令：`bun E:/Developer/myhub/my-agent-toolkit/.cache/pi-queue-smoke.ts`，cwd 为 pi 源码目录。探针为一次性文件，运行后清理；不在 pi 仓库写入文件。
- 真实队列与循环执行，模型回答由确定性 StreamFn 提供；探针工具只返回本地文本。未访问网络、凭据、正式 agent 配置、持久化会话或 TUI。
- 这只证明 Agent core；[生产路径调查](pi-loop-findings.md)确认 coding-agent 使用此 Agent core，而不是实验 durable 路径。AgentSession 还会在低级 run 结束后执行重试／压缩／续跑；本 smoke 未覆盖该层。[扩展观测调查](pi-observation-findings.md)是源码证据，不能用本 smoke 代替完整宿主集成证明。

## 实际输出与断言

8 个场景均通过：`steer`／`followUp` × `one-at-a-time`／`all` × 有／无工具调用。

最终输出：

```text
PASS: 8 real Agent queue/loop scenarios; deterministic stream; no network, credentials, session persistence or TUI.
```

以 A 为首次 prompt，在首次请求的 StreamFn 中把 B、C 通过真实 Agent 入队。每个场景都断言入队后确有 pending messages、首次请求没有 B/C、最终队列清空且 isStreaming 为 false；整个场景恰好一个 agent_start 和一个 agent_end。

实际请求中的用户消息累计：

| 输入种类 | 队列模式 | 首响应有工具调用 | 请求依次包含的用户消息 |
|---|---|---|---|
| steer | one-at-a-time | 否 | A → A,B → A,B,C |
| steer | all | 否 | A → A,B,C |
| followUp | one-at-a-time | 否 | A → A,B → A,B,C |
| followUp | all | 否 | A → A,B,C |
| steer | one-at-a-time | 是 | A → A,B → A,B,C |
| steer | all | 是 | A → A,B,C |
| followUp | one-at-a-time | 是 | A → A → A,B → A,B,C |
| followUp | all | 是 | A → A → A,B,C |

无工具、one-at-a-time 的实际事件骨架（排除请求记录与入队探针日志）：

```text
agent_start
turn_start
message_start:user:A
message_end:user:A
message_start:assistant:answer-1
message_end:assistant:answer-1
turn_end
turn_start
message_start:user:B
message_end:user:B
message_start:assistant:answer-2
message_end:assistant:answer-2
turn_end
turn_start
message_start:user:C
message_end:user:C
message_start:assistant:answer-3
message_end:assistant:answer-3
turn_end
agent_end
```

`all` 模式中，B 和 C 的 message_start／message_end 均位于同一后续 turn_start 与同一次 request 之间。其消费没有独立 agent_start／agent_end。

有工具的场景中首个 assistant message_end 后确实执行 probe，并产生 tool_execution_start/end 与 toolResult 消息。steer 在此后的下一次模型请求中消费；followUp 则先完成一次仅含 A 的工具后续模型请求，再消费 B/C。

## 源码依据

- `packages/agent/src/agent.ts:230–254`：分别设置 steering／followUp 队列，默认 one-at-a-time。
- `packages/agent/src/agent.ts:299–306`：steer／followUp 只入队。
- `packages/agent/src/agent.ts:373–381`：运行中直接 prompt 被拒绝，要求 steer／followUp 或等待完成。
- `packages/agent/src/agent.ts:467–505`：循环回调 drain 真实队列。
- `packages/agent/src/agent-loop.ts:102–126`：首次 agent_start／turn_start 与输入消息派发。
- `packages/agent/src/agent-loop.ts:163–321`：内层处理工具与 steering，外层在自然停止点处理 followUp；消费消息派发后继续请求，最后才 agent_end。
- `packages/agent/src/agent-loop.ts:381–469`：assistant response 的实际 message_start/end 派发。

## 抽象影响（建议，待确认）

- 原生 agent_start/end 不是逐普通用户输入边界；原生 turn 也不是本 repo 的 Turn（模型请求／响应，不含工具执行）。
- 入队与消息真正参与后续请求必须分开观测。
- 一次请求可以消费多条普通用户消息，不能假定一消息对应一次独立执行或独立可分摊的 usage。按消息还是按输入批次划 Round，需要用户显式决定。
- Round 切换与整体等待用户状态独立；有队列时可以持续工作而切换统计轮次。
- 本 smoke 未验证 live steering、取消／重试、扩展 input 转换、durable session 或完整 OMP／pi 原生链路。
