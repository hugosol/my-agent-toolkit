# 确定 Command 扩展交付的收窄与运行时隔离

Type: grilling
Status: resolved
Assignee: unassigned
Blocked by: 01, 02, 03, 04
Parent: ../map.md

## Handoff

- 已完整确认并发布：[Command 扩展交付的收窄与运行时隔离 Lighthouse](../lighthouse/05-command-delivery-cutover.md)。确认来源与具体规则以该权威为准。
- 本票无剩余未决问题；下一张就绪票是 [确定 General 操作与内部配置 seam 的隔离](06-general-interface-cutover.md)。最终迁移批次、共享文件冲突、入口整体退役和适用 harness smoke/dock 矩阵由整合票承接，不是本票已实施的保证。
- 保留理由：interface 面向扩展作者；复用 State / Session 的受限对象与闭包模式，不新增通用 delivery 抽象；保留三种 control 的不同语义，不统一 gate 或执行模型。Q4 按其他 capability 的实际复杂度与单入口规则组织。
- 证据：core/protocol.ts:439-649、core/assembly.ts:50-79、core/definition.ts:85-168、behaviors/control.ts、actions.ts:50-87；core/state.ts:164-196 与 behaviors/binding.ts:275-285 提供受限对象模式参照；connect-bot command/registration 与 model-cost period-switch 是真实消费者。
- 当前 Directed spread 与 Action 原样 invocation 是静态观察；CommandActions 精确搜索只见声明及旧导航，实施前仍需核实无调用。历史建图探针未在本轮重跑；未改生产代码、未跑行为测试或真实 harness。
- 发布追溯与链接/frontier 检查完成情况见下方 Comments；无未获批准候选被作为政策发布。

## Question

如何把 Command 声明、命令实现与扩展 delivery 集中到 canonical interface，同时阻止扩展绕过 State seam 直接使用底层持久化和未批准的 Marker transport？

- CommandInvocation / BoundCommand 与 CommandDelivery / ActionDelivery 的扩展可见范围分别是什么？哪些类型应留在内部 port？
- persist 如何从扩展契约与实际对象退出；markers 按 Prompt 与 Marker 的已发布裁决处理，不在这里复制另一份政策。
- 运行时 delivery 如何避免通过 spread 或把 invocation 原样传递而泄漏内部属性；retained capability 仍只从授权交付取得。
- DirectedDirective、RecognizedDirective 与内部解析结果如何区分；哪些 public 导出无真实调用且可删除？
- 保持 toggle / directed / actions 的 owner 限制、写入/持久化/发布顺序、重复执行、未知参数、help 和异步等待/错误规则。
- 哪些 extension 消费者及实际 harness 加载场景证明收窄不损害现有功能？

## Comments

- 本轮访谈 Q1/Q2 同意公开成员与作者契约范围；Q3 经 handler/handle/delivery 概念澄清后同意受限对象模式；Q4 参考既有 capability，Q5 保持原有不同语义；Q6 同意完整迁移与验收交接。确认原话及决定详见 Lighthouse。
- Backtracer：对照统一原则、State、Prompt / Marker、Feedback / Host facts 与 authoring 权威，无新增缺口或冲突。公开声明与真实对象一致、State 受管理写入/retained 语义、Marker 退出、CanAcceptInput 归属均有前置提供者；最终消费者清单、两种 harness 的验证矩阵及旧入口整体退役已有整合票覆盖，仍未决，不视为验收通过。不新增重复票、不更改其他票的 Handoff 或 claim。
- 发布验证通过：地图、本票与 Lighthouse 的 28 个相对文件链接均存在；本票实际为 resolved / unassigned；唯一 frontier 是 General，整合票仍受 General 阻塞。未修改生产代码，未运行行为测试或真实 harness；以上仅是规划文档验证。
