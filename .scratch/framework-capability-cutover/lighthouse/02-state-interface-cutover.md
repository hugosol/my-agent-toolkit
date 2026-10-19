# 确定 State 完整契约与授权保持规则：Lighthouse

> Question and discussion: [确定 State 完整契约与授权保持规则](../decision/02-state-interface-cutover.md)
> Prerequisite: [统一 interface 所有权与迁移原则](01-shared-interface-policy.md)

## Question

如何将 State 的公开声明集中到一个扩展 interface，并在不增加权限体系或实现复杂度的前提下，保留现有声明值读写、Owner 生命周期、恢复、继承与效果组合语义？本票完整决定 State 范围；不代决 Command、Prompt / Marker 或 Feedback 的其他公开成员，不代表生产迁移完成。

## Discussion

### 确认来源与取舍

确认来源为本票本轮访谈，无独立会话定位符时以下问题编号和用户原话构成可恢复记录：

- Q1 用户「同意」集中六项公开契约。
- Q2 用户强调「现阶段我不建议做这一级的权限隔离，extension任何时候都保证完整访问和修改State的能力即可，只是必须通过interface访问」；随后 Q4 明确接受本扩展、当前所属 Owner 的范围，并要求「尽量保持原有语义来设计」。这不是任意 Owner、其他扩展或子代理共享写入的授权。
- Q5 用户同意受管理的 read/write，「这是更好的方式」；Q6 要求「尽量根据原来的使用场景，保持原有语义来设计」。
- Q10 用户同意实时读取，并追问是否为已有实现、是否增加复杂度；已依据 StateStore.writer/view 说明是现有实现，不新增机制。
- Q11 用户「同意」保留 delivery.state 与 delivery.capability.state 的受管理操作、原有撤销规则及子代理不可写。
- Q12 用户「同意，按当前设计，用最简单的方式实现即可，不需要新增复杂度」，确认效果外部实现、回调外部组合、State 写入路径执行既有顺序。
- 最终用户「Q13 Q14 同意，请进入下一步」，批准迁移边界、验收及本票完成发布。

早期“限制扩展只拿部分字段”的理解没有采用。采用的是隐藏内部实现、不新增逐字段权限、保持原有 Owner 场景；并非新增任意时刻无条件写入的能力。没有修改既有 ADR 政策，不需要翻转原授权决定。

### canonical 声明与最小入口

现有 framework/interface/state/index.ts 集中 StateDeclaration、StatePersistence、StateInheritance、OwnerReference、DeclaredValueSeam、OwnerCapabilityHandle 六项契约。前三项从 core/definition.ts 移入；framework 内部与其他消费者引用同一声明，不复制或兼容再导出。

默认值常量、合法值列表、解析与校验留在内部。StateStore、StateView、StateRules、写入 target、会话 reconciliation、owner lives、local access 均不是扩展公开入口。不增加子目录、浅包装 module、context.state、getState(ownerKey) 或多字段 State 模型。现阶段声明值仍是每扩展一个 boolean 字段。

### 扩展操作对象与授权保持

保留 Command delivery.state.read()/write()；后台效果保留 delivery.capability，通过其 state.read()/write() 与 feedback 操作；Session handler 保留 delivery.capability.state。不得为统一对象形状将普通交付与 retained capability 的生命周期强行合并。

扩展在原有可写 Owner 场景下完整操作本扩展声明值，不增加逐字段权限；知道 Owner key 不自动获得其他 Owner 的操作入口。子代理不拥有 cell：follow 读取 Owner 当前值，none 读取默认值；unresolved 读取默认值。其交付在行为上只读，现有类型可继续保留无效的 write 方法；扩大观察 scope 不扩大写入或 Owner Feedback 权限。

对象只提供公开操作，不交付内部 store、cell、Map 或 access。read 返回 boolean，不泄漏可变存储引用；write 进入同一受管理写入实现。此约束不是同进程安全沙箱，也不要求增加冻结或代理机制。

Owner 结束先撤销旧 retained capability，旧写入与通知无效，不能重新创建 cell 或发布 Marker；结束后取得的 capability 从一开始即无效；同 key 新生命周期不复活旧句柄。旧 capability.read 不冻结，继续读取该 key 的当前值。Session end 的 dispatch Feedback 与 retained Feedback 保持原有生命周期差异。普通交付 writer 保留现有用途及语义，不顺带新增撤销体系。

### 实时读取、恢复与效果组合

read 每次读取当前值，写后再读可见新值；需要操作前的值时由 handler 自行保存。修正 DeclaredValueSeam 中“交付开始时的值”的歧义说明，不引入快照、缓存或新的同步机制。

保持现有 session-entry / memory 恢复行为：session-entry 在既有边界取最后一份 payload 的合法 boolean，否则回到默认值；memory 不从 payload 恢复、不持久化。Owner 结束清理 cell；保持同 Owner 导航等既有 reconciliation 语义。恢复值不代表恢复定时器、注册等外部效果。

