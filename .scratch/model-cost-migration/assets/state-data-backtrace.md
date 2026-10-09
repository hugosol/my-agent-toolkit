## Trace Report: model-cost 的哪些数据进入 framework State，如何声明与读取？

来源：[地图](../map.md)、全部 13 张决策票、3 份 Lighthouse。以下是规划覆盖追踪，不是生产实现／运行验收。历史票体中的被替代提议不作为新的交付承诺；最新[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)的替代范围优先，旧 Lighthouse 保留。

### Current-contract synchronization

用户随后要求旧 Lighthouse 与决策票的有效正文同步最新决定；本次已直接修正旧功能／归属条款和各票交接，不再让读者靠优先级说明自行消解矛盾。[修订前历史快照](contract-history-before-sync.md)保留原批准稿与评论。下方覆盖表及发布时验证是数据 Lighthouse 结案时的追踪记录；有效要求以同步后的 Lighthouse／票体为准。迟到 usage 通用修正能力、已知冲突可信来源及有限处理、发布一致性仍未决，没有在正文同步时代用户批准。

### Synchronization verification

本次同步后实际检查 22 份文档、529 个有效本地链接，缺失为零；12 份修订前快照 SHA-256 与原文一致，正式数据 Lighthouse 的完整历史票体未改动。涉及的 11 张决策票状态保持原值，未把开放票或迟到 usage／冲突处理问题设为已解决。有效正文已移除历史 Round 查询、缺失补齐、持续完整性 UI、数字预算设置和树级 clear 的旧承诺，已知冲突不能随意相加／覆盖的安全边界保留。一次性验证脚本运行后删除；本次没有生产代码／宿主行为变更。

### Intent gaps

- **Missing operational surface**: “本周期 Session／最近 Round／tree 不可用” → 原展示交接未明确最新账户周期及 clear 后 resume 不重估；已有适合责任票 [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)，已补正式来源与约束，具体布局保持未决。
- **Missing operational surface**: “请求身份标记寿命／旧实例隔离／clear 后旧子新请求” → 原观察交接没有本轮具体寿命；已有适合责任票 [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)，已补运行期标记和原生映射未决问题，不新造账本。
- **Missing dependency**: “账户 clear 不影响其他账户并且旧缓存不复活” → 原存储提问已有锁／原子能力，但未明确最新 reset 及混账户关系保留；已有适合责任票 [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)，已补已确认约束与待决定机制。
- **Missing operational surface**: “验收有意简化而不恢复旧历史查询／补账要求” → 原验收交接仍含旧更强要求；已有适合责任票 [什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md)，已补新的正向／负向验收边界，不宣称生产验证通过。

上述是已有责任票内的交接缺口；约束由用户已确认的决议提供，具体机制仍未决。更新后不存在需要新票承接的意图信号，未自动批准额外 UI／恢复／校验行为。

### Layer gaps

- **Missing prerequisite**: [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md) implies dependency on “已收口逻辑数据布局” → 数据票现在 resolved，旧“等待数据布局”文字已更新，来源与最小字段寿命已交接；不是物理存储实现已完成。
- **Missing prerequisite**: [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md) implies dependency on “存储操作完成／失败与等待” → [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md) 已存在且仍 open，观察票保持阻塞，不以数据结案自动解除全部前置。
- “真实账户身份”、“保存一致性”、“clear 跨开放 Round”、“刷新来源与代际”、“入口实例绑定”、“价格维护”、“真实验收”均有不同责任票（下表），未发现无主层级前置。
- 模型覆盖票的“若需要外部价格事实，另开 research”是条件性后续，目前不凭条件句制造新研究票。真正需要外部事实时由该票继续 chart，不声称已认证价格。

### Layer violations

- 未发现需要改变责任层或执行生产迁移的新增层级违规。通用 IO／协调交 framework；统计聚合／归档格式／计价／调度交 model-cost；宿主身份／原生映射交 adapter；renderer 只读。
- 数据票对保存／身份／展示作出的交接是消费者约束，不是越层实现。旧票体中的“业务账本／完整历史／补齐”由正式来源明确收窄；不把历史提议当当前生产接口。

### Peer asymmetry

