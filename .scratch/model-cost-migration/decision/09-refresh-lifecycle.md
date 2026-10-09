# 额度与余额在何时刷新，异步效果怎样跟随会话生命周期？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 03, 04, 05, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](05-http-capability.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)将最新余额／双窗口、获取时间、加载／请求错误保留为账户级内存缓存，holiday／quota estimate 继续持久化；来源成对与跨账户隔离保留，调度 TTL／single-flight 仍由本票决定。
- 旧在途消费在目标账户 clear 后主动丢弃，不等于所有迟到远端测量也一律丢弃；远端余额／额度读数不是消费累计。区分账户周期 reset、会话／模型切换、原账户测量与当前展示，决定哪些响应／timer 仍可更新什么，不让旧实例覆盖新实例。
- 不从 render 发请求、创建 timer 或更新权威业务态，不借新通用 State 替代扩展业务缓存。

## Question

将请求 headers 即时更新、assistant 完成的 30s TTL 主动刷新、旧原生 agent_end 强制刷新、session／原生 agent_start 开始 stale 拉取、模型切换预取与峰谷边界 timer 映射为精确业务调度。明确单源 TTL 与两源预取当前差异、single-flight、API/header 先后覆盖及失败是否保留旧值。

调度业务规则应归 model-cost；通用生命周期／取消能力由 framework 提供。会话或模型／账户切换时，旧响应与 timer 是否还能写新状态，效果如何解绑？未返回的请求是否阻塞 agent loop／退出？render 不驱动副作用。契约确定后为仍不清楚的竞态开新票，不凭经验加重试。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 确认事件驱动更新；更新后按当前 UI 需要请求刷新。本票决定触发事件、请求合并／防抖／节流与 TTL 的不同语义、时间参数通过现有 YAML 配置读取、是否跨模型同时刷新两个数据源、无 UI 的远端刷新策略。不得把现有 30s、独立 TTL 或只刷新当前模型写成既定新契约。Q9 的窗口／估计行为全部保留；主动读数与 header 时序、同源成对测量的接入必须覆盖。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：请求与子任务的消费归属固定；旧子代理的新消费按原启动关系进入本周期聚合、不污染当前轮；不恢复已放弃的历史 Round，也不补已跳过请求或目标账户 clear 前在途响应。账户额度及缓存不因换会话清空，换账户选择各自范围；同源成对读数不可拼接跨时间、跨来源窗口。
- 待决定：旧会话请求、header、API fetch、timer 在模型／账户／tree 切换后，哪些仍可更新原账户的测量／本周期聚合，哪些不得覆盖当前展示视图？测量缓存不是 framework 业务 State，也不要求持久化历史请求记录。怎样提供身份／代际关联而不把迟到数据一律丢弃？多个独立主会话共享账户时，single-flight、读数先后、错误及 estimate 更新按什么范围协调？
- Codex 额度不能分摊或换算为 Session 消费；render 不能决定消费事实是否入账。旧回调污染新会话这一 fog 已精确交给本票，不另建重复并发票。

