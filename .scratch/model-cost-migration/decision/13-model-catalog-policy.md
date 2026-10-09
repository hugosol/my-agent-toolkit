# 官方计价与 token-only 模型名单如何确定、配置和维护？

Type: grilling
Status: open
Assignee:
Blocked by: 01
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

依据[行为契约决议](../lighthouse/01-behavior-contract.md)，provider 的 Codex／官方 DeepSeek／token-only／hidden 分层已确认，具体 model ID 未冻结。确定迁移覆盖的官方人民币价格表、token-only 名单、别名匹配、未知模型行为及 Codex model.cost 缺失时的 token-only 费用展示；区分 provider 身份与 URL 鉴别，不擅自扩大官方分类。

两套名单如何持续维护：以版本化扩展数据、既有 YAML 配置还是宿主 catalog 事实为来源，谁拥有更新与价格来源？若采用 YAML 必须复用框架配置机制。核对 source revision 中 deepseek-v4-pro、deepseek-flash、deepseek-v4-flash、deepseek-v4-flash-vision-exp 的官方计价覆盖与仅前述 v4-pro/v4-flash 的第三方 token-only 覆盖差异，决定是否有意改变；现状不是已批准名单。不猜测未来模型定价；若需要外部事实，另行开 research 票。本票只决定覆盖与维护契约，不执行生产更新。
