# 正常路径收束前历史快照

仅供恢复理由和未决技术线索；不是现行契约。当前权威在观察 Lighthouse。

## 原 decision 文件

# framework 如何提供请求、响应、Turn／Round 与模型事实观测？

Type: grilling
Status: claimed
Assignee: 当前会话（wayfinder，继续观察契约讨论）
Blocked by: 01, 02, 12, 06
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)
Lighthouse: [观察局部决议](../lighthouse/03-observation-contract.md)

## Handoff

- 暂停原因：用户要求“先暂停grilling……两个重大变更……先持久化记录下来”。本轮部分发布完成后保持整票未决、释放认领；不开始生产重构、不切另一票。
- 两项重大修订的唯一权威：[观察契约 Q17](../lighthouse/03-observation-contract.md)持有公共逻辑尽量归 framework、adapter 必要桥接及分层重构／回归方向；[数据归属的逐代理主题](../lighthouse/12-state-data-contract.md)持有 Q27 子代理只归父 Session、Round 仅本实际会话自身及旧范围替代；[存储原 schema Q25](../lighthouse/06-local-storage.md)持有 parent 字段裁剪。地图只索引；旧消费／行为、ADR 与词义职责已协调，不复制规则。
- 其他确认：[观察权威](../lighthouse/03-observation-contract.md)已保存 Q16 模糊全零处理、Q18 结束候选的轻量复查、Q19 统一 round_end 的条件性设计方向、Q21／Q22 取消 Turn 仍属于原 Round且已知消费保留；Q23 重申全部上下文分支消费仍属于本 Session，不回滚。
- 退役问题：Q24／Q25 的父 Round 归属切换曾临时确认，已被 Q27 明确替代；Q26 未回答且无需继续。父 Round 启动标签、复用子会话消费分段、迟到子消费回填父轮不再是剩余工作。实际请求在开始固定自身会话／账户周期／模型／锚价、Turn 去重与观察实例隔离仍保留。
- 未批准候选：早期 Q17 单在途槽提案已撤回；Q19 的异常结束原因枚举、无信号補发 round_end、旧 Q20 统一静默退役都未批准。统一公共通知可按实现可行性／成本再调整，不把方向当保证；不复活逐 Turn 账本、补账、全局完整性状态、统一等待所有异步效果或 pending clear。
- **下一 ready 技术问题**：固定 OMP 18.5.0 如何向 framework 提供未过滤的开始／结束候选与同一实际会话的可重读活动事实，让原生回调先收口、宿主可进入 idle，再完成 Q18 的下一任务复查？如何使旧观察实例／候选不能关闭新活动，并衔接 framework round_end handler 返回前等待保存？先用当前源码与隔离链路推导最小 seam，不让用户替代环境事实，也不继续重复询问已定原则。
- 后续未决：Turn 原生关联／具体 ID 生成、重复／重放／取消／重发的实际映射；可信 usage 的支持来源范围；恢复／reload／switch／tree／fork 的观察实例范围、真正缺结束信号的处置；逐子代理／多 main 观察、requiredSemantics 与 owner 效果隔离；直接父实际 Session 的取得／恢复／混账户关系及迟到聚合发布（不含父 Round 分配）；跨入口 clear 后自身当前／最近 Round 可用性；模型 catalog 单位、实际 Effort、上下文和当前会话／orchestration事实、专门交互活动；最终接口与消费者迁移。普通取消无 reliable usage 的最近轮数据／展示若有歧义，不把零差值自动当确认零。
- 原已发布 clear 入口执行条件仅在[命令局部权威](../lighthouse/07-command-state.md)，本轮无新命令确认；存储 Q6／Q14 磁盘初始化／无基线暂停与单 Turn 清理不同，账户周期／版本校验保留。数据／存储／行为／消费归属仍 resolved，本观察票仍有具名未决问题，不因分层方向或一个输入可用就结案。
- 原待回顾冲突保留：消费归属“拒绝并发驱动／检测待定”与存储“不加检测、保存版本冲突收口”的具体文字是否需协调，用户尚未裁决。本轮没有重开或代决原 resolved 票的其他范围。
- 本轮证据与确认原话见[暂停证据](../assets/observation-pause-evidence-2026-10-11.md)；本次新增固定基线 provider 真实零／缺失对照（两次 HTTP、相同最终 usage）、旧 framework 21／connect-bot 27 测试基线及只读 ESC／追加消息路径核对。没有新 framework 实现、直接键盘 ESC、全部 provider、真实账单、混账户／多 main／恢复／TUI／自动关机认证。先前[请求](../assets/omp-request-observation-smoke.md)、[子代理](../assets/omp-subagent-round-findings.md)、[结束时序](../assets/omp-end-timing-smoke.md)、[旧等待](../assets/old-observer-waiting-smoke.md)与[数据追踪](../assets/state-data-backtrace.md)证据限制继续适用。
- 所有旧恢复点退役，unique reasons／历史证据留[本次发布前原文](../assets/observation-revisions-before-pause-2026-10-11.md)与[更早发布前快照](../assets/observation-history-before-publication-2026-10-11.md)；恢复以本 Handoff 和原 Lighthouse 为准，不读旧问答来恢复已取消的父 Round 条款。
- Trace follow-up：下方报告已覆盖分层／旧消费者回归／直接父恢复／Session-only 与取消保存；无新未归属已确认 gap、不增票。可行性与已有并发检测文字冲突仍待本票或具名提供者处理。

