# model-cost 的哪些数据进入 framework State，如何声明与读取？

Type: grilling
Status: resolved
Assignee: hugos (本会话 agent 协助讨论)
Blocked by: 01, 02
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)
Lighthouse: [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)

## Question

**当前实现起点：以聚合为主，先验证具体极端场景。** 用户已选择参照旧实现的聚合方案作为基础；只有该方案不能满足实际场景时，才讨论是否升级记录粒度，而非默认长期逐 Turn 明细。用户举例 /tree：Session 累计能正常保留即可，对应历史 Turn 累计可能无法取得可以接受。具体持久化介质、写入时机、有限关联范围与历史 Round 视图的正式替代范围仍待具体实现论证，不由此自动取消所有此前功能。先区分逐响应计算／累加、运行期请求关联、持久化逐 Turn 历史三件事；用旧代码与具体场景比较聚合统计、有限记录和完整明细的成本收益，再决定记录粒度／寿命，以及哪些既有需求需要修订。没有确认粒度前，不先固定 TurnRecord schema、通用账本、State 扩展或同步／异步写入策略。

依据[行为契约决议](../lighthouse/01-behavior-contract.md)，哪些数据进入 framework State，哪些是扩展自有业务数据／缓存／派生展示结果？逐项覆盖最新余额、5h／7d 窗口读数与获取时间／加载／错误状态、Turn usage/cost、Round totals、Session totals、预算／detail／holiday 及 quota estimate。仅存内存不等于不属于 State；明确类型、归属、读写接口及恢复／继承语义，不能把当前 boolean activation 字段当业务容器。

当前已决定不升级通用业务 State：model-cost shared logic 拥有业务聚合，framework 激活 State 不充当业务容器，UI 只读同一业务视图。余下问题是最小数据键／字段与查询路径、运行期有限身份及父子关系的保留／恢复，不重新设计完整账本或缺失计数；最新远端读数仅内存、累计／归档／holiday／quota estimate 的既定寿命保留，预算修改已移除、detail 为入口级内存偏好。存储票决定物理格式与保存完成／失败／协调，刷新票决定调度；本票不设计 TTL、不迁移代码。

## Resolution

用户确认 Lighthouse 草案及历次暂停细节补充后要求生成正式文档；已写入[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)。最终决定、修订范围、用户故事、不变量与事实边界以该文档为唯一权威，本票的 resolved 仅表示规划决定完成，不表示生产迁移已交付。

## Comments

### Backtracer 完成

[数据归属决议全图追踪报告](../assets/state-data-backtrace.md)已记录意图、模式、依赖与现有责任票交接。后续票保留 open；没有剩余无主跟进批次，不新增重复票。

### 正式结案与历史溯源

- 完整的结案前票体（含历次暂停记录、当前有效决定和被替代提议）逐字保存在[正式 Lighthouse 的 Historical ticket body](../lighthouse/12-state-data-contract.md#historical-ticket-body)。旧 Lighthouse 当前有效正文已按用户要求同步到最新取舍，修订前批准版本及原评论见[历史快照](../assets/contract-history-before-sync.md)，不隐藏修订。
- 原题内曾使用的未决表述仅是提问历史，不能覆盖正式决议。尤其以账户级 clear／本周期 resume／holiday 到 clear 为止替代先前树级 clear 与相关旧提议。
- 后续接口与落地问题按 Lighthouse 的 Preconditions／Postconditions 交接至[账户访问](04-provider-access.md)、[存储与协调](06-local-storage.md)、[请求／响应观察](03-observation-contract.md)、[命令](07-command-state.md)、[展示](08-presentation.md)、[刷新](09-refresh-lifecycle.md)、[装配](10-assembly-layout.md)、[验收](11-acceptance-cutover.md)及[模型／价格覆盖](13-model-catalog-policy.md)；本票不提前批准它们的未决机制。