持久化介质与 Marker 各自保留既有 module。外部组装 persist(values)、publishMarker() 等效果回调；State 不选择 transport、解析 Marker 布局或吸收其他 module 的实现，也不新增外部编排层。State 写入路径按原顺序调用效果：先更新当前值，再对 session-entry 尝试持久化，最后发布 Marker。持久化失败不回滚当前值且不阻止 Marker 发布；Marker 发布失败传播且不回滚此前操作；相同值重复写入不去重。

OwnerCapabilityHandle 引用公开 FeedbackTransport，不重复定义 Feedback。State 内部需要 Marker 效果不构成公开 Marker transport 的理由；其他交付上的 transport 是否保留由其拥有票决定。

### 迁移与验收交接

迁移全部受影响消费者（含内部定义、实现、adapter、扩展及测试），确认无调用后删除 core/definition.ts 和 framework/public.ts 对应的旧 State 声明导出；不留兼容别名或转发。共享入口仍承载其他 capability 时不提前删除整个入口。同步更新 State 导航与读取契约说明。

实施需核实唯一声明来源、导入限制与 typecheck，并从实际 framework 交付路径检查 State 对象及返回值没有内部能力旁路。复用现有 State / owner-capability / inheritance / declared-value-write / import-boundary 等行为覆盖，保留必要 internal seam；仅行为缺口新增测试，不为测试扩大公开面。

行为验收包括实时读取、重复写入、持久化/发布失败结果、撤销与不复活、撤销后读取、恢复策略、继承与 unresolved 默认值。Command 中残余 persist/markers 与 spread 泄漏由 [Command 决策票](../decision/05-command-delivery-cutover.md) 处理；Marker 可见性由 [Prompt 与 Marker 决策票](../decision/03-prompt-marker-exposure.md) 决定，Feedback 的其余契约由 [Feedback 与 Host facts 决策票](../decision/04-host-feedback-authoring.md) 决定。最终真实扩展及 harness smoke 矩阵由 [整合决策票](../decision/07-cutover-integration-plan.md) 定稿。这些开放票是待决提供者，不是已实现或已通过验证的保证。

### 证据与限制

本轮静态读取了 framework/interface/state/index.ts、core/definition.ts、core/state.ts、core/protocol.ts、behaviors/control.ts、behaviors/session-events.ts，核对了扩展对声明值及 retained capability 的使用；参考 framework/GLOSSARY.md 与 ADR-0002 的 Owner-scoped effect capabilities / One State module 决定。writer/capability 返回操作对象、writer.read 实时读取、回调组合和子代理写入丢弃均有当前源码依据。

本轮没有修改生产代码、运行行为测试或 harness smoke；静态事实不是迁移后运行时验收证明。文档发布检查仅验证链接、状态与 tracker frontier。

## Decision

在现有 State interface 集中六项公开契约，保留受管理的 read/write、Owner 生命周期与恢复继承语义，不新增权限体系或复杂度。沿用外部效果组合与现有写入路径，迁移消费者后退出旧 State 导出；旁路收口和整体验收由相关票按各自范围承接。

## User stories

1. 作为扩展作者，我希望通过唯一 State interface 完整操作原有 Owner 场景下的声明值，以便不依赖内部存储，也不承担新增逐字段权限或调用迁移。
2. 作为后台效果作者，我希望保留受生命周期约束的 State 与 Feedback 操作，以便异步响应继续工作而旧 Owner 结束后不被迟到回调重建。
3. 作为 framework 维护者，我希望保留外部效果组合与既有实时读写、恢复和继承语义，以便收窄 interface 而不增加实现复杂度或改变现有扩展行为。
4. 作为迁移维护者，我希望实际交付对象与声明一致，并在消费者迁移后退出旧导出，以便消除内部能力旁路且完成唯一入口切换。

## Preconditions

- 遵循统一 interface 原则；既有 State、Owner、Session、Feedback 与 Marker module 及效果注入作为设计输入，而非要求重写。
- 维持现有每扩展一个 boolean 声明模型；任何新增字段模型或 Owner 授权变化需要另行决定。
- 下游票仍须解决自身 transport 可见性、完整交付形状及验证矩阵，不能仅凭本票声称整体封装完成。

## Postconditions

- State 的声明归属、操作对象、内部实现范围、行为保持、消费者迁移与验收要求已有完整规划答案。
- Command 可消费本票的 writer / retained capability 规则，不再等待 State 授权决定；其其他 blockers 不变。
- State 实施必须证明实际对象没有内部存储泄漏，所有写入经受管理路径，并迁移旧声明消费者；此处是设计要求，不是已经完成的生产保证。

## Invariants

- 与现有 StateStore module 对齐：值、Owner life、受管理写入及 reconciliation 保留同一深 module；持久化和 Marker 实现由外部组合，不复制或新增浅转发层。
- 与现有 State interface 操作对象及 Session 的实际对象收窄原则对齐，但不复制 Session 的目录结构或工厂对象层级。
- 保持 Owner、follow/none、session-entry/memory、实时读取、写入顺序、失败与重复写入语义；观察不授予额外写入能力。
- 公开声明唯一所有权，扩展不取得内部引擎；不提供按 Owner key 获取 writer 的入口。
- 本票是规划决策，不执行生产切换、不声明测试或 harness 通过。
