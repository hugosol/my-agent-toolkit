# Framework capability 统一收窄与 interface 切换：决策地图

Labels: wayfinder:map

## Destination

为 State、Command、General、Prompt / Marker，以及 Feedback / Host facts / authoring 收尾确定一份统一、可直接拆分实施任务的 framework 重构计划：扩展只通过 capability 与通用模块的获准 interface 操作 framework，公开声明与实际运行时对象按已发布权威收窄，所有关键设计、依赖、迁移顺序和验收要求有明确决定。
本地图只做规划，不执行生产重构；完成不代表实现、测试或 harness 兼容性验收通过。

## Notes

### 已确认的努力范围

确认来源：本地图建图对话中，用户对 Q1 回答“是”；对 Q2 回答“同意，请你认真评估依赖关系，仅完全独立的部分可以并行，如果无法评估，稳妥起见全部任务按顺序执行”；对 Q3 回答“应当收窄，这正是这次重构的主要目的之一”。

- 本轮终点是五项重构的关键决定明确、可以拆分实施任务，暂不修改生产代码。
- 五项统一规划，按真实依赖分批落地，最终整体切换；只有证明确实完全独立的实施切片才可并行，无法证明时串行。此确认不是对具体并行分组的批准。
- 收窄扩展可见契约是主要目的，不仅迁移导入路径。具体字段、类型和 transport 的批准范围以 Decisions so far 链接的 Lighthouse 为准；尚未决定的部分继续由所属决策票访谈确定。
- 不生成 HTML；地图与决策文档使用本地 Markdown tracker。

### 每次会话的阅读与工作约定

- 依据 [Capability interface architecture](../../framework/docs/capability-interface-architecture.md)，以已完成 Session cutover 为参照，不推定文档中的所有目标都已落地或获批。
- 先读相关 [framework 领域词汇](../../framework/GLOSSARY.md)、[ADR-0002](../../docs/adr/0002-semantic-extension-framework.md)；设计使用 module、interface、depth、seam、adapter、leverage、locality。每个 module 通过 deletion test 检查，不为目录对称添加浅转发层。
- 会话按需读 grilling、domain-modeling、codebase-design；发布通过 lighthouse，追溯通过 backtracer。一次会话最多解决一张非 research 决策票。当前全部为 grilling，不需要外部 research。
- 现有 Session 规则、State 所有权与生命周期、History preservation、Marker area 所有权、harness 支持范围作为现有约束；拟修改既有决定时必须明确旧到新裁决，不能默默更改。
- runtime port 与 context 的共同原则已由 [统一 interface 原则 Lighthouse](lighthouse/01-shared-interface-policy.md) 明确；其他文档中的目录和分组候选不覆盖该权威，具体 capability 细节仍由后续票决定。
- 普通讨论中的新决定先留在对话；整票完成或暂停/保存/切换时再发布。地图只索引 Lighthouse，不复制具体决策。

## Decisions so far

- [统一 interface 所有权与迁移原则](lighthouse/01-shared-interface-policy.md)：共同原则已完整确认；根 authoring 入口可拆所属公开声明，扩展配置只读保障已按本轮确认发布有限例外，其他隔离要求不变；继续按收益组织入口、保留 internal seam，无调用后退役旧入口。
- [State 完整契约与授权保持规则](lighthouse/02-state-interface-cutover.md)：完整确认 State 声明归属、受管理读写与迁移验收；保持既有 Owner、恢复继承和效果组合，不新增权限体系或实现复杂度。
- [Prompt 与 Marker 最小扩展可见范围](lighthouse/03-prompt-marker-exposure.md)：完整确认面向扩展作者的最小声明、实际交付收窄及迁移验收；保持现有声明式使用与领域语义。

- [Feedback、Host facts 与 authoring 契约归属](lighthouse/04-host-feedback-authoring.md)：完整确认事实按职责归属、Subagent 最小公开范围、通知分层复用、轻量代码集中及整体 authoring 结构与验收交接；不公开执行模式，不新增运行时抽象。

- [Command 扩展交付的收窄与运行时隔离](lighthouse/05-command-delivery-cutover.md)：完整确认作者契约、受限实际交付与三种 control 的语义保持；采用既有 State / Session 模式，迁移与验收交整合票统筹。

- [General 通用模块的最小公开 interface](lighthouse/06-general-interface-cutover.md)：完整确认 HTTP / files / configuration 的直接入口、公开清单与内部 seam；区分通用模块与 capability，尽量保持既有逻辑，配置只读范围引用共同原则的有限例外。

- [整合顺序、旧入口退役与验收交接](lighthouse/07-cutover-integration-plan.md)：完整确认六批串行、残余归属与逐批消费者迁移、旧入口干净退役及五个实际入口的分层验收；地图完成规划，不扩功能、不执行生产改造。

## Decision tickets

