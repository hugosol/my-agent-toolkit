# 本次暂停发布前的原文快照

仅作历史，不是当前规则。原文件路径标明各段来源；当前政策以 Lighthouse 为准。

## decision/03-observation-contract.md

~~~~~~~~markdown
# framework 如何提供请求、响应、Turn／Round 与模型事实观测？

Type: grilling
Status: claimed
Assignee: wayfinder-current-session
Blocked by: 01, 02, 12, 06
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)
Lighthouse: [观察局部决议](../lighthouse/03-observation-contract.md)

## Handoff

- 暂停原因：用户“现在暂停grilling，我们开始回顾旧决策”；当前不继续采访或生产实施。已发布部分结果，但整票未完成，发布后回 open、清空认领。
- 当前权威：[观察局部决议](../lighthouse/03-observation-contract.md)持有原已确认 Round／Turn 语义与本轮 Q10–Q13／Q15；[命令局部决议](../lighthouse/07-command-state.md)只持有用户批准的 clear 执行条件。行为／消费归属／数据／存储其余有效约束不变，不将局部发布视为接口已实现或命令票结案。
- 本轮确认：轻量 Turn 处理与 Round 保存路径衔接、无结束后修正、framework 身份与 provider ID 分离、无法匹配丢弃、已知冲突丢弃并只清理该 Turn。理由是一次累计、简单实现与保留旧无明显新增延迟体验；详情／确认原话只在上述权威。
- 拒绝／未采用：统一等待所有观察异步效果、metadata／usage 分拆公共事件、自动补配／补账、全局持续故障／完整性状态、“开放 Round 内 clear 后重设零基线”、pending clear。原历史完整文本见[发布前快照](../assets/observation-history-before-publication-2026-10-11.md)，下方 Comments 只作推导历史，不作为现行恢复点。
- 前置重算：行为／消费归属／数据／存储票均 resolved；旧“等存储／数据后再回来”入口退役。本票仍有下面具名未决问题，不因一个输入可用就整票 resolved。命令票已有局部 clear 条件，其语法／实际状态判定／反馈尚未完成。
- **下一回顾问题**：消费归属旧“拒绝并发驱动／检测待定”与存储 Q26“无执行者检测、保存版本冲突收口”是否需要按已批准的后者修订旧表述？本次只记录冲突，不擅自重开／关闭或决定已 resolved 票的其他范围。
- **恢复本票的下一个技术问题**：在固定 OMP 18.5.0 实际观测面，怎样可靠区分 provider usage（包括真实零）与宿主默认零，并在 turn_end 一次交付？先查支持路径与证据，不问用户替代事实；没有可靠源按已定不可用规则处理，不凭非零字段或成功结果泛化所有 provider。
- 剩余问题：Turn 原生关联／具体生成及乱序、取消、重发／重复／重放；结束候选复查、防旧候选终结新活动；异步派发与 round_end 保存完成／取消映射；恢复／reload／switch／tree／fork 的具体范围、旧实例隔离与观察身份；逐子代理／多 main 观察及 requiredSemantics／owner 效果隔离；父子启动分段、重用同子会话、混账户关系／迟到发布；跨入口 clear 后当前／最近 Round 可用性（本入口半轮清零方案不采用）；模型 catalog 价格单位、实际 Effort、上下文与会话／orchestration 事实读取、活动／专门交互事实、最终接口与消费者迁移责任。
- 保留的理由／边界：Round 按可见信号与日常路径，不按任务语义；不要求全部后台 jobs 归零；子消费按实际启动关系，不按当前轮或 Session 含后代差值猜；存储 Q6／Q14 的磁盘初始化／无基线暂停与单 Turn 局部清理不同；跨进程旧周期拒绝不被本入口 clear 限制替代。已处理身份不因丢弃或 round_end 清掉，统计故障不取消模型或伪造生命周期。
- 证据：[请求链探针](../assets/omp-request-observation-smoke.md)、[子代理调查](../assets/omp-subagent-round-findings.md)、[结束时序探针](../assets/omp-end-timing-smoke.md)、[旧观察等待调查](../assets/old-observer-waiting-smoke.md)、[数据 Backtracer](../assets/state-data-backtrace.md)。常见 OMP RPC／task 路径有既有运行证据，未证明新 framework 接口、全部 provider、实际 Effort／账单、完整取消／恢复／多 main／丢事件或 TUI。pi／connect-bot 早期探针与 HEAD 证据限制完整保留在快照，未认证 pi adapter 或真实自动关机。此次仅新增固定基线源码只读核对，无新运行 probe。
- 追踪结果／待办见下方本轮 Trace Report；新增问题均有既有归属，不创建重复票。回顾旧决策期间不认领下一票；如需恢复 grilling 或切票，先检查当时实际 claim 与权威。

## Question

设计 framework 拥有且由 OMP adapter 映射的观测契约：请求开始时刻与身份、HTTP 响应 headers/metadata、assistant 完成的 token usage、响应计费事实、工具执行、Round 边缘分别何时派发、如何关联？模型／provider／catalog cost、实际 Effort、上下文 tokens、会话累计／orchestration 统计与会话身份以什么小接口提供？

确定顺序、异常／中止／无 usage、模型在 Round 内切换、每请求价格锚定及不可用观测的含义。不把原生 payload 整体透传，也不让 provider-specific Codex header parser 进入语义 core。审查已有 requiredSemantics、owner 门控、生命周期与异步 handler 支持是否适用；缺失能力不得伪造成功。按选定基线核对原生映射并要求实际链路证据。

## Comments

### Trace Report：本轮暂停发布（2026-10-11）

- 来源：[观察局部决议](../lighthouse/03-observation-contract.md)、[命令 clear 局部决议](../lighthouse/07-command-state.md)，以及行为／消费归属／数据／存储当前权威。确认原话已在两份新 Lighthouse 留存；本次没有新增运行验证。
- Intent／layer 覆盖：逐响应不加文件等待、一次处理／无补账、局部清理后新请求继续由数据／存储提供业务基线，观察票提供源事实，装配／验收票提供实际链路落实；clear 拒绝／空闲执行归命令票、状态事实归观察票、反馈归命令／展示票。均有既有问题承接，不新建重复票。
- Layer integrity／peer symmetry：usage／headers／身份来自 adapter；业务计价、局部丢弃与累计由 model-cost；安全文件更新仍由 framework。connect-bot 保持 owner-scoped 效果，不将逐子代理观察或公共二态直接覆盖面板协议。远端刷新与其他 extension 不因本次确认被统一改等待／故障策略。
- 已协调的旧分支：消费归属 Lighthouse 中通用后到修正／冲突处理未决措辞已链接到观察权威；工作票旧 Q10 两个统一等待候选不再是恢复入口。clear 执行条件在命令权威，数据／存储只链接；账户周期／版本校验仍保留，入口 idle 不证明所有进程 idle。
- 待回顾的具体冲突：[消费归属决议](../lighthouse/02-accounting-ownership.md)仍写“同一 session 单执行者，拒绝并发驱动；检测／实现层待定”，而[存储决议 Q26](../lighthouse/06-local-storage.md)明确不新增租约／心跳／执行者检测，只在保存时用版本冲突发现不受支持的双执行者。新观察权威不批准新增检测。应回顾早期文字是否仅需按已批准 Q26 修订；未擅自改旧权威或重开已 resolved 的票。装配／验收旧 Handoff 也存在检测措辞，开始时必须读当前权威，不能凭旧交接恢复被拒候选。
- 仍有主的未决问题：可靠 usage 与真实零来源、结束候选复查／异步顺序／实例隔离、父子重用分段／迟到发布归观察／存储；命令的未知活动／保存失败反馈归命令；跨入口 clear 后开放 Round 的可用性归观察／展示。没有无主新票；未把用户对本入口 clear 的限制扩张为取消多进程支持。
- Gap follow-up：本次不新增依赖、不解除其他票阻塞、不改其他会话 claim。具体冲突作为旧决策回顾入口保留，待用户判定／授权对应权威修订。暂停不继续 grilling，不为未确认冲突自动建立实施任务。

以下此前讨论仅作历史，现行规则与恢复点以 Lighthouse／Handoff 为准。

以下为带日期的历史讨论，可能包含已替代的迟到补齐、轮次划分与接口提议。当前契约以前部有效决定、已同步 Lighthouse 和明确的未决交接为准，不能把历史评论当新增补账／历史查询要求。

### 第一轮：用户确认 Q1（2026-10-09）

- 区分工作完成后等待新输入与未完成工作等待用户批准／澄清。前者结束 Round；后者保留当前 Round，只改变活动状态，用户回应后继续原 Round。
- 已同步 framework/GLOSSARY.md 的 Round 与 Agent activity state 定义；未冻结状态枚举或 OMP 检测机制。不能仅凭没有模型输出或出现用户交互断定 Round 已结束。
- 本票仍 claimed；取消、失败、自动续跑、原生观测映射及其验证等尚待决策。

### 第二轮：用户确认 Q2／Q3，并提出简化边界（2026-10-09）

- Q2：明确停止当前活动结束 Round，原因为取消；之后修改输入或要求继续开启新 Round。迟到 usage 补旧 Round，不重新开启。单个请求取消不必然结束仍在自动继续的 Round。
- Q3：请求或工具失败后若仍有自动重试／后续处理，保持当前 Round；最终无待续工作且不在等待批准／澄清时结束，区分完成、取消与失败。
- 用户提出按用户输入划分 Round：有输入开始下一 Round，否则仍属同一 Round。尚需澄清是否替代 Q1 的批准／澄清例外，以及 Round 统计分组与活动结束是否分离；未将此提议写为已确认定义。

### 第三轮：用户确认 Q4，修订 Round 的公共含义（2026-10-09）

- 用户确认采用技术上可明确分辨的交互轮次，不按内容语义判断是否属于同一任务。Round 表示一轮用户与 agent 交互，服务于统计及当前轮活动结束后等待输入的判断，不代表整个业务任务。
- 每条被接受用于驱动执行的普通用户消息开启新 Round，普通文本澄清也不例外。专门的工具批准／交互回应不另开 Round，前提是明确关联已有待处理交互。自动续跑／重试／工具执行不另开 Round。键盘输入、命令操作及仅排队消息不因此启动 Round。
- 本决定替代 Q1 中普通文本澄清留在旧 Round 的规则，以及 Q3 对此例外的引用；保留专门批准／交互的例外。不能依据内容中的问句、任务是否相同或主观完成度推断边界。
- 活动完成／取消／终止失败与统计归属分离：Round 活动可先结束，最近统计仍可见，迟到用量补原 Round。用户强调等待输入状态的重要性；其技术检测及执行中输入切换／排队的细则仍须确定。
- 已同步 framework/GLOSSARY.md；旧 lighthouse 中生命周期定义与本次修订的差异，留待本票正式决议确认及 backtracer 追踪，不直接改写历史决议。

### 第四轮：Q5 的跨宿主映射问题（2026-10-09）

- 用户经验：OMP 用户消息入队，当前 assistant_message 返回后发送队列消息，可将此消费时点视为新 Round；用户询问其他宿主差异是否影响 framework，未确认全部队列／steering 细则。
- 源码核对：framework/adapters/omp.ts 的 onRound（755–786）目前以 agent_start／agent_end 和 roundOpen 合并活动；willContinue 或不满足 quiescent 时不关闭 Round。quiescent（657–671）要求 isIdle、无 pending messages、无 running async jobs。该旧映射不能原样表达本次按用户输入消费切轮的定义。
- 隔离 18.5.0 基线的 pi-agent-core/src/agent-loop.ts（1756–1762）在收尾取 late steering／aside／follow-up，将其设为 pendingMessages 并继续内部循环；另有 steering 及 live steering 消费路径（1213、1726、1849–1850）。不能概括为所有输入都只在 assistant_message 结束后消费，也不能把每次 assistant_message 结束直接等同 Round 结束。
- 此次证据为源码检查，没有执行队列／steering 原生链路 smoke，不声称已验证 extension surface 可以可靠暴露每个消费边界。
- 待确认建议：framework 固定交互轮次语义，由 adapter 映射实际消费输入的时点；Round 切换与整体等待输入状态分别观测。缺少必要原生事实时明确能力缺口，不能按文本语义猜测。其他 harness 具体队列行为未调查，本次不扩大为 pi adapter 实现。

### 第五轮：用户要求核对本地 pi 源码（2026-10-09）

- 用户要求检查 E:/Developer/myhub/pi 的队列处理以决定公共抽象。调查 HEAD a276dabe57911253350bffb93cb7d7aff6a73261，未修改 pi 源码／正式配置，未实现 pi adapter。
- 事实资产：[pi 原生循环与队列](../assets/pi-loop-findings.md)、[pi 扩展观测表面](../assets/pi-observation-findings.md)、[真实 Agent 隔离 smoke](../assets/pi-queue-smoke.md)。这些是事实及建议，不是本票最终决议。
- 确认生产 coding-agent 使用 packages/agent 的真实 Agent，不以实验 durable 路径代替。steering 在工具批结束后的续跑点消费；follow-up 在当前自动工具／steering 工作即将停止时消费。两者可以在同一次原生 run 内继续，不产生新的 agent_start。
- 用真实 Agent + 真实 AssistantMessageEventStream、确定性模型流跑了 8 场景（steer/followUp × one-at-a-time/all × 有无工具），全部通过；消费产生 user message_start/end、位于下一模型请求之前。探针已删除。不访问网络／凭据／正式存储／TUI；扩展 handler 链与 AgentSession 重试／settled 的观测结论来自源码，未跑其完整集成 smoke。
- 新发现：all 模式可在同一次请求前消费 B、C 多条用户消息；one-at-a-time 分别驱动后续请求。Q4 的逐消息分轮在批量消费下会产生零请求轮次或需要额外归属规则。建议按一次实际消费的输入批次开 Round，但此修订必须用户确认，尚未修改 glossary。
- 扩展可见 input 是提交／处理输入阶段，早于可能失败的校验，不可当成功消费事实。message_start(role=user) 是更接近消费的信号，但 user 消息无稳定 submission id/origin，不能靠 role 或文本精确区分人类输入、扩展注入与自动续跑；关联能力缺口须显式保留。
- 整体静止可观察 agent_settled 与 isIdle／pending facts；agent_end 仅结束低级 run，之后仍可能自动重试／压缩／继续。Round 因新输入消费切换不意味着 agent 曾等待用户。
- 待确认：公共输入消费／活动状态分离的契约、批量消息分轮、扩展注入是否构成新交互，以及缺少身份／来源的支持策略。本票仍 claimed，不关闭或改写旧 lighthouse。

### 第六轮：从实际消费者逆推 Round 定义（2026-10-09）

- 用户担忧 message_start 难以可靠标识 Round，要求检查除 model-cost 之外的现有用途，先从用途逆推；未接受 Q6 的输入批次方案，不冻结该方案。
- 通过 RoundEvent 的 LSP references、applyRoundEdge references 与 extensions/framework 显式事件检索确认：当前唯一直接生产业务订阅者为 connect-bot，位于 extensions/connect-bot/harnesses/omp.ts:200–206；model-cost 在本 repo 当前只有 glossary，统计用途仍是迁移规划，不是已落地消费者。
- connect-bot 的 applyRoundEdge（shared-logic/session/state-machine.ts:67–77）只把 round_start 映为 working，round_end 映为 awaiting-input，并对重复状态去重；reportState（52–56）通过本 owner outbox 发 state。heartbeat.startHeartbeat（panel/heartbeat.ts:32–43）发送同一 session.state。它不计 Round 数、不保存 Round id，也不关联某条用户消息。初始 idle 来自注册时 canAcceptInput 的采样（panel/registration.ts:262），面板在线／离线是心跳轴，不由 Round 开闭决定。
- framework binding.ts:235–250 只在有人订阅时注册 Round hook；没有 Round 内部 State 恢复／持久化动作。round-events.ts:37–57 负责 owner 门控与错误隔离。提示注入／marker 走另一个 onRunInitiation hook，不是 Round 开闭；codebase-tools 没有 Round 订阅。
- 已跑真实 connect-bot 状态机 + BotSessionStore + OutboxFlusher 的隔离探针；sender 记录输出后显式拒绝联网。start/start/end/start/end/end 实际只发 working → awaiting-input → working → awaiting-input，重复边缘被去重。capability getter 和 heartbeat cancellation 设为越界即抛错且未触发：Round 路径没有写 declared State 或取消心跳。探针已删除；未连接真实面板／宿主，不声称完整 UI 链路已验收。
- 观察说明：若将纯统计切轮 end/start 原样送给现有 connect-bot，会在连续工作时报告一次 awaiting-input；这是新定义直接套入旧消费者的风险，不是已修改生产代码的故障。
- 待用户选择的两条路线：A，Round 是从开始执行到真正等待新输入／取消／终止失败的连续活动周期，期间排队输入不另开 Round；B，Round 按普通输入消费分组，另设公共活动状态信号给 connect-bot。A 的统计粒度更粗，但无需逐消息/批次关联；B 保留每次输入统计，但必须处理批量、来源和对应身份。本票尚未选定，不自动替代 Q4 或改 glossary。

### 第七轮：用户确认 A 与有源码依据的开轮策略（2026-10-09）

- 用户明确选 A，并强调决议的价值在于找到可用的 agent_start 信号和开轮去重规则，有实际代码支持，而不是仅靠概念推演。
- 已确认：Round 表示一段连续活动周期。没有开放 Round 时，观测 agent_start 开启 Round；已有 Round 时，后续 agent_start 继续当前 Round，不另开轮。排队普通输入（单条或批量）、工具、自动续跑／重试及专门批准都不因其自身出现而开新 Round。
- 此决定替代 Q4 的每条普通消息开轮，以及尚未接受的 Q6 输入消费批次方案。普通文本澄清若代理已结束活动并等待新输入，其回答触发新的执行／Round；不判断任务语义。源码事件名和映射记录在本票，不写入 glossary 的概念定义。
- 源码依据：framework/adapters/omp.ts:755–786 已实现 roundOpen 门控的 agent_start → round_start；OMP 18.5.0 的 extensibility/shared-events.ts:201–203 定义 AgentStartEvent，session/agent-session.ts:4773–4775 转发给扩展。pi HEAD a276dabe 的 packages/agent/src/agent-loop.ts:117 与 :146 分别在初始／continue 执行派发 agent_start，AgentSession._emitExtensionEvent 将其转发。另有本票链接的真实 pi Agent smoke。
- 证据限度：可用启动信号与现有开轮门控有源码依据，pi 基础循环已 smoke；不据此声称 OMP／pi 完整 Round 结束、恢复与并发观测契约已经验证。当前 OMP adapter 的 roundOpen 是 binding 内布尔变量；已确认多 main／逐子代理需求要求后续按实际会话维护，不把现有实现泛化为多会话正确性证明。
- 已同步 framework/GLOSSARY.md 的 Round 与 Agent activity state。旧 lighthouse 保留历史决议，本票最终正式决议需说明替代关系。
- standing preference：此票后续观测设计先找宿主事实与派发路径，再确定语义映射和不可用状态；以场景运行证据区分源码可见、真实链路可用与已经验证。
- round_end 的完整原生映射、启动前已在执行的恢复／初始化、请求身份／usage／价格／headers／活动状态等仍未全部解决。本票仍 claimed。

### 第八轮：用户确认最终结束信号与低级结束的区分（2026-10-09）

- 用户确认 round_end 不直接一对一映射所有 agent_end。只在宿主确认当前连续活动终止、不会继续当前活动时，关闭已开放 Round 并派发一次 round_end；中途 agent_end 保留开放状态，以保障后续 agent_start 的去重规则。
- 确认映射方向：OMP 从 agent_end 观察，结合 willContinue 及实际静止／待续事实过滤；pi 使用扩展可见的 agent_settled 作为整段活动结束的重要信号。framework 统一语义，不强制各 adapter 使用相同原生事件名。
- 源码依据：OMP 18.5.0 extensibility/shared-events.ts:206–214 定义 agent_end.willContinue，framework/adapters/omp.ts:775–784 已有过滤；pi AgentSession._runAgentPrompt（1775–1804）在低级 run 返回后循环 _handlePostAgentRun／agent.continue，最终才 _emitAgentSettled；_handlePostAgentRun（1806–1844）检查重试、压缩和排队消息。
- 本次确认的是公共结束规则和宿主映射方向，不代表 OMP 当前 quiescent 的所有 async-job 判定均已批准，也不代表最终信号的取消、后台唤醒、恢复和多会话完整链路已经验证；不实现或认证 pi adapter。
- 下一开放问题：framework 主活动状态轴是否只区分工作中与等待新输入，不把 connect-bot 注册时的 idle 当成第三种公共活动状态；专门交互保留在开放 Round 内，另提供交互事实。connect-bot 的 closed wire enum 不因公共定义讨论自动改变。本票仍 claimed。

### 第九轮：用户提出 idle／working 二态，核对面板业务影响（2026-10-09）

- 用户提出 framework 直接使用 idle／working 两态，并指出可能影响 connect-bot；该命名方向正在讨论，尚未确认是否同时改变面板协议／业务。
- 本 repo 的 AgentState LSP references 确认状态机、BotSession、reportState 是消费处；框架两态与 connect-bot 的三态 wire enum 是不同契约，不应直接覆盖。
- 扩展本身的 idle 是接入时空闲，awaiting-input 是观测到 Round 结束。此前“主要是初始化／历史差别”的描述只覆盖本 repo 扩展，不能推断外部面板没有业务依赖。
- 新核对 omp-bot HEAD b0dc22413e6b3c5f7ee14b68f5d6e001ea9d79c6：backend/src/sessions.rs:136–143 明确定义 Idle 为接入后未观察到轮次结束，AwaitingInput 为轮次已结束；backend/src/countdown.rs:334–376 的 judge_locked 要求监听集合非空、全部成员在线且状态为 AwaitingInput，才形成自动关机安排。Idle 不满足这个条件。set_monitoring（218–295）只允许在线 Working 加入监控。
- 前端也不等价：frontend/src/sessionOrdering.ts:12–31 将等待组置顶，isAwaitingOnline 只接受 awaiting-input；SessionsPanel.tsx:202–226 的监控反馈也使用 awaiting-input。
- 安全 smoke：直接运行真实 frontend isAwaitingOnline，在线 idle → false，在线 awaiting-input → true，断言通过。仅纯状态分类，不启动面板／监控／关机，不执行真实关机链路；后端判定依据为源码。未修改 omp-bot。
- 待确认建议：framework 主活动轴为 idle／working；connect-bot 把“当前是否空闲”与“本次接入后是否已观测到 Round 结束”作为不同事实，继续产生既有三态 wire 值，保留关机监控语义。若用户希望面板也整体二态化，则需显式决定其监控完成判据并跟踪相应跨 repo 变更，不把它当作无行为影响的改名。暂不修改 glossary 或生产接口。本票仍 claimed。

### 第十轮：用户确认 Q9 并请求新对话续聊（2026-10-09）

- 用户确认推荐方向：framework idle／working 二态，connect-bot 保留既有三态协议及监控语义，以独立的 Round 结束观测完成业务映射。没有授权 omp-bot 整体二态化或修改自动关机规则。
- 用户要求将已做决策保存，再在新对话继续 grilling。已在本票前部整理“当前有效决策”与“新对话交接”，保留历史和调查来源；同步公共与 connect-bot glossary。
- 本票讨论未完成；为新对话重新认领而回到 open、清空 Assignee。没有生成最终 lighthouse、没有 resolved、没有改地图 Decisions so far、没有执行生产实现。

### 第十一轮：恢复认领，核对 OMP 后台唤醒事实（2026-10-09）

- 重新认领本票，沿新对话交接继续；不重问已确认的连续活动 Round 和公共二态／面板三态分层。
- 固定基线证据来自隔离安装 `.cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/src/session/agent-session.ts`，不是当前 checkout 版本的推定。`#hasPendingAsyncWake`（2702–2717）按 agentId 过滤：未抑制投递的 running job、pending delivery 或尚待注入的 async-result 任一存在，均视作待唤醒；仅有已抑制投递的 running job 不足以构成待唤醒。
- 原生结束路由（4209–4220）对待唤醒发出 willContinue: true、awaitingAsyncWork: true；`#settleAgentEnd`（4682–4704）先发低级 idle，再发会话事件，扩展通知（4707–4713）仅传 messages 与 willContinue，不暴露 awaitingAsyncWork／isTerminal／yielded。因此低级 idle 不能单独证明公共 idle，扩展不能假定已取得全部后台分类字段。
- 当前 framework quiescent（framework/adapters/omp.ts:657–671）无差别要求 running.length 为零；此判据与原生按自动投递判断并不等价，不能作为已批准契约。
- 隔离探针执行从固定基线读取的原生待唤醒方法，仅去除返回类型并放入小型接收者；manager／yieldQueue 为确定性替身。5 场景实际输出：auto-waking running job=true、suppressed running job=false、pending delivery=true、no pending work=false、queued result=true；ownerId 过滤亦断言通过。只验证该判据，不是 AgentSession／扩展／TUI 完整链路，未访问远端或修改生产实现，无落盘探针。
- 下一待确认问题 Q10：后台工作是否只在宿主确认它会自动继续本会话当前活动时保持该会话 Round；已脱离且无自动待续的后台工作不独立阻止父 Round 结束，其迟到 usage 仍按启动关系补旧账。此为建议，不是已确认决定；结束时序、取消与可用观察面仍待验证。

### 第十二轮：用户强调同轮与简单判断（2026-10-09）

- 用户对 Q10 表达：按其理解应该属于同一 Round，关键是有没有简单判断方法。确认自动后台续跑留在同轮的方向；不把这句话扩大为对所有脱离后台工作或具体接口的批准。
- 固定基线 shared-events.ts:206–214 的 agent_end.willContinue 是扩展可见的自动续跑信号；基线 agent-session.ts:4215–4217 将后台待唤醒映为 willContinue: true，4707–4713 把该字段送给扩展。无需让公共消费者重新枚举 async jobs 或推断工作内容。
- 建议 OMP adapter 首先用 willContinue === true 排除终轮；否则再核对本会话 isIdle 与 hasPendingMessages。不用全部 running jobs 归零作为额外必要条件；这是建议映射方向，尚待用户确认，并须核对取消、尾部排队竞态和完整扩展链路，不能声称仅靠 willContinue 缺省即可可靠终轮。没有生产修改。

### 第十三轮：用户确认 Q11，实测普通完成的扩展时序（2026-10-09）

- 用户确认最小 OMP 映射方向：willContinue 保持同轮，否则辅以本会话 idle／pending-message 事实，不要求全部后台 running jobs 归零。已更新当前有效决策；确认的是方向，不是已交付机制。
- [OMP 真实扩展结束时序探针](../assets/omp-end-timing-smoke.md)：固定 18.5.0 RPC CLI + 真实扩展 + 本地模型 endpoint。普通完成（1 请求）与 bash 工具后续跑（2 请求）均 completed、sessionSettled=true、stderr 为空；两场景最终 agent_end 回调 idle=false、pending=false，下一任务及 25ms 后 idle=true。因此一次同步检查 false 就丢弃会漏终轮；不能把 fixed delay 25ms 当已验证生产策略。
- adapter 的结束候选需要后续核验真实静止，并防止旧候选关闭后来活动；具体调度、取消、尾部排队及并发机制仍待设计／验证。hasPendingMessages 是 displayable／pending-next-turn 队列的投影，不足以单独证明自动续跑；取消时有队列残留的路径仍待实测。不改宿主或生产实现。
- 下一独立待决问题 Q12：初始化／恢复／中途接入时若已在 working 但未观测到原始 Round 开始，是否以起点未知的部分观测表示，不伪造开轮时刻或完整轮次统计；能可靠恢复身份则关联既有轮次。身份和恢复机制本身尚未批准。

### 第十四轮：用户提出恢复／重新加载截断 Round（2026-10-09）

- 用户提出恢复或重新加载后都当作新 Round，并结束之前未完成 Round，询问是否更简单；这是替代 Q12 部分观测建议的提议，尚未确认精确规则，不修改当前有效决策或 glossary。
- 影响：可免于恢复开放 Round 的运行中状态，但不免除请求去重、旧请求与父子启动关系、历史归属恢复义务；迟到 usage 仍须补旧账。
- 待确认建议：增加恢复／重新加载的明确截断例外，旧 Round 标为因观测边界截断而关闭，不冒充正常完成、取消或已确认失败，不作为 connect-bot 等待输入／监控完成的证据。新 Round 在恢复后的执行开始，或可靠观测当前已在 working 时开启；恢复后空闲不凭空开一个空 Round。具体适用范围（进程重启、扩展 reload、会话 resume／switch／tree）及宿主可用信号仍需后续明确。

### 第十五轮：用户确认恢复截断，要求以日常信号与漏结束补救收敛（2026-10-09）

- 用户确认 Q13 恢复／重载截断例外，已同步当前有效决策和 glossary；不把行政截断当实际活动完成。
- 用户要求从实现可识别的 agent_start／agent_end 出发，避免继续抽象 Round 定义；提出下一次 start 切新轮，以补救遗漏 end，并优先覆盖日常场景。尚未将所有原生 agent_start 一律切轮写成确认决定。
- 固定 OMP 18.5.0 pi-agent-core/src/agent-loop.ts:628 的普通 agentLoop 和 :691 的 agentLoopContinue 都派发 agent_start；continue 没有新增用户消息，源码注明重试用途。因此原生 agent_start 不唯一表示用户开启新活动。此前真实扩展 smoke 只验证普通完成和同一循环内工具续跑，不声称已运行独立 continue／重试完整链路。
- 建议最小漏 end 补救：已收到 willContinue=true 的结束通知时，后续 start 沿用旧 Round；否则新 start 即使旧 Round 未关闭，也截断旧轮并开新轮，旧关闭标记为 inferred／missing-end，不补造完成时刻或面板 awaiting-input。此规则有意在连续跑通知也丢失时允许一次实际活动被拆成两轮，以换取简单恢复；待用户确认这个取舍。
- 开信号可作为订阅正常且实际启动执行时的可靠日常入口，不能承诺任何用户消息都有新 start 或跨崩溃／重载不丢事件。排队消息可由已有循环消费；命令或启动前校验失败也不等于新的代理执行。

