# 展示决策发布前历史

仅作修订溯源，不是当前政策。保留展示工作票的全部 legacy 恢复上下文、跨票目标原文及本轮相关文档；ADR 仅保存本轮涉及的责任测试段落，避免把 read 的无关长行摘要冒充完整原文。装配与模型覆盖票的正文、状态及 claim 不因部分发布改变。

## .scratch/model-cost-migration/decision/08-presentation.md

````markdown
# 动态 widget 如何分层，无 UI 时哪些业务仍需更新？

Type: grilling
Status: claimed
Assignee: hugos（本会话 agent 协助讨论）
Blocked by: 01, 03, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)限定 Session 为适用账户当前周期内跨 Round 的累计、Round 为其中该轮；clear 后 resume 不显示旧周期总数或重估宿主历史。旧归档仅保留可查文件，不默认新增归档 UI／查询命令。
- UI 读取 shared logic 的自身／子代理合计／整体视图，布局和默认展开未定；只保存最近轮、恢复明确叫最近 Round，tree 后该位置轮数值不可用，不显示成零。混账户周期、clear 跨开放 Round 的描述需和观察票一致，不伪造新轮。
- 缺 usage／价格只提示／跳过相应指标，不保持缺失计数或持续完整性标记；有 usage 缺价仍累计 token，失败／取消有可靠 usage 仍累计。提示位置、headless 可观察性仍由本票决定。
- 固定 DeepSeek 450K／Codex 272K 预算显示／告警保留，修改入口移除；入口 detail 切会话／tree 保留、重载 brief。renderer 不维护第二套权威累计或副作用。

## Handoff from storage Q6

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。

## Handoff from storage Q10 / Q12

[存储局部决议](../lighthouse/06-local-storage.md)Q12 确认同版本不同内容须报告明确冲突、不假报保存成功；普通 round_end 不因此中止主流程。超时失败沿 Q6 承载，Q10 不是中止代理或文件更新总耗时保证。

## Handoff from revised failure policy

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。 展示不伪装保存成功；重新初始化后统计可能回到已保存基线，不把丢失显示为确认零消费。

## Handoff from storage Q13 / Q14

[存储局部决议](../lighthouse/06-local-storage.md)Q13／Q14 确认 clear 以实际活动文件提交为成功点、失败不自动恢复；无有效磁盘基线暂停消费统计／保存至下一次正常初始化。反馈不能把失败／暂停少计当确认零或 clear 成功；模型继续，独立余额／额度不因此自动停用。

## Question

明确动态多行进度条、窗口节奏、费用／余额告警色、Effort 着色、分段条与宽度降级归 extension harness presentation，还是本次抽出 framework 通用展示 capability？现有 marker area 只是框架统一的单行激活标记，不应强塞复杂 widget。

确定 shared logic 提供什么已对齐的展示模型，native renderer 只读取与布局／主题，不在 render 改 lastContextTokens、请求 API、创建 timer 或落盘。明确无 UI／RPC 时必须保留的记账与持久化行为、远端刷新与展示计算是否运行；账户故障保持 widget-only 旧要求与无 UI 可观察性的关系要用户确认。输出具体视觉及 headless 验收场景。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 的 Q9/Q10 要求保留双窗口节奏／重置展示、ratio／left、累计与 session 分段条、费用／余额告警、widget-only 请求错误和命令反馈的现状基线；本票承接视觉、宽度降级、标签及无 UI 可观察性取舍，改变需用户确认。新 Turn 是一次 LLM 请求／响应，不含工具执行；Round totals／Session totals 与“旧的 Turn”分开，最终 UI 标签在本票决定。更新由事件触发，结果更新后检查 UI 是否需要渲染，需要则请求一次刷新；无 UI 时是否刷新远端数据尚未决定，原 Question 中的无 UI 更新要求不得视为已经获批的完整策略。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：在适用账户当前周期中能清楚区分主会话自身（排除全部子代理）、每个子代理自身／含后代、主会话含后代的消费；异构子代理和切换前模型不能被当前模式过滤掉源记录。
- 待决定：这些统计以何种视觉和查询入口呈现，本周期聚合与当前 provider 余额／额度如何并列或筛选？保留逐代理聚合查询，不默认加入历史 Turn／Round 明细或归档查询 UI。
- 金额只汇总计费渠道；Codex 美元仅参考，不能进入消费金额总计。未知／额度消费／无统计口径保留领域区别，不标成免费；运行时不维护缺失计数或持续完整性标记，缺 usage／适用价格仅提示／跳过相应指标，有 usage 缺价仍保留 token。具体提示承载与 headless 策略未定。
- 历史消费归属决议曾要求 tree 历史 Round 查询；该要求已由[数据讨论的当前有效决定](12-state-data-contract.md)明确收窄：只保存最近 Round 开始／结束快照，不保留历史 Round 列表；/tree 后 Round 数值隐藏或不可用，Session 累计不回滚，恢复快照明确称为最近 Round，不能冒充当前位置。旧 Lighthouse 当前正文已按用户要求同步，原版保留历史快照；正式数据 Lighthouse 已记录修订。上下文、账户、消费正交，不能累加子代理上下文作主会话预算。无 UI 的具体交互与刷新仍待本票和调度票决定。

## Handoff from state-data discussion

- 用户明确要求 UI 体现主会话自身消耗与子代理消耗区别；按实际会话独立聚合，不从父 Round 总数推算。详细语义及最新决定以[数据讨论](12-state-data-contract.md)为准，此处仅索引需求。
- 本票后续决定主会话自身／子代理汇总／整体合计的布局、逐子代理展开方式及窄宽降级；这次确认不等于布局已批准或 UI 已实现。
- 数据讨论已明确简化缺失事实处理：缺 usage 或计费所需价格时只打印提示并跳过相应指标，不维护缺失计数／持续完整性标记／补账记录。领域文档保留未知、无统计口径等概念供分析，不能因此要求 UI 实现完整状态模型；具体承载提示方式待本票确认。最新替代范围以数据票为准，前部旧交接的持续完整性要求不能覆盖该修订。
````

## .scratch/model-cost-migration/decision/10-assembly-layout.md

````markdown
# 确定的新能力与 model-cost 如何组织、声明和装配？

