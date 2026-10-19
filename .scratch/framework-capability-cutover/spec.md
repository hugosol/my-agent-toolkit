# Framework capability 与通用模块最小 interface 切换

Status: ready-for-agent
Labels: ready-for-agent
Source: [Framework capability 统一收窄与 interface 切换：决策地图](map.md)
Contract: [获批承诺、seams 与验收责任](contract.md)

## Problem Statement

作为扩展作者，目前必须从混合公开入口、framework 内部声明、配置实现及通用模块实现中取得所需契约，难以判断哪些信息属于稳定的扩展使用面、哪些只是 framework 与 adapter 的交互细节。即使 TypeScript 声明看似收窄，实际 delivery 仍可能包含持久化或 Marker transport，使扩展绕过受管理的操作路径或接触不属于自己的区域管理能力。

作为维护者，仅迁移导入路径不能解决这些问题；重复声明、兼容转发和过大的公开范围还会继续增加维护成本。需要在保持三个现有扩展、五个实际 discovery 入口及既有领域语义的前提下，完成唯一公开声明归属、实际对象收窄和旧入口干净退役。

当前源码核对确认：Session 已拥有 canonical interface；State、Feedback、Host facts 已有叶契约，但其余 authoring 与 capability 声明仍混在旧公开入口中；Directed control 展开内部 invocation 构造 delivery，Command action 直接交付 invocation。以上是迁移前事实，不是新接口已实现或验证通过的声明。

## Solution

扩展只通过获准的最小 framework interface 使用能力与通用函数；harness assembly 继续使用选定 adapter 的公开组装入口和既有 native escape hatch。公开声明分别由所属 capability、通用模块或整体 authoring 唯一拥有，framework 和 adapter 引用同一声明。

扩展实际取得的对象与公开范围一致：State 通过既有受管理读写操作使用，Command 与初始化对象不再交付内部持久化及 Marker transport，Session 已完成的封装不回退。HTTP、协调文件更新与扩展配置继续保持普通函数形式和既有行为。

按已批准的六批顺序串行迁移，每批完成自己的声明、实际对象、全部消费者与相关验证；最终统一内部 port，移除旧公开入口及全部 extension legacy 导入例外，不保留兼容壳。重构不增加功能、不改变扩展业务或既有领域语义。

## User Stories

