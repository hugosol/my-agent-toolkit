# 用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？

Type: grilling
Status: resolved
Outcome: [消费归属决议](../lighthouse/02-accounting-ownership.md)
Assignee: hugos (本会话 agent 协助讨论)
Blocked by: 01
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)


## Question

确定费用、token 基线、额度成对读数与缓存的归属：request／turn／round／session／owner／provider account／进程分别承担什么？主会话、子代理及 orchestration 如何计入展示与累计，怎样避免 session 统计与单请求统计双计？fork/resume/switch/tree 的基线与未结算请求如何处理？

现有 framework session/round 订阅只对 owner 派发，直接复用可能漏掉子代理观测。不能把激活 State 继承规则当成本归属规则。新统计允许从空开始，但新系统恢复和多进程并发仍需确定行为；多 main 同进程要显式决定支持或拒绝，不能顺手承诺。依据[现状调查](../assets/current-state.md)及源 daily-tracker、quota-estimate-store 确认去重与身份需求。

## Current contract

原题是当时的提问，不是要求保留已修剪功能的有效承诺。最终结果见[已同步的消费归属决议](../lighthouse/02-accounting-ownership.md)，与[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)一致；不把原评论中的历史 Round 查询、补账／持续完整性、预算数字设置或会话树级 clear 作为当前需求。可靠身份、冲突来源／处理、落盘一致性、刷新和 UI 仍由对应未结案票决定。本票继续 resolved，文档同步不表示生产迁移完成。

## Comments

用户要求将旧正文修正为最新决定；原题及全部旧评论已逐字保存在[同步前历史快照](../assets/contract-history-before-sync.md)。原有追踪报告保留为当时记录，不覆盖同步后的有效契约。

