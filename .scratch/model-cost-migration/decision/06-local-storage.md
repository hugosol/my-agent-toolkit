# framework 如何提供独立存储、原子更新与跨进程协调？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 02
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

新统计允许从空开始；确定新存储根目录、扩展／账户／provider namespace 与路径配置，且不删除或改写旧 ~/.omp/cost-archive。哪些通用文件能力进入 framework，哪些 JSON schema、合并／归档及 estimate 采纳规则留在 model-cost？

确定读缓存新鲜度、锁内重读／update、原子发布、跨进程锁、等待／取消／错误与损坏不覆盖契约，并讨论平台条件。旧 OMP native file-lock 不能作为 harness-independent implementation 偷渡进共享代码。DailyTracker 与 quota estimate 的完整业务能力仍需保留；从空起步不等于取消后续持久化、恢复或并发安全。
