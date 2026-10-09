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