1. As an 扩展作者, I want 从唯一的 capability interface 获取声明, so that 我不必理解内部引擎或 adapter 协议。
2. As an 扩展作者, I want 实际 delivery 与公开契约一致, so that 类型收窄不是仅存在于编译期的承诺。
3. As an 扩展作者, I want 返回值及嵌套操作对象不泄漏内部能力, so that 无法借公开操作绕过封装。
4. As an 扩展作者, I want 保留现有 definition 与 factory 编写形式, so that 不为分类调整承担无收益的业务改写。
5. As an 扩展作者, I want 根入口只组织整体 authoring 契约, so that 各 capability 的职责和入口仍清晰可辨。
6. As an framework 维护者, I want 同一公开声明只有一个 canonical 来源, so that 内部实现、adapter 和扩展不会维护不同版本。
7. As an framework 维护者, I want 按实际复杂度组织 interface, so that 不产生对称目录或仅转发的浅 module。
8. As an State 使用者, I want 在原有可写 Owner 场景下完整读写本扩展声明值, so that 收窄实现不增加逐字段权限体系。
9. As an State 使用者, I want 每次 read 读取当前值, so that 写后读取及后台效果观察保持原有语义。
10. As an 后台效果作者, I want 保留受生命周期约束的 State 与 Feedback handle, so that 异步效果不需获取内部 store。
11. As an 后台效果作者, I want Owner 结束后旧写入和反馈失效且不复活, so that 迟到回调不能重建已结束的效果。
12. As an Session handler 作者, I want 保留 session_end 本次交付的反馈, so that 停止资源时仍可告知操作者。
13. As an 子代理扩展使用者, I want 保持 follow、none 与 unresolved 的读取和默认值规则, so that 观察范围扩大不会授予 State 写权。
14. As an 扩展维护者, I want State 恢复与外部效果恢复保持区分, so that 存储值不会被误当作定时器或注册仍在运行。
15. As an Prompt 作者, I want 继续声明内容与首次或每次启用策略, so that 无需掌握内部贡献选择与运行交付。
16. As an Prompt 使用者, I want 注入频率、分支进度和 History preservation 保持, so that 重构不改变模型收到的既有内容规则。
17. As an Marker 作者, I want 只声明自身 Marker 文本并通过 State 影响显示, so that 无法覆盖或清空其他扩展的标记。
18. As an 多扩展使用者, I want 停用一个扩展仅移除其自身标记, so that 其他扩展的状态仍可见。
19. As an 多会话使用者, I want 唯一 Marker area 保持 Viewed session 投影与排序, so that 查看切换不会改变 Owner 或误导显示。
20. As an Directed control 作者, I want 获得获准事实、State writer 与 retained capability, so that 继续通过受管理路径完成业务效果。
21. As an Directed control 作者, I want 空参数、off、重复执行及 unrecognized 分支保持, so that framework 不推导或覆盖 handler 的写入。
22. As an Command action 作者, I want 保持参数归一化、全词匹配和 help 规则, so that 不会出现默认 action 或模糊匹配。
23. As an Command action 使用者, I want 命令等待异步完成并按原路径报告一次错误, so that 操作结果不因重构提前结束或重复提示。
24. As an Command action 作者, I want 不新增 State writer 或 retained capability, so that actions 不因统一 delivery 而扩大权限。
25. As an Command 作者, I want 保留执行会话的实时三值 CanAcceptInput 查询, so that 未知不被当作空闲且业务判断仍由扩展负责。
26. As an 扩展作者, I want 按职责取得 provider、catalog 与响应事实, so that 不接触原生 registry、凭据存储或 HTTP client。
27. As an provider 查询使用者, I want 每次需要时取得当前 access, so that 凭据变化和缺失值保持真实含义。
28. As an catalog 使用者, I want 保持请求开始时的价格取值与无对应价格的 undefined, so that 不引入默认价格或新的缓存时序。
29. As an adapter 维护者, I want 本 adapter 的 provider/catalog 查询代码轻量集中, so that 修改具备 locality 而不增加 manager。
30. As an 扩展作者, I want 保留 info、warning、error 反馈, so that 操作者仍可区分通知严重度。
31. As an headless 使用者, I want 反馈走 stderr 且永不进入模型上下文, so that 无 UI 时仍可观察且不污染请求。
32. As an framework 维护者, I want framework 提示与扩展反馈复用底层输出并保留上层职责, so that 不以名称统一抹平生命周期差异。
33. As an 扩展作者, I want 获得稳定的初始化 Subagent 接入结果, so that 能区分正常 none 与接入失败而不依赖执行模式。
34. As an 扩展作者, I want 保持配置校验后构造、一次初始化和首请求等待, so that 入口迁移不改变启动效果时序。
35. As an 扩展作者, I want 通过最小 HTTP interface 发出普通请求, so that 不依赖 framework transport 工厂或代理表。
36. As an HTTP 使用者, I want 命名代理配置失败时拒绝发送且保留整次交换超时语义, so that 不会悄悄直连或改变错误行为。
37. As an 扩展存储作者, I want 保留协调文件更新的锁内重读与原子发布, so that 多进程竞争不会丢失已完成更新或暴露半份文件。
38. As an 文件更新使用者, I want 保持等待预算、取消及业务错误原样传递, so that 取消等待不会被误认为更新回滚。
39. As an 扩展作者, I want 读取 binding 已校验的 Extension configuration, so that 不需理解内部 reader、parser 或 Shared configuration。
40. As an 配置使用者, I want 保持 TypeScript Readonly 与现有缓存和实际对象交付, so that 本次不引入冻结、复制或新的生效时序。
41. As an model-cost 维护者, I want 自有消费文档诊断 helper, so that 退出内部配置 helper 依赖且不扩大 framework 公共工具面。
42. As an adapter 维护者, I want 通过单一内部 port 使用交互契约, so that 不重复公开声明且不新增 adapter 层。
43. As an 离线接入检查维护者, I want 清单与 checker 保持独立内部职责, so that 声明完整性不会变成启动 gate 或行为认证。
44. As an 迁移维护者, I want 各批串行完成消费者迁移和验证, so that 共享文件及运行资源不会使失败难以归因。
45. As an 扩展维护者, I want 所有旧入口和 legacy 例外在无调用后退役, so that 不留下第二套长期契约。
46. As an 测试维护者, I want 保留必要 internal seam 并优先复用行为覆盖, so that 不为测试便利扩大扩展公开面。
47. As an 现有扩展使用者, I want 五个实际 discovery 入口经过适用真实加载和行为验证, so that 不把类型检查误当成可运行保证。
48. As an 接手维护者, I want 明确已执行、失败与未验证范围, so that 规划完成、测试通过和 harness 支持声明不会混淆。

