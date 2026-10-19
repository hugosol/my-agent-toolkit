# 确定 Prompt 与 Marker 的最小扩展可见范围

Type: grilling
Status: open
Assignee: unassigned
Blocked by: 01
Parent: ../map.md

## Handoff

- 已确认的努力范围与限制见地图 Notes；本票尚无 Lighthouse，没有具体设计获批。
- 当前恢复点：从下方 Question 开始；依赖票存在时，先读取其已发布 Lighthouse，并确认其结果满足前置条件。
- 候选方案与源码事实不是政策批准；只读调研不能替代实际行为验收。
- 证据入口：framework/docs/capability-interface-architecture.md:151-161；framework/core/definition.ts:189-215；framework/core/protocol.ts:355-436；framework/core/assembly.ts:130-148；behaviors/injection.ts、marker.ts；上一轮只读调研未发现扩展直接消费 markers，非删除批准。
- 本票只作决策，不修改生产代码；发布遵循 Wayfinder，普通讨论先留在对话，整票完成或暂停/保存/切换时再发布。

## Question

扩展对 Injected prompt 与 Marker area 各自真正需要知道什么？在不改变注入与展示语义的前提下，是否应把仅用于 adapter 与 framework 交换的事实和 transport 留在内部？

- PromptDeclaration / PromptStrategy 的归属明确后，RunDelivery 与 PromptContribution 是否仍应公开？当前目标文档列为扩展可见，但现有消费者是 framework 与 adapter；需明确旧到新裁决，不能把零消费者当作自动删除授权。
- MarkerDeclaration 与 MarkerTransport 是否都属于扩展 interface？若收掉 transport，Command / Action / Initialization 的 markers 如何退出实际运行时对象，内部发布如何保持？若保留，说明真实扩展需求与权限限制。
- 哪些结论需要修订架构能力表与 ADR，哪些只是实现/导入迁移？
- 保持 History preservation、slot identity、branch progress、注入频率与优先、全进程 Marker area、Viewed session 投影和发布时机。
- 用 deletion test 区分目录导航价值与真实 depth，不新增空壳 module 或第二 adapter。

## Comments

尚未认领或开始访谈。
