# 确定整合顺序、旧入口退役与验收交接：Lighthouse

> Question and discussion: [确定整合顺序、旧入口退役与验收交接](../decision/07-cutover-integration-plan.md)
> Prerequisites: [统一 interface 原则](01-shared-interface-policy.md)、[State](02-state-interface-cutover.md)、[Prompt / Marker](03-prompt-marker-exposure.md)、[Feedback、Host facts 与 authoring](04-host-feedback-authoring.md)、[Command](05-command-delivery-cutover.md)、[General](06-general-interface-cutover.md)

## Question

如何把已批准的公开契约与运行时收窄决定汇成可直接拆分实施任务的串行重构计划，明确残余声明、消费者、内部 port、旧入口退役及验证交接？本结论完成规划，不执行生产改造，不提供运行时通过或兼容性认证。

## Discussion

### 确认来源与范围

确认来源为本票本轮访谈，无独立会话定位符时，以下问题编号与原话构成可恢复记录：

- Q1 用户「Q1 同意Q1 同意」：按批完成声明、实际对象、消费者与验证；失败先修复或撤回该批未完成改动，不叠加下一批，不加兼容转发掩盖问题。
- Q2 用户「Q2 同意」：作者可声明的 requirement 类型归 authoring；完整验证词汇与框架自身要求留在内部。
- Q3 用户「本轮需求仅限代码重构，把interface作为最小接口暴露给extension层，不作其他功能扩充」：排除结构证据扫描、新诊断命令及其他功能扩建。
- Q4、Q5 用户分别「同意」：离线检查保留既有内部归属；批准下述六批串行顺序，内部 port 后迁，最终清理共享入口。
- Q6、Q7 用户分别「同意」：批准精确依赖放行、全部消费者迁移、五个实际 discovery 入口及分层验证与证据限制。
- Q8、Q9 用户「同意」：批准 port 的具体范围、内部实现保留规则、文档交接和仅规划的完成出口，授权整票发布。

本票不重开前置能力政策，不把架构方向文档中的候选视作已批准设计。必要测试和文档同步服务于重构，不是功能扩充。

### 唯一声明归属与入口导航

下表是归属导航；具体成员、行为和取舍以链接的原权威为准，不建立第二份 capability 政策。

| 目标入口 / 所有者 | 归属及原权威 |
| --- | --- |
| `framework/interface/index.ts` | `defineExtension` 与整体 authoring 的选择性导出，不汇总所有 capability；[共同原则](01-shared-interface-policy.md) |
| `framework/interface/details/definition.ts` | ExtensionDefinition、ExtensionConfigDeclaration、ConfigFieldType；[authoring](04-host-feedback-authoring.md) |
| `framework/interface/details/implementation.ts` | ExtensionAssembly、ExtensionFactory、ImplementationContext、ExtensionImplementation、InitializationDelivery；另拥有本票确认的 DeclarableRequiredSemantic；[authoring](04-host-feedback-authoring.md) |
| `framework/interface/state/index.ts` | State 声明、OwnerReference、DeclaredValueSeam、OwnerCapabilityHandle；[State](02-state-interface-cutover.md) |
| `framework/interface/session` | 已完成的 canonical Session 契约、受限观察与 recordCommit；不回退或再搬一份声明 |
| `framework/interface/prompt.ts`、`marker.ts` | 最小声明入口；[Prompt / Marker](03-prompt-marker-exposure.md) |
| `framework/interface/feedback/index.ts`、`host-facts/index.ts`、`subagent.ts` | 反馈、provider/catalog 事实、最小子代理声明；[对应权威](04-host-feedback-authoring.md) |
| `framework/interface/command/index.ts` 及 `details/definition.ts`、`details/implementation.ts` | 命令声明、实现与受限交付；[Command](05-command-delivery-cutover.md) |
| `framework/interface/general/http.ts`、`files.ts`、`config.ts` | 三个直接函数入口及最小类型/错误；无 General 汇总入口；[General](06-general-interface-cutover.md) |
| `framework/runtime/port.ts` | 单一 framework / adapter 交互契约，范围见下文 |
| `framework/core/integration.ts`、`framework/integration-check.ts` | 内部离线声明与检查，范围见下文 |
| 原有 `core`、`behaviors`、`modules` | 内部实现、校验、默认值和必要 internal seam；按迁移需要调整，不为目录对称搬家 |