## Implementation Decisions

以下是 Wayfinder 已确认的事实与约束，不新增 seam 选择。各项具体政策以 Further Notes 的原 Lighthouse 为唯一权威；目录的精确落点沿用其归属导航，本节不重复文件路径。后续 `/to-contract` 负责选择仍未决定的验证 seams、批准 promises 及覆盖关系，不得把未讨论的设计当作本 spec 新批准的决定。

### 1. 共同所有权与封装

- capability 的 canonical 公开声明由自身 interface 拥有；整体 authoring 组合这些声明但不重复拥有规则。内部使用相同声明，不保留旧路径兼容导出。
- 根 authoring 入口提供 defineExtension 和自身整体契约的选择性导出，不汇总所有 capability。整体声明按 definition 与 implementation 两组组织；它们是公开声明组织，不是新的运行时层。
- extension-facing seam 可以不同于 internal seam；尽量保留既有深 module 与内部测试入口。本轮主要改 interface，实现只作必要调整，不为目录对称重排内部实现。
- 实际 delivery、嵌套操作与返回值不能成为取得未公开能力或修改 framework 保留数据的旁路；不将此包装为同进程安全沙箱，不普遍要求冻结、Proxy 或深拷贝。
- 唯一有限例外是 getConfig 与 context.config：保持 TypeScript Readonly、现有对象交付，不新增运行时写保护，不验收绕过类型后的修改防护。例外不扩展到其他 capability。
- defineExtension、request、updateFile、getConfig 保留普通函数形式。interface 对它们连接内部实现只作精确放行，不 blanket re-export、不放行整片内部实现、不产生循环依赖。

### 2. State

- State interface canonical 拥有 StateDeclaration、StatePersistence、StateInheritance、OwnerReference、DeclaredValueSeam、OwnerCapabilityHandle。默认值、校验、StateStore、cell、Map、Owner life、恢复和 Local access 保持内部。
- 保持每扩展一个 boolean 声明模型；不新增逐字段权限、任意 Owner writer、context.state 或新的 State 字段模型。普通 Command delivery 保留 state.read/write，后台效果与 Session handler 继续使用 retained capability 的既有入口。
- read 是实时读取，不是交付开始快照；相同值重复写入不去重。更新值后，对 session-entry 尝试持久化，再发布 Marker。持久化失败不回滚且不阻止发布；发布失败传播但不回滚此前操作。
- State 保有当前值、生命周期、受管理写入和恢复的深 module；持久化与 Marker 实现仍在各自 module，通过既有外部效果回调组合，不新增编排层。
- Owner 结束撤销旧 retained 写入与反馈，不重建 cell，同 key 新生命周期不复活旧 handle；结束后取得的 handle 从一开始无效。旧 handle 的 read 不冻结，仍读取当前值。普通 delivery writer 不新增撤销机制，session_end 的 dispatch Feedback 保留其既有独立有效期。
- session-entry 按既有边界使用最后一份 payload 中合法 boolean，否则用默认值；memory 不恢复、不持久化。保持同 Owner 导航与 reconciliation，不把恢复值当作恢复外部效果。
- 子代理不拥有 cell；follow 读取 Owner 当前值，none 和 unresolved 读取默认值。写入无效，扩大观察范围不增加 State 或 Owner Feedback 权限；不因本轮强制移除现有类型中行为无效的 write 方法。

### 3. Prompt 与 Marker

