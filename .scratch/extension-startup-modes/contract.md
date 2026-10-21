# Contract — Extension 手动模式与自动启动模式

Source: [Spec](./spec.md)
Acceptance mode: Rapid iteration
Approval: approved — S1/S2 seam、约束审查中的 B 方案、快速迭代及限定人工视觉验收均已获用户明确选择。

## Promises

Source 中的 story 编号引用 [Spec 的 User Stories](./spec.md#user-stories)；Implementation Decisions 同样引用该 spec。标记为 inferred/required 的项是履行既有承诺所必需的推论，不是新增可选功能。

Coverage 表示必须取得的证据，不表示已经执行或通过。所有实现、TDD、自动检查及可执行的真实环境验证由 agent 负责；仅下表明确标记 human-led 的视觉判断保留给用户。自动执行结束不等于人工验收通过。promise 是否完成由交付工作和所需检查结果派生，不维护状态列；交付工作的关联由 /to-tickets 补充。

**Complete implementation and all assigned automated checks before the human-led acceptance round. Planned human-led checks do not pause otherwise executable work. At the final handoff, report the remaining checks together with their prepared evidence; they remain unverified until the user confirms them. Report genuine blockers when encountered.**

预期结果必须来自本表、独立字面量或明确场景，不得通过复刻 implementation 的计算得到。各项可以共享真实运行证据，但不得用较低层结果替代本表明确要求的观察。

|#|Promise (one observable result)|Coverage|Source|Seam|
|---|---|---|---|---|
|P1|通过显式入口只加载所选 extension，未选 extension 不绑定也不产生业务效果。|自动：真实宿主单选及组合加载；观察命令可用性、被选消费者的效果与未选消费者无业务请求。|stories 1–3, 44|S2|
|P2|既有手动入口在原支持组合中保持可加载和可操作。|自动：真实宿主使用既有手动入口并执行原有操作；范围为 codebase-tools 的 pi/OMP 与 connect-bot 的 OMP。|stories 4, 6, 44|S2|
|P3|自动入口无需用户输入命令即可触发配置允许的首次启用。|自动：真实自动入口无命令启动，观察 codebase-tools 首轮贡献或 connect-bot 登记尝试，不以模块导入成功代替启用。|stories 5, 23|S1, S2|
|P4|相同有效启动配置在两种入口模式下产生相同启动结果。|自动：在相同历史与宿主条件下，对两种入口分别给定明确的 true/false 配置，分别对独立预期核对效果；不能仅比较两边相等。|stories 8, 12, 42|S1|
|P5|只有当前加载 extension 的对应启动条目参与字段校验。|自动：文档可解析时，未加载块的错误字段不影响有效已加载块；所加载块的非法值仍被识别。配置中存在条目不能引起代码加载。|stories 3, 9; Implementation Decisions 4|S1, S2|
|P6|切换启动模式不要求复制或改变 extension 的业务连接参数。|自动：两种模式使用同一业务配置指定的受控 endpoint 和请求预算，观察发送目标与受控超时行为。|story 10|S1, S2|
|P7|修改启动配置不强制改变运行中 State，新值在下次启动才参与选择。|自动：无历史影响的独立运行中修改配置，确认当前效果不受强制改变；下一次独立启动采用修改后的明确默认值。|story 11|S1, S2|
|P8|codebase-tools 无有效历史值时采用配置默认值，常规手动为 false、常规自动为 true。|自动：无历史场景观察首轮贡献、marker 交付及对应 State 效果。human-led：仅确认 OMP/pi 交互终端里 marker 的实际显示；agent 先准备隔离启动命令、场景清单、终端截图或录制及自动结果。|stories 13–14|S1, S2|
|P9|codebase-tools 的有效历史 true/false 均优先于相反的配置默认值。|自动：历史和默认值的四种布尔组合，核对首轮贡献及历史值未被错误覆盖。human-led：仅确认 OMP/pi 恢复场景的 marker 实际显示；agent 准备可恢复的隔离会话、启动命令、终端截图或录制及自动结果。|stories 16–18; Implementation Decisions 7–8|S1, S2|
|P10|codebase-tools 启动应用明确的启用目标，不会把已开启值取反。|自动：历史 true 与目标 true 的场景保持开启，观察实际贡献；不得通过模拟执行 toggle 实现启动。|story 15|S1|
|P11|codebase-tools 在首轮 prompt 规划前完成同步启动 State 设置。|自动：真实首个模型请求捕获应有贡献；请求完成后才出现的 marker 不足以满足此项。|stories 14, 20; Implementation Decisions 15|S1, S2|
|P12|启动后的 codebase-tools 命令保持原有 toggle 行为。|自动：启动后执行原命令，核对开启、关闭转换及贡献、marker 交付和持久化效果。|story 19|S1, S2|
|P13|启动模式不重置已有提示注入进度或删除历史消息。|自动：恢复具有已有贡献的会话，按既有注入规则观察后续请求和会话记录；独立核对旧消息保留，不重复注入不该重复的内容。|story 20|S1, S2|
|P14|codebase-tools 子代理继续 follow Owner 的当前值。|自动：受控 Owner 变更与真实 pi 子进程观察均保留跟随效果；原有未接通时默认读数不变，不以 childEntry 文本相等代替运行证据。|stories 21, 43|S1, S2|
|P15|connect-bot 常规手动启动不发起面板登记。|自动：启动后驱动运行与受控时间，无 register、heartbeat 或错误开启效果；不能只检查启动瞬间。|story 22|S1, S2|
|P16|connect-bot 的自动与命令启用满足同一面板协议及成功后业务规则。|自动：按独立协议预期观察 register、成功后的 heartbeat/状态报告与反馈；包括隔离真实面板的记录，不以客户端调用次数证明互操作。|stories 24, 28, 31|S1, S2|
|P17|connect-bot 登记响应未完成时，首个模型请求仍可发出。|自动：明确保持登记响应未完成，同时由独立模型 capture 端点确认真实请求已到达；不能用短超时、入队日志或最终成功推断。|story 25; Implementation Decisions 14|S2|
|P18|connect-bot 取得有效登记结果之前，实际 State 保持关闭。|自动：保持未完成、拒绝和成功的受控顺序，核对 marker 交付与协议效果；真实隔离面板读侧承担登记确认。human-led：仅确认 OMP 交互终端中成功前无启用 marker、成功后有 marker；agent 准备可控场景、隔离启动命令、终端截图或录制及时间顺序证据。|stories 26, 46|S1, S2|
|P19|connect-bot 登记失败沿用既有关闭与反馈规则，不阻止 agent 后续工作。|自动：受控失败后确认没有错误开启或 heartbeat，仍能完成模型请求及原有手动操作，不新增重试。human-led：仅确认 OMP 实际终端的失败反馈及关闭显示；agent 准备失败场景、隔离启动命令、终端截图或录制及自动结果。|story 27; Implementation Decisions 16|S1, S2|
|P20|登记未完成时执行 off，会使该次尝试失效，迟到成功不能重新开启。|自动：先执行 off，再释放有效成功响应，观察没有重新启用及后续 heartbeat。|story 29|S1, S2|
|P21|Owner 结束后，属于该 Owner 的迟到登记结果不能复活其效果。|自动：结束或转移 Owner 后释放旧响应，观察无错误开启、后续状态上报及遗留计时工作。|story 30|S1, S2|
|P22|connect-bot 保持 memory，旧历史载荷不能代替本次登记成功。|自动：以带旧开启载荷的首次会话启动，只有新有效 receipt 才能开启；不写入新的连接记忆或启用偏好。|story 32|S1, S2|
|P23|connect-bot 的子代理、无 UI 等既有拒绝条件不因自动模式而被绕过。|自动：分别驱动既有拒绝条件，核对原有反馈或静默规则、无登记请求及无启用效果；不通过放开准入使自动检查通过。|stories 33–34|S1, S2|
|P24|启动进程时恢复旧会话，仍参与首次启动策略判断。|自动：独立进程恢复有/无有效历史的会话，分别按 P9、P22 的规则观察，而非将启动恢复误当成运行中切换。|story 35|S1, S2|
|P25|首次启动之后的会话切换不重新应用入口启动配置。|自动：覆盖后续 new/resume/fork 和保持同 Owner 的导航，观察结果由原有会话规则决定，而非再次执行启动默认或登记。|story 36|S1, S2|
|P26|首次启动的自动触发不会因重复观察或首轮请求再次执行。|自动：重复相关观察并驱动模型请求，不产生额外自动登记；人工重复 directed 调用仍保持原语义，不增加命令去重。|story 37; Implementation Decisions 17|S1, S2|
|P27|既有 initialize、cleanup 和子代理接入的生命周期与等待语义不被改变。|自动：原有必需等待仍有效，面板登记不追加等待；同场景控制旧初始化和未完成登记，区分二者。原 cleanup/处置行为继续成立。|story 45|S1, S2|
|P28|同一公共 framework 装配能力支持两个真实消费者的启动控制。|自动：经同一公开能力驱动纯声明 State 消费者与有外部效果的消费者，纯声明者不需要空业务初始化函数；既有静态检查补充依赖方向和声明可检查性证据。|stories 39–42; Implementation Decisions 9, 11–13|S1|
|P29|按文档互斥选择模式入口，能避免同一 extension 的双绑定。|自动：真实加载互斥入口集合，核对命令和业务效果唯一；文档明确加载是追加语义，不承诺误用时新增检测或自动合并。|story 38; Implementation Decisions 19|S2|
|P30|使用说明明确区分加载、启动目标、实际 State 与非阻塞登记。|自动：文档、链接和可执行启动示例与实际运行证据一致；不建立固定措辞或源码文本测试。|story 46; Further Notes|S2|
|P31|从其他项目工作目录启动，配置仍来自入口明确选择的来源。|自动：同一入口在不同临时工作目录运行，并放置不同干扰配置；观察选中配置的行为，不只核对计算出的路径。|inferred/required：stories 6–10 与既有装配配置解析语义|S2|
|P32|Owner 的登记、计时器与异步结果不污染另一个 extension 的 State 或效果。|自动：两消费者组合运行，关闭或结束 connect-bot 后，codebase-tools 仍保持自己的贡献和状态；旧 Owner 无后续业务工作。|inferred/required：stories 2, 21, 29–30 及既有 Owner/State 隔离|S1, S2|
|P33|模式由显式入口静态选择启动配置，不要求新的运行时配置档参数。|自动：使用常规宿主参数分别加载两种入口，独立观察所选默认值；不以参数名称的源码断言代替运行。|story 7; Implementation Decisions 3, 5; Out of Scope|S2|
|P34|无效的已加载启动配置导致该绑定拒绝及可见诊断，不静默降级，其他有效绑定继续。|自动：受控缺失、类型错误和不可解析配置产生拒绝及诊断；被拒绝者无业务副作用；同场景中配置有效的邻接扩展仍可用。|inferred/required：stories 6–10 与既有配置校验原则；约束审查纳入|S1, S2|
|P35|codebase-tools 自动开启沿用 session-entry 写入，正常保存后手动模式恢复仍按历史 true 开启。|自动：无历史会话由自动入口无命令开启，记录原格式的 true；独立进程用手动入口恢复，捕获首轮开启贡献。沿用既有尽力持久化，不增加事务、重试或崩溃可靠性保证。|约束审查用户明确选择 B；stories 14, 16–18|S1, S2|
|P36|手动默认关闭且没有启用或命令操作时，不因启动本身新增 State 记录。|自动：无历史、手动默认关闭的运行退出后，无新增 State 载荷；不禁止宿主正常写入其他会话记录。|stories 6, 13；B 的既有行为兼容约束|S1, S2|

## Seam decisions

|Seam|Exposes|Hides|Alternatives considered|Reversibility|
|---|---|---|---|---|
|S1 公共 extension 装配／宿主交付 interface|公共 adapter factory 消费的启动配置与业务启用声明，以及命令、prompt、marker、持久化、诊断和生命周期效果；使用宿主 surface double 可控地交付输入。现有公共 interface 可以进行表达启动所必需的最小补充，但不改写 initialize 的等待含义。|配置读取与缓存、State 存储、事件派发、注册队列和业务对象的内部构造。无需新增测试专用启动入口或私有 State 调试读口。|拒绝把私有 State、配置或派发函数作为契约观察点：局部正确无法证明消费者时序，且会将契约绑定内部拆分。也不新增独立启动 runtime。|复用现有 interface。内部构造可变；改变公开启动语义时需同步两个消费者、两个 adapter 及本契约，不能静默漂移。|
|S2 真实 harness 的显式加载与运行 interface|真实入口加载和静态配置选择、首轮模型请求、会话记录、原生反馈、子进程跟随、面板请求与隔离真实面板读侧。模型请求捕获、面板协议与面板读侧是独立观察，不互相代替。|loader、隔离进程控制、证据采集及网络运行设施的内部构造。不增加生产调试入口。|拒绝只依赖宿主 double：它不能证明真实发现、路径解析、跨进程加载和原生时序。拒绝所有组合都仅靠端到端观察：受控错误与并发顺序在 S1 更容易准确区分和定位。|观察已有宿主 interface，不扩大版本或平台支持范围；宿主升级可能需要更新运行设施与证据，不能以通过旧 double 替代兼容验证。|

### 已批准决定与代价

- **持久化选择 B，承诺归属 P35/P36。** 未采用“只初始化而不保存开启”的 A：用户接受自动开启跨模式恢复，并选择尽量复用正常 State 写入，避免额外的不持久化初始化分支。若未来希望自动开启仅对本次模式有效，必须先修订 P35 及其恢复证据，而不是作为内部重构改变结果。此选择不需要新记录格式或新存储系统。
- **验收选择 Rapid iteration。** 未选择全自动视觉判断：实际终端的 marker／反馈显示保留给用户确认；具体责任只记录在 P8/P9/P18/P19 的 Coverage 中。协议、状态、非阻塞、生命周期及跨进程效果没有转交给人工。既有维护者 H1、支持状态提升及正式部署切换不因本契约验收自动完成。
- **必要推论 P31/P32/P34 纳入。** 分别维持静态配置来源、Owner/消费者隔离和配置拒绝原则，均由已有承诺要求；不提供静默回退、放开准入或混合模式误用支持作为替代。

### 依赖与观察约束

- 启动目标与恢复选择属于 **in-process**，通过 S1 观察，不需要新 adapter。
- 文件、会话记录和可控时间属于 **local-substitutable**，使用隔离文件和现有时钟替代能力；测试设施不升级为产品 interface。
- 面板属于 **remote but owned**：受控替代承担失败与延迟，真实隔离面板承担登记互操作。仅模拟 receipt 不能证明真实面板登记。
- harness 与子代理 provider 为本项目不修改的外部集成依赖：surface double 支持可控行为，真实运行承担兼容、路径与跨进程观察。新模式不扩大其支持范围。
- 模型 capture 端点只证明请求是否发出及携带的贡献，不承诺第三方模型质量或付费 provider 效果。真实运行均使用隔离状态，不操作正式配置、用户会话或正式面板。

## Not yet specified

- **阻塞批准的决定：无。** seam 选择、六表面审查的行为决定及验收责任均已明确。
- **留给 implementation 的构造自由：** 启动配置的字段拼写、具体文件组织、公开声明的精确类型签名及内部 module 拆分未冻结。它们必须在 S1/S2 和上述 promises 内落定并提供一致的使用说明，不得把不同恢复优先级、等待策略、持久化行为或新的支持范围伪装为构造选择。
- **延期的未来 seam：无新增承诺。** spec 排除的配置档参数、热加载、全局记忆和其他消费者不在此处预切票。
- promise 完成情况不在本文手工维护。后续证据若推翻 seam 或 promise，先修订契约，再重开受影响票；需要新增高成本、难逆转取舍时再考虑 ADR。

## Out of scope

完整继承 [Spec 的 Out of Scope](./spec.md#out-of-scope)，本契约不新增范围，也不增加范围外事项。P35 使用既有会话持久化记录，不是新增 rememberState、跨会话偏好或 connect-bot 记忆。
