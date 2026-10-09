## Trace Report: 用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？

### Trace sources

已加载[迁移地图](../map.md)、全部十三张决策票，以及[行为契约决议](../lighthouse/01-behavior-contract.md)和[消费归属决议](../lighthouse/02-accounting-ownership.md)。历史票体只作证据；被正式决定替代的提议不视为当前承诺。以下区分交接前的具体覆盖缺口与交接后的状态；交接仅扩充开放决策问题，不代替其答案。

用户确认消费归属 Lighthouse 并要求继续。其 Preconditions、Postconditions 已确认后续票的承接义务；本次补充这些义务，没有新增未获确认的业务决定。clear／迟到请求交错等问题仅记录为既有命令／存储决策的未决问题，不选择答案。

### Intent gaps

- **Missing operational surface**: “逐个理解子代理成本来源／主会话自身与含后代”来自消费归属决议的用户故事 → 原展示票缺逐代理可区分入口和嵌套视图的明确要求。
  Peers that have it: 已确认主会话／每个子代理均应具备自身与含后代统计视图；不是新增生产模块。
  Owner: [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)，其决策范围拥有展示模型与视觉／headless 查询；身份来源交观测票，记录和派生值交 State／存储票。已补交接，状态仍 open。
- **Missing operational surface**: “金额小计覆盖范围”来自消费归属决议的用户故事 → 原展示与 State 票没有明确未知／额度消费／无统计口径的可组合性质及分指标完整性。
  Peers that have it: 各 Turn／Round／Session／账户统计均需要同样的状态区别。
  Owner: [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)与[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)。前者拥有表达，后者拥有字段／读写与派生权威；已交接，未解决具体接口。
- **Missing dependency**: “历史位置与实际消费”来自消费归属决议的用户故事 → 既有观测／存储／State 票未明确当前树位置到完整历史 Round 的关联与不回滚 Session 的数据需求。
  Owner: [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)。分别拥有事实、持久化查询、当前选择与视图，已交接。
- **Missing dependency**: “跨终端统计可信／后续补齐而不是猜账”来自消费归属决议的用户故事 → 原存储票虽有锁与恢复，未明确唯一请求事实、补齐增量、多主会话共享账户不丢写及冲突证据的完整要求。
  Owner: [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)与[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md)，已交接存储问题和验收场景；未承诺具体锁、格式或自动全量恢复。

### Layer gaps

- **Missing prerequisite**: [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)的“幂等保存／恢复消费”隐含可靠请求身份、归属、历史价格与 usage；原観测票未具名覆盖实际重发与重复通知的区别及冲突可信来源。
  Provider: [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)已有范围拥有这些事实，已明确交接。存储通过 State 的既有依赖链等待观测决定；不新增重复观测票。
- **Missing prerequisite**: 逐代理、账户聚合和同源额度基线隐含“实际请求／读数到可靠账户”的身份；“第一个 Codex 账户”不能满足需求。
  Provider: [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)，已补子代理、账户切换、多账户与缺身份处置问题。基线格式／合并由存储票、异步更新范围由刷新票承接。
- **Missing prerequisite**: “支持多独立 main、拒绝同 session 双驱动”隐含唯一执行者检测与协调提供者。
  Provider: [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)。分别决定事实、通用协调、职责装配，验收票验证拒绝与正常恢复；已交接，不擅自指定锁文件或宿主能力。
- **Missing prerequisite**: “金额口径筛选”隐含已确认的计费／额度／无统计口径映射，与原模型名单票中“Codex 缺价格的 token-only 费用展示”可能混淆。
  Provider: [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)。已将用词改为“参考费用展示（不改变额度渠道分类）”，补消费归属决议为依赖，记录明确映射问题；名单票仍 open。
- **Missing prerequisite**: clear／归档／新周期与“不回滚历史消费、允许迟到补齐”相遇时需明确操作范围和并发归属。
  Provider: [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)拥有用户操作语义；[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)拥有记录、周期与原子机制。已记录问题和来源，无新的 clear 答案；不新增单独票。

### Layer violations

- 未发现需要新增票处理的层级越界。观测票提供事实，不决定 provider-specific 计价／解析；存储票仍区分 framework 通用文件／协调与 model-cost 业务 schema／合并；刷新票拥有业务调度，不重新解释请求归属；装配票不复制计价与账本实现；展示不得驱动入账或回滚事实。
- 上述单执行者、额度合并与数据归属的具体 seam 仍是开放问题，不能将交接误读为已批准某层实现。

