# 决策正文同步前的历史快照

用户明确要求将旧 Lighthouse 与决策票的当前有效文字同步到最新决定。本文件逐字保存本次同步前的文档；仅为历史，不覆盖[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)或同步后的有效正文。代码块内的相对链接保持原文，不作为本目录的活动链接。原题和原有评论包含在快照中。

## lighthouse/01-behavior-contract.md

~~~~~~~~markdown
# 完整保留哪些业务行为，统计单位如何命名？：Lighthouse

> Question and discussion: [完整保留哪些业务行为，统计单位如何命名？](../decision/01-behavior-contract.md)
>
> 用户已确认本决议。讨论过程曾修订 Turn 定义与结算边界；下文为最终决定，末尾历史记录不覆盖最终决定。

## Question

基于[现状调查](../assets/current-state.md)，逐项确认 DeepSeek／Codex／token-only／hidden、预算与 Effort、峰谷和 holiday、请求计价、余额、累计与分段条、双窗口节奏、ratio/left、预算命令、刷新和故障显示哪些原有行为要原样保留，哪些有意改变？用户已确认全量保留基线，不得默删 README 未记载的额度估计。

明确 Request、Assistant response、Turn、Round、Agent activity state、Total、旧 UI 的 Turn 及 orchestration 的业务含义；旧 agent_end 结算不能仅因名称接近就映射 round_end。讨论两源预取 TTL 表述与实现不一致、render 更新业务态的耦合，以及 UI 标签是否改名。输出一份用户确认的行为契约和场景；本票不决定框架接口，也不迁移代码。

## Discussion

### 公共术语与工具活动

Turn 是一次 LLM Request 与对应 Assistant response，不包含工具执行。工具调用指令可以在 response 中，工具结果可以成为后续 request 输入；Tool execution 独立于 Turn、属于 Round。Round 从处理输入开始，到没有自动工作待续、重新等待用户结束。代理活动状态与执行单元分开，由 framework 统一语义；舍弃 Run 作为含混的公共术语。framework glossary 承载公共定义，extension glossary 承载业务术语，GLOSSARY-MAP 只导航。

### 计费与统计

保留旧逐请求锚价与逐响应 usage 计费。每份响应只入账一次，不等待工具或 Round 结束，不在工具返回或 Round 结束时重复收费。区分 Turn usage/cost、Round totals、Session totals。新轮次统计采用 framework 统一 Round 语义，不直接照搬每个原生 agent_end 检查点；此决定替代讨论中一度提出的完全保留原生结算点要求。历史概念称“旧的 Turn”，它是旧 UI 的结算差分，不是新 Turn 或必然完整的 Round。优先累加逐请求费用，避免跨峰谷按当前价格重估；历史信息不足的恢复策略另议。

用户观察到旧统计基本对应官网后台是保留计价规则的依据，本会话未独立核验官网账单。已运行旧纯计价函数：pro 两次各 100 万 input、分别峰价与谷价，累计 13.5 元；合计 token 按谷价重估为 9 元，结算后费用累加器归零。此验证不涉及远端请求、正式统计文件或完整 OMP 链路。

### 保留基线

provider 分层保持 Codex（openai-codex）、官方 DeepSeek（deepseek 且有已知计价）、token-only（适用名单）、hidden；名单及维护方式后续决定，当前源码 ID 仅为事实基线。

保留 DeepSeek 默认 450K、最高 1000K 与 Codex 固定 272K 上下文预算；预算只显示／告警，不限制请求、输出或压缩。Effort 显示实际生效值、未知 ?、只给值着色。

保留北京时间工作日 09:00–12:00、14:00–18:00 含端点峰价，其他时间及周末谷价；holiday 手动谷价、不追溯；Request 发出时锚价，响应 usage 计费；保留价格分类，DeepSeek 不另计 cacheWrite。

完整保留 Codex 双窗口、按报告时长识别、节奏／重置展示、ratio／left、同源成对测量及有效样本／窗口变化规则；保留 5h 增量至少 50pp、双窗口正增量且未饱和才采纳估计，无估计显示 estimating…。具体参数证据见现状调查。

累计与 session 分段条（≤20 元 fine、>20 元 coarse）、budget 数字／K／0（无 K 也按千 token）、detail、holiday、clear、费用／余额告警及故障反馈以当前行为为基线。clear 默认归档 DeepSeek、开始新周期并清 holiday，不清 Codex estimate；请求错误 widget-only，命令有反馈。后续可讨论取舍，但必须由具名决策票说明差异并获用户确认，不授权实施者删改。

### 数据寿命与更新

最新 DeepSeek 余额／Codex 窗口读数及获取时间、加载状态、请求错误只存内存，重启重新获取。不取消累计、归档、holiday 与 quota estimate 持久化。更新由事件驱动，更新后检查 UI 是否需要渲染，需要则请求刷新；不需要新增发布／订阅机制。时间参数沿用既有 YAML 配置读取。State 字段、触发事件、TTL／防抖／节流、跨源更新和无 UI 策略未决定。

## Decision

以现有功能为迁移基线，统一 Turn／工具执行／Round 与统计术语，保留逐请求计价并将响应入账与代理生命周期分离。Codex 额度功能完整保留；其他后续取舍由具名决策票承接，不授权实施阶段自行缩减需求。

## User stories

1. As a 用户, I want 保留已验证的逐请求计价规则, so that 费用仍能与 provider 后台结果对照。
2. As a 用户, I want 明确的 Round 与 Session 累计, so that 能理解费用分别属于哪段活动。
3. As a 用户, I want 减少跨峰谷展示偏差, so that 累计费用不被当前价格重新解释。
4. As a 用户, I want 保留双窗口、ratio／left 和成对测量, so that 能判断 Codex 消耗节奏与剩余预算。
5. As a 用户, I want 保留现有命令、累计、分段条与故障反馈基线, so that 迁移不会悄悄丢失操作能力。
6. As a 扩展开发者, I want 所有 extension 共用 framework 生命周期术语, so that 能明确协作关系。
7. As a 扩展开发者, I want 事件驱动更新并复用 YAML 配置, so that 能控制更新频率而不由渲染次数驱动业务。
8. As a 维护者, I want 每项取舍有具名决策票, so that 实现阶段不自行改变需求。
9. As a 用户, I want 保留 provider 分层、上下文预算与实际 Effort 展示, so that 切换模型时仍有明确的展示与计价行为。
10. As a 维护者, I want 仅最新远端读数内存保存、旧统计文件保持不变, so that 能从新统计起步而不损坏旧记录。

## Preconditions

- 本决议的业务确认不依赖后续票解决；实际落地依赖统计归属、观测、存储、命令、展示、刷新及验收决策完成。
- [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md) 承接请求／会话／子代理／orchestration 归属、去重、tree／分支恢复及跨峰谷历史信息不足。
- [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md) 承接统一 Round 与活动状态、响应 usage、异常／中止的真实链路验证；其旧 Run 术语须修订。
- [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md) 承接各自业务基线及未决取舍。
- [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md) 承接数据 State 能力；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md) 承接名单覆盖与维护。
- OMP 映射不能只靠事件名称；实施前必须冻结 source revision，并按选定基线核验。

## Postconditions

- 后续票可依赖已确认术语、计价原则、功能基线和最新远端读数的内存寿命。
- 原生结算点、接口、持久化时机、恢复行为、最终 UI 标签与无 UI 远端刷新策略没有被本票隐式批准。
- 偏离基线必须记录变化、理由并获用户确认。
- 正式决议优先于历史讨论中已被替代的提议；此票不交付生产行为。

## Invariants

- 同一响应不重复计费，工具结果不独立追加模型费用；Round 完成与响应计费分离。
- 与原 turn-cost 的 anchorRequest／addMessageCost 保持请求锚价算法一致，不用响应结束时价格代替。
- Round 公共语义归 framework，connect-bot 与 model-cost 不各自重定义；面板协议枚举不直接等同 framework 活动状态。
- framework/GLOSSARY.md 为公共术语权威，extensions/model-cost/GLOSSARY.md 为业务术语权威，GLOSSARY-MAP.md 仅导航。
- 对齐 framework/core/config.ts 与 extensions/connect-bot/config.yaml 的现有配置模式，不建立第二套 YAML 读取机制。
- 不自动删除或改写旧统计数据；最新余额／窗口读数内存策略不取消其他业务数据持久化。
- 调度与展示可合并／限频，不得因此丢失任何需要计费的响应事实。
- 既有模型列表不是冻结契约，功能取舍不能由实施阶段默删；地图只规划。

## Historical ticket body

以下原样保存确认前的票体；含已被后续讨论替代的提议，只作溯源，不作为当前约束。

# 完整保留哪些业务行为，统计单位如何命名？

Type: grilling
Status: claimed
Assignee: hugos (本会话 agent 协助讨论)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

基于[现状调查](../assets/current-state.md)，逐项确认 DeepSeek／Codex／token-only／hidden、预算与 Effort、峰谷和 holiday、请求计价、余额、累计与分段条、双窗口节奏、ratio/left、预算命令、刷新和故障显示哪些原有行为要原样保留，哪些有意改变？用户已确认全量保留基线，不得默删 README 未记载的额度估计。

明确 Request、Assistant response、Turn、Round、Agent activity state、Total、旧 UI 的 Turn 及 orchestration 的业务含义；旧 agent_end 结算不能仅因名称接近就映射 round_end。讨论两源预取 TTL 表述与实现不一致、render 更新业务态的耦合，以及 UI 标签是否改名。输出一份用户确认的行为契约和场景；本票不决定框架接口，也不迁移代码。

## Comments

### 第一轮反馈（2026-10-09）

- 用户确认 Request／Assistant response／Turn／Agent run／Round 的区分；已同步 [framework 词汇表](../../../framework/GLOSSARY.md)。旧 UI Turn 的实际展示口径与 Total／Sum 尚未决定。
- 用户提出抽取统一更新方法，由 framework 特定事件触发，并用可配置的时间参数避免频繁请求或 UI 更新。是否仅在有 UI 时推进相关计算／远端请求尚需澄清；不得将此反馈记为同意无 UI 全量更新。
- 用户要求时间参数放入 YAML，沿用 framework 配置读取；TTL 与防抖的语义尚需解释后决定。
- 用户明确最新 DeepSeek 余额／Codex 窗口读数只需内存保存，不写文件。需澄清这一要求是否仅针对远端最新读数，不能据此取消每日累计、归档或 quota ratio／baseline 的持久化。
- 用户要求先讨论数据如何保存、是否进入 State、State 包含哪些信息，再决定 TTL。统一更新是否在使用 DeepSeek 时也刷新 Codex 待后续决策。以上问题的票据归属正在讨论，未记录为已解决决策。

### 第二轮确认（2026-10-09）

