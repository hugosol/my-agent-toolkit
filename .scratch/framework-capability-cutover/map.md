# Framework capability 统一收窄与 interface 切换：决策地图

Labels: wayfinder:map

## Destination

为 State、Command、General、Prompt / Marker，以及 Feedback / Host facts / authoring 收尾确定一份统一、可直接拆分实施任务的 framework 重构计划：扩展只通过获准的 capability interface 操作 framework，公开声明与实际运行时对象同步收窄，所有关键设计、依赖、迁移顺序和验收要求有明确决定。
本地图只做规划，不执行生产重构；完成不代表实现、测试或 harness 兼容性验收通过。

## Notes

### 已确认的努力范围

确认来源：本地图建图对话中，用户对 Q1 回答“是”；对 Q2 回答“同意，请你认真评估依赖关系，仅完全独立的部分可以并行，如果无法评估，稳妥起见全部任务按顺序执行”；对 Q3 回答“应当收窄，这正是这次重构的主要目的之一”。

- 本轮终点是五项重构的关键决定明确、可以拆分实施任务，暂不修改生产代码。
- 五项统一规划，按真实依赖分批落地，最终整体切换；只有证明确实完全独立的实施切片才可并行，无法证明时串行。此确认不是对具体并行分组的批准。
- 收窄扩展可见契约是主要目的，不仅迁移导入路径。具体删除哪些字段、类型和 transport 仍由各决策票访谈确定；用户尚未批准这些逐项设计。
- 不生成 HTML；地图与决策文档使用本地 Markdown tracker。

### 每次会话的阅读与工作约定

- 依据 [Capability interface architecture](../../framework/docs/capability-interface-architecture.md)，以已完成 Session cutover 为参照，不推定文档中的所有目标都已落地或获批。
- 先读相关 [framework 领域词汇](../../framework/GLOSSARY.md)、[ADR-0002](../../docs/adr/0002-semantic-extension-framework.md)；设计使用 module、interface、depth、seam、adapter、leverage、locality。每个 module 通过 deletion test 检查，不为目录对称添加浅转发层。
- 会话按需读 grilling、domain-modeling、codebase-design；发布通过 lighthouse，追溯通过 backtracer。一次会话最多解决一张非 research 决策票。当前全部为 grilling，不需要外部 research。
- 现有 Session 规则、State 所有权与生命周期、History preservation、Marker area 所有权、harness 支持范围作为现有约束；拟修改既有决定时必须明确旧到新裁决，不能默默更改。
- 现有两个 adapter 不需再包一层；不因 capability 划分预拆 HarnessPort。runtime port 的路径移动、context 分组是否进入本轮，仍由统一原则票明确。
- 普通讨论中的新决定先留在对话；整票完成或暂停/保存/切换时再发布。地图只索引 Lighthouse，不复制具体决策。

## Decisions so far

尚无 capability 具体设计发布。建图范围确认在 Notes；上一次只读评估的推荐不等同于已批准设计。

## Decision tickets

| 决策票 | 覆盖范围 | 必须先取得的决策 |
| --- | --- | --- |
| [确定统一 interface 所有权与 authoring 迁移原则](decision/01-shared-interface-policy.md) | 共同规则、组合声明、运行时限制、context / port 范围 | 无；当前唯一 frontier |
| [确定 State 完整契约与授权保持规则](decision/02-state-interface-cutover.md) | 第一项：State | 统一 interface 原则 |
| [确定 Prompt 与 Marker 的最小扩展可见范围](decision/03-prompt-marker-exposure.md) | 第四项：Prompt / Marker，含文档与实际消费者差异 | 统一 interface 原则 |
| [确定 Feedback、Host facts 与 authoring 契约归属](decision/04-host-feedback-authoring.md) | 第五项的契约落点，供 Command 使用；最终入口退役由整合票负责 | 统一 interface 原则 |
| [确定 Command 扩展交付的收窄与运行时隔离](decision/05-command-delivery-cutover.md) | 第二项：Command | 统一 interface 原则、State、Prompt / Marker、Feedback / Host facts |
| [确定 General 操作与内部配置 seam 的隔离](decision/06-general-interface-cutover.md) | 第三项：HTTP / files / configuration | 统一 interface 原则 |
| [确定整合顺序、旧入口退役与验收交接](decision/07-cutover-integration-plan.md) | 五项整合、authoring 收尾、最终验证与计划出口 | 全部 capability 决定 |