- Prompt 只公开 PromptDeclaration、PromptStrategy，保留 tag、strategy、content 和 first-enabled-run / every-enabled-run。RunDelivery、PromptContribution、选择工具和默认值保持内部。
- Marker 只公开 MarkerDeclaration，保留声明 text、由有效 State 驱动显示。不新增动态文本、独立显示/隐藏、刷新或区域操作。
- Prompt 与 Marker 各用一个简单公开入口，不机械复制 Session 层次。
- MarkerTransport 不公开；Initialization、Directed run/unrecognized 与 Action 的实际 delivery 均移除 markers，不能仅靠类型省略或展开内部对象继续泄漏。
- 全进程唯一 Marker area 的排序、Viewed session 投影、发布与清空仍归 framework 和 adapter。停用一项只移除自身标记，全部不显示时清空区域。
- 保持 Prompt slot identity、branch progress、注入频率与优先、交付位置/可见性/保留，以及 History preservation；不因接口迁移改变领域语义。

### 4. Feedback、Host facts、Subagent 与 authoring

- Feedback 继续公开 FeedbackLevel 与 FeedbackTransport.notify，保留 info / warning / error；每种 adapter 的 framework 提示与扩展反馈使用同一个实际 UI/stderr 输出，但允许保留有职责的内部 NoticeTransport 等上层封装。通知不进入模型上下文，不抹平 retained 与 dispatch 生命周期。
- Host facts canonical 拥有 CatalogPrice、CatalogPriceSource、ProviderHttpFacts、ProviderAccessFacts、ProviderAccess；不公开 native registry、credential store 或 HTTP client。
- ProviderAccess.resolve 按操作需要查询当前 access，无 access 为 undefined，不借用其他 provider 凭据、不补空字符串或默认地址。priceOf 无匹配为 undefined，真实请求开始时取值形成该 Turn 事实，不新增 framework 价格缓存。transport requestId 不是 Turn identity。
- 每种 adapter 将 provider/catalog 的实际查询实现集中为一个轻量 Host facts 文件，迁移调用者并退役无用旧实现入口；不新增 manager、规则引擎、刷新或订阅。CanAcceptInput 与 Subagent 不混入此归并。
- CanAcceptInput 归 Command，继续是执行会话按需查询的 true / false / undefined，不增加 Session 方法、全局执行许可或事件快照，不把 unknown 伪造成空闲或工作中。
- Subagent 最小公开范围是 SubagentIntegration、SubagentIntegrationFailure、SubagentCapability；不公开 SubagentExecutionMode 和逐执行模式查询。初始化 subagents / none / failed 保持区分，结果不随后续子代理数量改变；共享语义不意味着跨进程共享 JS 实例。
- 整体 authoring 的 definition 组拥有 ExtensionDefinition、ExtensionConfigDeclaration、ConfigFieldType；implementation 组拥有 ExtensionAssembly、ExtensionFactory、ImplementationContext、ExtensionImplementation、InitializationDelivery，并拥有 DeclarableRequiredSemantic。
- ImplementationContext 保持 config、可选 modelPrices、可选 providerAccess、session，不新增 context.hostFacts。InitializationDelivery 只保留 owner、hasUI、feedback、subagents。
- factory 在配置读取校验后构造 implementation，不发远程请求或启动定时器；一次性 initialize 承接启动效果，首个模型请求等待完成。保持 commands、subscriptions、catalog、initialize、cleanup 的组合和既有失败、清理、disposed 实例不复用规则，不按 Session 重复初始化。
- DeclarableRequiredSemantic 保留现有两项生命周期可声明值；完整 RequiredSemantic 与 framework 自身要求保持内部。History preservation 不是作者可选要求，不新增启动检查或降级。

### 5. Command