- Q4 用户确认：最新 DeepSeek 余额、Codex 5h／7d 窗口读数及相关获取时间／加载状态／请求错误只存内存，重启重新获取；此要求不取消 DeepSeek 累计／归档／holiday 及 Codex quota ratio baseline／已得估计的持久化。
- Q5 用户确认更新由事件驱动；具体事件（包括 UI 相关触发或 Turn 结束等候选）后续梳理。更新后检查当前 UI 是否需要渲染，需要则请求一次刷新。不要求本票设计额外发布／订阅机制。
- 用户没有选择上一轮的 A／B 无 UI 请求策略；不能把 UI 是否需要渲染当成业务更新的总开关，也不能推定无 UI 时必定继续或暂停远端请求。具体调度与无 UI 行为留待刷新生命周期／展示票明确。
- TTL、防抖／限频、跨源更新及 State 字段归属仍待决策；不把提议视为已批准契约。

### 第三轮反馈（2026-10-09）

- Q6 用户要求先核对 Agent run 与持续输出、每次 response／Turn 的关系，尚未确认旧 UI Turn 改为 Round 统计。
- Q7 用户确认上下文预算（DeepSeek 默认 450K、最高 1000K；Codex 固定 272K）、预算只显示／告警而不限制执行，以及 Effort 取实际生效值／未知 ?／只给值着色。模式选择需给出源码支持的详细分类后再确认。
- Q8 用户确认保留所有列出的 DeepSeek 计价规则：北京时间峰谷含端点、周末谷价、holiday 不追溯、请求发出时锚价、按响应 usage 计费（包含纯工具调用响应，不另计工具结果）、现有价格表与分类、DeepSeek 不另计 cacheWrite。本票确认业务规则，具体实现留给后续契约和实施工作。

### 第四轮反馈（2026-10-09）

- Q6a 用户要求分离输入／输出执行单元与代理活动状态，质疑 Agent run 的定义。Agent run 不是最小模型请求单元，也不是 Turn 内的工具调用；旧 UI 统计范围仍未确认。公共代理活动术语应由 framework 词汇表承载，connect-bot 的既有状态语义需先核对。
- Q7a 用户确认 provider 的四层分类逻辑，不在本票冻结具体模型 ID；官方计价支持名单与 token-only 名单需要持续维护，具体模型覆盖交由后续票确认。当前源码名单仅为调查事实，不是最终批准的覆盖清单。

### 第五轮确认（2026-10-09）

- 用户确认 Q6b：舍弃 Run 作为框架公共单元／状态术语；Request／Assistant response／Turn／Round 与 Agent activity state 分开定义。代理生命周期及活动状态的统一语义属于 framework，不由各 extension 自行解释。已更新 framework 词汇表；Idle 与等待输入的精确区分仍未决定，不直接升级 connect-bot 的协议枚举。
- 用户要求按新术语重新描述 Q6。Q6 仍待确认：旧 UI Turn 所在的本次活动统计列，采用单个 Turn 还是完整 Round 的 token／费用累计；旧原生 agent_end 边界不自动成为新语义。

### 第六轮约束与源码核对（2026-10-09）

- 用户要求严格保留旧计费与统计逻辑；依据是用户观察到旧结果基本对应 DeepSeek 官网后台。本次未独立核验官网账单。此前改为完整 Round 合计的建议未获批准，不能迁移时改变聚合／结算边界。
- 源码：before_provider_request 锚价；message_end 从有 usage 的消息提取 input/cacheRead/output 按锚定价格加到费用累加器；每次原生 agent_end 调用 finishTurn 取出并清空，DeepSeek 分支交给 daily.recordTurnCost 累加。旧 handler 不检查 willContinue，而 framework round_end 会排除尚有自动续跑的结束，所以不能直接替换结算触发。
- 旧 UI Turn 是相邻结算检查点之间 session usage 累计值的差分；不能称为单个新 Turn，也不能无条件称为完整新 Round。用“结算批次”作为解释性名称，不代表批准新公共术语或 UI 标签。
- 旧 DeepSeek Total／Turn 的 Cost 是将对应累计／差分 token 按展示时选取的一个价格档重新估算；Accrued 则来自逐请求锚价累计后落盘的费用。两者跨价格档时可能不同。Sum 为 input + cacheRead + output 的 token 数，不是另一个生命周期周期。

### 第七轮方向澄清（2026-10-09）

- 用户说明已知并曾接受跨峰谷展示估值偏差；本次希望探索能否通过重构消除，无法做到则接受。不得把改善目标写成已经批准的实现或无条件精确保证；请求锚价算法继续保留。
- 用户提出保留逐响应 usage 计费，但在 framework 层梳理真正 Round 结束语义，并考虑新 model-cost 按统一 round_end 触发累计相关逻辑。这是对上一轮“严格保留所有结算检查点”的调整提议，需明确确认后替代旧约束，不能一面声称完全照搬一面改变边界。
- 用户提出区分单 Turn 用量、当前 Round 累计与当前 Session 累计；“旧的 Turn”专指旧 UI 最近结算批次差分，不能直接视作新 Round 累计的等价定义。持久化、tree／分支恢复、账户与子代理归属后续讨论。
- 工具输出进入后续模型请求时，其实际输入 token 会计入后续 response usage；不在工具返回时独立加费，否则可能重复计费。具体缓存分类及宿主用量口径需由观测票核对。

### 第八轮概念确认与框架草案（2026-10-09）

- 用户确认区分单 Turn 用量／费用、Round 累计、Session 累计，并要求将响应计费边界与代理活动边界分离为 model-cost 领域术语；已写入 [model-cost 词汇表](../../../extensions/model-cost/GLOSSARY.md)，由 GLOSSARY-MAP 导航并引用 framework 公共概念。
- 必须纠正本轮提问中的前提：工具执行不是另一个 Turn，Request 1 不提前包含尚未产生的工具结果作为输入；若 Request 2 实际携带工具结果，相关输入费用由 Response 2 usage 体现。一 response 一次计费是目标原则，但依赖 usage 口径及去重，不保证任意事件都严格等于官网账单。
- 响应计费边界作用于每个有 usage 的模型响应；Round 结束作用于活动周期。最后一次响应是否为最后一次只能由后续生命周期事实确认，不能收到响应就判定 Round 已结束。结算检查点不一致不单纯由无模型费用的工具造成，也可能来自自动续跑。
- 新大框架作为待确认草案：逐请求锚价／逐响应入账；Round 和 Session 统计按各自归属聚合；framework 统一生命周期；不在工具完成时重复收费，不在 Round 结束时再次计算已经入账的响应费用。是否正式改用统一 round_end 完结轮次统计、费用展示如何改善跨峰谷误差，仍待用户确认。

### 第九轮大框架确认与 Turn 定义修订（2026-10-09）

- 用户确认上一轮大框架，并明确修改 Turn：一个 Turn 严格对应一次 LLM Request 与对应 Assistant response，不包含工具执行过程。工具调用指令可以包含在 response 中，工具结果可以成为后续 request 的输入；工具执行是 Round 内与 Turn 分离的活动。此确认替代早先“响应及其工具执行构成 Turn”的定义，已同步 framework 与 model-cost 词汇表。
- 用户确认按每份响应 usage 入账，不等待 Round 结束，也不依赖工具完成。框架统一 Round 边界，model-cost 用它组织轮次累计／结束处理；保留请求锚价算法，不在轮次结束时重复收费。此方向替代第六轮要求原样保留所有原生结算检查点的约束，但去重、归属和异常处理仍需后续精确设计。
- 确认区分 Turn usage／cost、Round totals、Session totals；费用优先累加逐请求费用以避免跨峰谷重估偏差，历史信息不足的恢复策略另议。原规则、provider 分层和已确认的数据寿命要求继续生效。
- 工具结果不一定总被发送给下一次 LLM；只有实际成为后续请求输入的内容才计入该请求 usage。不得因工具执行跨请求链路而为其新造两个 Turn 或追加独立模型费用。

### 第十轮功能基线确认（2026-10-09）

- Q9 用户确认 Codex 双窗口、时长识别、节奏／重置展示、quota ratio／left、成对测量及有效样本／窗口变化规则全部保留。
- Q10 用户要求以现有累计／分段显示、budget 参数、detail、holiday、clear 和故障反馈作为需求基线；后续可以讨论取舍，但需要具体决策票承接。此反馈不授权实施者自行删改，任何改变应在承接票说明与基线的差异并由用户确认。
- 本票准备 lighthouse 草案等待用户确认；尚未 resolved，不更新地图 Decisions so far。
~~~~~~~~

## lighthouse/02-accounting-ownership.md

~~~~~~~~markdown
# 用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse

> Question and discussion: [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)
>
> 用户已确认本决议。以下为最终决定，末尾历史票体仅用于溯源，不覆盖最终决定。地图只规划，本决议不交付生产实现。

## Question

确定费用、token 基线、额度成对读数与缓存的归属：request／turn／round／session／owner／provider account／进程分别承担什么？主会话、子代理及 orchestration 如何计入展示与累计，怎样避免 session 统计与单请求统计双计？fork/resume/switch/tree 的基线与未结算请求如何处理？

现有 framework session/round 订阅只对 owner 派发，直接复用可能漏掉子代理观测。不能把激活 State 继承规则当成本归属规则。新统计允许从空开始，但新系统恢复和多进程并发仍需确定行为；多 main 同进程要显式决定支持或拒绝，不能顺手承诺。依据[现状调查](../assets/current-state.md)及源 daily-tracker、quota-estimate-store 确认去重与身份需求。

## Discussion

### 请求是消费记录的基础

保留有源头数据的请求记录，通过统计口径聚合，不按主会话当前模型或展示模式丢弃记录。

每个请求关联实际发出请求的会话、Turn、Round、provider 账户、模型和请求时锚价。切换会话、模型或账户，以及响应迟到，都不改变旧请求归属。

沿用已确认的逐响应入账规则；工具返回、Round 结束和汇总报告不产生第二笔消费。工具结果进入后续请求时，按后续请求报告的 usage 正常统计。旧消息成为新请求输入的消费与重新加载旧记录不同，前者是新的请求用量，后者不重新收费。

### 主会话、子代理与 orchestration

必须分别取得主会话自身消费（不含任何子代理）、每个子代理自身消费、每个子代理含后代的消费、主会话含全部后代的消费。

保留逐代理身份与父子启动关系，不能只保存 Owner 汇总。自身消费从直接所属请求聚合，不依赖“总计减子代理”反推。

子代理消费向上归入启动该子任务的父 Round；迟到数据可以补充历史 Round，但不重新开启其生命周期。嵌套汇总中每个请求只计一次。主会话生命周期不因该统计规则被迫等待所有后台子代理。

orchestration 的独立模型请求归实际执行会话；已有用量的汇总报告不再次入账。

### 消费金额口径与完整性

| 请求的金额统计结果 | 对金额累计的贡献 | 含义 |
| --- | --- | --- |
| 已知金额，包括确认的 0 | 实际数值 | 有适用口径且数据齐全 |
| 未知 | 0 | 缺少必要信息，不能确定金额 |
| 额度消费 | 0 | 按额度消费，不参加金额累计 |
| 无统计口径 | 0 | 本扩展未定义金额统计方式 |

计费渠道目前为 DeepSeek，已知请求费用参加金额累计。额度渠道为 Codex，标记“额度消费”，金额累计贡献零；模型公式得到的美元仅作参考，不进入 Round／Session／账户的消费金额汇总。token-only／hidden 归为“无统计口径”，保留源记录与此状态，金额累计贡献零。

