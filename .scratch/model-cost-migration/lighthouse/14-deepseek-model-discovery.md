# DeepSeek 模型发现 API 提供哪些资料，能否支持集中维护？：Lighthouse

> Question and discussion: [DeepSeek 模型发现 API 提供哪些资料，能否支持集中维护？](../decision/14-deepseek-model-discovery.md)
>
> AFK research 已完成；第一方文档调查加后续用户授权的真实鉴权调用。完整隔离研究在[已推送资产](https://github.com/hugosol/my-agent-toolkit/blob/aa51b5e/research/deepseek-model-discovery.md)，主会话补证在[模型覆盖确认与实测](../assets/model-catalog-confirmation-2026-10-12.md)。研究分支未合并、无 PR；不记录 key。

## Question

模型发现响应能提供哪些字段，是否包含价格或 pro／flash 计价档，文档样例是否足以冻结精确 ID？

## Discussion

### 第一方接口与实际证据

[获取模型列表](https://api-docs.deepseek.com/zh-cn/api/list-models)规定 GET /models，列表含 id／object／owned_by，以及展示名称、上下文／输出上限、输入输出模态、effort、协议能力等可选元数据；没有价格、币种、峰谷价格或计价家族字段。价格另见[官方价格文档](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)。

文档具体示例只列 deepseek-flash／deepseek-v4-pro，但静态示例不能证明实际完整名单。主会话无鉴权 GET https://api.deepseek.com/models 返回 HTTP 401；用户授权使用本地文件中的 key 后，Invoke-RestMethod 成功返回 object=list、且此次 data[].id 恰为这两个。响应／元数据摘录在补证资产，不扩大成所有未来账号都相同的保证。

价格文档与更新日志仍接受 deepseek-v4-flash／deepseek-v4-flash-vision-exp，并路由到当前 Flash；发现响应未列这些别名，不等于调用能力认证或不接受别名。公开文档不能单独验证账户发现名单；本轮后续鉴权已补全该实际名单，隔离研究当时的 missing evidence 不是当前 blocker。

### 使用边界

本研究只提供发现与价格来源事实；获批支持集、显式映射及是否使用发现的政策唯一在[模型覆盖权威](13-model-catalog-policy.md)。没有增加运行期依赖、调用权限或价格抓取实现。

## Decision

/models 提供模型发现元数据、不提供价格；此次鉴权实测返回两个精确 ID。集中价格与映射需要独立显式维护，不能从文档示例或未来发现结果自动推导批准支持。

## User stories

1. As a 维护者, I want 区分真实模型发现与文档示例, so that 维护精确 ID 时不把示例误认成完整账户响应。
2. As a 维护者, I want 区分模型元数据与价格来源, so that 不从名称猜人民币价格或计价家族。

## Preconditions

- 获取实际账户名单需要可用鉴权；本轮调用经用户授权，key 不进入证据／仓库。
- 第一方文档与接口证据均有时点；源事实不等于生产功能认证。

## Postconditions

- 模型覆盖票的名单与发现能力事实前置已提供，不再等待实际两模型响应。
- 用户最终支持范围由模型覆盖权威持有，本研究不新增 policy 或生产代码。

## Invariants

- 发现、文档可接受名称、价格与账户调用权益分别记录，不互相冒充。
- 完整研究只在 throwaway research 分支，已 push、无 PR、不合并；证据不含秘密。
