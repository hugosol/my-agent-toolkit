# 观察票本次暂停：确认来源与证据限制

## 确认来源

来源是本次观察票恢复讨论的当前对话；无稳定消息 URL，因此保留用户原话与提问范围。以下是确认溯源，不另立政策；规则分别在观察 Lighthouse 与原数据／存储 Lighthouse。

- Q16：用户“Q16 同意，usage默认正常response都会返回，不需要设计太复杂的机制”。确认无可靠来源证据、无法区分的全零 usage 按未知跳过，不为此增加复杂机制；不是认证全部 provider。
- 分层修订：用户“我们的原则是，能放在framework层的逻辑就不要放在adpater层”；随后“如果现有实现和我的原则矛盾，能否趁着这次变更重构逻辑的分层，尝试放到正确的位置。用test case确保旧的插件功能正常运作即可”；Q17 为“允许桥接，唯一的原则是，能放到framework层的，尝试尽量统一语义并放到framework层，为此可以牺牲一些边界情况的准确性”。不是立即生产实施授权，也未批准单在途槽。
- Q18：用户“同意，这个机制看起来很好，看起来能以一个清晰的心智模型描述清楚round结束的逻辑”。提案是：结束候选、下一任务一次复查、未静止保留候选待相关信号、新活动使旧检查失效、不持续轮询或超时猜结束。
- Q19：用户“如果你指的只是，我们用统一的round_end事件描述，不添加额外的异常结束状态，我可以确认，先按这个方向设计”；随后“我确认的只有公共结束通知的设计方向，但是不保证一定能实现，或实现的成本足够低，如果权衡各方成本发现这个方案不可行，我会调整设计”。确认范围仅公共通知方向，不批准异常原因枚举、无信号补发或销毁时静默退役方案。
- Q21：用户“同意，这时候的round描述了一个‘包含异常结束的turn的round’，虽然最后一个turn被打断，也没有usage信息，但依然属于这个round，与我们之前描述的‘用同一个round_end’似乎也不矛盾”。确认已完成 Turn 与最后取消 Turn 同属原 Round，不逐 Turn 切轮或事后补造 Round。
- Q22：用户“准确”。提案范围是：明确取消仍收口生命周期；有可靠 usage 保留，没有就跳过；首个 Turn 就取消且无 usage 时无消费增量，新 Round 新身份接续已有累计，不让旧 Round 从生命周期消失。
- Q23：用户“保留。这个从一开始设计我就有考虑过，session累计的是本session内发生的所有请求的累计值，自然包括不同分支衍生的累计值”。重申上下文树导航不撤销已发生消费，不新增分支消费账本。
- Q24 曾选择追加任务改父 Round 归属；Q25 曾确认“以请求开始为界”。这两项的父 Round 分配方案后来被 Q27 替代。实际会话／账户／模型／锚价在请求开始固定的旧原则仍有效。
- Q27 修订由用户先提出“假如我不再关心subagent归属于哪个round，只关心它们归属于哪个session，是否就能大幅简化问题，去掉很多边界情况的取舍”；提案为“Round 展示本实际会话自身的消费；子代理及含后代的汇总只提供 Session 口径，不作父 Round 消费分配”，用户答“Q27同意”。因此父 Round 筛选、启动父 Round／启动实例统计标签与消费分段要求取消；Q26 未回答且失去必要性，不视为已确认政策。
- 发布授权：用户“我想先暂停grilling，我们在这轮对话中有两个重大变更，我想先持久化记录下来”。

## 新运行证据：真实零与缺失 usage 对照

固定隔离安装 OMP 18.5.0 的 pi-ai openai-completions 实现，Bun 1.4.2，本地 loopback SSE endpoint；两次实际 HTTP 请求分别省略 usage、明确返回 prompt_tokens=0／completion_tokens=0／total_tokens=0，均返回文本 ok 和正常 stop。调用真实 streamOpenAICompletions，断言两份最终 usage 完全相同。

成功输出：

~~~json
{"version":"18.5.0","requests":2,"indistinguishableUsage":true,"results":[{"providerReportedUsage":false,"usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"stop"},{"providerReportedUsage":true,"usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"stop"}]}
~~~

两次早期 inline shell 调用因 quoting／batch 参数失败，未算作探针成功；临时文件方式运行成功，server 在 finally 关闭，一次性 .scratch-usage-probe.ts 已删除。没有修改生产实现、正式配置、凭据或统计数据。只证明该局部 provider 路径的最终 usage 无法区分这两个输入，不认证 Codex、所有 provider、实际账单或新 framework 接口。

## 已运行的旧行为测试基线

- bun test tests/framework/round.test.ts tests/framework/round-events.test.ts：21 pass、0 fail、38 expect() calls，2 files。
- bun test tests/connect-bot/state-machine.test.ts tests/connect-bot/session-switch.test.ts tests/connect-bot/native-session-boundary.test.ts：27 pass、0 fail、84 expect() calls，3 files。

只证明未重构的当前基线。没有新生命周期实现，不能把这些输出当作分层迁移已通过；未来还需真实宿主链路 smoke。

## 源码核对与既有证据

- 当前 framework/adapters/omp.ts 的 onRound 在 adapter 内管理 roundOpen，并在非 quiescent 时丢弃结束输入；quiescent 要求全部后台 running jobs 归零。当前 framework/core/protocol.ts 的 HarnessPort.onRound 接收过滤后的语义边缘，framework/behaviors/round-events.ts 又按 owner gate 派发。新分层不能只搬状态变量，需重新设计映射事实的输入 seam，并保留 owner-scoped 效果隔离。
- 固定 18.5.0 input-controller.ts：流式 ESC 调用 session.abort；agent-session.abort 调用 agent.abort 并等待 idle。原有[请求探针](omp-request-observation-smoke.md)实测 RPC abort 仍收到 aborted assistant message_end、但未取得 provider 终结 usage。不等于直接运行了键盘 ESC／新框架端到端路径。
- 固定 18.5.0 task/executor.ts 存在 runSubagentFollowUpTurn 与 keep-alive／revival；task-follow-up.md 提示可通过 write agent://ID 追加消息，隔离任务等情况不能续用。只读核对，未运行跨父 Round 追加任务场景；该父 Round 分配问题已被 Q27 取消，不作为未来必须完成的验证。
- [结束时序探针](omp-end-timing-smoke.md)证明正常 agent_end 回调尚可能非 idle，下一个任务变 idle；不是固定延迟适用于所有路径的证明。
- [子代理调查](omp-subagent-round-findings.md)保留主／子实际身份与正常原生链路的证据。其旧父 Round 分配建议不覆盖 Q27 修订。

## 尚未验证

新公共事实输入／Turn 关联、复查调度与旧检查隔离、直接 ESC 后立即重新输入、重载／恢复／tree／fork／多 main、缺失信号处置、混账户父子恢复、真实 Effort／catalog 单位、取消保存与 clear、真实 UI／远端账单。没有生产迁移或 pi adapter 认证。
