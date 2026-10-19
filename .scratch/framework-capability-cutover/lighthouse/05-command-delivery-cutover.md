# 确定 Command 扩展交付的收窄与运行时隔离：Lighthouse

> Question and discussion: [确定 Command 扩展交付的收窄与运行时隔离](../decision/05-command-delivery-cutover.md)
> Prerequisites: [统一 interface 原则](01-shared-interface-policy.md)、[State 契约](02-state-interface-cutover.md)、[Prompt / Marker 可见范围](03-prompt-marker-exposure.md)、[Feedback、Host facts 与 authoring](04-host-feedback-authoring.md)

## Question

Command 的声明、实现契约和扩展交付如何由 canonical interface 拥有，并让实际对象退出内部持久化与 transport，保持现有不同 control 语义？本结论完整覆盖本票规划，不执行生产重构，不代决最终整合排程或 harness 验证矩阵。

## Discussion

### 确认来源与范围

本轮无独立会话定位符，以下问题编号与用户原话构成可恢复确认记录：

- Q1 用户「同意」：保留两种 delivery 的获准成员，不新增分类嵌套或 Action State 能力。
- Q2 用户「同意，interface层为extension开发者需要知道的契约，framework中与adapter层交互的部分不需要抽象出来」：公开作者所需契约，framework/adapter 交互留在内部 port，不新增抽象层。
- Q3 用户先询问 handler 与其他 capability 是否同一概念、能否使用同一种实现方式；澄清 handler 是扩展提供的处理函数，handle 是受限操作对象，delivery 不返回内部引擎后，用户「同意」沿用 State / Session 的显式受限对象与闭包模式。
- Q4 用户「参考其他capability的实现方式」：按现有复杂度规则组织；随后展示一个 command 入口、details/definition.ts 与 details/implementation.ts 的具体落点，并在 Q6 完整收尾获用户「同意」。不据此强制其他 capability 使用相同层数。
- Q5 用户「保持原有的不同语义，不需要统一」。
- Q6 对完整消费者迁移、实际交付验收、既有行为覆盖、三个扩展 smoke 交接和导航修订，用户「同意」，授权本票完成发布，不授权生产重构。

### 公开成员与唯一声明所有权

CommandDelivery 公开 args、owner、hasUI、canAcceptInput、provider、feedback、state、capability。ActionDelivery 公开 args、owner、hasUI、canAcceptInput、provider、feedback；不新增 State writer 或 retained capability。保留现有调用方式，不新增分类嵌套对象。

persist 从扩展声明与实际交付退出，内部通过既有受管理 State 写入路径使用持久化效果。markers 的退出直接消费 Prompt / Marker 权威，不在本票建立另一份 Marker 政策。State writer、retained capability 的授权、效果顺序和生命周期直接消费 State 权威，不统一普通交付与 retained 操作的有效期。

Command interface canonical 拥有：CommandDeclaration、CommandToggleDeclaration、CommandDirectedDeclaration、CommandActionsDeclaration、ControlKind；DirectedCommandImplementation、CommandAction、ActionsCommandImplementation、CommandImplementation、CommandImplementations；CommandDelivery、ActionDelivery、RecognizedDirective、CanAcceptInput。

CommandInvocation、BoundCommand 和包含 unrecognized 分支的内部解析结果 DirectedDirective 留在 framework/adapter 内部 port 或内部实现。扩展通过 run(directive, delivery) 与可选 unrecognized(argument, delivery) 使用 Directed control，不需构造内部解析结果。参数解析、声明校验、help、绑定及执行工具不随声明公开。整体 authoring 引用这些 canonical 声明，不重复拥有命令规则。

旧 CommandActions 组合类型当前精确搜索只见声明和旧导航，无代码消费者；实施时核实并删除，不保留与 CommandImplementations 并存的旧概念或兼容别名。

### 组织与受限对象模式

公开入口为 framework/interface/command/index.ts；关联公开声明按复杂度拆到 details/definition.ts（声明及 control kind）与 details/implementation.ts（命令实现、delivery、指令及查询契约）。details 是公开契约，不是内部实现。沿用 Session 的单入口与关联契约拆分方式，不搬迁实际命令实现，不增加浅运行时 module。

handler 与 Session 等 capability 一样，是扩展提供、framework 调用的处理函数；delivery 是其输入，handle 是可按规则保留的操作对象。framework 显式构造只含获准成员的 delivery，不再 spread 完整 invocation，也不把 invocation 原样传给 Action。嵌套操作对象同样不能成为取得内部引擎或 transport 的旁路。

复用 StateStore.writer()/capability() 的受限对象及闭包连接方式，参考 Session 显式构造受限对象的实现模式；不交付 StateStore 或 observation source 等内部引擎实例。不新增跨 capability 的通用 delivery 工厂、Proxy、过滤框架、统一冻结要求或新的撤销机制；保留现有 internal seam。

### 不同 control 的行为保持

