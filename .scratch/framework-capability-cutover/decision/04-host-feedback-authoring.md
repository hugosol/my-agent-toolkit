# 确定 Feedback、Host facts 与 authoring 契约归属

Type: grilling
Status: open
Assignee: unassigned
Blocked by: 01
Parent: ../map.md

## Handoff

- 已确认的努力范围与限制见地图 Notes；本票尚无 Lighthouse，没有具体设计获批。
- 当前恢复点：从下方 Question 开始；依赖票存在时，先读取其已发布 Lighthouse，并确认其结果满足前置条件。
- 候选方案与源码事实不是政策批准；只读调研不能替代实际行为验收。
- 证据入口：framework/interface/feedback/index.ts；framework/interface/host-facts/index.ts；framework/core/protocol.ts:35-38、516、734-761；framework/core/assembly.ts:106-148；ADR-0002:325-332、427-435。
- 本票只作决策，不修改生产代码；发布遵循 Wayfinder，普通讨论先留在对话，整票完成或暂停/保存/切换时再发布。

## Question

如何补齐 Feedback / Host facts 的 canonical 声明，并确定 implementation context、初始化交付和 authoring 组合入口的职责，使 Command 与最终入口切换有稳定输入？

- CanAcceptInput、SubagentIntegration、SubagentIntegrationFailure 是否归 Host facts；现有 provider/catalog facts 的查询时点与缺失含义如何保持？
- FeedbackTransport 与框架 NoticeTransport 保持怎样的分工，哪些事实/通道只属于 adapter port？
- Feedback 的现有三级严重度与 ADR 较早的两级表述如何核对历史并明确处理，不借目录迁移默默改行为？
- 依统一原则确定哪些 authoring 类型在 assembly / definition，哪些归 capability；本票不能提前批准尚未由 Command / Prompt / Marker 决定的字段。
- retained owner feedback 与 session_end dispatch feedback 的生命期差异如何在公开契约与验收中保留？
- 不为 hand-over 新建缓存、策略或转发实现；若仍只有 transport，说明其 seam 与两个 adapter 的真实用途。

## Comments

尚未认领或开始访谈。