- Command 的唯一公开入口按声明与实现两组组织，拥有 CommandDeclaration、CommandToggleDeclaration、CommandDirectedDeclaration、CommandActionsDeclaration、ControlKind；DirectedCommandImplementation、CommandAction、ActionsCommandImplementation、CommandImplementation、CommandImplementations；CommandDelivery、ActionDelivery、RecognizedDirective、CanAcceptInput。
- CommandDelivery 只公开 args、owner、hasUI、canAcceptInput、provider、feedback、state、capability；ActionDelivery 只公开前六项，不增加 State writer 或 retained capability。不新增分类嵌套。
- persist 从公开声明和实际对象退出，内部仍通过受管理 State 路径持久化。CommandInvocation、BoundCommand、包含 unrecognized 的 DirectedDirective、解析、绑定与 help 工具保持内部。复核无调用后删除旧 CommandActions 组合概念，不保留兼容别名。
- 显式构造获准 delivery，沿用 State / Session 受限对象与闭包模式，不再展开完整 invocation 或原样交付 Action；不新增跨 capability 通用 delivery 工厂、过滤框架或新的撤销体系。
- toggle 仅 Owner 自身会话执行，由 framework 反转值并按既有顺序写入、反馈，不新增 handler。
- directed 仅 Owner 自身会话执行；空参数 activate，off deactivate，每次调用执行，不去重、不新增串行化。handler 决定是否写入，framework 不推导结果或覆盖值。未识别参数只进入可选 unrecognized，保留解析后的文本，不自动写入、发布或反馈，不统一为新的异步执行模型。
- actions 不套用上述 Owner gate；保持 trim、小写、全词匹配与声明校验。空参数 info help，未知参数 error 同一 help，均不执行 action；无默认 action、模糊匹配、重试或回滚。等待异步完成，同步抛错与异步拒绝沿原路径报告一次错误。

### 6. General 通用模块

- Framework general module 与 adapter-backed Framework capability 区分：General 只是独立通用功能的导航分组，不新增 adapter、注入对象或 registry。HTTP、文件、配置分别提供直接入口，不建 General 汇总入口，也不从 authoring 根入口汇总。
- HTTP 只公开 request、HttpRequestOptions、HttpConfigurationError。request 保持 URL 加 options、返回 Promise<Response>；options 保持 method、headers、字符串 body、timeoutMs、proxy，配置错误保留 detail。transport、工厂和共享配置 reader/parser 留在内部。
- 保持代理启用/禁用与直连规则、预算选择、整次交换超时和响应体读取行为；命名代理配置失败不降级直连。不增加序列化包装、统一 transport 错误体系、重试或缓存。
- 文件只公开 updateFile、SafeFileUpdateOptions、SafeFileUpdateError、SafeFileUpdateFailureKind。异步更新接收 current unknown 并返回发布的 next；等待预算覆盖进程内排队和跨进程锁，signal 只取消等待，不回滚已开始更新。
- 文件保持 timeout / cancelled / io / corrupt 分类及 kind、detail，业务 updater 错误原样传递；锁内重读、跨进程协调与完整原子发布不变。锁、队列、临时文件及重试常量内部化，不新增同步版本、公开锁、通用事务或网络卷/分布式正确性承诺。
- 配置只公开 getConfig 与 ExtensionConfigError；getConfig 读取 binding 在本进程已校验记录的扩展配置，使用错误与绑定加载错误区分。ConfigLoadError、reader/parser/source、readConfig、诊断和校验 helpers 保持内部；配置声明归 authoring，不重复拥有。
- Extension configuration 与 Shared configuration 保持区分；不开放代理表、runtimeDir 或 pi 子代理共享配置。保持原读取、校验、生效及缓存时序，不增加热更新或运行时写保护。
- model-cost 以扩展自有小 helper 保持消费文档诊断效果，退出 describeValue 内部依赖，不新增 framework 公共工具。
- 公开错误类由 interface canonical 拥有，内部抛出与消费者识别使用同一类身份，不能复制一份新错误类。

### 7. 内部 port、依赖边界与退役