### 契约依赖：事实与解释

以下描述当前依赖，不是批准后的新 interface 设计。Blockers 是决策输入依赖，不等于生产实施可以并行。

- Command delivery 使用 State 的 DeclaredValueSeam / OwnerCapabilityHandle；State 必须先明确授权保持规则。证据：core/protocol.ts:592-611。
- Command / Action / Initialization 目前携带 MarkerTransport；必须先决定 transport 是否仍对扩展公开，才能决定 Command 交付收窄。证据：core/protocol.ts:581、634；core/assembly.ts:137-138。
- Command 依赖 Feedback、CanAcceptInput、provider 等事实，初始化依赖 SubagentIntegration；Host facts 与 authoring 的类型归属必须先明确。证据：core/protocol.ts:527-635；core/assembly.ts:106-148。
- General 不直接依赖 State / Prompt / Marker 的行为规则，但共享 authoring 配置声明、旧 public 入口和导入检查，因此不能据此批准独立实施。
- 旧入口退役必须等所有残余公开声明及消费者都有去处。证据：public.ts、import-boundary.test.ts:108-165。

### 实施顺序与并行判定：待整合票定稿

当前保守串行候选顺序：共同契约规则及必要声明准备 → State → Prompt / Marker → Feedback / Host facts 与必要 authoring 组合 → Command → General → authoring 残余迁移、旧入口退役及整体验收。

这只是有证据支撑的排程候选，不是实施票或已批准设计。各步都应在迁移自身消费者、限制旧路径后验证；不是把所有消费者拖到最后才迁移。

当前不批准任何生产实施并行，原因：

1. State、Command、Prompt、Marker、配置声明共用 core/definition.ts。
2. Command、Host facts、Marker 和内部 port 共用 core/protocol.ts；命令实现、初始化与 context 共用 core/assembly.ts。
3. behaviors/binding.ts 同时组合 State、Command、Prompt、Marker、配置和生命周期，收窄字段不能靠各票独立改动保证一致。
4. public.ts、import-boundary.test.ts、真实扩展与导航文档跨多项共享；General 的内部实现虽独立，其入口切换并不独立。
5. 测试/真实宿主运行还受共享工作树和进程级资源约束。不同测试目录不构成独立性证明。

整合票必须在具体设计确定后重查上述共享集；只有类型、运行时效果、编辑文件和验证资源均独立才允许提出并行切片。逻辑上独立的决策讨论不自动授权并行生产改动。

## Evidence and verification limits

- 建图前只读调研，并在本对话运行 Bun 扩展导入扫描。观察到旧 framework/public 入口 10 处、modules/http 3 处、modules/files 2 处、core/config 2 处、core/assembly 1 处导入；这是当时扫描的静态导入出现次数，不是未来迁移完成证明，实施时需重扫。
- Directed Command 无写入探针观察到真实交付对象同时具有 state、capability、persist、markers；说明存在可达性，不证明任何候选删除设计已经实现。
- 以上是规划证据，不是全仓测试或两种 harness 行为通过结论。本地图不运行生产修改或完整测试。
- 最终计划必须按 [测试约定](../../docs/agents/testing.md) 明确 typecheck、导入限制、capability 行为、三个扩展及两种 harness 的 smoke / dock 范围，并单列未验证项。

## Not yet specified

- 只有各 capability 的公开范围确定后，才能看清是否需要额外的最小验证 seam，以及各真实 harness 场景应采用什么最小驱动方式；整合票先拥有验证策略问题，不能预设新测试抽象或生成实现切片。
- 若实施输入证明某处必须改变现有领域语义才能完成收窄，需带具体冲突重新形成决策；本地图不预先批准该变化。

## Out of scope

- 本轮生产代码重构、实施任务执行、正式切换与通过声明。
- 借 interface 迁移新增能力、改扩展业务、改变 State / Session / Prompt / Marker 的领域语义，或重写已完成 Session 实现。
- 新增第二 adapter 抽象、运行时 capability registry、启动兼容性 gate、通用依赖注入框架。
- 单为目录一致性大规模搬动内部 core / behaviors / modules，或捆绑共享配置缓存时序、重试等无关改造。