## Question

设计 framework 拥有且由 OMP adapter 映射的观测契约：请求开始时刻与身份、HTTP 响应 headers/metadata、assistant 完成的 token usage、响应计费事实、工具执行、Round 边缘分别何时派发、如何关联？模型／provider／catalog cost、实际 Effort、上下文 tokens、会话累计／orchestration 统计与会话身份以什么小接口提供？

确定顺序、异常／中止／无 usage、模型在 Round 内切换、每请求价格锚定及不可用观测的含义。不把原生 payload 整体透传，也不让 provider-specific Codex header parser 进入语义 core。审查已有 requiredSemantics、owner 门控、生命周期与异步 handler 支持是否适用；缺失能力不得伪造成功。按选定基线核对原生映射并要求实际链路证据。

本次发布后的未决输入 seam 以 Handoff 为恢复入口；公共逻辑优先 framework、子消费父 Round 分配已取消，规则与确认来源均在原 Lighthouse。此 Question 不要求恢复已退役的统计范围。

## Comments

### 本次暂停发布：确认与历史

本轮确认 Q16–Q23／Q27、被替代的 Q24／Q25 与未答 Q26 见[确认来源与证据](../assets/observation-pause-evidence-2026-10-11.md)。发布前完整票体、旧 Handoff／Comments 和权威原文保留于[原文快照](../assets/observation-revisions-before-pause-2026-10-11.md)；更早轮次由其中既有链接继续追溯。历史不是现行恢复点；本轮不结束整票或改变其他票状态。

## Trace Report：本次暂停的分层与 Session-only 修订

### 覆盖与后续归属

