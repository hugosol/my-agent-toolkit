# 05: 批量派发与故障恢复

**What to build:** 管理者显式派发多个 node，看到逐目标结果和已发生效果，并能区分派发核实、原执行恢复与新执行重试。通过 S1 交付。

**Delivers:** P10（派发与恢复动作分区）、P12、P14

**Test owner for:** P10 的派发／恢复动作 coverage。

**Blocked by:** 04：管理者现场查询与显式状态动作

**Status:** ready-for-agent

依据：[获批契约](../contract.md)及其继承的 spec。仅交付 toolkit，不修改后端、不新增自主重试或第二套状态机。

## Acceptance criteria

- [ ] 实现 dispatch、reconcile_dispatch、recover、retry 的实际 action 参数，逐 action 以独立字面样例验证效果／拒绝；额外身份或不适用字段不得产生意外接受的动作。
- [ ] 同一 dispatch 批次包含成功、拒绝和失败目标，保留真实启动的 Chat、失败阶段、effects 及可得执行关联；不要求后端未承诺的冗余字段，不把一个目标失败扩成整批未执行。
- [ ] reconcile_dispatch 覆盖 uncertain、not_created、created，不接受模型 Chat 引用或制造身份。
- [ ] recover／retry 分别覆盖 confirmed 真／假及核实依据，false 不提升为 true；保留恢复原执行与创建新执行的区别，不声称撤销旧副作用。
- [ ] 验证 retry 成功／失败和 paused 下拒绝，保留单项结果与已发生效果。
- [ ] 通过真实工具与后端事实、必要受控故障验证；运行所属分区、对应 dock 和 TypeScript typecheck，更新派发与恢复说明。

## Coverage ownership

P10 的完整分区表由 04 持有；本票拥有其中派发／恢复四个 action 与 confirmed／Chat 引用规则测试。P12、P14 全部检查归本票；通用非 2xx／200 部分提交呈现由 08 的 P23 检查，不重复宣称其完成。
