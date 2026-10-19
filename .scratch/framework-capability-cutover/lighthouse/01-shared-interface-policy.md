# 确定统一 interface 所有权与 authoring 迁移原则：Lighthouse

> Question and discussion: [确定统一 interface 所有权与 authoring 迁移原则](../decision/01-shared-interface-policy.md)

## Question

五项 capability 收窄共同遵循哪些契约归属、扩展可见性、interface 组织与迁移规则？本结论覆盖共同原则，不决定各 capability 的具体成员、函数形状、错误类清单或最终实施顺序。

## Discussion

### 确认来源与适用范围

确认来源为本票访谈：用户确认 Q1 的 capability 声明所有权、Q2 的运行时同步收窄、Q3 的有限实现调整、Q6 的按复杂度组织、Q8 的保留普通函数调用方式、Q9 的根入口、Q10 的按收益分组、Q11 的扩展可见性与 internal seam 保持原则，以及 Q12 的无调用者后关闭旧入口；最终对 Q13 的完整结论回答「同意，可以发布」。无外部会话定位符时，以这些问题编号和下列原话作为可恢复确认记录。

- Q2：「同意，这是这次interface改造的主要目标之一」。
- Q3：「主要调整interface目录，实现部分按需调整，但是不应作为主要重构对象」。
- Q6：「按照capability具体复杂度按需实现」。
- Q8：「普通函数先尽量按原来的方式保留调用方式，后续再考虑是否需要重构这一部分，这次主要目标集中再capability的封装上」。
- Q10：「根据具体收益判断，不需要机械按层级分组」。
- Q11：「面向extension的seam可能和实现真正的seam不在同一处，但是我们需要遵守extension层可见性原则，只向外暴露使用者需要知道的信息……原有的seam尽量不作调整」。
- Q12：「旧入口如果确认已经没有调用者可以关闭」。

本次是规划发布，不是实现或兼容性通过声明。不据此修改 State、Session、History preservation、Marker area 或 harness 支持的既有语义。

### 公开声明的唯一所有权

各 capability 拥有自己的 canonical 公开声明。framework 内部实现与 adapter 需要这些相同公开声明时引用它们，不在内部另定义一份。仅供 adapter/framework 交互的契约留在内部 port，不因名称相似而公开。

扩展整体的 Extension definition、Implementation factory、整体实现及实现生命周期契约，由 `framework/interface/index.ts` 提供公开入口；允许把其拥有的关联公开声明拆到根下的 `details/definition.ts` 与 `details/implementation.ts`。它们引用各 capability 的声明来组合完整扩展，不重复拥有各 capability 的规则。根入口不把所有 capability 汇总导出一遍。`details/` 属于公开 interface，不是内部实现或新增运行时层。

已批准的旧到新修订：原决定要求整体声明全部直接写入根 `index.ts`；现改为参考 Session 的入口组织规则，由根入口组织自身拥有的公开声明，按复杂度分文件，不要求各 capability 复制同一目录层数。确认来源：在「确定 Feedback、Host facts 与 authoring 契约归属」访谈 Q15 中，明确展示原所有者文件 `01-shared-interface-policy.md` 与旧到新内容，用户回答「Q15 同意」；随后对具体目录结构的 Q17 回答「同意」，最终对发布回答「同意，请继续」。[具体 authoring 归属与目标结构](04-host-feedback-authoring.md) 由该票权威承载。此前对独立 `definition/`、`assembly/` 运行时层和纯分类入口的拒绝继续有效。

authoring 只是「扩展编写与组装契约」的描述，不是新的 capability 或运行时 module。访谈早期提出的 `definition/`、`assembly/` 两套目录和后来的 `extension.ts` 候选均未获采用：它们没有被证明能增加 depth，只为分类增加入口不值得。

### interface 组织按实际复杂度展开

每项 capability 提供清楚的公开入口，简单内容可用一个文件，复杂内容才拆成目录和多个文件。不预设所有 capability 都有 Session 的 depth，不强制 `index.ts`、`details/` 等对称布局，也不新增仅转发的 module。

现有 Session 的 observation、subscriptions 和领域细节组织是其真实复杂度的结果，不是其他 capability 必须复制的模板。具体 capability 使用哪个文件或目录，由其决策票按实际内容确定。