### 第十六轮：用户确认最小信号表，核对常见子代理路径（2026-10-09）

- 用户确认表格及漏 end 的取舍，并要求优先复查常见子代理。已更新当前有效开轮规则，明确替代旧的无条件 start 去重，保存信号表并同步 glossary。
- [OMP 子代理 Round 信号与归属调查](../assets/omp-subagent-round-findings.md)记录固定 18.5.0 真实 RPC／task／yield／扩展链路。成功场景：单子代理（2 会话、3 请求）、并发兄弟（3 会话、4 请求）、嵌套孙代理（3 会话、5 请求）、后台自动回传（2 会话、5 请求）；stderr 均为空。usage 为 fixture 的零值，不证明真实计费。
- 后台父事件实际为 start → end(willContinue=true) → 子 yield/end → 父 start → 父最终 end；按已确认表格父保持同轮。子／兄弟／孙均有独立 sessionId、agent.id 和自身 start/end；嵌套 parentId 指直接父代理。
- 实际观察父工具调用 → task:subagent:lifecycle.started/completed 的 parentToolCallId／child id／sessionFile 关联；before_subagent_spawn.spawnKey 在此次 task 场景等于 child id。按[消费归属决议](../lighthouse/02-accounting-ownership.md)固定启动父 Round，结果晚到不依当前父 Round 改归属。当前仍未冻结公共载荷和持久化机制。
- 现有实现缺口：dispatchRoundEvent blanket owner gate 会丢弃子代理订阅，不能作为 model-cost 全量观察；onRound 仍是旧 roundOpen 算法。需要逐实际会话的观察与独立轮次记录，connect-bot owner-scoped 面板效果则继续隔离。子 start/end 不驱动父边缘，任务结果汇总不重复入账。
- 附加非正常报告探针：子代理不 yield 时，executor 的三次提醒会产生共四对子 start/end，扩展 end 不带 willContinue；父仍只有一轮。这说明一次委派可含多个子信号轮，不能假定全部外层续跑都有 willContinue；接受信号粒度分轮，消费仍归同一次父启动 Round，不再扩展任务语义推断。
- 未验证 eval agent／workpool／tan、取消、子会话恢复、多个独立 main、丢事件注入和父结束后脱离后台的迟到补账。表格对常见路径可用，不宣称现有 framework 已实现新观察面或完整生产验收。本票仍 claimed；请求／响应载荷、缺失能力、异步派发等仍未解决。

### 第十七轮：用户确认子代理等待规则满足日常场景（2026-10-09）

- 用户明确确认：刚说明的父 Round 等待阻塞子代理／后台自动回传／处理子结果的规则满足其使用场景，没有问题。已追加当前有效决策并明确 Round 基础讨论收口，同步 Working glossary；不因该局部确认将整票 resolved。
- 当前待解项与续聊入口已整理：下一主题为 Request／响应观测关联，不再反复讨论 Round 定义。保留取消等未运行路径的验证边界，不把它们变成新的概念讨论。
- 下一主题的固定基线初步源码事实：extensions/types.ts:832–840 的 before_provider_request 只有 payload，after_provider_response 继承 ProviderResponseMetadata；pi-ai/src/types.ts:378–383 的 provider requestId 可选，AssistantMessage.responseId 也可选。它们不是已证实贯穿请求发起、headers、usage 的统一身份；具体映射与重试／取消关联仍需链路核对，不能用相同 token／时间戳冒充幂等键。此次没有新的运行验证或生产实现。

### 本次暂停与新对话交接（2026-10-09）

- 用户要求先记录目前决策，在新的对话继续 grilling。已整理前部当前有效决策、用户确认的最小信号表、子代理等待规则、已收口范围、未决项与事实资产链接；更新新对话交接，指定下一主题为 Request／响应身份与关联。
- 用户确认的概念已同步 framework／connect-bot glossary。历史推导与旧提议保留，不覆盖当前有效决策；旧已结案 lighthouse 不改写，新最终 lighthouse 尚未生成。
- 本票部分讨论未完成：释放认领为 open、Assignee 清空，未 resolved，不更新地图 Decisions so far，不执行 lighthouse／backtracer 结案流程。下个会话按 tracker 约定重新认领后继续同一票，保持规划模式。

### Request／响应观测续聊：Turn ID 与只读职责（2026-10-09）

- 用户对 Q1 提出命名问题：“如果框架需要一个对应的请求 id，我们需要定义一个新名词，用 turn id 可以吗”。采用既有 Turn 概念命名其身份为 Turn identity／turnId，避免为一对一请求／响应关联再引入同义身份。已同步 framework glossary；生成方式、唯一性范围、开始时点和重试关联未因此获批。
- 用户确认 Q2：“可以，框架能力以后再按需扩展”。请求观察保持只读，不将原生 payload 修改职责纳入本次观察接口。
- 接下来澄清 Turn 在请求开始时是否即有身份，以及取消／失败而无完整响应时如何表达；不重问已确认的实际重发独立记录、未知不等于零及 Round 基础定义。

### Request／响应观测续聊：用户确认 Q3（2026-10-09）

- 用户回答“是”，确认 Turn 从请求开始即有身份，而非收到完整响应才成立。取消／失败／无完整响应仍保留该 Turn，usage 缺失不伪造完成；可靠迟到信息补原 Turn，实际重发用新 Turn。
- 已同步 framework Turn 定义；未声称 OMP 原生关联、重试逐次识别、请求身份生成或恢复映射已实现／运行验证。
- 下一讨论进入公共观察接口如何区分 Turn 结束与 usage 可用，以支持已确认的取消、缺失与迟到补账规则。票继续 claimed，整票未结案。

### Request／响应观测续聊：用户质疑四种公共观察拆分（2026-10-09）

- 用户提出：是否只需 Turn 开始与结束，结束时尽力记录已有信息；质疑四种公共观察的过度设计。此前 Q4 的四种观察事实拆分未获确认，不作为有效契约。
- 调整提议为仅 turn_start／turn_end 两个公共生命周期观察；adapter 内部收集响应 headers／metadata／usage，在结束时提供已有事实，缺失保持缺失，不将每个原生钩子升级为公共事件。尚待确认，不声称已实现。
- 需明确基线差异：旧 Codex 响应头读数在 after_provider_response 即更新；仅结束时交付会把这种更新推迟至 Turn 结束。此前已确认的可靠迟到 usage 补原 Turn 规则仍保留，具体原生支持与补齐方式待证据核实，不据假设预建额外事件。

### Request／响应观测续聊：用户确认修订 Q4（2026-10-09）

- 用户回答“可以”，接受开始／结束两事件观察方案，并接受 Codex 响应头读数延后到 Turn 结束时交付并更新。此为对现有即时更新基线的有意调整，不取消额度解析、窗口与估计功能。
- 四种公共观察的原提案未采用；metadata／usage 可作为 turn_end 的已有信息，不需要各自的公共生命周期事件。迟到补齐原 Turn 的约束仍保留，具体映射未定。
- 本票仍 claimed；还需核对真实请求关联、结束／重试与缺失支持、公共载荷与处理约束。不因局部接口确认结案。

### Request／响应观测续聊：用户确认 Q5（2026-10-09）

- 用户回答“是”，确认 turn_start／turn_end 最小载荷及固定请求归属／模型、缺失不伪造零、不透传原生 payload／历史／context 的约束。
- 确认基本载荷不等于确认所有额外事实接口；账户取得另票承接，价格／实际 Effort／上下文观测继续讨论。原生关联与结束事实仍需验证，票不结案。

### Request／响应观测续聊：用户确认 Q6／Q7（2026-10-09）

- 用户回答“Q6 可以 Q7 是”，确认请求时固定可用 catalog 价格／币种／单位，以及独立的当前会话只读事实快照。已记录到当前有效决策。
- 两个 Turn 事件不扩张为字段级事件；框架提供事实，业务计价、刷新与持久化仍由其对应票承接。
- 接下来核对 OMP 支持基线真实请求钩子的关联与事实可用性，再讨论缺口，不根据接口意图承诺宿主已经支持。

### Request／响应观测续聊：OMP 18.5.0 真实链路证据（2026-10-09）

- 事实资产：[OMP 请求／响应观测链路探针](../assets/omp-request-observation-smoke.md)。真实 RPC／扩展／本地 SSE 链完成正常、工具后续请求、503 后成功与流式取消四场景；非零 usage 及 request headers 实际可见，不宣称账本或新公共接口已实现。
- 新缺口：503 后自动重试实际发出两次 HTTP 请求，但扩展仅有一次 before／一次最终 after／一次 assistant message_end。不能只凭这些钩子承诺逐网络尝试身份与锚时；可观察模型调用周期与真实网络尝试的关系需要用户确认，尚未修订 Turn 定义或消费归属决议。
- 原生 turn_end 在工具返回之后，不直接作为公共“不含工具执行”的 Turn 结束位置；已有语义要求映射时以 assistant 完成等真实事实为依据。
- 取消时未收到 provider usage chunk，宿主仍输出全零 usage；必须区分缺失与确认零。当前 context 读数也随处理阶段改变，Effort fixture 为 undefined；未把字段存在当作可靠性证明。
- 票继续 claimed；下一 grilling 聚焦隐藏重试的可接受观测范围，其他已确认接口不重开。

### Request／响应观测续聊：用户确认 Q8（2026-10-09）

- 用户回答“可以，也就是说重试在 harness 层被抽象，框架观测不到是吧”，接受以可观察模型调用周期为 Turn，不为隐藏 HTTP 重试增加底层拦截。
- 校准含义：已验证的 503 重试位于扩展钩子以下；并非所有自动重试都隐藏。只要宿主暴露出新的调用／请求开始，就按新 Turn 处理。框架不是不能观察任何重试，而是不保证逐个观察底层网络尝试。
- 已同步 framework Request／Turn 术语与当前有效决策；逐请求记录／锚价承诺限定到可观察调用，不静默声称物理网络尝试级完整性。最终 lighthouse 需说明此对既有消费归属原则的修订，历史决议不改写。

### Request／响应观测续聊：用户确认 Q9（2026-10-09）

- 用户回答“同意”，确认观察回调失败隔离：继续代理执行，报告故障，不将未成功记录的统计标为成功；覆盖同步异常与异步失败，不自动重试观察回调。
- 尚需明确异步回调与事件处理顺序；既有同步 dispatchRoundEvent 的 try/catch 不能被当作已支持 awaited async handler 的证据。票继续 claimed，不修改生产实现。

### Request／响应观测续聊：用户要求沿袭旧扩展无明显延迟体验（2026-10-09）

- 用户询问旧 model-cost 的处理方式，并表示旧扩展基本感受不到延迟，希望沿袭这种体验；未确认 Q10 的“统一等待异步回调完成”提议。该提议不作为有效契约。
- 事实资产：[旧 model-cost 的等待与后台刷新行为](../assets/old-observer-waiting-smoke.md)。源码与实际注册回调探针确认：before_request／message_end 做轻量同步统计，Codex message_end 的额度请求后台进行、30 秒 TTL、single-flight；但缓存过期启动与原生 agent_end 确有 await，不声称旧实现无等待。
- 调整提议：观察按顺序调用，同步部分接收／固定该次事实，耗时异步效果不作为请求／工具继续的等待前置；框架仍捕获并报告 Promise rejection。不引入通用后台观察队列。异步完成顺序、持久化排空／恢复与账户并发由业务及相应存储／刷新契约保障，不能静默取消正确性。尚待用户确认 revised Q10。

### 路线修正：用户指出先决条件缺失（2026-10-09）

- 用户指出票顺序错误，应从具体实现倒推规则与数据结构；在 Turn 信息保存方式未明确前，无法判断所谓同步／异步读写。接受该流程纠正，停止继续 Q10；两个候选均未确认。
- 实际 tracker 依赖原为观察 → 数据／State → 存储，图本身无环，但观察票讨论同步／异步时暗含“数据／存储已知”的反向前提。将数据／State 的观察结案依赖移除，以已确认需求与原生事实作为输入；本票改为依赖数据／State 与存储。
- 本票回 open、Assignee 清空，由[数据／State 决策](12-state-data-contract.md)先建立具体读写与数据寿命模型。保存此前讨论与已确认决定，不将任一票 resolved，不执行 lighthouse／backtracer 结案流程。



~~~~~~~~

## lighthouse/01-behavior-contract.md

~~~~~~~~markdown
# 完整保留哪些业务行为，统计单位如何命名？：Lighthouse

> Question and discussion: [完整保留哪些业务行为，统计单位如何命名？](../decision/01-behavior-contract.md)
>
> 当前有效版本：按用户要求，与[数据归属与账户周期决议](12-state-data-contract.md)及观察票已确认的公共术语同步。原题保留为提问历史；此前批准版本及评论完整保存在[同步前历史快照](../assets/contract-history-before-sync.md)。未决接口不因正文修正获批，生产迁移尚未实施。

## Question

基于[现状调查](../assets/current-state.md)，逐项确认 DeepSeek／Codex／token-only／hidden、预算与 Effort、峰谷和 holiday、请求计价、余额、累计与分段条、双窗口节奏、ratio/left、预算命令、刷新和故障显示哪些原有行为要原样保留，哪些有意改变？用户已确认全量保留基线，不得默删 README 未记载的额度估计。

明确 Request、Assistant response、Turn、Round、Agent activity state、Total、旧 UI 的 Turn 及 orchestration 的业务含义；旧 agent_end 结算不能仅因名称接近就映射 round_end。讨论两源预取 TTL 表述与实现不一致、render 更新业务态的耦合，以及 UI 标签是否改名。输出一份用户确认的行为契约和场景；本票不决定框架接口，也不迁移代码。

## Discussion

### 公共术语与活动边界

Request／Turn 采用可观察模型调用周期；Turn 从请求开始，可以完成、失败或取消而没有完整响应，隐藏传输重试不拆成独立可观察 Turn。工具执行独立于 Turn、属于 Round；工具结果只有实际进入后续模型请求时，才由该请求 usage 计费。公共词义以[framework glossary](../../../framework/GLOSSARY.md)为准。

Round 是实际会话的连续活动周期，工具、已知自动续跑、排队输入消费、专门交互以及会驱动父继续的子代理等待不随意切轮。明确结束与漏信号／恢复截断不同；framework 活动轴 idle／working 与 connect-bot 面板协议分开。具体原生映射、候选复查及接口仍由[观察契约](../decision/03-observation-contract.md)收口，本票不替它结案。

### 请求锚价、聚合与展示口径

保留请求开始锚价、逐响应可靠 usage 计价，内存累计与 Round 生命周期分离。工具结果、Round 结束和父子汇总不产生第二笔消费。逐响应计算不等于逐响应落盘；本次以 round_end 发布聚合和最近 Round 快照，接受成功保存前的异常退出损失，不预建独立排空钩子或崩溃日志，详见[数据决议](12-state-data-contract.md)。

Session totals 是适用账户当前周期内该会话跨各 Round 的累计；Round totals 是其中某一轮，不是整个周期。自身／子代理／整体视图无重复；只保留最近轮快照，tree 后该位置 Round 不可用、不显示成零，Session 本周期累计不随 tree 回滚。普通 resume 读取已保存活动聚合，不按宿主历史 token 用当前模型／费率重算，不自动合并旧归档。历史旧 UI Turn 指原生结算差分，不等于新 Turn 或完整 Round。

用户观察旧计价基本对应官网是保留算法的依据，不是独立账单认证。[旧聚合探针](../assets/old-accounting-granularity-smoke.md)的两次峰／谷请求累计为 13.5 元，按结束时谷价重算为 9 元；[旧 clear／resume 调查](../assets/old-clear-resume-smoke.md)区分 Total 显示重估与 Accrued 落盘，不宣称新生产能力已通过验收。

### 保留功能与已确认修剪

provider 的 Codex／官方 DeepSeek／token-only／hidden 分层保留，具体 model ID、名单和维护来源由[模型覆盖票](../decision/13-model-catalog-policy.md)决定。

固定 DeepSeek 450K、Codex 272K 上下文预算显示／告警保留，只显示不限制执行；数字／K／0 修改预算功能已取消，不再把旧最高 1000K 的可调预算入口作为迁移要求。Effort 取实际生效值、未知为 ?、只给值着色。

保留北京时间工作日 09:00–12:00、14:00–18:00 含端点峰价，其他时段／周末谷价；holiday 手动谷价、不追溯，持续到目标账户成功 clear。每请求锚价、DeepSeek 不另计 cacheWrite 继续生效。

Codex 双窗口、按报告时长识别、节奏／重置、ratio／left、同源成对测量及窗口变化规则保留；5h 增量至少 50pp、双窗口正增量且未饱和才采纳估计，无估计 estimating… 的既有业务基线不因此取消。

累计／session 分段条（≤20 元 fine、>20 元 coarse）、detail／holiday／账户级 clear、费用／余额告警及故障反馈保留。clear 归档目标账户全部会话已成功保存活动聚合，重置周期并关闭 holiday；具体归档输入及未落盘损失范围按[存储局部决议](06-local-storage.md)Q15 的用户确认；空消费也能关闭 holiday，不清其他账户、旧归档、Codex estimate 或入口 detail。clear 前在途消费允许丢弃，之后旧子的新请求正常统计，不取消真实执行。详情与一致性前置由[数据决议](12-state-data-contract.md)和存储／命令票承接。

正常有 usage 则累计；失败／取消有可靠 usage 也累计，无 usage 跳过。缺 usage／适用价格只提示，不建立缺失计数、补账或补算状态；有 usage 缺价仍累计 token、只跳过费用。Codex 参考缺价不影响额度，token-only／hidden 无金额口径不因缺价报错。新策略不等于全部 provider 源事实已认证，不承诺官网费用完全一致。

### 数据寿命、业务归属与更新

model-cost shared logic 管理自身聚合、父子关系、当前／最近轮和账户业务缓存；不升级通用业务 State，不把 boolean 激活 State 当业务容器。UI 只读同一视图。最新 DeepSeek 余额／Codex 窗口与获取时间、加载／错误仅账户级内存；累计／归档／holiday／quota estimate 持久化，具体物理组织由存储票决定。

detail 是入口级内存偏好：普通切会话／tree 保留，重载／重启回 brief，其他入口互不影响，不按账户共享、不按会话持久化或子代理继承。

更新由事件驱动，更新后按 UI 需要刷新；render 不请求远端、建 timer、落盘或改权威值。时间参数沿用既有 YAML；TTL／防抖／single-flight、API／header 来源、无 UI 远端刷新与提示承载仍未決，不推定任一候选方案已批准。

## Decision

保留请求锚价、逐响应计价、provider 分层与 Codex 额度功能，并采用最新已确认的扩展自有聚合、账户本周期 Session／Round 和账户级归档重置。数字预算修改移除，缺事实只提示／跳过，历史 Round 不查询；已批准修剪之外的功能不得由实施者自行删改。

## User stories

1. As a 用户, I want 保留逐请求锚价, so that 跨峰谷消费仍可按既定算法对照 provider 后台。
2. As a 用户, I want 区分本周期 Session 与单轮 Round, so that 理解消费所属范围而不把最近轮或旧归档当当前累计。
3. As a 用户, I want 累加已算请求费用而非当前价重估, so that 模型／时间切换不重解释历史。
4. As a 用户, I want 保留双窗口、ratio／left 与成对测量, so that 判断 Codex 节奏及剩余预算。
5. As a 用户, I want 保留 detail／holiday／账户 clear／归档／分段条和反馈并移除预算修改, so that 明确的简化不默删其他操作能力。
6. As a 开发者, I want framework 统一 Turn／Round／活动词义, so that model-cost 与 connect-bot 不各自推断生命周期。
7. As a 开发者, I want 事件驱动更新与既有 YAML, so that 调度不由 render 次数驱动也不建立第二套配置。
8. As a 维护者, I want 修订有用户确认及历史来源, so that 最新契约不会与旧正文并列成矛盾要求。
9. As a 用户, I want 固定预算告警、真实 Effort 与 provider 分层, so that 切模型仍有明确上下文和计价提示。
10. As a 用户, I want 最新读数内存与必要业务持久化分开且旧文件不改, so that 从新统计起步并恢复已成功保存的本周期聚合。

## Preconditions

- [数据归属与账户周期决议](12-state-data-contract.md)已明确当前修订，优先于本票原功能基线；本票不重新决定其布局／寿命。
- [消费归属决议](02-accounting-ownership.md)承接实际会话／账户／父子消费原则；[观察契约](../decision/03-observation-contract.md)收口原生身份、usage 来源、结束／恢复与未决冲突处理。
- [账户访问](../decision/04-provider-access.md)、[HTTP](../decision/05-http-capability.md)、[存储协调](../decision/06-local-storage.md)提供实际账户、传输与聚合发布；[命令](../decision/07-command-state.md)、[展示](../decision/08-presentation.md)、[刷新](../decision/09-refresh-lifecycle.md)决定未决交互／调度。
- [装配](../decision/10-assembly-layout.md)、[验收与切换](../decision/11-acceptance-cutover.md)、[模型覆盖](../decision/13-model-catalog-policy.md)仍未结案。支持基线与 source oracle 须显式核验，不凭事件同名宣称完成。

## Postconditions

- 后续工作采用当前功能清单与明确已批准修剪，不重新要求预算修改、历史 Round 账本、缺失补算或跨周期 Session 总数。
- 价格算法、额度基线、固定预算、反馈及数据寿命继续约束后续票；最小逻辑布局由数据 Lighthouse 提供，不另造通用 State。
- 原生接口、发布完成／失败、最终 UI、TTL 与无 UI 策略仍由对应 open 票决定。本次同步不改变票状态或交付生产行为。
- 原题、先前批准稿和评论可查历史快照；当前正文不再要求读者靠“后续已替代”自行消解旧承诺。

## Invariants

- 每个正常可靠响应仅计算一次；工具、Round 发布和汇总不再收费，已确认缺失／clear／未落盘损失是显式边界。
- 延续原 turn-cost 请求锚价，不用结束／恢复时当前价重估历史。
- Round 公共含义与 connect-bot 协议分开；统计 clear 不伪造生命周期结束。
- framework／model-cost glossary 与 ADR 分工清楚；概念存在不强迫完整性计数或恢复系统。
- 沿用 framework 配置和 native import 边界，不建立第二套 YAML／框架。
- 不自动改旧统计文件；新活动聚合和旧归档不同，普通 resume 不把归档并回来。
- 调度限频不主动丢正常应统计消费；已批准的缺事实、未成功保存及 clear 前在途损失不被描述成零消费。
- 模型覆盖、原生能力、冲突来源和失败策略未获批准的部分保持未决；实施者不自行扩大或缩减。

## Historical ticket body

同步前的批准版本及原有票体／评论完整见[历史快照](../assets/contract-history-before-sync.md)。历史只作溯源，不覆盖当前契约。


~~~~~~~~

## lighthouse/02-accounting-ownership.md

~~~~~~~~markdown
# 用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse

> Question and discussion: [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)
>
> 当前有效版本：按用户要求与[数据归属与账户周期决议](12-state-data-contract.md)同步。原题与[此前批准版本／评论](../assets/contract-history-before-sync.md)保留历史，不将已取消的补账／历史查询作为当前要求。framework 身份及已知冲突／局部清理的批准范围见[观察局部决议](03-observation-contract.md)；可信来源和原生映射仍未完成。

## Question

确定费用、token 基线、额度成对读数与缓存的归属：request／turn／round／session／owner／provider account／进程分别承担什么？主会话、子代理及 orchestration 如何计入展示与累计，怎样避免 session 统计与单请求统计双计？fork/resume/switch/tree 的基线与未结算请求如何处理？

现有 framework session/round 订阅只对 owner 派发，直接复用可能漏掉子代理观测。不能把激活 State 继承规则当成本归属规则。新统计允许从空开始，但新系统恢复和多进程并发仍需确定行为；多 main 同进程要显式决定支持或拒绝，不能顺手承诺。依据[现状调查](../assets/current-state.md)及源 daily-tracker、quota-estimate-store 确认去重与身份需求。

## Discussion

### 请求消费与自身聚合

每个可观察请求在开始时关联实际发起会话、Turn／Round、provider 账户、模型与锚价。可观察新调用／重发是新消费，即使内容相同；SDK 内隐藏传输重试不单独承诺身份／费用。归属不因模型／账户／会话切换改变，Owner State 不能替代实际会话或账户。

按可靠响应 usage 逐次计算并在内存累计，以实际会话 × 账户 × 模型的自身聚合为消费源，不保留完整历史请求账本。正常重复结束通知不再次累计；在途详情结束处理后释放，sessionId + turnId 已处理标记仅内存留至观察实例销毁，不在 round_end 清空、不按任意 TTL 淘汰、不持久化。framework 身份的批准范围见[观察局部决议](03-observation-contract.md)；具体原生关联与实例隔离仍未完成。

工具返回、Round 结束发布和 task／orchestration 汇总不产生第二笔消费。旧消息实际进入新请求时计新响应 usage，恢复读取旧消息不重新计费。

### 主会话、子代理与迟到消费

实际代理各自累计自身，可查询主自身、各子自身／含后代、主含后代；UI 三口径及展开布局仍由展示票决定。保存直接父实际会话、启动父 Round 及区分启动实例的关系，恢复沿链汇总；每笔请求一次，不只保存 Owner 总数，不从父总数反推子消费。

旧轮子代理后来产生的新请求消费继续归启动关系，进入实际子与正确账户／主含后代 Session 聚合，不按到达时间污染当前 Round；原轮已被最近快照替换则不重建历史统计。当前轮子汇总按启动关系筛选，不能用含全部后代的 Session 总差值。关系随聚合发布，不加启动即落盘；复用同一子会话不同启动的分段和迟到发布由观察／存储票收口。

### 金额口径、缺失与冲突边界

DeepSeek 是当前计费渠道，已知请求费用计入金额；Codex 是额度渠道，美元只参考不进消费金额；token-only／hidden 无金额口径。不同性质不被解释为实际免费，不混人民币／美元为单一消费金额，也不按当前主模型过滤其他真实消费。上下文、账户测量和消费三维正交。

未知／确认零／额度消费／无口径／按指标完整性继续是领域概念，当前不要求逐请求状态记录、缺失计数或汇总持续完整性标记。正常缺 usage 提示跳过；失败／取消有可靠 usage 则计、无则跳过；有 usage 缺价仍计 token，只跳过费用并提示，不保留补账／补算状态。Codex 参考缺价不影响额度，无金额口径不因缺价报错。

已知矛盾数据不能相加或任意最后覆盖。2026-10-11 用户确认的冲突丢弃／局部清理与不提供结束后修正能力，唯一细则及确认原话见[观察局部决议](03-observation-contract.md)。此前持续标不完整／保留冲突账本分支不采用，历史保留于已链接快照；可信 usage 来源与原生关联仍需观察票验证。

### 本账户周期的 Session／Round、tree 与恢复

Session 累计限于适用账户当前周期，跨该会话各 Round；Round 累计只属于该轮。只保存最近轮开始／结束快照，和 round_end 聚合同次发布／覆盖旧轮，不建立历史 Round 列表、历史位置索引或跨周期 Session lifetime total。费用快照来自已锚价累计，不以 token 差分乘当前价重算。

| 操作 | 当前有效行为 |
| --- | --- |
| resume | 读取本周期已保存活动聚合，可明确展示最近 Round；不重估宿主历史、不自动合并旧归档 |
| switch | 选择目标会话本周期视图，已开始请求仍归原身份（账户 clear 的丢弃是显式例外） |
| tree | 不回滚本周期 Session；该历史位置 Round 隐藏或不可用，不冒充零／最近轮 |
| fork | 新实际会话自身从零，复制消息不是新消费；原会话本周期统计不被 fork 回滚 |
| 账户 clear | 归档目标账户全部会话已成功保存聚合，重置本周期并关闭 holiday；输入范围按[存储局部决议](06-local-storage.md)Q15，旧值只在归档中 |

正常从历史位置继续触发新的实际活动按 framework Round 规则归属，不查询或恢复已经放弃的历史 Round。开放 Round 跨 clear 的统计快照映射尚未定型，不能伪造新轮。

### 恢复损失与账户重置例外

只恢复成功保存的聚合；强杀／崩溃的未发布内存消费可丢，不要求可靠未入账记录补账／恢复日志，不自动重发以补账、不以当前价猜收费。round_end 触发保存；不预建退出／切换／重载独立排空钩子。落盘幂等、等待／失败及多进程发布仍需存储票确定。

仅保留账户级 clear：归档后重置目标账户活动累计及相关业务关联，成功关闭 holiday，空消费也可关闭。clear 前开始未入账的该账户请求之后丢弃，旧缓存／排队保存不能复活它；clear 后新请求正常计，包括旧子代理重新利用真实关系的消费。不清其他账户、已有归档、Codex estimate 或入口 detail，不取消真实执行或改 framework 活动态。

### 账户隔离、多会话与额度