- 意图信号“接入新 harness 不重复状态机”“统一心智模型”“旧插件正常”来自观察 Lighthouse 新故事：公共身份／关联与 Round 事实输入、候选复查归本工作票；具体 core／behaviors／adapter seam、消费者迁移归[确定的新能力与 model-cost 如何组织、声明和装配？](10-assembly-layout.md)；行为回归、真实宿主与旧插件证明归[什么证据才算完整迁移，如何安全验收并切换？](11-acceptance-cutover.md)。这些问题已覆盖，未决不等于已经实现，无需重复开票。
- 意图信号“取消保留可靠消费”“新轮接续累计”“不持续轮询”由本票 Q18／Q21／Q22 的观察规则及[数据归属](../lighthouse/12-state-data-contract.md)、[存储保存／失败](../lighthouse/06-local-storage.md)提供；真实 ESC→取消→结束候选→保存顺序仍在本票的异常／异步派发问题中。展示的零与不可用、最近轮／tree 语义归[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](08-presentation.md)。首 Turn 无 usage 不自动批准新的零展示政策。
- 意图信号“子代理 Session 汇总”“直接父关系恢复”“不分配父 Round”由原数据主题 Q27 修订提供，原 schema Q25 的 parent 同步裁剪；本票提供直接父实际 Session 与观察实例事实，[账户访问](04-provider-access.md)提供账户键与混账户条件，[装配](10-assembly-layout.md)落实读取恢复，[验收](11-acceptance-cutover.md)证明每笔响应一次。已取消的父 Round 标签／启动实例／分段不再是缺口。
- 模式与层完整性：native import 边界保持；adapter 可桥接，但公共状态机优先 framework；model-cost 业务聚合／丢弃／schema 不上移。逐子代理观察与多 main 能力仍归本票及装配，不用 owner gate 掩盖；connect-bot owner-scoped 效果继续隔离。capability 索引标记当前实现与新目标差异，未虚构新 exports；ADR／glossary 调整职责措辞而非宣称完成。

### 已协调的冲突与被替代分支

- 观察原“adapter 内部收集／管理关联”按 Q17 改为 adapter 映射事实、framework 尽量统一管理；ADR-0002 的责任矩阵／生命周期描述及 glossary 的事件来源定义已协调。现有代码仍需重构，是待实施差异，不是重新批准其旧分层。
- 数据／消费归属／行为／存储 Lighthouse 的“启动父 Round 筛选”“启动实例”“同子会话复用分段”按 Q27 旧→新修订；原数据故事／Invariant 与原 parent schema 都已协调。不把 Q24／Q25 临时方案或未回答的 Q26 当现行政策。
- Q19 保留可行性／成本评估后的调整权；旧 Q20 无可靠信号统一静默退役提案未获批准，不能把明确 ESC 取消类比为无信号。取消无 usage 不阻止生命周期收口，已完成消费不撤销。

### 未决风险／冲突（本次只交接，不代决）

- **输入 seam 与调度前置**：当前 HarnessPort.onRound 只交付 adapter 过滤后的边缘，公共复查需要开始／结束候选与可重读活动事实。必须核对原生结束 handler 的返回、宿主 idle 成立时点、下一任务复查、framework round_end 保存等待之间是否形成相互等待；正常输入／取消的排序与稳定快照也需真实链路证明。现有本票顺序／异步 handler 问题及装配／验收范围已覆盖，尚未运行新框架，不能默认调度已可行。
- **直接父实际 Session 事实**：ctx.agent.parentId 是原生代理身份，不自动等于持久 sessionId；多 main、旧子跨恢复、混账户查询与 clear 后重建需证明稳定映射。Q27 删除父 Round 分配不删除这项依赖；本票与账户／装配已有归属。
- **公共结束范围**：统一 round_end 只确认方向；缺信号、观察实例重建／恢复截断是否通知及消费者如何不误认完成尚未裁决。保持本票未决，不能新增原因枚举或补发／静默退役承诺。
- **原单执行者措辞冲突仍存在**：[消费归属权威](../lighthouse/02-accounting-ownership.md)的“拒绝并发驱动；检测待定”与[存储 Q26](../lighthouse/06-local-storage.md)的“不加检测、保存版本冲突收口”是此前已报告的具体冲突；本轮没有新的用户裁决，保留待回顾，不趁 Q27 扩张修订其余 resolved 范围。

### Gap follow-up 结果

无未归属且已获用户确认的新 gap；以上未决风险均落入现有问题，不创建重复票、不改其他会话的 claim。下游旧 Handoff／历史中的父 Round 分配措辞在恢复时必须依照现行原权威，不将其复制为新政策；本次不批量重写下游输入。待裁决冲突与可行性问题转入本工作票 Handoff，暂停不要求继续采访。

## 原 Lighthouse 文件

# framework 如何提供请求、响应、Turn／Round 与模型事实观测？：Lighthouse

