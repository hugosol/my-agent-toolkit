# 确定 Feedback、Host facts 与 authoring 契约归属：Lighthouse

> Question and discussion: [确定 Feedback、Host facts 与 authoring 契约归属](../decision/04-host-feedback-authoring.md)
> Prerequisite: [统一 interface 所有权与迁移原则](01-shared-interface-policy.md)
> Related authorities: [State 完整契约与授权保持规则](02-state-interface-cutover.md)、[Prompt 与 Marker 最小扩展可见范围](03-prompt-marker-exposure.md)

## Question

如何确定 Feedback、Host facts、Subagent 及整体 authoring 的 canonical 公开契约、初始化组合和最小代码组织，使 Command 收窄和最终入口切换具有稳定输入？本结论完整覆盖本票决策，不决定 Command 的完整 delivery、General 操作契约或最终实施排程。

## Discussion

### 确认来源与范围

本轮无独立会话定位符，下列问题编号和用户原话构成可恢复确认记录；后续轮次取代早期候选，不以未获回答的推荐作为批准：

- 初轮 Q1 被质疑：用户指出 Host facts 缺乏一致性，要求按真实职责组织；Q5 用户确认「同意，作为一个subagent相关的capability进行管理」。
- Q9 用户「同意」：CanAcceptInput 归 Command；不扩展 Session 或增加统一命令执行 gate。
- Q7 用户要求「使用最轻量的方式，只是把相关的逻辑放到同一个文件中」；Q10 用户「同意」：每种 adapter 内集中 provider/catalog 查询实现，不新增 manager 或统一规则引擎。
- Q8 用户明确「framework和extension共用一块底层接口……各自在上层有一级封装」；Q11 用户「同意」：复用底层实际通知输出，保留有职责的上层封装，不强制删除 NoticeTransport。
- Q4 用户「请修改ADR文档，以代码为准」：保持当前 info / warning / error 三级契约，并已按要求修正 ADR 严重度文字。
- Q13 用户「同意，尽量不要新增复杂抽象层」：保持 factory/context/initialize 的分工及最小交付形状。
- Q15 用户「同意」：已按原所有者文件 `01-shared-interface-policy.md` 确认根入口组织规则的旧到新修订；修订只在原统一原则权威发布，本票引用它。
- Q16 用户「隐藏执行模式」，说明其疑问在于验证 Q14 公开范围；确认不让 extension 依赖同进程/多进程的实现模式。共享业务逻辑消费同一套语义契约，不意味着共享 JS 实例/内存或两模式行为已经验证通过。
- Q17 用户要求看具体目录图，展示后回答「同意」：采用下述两个公开声明文件及根入口，不建立独立 assembly/factory/context 文件。
- 最终 Q18 明确列出迁移、行为保持及验收要求，用户「同意，请继续」，授权完成本票发布与追溯，不授权生产重构。

### 能力职责与公开声明归属

保留 `framework/interface/host-facts/index.ts`，canonical 拥有 CatalogPrice、CatalogPriceSource、ProviderHttpFacts、ProviderAccessFacts、ProviderAccess。这是 provider/catalog/响应事实的公开契约，不是所有 harness 来源信息的杂物入口；不提供原生 registry、credential store 或 HTTP client。

`CanAcceptInput` 由 Command interface 拥有，并继续通过对应执行会话的 Command / Action delivery 提供。它是按需查询的 true / false / undefined 事实，不是 framework 的统一操作许可；业务决定留在扩展。不新增 Session 方法，不将查询改为事件快照，不把未知伪造为空闲或工作中。Command 的入口路径与完整交付设计由其决策票负责。

新增轻量公开入口 `framework/interface/subagent.ts`，canonical 拥有 SubagentIntegration、SubagentIntegrationFailure、SubagentCapability。前两者表达初始化接入结果，后者支持 ExtensionDefinition.subagentRequirements 的声明。SubagentExecutionMode、HarnessIntegrationDeclaration 及 adapter 覆盖/独立检查的工具声明不因此成为 extension-facing 契约；最终内部/工具入口归属由整合票定稿。

不公开每个子代理的 in-process / cross-process 执行模式，不新增模式查询、调度器、注册管理器或运行时 capability 对象。两种模式由 framework/adapter 映射到共同语义；coverage 声明不是某次执行模式，也不是行为通过证据。subagents / none / failed 保持区分；none 是正常无集成形态，不掩盖 registration / identity / protocol 失败。接入结果在初始化时确定，不因之后子代理数量改变。

### 查询规则与轻量代码集中