| 决策票 | 覆盖范围 | 必须先取得的决策 |
| --- | --- | --- |
| [确定统一 interface 所有权与 authoring 迁移原则](decision/01-shared-interface-policy.md) | 共同规则、组合声明、运行时限制、context / port 范围；已发布 Lighthouse | 无；已 resolved |
| [确定 State 完整契约与授权保持规则](decision/02-state-interface-cutover.md) | 第一项：State；已发布 Lighthouse | 统一 interface 原则；已 resolved |
| [确定 Prompt 与 Marker 的最小扩展可见范围](decision/03-prompt-marker-exposure.md) | 第四项：Prompt / Marker；已发布 Lighthouse | 统一 interface 原则；已 resolved |
| [确定 Feedback、Host facts 与 authoring 契约归属](decision/04-host-feedback-authoring.md) | 第五项及 Subagent / authoring 契约落点；已发布 Lighthouse，最终入口退役由整合票负责 | 统一 interface 原则；已 resolved |
| [确定 Command 扩展交付的收窄与运行时隔离](decision/05-command-delivery-cutover.md) | 第二项：Command；已发布 Lighthouse | 统一 interface 原则、State、Prompt / Marker、Feedback / Host facts；已 resolved |
| [确定 General 操作与内部配置 seam 的隔离](decision/06-general-interface-cutover.md) | 第三项：HTTP / files / configuration 通用模块；已发布 Lighthouse | 统一 interface 原则；已 resolved |
| [确定整合顺序、旧入口退役与验收交接](decision/07-cutover-integration-plan.md) | 五项整合、authoring 收尾、最终验证与计划出口；已发布 Lighthouse | 各 capability 与 General 决定均已 resolved；本票已 resolved |

### 契约依赖：事实与解释

以下描述当前依赖，不是批准后的新 interface 设计。Blockers 是决策输入依赖，不等于生产实施可以并行。

- Command delivery 使用 State 的 DeclaredValueSeam / OwnerCapabilityHandle；State 必须先明确授权保持规则。证据：core/protocol.ts:592-611。
- 当前源码的 Command / Action / Initialization 携带 MarkerTransport；其可见性裁决由 [Prompt 与 Marker Lighthouse](lighthouse/03-prompt-marker-exposure.md) 提供，Command 完整交付设计由 [Command Lighthouse](lighthouse/05-command-delivery-cutover.md) 提供；实际退出仍待实施验收。源码证据：core/protocol.ts:581、634；core/assembly.ts:137-138。
- Command 依赖 Feedback、CanAcceptInput、provider 等事实，初始化依赖 SubagentIntegration；归属与 authoring 输入由 [Feedback、Host facts 与 authoring Lighthouse](lighthouse/04-host-feedback-authoring.md) 明确，完整交付与内部属性隔离由 [Command Lighthouse](lighthouse/05-command-delivery-cutover.md) 明确。现有源码证据：core/protocol.ts:527-635；core/assembly.ts:106-148。
- General 不直接依赖 State / Prompt / Marker 的行为规则，但共享 authoring 配置声明、旧 public 入口和导入检查，因此不能据此批准独立实施。
- 旧入口退役必须等所有残余公开声明及消费者都有去处。证据：public.ts、import-boundary.test.ts:108-165。

### 实施交接导航

已批准的批次顺序、串行判定、共享文件、退出条件、消费者清单、旧入口退役和验证矩阵统一见 [整合顺序、旧入口退役与验收交接](lighthouse/07-cutover-integration-plan.md)。本地图不再保留一份候选排程或重复政策。

全部决策票已解决，当前无下一张 frontier 决策票；下一阶段是另行拆分实施任务，不是继续规划或在本会话执行生产改造。

## Evidence and verification limits

- 建图前只读调研，并在本对话运行 Bun 扩展导入扫描。观察到旧 framework/public 入口 10 处、modules/http 3 处、modules/files 2 处、core/config 2 处、core/assembly 1 处导入；这是当时扫描的静态导入出现次数，不是未来迁移完成证明，实施时需重扫。
- Directed Command 无写入探针观察到真实交付对象同时具有 state、capability、persist、markers；说明存在可达性，不证明任何候选删除设计已经实现。
- 以上是规划证据，不是全仓测试或两种 harness 行为通过结论。本地图不运行生产修改或完整测试。
- 最终计划必须按 [测试约定](../../docs/agents/testing.md) 明确 typecheck、导入限制、capability 行为、三个扩展及两种 harness 的 smoke / dock 范围，并单列未验证项。

## Not yet specified

无。达到本地图规划终点所需的决定均已发布；实施中的新事实若要求改变既有领域语义，依 [整合计划](lighthouse/07-cutover-integration-plan.md) 携具体冲突另行取得决策，不作为当前未指定功能。

## Out of scope

- 本轮生产代码重构、实施任务执行、正式切换与通过声明。
- 借 interface 迁移新增能力、改扩展业务、改变 State / Session / Prompt / Marker 的领域语义，或重写已完成 Session 实现。
- 新增第二 adapter 抽象、运行时 capability registry、启动兼容性 gate、通用依赖注入框架。
- 单为目录一致性大规模搬动内部 core / behaviors / modules，或捆绑共享配置缓存时序、重试等无关改造。
