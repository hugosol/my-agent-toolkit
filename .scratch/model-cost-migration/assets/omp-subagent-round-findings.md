# OMP 子代理 Round 信号与归属调查

## 验证环境与边界

2026-10-09，固定 OMP 18.5.0 的隔离 exact install，repo Harness dock 真实 RPC CLI、AgentSession、内置 task 与 yield 工具及扩展回调。每场景独立临时 agent state、session 和 capture endpoint；显式加载 credential-free provider fixture 与一次性观察扩展。模型回复由本地 OpenAI-compatible endpoint 确定性提供，不访问远端模型或正式凭据，不改生产实现或宿主配置。

只证明观测事实与关系可取得，不证明新的 framework 观察接口、轮次状态机、消费存储已实现。fixture 的 usage 均为 0；不以本探针声称真实模型账单或非零费用正确。

## 成功运行的四个常见场景

| 场景 | 实际会话文件 | 捕获模型请求 | 观测结果 |
| --- | --- | --- | --- |
| 单个阻塞委派，子代理正常 yield | 主 + 子，共 2 | 3 | 主、子各自独立 agent_start/end；子先结束，主继续响应后结束 |
| 并发兄弟子代理，正常 yield | 主 + 2 子，共 3 | 4 | 两子活动时间重叠，各自 start/end，彼此及父事件不混淆 |
| 嵌套孙代理，正常 yield | 主 + 子 + 孙，共 3 | 5 | Main → wf-child → wf-child.wf-grand；parentId 为直接父代理，孙不直接归 Main 身份 |
| 后台委派，结果自动投递 | 主 + 子，共 2 | 5 | 父 start → 父 end(willContinue=true) → 子 yield/end → 父 start → 父 end(未提供 willContinue，idle=true)；父续跑没有新用户消息 |

前三场景 prompt_result 为 completed、sessionSettled=true。后台场景初始 prompt_result 为 completed、sessionSettled=false；随后实际观察到子结束与父自动续跑的最终 end。所有成功场景 stderr 为空。会话文件数量有运行断言，身份／边缘及归属从真实 session JSONL 输出读取。

后台子代理执行的延迟工具是 `bun -e "await Bun.sleep(1000)"`，仅使自动回传时序可观察，不访问外部资源。阻塞场景通过临时 overlay 设置 async.enabled=false；后台场景设 true；批量调用 task.batch=true，并提供必需 context。

## 可用身份与父轮绑定事实

- 每个事件回调有 ctx.sessionManager.getSessionId()；不同实际会话具有不同 sessionId，即便它们共有同一 Owner。
- ctx.agent 包含 kind、id、depth、parentId。实际嵌套链为 Main（main, depth=0）→ wf-child（sub, depth=1, parentId=Main）→ wf-child.wf-grand（sub, depth=2, parentId=wf-child）。不根据字符串点号推断父子关系。
- before_subagent_spawn 在父会话派发。本次 task 场景 spawnKey 等于实际子 agent id，包括嵌套 id。该字段在原生类型中可选；不是所有路径均已认证。
- 额外运行单子代理扩展 EventBus 观察：`task:subagent:lifecycle` 实际发出 started／completed，含 child id、parentToolCallId、detached、sessionFile、index。父 tool_execution_start 的 toolCallId=call_dock_1 与 lifecycle.parentToolCallId 相等，可从父调用记录固定其启动 Round，不必在结果到达时猜当前父 Round。
- 同一探针子代理自己的 yield 也使用 toolCallId=call_dock_1，证明工具调用 id 不能跨会话裸用；关联至少需要实际会话上下文。
- 固定基线源码支持这条关系：sdk.ts:3219–3235 为每个 ExtensionRunner 绑定本会话 agent 身份；task/index.ts:1642–1645 提供 identity、index、parentToolCallId；task/structured-subagent.ts:515–538 生成 spawnKey；task/executor.ts:4300–4312 与 2742–2754 派发 task 生命周期。

## 表格规则的应用条件

1. Round 开闭与已知续跑标志按实际会话独立保存，不按 Owner 共用。子代理 start/end 不切开或关闭父 Round；兄弟也不互相影响。
2. 父代理自己的 willContinue=true 与后续 start 保持其原 Round；不因为任意子代理结束就认定父已等待输入。
3. 启动时固定父工具调用到父 Round 的关联，再绑定子身份；迟到消费补启动它的历史父 Round，即使父后来已结束、截断或进入新轮。不把每个子消息按到达时的当前父轮重新归属。
4. 孙消费沿直接父链聚合，不将父任务汇总与逐子响应再各算一遍；具体入账身份仍由请求观察契约决定。
5. 原生 task lifecycle 的 completed 是委派任务结果，不等于任一代理的模型请求消费，也不直接等于父 Round end。

这些是既有消费归属决议的实现约束，不新增业务统计范围。

## 现有 framework 缺口

- framework/adapters/omp.ts:755–786 仍采用 binding 内 roundOpen 和旧无条件 start 去重；未实现本票已确认的新漏 end 补救表。
- framework/behaviors/round-events.ts:37–57 的 dispatchRoundEvent 对 owner.kind !== owner 直接返回，因此当前公共订阅丢弃子代理边缘。model-cost 的逐代理观察不能沿用该 blanket owner gate；connect-bot 的 owner-scoped 面板效果仍应保留隔离，不通过子边缘改变父面板状态。
- 原生直接扩展链证明子代理也发 agent_start/end、message_end usage；不证明当前 framework 已提供全部这些事实。sessionId、parent relation 与启动关联须进入未来观察契约。
- 子代理的普通最终 agent_end 回调同样可读到 idle=false，仍有结束候选后续核验的问题。

## 非正常报告的附加观察

另一个单子代理探针故意仅返回普通文本、不调用 yield：实际子 session 内出现 4 对 start/end，每次扩展 end 均未带 willContinue；父 session 仍只有一对 start/end。源码 task/executor.ts:2215–2488 的 driveSessionToYield 在 AgentSession 之外发起最多三次 yield 提醒。不能假定所有子任务内部的继续都有 willContinue，也不能把一次委派任务等同于唯一子 Round。按已批准的简化策略，子自身可以分成多个信号轮；它们的消费仍固定归同一次父启动 Round。

## 未验证范围与探针修正

- 未运行 eval agent()、workpool、/tan、会话恢复／重载、子代理被取消、同会话并发执行、多 main 并发、缺失 start/end 注入或父结束后脱离后台子任务迟到补账。
- 初次批量探针漏了 task 的必需 context，未创建任何子代理；那些输出不算成功的子代理证据。修正 context 后才得到上述真实子会话。一次工具 cell 超时中断也不计入成功证据。
- 单／并发／嵌套成功 probe 不等待完整模型服务，模型是确定性 fixture；不宣称真实服务的重试／计费精度。
- 成功 runRoot 在 finally 中清理；一次性观察扩展和驱动脚本调查后删除。保留本事实资产作为决策依据。