DeclarableRequiredSemantic 由 authoring implementation 声明文件 canonical 拥有，并经根入口选择性导出；保留现有两项生命周期可声明值。内部 `core/requirements.ts` 引用此类型来组合完整 RequiredSemantic，保留 FRAMEWORK_REQUIRED_SEMANTICS。History preservation 不变成作者可选要求，不新增启动检查、降级或 gate。

SubagentCapability 按原权威迁到公开 `interface/subagent.ts`；SubagentExecutionMode、HarnessIntegrationDeclaration、ExtensionHarnessEntry 保留在内部 `core/integration.ts`，引用同一公开能力声明。现有独立 `integration-check.ts` 和脚本保持行为，不新增 tooling module、结构扫描、证据推导或 `check:capabilities`。

### 六批串行推进与共享文件

各批均迁移自身全部消费者、移除已无调用的旧声明/导出、收紧相关导入限制并验证，不能把消费者或实际对象收窄拖到最终批。必要 authoring 声明按所在批建立；以下共享文件是允许按本批职责修改的协作集，不是扩大实现重组范围的许可。类型、运行时效果、编辑文件和验证资源均有共享，未证明任何生产切片完全独立，本计划不批准并行实施。

| 批次 | 前置条件 | 主要修改面与共享集 | 退出条件 |
| --- | --- | --- | --- |
| State | 已发布共同原则与 State 权威；现有 Session/State 叶契约可用 | State interface、core/definition、core/state 及引用者、public、导入检查、受影响扩展/adapter/测试 | 声明单一来源；受管理读写与 Owner 生命周期保持；本批消费者完成，旧 State 导出退出 |
| Prompt / Marker | State 批完成；已发布最小公开范围 | prompt/marker interface、core/definition、core/protocol、core/assembly、control/actions/binding 中相关交付构造、内部发布及消费者 | 声明迁移；初始化和命令实际对象均无 markers 旁路；内部区域发布和 Prompt 行为保持 |
| Feedback / Host facts / Subagent / 必要 authoring | 前两批完成；对应权威可用 | 根 interface/details、feedback/host-facts/subagent、core/assembly/definition/protocol/integration/requirements、binding、两 adapter 的查询/通知实现、public 及消费者 | 最小事实与初始化契约落地；每种 adapter 的 provider/catalog 查询按原权威集中；反馈复用与初始化语义保持；authoring 和 requirement 归属落实 |
| Command | 前三批完成；State、Marker、Feedback、authoring 输入稳定 | command interface/details、core/definition/assembly/protocol、behaviors/control/actions/binding、adapter Control 与消费者 | run/unrecognized/actions 显式受限交付；persist 退出，既有 markers 退出不回退；不同 control 行为保持；无用 CommandActions 复核后删除 |
| General | 前四批完成；authoring 配置声明稳定 | general 三入口、modules/http/files、core/config、public、扩展自有诊断 helper、导入检查及消费者 | 函数行为与错误类身份保持；model-cost 退出 describeValue 内部依赖；旧公开声明及对应例外退出 |
| 内部 port 与最终收尾 | 前五批退出条件满足 | runtime/port、core/protocol 与全部交互消费者、残余 authoring/离线工具引用、public、导入检查、导航/ADR、验证脚本与测试 | 单一 port、无兼容壳；全部残余消费者有去处；旧公开入口与 extension legacy 例外清零；完成适用真实入口与整体验证 |

