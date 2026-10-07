# 18: connect-bot loader/admission 自动化与新旧装载互斥

**What to build:** 装载与准入按既有 codebase-tools 先例自动化：真实隔离 loader 发现并加载 connect-bot 入口、out-of-dir 共享源与文本资源可解析、admission 断言成立；并证明新旧实现永不同载——互斥靠 load source，而不是靠名字去重（loader 不按名字去重）。原 L2 不再作为独立人工步骤，只作 M 层人工前置。

**Delivers:** P42

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] 真实隔离 loader 下发现路径唯一且 label 正确；out-of-dir 共享源与文本资源解析 0 错误
- [ ] connect-bot admission 断言：声明支持的版本被准入；未列版本/缺语义路径按既有策略
- [ ] 新旧装载互斥：显式装载根之外的同名旧实现不会被发现
- [ ] 两处同名实现同时进入发现范围时，行为与既有互斥断言一致（不按名字去重，两份都可见）
- [ ] 测试使用真实隔离安装，不改默认全局安装/正式配置/运行中 agent
- [ ] 文档记录：原 L2 已并入本票自动化，不再是独立人工步骤

**来源:** contract P42；spec §12、故事 81/82/89；lighthouse 06 §1/§5
