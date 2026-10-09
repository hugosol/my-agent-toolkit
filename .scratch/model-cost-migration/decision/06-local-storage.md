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