### 扩展可见性与实际对象同步收窄

interface 只暴露扩展正确使用能力所需的信息。内部默认值常量、校验函数、合法值集合、引擎构造器与生命周期执行工具，不随公开声明一并导出；真实消费者需要新的操作时，先明确该操作的使用契约与收益，而非直接公开内部 helper。

不能只给完整引擎实例标注一个收窄类型后交给扩展。实际交付对象及其返回值不得成为取得未公开内部能力的路径；除下述扩展配置的有限例外外，承诺只读的返回值不能让扩展修改 framework 保留的数据。具体成员的保留、删除与可达性验收由各 capability 票决定，本票不一概批准深拷贝，也不声称提供同进程安全沙箱。

已批准的旧到新修订：原只读要求未区分扩展配置；现对 `getConfig` 与 `context.config` 保留现有 TypeScript `Readonly` 契约及实际对象交付方式，不新增冻结、复制或其他运行时写保护，不把绕过类型约束后的修改防护纳入本次验收。这不是运行时不可修改的保证，也不放宽其他 capability 已批准的实际对象收窄与隔离要求。确认来源：在「确定 General 操作与内部配置 seam 的隔离」访谈中，Q10 用户回答「不考虑极端情况，先不做限制」；Q12 明确展示归属文件 `01-shared-interface-policy.md` 及旧到新范围，说明 TypeScript 与运行时防护的区别后，用户明确回答「不需要运行时防护」，并对包含该有限修订的完整 Q13 回答「同意」。[General 决策与讨论](../decision/06-general-interface-cutover.md) 持有本轮交接，本段是该例外的唯一政策权威。

extension-facing seam 与 internal seam 可以不同。interface 的引入不要求改写原有实现 seam；内部测试可继续通过必要的 internal seam 验证实现，不为测试便利扩大扩展可见范围。

### 保留现有调用方式，不新增入口机制

`defineExtension`、`request`、`updateFile`、`getConfig` 尽量保持普通函数的现有调用方式。`defineExtension` 从 interface 根入口取得，其内部校验不公开；General 函数从相应 interface 入口取得，公开参数、结果及调用者确需识别的错误契约归 interface 所有，具体清单由对应票决定。

入口可连接内部实现，但不因此允许 interface 导出内部引擎或任意 helpers，也不制造循环依赖。不新增 runtime registry、入口注册流程、通用转发框架或另一套函数调用机制。原有导入检查按最终公开路径调整。

扩展继续采用 `defineExtension({...})` 与 adapter 接受定义及 factory 的编写形式，不为本次入口迁移引入新的 builder 或组装层。因能力收窄确需改变的成员访问，由对应票明确，不伪装成纯导入迁移。

### 工厂输入形状由封装收益决定

不强制全部平铺，也不强制按 capability 名称分组。现有 `context.session.observations` 与 `context.session.recordCommit` 保留，不回退已完成的 Session 封装。

不单为分类把 `modelPrices`、`providerAccess` 包装进 `context.hostFacts`。后续若具体设计能减少调用方知识、隐藏内部能力或维护共同约束，可以提出有实际收益的形状调整；不是批准所有现有字段永久不变。

interface 的文件/目录结构不机械映射到运行时对象层级，顶层字段与能力对象并存是允许的。

### 实现与 adapter seam 的调整范围

本轮以 interface 封装为主要对象。实现部分按需要调整，尽量保留原有 internal seam；不为目录一致性重排 `core`、`behaviors`、`modules`，不连带搬迁所有 binding、assembly、lifecycle 实现。

将 `HarnessPort` 及仅供 adapter/framework 交互的契约归入单一 `framework/runtime/port.ts` 入口；引用公开事实时使用 interface 的 canonical 声明。保持一个 port，不预先按 capability 拆分，不新增第二层 adapter 抽象。此项是有限的 port 契约迁移，不是批准完整 runtime 重组，具体排程由整合票决定。

### 无调用者后关闭旧入口

先迁移调用者并确认旧入口没有剩余调用者，再关闭对应旧入口或导出。共享入口仍承载未迁移内容时可暂留；已无调用者的旧导出可逐项移除，不提前删除仍需使用的整个入口。

