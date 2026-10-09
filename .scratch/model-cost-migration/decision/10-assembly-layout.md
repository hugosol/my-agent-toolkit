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
- 待决定：如何装配请求事实采集、扩展自有聚合／关系／最近快照、只读统计视图、账户解析、激活 State 和通用持久化协调；单执行者检测／拒绝由何层提供？不要在装配层重实现业务计价／聚合，也不要在 shared logic 引入 native 身份或锁。受影响既有消费者的生命周期能力仍按原 Notes 审查。