- 维持一个 framework / adapter 内部 port，拥有 HarnessPort、BindingResult、BindingFailure，以及交互所需的 StateValues、NoticeTransport、SessionDelivery、SessionDisposal、RoundSignal / RoundObservation、SessionContextObservation、ObservedSession / ObservationSource、SessionObservationSink / SessionObservationAccess、MarkerTransport、ViewedSessionPort、RunDelivery、PromptContribution、CommandInvocation、BoundCommand、TurnSignal / TurnSignalFacts。
- port 引用 canonical 公开声明，不重复定义、不兼容再导出；DirectedDirective、解析、校验、诊断 helper 不强制搬入 port。仍有真实职责的内部实现保留，迁空则删除，不留转发壳，不新增完整 runtime 分层。
- 离线 integration 声明及 checker 保留内部归属；SubagentExecutionMode、HarnessIntegrationDeclaration、ExtensionHarnessEntry 不成为 extension-facing 契约。不新增 tooling module、结构扫描、诊断命令或 check:capabilities。
- 扩展只访问 interface；harness assembly 保持既有 adapter 公开入口及 native escape hatch，不能扩大到 adapter domain/internal。framework 不依赖扩展业务、不命名 native harness 包，保留已有原生边界。
- 全部 framework、adapter、extension、script 和 test 消费者均在迁移范围，不能只扫扩展。真实需要内部工厂或 reader 的测试继续使用内部入口，但不因此授权扩展导入。
- 七类旧扩展导入例外随消费者迁移逐项退出：旧混合公开入口、整体 assembly、definition、配置实现、integration 清单、HTTP 实现、文件实现。最终删除旧混合公开入口，无兼容 alias、re-export 或旧路径壳。
- 同步三个扩展的 definitions、connect-bot 命令/注册/HTTP/配置、model-cost 两 harness assemblies 与 runtime/actions/provider 查询/存储/诊断，以及 adapter、Local access、独立检查、smoke 和 baseline 脚本。具体旧清单只是起点，实施开始和完成都重扫。

### 8. 六批串行实施与文档交接

| 批次 | 进入条件 | 本批退出条件 |
| --- | --- | --- |
| State | 共同原则与 State 决策已发布 | canonical 声明、受管理读写与 Owner 规则落地；全部本批消费者迁移、旧 State 导出退出并完成相关验证 |
| Prompt / Marker | State 批完成 | 最小声明迁移；初始化和命令实际对象无 markers 旁路；内部发布、Prompt 和区域语义保持 |
| Feedback / Host facts / Subagent / 必要 authoring | 前两批完成 | 事实、反馈、初始化和整体 authoring 归属落地；adapter 查询实际归并；requirement 归属完成 |
| Command | 前三批完成 | run、unrecognized、actions 受限交付；persist 退出；markers 不回退；不同 control 语义保持；无用旧组合类型退出 |
| General | 前四批完成 | 三个直接入口、唯一错误身份、函数行为保持；诊断依赖和本批旧导入例外退出 |
| 内部 port 与最终收尾 | 前五批全部退出条件满足 | 单一内部 port、所有残余消费者迁移、旧公开入口及七类例外清零、文档与最终适用验证完成 |

- 不批准生产切片并行。每批必须迁移自身全部消费者、实际对象、限制和验证，不把这些拖到最后；必要 authoring 声明可在所属批建立，不借兼容转发衔接。State 使用现有 Feedback 叶契约不要求提前执行整批 Feedback。
- 每批保持可 typecheck、可运行相关行为；失败先修复该批或撤回该批未完成改动，不能叠加下一批掩盖失败。共享旧入口只为尚未迁移的真实内容暂留。
- 实现追上后更新现有 README、能力索引、扩展开发导航、架构说明及 ADR 的非兼容公开契约切换记录。修正未采用的 definition/assembly 分层、context.hostFacts、General capability 与公开 Marker transport 候选；保留历史语境，不新建无收益文档。
- State、Session、History preservation、Marker area、扩展业务、存储契约和 harness 支持范围保持。若必须改变领域语义，带具体冲突另行取得决策，而非推定本 spec 自动授权。

## Testing Decisions

本节记录已批准的测试先例、运行层级与行为保持约束，不选择新的测试 seam、不建立 promise-to-seam 覆盖设计。已有受限对象模式和内部入口仅作为先前确认事实；后续 `/to-contract` 决定剩余 seams 与 promises。

### 测试先例与约束

