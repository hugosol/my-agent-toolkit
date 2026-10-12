# 模型覆盖票发布前历史

以下按原文件路径保存全文，仅为被替代的恢复上下文与局部决议，不是现行政策；原文链接保留在文本块中，不从本资产解析相对路径。当前权威见[模型覆盖决议](../lighthouse/13-model-catalog-policy.md)。

## 发布前决策票

原路径：decision/13-model-catalog-policy.md

```markdown
# 官方计价与 token-only 模型名单如何确定、配置和维护？

Type: grilling
Status: claimed
Assignee: hugos（本会话 agent 协助模型计价讨论）
Blocked by: 01, 02, 14, 15
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[DeepSeek 模型发现 API 提供哪些资料，能否支持集中维护？](14-deepseek-model-discovery.md)；[OpenCode Go 当前支持哪些模型及其精确 ID？](15-opencode-go-models.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)已收窄缺价实现：计费 usage 有而适用价格缺失时仍累计 token，只跳过费用并提示，无补算状态；Codex 参考缺价不影响 token／额度，token-only／hidden 没有金额口径不因缺价报错。
- 领域概念未知／确认零／无统计口径继续保留；不据此要求运行时完整性枚举。模型／价格名单及维护来源仍由本票决定，不能用后来价格改写已锚价历史。

## Question

依据[行为契约决议](../lighthouse/01-behavior-contract.md)，provider 的 Codex／官方 DeepSeek／token-only／hidden 分层已确认，具体 model ID 未冻结。确定迁移覆盖的官方人民币价格表、token-only 名单、别名匹配、未知模型行为及 Codex model.cost 缺失时的参考费用展示（不改变额度渠道分类）；区分 provider 身份与 URL 鉴别，不擅自扩大官方分类。

两套名单如何持续维护：以版本化扩展数据、既有 YAML 配置还是宿主 catalog 事实为来源，谁拥有更新与价格来源？若采用 YAML 必须复用框架配置机制。核对 source revision 中 deepseek-v4-pro、deepseek-flash、deepseek-v4-flash、deepseek-v4-flash-vision-exp 的官方计价覆盖与仅前述 v4-pro/v4-flash 的第三方 token-only 覆盖差异，决定是否有意改变；现状不是已批准名单。不猜测未来模型定价；若需要外部事实，另行开 research 票。本票只决定覆盖与维护契约，不执行生产更新。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：DeepSeek 为当前计费渠道，已知费用参与金额累计；Codex 为额度渠道，美元计价只作参考、不进消费金额累计；token-only／hidden 归“无统计口径”。“未知”是缺失适用统计所需信息，不能与额度消费／无统计口径／确认零混同。
- 待决定：具体 provider／模型／别名如何映射以上口径，已知价格缺失与无口径如何判别，配置／catalog 资料怎样更新而不追溯改写已锚定的历史费用？Codex 缺 model.cost 只影响参考费用，不能因此改变额度渠道性质。
- 展示模式与消费采集分离：只要有源头数据就保留；hidden 不授权按当前主模型过滤其他已取得且应累计的响应；缺 usage／价格按正式数据决议提示／跳过，不要求持久化逐请求事实或补算记录。保持原 provider 分层需求，但不把“全部已知美元”混入消费金额汇总。
```

## 发布前 Lighthouse

原路径：lighthouse/13-model-catalog-policy.md

