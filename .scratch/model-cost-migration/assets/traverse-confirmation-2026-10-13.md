# Traverse 全票审阅：确认来源与交接

## Scope

本次加载 [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)、15 张 resolved 决策票与各自 Lighthouse，检查依赖、既有模式对称性、分层和相邻边界。用户选择「确认，当前讨论」，不新建跟进票。本文保存确认来源、审阅恢复点与证据限度，不作为政策副本。

## Confirmation source

来源为本次 Traverse 对话；无可用外部会话定位链接，保留用户原话及其所回答提案的范围。

- **Q1 原话**：「Q1 同意，基本原则是保证happy flow能顺利流畅完成，允许极端边界情况丢失数据，但不要造成一直无法写入新数据的情况」。所回答提案：保留正常并发不覆盖他人已保存更新，撤销仅凭年龄回收可能仍被存活进程持有的锁；15 秒仍是取得权限的等待预算；可靠确认持有者已退出才回收，不能可靠确认时本次有限失败。用户补充约束要求后续队列不被失败堵死、失效锁有恢复路径；不把未知活性变成永久拒绝，也不新增复杂恢复或 Session 执行者检测系统。具体实现与生产验证仍在图外。
- **Q2 原话**：「Q2 可以，查询一次」。所回答提案：普通 clear／首次 holiday 在文件锁外尝试一次 DeepSeek 余额查询，沿现有 5 秒预算；已开启 holiday 的幂等操作不查询。成功时同一读数交归档结束与新周期开始；失败／超时两处省略，不阻止归档／重置、不填零、不自动重试。
- **Q3 原话**：「Q3 session名称应由adapter提供，这个信息应该可以随每次落盘会话日志更新，我们需要根据sessionId一直更新」。adapter 提供最新名称，framework 按实际 Session 身份交付；名称不只在创建或当前查看时取得。
- **Q4 原话**：「Q4 不需要独立触发更新，只需更新内存中的信息，随下次写入文件一起更新」。所回答澄清区分宿主会话日志与消费文件：名称更新内存与展示，下次正常消费保存按 harness＋sessionId 更新同一记录；不因改名或每条宿主日志追加而独立写 consumption.json，不增加消费保存频率。

## Handoff

- 三项审阅问题的用户选择已齐备；不是生产实现、宿主补丁、远端或文件锁已验收。
- 锁回收／失败进展的唯一权威在 [存储 Q24](../lighthouse/06-local-storage.md#q24framework-通用文件能力的接口锁与发布契约)。余额查询触发在 [刷新权威](../lighthouse/09-refresh-lifecycle.md)，起止字段及同值双用仍在 [存储 Q25](../lighthouse/06-local-storage.md#q25consumptionjson-的物理-schema归档与版本)。Session 名称源事实在 [观察权威](../lighthouse/03-observation-contract.md)，内存／下次保存约束在存储 Q25；公共接线只由 [装配权威](../lighthouse/10-assembly-layout.md)消费上述原主题。
- 历史原文保存在 [本次发布前快照](traverse-before-publication-2026-10-13.md)。本轮不认领、重开或改写既有决策票的正文／状态／assignee，也不重写其他票的历史 Handoff。
- 发布后 Backtracer 已完成：锁的正常流畅／失效恢复／后续可写信号由观察的 happy flow 原则、存储 Q6／Q7／Q9／Q24、装配文件 Module 与验收的并发／失败职责覆盖；边界余额的认证／5 秒预算／锁外查询／省略／最终提交信号由账户访问、HTTP、刷新、存储、命令与展示原权威覆盖；最新名称的源事实／逐实际 Session／身份／内存／下次保存信号由观察、装配、存储与展示覆盖。native seam、Owner 隔离、唯一消费源、原保存频率及现有配置／反馈／验证模式均保留，未发现新增未覆盖问题、上游冲突、层违规或 peer asymmetry；无新 gap batch，不新建票或空 trace 报告。
- 出版导航 smoke：实际运行 Bun 检查本次地图、四份 Lighthouse 与本确认文档的本地链接／锚点及 15 张票的状态；修正刷新文档中一处旧 Viewed session 标题锚点后通过。历史文件已保存，全部决策票仍 resolved，frontier 为空。此检查不是生产 IO／网络／宿主能力认证。
- 下一阶段读取更新后的权威整理规格；本批无 unanswered 讨论问题，生产 IO、公共名称接线、查询与实际 patched artifact 的验证由既有装配／验收职责承接。若实施暴露具体成本或正常功能冲突，带证据请求裁决，不扩建假想异常树。

## Evidence and limits

- 陈旧锁发布窗口的设计反例：Bun 内存调度模型中，A 校验后暂停，B 回收并发布，A 恢复旧快照发布，结果 lostCommittedUpdate=true。只证明原方案的检查／发布窗口不足，不是真实文件系统或多进程锁复现。
- 固定 OMP 18.5.0 类型声明有 getSessionName，SessionManager 有名称变更机制；当前源码 setSessionName 更新内存、记录标题变化并持久化。ReadonlySessionManager 并不自动公开所有内部订阅，adapter 的公共接线仍需实施核验；不把当前源码当固定基线完整认证。
- 旧 clear 在归档前查询余额的源码模式已核对。未读取凭证、调用真实服务、运行新生产实现、TUI 或跨进程存储验证。
- 已排除候选：旧双执行者冲突由存储 Q26 收口；HTTP 缺配置直连／统计身份残留由原权威明确修订；Windows rename 重试不能据旧注释恢复；宿主补丁 artifact 是既有实施前置；文档／测试位置沿 repo 约定；历史 Round、多账号、旧数据兼容和 pi 实现不因本审阅恢复。