State 对公开 Feedback 叶契约的既有依赖不要求提前实施整批 Feedback；第三批消费已发布 Command 归属时可建立必要公开声明，第四批完成完整交付切换，不通过旧声明兼容转发实现批次衔接。第二批可先移除 markers，第四批再完成 Command 其余成员收口。

每批保持可 typecheck、可运行相关行为；失败先定位并修复该批，或撤回该批未完成改动到上一可验证状态，不能靠新兼容转发继续推进。共享旧入口仅为尚未迁移的真实内容暂留，不作最终兼容方案。昂贵测试和真实宿主运行使用共享工作树 quiet window；单个既有 dock 命令内部的隔离并行不等于批准生产切片并行。

### 内部 port 的范围与保留职责

`framework/runtime/port.ts` 拥有 HarnessPort、BindingResult、BindingFailure，以及交互所需的 StateValues、NoticeTransport、SessionDelivery、SessionDisposal、RoundSignal / RoundObservation、SessionContextObservation、ObservedSession / ObservationSource、SessionObservationSink / SessionObservationAccess、MarkerTransport、ViewedSessionPort、RunDelivery、PromptContribution、CommandInvocation、BoundCommand、TurnSignal / TurnSignalFacts。

已公开的 Session、State、Feedback、Host facts、Subagent、Command 与 authoring 声明由 port 引用 canonical 来源，不重复定义或兼容再导出。仅限内部的 DirectedDirective、解析、校验和 describeBindingFailure 等 helper 不要求整体搬入 port。内部实现文件若仍拥有真实职责可以保留；若迁移后已空则删除，不留下转发壳。不为此新增 runtime/binding、assembly、lifecycle 层，不拆第二 adapter 或 port。

### 消费者迁移清单与旧入口退出

实施开始及完成时重扫全部消费者；下表是本轮核对的迁移落点，不是假称未来零残余调用的静态证明。

| 消费者 | 迁移方向 / 验证职责 |
| --- | --- |
| 三个扩展的 definition.ts | defineExtension 改从 interface 根入口取得，声明形状依原权威 |
| connect-bot 的 command/command、panel/registration | Command 类型改从 command 入口取得；State retained 操作及反馈行为保持 |
| connect-bot 的 panel/client、panel/config | HTTP 与 getConfig 改从 general 对应入口取得 |
| model-cost 两种 harness assembly 与 shared-logic/runtime | 整体 implementation/初始化类型迁根 authoring；SubagentIntegration 迁 subagent；HTTP 选项迁 general；已完成 Session 调用保持 |
| model-cost 的 period-switch、provider-balance、codex-quota | ActionDelivery 迁 command；HTTP/错误迁 general；保留业务 gate 与当前查询规则 |
| model-cost 的 codex-estimate-store、consumption-store、consumption-document | 文件操作/错误迁 general；describeValue 改扩展自有小 helper，保持诊断效果，不增加 framework 工具公开面 |
| framework 定义、组装、binding、control/actions、State、观察及 Local access | 引用 canonical 公开声明和新的内部 port；保留必要 internal seam、运行效果组合和生命周期 |
| 两种 adapter 的 index/internal/domain | 公开事实用 interface，交互契约用 port；provider/catalog 查询按所属权威归并；离线 inventory 保留内部 integration 引用 |
| scripts 与 tests | 公共操作消费者迁相应 interface；真实需要内部工厂、双桩、配置 reader 等的覆盖保留内部 seam，不强迫测试全部只走公开入口 |
| 独立接入检查脚本与测试 | ExtensionDefinition / SubagentCapability 使用 canonical 声明，离线清单及 checker 仍使用 Q4 指定的现有内部入口 |

已观察到需同步的脚本包括 http-transport-smoke、pi-close-out-smoke、pi-provider-account-read 和 efficiency-baseline；此清单不免除全仓扫描。

七个 extension legacy 例外是 `framework/public`、`core/assembly`、`core/definition`、`core/config`、`core/integration`、`modules/http`、`modules/files`：随所属消费者迁移逐项退出，最终全部清空。内部文件仍有实现消费者可保留，但不得继续作为扩展入口。最终删除 `public.ts`，不保留 alias、re-export 或兼容路径。