### Peer asymmetry

- **Missing from 各消费汇总视图**: 原开放票未明确逐代理自身／含后代、每指标完整性、混合消费类型在所有汇总范围中一致保留；present in 消费归属决议，但原展示／State 票未具体承接。
  已交给[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)及验收票，不新增平行统计机制。
- framework 公共 Turn／Round／Owner 语义与请求锚价的既有模式由观测票、模型名单票和装配票承接；原 YAML 配置、native import 边界和消费者迁移信号仍由 HTTP／装配／刷新等原票覆盖，未发现第二套配置或框架的新增要求。

### Signal coverage

下列落点均是不同于信号来源票的决策票，不以 Lighthouse 或源票自覆盖。链接名称代表责任，不代表该票已解决。

| 来源与信号 | 覆盖落点 |
| --- | --- |
| 行为契约：计价对照、请求锚价、跨峰谷不重估 | [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)、[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 行为契约：Round／Session 含义、工具与活动语义 | [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)、[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md) |
| 行为契约：双窗口、ratio／left、成对测量与节奏 | [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 行为契约：命令、累计、分段条、故障反馈不丢失 | [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 行为契约：事件驱动、现有 YAML、不由渲染副作用更新 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)、[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md) |
| 行为契约：具名取舍、不擅自改变需求 | 各开放票原交接、[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)与[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 行为契约：provider 分类、预算、实际 Effort | [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)、[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) |
| 行为契约：最新读数仅内存、不破坏旧数据 | [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 消费归属：主会话自身／逐个子代理、任务消费来源 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 消费归属：Round／Session 含后代不双计 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 消费归属：模型／账户切换不改历史归属／价格 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)、[官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 消费归属：tree 历史 Round／Session 不回滚、fork 不重计 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 消费归属：未知／额度消费／无统计口径／零及覆盖范围 | [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)、[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 消费归属：取消修改重发／恢复不破坏账目 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 消费归属：多会话／跨终端账户累计可信 | [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 消费归属：Codex 参考费用与账户额度分离 | [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)、[账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)、[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)、[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 消费归属：源事实与统计视图区别 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md) |
| 消费归属：缺失／冲突证据可补齐 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 两份决议的不变量：唯一请求、公共语义、native seam、State／Owner、配置模式 | [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)、[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)、[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)、[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)、[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)、[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)、[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md) |
| 开放票隐含依赖：fetch 的身份／凭据／HTTP、load 的 schema／历史事实、render 的当前值、验收的真实能力及源 revision | [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)→[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](../decision/05-http-capability.md)→[额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)→[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)→[framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)→[动态 widget 如何分层，无 UI 时哪些业务仍需更新？](../decision/08-presentation.md)；所有契约→[确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)→[什么证据才算完整迁移，如何安全验收并切换？](../decision/11-acceptance-cutover.md)，既有依赖保持 |

### Recorded outcomes and map handoff

- 已将确定的约束和未决问题交接给十张现有开放票；保持 open 和未认领，不关闭其他票。
- 没有剩余无适合责任票的 finding，因此不询问 Gap follow-up 模式、不创建重复票。业务决议不是运行事实，本次未运行宿主请求、远端 API、TUI 或生产消费存储。
- 原 fog 的“旧会话回调污染新会话／切换中跨请求混算”已能精确提出，毕业到既有刷新票，相关事实与 State 要求交观测／State 票。
- 原 fog 的“账户／provider／进程额度基线隔离”已能精确提出，毕业到既有账户访问／存储／刷新票。
- 原生缺能力的降级／拒绝政策，以及新通用能力对既有消费者的具体影响，仍需后续契约推进后细化，保留 fog。
- “Codex 会话消费与额度转换／分摊”已明确不做，作为本努力的范围排除记入地图 Out of scope，不涉及处置既有决策票。

### Verification evidence

执行了无落盘的 Node 文档检查程序：15 份相关 Markdown、209 个相对链接、13 张决策票检查通过；依赖图无环，只有两张已获用户确认的决策票为 resolved，其余票保持 open 且未认领。确认后的原始票体完整保存在 Lighthouse 的 Historical ticket body 中。

程序查询的 frontier 按顺序为：

- [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)
- [账户凭据、provider 地址和代理如何跨 seam 提供？](../decision/04-provider-access.md)
- [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)

这仅验证决策文档、链接和生命周期，不是宿主行为或消费统计的生产 smoke。
