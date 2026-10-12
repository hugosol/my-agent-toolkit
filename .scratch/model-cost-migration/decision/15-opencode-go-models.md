# OpenCode Go 当前支持哪些模型及其精确 ID？

Type: research
Status: resolved
Assignee:
Outcome: [模型发现事实](../lighthouse/15-opencode-go-models.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)
Context branch: research/opencode-go-models
Context worktree: E:/Developer/myhub/my-agent-toolkit-research-opencode-go-models

Dependent: [官方计价与 token-only 模型名单如何确定、配置和维护？](13-model-catalog-policy.md)

## Handoff

- AFK research 完成，事实权威见[本票 Lighthouse](../lighthouse/15-opencode-go-models.md)；获批模型覆盖与维护政策只消费[模型计价权威](../lighthouse/13-model-catalog-policy.md)。
- [完整隔离研究资产](https://github.com/hugosol/my-agent-toolkit/blob/1fd3c76b2c2c47b39504d7a11de4255ba8651d00/research/opencode-go-models.md)已 push，无 PR、未合并；分支与本地 worktree 路径见本票 Context branch 和资产。
- [主会话确认与实际请求补证](../assets/model-catalog-confirmation-2026-10-12.md)区分文档、匿名发现、鉴权发现及账户模型调用；没有 credential 内容、价格更新或生产实现。
- 当前 Question 全部已回答，无未决 research scope；发现时点不等于未来名单保证或账户权益认证。模型政策、装配与验收的后续职责已由其原决策票覆盖。

## Question

从 OpenCode 第一方文档／源代码核对 Go 订阅当前支持模型、精确请求 ID、provider ID 及动态发现接口；严格区分 Go 与 Zen 通用按量计费名单、名称与 ID、文档支持与账户实测。用户选择 Go 采用 token-only，不据 USD 价格启用官方 DeepSeek 计价，不扩展为 Go 额度 API 实现。记录证据日期、来源和无法验证部分。