未知是适用统计所需信息缺失；保留未知，对已知小计贡献零，不覆盖原始未知状态。汇总保留其中存在的特殊状态，不将其压成普通零。额度消费、无统计口径和数据不完整可以在同一汇总中同时出现。

数据完整性按指标区分，并与消费类别分别表达：有 usage、缺适用价格时 token 可以完整而金额未知；额度请求缺 usage 时用量不完整，但不会制造人民币费用缺失；有“无统计口径”的记录，不等于源 usage 必然缺失。Codex 参考美元缺价格也不意味着计费渠道金额缺失。

本地计算费用不是独立核验的 provider 实际扣款。讨论中的单个混合人民币／美元消费总额及按当前主会话模式过滤子代理消费的方向被排除；统计选择不能破坏源记录。

### 历史、分支与 Round 视图

| 操作 | 行为 |
| --- | --- |
| resume | 恢复同一会话已记录消费，加载历史不重复入账 |
| switch | 选择目标会话统计，未结算请求仍归原会话 |
| tree | 不回滚 Session 消费，只改变选定 Round 的统计视图 |
| fork | 新会话自身消费从零开始，复制历史不算新消费，原账目保留 |

选中某 Round 的响应，包括中途 Turn，显示该 Round 已实际发生的完整累计，而不是截至节点的小计。尚未开始新 Round 的输入边界，显示目标路径最近已完成 Round。

从历史位置继续提问创建新 Round，不覆盖原 Round。删改对话或切换树位置不撤销已发生的消费。Session 消费覆盖该会话实际发生的请求，而不是只覆盖当前可见对话路径。

### 去重、取消重发与恢复

同一请求幂等入账；重复观测不增加消费。后来取得可靠缺失信息时补齐原记录，并更新各层累计。去重依据请求身份，不依据相同输入、相同 token 数或相近时间。

实际重新发出的请求独立记录，即使输入完全相同。用户明确指出取消后修改输入重发是常见场景：取消的旧请求有 usage 就入账，没有 usage 就保持未知，对已知累计贡献零；接受由此产生的统计误差。后来收到可靠 usage 时仍可补齐。重发请求使用自己的身份和锚价，不能只保留最终成功请求。

乱序响应不改变归属。矛盾的已知数据不能相加或任意最后写覆盖；保留冲突并标记受影响统计不完整，可信来源规则由观测票确定。

恢复只基于可靠记录补账，不自动重发请求以补账，也不承诺知道本地从未取得证据的 provider 收费。可靠未入账记录可补账，已入账记录不再贡献第二次；信息不足保持未结算／不完整，不用当前价格猜历史。

### 账户与多会话并发

provider 账户是跨会话、跨进程的账户统计范围，不是 Owner、Session 或进程身份。不同账户隔离，模型明细保留。

支持同进程及跨进程的多个独立主会话；同一会话同时只允许一个执行者，拒绝并发驱动，正常退出后的恢复允许继续。

同账户多会话并发入账必须不丢失、不重复、不覆盖其他会话贡献。账户累计聚合唯一请求，不能再次叠加 Session 或子代理汇总。用户特别指出旧扩展曾在多会话并发下踩坑，后续存储契约与验收必须覆盖该场景，不能只验证单会话。

### 正交维度与 Codex 额度

上下文、账户、消费是三个正交维度：子代理上下文不加入主会话上下文预算；累计 token 不等于当前上下文占用；账户余额、额度变化不能反推某会话消费。

Codex 保留账户级双窗口、ratio／left 和同源成对读数估计，不做会话消耗与账户额度的转换或分摊。同账户的其他客户端消费也可能影响额度读数。

切换会话不清账户测量基线；切换账户使用目标账户自己的基线。不能将不同时间、不同来源的两个窗口拼成一对。最新远端读数与缓存沿用已确认的内存寿命，持久化估计与具体并发合并契约由后续票确定。

## Decision

以请求消费记录为事实基础，按会话、Round、父子代理关系及账户分别聚合，确保每个请求只计一次且历史消费不随对话树回滚。金额仅累计计费渠道的已知费用，明确保留未知、额度消费、无统计口径及各指标完整性，并保证多会话并发下账户统计正确。

## User stories

1. As a 用户, I want 区分主会话自身和每个子代理的消费, so that 能理解任务成本来源。
2. As a 用户, I want 查看含子代理的 Round／Session 汇总, so that 能了解整项任务的消费而不重复累计。
3. As a 用户, I want 切换模型后仍保留旧请求归属与锚价, so that 历史费用不被重新解释。
4. As a 用户, I want tree 改变 Round 视图但不回滚 Session 消费, so that 能区分历史位置与实际消费。
5. As a 用户, I want 区别未知、额度消费、无统计口径和确认零, so that 能理解金额小计的覆盖范围。
6. As a 用户, I want 取消、修改重发和恢复时不漏掉已有证据的消费也不重复入账, so that 请求修改和会话恢复不破坏账目。
7. As a 用户, I want 多个会话同时使用同账户时累计正确, so that 跨终端统计可信。
8. As a 用户, I want 保留 Codex 账户额度功能及参考费用但不将其当现金消费或分摊给会话, so that 能区分账户额度与会话金额。
9. As a 开发者, I want 保留源记录并以统计口径生成视图, so that 展示策略不破坏消费事实。
10. As a 维护者, I want 对缺失和冲突保留证据, so that 后续可补齐而不是猜测账目。

## Preconditions

- 本业务决定依赖已确认的[行为契约决议](01-behavior-contract.md)，不依赖后续票先解决；实际落地依赖下列契约。
- [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md) 明确请求身份、usage、Round、子代理关系、历史定位和可信来源。
- [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md) 明确账户身份与隔离；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md) 落实消费类别映射。
- [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md) 与[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md) 决定数据声明、格式、恢复、原子更新和跨进程协调。
- [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)、[/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md) 承接展示、异步更新与命令边界，不冻结其实现。
- [什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) 承接运行证据；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) 承接组织、唯一执行者和消费者迁移职责。

## Postconditions

- 后续接口和存储设计必须支持逐请求、逐代理、多账户记录及幂等补齐。
- 展示必须能区分自身／含后代消费及特殊状态，不能把不参与金额累计解释为免费。
- 验收必须覆盖异构子代理、模型切换、取消重发、历史恢复、tree／fork、迟到与重复观测，以及同账户多会话并发。
- 本票不决定物理存储格式、接口字段、调度、最终 UI 或命令的新行为；这些是具名后续票的开放问题。

## Invariants

- 一个实际请求在同一聚合范围内最多贡献一次；汇总视图不产生新消费。
- 请求归属和锚价不随当前会话、模型或账户改变；对齐原 turn-cost 的 anchorRequest／addMessageCost 请求锚价规则，不用当前价格重估历史。
- 未知不等于零；额度消费和无统计口径不等于免费。
- Session 消费不因 tree、删改消息或 fork 回滚。
- 消费聚合不改写 framework 的 Turn／Round 生命周期含义；迟到补账不重新开启历史 Round。
- Owner 的 State 继承不决定消费归属；遵循 framework 公共术语，业务统计定义由 extensions/model-cost/GLOSSARY.md 承载。
- 账户隔离、请求去重和多会话并发正确性必须同时成立。
- 上下文、账户状态和消费不能互相代替。

## Historical ticket body

以下原样保存确认前的票体；含已被后续讨论替代的提议，只作溯源，不作为当前约束。

# 用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？

Type: grilling
Status: claimed
Assignee: hugos (本会话 agent 协助讨论)
Blocked by: 01
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

确定费用、token 基线、额度成对读数与缓存的归属：request／turn／round／session／owner／provider account／进程分别承担什么？主会话、子代理及 orchestration 如何计入展示与累计，怎样避免 session 统计与单请求统计双计？fork/resume/switch/tree 的基线与未结算请求如何处理？

现有 framework session/round 订阅只对 owner 派发，直接复用可能漏掉子代理观测。不能把激活 State 继承规则当成本归属规则。新统计允许从空开始，但新系统恢复和多进程并发仍需确定行为；多 main 同进程要显式决定支持或拒绝，不能顺手承诺。依据[现状调查](../assets/current-state.md)及源 daily-tracker、quota-estimate-store 确认去重与身份需求。

## Trace handoff

来源：[行为契约决议](../lighthouse/01-behavior-contract.md)。确认 Turn／Round／Session 的用量和逐请求费用归属；保留逐请求锚价，不用当前价格重估完整历史。跨峰谷、模型切换、缺历史价格／usage、工具结果输入计费、重复或乱序响应、子代理与 orchestration 需有明确行为。按新 Round 聚合不会重新给已入账的响应收费；tree／fork／resume 的历史与当前范围不能推定。

## Comments

### 第一轮：用户确认 Q1／Q2／Q3

- Q1：每个请求直接归实际发出请求的会话；主会话区分自身消耗与含子代理的汇总，子代理保留各自记录。跨会话累计只算唯一请求，不叠加汇总视图。orchestration 独立模型请求归实际执行会话，已有用量的汇总报告不再次入账。具体 UI 留给展示票。
- Q2：同一 provider 账户跨会话、跨进程共享账户费用累计、余额与额度测量范围；不同账户隔离，Session／Round 统计仍各自独立，保留模型明细。账户指 provider 侧计费／额度身份，不是 Owner 或进程；识别机制交账户访问票。
- Q3：请求发出时确定会话、provider 账户、模型与锚价；响应迟到或期间切换不改变旧请求归属，新请求才采用新身份。

以上为已确认的讨论结果，不是完整决议；恢复、分支、去重、额度基线及并发边界尚待讨论。

### 第二轮：用户确认及补充

- Q4：确认子代理消耗按启动关系归主会话 Round；额外要求清晰区分每个子代理的消费与主会话剔除子代理后的消费。需要保留逐代理身份与明细，不能只存 owner 汇总。
- Q5：确认消费历史不随 resume／switch／tree／fork 重复入账或回滚；提出消费数据绑定 Turn／Round，tree 移动时 Session 累计不变，Round 展示变为“上一个 round 的累计数值”。“上一个”是目标位置所在 Round 还是目标位置之前已完成 Round，及 Round 中途节点展示完整值还是截至节点值，尚待澄清。存储物理格式留给存储票。
- Q6：确认记录不完整状态以区别于零；提出累计时未知项用零填充。待确认零仅为已知小计的加法占位，不覆盖原始未知状态，不把小计标为完整。
- Q7：确认账户额度与会话消耗分离；用户说明 Codex 暂无会话消耗与额度之间的转换方式，本次不考虑该转换。不得据此擅自取消已确认保留的账户级双窗口 ratio／left；与用户澄清后冻结范围。

### 第三轮：用户确认 Q8／Q9／Q10