> Question and discussion: [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)
>
> 部分发布（2026-10-11）：整票未完成。既有确认取自[发布前票体快照](../assets/observation-history-before-publication-2026-10-11.md)的“当前有效决策”；本轮确认来源为下列用户原话。规则是规划，不表示新 framework 观察接口或 OMP 映射已实现。

## Question

确定 framework 的 Turn／Round／活动、模型与会话事实及观察处理约束，由 OMP adapter 映射真实宿主信号；统一身份关联与生命周期逻辑尽量归 framework，adapter 负责原生事实映射与必要桥接；具体输入 seam、可信 usage、恢复和结束候选链路仍需验证。业务计价与聚合不进入 framework。

## Discussion

### Round 与活动的既有批准范围

Round 是实际会话的一段连续活动，不按普通消息、输入消费批次或任务语义切轮。工具、已知自动续跑、排队输入消费、专门交互以及会驱动父继续的子代理等待可保持同轮。代理已结束并等待普通输入后，下一次执行才开新轮。子自身事件不关闭父轮；只按本会话的实际继续事实判断，不要求全部后台 running jobs 归零。

OMP 最小批准映射：无开放轮次的 agent_start 开轮；已观测上次 agent_end.willContinue=true 时，下次 start 延续旧轮；否则 start 可因遗漏结束信号截断旧轮并开新轮。允许续跑信号也丢失时拆轮。非续跑 agent_end 只是结束候选，需确认本会话实际静止、无待续执行后终轮；不能只在同步回调检查一次就丢掉候选。Q18 已确认轻量复查方向，见本主题下文；调度实现、事实读取与防旧检查的真实链路仍待验证。

正常结束、明确取消、终止失败可终轮；请求／工具失败但仍继续时不能终轮。恢复／重载可截断未完成 Round，恢复后可靠 working 时开新轮，idle 时等实际执行；具体操作范围与实例隔离仍待定。遗漏信号／恢复截断不冒充正常完成、取消或已确认失败，不产生 connect-bot 完成证据。

framework 活动轴为 idle／working，不可靠观测不默认 idle。connect-bot 保留三态协议：工作时报 working；空闲但接入后未观测结束时报面板 idle；已观测真实结束后的空闲时报 awaiting-input，保留原监控／自动关机语义。不在地图执行消费者迁移。

替代：旧无条件 start 去重、按普通用户消息切轮、按输入批次切轮或任务语义推断，不是现行政策。早期 pi agent_settled 方向只作历史研究，本地图不实现或认证 pi adapter。

### Q18–Q23：结束候选、公共通知方向与明确取消

Q18 由用户明确确认：原生结束输入不是立刻认定终轮；已知自动续跑保持原 Round，否则形成候选，framework 安排一次下一任务复查。确认本会话静止且没有已知续跑才终轮；条件未满足则保留候选，等待后续相关信号再次核验。新活动或实例变化使旧检查失效，不能关闭新活动；不做持续定时轮询，不用超时猜结束。允许首次复查未静止、之后又没有可用信号时无法及时确认结束；下一可靠开始仍按既有遗漏信号规则处理。此方向有既有正常结束时序证据，不是所有竞态已经实现或认证。

Q19 只确认公共通知尽量统一使用 round_end、不另建异常结束机制／额外异常状态的设计方向。用户明确保留可行性与成本评估后的调整权；没有批准异常结束原因枚举，也没有批准缺信号时补发或实例销毁时统一静默退役。明确取消与真正无可靠结束信号不是同一情况；恢复截断如何通知、怎样避免伪造 connect-bot 完成证据仍未决。详见 [本轮确认来源与证据](../assets/observation-pause-evidence-2026-10-11.md) 中原话，不把此前未确认的 Q20 静默退役提议写成政策。

