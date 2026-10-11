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