- Q8：消费记录关联实际发起会话、Turn／Round、账户、模型和请求锚价，保留子代理启动关系，分别支持自身及含后代汇总。tree 只选择 Round 统计视图，不回滚账本。选中某 Round 的响应（包括中途 Turn）时显示该 Round 已实际发生的完整累计；尚未开始新 Round 的输入边界显示目标路径最近已完成 Round。继续提问创建新 Round，不覆盖原 Round。Session 累计覆盖该会话实际消费，不因 tree 改变。
- Q9：未知项在已知小计中贡献零，但原始记录保持未知；汇总保留不完整状态。token 和费用分别记录完整性；补齐同一请求时更新其贡献，不新增请求。
- Q10：排除 Codex Session 消耗与账户额度之间的换算或分摊，保留原有账户级双窗口、ratio／left 和成对读数估计。

### 第四轮：用户确认 Q11–Q14，展开混合 provider

- Q11：同一请求幂等入账；缺失信息补齐原记录，乱序不改变归属；矛盾已知数据不相加或任意最后写覆盖，保留冲突并标记受影响统计不完整，可信来源交观测票确定。
- Q12：实际重发请求独立记录。用户特别确认取消后修改输入并重发的常见场景：旧请求收到 usage 则入账，否则记录未知、对已知总消费贡献零；接受由此产生的统计误差。旧请求后续收到可靠 usage 仍按已确认补齐规则处理。
- Q13：恢复已入账记录不重复收费；可靠未入账信息可补账，缺信息保留不完整；不自动重发以补账，不承诺知道没有本地证据的 provider 实际收费。
- Q14：支持同进程或跨进程的多个独立主会话；同一会话同时只允许一个执行者。用户强调多会话并发下账户累计必须正确，旧扩展曾在此踩坑；并发入账不得丢失、重复或覆盖其他会话贡献，作为后续存储契约与验收场景。
- Q15：尚未确认；用户要求分别详细分析异构子代理与对话途中切换模型，不能直接冻结之前的混合 provider 建议。

### 第五轮：用户确认采集范围与正交维度，重定金额口径

- Q15A：只要有源头数据，保留请求记录，通过统计口径选择自身／子代理／模型／账户等范围，不按主会话当前模式删掉源记录。
- Q15B：用户明确渠道分为计费／额度两种。目前 DeepSeek 是计费渠道；Codex 属于额度渠道，模型公式得到的美元仅作参考，不参加消费金额汇总。金额汇总只对计费渠道有效。混合子代理或切换模型包含额度渠道时，保留特殊状态“额度消费”，与未知一样对金额累计贡献零；不是实际零消费。汇总如何同时表达额度消费和缺失信息、token-only／hidden 的未分类情况，下一轮澄清。此规则替代之前拟议的混合人民币／美元金额汇总。
- Q15C：上下文、账户、消费是三个正交统计维度；不能以子代理或会话累计 token 推定主会话上下文占用，不能以账户额度变化推定会话消费。

### 第六轮：用户确认状态组合并新增无统计口径

- Q16：额度消费性质与数据完整性分别保留，可同时存在；完整性按指标区分，额度请求缺 usage 不制造人民币费用缺失，但可标记 token 用量不完整。
- Q17：用户指定 token-only／hidden 归入新类别“无统计口径”，与“未知”“额度消费”并列；不是默认推断为额度渠道，也不是默认推断为计费但缺价格。保留源记录。

讨论已进入 lighthouse 草案确认；本票仍 claimed，未经用户确认草案不得 resolved。

~~~~~~~~

## decision/01-behavior-contract.md

~~~~~~~~markdown
# 完整保留哪些业务行为，统计单位如何命名？

Type: grilling
Status: resolved
Outcome: [行为契约决议](../lighthouse/01-behavior-contract.md)
Assignee: hugos (本会话 agent 协助讨论)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

基于[现状调查](../assets/current-state.md)，逐项确认 DeepSeek／Codex／token-only／hidden、预算与 Effort、峰谷和 holiday、请求计价、余额、累计与分段条、双窗口节奏、ratio/left、预算命令、刷新和故障显示哪些原有行为要原样保留，哪些有意改变？用户已确认全量保留基线，不得默删 README 未记载的额度估计。

明确 Request、Assistant response、Turn、Round、Agent activity state、Total、旧 UI 的 Turn 及 orchestration 的业务含义；旧 agent_end 结算不能仅因名称接近就映射 round_end。讨论两源预取 TTL 表述与实现不一致、render 更新业务态的耦合，以及 UI 标签是否改名。输出一份用户确认的行为契约和场景；本票不决定框架接口，也不迁移代码。

## Comments

### 第一轮反馈（2026-10-09）

- 用户确认 Request／Assistant response／Turn／Agent run／Round 的区分；已同步 [framework 词汇表](../../../framework/GLOSSARY.md)。旧 UI Turn 的实际展示口径与 Total／Sum 尚未决定。
- 用户提出抽取统一更新方法，由 framework 特定事件触发，并用可配置的时间参数避免频繁请求或 UI 更新。是否仅在有 UI 时推进相关计算／远端请求尚需澄清；不得将此反馈记为同意无 UI 全量更新。
- 用户要求时间参数放入 YAML，沿用 framework 配置读取；TTL 与防抖的语义尚需解释后决定。
- 用户明确最新 DeepSeek 余额／Codex 窗口读数只需内存保存，不写文件。需澄清这一要求是否仅针对远端最新读数，不能据此取消每日累计、归档或 quota ratio／baseline 的持久化。
- 用户要求先讨论数据如何保存、是否进入 State、State 包含哪些信息，再决定 TTL。统一更新是否在使用 DeepSeek 时也刷新 Codex 待后续决策。以上问题的票据归属正在讨论，未记录为已解决决策。

### 第二轮确认（2026-10-09）

- Q4 用户确认：最新 DeepSeek 余额、Codex 5h／7d 窗口读数及相关获取时间／加载状态／请求错误只存内存，重启重新获取；此要求不取消 DeepSeek 累计／归档／holiday 及 Codex quota ratio baseline／已得估计的持久化。
- Q5 用户确认更新由事件驱动；具体事件（包括 UI 相关触发或 Turn 结束等候选）后续梳理。更新后检查当前 UI 是否需要渲染，需要则请求一次刷新。不要求本票设计额外发布／订阅机制。
- 用户没有选择上一轮的 A／B 无 UI 请求策略；不能把 UI 是否需要渲染当成业务更新的总开关，也不能推定无 UI 时必定继续或暂停远端请求。具体调度与无 UI 行为留待刷新生命周期／展示票明确。
- TTL、防抖／限频、跨源更新及 State 字段归属仍待决策；不把提议视为已批准契约。

### 第三轮反馈（2026-10-09）

- Q6 用户要求先核对 Agent run 与持续输出、每次 response／Turn 的关系，尚未确认旧 UI Turn 改为 Round 统计。
- Q7 用户确认上下文预算（DeepSeek 默认 450K、最高 1000K；Codex 固定 272K）、预算只显示／告警而不限制执行，以及 Effort 取实际生效值／未知 ?／只给值着色。模式选择需给出源码支持的详细分类后再确认。
- Q8 用户确认保留所有列出的 DeepSeek 计价规则：北京时间峰谷含端点、周末谷价、holiday 不追溯、请求发出时锚价、按响应 usage 计费（包含纯工具调用响应，不另计工具结果）、现有价格表与分类、DeepSeek 不另计 cacheWrite。本票确认业务规则，具体实现留给后续契约和实施工作。

### 第四轮反馈（2026-10-09）

- Q6a 用户要求分离输入／输出执行单元与代理活动状态，质疑 Agent run 的定义。Agent run 不是最小模型请求单元，也不是 Turn 内的工具调用；旧 UI 统计范围仍未确认。公共代理活动术语应由 framework 词汇表承载，connect-bot 的既有状态语义需先核对。
- Q7a 用户确认 provider 的四层分类逻辑，不在本票冻结具体模型 ID；官方计价支持名单与 token-only 名单需要持续维护，具体模型覆盖交由后续票确认。当前源码名单仅为调查事实，不是最终批准的覆盖清单。

### 第五轮确认（2026-10-09）

- 用户确认 Q6b：舍弃 Run 作为框架公共单元／状态术语；Request／Assistant response／Turn／Round 与 Agent activity state 分开定义。代理生命周期及活动状态的统一语义属于 framework，不由各 extension 自行解释。已更新 framework 词汇表；Idle 与等待输入的精确区分仍未决定，不直接升级 connect-bot 的协议枚举。
- 用户要求按新术语重新描述 Q6。Q6 仍待确认：旧 UI Turn 所在的本次活动统计列，采用单个 Turn 还是完整 Round 的 token／费用累计；旧原生 agent_end 边界不自动成为新语义。

### 第六轮约束与源码核对（2026-10-09）

- 用户要求严格保留旧计费与统计逻辑；依据是用户观察到旧结果基本对应 DeepSeek 官网后台。本次未独立核验官网账单。此前改为完整 Round 合计的建议未获批准，不能迁移时改变聚合／结算边界。
- 源码：before_provider_request 锚价；message_end 从有 usage 的消息提取 input/cacheRead/output 按锚定价格加到费用累加器；每次原生 agent_end 调用 finishTurn 取出并清空，DeepSeek 分支交给 daily.recordTurnCost 累加。旧 handler 不检查 willContinue，而 framework round_end 会排除尚有自动续跑的结束，所以不能直接替换结算触发。
- 旧 UI Turn 是相邻结算检查点之间 session usage 累计值的差分；不能称为单个新 Turn，也不能无条件称为完整新 Round。用“结算批次”作为解释性名称，不代表批准新公共术语或 UI 标签。
- 旧 DeepSeek Total／Turn 的 Cost 是将对应累计／差分 token 按展示时选取的一个价格档重新估算；Accrued 则来自逐请求锚价累计后落盘的费用。两者跨价格档时可能不同。Sum 为 input + cacheRead + output 的 token 数，不是另一个生命周期周期。

### 第七轮方向澄清（2026-10-09）

- 用户说明已知并曾接受跨峰谷展示估值偏差；本次希望探索能否通过重构消除，无法做到则接受。不得把改善目标写成已经批准的实现或无条件精确保证；请求锚价算法继续保留。
- 用户提出保留逐响应 usage 计费，但在 framework 层梳理真正 Round 结束语义，并考虑新 model-cost 按统一 round_end 触发累计相关逻辑。这是对上一轮“严格保留所有结算检查点”的调整提议，需明确确认后替代旧约束，不能一面声称完全照搬一面改变边界。
- 用户提出区分单 Turn 用量、当前 Round 累计与当前 Session 累计；“旧的 Turn”专指旧 UI 最近结算批次差分，不能直接视作新 Round 累计的等价定义。持久化、tree／分支恢复、账户与子代理归属后续讨论。
- 工具输出进入后续模型请求时，其实际输入 token 会计入后续 response usage；不在工具返回时独立加费，否则可能重复计费。具体缓存分类及宿主用量口径需由观测票核对。

### 第八轮概念确认与框架草案（2026-10-09）

