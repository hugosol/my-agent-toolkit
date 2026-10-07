# 用什么证据证明迁移等价且框架边界成立

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: open
Blocked by: 03, 04, 05

## Question

前述设计确定后，需要哪些消费者可见的场景和运行证据，才能认定 connect-bot 迁移及新增框架能力满足本次 OMP 验收范围？

形成原行为到设计责任层及验收证据的映射，包含真实 OMP 加真实 omp-bot 的接入、状态变化、心跳、断开、切会话、失联及恢复操作；不能只凭 mock 或 loader 装载宣称端到端成功。区分确定性可自动验证的边界与需要现场观察的场景。覆盖多会话隔离、与 codebase-tools 共存、框架原有行为不回退、新旧装载互斥和配置切换，明确源版本及运行时基线的记录要求。只定义验收标准，不执行迁移或在本票据中补做未决定的接口设计。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。
