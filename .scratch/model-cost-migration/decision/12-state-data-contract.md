# model-cost 的哪些数据进入 framework State，如何声明与读取？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 02, 03
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

依据[行为契约决议](../lighthouse/01-behavior-contract.md)，哪些数据进入 framework State，哪些是扩展自有业务数据／缓存／派生展示结果？逐项覆盖最新余额、5h／7d 窗口读数与获取时间／加载／错误状态、Turn usage/cost、Round totals、Session totals、预算／detail／holiday 及 quota estimate。仅存内存不等于不属于 State；明确类型、归属、读写接口及恢复／继承语义，不能把当前 boolean activation 字段当业务容器。

framework 的通用数据 State 能力是否需要升级，如何与既有 State 的单一当前值来源保持一致，不建立 UI-only 第二套权威？已确认远端最新读数只存内存，不取消累计／归档／holiday／quota estimate 持久化。先确定数据归属与寿命，再由存储票决定文件机制、刷新票决定调度；本票不设计 TTL、不迁移代码。