### 导入限制与精确连接例外

- 扩展访问 framework 只允许 interface；harness assembly 保持选定 adapter 公开入口和既有 native escape hatch，不扩大到 adapter domain/internal。
- interface 默认只依赖 interface 声明；对 defineExtension、request、updateFile、getConfig 连接既有实现所需的具体路径精确放行，不放行整片 core/modules。
- 公开类型和错误类由 interface 唯一拥有，内部抛错与扩展识别用同一个类身份。连接例外不能 blanket re-export 内部声明、引擎或 helper，不能产生循环依赖。
- adapter 的公开契约用 interface、交互契约用 port；离线 inventory 与必要内部实现不因统一 port 被强制塞入其中。
- 保持 framework/adapter 不导入扩展业务，framework 不命名 native harness 包，以及已有原生依赖限制。旧公开入口扫描覆盖所有 framework、adapter、extension、script 和 test 消费者，不只扩展目录。

### 分层验证矩阵与证据要求

执行分层遵循 [testing.md](../../../docs/agents/testing.md)。下列是实施验收要求；本轮没有运行生产测试或真实 harness。具体用例的既有行为细则继续消费原 Lighthouse，不在此另立政策。

| 层 / 场景 | 观察内容 | 既有入口 / 运行范围 |
| --- | --- | --- |
| 迭代 | 本批行为、canonical 来源、导入限制；TS 改动 typecheck | 受影响测试文件；`bun run typecheck`；`tests/framework/import-boundary.test.ts` |
| 批完成 | 所属分区及跨分区消费者；harness-facing 改动对应 dock | `bun run test:framework`，按影响加 `bun test tests/connect-bot`、`bun run test:codebase-tools`、`bun test tests/model-cost` 和对应 `tests/harness-dock` 文件 |
| 实际交付 | initialize、directed run/unrecognized、actions 无未公开成员和嵌套旁路；获准 State/retained 操作仍有效，Action 不增权 | 从实际 framework 构造/交付路径观察；复用行为覆盖，缺口可用临时探针；不能只看类型或伪造 delivery |
| State / Session 保持 | 实时读写、重复写入、恢复继承、效果失败顺序、撤销不复活与撤销后读取；Session reader 不获写权，返回读数不修改保留值；单 dispatch/scope/commit/close-out 不回退 | framework 对应 State、owner、control、Session capability/observation/lifecycle 覆盖；跨消费者保存与反馈路径 |
| Prompt / Marker | 注入频率、History preservation；共存扩展只移除自身标记，全部关闭清空；Viewed session 投影、排序与发布时机保持 | framework injection/marker/viewed-marker/module-duplication；真实加载与 dock 对应场景 |
| Feedback / Host facts / Subagent / authoring | 三级 UI/stderr 且模型不可见；Owner/dispatch 有效期差异；实时 access、凭据变化、缺失值与请求开始时 catalog；初始化等待、结果稳定及 none/failed 区分 | framework feedback、implementation-lifecycle、subagent 与对应扩展/adapter 覆盖；下列真实入口 |
| Command | toggle/directed/actions 原有 Owner 范围、解析、重复执行、help、异步等待及错误报告；无持久化/transport 旁路 | framework control/actions 相关覆盖，三扩展分别承接 toggle、directed、actions |
| HTTP | 真实本机请求、代理、超时和响应体；配置失败不降级直连，公开错误身份一致 | `bun run smoke:http-transport` 及所属 framework 覆盖 |
| 文件 | 真实临时目录、多进程竞争、锁内重读、不丢更新、完整发布、失败分类与业务错误传递 | 既有文件行为覆盖与 model-cost storage-processes；受影响数据 smoke 可用 `bun run smoke:model-cost-data` |
| 配置 | 临时配置文件驱动真实 binding 成功/失败、getConfig 使用错误与原缓存时序 | 既有 framework 配置/binding 与扩展消费者覆盖；不增加绕过类型后的运行时写保护验收 |
| 最终整合 | 全仓静态/行为检查与适用真实入口；接入清单比较不是行为证明 | `bun run typecheck`、`bun run test`、`bun run check:integrations`；真实入口 smoke/dock 见下表 |