账户是 provider 计费／额度身份，不是 Owner、进程或当前主会话；不同账户有独立周期和测量／holiday／estimate。主子可能不同账户，重置时其他账户消费与其查询所需关系不能顺带删除。

支持同／跨进程多个独立 main，同一 session 单执行者，拒绝并发驱动；检测／实现层待定。正常同账户并发不得丢失、重复或覆盖其他会话贡献，不把已接受的异常退出／缺事实／clear 损失扩张成忽略并发正确性。讨论 clear 时单一 DeepSeek 活动会话只是推演假设，不是已取消的支持范围。

最新余额／双窗口、获取时间、加载／错误是账户级内存，换会话不自动清账户测量基线；换账户读自己的值。quota estimate 基线／采纳值持久化，读数同源成对、不拼跨来源窗口；不做 Codex 会话消费与账户额度分摊／换算。

## Decision

以可观察请求的可靠消费为输入、实际会话 × 账户 × 模型自身聚合为源，沿父子启动关系无重复汇总，账户隔离和正常并发正确性保留。累计限于账户当前周期，历史只保留最近 Round／归档；缺事实不补账、未保存损失可接受，账户 clear 是显式重置，不按恢复时当前价重算历史。

## User stories

1. As a 用户, I want 区分主自身与各子消费, so that 理解任务成本来源。
2. As a 用户, I want 按启动关系查看含后代本周期累计, so that 嵌套请求不被重复收费或污染新轮。
3. As a 用户, I want 请求归属与锚价固定, so that 当前模型／账户切换不重解释旧消费。
4. As a 用户, I want tree 的历史位置 Round 不可用且 Session 本周期不回滚, so that 不把最近轮伪装成历史查询。
5. As a 用户, I want 领域概念区分未知／额度／无口径／确认零而运行时简化, so that 跳过金额不被解释成免费且不强迫完整性状态系统。
6. As a 用户, I want 可靠 usage 按身份累计、重复不计、缺 usage 跳过, so that 取消重发的正常消费正确且不引入补账日志。
7. As a 用户, I want 多会话同账户正常并发正确, so that 跨终端累计不丢不重且其他账户隔离。
8. As a 用户, I want Codex 额度与参考费用不当现金消费, so that 不误做会话额度换算或混币种总额。
9. As a 开发者, I want 唯一自身聚合与只读派生视图, so that renderer／父子汇总不会成为第二份权威消费。
10. As a 用户, I want 明确缺失跳过与已知冲突丢弃边界, so that 不猜补费用也不把已知矛盾数据随意覆盖。

## Preconditions

- [行为契约](01-behavior-contract.md)提供仍保留的功能与计价基线；[数据归属与账户周期决议](12-state-data-contract.md)明确最新布局／寿命及有意简化，不重新决定完整账本。
- [观察契约](../decision/03-observation-contract.md)收口可靠身份、usage 来源、结束交付、原生恢复／clear 与冲突机制；[账户访问](../decision/04-provider-access.md)提供账户识别，未知不能并公共默认账户。
- [存储协调](../decision/06-local-storage.md)决定物理聚合／关系／最近快照、发布／归档／reset／关闭 holiday、幂等／锁／失败；[模型覆盖](../decision/13-model-catalog-policy.md)决定适用计价与名单。
- [展示](../decision/08-presentation.md)、[刷新](../decision/09-refresh-lifecycle.md)、[命令](../decision/07-command-state.md)、[装配](../decision/10-assembly-layout.md)、[验收](../decision/11-acceptance-cutover.md)仍各自未决，不把来源交接当生产实现。

## Postconditions

- 普通消费保存失败的当前取舍及已确认损失范围以[存储局部决议](06-local-storage.md)修订 Q6／Q11 为唯一权威；此处不将正常并发正确性或仅异常退出的旧描述用于否定该显式修订，业务布局与普通 resume 结论不变。

- 后续按扩展自有聚合、有限运行期关联、父子关系与本周期恢复设计，不要求历史 Turn／Round 留存、缺失补齐或跨周期 Session 总数。
- 自身／含后代、账户／渠道口径可派生，实际请求不重复；无金额贡献不代表实际零消费。
- 验收覆盖可靠响应、重发／重复、最近轮／tree／resume、账户 clear、父子与多会话正常并发及已确认损失边界，不按原旧验收恢复已取消要求。
- 冲突丢弃／局部清理及身份已批准范围以[观察局部决议](03-observation-contract.md)为准；可信来源、宿主实例隔离、物理发布、调度和最终 UI 尚需具名票收口，文档不代表能力已实现。

## Invariants

- 一个可观察请求在同一范围最多贡献一次，汇总不是新消费；隐藏尝试不承诺独立完整观测。
- 请求开始的实际归属和锚价不随当前会话／模型／账户改变，不用当前价重估。
- 未知／额度／无口径不等于免费；不据概念要求缺失计数或补账状态。
- Session 本周期不因 tree／删改消息／fork 回滚；成功账户 clear 是显式重置例外，旧归档不自动并回。
- 聚合不改 framework Turn／Round 活动含义；旧子新请求与同一 Turn 后到 usage 修正分开，后者不提供修正能力，已知冲突处理见[观察局部决议](03-observation-contract.md)。
- Owner State 继承不决定消费；通用词义归 framework，消费词义归 model-cost glossary。
- 账户隔离、正常请求去重与多会话并发同时成立，已批准损失边界不被默扩张。
- 上下文、账户测量和消费保持正交，不累加子上下文为主预算，不换算 Codex 账户额度为 Session 消费。

## Historical ticket body

同步前批准版本及原有票体／评论完整见[历史快照](../assets/contract-history-before-sync.md)。当前正文已同步，不要求读者把历史补账／完整性／历史 Round 条款当有效承诺。


~~~~~~~~

## lighthouse/03-observation-contract.md

~~~~~~~~markdown
# framework 如何提供请求、响应、Turn／Round 与模型事实观测？：Lighthouse

> Question and discussion: [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)
>
> 部分发布（2026-10-11）：整票未完成。既有确认取自[发布前票体快照](../assets/observation-history-before-publication-2026-10-11.md)的“当前有效决策”；本轮确认来源为下列用户原话。规则是规划，不表示新 framework 观察接口或 OMP 映射已实现。

## Question

确定 framework 的 Turn／Round／活动、模型与会话事实及观察处理约束，由 OMP adapter 映射真实宿主信号；身份关联、可信 usage、恢复及结束候选的具体链路仍需收口。业务计价与聚合不进入 framework。

## Discussion

### Round 与活动的既有批准范围

Round 是实际会话的一段连续活动，不按普通消息、输入消费批次或任务语义切轮。工具、已知自动续跑、排队输入消费、专门交互以及会驱动父继续的子代理等待可保持同轮。代理已结束并等待普通输入后，下一次执行才开新轮。子自身事件不关闭父轮；只按本会话的实际继续事实判断，不要求全部后台 running jobs 归零。

OMP 最小批准映射：无开放轮次的 agent_start 开轮；已观测上次 agent_end.willContinue=true 时，下次 start 延续旧轮；否则 start 可因遗漏结束信号截断旧轮并开新轮。允许续跑信号也丢失时拆轮。非续跑 agent_end 只是结束候选，需确认本会话实际静止、无待续执行后终轮；不能只在同步回调检查一次就丢掉候选。具体复查调度和防迟到机制仍未决。

正常结束、明确取消、终止失败可终轮；请求／工具失败但仍继续时不能终轮。恢复／重载可截断未完成 Round，恢复后可靠 working 时开新轮，idle 时等实际执行；具体操作范围与实例隔离仍待定。遗漏信号／恢复截断不冒充正常完成、取消或已确认失败，不产生 connect-bot 完成证据。

framework 活动轴为 idle／working，不可靠观测不默认 idle。connect-bot 保留三态协议：工作时报 working；空闲但接入后未观测结束时报面板 idle；已观测真实结束后的空闲时报 awaiting-input，保留原监控／自动关机语义。不在地图执行消费者迁移。

替代：旧无条件 start 去重、按普通用户消息切轮、按输入批次切轮或任务语义推断，不是现行政策。早期 pi agent_settled 方向只作历史研究，本地图不实现或认证 pi adapter。

### Turn 观察、载荷与事实职责

Turn 从可靠请求开始即存在，取消／失败或无完整响应不删除该周期、不伪造成功。公共观察只提供 turn_start／turn_end：adapter 内部收集事实，结束时尽力交付当时已有的 usage、headers／metadata 与结束结果，不按字段拆公共事件。用户已接受 Codex headers 更新从旧即时回调延后至 Turn 结束，保留额度解析／估计功能。工具执行不属于 Turn，不能照搬包含工具结果的原生同名 turn_end。

turn_start 的语义包含 turnId、实际发起 sessionId、所属 roundId、开始时刻、provider／模型身份；turn_end 包含同一 turnId、结束时刻、结束结果、可取得的 usage、HTTP status／headers、provider request ID。开始事实固定，不在结束时用当前模型替代；缺失明确缺失，不伪造零。不透传原生 payload、历史或 context，请求观察只读、不兼任 payload 修改入口。字段命名与完整原生映射尚未冻结。

开始时提供可靠可取得的 catalog 价格与币种／单位快照；framework 提供事实，DeepSeek 峰谷／holiday 锚价、金额计算、Codex parser 归 model-cost，Codex 美元只作参考。实际账户由[账户访问决策](../decision/04-provider-access.md)提供。

另以小的只读当前会话快照提供模型、可确认的实际 Effort、上下文占用／窗口大小；读取不发请求、不写统计、不更新业务态。实际 Effort 未知时不能以配置冒充；上下文不是 Session 累计。来源、时点及验证仍待定，刷新调度由[刷新生命周期决策](../decision/09-refresh-lifecycle.md)承接。

本次 Turn 粒度为可观察模型调用：隐藏传输重试不拆新 turnId、不承诺隐藏尝试逐次锚时／usage／费用，不新增底层传输拦截；宿主确实暴露新调用开始的重发／工具后请求／重试仍是新 Turn。

### 本轮 Q10：轻量内存处理与等待位置

确认来源：“Q10 同意”及随后“全部同意，请继续”。请求开始在内存固定归属、账户周期和锚价；结束完成关联／重复检查、逐响应内存累计，释放详情并保留已处理身份。对应 Turn 的轻量处理在观察处理返回前完成，不在这里保存 consumption.json 或等待文件锁，不把远端刷新塞进这段必须完成的统计处理。

Round 保存等待的唯一权威仍为[存储决议 Q5](06-local-storage.md)：稳定快照、提前提交安全异步保存、独立逻辑后在 handler 返回前收口。这是对已有数据／存储路线的衔接，不批准所有观察回调统一同步或统一等待所有异步效果。余额／额度远端刷新触发及等待仍未决。观察回调同步异常／异步失败报告但不阻断代理执行、不假报统计成功，不新增自动重试；实际派发顺序／异步 handler 映射仍须验证。

### 本轮 Q11：一次处理，不提供结束后修正

确认来源：用户说明“只会有一次turn的累计请求变更，发生在turn response返回时”，随后“全部同意”。每个 Turn 在结束交付可靠响应 usage 时处理一次，不逐流式片段累计；缺 usage 跳过、有 usage 缺适用价格只累计 token 的业务规则由[数据决议](12-state-data-contract.md)提供。

本次 framework 不为 model-cost 增加结束后事实修正事件／接口，也不为此保留已结束 Turn 完整详情；后到 usage 不触发二次交付以补账。旧子代理以后发出的新请求是新 Turn，正常统计，不是修正。既有“通用后到修正能力未决”的分支已收口为不提供；正常重复通知防重保留。

### 本轮 Q12／Q13：framework 身份与无法匹配的观测

确认来源：用户复述“framework使用自己生成的turnId进行管理，response返回的id只是作为参考”，并在澄清后回答“同意，请继续”；Q13 为“没有匹配到的数据就丢弃，不考虑自动补救数据等复杂逻辑”。

framework 建立不透明 turnId，新可观察调用产生新身份，同一实际会话不同观察实例／重载之间不复用；业务用 sessionId + turnId 关联。provider request ID／response ID 保留为源事实，有可靠证据时 adapter 可辅助关联，但不把它们当 framework 身份，不假定相等或始终存在。具体生成方式及原生关联方案仍待落实；造 ID 本身不是关联正确性证明。各实际会话独立管理，不按 Owner 共享“当前请求”。不建立持久 Turn 账本，不恢复重放历史消费。

不能可靠匹配的结束事实报告后丢弃，不按当前 Round／账户／模型或到达顺序猜归属、不临时补造开始、不自动补账。不取消真实执行、不伪造结束；正常支持路径仍必须可靠，不以跳过掩盖未实现的子代理／并发能力。

### 本轮 Q15：已知冲突与局部清理

确认来源：“同意采取丢弃策略”以及局部清理分析后“Q15 同意”。结束交付前已知同一 Turn 的最终 usage 矛盾、无法可靠判定有效源时，报告并按 usage 不可用处理，不相加或任意最后覆盖；独立可靠的 headers 等事实仍可交付。流式暂时值到最终值的正常更新不是此冲突。

释放受影响 Turn 的临时详情，保留该 Turn 已处理标记、已有累计和其他可靠在途关联；后续新 Turn 正常建立关联／累计，不置整个会话或账户为持续故障。孤立响应丢弃不设置全局损坏标志。没有长期响应副本，不承诺逐字段检查以后每份重复通知，不建持久冲突账本／计数／持续不完整状态。

单 Turn 局部清理不等于普通消费保存失败的磁盘基线重新初始化；后者及无有效基线时暂停的唯一权威为[存储决议 Q6／Q14](06-local-storage.md)，不能按单 Turn 故障清空累计或去重标记。

### clear 限制与未批准分支

用户批准的 clear 执行条件只在[命令局部决议](07-command-state.md)持有；本票不复制政策。“开放 Round 清零后重设该账户零基线”的原 Q14 建议未获批准，不能用于实现。限制本入口 clear 不消除其他进程的周期变化；既有周期校验／失败初始化不被撤销，跨入口开放 Round 展示仍待旧决策回顾。

### 证据及限制

[请求观测探针](../assets/omp-request-observation-smoke.md)、[子代理调查](../assets/omp-subagent-round-findings.md)、[结束时序探针](../assets/omp-end-timing-smoke.md)与[旧扩展等待调查](../assets/old-observer-waiting-smoke.md)为已有运行证据；不能把这些当本次新接口 smoke。本次只读核对固定 18.5.0 openai-completions 的局部 sawUsagePayload 及 Codex 初始全零 usage；没有新增运行探针。扩展是否能获得可靠 usage 来源证明仍待调查，非零字段存在也不是所有 provider 已认证。

## Decision

批准连续活动 Round、开始／结束两事件及请求时固定事实，并收口本轮轻量处理、framework Turn 身份、不补账、无法关联／冲突丢弃与局部清理。整票保持未完成，具体宿主关联、可信来源、恢复与调度／接口仍未决。

## User stories

1. As a 用户, I want Turn 轻量内存累计而 Round 结束收口保存, so that 不给逐响应路径新增文件锁或远端请求等待。
2. As a 用户, I want 每个 Turn 只处理一次且不补账, so that 无需修正事件、长期请求详情或复杂恢复。
3. As a 开发者, I want framework 身份与 provider ID 分离, so that 不同 provider 和主子会话可可靠关联而业务不依赖原生 ID 规则。
4. As a 用户, I want 无法关联／已知冲突丢弃并仅清理该 Turn, so that 不猜账且一次异常不让后续新请求持续被丢弃。
5. As a 用户, I want 连续活动 Round 与面板完成证据区分, so that 工具／续跑／子代理等待不误报 awaiting-input 或触发自动关机。

## Preconditions

- [行为](01-behavior-contract.md)、[消费归属](02-accounting-ownership.md)、[数据](12-state-data-contract.md)、[存储](06-local-storage.md)提供保留功能、有限关联与保存／失败边界；这是已定设计，不是生产能力。
- 账户来源、模型名单／价格、远端刷新分别由账户访问、模型覆盖、刷新票收口。
- 本票仍需确认真正可用的请求关联、usage 来源／零与缺失、Round 结束复查、恢复隔离、子启动分段及公共接口／requiredSemantics。

## Postconditions

- 装配与验收应落实本轮批准处理约束，证明原生事实、正常去重与逐实际会话支持；不能以目前同步派发／owner gate 宣称已支持。
- 命令票消费本轮已发布的 clear 入口限制；反馈承载仍由命令／展示票决定。
- 不新增修正／补账／持久冲突账本，不自动升级业务 State；未决分支留在源票 Handoff。

## Invariants

- 一个可观察 Turn 最多累计一次；汇总／工具结果不是第二笔消费，隐藏传输尝试不承诺独立观测。
- framework 提供宿主事实，model-cost 计价／聚合／解析，adapter 隐藏原生 payload；Owner activation 不代替实际会话身份。
- 已处理标记仅内存保留到观察实例销毁，不在 round_end 清空、不按任意 TTL 淘汰；局部故障不清他人的在途状态。
- 无法取得不等于零；不可靠关联不猜，观察错误不取消真实代理或制造生命周期边缘。

~~~~~~~~

## lighthouse/06-local-storage.md

~~~~~~~~markdown
# framework 如何提供独立存储、原子更新与跨进程协调？：Lighthouse

> Question and discussion: [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)
>
> 已确认结果；源票已按 Q23–Q26 收口。以下是规划约束，不表示文件能力、原生观察或生产迁移已经实现。物理 schema、framework 文件 interface、锁机制与同会话多执行者策略已由 Q23–Q26 确认；实现与验收仍由装配／验收票承担。

## Question

确定 model-cost 的本地数据组织、单一消费源与通用安全写入的职责：保存完成／失败、跨进程协调、clear 一致性、路径／平台条件，以及物理 schema 与 framework 文件能力边界。以下 Discussion 是唯一有效规则，源票保留探索记录与证据限制。

## Discussion

### 单个消费活动文件与独立历史归档

用户选择本地 JSON，所有账户的消费活动数据集中在一个文件，内部保留账户区分；不预先按账户拆文件，不引入数据库，实际需求出现后才重新考虑拆分。每次归档另存历史文件，不把全部历史嵌入活动文件。当前主要使用单个 DeepSeek 账户，但同账户多会话／多进程安全更新仍是明确要求，不因少见多账户并发而取消。

旧 daily-tracker 的活动／归档分离作为组织参照；旧算法和新业务并非必须逐字段相同。用户级共享目录及配置解析由 Q16–Q20 确认；文件组织与名称由 Q21 确认，schema 由 Q25 冻结。程序不自动清除旧统计，用户切换版本时手动备份并清空后复用旧目录。

### 独立的 Codex 估计文件

用户明确 codex-usage-estimate 是估算 5h／7d 额度转换关系的独立功能持久化文件，保持独立，复用 framework 的安全写入 module。本票不展开其业务算法；这不是移除估计功能，也不是将其合并到消费活动文件。原有效估计与调度要求仍由既有行为／数据结论及刷新票约束。

### 一个消费计算来源与 Session／最近 Round

用户确认前轮展示的模型，具体 JSON schema 由 Q25 冻结：消费只保留适用账户当前周期的会话自身累计和最近一轮开始／结束累计快照，不保存历史 Turn／Round 列表。每个可靠响应只在扩展 shared logic 中计价并累加一次。当前轮动态状态在内存，运行中同时持有恢复并持续更新的会话累计；这不意味着每次响应重读磁盘或只在内存留下轮次值。

Round 自身消耗从同一累计的开始／结束快照派生；费用快照已经逐响应锚价计算，不再次以当前价格重估。round_end 将自身累计、最近快照及必要父子关系同次保存，覆盖旧最近轮。账户总数和父子合计从自身聚合派生，不另维护差分更新的第二套权威消费累计。磁盘是聚合的已保存快照，不是另一个独立计费来源。

上轮“沿旧 token 基线差分并把费用也改差分”的提议不作为最终模型；保留旧方案安全读改写组织，不要求复制其第二套累计维护。提交顺序由下节 Q7 确认，旧快照／账户周期有效性方向由 Q8 确认；版本恢复细节由 Q11 确认，同 session 单执行者由 Q26 收口，clear 一致性由 Q13／Q15／Q24 确认。

自身 Round 的简单差分不能直接套用于含全部后代统计；子消费按启动父 Round 筛选，迟到子消费及跨 clear 快照仍按[数据归属与账户周期决议](12-state-data-contract.md)的既定边界交对应未决票；子关系物理 schema 已由 Q25 冻结为子会话记录的 `parent`，跨账户遍历语义仍留账户／观察票。

### Extension 模型与 framework 基础能力

用户进一步澄清：Session、Round、Request／Assistant response 的公共字段、身份、生命周期与可取得的 usage 等源事实属于 framework 提供的能力，由 adapter 映射宿主。extension 组合这些能力，选择业务统计与不同精度的持久化，不自行重复定义宿主观测。前文“计算与模型归 extension”限定为消费业务计价、聚合组合及持久化模型，不把源事实生成转移到 extension。公共字段细节与累计事实是否提供仍由观察票决定，不因本澄清冻结新载荷或承诺不存在的宿主统计。

用户明确该聚合／最近轮／保存频率模型是 model-cost extension 的实现取舍，不是 framework 的通用持久化模型。framework 提供可靠本地文件安全更新，隐藏同进程／跨进程协调和发布细节，业务层拥有格式与合并规则。其他 extension 可以复用同一基础能力采用不同数据结构、寿命和保存时机，不要求使用 Session／Round。

用户曾在旧 extension 踩过多会话写入坑，明确不希望每个扩展重复实现底层协调。此理由支持可靠的通用 module，而非扩大成通用账本或业务 State。

### 文件 interface 与协调归 framework

用户明确同步／异步文件写入应经 framework 提供的 interface，同文件加锁或必要队列也归 framework，不让 extension 自己实现协调。锁／队列是达到安全更新的机制，不自动批准后台队列或两套公开 Sync／Async 方法。本次确认安全异步更新 interface；不要求另加同步 interface。model-cost 的等待位置由下节 Q5 收口，其他 extension 自行选择调用组织。旧实现调用方直接 await 保存 Promise，但锁内使用同步 read／write／rename；Promise 不意味着同步文件代码可与同线程其他代码并行执行。

### Q5：提前提交，handler 返回前等待

用户明确确认：捕获稳定的 Session 累计／最近 Round 快照，提交 framework 安全异步更新，继续不依赖保存成功、且不再写同一文件的独立逻辑，handler 完成前 await 保存结果。framework 底层采用非阻塞文件操作，不只是给同步 I/O 包 Promise；不是 fire-and-forget、不新增退出后排空系统。

所有正常返回／提前返回／异常路径都需收口该保存任务，并及时接住保存拒绝；普通 round_end 保存失败策略已由下节 Q6 确认；具体反馈承载由展示票 08 收口，业务拒绝与保存失败的可判别结果由 Q24 确认。实际 I/O 是否已开始及性能收益取决于协调与运行条件，不宣称已有测量。本决定替代 agent 先前立即 await 的推荐，后者从未作为用户批准约束。

### Q6：普通消费保存失败丢弃未保存部分并重新初始化

用户在本轮明确确认修订：所有普通消费保存失败（包括业务不一致与临时 I/O／协调失败）都报告失败，但不因此停止代理主流程、不假报持久化成功；丢弃受影响消费状态的未保存部分，重新从磁盘当前有效完整快照初始化周期、累计、最近 Round 与版本。不将已有磁盘累计置零，不执行账户 clear，不重置磁盘周期／holiday。不清已处理请求的去重标记，避免旧通知重新计费。

读不到有效磁盘数据时，按 Q14 报告并暂停本实例消费统计／保存至下一次正常会话初始化，不猜零覆盖，不新增自动重试、修复、补账、持久恢复日志或后台补写。后续新消费只从有效初始化基线开始，不重交已经丢弃的消费。

修订理由与确认来源：用户担心冲突内存导致持续保存失败，认为这些极端边界不值得复杂恢复，明确接受少量未保存消费丢失。此策略替代先前“失败后保留内存、下次正常保存带上未保存累计”，修订前原文保留于源票 Comments，仅作历史。

该策略是 model-cost 普通消费保存的业务取舍，不自动套给 clear、holiday 命令、独立 Codex estimate 或其他 extension。framework 的正常多会话安全更新、账户隔离、损坏文件不覆盖仍保留。clear 的成功／失败须以实际活动文件提交为准，内存初始化不能伪装 clear 成功。

### Q7：轻量进程内 FIFO 与跨进程互斥

用户在了解复杂度后明确同意轻量方案：framework 按同一文件的协调键维护内存 Promise 尾链，在同进程内按进入 interface 的提交顺序串行处理更新。前一次成功或失败后才启动下一次，失败不阻断后续；每次调用取得自己的结果，空闲键清理，不同文件独立。获得协调权限后重读最新文档、执行业务更新并原子发布。

跨进程保证互斥安全更新，不承诺全局 FIFO；具体锁由 Q24 确认，平台条件由 Q22 限定为本机本地文件系统。该内存串行不引入持久任务队列、worker、定时器、后台重试或退出排空，不改变 Q5 的 handler 返回前等待。用户希望低复杂度；本选择以局部轻量机制满足顺序需求，不取消正常多会话并发正确性。路径别名统一由 Q24 确认；clear 提交边界由 Q13 确认，归档输入由 Q15 确认，跨进程新周期可见性由 Q23 收口；等待／取消边界由 Q9 确认，旧快照／账户周期有效性方向由 Q8 确认，FIFO 不能替代这些检查。隔离 Promise 探针的运行结论与验证范围记录在源票，不表示生产文件 module 已实现。

### Q8：按记录合并、账户周期与保存版本校验

用户明确同意：在协调权限内重读最新文档，只合并本次负责的会话记录，保留其他会话／账户，不以旧内存整份文档覆盖。提交携带账户统计周期标识，与当前磁盘周期不符则拒绝，不能重绑定为新周期消费；会话快照携带递增保存版本，旧版本不覆盖，相同版本的同一快照重复提交不追加消费。

框架拥有协调与安全更新，model-cost 拥有业务有效性／合并规则。只增加少量标识，不建立历史 Turn／Round 列表或消费日志。resume 版本接续由 Q11 确认；同 Session 单执行者由 Q26 收口，跨周期内存刷新由 Q23／Q6 收口；clear 提交边界由 Q13 确认；同版本不同内容冲突由 Q12 确认；版本校验不等于已解决这些机制。

### Q9：取得权限前有限等待／可取消，更新开始后等待结果

用户明确同意：同进程排队与跨进程取锁合计采用有限等待预算，默认值由 Q10 确认为 15 秒。在等待阶段超时或被取消，返回失败／取消并确保该调用以后不能迟到开始写入。普通消费保存按修订 Q6 报告失败、丢弃未保存部分并从磁盘有效快照初始化，不因此中止代理主流程。

开始执行读改写／发布后等待实际结果，不用表面 Promise 超时／取消让调用方以为结束而真实写入继续；本轮不设计强制中断正在发布的文件操作，不承诺整次更新的硬总耗时上限。不新增自动重试／后台补写；取消来源按各调用方，具体锁实现由 Q24 确认，默认预算与调用方覆盖由 Q10 确认。

### Q10：默认协调等待预算 15 秒

用户接受 Q10 提议，并询问是否超时取不到锁就报错放弃写入。默认从提交起，同进程排队＋跨进程取锁合计最多等待 15 秒；framework 文件 interface 允许调用方显式覆盖，model-cost 暂用默认，不新增专属 YAML 配置项。到期仍未取得协调权限则本次失败并放弃，后来权限可用也不能迟到写入。不是开始文件更新后的硬超时；实际错误 interface 形状由 Q24 定为可判别失败结果，普通 round_end 捕获并按 Q6 反馈，不以未处理异常中止代理。

### Q11：完整快照恢复与失败后的重新初始化

普通重启／resume 没有运行中的内存状态时，读取当前账户周期内已保存的完整会话快照，一起恢复累计、最近 Round 与保存版本，新快照从恢复版本继续递增，同一快照正常重交保持原版本；新周期没有该会话记录时才从初始版本开始。不扫描历史消息、不合并旧归档、不以当前价重算旧消费。

本轮按用户确认修订运行中失败分支：保存失败后不再保留较新未保存消费，按 Q6 丢弃并从磁盘当前有效完整快照重新初始化。版本只在同账户周期、同会话内比较，旧周期版本再大也不覆盖新周期；现有磁盘记录缺必要字段不是普通无内存版本，不据此猜值或兼容旧统计。同 Session 单执行者检测由 Q26 收口，clear 后运行态由 Q23／Q6 收口。普通 resume 契约未改变，仅“运行中保存失败不回滚”被明确替代；修订前原文见源票历史。

### Q12：同版本不同内容拒绝并报告冲突

用户明确同意：同周期同会话同保存版本却不同快照内容时，保留磁盘内容，返回明确冲突并报告，不相加、不最后覆盖、不逐字段取最大值，也不新增持久冲突账本。区别于同版本同一快照的正常重复，不假报保存成功；普通 round_end 按 Q6 不因此中止主流程。业务快照相等的具体判断随 schema 收口。

### Q13：clear 先归档再重置，失败终止

clear 当前入口的执行条件见[命令局部决议](07-command-state.md)；本节只持有归档／重置一致性，不以入口结束替代跨进程周期校验。

用户明确同意简化方案：先发布独立归档，再一次性原子发布活动文件中目标账户的新周期、累计重置及 holiday 关闭。归档失败不执行重置；重置未提交就报告失败，不自动重试、恢复、补做或合并失败归档。允许留下本次归档备份，不自动合并／恢复；只有活动文件确实提交了重置才算 clear 成功，内存初始化不能伪装 clear 成功。

