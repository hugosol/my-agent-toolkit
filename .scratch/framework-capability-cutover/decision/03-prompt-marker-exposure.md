# 确定 Prompt 与 Marker 的最小扩展可见范围

Type: grilling
Status: resolved
Assignee: unassigned
Blocked by: 01
Parent: ../map.md

## Handoff

- 完整结论与可恢复确认来源：[Prompt 与 Marker 最小扩展可见范围 Lighthouse](../lighthouse/03-prompt-marker-exposure.md)。Q1–Q4 分别确认范围、沿用语义与单文件入口，Q5 用户「同意，请继续」确认完整迁移验收要求并授权发布。
- 本票问题已全部决定，无未回答的访谈分支。后续会话读取上述权威，不从原 Question 重新推定候选为未决。
- 理由与排除分支见 Lighthouse：interface 面向扩展作者；没有现有消费者不是自动删除授权；不新增动态 Marker 操作、不增加浅转发 module，也不只靠类型隐藏内部字段。
- 下游由 Command 票完成交付整体形状，Feedback / Host facts 与 authoring 票完成初始化/组合落点，整合票完成消费者清单、文档/ADR 更新、旧入口排程与真实 harness 验证矩阵；这些票仍须作自身决策，不表示实现完成。
- 紧接发布的 Backtracer 追溯结果与下一前沿见下方 Comments；未发现新缺口时不新建追溯报告或重复下游票。
- 证据入口：framework/core/definition.ts:189-215、core/protocol.ts:350-436 及命令交付、core/assembly.ts:130-148、behaviors/marker.ts:203-224、extensions/codebase-tools/definition.ts 与 connect-bot/definition.ts；完整证据限制见 Lighthouse。
- 本票只作规划，未修改生产代码、未执行行为测试或 harness smoke；发布检查仅覆盖文档链接、tracker 状态与前沿。

## Question

扩展对 Injected prompt 与 Marker area 各自真正需要知道什么？在不改变注入与展示语义的前提下，是否应把仅用于 adapter 与 framework 交换的事实和 transport 留在内部？

- PromptDeclaration / PromptStrategy 的归属明确后，RunDelivery 与 PromptContribution 是否仍应公开？当前目标文档列为扩展可见，但现有消费者是 framework 与 adapter；需明确旧到新裁决，不能把零消费者当作自动删除授权。
- MarkerDeclaration 与 MarkerTransport 是否都属于扩展 interface？若收掉 transport，Command / Action / Initialization 的 markers 如何退出实际运行时对象，内部发布如何保持？若保留，说明真实扩展需求与权限限制。
- 哪些结论需要修订架构能力表与 ADR，哪些只是实现/导入迁移？
- 保持 History preservation、slot identity、branch progress、注入频率与优先、全进程 Marker area、Viewed session 投影和发布时机。
- 用 deletion test 区分目录导航价值与真实 depth，不新增空壳 module 或第二 adapter。

## Comments

### 完成发布与追溯（2026-10-19）

- 本轮 Q1–Q5 的确认已发布至本票 Lighthouse；整票 resolved，认领已释放。用户明确要求沿用当前语义与调用方式、不扩展功能。
- Backtracer 已按已发布变更回查统一 interface 原则与 State Lighthouse，并核对地图及当前决策票范围。意图信号（扩展作者最小知识、自己的标记/整区管理、实际对象无 transport 旁路、旧入口退役）分别由共同原则、State、Command、authoring 与整合票承接；模式信号（canonical 公开声明、受限实际对象、内部 seam 和外部效果组合）与上游一致。
- 下游覆盖：Command 票已问及 markers 按本权威退出及 spread 泄漏；Feedback / Host facts 与 authoring 票已覆盖初始化交付与组合职责；整合票已覆盖消费者清单、文档/ADR、旧入口和真实扩展/两种 harness 验证。未发现新意图缺口、层级缺口、同类不对称或上游冲突，无需新增票或修改下游 Handoff。开放提供者不是已完成的设计或实现证据。
- 尚未清晰的验证 seam / 最小宿主驱动仍归地图现有 fog，当前没有足够新事实使其毕业为独立问题；没有新确认的缺口待分派。
- 下一前沿是 [确定 Feedback、Host facts 与 authoring 契约归属](04-host-feedback-authoring.md)；[确定 General 操作与内部配置 seam 的隔离](06-general-interface-cutover.md) 同样可开始。Command 仍等待 Feedback / Host facts 的决定。本会话不认领下一张票。