- 优先复用已有 State、owner-capability、inheritance、declared-value-write、control/actions、Session observation/lifecycle、injection、Marker/Viewed session/module-duplication、Feedback、implementation-lifecycle、Subagent、配置/binding、HTTP、文件与 model-cost storage-processes 覆盖。
- 永久测试只补消费者可见的行为、边界、生命周期或错误缺口，不为声明搬家、路径、目录、转发或 wiring 新增测试。保留必要 internal seam，不为测试扩大 extension interface；过时实现细节断言不重新锁定。
- 实际对象验收必须经过真实 framework 构造和交付的 initialize、directed run、unrecognized、actions，检查获准操作仍有效且无 persist、markers、内部引擎或嵌套旁路；类型检查或手造 delivery 不能代替。可用临时实际路径探针补观察缺口，不要求为接线新增永久测试。
- State 保持实时读取、重复写入、恢复/继承、持久化与发布失败顺序、撤销不复活、撤销后读取。Session 保持只读 observation、返回读数隔离、recordCommit、单 dispatch、scope 与 close-out。
- Prompt / Marker 保持注入与 History preservation、多扩展共存、全部关闭清空、全进程唯一、Viewed session 投影及既有发布时机。
- Feedback / Host facts / Subagent / authoring 保持三级 UI/stderr、模型不可见、生命周期差异、实时凭据变化/缺失值、请求开始时 catalog、初始化等待与稳定结果、none/failed 区分。
- Command 保持各 control 的不同范围、参数解析、重复执行、help、异步等待及错误路径。codebase-tools、connect-bot、model-cost 分别承担 toggle、directed、actions 的真实消费者回归。
- HTTP 使用真实本机请求与代理，观察超时、响应体和配置失败不降级直连；文件使用真实临时目录和多进程竞争，观察锁内重读、不丢更新、完整发布、失败分类和业务错误；配置使用临时配置文件驱动真实 binding，观察加载成功/失败、getConfig 使用错误及既有缓存。配置绕过类型后的写保护不在验收范围。

### 执行层级

- 迭代：运行受影响测试文件；TypeScript 改动运行 `bun run typecheck`，检查 canonical 来源及导入限制。
- 批完成：运行所属分区与跨分区受影响消费者；harness-facing 改动包括相应真实宿主 dock。现有分区包括 `bun run test:framework`、`bun run test:codebase-tools`、`bun test tests/connect-bot`、`bun test tests/model-cost`。
- General 的既有运行入口包括 `bun run smoke:http-transport` 与按影响采用 `bun run smoke:model-cost-data`；入口存在不表示已覆盖全部收窄要求，必须核对实际行为缺口。
- 最终整合：`bun run typecheck`、`bun run test`、`bun run check:integrations`，加全部适用真实入口 smoke/dock。接入完整性检查只比较声明，不是行为证明、兼容认证或启动 gate。

### 已确认的真实入口范围

| 实际入口 | 必需行为范围 | 已有运行先例 |
| --- | --- | --- |
| OMP / codebase-tools | loader、toggle、恢复/继承、Prompt、Feedback、Marker 共存与投影 | consumer-regression、session-recovery、viewed-marker dock；适用 `bun run verify:omp-candidate` |
| OMP / connect-bot | loader、directed/unrecognized、初始化、State/retained Feedback、退出与定时器/注册生命周期 | consumer-regression、binding-lifecycle dock 与扩展消费者覆盖；不足时增加临时真实路径 smoke |
| OMP / model-cost | loader、actions、初始化、provider/catalog、Session/保存/commit、headless Feedback、presentation | model-cost 与 binding-lifecycle dock；候选检查不能独自代替全部扩展验收 |
| pi / codebase-tools | loader、toggle、恢复、Prompt/History、Feedback/Marker、适用子代理继承 | 现有 pi-codebase-tools smoke 及当前适用子代理路径 |
| pi / model-cost | loader、actions、初始化、provider/catalog、Session/保存及适用子代理路径 | 现有 pi-model-cost smoke，按影响采用 pi-subagent、background-round、terminal-round、close-out smoke |

- 五个入口不是三个扩展乘两个 harness 的笛卡尔积，不新增 connect-bot / pi，不扩展执行模式、平台或版本支持。
- 真实宿主沿用隔离、显式 entry 集、冻结安装及 patch 条件，不修改正式加载配置。缺真实 TUI、凭据或模式覆盖的项目如实记为未验证，不以双桩、静态声明或历史无子代理记录替代当前要求。
- 共享工作树的昂贵/full/dock/真实宿主运行协调 quiet window，保持被测树稳定；先完成故障注入并恢复，再最终回归。单次既有 dock 的隔离并行不是生产实施并行授权；按需用 `bun run test:dock:serial` warm 或诊断资源干扰。
- 完成证据记录命令、退出状态、源码与 fixtures、依赖/lockfile、harness 精确版本与 patch、环境、已执行/通过/失败/未验证范围。只在相关输入和环境未变时复用结果；必需验收缺证据即未完成，不把绿色测试当成支持认证。