最终不保留兼容别名或转发文件。内部实现文件仍被 framework 使用，不等于扩展可以继续导入它。所有现有消费者的迁移、残余导出检查及最终入口退役由 capability 票与整合票共同覆盖；具体顺序、扫描与检查方式由整合票定稿。

### 事实证据与边界

本次只读核对了 `framework/public.ts`、`core/definition.ts`、`core/assembly.ts`、Session interface 入口，以及 codebase-tools 定义与 model-cost OMP factory 的实际调用。观察到 public 混合整体契约、尚未迁出的 capability 契约和 ConfigReader/ConfigSource；model-cost 当前使用 config、session、modelPrices、providerAccess。这些事实用于评估迁移收益，不构成新 interface 的运行时证明。

`capability-interface-architecture.md` 中 definition/assembly 分目录、统一 context 分组和完整 runtime 目录形状属于候选方向，不是既有获批政策；本决定取代这些候选作为本努力的共同设计输入，不修订已完成 Session 的政策。实现时由整合票协调架构导航与 ADR 的必要更新，不在本次规划发布中假称目标已落地。

## Decision

以各 capability 的 canonical interface 封装扩展真正需要的信息，并同步收窄实际交付对象；按实际 depth 组织公开入口，保留现有调用形式和 internal seam，避免纯分类包装及无收益的实现重组。旧入口在消费者迁移、确认无调用后退出，本结论只授权规划约束，不代表生产切换完成。

## User stories

1. 作为扩展作者，我希望从唯一、清楚的 capability interface 获取契约，以便正确使用能力而不必了解内部引擎、transport 与生命周期实现。
2. 作为扩展作者，我希望实际交付对象符合公开契约，以便不能通过类型之外的路径触及未公开的 framework 能力。
3. 作为 framework 维护者，我希望按实际复杂度组织 interface 并尽量保留 internal seam，以便把重构集中在可见性与封装上，避免浅 module 和无收益的实现搬迁。
4. 作为现有扩展维护者，我希望保留普通函数和扩展工厂的既有调用形式，以便只承担能力收窄确有必要的调用调整，而非纯分类造成的迁移。
5. 作为 adapter 维护者，我希望通过单一内部 port 引用 framework 契约，以便继续复用公开语义事实而不依赖扩展业务或新增 adapter 抽象。
6. 作为整合维护者，我希望迁移消费者并确认无调用后再关闭旧入口，以便完成唯一公开入口的切换且不遗漏现有消费者。

## Preconditions

- 已完成 Session cutover 的 canonical 声明、受限运行时对象与既有语义作为参照，不把其他 capability 的现有公开范围当作新设计批准。
- 各 capability 票仍需提供具体公开成员、内部归属、消费者和行为约束；未解决的票不是已具备的实现。
- 整合票仍需确定精确迁移顺序、残余 authoring/requirements/integration 声明落点、导入限制、文档/ADR 变更与验证矩阵。
- 旧入口关闭以实际调用者核对和迁移为前提，本次只读观察不是未来零调用证明。

## Postconditions

- 后续设计采用唯一声明所有权及静态/运行时一致的扩展可见性标准；扩展配置只读保障按本权威的有限例外执行，不宣称已有运行时写保护。不再等待统一目录对称或统一 context 分组的决定。
- 整体扩展契约归 interface 根入口；各 capability 票细化自身契约，不建立新的 authoring 运行时 module。
- port 路径迁移纳入规划，完整内部目录重组不纳入；精确排程与验收仍由整合票决定。
- 消费者迁移和旧入口退役必须有明确交接；本规划发布不证明 typecheck、行为测试、真实扩展或任一 harness 通过。

## Invariants

- 保持现有 State 所有权与生命周期、Session 规则、History preservation、Marker area 所有权及 harness 支持约束；具体语义改变需另外明确裁决。
- 延续现有 `framework/interface/session` 的 canonical 契约和受限对象模式，但不要求其他 capability 复制它的目录或对象层次。
- framework 不导入扩展业务、不命名 native harness 包；adapter 保持既有 native 映射职责，扩展只使用获准 interface 和 adapter 组装入口。
- 同一个公开声明只有一个权威；内部 seam 不因测试或文件迁移自动成为扩展 seam。
- 本地图只做规划，不执行生产重构，不以文档发布替代运行时验证。