- ProviderAccess.resolve 在操作需要时查询当时的宿主 access，包括凭据更新；无 access 返回 undefined，不借其他 provider 凭据，也不把缺失字段变成空字符串或默认地址。
- CatalogPriceSource.priceOf 是查询，无对应价格返回 undefined，不补默认价格。framework 在真实请求开始时查询扩展提供的 catalog，将结果放入该 Turn 的事实；不能用目录归并改变请求归属、取值时点或在 framework 新增价格缓存。
- ProviderHttpFacts 继续表达 adapter 能取得的响应事实，transport requestId 不是 Turn identity。
- 每种 adapter 将原 provider / pricing 的相关查询实现集中到自己的 `domain/host-facts.ts`。这是实际代码归并，不是只新增文档索引或转发文件；迁移其调用者并退役已无调用的旧实现入口，不把两种 harness 的原生代码搬进 framework。
- 不新增统一规则 manager、缓存、刷新机制、通用策略配置或订阅；各查询原有时点、异步形态及缺失含义保持。CanAcceptInput 与 Subagent 不混入这两个 adapter Host facts 文件。

### Feedback 的共享底层与上层封装

`framework/interface/feedback/index.ts` 继续 canonical 拥有 FeedbackLevel 和 FeedbackTransport.notify(level, message)，保持 info / warning / error，不增加通知总线、来源分类或路由机制。

每种 adapter 用同一个实际输出实现供 framework 提示和 extension 反馈调用：有 UI 时按严重度通知，无 UI 时写 stderr，均不进入模型上下文。当前两个 adapter 的 publishNotice 已体现该共享。framework 可保留 NoticeTransport.warn 等有职责的上层封装；仅供 framework/adapter 使用的 NoticeTransport 仍在内部 port，不向扩展公开，不为统一名称强行删除封装或新增浅转发 module。

上层保留各自的语义和有效期。retained owner feedback 与 session_end dispatch feedback 的生命周期遵守 State 权威，不在本票另立政策：共用底层不会复活已撤销的 Owner 句柄，也不会阻止 session_end 本次交付发出反馈。

旧到新文字裁决：ADR 的早期 info / error 表述改为当前代码的三级严重度；“framework 提示不合并”澄清为上层职责可区分、底层实际通知输出共用。用户明确选择以当前代码为保持目标，本轮不声称已重建三级引入的完整历史，也不改变通知行为。相关旧注释和架构能力表的进一步修订纳入实施文档交接。

### 整体 authoring 的入口和公开文件

入口组织的共同原则唯一权威是 [统一 interface 原则](01-shared-interface-policy.md)：根入口组织自己拥有的公开声明，按复杂度拆文件，不汇总导出所有 capability，不强制各 capability 复制 Session 的层数。该权威已按 Q15 修订，本票只确定具体落点：

| 文件 | canonical 内容 |
| --- | --- |
| framework/interface/index.ts | defineExtension 的公开入口；选择性导出下列整体契约，不转发内部实现类型 |
| framework/interface/details/definition.ts | ExtensionDefinition、ExtensionConfigDeclaration、ConfigFieldType |
| framework/interface/details/implementation.ts | ExtensionAssembly、ExtensionFactory、ImplementationContext、ExtensionImplementation、InitializationDelivery |

这些是公开 TypeScript 契约的组织，不是把 extension 的真实业务实现搬进 framework，也不是新增运行时层。ExtensionDefinition 引用各 capability 的声明；命令专属实现类型归 Command，Session 订阅类型归 Session，catalog 查询类型归 Host facts，不在根重新定义。

配置读取/解析/校验、默认值、闭合集、guards、normalizeCommandArgument 等内部 helper 不随类型公开。General 的 getConfig 操作、选项、可见错误由 General 决策票确定；整体扩展配置声明归本票确定的 authoring 文件，不授权暴露 Shared configuration。requiredSemantics 与其他残余 verification/tooling 词汇的精确落点仍由整合票汇总，不在本票预设新运行时能力。

### Context、初始化与生命周期

ImplementationContext 保持 config、可选 modelPrices、可选 providerAccess、session，不新增纯分类的 context.hostFacts。InitializationDelivery 保持 owner、hasUI、feedback、subagents；markers 按 Prompt / Marker 权威从公开声明和实际对象同时移除，不再通过 spread 或旁路泄漏。

factory 在声明配置已读取校验后构造 implementation，本身不发远程请求或启动定时器；一次性 initialize 承接启动工作，首个模型请求等待其完成。沿用既有初始化错误处理和 Implementation lifecycle，不重新初始化每个 Session，不新增清理或撤销体系。整体 implementation 继续组合 commands、subscriptions、catalog、initialize、cleanup；组合不改变各能力语义。

### 迁移与验收交接

迁移所有受影响 framework、adapter、extension、工具及测试消费者，确认无调用后移除对应旧声明和导出，不留兼容 alias/re-export；共享旧入口仍承载未迁移内容时不提前整体删除。

