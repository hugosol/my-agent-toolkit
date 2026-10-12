# 额度与余额在何时刷新，异步效果怎样跟随会话生命周期？

Type: grilling
Status: resolved
Assignee:
Blocked by: 01, 03, 04, 05, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](05-http-capability.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)
Lighthouse: [刷新生命周期决议](../lighthouse/09-refresh-lifecycle.md)

## Handoff

- 用户 Q21「确定」批准整票草案；本票无剩余业务政策问题。唯一权威为 [刷新生命周期决议](../lighthouse/09-refresh-lifecycle.md)，具体确认、被替代提案与运行证据在 [本轮确认资产](../assets/refresh-confirmation-2026-10-12.md)。先前多个 Trace/Handoff 已并入此入口，完整原文见 [发布前历史](../assets/refresh-before-publication-2026-10-12.md)。
- 恢复点：不重问启动两源／DeepSeek TTL／Codex API-only-init／窗口独立更新／无 UI／边界 timer／退出等待。若未来出现具体必要缺口，带证据重审相应 Lighthouse 主题；本票结案不授权生产迁移。
- 依赖解释：消费归属及数据的 provider 单一范围取代本票旧“账号分区／更换隔离”；请求消费按数据／观察／存储权威执行。clear 前消费丢弃不等于远端余额必须丢弃；统计暂停不自动停独立余额／额度。成对约束用于同次测量与 estimate 采样，不禁止独立窗口展示旧值；详细刷新规则不在票体复制。
- 理由／退役分支：usage 自带 provider、发生消费时检查最自然；Codex headers 免网络，API 仅初始化消除 runtime 两源竞赛；失败不扩建冷却／重试；不等双窗口齐全才更新；用户要求自动跨界且反对轮询，因此选 CLI UI 实例级单一边界 timeout，而非取消 timer 或每秒检查。旧各会话 re-arm／捕获 ctx 仅调查方向，不声称多窗口根因已确诊。
- 后续 owner：[装配决策](10-assembly-layout.md)的既有实例／依赖注入／公共出口／native seam Question 承接 CLI 启动与首请求等待、CLI 缓存／查询合并、provider 响应、配置、当前查看通知及 timer 绑定；[验收与切换](11-acceptance-cutover.md)既有端到端／headless／renderer／远端／视觉 Question 承接实际证明。本次不代决或认领它们，不把新结果复制到它们的 Handoff。
- 证据限制：实际运行旧转换＋固定 OMP 18.5.0 parser/provider 的本地协议 fixture，以及旧峰谷边界函数；脚本均清理。没有真实账户、生产 HTTP／初始化屏障、新 UI timer、多窗口复现／修复、休眠／退出原生验证或支持基线升级。Pro 无 5h 的当前适用性未获足够第一方证据，不硬编码套餐。
- Backtracer：已按新权威 User stories 的首请求读数／provider 更新／单窗口／成对 estimate／非阻塞与当前 UI／headless／自动跨界信号，以及 Invariants 的配置、native seam、只读 render、CLI／UI／Owner 寿命与数据保护，回查行为、消费归属、数据、观察、账户访问、HTTP、存储、展示和装配部分权威。源事实／认证／传输／估计文件／错误承载有既有已决 provider；启动等待、CLI 实例与当前查看通知、YAML 字段和 timer 的具体 interface／接线由装配原 Question 提供，真实两源／单窗口／多 CLI UI／退出／RPC 证明由验收原 Question 提供，未完成的 provider 不冒充已实现。成对 estimate 与独立窗口展示不矛盾，首请求网络收口不扩张为观察全局保存屏障；未发现新增无主意图／层次／peer gap 或需用户裁定的政策冲突，不新增空报告、不修改下游票体或 claim，现有 fog 无可毕业的新问题。
- 下一 ready 问题：本票没有。发布后的实际 tracker frontier 是 [官方计价与 token-only 模型名单如何确定、配置和维护？](13-model-catalog-policy.md)；完整装配仍受该票阻塞，验收仍受装配阻塞。只解决本张非 research 决策票，不在本次继续认领。
- 发布校验：实际 Bun 检查本轮 5 个发布文件的 76 个本地链接与 14 个标题锚点、13 张决策票的无环依赖、resolved／空 assignee、单一 Handoff 位于 Question 前及完整 Lighthouse 章节，全部通过；装配／验收／模型名单三张票的原正文与 claim 对比发布前未变。临时校验脚本清理，运行证据不是生产迁移验收。

## Question

确定 CLI 启动两源初始化与首请求收口、实际 provider 响应驱动的余额／额度更新、TTL／在途合并／失败旧值、Codex 窗口与估计采样、切会话／模型／tree／clear、实例销毁／退出／无 UI，以及峰谷自动重绘的最小调度。业务留 model-cost shared logic，公共宿主事实与生命周期映射由 framework／adapter 提供；本票决定原则，不执行生产迁移或冻结完整装配 interface。

旧 30s 双源 TTL、session／agent_start stale 查询、agent_end 强制查询、模型输入两源预取和会话级边界 timer 是审查起点，不是必须保留的新规则。正式取舍与约束只消费 Lighthouse；原问及 legacy recovery text 保留在发布前历史。

## Comments

- 本次访谈在 claim 后读取原恢复点、当前上游与部分 Lighthouse；旧账号／父 Round 交接按各原权威已批准修订解释，未恢复账号隔离或父 Round 子消费分配。
- 原初始化部分结果已合入完整权威并保留确认来源；本轮明确旧→新取舍、失败保留与实例失效限制，候选及撤回方案未写为有效政策。
- 窗口完整性和峰谷机制各经源码／隔离实验取证；实验结果与不能证明的事项分开记录。用户最终批准后统一发布，没有在普通 grilling 中逐轮改政策文件。
