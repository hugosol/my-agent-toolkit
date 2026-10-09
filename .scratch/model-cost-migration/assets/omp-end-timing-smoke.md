# OMP 扩展结束通知时序探针

## 范围

2026-10-09，使用 repo Harness dock 的固定 OMP 18.5.0 隔离安装、临时 agent state 与 session 目录，显式加载本地 provider fixture 和一次性观察扩展。真实 RPC CLI、AgentSession、扩展回调、模型协议序列化；模型回复由本地 capture endpoint 提供，不访问远端模型或正式凭据。没有修改宿主或生产代码。

观察扩展在 agent_start／agent_end 回调采样 ctx.isIdle()、ctx.hasPendingMessages()、event.willContinue，并在 agent_end 后下一个任务及 25ms 后再次采样。延迟只是探针取样位置，不是批准的生产延迟算法。

## 实际输出

普通响应：prompt_result.status=completed，sessionSettled=true，捕获 1 次请求，stderr 为空。

| 位置 | willContinue | idle | pending |
| --- | --- | --- | --- |
| agent_start 回调 | 未提供 | false | false |
| agent_end 回调 | 未提供 | false | false |
| 下一个任务 | 未提供 | true | false |
| 25ms 后 | 未提供 | true | false |

工具续跑：本地 provider 首次返回 bash 工具调用 `echo wayfinder-safe-probe`，随后返回普通响应。prompt_result.status=completed，sessionSettled=true，捕获 2 次请求，stderr 为空；agent_start／agent_end 各一次，采样结果与上表相同。

## 结论与限制

- 两条真实扩展链路都证明：正常最终 agent_end 回调时 ctx.isIdle() 仍可能为 false；只在回调内检查一次、false 就丢弃，会漏掉终轮。
- 本次没有触发自动重试、后台唤醒、取消、尾部排队消息、切换、并发或恢复，不声称已验证这些路径。
- 下一个任务读到 idle 不证明所有路径都适用固定延迟；生产 adapter 需要最终重新核验事实，避免旧检查关闭新的活动。具体调度机制尚未批准。
- 固定基线源码：agent-session.ts:4682–4713 发扩展通知；3012–3048 延迟 RPC agent_end 而不是同样延迟扩展通知；5752–5754 的 isStreaming 包含 promptInFlightCount。
- 队列限制的源码证据：8570–8579 的 queuedMessageCount 包含 displayable steering／follow-up／pendingNextTurnMessages，并非完整自动续跑判据；1353–1376 在 RPC 最终结束派发时额外复查尾部 queue／IRC。9067–9152 的 abort 路径处理并保留部分队列；尚未实测，不能将任何 pending 消息一律解释为会自动继续。

临时观察扩展与驱动脚本及每次 runRoot 均在调查后删除；此文件保留事实，不承载生产实现。