Type: grilling
Status: open
Assignee:
Blocked by: 03, 04, 05, 06, 07, 08, 09, 12, 13
Prerequisites: [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](05-http-capability.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)；[/budget 的参数、操作与状态如何在新框架表达？](07-command-state.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](08-presentation.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](09-refresh-lifecycle.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](13-model-catalog-policy.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Handoff

- 当前状态：open、未认领，保留全部原依赖；本次只同步存储票确认结果，不替本票做设计或解除依赖。
- 当前权威：[存储局部决议](../lighthouse/06-local-storage.md)、[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)、[消费归属决议](../lighthouse/02-accounting-ownership.md)与[行为契约决议](../lighthouse/01-behavior-contract.md)。已确认部分享其来源；本票只记录自身后果，下方历史未决标记不覆盖现行 Lighthouse。
- 本票后果：将 storageDir 的字段局部解析放在 model-cost 配置／装配入口，再把已解析路径交通用文件 module；不修改 framework 其他字段 ~ 语义，不硬编码 OMP 目录进通用文件 module。
- 仍待决定：依赖注入、模块组织与公共 exports、requiredSemantics／fail-soft、实例创建销毁及观察／恢复／入口绑定、单执行者检测归属、原生 import seam、消费者迁移、源 oracle revision 与依赖来源。前置接口尚未全部收口；装配草图可提前用于数据流讨论，最终规格仍须等前置。
- 最新路径输入：存储 Lighthouse Q17–Q20 已确认复用用户 .omp/cost-archive，切换前用户手动备份清空；storageDir 的 ~/ 特指用户 .omp 主目录，仅此字段例外，其余配置机制不变。固定文件组织已由[存储局部决议](../lighthouse/06-local-storage.md)Q21 确认：只配置根，根下 consumption.json、独立 codex-usage-estimate.json 与 archives/ 每次唯一归档；本票装配／验收采用该组织，不复用旧 deepseek-cost.json 或误清 estimate／旧归档。schema／平台锁／运行态仍等存储票，不将文件名确认视为完整存储已实现。
- 协调运行条件：采用[存储局部决议](../lighthouse/06-local-storage.md)Q22 的本机本地文件系统范围；装配不增分布式锁／云同步合并，验收证明已声明 Windows x64／Bun 基线上的同机跨进程正确性，不要求或宣称网络盘／跨机器写入或其他 OS 已认证。具体锁／读新鲜度仍待存储票；本范围不削弱同机多会话与账户隔离。
- 保存前置：以存储 Lighthouse 当前 Q5–Q15 为准，历史“失败保留内存／Q11 待澄清／Q10 预算未定／归档输入未定”已被后续结果替代；不恢复完整账本、补账、后台恢复或 clear 内存收集。原有理由、证据限制及未决问题保存在下方历史，读取历史应对照现行权威。
- 下一 ready 问题：等待当前记录的未满足前置，再按本票 Question 讨论；不在本次存储 claim 下代决本票。

## Question

将已确认契约映射到现有 framework core／behaviors／adapters 和 extensions/model-cost 的 definition／shared-logic／harnesses／entrypoint。是否需要新的通用能力目录或公共 authoring exports，如何保持原生 import 只在 adapter／extension harnesses？不得建立第二套能力声明、配置或框架。

确定 dependency injection、业务模块拆分、requiredSemantics 与 fail-soft binding、配置路径和消费者迁移职责，冻结源 oracle revision 与依赖来源。现有唯一 boolean State 不应被业务数据冒用。此票产出可实施组织规格，不复制代码、生成空文件或开始实现。


## Comments

以下为历史输入与证据，保留未决范围与当时理由；现行恢复点以 Handoff 与对应 Lighthouse 为准。

### 历史交接 from data Lighthouse

- [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)已明确 shared logic 拥有自身聚合／关系／当前最近轮／账户缓存，framework 激活 State 不作业务容器；UI 只读，native import 只走 adapter／harness seam，不建立第二套框架或配置。
- 运行期请求身份标记寿命绑定观察实例，detail 绑定交互入口；普通切换／tree 与重载／销毁不是同一边界。装配需说明实例创建、销毁、请求观察与业务数据恢复怎样绑定；具体接口未定。
- 不把所有业务数据塞进 State 或在装配层再实现计价／汇总；同 session 单执行者检测与拒绝仍是未决原生／通用协调问题。

### 历史讨论方式

本票的最终组织／装配规格仍在相关契约收口后决定；但旧源码到新模块的数据流与装配草图必须提前作为数据／State、存储和观察讨论的输入，不要求讨论者仅凭抽象接口选择方案。早期草图不是本票已结案或生产实施授权。

### 历史交接 from partial storage decision

[存储组织与唯一消费源局部决议](../lighthouse/06-local-storage.md)确认消费单活动 JSON、独立归档和独立 Codex estimate；Session 自身累计与最近轮快照来自同一聚合，round_end 同次保存。聚合／schema／保存模型属于 model-cost，framework 文件 module 仅提供安全更新，其他 extension 可采用不同模型。具体 schema、协调、保存完成／失败、clear 一致性仍待存储票，不把该局部结论视为整个依赖已满足或生产能力已实现。

### 历史交接 from storage Q6

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。

### 历史交接 from storage Q7

[存储局部决议](../lighthouse/06-local-storage.md)Q7 确认 framework 内部同文件轻量 Promise 尾链实现进程内提交顺序，失败后继续、空闲键清理、不同文件独立；跨进程互斥但不承诺全局 FIFO。不得复制到每个 extension，不引入持久任务队列或后台重试；具体锁、路径协调键、等待／取消及旧快照／周期校验仍由存储票决定。

### 历史交接 from storage Q8 / Q9

[存储局部决议](../lighthouse/06-local-storage.md)Q8／Q9 确认按负责的会话记录合并、账户周期／保存版本校验；framework 提供协调权限内最新文档和安全更新，extension 拥有业务有效性规则。排队／取锁有限等待预算合计，等待超时或取消后无迟到写入，更新开始后等待真实结果；具体预算、resume 版本、单执行者与 clear 一致性仍未决。

### 历史交接 from storage Q10 / Q12

[存储局部决议](../lighthouse/06-local-storage.md)确认 Q10 默认从提交起排队＋取锁合计 15 秒，调用方可覆盖，model-cost 暂用默认不增 YAML 项；Q12 同版本不同内容冲突拒绝并报告，不猜合并。Q11 用户提出理解核对，恢复版本接续仍待澄清，不因“同意”自行批准缺版本文档兼容或双执行者恢复。

### 历史交接 from storage Q11 confirmed

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。

### 历史交接 from revised failure policy

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。 业务失败初始化归 extension shared logic，不升级通用文件 module 为复杂恢复系统。

### 历史交接 from storage Q13 / Q14

[存储局部决议](../lighthouse/06-local-storage.md)Q13／Q14 已确认简化 clear 的归档先于活动原子重置，失败终止不补做；无有效基线暂停本实例消费统计／保存至下一次正常初始化，模型与独立余额／额度继续。extension shared logic 拥有失败政策，framework 拥有安全协调；归档输入／新周期运行态／锁与 schema 仍未定。

### 历史交接 from storage Q15

[存储局部决议](../lighthouse/06-local-storage.md)Q15 确认 clear 不增加跨进程内存收集、强制保存／排空或补账，业务归档输入仅锁内最新已保存活动文件。用户要求 clear 尽量简单；通用锁／安全发布仍归 framework，消费丢弃属于 extension shared logic，不用该偏好撤销正常多会话安全更新。


### 历史交接 from state-data discussion

- [数据讨论当前有效决定](12-state-data-contract.md)明确：本次特定的聚合、最近 Round 快照、数据寿命与统计 tradeoff 属于 model-cost shared logic，不提升为通用业务 State。
- Round、response／usage、实际会话及父子身份等宿主事实使用 harness-independent 接口，adapter 映射宿主，shared logic 不依赖 OMP 原生 context／payload；接入其他 harness 不重写该业务逻辑。本次仍只落地 OMP，不实现或认证 pi adapter。
- 业务数据的读写归 shared logic，UI 读取其只读视图，HTTP／文件与协调能力按地图既定 framework 分层承接；具体接口和模块组织仍由相关票收口。

### 历史交接 from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：支持同进程及跨进程多个独立 main、每个 session 单执行者；Owner State 与业务消费归属不同。
- 待决定：如何装配请求事实采集、扩展自有聚合／关系／最近快照、只读统计视图、账户解析、激活 State 和通用持久化协调；单执行者检测／拒绝由何层提供？不要在装配层重实现业务计价／聚合，也不要在 shared logic 引入 native 身份或锁。受影响既有消费者的生命周期能力仍按原 Notes 审查。
````

## .scratch/model-cost-migration/decision/13-model-catalog-policy.md

````markdown
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
- 展示模式与消费采集分离：只要有源头数据就保留；hidden 不授权按当前主模型过滤其他已取得且应累计的响应；缺 usage／价格按正式数据决议提示／跳过，不要求持久化逐请求事实或补算记录。保持原 provider 分层需求，但不把“全部已知美元”混入消费金额汇总。
````

## .scratch/model-cost-migration/map.md

````markdown
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
- 后续设计讨论遵循[Happy flow 优先的设计推进原则](lighthouse/03-observation-contract.md#happy-flow-优先的设计推进原则)：先建立原则，再在原则内推进具体设计，避免用假想极端组合反复推翻主线；确认来源与重审条件在该权威主题。
- 每次咨询 grilling、domain-modeling；设计接口咨询 codebase-design；决策落地依次使用 lighthouse、backtracer。HITL 决策须由用户确认。每次工作只解决一个非 research 决策票，chart 会话不关闭票。
- [现状调查与功能证据](assets/current-state.md) 是事实资产，不是已批准的契约。它也记录调查 smoke 的实际输出；远端余额／额度、动态 TUI、完整 OMP 原生链路均未在本次调查运行。
- 框架当前仅实现 OMP adapter，支持基线为 18.5.0；本机安装版本不等于支持基线。迁移验收版本是否改变必须显式决定。
- 子票存放于 decision/；按编号扫描 open、无未满足依赖、未认领的票选 frontier。开始工作前先写 Status: claimed 和 Assignee。开放票不在地图正文重复列出。
- [数据归属与账户周期决议](lighthouse/12-state-data-contract.md)已正式结案；最终取舍与历次暂停溯源只在 Lighthouse。后续按已定数据流推进存储与协调，再返回观察处理约束；不重问聚合／明细账、不恢复观察票旧 Q10，不把本票结案视为存储或原生观测已实现。继续工作时按 tracker 查询 frontier，或使用用户明确指定的票。

- 本轮[存储 schema](lighthouse/06-local-storage.md#q25consumptionjson-的物理-schema归档与版本)已最终确认并结案；Round 持久化与恢复取舍在[数据原主题](lighthouse/12-state-data-contract.md#最近-roundtree-与恢复展示)修订，首次 holiday 自动切周期在[命令原主题](lighthouse/07-command-state.md#holiday-与-clear当前入口适用条件)修订。[确认来源](assets/storage-schema-confirmation-2026-10-12.md)与[发布前历史](assets/storage-schema-before-publication-2026-10-12.md)可恢复；未实施生产迁移，其他存储协调原则保留。

## Decisions so far

- [完整保留哪些业务行为，统计单位如何命名？](lighthouse/01-behavior-contract.md)： 保留请求锚价、公共 Turn／工具／Round 与 Codex 额度；当前基线消费 provider 单一统计范围、整文件 clear 与预算修改移除，不扩大所有 provider 展示。

- [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](lighthouse/02-accounting-ownership.md)： framework 每 provider 单账号；取消账号／凭据统计身份与自动替换隔离，按 provider 单一范围聚合；多 CLI 正常并发、去重与直接父 Session 汇总保留。

- [model-cost 的哪些数据进入 framework State，如何声明与读取？](lighthouse/12-state-data-contract.md)： Session 自身与父子关系持久化；Round 仅推断，正常连续对话可看上一 Round，resume/tree 只要求 Session 恢复；业务不升级 framework State。

- [framework 如何提供独立存储、原子更新与跨进程协调？](lighthouse/06-local-storage.md)： 已结案；harness 优先／Session 扁平 list／provider-model 自身桶、周期与快照版本、起止元数据；单活动 JSON／独立归档与 estimate，安全异步更新与失败政策保留。

- [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](lighthouse/03-observation-contract.md)：已按正常数据流、最小必要事实与异常基本原则收束；公共逻辑优先 framework、adapter 必要桥接，尽量统一 round_end；宿主可先 idle／接受新输入，公共 handler 等待自身异步保存，具体装配与生产验收仍未实施。

- [账户凭据、provider 地址和代理如何跨 seam 提供？](lighthouse/04-provider-access.md)： 按 framework 每 provider 单账号支持前提，adapter 提供当前认证确需资料／地址，不生成持久统计身份；业务查询留 shared logic，秘密不落盘。

- [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](lighthouse/05-http-capability.md)：已结案；直接导入单一 request、原生 response、共享代理配置与逐请求选择、业务优先的可配置有限超时；显式选代理缺配置失败，model-cost／connect-bot 统一传输，业务留 shared logic，不预建主动取消。

- [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](lighthouse/09-refresh-lifecycle.md)：部分确认初始化两源并行预取、首次模型请求前收口；其余调度未决。

- [/budget 的参数、操作与状态如何在新框架表达？](lighthouse/07-command-state.md)： 已结案；actions 路由／等待／反馈，detail 入口偏好；holiday／clear 限当前 DeepSeek idle／保存收口，首次 holiday 自动完整归档并切新周期，已开启幂等；不把规划当生产实现。

- [观察契约的 Handoff](decision/03-observation-contract.md#handoff)记录本轮收束、证据限度及下游职责；不恢复异常情景树或父 Round 分配，不把规划结案／临时探针当生产实现。

## Not yet specified

- 原生宿主缺失尚未具体暴露的观测能力时，其降级／拒绝与诊断如何衔接，遇到具体路径再展开；账户访问的局部查询失败原则已由账户访问权威持有，提示承载由现有展示票决定，不在此重复开雾。
- 非 HTTP 新增通用能力对 connect-bot 等既有消费者的复用或收口影响，待具体能力暴露后再判断，避免制造第二套机制或扩大业务范围。

## Out of scope

- framework 每 provider 多账号选择／轮换／管理、统计账号识别／持久化分区、账号替换自动隔离或重置、跨进程账号登记检测；支持范围与取舍见[消费归属的账户主题](lighthouse/02-accounting-ownership.md#账户隔离多会话与额度)；只有当前认证资料随宿主实际生效，不承诺替换统计隔离。

- 多台机器通过网络共享盘／云同步共同写入统计的正确性保证、分布式锁或同步冲突合并；[本地协调范围决议](lighthouse/06-local-storage.md)限定本机本地文件系统，不取消同机多进程安全共享。

- 实现或认证 pi adapter；只考虑契约是否把 OMP 原生细节泄漏给共享代码，不宣称 pi 能力对等。
- 导入旧统计、继续旧基线或要求新旧统计文档双向兼容；用户允许从空统计开始，旧数据保留。
- 图内执行生产迁移；决策规格完成后进入独立 implementation 工作流，整体迁移目标不取消。
- Codex 会话消耗与账户额度之间的转换或分摊；[消费归属决议](lighthouse/02-accounting-ownership.md)确认不做此换算，账户级双窗口／ratio／left 与参考费用继续保留。
````

## .scratch/model-cost-migration/lighthouse/01-behavior-contract.md

````markdown
# 完整保留哪些业务行为，统计单位如何命名？：Lighthouse

> Question and discussion: [完整保留哪些业务行为，统计单位如何命名？](../decision/01-behavior-contract.md)
>
> 当前有效版本：按用户要求，与[数据归属与账户周期决议](12-state-data-contract.md)及观察票已确认的公共术语同步。原题保留为提问历史；此前批准版本及评论完整保存在[同步前历史快照](../assets/contract-history-before-sync.md)。未决接口不因正文修正获批，生产迁移尚未实施。

## Question

基于[现状调查](../assets/current-state.md)，逐项确认 DeepSeek／Codex／token-only／hidden、预算与 Effort、峰谷和 holiday、请求计价、余额、累计与分段条、双窗口节奏、ratio/left、预算命令、刷新和故障显示哪些原有行为要原样保留，哪些有意改变？用户已确认全量保留基线，不得默删 README 未记载的额度估计。

明确 Request、Assistant response、Turn、Round、Agent activity state、Total、旧 UI 的 Turn 及 orchestration 的业务含义；旧 agent_end 结算不能仅因名称接近就映射 round_end。讨论两源预取 TTL 表述与实现不一致、render 更新业务态的耦合，以及 UI 标签是否改名。输出一份用户确认的行为契约和场景；本票不决定框架接口，也不迁移代码。

## Discussion

### 本轮批准修订与来源

本轮功能基线消费[数据原主题的 Session-only 修订](12-state-data-contract.md#最近-roundtree-与恢复展示)与[命令原主题的首次 holiday 切周期](07-command-state.md#holiday-与-clear当前入口适用条件)，不再要求最近 Round 落盘／恢复。确认原话见[本轮存储 schema 确认来源](../assets/storage-schema-confirmation-2026-10-12.md)，修订前原文见[发布前快照](../assets/storage-schema-before-publication-2026-10-12.md)。

功能保留基线消费新的 provider 单一统计范围与整文件 clear；详情命令沿用旧入口偏好，不隐式扩大所有 provider 的展示覆盖。 批准来源：[命令票本轮确认来源](../assets/command-confirmation-2026-10-12.md)（Q13–Q16、Q17–Q20）。此前账号键／身份分区和定点 clear 的政策仅为已被替代历史；不要求认证秘密落盘。非本轮替代范围继续有效，规划不等于实现。

### 公共术语与活动边界

Request／Turn 采用可观察模型调用周期；Turn 从请求开始，可以完成、失败或取消而没有完整响应，隐藏传输重试不拆成独立可观察 Turn。工具执行独立于 Turn、属于 Round；工具结果只有实际进入后续模型请求时，才由该请求 usage 计费。公共词义以[framework glossary](../../../framework/GLOSSARY.md)为准。

Round 是实际会话的连续活动周期，工具、已知自动续跑、排队输入消费、专门交互以及会驱动父继续的子代理等待不随意切轮。明确结束与漏信号／恢复截断不同；framework 活动轴 idle／working 与 connect-bot 面板协议分开。具体原生映射、候选复查及接口仍由[观察契约](../decision/03-observation-contract.md)收口，本票不替它结案。

### 请求锚价、聚合与展示口径

保留请求开始锚价、逐响应可靠 usage 计价，内存累计与 Round 生命周期分离。工具结果、Round 结束和父子汇总不产生第二笔消费。逐响应计算不等于逐响应落盘；本次以 round_end 发布 Session 聚合，Round 仅运行期推断，接受成功保存前的异常退出损失，不预建独立排空钩子或崩溃日志，详见[数据决议](12-state-data-contract.md)。

Session totals 是当前消费统计周期内该会话跨各 Round 的累计；Round totals 是其中某一轮，不是整个周期。自身／子代理／整体为 Session 视图，Round 仅本实际会话自身；子代理口径按[数据归属决议](12-state-data-contract.md)本次 Q27 修订，不再提供父 Round 含子汇总；正常连续对话须显示上一 Round；不持久化轮次快照，resume/tree 不要求恢复 Round，不把不可用显示成零，Session 本周期累计不随 tree 回滚。普通 resume 读取已保存活动聚合，不按宿主历史 token 用当前模型／费率重算，不自动合并旧归档。历史旧 UI Turn 指原生结算差分，不等于新 Turn 或完整 Round。

用户观察旧计价基本对应官网是保留算法的依据，不是独立账单认证。[旧聚合探针](../assets/old-accounting-granularity-smoke.md)的两次峰／谷请求累计为 13.5 元，按结束时谷价重算为 9 元；[旧 clear／resume 调查](../assets/old-clear-resume-smoke.md)区分 Total 显示重估与 Accrued 落盘，不宣称新生产能力已通过验收。

### 保留功能与已确认修剪

provider 的 Codex／官方 DeepSeek／token-only／hidden 分层保留，具体 model ID、名单和维护来源由[模型覆盖票](../decision/13-model-catalog-policy.md)决定。framework 单账号支持与不识别统计身份的修订按[消费归属当前修订](02-accounting-ownership.md#账户隔离多会话与额度)，访问职责按[账户访问决议](04-provider-access.md)；不由全量旧功能基线恢复多账号管理或 DeepSeek 平台账号识别。

固定 DeepSeek 450K、Codex 272K 上下文预算显示／告警保留，只显示不限制执行；数字／K／0 修改预算功能已取消，不再把旧最高 1000K 的可调预算入口作为迁移要求。Effort 取实际生效值、未知为 ?、只给值着色。

保留北京时间工作日 09:00–12:00、14:00–18:00 含端点峰价，其他时段／周末谷价；holiday 手动谷价、不追溯，持续到成功 clear；首次开启的整文件归档／切周期修订只消费[命令原主题](07-command-state.md#holiday-与-clear当前入口适用条件)。每请求锚价、DeepSeek 不另计 cacheWrite 继续生效。

Codex 双窗口、按报告时长识别、节奏／重置、ratio／left、同源成对测量及窗口变化规则保留；5h 增量至少 50pp、双窗口正增量且未饱和才采纳估计，无估计 estimating… 的既有业务基线不因此取消。

累计／session 分段条（≤20 元 fine、>20 元 coarse）、detail／holiday／整文件 clear、费用／余额告警及故障反馈保留。clear 归档锁内最新已保存完整消费 JSON 后重置活动统计并关闭 holiday；有效零消费也走相同流程。不清已有归档、独立 Codex estimate 或入口 detail，不收集进程未保存内存；具体操作与失败语义由[存储权威](06-local-storage.md)持有。clear 前旧周期未保存／在途消费允许丢弃，之后新请求正常统计，不取消执行；provider／入口活动限制由[命令权威](07-command-state.md)持有。

正常有 usage 则累计；失败／取消有可靠 usage 也累计，无 usage 跳过。缺 usage／适用价格只提示，不建立缺失计数、补账或补算状态；有 usage 缺价仍累计 token、只跳过费用。Codex 参考缺价不影响额度，token-only／hidden 无金额口径不因缺价报错。新策略不等于全部 provider 源事实已认证，不承诺官网费用完全一致。

### 数据寿命、业务归属与更新

model-cost shared logic 管理自身聚合、父子关系、当前／最近轮和provider 业务缓存；不升级通用业务 State，不把 boolean 激活 State 当业务容器。UI 只读同一视图。最新 DeepSeek 余额／Codex 窗口与获取时间、加载／错误仅 provider 级内存；累计／归档／holiday／quota estimate 持久化，具体物理组织由存储票决定。

detail 是入口级内存偏好：普通切会话／tree 保留，重载／重启回 brief，其他入口互不影响，不按账户共享、不按会话持久化或子代理继承。

更新由事件驱动，更新后按 UI 需要刷新；render 不请求远端、建 timer、落盘或改权威值。初始化预取已由[刷新原权威的部分结果](09-refresh-lifecycle.md)确认，不能恢复只按当前模型／首请求后预取；时间参数沿用既有 YAML，其他 TTL／防抖／single-flight、API／header 来源、无 UI 完整调度与提示承载仍未決，不推定任一候选方案已批准。

## Decision

保留请求锚价、逐响应计价、provider 分层与 Codex 额度功能，并采用最新已确认的扩展自有聚合、消费统计周期 Session／Round 和整文件归档重置。数字预算修改移除，子代理汇总仅 Session 口径、Round 为本会话自身，缺事实只提示／跳过，历史 Round 不查询；已批准修剪之外的功能不得由实施者自行删改。

## User stories

1. As a 用户, I want 保留逐请求锚价, so that 跨峰谷消费仍可按既定算法对照 provider 后台。
2. As a 用户, I want 区分本周期 Session 与单轮 Round, so that 理解消费所属范围而不把最近轮或旧归档当当前累计。
3. As a 用户, I want 累加已算请求费用而非当前价重估, so that 模型／时间切换不重解释历史。
4. As a 用户, I want 保留双窗口、ratio／left 与成对测量, so that 判断 Codex 节奏及剩余预算。
5. As a 用户, I want 保留 detail／holiday／整文件 clear／归档／分段条和反馈并移除预算修改, so that 明确的简化不默删其他操作能力。
6. As a 开发者, I want framework 统一 Turn／Round／活动词义, so that model-cost 与 connect-bot 不各自推断生命周期。
7. As a 开发者, I want 事件驱动更新与既有 YAML, so that 调度不由 render 次数驱动也不建立第二套配置。
8. As a 维护者, I want 修订有用户确认及历史来源, so that 最新契约不会与旧正文并列成矛盾要求。
9. As a 用户, I want 固定预算告警、真实 Effort 与 provider 分层, so that 切模型仍有明确上下文和计价提示。
10. As a 用户, I want 最新读数内存与必要业务持久化分开且旧文件不改, so that 从新统计起步并恢复已成功保存的本周期聚合。

## Preconditions

- [数据归属与账户周期决议](12-state-data-contract.md)已明确当前修订，优先于本票原功能基线；本票不重新决定其布局／寿命。
- [消费归属决议](02-accounting-ownership.md)承接实际会话／账户／父子消费原则；[观察契约](../decision/03-observation-contract.md)收口原生身份、usage 来源、结束／恢复与未决冲突处理。
- [账户访问](../decision/04-provider-access.md)、[HTTP](../decision/05-http-capability.md)、[存储协调](../decision/06-local-storage.md)提供当前认证资料、传输与聚合发布；[命令](../decision/07-command-state.md)、[展示](../decision/08-presentation.md)、[刷新](../decision/09-refresh-lifecycle.md)决定未决交互／调度。
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
````

## .scratch/model-cost-migration/lighthouse/07-command-state.md

````markdown
# /budget 的参数、操作与状态如何在新框架表达？：Lighthouse

> Question and discussion: [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)
>
> 命令范围已确认并发布，源票仍 resolved；本轮明确批准首次 holiday 的整文件归档／切周期修订，存储替代 schema 已由 Q25 最终确认。此为规划，不是生产实现。确认原话见[本轮存储 schema 确认来源](../assets/storage-schema-confirmation-2026-10-12.md)，修订前原文见[发布前快照](../assets/storage-schema-before-publication-2026-10-12.md)。

## Question

如何用 framework 的最小通用 command 能力表达 `/budget detail/holiday/clear`，并明确命令语法、执行完成、状态寿命、适用条件与结果反馈？统计支持范围由[消费归属原权威](02-accounting-ownership.md#账户隔离多会话与额度)持有，整文件归档／重置与协调由[存储原权威](06-local-storage.md)持有，不在本票复制替代 schema。

## Discussion

### 通用命名动作：framework 路由，shared logic 执行

新增一层命名动作的 `actions` command 类型，沿现有 `defineExtension` 的纯数据声明与注入实现分离模式。配置包括 `type: actions`、命令 `name`、可选命令说明及动作名到说明的动作表；另提供命令名／动作名对应的 shared logic 实现。framework 负责注册装配、参数匹配、帮助、路由、等待完成和通用异常报告；adapter 只映射宿主注册与必要公共事实，不解析预算业务。

示例只说明已批准配置形态，不冻结尚未收口的装配参数名：

```ts
commands: [{
  type: "actions",
  name: "budget",
  description: "费用统计与展示管理",
  actions: {
    detail: "切换简略／详细展示",
    holiday: "开启假日计价",
    clear: "归档并重置统计",
  },
}]
```

动作实现表由 shared logic 提供，例如 `budget: { detail: toggleDetail, holiday: enableHoliday, clear: archiveAndReset }`。通用动作不绑定 framework 激活 State；detail／holiday／统计数据仍归业务逻辑，不升级通用业务 State。模式、活动条件、文件更新及结果文案都由 shared logic 管理；不在配置增加 idleOnly、accountScope、persist 或 archive 等业务规则。不借 `directed.unrecognized` 伪装动作。现有 toggle／directed 的语义不由本票改写；不预建多层命令、flags、数字参数或复杂解析器。

### 命令名与路由

沿用 `/budget`，用户理由是 `/cost` 前缀会与许多单词碰撞；不增加 `/cost` 或兼容别名。数字／K／0 修改预算已被取消，不恢复。

framework 对动作参数去首尾空白、忽略大小写，完整匹配单个动作名；`DETAIL` 可识别，`det`、`detail on` 不识别。只允许命名动作，不缩写、不做模糊匹配、不接受额外参数。空参数根据动作表显示帮助，不执行动作；其他未匹配参数报告 error 并显示同一份帮助，不进入 shared logic。无需重复配置 usage、默认动作或 unrecognized handler。

### 完成语义与统一错误／反馈

action 可以直接返回或返回 Promise；framework 统一等待完成，宿主命令调用链必须传递并等待这一结果。所谓“同步操作”是用户得到结果后再继续，不是阻塞文件 I/O；配置不区分 async，不提供 fire-and-forget 或后台 action 模式，保留已确认的安全异步存储 interface。

framework 捕获未处理的同步抛错与 Promise rejection，经既有公共反馈／诊断通道报告一次 error，不自动重试、回滚、写业务状态或发成功通知。extension 不自行打印错误；如果业务必须清理或将底层失败转换为清楚的操作背景，可在 shared logic 做后重新抛出，不先打印再抛造成双报。存储 module 的可判别失败结果仍由业务 action 转换，不强迫其改成异常 interface。成功通知与正常业务提醒由 shared logic 通过公共反馈通道发出。

公共 Extension feedback 补齐 `info / warning / error`，复用 `FeedbackTransport`、adapter 的 `publishNotice` 和现有 handler 异常报告模式，不新建打印系统。有 UI 时映射通知级别，无 UI 时送 stderr；不进入模型上下文。

### detail：只切换入口偏好，不承诺新增展示覆盖

`/budget detail` 每次在 brief／detail 间切换，并反馈当前模式，不增加 brief 或 detail on/off。入口偏好寿命由[数据归属的 detail 主题](12-state-data-contract.md#holiday预算修改与入口-detail)持有：入口内存、普通切会话／tree 保留，重载／重启回 brief，独立入口互不影响，不按会话持久化或子代理继承。

用户 Q19 授权跟随旧实现；已核对旧命令入口无 provider 限制、DeepSeek／Codex／token-only renderer 使用 detailMode，hidden 返回空 widget。因此 detail 动作不检查 provider，也不加 Round／保存门控；hidden 或无 UI 只更新偏好与公共反馈，不强制创建 widget。此选择不承诺所有 provider 都有 usage UI。具体展示布局／headless 行为由[展示票](../decision/08-presentation.md)决定，provider／模型名单由[模型覆盖票](../decision/13-model-catalog-policy.md)决定，不由命令票扩大。

### holiday 与 clear：当前入口适用条件

二者仅在当前 provider 为 DeepSeek 时可执行，provider 检查只是入口限制，不选择账号／harness 清理目标。首次开启 holiday 改为自动归档整份消费活动文件并切新周期，新活动直接 holiday=true；影响所有 harness／provider 的消费累计，包括 Codex，但不清独立 estimate、旧归档或 detail。已开启仍幂等提示 info，不重复归档／重置、不反转、不新增 off。普通 clear 新活动 holiday=false。物理归档／发布／元数据只在[存储 Q13／Q25](06-local-storage.md)持有；不是先 clear(false) 再单独 setHoliday，实际活动文件发布后才反馈开启成功。

旧→新：此前仅修改当前周期 holiday、不自动 clear 的命令行为，按用户 Q28「开启」及最终 schema 确认替换为首次开启即新统计段；理由是希望 holiday 开启边界与归档／周期一致。旧消费只留归档，不追溯重计价，旧周期未保存提交沿用存储的拒绝／损失取舍，不引入全局 idle 等待。确认原话见[本轮存储 schema 确认来源](../assets/storage-schema-confirmation-2026-10-12.md)，修订前原文见[发布前快照](../assets/storage-schema-before-publication-2026-10-12.md)。

当前入口 Round 未结束，或结束后保存处理尚未收口时，holiday／clear 直接拒绝；不建立 pending 操作、不排队、不在未来 round_end 自动执行。既有历史会话只要当前可靠 idle 且没有待完成保存就允许；刚启动可靠 idle 也允许，不要求先发生 round_end。活动未知不默认 idle。

用户选择禁止 Round 中 holiday 是为简化本入口一轮内的切界；这不是整个 Session 生命周期禁止，不限制宿主切会话／模型。检查只针对当前入口，不保证其他 CLI／子代理都 idle，不新增全局活动登记或等待所有实例。每 provider 单账号支持与多个 CLI 正常使用的范围见消费归属权威；跨进程锁／周期／版本校验继续由存储权威持有。

### 业务反馈与 clear 提交结果

| 情况 | 反馈／操作 |
| --- | --- |
| holiday／clear 的当前 provider 不是 DeepSeek | warning 说明仅 DeepSeek 适用，不执行 |
| 当前入口 Round 中或保存未收口 | warning 提示空闲后重试，不执行、不延后 |
| 不能可靠判断活动状态 | error 拒绝，不猜 idle |
| holiday 已开启且条件允许 | info 已开启，不反转 |
| 无有效存储基线，读取／更新／归档失败 | shared logic 将失败转为带操作背景的错误，framework 报告，不猜零覆盖 |
| 操作完成 | 实际持久化提交后，shared logic 经公共通道发 info；detail 是内存操作，切换后反馈 |
| clear／首次 holiday 归档已生成、但新活动未提交 | 报告归档已生成及重置／开启未成功，不假报成功、不自动补做／恢复 |

整文件归档／重置、有效零消费同流程、未保存消费丢弃、先归档后提交与独立 estimate／旧归档／detail 保护，只消费[存储原权威](06-local-storage.md)；不将 clear 失败套为普通消费保存的成功，也不借内存初始化伪装已提交。

## Decision

framework 新增声明式一层 `actions` 路由与统一等待／异常报告，补齐 warning，shared logic 持有业务效果。沿用 `/budget`；detail 切换入口偏好，holiday／clear 仅 DeepSeek 且当前入口 idle、保存收口时执行，整文件 clear 语义消费原存储权威。

## User stories

1. As a 用户, I want 沿用 /budget 且一条 detail 命令切换, so that 前缀输入方便且少记命令。
2. As a extension 开发者, I want 动作表声明和 shared logic 实现分离, so that 不重复写解析代码、不泄漏原生宿主对象。
3. As a 用户, I want 空参数帮助和非法参数明确拒绝, so that 不因模糊匹配误执行业务。
4. As a 用户, I want action 完成后再返回结果, so that 文件操作没有后台迟到写入或虚假成功。
5. As a 开发者, I want framework 统一承接错误与三个反馈级别, so that extension 不各自打印或重复报告。
6. As a 用户, I want holiday／clear 在本入口工作中直接拒绝而 idle 时可用, so that 不维护一轮内重置／切界或延期队列，也不要求新建会话。
7. As a 用户, I want detail 跟随旧实现而不强迫所有 provider 新增 UI, so that 展示覆盖仍由自己的决策负责。
8. As a 用户, I want 归档成功但新活动发布失败被准确报告, so that 不误以为 clear／holiday 已成功。
9. As a 用户, I want 首次 holiday 归档并切新统计段, so that 假日计价设置与周期边界一致而无需手动先 clear。

## Preconditions

- framework 提供当前 provider、可靠 Round／活动事实，shared logic 知道自身保存是否收口；具体 observation／command delivery 接线消费[观察权威](03-observation-contract.md)，由[装配](../decision/10-assembly-layout.md)落实，不把原生 canAcceptInput 单值冒充全部保存状态。
- [存储权威](06-local-storage.md)提供安全异步读改发布和整文件归档／重置；无账号键替代 schema 已在 Q25 最终确认，命令只消费该权威，不复制字段结构。
- 每 provider 单账号但多 CLI 同机共享的支持前提由[消费归属原权威](02-accounting-ownership.md#账户隔离多会话与额度)持有；当前运行期认证资料由[账户访问权威](04-provider-access.md)持有。
- 此为迁移规划，支持基线不因本轮 OMP／pi 进程探针改变，不实施 pi adapter。

## Postconditions

- [装配票](../decision/10-assembly-layout.md)把同步／异步 action 的完成与错误从公共入口传到宿主，动作实现放 shared logic；复用既有声明、绑定、adapter 注册和公共反馈路径。
- [验收票](../decision/11-acceptance-cutover.md)覆盖合法／非法输入、Promise 完成与失败、三个反馈级别、无 UI 输出、provider／当前入口门控、零消费归档、首次 holiday 整文件切周期／已开启幂等及归档成功新活动发布失败；生产验收尚未执行。
- 展示与模型覆盖消费入口 detail 偏好，不将此票解释为所有 provider 的新 usage UI；无 UI 远端调度仍由展示／刷新票决定。
- 账号统计隔离、schema、Round 寿命均由原权威持有；本轮首次 holiday 行为已获显式修订，不重开其他命令问题，生产接线仍归装配／验收。

## Invariants

- framework 负责通用路由／等待／错误反馈；业务状态、provider 条件、计价、文件规则留 shared logic，不升级通用 State 或复制原生 handler。
- 延续 `defineExtension` 的纯数据声明与注入实现分离、binding 与 adapter 分工；不借 directed.unrecognized，不默改 toggle／directed 的行为。
- 复用既有 `FeedbackTransport`／`publishNotice` 和 handler 失败报告模式；通知不进入模型上下文，不新增错误打印系统。
- holiday／clear 不取消模型、不伪造 Round 结束、不维护 pending 操作；当前入口 idle 不代表所有进程静止。
- 不恢复数字预算修改，不新增 /cost 别名、多账号管理、默认动作或复杂参数解析；不把调查资产当生产验证。
````

## framework/GLOSSARY.md

````markdown
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
A framework-defined, harness-independent lifecycle transition derived from harness facts supplied through an adapter. The framework owns its meaning, ordering, payload and owner scope; native event names and shapes are distinct from it.
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
The framework's single harness-independent channel through which an extension publishes operator-facing notices, each carrying an `info`, `warning` or `error` severity; the framework maps it to a UI notification when the session has one and to stderr when it does not, and it never enters model context.
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
````

## extensions/model-cost/GLOSSARY.md

````markdown
# model-cost

Model usage and cost accounting, together with provider balance and allowance tracking. Request, Assistant response, Turn, Round, Agent activity state, Unknown, No measurement policy, Known zero and Metric completeness use the definitions in [the framework glossary](../../framework/GLOSSARY.md); the terms below specialize that vocabulary for consumption accounting.

## Language

**Response accounting boundary（响应计费边界）**:
The point at which an assistant response's reported model usage can be accounted for the corresponding request. It does not wait for tool execution or the end of a Round; a response without reported usage does not establish known zero cost.
_Avoid_: round end, tool completion, final response of a round

**Turn usage / cost（单 Turn 用量／费用）**:
The reported model usage and corresponding request-priced cost attributable to one Turn's assistant response. Tool results used as input to a later model request are included in that later request's reported usage, not separately charged when the tool returns.
_Avoid_: round totals, legacy Turn

**Accounting period（消费统计周期）**:
The scope of active consumption accounting bounded by explicit resets, distinct from the lifetime of an agent session or Round. A period identifies the accounting scope being accumulated; it does not establish that a provider-side account has been identified.
_Avoid_: session lifetime, Round, calendar day, process lifetime

**Round totals（轮次累计）**:
The aggregate usage and cost attributed to one framework-defined Round within the applicable accounting period. It is distinct from the sum of all Rounds in a session and from a single Turn's usage.
_Avoid_: legacy Turn, session totals, whole-period totals

**Session totals（会话累计）**:
The aggregate usage and cost attributed to one agent session within the applicable accounting period, spanning its Rounds in that period. It is distinct from the session's lifetime consumption across periods.
_Avoid_: round totals, provider account balance, lifetime session totals

**Direct session totals（会话自身累计）**:
The usage and cost of requests issued directly by one agent session, excluding requests issued by its subagents.
_Avoid_: inclusive session totals, owner totals

**Inclusive session totals（含子代理的会话累计）**:
The aggregate usage and cost of a session and its descendant subagents, with each request represented once. It is an aggregation view, not additional consumption.
_Avoid_: direct session totals, extra billed cost

**Provider account（provider 计费／额度账户）**:
The provider-side identity to which billed usage, balance and allowance belong, distinct from a framework Owner or an agent session.
_Avoid_: owner, process, session account

**Consumption channel（消费渠道）**:
The accounting policy class of model consumption: monetary-billed, allowance-based or without an accounting policy. A channel is distinct from a provider name, account identity or model.
_Avoid_: provider, account, model

**Monetary-billed channel（计费渠道）**:
A consumption channel whose known request-priced monetary costs contribute to consumption amount totals. DeepSeek is the currently identified monetary-billed channel.
_Avoid_: allowance-based channel, confirmed provider debit

**Allowance-based channel（额度渠道）**:
A consumption channel tracked by provider allowance rather than included in consumption amount totals. Codex belongs to this channel; its model-priced dollar estimate is reference information, not an amount-total contribution.
_Avoid_: monetary-billed channel, zero consumption

**Reference cost（参考费用）**:
A model-priced monetary estimate retained for comparison, distinct from the consumption amount contributed under the channel accounting policy or a confirmed provider debit. Codex dollar estimates are reference costs.
_Avoid_: consumption amount total, actual subscription charge

**Allowance consumption（额度消费）**:
The indication that an accounting scope contains allowance-based consumption, whose contribution to the consumption amount subtotal is zero. It does not mean that the request consumed nothing or that its usage is unknown.
_Avoid_: free request, unknown usage

**No accounting policy（无统计口径）**:
The consumption-amount specialization of the framework’s [No measurement policy](../../framework/GLOSSARY.md#facts-and-measurement-semantics): this extension has no applicable monetary accounting policy for token-only and hidden modes. It is distinct from unknown amounts, allowance consumption and confirmed zero cost.
_Avoid_: unknown usage, allowance consumption, free request

**Unknown usage（未知用量）**:
Model usage for which reliable reported quantities are unavailable. An absent report is distinct from confirmed zero usage and from whether a monetary accounting policy applies.
_Avoid_: zero usage, no accounting policy, request failure

**Unknown amount（未知金额）**:
A consumption amount that cannot be determined because information required by an applicable monetary accounting policy is unavailable. Usage may be known while the amount is unknown.
_Avoid_: no accounting policy, allowance consumption, confirmed zero cost

**Confirmed zero cost（确认零费用）**:
A zero consumption amount established by sufficient information under an applicable monetary accounting policy. It is distinct from unknown amounts and from channels excluded from monetary totals.
_Avoid_: missing price, unknown amount, allowance consumption, no accounting policy

**Known subtotal（已知小计）**:
The consumption-accounting specialization of the framework’s [Known subtotal](../../framework/GLOSSARY.md#facts-and-measurement-semantics), summing only known monetary contributions under the applicable policy. Unknown amounts, allowance consumption and no accounting policy add no monetary amount, but none means a confirmed free request or establishes a complete total.
_Avoid_: complete total, zero cost for unknown usage

**Accounting completeness（消费统计完整性）**:
The consumption-accounting specialization of the framework’s [Metric completeness](../../framework/GLOSSARY.md#facts-and-measurement-semantics), evaluated independently for usage and cost within the accounting scope. Known usage does not by itself establish a known amount or confirmed zero cost.
_Avoid_: request success, zero consumption

**Selected Round totals（选定轮次累计）**:
The totals attributable to the Round identified by a conversation-tree position, when that Round can be identified and its measurements are available. This historical-selection concept is distinct from current or most-recent Round totals; navigation alone does not establish data availability or change session consumption.
_Avoid_: session totals, branch-path subtotal

**Legacy Turn（旧的 Turn）**:
The old model-cost widget's usage difference between successive native settlement checkpoints. It is neither a single framework-defined Turn nor necessarily the totals of a complete framework-defined Round.
_Avoid_: Turn without the legacy qualifier, round totals
````

## docs/adr/0002-semantic-extension-framework.md（本轮涉及的责任测试原段落，非完整 ADR）

````markdown
### Responsibility test for harness differences

Different native implementations do not by themselves justify moving behavior out of the framework. Decide ownership by the semantic contract being upheld, not by whether the code contains harness-specific calls.

| Responsibility | Implementation location | Example |
| --- | --- | --- |
| Harness differences required to satisfy a framework-owned contract | Framework harness adapter for native subscriptions, fact mapping and necessary bridges | Extract native lifecycle facts and supported relationship evidence without leaking native payloads |
| Reusable framework-owned semantic logic | Harness-independent framework core / behaviors wherever semantics can be unified | Manage identities, associations and lifecycle transitions once rather than repeating them per adapter |
| Extension-specific native presentation or integration not promised by the framework | That extension's harness-specific implementation | Complex widget layout, native editor interaction, or a harness-only enhancement |
| Business rules that mean the same thing across supported harnesses | That extension's shared logic | Cost calculation, Holiday pricing, and extension-specific archival merge decisions |
| Native capability itself | Harness-owned implementation, called directly where needed | Native UI operations or subagent execution; do not mirror the entire native interface in the framework |

The framework owns State and other capabilities it defines; it does not automatically own every native operation an extension uses. Conversely, extensions should not each reimplement harness mapping for a framework contract. A harness-specific integration remains part of its extension, while a framework harness adapter is reused by all extensions. This placement rule does not exempt native calls from applicable history-preservation constraints.
````
