# 官方计价与 token-only 模型名单如何确定、配置和维护？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 02
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

依据[行为契约决议](../lighthouse/01-behavior-contract.md)，provider 的 Codex／官方 DeepSeek／token-only／hidden 分层已确认，具体 model ID 未冻结。确定迁移覆盖的官方人民币价格表、token-only 名单、别名匹配、未知模型行为及 Codex model.cost 缺失时的参考费用展示（不改变额度渠道分类）；区分 provider 身份与 URL 鉴别，不擅自扩大官方分类。

两套名单如何持续维护：以版本化扩展数据、既有 YAML 配置还是宿主 catalog 事实为来源，谁拥有更新与价格来源？若采用 YAML 必须复用框架配置机制。核对 source revision 中 deepseek-v4-pro、deepseek-flash、deepseek-v4-flash、deepseek-v4-flash-vision-exp 的官方计价覆盖与仅前述 v4-pro/v4-flash 的第三方 token-only 覆盖差异，决定是否有意改变；现状不是已批准名单。不猜测未来模型定价；若需要外部事实，另行开 research 票。本票只决定覆盖与维护契约，不执行生产更新。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：DeepSeek 为当前计费渠道，已知费用参与金额累计；Codex 为额度渠道，美元计价只作参考、不进消费金额累计；token-only／hidden 归“无统计口径”。“未知”是缺失适用统计所需信息，不能与额度消费／无统计口径／确认零混同。
- 待决定：具体 provider／模型／别名如何映射以上口径，已知价格缺失与无口径如何判别，配置／catalog 资料怎样更新而不追溯改写已锚定的历史费用？Codex 缺 model.cost 只影响参考费用，不能因此改变额度渠道性质。
- 展示模式与消费采集分离：只要有源头数据就保留；hidden 不授权丢弃请求事实。保持原 provider 分层需求，但不把“全部已知美元”混入消费金额汇总。
