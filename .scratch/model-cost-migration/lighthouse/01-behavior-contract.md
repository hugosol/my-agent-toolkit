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