| 实际 discovery 入口 | 必需回归范围 | 可复用的现有真实运行入口 |
| --- | --- | --- |
| OMP / codebase-tools | loader、toggle、State 恢复/继承、Prompt、Feedback、Marker 共存/投影 | OMP dock 的 consumer-regression、session-recovery、viewed-marker 等适用场景；候选验证可复用 `bun run verify:omp-candidate` |
| OMP / connect-bot | loader、directed 与 unrecognized、初始化、受管理 State/retained feedback、退出与原定时器/注册生命周期 | 适用 OMP dock consumer-regression/binding-lifecycle 场景与 connect-bot 消费者覆盖；缺真实交付观察时补临时实际路径 smoke，不以双桩通过代替宿主加载 |
| OMP / model-cost | loader、actions、初始化、provider/catalog、Session/保存/commit、headless feedback 与 presentation 不回退 | 适用 OMP model-cost、binding-lifecycle 等 dock；`bun run verify:omp-candidate` 不单独代替全部扩展验收 |
| pi / codebase-tools | loader、toggle、恢复、Prompt/History、Feedback/Marker；原有适用子代理继承路径 | `bun scripts/pi-codebase-tools-smoke.ts`；适用共享行为与当前子代理路径 smoke，不拿历史无子代理记录替代当前路径 |
| pi / model-cost | loader、actions、初始化、provider/catalog、Session/保存与适用子代理路径 | `bun scripts/pi-model-cost-smoke.ts`；按影响运行 pi-subagent、pi-background-round、pi-terminal-round、pi-close-out smoke |

五个入口不是三扩展乘两 harness 的笛卡尔积；不新增 connect-bot / pi，不增加执行模式或版本支持。真实宿主使用隔离显式 entry 集及既有冻结安装/patch 条件，不改正式加载配置。测试分区和脚本名是现有入口，不宣称其当前场景天然覆盖全部新收窄要求；实施者必须按表中验收内容核对实际覆盖，缺口不能用静态导入或手造对象通过填补。

每次完成记录命令、退出状态、被测源码与依赖/lockfile、harness 精确版本及 patch、环境、已执行/通过/失败/未验证项。保持被测树稳定；先完成故障注入与恢复再开始最终回归。复用结果仅限相关源码、fixtures、依赖和环境未变。昂贵运行协调 quiet window，必要时先用 `bun run test:dock:serial` warm/诊断；已有单次 dock 隔离并行机制不授权多会话抢共享资源。

永久测试只补消费者可见行为缺口，不为声明搬家、转发、目录或 wiring 新增测试；必要内部 seam 保留。缺凭据、缺真实 TUI 观察、未覆盖平台或模式如实记录，不能算通过。必需验收缺证据则该项未完成；非本次支持范围的既有限制不变成扩展功能建设。规划完成、接入声明完整、自动测试通过和支持认证彼此独立，任何一项都不能代替其他证据。

### 文档与实施交接出口

在实施实际追上后同步现有 framework README、能力索引、扩展开发导航、capability 架构说明；ADR-0002 记录获批的非兼容公开契约切换并保留历史语境。修正未采用的独立 definition/assembly 目录、context.hostFacts、General capability、公开 Marker transport 等候选，不把候选与已批准权威并列为当前政策。不为目录对称新增说明文档；领域含义未变的词汇保持不动，支持记录只接收实际运行证据。

本 Lighthouse 交付可拆实施任务的六批计划、归属导航、消费者迁移、共享文件、依赖、退出条件、验证矩阵和证据限制；各 capability 具体政策仍由原 Lighthouse 唯一拥有。本会话不生成或执行 implementation tickets，不改正式配置，不声称已实现或验收通过。若实施发现必须改变既有领域语义才能收窄，携具体冲突重新取得决策，不以本计划自动授权变更。