## Out of Scope

- 借重构新增 capability、扩展业务、控制类别、State 多字段模型、权限体系、任意 Owner 写入口或新的撤销机制。
- 改变已完成 Session、Owner、恢复继承、History preservation、Marker area 或扩展存储/业务语义。
- 第二 adapter、拆分多个 port、runtime capability registry、通用 DI、通用 delivery 工厂/Proxy/过滤框架、完整内部 runtime 目录重组或对称目录工程。
- 动态 Prompt/Marker 操作、扩展级 Marker 区域管理、新的模式查询、Subagent 调度器或执行模式分支。
- General 的 adapter 化、注入对象、汇总转发、HTTP 重试/缓存、同步文件 API、公开锁、通用事务、分布式文件保证、配置缓存时序重构或热更新。
- 配置冻结、复制或其他运行时写保护；将这一例外推广为其他 capability 的隔离豁免。
- 新诊断命令、结构证据扫描、工具功能扩建、启动兼容性 gate、自动降级或运行时协商。
- connect-bot / pi、新的 harness/版本/模式支持、正式安装或加载配置切换，以及未经证据的兼容性认证。
- 本次 spec 发布时实施生产改造、执行 implementation tickets 或声明运行时验收通过；本次只生成规格。

## Further Notes

### 规划来源与权威

本 spec 是已完成 Wayfinder 规划的下游实施需求综合，不修订原政策、不重新开启已解决的 decision tickets。具体成员、取舍、确认来源与精确目标归属保留在以下唯一权威，后续 contract 和任务拆分应同时消费它们：

1. [统一 interface 所有权与迁移原则](lighthouse/01-shared-interface-policy.md)，含扩展配置只读的有限例外。
2. [State 完整契约与授权保持规则](lighthouse/02-state-interface-cutover.md)。
3. [Prompt 与 Marker 最小扩展可见范围](lighthouse/03-prompt-marker-exposure.md)。
4. [Feedback、Host facts 与 authoring 契约归属](lighthouse/04-host-feedback-authoring.md)。
5. [Command 扩展交付的收窄与运行时隔离](lighthouse/05-command-delivery-cutover.md)。
6. [General 通用模块的最小公开 interface](lighthouse/06-general-interface-cutover.md)。
7. [整合顺序、旧入口退役与验收交接](lighthouse/07-cutover-integration-plan.md)，含精确目标归属、消费者、共享修改面及运行入口。

领域含义遵循 [framework 词汇](../../framework/GLOSSARY.md)；架构历史与已批准修订遵循 [ADR-0002](../../docs/adr/0002-semantic-extension-framework.md)；测试层级与共享工作树协调遵循 [测试约定](../../docs/agents/testing.md)。历史 ADR 的 first-release 叙述不覆盖后续已批准修订，也不是当前实现或支持证明。

### 本次证据与后续出口

本次为文档综合：读取全部七份 Lighthouse、地图、领域术语、ADR 和测试约定，抽查当前公开导出、State interface、Directed 与 Action 构造及现有运行脚本/实际入口。图谱对混合公开入口未返回声明，采用当前源文件补足；行为定位工具因服务地区限制不可用，采用精确符号搜索及源码片段核实，不以空结果推断实现不存在。

本 spec 的 ready-for-agent 表示按用户要求完成规格分流，不表示已拆完实施票或完成生产验证。后续 `/to-contract` 的三个决策关现已获明确确认，承诺、seams、验收模式及人工确认责任统一见 [获批契约](contract.md)，不在 spec 重复维护。下一步对该契约运行 `/to-tickets`，按本 spec 已批准的六批串行依赖拆分 implementation tickets。当前不运行生产 typecheck、行为测试或真实 harness，文档核验不能替代它们。
