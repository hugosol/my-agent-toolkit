# 额度与余额在何时刷新，异步效果怎样跟随会话生命周期？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 03, 04, 05, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](05-http-capability.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

将请求 headers 即时更新、assistant 完成的 30s TTL 主动刷新、旧原生 agent_end 强制刷新、session／原生 agent_start 开始 stale 拉取、模型切换预取与峰谷边界 timer 映射为精确业务调度。明确单源 TTL 与两源预取当前差异、single-flight、API/header 先后覆盖及失败是否保留旧值。

调度业务规则应归 model-cost；通用生命周期／取消能力由 framework 提供。会话或模型／账户切换时，旧响应与 timer 是否还能写新状态，效果如何解绑？未返回的请求是否阻塞 agent loop／退出？render 不驱动副作用。契约确定后为仍不清楚的竞态开新票，不凭经验加重试。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 确认事件驱动更新；更新后按当前 UI 需要请求刷新。本票决定触发事件、请求合并／防抖／节流与 TTL 的不同语义、时间参数通过现有 YAML 配置读取、是否跨模型同时刷新两个数据源、无 UI 的远端刷新策略。不得把现有 30s、独立 TTL 或只刷新当前模型写成既定新契约。Q9 的窗口／估计行为全部保留；主动读数与 header 时序、同源成对测量的接入必须覆盖。

