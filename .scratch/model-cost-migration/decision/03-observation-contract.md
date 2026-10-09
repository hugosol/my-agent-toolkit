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

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：逐请求身份必须区分重复通知与实际重发；请求归属绑定发起会话、Turn／Round、账户、模型与锚价。需要逐子代理身份、父子启动关系、orchestration 独立请求／汇总区别，以及 tree 位置到历史 Round 的关联。Owner 门控或 State follow 不得替代消费归属。
- 待决定：OMP 在选定基线能否暴露这些事实；取消、迟到、乱序、恢复重放、同一请求冲突 usage 的可信来源是什么？缺失事实怎样标记不完整，不能伪造身份或完整性。支持多个独立 main；同一 session 单执行者的事实／检测与 adapter 责任是什么？
- 价格与 token 观测供业务使用；计费／额度／无统计口径及 provider-specific 解析由 model-cost 拥有。公共 Round 不因迟到补账重新开启。

