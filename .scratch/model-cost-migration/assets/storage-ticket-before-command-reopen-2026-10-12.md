# 存储票 Q25 定点重审前恢复上下文

本快照保留原 Handoff 与 Question。旧 accounts 结构已被本轮政策修订取消，不是当前批准布局；其余理由／证据可溯源，完整讨论仍留在源票 Comments。

# framework 如何提供独立存储、原子更新与跨进程协调？

Type: grilling
Status: resolved
Outcome: [存储组织与唯一消费源局部决议](../lighthouse/06-local-storage.md)
Assignee: hugos (本会话 agent 协助讨论)
Blocked by: 01, 02, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](../decision/01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Handoff

- 状态：本票已 resolved（2026-10-11 本会话，Q23–Q26 收口）。唯一权威为 [存储组织与安全更新局部决议](../lighthouse/06-local-storage.md)；详细规则只在 Lighthouse，本交接只留导航、理由与证据限制。
- 本轮确认：Q23 取最简——不做请求前读取，跨进程 clear 由保存时周期校验（Q8）发现并按失败重初始化（Q6），最多丢一轮未保存消费；Q24 framework 通用文件能力 = 单一异步入口 + 规范化路径协调键 + 进程内 FIFO + 锁文件跨进程互斥 + 15s 预算 + 锁内重读 + 同目录临时文件 rename 原子发布 + 损坏不覆盖 + 陈旧锁回收（被误回收的存活写入者校验锁所有权并放弃覆盖）；Q25 consumption.json 最小物理 schema（schemaVersion／accounts／periodId／holiday／sessions{saveVersion／own／recentRound／parent}）与 `archives/<uuid>.json`；Q26 同会话多执行者不引入租约，靠 saveVersion + Q8 旧版本不覆盖 + Q12 同版本冲突 + Q6 重初始化收口。
- 已定基线（不重问）：Q5–Q22 全部保持；账户周期／holiday、按会话合并、异步等待、clear 先归档后重置且只取已保存数据、无基线暂停、固定文件组织与本机本地文件系统范围不变。
- 拒绝／替代：请求前读取候选（含读失败、空闲刷新、读／clear 交错、开放 Round 跨周期快照设计）与同会话租约／心跳均未采纳，理由是最简单实现与已接受的少量损失；Q6／Q11 旧保留内存政策仍以 Lighthouse 当前正文为准，历史仅在下方 Comments。
- 证据限制：[exact 18.5.0 请求观测探针](../assets/omp-request-observation-smoke.md)与旧存储只读探针不证明新 framework 文件能力已实现；真实跨进程锁、崩溃／原子读、陈旧锁回收与路径别名验收由装配／验收票承担。
- 无剩余无主恢复点；Q23–Q26 已收口。混账户父子关系保留与迟到子消费发布属账户／观察票；本票不再认领。

## Question

新统计允许从空开始；存储根与路径配置已按存储 Lighthouse Q17–Q20 确认，复用用户 .omp/cost-archive，由用户切换前手动备份清空，程序不自动清理或兼容旧统计。文件组织已由 Q21 确认；继续确定扩展／账户／provider namespace 与物理 schema，本机本地文件系统的协调范围已由 Q22 确认，继续确定具体锁／平台运行契约。哪些通用文件能力进入 framework，哪些 JSON schema、合并／归档规则留在 model-cost？Codex estimate 保持独立文件并复用安全写入，本票不展开其业务采纳算法。

确定读缓存新鲜度、锁内重读／update、原子发布、跨进程锁、等待／取消／错误与损坏不覆盖契约，并讨论平台条件。旧 OMP native file-lock 不能作为 harness-independent implementation 偷渡进共享代码。保留当前已确认的账户周期聚合／归档／holiday 与 quota estimate 业务能力；不照搬旧完整账本或补齐要求。从空起步不等于取消本周期持久化、已保存值恢复或正常并发安全。

## Discussion approach

以既定数据记录与读写路径为前提，先看实际组织及调用方式，再决定操作级等待、锁与恢复；保持规划模式，不泛问整个 callback 同步／异步，不预建正常离开的额外保存钩子。

