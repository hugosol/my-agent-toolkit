# DeepSeek 模型发现 API 提供哪些资料，能否支持集中维护？

Type: research
Status: resolved
Assignee:
Outcome: [模型发现事实](../lighthouse/14-deepseek-model-discovery.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)
Context branch: research/deepseek-model-discovery
Context worktree: E:/Developer/myhub/wt/deepseek-model-discovery-1

Dependent: [官方计价与 token-only 模型名单如何确定、配置和维护？](13-model-catalog-policy.md)

## Handoff

- AFK research 完成，事实权威见[本票 Lighthouse](../lighthouse/14-deepseek-model-discovery.md)；获批模型覆盖与维护政策只消费[模型计价权威](../lighthouse/13-model-catalog-policy.md)。
- [完整隔离研究资产](https://github.com/hugosol/my-agent-toolkit/blob/aa51b5e/research/deepseek-model-discovery.md)已 push，无 PR、未合并；分支与本地 worktree 路径见本票 Context branch 和资产。
- [主会话确认与实际请求补证](../assets/model-catalog-confirmation-2026-10-12.md)区分文档、匿名发现、鉴权发现及账户模型调用；没有 credential 内容、价格更新或生产实现。
- 当前 Question 全部已回答，无未决 research scope；发现时点不等于未来名单保证或账户权益认证。模型政策、装配与验收的后续职责已由其原决策票覆盖。

## Question

核对 https://api-docs.deepseek.com/zh-cn/api/list-models 的请求、鉴权、响应字段和文档示例，区分模型发现、价格发现与实际账户可用模型。确认是否返回人民币峰谷价格或 pro/flash 计价分类；不把文档示例当已调用 API 的完整名单。为集中维护显式模型映射提供事实，不自动开启未知模型、不更新生产配置或价格。
