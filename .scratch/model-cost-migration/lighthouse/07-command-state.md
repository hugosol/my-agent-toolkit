# /budget 的参数、操作与状态如何在新框架表达？：Lighthouse

> Question and discussion: [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)
>
> 部分发布（2026-10-11）：仅 clear 执行条件已确认，命令票仍 open、未认领。来源为[观察票本轮暂停交接](../decision/03-observation-contract.md)：用户原话“Q14 同意round中调用就拒绝的方案，更简单”。不代表命令或活动判定已实现。

## Question

clear 在当前入口工作中是否拒绝、是否需要延后排队？其余命令语法、账户选择、反馈及通用 action interface 不由此确认。

## Discussion

### clear 执行条件

本入口 Round 中调用 clear 就拒绝，不记录 pending clear，不排队、不在未来 round_end 自动执行。当前 Round 结束且保存处理收口后，用户可执行 clear；已经空闲的入口不必等待未来出现一个 round_end。选择理由是用户要求更简单、避免半轮清零和延后状态管理。

这一限制只针对当前入口，不保证同账户其他会话／进程都空闲，不新增全局活动登记或等待全部会话结束。账户范围、只归档已保存值、先归档再重置／关闭 holiday、失败不自动补做等仍由[数据决议](12-state-data-contract.md)与[存储决议](06-local-storage.md)持有；周期校验与跨进程旧提交拒绝不取消。

“开放 Round 内立即 clear 并重设零基线”未批准；“工作中申请，结束时自动执行”不采用。活动未知／初始化失败时能否执行、保存失败后的具体命令反馈仍需在命令票核对，不能把本条扩大成未知即空闲或所有进程已安全保存。

## Decision

clear 采用当前入口 Round 中拒绝、结束并保存收口后可执行的简单条件，不引入延后队列。仅此部分已确认，命令票未完成。

## User stories

1. As a 用户, I want Round 中 clear 被直接拒绝, so that 不需要半轮重置或待执行清理状态。
2. As a 用户, I want 空闲时可以明确执行 clear, so that 不必再触发一轮模型执行才能清零。

## Preconditions

- framework 提供当前入口可靠 Round／活动事实与保存收口位置，原生映射仍由观察票决定，不可靠事实不默认空闲。
- 数据／存储决议提供账户周期和归档／重置操作，实际 framework 文件能力仍待实施。

## Postconditions

- 命令实现不建立 pending clear／自动延期任务；命令票继续决定语法、目标账户、拒绝／成功／失败反馈与能力入口。
- 装配／验收覆盖工作中拒绝及空闲执行，不把入口限制当跨进程全局静止证明。

## Invariants

- clear 不取消模型、不伪造 Round 结束，不清其他账户／estimate／已有归档／入口 detail。
- clear 的周期与安全文件更新沿既有存储 module，不另造跨进程活动登记或第二套协调机制。
