# Contract — Framework capability 与通用模块最小 interface 切换

Source: [Framework capability 与通用模块最小 interface 切换 Spec](spec.md)
Acceptance mode: Rapid iteration
Approval: approved

## Approval and inherited decisions

本契约的三个决策关已在当前对话依次明确确认：

- Seam selection：用户回答「同意5个seam」，批准下文 S1–S5，复用现有 seam，不新增生产 interface。
- 六面审视：用户对四项发现及记录方向回答「同意」；确认实际交付直接观察、失败机制独立证据、替身与真实运行不互相替代、行为保持与旧入口退役分别证明。
- Acceptance mode：用户选择「B. Rapid iteration」，批准只保留实际终端可读性的人工判断。其余实施、TDD、有用自动检查和必需真实运行仍由代理负责。

[Spec 的 Implementation Decisions](spec.md#implementation-decisions)、其链接的七项 Lighthouse 和 ADR 修订是继承事实，不是本契约待议事项。唯一声明归属、最小公开范围、实际对象收窄、配置有限例外、已完成 Session 的保持、单一内部 port、串行迁移及无兼容壳退出均沿用原批准；精确声明清单和归属不在此另立政策。实施排程由 spec 和后续 tickets 持有，本契约不编排构建顺序。

**Complete implementation and all assigned automated checks before the human-led acceptance round. Planned human-led checks do not pause otherwise executable work. At the final handoff, report the remaining checks together with their prepared evidence; they remain unverified until the user confirms them. Report genuine blockers when encountered.**

## Promises

Coverage 默认由代理完成，唯 P48 指定的可读性判断由人工确认。每项预期结果来自 spec、其既有权威或独立写出的字面量/场景，不从被测实现重新计算。引用的 stories 均属于 [Spec User Stories](spec.md#user-stories)；Implementation Decisions 和 Testing Decisions 适用于每项承诺。

|#|Promise (one observable result)|Coverage|Source|Seam|
|---|---|---|---|---|
|P01|扩展所需公开声明由其获准 interface 唯一拥有，整体 authoring 只组合自身契约而不汇总或重复拥有全部 capability。|代理：核对公开声明与实际消费者的依赖关系、编译及既有导入检查；不能仅以同名声明可编译判定唯一归属。|[story 1,5,6,7](spec.md#user-stories)|S5|
|P02|扩展取得的 CommandDelivery 仅有获准的 args、owner、hasUI、canAcceptInput、provider、feedback、state、capability 使用面。|代理：经过实际 framework 交付的 directed run 和 unrecognized 观察对象；确认 persist、markers 不可取得且获准 State 操作可用，不手造 delivery。|[story 2,20](spec.md#user-stories)|S1|
|P03|扩展取得的 ActionDelivery 不因重构获得 State writer、retained capability、persist 或 markers。|代理：执行实际 action，观察其交付使用面和无增权结果；类型检查只能作为补充。|[story 2,24](spec.md#user-stories)|S1|
|P04|初始化实际交付只提供 owner、hasUI、feedback、subagents 的获准使用面。|代理：真实构造并调用 initialize，观察无 markers 或内部 transport 旁路。|[story 2,33,34](spec.md#user-stories)|S1|
|P05|除已批准的配置有限例外，公开对象、嵌套操作及返回读数不提供取得内部引擎或修改 framework 保留数据的旁路。|代理：在实际交付中检查可达操作并尝试修改公开读数，观察 framework 保留值不受修改；不将其扩为同进程安全沙箱或任意反射攻击防护。|[story 3,46](spec.md#user-stories)|S1|
|P06|原有 defineExtension、factory 与 ImplementationContext 使用形式在获准契约内继续成立。|代理：现有扩展编译与实际构造；保持 config、可选 modelPrices/providerAccess 和 session，不新增纯分类 context 分组或 builder。|[story 4,34](spec.md#user-stories)|S1, S5|
|P07|可写 Owner 场景下，扩展可通过受管理操作完整读写自身 boolean 声明值，而不能凭 Owner key 取得额外 writer。|代理：从交付执行获准写入，区分两个扩展和不同 Owner 的结果；静态检查没有新增任意 Owner 查询或逐字段权限契约。|[story 8,20](spec.md#user-stories)|S1, S5|
|P08|State read 每次返回当前值，包括写后读取与旧 retained handle 的后续读取。|代理：使用独立指定的 true/false 转换和新生命周期场景观察，不能把交付开始值当作快照。|[story 9,10](spec.md#user-stories)|S1|
|P09|相同值的重复 State 写入仍执行原有持久化及 Marker 效果，不去重。|代理：同值重复写入，观察每次既有外部效果，而非只检查最终值。|[story 8,9,20](spec.md#user-stories)|S1|
|P10|State 写入先成为当前值，再尝试适用持久化，最后发布 Marker。|代理：在交付操作中观察读值与效果发生的顺序；memory 不产生持久化。|[story 8,20](spec.md#user-stories)|S1|
|P11|持久化失败不回滚 State 当前值，也不阻止其后的 Marker 发布。|代理：可控失败场景，独立观察读值与后续发布，不以正常路径替代。|[story 8,20](spec.md#user-stories)|S1|
|P12|Marker 发布失败传播给调用方，且不回滚已经发生的值更新或持久化。|代理：可控发布失败，观察错误、当前读值与先前持久化结果。|[story 8,20](spec.md#user-stories)|S1|
|P13|Owner 结束后，旧 retained 写入与反馈失效，不能重建值或在同 key 新生命周期中复活。|代理：保留 handle，结束 Owner，再执行迟到操作及同 key 重启；覆盖结束后新取 handle 从一开始无效。普通 delivery writer 不新增撤销语义。|[story 10,11](spec.md#user-stories)|S1|
|P14|session_end 本次 dispatch 的 Feedback 仍可发出通知，不被 retained handle 的撤销误伤。|代理：同一结束场景对比 retained 通知被丢弃与本次 dispatch 通知可见。|[story 12,32](spec.md#user-stories)|S1, S4|
|P15|子代理的 follow、none 和 unresolved 保持既有读取及默认值规则，观察 scope 不授予写入或 Owner Feedback 权限。|代理：Owner/child、不同继承声明与未解析归属的观察；跨进程仅覆盖既有适用路径，不宣称每次同步读取都远程确认。|[story 13](spec.md#user-stories)|S1, S4|
|P16|State 恢复保持 session-entry 对最后一份 payload 检查合法性并按需回退默认值的规则、memory 不恢复及同 Owner 导航语义，且不将恢复值当作外部效果已恢复。|代理：独立指定合法/非法最后 payload、memory 和导航场景；观察原有注册/定时器不因存储值被 framework 自动恢复。|[story 14](spec.md#user-stories)|S1, S4|
|P17|Prompt 的声明式策略仍按既有首次/每次启用、slot identity 和 branch progress 规则交付。|代理：实际启用、重复运行和分支场景，比对独立指定的贡献次数、位置、可见性和保留语义。|[story 15,16](spec.md#user-stories)|S1, S4|
|P18|framework 管理的贡献不删除、替换或重排既有历史派生请求内容。|代理：真实请求/会话记录对照既有历史前缀与允许的新贡献；不把缓存命中或跨 harness 相同角色作为额外保证。|[story 16](spec.md#user-stories)|S4|
|P19|扩展只能声明自身 Marker 文本并通过获准 State 影响显示，不能管理整个 Marker area。|代理：声明面检查及实际交付无 transport；观察有效 State 驱动的既有显示，不新增动态文本或手动区域操作。|[story 17](spec.md#user-stories)|S1, S4, S5|
|P20|共存扩展中停用一个仅移除它自己的 Marker，全部不显示时清空区域。|代理：两个有 Marker 的消费者与无 Marker 消费者共存；独立指定每一步的完整预期行集合。|[story 18](spec.md#user-stories)|S4|
|P21|Marker area 保持全进程唯一、既有排序、Viewed session 投影及发布时机，不将查看位置变成 Owner 或写权限。|代理：真实共存、视图切换及适用重复模块加载场景；内容和归属自动判断，可读性仅见 P48。|[story 19](spec.md#user-stories)|S1, S4|
|P22|toggle 保持仅 Owner 自身会话反转当前值并按原路径写入和反馈的行为。|代理：Owner 与子代理执行、连续两次 toggle，观察指定值序列和效果；以 codebase-tools 真实消费者回归补充。|[story 8,47](spec.md#user-stories)；[决定 5](spec.md#implementation-decisions)|S1, S4|
|P23|directed 保持 Owner 范围、空参数 activate、off deactivate 和每次调用均执行，handler 的写入不被 framework 推导或覆盖。|代理：重复 activate/off、handler 不写和自行写入场景；connect-bot 真实消费者回归。|[story 20,21](spec.md#user-stories)|S1, S4|
|P24|未识别 directed 参数只交给可选 unrecognized，保持解析后文本且不自动执行 run、写入、发布或反馈。|代理：指定未知文本、存在/缺少 unrecognized 的场景，分别观察 handler 输入与外部效果。|[story 21](spec.md#user-stories)|S1, S4|
|P25|actions 保持 trim、小写、全词匹配、既有调用范围以及空参数 info help、未知参数 error 同一 help 且不执行 action。|代理：已声明词、大小写/空白、缩写和未知词，核对执行选择与通知；不套用 toggle/directed 的 Owner gate。|[story 22,24](spec.md#user-stories)|S1, S4|
|P26|actions 等待异步完成，同步抛错与异步拒绝均按既有路径只报告一次错误。|代理：受控完成/拒绝与同步抛错，观察命令完成时点、错误次数；不引入重试、回滚或成功提示，不改变 directed 的执行模型。|[story 23](spec.md#user-stories)|S1, S4|
|P27|CanAcceptInput 保持对应执行会话的实时 true/false/undefined 查询，framework 不把它变成统一执行 gate。|代理：改变查询返回值后再次调用，观察三值及原有业务分支；不把 undefined 改为空闲。|[story 25](spec.md#user-stories)|S1, S4|
|P28|ProviderAccess 按需解析当前 access，凭据更新可见且缺失保持 undefined，不借用别的 provider 或补造字段。|代理：同一使用路径先后变更 access、缺失与其他 provider 情形，独立核对所交付事实和真实消费者行为。|[story 26,27](spec.md#user-stories)|S1, S4|
|P29|Catalog 在真实请求开始时取值形成该 Turn 事实，无价格保持 undefined，不因归并增加价格缓存或混同 transport requestId 与 Turn identity。|代理：请求前改变 catalog、缺价及不同标识场景，观察请求对应事实；不能用最终显示金额单独证明取值时点。|[story 26,28](spec.md#user-stories)|S1, S4|
|P30|每种 adapter 的 provider/catalog 查询实现按已批准职责轻量集中，不新增 manager、规则引擎或将其他事实混入。|代理：迁移审查核对实际代码归属和调用者，而不是只看是否有新入口；P28/P29 验证行为保持。不为文件布局新增永久行为测试。|[story 29](spec.md#user-stories)|S5|
|P31|Feedback 的 info/warning/error 均输出给操作者：有 UI 时通知、无 UI 时 stderr，且不进入模型上下文。|代理：三级 UI 与 headless 输出及实际请求/历史检查；通知可读性仅见 P48。|[story 30,31](spec.md#user-stories)|S1, S4|
|P32|framework 提示与扩展反馈共用每种 adapter 的实际输出，同时保留各自职责及生命周期。|代理：两类通知经过同一实际输出的迁移审查及运行观察，结合 P13/P14；不强制公开内部提示 interface。|[story 32](spec.md#user-stories)|S4, S5|
|P33|初始化 Subagent 接入结果区分 subagents、正常 none 和 failed，并在初始化后保持稳定而不公开执行模式。|代理：分别驱动接入结果、后续子代理数量变化及失败，核对真实交付；静态检查未扩大模式可见性。|[story 33](spec.md#user-stories)|S1, S4, S5|
|P34|factory 只在配置校验后构造，一次 initialize 的完成先于首个模型请求。|代理：校验成功/拒绝、首请求等待及跨 Session 场景的先后观察；保留 factory 不启动远程请求或定时器的约束。|[story 34](spec.md#user-stories)|S1, S4|
|P35|既有 cleanup、绑定失败处理和 disposed 实例不复用语义保持，不新增按 Session 重复初始化。|代理：配置/绑定失败、普通转移与实际 disposal 的生命周期覆盖；核对清理后不再交付且重建使用新实例。|[story 4,34,47](spec.md#user-stories)|S1, S4|
|P36|HTTP request 保持既有普通调用、选项和标准 Response，不暴露 transport 工厂或共享代理表。|代理：公开入口调用真实本机 HTTP、成功/非成功响应与 body 读取，检查公开声明及错误类单一身份。|[story 35](spec.md#user-stories)|S2, S5|
|P37|HTTP 保持代理启用/禁用和直连规则，命名代理配置失败在发出请求前拒绝且不降级直连。|代理：真实本机目标/代理与可控配置失败，核对目标收到的请求及不应出现的直连；不只检查错误文本。|[story 36](spec.md#user-stories)|S2|
|P38|HTTP 的预算选择、整次交换超时和原错误传播保持，包含响应体阶段。|代理：受控延迟响应头/body、代理路径及故障，观察实际完成/中止与错误，不以传入 timeout 数字代替计时机制证据。|[story 36](spec.md#user-stories)|S2|
|P39|协调文件更新在锁内取得最新值，多进程竞争不会丢失已经完成的更新。|代理：真实临时本机目录和独立子进程竞争，以独立计数/更新内容核对最终业务值与 updater 所见值。|[story 37](spec.md#user-stories)|S3|
|P40|文件读者只观察到完整旧文档或完整新文档，updateFile 返回已发布的 next。|代理：真实读写竞争及适用中断场景，核对完整内容与返回值；不以进程内模拟锁替代。|[story 37](spec.md#user-stories)|S3|
|P41|文件等待预算覆盖排队与锁获取，signal 只取消等待而不是回滚已开始更新。|代理：真实竞争中的超时、等待取消和更新开始后取消，观察拒绝/完成及最终文件。|[story 38](spec.md#user-stories)|S3|
|P42|文件协调错误保持 timeout/cancelled/io/corrupt 的公开分类，updater 业务错误原样传递。|代理：各适用失败场景及业务错误身份观察，核对公开错误类身份、kind/detail；不只验证抛错。|[story 38](spec.md#user-stories)|S3, S5|
|P43|getConfig 与 context.config 继续取得本进程 binding 已校验的 Extension configuration，加载失败与 getConfig 使用错误保持区分。|代理：临时真实配置文件驱动 binding 成功/失败及无可用配置的调用；核对公开错误身份，不向扩展开放 Shared configuration。|[story 39](spec.md#user-stories)|S1, S5|
|P44|配置保持 TypeScript Readonly、既有缓存/生效时序和实际对象交付，不新增冻结、复制或运行时写保护。|代理：编译契约及实际配置读取/缓存场景；不要求绕过类型后的修改防护，也不将此例外推广到 P05。|[story 40](spec.md#user-stories)|S1, S5|
|P45|model-cost 消费文档诊断保持既有效果，且不再依赖 framework 内部配置诊断 helper。|代理：既有非法文档场景比对消费者可见诊断，迁移审查核对依赖退出；不新增公共工具面或实现文本断言。|[story 41](spec.md#user-stories)|S4, S5|
|P46|五个既有 discovery 入口在各自适用 harness 中仍可实际加载并保持其已有消费者行为。|代理：OMP 的 codebase-tools/connect-bot/model-cost 与 pi 的 codebase-tools/model-cost，按 spec 的真实入口矩阵执行 loader、control、生命周期、保存/commit 和适用子代理回归；不以历史记录或声明比较代替当前运行。|[story 47](spec.md#user-stories)|S4|
|P47|已完成 Session 的只读观察、读数隔离、recordCommit、单 dispatch、scope 和 close-out 语义不回退。|代理：相关 framework/消费者覆盖与适用真实 Session 保存、结束及子代理场景，观察提交与实际内容；不以接口可编译代替。|[story 3,13,47](spec.md#user-stories)；[决定 8](spec.md#implementation-decisions)|S1, S4|
|P48|实际终端中的现有 Marker、通知及 model-cost 展示不发生明显可读性退化。|**人工保留：仅判断重构前后可读性保持，不重新设计展示。** 代理先完成全部有用自动检查、真实加载、字段/布局内容核对；准备隔离真实运行的版本/配置记录、终端录制或画面、适用宽度输出、自动检查结果、可比基线及复现步骤。最终统一提交用户确认；确认前此项未验证。loader、字段正确性、生命周期和错误语义仍属代理责任。|[story 19,30,47](spec.md#user-stories)；[Testing Decisions](spec.md#testing-decisions)，已批准的验收责任分配|S4|
|P49|最终获准依赖关系满足 spec：单一内部 port、公开声明引用 canonical 来源、原生访问范围不扩大、framework 不依赖扩展业务。|代理：既有静态检查、typecheck 及针对相关依赖的迁移审查；只精确放行普通函数连接，不增加通用生产 seam。静态告警的词法覆盖限制如实保留。|[story 42,46](spec.md#user-stories)|S5|
|P50|离线接入检查仍独立比较声明，不参与正常启动或被当成行为通过证明。|代理：独立检查的完整/缺失声明场景与现有实际入口加载观察，核对输出/退出结果及运行职责未扩大；History preservation 不变为作者可选要求。|[story 43](spec.md#user-stories)|S4, S5|
|P51|全部消费者完成迁移后，旧混合公开入口、七类 legacy 例外及无用旧声明退出，不保留兼容 alias 或转发壳。|代理：全仓消费者迁移核对、旧入口/导出退出检查、导入限制与 typecheck，涵盖脚本和测试而非只扩展；不得仅用运行成功证明退役。|[story 45](spec.md#user-stories)|S5|
|P52|每个实施交接都有可归因且范围准确的验证证据，不以局部绿色或计划完成代替未验证项。|代理：按 spec 的串行与分层要求交接命令、退出状态、源码/fixtures、依赖/lockfile、harness 版本/patch、环境及通过/失败/未验证范围；共享运行保持被测树稳定。P48 人工确认另行保留，不提前计为通过。|[story 44,48](spec.md#user-stories)|S4, S5|

交付关联由 `/to-tickets` 在上述 Coverage 中补入相应 ticket 链接与验收引用；当前不伪造 delivering work。承诺完成状态不存储为手工列：仅当交付工作完成、所有要求检查通过且适用人工确认已收到时才成立。用户请求进度时，再从契约与 tracker 推导清单。

## Seam decisions

|Seam|Exposes|Hides|Alternatives considered|Reversibility|
|---|---|---|---|---|
|S1 — 扩展 authoring 与实际交付 interface|扩展声明/factory、真实 framework 构造交付、获准 State/Session/Feedback 操作、初始化及配置结果。通过受控输入与效果观察具体错误和生命周期；不靠手造 delivery。|内部引擎、存储结构、区域 transport、解析与生命周期构造。必要 internal seam 不成为扩展契约。|拒绝仅类型检查或直接测私有构造：前者发现不了实际旁路，后者将承诺绑定实现。复用现有生产交付，不新增通用 delivery module。|既有公开契约的再改变涉及全部消费者，成本较高；调整证据案例不必修改生产 interface。|
|S2 — HTTP request interface|真实 HTTP 请求与代理路径、Response/body、超时及公开错误。|transport 工厂、共享配置读取与代理表的实现。|拒绝只看传给 transport 的参数：不能证明未直连或 body 阶段的实际超时。保留有用的已有内部覆盖，但不以它代替真实交换。|公开调用与错误已有消费者约束；本机验证场景可替换，不新增生产 interface。|
|S3 — 协调文件更新 updateFile interface|updater 获得的当前值、发布结果、真实文件读数、独立进程遇到的等待/取消/错误。|锁、队列、恢复、临时发布与协调算法。|拒绝进程内模拟锁作为跨进程证据；最终内容单独正确也不足以证明锁内重读及读者不见半份文档。|既有调用与失败契约保持；竞争场景与运行组织可调整，不能默改已承诺语义。|
|S4 — 五个真实 discovery 入口及可观察输出|实际 harness 加载、命令/请求/会话记录、通知/Marker/终端展示、适用消费者保存与子代理行为，以及对应运行证据。|native 映射实现和扩展内部组织。人工仅保留 P48 的可读性判断。|拒绝全部只走 framework 替身：无法证明 loader 与 native 映射；也拒绝用这一 seam 包办文件竞争、错误机制和静态退役，因其不能独立区分这些违规。|沿用现有入口与适用范围；新 harness、版本或执行模式需重新评估，不因本契约自动支持。|
|S5 — 公开声明及依赖 interface 的静态观察|canonical 来源、获准依赖、公开错误身份、实际归属、旧入口退役及离线检查职责。复用编译/导入/独立接入检查并进行必要迁移审查。|私有 helper 和内部算法布局，不将它们逐一升级为契约 seam。|拒绝用运行成功推断重复声明或旧入口消失；拒绝为文件搬迁新增永久源文本测试、新扫描工具或更宽的导入豁免。|重构既有检查以跟随获批 interface 是可逆的；重新开放旧入口或扩大原生访问需修改契约并重新批准。|

五个 seam 均为复用，未创建新生产 seam。它们分别承载不同可区分的违规，不能为追求一个 seam 而丢失证据。通过 deletion test 的关注点是保留既有深 module 的 leverage，而非按内部文件建立更多契约观察位置。

### External dependency categories

- **In-process**：State 与声明/生命周期计算的可控部分，从 S1 的交付与操作结果观察，不新增 adapter。
- **Local-substitutable**：可控制的配置、HTTP/代理端点、存储与进程环境，使用隔离本机实例。涉及实际超时、原子发布和进程竞争的承诺仍使用真实相应机制，不以纯内存替身代替。
- **True external (Mock)**：harness、第三方 provider 和外部 panel 的不受控实现。沿用已有 adapter 与可控回答验证指定失败/结果；S4 仍承担所需真实 harness 加载和映射。替身不证明真实外部运行；本契约不新增 provider 或 panel 协议。
- **Remote but owned (Ports & Adapters)**：本次没有要求新增由本仓库拥有的远程生产 module；现有 Local access 行为保持，不将其扩展为新远程调用协议或通用 port。

### 六面审视记录

|Surface|适用承诺与观察|审视结果|
|---|---|---|
|Entry|S1 的 authoring/交付、S2/S3 普通调用、S4 的实际加载、S5 的公开声明|全部适用；没有把生产入口成功降格为导入成功。|
|Data and state|State/继承/恢复、配置、历史、文件、Session 保存及读数隔离|全部适用；配置有限例外有明确范围，不把恢复值或显示值当作其他事实的证明。|
|External dependencies|本机 HTTP/代理、真实文件/子进程、两种 harness 及适用 provider/panel 行为|全部适用；可控替身与真实运行不互相替代，不扩大版本、模式或真实服务保证。|
|Errors and failure|受控持久化/Marker 失败、代理拒绝、HTTP 超时、文件分类、配置加载/使用错误、action 拒绝|全部适用；正常路径和最终值不能单独证明失败机制；不增加重试或回滚。|
|Output and observability|请求/历史、Marker、UI/stderr、诊断、离线检查及运行记录|全部适用；内容与可达性自动验证，只有 P48 可读性留给人工；报告不等于支持认证。|
|Resources and concurrency|Owner/retained 生命周期、初始化/cleanup、Session close-out、文件竞争与等待预算、共享运行资源|全部适用；附着于 S1/S3/S4 的既有承诺，不另立资源管理 seam 或新增性能目标。|

本轮没有不适用的整面。已确认的四项发现是兑现既有承诺所需的证据要求，不是新增用户行为：直接观察收窄、失败机制分别观察、替身/真实运行证明范围区分、行为保持/入口退役分别证明。此类证据要求若归类为 inferred，均为 **required to fulfill an existing promise**；不产生新的公开能力或取舍。内部构造选择留给 build，不升级为承诺；没有未获批的新行为或重大取舍。

## Not yet specified

无阻塞批准的 seam 或行为决定，也无本轮待毕业的 seam fog。具体场景数据、测试组织与交付 tickets 留给 `/to-tickets` 和实施，不是待决产品承诺。

P48 是已批准的未来人工验收，不是未决定的契约范围。若实施证据推翻某个 seam 或承诺，先修订并重新批准本契约，再重开受影响 tickets；不能让代码和契约默默漂移。只有出现新的、难逆且具有真实取舍的决定时再考虑 ADR；本轮仅复用既有 seam，不新增 ADR。

## Out of scope

完全继承 [Spec Out of Scope](spec.md#out-of-scope)，不复制或扩大。Rapid iteration 只分配验收责任，不减少任何承诺、跳过兼容保持、增加生产功能或授权修改正式加载配置。