- toggle 仅 Owner 自身会话执行，由 framework 反转当前值，经受管理 State 写入后发出原有反馈；不新增扩展 handler。
- directed 仅 Owner 自身会话调用 handler。保持空参数 activate、off 为 deactivate；每次调用执行，不去重、不新增串行化。handler 决定写什么或不写，framework 不推导结果或覆盖其写入。
- 未识别 directed 参数不进入 run；framework 不自动写入、发布或反馈，可选 unrecognized 保持现有解析后的文本与同类受限 delivery。内部解析规则不改为原始未处理文本。
- actions 保持现有调用范围，不套用另外两种 control 的 Owner gate。保持 trim、小写、全词匹配、声明校验；空参数 info help，未知参数 error 同一 help，不执行 action，无默认 action 或模糊匹配。
- actions 等待异步完成，同步抛错与异步拒绝按既有路径报告一次错误，不新增重试、回滚或成功提示。directed 不为一致性改成新的异步执行模型。
- CanAcceptInput 保持对应执行会话的实时 true/false/undefined 查询，由扩展决定业务分支，不新增 framework 执行许可。State 写入顺序、失败、重复写入、retained 撤销和读取按 State 权威保持。

### 迁移与验收交接

迁移全部 framework、adapter、extension 与测试消费者；无调用后删除旧声明、导出与无用 CommandActions，不留兼容别名或转发。共享入口尚承载其他能力时不提前删除整体入口。

实施必须验证 canonical 来源、导入限制与 typecheck，并实际调用 directed run、unrecognized 与 Command action，从真实 framework 交付路径观察对象无 persist、markers、内部引擎旁路；Directed 的获准 State 与 retained 操作仍有效，Action 不获得这些能力。类型检查不能替代实际对象证明。

复用现有 control、actions、State 与生命周期行为覆盖，仅为消费者可见的缺口新增永久测试，不为声明搬迁或转发新增测试。按 testing.md 分层验证。codebase-tools toggle、connect-bot Directed control、model-cost Command actions 承接三种使用路径；两种 harness 的适用 smoke/dock 场景、顺序及资源协调由整合票定稿，不把未验证视为通过。

同步更新能力表、Command 入口与导航，移除旧可见范围及无用类型说明；文档/ADR 的整体一致性由整合票统筹。本票不生成或执行生产实施任务。

### 证据与限制

本轮静态核对 core/protocol.ts 的指令与 Command/Action/BoundCommand 契约、core/definition.ts 命令声明、core/assembly.ts 命令实现组合、behaviors/control.ts 和 actions.ts 的真实构造与执行路径。当前 Directed 使用 spread，Action 原样传 invocation；这证明需要收口的代码路径，不是改造后的行为证明。

核对 core/state.ts 的 writer/capability 与 behaviors/binding.ts 的 Session 受限对象构造，及实际 interface 组织；搜索 connect-bot 的 CommandDelivery、DirectedCommandImplementation、RecognizedDirective 与 model-cost 的 ActionDelivery 消费者。图检索的窄过滤空结果用放宽查询和精确搜索补足；find 因地区服务限制不可用，不据此推断缺失。

历史建图的无写入探针是既有证据，本轮未重跑。未修改生产代码，未运行行为测试或真实 harness；本次规划发布验证仅覆盖文档链接、状态与 tracker frontier。

## Decision

Command 拥有扩展作者所需的唯一公开契约，实际交付通过既有受限对象模式移除内部持久化与 transport；保留各 control 的差异、原有授权与生命周期。迁移消费者并验证实际对象及行为后干净退出旧入口，最终 harness 验证矩阵交整合票决定。

## User stories

1. 作为扩展作者，我希望从唯一 Command 入口取得声明和处理函数契约，以便不依赖 adapter 注册与内部解析协议。
2. 作为 Directed control 作者，我希望通过获准 State 与 retained 操作执行效果，以便保持现有 Owner 和后台效果语义而不能绕过受管理写入。
3. 作为 Command action 作者，我希望保留事实输入、参数路由与异步等待，以便已有业务操作完成后命令才结束，且不被新增 State 能力或统一 gate 改变。
4. 作为维护者，我希望复用 State / Session 的受限对象模式，以便静态公开范围与实际对象一致而不增加通用运行时抽象。
5. 作为整合维护者，我希望有消费者迁移和真实交付验收要求，以便关闭旧路径并制定三个扩展与两种 harness 的完整验证矩阵。

## Preconditions

- 统一 interface、State、Prompt / Marker、Feedback / Host facts 与 authoring 的 Lighthouse 是前置设计权威；不要求已生产实现，也不以 resolved 证明行为通过。
- 既有 control、State 写入与 lifecycle 实现是行为保持依据，具体限制不因 interface 重组改变。
- 最终迁移批次、共享文件与资源冲突、旧入口整体退役和适用 harness 验证矩阵仍由整合票提供。

## Postconditions

- Command 的公开成员、内部类型、canonical 归属、组织方式、实际对象构造与行为保持已有完整规划答案。
- 整合票可消费本结论，与待决 General 一起确定最终实施路线；不据此批准并行实施。
- 后续实施须迁移所有消费者、观察真实交付与行为并关闭旧声明；本次发布不代表完成生产切换或兼容性验收。

## Invariants

- 对齐 Session 单入口与关联公开声明组织、State writer/capability 和 Session 的受限对象模式；不复制内部引擎、不新增统一 delivery module。
- 保持 State Owner、受管理效果顺序、retained 有效期、Session 规则、Marker area 所有权与两种 harness 支持约束。
- 保持 toggle / directed / actions 的不同调用范围、解析、重复执行、反馈和异步/错误规则，不借迁移增加功能或统一 gate。
- 一项公开声明只有一个权威；内部 framework/adapter port 不成为 extension-facing interface，不新增 adapter 抽象。
- 本地图仅规划；具体实现、typecheck、行为与 harness 验证不是本票已提供的保证。