- 旧 turn-cost 请求锚价参照：观察／模型价格／验收票均承接，未缺少计价来源或比对面。
- 旧 daily-tracker 聚合与锁内发布参照：存储／命令／验收票承接。新规则明确不复制旧原生 agent_end 检查点、共享无账户 namespace 或 UI Total 重估。
- 既有 framework 配置、native import、消费者作用域参照：HTTP／装配／观察票承接；connect-bot 面板协议不随统计 clear 误改。
- glossary／ADR 分工和 OMP 基线／旧文件保护由装配与验收票承接。不认证 pi adapter 是地图已确认 scope，缺少 pi 生产实现不是 peer gap。
- 未发现需要新增同类表面的不对称缺口。

### Consistency clarification

Backtracer 的覆盖结果不等于完整逻辑一致性证明。已确认的历史查询、缺失补齐、跨周期累计、预算修改与 clear 作用域修订已由新 Lighthouse 明确替代；仍需观察票核对旧“迟到 usage 补原 Turn／Round”的公共表述与本次消费业务“不补已跳过请求”的边界。旧子代理在原父轮结束后产生的新请求消费，不等于同一已处理 Turn 的后到 usage 修正。

另有旧消费归属决议的“已知冲突保留证据／标记不完整”与仅保留已处理身份、取消持续完整性状态之间的处理边界，不能仅凭关键词覆盖视为已解决，也不由本数据票自动取消。由已有观察票明确可信来源与终结交付／冲突规则；不新增持久账本或由 agent 代替用户作出新取舍。存储的迟到发布与无额外保存钩子、原子归档／重置／关闭 holiday，则已有相应存储交接，机制仍未决。

### Coverage: intent signals

逐项覆盖 40 个用户故事，来源故事序号仅用于文档内定位；责任票始终按名称引用，不计同票自覆盖。