Q21／Q22 确认：完成的 Turn 与最后被取消的 Turn 同属开始时的 Round；取消 Turn 没有可靠 usage 只跳过该 Turn 的消费，不撤销同轮已完成 Turn。明确取消的 Round 按上述事实核验收口，可使用同一公共 round_end，不依赖最后一份 usage 才触发保存；统计仍按既定数据／存储权威保存已知自身累计。首个 Turn 就取消且无可靠 usage 时无消费增量，但 Round 仍有生命周期，后续输入开新 roundId、接续已有累计；取消有可靠 usage 仍累计。不是每个完成 Turn 都切轮，也不事后补造 Round。无可靠消费的最近轮快照如何保存／展示，若存在歧义仍需对应数据／展示问题明确，不能自行造确认零。

Q23 重申 Session 累计包括本 Session 在各上下文分支实际发生的全部请求；树导航改变请求上下文，不回滚消费。该累计政策归[数据归属与账户周期决议](12-state-data-contract.md)，不是父子代理会话树或新历史 Round 账本。

### Q17：公共逻辑收回 framework，adapter 保留必要桥接

旧方向将 Turn 关联管理、事实收集及 Round 状态机默认放在各 adapter；用户本轮明确修订为：能统一语义并放进 framework 的逻辑，尽量由 framework 共用，避免每接入一个 harness 重写同样的逻辑。身份生成／管理、在途关联、去重与冲突处理的通用机制、Round 开闭与结束候选复查应优先在 framework；adapter 提供原生订阅、取值、字段与信号转换、能力及原生关联线索。允许必要桥接函数，不要求全是配置表；不将原生 payload 整体透传进共享逻辑，不移动 model-cost 计价／业务丢弃／聚合／保存政策到 framework。

用户允许本次迁移重构不符合该原则的现有分层，以行为 test case 保证旧插件正常；允许为统一、简单的心智模型牺牲部分边界准确性，但没有概括撤销正常路径、去重、账户隔离或 owner 效果隔离要求。具体成本不合适时回到讨论调整，而非强行实现。当前 onRound／quiescent 的 adapter 状态与过滤、HarnessPort 仅交付语义边缘需作为真实重构输入；这不是生产重构已经执行或新接口已经冻结。

确认来源：用户“能放在framework层的逻辑就不要放在adpater层”及 Q17“允许桥接……尝试尽量统一语义并放到framework层，为此可以牺牲一些边界情况的准确性”；原话与旧行为基线见 [本轮确认来源与证据](../assets/observation-pause-evidence-2026-10-11.md)。修订前全文见 [本次修订前原文](../assets/observation-revisions-before-pause-2026-10-11.md)。Q17 早期“每会话一个在途槽”提案已撤回，未获批准；本修订只定分层与取舍方向，不证明某种原生关联算法可行。

### Turn 观察、载荷与事实职责

Turn 从可靠请求开始即存在，取消／失败或无完整响应不删除该周期、不伪造成功。公共观察只提供 turn_start／turn_end：adapter 提取并映射原生事实，framework 尽量统一管理关联与事实收集，结束时尽力交付当时已有的 usage、headers／metadata 与结束结果，不按字段拆公共事件。用户已接受 Codex headers 更新从旧即时回调延后至 Turn 结束，保留额度解析／估计功能。工具执行不属于 Turn，不能照搬包含工具结果的原生同名 turn_end。

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

framework 建立不透明 turnId，新可观察调用产生新身份，同一实际会话不同观察实例／重载之间不复用；业务用 sessionId + turnId 关联。provider request ID／response ID 保留为源事实，adapter 提取可靠原生关联线索供 framework 使用，但不把它们当 framework 身份，不假定相等或始终存在。具体生成方式及原生关联方案仍待落实；造 ID 本身不是关联正确性证明。各实际会话独立管理，不按 Owner 共享“当前请求”。不建立持久 Turn 账本，不恢复重放历史消费。

不能可靠匹配的结束事实报告后丢弃，不按当前 Round／账户／模型或到达顺序猜归属、不临时补造开始、不自动补账。不取消真实执行、不伪造结束；正常支持路径仍必须可靠，不以跳过掩盖未实现的子代理／并发能力。

### 本轮 Q15：已知冲突与局部清理

