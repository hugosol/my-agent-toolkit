# 观察契约：正常路径收束的确认与证据

## 本轮确认来源

本会话继续讨论「framework 如何提供请求、响应、Turn／Round 与模型事实观测？」；以下为用户确认原话和精确范围，不是新生产实现。

- Q28：用户先确认「可以接受，应该说这就是异步保存需要达到的效果，写文件不应阻塞主线程，应该优先保证主线程的效率，持久化只是附加的操作」。问题的明确范围是：宿主先进入 idle、接受新输入；原生结束回调先返回，随后 framework 复查并派发公共 round_end，model-cost handler 在自身返回前等待保存，不增加全局输入屏障。同文件 FIFO 与存储原有等待／失败规则保持。用户提及多进程无法保证后，assistant 明确区分同机本地互斥与跨机器／所有故障的绝对保证；本轮没有授权撤销已批准的跨进程协调。
- Q29 未获批准。用户指出「这似乎和之前的原则不符……我们可能无法判断是不是round_end……你描述的实际上可能是很多种不同的场景……我怎么可能在设计阶段就预防所有这些边界问题呢？这似乎不是一个正常的设计流程」。assistant 撤回 Q29；不将静默退役、不补发、截断保存或新结束原因枚举写成批准政策。
- 用户明确改定收束方式：「我们只需要给出一些基本的原则，然后允许一些极端情况下会出错，我们只需要确保happy flow功能正常就可以了」。assistant 明确正常链路和三项完成条件：完整正常数据流（含正常子代理）、小而明确的必要事实／交付契约、关键宿主事实与时序可行性证据；不穷举极端边界，不撤销正常去重、账户隔离或已定文件协调。用户回复「可以，请按这个方向收束」。

## 本轮实际正常链路探针

运行命令：`bun .scratch-normal-round-probe.ts`；exit code 0。固定 OMP 18.5.0 exact install，真实 RPC CLI／原生扩展回调，Harness dock 隔离 agent state、session 与工作目录；本地 OpenAI-compatible capture endpoint，不访问正式凭据或远端 provider。探针和临时运行目录已清理。

| 场景 | HTTP 请求数 | 两次 prompt 的结果 | 最终文件 |
| --- | --- | --- | --- |
| 普通回复后再输入 | 2 | completed / completed | round=2 |
| 第一轮工具执行后回复，再输入 | 3 | completed / completed | round=2 |

两次运行各有两轮，实际 trace 均为：

```text
native_start(1, idle=false)
native_end(1, idle=false, pending=false)
native_callback_return(1)
recheck(1, current=true, idle=true, pending=false)
public_end_begin(1)
save_queued(1)
save_begin(1)
native_start(2, idle=false)
native_end(2, idle=false, pending=false)
native_callback_return(2)
recheck(2, current=true, idle=true, pending=false)
public_end_begin(2)
save_queued(2)
save_finish(1)
handler_return(1)
save_begin(2)
save_finish(2)
handler_return(2)
```

驱动断言：回调返回早于复查；复查取得 idle；第一轮保存尚未完成时第二次 prompt 正常完成且第二次保存已提交；第二次 save_begin 在第一次 save_finish 后；每个 handler_return 在自身 save_finish 后；最终文件为第二轮；进程正常退出。

## 证据限制

- 公共结束派发、活动代际检查和 FIFO 是一次性探针里的最小模拟，不是当前生产 framework 的实现；事实提取／公共判断的分层在这个探针中未以独立 module 接口实现。
- 为可观察地拉长第一项保存，在实际异步 writeFile 前设置本地 HTTP gate；它证明异步任务等待不阻止第二轮，不是磁盘延迟测量。实际文件写入使用异步 writeFile；没有证明完整安全读改写／rename／跨进程锁。
- 诊断 trace 使用同步 stderr 输出；不据此声称主线程零延迟或已取得性能收益。handler 尚未完成时主动停止宿主的可靠性未验证，不能从正常等完后的退出推导出来。
- 新探针只验证正常结束／工具后续／新输入与模拟保存衔接，不证明真实消费金额、模型计价、非零子代理聚合、完整 Codex transport、恢复、混账户、多 main、旧实例竞态、TUI 或自动关机。
- 非零 usage 与 HTTP headers 的正常源事实见[请求／响应探针](omp-request-observation-smoke.md)；主／子／兄弟／孙与父自动续跑源事实见[子代理调查](omp-subagent-round-findings.md)。该旧资产中的父 Round 分配建议已被数据 Lighthouse 的 Session-only 修订替代，不作为当前契约。
