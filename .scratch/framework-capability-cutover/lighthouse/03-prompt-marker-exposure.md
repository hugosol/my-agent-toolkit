# 确定 Prompt 与 Marker 的最小扩展可见范围：Lighthouse

> Question and discussion: [确定 Prompt 与 Marker 的最小扩展可见范围](../decision/03-prompt-marker-exposure.md)
> Prerequisite: [统一 interface 所有权与迁移原则](01-shared-interface-policy.md)
> Related authority: [State 完整契约与授权保持规则](02-state-interface-cutover.md)

## Question

扩展作者使用 Injected prompt 与 Marker area 真正需要哪些声明，哪些交付事实和 transport 应留在 framework / adapter 内部？本结论完整覆盖本票的公开范围、入口、行为保持、迁移和验收约束，不代决 Command 的其他字段或整体验收排程。

## Discussion

### 确认来源与范围

本票本轮访谈无独立会话定位符，以下问题编号和用户原话构成可恢复的确认记录：

- Q1 用户「同意，interface层展示的对象是扩展的作者，不是framework维护者和harness接入者（adapter层）」：公开声明面向扩展作者，RunDelivery 与 PromptContribution 留在内部。
- Q2 用户「这听起来非常合理，extension只能操作自己的marker，整个marker区域的管理，清空等应该交回framework层处理」：MarkerTransport 不对扩展公开，实际扩展交付对象也不再携带 markers。
- Q3 用户「尽量沿用当前的语义和调用方式，不作功能扩展」：延续声明文本、由有效 State 驱动展示的模型，不新增动态操作。
- Q4 用户「可以，单文件即可」：采用 prompt.ts 与 marker.ts 两个单文件公开入口。
- Q5 对公开声明迁移、实际对象收窄、行为验收、旧入口退役和文档修订的完整收尾要求，用户回答「同意，请继续」，授权本票完成发布，不授权执行生产重构。

### Prompt 的最小公开声明与旧到新裁决

`framework/interface/prompt.ts` canonical 拥有 PromptDeclaration 与 PromptStrategy。扩展继续声明 tag、strategy、content，沿用 first-enabled-run / every-enabled-run 两种策略，不增加动态注入入口。

RunDelivery 与 PromptContribution 留在内部 port / framework-adapter 交互中，不属于扩展 interface。扩展不需要掌握当前分支已记录的贡献身份，也不能通过构造内部贡献结果绕过 framework 的选择规则。framework 与 adapter 需要相同公开声明时引用 canonical 声明，不另定义一份。

旧到新裁决：架构能力表原来将 run delivery 与 prompt contribution 列为扩展可见；现改为只公开声明与策略，运行事实、贡献选择与结果交付留在内部。依据是扩展作者所需的知识范围，不是以没有现有消费者自动批准删除。迁移时修正能力表与入口说明；没有批准改变注入的领域语义。

### Marker 声明与区域管理

`framework/interface/marker.ts` canonical 拥有 MarkerDeclaration，继续由扩展声明 text。扩展通过原有获准 State 操作影响自身启用状态，framework 根据有效 State 决定该扩展标记是否显示；不新增独立显示/隐藏、动态更新文本、手动刷新或替代发布入口。

MarkerTransport 留在内部。全进程唯一 Marker area 的区域管理、整区发布与清空、排序、Viewed session 投影和生命周期均由 framework 及既有 adapter 映射处理，不交给扩展。

旧到新裁决：架构能力表原来将 marker transport 列为扩展可见；现改为只公开 MarkerDeclaration。扩展实际收到的 Command、Action、Initialization 对象均不再携带 markers，不能仅用 TypeScript 类型隐藏仍可取得的属性，也不能通过展开内部交付对象继续泄漏 transport。内部仍保留发布所需的 transport，不以删除扩展字段为由取消既有发布。

### 最小组织与内部效果组合

两个公开入口各用单文件，不增加对称目录、仅转发的行为 module 或第二 adapter。入口提供 canonical 声明和导航；扩展整体定义继续由 interface 根入口组合，不把内部实现搬进 interface。

保持现有 State、Prompt 选择与 Marker area 的 internal seam。State 写入及效果顺序以既有 [State 权威](02-state-interface-cutover.md) 为准，不在本票复制或改写其规则；内部发布所需事实与回调由现有组合提供，不把 Marker 区域管理吸收到 State，不新增编排层。Command 的其他公开字段与运行时对象完整形状由 Command 票决定；authoring 组合由其拥有票承接，不能据此把内部 transport 再公开。

### 迁移与验收交接

迁移全部受影响消费者，包括内部定义、实现、adapter、扩展和测试；确认无调用后退出对应旧声明和导出，不保留兼容别名或转发。共享入口仍承载其他能力时不提前整体删除，内部仍使用原实现文件不等于扩展可继续导入它。合法策略列表、默认值、解析校验和选择工具不随声明公开。