```markdown
# 官方计价与 token-only 模型名单如何确定、配置和维护？：Lighthouse

> Question and discussion: [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)
>
> 部分发布：只确认费用结构参考比例表的来源与分层。源票仍 open、未认领，正文、依赖、模型名单与其余未决范围不变。来源为[展示访谈 Q19／Q20 的文件名定向确认](../assets/presentation-confirmation-2026-10-12.md)；并非已实施比例表或模型支持认证。

## Question

费用结构参考比例表如何取得和归属？本局部结论不冻结官方价格表、具体模型 ID／别名、token-only 名单、配置格式、更新时机或缺失策略。

## Discussion

### 模型计价比例表：扩展管理，宿主价格事实经 framework

model-cost shared logic 维护按 provider／model 区分的计价比例表。DeepSeek 相对价格权重由扩展维护；Codex 权重从 framework 提供的宿主模型 catalog 单价派生，不为比例另查远端计价 API。adapter 映射原生 catalog；shared logic 和宿主 widget 前端不直接读取原生 ctx.model.cost。模型查询／价格快照的公共职责消费[观察契约](03-observation-contract.md)，不是余额／额度接口。

相对权重用于[展示权威](08-presentation.md)确认的费用结构参考占比：按当前 Session／当前模型的 token 累计和固定相对权重计算。它不是跨峰谷历史实际支出分项，也不改变逐响应锚价后的 costCny／referenceCostUsd。撤回 token 占比替代、历史费用分项持久化以及当前单价重估累计的候选；当前存储 schema 不变。

旧价格表中 DeepSeek pro／flash 的峰／谷各项同倍率，是本轮规则可行的证据，不是未来所有模型价格比恒定的保证；若相对结构真的变化，比例表的维护与适用规则需本票决定，不能静默称其为历史真实分项。Codex 参考费用不进入计费金额，不与人民币换算相加。

### 仍待本票收口

保留原 Question 的具体 provider／model／别名与官方分类、token-only／hidden 名单、price 来源、版本化数据或既有 YAML／catalog 的组织、维护责任与更新时机、未知模型及 catalog 单价缺失处理。若采用 YAML，复用框架配置。恢复后非当前模型的参考资料如何取得、相对结构变化的适用规则亦属于原名单／维护／catalog 来源范围；本次不假定可从 token 或已保存总费用倒推出缺失价格。

后续展示仅要求当前查看模型的比例，不需要把多模型比例拼成同一比例；各 detail 模型行仍须取得对应模型的可用权重。使用比例表不授权补算原先未算的费用或改写已锚价累计。

## Decision

确认按 provider／model 管理参考计价权重：DeepSeek 由扩展维护，Codex 从 framework 的宿主 catalog 单价派生；不新增远端计价请求，不扩充消费 JSON。覆盖、格式、更新与缺失处理仍未决，源票保持 open。

## User stories

1. As a 用户, I want 相对计价权重下的费用结构参考占比, so that 可以比较输入／输出／缓存的等额消耗并调整 agent 行为。
2. As a 扩展作者, I want Codex 价格事实通过 framework 提供, so that 不直接读取宿主原生接口或为比例增加远端请求。
3. As a 维护者, I want 比例表与模型名单有明确来源, so that 展示不会用任意当前模型价格重解释历史费用。

## Preconditions

- [行为与消费口径](02-accounting-ownership.md)分别定义计费金额与额度参考费用。
- [观察契约](03-observation-contract.md)承诺当时可靠可取的 catalog 价格事实，实际公共查询接线由装配落实。
- [存储](06-local-storage.md)保持 token 四桶与锚价总金额；本次不增加分项金额或 Round 字段。
- [展示](08-presentation.md)定义当前模型字段与 detail 逐模型用途；模型资料缺失不冒充零。

## Postconditions

- 后续不恢复 widget 原生价格读取，不为参考比例额外访问余额／额度或远端计价 API。
- 尚未提供完整可实施比例表、官方名单与新 model 支持；本票其他 scope 不因此获批。

## Invariants

- 源票 status／assignee／正文及其他问题不变；跨票确认只部分发布到本 Lighthouse。
- 费用结构参考比例与请求锚价总费用分开；不重估已算累计、不补账，不把 Codex 美元混进计费金额。
- 原生事实由 adapter 映射、framework 公共接口交付；扩展持有维护和计算政策，复用现有配置而非第二套机制。
```
