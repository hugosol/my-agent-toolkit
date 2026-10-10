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

