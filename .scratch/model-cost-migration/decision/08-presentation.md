# 动态 widget 如何分层，无 UI 时哪些业务仍需更新？

Type: grilling
Status: resolved
Assignee:
Blocked by: 01, 03, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

Lighthouse: [widget 展示与子代理视图决议](../lighthouse/08-presentation.md)

## Handoff

- 用户 Q33 已确认展示 scope 收口；本票仅完成规划，生产前端／后端、原生接线与验收未实施。当前结果唯一权威：[widget 展示与子代理视图](../lighthouse/08-presentation.md)。本轮 Lighthouse 发布与 Backtracer 已完成，状态 resolved、claim 已清理。
- 本轮确认与否决／替代理由：[展示访谈确认来源](../assets/presentation-confirmation-2026-10-12.md)。原 legacy Handoff 的完整问题、unique reasons 与历史证据：[发布前原文](../assets/presentation-before-publication-2026-10-12.md)。旧“保存最近 Round／clear 仍未定”等 resume 点已过时，恢复按当前权威，不从旧交接推翻新结果。
- 跨票结果：[装配局部权威](../lighthouse/10-assembly-layout.md)（用户以 10-assembly-layout.md 确认职责层与当前查看能力）、[模型计价局部权威](../lighthouse/13-model-catalog-policy.md)（以 13-model-catalog-policy.md 确认比例表来源）。两票未认领、仍 open，其他问题及票体不因部分发布修改。
- 剩余工作归属：装配票核验 OMP 原生查看出口／切换、Session 事实与有效 marker、实例／公共接口／消费后端接线；模型票决定具体权重名单、资料缺失／更新；刷新票决定无 UI 远端调度及 TTL／生命周期；验收票决定具体 TUI／RPC／Hub 证明与支持版本。本票不在无 UI 记账确认之外批准网络策略，也不自动升级 18.5.0。
- 下一 ready 问题：本票没有待问展示政策；追溯完成后按 tracker 查询下一 frontier，不开始第二张非 research 票。若装配证据证明正常子 Round 必须加复杂机制，交用户局部重审，不静默取消或扩建。
- 证据限度：本轮仅实际运行比例数学和安装版 18.9.2 真实 focus 控制器＋fixture Session／UI；不是完整 TUI、原生新公共出口或支持基线验收。工作区控制器缺 natives 的失败记录保留，没有复制 native 构建产物。
- 发布追溯：本轮 Backtracer 已按 User stories／Invariants／依赖／peer symmetry／layer integrity 追溯展示及两项部分发布：逐 Session 事实与轻量 Round 由观察／数据／存储权威提供；公共查看、有效 marker、实例／native 接线与消费者迁移由装配票承接；比例表维护／catalog 缺失由模型票承接；无 UI 远端策略／TTL 由刷新票承接；TUI／Hub／headless／旧消费者回归及版本证明由验收票承接。没有新增无人承接的 gap 或未获用户裁决的政策冲突；开放 provider 不等于已满足／已实现，故不写空 trace report、不新增重复票、不同步目标票旧 Handoff。旧候选均已有确认替代链。

## Question

widget 的共享后端／宿主前端如何分工，如何保留旧视觉并替代 detail，Total／Round／代理树的字段范围与费用参考比例如何表达，Hub 子会话应切哪些事实与有效标记，无 UI 怎样保留记账／保存与错误可见？

完整远端刷新调度由[刷新票](09-refresh-lifecycle.md)继续决定；公共查看与模型资料的具体实现归相应票。本票结果记录在 Lighthouse，不在正文复制规则。

## Comments

本轮已批准旧 detail → 静态树、混范围字段、主树 Total 保持、子代理 brief 与轻量 Round。Q33 完整摘要获用户“同意”后进入 publication；候选与批准的区别、Q1–Q33 及 probe 事实仅链接确认资产，不粘贴日志。