既有其他账户、已有归档、独立 estimate 与 detail 的保护边界不变。此确认是提交／失败语义，不宣称两文件天然组成事务，也不增加通用事务日志或复杂故障恢复。归档输入由 Q15 确认仅取已成功保存数据；文件识别、同一协调范围的实现、跨进程新请求看到新周期的时机及关系保留仍需收口。

### Q14：无有效磁盘基线则暂停消费统计／保存

用户明确同意：失败后的初始化读不到有效磁盘基线时，报告并暂停本实例消费统计与保存，不影响模型执行；下一次正常会话初始化再加载，不自动探测恢复、不猜零覆盖、不补算暂停期间消费。独立余额／额度功能不因此自动停用。这是 extension shared logic 的业务失败处置，不取消真实执行／framework 生命周期，不把暂停期间未统计消费描述为确认零。

### Q15：clear 只归档最新已保存活动数据

用户明确同意：在协调权限内读取最新活动文件，只归档目标账户全部会话已成功保存的聚合，再执行 Q13 的周期重置。不收集任何进程尚未落盘的内存、不额外触发强制保存／Round 结束／排空，不补账。即使响应已经完成，只要消费尚未成功保存，也不纳入此次归档；未落盘部分随旧账户周期结束丢弃，不转入新周期。

用户再次强调 clear 尽量简单，不设计很多边界恢复逻辑。此确认将旧“全部已知／已取得聚合”的歧义收窄为“锁内最新已保存数据”，明确接受比仅旧在途请求更宽的未落盘损失。成功／失败仍按 Q13，其他账户、既有归档与 estimate 的保护及正常并发正确性不变。本题决定归档输入，不宣称跨进程新周期可见性或物理锁已实现。

### Q16：用户级共享目录，目录由配置指定

用户明确回答“同意共享目录，另外目录地址请参考旧的extension，我需要文件目录可由配置指定”。确认同一操作系统用户各项目／终端共享存储，并要求目录可配置，而非硬编码；实际共享以各实例访问同一目录为前提。内部真实账户／实际会话隔离、账户周期及 clear 的既定范围不变。

旧 model-cost 的 archiveDirectory 实际写死 os.homedir() 下的 .omp/cost-archive，没有目录配置参数；只读 Bun 调用 archiveDirectory／archiveDocumentPath 得到旧目录及消费／estimate 文件路径，未创建目录或读写统计文件。源码证据：[旧 archive-store](../../../../my-omp-toolkit/extensions/model-cost/archive-store.ts)。该调查时尚未批准复用旧地址；后续 Q17–Q20 已批准在用户手动备份、清空后复用目录，不导入旧文档。

后续确认见 Q17–Q20；早期 ~/.my-agent-toolkit/data/model-cost/ 与 ~/.my-agent-toolkit/cost-archive 候选均未采纳。沿现有 framework 配置机制落实，不新增第二套配置体系，不声称目录能力已实现。

### Q17–Q20：复用旧统计目录与字段局部路径语义

确认来源：用户要求“直接放在旧extension目录，切换版本时会手动备份后清空”，随后澄清“Q19 是的，指.omp主目录”，并对 Q20 的完整解释回答“同意”。复用操作系统用户主目录下 .omp/cost-archive，而非 OMP 程序安装根或 extension 源码目录。切换版本前由用户手动备份并清空旧统计；新实现不负责自动备份、清空、搬迁、合并或旧格式兼容。本次仅记录规划，没有执行清理。

model-cost config.yaml 的 storageDir 初始配置为 "~/cost-archive"。仅此字段的 ~/ 以操作系统用户主目录下 .omp 为基准，因此解析到 用户主目录/.omp/cost-archive；不是通常的用户主目录/cost-archive，也不改变 framework 其他字段的 ~ 语义。绝对路径直接使用。Q18 其余已同意约定保留：普通相对路径以配置文件所在目录为基准、不随项目 cwd 变化；初始化读取、修改后重启、不热切换；改变根只是选择另一份存储、不自动搬迁或合并。各实例访问同一实际根才共享，不同根独立。

同一个 storageDir 覆盖消费活动、归档与独立 Codex estimate；文件组织与名称已由 Q21 确认，物理 schema 由 Q25 确定。这个字段局部解析是 model-cost 配置约定，不把 OMP 目录策略固化为 framework 通用文件 module。旧文件残留的识别／有效性仍受损坏和不兼容文件不猜零覆盖约束，不因手动清空承诺批准自动删除。

### Q21：固定文件组织，一个可配置根

用户对完整文件组织提议回答“同意”。storageDir 下固定使用 consumption.json 存放所有账户的活动消费、账户周期、holiday、会话自身累计、父子关系与最近 Round 快照，内部按账户隔离；codex-usage-estimate.json 独立存放 Codex 估计，不随消费 clear 清除；archives/<本次归档唯一标识>.json 每次独立保存，不能覆盖已有归档，内容记录所属账户与周期。

只配置根目录，不分别配置这三个位置。活动文件名不再沿用 deepseek-cost.json，因为新活动数据包括多账户／多模型；不增加第二套权威聚合。失败归档备份仍按 Q13 保留但不自动恢复／合并，不把文件存在当 clear 成功。文件名及组织已确认，JSON 字段／schema 版本／唯一归档标识由 Q25 确定，锁／协调键及原子发布契约由 Q24 确定（实现仍未开始）；没有创建目录或业务文件。

### Q22：本机本地文件系统的协调范围

用户对 Q22 完整运行条件提议回答“同意”。本次保证同一台机器、本地文件系统上的同目录安全共享：不同项目、终端与 OMP 进程正常并发不得互相覆盖；storageDir 可指向另一块本地磁盘。不承诺多台机器通过网络共享盘或云同步共同写入的正确性，不为此增加分布式锁或冲突合并。共享是本机跨进程，而非跨机器复制或同步。

验收沿用已有 OMP 18.5.0／Windows x64／Bun 1.4.2 基线，不因 harness-independent 契约声称其他操作系统或网络文件系统已认证；是否正式改变基线仍由验收票决定。此范围不取消正常多会话安全更新、独立 estimate 或其他账户保护，也不表示具体锁、路径别名协调与原子发布实现已确认或验证。

### Q23：不做请求前读取，周期可见性由保存时校验收口

用户要求不对 clear 边界设计复杂机制、取尽量简单的实现，并同意取消“每请求前读取最新 consumption.json”的候选。普通运行期间实例使用内存中的账户周期与 holiday，不在每个可观察请求前读取文件；renderer 只读内存，不新增定时轮询或空闲刷新。

跨进程 clear 的周期可见性在保存时收口：round_end 提交携带内存记录的 period，磁盘周期已变按 Q8 拒绝；该失败按 Q6 报告、丢弃未保存部分并从磁盘当前有效快照（新周期）重新初始化。代价是 clear 后最多一轮未保存消费丢失、发现延迟到保存时，与 Q13／Q15“clear 尽量简单、接受未落盘损失”一致。

先前 Q23 候选（每请求前异步读最新文件、先固定账户周期／holiday／锚点）及其读失败、空闲刷新、读／clear 交错、开放 Round 跨周期快照等后续问题不再展开。读取一律发生在协调范围内的安全更新与正常初始化：锁内读即最新。属于观察／展示的其他问题不在本题。

### Q24：framework 通用文件能力的接口、锁与发布契约

ADR-0002 已要求 framework 提供协调读-改-发布与读端安全的原子发布，且最新磁盘值必须在协调范围内读取；Q5–Q22 已定 handler 返回前等待、进程内 FIFO、跨进程互斥、按会话合并与周期／版本校验、15 秒等待预算、开始更新后等实际结果。用户同意以下最简落地契约：

- 单一异步入口：调用方提供已解析的绝对路径与业务更新函数；framework 按规范化绝对路径作为协调键，进程内 FIFO 串行，跨进程用一个锁文件以 O_EXCL 原子创建互斥；合计等待不超过默认 15 秒或调用方覆盖值，等待阶段超时／取消即失败且保证不迟到写入。
- 取得协调权限后，framework 重读最新文件并解析，把当前文档交给更新函数；framework 不认识 schema，不做账户周期、版本或业务合并判断，只负责协调与发布。
- 发布用同目录临时文件 + rename 原子替换；读方只看到完整旧文或完整新文；解析失败或文档损坏时不调用更新函数、不覆盖原文件，返回可判别的损坏失败。
- 失败用可判别结果（超时／取消、IO、损坏；业务拒绝由更新函数返回），不抛未处理异常、无重试或后台队列。
- 锁文件年龄超过等待预算视为陈旧并回收，避免崩溃后永久卡死；为满足 ADR-0002“不静默替换他人已完成更新”，被误回收的存活写入者在发布前校验锁所有权（内容 token），发现自己已失去锁则放弃本次写入并按失败返回，而不是用 rename 覆盖他人结果。代价是极慢写入者的未保存更新被丢弃，属已接受的少量损失；真实跨进程／崩溃／原子读契约由验收票验证。
- 协调键用目标目录规范化路径（已存在父目录的 realpath）+ 文件名，避免同一文件的不同写法绕过锁；路径别名统一。
- 留在 model-cost：JSON schema、账户周期／版本校验、按会话合并、归档与 estimate 业务规则。

明确不采用：把旧 OMP native file-lock 或惰性原生 import 带进共享代码；只锁最终写入而不在协调范围内重读；后台任务队列／自动重试；同步 interface（本次只确认安全异步更新）。本能力实现时补进 `framework/docs/framework-capabilities.md`（该文档目前只覆盖 config 只读 YAML）。

### Q25：consumption.json 的物理 schema、归档与版本

用户同意以下最小结构；token 分桶键名与缺价口径以行为／消费契约为准，装配时落定：

- 顶层 `schemaVersion`，`accounts` 以不透明 providerAccountId 为键（格式归账户票 04，schema 不解释）；每账户 `periodId`（成功 clear 更换的唯一值）、`holiday`、`sessions`。
- 每会话：`saveVersion`、`own`（模型 × token 分桶 + 已算费用）、`recentRound`（label、start／end 累计快照，覆盖旧值）、`parent`（直接父会话、启动父 Round、启动实例身份；顶层会话省略）。
- 只存当前周期；历史在 `archives/<archiveId>.json`，`archiveId` 用 `crypto.randomUUID()`，已存在即拒绝覆盖；归档记 schemaVersion、账户、periodId 与该账户全部会话的已保存聚合。
- 未知／缺失／损坏的 schemaVersion 按“无有效基线”走 Q14 暂停，不猜、不迁移；新文件名与旧 `deepseek-cost.json` 无兼容义务（地图 Out of scope 已确认）。
- 跨账户父子遍历语义留账户／观察票；本 schema 只把关系存在子会话记录上。

### Q26：同会话多执行者靠版本冲突收口

用户同意不新增执行者检测（租约／心跳／每会话锁）。`saveVersion`、Q8 旧版本不覆盖、Q12 同版本不同内容拒绝，加上失败按 Q6 丢弃并从磁盘重初始化，已经防止两个进程同时运行同一会话时静默覆盖或重复计费；代价是冲突实例的未保存段丢失、保存交替失败，属已接受的少量损失。明确：同会话同时双执行者不支持，只在保存时通过版本冲突发现。

## Decision

消费活动数据集中存于一个本地 JSON，历史归档及 Codex 估计文件独立；model-cost 以唯一自身聚合派生统计，round_end 保存 Session 累计和最近 Round 快照。framework 提供公共 Session／Round／response 事实与可复用的安全文件更新机制，不规定扩展业务持久化模型；普通消费保存失败反馈而不打断主流程，丢弃未保存部分并从磁盘有效快照初始化，接受少量损失，不增后台重试；同文件更新采用轻量进程内 FIFO，跨进程互斥而不承诺全局顺序；按会话记录合并并校验账户周期／保存版本；取得权限前有限等待／可取消，开始更新后等待实际结果；协调等待默认 15 秒可由调用方覆盖，同版本不同内容拒绝并报告；resume 与失败后初始化均以磁盘有效完整快照为基线；clear 先归档再提交活动重置，失败终止；无有效基线暂停消费统计／保存至下一次正常初始化；clear 仅归档锁内最新已保存数据，不排空内存并丢弃未落盘消费。

用户级共享且目录可配置，storageDir 的 ~/ 特指用户 .omp 主目录；初始 ~/cost-archive 复用旧目录，由用户切换前手动备份清空；初始化读取、修改重启，不热切换或自动迁移。该根下固定 consumption.json、codex-usage-estimate.json 与 archives/ 独立归档文件，不另设各文件路径配置。

文件协调的本次保证限定本机本地文件系统，同机跨进程安全共享；不承诺网络盘／云同步的跨机器共同写入。

framework 提供 harness-independent 的协调读-改-发布能力：单一异步入口、规范化路径协调键、进程内 FIFO、锁文件跨进程互斥、15 秒等待预算、锁内重读最新文档、调用方更新函数、同目录临时文件 + rename 原子发布、损坏不覆盖、陈旧锁回收且被误回收的写入者放弃覆盖；framework 不解释业务 schema。model-cost 拥有 consumption.json 物理 schema（schemaVersion／accounts／periodId／holiday／sessions 的 saveVersion／own／recentRound／parent）与 `archives/<uuid>.json` 归档命名。读新鲜度以锁内读取为准，不做每请求读取，跨进程 clear 由保存时周期校验按 Q8／Q6 收口；同会话多执行者不引入租约，靠版本与冲突检测收口。

## User stories

1. As a 用户, I want 一个消费活动文件与独立历史归档, so that 当前单账户使用不承担预拆文件复杂度且保留明确的账户周期恢复。
2. As a 用户, I want Session 累计与最近 Round 来自同一消费聚合, so that 展示、保存和恢复不维护两套消费算法或重复计费。
3. As a extension 开发者, I want framework 封装多会话安全更新, so that 不在每个扩展重复实现文件协调并能选择自己的持久化模型。
4. As a 用户, I want Codex 转换估计保持独立持久化, so that 消费归档／clear 不误改另一功能的数据。
5. As a 用户, I want 提前提交非阻塞保存并在 handler 完成前等待, so that 独立业务逻辑可与 I/O 重叠但不会留下脱离本次处理的保存任务。

6. As a 用户, I want 普通消费保存失败报告而不打断代理并丢弃未保存部分、从磁盘有效快照初始化, so that 失败内存不导致持续冲突且无需复杂恢复，代价是接受少量消费丢失。

7. As a extension 开发者, I want 同文件轻量进程内 FIFO、失败后继续及不同文件独立, so that 无需复杂后台队列或调用方重复协调便能获得确定提交顺序。

8. As a 用户, I want 按会话记录合并并拒绝旧周期／旧版本提交, so that 多会话保存不覆盖他人且 clear 前消费不被旧缓存复活。
9. As a 用户, I want 取得协调权限前有限等待／可取消且取消后不迟到写入, so that 锁竞争不无限挂住 handler，也不会收到失败后又悄悄改动文件。

10. As a 用户, I want 默认协调等待预算明确为 15 秒且可由调用方覆盖, so that 异常竞争能有限失败而无需新增扩展配置系统。
11. As a 用户, I want 同版本不同内容保留磁盘并报告冲突, so that 序号复用或双执行者错误不会被猜测合并掩盖。

12. As a 用户, I want resume 与失败后的初始化恢复完整磁盘快照并接续版本, so that 新消费有明确有效基线，不靠猜零或复杂补账继续保存。

13. As a 用户, I want clear 先归档后提交重置、失败就终止, so that 不先清掉未备份消费，也无需自动补做／恢复流程。
14. As a 用户, I want 无有效磁盘基线时暂停消费统计／保存至下一次正常初始化, so that 不猜零覆盖、不阻断模型且无需后台恢复，接受期间少计。

15. As a 用户, I want clear 只归档已保存消费而不收集内存或强制排空, so that 实现简单、不设计跨进程恢复，接受未落盘消费丢失。

16. As a 用户, I want 跨项目共用且可配置的持久化目录, so that 不拆散同账户累计并能选择文件存放位置。

17. As a 用户, I want 活动消费、独立估计和归档采用固定且清楚的文件组织, so that 只配置一个根且消费 clear 不误清 estimate 或已有归档。

18. As a 用户, I want 在本机本地磁盘安全共享统计而不引入跨机器协调, so that 多终端正常并发可靠且保持实现简单。
19. As a 用户, I want 不做请求前读取而由保存时发现跨进程周期变化, so that clear 相关实现保持简单并接受最多一轮未保存损失。
20. As a extension 开发者, I want framework 提供带锁、锁内重读与原子发布的通用文件能力, so that 多进程安全更新不在每个扩展重复实现。
21. As a 用户, I want consumption.json 一个最小且唯一的物理 schema, so that 恢复、归档与展示读取同一权威。
22. As a 用户, I want 同会话双执行者靠版本冲突而非租约收口, so that 不引入额外仲裁机制且不静默覆盖。

## Preconditions

- 复用旧目录前由用户手动备份、清空旧统计并完成新旧加载切换；原新实现加载互斥与回退步骤由验收票收口，不将此规划当已经完成的用户动作。

- [数据归属与账户周期决议](12-state-data-contract.md)提供本周期自身聚合、最近快照、父子关系及接受的未保存损失边界。
- [观察契约](../decision/03-observation-contract.md)仍需提供可靠响应、Round、会话与父子身份事实；[账户访问](../decision/04-provider-access.md)提供实际账户归属。
- Q23–Q26 已确认安全更新 interface、完成／失败结果、旧提交拒绝、锁与平台、路径、clear 归档／重置一致性及读新鲜度契约；这些仍是规划，不代表 framework 文件能力已实现。实现需 node:fs 等运行时文件 API（与 config 读取一致），账户身份格式由账户访问票提供，落地点由装配票收口。

## Postconditions

- [装配规格](../decision/10-assembly-layout.md)不得把消费 schema、计价或 Session／Round 保存规则放入 framework 基础文件 module。
- [展示](../decision/08-presentation.md)读取同一自身聚合及派生视图；[验收](../decision/11-acceptance-cutover.md)覆盖恢复与多会话保存，不恢复历史明细账要求。
- [命令](../decision/07-command-state.md)的 clear 依赖本票已确认的 clear 一致性机制（Q13／Q15／Q24），实施由命令／验收票收口；[刷新](../decision/09-refresh-lifecycle.md)保留独立 estimate 的调度责任。

- [展示](../decision/08-presentation.md)确定普通 round_end 保存失败在 UI／headless 的反馈承载；[装配](../decision/10-assembly-layout.md)及[验收](../decision/11-acceptance-cutover.md)采用修订 Q6 的不阻断、丢弃未保存部分／磁盘有效基线初始化及明确接受少量损失，不按旧失败保留内存要求验收、不默增后台重试。

- [装配规格](../decision/10-assembly-layout.md)把 Q7 串行与跨进程协调留在 framework 文件 module；[验收](../decision/11-acceptance-cutover.md)验证同文件 FIFO、失败后继续、不同文件独立及跨进程安全更新，不要求全局 FIFO。

- [观察](../decision/03-observation-contract.md)、[命令](../decision/07-command-state.md)承接账户周期拒绝与实际取消／反馈映射；[装配](../decision/10-assembly-layout.md)、[验收](../decision/11-acceptance-cutover.md)采用 Q8 的按记录合并与版本校验、Q9 的等待阶段终止后无迟到写入，不宣称 clear 多文件事务或整操作硬超时已解决。

- [装配规格](../decision/10-assembly-layout.md)承接可配置共享目录的配置与注入；[验收](../decision/11-acceptance-cutover.md)承接跨项目共享、配置生效与旧文件保护；采用 Q17–Q20 的字段局部解析与用户手动备份清空的切换前置；采用 Q21 的固定文件组织；schema／锁及归档唯一标识契约已由 Q24／Q25 确认，实现由装配／验收票承接。

- [装配规格](../decision/10-assembly-layout.md)不得为本范围新增分布式锁／云同步冲突合并；[验收](../decision/11-acceptance-cutover.md)在已声明本地平台／运行基线上证明同机并发，不推定其他 OS 或网络盘已支持。

- [装配规格](../decision/10-assembly-layout.md)把 Q24 协调读-改-发布能力暴露为 framework 公共能力（实现时同步 `framework/docs/framework-capabilities.md`），不把 schema／周期／版本／合并规则放进 framework；[验收](../decision/11-acceptance-cutover.md)验证真实跨进程互斥、锁内重读、原子读、损坏不覆盖、陈旧锁回收且不静默替换存活写入者，以及 Q25 恢复／归档与 Q26 版本冲突。
- [展示](../decision/08-presentation.md)读同一自身聚合；不做请求前读取或定时轮询，不因本能力新增第二种消费来源。

## Invariants

- storageDir 的 ~/→用户 .omp 主目录是 model-cost 字段局部语义，不改变 framework 其他字段路径规则；程序不代替用户自动备份／清空旧统计。

- 会话自身累计是唯一消费聚合源；工具、Round 发布、账户与父子汇总不产生第二笔消费。
- 延续旧 daily-tracker 的本地 JSON 活动／历史分离思路，不要求照搬旧 token 差分／费用增量算法。
- 持久化模型归 extension；framework 的基础文件 module 不认识 holiday、业务计价、本账户周期消费累计或最近 Round 持久化 schema，不升级 boolean 激活 State 为业务容器。
- 原生 file-lock 不直接泄漏到 shared logic；安全协调按现有 harness-independent 分层决定。
- clear 不改 framework 活动态，不清其他账户、已有归档或独立 Codex estimate；本票局部确认不移除其余既定数据寿命。

- framework 文件能力不认识 holiday、账户周期、会话版本或最近 Round 业务 schema；schema／合并／归档规则归 model-cost，能力只负责协调、锁与发布。
- 读新鲜度：锁内读取即最新；普通运行不做每请求磁盘读、无定时轮询、无空闲刷新。
- 锁只保证互斥与发布安全；被误回收的存活写入者必须放弃写入而不是覆盖他人已完成更新（对齐 [ADR-0002 shared-file concurrency scope](../../../docs/adr/0002-semantic-extension-framework.md)）。
- 旧统计文档不兼容（地图 Out of scope 已确认）；程序不自动迁移、清空或合并旧数据。

~~~~~~~~

## lighthouse/12-state-data-contract.md

~~~~~~~~markdown
# model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse

> Question and discussion: [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)
>
> 用户已确认核心草案及历次暂停记录的补充范围，并要求生成正式 Lighthouse。本文件为本票最终决议；末尾完整票体快照仅作历史溯源，旧提议、暂停状态及未决措辞不覆盖下列最终结果。此决议不表示生产迁移、原生观察或存储已经实现。

## Question

**当前实现起点：以聚合为主，先验证具体极端场景。** 用户已选择参照旧实现的聚合方案作为基础；只有该方案不能满足实际场景时，才讨论是否升级记录粒度，而非默认长期逐 Turn 明细。用户举例 /tree：Session 累计能正常保留即可，对应历史 Turn 累计可能无法取得可以接受。具体持久化介质、写入时机、有限关联范围与历史 Round 视图的正式替代范围仍待具体实现论证，不由此自动取消所有此前功能。先区分逐响应计算／累加、运行期请求关联、持久化逐 Turn 历史三件事；用旧代码与具体场景比较聚合统计、有限记录和完整明细的成本收益，再决定记录粒度／寿命，以及哪些既有需求需要修订。没有确认粒度前，不先固定 TurnRecord schema、通用账本、State 扩展或同步／异步写入策略。

依据[行为契约决议](../lighthouse/01-behavior-contract.md)，哪些数据进入 framework State，哪些是扩展自有业务数据／缓存／派生展示结果？逐项覆盖最新余额、5h／7d 窗口读数与获取时间／加载／错误状态、Turn usage/cost、Round totals、Session totals、预算／detail／holiday 及 quota estimate。仅存内存不等于不属于 State；明确类型、归属、读写接口及恢复／继承语义，不能把当前 boolean activation 字段当业务容器。

当前已决定不升级通用业务 State：model-cost shared logic 拥有业务聚合，framework 激活 State 不充当业务容器，UI 只读同一业务视图。余下问题是最小数据键／字段与查询路径、运行期有限身份及父子关系的保留／恢复，不重新设计完整账本或缺失计数；最新远端读数仅内存、累计／归档／holiday／quota estimate 的既定寿命保留，预算修改已移除、detail 为入口级内存偏好。存储票决定物理格式与保存完成／失败／协调，刷新票决定调度；本票不设计 TTL、不迁移代码。

## Discussion

### 先由具体数据流找到最小能力

用户选择沿旧实现的聚合方案演化：先看数据在哪里、谁读写、何时保存，再讨论接口与等待策略。区分逐响应计算／累加、运行期请求关联、长期逐 Turn 留存；前两者不自动要求第三者。用具体必要场景验证，只有真实缺口无法满足才重新比较更细粒度方案，不把框架完整性或准确性最大化作为默认目标。

用户希望基本感受不到新增延迟。内存读写、历史读取、落盘／锁等待、远端刷新、渲染分别说明，不泛问整个 callback 同步还是异步，不默增后台队列、审计系统或恢复日志。已有决定可以基于代码证据提出修订，但必须确认；不隐去历史修订；按用户要求同步旧 Lighthouse 的当前有效正文并保留修订前快照，不把未结案的接口提议当不可变实现。

### 业务聚合归 shared logic，不升级 framework State

model-cost 的 harness-independent shared logic 拥有计价、聚合、最近 Round、账户测量缓存和本次统计 tradeoff；framework 的 boolean 激活 State 不充当业务容器。本次不升级通用业务 State，也不建立第二套框架／配置／能力声明。

framework 提供 Round、可观察 Request／Turn、response usage、实际会话、父子启动关系、模型等宿主事实，adapter 映射原生支持。shared logic 不读 OMP 原生 context／payload；其他 harness 可复用业务逻辑，本次仍只落地 OMP，不实现或认证 pi adapter。HTTP、文件和并发协调按地图既定分层归 framework 通用能力；DeepSeek 计价、Codex header parser、额度估计与具体业务数据格式不因此进入语义 core。

### 最小逻辑数据布局与查询路径

下表确定逻辑归属／寿命，不冻结物理文件 schema、接口签名或数据库选择。

| 数据 | 逻辑键／用途 | 寿命与读取 |
| --- | --- | --- |
| 实际会话自身累计 | 实际会话 × provider 账户 × 模型；只含该会话自己发出的响应 token／已算费用 | shared logic 内存更新；按账户当前周期发布并恢复；UI 读只读视图 |
| 父子启动关系 | 子实际会话、直接父实际会话、启动父 Round、区分启动实例所需关联身份 | 随聚合保存；恢复后沿直接父链查询自身／子代理／整体，不能猜 Owner 或名字层级 |
| 当前／最近 Round | 当前归属、最近一轮开始／结束累计快照、当前统计位置是否可用 | 当前态内存；最近快照随 round_end 聚合同次保存并覆盖旧轮 |
| 在途请求 | sessionId／turnId 与原账户、Round、模型、请求时锚价 | 运行期保存；结束处理完成后释放完整详情 |
| 已处理请求身份 | sessionId + turnId；防止重复结束通知再累计 | 仅内存，保留到本次观察实例销毁；不在 round_end 清空、不按任意 TTL 淘汰、不落盘 |
| 最新账户读数 | 账户维度的余额／双窗口、获取时间、加载／请求错误等测量状态 | 仅内存；重启重新获取，不能跨账户或跨来源拼接 |
| 账户业务持久数据 | 当前周期聚合／归档、holiday、quota estimate 的既定基线与采纳值 | 账户隔离；具体发布、并发合并与读缓存新鲜度留存储／刷新票 |
| detail | 交互窗口／CLI 展示实例的偏好 | 仅入口内存；不是账户偏好、会话持久值或子代理继承 State |

自身累计是唯一消费聚合源。自身／子代理合计／整体合计是同一事实的不同口径，不是三份消费；UI 不维护第二套权威累计。账户也不能把父含后代汇总和子自身累计再叠加一遍。币种与渠道口径沿用消费归属决议：Codex 美元只作参考，不混入计费渠道消费金额。

### 逐响应计算、Round 批量保存与可接受损失

每个 Turn 按可靠 response usage 及请求开始时锚价计算，在内存累加；framework round_end 触发聚合保存，不改为逐响应落盘，不保留长期逐 Turn 明细。旧实现逐原生 agent_end 发布仅是近似参照，不与新 Round 完全等价；续跑／等待子结果可拉长内存阶段。

强杀／崩溃发生在聚合成功保存前，可以丢失尚在内存的消费；恢复只读取成功保存值，不以当前价格猜补。为此不引入逐 Turn 持久化、崩溃日志或自动补账。正常退出／切换／重载不预建额外独立排空钩子；只有实际宿主路径暴露不能接受的必要缺口，才带证据重新讨论。普通动作都已安全保存并非全部链路已验证的事实。保存是否等待完成、失败如何处理及重置成功条件由存储票决定。

### 有限请求关联与去重

请求开始固定实际归属、模型和计价锚点。结束已累计或按缺失规则跳过后释放详情，仅记住已处理身份；重复同一结束通知不增加消费，同输入的新调用仍使用新身份独立计价。不保留 headers／usage 等完整历史以防重，不增加持久化请求账本；接受长期运行实例的标记数量随已处理请求增长。

