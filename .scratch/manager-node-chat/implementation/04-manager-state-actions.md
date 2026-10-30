# 04: 管理者现场查询与显式状态动作

**What to build:** 实际 manager-chat 自动入口提供 run 的现场查询及显式交接、失败、暂停、恢复派发资格和结束动作。管理者看到后端当前事实，不由扩展附加自动流转。通过 S1 交付。

**Delivers:** P10（基础动作分区）、P11、P13

**Test owner for:** P10 的基础动作 coverage（完整分区见下表）。

**Blocked by:** 03：节点自动报告与结果区分（复用已落地的公共配置与请求处理）

**Status:** ready-for-agent

依据：[获批契约](../contract.md)及其继承的 spec。仅交付 toolkit，不修改后端、不新增自主重试或第二套状态机。

## Acceptance criteria

- [ ] 使用独立 manager-chat 声明、自动策略和 Session 资源，复用 03 的必要公共能力，不复制状态机或共享节点身份。
- [ ] 实现 status、complete、fail、pause、resume、finish 的实际协议参数；每个 action 使用独立字面样例检查接受／拒绝，额外身份或不适用参数不得导致意外接受的动作。
- [ ] 使用人工推导的小图检查 ready、blocked、canFinish、snapshot，以及依赖未满足、非法状态、终态和重复动作；保留首次说明与后端已有事实。
- [ ] complete 明确可交接并满足依赖；fail 不隐含终止；pause 只禁止新执行；resume 不派发；finish 遵守后端完成条件。
- [ ] 联合观察真实角色调用与后端事实，在明确有限窗口内无额外派发、终止或重试，不把有限观察扩张为无限保证。
- [ ] 通过实际工具验证并运行所属分区、对应 dock 和 TypeScript typecheck；更新这些动作的使用说明。测试前置执行可由隔离后端场景准备，不依赖尚未实现的派发工具。

## P10 coverage partition

| Coverage item | Ticket | Test owner |
| --- | --- | --- |
| status、complete、fail、pause、resume、finish：字面参数、实际效果／拒绝、额外身份与不适用字段 | 04 | 04 |
| dispatch、reconcile_dispatch、recover、retry：字面参数、实际效果／拒绝、额外身份与不适用字段 | 05 | 05 |
| confirmed=false 不提升为 true；reconcile_dispatch 不接受模型 Chat 引用 | 05 | 05 |

P10 仅在两个分区全部通过后完成；不另设重复全 action 测试。本票同时独占 P11、P13 的完整契约测试。