- 用户确认区分单 Turn 用量／费用、Round 累计、Session 累计，并要求将响应计费边界与代理活动边界分离为 model-cost 领域术语；已写入 [model-cost 词汇表](../../../extensions/model-cost/GLOSSARY.md)，由 GLOSSARY-MAP 导航并引用 framework 公共概念。
- 必须纠正本轮提问中的前提：工具执行不是另一个 Turn，Request 1 不提前包含尚未产生的工具结果作为输入；若 Request 2 实际携带工具结果，相关输入费用由 Response 2 usage 体现。一 response 一次计费是目标原则，但依赖 usage 口径及去重，不保证任意事件都严格等于官网账单。
- 响应计费边界作用于每个有 usage 的模型响应；Round 结束作用于活动周期。最后一次响应是否为最后一次只能由后续生命周期事实确认，不能收到响应就判定 Round 已结束。结算检查点不一致不单纯由无模型费用的工具造成，也可能来自自动续跑。
- 新大框架作为待确认草案：逐请求锚价／逐响应入账；Round 和 Session 统计按各自归属聚合；framework 统一生命周期；不在工具完成时重复收费，不在 Round 结束时再次计算已经入账的响应费用。是否正式改用统一 round_end 完结轮次统计、费用展示如何改善跨峰谷误差，仍待用户确认。

### 第九轮大框架确认与 Turn 定义修订（2026-10-09）

- 用户确认上一轮大框架，并明确修改 Turn：一个 Turn 严格对应一次 LLM Request 与对应 Assistant response，不包含工具执行过程。工具调用指令可以包含在 response 中，工具结果可以成为后续 request 的输入；工具执行是 Round 内与 Turn 分离的活动。此确认替代早先“响应及其工具执行构成 Turn”的定义，已同步 framework 与 model-cost 词汇表。
- 用户确认按每份响应 usage 入账，不等待 Round 结束，也不依赖工具完成。框架统一 Round 边界，model-cost 用它组织轮次累计／结束处理；保留请求锚价算法，不在轮次结束时重复收费。此方向替代第六轮要求原样保留所有原生结算检查点的约束，但去重、归属和异常处理仍需后续精确设计。
- 确认区分 Turn usage／cost、Round totals、Session totals；费用优先累加逐请求费用以避免跨峰谷重估偏差，历史信息不足的恢复策略另议。原规则、provider 分层和已确认的数据寿命要求继续生效。
- 工具结果不一定总被发送给下一次 LLM；只有实际成为后续请求输入的内容才计入该请求 usage。不得因工具执行跨请求链路而为其新造两个 Turn 或追加独立模型费用。

### 第十轮功能基线确认（2026-10-09）

- Q9 用户确认 Codex 双窗口、时长识别、节奏／重置展示、quota ratio／left、成对测量及有效样本／窗口变化规则全部保留。
- Q10 用户要求以现有累计／分段显示、budget 参数、detail、holiday、clear 和故障反馈作为需求基线；后续可以讨论取舍，但需要具体决策票承接。此反馈不授权实施者自行删改，任何改变应在承接票说明与基线的差异并由用户确认。
- 当时准备 lighthouse 草案等待用户确认；该历史状态已由下方正式确认记录取代。

### 正式确认与追踪完成（2026-10-09）

用户确认 lighthouse 草案并要求写入；正式决定以 [行为契约决议](../lighthouse/01-behavior-contract.md) 为准。本票 resolved。追踪结果与具名交接见 [行为契约地图追踪](../assets/01-behavior-contract-trace.md)；新增 State 数据契约和模型名单维护票保持 open，未在本会话解决其他决策。
~~~~~~~~

## decision/02-accounting-ownership.md

~~~~~~~~markdown
# 用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？

Type: grilling
Status: resolved
Outcome: [消费归属决议](../lighthouse/02-accounting-ownership.md)
Assignee: hugos (本会话 agent 协助讨论)
Blocked by: 01
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

确定费用、token 基线、额度成对读数与缓存的归属：request／turn／round／session／owner／provider account／进程分别承担什么？主会话、子代理及 orchestration 如何计入展示与累计，怎样避免 session 统计与单请求统计双计？fork/resume/switch/tree 的基线与未结算请求如何处理？

现有 framework session/round 订阅只对 owner 派发，直接复用可能漏掉子代理观测。不能把激活 State 继承规则当成本归属规则。新统计允许从空开始，但新系统恢复和多进程并发仍需确定行为；多 main 同进程要显式决定支持或拒绝，不能顺手承诺。依据[现状调查](../assets/current-state.md)及源 daily-tracker、quota-estimate-store 确认去重与身份需求。

## Trace handoff

来源：[行为契约决议](../lighthouse/01-behavior-contract.md)。确认 Turn／Round／Session 的用量和逐请求费用归属；保留逐请求锚价，不用当前价格重估完整历史。跨峰谷、模型切换、缺历史价格／usage、工具结果输入计费、重复或乱序响应、子代理与 orchestration 需有明确行为。按新 Round 聚合不会重新给已入账的响应收费；tree／fork／resume 的历史与当前范围不能推定。

## Comments

### 第一轮：用户确认 Q1／Q2／Q3

- Q1：每个请求直接归实际发出请求的会话；主会话区分自身消耗与含子代理的汇总，子代理保留各自记录。跨会话累计只算唯一请求，不叠加汇总视图。orchestration 独立模型请求归实际执行会话，已有用量的汇总报告不再次入账。具体 UI 留给展示票。
- Q2：同一 provider 账户跨会话、跨进程共享账户费用累计、余额与额度测量范围；不同账户隔离，Session／Round 统计仍各自独立，保留模型明细。账户指 provider 侧计费／额度身份，不是 Owner 或进程；识别机制交账户访问票。
- Q3：请求发出时确定会话、provider 账户、模型与锚价；响应迟到或期间切换不改变旧请求归属，新请求才采用新身份。

以上为已确认的讨论结果，不是完整决议；恢复、分支、去重、额度基线及并发边界尚待讨论。

### 第二轮：用户确认及补充

- Q4：确认子代理消耗按启动关系归主会话 Round；额外要求清晰区分每个子代理的消费与主会话剔除子代理后的消费。需要保留逐代理身份与明细，不能只存 owner 汇总。
- Q5：确认消费历史不随 resume／switch／tree／fork 重复入账或回滚；提出消费数据绑定 Turn／Round，tree 移动时 Session 累计不变，Round 展示变为“上一个 round 的累计数值”。“上一个”是目标位置所在 Round 还是目标位置之前已完成 Round，及 Round 中途节点展示完整值还是截至节点值，尚待澄清。存储物理格式留给存储票。
- Q6：确认记录不完整状态以区别于零；提出累计时未知项用零填充。待确认零仅为已知小计的加法占位，不覆盖原始未知状态，不把小计标为完整。
- Q7：确认账户额度与会话消耗分离；用户说明 Codex 暂无会话消耗与额度之间的转换方式，本次不考虑该转换。不得据此擅自取消已确认保留的账户级双窗口 ratio／left；与用户澄清后冻结范围。

### 第三轮：用户确认 Q8／Q9／Q10

- Q8：消费记录关联实际发起会话、Turn／Round、账户、模型和请求锚价，保留子代理启动关系，分别支持自身及含后代汇总。tree 只选择 Round 统计视图，不回滚账本。选中某 Round 的响应（包括中途 Turn）时显示该 Round 已实际发生的完整累计；尚未开始新 Round 的输入边界显示目标路径最近已完成 Round。继续提问创建新 Round，不覆盖原 Round。Session 累计覆盖该会话实际消费，不因 tree 改变。
- Q9：未知项在已知小计中贡献零，但原始记录保持未知；汇总保留不完整状态。token 和费用分别记录完整性；补齐同一请求时更新其贡献，不新增请求。
- Q10：排除 Codex Session 消耗与账户额度之间的换算或分摊，保留原有账户级双窗口、ratio／left 和成对读数估计。

### 第四轮：用户确认 Q11–Q14，展开混合 provider

- Q11：同一请求幂等入账；缺失信息补齐原记录，乱序不改变归属；矛盾已知数据不相加或任意最后写覆盖，保留冲突并标记受影响统计不完整，可信来源交观测票确定。
- Q12：实际重发请求独立记录。用户特别确认取消后修改输入并重发的常见场景：旧请求收到 usage 则入账，否则记录未知、对已知总消费贡献零；接受由此产生的统计误差。旧请求后续收到可靠 usage 仍按已确认补齐规则处理。
- Q13：恢复已入账记录不重复收费；可靠未入账信息可补账，缺信息保留不完整；不自动重发以补账，不承诺知道没有本地证据的 provider 实际收费。
- Q14：支持同进程或跨进程的多个独立主会话；同一会话同时只允许一个执行者。用户强调多会话并发下账户累计必须正确，旧扩展曾在此踩坑；并发入账不得丢失、重复或覆盖其他会话贡献，作为后续存储契约与验收场景。
- Q15：尚未确认；用户要求分别详细分析异构子代理与对话途中切换模型，不能直接冻结之前的混合 provider 建议。

### 第五轮：用户确认采集范围与正交维度，重定金额口径

- Q15A：只要有源头数据，保留请求记录，通过统计口径选择自身／子代理／模型／账户等范围，不按主会话当前模式删掉源记录。
- Q15B：用户明确渠道分为计费／额度两种。目前 DeepSeek 是计费渠道；Codex 属于额度渠道，模型公式得到的美元仅作参考，不参加消费金额汇总。金额汇总只对计费渠道有效。混合子代理或切换模型包含额度渠道时，保留特殊状态“额度消费”，与未知一样对金额累计贡献零；不是实际零消费。汇总如何同时表达额度消费和缺失信息、token-only／hidden 的未分类情况，下一轮澄清。此规则替代之前拟议的混合人民币／美元金额汇总。
- Q15C：上下文、账户、消费是三个正交统计维度；不能以子代理或会话累计 token 推定主会话上下文占用，不能以账户额度变化推定会话消费。

### 第六轮：用户确认状态组合并新增无统计口径

- Q16：额度消费性质与数据完整性分别保留，可同时存在；完整性按指标区分，额度请求缺 usage 不制造人民币费用缺失，但可标记 token 用量不完整。
- Q17：用户指定 token-only／hidden 归入新类别“无统计口径”，与“未知”“额度消费”并列；不是默认推断为额度渠道，也不是默认推断为计费但缺价格。保留源记录。

用户已确认 lighthouse 草案并要求继续。正式决定以[消费归属决议](../lighthouse/02-accounting-ownership.md)为准，本票 resolved；前述未确认或被替代的历史提议不覆盖正式决议。追踪结果及具名交接见[消费归属地图追踪](../assets/02-accounting-ownership-trace.md)。十张现有开放票补充约束与问题，均保持 open；两片已精确的 fog 交给既有责任票，未创建重复票。

~~~~~~~~

## decision/06-local-storage.md

~~~~~~~~markdown
# framework 如何提供独立存储、原子更新与跨进程协调？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 02, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- 数据布局已由[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)收口；本票不再等待数据票，也不恢复旧逐 Turn 账本／历史 Round／补账要求。
- 设计实际会话 × 账户 × 模型自身聚合、父子启动关系、最近 Round 快照、账户周期／归档、holiday 与 quota estimate 的物理组织；runtime 请求去重标记不落盘。最近快照同 round_end 聚合发布；迟到子消费发布时机仍待决定。
- 账户 clear 归档目标账户全部会话已知聚合、重置活动累计、关闭 holiday；无消费也可关闭 holiday。既有归档、其他账户、Codex estimate、入口 detail 保留。普通 resume 仅加载活动周期，不扫描消息／合并归档。
- 需确定归档／重置／关闭 holiday 的一致完成／失败条件，旧缓存／排队保存／其他进程不复活已清数据的最小代际／原子机制，以及混账户父子关系中其他账户查询所需关系如何保留；这些是本票未决机制，不是新批准 schema。
- round_end 保存完成／等待／失败、发布幂等及同账户多会话不丢不重仍需收口；未落盘强杀损失已接受，不借此增加退出排空／崩溃恢复系统。

