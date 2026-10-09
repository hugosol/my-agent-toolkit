# 完整保留哪些业务行为，统计单位如何命名？

Type: grilling
Status: resolved
Outcome: [行为契约决议](../lighthouse/01-behavior-contract.md)
Assignee: hugos (本会话 agent 协助讨论)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)


## Question

基于[现状调查](../assets/current-state.md)，逐项确认 DeepSeek／Codex／token-only／hidden、预算与 Effort、峰谷和 holiday、请求计价、余额、累计与分段条、双窗口节奏、ratio/left、预算命令、刷新和故障显示哪些原有行为要原样保留，哪些有意改变？用户已确认全量保留基线，不得默删 README 未记载的额度估计。

明确 Request、Assistant response、Turn、Round、Agent activity state、Total、旧 UI 的 Turn 及 orchestration 的业务含义；旧 agent_end 结算不能仅因名称接近就映射 round_end。讨论两源预取 TTL 表述与实现不一致、render 更新业务态的耦合，以及 UI 标签是否改名。输出一份用户确认的行为契约和场景；本票不决定框架接口，也不迁移代码。

## Current contract

原题是当时的提问，不是要求保留已修剪功能的有效承诺。最终结果见[已同步的行为契约决议](../lighthouse/01-behavior-contract.md)，与[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)一致；不把原评论中的历史 Round 查询、补账／持续完整性、预算数字设置或会话树级 clear 作为当前需求。可靠身份、冲突来源／处理、落盘一致性、刷新和 UI 仍由对应未结案票决定。本票继续 resolved，文档同步不表示生产迁移完成。

## Comments

用户要求将旧正文修正为最新决定；原题及全部旧评论已逐字保存在[同步前历史快照](../assets/contract-history-before-sync.md)。原有追踪报告保留为当时记录，不覆盖同步后的有效契约。