### 证据与限制

本轮读取六份前置 Lighthouse、framework 领域词汇、ADR-0002、capability 架构说明、testing.md；核对 public.ts、requirements.ts、integration.ts、integration-check.ts、import-boundary 规则、protocol 的 port 组合以及 assembly 声明大纲。通过图谱大纲/符号检索及精确搜索核对残余声明、扩展/adapter/脚本引用、实际 discovery 入口和现有 smoke/dock 文件。

find 调研因地区服务限制未能判断候选，未以空结果推断缺失，改用精确搜索和图谱定位。上述是静态调查与规划证据；测试文件/脚本存在不代表已运行或已覆盖本轮全部验收。本轮仅发布规划文档；文档链接、状态与 frontier 检查另记于源票，不替代生产 smoke、typecheck、测试或 harness 认证。

## Decision

按六批串行完成最小 interface 与实际交付收窄，每批迁移自身消费者并验证，最后迁单一内部 port、退役全部旧公开入口及 legacy 例外。离线检查和深实现保持既有职责，以五个实际入口和分层行为证据验收；本决定完成规划，不扩功能、不执行生产切换。

## User stories

1. 作为扩展作者，我希望只通过最小 canonical interface 使用既有能力，以便不必理解内部引擎、transport 和生命周期实现。
2. 作为迁移维护者，我希望各批都完成消费者迁移并可验证，以便失败能归因，不把运行时旁路和兼容壳留到最后。
3. 作为 adapter 维护者，我希望公开事实、运行时 port 和离线清单各有明确归属，以便不重复声明、不把工具信息塞入运行时 seam。
4. 作为现有扩展维护者，我希望五个实际入口及通用模块有适用的真实行为验收，以便确认重构保持既有调用、生命周期和错误语义，而非只通过类型检查。
5. 作为实施接手者，我希望计划明确共享文件、顺序、退出条件与证据限制，以便直接拆分实施任务而不重新猜测关键设计或扩大功能范围。

## Preconditions

- 六项前置 Lighthouse 提供共同原则与完整能力设计，已发布而不要求已生产实现；具体成员和行为以原权威为准。
- 已完成 Session interface、原 State/Owner 生命周期、History preservation、Marker area、harness 适用条件作为保持基线。
- 实施时必须重新核对当前消费者和实际源码，准备适用隔离 harness/patch/依赖与共享工作树运行窗口；本轮静态清单不是未来零调用证明。

## Postconditions

- definition、assembly、requirements、integration checklist、公开入口、内部 port 与消费者迁移均有明确规划落点；六批顺序和逐批退出规则已批准，不批准生产并行。
- 最终验收覆盖七个 legacy 例外退出、public 删除、单一声明/错误身份、真实交付及五个实际入口；未验证不算通过。
- 本地图可结束规划并交接后续任务拆分；不以本票 resolved 声称代码切换、正式配置、支持状态或运行时验证已完成。

## Invariants

- 对齐既有 Session/State canonical 声明与显式受限对象模式；不回退 context.session、只读观察、recordCommit、单 dispatch 与原 scope。
- 对齐原 State、Prompt/Marker、Feedback/Host facts、Command、General 权威的行为保持和最小公开范围；配置只读有限例外只引用共同原则，不扩成其他能力的豁免。
- 对齐现有深 module 与 internal seam，不添加 registry、第二 adapter、通用 delivery 工厂、对称目录、兼容转发、工具功能或无关逻辑改造。
- 对齐现有测试分层、dock 隔离和独立兼容性验证；声明、结构检查、行为证据、正式支持互不替代，资源共享不授权生产并行。
- 一项政策只有一个 Lighthouse 权威；本票负责整合与交接，不复制上游规则或以计划文档宣称已落地。