缺 usage 已跳过的请求也视为已处理，不借去重标记重新引入补账。恢复不扫描旧 assistant 消息重新入账，旧观察实例回调不得直接进入新实例。可靠 turnId、原生关联、实例销毁／隔离和观察处理排序留观察票；这里未证明宿主已支持全部异常路径。统计更新的内存去重不等于落盘更新已经幂等，发布版本与并发合并留存储票。

### 逐代理自身累计、恢复关系与迟到子消费

每个实际子／孙会话独立累计自身，保存直接父和启动父 Round 的关系。含后代汇总每笔响应只计一次，不从父总数猜子消费，不把 task／orchestration 汇总报告作为第二笔请求。消费归属不是 Owner activation 或 State follow；父 Round 是否结束与后台子是否还有消费不同。

关系随既定聚合发布，不增加启动即落盘钩子；父 Round 身份是归属标签，不等于保留历史 Round 统计。若同一子会话被复用到不同启动，不能覆盖旧归属；必要分段方式按真实宿主证据由观察／存储票收口。

旧轮子代理的新消费计入实际子会话、原账户及主会话含后代累计，不按到达时间归入当前 Round。若原父 Round 已被最近快照替换，不恢复该历史轮次或重开生命周期。当前 Round 子消费按启动关系筛选，不能直接用含所有后代的 Session 总累计求差；迟到发布时机留存储票，不暗增保存触发。clear 重置目标账户时旧在途请求的主动丢弃是下节明确例外。

### 最近 Round、tree 与恢复展示

只保存最近一轮开始／结束累计快照，以差值取得最近轮统计；覆盖而不追加历史 Round 列表，和聚合同次保存，不新增发布频率。费用快照来自逐响应锚价后的已算费用，不能把 token 差值按结束时价格重算。当前轮内存态仍受未成功落盘损失边界约束。

/tree 后隐藏 Round 数值或明确该位置轮次数据不可用，不把不可用显示成零，不把最近轮冒充历史当前位置轮次；Session 本周期累计不随树导航回滚。实际开新 Round 后恢复当前轮展示，结束后成为最近轮。普通 resume 可明确显示已保存的最近 Round，但不声称它对应当前位置，不建立历史位置索引。

### 缺 usage／价格只提示，不建立补账状态

正常完成有可靠 usage 是正常支持路径的前提，不是全部 provider 已认证的事实。正常成功却缺 usage 时打印／报告提示并跳过，不造 usage 或确认零。失败／取消有可靠 usage 则累计，无 usage 则跳过并接受少计；不维护缺失计数、补账记录或 UI 持续完整性标记，不承诺后来补齐。

有 usage 而缺适用计费价格时仍累计 token，只不追加相应费用，提示但不维护补算记录，不用之后价格重算。Codex 参考费用缺价不影响 token／额度；token-only／hidden 无金额口径不因没有价格报错。已知小计不代表完整 provider 收费；跳过不等于实际免费。

未知、无统计口径、确认零、指标完整性、已知小计继续作为领域知识保留，不因运行时简化从 glossary 删除，也不要求因此实现枚举、计数器或完整 UI 状态模型。

### 账户周期、账户级 clear、归档与 resume

clear 当前入口的执行条件已于 2026-10-11 批准，唯一权威为[命令局部决议](07-command-state.md)。该入口限制不修改本节账户范围或存储的跨进程周期校验。

账户周期限定从何时累计，Session／Round 限定统计哪组消费：Session totals 是适用账户当前周期内该会话跨各 Round 的累计；Round totals 仅该周期内归属于某一 Round 的消费，不是整个周期总数。不同账户有独立周期，clear 不重定义 framework Round。

只保留账户级 clear，不提供仅当前会话树清理。归档目标账户全部会话已成功保存的活动聚合，再重置相应活动统计／旧业务关联；归档输入已按用户在[存储局部决议](06-local-storage.md)Q15 的确认收窄，未落盘消费不排空／补账，具体结果只在该权威文档记录；不清其他账户，不删除已有归档。clear 的完成／原子条件、如何保留其他账户父子查询所需关系，交账户访问与存储票，不粗暴删除跨账户共用关系。

归档不等旧在途请求，不建立逐 Turn 明细。成功 clear 后，目标账户 clear 前开始却尚未入账的请求之后即使有可靠 usage，也因旧关联失效而丢弃，不重新绑定当前轮、不猜补；接受丢掉这部分统计，不解释为零消费。旧缓存、排队保存或其他实例持有的旧值不得复活被清记录，具体代际／原子机制待定。

仍运行的旧子／孙代理在 clear 后新开始的请求从零正常计价，利用仍可靠可取得的宿主父子启动事实重建业务归属；不是把整个代理永久排除。clear 不取消真实执行、不清 framework Round／活动状态／Owner、不因统计清理让 connect-bot 误报结束。开放 Round 跨 clear 的快照映射及原生支持留观察／展示票，不伪造新轮边缘。

普通 resume 恢复本周期已成功保存的聚合，不每次从零。clear 成功重置后再 resume，被清账户本周期为零或后来已保存新值；旧值只在归档中，不自动合并旧归档、不扫描宿主历史重新计费，不额外维护跨周期 Session lifetime total，不默认新增归档查询命令。归档保留可查记录不等于已实现自动归档 UI。

当前推演假设执行 clear 时只有一个开启 DeepSeek 的会话，不由此默取消已确认的多 main／跨进程支持，也不宣称已实现拒绝或检测其他运行会话的机制。

旧版事实：旧 widget Total 从宿主 token 按当前／活动费率显示；Accrued 来自共享周期持久化。旧 clear 重置整个共享周期文件，不具备严格多账户 namespace；旧 resume 把已有 token 设基线、cost 为零，不把历史费用按当前价重写。新方案不沿用 Total 的历史重估来冒充实际已锚价累计，详见证据资产。

### holiday、预算修改与入口 detail

holiday 按账户共享、跨重启保存，持续到该账户成功 clear 为止；无消费可归档时也能 clear 关闭。随后新请求恢复正常峰谷锚价，不追溯重算旧归档。clear 不清 Codex quota estimate 或入口 detail，其他账户不受影响。归档／累计重置／holiday 关闭一致性及失败反馈交存储／命令票。

移除数字／K／0 修改或重置预算的子功能，不新增预算偏好保存；不因此取消 DeepSeek 450K、Codex 272K 固定预算显示／告警，预算不限制实际模型执行。detail、holiday、clear 保留，不把预算修改移除解释为整个命令票无必要。具体命令名、校验、模式限制留命令票。

detail 是同一交互窗口／CLI 展示实例的内存偏好：普通会话切换和 tree 保留，重载／重启回 brief；独立入口互不影响，不按账户共享、不按会话持久化，不是子代理继承的消费 State。具体入口绑定留装配票。

### 历史决定的替代关系与文档职责

1. 历史 Round／tree 查询、逐 Turn 持久记录和恢复补齐要求明确收窄为聚合、最近快照、tree Round 不可用与已接受的未保存损失；不是无意漏实现。
2. 缺 usage／价格的持久缺失记录、计数、持续完整性标记与补算系统取消；可靠正常响应归属／去重与账户并发要求保留。
3. 数字预算修改取消；固定预算显示／告警保留。
4. 本轮一度确认的树级 clear 已由账户级 clear 替代；不清 holiday 的提议未采纳。单会话推演不取消多会话支持。
5. Session lifetime total 改为账户本周期的会话累计；归档不自动恢复。tree 不回滚仍成立，clear 是显式重置例外。

[行为契约决议](01-behavior-contract.md)与[消费归属决议](02-accounting-ownership.md)的当前有效正文已按用户要求同步最新决定，修订前版本完整保存在[历史快照](../assets/contract-history-before-sync.md)，不伪装成从未改变；本数据决议仍是本次布局／寿命取舍的来源。观察票尚未结案的 Round／Turn 契约留其原票，不因本数据票结束视为接口已交付。

[framework glossary](../../../framework/GLOSSARY.md)定义通用概念与父子关系，[model-cost glossary](../../../extensions/model-cost/GLOSSARY.md)定义消费特化与账户周期，[聚合架构 ADR](../../../docs/adr/0004-model-cost-aggregate-accounting.md)解释业务取舍及代价。本 Lighthouse 是本票最终决定，地图只索引，glossary 不承载 schema／锁／清理策略。

## Decision

model-cost shared logic 按请求锚价逐响应内存聚合，以实际会话 × 账户 × 模型的自身累计为源，保存父子启动关系与最近 Round 快照，round_end 发布，不升级通用业务 State 或建立历史明细账。累计限于账户当前周期，账户级 clear 归档并重置、关闭 holiday；resume 仅读取已保存活动聚合，接受未落盘／缺事实／clear 前在途的统计损失，不重估历史或自动合并归档。

## User stories

1. As a 用户, I want 沿用聚合为主而非完整明细账, so that 保留近似旧实现的复杂度与交互开销。
2. As a 用户, I want 每份响应按请求开始锚价计算, so that 跨模型／峰谷消费不被结束或恢复时价格重解释。
3. As a 用户, I want 逐子代理独立累计并区分自身／子代理／整体, so that 能知道消费来源且嵌套／orchestration 汇总不重复计费。
4. As a 用户, I want 父子启动关系与聚合一起恢复, so that resume 后仍可正确查询含后代总累计。
5. As a 用户, I want 旧轮子消费保留原启动归属, so that 新 Round 不被到达时刻错误污染。
6. As a 用户, I want round_end 批量保存并接受未保存损失, so that 不为崩溃恢复承担逐请求日志和额外排空机制。
7. As a 用户, I want 只保留最近 Round 快照并明确 tree 不可用, so that 最近轮体验保留而不把历史位置或缺失冒充零。
8. As a 用户, I want 正常 resume 恢复已保存本周期统计, so that 重启不会重复收费或按单一当前模型重估历史。
9. As a 用户, I want 账户级 clear 归档后重新累计, so that 能结束整个账户周期且旧累计不因 resume 自动回来。
10. As a 用户, I want clear 前在途响应丢弃、之后新请求正常统计, so that 重置简单且仍运行的子代理不被永久排除。
11. As a 用户, I want holiday 持续到该账户成功 clear, so that 共享手动谷价周期有明确结束操作且不改写旧费用。
12. As a 用户, I want 最新余额／双窗口与持久 estimate 分开, so that 账户切换不混测量且重启可恢复必要估计。
13. As a 用户, I want 缺 usage／价格只提示并跳过相应指标, so that 不猜零、不搭补账系统且有 usage 的 token 仍可累计。
14. As a 用户, I want 固定预算显示／告警保留而移除修改入口, so that 简化操作不取消既有上下文提示。
15. As a 用户, I want detail 是入口内存偏好, so that 切会话保留展示选择、重启回 brief 且独立入口互不影响。
16. As a 开发者, I want 业务读写属于 shared logic、UI 只读, so that 不因 renderer 次数产生请求、落盘或第二套累计。
17. As a 开发者, I want framework 只提供宿主无关事实和通用 IO／协调, so that 接入其他 harness 不重写业务也不泄漏 OMP 类型。
18. As a 维护者, I want 从具体数据流倒推最小接口, so that 不在缺少数据／等待心智模型时冻结抽象或扩大范围。
19. As a 维护者, I want 保留领域概念和明确的修订来源, so that 运行时简化不会被误认为零消费或无意遗漏需求。
20. As a 用户, I want 多 main／同账户并发及不同账户隔离仍正确, so that 单会话推演和一个账户的 clear 不破坏其他消费。

## Preconditions

- 本决议依赖已确认的[行为契约](01-behavior-contract.md)和[消费归属决议](02-accounting-ownership.md)，并在上述替代范围修订它们。本票的业务选择不以未结案生产接口为证明。
- 落地需[请求／响应与 Round 观测](../decision/03-observation-contract.md)提供可靠 Turn／会话／启动关系、usage 来源、实例隔离、跨 clear 原生映射及派发处理约束。
- 落地需[账户访问](../decision/04-provider-access.md)提供真实账户关联、凭据／地址／代理 seam；不能把未知账户并到公共默认账户。
- [HTTP 能力](../decision/05-http-capability.md)提供通用传输；[存储与协调](../decision/06-local-storage.md)确定 schema／路径、账户与周期 namespace、原子发布／归档／reset、锁、保存确认／失败、并发和迟到发布。
- [命令状态](../decision/07-command-state.md)映射保留命令、成功／失败反馈及运行条件；[展示](../decision/08-presentation.md)决定三口径、最近轮／tree、提示与 headless；[刷新](../decision/09-refresh-lifecycle.md)决定 TTL／single-flight、测量新鲜度、来源成对与生命周期。
- [组织与装配](../decision/10-assembly-layout.md)冻结模块、入口实例与注入 seam；[验收与切换](../decision/11-acceptance-cutover.md)按正式基线验证取舍；[模型与价格覆盖](../decision/13-model-catalog-policy.md)确认名单／数据来源，不重解释历史锚价。
- 原统计文件保留、不自动删除或改写；新统计允许从空开始，不要求导入旧基线。本次不实施或认证 pi adapter。

## Postconditions

- 普通消费保存失败的当前取舍及已确认损失范围以[存储局部决议](06-local-storage.md)修订 Q6／Q11 为唯一权威；此处不将正常并发正确性或仅异常退出的旧描述用于否定该显式修订，业务布局与普通 resume 结论不变。

- 后续票可依赖上述业务归属、逻辑键、寿命、恢复／tree／clear／holiday 和入口偏好，无需重问账本还是聚合。
- 存储票可设计聚合＋关系＋最近快照而非历史逐 Turn 账本；物理文件与发布幂等仍需决定，旧缓存不能复活 clear 数据。
- 观察票提供事实与可靠运行期身份，不能反向强制持久账本、补账或猜 usage；不得把旧在途响应误关联为新请求。
- 展示票消费只读业务视图，清楚区分自身／子代理／整体与最近 Round／当前位置不可用，本周期 Session 与跨周期 lifetime 不混用。
- 命令票保留账户级 clear／归档／结束 holiday、detail；数字预算修改不迁移，Codex estimate 与其他账户不被误清。
- 刷新／装配／验收票仍 unresolved；本票不冻结它们的接口、无 UI 远端策略、物理 schema、保存等待或所有恢复映射，不宣称新能力已实现。
- 原题与历次已确认／被替代提议均保留溯源，旧 Lighthouse 当前有效正文按用户要求同步，历史快照保留；地图仍只索引具名决议的一行 gist。

## Invariants

- 同一正常有 usage 请求仅累计一次；重发是新身份，工具结果、task 汇总和父子视图不是另一笔消费。
- 请求开始绑定实际归属与模型／锚价，不以当前模型、State Owner、相同内容或到达时间替代身份；账户隔离与单 session 执行者要求不因简化取消。
- 自身累计不含子代理；祖先汇总每份响应一次。当前 Round 子消费按启动关系，不用所有后代 Session 总差值猜轮次。
- tree／切换／普通恢复不撤销已发生的本周期消费；成功账户 clear 是显式重置例外，归档不自动并回活动聚合。
- 缺事实不等于确认零；计费／额度／无统计口径保持领域区别，运行时不维护完整性计数或补算状态。Codex 美元参考不入计费金额总计。
- Round 生命周期事实与统计周期／发布完成分离；clear 不取消执行、不清 framework 活动、不让 connect-bot 面板误报结束。
- renderer 只读，不发 API／建 timer／落盘／更新权威业务值；对齐[现有 framework 配置机制与 native import 责任](../../../docs/adr/0002-semantic-extension-framework.md)，不建立第二套配置或框架，不偷渡 OMP 原生锁到 shared logic。
- 旧 turn-cost 的请求锚价原则与 daily-tracker 的聚合／锁内协调是具体参照，不声称其旧 agent_end、共享文件或 Total 重估就是新契约；新同步／异步选择必须展示真实操作路径。
- framework glossary 定义通用词，model-cost glossary 定义消费词，ADR 解释取舍；词存在不强迫实现枚举或恢复系统。本决议只规划，事实资产不等于生产认证。

## Evidence and verification boundaries

- [旧聚合粒度调查](../assets/old-accounting-granularity-smoke.md)：真实旧纯计价函数的跨峰谷和有限状态验证，不含远端账单／文件并发。
- [tree 聚合探针](../assets/omp-tree-aggregate-smoke.md)：tree／恢复位置与累计的证据，不等于全部真实 TUI 恢复路径已验证。
- [旧等待／刷新行为](../assets/old-observer-waiting-smoke.md)：旧等待影响调查，不批准新的 handler／发布调度。
- [OMP 请求观测链路](../assets/omp-request-observation-smoke.md)与[OMP 子代理归属](../assets/omp-subagent-round-findings.md)：固定基线的原生事实证据，不是新 framework 接口已经交付。
- [旧 clear／resume smoke](../assets/old-clear-resume-smoke.md)：实际旧 tracker、临时文件归档、价格显示；隔离 home、锁为串行 test seam，不是完整 RPC／UI／并发／账单认证。
- 本次正式文档发布未进行生产迁移、真实账单、账户并发或完整 UI 验收。既有支持基线保持 18.5.0，不能用本机安装版本替代。

## Historical ticket body

以下完整保留生成时的票体，含历次暂停交接与历史提议。为避免移动目录后把原相对链接解释成新的权威链接，原文置于代码块；可点击的原始来源在文首。最终结果以上述 Discussion／Decision 为准，不以快照中的 claimed、待确认或过时提议覆盖本决议。

~~~~~~~~markdown
# model-cost 的哪些数据进入 framework State，如何声明与读取？

Type: grilling
Status: claimed
Assignee: hugos (本会话 agent 协助讨论)
Blocked by: 01, 02
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## 当前有效决策与思考方向（新对话优先读取）

本节记录本票已确认的方向与未决边界，整票未结案，不是最终 lighthouse。历史 Handoff 不得被当作禁止重新检验实现取舍的前提。

1. **以聚合为主为实现起点**：参考旧实现，先验证具体场景；只有发现必要场景无法满足，才比较有限记录或更细粒度方案，不默认建立完整逐 Turn 明细账。
2. **区分三件事**：逐响应计价／累加、运行期请求关联、长期逐 Turn 留存。前两项不自动要求第三项；代码验证的是具体能力，不以概念一致性代替实现证据。
3. **tree 的优先级已确认**：切换历史位置后 Session 已发生累计保持正常；用户可以接受对应历史 Turn 累计不可取得。不可用不冒充零。此局部取舍不自动取消所有当前 Round、子代理、账户统计或其他原有功能；旧 UI Turn、新 Turn、历史 Round 正式规格差异需准确说明。
4. **代码／数据流先于接口选择**：先展示数据在哪里、谁读写、何时保存，分开内存读写、持久化／锁等待、远端刷新与渲染，再决定具体操作同步／异步。不从“框架应该完整”反推业务数据结构，框架只按选定实现缺少的最小能力扩展。
5. **保留旧体验与现有功能的基线**：用户希望基本感受不到新增延迟；真实代价和能力缺口出现时明确讨论取舍，不默删需求，也不默增后台队列、完整审计／恢复系统。
6. **前面决定允许基于代码重新评估**：[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)及[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)保留作为历史／讨论输入；请求记录粒度与相关接口需要与聚合实现核对，必要修订再确认。历史 lighthouse 不改写，不把未结案接口提议当不可变架构。

7. **逐 Turn 内存累计、round_end 触发落盘**：用户明确选择类似旧方案的聚合节奏：每个 Turn 按实际 response usage 和请求时锚价计算，运行期在内存累加，framework round_end 时触发持久化聚合；用户认为该方案足够。不采用本轮提出的逐响应持久化更新目标，不要求长期逐 Turn 明细。旧实现逐原生 agent_end 发布只是近似参照，并不与新 Round 边界完全等价。异常退出损失及无独立排空钩子的取舍已由下列决定收口；保存完成／失败与正常请求有限去重机制尚待明确，缺 usage 不保留补账记录的规则见后文。

8. **接受异常退出的未落盘损失**：用户确认强杀／崩溃发生在 round_end 聚合成功保存之前时，可以丢失尚在内存中的消费累计；重启只恢复已成功落盘的累计，不保证恢复丢失费用，不用当前价格猜补。为此不引入逐 Turn 持久化或崩溃恢复日志。正常离开不增加独立保存钩子的后续决定见下文；落盘失败策略仍待存储票确认，其他正常请求去重、归属与账户并发要求不变。

9. **不增加独立生命周期保存钩子**：用户确认正常退出／切换／重载不预建额外排空机制，以 round_end 统一触发聚合落盘；只有实际宿主路径出现不能接受的必要缺口才重新讨论。round_end 保存是否等待完成及失败处理留存储票，不以本决定承诺全部正常宿主路径已验证。

10. **子代理独立累计**：用户确认 Q4；每个实际子会话独立累计自身 token／费用，保留父子启动关系，含后代消费按关系聚合，不从父 Round 合计猜子代理消费、不把任务汇总报告再次入账。此选择不要求长期逐 Turn 明细或历史 Round 列表。

11. **仅保留最近 Round 的开始／结束累计值**：用户明确决定不保存历史 Round 数据；保留最近一轮开始／结束的累计快照以求差值，不建立历史 Round 列表或历史逐 Turn 明细。该限制不取消 Session／账户累计、逐子代理聚合、账户归档或额度估计持久化；/tree 不恢复任意历史 Round 统计，Session 累计不回滚。最近快照随 round_end 保存及当前／最近轮次展示已由下列决定收口。费用快照必须来自逐响应锚价计算后的费用累计，不能将 token 差值按结束时价格重算。此为对历史消费归属决议中历史 Round 查询要求的明确修订，最终 lighthouse 交代替代范围，不改写旧 lighthouse。

12. **最近 Round 快照随 round_end 一起持久化**：用户确认 Q5，认为是近乎免费的优化；每个实际 Session 随同一次 round_end 聚合保存最近一轮开始／结束累计快照，覆盖旧轮而不追加历史列表。重启可读取最后一次成功保存的最近轮次快照，不增加落盘频率、独立保存钩子或逐 Turn 明细；在途新轮尚未保存的内容仍受已接受异常退出损失边界约束。具体聚合字段与读取路径仍待收口；展示切换及不维护缺失完整性状态的后续决定见下文。

13. **tree 导航使当前位置 Round 展示失效**：用户确认修订 Q6；/tree 导航后隐藏 Round 数值或标记“该位置轮次数据不可用”，不将已保存最近轮次冒充当前历史位置统计，不把不可用显示成零。Session 累计不回滚；实际开启新 Round 后恢复新轮的累计展示。最近轮次快照仍保留，不增加历史定位索引或历史 Round 存储。恢复读取的最近轮次若展示必须明确为“最近一轮”，不能未经可靠关联当作当前位置这一轮；恢复快照明确称为最近 Round 的后续决定见下文。该决定替代原 Q6 对所有位置无条件显示最近轮次的提议，原 Q6 未整体获批。

14. **恢复快照明确显示为最近 Round**：用户确认 Q7，认为“最近 Round”是准确描述；恢复会话后若有成功保存的快照可显示最近 Round，不声称是当前位置轮次。/tree 导航后 Round 数值仍按已确认规则不可用；实际开启新轮显示当前 Round 累计，结束后成为新的最近 Round。展示称谓与统计寿命分开，不增加历史位置索引。

15. **旧轮子代理迟到消费不污染当前 Round**：用户确认 Q8；迟到消费继续计入实际子会话、正确账户及主会话含后代总累计，不按到达时间计入当前 Round。若启动它的旧 Round 已被最近快照替换，不恢复该历史轮次或重开生命周期；当前 Round 含后代消费须按启动关系筛选，不能直接用包含所有后代的 Session 总累计求差。迟到更新的持久化时机留存储票，未批准额外保存触发。

16. **UI 需区分主会话自身与子代理消费**：用户要求在 UI 体现主会话自身消耗与子代理消耗的区别，并确认主会话自身／子代理合计／整体合计三个统计口径；示例布局及默认逐子展开未因此获批。数据按实际发起会话分别累计，主会话自身不含子代理；子代理汇总含后代时每笔响应只计一次，主会话含后代总累计为这些自身消费的无重复汇总。展示布局及是否默认逐子展开由展示票承接，本票不实施 UI，也不宣称现有 framework 已交付逐子代理观察能力。

17. **业务聚合属于 model-cost shared logic，不升级为通用业务 State**：用户明确选择将聚合、最近 Round 快照及本次针对统计特性作出的 tradeoff 放在 model-cost shared logic，不作为通用 framework 能力；Round、读取 response／usage 等宿主事实由 harness-independent 接口提供，adapter 映射宿主。接入其他 harness 时复用同一业务逻辑，不重写计价／聚合／最近轮次规则。既有 boolean 激活 State 继续承担激活职责，不充当业务容器；HTTP／文件及并发协调继续受地图既定三层归属约束，具体接口另票收口。本次不实现或认证 pi adapter。shared logic 不直接读取 OMP 原生 context／payload，UI 读取其只读业务视图，不建立第二套权威累计。

18. **不维护缺 usage 计数或补账记录，异常只打印提示**：用户确认修订 Q10：“可以，不需要记录计数，显示打印提示即可”。正常完成且有可用 usage 为支持范围内的正常路径前提，不是所有 provider 已认证的事实；正常成功却缺 usage 时报告／打印提示并跳过该份统计，不伪造 usage／零消费、不维护缺失计数或补账记录、不承诺以后补齐。失败／取消有可靠 usage 则累计，无 usage 则跳过并接受少计。UI 累计代表已取得用量的统计，不持续维护 usage 完整性标记。此修订收窄旧消费归属决议的缺 usage 持久记录／可靠补齐义务；并不取消正常有 usage 请求的归属与去重、旧轮子代理后续实际消费的正确归属、计费／额度／无统计口径区分。缺价格规则由下一项决定收口。提示的具体承载方式交展示／观察票，不擅自升级为阻断请求或弹窗。

19. **缺价格只影响对应费用指标，打印提示不保留补算状态**：用户确认 Q11；计费请求有 usage 但缺适用价格时仍累计 token，不追加费用、不猜价格，打印提示，不维护缺失计数或事后补算记录。Codex 参考费用缺价格不影响 token／额度功能，token-only／hidden 无统计口径不因没有价格报错。用户要求“未知／无统计口径”等已梳理概念继续作为文档领域知识，用于分析 extension 简化方案的边界，不因代码不实现对应状态而从文档删除；术语含义与本次运行时实现承诺须明确区分，业务术语与公共 framework 术语按现有多上下文 glossary 归属记录。