## Handoff from latest state-data discussion

- [数据讨论的当前有效决定与新对话交接](12-state-data-contract.md)优先于下方历史交接：采用扩展自有聚合，round_end 保存累计与最近 Round 快照，不建立历史 Round／Turn 列表；接受异常退出未落盘损失，缺 usage／价格只提示并跳过对应指标，不维护缺失计数或补算记录。不能沿历史交接重新要求完整账本或缺失恢复系统。
- 会话／账户隔离、正常有 usage 消费去重、逐代理自身／含后代汇总、同账户多会话不丢失／重复／覆盖仍保留。最新余额／额度读数仅内存，holiday／quota estimate／归档保留既定持久化要求。
- 数据布局已由正式 Lighthouse 收口；本票可继续讨论保存完成／失败、有限幂等发布、迟到子消费时机及跨进程协调。不泛问整个 callback 同步／异步，不预建正常离开的额外保存钩子。

## Discussion approach

以数据／State 票给出的具体记录和读写路径为前提，先比较实际存储方案及调用方式，再决定操作级的同步／异步、锁与恢复。不泛问“整个回调等待不等待”，不把存储实现推迟到观察接口已冻结之后。至少走通一次正常消费写入和一次多会话同账户更新，说明当前内存值、持久化确认、故障后恢复各依赖什么。

## Handoff from clear reset decision

- **最新恢复与 holiday（Q22／Q23）**：[数据讨论](12-state-data-contract.md)已确认 resume 只恢复本账户周期的活动聚合，旧消费保留归档、不自动合并或重估，不维护跨周期 Session 总数。holiday 保持账户共享持久化，直到目标账户成功 clear；无消费可归档时也可 clear 关闭。不清其他账户、Codex estimate 或入口 detail；归档／重置／关闭 holiday 的一致性与失败处理须在存储／命令票收口。以下旧待决措辞由本交接替代。

- **最新有效范围（Q21）**：[数据讨论](12-state-data-contract.md)已确认仅保留账户级 clear，归档目标账户全部会话的活动聚合后重置；替代下方 Q17 树级范围，不影响其他账户、已有归档及 Codex estimate。Q18 的丢弃旧在途／正常统计新请求规则按被清账户应用，不顺带丢弃其他账户消费。clear 后 resume 的旧累计查看方式仍待决定，Q20 holiday 尚未确认；单一 DeepSeek 运行会话是当前讨论假设，不等于已取消多会话支持。下方旧范围与复审过程仅供溯源。

- 最新复审：[数据讨论](12-state-data-contract.md)已确认 Q19 归档仍为需求，随后用户要求重新界定 clear 的树级／账户级范围与 resume；以下 Q17／Q18 是已确认的复审输入，不代表新的账户级方向已经批准。Q20 不清 holiday 建议未确认。旧 Total 显示重估不等于历史费用重新落盘，证据见[旧 clear／resume 调查](../assets/old-clear-resume-smoke.md)。

- [数据讨论的 Q17／Q18 当前有效决定](12-state-data-contract.md)明确：clear 重置当前主会话及全部子／孙的消费与 Round 统计、业务关联和在途请求关联，不波及其他独立主会话；旧在途响应丢弃，clear 后旧子代理的新请求正常统计并由可靠宿主关系重新建立归属。此决定优先于下方旧账户级 clear／Session 始终保留的交接，不取消 tree 不回滚规则。
- 不取消真实执行、不改变 framework Round／活动状态；不默认删除已有归档或 Codex estimate。是否为本次 clear 生成归档及 holiday 的账户共享影响尚未定型；旧缓存／排队保存不得复活已清统计，具体原子与版本控制留存储票。

## Question

新统计允许从空开始；确定新存储根目录、扩展／账户／provider namespace 与路径配置，且不删除或改写旧 ~/.omp/cost-archive。哪些通用文件能力进入 framework，哪些 JSON schema、合并／归档及 estimate 采纳规则留在 model-cost？

确定读缓存新鲜度、锁内重读／update、原子发布、跨进程锁、等待／取消／错误与损坏不覆盖契约，并讨论平台条件。旧 OMP native file-lock 不能作为 harness-independent implementation 偷渡进共享代码。DailyTracker 与 quota estimate 的完整业务能力仍需保留；从空起步不等于取消后续持久化、恢复或并发安全。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 的 Q10 确认现有累计与归档作为需求基线：本票承接累计周期、按 session 分段的数据模型、归档内容／周期切换、holiday 保存及 clear 对存储的作用边界。最新余额／窗口读数只存内存，不取消累计与 quota estimate 持久化。任何业务删改均需说明差异、理由并由用户确认，不得以实现取舍默删。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：消费记录关联请求、实际会话、Turn／Round、账户、模型、请求锚价与父子启动关系；逐请求幂等、可靠缺失信息补齐原记录、保留冲突证据。支持同进程及跨进程多独立会话，账户累计不得丢失、重复或覆盖其他会话贡献。汇总视图不是第二笔消费。
- 待决定：事实记录／索引／派生累计如何组织与原子更新，崩溃后如何可靠恢复未入账记录，历史 Round／Session 与 tree／fork 如何查询而不重计；损坏、重复写、补齐与取消如何协调？不能用恢复时当前价格重算历史。
- 未知／额度消费／无统计口径对金额贡献零但保留性质；指标完整性独立。最新余额／窗口读数仍只存内存；estimate 基线与采纳值按账户持久化，同源成对样本不可跨来源拼接。
- 待决定：账户累计周期、clear／归档与迟到补账并发时的归属、原子性与不回滚历史消费关系；同一 session 单执行者的协调与退出恢复由何种通用能力承接？不在本交接决定锁或文件格式。

~~~~~~~~

## decision/07-command-state.md

~~~~~~~~markdown
# /budget 的参数、操作与状态如何在新框架表达？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 06, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- 最终行为见[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)：只提供账户级 clear，不提供会话树级 clear；先归档，再重置目标账户周期并关闭 holiday，空消费也能通过 clear 结束 holiday。旧树级与不清 holiday 的建议不再有效。
- 数字／K／0 预算修改取消；detail／holiday／clear 保留。detail 入口内存，切会话／tree 保留，重载回 brief；不清 Codex estimate、已有归档、其他账户或 detail。本票仍需决定命令名、模式限制、成功／失败反馈及原子操作映射。
- 单一 DeepSeek 运行会话是已使用的推演条件，不是已批准检测／拒绝策略；若需要限制其他活动会话，必须在本票带实际路径作新决定。

## Handoff from clear reset decision

- **最新恢复与 holiday（Q22／Q23）**：[数据讨论](12-state-data-contract.md)已确认 resume 只恢复本账户周期的活动聚合，旧消费保留归档、不自动合并或重估，不维护跨周期 Session 总数。holiday 保持账户共享持久化，直到目标账户成功 clear；无消费可归档时也可 clear 关闭。不清其他账户、Codex estimate 或入口 detail；归档／重置／关闭 holiday 的一致性与失败处理须在存储／命令票收口。以下旧待决措辞由本交接替代。

- **最新有效范围（Q21）**：[数据讨论](12-state-data-contract.md)已确认仅保留账户级 clear，归档目标账户全部会话的活动聚合后重置；替代下方 Q17 树级范围，不影响其他账户、已有归档及 Codex estimate。Q18 的丢弃旧在途／正常统计新请求规则按被清账户应用，不顺带丢弃其他账户消费。clear 后 resume 的旧累计查看方式仍待决定，Q20 holiday 尚未确认；单一 DeepSeek 运行会话是当前讨论假设，不等于已取消多会话支持。下方旧范围与复审过程仅供溯源。

- 最新复审：[数据讨论](12-state-data-contract.md)已确认 Q19 归档仍为需求，随后用户要求重新界定 clear 的树级／账户级范围与 resume；以下 Q17／Q18 是已确认的复审输入，不代表新的账户级方向已经批准。Q20 不清 holiday 建议未确认。旧 Total 显示重估不等于历史费用重新落盘，证据见[旧 clear／resume 调查](../assets/old-clear-resume-smoke.md)。

- [数据讨论的 Q17／Q18 当前有效决定](12-state-data-contract.md)明确：clear 重置当前主会话及全部子／孙的消费与 Round 统计、业务关联和在途请求关联，不波及其他独立主会话；旧在途响应丢弃，clear 后旧子代理的新请求正常统计并由可靠宿主关系重新建立归属。此决定优先于下方旧账户级 clear／Session 始终保留的交接，不取消 tree 不回滚规则。
- 不取消真实执行、不改变 framework Round／活动状态；不默认删除已有归档或 Codex estimate。是否为本次 clear 生成归档及 holiday 的账户共享影响尚未定型；旧缓存／排队保存不得复活已清统计，具体原子与版本控制留存储票。

## Question

用户已在[数据讨论](12-state-data-contract.md)明确移除修改预算功能，不再迁移数字／K／0 参数。确定保留的 detail、holiday、clear 的完整命令操作、命令名、模式限制、失败反馈和存活范围；不因保留旧 /budget 名称而恢复已移除的数字设置。框架当前仅 toggle/directed 与一个 boolean activation 字段，不能借 unrecognized 回调伪装完整 action 接口。

选择所需通用命令类别进入 framework，还是保留扩展原生命令集成；detail 与统计业务数据由 model-cost shared logic 管理，不为本次升级通用业务 State。detail 已确认是交互入口级内存偏好，同一入口普通会话切换／tree 保留、重载／重启恢复 brief，独立入口互不影响；holiday 跨会话／进程持久化；clear 不清 Codex estimate——确认这些业务规则如何映射。反馈现有仅 info/error，而旧命令含 warning，需有明确处理，不默默降级。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 的 Q10 将数字／K／0、detail、holiday、clear 及命令反馈确认为需求基线，而非冻结实现。本票逐项决定完整语法、模式适用范围、状态寿命、反馈及失败边界；clear 默认仍是 DeepSeek 归档／新周期／清 holiday，不清 Codex estimate。任何偏离基线的取舍必须显式记录并经用户确认。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：Session 已发生消费不因 tree、改消息或 fork 回滚；账户金额只累计计费渠道，额度消费和无统计口径不属于金额清零后可当免费的一组记录。
- 待决定：clear 的当前账户选择、归档／新周期与会话历史账本怎样区分？多会话并发、正在执行或迟到请求、账户切换与 clear 交错时，操作影响哪一周期与哪些视图？保留已确认的 clear 不清 Codex estimate 基线，任何改变需显式确认。

~~~~~~~~

## decision/08-presentation.md