实施需验证 canonical 来源、导入限制和 typecheck，并从真实 framework 交付路径观察扩展实际对象没有 markers 或内部 transport 旁路，不能仅以类型检查代替运行时证明。

行为验收要求：

- Prompt 首次/每次启用策略、slot identity、branch progress、既有注入频率与优先、交付位置/可见性/保留语义和 History preservation 不变。
- 两扩展共存时，停用一个只移除它自己的标记；另一个保留，全部不显示时由 framework 清空区域。
- 全进程唯一 Marker area、既有排序、Viewed session 投影，以及 State 写入、初始化、运行和视图变化的既有发布时机不变。
- 复用已有行为覆盖，仅为实际缺口补充测试；测试分层按 testing.md，最终三个真实扩展和两种 harness 的具体 smoke / dock 矩阵由整合票定稿，不预设新测试抽象。

修正架构能力表及相关入口说明中的旧可见范围；文档/ADR 交接由整合票统筹。本票仅改变契约可见性及入口归属，不修改既有领域语义，不以规划文档宣称生产切换或 harness 验收完成。

### 证据与限制

本轮静态读取 framework/core/definition.ts 中 Prompt/Marker 声明、core/protocol.ts 中 RunDelivery / PromptContribution / MarkerTransport 及命令交付、core/assembly.ts 的初始化交付、behaviors/marker.ts 的注册与区域发布；核对 framework/GLOSSARY.md、ADR-0002、能力架构说明与 State Lighthouse。

对 extensions 的精确符号/字段搜索观察到 codebase-tools 声明两种策略和 marker、connect-bot 声明 marker，未发现扩展直接使用 RunDelivery、PromptContribution 或 MarkerTransport；这仅是静态搜索结果，不是对任意间接运行路径的证明。find 调研工具因地区服务限制不可用，已用精确符号搜索及源文件片段补足本轮范围。

未修改生产代码、未运行行为测试或真实 harness smoke；上述为当前源码事实和未来实施验收要求，不是收窄后行为已通过的证据。发布检查只验证文档链接、状态、索引及决策前沿。

## Decision

Prompt 与 Marker 的扩展 interface 各用一个文件，只公开声明所需契约，内部运行交付、贡献结果和区域 transport 不对扩展公开；扩展实际交付同步移除 markers。保持既有声明式使用、领域行为及内部 seam，以消费者迁移和真实对象/行为验收完成后续干净切换，本票不执行该切换。

## User stories

1. 作为扩展作者，我希望只声明 Prompt 内容与策略，以便不必理解 adapter 的运行事实和贡献交付机制。
2. 作为扩展作者，我希望声明自己的 Marker 文本并沿用 State 操作，以便只影响自己的标记而不能覆盖或清空其他扩展的区域内容。
3. 作为 framework 维护者，我希望内部继续管理 Prompt 选择与 Marker area，以便保持分支进度、History preservation、全进程区域和 Viewed session 投影规则。
4. 作为迁移维护者，我希望唯一公开入口与实际扩展对象一致，以便移除旧导出和内部 transport 旁路，同时保留现有扩展及 harness 行为。

## Preconditions

- 统一 interface 原则已发布；扩展作者与 framework / adapter 维护者不是同一公开契约受众。
- 现有声明式 Prompt、Marker area 及 State 效果组合是行为保持依据；State 的公开操作与效果顺序由其 Lighthouse 提供。
- Command 与 authoring 票仍需提供完整交付和组合设计，整合票仍需确定迁移批次、消费者清单和验证矩阵；这些设计输入不必已实现，但不能把未决提供者视作已通过验收。

## Postconditions

- Prompt / Marker 公开成员、单文件归属、内部 transport 可见性、实际对象要求和行为验收边界已有完整规划答案。
- Command 可消费本票的 markers 退出裁决；其余 blockers 不变，其他交付字段不由本票决定。
- 初始化/authoring 组合与整合排程须消费此权威，迁移后保持内部发布，不通过其他公开入口重新暴露 transport。
- 实施必须迁移消费者、验证实际对象和行为后退出旧导出；本票 resolved 不代表生产行为已经完成。

## Invariants

- 延续统一 interface / 已完成 Session 的 canonical 声明和受限实际对象原则，不复制 Session 目录结构，不引入浅转发 module。
- 延续现有 Prompt 声明和选择 module、Marker area module 及 State 外部效果组合；公开 seam 收窄不要求重写 internal seam。
- 保持现有 Prompt / State / Owner / Session / Marker area / harness 支持语义；不因目录迁移新增功能或授权。
- 本地图只作规划，一项政策只有一个 Lighthouse 权威；其他决策票引用此结论而不复制另一份 Marker 可见性政策。