实施必须覆盖 canonical 来源、导入限制和 typecheck；从实际交付路径观察初始化对象无 markers 或其他内部能力旁路，而非仅检查静态类型。查询验收覆盖实时 provider access、凭据更新、缺失值与请求开始时 catalog 取值；通知验收覆盖三级严重度、UI/stderr、模型不可见性和原生命周期差异；Subagent 验收覆盖初始化结果稳定、none/failed 区分、不新增模式分支或启动 gate。

按 testing.md 使用既有行为覆盖和实际 smoke，不为归并文件或转发关系新增永久测试；只补消费者可见的真实行为缺口。三个真实扩展、两种 harness、适用执行模式的精确 smoke/dock 矩阵、共享工作树资源协调、完整入口退役与文档导航更新由整合票定稿。上述是实施验收要求，不是本次通过声明。

### 证据与限制

本轮静态读取 feedback/host-facts 叶契约、core/protocol 的 NoticeTransport、CanAcceptInput、SubagentIntegration，core/assembly 与 core/definition 的整体声明，以及两种 adapter 的 feedback 实现。LSP 查询执行模式与空闲查询类型的引用，核对 Session 入口组织；搜索实际字段调用，观察 connect-bot 注册初值查询和 model-cost 周期切换 gate、pi 初始化接入结果读取。图检索覆盖不足的结果用精确符号搜索补足，find 因服务地区限制不可用，不据此推断代码缺失。

当前 connect-bot 只有查询为 true 时报告 idle，其他结果报告 working；这是现有扩展业务分支，不是 framework 对 undefined 的定义。本次不修改该业务。adapter 的执行模式 coverage 声明仅是静态声明，不证明任一次子代理实际模式或运行正确性。

未修改生产代码，未运行行为测试、完整测试或真实 harness；只修改规划文档及用户要求的 ADR 文字。发布验证另记录于源票，不能替代后续迁移与 runtime 验收。

## Decision

将 Command 空闲查询、Subagent 接入契约与 provider/catalog Host facts 按使用职责归属，保留通知共用底层及有语义的上层封装；整体 authoring 通过根入口组织两组公开声明，保持既有交付与生命周期，以最小代码归并和静态/实际表面一致的迁移验收向后交接。本票完成的是设计决定，不是实现切换。

## User stories

1. 作为扩展作者，我希望从职责清楚的 capability 入口取得事实与接入结果，以便不理解 native registry、进程执行模式或内部 port 也能使用共同语义。
2. 作为命令作者，我希望取得执行会话的实时三值空闲查询，以便由业务决定初始状态或拒绝操作，而非接受全局命令 gate。
3. 作为维护者，我希望在每种 adapter 的一个 Host facts 文件中找到相关查询代码，以便修改时局部可读且不引入 manager、缓存或规则引擎。
4. 作为 framework 与扩展维护者，我希望通知共用一个实际输出实现而保留上层语义，以便严重度、操作者渠道和 Owner 生命周期一致且不泄漏内部提示接口。
5. 作为扩展作者，我希望整体编写契约由清楚的根入口组织，以便按 definition 与 implementation 阅读声明，不承担新的运行时抽象。
6. 作为整合维护者，我希望迁移、实际对象收窄与行为保持要求明确，以便串联 Command、General 和最终旧入口退役而不把规划当作验证通过。

## Preconditions

- 统一 interface 原则、State 权限与生命周期、Prompt / Marker 可见性权威已发布；Q15 的入口组织修订回原权威发布。
- 现有 Session 语义与 factory/implementation lifecycle 是保持依据；设计输入无需已实现，但后续必须完成实际迁移验证。
- Command、General 与整合票继续负责其未决范围，本票不预先批准完整命令交付或并行实施。

## Postconditions

- Command 获得已定的空闲查询归属、反馈/接入/authoring 输入，可继续自身完整交付设计。
- General 获得整体配置声明归属输入，仍需确定其操作和可见错误；整合票可汇总剩余工具声明、port、迁移顺序和验证矩阵。
- 未公开的 native 对象、执行模式、区域管理与内部提示通道不因组合而成为扩展能力；已无调用的旧路径最终退役。

## Invariants

- 保持 State Owner、恢复继承、retained 与 dispatch feedback 差异，以及已完成的 Session interface；共享逻辑不意味着跨进程共享实例/内存。
- 保持 History preservation、Marker area 所有权及 Prompt / Marker 已批准的最小公开范围，不重新公开 markers。
- interface 单一声明所有权与 runtime 表面一致；公开 details 文件不是内部实现，不增加对称目录或浅运行时层。
- provider/catalog 的不同查询规则不因同文件归并而统一；底层通知共用不抹平各上层有效期。
- 独立接入检查、静态 coverage 声明和行为验证彼此区分，不新增启动 gate，不声称两种执行模式已通过验证。
- 本地图只做规划；最终实施依赖、串行/并行判断及整体验收仍由整合票定稿。
