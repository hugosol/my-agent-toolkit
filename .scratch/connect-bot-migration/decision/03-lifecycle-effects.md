# 生命周期映射与持续上报由哪一层负责

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: open
Blocked by: 02

## Question

工作状态事件、心跳、有界上报队列与资源释放中，哪些属于框架语义钩子或持续任务契约，哪些是 connect-bot 业务，哪些需要扩展内的 OMP 专属集成？

明确开始工作、正常轮次结束、继续执行与异常终态的语义边界，以及会话身份变化、同身份事件、停止接入和退出的处理。区分停止本地资源与远端注销，保留由面板过期处理退出的业务要求。决定失败计数、顺序、超时和迟到结果影响哪些会话/接入周期；框架若承诺生命周期语义，由框架适配层承担映射，不能在扩展中重复实现同一契约。OMP 专属能力须明确标注，不推断 pi 等价。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

---

## 承接约束（来源：[01 lighthouse](../lighthouse/01-behavior-baseline.md)）

- keepAlive（在线/离线）由**面板**按心跳过期派生（本机 `omp-bot` 的 `ONLINE_WINDOW = 30s`）；扩展侧**不得**实现 30s 或任何过期判定逻辑，只负责心跳间隔（10s）为面板窗口留足余量。原实现刻意不 hook `session_shutdown`，退出/崩溃后的离线可见性完全交给面板——本票不得把它改成扩展侧职责。
- （来源：[02 lighthouse](../lighthouse/02-command-state-ownership.md)）**持续效果只对 owner 会话启动**：`enabled` 不继承到子代理（框架 State 继承开关默认不继承），子代理不得注册、上报、发心跳或显示 owner 的 marker；自动 disarm / session-switch 改变 `enabled` 时，效果与 marker 必须随之停止/清除。
