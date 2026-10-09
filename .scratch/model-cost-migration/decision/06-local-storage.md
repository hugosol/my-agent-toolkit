# framework 如何提供独立存储、原子更新与跨进程协调？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 02, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

新统计允许从空开始；确定新存储根目录、扩展／账户／provider namespace 与路径配置，且不删除或改写旧 ~/.omp/cost-archive。哪些通用文件能力进入 framework，哪些 JSON schema、合并／归档及 estimate 采纳规则留在 model-cost？

确定读缓存新鲜度、锁内重读／update、原子发布、跨进程锁、等待／取消／错误与损坏不覆盖契约，并讨论平台条件。旧 OMP native file-lock 不能作为 harness-independent implementation 偷渡进共享代码。DailyTracker 与 quota estimate 的完整业务能力仍需保留；从空起步不等于取消后续持久化、恢复或并发安全。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 的 Q10 确认现有累计与归档作为需求基线：本票承接累计周期、按 session 分段的数据模型、归档内容／周期切换、holiday 保存及 clear 对存储的作用边界。最新余额／窗口读数只存内存，不取消累计与 quota estimate 持久化。任何业务删改均需说明差异、理由并由用户确认，不得以实现取舍默删。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：消费记录关联请求、实际会话、Turn／Round、账户、模型、请求锚价与父子启动关系；逐请求幂等、可靠缺失信息补齐原记录、保留冲突证据。支持同进程及跨进程多独立会话，账户累计不得丢失、重复或覆盖其他会话贡献。汇总视图不是第二笔消费。
- 待决定：事实记录／索引／派生累计如何组织与原子更新，崩溃后如何可靠恢复未入账记录，历史 Round／Session 与 tree／fork 如何查询而不重计；损坏、重复写、补齐与取消如何协调？不能用恢复时当前价格重算历史。
- 未知／额度消费／无统计口径对金额贡献零但保留性质；指标完整性独立。最新余额／窗口读数仍只存内存；estimate 基线与采纳值按账户持久化，同源成对样本不可跨来源拼接。
- 待决定：账户累计周期、clear／归档与迟到补账并发时的归属、原子性与不回滚历史消费关系；同一 session 单执行者的协调与退出恢复由何种通用能力承接？不在本交接决定锁或文件格式。

