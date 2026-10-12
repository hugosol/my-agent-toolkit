# OpenCode Go 当前支持哪些模型及其精确 ID？：Lighthouse

> Question and discussion: [OpenCode Go 当前支持哪些模型及其精确 ID？](../decision/15-opencode-go-models.md)
>
> AFK research 已完成；[已推送研究资产](https://github.com/hugosol/my-agent-toolkit/blob/1fd3c76b2c2c47b39504d7a11de4255ba8651d00/research/opencode-go-models.md)包含完整 38-ID 响应、文档／catalog 对照及来源；[主会话确认与再次发现](../assets/model-catalog-confirmation-2026-10-12.md)记录使用范围。研究分支无 PR、未合并，不访问用户 Go 凭据。

## Question

Go 订阅的 provider 身份、当前发现名单和精确模型 ID 是什么，是否能从 Zen/PAYG 名单推导？

## Discussion

### provider 与名单证据

[OpenCode Go 第一方文档](https://opencode.ai/v2/docs/console/go)将其作为独立 provider opencode-go，模型引用为 opencode-go/<model-id>；不是 Zen/PAYG 的 opencode provider。[Go 模型发现](https://opencode.ai/zen/go/v1/models)无凭据 GET 成功，返回 object=list、38 个精确 ID；研究还对 /inference/go/v1/models 获取相同集合，主会话随后再次确认 38 项。

其中 DeepSeek 项为 deepseek-v4-pro、deepseek-flash、deepseek-v4-flash、deepseek-v4.1-flash、deepseek-v4-flash-vision-exp。完整其余 33 个 ID 与抓取时间见研究资产，不在本票复制一份名单数据。

研究时第一方 Go 文档 endpoint table 列 32 项、models.dev catalog 列 36 项，公开运行期发现列 38 项，三方存在漂移；不能用 Zen/PAYG 表或静态 catalog 替代实际 Go 发现。发现字段仅 id／object／created／owned_by，无价格／显示名／额度；owned_by=opencode 不等于接入 provider ID。

### 证据限度与调用条件

匿名发现成功不证明用户账户的模型权益、地区或逐模型调用成功，也不证明 Go Plus 与 Go 权益完全相同；无真实 Go key 或成功付费推理实测。研究读到 Go 推理要求 x-opencode-session，缺该头的匿名探针返回 MissingSessionID；这属于宿主 provider 调用条件，不是 model-cost 新增额度或转发实现的授权。

Go 与 PAYG 的同名模型可有不同美元价格；本票不批准使用这些价格计费。用户选择 token-only 及五个获批 ID 的唯一政策在[模型覆盖权威](13-model-catalog-policy.md)，不是所有发现模型自动获批。

## Decision

Go 使用独立 provider opencode-go，当前公开发现返回 38 个 ID，其中五个为 DeepSeek。事实名单与账户调用／获批统计范围不同，不从 Zen/PAYG 或 catalog 推断 Go 支持权益。

## User stories

1. As a 维护者, I want Go provider 与精确模型 ID 的独立证据, so that 不把 Zen 按量费用或其他 provider 混入 Go token-only 分类。
2. As a 用户, I want 发现结果与调用认证分开, so that 不把公开名单误当订阅额度或模型成功调用保证。

## Preconditions

- 第一方 docs、匿名 /models 与 catalog 是各自时点的证据，不承诺永久一致。
- 宿主负责真实 provider 接入；本研究不读取账号或修改调用配置。

## Postconditions

- 模型覆盖票需要的 Go provider／五个 DeepSeek 精确 ID 事实已提供。
- 没有新增 Go 额度查询、美元计价或实际模型调用认证；完整资产保持在研究分支。

## Invariants

- provider＋精确 ID 与 owned_by／展示名／端点区分；Go 与 PAYG 不因同名模型合并。
- 公开发现、静态文档、账户权益与统计政策分别记录；不取得／提交秘密、不将 research 分支合并生产。