20. **通用概念归 framework glossary，具体架构取舍归 ADR**：用户要求框架记录 grilling 定义出的通用设计概念，extension 的 tradeoff 用 ADR 而非 glossary 承载。已在[framework glossary](../../../framework/GLOSSARY.md#facts-and-measurement-semantics)记录未知、无统计口径、确认零、指标完整性、已知小计；model-cost glossary 保留消费领域特化并引用公共定义。[model-cost 聚合架构 ADR](../../../docs/adr/0004-model-cost-aggregate-accounting.md)记录已确认局部选择与理由，不代替本票的最终 lighthouse，不把尚未确认接口当作既定实现。Glossary 解释是什么，ADR 解释为何选择及接受什么代价，概念不强制产生运行时枚举／计数／补账机制。

21. **移除修改预算功能，detail 仅内存**：用户明确修剪需求：“不再需要修改预算功能，detail状态只记内存，可以接受”。不再迁移数字／K／0 参数修改或重置 DeepSeek 自定义预算，不新增预算偏好持久化；既有上下文预算显示／告警及 DeepSeek 450K、Codex 272K 的固定基线不因移除修改入口而自动取消。detail 保留运行期内存状态，重载／重启恢复默认 brief，入口级 detail 作用域由下一项决定收口。/budget 名下 detail／holiday／clear 仍为保留功能，修改预算这个子功能的移除不等于整张命令票已无必要；后续命令名称与参数校验由命令票收口。该需求修订须由最终 lighthouse 交代，旧行为决议不改写。

22. **detail 为交互入口级内存偏好**：用户确认 Q13；同一个交互窗口／CLI 的展示实例内，普通会话切换与 /tree 保留 detail，重载／重启恢复 brief；其他独立交互入口不受影响，不按账户共享，不按每个会话持久化偏好，也不是子代理继承的消费业务状态。具体 harness 展示实例如何绑定由装配票收口。

23. **自身累计是唯一消费聚合源**：用户确认 Q14；以实际会话 × 账户 × 模型组织自身 token／费用累计，父子启动关系提供自身／子代理／整体汇总依据，UI 只读派生业务视图，不持有另一套权威累计。请求关联暂存、当前／最近 Round 快照、账户状态与入口 detail 分开；不将子代理消费复制为父会话自身消费，不把父含后代汇总和子自身累计重复加入账户。此为逻辑布局，不决定物理文件 schema、保存等待／锁／失败策略或请求关联清理寿命，不新增逐 Turn 持久化。

24. **请求详情与去重标记分离，仅运行期保留**：用户接受 Q15；在途请求保存实际归属、模型与计价锚点，结束处理完成（累计或按缺失规则跳过）后释放完整详情，仅保留 sessionId + turnId 的已处理标记至本次观察实例销毁，不在 round_end 清空，不持久化、不按任意 TTL 淘汰。缺 usage 已跳过请求也视为已处理，不借此恢复补账机制；新调用使用独立身份。接受长运行实例的标记数量随请求增长。恢复仅读取已保存聚合，不扫描历史 assistant 消息重新收费；旧实例回调不得直接进入新实例，可靠 turnId 建立与实例隔离机制交观察票验证／收口。本决定不取消迟到子会话的新响应消费归原启动关系，也不决定存储发布幂等。

25. **父子启动关系随聚合保存并供恢复汇总**：用户接受 Q16，并强调这是沿袭此前设计，不是新增业务范围；保存子实际会话、直接父实际会话、启动父 Round 及区分启动实例所需关联身份，恢复后沿直接父链汇总已保存的自身累计，不猜 Owner／名称层级。不保存历史 Round／Turn 明细；父 Round 身份仅为归属标签。关系沿既定 round_end 聚合发布，不新增启动即落盘钩子；原子保存、读取组织与迟到发布时机交存储票。同一子会话若被复用到不同启动，不覆盖旧归属，具体分段按原生证据收口。

26. **clear 以当前主会话树为统计重置范围（已由 Q21 账户级范围替代）**：用户确认修订 Q17；清除当前主会话及全部子／孙会话的 model-cost 消费累计、Round 统计、业务父子关联与在途请求关联，不波及其他独立主会话。clear 前开始但未处理入账的请求之后即使返回可靠 usage，也因旧关联失效而丢弃，不重新绑定当前轮或猜补；此为主动放弃消费统计，不代表实际零费用。它明确修订 clear 范围内 Session 累计保留及旧请求迟到入账要求，不改变 tree／普通切换不回滚的规则。清理仅针对业务统计，不取消真实执行、不清 framework 生命周期／活动状态／Owner。原 Q17 跨周期 Session 累计保留方案未采纳。既有归档与 Codex estimate 不随本决定删除；是否为本次 clear 生成归档及 holiday 操作边界仍需收口。存储票须防旧缓存或排队保存复活已清记录，具体版本／原子机制未定。

27. **clear 后旧子代理的新请求正常统计**：用户确认 Q18；仍在执行的旧子／孙代理，clear 前开始的请求结束丢弃，clear 后新开始的请求从零正常计价／累计。根据 framework 仍可可靠取得的真实父子启动关系重建业务汇总关系，不恢复 clear 前消费、不永久排除旧子代理、不将原启动父 Round 冒充到达时当前 Round；新委派也正常建立关系。原生支持与 clear 跨越开放 Round 时的快照映射交观察／展示契约收口，不伪造 Round 生命周期边缘。

28. **clear 归档是保留需求，作用域重新评估中**：用户确认 Q19，强调归档本来就是需求；clear 前保存已取得的聚合，不等待旧在途请求或建立逐 Turn 明细。用户随后要求重新界定 clear 的当前会话／账户作用域及 resume 行为；Q20 不清 holiday 的建议未获批准。Q17 的已确认树级范围保留为待复审输入，未默改为账户级；不存在其他运行会话目前是讨论假设，不等于已删除多会话支持要求。旧版事实与实际隔离 smoke 见[旧 clear／resume 调查](../assets/old-clear-resume-smoke.md)：旧 Total 当前费率重估与周期落盘累计不是同一口径，旧 resume 不按当前价将历史费用重新落盘。

29. **仅保留账户级 clear，归档后重置活动周期**：用户确认 Q21，认为会话级 clear 意义不大；以目标账户为清理范围，归档其全部会话的活动聚合后重置，不再提供仅当前会话树的 clear。此范围替代 Q17，不影响其他账户，不删除已有归档或 Codex estimate；Q18 的旧在途请求丢弃／新请求正常统计原则应用到被清账户的消费，其他账户的关联不能顺带删除。当前讨论假设执行时只有一个开启 DeepSeek 的会话，不将此假设自动改为多会话支持取消或已验证的运行限制。账户归属、父子混用账户、旧缓存发布隔离与 clear 完成／失败由账户访问及存储票细化；Q20 holiday 仍未获新确认。clear 后 resume 是否在正常展示中读取旧归档累计，是下一待决问题；普通 resume 恢复活动聚合，不以当前模型价格重算宿主历史。

30. **resume 只恢复本账户周期的活动累计，旧消费查归档**：用户确认 Q22，不在普通恢复中自动合并旧归档或按宿主历史 token 重算；不额外维护跨周期 Session lifetime total，不默认新增归档查询命令。Session 累计指实际会话在适用账户当前统计周期内、跨该会话各 Round 的消费；Round 累计指该周期内归属于某一个 Round 的消费，不是该会话整个周期累计。两者均受目标账户上次 clear 边界限制，不把账户周期改成 framework Round 定义；父子及不同账户仍分别按其可靠归属聚合。clear 前在途请求丢弃、后续新请求正常统计继续沿既定规则；开放 Round 跨 clear 的具体快照映射仍待观察处理收口，不伪造新生命周期。已同步 model-cost glossary 的账户统计周期与 Session／Round 累计词义，具体清理／归档策略仍由决策票及 ADR 承载。

31. **holiday 持续到该账户成功 clear 为止**：用户确认 Q23；沿用账户共享、跨重启的 holiday，目标账户成功 clear 时同时关闭，后续请求恢复正常峰谷锚价；无消费可归档时也能通过 clear 结束 holiday。不影响其他账户，不追溯重算归档，不清 Codex estimate 或入口 detail；clear 前在途请求按既定丢弃规则处理。此决定替代未获批准的 Q20 不清 holiday 建议。归档／重置／关闭 holiday 的一致性、失败与反馈交存储／命令票，不默认操作必成功。

## 新对话交接

- **当前正在本票收口。** 本票仍 claimed，由 hugos（本会话 agent 协助）认领，已确认到 Q23；准备 Lighthouse 草案供用户确认，确认并写文档前不得 resolved。不恢复观察票旧 Q10、不新建重复数据票。
- **最新进度**：上方当前有效决定是唯一恢复基线，已确认到 Q18：clear 重置当前主会话及全部后代的统计，不波及其他独立主会话；clear 前在途请求丢弃，仍运行的子代理在 clear 后新请求正常统计并重建真实关系。自身累计、运行期去重寿命与父子关系保存沿用 Q14–Q16。本票仍 claimed。Q19 归档需求与 Q21 账户级 clear 已确认，账户级范围替代 Q17 的会话树级范围，不提供会话级 clear；Q22 已确认 resume 仅恢复本账户周期累计，clear 前旧消费只在归档中查阅，不维护跨周期 Session 总数；Session 跨本周期各 Round，Round 仅该轮，两者不混同。Q23 已确认 holiday 持续到目标账户成功 clear，无消费时也可 clear 关闭；Q20 不清 holiday 建议未采纳。现准备 Lighthouse 草案确认，未 resolved。先读旧 clear／resume 调查资产，不把 UI Total 重估当落盘补账，不把普通 resume 当默认从零；物理 schema、可靠身份与实例隔离实现仍交各对应票。不重问聚合还是账本、逐 Turn 还是逐 Round 落盘、是否允许异常退出未落盘损失、是否保存历史轮次、/tree 展示、子代理是否独立累计、通用 State、缺失 usage／价格计数或预算修改；这些已作明确取舍。历史 Comments 中未采用提案与旧暂停入口只供溯源。
- **下一步不是继续扩展边界状态，而是把选定方案变成最小数据布局／读写草图**：先列明 shared logic 的运行态（实际会话累计、当前请求锚点／关联、父子启动关系、当前／最近轮快照、账户读数缓存、入口 detail）与持久化聚合的字段归属。区分已确认字段寿命与候选物理 schema，不把候选图当作新决定。逐响应计算／内存累计与 round_end 发布分开；UI 只读业务视图，不持有另一套权威。
- **已定逻辑布局与后续交接**：实际会话 × 账户 × 模型自身累计为源，父子启动关系持久化供恢复汇总；在途详情结束处理后释放，已处理身份仅内存保留至观察实例销毁；当前／最近 Round 与账户当前周期视图分开。最新余额／双窗口读数按账户仅内存，holiday 与 quota estimate 按账户持久化，clear 归档／重置目标账户并关闭 holiday，detail 为入口内存。物理 schema、锁／原子保存／失败、账户身份取得、原生关联／清理实例隔离、刷新与展示分别交既有存储、账户访问、观察、刷新及展示票；这些不冒充已实施，也不反向重新要求完整账本。
- **用一条具体正常数据流检验草图**：主会话两份响应、一次子代理委派分别累计，Round 结束保存最近快照与累计，恢复只读已保存聚合；/tree 仅使 Round 展示不可用、Session 不回滚。确有必要缺口时才提出取舍，不先为所有假设场景搭恢复系统。取消／缺 usage 的跳过规则不重问；同账户多会话正确性仍是必要要求。
- **后续顺序不变**：本票数据归属／寿命／查询收口 → [存储与协调](06-local-storage.md) → [观察处理约束](03-observation-contract.md)，随后刷新、展示与装配按依赖推进。保存等待／失败、原子发布、跨进程锁、迟到子消费发布时机属于存储票；不要重新泛问整个 callback 同步／异步。普通正常离开不预建额外保存钩子。
- **文档分工**：[framework glossary](../../../framework/GLOSSARY.md#facts-and-measurement-semantics)定义通用概念，[model-cost glossary](../../../extensions/model-cost/GLOSSARY.md)定义业务特化，[聚合架构 ADR](../../../docs/adr/0004-model-cost-aggregate-accounting.md)记录已确认局部 tradeoff。ADR 不表示整票结案，也不是最终 lighthouse。旧 lighthouse 不改写；最终本票 lighthouse 须交代历史查询、缺失记录／补齐与预算修改的修订范围。
- **证据与验证边界**：[旧聚合粒度](../assets/old-accounting-granularity-smoke.md)、[tree 聚合探针](../assets/omp-tree-aggregate-smoke.md)、[请求观测链路](../assets/omp-request-observation-smoke.md)、[子代理归属](../assets/omp-subagent-round-findings.md)、[旧等待／刷新行为](../assets/old-observer-waiting-smoke.md)是既有事实资产，不是新 shared logic／framework 接口已实现的证明。本次只讨论、修改文档及运行文档链接检查；无生产迁移、远端账单认证或新增完整恢复／并发验收。
- 整票完成时才确认 lighthouse 草案、写文档、resolved，再执行 backtracer；此次暂停不走结案程序，地图 Decisions so far 不追加未结案票。

## Discussion approach

- 用户进一步要求从旧实现演化出的取舍重新评估“按 Turn 记录”是否值得。此前需求与局部决定是 review 输入，不是不能挑战的实现前提；正式替代仍需明确确认和 lighthouse，历史决议保留。先以最低必要记录粒度比较方案，不预设全面逐 Turn 持久化。
- 用户要求修正原先“先冻结观察接口、再决定数据／存储”的讨论顺序。本票先以旧实现的实际数据结构与读写调用链建立心智模型，再比较具体新数据布局；不要求用户在看不到数据放在哪里／谁读写的情况下选择同步／异步。
- 先走通一条可观察 Request：开始固定身份／锚价、完成取得 usage、Turn／Round／Session 视图读取、账户统计持久化。逐步标出哪些操作只是内存读写，哪些读取文件、等待锁、发布文档或请求远端；再讨论取消／重发和恢复。
- [请求观测讨论](03-observation-contract.md)已确认的需求与[OMP 原生请求链路证据](../assets/omp-request-observation-smoke.md)为输入事实，不要求整票已结案才能建数据模型。公开载荷、State 接口和具体同步／异步实现若需修订，带原因返回相应票获用户确认，不默改已确认决定。
- 可先用具体数据布局／伪代码／隔离数据流探针解释候选实现，不交付生产迁移，也不先造新 State 抽象。装配的草图前移作为讨论材料，最终组织／装配规格仍留原票收口。
- 数据归属、寿命与查询方式明确后，[存储协调决策](06-local-storage.md)决定介质与写入／恢复机制；之后再回[观察契约](03-observation-contract.md)决定处理约束。刷新调度不在观察票抢先冻结。

## Question

**当前实现起点：以聚合为主，先验证具体极端场景。** 用户已选择参照旧实现的聚合方案作为基础；只有该方案不能满足实际场景时，才讨论是否升级记录粒度，而非默认长期逐 Turn 明细。用户举例 /tree：Session 累计能正常保留即可，对应历史 Turn 累计可能无法取得可以接受。具体持久化介质、写入时机、有限关联范围与历史 Round 视图的正式替代范围仍待具体实现论证，不由此自动取消所有此前功能。先区分逐响应计算／累加、运行期请求关联、持久化逐 Turn 历史三件事；用旧代码与具体场景比较聚合统计、有限记录和完整明细的成本收益，再决定记录粒度／寿命，以及哪些既有需求需要修订。没有确认粒度前，不先固定 TurnRecord schema、通用账本、State 扩展或同步／异步写入策略。

依据[行为契约决议](../lighthouse/01-behavior-contract.md)，哪些数据进入 framework State，哪些是扩展自有业务数据／缓存／派生展示结果？逐项覆盖最新余额、5h／7d 窗口读数与获取时间／加载／错误状态、Turn usage/cost、Round totals、Session totals、预算／detail／holiday 及 quota estimate。仅存内存不等于不属于 State；明确类型、归属、读写接口及恢复／继承语义，不能把当前 boolean activation 字段当业务容器。

当前已决定不升级通用业务 State：model-cost shared logic 拥有业务聚合，framework 激活 State 不充当业务容器，UI 只读同一业务视图。余下问题是最小数据键／字段与查询路径、运行期有限身份及父子关系的保留／恢复，不重新设计完整账本或缺失计数；最新远端读数仅内存、累计／归档／holiday／quota estimate 的既定寿命保留，预算修改已移除、detail 为入口级内存偏好。存储票决定物理格式与保存完成／失败／协调，刷新票决定调度；本票不设计 TTL、不迁移代码。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：上下文、账户、消费三个维度正交；Owner activation／State 继承不能作为消费归属。源消费记录与当前统计视图区别明确，tree 只选择 Round 视图而不回滚 Session。
- 待决定：请求／逐代理记录、父子关系、账户聚合、选定 Round、自身／含后代汇总及查询入口，哪些是业务事实、持久化数据、State 当前值或派生结果？原始未知不能被汇总零覆盖，未知／额度消费／无统计口径可同时表达，token 与金额完整性分别声明。
- 当前账户余额／窗口缓存与请求绑定身份分开；最新读数仅内存，estimate 按账户持久化。当前模型不应改变历史记录或消除异构子代理信息；不把全部历史账本无论规模都塞进 activation State.

## Comments

### Q17 修订提议：clear 作为统计重置边界（待确认）

- 用户为简化提出：clear 清除当前父／子／孙统计记录和在途请求关联；之后旧请求找不到对应身份则直接丢弃，不再按旧锚点累计。用户尚未确认精确作用域、是否保留既有归档、Codex estimate 及其他独立主会话的影响，不把提议视为正式取代所有历史累计约束。
- 此提议针对 model-cost 业务记录；不等于取消真实请求／子代理或清空 framework 的 Round、活动状态、Owner／宿主事实。观察票需保证旧请求结束不会因缺关联被重新绑定当前轮，clear 后新请求与新委派仍可建立可靠归属。
- Q17 原“Session 累计与账户周期贡献分离”建议未获批准；先明确用户提出的重置边界，再决定是否还需要分段聚合。不提前批准会话累计永不受 clear 影响。
- framework glossary 已有 Parent agent／Owner／State inheritance；本次补齐通用的子代理启动关系与会话祖先链，定义不承载统计删除、持久化字段或 clear 策略。


### 恢复讨论：聚合数据流与恢复缺口（2026-10-09）

- 沿观察票与地图最新交接认领本票；观察票仍受本票及存储票阻塞，不恢复旧 Q10 同步／异步提问。
- 重新核对旧 daily-tracker 的 DailySession／DailyData、ensureSession／recordTurnCost，以及 index 的 onInit／请求／响应／结束处理：运行期费用累加器仅内存，旧原生 agent_end 取出后在锁内重读共享文档，追加费用并以已保存 session token 基线计增量；onInit 清空累加器，不从 token 反算未保存的历史锚价费用。
- 本次 Bun 直接运行旧 turn-cost／cost-calc 纯函数：100 万峰价 input 得到 chargedBeforeSettlement=9，freshRuntimeCost=0，initFinishTurnReturns=9，afterInit=0。证明内存重建／清空不能恢复未保存费用；没有运行实际宿主重启、文件发布或账户并发，不作为持久化实现认证。未创建探针文件。
- 待讨论候选（未批准）：按 session／账户／模型保存 token、已算费用和完整性聚合检查点；当前 Turn 锚点与当前 Round 累加留在运行期，正常恢复读取已保存聚合，fork 新会话从零开始，tree 不回滚。在途关联、迟到补齐与有限去重仍待具体场景验证，不假定这些可一并丢弃。介质／写入调度留存储票。
- 下一问题聚焦保存目标：已取得 usage 并完成计价的响应是否应成为可恢复聚合的最小更新单位，而不是等 Round 结束。响应后／发布前崩溃仍是未决窗口，不将“每响应更新”写成绝不丢失保证；写入等待、合并与原子性尚未批准。

### 首要取舍重审：逐 Turn 留存是否值得（2026-10-09）

- 用户指出此前设计主要从“框架怎么设计”出发，未充分检验旧代码演化中的复杂度取舍；尤其应综合评估是否为准确性引入逐 Turn 记录。此为重审要求，不是已批准取消全部请求身份、历史查询、补账或并发正确性。
- 已将记录粒度设为本票第一问题；不预设长期逐 Turn 明细账。区分逐响应计价、运行期关联和持久化留存，再逐场景验证最小必要数据。
- 事实资产：[旧计价累加与逐 Turn 留存粒度调查](../assets/old-accounting-granularity-smoke.md)。直接运行旧计价函数：两份峰／谷请求费用 9+4.5=13.5 元，无逐 Turn 历史留存；按谷价重算合计则为 9 元。证明这个准确性场景不需要长期明细，不证明全部异常／恢复需求可由旧方案满足。
- 候选范围为聚合为主、聚合加有限关联／索引、完整逐 Turn 明细；收益与复杂度按真实场景比较，不立刻要求用户选择数据 schema 或同步／异步读写。历史已结案决定保留，实际替代须明确确认后记录 lighthouse；本票仍 claimed，未 resolved.

### 用户选择聚合为主及 tree 场景验证（2026-10-09）

- 用户确认以旧实现“聚合为主”为基础，先验证极端场景，不能适配时再取舍是否升级；按照具体实现所需最小能力扩展 framework，不从框架完整性反推业务结构。
- 用户明确 /tree 场景的优先级：Session 累计正常即可，可能获取不到历史 Turn 累计可接受。不将这一让步自动扩大到所有 Round／Session／账户数据取消；旧 UI Turn、新 Turn 与历史 Round 的正式规格修订需精确描述。
- 运行证据：[OMP tree 切换与 Session 聚合累计探针](../assets/omp-tree-aggregate-smoke.md)。真实 18.5.0 导航到历史响应使可见 assistant 数从 2 变 1，宿主 Session tokens 保持 60；从该位置继续请求后为 120。只保留标量聚合、调用旧锚价／计价函数的金额也保持不变并增加新消费，无 extension Turn 明细。不是新 framework／持久化账户账本已实现。
- 下一步按实际场景检查恢复、fork、在途／取消、多会话同账户等，每次先找最小实现的具体缺口，不要求一次性建立完整审计账本。框架能力从实现读写链倒推；存储介质与同步／异步仍未冻结。本票继续 claimed。

### 本次暂停与新对话交接（2026-10-09）

- 用户要求保存当前对话的决策和思考方向，在新对话继续。已整理前部“当前有效决策与思考方向”和“新对话交接”，明确聚合实现起点、tree 让步、实际代码证据、未决项与禁止重问的抽象异步选择。
- 释放本票认领为 open、Assignee 清空；整票未解决，不作 lighthouse／backtracer 结案，不重写旧决议，也不将请求记录重审解释为所有相关功能已取消。
- 下次明确恢复本票，先认领，再展示具体聚合状态／保存路径并验证恢复场景；不要机械按编号回到尚有未满足前置的观察票。

### 用户确认按 Round 批量落盘（2026-10-09）

- 用户明确认为旧方案可近似理解为 Round 前内存累计、结束落盘，并选择新框架每 Turn 按实际 response 计算、round_end 触发落盘，认为此方案足够。已记录为当前有效方向；逐响应持久化的建议不采纳。
- 精确差异保留：旧 handler 对每个原生 agent_end 发布且不检查 willContinue；新方案使用已确认的 framework Round，自动续跑／等待子结果可能拉长内存累计阶段。
- 此轮尚未将该选择扩大为用户已确认所有崩溃损失、切换清空或写入失败策略；随后用户明确接受下述异常退出边界。保持无生产实现、无最终 lighthouse、未 resolved。

### 用户确认异常退出损失边界（2026-10-09）

- 用户回答“接受”：强杀／崩溃时尚未成功落盘的 Round 内存消费可以丢失；恢复只读取已成功保存累计，不按当前价格猜补，不为此增加逐 Turn 持久化或崩溃恢复日志。
- 曾建议正常退出／切换／重载前额外排空；用户指出正常动作通常发生在 round_end 之后，质疑是否值得增加复杂度。助手撤回额外排空建议，用户回答“接受”，确认不预建独立生命周期保存钩子，以 round_end 统一触发保存为基线；只有实际宿主路径暴露不能接受的必要缺口才重新提出取舍。正常动作都在 round_end 后的判断尚不是全部宿主路径已验证的事实；落盘触发不等于已成功保存，写入完成／失败语义仍留存储票。

### 用户确认逐子代理聚合与最近 Round 快照（2026-10-09）

- 用户回答“Q4 可以，子代理单独累计”，明确逐子代理自身消费统计，不靠父 Round 合计近似。依据已有子身份／直接父关系／启动关联调查，不宣称现有 framework 已实现。
- 用户决定“可以只记录最近一round的开始结束值，不需要保存历史数据”。确认不保存历史 Round 列表，最近一轮用开始／结束累计差值表达；Session／账户累计与逐代理统计保留，不将“没有历史数据”扩大为删除账户归档或 quota estimate。
- 用户随后确认“可以，随 round_end 一起保存，这是一个近乎免费的优化”：最近 Round 开始／结束累计快照与累计同次持久化，仅覆盖最近轮次，不新增发布频率。已记录为当前有效决定。
- 原 Q6 提议新 Round 开始后切换至当前轮累计；用户指出 /tree 后无条件展示最后一轮会误导。修订 Q6 为 /tree 后隐藏 Round 数值或明确不可用，Session 累计不回滚，实际开新轮后恢复展示；用户回答“可以”。已记录为当前有效决定，不将原 Q6 的所有细节当作获批。
- 用户追问正常 resume 是否保证位于最近一轮。固定 OMP 18.5.0 session-manager 源码：rebuild 按物理 entries 重建 leaf，branchWithSummary 在选定历史节点下追加导航条目；恢复最新物理条目不等于最近模型活动位置。
- 本次 Bun 实际调用固定基线 SessionManager.open + MemorySessionStorage，两个合成无崩溃会话文档：普通文档 leaf=latest、branch=[old,latest]；追加历史位置 branch_summary 后 leaf=navigation、branch=[old,navigation]，不包含 latest。断言通过。验证真实会话加载器／内存存储，不是 /tree RPC/TUI 或新 model-cost 恢复链路；无磁盘探针文件、无远端模型。
- 因此“排除错误退出”仍不足以证明恢复位置对应最后消费轮次。此时 Q7 的恢复展示规则尚未获批准；若要求自动确认可讨论最近轮结束位置标识的单条关联，不能预先添加历史位置索引。整票仍 claimed，尚不执行结案 lighthouse／backtracer。

### 用户确认最近 Round 的恢复描述（2026-10-09）

- 本对话用户回答“可以，最近round是准确的描述”，确认恢复后已保存快照明确描述为最近 Round，不声称对应当前位置。实际开新轮显示当前累计，结束后成为最近 Round；/tree 后仍按已确认规则不可用。该决定不否认上述恢复位置调查事实，也不要求追加位置索引。
- 已追加当前有效决定；此前“Q7 未获批准”仅作为确认前历史，不能覆盖本次用户确认。当时整票仍 claimed，未执行最终 lighthouse／backtracer。

### 本次暂停：确认入口级 detail 并保存新对话交接

- 用户确认 Q13 入口级 detail 偏好，并要求记录当前决策与思考方向后在新对话继续。本票当前有效决定已更新，交接段替换为本次实际进度，清除旧的已解决问题仍“待确认”的措辞；历史讨论保留。
- 新对话先恢复本票并认领，从最小数据布局／读写草图和有限关联机制继续，不回观察票旧 Q10、不重问已确认聚合取舍，也不开始生产实现。框架通用概念、业务 glossary、聚合 ADR 与证据资产均有链接。
- 同步地图恢复指针、命令票预算裁剪／detail 作用域及存储票的最新数据交接。整票未结案，释放为 open、清空 Assignee；不生成最终 lighthouse、不设置 resolved、不追加地图 Decisions so far、不执行 backtracer。

~~~~~~~~

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
- 2026-10-09 用户要求重新评估“按 Turn 记录”的成本收益：逐响应计价／累加、运行期关联与长期明细留存不是同一要求，不把完整逐 Turn 账本或准确性最大化作为默认迁移目标。数据讨论先用旧代码和实际场景验证最小必要记录粒度；此前决定可据此提出修订，但未确认的修订不改变当前有效契约；已确认修订按用户要求同步旧 Lighthouse 与决策票正文，修订前版本保留历史快照，不自动缩减其他功能。
- 2026-10-09 用户要求纠正讨论顺序：先用旧源码、具体数据结构和一条端到端数据流建立实现心智模型，再讨论逻辑／接口取舍；未说明数据在哪里、谁读写、何时持久化前，不泛问同步／异步。当前先做数据归属／寿命／查询，再做存储与协调，随后收口观察处理约束和刷新调度。装配草图可以提前作为讨论材料，最终装配规格仍在契约明确后收口。保持地图规划模式，可用隔离探针支持决定，不做生产迁移。
- 每次咨询 grilling、domain-modeling；设计接口咨询 codebase-design；决策落地依次使用 lighthouse、backtracer。HITL 决策须由用户确认。每次工作只解决一个非 research 决策票，chart 会话不关闭票。
- [现状调查与功能证据](assets/current-state.md) 是事实资产，不是已批准的契约。它也记录调查 smoke 的实际输出；远端余额／额度、动态 TUI、完整 OMP 原生链路均未在本次调查运行。
- 框架当前仅实现 OMP adapter，支持基线为 18.5.0；本机安装版本不等于支持基线。迁移验收版本是否改变必须显式决定。
- 子票存放于 decision/；按编号扫描 open、无未满足依赖、未认领的票选 frontier。开始工作前先写 Status: claimed 和 Assignee。开放票不在地图正文重复列出。
- [数据归属与账户周期决议](lighthouse/12-state-data-contract.md)已正式结案；最终取舍与历次暂停溯源只在 Lighthouse。后续按已定数据流推进存储与协调，再返回观察处理约束；不重问聚合／明细账、不恢复观察票旧 Q10，不把本票结案视为存储或原生观测已实现。继续工作时按 tracker 查询 frontier，或使用用户明确指定的票。

## Decisions so far

- [完整保留哪些业务行为，统计单位如何命名？](lighthouse/01-behavior-contract.md)：保留请求锚价、公共 Turn／工具／Round 与 Codex 额度功能；当前有效功能清单已同步数据决议的聚合、账户周期及预算修改移除。

- [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](lighthouse/02-accounting-ownership.md)：实际会话／账户／父子聚合与正常去重并发正确；本周期累计不随 tree 回滚，缺失不补账、最近轮及账户 clear 边界已同步最新决议。

- [model-cost 的哪些数据进入 framework State，如何声明与读取？](lighthouse/12-state-data-contract.md)：扩展自有逐响应聚合与最近 Round 快照、有限内存去重；累计限于账户当前周期，账户级 clear 归档重置并关闭 holiday，resume 不重算历史或合并旧归档。

- [framework 如何提供独立存储、原子更新与跨进程协调？](lighthouse/06-local-storage.md)：单活动 JSON／独立归档与 estimate、唯一聚合／最近轮；提前异步保存并在 handler 返回前等待，轻量 FIFO／跨进程互斥、周期／版本校验、默认协调等待 15 秒；普通消费保存失败丢弃未保存部分、从磁盘有效快照初始化，不重试补账并接受少量损失；clear 只归档已保存数据、不排空内存，先归档后提交、失败终止；无有效基线暂停统计至下一次初始化；用户级共享、storageDir 可配置，~/ 特指用户 .omp 主目录，初始 ~/cost-archive 复用旧目录，由用户切换前手动备份清空、修改重启；固定 consumption.json、独立 codex-usage-estimate.json 与 archives/；本机本地文件系统同机跨进程共享已确认，不承诺网络盘／云同步跨机器写入；framework 通用文件能力（规范化路径协调键、锁文件互斥、锁内重读、临时文件 rename 原子发布、损坏不覆盖、陈旧锁回收且不静默覆盖）、读新鲜度以锁内读为准不做每请求读取、consumption.json 最小 schema 与 UUID 归档、同会话多执行者靠版本冲突收口均已确认。

- [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](lighthouse/03-observation-contract.md)：部分确认连续活动 Round、Turn 开始／结束与固定事实；本轮收口轻量内存处理、framework 身份、不补账、无法关联／冲突丢弃与局部清理；原生关联与可信来源仍未完成。

- [/budget 的参数、操作与状态如何在新框架表达？](lighthouse/07-command-state.md)：仅确认 clear 在当前入口 Round 中拒绝、不延期排队，结束并保存收口后可执行；其他命令问题未决。

## Not yet specified

- 原生宿主缺失某个观测或账户能力时，哪些可降级、哪些需拒绝，以及诊断如何与原有 widget 错误语义衔接，待契约明确后展开。
- 本次新增通用能力对 connect-bot 等既有消费者的复用或收口影响，需在接口定型后判断哪些是本次调用方迁移义务，避免制造第二套机制或扩大业务范围。

## Out of scope

- 多台机器通过网络共享盘／云同步共同写入统计的正确性保证、分布式锁或同步冲突合并；[本地协调范围决议](lighthouse/06-local-storage.md)限定本机本地文件系统，不取消同机多进程安全共享。

- 实现或认证 pi adapter；只考虑契约是否把 OMP 原生细节泄漏给共享代码，不宣称 pi 能力对等。
- 导入旧统计、继续旧基线或要求新旧统计文档双向兼容；用户允许从空统计开始，旧数据保留。
- 图内执行生产迁移；决策规格完成后进入独立 implementation 工作流，整体迁移目标不取消。
- Codex 会话消耗与账户额度之间的转换或分摊；[消费归属决议](lighthouse/02-accounting-ownership.md)确认不做此换算，账户级双窗口／ratio／left 与参考费用继续保留。

~~~~~~~~

## docs/adr/0002-semantic-extension-framework.md

~~~~~~~~markdown
---
status: accepted
---

# Harness-independent semantic framework as shared in-repository source

> **Terminology updated 2026-10-08** by [ADR-0003](./0003-harness-terminology.md): the host program
> this framework adapts to is a **harness** (formerly "agent runtime"), and the repository's shared
> test rig is the **harness dock**（short `dock`, formerly `tests/harness/`). Where this document
> keeps the word "runtime", it means only the run-time sense — for example `runtime-exercised` or
> the `runtime parameter` — never the host.

For the initial, single-maintainer use case, maintain one framework source tree in `my-agent-toolkit/framework/`. Extensions import this source directly rather than consuming a separately published framework package, so framework and extension logic can be edited and debugged together. Each extension retains one shared behavior definition and one shared TypeScript implementation, with thin pi/oh-my-pi entrypoints selecting the respective adapters. An entrypoint copied without the source tree and required dependencies is not a supported standalone artifact. This supersedes the independent harness-package deployment decision; standalone extension generation also remains deferred. Avoid building a code generator before shared semantic behavior has been exercised on a real harness; the first release exercises the OMP path and does not implement the pi adapter.

Keep the semantic core separate from reusable behaviors, feature templates, and harness adapters, so common functionality can be configuration-only without moving all feature-specific business logic into the core. Own the event contracts while choosing names close to pi terminology to ease migration. If future distribution requires independent harness artifacts, bundling or generation can be added later without maintaining duplicate feature logic. That future option is not part of the initial deliverable; arbitrary edits to such artifacts would be independently maintained rather than merged back into framework-managed sources.

This chooses direct source debugging and atomic framework/extension changes in one repository over independent package releases and standalone installability. The tested repository revision and dependency lockfile identify the deployed source combination. An actual installed harness loader must be exercised with an entrypoint importing extension and framework TypeScript from outside its discovery directory before claiming the organization works; the first release exercises the OMP loader, with the pi loader deferred. Direct source imports do not imply automatic hot reload or working source breakpoints; reload/cache behavior and debugger mapping require their own verification.

## Repository ownership and migration references

The framework's authoritative design and implementation live in my-agent-toolkit. The original independent extensions remain in [my-omp-toolkit](../../../my-omp-toolkit/), which is the source of existing business contracts, proven implementations, and selectable rollback baselines. Replacements are developed here incrementally; this document's source layout describes the target, not a migration already performed.

Maintain one authoritative document for each fact. Framework architecture decisions belong here; terms belong in [GLOSSARY.md](../../framework/GLOSSARY.md); harness observations and integration evidence belong in [harness-support.md](../../framework/docs/harness-support.md) and its linked research; unresolved work belongs in the [framework backlog](../../framework/docs/semantic-extension-framework-backlog.md). Other documents link to the owner rather than maintaining another policy or schema copy. my-omp-toolkit remains an independent extension repository and does not retain framework documents or migration pointers. References are one-way: my-agent-toolkit may consult my-omp-toolkit, but the original repository does not need to know about this framework.

| Subject | Authoritative source |
| --- | --- |
| Existing extension behavior and business terminology | Original extension documentation, including [codebase-tools](../../../my-omp-toolkit/extensions/codebase-tools/README.md) and its [glossary](../../../my-omp-toolkit/extensions/codebase-tools/GLOSSARY.md), and [model-cost](../../../my-omp-toolkit/extensions/model-cost/README.md) and its [glossary](../../../my-omp-toolkit/extensions/model-cost/GLOSSARY.md) |
| Existing codebase-tools contribution requirements | [Original ADR-0001](../../../my-omp-toolkit/docs/adr/0001-codebase-tools-extension.md); the number refers to that repository, not a missing local ADR |
| Original implementation and concrete persistence contracts | The relevant my-omp-toolkit source and documents at the baseline selected for each migration; do not copy their schemas into framework documentation |
| Refactoring progress and acceptance/rollback evidence | Each replacement's migration work in my-agent-toolkit, referencing its original contract and selected source revision rather than restating the business specification |

Migration is per independent extension. A selected original implementation and its replacement must not both be active. During transition, loading may select old and new implementations for different extensions; for the first release, simultaneous activation of one extension's original and replacement is prevented by load-source mutual exclusion (an explicit-only root during development/acceptance, and removal of the superseded implementation before the permanent cutover), and this migration does not change installed harness configuration. Persistence and round-trip verification requirements have their single decision record in [Persistence compatibility for reversible extension migration](#persistence-compatibility-for-reversible-extension-migration).

Cross-repository source links assume sibling checkouts named my-agent-toolkit, my-omp-toolkit, pi, and oh-my-pi. Links to local sources identify where to inspect; historical investigation versions remain in the harness baseline, and future migration acceptance must identify the original source revision actually verified.

## Source organization and harness discovery

### Target directory layout

```text
my-agent-toolkit/
  framework/                    # One shared framework source tree
    core/
    behaviors/
    adapters/
      pi/
      omp/

  extensions/                   # Independent extension implementations
    codebase-tools/
      definition.ts             # The declaration shared by every harness assembly
      shared-logic/             # Harness-independent shared logic (everything outside harnesses/)
        prompts.ts
        prompts/
          init.md
          reminder.md
      harnesses/
        pi.ts                   # Harness assembly and harness-specific implementation
        omp.ts
    connect-bot/
      definition.ts
      config.yaml
      shared-logic/             # Grouped by concept: panel/, session/, command/ (plus shared seams)
        panel/
        session/
        command/
      harnesses/
        omp.ts
    model-cost/
      definition.ts
      shared-logic/
      harnesses/
        pi.ts
        omp.ts

  entrypoints/                  # Only discoverable extension entrypoints
    pi/
      codebase-tools.ts
      model-cost.ts
    omp/
      codebase-tools.ts
      model-cost.ts

  package.json                  # Shared third-party dependency declarations
```

The named extensions illustrate the layout, not completed migrations or certified harness support. An extension's harness-independent code lives under `shared-logic/`, grouped by concept when it is large enough to need it; `harnesses/` holds the harness assemblies and is the only native access; `definition.ts`, `config.yaml` and the extension's own docs stay at its root. Do not create unused files merely to match the diagram. In the first release only codebase-tools and connect-bot are migrated, only their OMP assemblies are implemented, codebase-tools' behavior is declared in its definition rather than a large logic file, and the pi adapter and the model-cost migration are deferred.

### Harness loading and source dependencies

```text
pi  scans entrypoints/pi/  -> independent pi extension entrypoints
OMP scans entrypoints/omp/ -> independent OMP extension entrypoints
                                      |
                                      v
                         extensions/<extension>/harnesses/<harness>
                           |                         |
                           v                         v
                  shared extension logic     framework/adapters/<harness>
                           |                         |
                           +------------+------------+
                                        v
                            shared framework interfaces
                           (semantic core and behaviors)
```

Arrows represent loading/import dependencies, not shared in-memory State or the order of all harness events. Both harnesses use the same framework source tree and shared extension source; only the selected harness assembly and native integration differ. Actual loader resolution, reload behavior, and debugging remain deployment verification requirements.

Keep framework source in `framework/`, with semantic core, reusable behaviors, and harness adapters separated internally. Keep each independent extension's shared definition and logic plus its harness-specific implementations in `extensions/<extension>/`. Provide separate discovery roots `entrypoints/pi/` and `entrypoints/omp/`, each containing one thin entrypoint per supported extension. Configure each harness to scan only its own discovery root, not the shared implementation directories. Entrypoints import or re-export their extension's harness-specific assembly; they do not copy framework or business code and do not aggregate all extensions into one factory. Do not add a root `index.ts` that changes a discovery root into a single extension.

Extensions cross the framework's small public interfaces even though the code lives in the same repository. The framework must not depend on individual extension implementations, and shared logic must not import native harness types merely because both are locally available. Harness-specific code may use native capabilities directly. One source tree does not imply one harness instance or shared in-memory State between harness processes. This records the target layout, not a completed migration or a reason to create empty directories before implementation. The framework's small public interfaces are a stable contract surface and evolve additively; a non-additive change requires a new explicit decision in this document.

### Enforcement of the native boundary

The shared/native split above is enforced mechanically by [`tests/framework/import-boundary.test.ts`](../../tests/framework/import-boundary.test.ts). The test scans every `.ts` under `framework/`, `extensions/` and `entrypoints/` and puts each module in exactly one class:

- **Escape hatch** — `framework/adapters/**` and `extensions/<id>/harnesses/**`. Native access is permitted here and nowhere else.
- **Discovery entrypoint** — every module under `entrypoints/`. Each is a single re-export of its extension's harness assembly and nothing else, so reaching the escape hatch is what it is for, and the entrypoint assertion governs it.
- **Shared source** — everything else: the framework tree outside `adapters/`, and every extension module outside its `harnesses/` (conventionally under the extension's `shared-logic/`).

No module outside the escape hatch may **name** a harness package (`@oh-my-pi/*`, `@earendil-works/*`) — an import, a dynamic import and an ambient `declare module` alike — and shared source may in addition not reach an escape-hatch module by relative import. The harness package's ambient declaration therefore sits with the adapter (`framework/adapters/modules.d.ts`), beside the code allowed to import it.

The native escape hatch is exactly two locations: `framework/adapters/**` and `extensions/<id>/harnesses/**`. The check reads specifiers lexically rather than through an AST, and only from `.ts` files: it is an alarm for the ordinary crossing, and the principle above is what binds. `require(...)`, computed or concatenated specifiers, aliasing, and a non-`.ts` module sit outside it, so a green run does not establish the boundary — it means only that the alarm found nothing to contradict it. A case the alarm cannot see is decided by the principle, and a case it flags is fixed rather than exempted.

Widening the escape hatch, adding an equivalent bypass, or moving native access outside these two locations is a non-additive architecture change and requires an explicit decision in this document, not an implementation detail. The connect-bot migration fixed the extension-side allow-list ([decision 04](../../.scratch/connect-bot-migration/decision/04-interaction-native-boundary.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/04-interaction-native-boundary.md)) and restated the invariant in these terms ([decision 07](../../.scratch/connect-bot-migration/decision/07-effect-callback-capabilities.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/07-effect-callback-capabilities.md)).

### Responsibility test for harness differences

Different native implementations do not by themselves justify moving behavior out of the framework. Decide ownership by the semantic contract being upheld, not by whether the code contains harness-specific calls.

| Responsibility | Implementation location | Example |
| --- | --- | --- |
| Harness differences required to satisfy a framework-owned contract | Framework harness adapter, using the shared core where appropriate | Map native lifecycle events to semantic hooks; establish the supported subagent State relationship |
| Extension-specific native presentation or integration not promised by the framework | That extension's harness-specific implementation | Complex widget layout, native editor interaction, or a harness-only enhancement |
| Business rules that mean the same thing across supported harnesses | That extension's shared logic | Cost calculation, Holiday pricing, and extension-specific archival merge decisions |
| Native capability itself | Harness-owned implementation, called directly where needed | Native UI operations or subagent execution; do not mirror the entire native interface in the framework |

The framework owns State and other capabilities it defines; it does not automatically own every native operation an extension uses. Conversely, extensions should not each reimplement harness mapping for a framework contract. A harness-specific integration remains part of its extension, while a framework harness adapter is reused by all extensions. This placement rule does not exempt native calls from applicable history-preservation constraints.

## Scope map

The discussion covers nine areas: (1) extension definition/configuration and shared TypeScript logic; (2) control patterns, commands, and subfeatures; (3) semantic hooks and State orchestration; (4) State ownership, storage, restoration, archives, and shared-file concurrency; (5) ongoing work and lifecycle effects; (6) instruction contribution and mandatory history preservation; (7) basic status feedback driven by State; (8) harness adapters and declared version/capability support; and (9) framework verification as upgrade regression detection. This map records responsibilities and exclusions, not a claim that these modules or all five migrations have been implemented.

## Initial control scope

The control vocabulary covers configuration switches applied after restart, idempotent selection of a named mode, and command toggles alternating between two modes, but the first release implements only **command toggle**. Configuration switches, mode selection, mixed control such as the current Build/Explore/Debug interaction, and the remaining control kinds are explicitly deferred rather than implicitly implemented through the initial pattern.

### Extension configuration (additive; connect-bot migration, decision 05)

The connect-bot migration adds an additive capability for an extension's own configuration **values**, distinct from the deferred configuration-switch control kind: the framework reads a fixed `config.yaml` from the extension's source directory (`extensions/<definition.id>/config.yaml`, overridable by a declared `path`), parses it with the pure-JS `yaml` package (zero external dependencies, ISC) in the framework's harness-independent config module behind an injectable seam, and validates the required keys and primitive types the extension declares as plain data in its definition (`config.fields`). An invalid `config` declaration (non-object, a `fields` entry outside `string | non-empty-string | number | boolean | milliseconds`, or a non-string/empty `path`) and missing, unreadable, malformed, non-object, missing-required, or wrong-type content all refuse the binding the same way — the extension is not loaded and a `configuration` binding failure with violation kind `config` is reported on the non-model diagnostic channel; there is no code-level default fallback, the shipped file is the default. Values reach the extension's shared logic through a harness-independent `getConfig(definition)` read, so no harness assembly handles configuration; `readConfig(path)` and `ExtensionConfigError` are the config module's single read/parse/validate/throw surface. The convention path and any relative `path` are relative to the **configuration base directory** the extension's own assembly supplies as plain data — its extension-repository root — because the loader discovers an entrypoint by absolute path while the process runs in an arbitrary project directory; an absolute declared path is used as declared, and an assembly that names no directory leaves a relative path to be read against the process's working directory, as before that option existed. This is additive: configuration switches, mode selection, mixed control and the remaining control kinds stay deferred, and the same file is their intended future carrier.

### Directed control and per-field State lifecycle (additive; connect-bot migration, decision 02)

The connect-bot migration adds a second bound control kind, **directed** ([decision 02](../../.scratch/connect-bot-migration/decision/02-command-state-ownership.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/02-command-state-ownership.md)): a command that names its target state explicitly (`/connect-bot` = on, `/connect-bot off` = off), repeats its side effect on every invocation, and is never deduplicated or short-circuited by the framework — idempotence is the extension's responsibility. It is distinct from the deferred mode-selection, mixed-control and command-action kinds.

It also makes the State lifecycle **per field**, on three orthogonal axes:

- **Control kind** — `toggle` (existing) or `directed` (new).
- **Persistence** — `session-entry` (default: written to the owner's persistence medium, seeded from the target branch at session boundaries) or `memory` (never written and never seeded; an owner-identity change drops the value to the declared default, while navigation that keeps the identity preserves it).
- **Inheritance** — `follow` or `none` (default `none`: a subagent reads the declared default unless the field declares `follow`).

The framework's write authority is unchanged: the extension's handler runs before the framework records the value and owns the write, so a command can read the pre-invocation value. `memory` is the choice for a value that declares a live external effect, because a restored value does not prove the effect is running (see [State and recovery seam](#state-and-recovery-seam)).

## Shared behavior scope

Include activation and mode controls, state storage (in-memory values, harness-owned session entries, and extension-owned files), session state and restoration, and basic status feedback; the first release implements only the subset codebase-tools requires (activation toggle, owner-session-entry persistence, session restoration, and basic status feedback), leaving business archival, extension-owned files, and shared-file coordination to later releases. Storage is not limited to framework-declared switches and parameters: business history and archival are explicitly in scope, motivated by existing model-cost requirements; shared-file concurrency safety is also an explicit framework capability, while its precise interface and failure contract remain to be designed beyond the first release. Command actions and parameter settings are also suitable reusable subfeatures, distinct from mode transitions; their exact contracts remain to be defined beyond the first release. A command subfeature and its State/storage are orthogonal: `/budget holiday` is an idempotent command subfeature activating the persisted Holiday pricing flag, not a mutually exclusive submode, while quota-ratio data may be stored without becoming a command or mode. Storage choice does not by itself define state ownership or restoration semantics. The replacement persists its single activation value as `{enabled}` in a harness-owned non-LLM session entry via `appendEntry` (the original `{on, initInjected}` contract is not preserved), and derives injection progress from the active branch rather than a stored flag; it does not store that state in a separate extension JSON file. These state entries are distinct from LLM conversation messages, so the history-preservation guarantee must not accidentally prohibit them.

Include configurable instruction contribution, using readonly-mode's injection slots and mode-dependent rules as a starting point. The goal is to configure content and contribution rules instead of editing harness-specific hook code. For the first release, timing (one agent-run initiation per user turn), tail placement, persisted retention, and role handling (harness-qualified and recorded per provider path, not a developer-authority promise) are decided; the broader framework may generalize them later. Including instruction contribution does not automatically authorize arbitrary history rewrites or promise identical provider wire roles. See [prompt-injection research](../../framework/docs/research/prompt-injection-research.md) for the verified current behavior.

Do not include operation guards in the initial common behavior library: the current evidence is specific to `readonly-mode`, rather than a demonstrated shared behavior across the extensions. This does not remove its existing protection requirements or settle how it will migrate.

## Persistence compatibility for reversible extension migration

Framework-based replacements must strictly preserve each original extension's persistence contract so users can switch between the selected original my-omp-toolkit baseline and its replacement without data conversion, schema-version upgrades, backup restoration, or loss of intervening business data. Compatibility is bidirectional: the replacement reads original data, and the original implementation reads and continues updating data written by the replacement. The codebase-tools migration is an explicit, recorded exception (updated 2026-10-07): it preserves neither direction. The replacement uses a new `{enabled}` state key, does not read the original `{on}` field, and resumes pre-migration sessions as off (users re-toggle); no data conversion or import is provided. This persistence break is itself the explicit new decision the compatibility rule requires. Other migrations keep the bidirectional default. Preserve storage locations, record identifiers, field structure and meaning, units, and session/branch restoration semantics required by the original implementation; preserving only the JSON shape is insufficient.

Existing extension documents and the selected original source revision remain the authority for the concrete persistence format. Do not duplicate those schemas in framework documentation. Framework State may have a different in-memory representation, but its storage mapping must retain the original contract rather than serialize framework internals or introduce a generic replacement format. Do not automatically add schema-version envelopes or migrations. A change that would break this compatibility is outside the accepted refactoring scope and requires a new explicit decision.

Each extension's migration verification must exercise an original-write → replacement-read/update → original-read/update → replacement-read cycle on the same stored data, checking consumer-visible values and continuation behavior. The recorded codebase-tools exception verifies neither half (this migration preserves no persistence data); it is an explicit scope decision, not a general relaxation. Include the storage media that extension actually uses (files, archives, and harness-owned non-LLM session entries as applicable); do not treat backups or a one-way import as rollback proof. This is an acceptance requirement, not a claim that any replacement has passed it. Switching implementations must avoid simultaneous activation; data compatibility alone does not stop duplicate hooks or ongoing work.

This decision removes persistence conversion as a required switching step, not the need to select a compatible harness/source baseline or verify rollback. It does not claim that pi and OMP can read each other's native session formats; cross-harness session portability is a separate, unestablished capability.

## Shared-file concurrency scope

When multiple sessions or agent processes update one extension-owned document, the framework should provide a coordinated read-modify-publish operation and reader-safe atomic publication so one writer cannot silently replace another writer's completed update or expose a partially written document. The fresh on-disk value must be considered within the coordination scope; locking only the final write is insufficient. Feature-specific merge decisions (such as choosing the newer model-cost measurement baseline while retaining a known ratio) remain feature logic, not a universal last-writer-wins policy. After a peer's publication, State may need reconciliation before it is used as the current value. The first implementation must not rely on an OMP-only harness module for a shared pi/OMP capability.

Existing model-cost tests exercise multiple tracker instances sharing a file but substitute an in-process serialization lock ([original test lock](../../../my-omp-toolkit/tests/model-cost/test-lock.ts)); they do not independently verify a real inter-process lock. A framework-owned implementation therefore needs its own actual cross-process and crash/atomic-read contract tests. Lock portability, timeout/failure behavior, and State freshness are detailed-design decisions, not guarantees inferred from the present tests.

## Semantic hooks at the scope level

The framework should offer extension-owned code injection at meaningful agent lifecycle points as well as declarative behaviors. Examples such as agent start and message completion are candidate concepts, not yet a published event inventory or a claim of equivalent timing across pi and OMP. The first release fixes one semantic hook mapping (agent-run initiation, at most once per user turn); the broader hook set, its payloads and ordering still belong to detailed design against existing extensions and both harnesses. An extension supplies one shared TypeScript implementation for each chosen semantic hook; harness adapters bind that same implementation at the corresponding harness lifecycle point and expose harness-independent inputs and framework capabilities. Thin pi/OMP entrypoints must not require maintaining two copies of the feature logic. Treat source-code text splicing into harness-specific templates as a different, fragile approach, not the intended meaning of "injection." Do not confuse message completion with an entire agent run settling.

## Semantic lifecycle model

The framework owns one harness-independent lifecycle vocabulary for extensions; each harness adapter synthesizes it from that harness's native events. The connect-bot migration fixed the first model ([decision](../../.scratch/connect-bot-migration/decision/03-lifecycle-effects.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/03-lifecycle-effects.md)):

- **Session axis.** `session_start` (a session became the current owner; reason `initial`, `new`, `resume` or `fork`) and `session_end` (the current owner ceased; reason `transferred` or `disposed`) form a symmetric pair. A switch, branch or fork is `session_end(transferred)` followed by `session_start`; navigation that keeps the same owner emits neither. The framework seeds and retires State and refreshes the marker area on these boundaries; an extension may subscribe, and the migrating extension uses `session_end` to stop its own effect. The delivery carries this event rather than the earlier session `position`/`reason` pair: the event **replaces** those two fields, and the `SessionPosition`/`SessionChangeReason` types with them, instead of traveling beside them, because a position-described delivery can express neither a symmetric pair nor a start that carries no reason. That replacement is a non-additive interface change and is decided here; the delivery's redundant `previousOwnerKey` is removed with it and recorded in the capability section below.
- **Round axis.** A **Round** is one period of agent activity, from starting work to quiescence — no automatic work remains and it is waiting for the user. A round may contain several model-response turns and several low-level agent runs. `round_start` and `round_end` are edge-triggered transitions; `round_end` has no payload and fires only at quiescence (automatic continuations stay inside the round, while error and abort still reach it).
- **Idle is a query, not an event.** `canAcceptInput()` exposes the harness's idle fact independently of the events and supplies the initial value at activation.
- **Ownership and dispatch.** The framework owns the event semantics and owner scope; adapters own the native mapping, and a missing required semantic is refused fail-soft rather than silently weakened. An owner-facing subscription receives only its owner session's events — a subagent's events never reach it. Framework behaviors run before extension handlers.
- **Effects stay with the extension.** Ongoing work such as timers, outbound queues, retry/failure budgets and network protocol remains the extension's business; the framework emits semantic events and does not add a continuous-task contract.

This fixes the first-release lifecycle vocabulary and refines the "Semantic hooks at the scope level" note above; the remaining hook inventory (for example model-response turns, provider and tool events) stays deferred until a concrete extension needs it. Everything else the migration added for these two axes is additive — an event union, deliveries, handler subscriptions, the idle query, the port's round hook, and the assembly-declared required semantics — so the session-axis replacement recorded above and the feedback replacement recorded in the feedback section are this migration's only non-additive interface changes.

## Owner-scoped effect capabilities (additive; connect-bot migration, decision 07)

An extension-owned background effect (for example a heartbeat timer or an outbound flusher) runs outside any handler delivery, so it cannot rely on delivery-scoped seams alone ([decision 07](../../.scratch/connect-bot-migration/decision/07-effect-callback-capabilities.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/07-effect-callback-capabilities.md)):

- A handler delivery exposes an **owner-scoped capability** (declared-value write plus the feedback channel) that the extension may retain in its own owner-keyed effect record and reuse from that background callback.
- The capability is valid only while its owner is live. On `session_end` the framework retires the owner before the extension handler runs, so a retained capability becomes inert: writes are no-ops that neither recreate State nor republish a marker, and feedback is dropped. The `session_end` delivery itself carries a fresh, dispatch-scoped feedback channel, so the extension can still emit its session-switched notice while stopping local effects.
- `session_end` names the **ending** owner in its `owner` field; the earlier `previousOwnerKey` is redundant once a switch is expressed as `session_end` + `session_start`, and is removed from the semantic delivery. No `hasUI` is carried on the retained capability.
- The extension stops its local resources synchronously before any await; the framework does not wait for the extension's best-effort remote unregister.

## State and recovery seam

Treat state value, ownership, storage medium, restore policy, and lifecycle effects as related but distinct aspects of a behavior definition. A resumed session can restore state without replaying an earlier command or assuming its external effects are still active; reacquiring timers or remote registrations needs an explicit reconciliation policy. Persisted business values such as model-cost's holiday flag and quota estimate/baseline are not automatically modes or state-machine states. For the first release, reconciliation semantics are decided (seed from the target branch at session boundaries, in-session current value authoritative, and navigation that does not change session identity does not refresh activation) and the initial declarative state model is the single boolean activation value used by codebase-tools; broader values and reconciliation remain open.

## Framework-owned capabilities and initial subagent inheritance

Expose small interfaces for framework-defined capabilities such as State; do not duplicate the harness's native extension interface. Extensions may call native capabilities directly. Harness adapters own the differences needed to uphold framework contracts, including State relationships across supported subagent execution paths; this does not require the framework to introduce a subagent scheduler or an MCP implementation. Native calls that affect conversation history remain subject to the history-preservation discussion; access to native interfaces is not a sandbox guarantee.

Inheritance is a per-field axis and defaults to `none`: a subagent reads a field's declared default unless that field declares `follow`, in which case it reads the owning main session's current value live, while each session keeps its own init-injection progress. The first implementation of that live following was the behavior codebase-tools demonstrated, and codebase-tools keeps it by declaring `follow` explicitly. This is live following, not a one-time copy at child creation or wholesale inheritance of extension State. Do not introduce a menu of snapshot, shared-write, or other inheritance strategies before concrete extensions need them. The connect-bot migration made this per-field and default-off, with codebase-tools explicitly opting in; see the directed-control and per-field State lifecycle note under Initial control scope. The existing module-level `globalOn` is evidence of the desired behavior, not a framework ownership mechanism: the framework must associate values with the correct owning session rather than assume every binding in a process belongs to one owner.

Bind inheritance support to an explicitly integrated subagent execution path. The first-release implementation target is OMP's built-in path; the first release ships no pi adapter, so pi subagent State inheritance is not merely unsupported but unimplemented. Do not choose or implement a pi subagent runner merely to claim parity. This is a planned harness-qualified framework capability, not an implemented or runtime-certified feature. Extension loading, State inheritance, and MCP availability are separate conditions; inheritance does not imply that a child loads an extension or gains access to MCP.

A future pi adapter may explicitly permit codebase-tools to operate in a pi session without subagent State inheritance, provided its other required contracts are satisfied; the first release ships no pi adapter, so this is recorded as a deferred harness-qualified path rather than first-release behavior. When such a path is implemented, notify the user once at the extension's first activation in that session that activation is not propagated to subagents by the framework. This is an accepted extension-specific policy, not permission to continue every extension when a required capability is absent. The first release decides the notification transport (extension UI notification, with a stderr line when no UI is available), deduplication (once per main session), and declaration syntax (the declarative extension definition); the notice is not implemented as a model instruction or conversation contribution. Owner disappearance and child restoration without their owner resolve to off, and child-side writes are not permitted; no further fallback semantics are introduced.

## State as the current-value source

Call the unified per-extension current-value source **State**, borrowing React's vocabulary without adopting its component or hook model. Framework-managed behaviors read declared values from State, including extension-defined values; UI, command feedback, and instruction conditions do not each maintain a separate current-value copy. Framework-provided and extension-defined State variables may drive basic notifications and persistent status indicators; complex widget layout remains feature-specific rather than a universal UI language. State's read surface is not its mutation surface: control transitions, declared actions, harness-event projections, and restore/persistence reconciliation are candidate update sources, while renderer code should not bypass them. Persistence media and remote providers remain external inputs; their observations must be reconciled into State before framework consumers read a current value. For the first release the write path is decided (single writer, transition → persistence → feedback, with the in-session current value authoritative); cross-process freshness remains open rather than implied by the phrase "single source of truth."

## One State module for value, life, writes and restoration (constrained refactor)

This records the module shape State is implemented with and refines the write-path and reconciliation notes above; it changes nothing an extension authors. [`StateStore`](../../framework/core/state.ts) owns the extension's declared State end to end — the owner-keyed cells (field name → current value), the owner lives a retained capability is gated by, the declared-value write path, and session-boundary restoration — and keeps the read surface `view(ownerKey).read(field)` unchanged. The separate behavior modules that used to hold the declared-value seam, the retained capability and the session reconciliation are deleted rather than kept as pass-through wrappers.

- **Only State rules are accepted.** The constructor requires the resolved `StateRules` (`{ field, persistence }`) — exactly the pair `activationField(definition)` and `statePersistence(definition)` ([`definition.ts#L255`](../../framework/core/definition.ts#L255), [`#L260`](../../framework/core/definition.ts#L260)) already resolve for the definition an assembly serves. The store holds no definition, reaches into none, and applies no default of its own: what a definition leaves out is resolved where the defaults live. The effect shapes it consumes are exported beside it: `StateWriteTarget` (`ownerKey`, `persist(values)`, `publishMarker()`), `StateCapabilityTarget` (that plus `feedback`), and `StateSessionChange` (`owner`, `event`, `statePayloads`, `publishMarker(ownerKey)`) — the publication receives the owner key the boundary resolved, so the dispatcher does not repeat the owner gate.
- **Effects are supplied per delivery, not remembered by the store.** `writer(target)` returns the delivery's declared-value seam, `capability(target)` returns the owner-scoped handle, and `reconcile(change)` applies one boundary. No transport is resolved inside the store, and the store has no mutable current-session target: each writer or capability closes over the effects its own delivery supplied.
- **One store per assembly, not a process-global registry.** The store is constructed inside [`ompAdapter`](../../framework/adapters/omp.ts#L848), once per factory call, and shared by every session binding of that extension, so those bindings agree on one current value per owner and two extensions never share a store. State is deliberately not resolved from a process global keyed by definition id: the process-scoped resources remain the ones a duplicated framework module graph must still share — the unified marker area (see [Extension feedback, marker, and declared-value writes](#extension-feedback-marker-and-declared-value-writes-additive-connect-bot-migration-decision-04)) and the version judgement — and State is not one of them.
- **Owner lives stay private.** `OwnerLives` remains the implementation of "a capability lives exactly as long as its owner's cell", kept as the store's private `#ownerLives` composition rather than a member a behavior reaches. A start opens the life, the end that retires the cell revokes what was retained for it, and a handle asked for after that owner's life has ended is inert from birth; an owner not yet seen by a session event keeps the existing command-before-start behavior.

The refactor moves the same behavior behind that one interface; it does not revisit it:

- **Write order and best effort.** A write sets the value first and is authoritative for later reads whether or not the persistence attempt succeeds; a persistence failure is swallowed and does not stop the marker publication that follows, and a publication failure propagates without rolling back the value or the persistence attempt; a `memory` field is never persisted, and repeated writes of the same value are neither deduplicated nor short-circuited — each one records (where the field persists) and republishes.
- **Capability gating.** A retained handle's `read` is not gated or frozen: a handle kept from an earlier life still observes the current value, while its `write` and `feedback` are dropped once that life has ended. A handle minted for an owner whose life has already ended — including the one a `session_end` delivery mints — is inert from birth; a later start opens a life for newly minted handles only and never revives an old one. The `session_end` dispatch keeps its own feedback channel, independent of the capability, so the handler can still speak for the boundary after the owner it names has been retired.
- **Reconciliation.** A delivery whose session is not its own owner is ignored. An end drops the owner's cell and then revokes its retained capabilities, so a late write cannot recreate the cell, and publishes the marker area only for `disposed`. A start opens the life first, then, for a `session-entry` field only, seeds the cell from the **last** payload when that payload declares the field as a boolean — any other payload yields the declared default — and publishes the area; a `memory` field is never seeded, so navigation that keeps the owner keeps its value.

The extension-authoring contract is untouched: no definition, assembly option, delivery type or shared-logic call changes, and the read surface is the same `view`. What changes is `StateStore`'s own surface — `applyTransition`, `seed`, `retire` and the public `ownerLives` give way to `writer`, `capability` and `reconcile` — and that internal surface carries no extension compatibility promise; this section is the explicit decision for it. This records the agreed shape and the behavior it must preserve, not runtime verification of the implementation: the framework suites that pin those behaviors — [`declared-value-write.test.ts`](../../tests/framework/declared-value-write.test.ts), [`owner-capability.test.ts`](../../tests/framework/owner-capability.test.ts), [`session-events.test.ts`](../../tests/framework/session-events.test.ts) and [`owner-gate.test.ts`](../../tests/framework/owner-gate.test.ts) — remain the regression alarm for it.

## Behavior orchestration around State

Treat State as the shared current-value source connecting control, commands, harness events, persistence, instruction contribution, feedback, and ongoing lifecycle effects. Ongoing effects depend on both State and their owning scope: entering an active condition may start work, leaving it or losing the scope must stop work, and restoring State alone does not prove earlier effects are still active. One-shot command actions remain distinct from ongoing effects; neither every State update nor every restore automatically replays side effects. Framework-managed model-context behavior observes the same State but is additionally bound by the mandatory history-preservation contract.

## Extension feedback, marker, and declared-value writes (additive; connect-bot migration, decision 04)

The connect-bot migration fixes the user-visible feedback and status surface ([decision 04](../../.scratch/connect-bot-migration/decision/04-interaction-native-boundary.md), [lighthouse](../../.scratch/connect-bot-migration/lighthouse/04-interaction-native-boundary.md)):

- **One feedback channel.** Extensions publish operator-facing notices through a single harness-independent channel with an `info | error` severity, available on command and semantic-event handlers; the adapter maps it to a UI notification, or to a stderr line when the session has no UI. It is never model-visible — not an injected prompt, a conversation entry, or tool output — and the framework's internal admission/session warnings are not merged into it. The channel **replaces** the delivery's earlier plain `notify(message)` member, which is removed rather than kept beside it, so an extension says everything it says to the operator in one place at one severity; that replacement is a non-additive interface change and is decided here. The existing toggle feedback keeps its two texts and is published on the new channel, and a `directed` command publishes no framework feedback of its own.
- **`hasUI` on deliveries.** A delivery states whether the session has a UI, so the extension's shared logic enforces its own main-session + UI gate rather than the framework silently refusing on its behalf. Subagent refusals remain the framework's owner-scope concern.
- **Marker ownership.** The unified marker area stays framework-owned (placement, line order, publication, clearing); an extension contributes only its text. The migrated markers are `◈ codeBaseTools` and `◐ connectBot`, published only while their activation value is true. Both are East Asian Width Ambiguous symbols from the Geometric Shapes block, so they render from one font at one advance and the two area lines stay aligned. The area is one per process, resolved from the process global rather than from the module instance, so every extension's line renders in the one widget even when the loader evaluates a separate framework module graph per extension.
- **Declared-value write seam.** Every injected handler delivery carries a write seam limited to the extension's declared fields, and the framework publishes the marker after each write. Auto-disarm uses it to write its activation field `false`.
- **Native allow-list.** The extension's direct native use is limited to its `harnesses/omp.ts` assembly (managed timer, real session id/cwd/model as plain data); shared logic imports no native types and registers no native hooks.

## History preservation and execution frequency

Defer request-context filtering, including filtering this extension's own earlier contributions, to a later, more flexible policy. Arbitrary edits to other participants' messages or deletion of persisted conversations are not part of the initial common behavior. In the first release, strict history preservation is mandatory: the framework preserves existing harness-owned conversation entries and the history-derived portion of each request without filtering, substitution, or reordering. New extension messages may be appended through the harness's normal conversation-recording path; those entries then belong to the history that subsequent requests preserve. Request-only contributions do not themselves mutate stored history; the first release does not support them, and any future placement must not silently violate the history-derived prefix contract. This supersedes the earlier blanket prohibition of persisted extension-added messages: preserving existing history does not prohibit appending new recorded messages. Persistence alone is not sufficient; insertion into the middle of existing history, later removal, or rewriting the recorded contribution remains prohibited.

Appending new contributed material after the history-derived content is the first-release placement: it preserves that historical prefix, whereas insertion before or among existing history can change the reusable prefix despite leaving disk untouched. Exact allowed insertion positions for future request-only material remain to be confirmed. Temporary contributions are not automatically retained in subsequent requests, and their disappearance or change can limit reuse beyond the stable history prefix.

The guarantee concerns framework-managed behavior, not the harness's normal message recording, compaction, other extensions, or a future independently modified generated artifact. Keeping chat history intact does not by itself guarantee cache hits: system instructions, tool declarations, and provider behavior are separate concerns. Whether system-prompt changes receive a separate stability policy remains open.

Distinguish agent-run initiation from individual model requests for all context-processing behaviors, not only prompt insertion. There is no established requirement yet for a public per-model-request insertion option. Filtering is excluded from the first release; if later enabled, it must apply consistently across the requests it governs, including tool continuations.

## Business logic versus model-context behavior

Keep the contracts for ordinary extension actions separate from instruction contribution and request-context processing. They may share configuration, state, and lifecycle infrastructure, but history-preservation constraints do not prohibit unrelated business computation, extension-owned archives, or status feedback. Apply the constraint according to effects: custom TS that changes harness conversation data or outgoing chat history is context-affecting behavior, not exempt merely because it is custom code. For the first release, custom code that changes conversation data or outgoing history may write only through the framework's contribution interface (append-only and history-preserving), and arbitrary in-process TS is not implicitly sandboxed; a constrained custom-logic entry point remains deferred.

## Supported-harness compatibility

Harness version support is a framework-owned baseline, not an extension-owned list. Evaluate version membership once per process and share the result across extensions, including separately loaded framework module copies. Keep the lightweight required-API shape check at each binding; it is only an availability guard, not proof of semantic compatibility. Semantic compatibility remains established by contract scenarios and real harness verification. This changes the admission ownership and execution scope; it does not change the policy that an unlisted version warns and continues.

Only advertise a behavior as common when its semantic contract can be satisfied across all declared supported harness targets; identical native API names are not required. The framework may additionally own explicitly harness-qualified capabilities, initially subagent State inheritance on the integrated OMP path but not on pi, and the delivered authority of persisted instruction contributions, whose OMP mapping is recorded from provider serialization while other harnesses remain undecided. Their support conditions and absence must be visible rather than represented as cross-harness parity. This qualifies the earlier common-behavior-only scope; it does not permit silently weakening required semantics. Reject a behavior whose required role or insertion semantics cannot be met rather than silently substituting a weaker behavior. An extension may instead record an explicit, harness-scoped acceptance of a documented absence, as codebase-tools does on OMP for delivered contribution authority; that record is per harness and is not a cross-harness permission. Rejection is **fail-soft**: the unmet requirement is reported on a non-model channel (never in model instructions or conversation history), the affected capability or extension is not bound, no partial registration is left behind, and the harness continues. The same fail-soft rule covers invalid extension definitions, configuration conflicts (duplicate command names, competing State writers, multiple rules for one contribution slot), and initialization failures. Anchor the harness targets and evidence in a [version baseline file](../../framework/docs/harness-support.md), separating source inspection from runtime validation; a version number alone does not establish compatibility across provider protocols or operating modes. Run shared semantic contract scenarios against harness upgrades to detect regressions quickly: failure is an investigation signal, while success does not automatically approve support. A framework maintainer explicitly assesses source changes and/or additional evidence before declaring a new harness version supported.

## Framework verification as a separate concern

Treat framework verification as a ninth scope area alongside definition/configuration, control/commands, semantic events and State orchestration, storage/recovery, ongoing lifecycle work, instruction contribution, status feedback, and harness adaptation. Shared semantic contract scenarios serve as upgrade regression alarms; the maintainer, not a green test run, decides when a harness version is supported. The first release fixes the scenarios and dock as two separated suites (extension acceptance and framework capability, the latter doubling as the upgrade alarm); later scenarios still belong to detailed design.

## Consequences and unresolved details

- This records the agreed direction, not implementation completion or compatibility of the existing five extensions.
- Existing `readonly-mode` mixed control cannot be claimed as a behavior-preserving migration within the first release. Its migration treatment remains out of first-release scope and to be decided later.
- The `codebase-tools` developer-role injection requirement in ADR-0001 is recast as a harness-qualified capability: the OMP adapter records the provider's serialized role for persisted contributions, and codebase-tools explicitly operates on OMP without developer authority. The recorded facts (2026-10-07, real outbound capture per provider path, see [provider-path role evidence](../../framework/docs/harness-support.md#provider-path-role-evidence-recorded-facts-not-a-gate)) are `user` on `deepseek/deepseek-flash` (`openai-completions`) and `developer` on `openai-codex/gpt-6-luna` (`openai-codex-responses`, shape-only layer 1) — an earlier statement here that both verified paths serialize `user` was a source inference, not a capture, and is superseded. A universal developer-role guarantee is not promised, the role is recorded as a fact rather than an activation or refusal condition, other harnesses remain undecided, and the original ADR-0001 is left untouched as the original extension's record.
- Restart versus extension reload is decided for the first release: only a whole-process restart takes effect, and hot reload is deferred. The v1 extension definition syntax is settled (a declarative `defineExtension` plus a harness adapter assembly), and the framework's small public interfaces evolve **additively only**; a non-additive change requires a new explicit decision in this document. Exact-version admission and the treatment of a newly added harness that cannot meet an existing common contract are also decided: an unlisted version is warned about once per main session and then continues, while a missing required semantic rejects the affected capability fail-soft. Dependency discovery under the first-release OMP loader is resolved; the pi loader path, the precise composition of the reusable behavior library, and standalone generated artifact packaging remain deferred.
- For the first release, cross-behavior conflict rules are decided: exactly one rule per contribution slot, exactly one declared writer per State field, and one command name per extension; a conflict is an explicit configuration error handled fail-soft, and no behavior may be resolved implicitly by harness registration order. Composition and precedence among multiple rules per slot, multiple transitions triggered by one semantic event, and other multi-consumer cases remain deferred.
- For the first release, history preservation is enforced by restricting history-affecting writes to the framework's append-only contribution interface; request-only insertion, system-prefix treatment, and the precise shared-file coordination, failure, and freshness guarantees remain open or deferred. The scope of the history guarantee is framework-managed behavior; harness behavior and other extensions are excluded.

~~~~~~~~

## docs/adr/0004-model-cost-aggregate-accounting.md

~~~~~~~~markdown
---
status: accepted
---

# model-cost 采用扩展自有聚合，而不是通用业务账本

model-cost 选择在 harness-independent shared logic 中逐响应按请求锚价计算、按实际会话独立聚合，并在 framework `round_end` 触发保存；每个会话只保留最近 Round 的开始／结束累计快照，不建立历史 Round／Turn 明细账。它以无法查询历史轮次、异常退出可能丢失未落盘消费，以及缺 usage／价格时只提示并跳过对应指标、不维护缺失计数或补算记录为代价，换取接近旧方案的复杂度与交互开销；这些是 model-cost 的业务取舍，不是所有 extension 必须采用的框架政策。Round、response usage、实际会话及父子关系通过 framework 的宿主无关接口提供，adapter 映射原生事实，其他 harness 复用同一 shared logic；不为本方案升级通用业务 State，也不让 UI 维护另一套权威累计。

## 账户周期与恢复

只保留账户级 clear：归档目标账户的活动聚合并重置，成功时关闭该账户 holiday。Session 累计为该账户本周期内该会话跨各 Round 的消费，Round 累计仅属于该轮；普通 resume 恢复已保存活动聚合，clear 后不合并旧归档、不按宿主历史 token 以当前模型／费率重算，不维护跨周期 Session lifetime total。旧值保留在归档，clear 前在途消费允许丢弃，后续新请求正常统计；以此换取直接的重置／恢复模型。其他账户、已有归档、Codex quota estimate 与入口 detail 不随该账户消费清理删除。物理更新与成功／失败边界仍由存储及命令票收口。

## 概念与实现承诺

[framework glossary](../../framework/GLOSSARY.md#facts-and-measurement-semantics)定义未知、无统计口径、确认零、指标完整性与已知小计，供各 extension 分析边界；术语存在不要求实现对应枚举、计数或恢复机制。[model-cost glossary](../../extensions/model-cost/GLOSSARY.md)只定义消费领域的专有含义，不用词义定义承载本次取舍。跳过费用不代表实际免费，已知小计不承诺覆盖 provider 的全部收费。

## 决议范围与溯源

本 ADR 记录用户确认的聚合架构取舍与理由；[数据归属与账户周期 Lighthouse](../../.scratch/model-cost-migration/lighthouse/12-state-data-contract.md)现为本票最终决议及历次暂停的完整溯源。数据票已 resolved，但迁移尚未实现；详细边界、替代关系与未决落地契约以正式 Lighthouse 及其具名交接票为准。它不改变已有账户隔离、正常响应去重、主／子代理分别统计或并发正确性要求；运行期请求详情／去重标记的寿命已确定；存储格式、保存等待／失败、可靠原生身份／实例隔离映射及最终 UI 布局仍由对应票决定。framework 的分层与 native import 责任继续遵循[语义扩展框架 ADR](0002-semantic-extension-framework.md)，本次只落地 OMP，不实现或认证其他 harness adapter。

~~~~~~~~

## framework/GLOSSARY.md

~~~~~~~~markdown
# Semantic Extension Framework

The planned cross-harness framework: my-agent-toolkit maintains one in-repository framework source tree for replacement extensions containing semantic behaviors and pi/oh-my-pi adapters. A standalone extension generator is a possible later distribution feature, not part of the initial framework.

## Language

**Semantic extension framework（语义扩展框架）**:
The shared harness foundation that owns extension behavior contracts and their mappings to supported harnesses.
_Avoid_: standalone generated extension, copy-pasted template, native API wrapper

**Harness（宿主）**:
The program that discovers and runs extensions and exposes the native capability surface they adapt to; the supported harnesses are `pi` and `oh-my-pi`. A harness is distinct from an agent session (`ctx.agent`) and its subagents.
_Avoid_: agent runtime (legacy name), host (ambiguous with OS/process host), agent, platform

**Extension definition（扩展定义）**:
The configuration and optional shared TypeScript logic describing an extension independently of a particular harness.
_Avoid_: harness-specific entrypoint, generated extension

**Generated extension（生成扩展）**:
A harness-targeted standalone extension produced from an extension definition by a potential future distribution tool, not an extension using the initial shared-source framework. A manually customized copy would be maintained independently of that definition.
_Avoid_: shared-source framework consumer, synchronized source

**Semantic hook（语义钩子）**:
A framework-defined lifecycle position where one harness-independent extension function can run across supported harnesses. The harness adapter identifies the corresponding native trigger and supplies the framework's semantic inputs.
_Avoid_: native event name, template text slot

**Semantic lifecycle event（语义生命周期事件）**:
A framework-defined, harness-independent lifecycle transition that a harness adapter synthesizes from that harness's native events. The framework owns its meaning, ordering, payload and owner scope; native event names, shapes and per-harness facts are not part of it.
_Avoid_: native event name, raw harness hook, phase state

**Request（模型请求）**:
One observable model-provider invocation, distinct from its resulting assistant response and tool activity; transport retries hidden within that invocation are not separate observable Requests.
_Avoid_: turn, round, assistant response

**Assistant response（助手响应）**:
One model response, including a response that only initiates tool calls; tool results are not assistant responses.
_Avoid_: tool result, turn, round

**Turn（模型请求／响应周期）**:
One observable model request/response cycle that begins with the request and may complete, fail or be cancelled without a complete assistant response; hidden transport retries remain within the cycle, and execution of requested tools is outside it. Tool-call instructions may be part of its response, and prior tool results may be part of its request; neither makes tool execution part of the Turn.
_Avoid_: round, run, response plus tool execution

**Turn identity（Turn 身份）**:
The identity of one model request/response cycle, distinct from a provider-issued request identifier and from the identity of its containing Round or session.
_Avoid_: provider request ID, round ID, message ID

**Tool execution（工具执行）**:
The agent's execution of a tool-call instruction and production of a tool result, distinct from an LLM request/response Turn. It is work within a Round; its result may become input to a later Turn.
_Avoid_: turn, model response, separately billed model request

**Round（轮次）**:
One per-session period of agent activity, from starting execution until it has no pending automatic continuation and awaits new input, or its activity terminates by explicit cancellation or terminal failure. It may contain multiple model-response turns, tool executions, retries, queued-input consumption and dedicated approval interactions; known automatic continuations remain in the same round, while a newly observed execution start may truncate an unfinished prior round when its ending or continuation evidence is missing. Recovery or reloading may truncate an unfinished round and begin a new one for observed ongoing activity; truncation does not establish that the activity itself has completed.
_Avoid_: native agent run, turn (one model-response cycle), per-message interaction, whole task, semantically inferred task boundary

**Agent activity state（代理活动状态）**:
The agent's per-session current activity condition: working while continuous activity remains ongoing, or idle when no current activity or pending automatic continuation remains and it awaits new input. Dedicated approval/interaction waits remain working; this axis does not assert semantic completion of the user's overall task or whether a Round end has been observed since a panel connection began.
_Avoid_: run, execution unit, panel online status, panel completion history, extension State

**Working（工作中）**:
The agent activity state in which a continuous period of work remains ongoing, including model responses, tool execution, automatic retries/continuations and dedicated approval interactions. It includes awaiting a delegated result that will continue the session’s activity, and does not mean that model text is currently streaming.
_Avoid_: streaming, native agent run, waiting for new input

**Idle（空闲）**:
The agent activity state in which no current activity or pending automatic continuation remains and the agent awaits new input. It does not establish that any particular Round end has been observed, and unavailable observations do not establish idleness.
_Avoid_: completed user goal, observed Round completion, offline, unknown

### Facts and measurement semantics

**Unknown（未知）**:
A fact or metric value that cannot be reliably determined from the available evidence. It is distinct from a known zero, an inapplicable measurement policy, and failure of the activity being observed.
_Avoid_: zero, false, idle, no measurement policy

**No measurement policy（无统计口径）**:
The absence of an applicable rule for interpreting or calculating a metric within a stated scope. It is distinct from an unknown value caused by missing evidence under an applicable rule.
_Avoid_: unknown, missing observation, known zero

**Known zero（确认零）**:
A metric value established as zero by sufficient evidence under an applicable measurement policy. An absent observation or an inapplicable policy does not establish known zero.
_Avoid_: unknown, no measurement policy, skipped contribution

**Metric completeness（指标完整性）**:
Whether a particular metric has the evidence required by its measurement policy across its stated scope. Completeness is metric-specific; activity success alone does not establish it.
_Avoid_: activity success, availability of another metric, known subtotal

**Known subtotal（已知小计）**:
The sum of known, applicable contributions within a stated metric scope. Omitting unknown or inapplicable contributions does not establish a complete total or assign zero to those contributions.
_Avoid_: complete total, known zero for unknown contributions

### Extension controls and ownership

**Configuration switch（配置式开关）**:
An activation choice read at initialization whose changes do not take effect during the current run; applying a changed choice requires a restart.
_Avoid_: harness toggle, mode command

**Extension configuration（扩展配置）**:
An extension's own `config.yaml` in its source directory, read and validated by the framework at binding and exposed to the extension's shared logic; a change requires a restart. Its entries are plain configuration values and, in a future release, configuration switches.
_Avoid_: harness settings, environment override, State, defaults embedded in code

**Mode selection（模式设置）**:
An explicit request for a named mode. Selecting an already active mode leaves it active without repeating mode-transition side effects.
_Avoid_: toggle, inversion

**Control kind（控制类别）**:
The per-field axis deciding how a bound command drives its State field: `toggle` alternates between two values on successive executions; `directed` names its target value explicitly and repeats its side effect on every execution.
_Avoid_: control category, mode, command type

**Command toggle（命令切换）**:
A command that alternates between two modes on successive executions.
_Avoid_: mode selection, idempotent switch

**Directed control（定向开关）**:
A bound control kind whose command names its target state explicitly — an empty argument activates, `off` deactivates, and any other argument is not a directive at all (the framework records and publishes nothing for it, and hands the text to the implementation's own `unrecognized` member) — and which repeats its side effect on every invocation; the framework never deduplicates or short-circuits it, so idempotence is the extension's responsibility.
_Avoid_: toggle, mode selection, idempotent switch, command action

**Mixed control（混合控制）**:
A control scheme combining explicit mode selection and command toggling over the same mode state.
_Avoid_: a fourth mode, independent switches

**Command action（命令动作）**:
An extension subfeature invoked to perform an operation, rather than to select or alternate a mode.
_Avoid_: mode transition, toggle

**Parameter setting（参数设置）**:
An extension subfeature that assigns a supplied value to a parameter; it does not inherently activate or deactivate the extension.
_Avoid_: mode selection, command action

**State**:
The framework's single current-value source for an extension, including framework-defined and extension-defined values. Persistence media and external providers can supply observations, but framework-managed behaviors read current values from State.
_Avoid_: UI-only variable bag, persistence backend, unscoped global object

**State persistence（State 持久化）**:
The per-field axis deciding whether a declared State value is written to the owner's persistence medium and seeded from the target branch at session boundaries (`session-entry`, the default) or kept only in memory and never seeded (`memory`, the choice for a value whose live external effect must not be assumed from a restored value).
_Avoid_: extension storage, concrete persistence backend, UI state

**Subagent State inheritance（子代理 State 继承）**:
The per-field axis deciding how a subagent relates to its owner's declared State value: `follow` — the subagent reads the owner's current value live; `none` (the default) — the subagent reads the field's declared default. Other session-owned values, such as each session's init-injection progress, remain independent.
_Avoid_: whole-extension state copy, creation-time snapshot, process-global state, extension loading, MCP inheritance, default inheritance

**Owner（所属主会话 / owning main session）**:
The session that holds an extension's owner-scoped State values; for any session it is the nearest ancestor session that is itself a top-level main session (a main session is its own owner). Subagent sessions are not owners; whether they follow their owner's values live is per-field and opt-in.
_Avoid_: parent agent, process-global state, current session

**Parent agent（父代理）**:
The session that directly created a subagent — the immediate spawner. It may itself be a subagent, so it equals the owner only at depth 1.
_Avoid_: owner, root session, State holder

**Subagent spawn relationship（子代理启动关系）**:
The relationship between one subagent execution and the actual session and Round that directly initiated it. It is distinct from State ownership and from the parent’s current Round when a result arrives.
_Avoid_: Owner relationship, result-arrival relationship, agent-name hierarchy

**Session ancestry（会话祖先链）**:
The chain of direct parent-session relationships connecting a session to its ancestors. A direct parent and a top-level owning session are distinct positions in this chain.
_Avoid_: State inheritance, agent-name prefix, flattened Owner relationship

**Extension storage（扩展存储）**:
The retention mechanism for extension-owned state and business data, including in-memory values, harness-owned session entries, extension-owned files, and archives. It does not by itself determine which session or other owner a value belongs to.
_Avoid_: session restoration, persistence (when referring only to volatile memory)

**Recovery reconciliation（恢复后对齐）**:
The decision whether and how a restored state should reacquire ongoing effects whose earlier execution may no longer be active. Restoring a stored value alone does not establish that timers or external registrations are running.
_Avoid_: replaying the last command, automatic side-effect restoration

**Marker area（状态标记区）**:
The framework's single status region where each bound extension's marker is rendered, with a widget identity, placement and line order the framework owns and an activation-driven life cycle the framework derives from State; an extension contributes only its marker text and can never name or claim the widget. It is one per process, registered on the process global under a well-known symbol so that duplicated framework module graphs still share the one region.
_Avoid_: extension-owned widget, per-extension marker key, extension-chosen placement

**Extension feedback（扩展反馈）**:
The framework's single harness-independent channel through which an extension publishes operator-facing notices, each carrying an `info` or `error` severity; the framework maps it to a UI notification when the session has one and to stderr when it does not, and it never enters model context.
_Avoid_: raw native notify, tool output, injected prompt, extension-owned widget

**Injected prompt（注入提示词）**:
Extension-provided text made available to the model under declared activation and delivery rules. Its visibility to the user, delivered authority, and retention are distinct properties.
_Avoid_: instruction contribution (legacy name), hidden developer message (as a synonym for all prompts), raw text insertion, system prompt

**History preservation（历史保护）**:
A policy under which framework-managed behavior preserves existing conversation entries and their order in history-derived request content. New recorded messages may be appended; separate non-persisted contributions have their own placement rules, and cache hits are not guaranteed.
_Avoid_: identical-to-history request, cache-hit guarantee, immutable business storage

**Request-only prompt（请求级临时提示词）**:
Extension-provided content included in a model request without being added to the harness's conversation history. Its placement and recurrence are separate from its non-persisted lifetime.
_Avoid_: request-only contribution (legacy name), persisted hidden message, history entry

**Supported harness baseline（Harness 支持基线）**:
The declared harness versions and applicable conditions against which shared extension behaviors are supported, together with their verification status. An inspected version is not automatically a supported or runtime-verified target.
_Avoid_: latest versions, universal compatibility, source version alone

**Behavior library（行为库）**:
Reusable harness-independent extension behaviors that an extension definition selects and configures.
_Avoid_: harness API wrappers, feature-specific business logic

**Feature template（功能模板）**:
A reusable combination of behaviors and feature-specific logic that can produce an extension from supplied configuration.
_Avoid_: semantic core, generated extension

## Verification

**Harness dock（对接坞，short `dock`）**:
Repository-owned test infrastructure that verifies a harness. It materialises an isolated exact install of one harness version, drives it as a child process in RPC mode under an explicit-only extension set, and reads back that run's session JSONL, captured outbound requests and stderr. It is not itself a harness.
_Avoid_: test runtime, test harness, fixture

~~~~~~~~