确认来源：“同意采取丢弃策略”以及局部清理分析后“Q15 同意”。结束交付前已知同一 Turn 的最终 usage 矛盾、无法可靠判定有效源时，报告并按 usage 不可用处理，不相加或任意最后覆盖；独立可靠的 headers 等事实仍可交付。流式暂时值到最终值的正常更新不是此冲突。

释放受影响 Turn 的临时详情，保留该 Turn 已处理标记、已有累计和其他可靠在途关联；后续新 Turn 正常建立关联／累计，不置整个会话或账户为持续故障。孤立响应丢弃不设置全局损坏标志。没有长期响应副本，不承诺逐字段检查以后每份重复通知，不建持久冲突账本／计数／持续不完整状态。

单 Turn 局部清理不等于普通消费保存失败的磁盘基线重新初始化；后者及无有效基线时暂停的唯一权威为[存储决议 Q6／Q14](06-local-storage.md)，不能按单 Turn 故障清空累计或去重标记。

### Q16：模糊全零 usage 的轻量处理

用户确认“Q16 同意，usage默认正常response都会返回，不需要设计太复杂的机制”。正常支持路径使用可靠可取得的 usage；无法可靠区分 provider 真实零与宿主默认零的全零值按未知处理、提示并跳过，不凭成功结束证明确认零，不为此新增底层传输拦截、宿主修改或复杂来源恢复。缺 usage 只影响对应消费，不阻止独立可靠 headers／结果交付，不改变取消有可靠 usage 也累计的业务规则。非零或正常响应不是全部 provider 可用性证明。

本轮固定 18.5.0 真实 openai-completions／本地 SSE 对照证明省略 usage 与明确真实零产生相同最终 usage，见 [本轮确认来源与证据](../assets/observation-pause-evidence-2026-10-11.md)；其他来源路径仍待验证。

### 子代理消费归属简化的依赖

用户在本票 Q27 确认取消子消费到父 Round 的分配，原数据布局政策已在[数据归属与账户周期决议](12-state-data-contract.md)原主题修订。观察仍提供逐实际会话的 Turn／Round 与直接父 Session 事实，子代理自己的 Round 不取消；本次 model-cost 不要求父 Round 启动标签、启动实例或归属段。Q24 固定最初父 Round 的推荐未采纳；后来曾确认的 Q24／Q25 父 Round 切换方案也被 Q27 替代，Q26 没有回答且不再需要。请求自身 session／Round、账户周期和模型／锚价固定原则不受影响。

### clear 限制与未批准分支

用户批准的 clear 执行条件只在[命令局部决议](07-command-state.md)持有；本票不复制政策。“开放 Round 清零后重设该账户零基线”的原 Q14 建议未获批准，不能用于实现。限制本入口 clear 不消除其他进程的周期变化；既有周期校验／失败初始化不被撤销，跨入口开放 Round 展示仍待旧决策回顾。

### 证据及限制

[本轮确认来源与证据](../assets/observation-pause-evidence-2026-10-11.md) 持有本轮确认原话、新全零对照输出、旧行为测试基线与只读核对边界；[本次修订前原文](../assets/observation-revisions-before-pause-2026-10-11.md) 保留本轮发布前完整原文。既有[请求观测探针](../assets/omp-request-observation-smoke.md)、[子代理调查](../assets/omp-subagent-round-findings.md)、[结束时序探针](../assets/omp-end-timing-smoke.md)与[旧扩展等待调查](../assets/old-observer-waiting-smoke.md)继续有效。旧资产中父 Round 分配建议只是当时设计输入，不覆盖 Q27。

新探针只运行固定 18.5.0 pi-ai provider 实现与本地 endpoint，未运行新 framework；旧 framework 21／connect-bot 27 测试通过只证明未重构基线。固定基线源码确认流式 ESC 调用 session.abort、可对普通保留子代理追加消息；已有 RPC abort 探针不等于直接键盘 ESC 验收。没有生产迁移、全部 provider 来源认证、实际 Effort／账单、混账户／多 main／恢复／TUI／自动关机验证，也未实现或认证 pi adapter。