| 来源 | 提取信号 | 不同责任票 |
| --- | --- | --- |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，故事 1 | provider 后台对照／逐请求计价 | [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，故事 2 | Round／Session 消费分组 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，故事 3 | 峰谷／当前价不重解释 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，故事 4 | 双窗口／ratio／left／成对测量 | [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，故事 5 | 命令／累计／分段／反馈 | [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，故事 6 | framework 公共生命周期／协作 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，故事 7 | 更新频率／YAML／非渲染驱动 | [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，故事 8 | 需求取舍／不默删 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，故事 9 | 模型切换／展示／计价 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，故事 10 | 新统计／旧文件保留 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，故事 1 | 自身／子代理来源 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，故事 2 | 含后代／不重复 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，故事 3 | 旧归属／锚价 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，故事 4 | tree 历史位置／不回滚 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，故事 5 | 未知／额度／无口径／小计 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，故事 6 | 取消／重发／恢复／防重 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，故事 7 | 跨终端／同账户并发 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，故事 8 | Codex 额度与参考费用分离 | [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，故事 9 | 源消费／统计口径／只读视图 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，故事 10 | 缺失跳过／已知冲突处理未决（旧补齐已替代） | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 1 | 旧复杂度／交互开销 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 2 | 模型／峰谷不重解释 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 3 | 嵌套／orchestration 不双计 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 4 | 恢复父子／含后代查询 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 5 | 到达时间／新轮污染 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 6 | 未保存损失／无日志排空 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 7 | 最近轮／tree／不可用不造零 | [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 8 | 恢复／不重复不重估 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 9 | 账户归档／旧数不复活 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 10 | 旧在途丢弃／旧子新请求 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 11 | holiday 结束／旧价不改 | [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 12 | 账户测量／estimate 恢复 | [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 13 | 缺失提示／token 保留 | [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 14 | 固定预算／修改入口移除 | [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 15 | 入口 detail／独立实例 | [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 16 | renderer 无副作用／唯一累计 | [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 17 | 跨 harness／无 native 泄漏 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 18 | 数据流／最小接口／等待路径 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 19 | 领域概念／有意修订 | [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，故事 20 | 多 main／隔离／clear 边界 | [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |

### Coverage: pattern signals

逐项覆盖 25 条不变量，包含词义／既有结构／消费者对称性／计价与存储参照。

| 来源 | 模式／表面信号 | 不同责任票 |
| --- | --- | --- |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，不变量 1 | 响应唯一／工具不计费／生命周期分离 | [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，不变量 2 | 旧 anchorRequest／addMessageCost 锚价 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，不变量 3 | framework Round／connect-bot 面板分离 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，不变量 4 | framework 与 extension glossary 分工 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，不变量 5 | 既有 YAML 配置机制 | [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，不变量 6 | 旧文件不改／读数内存／持久业务 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，不变量 7 | 限频不丢消费（明确损失边界例外） | [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md) |
| [完整保留哪些业务行为，统计单位如何命名？：Lighthouse](../lighthouse/01-behavior-contract.md)，不变量 8 | 名单待定／不默删／规划模式 | [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，不变量 1 | 请求唯一／汇总无新增消费 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，不变量 2 | 实际归属／旧锚价不变 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，不变量 3 | 未知／额度／无口径不等零 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，不变量 4 | tree／fork 不回滚（clear 显式例外） | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，不变量 5 | 聚合不重定义 Turn／Round | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，不变量 6 | Owner State 不决定消费／glossary 分工 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，不变量 7 | 账户隔离／去重／并发 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse](../lighthouse/02-accounting-ownership.md)，不变量 8 | 上下文／账户／消费正交 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，不变量 1 | 正常响应唯一／重发新身份 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，不变量 2 | 实际身份／账户／单执行者 | [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，不变量 3 | 自身不含子／启动关系过滤 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，不变量 4 | 本周期／clear 例外／归档不合并 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，不变量 5 | 缺失不造零／参考不计费 | [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，不变量 6 | 统计周期不改 Round／connect-bot | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，不变量 7 | 只读 renderer／既有配置／native 边界 | [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，不变量 8 | 旧代码参照不等新契约／操作等待 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse](../lighthouse/12-state-data-contract.md)，不变量 9 | 术语／ADR 分工／证据不等认证 | [确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |

### Coverage: dependency signals

对每张票的读取、生成、查询、保存、展示、恢复和验收前置作层级追踪；命中责任票不表示它已 resolved 或能力已经运行。

| 票 | 提取前置 | 责任票 |
| --- | --- | --- |
| [完整保留哪些业务行为，统计单位如何命名？](../decision/01-behavior-contract.md) | 旧源码／功能与计价证据 | [什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md) |
| [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md) | 实际身份／归属／并发数据源 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md) |
| [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md) | 宿主事件／usage／身份与具体保存操作 | [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md) |
| [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md) | 凭据与 provider 身份来源 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md) | 认证／代理输入、既有调用方契约 | [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) |
| [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md) | 逻辑聚合／账户键／恢复查询 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md) |
| [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md) | 持久操作／数据寿命／反馈 | [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) |
| [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) | 只读业务视图／宿主事实／headless | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md) |
| [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md) | HTTP／来源身份／测量缓存与观察时机 | [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md) |
| [确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) | 确定的分层契约／配置／消费者接口 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md) |
| [什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) | 确定的装配与可执行迁移／正式访问 | [确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md) |
| [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md) | 行为／消费原则与落地能力 | [完整保留哪些业务行为，统计单位如何命名？](../decision/01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)；[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)；[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md)；[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md) |
| [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md) | 已定渠道／价格源／配置归属 | [完整保留哪些业务行为，统计单位如何命名？](../decision/01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)；[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) |

### Verification

Bun 一次性文档探针实际读取 21 份文档并检查 522 个有效本地链接，缺失为零；忽略完整历史票体代码块内的旧目录相对链接。正式 Lighthouse 原题与完整历史快照 SHA-256 校验一致，快照保留 31 条决策记录。地图决策索引仅一条新决议；状态为 3 张 resolved、10 张 open。实际读取全部决策票共 120732 字节；3 份 Lighthouse 的用户故事合计 40、不变量合计 25，与逐项覆盖表一致。检查为文档／规划校验，不是生产行为测试；一次性脚本检查后删除。

### Recorded outcomes

- 已向观察、账户访问、存储、命令、展示、刷新、装配、验收、模型覆盖这 9 张现有 open 票写入来源／约束及本票范围内未决交接；未改变它们的状态，未认领或解决下一张票。
- 来源为用户已确认决定；新的机制不在本次替用户决定。所有需跟进项均有适合的已有责任票，因此没有剩余无主批次，不触发额外 gap-follow-up 模式选择，不创建重复票。
- 地图已有两块 fog：宿主缺能力的降级／拒绝、其他消费者复用／收口；本次业务聚合决议没有冻结它们的接口，继续留在 Not yet specified，不预切新票。
