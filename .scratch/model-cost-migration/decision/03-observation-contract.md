# framework 如何提供请求、响应、Turn／Round 与模型事实观测？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 02
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

设计 framework 拥有且由 OMP adapter 映射的观测契约：请求开始时刻与身份、HTTP 响应 headers/metadata、assistant 完成的 token usage、响应计费事实、工具执行、Round 边缘分别何时派发、如何关联？模型／provider／catalog cost、实际 Effort、上下文 tokens、会话累计／orchestration 统计与会话身份以什么小接口提供？

确定顺序、异常／中止／无 usage、模型在 Round 内切换、每请求价格锚定及不可用观测的含义。不把原生 payload 整体透传，也不让 provider-specific Codex header parser 进入语义 core。审查已有 requiredSemantics、owner 门控、生命周期与异步 handler 支持是否适用；缺失能力不得伪造成功。按选定基线核对原生映射并要求实际链路证据。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 修订公共术语：Turn 是一次 LLM Request 与对应 Assistant response，不含工具执行；不再将 Run 作为公共单元／状态。framework 统一 Round 与代理活动状态，model-cost 逐响应 usage 入账、按统一 Round 聚合，不等待或依赖原生 agent_end 才计费。本票重审旧 Question 中的 Run 结算／run 内切换，改用新术语设计；明确 Idle 与等待输入的差别、connect-bot 公共生命周期语义与面板协议的边界，并验证自动续跑、工具、异步任务、异常／中止的真实 Round 结束条件。不在本票执行消费者迁移。