~~~~~~~~markdown
# 动态 widget 如何分层，无 UI 时哪些业务仍需更新？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 03, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)限定 Session 为适用账户当前周期内跨 Round 的累计、Round 为其中该轮；clear 后 resume 不显示旧周期总数或重估宿主历史。旧归档仅保留可查文件，不默认新增归档 UI／查询命令。
- UI 读取 shared logic 的自身／子代理合计／整体视图，布局和默认展开未定；只保存最近轮、恢复明确叫最近 Round，tree 后该位置轮数值不可用，不显示成零。混账户周期、clear 跨开放 Round 的描述需和观察票一致，不伪造新轮。
- 缺 usage／价格只提示／跳过相应指标，不保持缺失计数或持续完整性标记；有 usage 缺价仍累计 token，失败／取消有可靠 usage 仍累计。提示位置、headless 可观察性仍由本票决定。
- 固定 DeepSeek 450K／Codex 272K 预算显示／告警保留，修改入口移除；入口 detail 切会话／tree 保留、重载 brief。renderer 不维护第二套权威累计或副作用。

## Question

明确动态多行进度条、窗口节奏、费用／余额告警色、Effort 着色、分段条与宽度降级归 extension harness presentation，还是本次抽出 framework 通用展示 capability？现有 marker area 只是框架统一的单行激活标记，不应强塞复杂 widget。

确定 shared logic 提供什么已对齐的展示模型，native renderer 只读取与布局／主题，不在 render 改 lastContextTokens、请求 API、创建 timer 或落盘。明确无 UI／RPC 时必须保留的记账与持久化行为、远端刷新与展示计算是否运行；账户故障保持 widget-only 旧要求与无 UI 可观察性的关系要用户确认。输出具体视觉及 headless 验收场景。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 的 Q9/Q10 要求保留双窗口节奏／重置展示、ratio／left、累计与 session 分段条、费用／余额告警、widget-only 请求错误和命令反馈的现状基线；本票承接视觉、宽度降级、标签及无 UI 可观察性取舍，改变需用户确认。新 Turn 是一次 LLM 请求／响应，不含工具执行；Round totals／Session totals 与“旧的 Turn”分开，最终 UI 标签在本票决定。更新由事件触发，结果更新后检查 UI 是否需要渲染，需要则请求一次刷新；无 UI 时是否刷新远端数据尚未决定，原 Question 中的无 UI 更新要求不得视为已经获批的完整策略。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：必须能清楚区分主会话自身（排除全部子代理）、每个子代理自身／含后代、主会话含后代的消费；异构子代理和切换前模型不能被当前模式过滤掉源记录。
- 待决定：这些统计以何种视觉和查询入口呈现，历史金额与当前 provider 的余额／额度如何并列或筛选？不能只做一个无法查看明细的 owner 总数。
- 金额只汇总计费渠道；Codex 美元仅参考，不能进入消费金额总计。未知／额度消费／无统计口径各对金额贡献零，保留可同时存在的性质／完整性标记，不标成免费。token 与金额完整性分别表达。
- 历史消费归属决议曾要求 tree 历史 Round 查询；该要求已由[数据讨论的当前有效决定](12-state-data-contract.md)明确收窄：只保存最近 Round 开始／结束快照，不保留历史 Round 列表；/tree 后 Round 数值隐藏或不可用，Session 累计不回滚，恢复快照明确称为最近 Round，不能冒充当前位置。历史 lighthouse 不改写，最终数据 lighthouse 交代修订。上下文、账户、消费正交，不能累加子代理上下文作主会话预算。无 UI 的具体交互与刷新仍待本票和调度票决定。

## Handoff from state-data discussion

- 用户明确要求 UI 体现主会话自身消耗与子代理消耗区别；按实际会话独立聚合，不从父 Round 总数推算。详细语义及最新决定以[数据讨论](12-state-data-contract.md)为准，此处仅索引需求。
- 本票后续决定主会话自身／子代理汇总／整体合计的布局、逐子代理展开方式及窄宽降级；这次确认不等于布局已批准或 UI 已实现。
- 数据讨论已明确简化缺失事实处理：缺 usage 或计费所需价格时只打印提示并跳过相应指标，不维护缺失计数／持续完整性标记／补账记录。领域文档保留未知、无统计口径等概念供分析，不能因此要求 UI 实现完整状态模型；具体承载提示方式待本票确认。最新替代范围以数据票为准，前部旧交接的持续完整性要求不能覆盖该修订。

~~~~~~~~

## decision/09-refresh-lifecycle.md

~~~~~~~~markdown
# 额度与余额在何时刷新，异步效果怎样跟随会话生命周期？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 03, 04, 05, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](05-http-capability.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)将最新余额／双窗口、获取时间、加载／请求错误保留为账户级内存缓存，holiday／quota estimate 继续持久化；来源成对与跨账户隔离保留，调度 TTL／single-flight 仍由本票决定。
- 旧在途消费在目标账户 clear 后主动丢弃，不等于所有迟到远端测量也一律丢弃；远端余额／额度读数不是消费累计。区分账户周期 reset、会话／模型切换、原账户测量与当前展示，决定哪些响应／timer 仍可更新什么，不让旧实例覆盖新实例。
- 不从 render 发请求、创建 timer 或更新权威业务态，不借新通用 State 替代扩展业务缓存。

## Question

将请求 headers 即时更新、assistant 完成的 30s TTL 主动刷新、旧原生 agent_end 强制刷新、session／原生 agent_start 开始 stale 拉取、模型切换预取与峰谷边界 timer 映射为精确业务调度。明确单源 TTL 与两源预取当前差异、single-flight、API/header 先后覆盖及失败是否保留旧值。

调度业务规则应归 model-cost；通用生命周期／取消能力由 framework 提供。会话或模型／账户切换时，旧响应与 timer 是否还能写新状态，效果如何解绑？未返回的请求是否阻塞 agent loop／退出？render 不驱动副作用。契约确定后为仍不清楚的竞态开新票，不凭经验加重试。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 确认事件驱动更新；更新后按当前 UI 需要请求刷新。本票决定触发事件、请求合并／防抖／节流与 TTL 的不同语义、时间参数通过现有 YAML 配置读取、是否跨模型同时刷新两个数据源、无 UI 的远端刷新策略。不得把现有 30s、独立 TTL 或只刷新当前模型写成既定新契约。Q9 的窗口／估计行为全部保留；主动读数与 header 时序、同源成对测量的接入必须覆盖。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：请求与子任务的消费归属固定；迟到补账更新原记录／历史 Round，不开启历史 Round 或改归当前会话。账户额度及缓存不因换会话清空，换账户选择各自范围；同源成对读数不可拼接跨时间、跨来源窗口。
- 待决定：旧会话请求、header、API fetch、timer 在模型／账户／tree 切换后，哪些仍能更新原账户或历史记录，哪些不得覆盖当前展示 State？怎样提供身份／代际关联而不把迟到数据一律丢弃？多个独立主会话共享账户时，single-flight、读数先后、错误及 estimate 更新按什么范围协调？
- Codex 额度不能分摊或换算为 Session 消费；render 不能决定消费事实是否入账。旧回调污染新会话这一 fog 已精确交给本票，不另建重复并发票。

~~~~~~~~

## decision/10-assembly-layout.md

~~~~~~~~markdown
# 确定的新能力与 model-cost 如何组织、声明和装配？

Type: grilling
Status: open
Assignee:
Blocked by: 03, 04, 05, 06, 07, 08, 09, 12, 13
Prerequisites: [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](05-http-capability.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)；[/budget 的参数、操作与状态如何在新框架表达？](07-command-state.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](08-presentation.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](09-refresh-lifecycle.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](13-model-catalog-policy.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)已明确 shared logic 拥有自身聚合／关系／当前最近轮／账户缓存，framework 激活 State 不作业务容器；UI 只读，native import 只走 adapter／harness seam，不建立第二套框架或配置。
- 运行期请求身份标记寿命绑定观察实例，detail 绑定交互入口；普通切换／tree 与重载／销毁不是同一边界。装配需说明实例创建、销毁、请求观察与业务数据恢复怎样绑定；具体接口未定。
- 不把所有业务数据塞进 State 或在装配层再实现计价／汇总；同 session 单执行者检测与拒绝仍是未决原生／通用协调问题。

## Discussion approach

本票的最终组织／装配规格仍在相关契约收口后决定；但旧源码到新模块的数据流与装配草图必须提前作为数据／State、存储和观察讨论的输入，不要求讨论者仅凭抽象接口选择方案。早期草图不是本票已结案或生产实施授权。

## Question

将已确认契约映射到现有 framework core／behaviors／adapters 和 extensions/model-cost 的 definition／shared-logic／harnesses／entrypoint。是否需要新的通用能力目录或公共 authoring exports，如何保持原生 import 只在 adapter／extension harnesses？不得建立第二套能力声明、配置或框架。

确定 dependency injection、业务模块拆分、requiredSemantics 与 fail-soft binding、配置路径和消费者迁移职责，冻结源 oracle revision 与依赖来源。现有唯一 boolean State 不应被业务数据冒用。此票产出可实施组织规格，不复制代码、生成空文件或开始实现。

## Handoff from state-data discussion

- [数据讨论当前有效决定](12-state-data-contract.md)明确：本次特定的聚合、最近 Round 快照、数据寿命与统计 tradeoff 属于 model-cost shared logic，不提升为通用业务 State。
- Round、response／usage、实际会话及父子身份等宿主事实使用 harness-independent 接口，adapter 映射宿主，shared logic 不依赖 OMP 原生 context／payload；接入其他 harness 不重写该业务逻辑。本次仍只落地 OMP，不实现或认证 pi adapter。
- 业务数据的读写归 shared logic，UI 读取其只读视图，HTTP／文件与协调能力按地图既定 framework 分层承接；具体接口和模块组织仍由相关票收口。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：支持同进程及跨进程多个独立 main、每个 session 单执行者；Owner State 与业务消费归属不同。
- 待决定：如何装配请求事实采集、业务账本、统计视图、账户解析、State 和通用持久化协调；单执行者检测／拒绝由何层提供？不要在装配层重实现业务计价／聚合，也不要在 shared logic 引入 native 身份或锁。受影响既有消费者的生命周期能力仍按原 Notes 审查。
~~~~~~~~

## decision/11-acceptance-cutover.md

~~~~~~~~markdown
# 什么证据才算完整迁移，如何安全验收并切换？

