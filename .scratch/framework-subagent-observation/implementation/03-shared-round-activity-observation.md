# 03: 通过共同观察展示正确 Working/Idle

**What to build:** 操作者看到每个会话自己的 Working/Idle，活动状态由 framework 的共同 Round 语义决定，原生执行结束不再使仍有连续工作的会话提前 Idle。

**Delivers:** P10

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 自动继续、待处理输入、持有异步工作和真正静止分别有独立用例；仅满足共同结束条件时才转为 Idle。
- [ ] 创建子会话不等于开始工作，原生 settled 不直接等于 round_end；adapter 交付事实，framework 统一决定活动语义。
- [ ] 在共同消费 interface 和实际 detail 表面核对会话各自的状态，避免把当前查看会话或 Owner 状态套给其他会话。
- [ ] 观察活动不再次驱动 Turn/Round 计费生命周期；后续跨进程接线复用此含义而不复制判断规则。

## 契约与验收责任

依据 [已批准契约](../contract.md) 与 [规格](../spec.md)，遵循项目领域词汇、架构决议及测试分层。本票完整拥有 Delivers 所列 promises 的验收用例、测试编写和完成证据；后续票仍须回归受影响测试。验收预期取自契约、独立给定值或算例，不从被测实现重算。

完成时运行所属测试分区及受影响消费者；TypeScript 改动执行 typecheck，宿主接线改动须有对应真实宿主观察。保留命令、结果及相关证据，更新受影响文档。未执行、失败或环境缺失不计通过；不以替身替代契约要求的真实进程、宿主或视觉证据。