## Decision

批准连续活动 Round、Turn 开始／结束及请求固定事实，延续轻量一次处理／不补账；本轮确认公共逻辑尽量归 framework、必要原生桥接归 adapter、轻量结束候选复查及明确取消仍终轮。公共 round_end 统一方向须接受可行性／成本核验；子消费的父 Round 分配已按数据权威取消。整票未完成，不证明原生关联、恢复、最终接口或重构已经实现。

## User stories

1. As a 用户, I want Turn 轻量内存累计而 Round 结束收口保存, so that 不给逐响应路径新增文件锁或远端请求等待。
2. As a 用户, I want 每个 Turn 只处理一次且不补账, so that 无需修正事件、长期请求详情或复杂恢复。
3. As a 开发者, I want framework 身份与 provider ID 分离, so that 不同 provider 和主子会话可可靠关联而业务不依赖原生 ID 规则。
4. As a 用户, I want 无法关联／已知冲突丢弃并仅清理该 Turn, so that 不猜账且一次异常不让后续新请求持续被丢弃。
5. As a 用户, I want 连续活动 Round 与面板完成证据区分, so that 工具／续跑／子代理等待不误报 awaiting-input 或触发自动关机。

6. As a 开发者, I want 公共身份／关联／Round 逻辑尽量由 framework 共用、adapter 只保留必要桥接, so that 接入新 harness 不重复状态机且旧插件可用行为回归验证。
7. As a 用户, I want 结束候选经一次延后复查和后续信号核验, so that 正常结束不因回调尚非 idle 漏掉且无需持续轮询。
8. As a 用户, I want 取消 Turn 仍属于原 Round 且可靠消费保留, so that ESC 后新轮接续已有累计、不因末尾缺 usage 丢掉整轮已知消费。
9. As a 用户, I want 统一公共 round_end 的方向可按实现成本调整, so that 不为事件成对或设计对称补造结束机制。

## Preconditions

- [行为](01-behavior-contract.md)、[消费归属](02-accounting-ownership.md)、[数据](12-state-data-contract.md)、[存储](06-local-storage.md)提供保留功能、有限关联与保存／失败边界；这是已定设计，不是生产能力。
- 账户来源、模型名单／价格、远端刷新分别由账户访问、模型覆盖、刷新票收口。
- 本票仍需验证真正可用的请求关联与各来源 usage、轻量复查的事实输入／调度／旧检查隔离、恢复与缺信号处置、直接父 Session 取得／恢复、公共接口／requiredSemantics；子消费父 Round 分段问题已取消。

## Postconditions

- 装配与验收应落实本轮批准处理约束，证明原生事实、正常去重与逐实际会话支持；不能以目前同步派发／owner gate 宣称已支持。
- 命令票消费本轮已发布的 clear 入口限制；反馈承载仍由命令／展示票决定。
- 不新增修正／补账／持久冲突账本，不自动升级业务 State；未决分支留在源票 Handoff。

- [装配规格](../decision/10-assembly-layout.md)及[验收](../decision/11-acceptance-cutover.md)按 Q17 分层方向审查现有 adapter／共享逻辑与受影响旧插件；仅现有测试通过不足以证明新输入 seam、取消与复查链路正确。具体模块／接口及测试方案仍归这些票，不在本次替它们结案。

## Invariants

- 一个可观察 Turn 最多累计一次；汇总／工具结果不是第二笔消费，隐藏传输尝试不承诺独立观测。
- framework 尽量统一公共语义／身份／生命周期逻辑，adapter 提供事实映射与必要原生桥接，model-cost 拥有计价／聚合／解析与统计取舍；不泄漏原生 payload，Owner activation 不代替实际会话身份。
- 已处理标记仅内存保留到观察实例销毁，不在 round_end 清空、不按任意 TTL 淘汰；局部故障不清他人的在途状态。
- 无法取得不等于零；不可靠关联不猜，观察错误不取消真实代理或制造生命周期边缘。