Type: grilling
Status: open
Assignee:
Blocked by: 10
Prerequisites: [确定的新能力与 model-cost 如何组织、声明和装配？](10-assembly-layout.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- 验收以[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)的有意简化替代旧交接的历史 Round 查询／补账／持续完整性要求：聚合＋最近快照、tree Round 不可用、resume 本周期、接受未成功保存的强杀损失；不按旧测试反向要求完整账本。
- 覆盖正常结束重复通知、实际重发、已处理身份不在 round_end 清空、旧实例隔离；失败／取消可靠 usage 入账，无 usage 跳过；有 usage 缺价只缺费用且不猜补，Codex 参考缺价不影响额度。
- 覆盖真实父子／孙关系恢复、启动轮筛选、迟到旧子不污染当前轮、混模型／账户归属与 no double count；不能把已有零 usage fixture 作为真实非零账单证明。
- 覆盖账户 clear 归档／reset／关闭 holiday（空消费也关闭）、之后 resume 不读回旧归档、clear 前在途丢弃／之后旧子新请求正常统计；其他账户／已有归档／Codex estimate／detail 不误清；旧排队保存不能复活已清数据。具体并发／失败验收依赖存储及命令机制，不宣称已通过。
- 覆盖预算修改移除与固定显示／告警保留、入口 detail 的切换／tree 保留与重载 brief、只读 renderer；新统计从空开始、旧文件不删除和 OMP 正式基线继续约束。

## Question

定义完整迁移的可观察验收：真实宿主请求／响应／多 Turn／工具执行／Round 事件关联、计价边界、模型切换、各模式命令、headless 更新、renderer 无业务副作用、跨进程存储、安全失败、真实余额／Codex 额度与视觉 TUI。

明确使用框架当前 18.5.0 基线还是显式选择其他版本；不能把当前安装版本或源码检查当验证。哪些自动 smoke、哪些需要凭据或用户交互？如何分离框架升级报警与扩展业务回归，并处理旧测试中实现细节断言？

确定新统计从空开始的验收、保留旧文件、原新实现加载互斥、正式配置与进程重启的用户动作、切换失败回退及完成记录。图外实施必须完整交付，不以 scaffold／测试 green 宣称完成。此票输出验收与切换标准，不修改正式配置或执行切换。

## Trace handoff

来源：[行为契约决议](../lighthouse/01-behavior-contract.md)。验收必须区分逐响应计价正确与统一 Round 边界正确。覆盖工具指令／工具结果输入、自动续跑、跨峰谷费用求和与恢复信息不足；对照冻结 source oracle 验证保留行为与每项用户确认的有意改变。覆盖 Codex 双窗口、ratio／left、命令／累计／分段条基线，不把无 UI 远端刷新策略或最新模型名单视作既定规则。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 验收交接：逐个区分主会话自身与每个子代理，覆盖嵌套／异构子代理、orchestration 请求与汇总不双计；模型／账户切换不重解释旧请求。
- 覆盖取消后修改重发（有 usage 入账、无 usage 未知零贡献）、迟到补齐、乱序、重复通知、已知数据冲突、崩溃恢复与无可靠历史价格；不将未知当免费或为补账自动重发。
- 覆盖 resume／switch／tree／fork、选中 Round 中途节点显示完整历史 Round、Session 跨路径不回滚；覆盖多 main 同进程、多进程同账户并发增量不丢失／不重复／不覆盖、不同账户隔离、同 session 第二执行者拒绝与正常恢复。
- 覆盖计费金额／额度消费／无统计口径／未知可组合状态及各指标完整性，Codex 美元仅参考，账户额度不分摊给 Session，上下文不跨代理累计；clear 并发场景在命令与存储契约确定后验收。以上是验收要求，不是本次已运行的生产证据。

~~~~~~~~

## decision/13-model-catalog-policy.md

~~~~~~~~markdown
# 官方计价与 token-only 模型名单如何确定、配置和维护？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 02
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)已收窄缺价实现：计费 usage 有而适用价格缺失时仍累计 token，只跳过费用并提示，无补算状态；Codex 参考缺价不影响 token／额度，token-only／hidden 没有金额口径不因缺价报错。
- 领域概念未知／确认零／无统计口径继续保留；不据此要求运行时完整性枚举。模型／价格名单及维护来源仍由本票决定，不能用后来价格改写已锚价历史。

## Question

依据[行为契约决议](../lighthouse/01-behavior-contract.md)，provider 的 Codex／官方 DeepSeek／token-only／hidden 分层已确认，具体 model ID 未冻结。确定迁移覆盖的官方人民币价格表、token-only 名单、别名匹配、未知模型行为及 Codex model.cost 缺失时的参考费用展示（不改变额度渠道分类）；区分 provider 身份与 URL 鉴别，不擅自扩大官方分类。

两套名单如何持续维护：以版本化扩展数据、既有 YAML 配置还是宿主 catalog 事实为来源，谁拥有更新与价格来源？若采用 YAML 必须复用框架配置机制。核对 source revision 中 deepseek-v4-pro、deepseek-flash、deepseek-v4-flash、deepseek-v4-flash-vision-exp 的官方计价覆盖与仅前述 v4-pro/v4-flash 的第三方 token-only 覆盖差异，决定是否有意改变；现状不是已批准名单。不猜测未来模型定价；若需要外部事实，另行开 research 票。本票只决定覆盖与维护契约，不执行生产更新。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：DeepSeek 为当前计费渠道，已知费用参与金额累计；Codex 为额度渠道，美元计价只作参考、不进消费金额累计；token-only／hidden 归“无统计口径”。“未知”是缺失适用统计所需信息，不能与额度消费／无统计口径／确认零混同。
- 待决定：具体 provider／模型／别名如何映射以上口径，已知价格缺失与无口径如何判别，配置／catalog 资料怎样更新而不追溯改写已锚定的历史费用？Codex 缺 model.cost 只影响参考费用，不能因此改变额度渠道性质。
- 展示模式与消费采集分离：只要有源头数据就保留；hidden 不授权丢弃请求事实。保持原 provider 分层需求，但不把“全部已知美元”混入消费金额汇总。
~~~~~~~~

## map.md

~~~~~~~~markdown
# model-cost 完整迁移：通用能力分层与 OMP 适配

Labels: wayfinder:map

## Destination

逐项确认 model-cost 的完整需求、extension／framework 通用能力／harness adapter 的归属、能力契约、源码组织及验收标准，形成可直接实施的完整迁移规格。地图清晰后进入单独跟踪的实施，最终完成 OMP 上的迁移与验收；地图本身不承载生产实施。

## Notes

- 2026-10-09 用户确认：先决策，再完整实施；OMP 落地，业务逻辑与通用契约保持 harness-independent，不在本次实现 pi adapter。
- 用户确认以现有功能全量保留为讨论基线；逐项讨论后才允许有意删改。以实际代码、业务 ADR 和 glossary 为证，不把 README 当完整清单。
- 用户允许全新统计：不要求导入旧统计文件、延续旧统计基线或新旧文档读写兼容。保留旧数据、不自动删除或改写；新存储根目录、账户隔离、归档格式和正式切换另行决策。
- 用户确认按三层开票：model-cost 拥有业务规则；HTTP／文件及并发协调纳入 framework 通用能力；宿主事实与语义映射由 framework adapter 提供。具体接口并未确认；widget、命令和认证／代理的 seam 单独讨论。
- 现有 ADR-0002 的责任测试与 native import 边界继续约束本次设计。backlog 对 HTTP 曾持扩展自有方向，本次明确讨论升级为 framework 能力；最终决策须同步其唯一权威文档，不能并存两套政策。
- 2026-10-09 用户选择以旧实现“聚合为主”为基础，先检验具体极端场景，只有发现不能满足的必要场景才取舍是否升级。/tree 优先保证 Session 累计正常，历史 Turn 累计可能不可取得可以接受；最小 framework 能力由选定实现需要倒推，而非先造完整账本／框架接口。该局部取舍不自动取消其他功能，正式修订范围由当前数据决策记录。
- 2026-10-09 用户要求重新评估“按 Turn 记录”的成本收益：逐响应计价／累加、运行期关联与长期明细留存不是同一要求，不把完整逐 Turn 账本或准确性最大化作为默认迁移目标。数据讨论先用旧代码和实际场景验证最小必要记录粒度；此前决定可据此提出修订，但未确认的修订不覆盖历史 lighthouse，不自动缩减其他已确认功能。
- 2026-10-09 用户要求纠正讨论顺序：先用旧源码、具体数据结构和一条端到端数据流建立实现心智模型，再讨论逻辑／接口取舍；未说明数据在哪里、谁读写、何时持久化前，不泛问同步／异步。当前先做数据归属／寿命／查询，再做存储与协调，随后收口观察处理约束和刷新调度。装配草图可以提前作为讨论材料，最终装配规格仍在契约明确后收口。保持地图规划模式，可用隔离探针支持决定，不做生产迁移。
- 每次咨询 grilling、domain-modeling；设计接口咨询 codebase-design；决策落地依次使用 lighthouse、backtracer。HITL 决策须由用户确认。每次工作只解决一个非 research 决策票，chart 会话不关闭票。
- [现状调查与功能证据](assets/current-state.md) 是事实资产，不是已批准的契约。它也记录调查 smoke 的实际输出；远端余额／额度、动态 TUI、完整 OMP 原生链路均未在本次调查运行。
- 框架当前仅实现 OMP adapter，支持基线为 18.5.0；本机安装版本不等于支持基线。迁移验收版本是否改变必须显式决定。
- 子票存放于 decision/；按编号扫描 open、无未满足依赖、未认领的票选 frontier。开始工作前先写 Status: claimed 和 Assignee。开放票不在地图正文重复列出。
- [数据归属与账户周期决议](lighthouse/12-state-data-contract.md)已正式结案；最终取舍与历次暂停溯源只在 Lighthouse。后续按已定数据流推进存储与协调，再返回观察处理约束；不重问聚合／明细账、不恢复观察票旧 Q10，不把本票结案视为存储或原生观测已实现。继续工作时按 tracker 查询 frontier，或使用用户明确指定的票。

## Decisions so far

- [完整保留哪些业务行为，统计单位如何命名？](lighthouse/01-behavior-contract.md)：以现有功能为基线，统一 Turn／工具执行／Round，逐响应入账与生命周期分离；Codex 功能完整保留，其他取舍交由具名票确认。

- [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](lighthouse/02-accounting-ownership.md)：逐请求、逐代理与账户幂等聚合，历史不随 tree 回滚；金额只累计计费渠道，区分未知／额度消费／无统计口径，保障多会话并发正确。

- [model-cost 的哪些数据进入 framework State，如何声明与读取？](lighthouse/12-state-data-contract.md)：扩展自有逐响应聚合与最近 Round 快照、有限内存去重；累计限于账户当前周期，账户级 clear 归档重置并关闭 holiday，resume 不重算历史或合并旧归档。

## Not yet specified

- 原生宿主缺失某个观测或账户能力时，哪些可降级、哪些需拒绝，以及诊断如何与原有 widget 错误语义衔接，待契约明确后展开。
- 本次新增通用能力对 connect-bot 等既有消费者的复用或收口影响，需在接口定型后判断哪些是本次调用方迁移义务，避免制造第二套机制或扩大业务范围。

## Out of scope

- 实现或认证 pi adapter；只考虑契约是否把 OMP 原生细节泄漏给共享代码，不宣称 pi 能力对等。
- 导入旧统计、继续旧基线或要求新旧统计文档双向兼容；用户允许从空统计开始，旧数据保留。
- 图内执行生产迁移；决策规格完成后进入独立 implementation 工作流，整体迁移目标不取消。
- Codex 会话消耗与账户额度之间的转换或分摊；[消费归属决议](lighthouse/02-accounting-ownership.md)确认不做此换算，账户级双窗口／ratio／left 与参考费用继续保留。
~~~~~~~~

