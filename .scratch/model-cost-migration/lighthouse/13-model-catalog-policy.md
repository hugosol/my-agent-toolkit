# 官方计价与 token-only 模型名单如何确定、配置和维护？：Lighthouse

> Question and discussion: [官方计价与 token-only 模型名单如何确定、配置和维护？](../decision/13-model-catalog-policy.md)
>
> 用户已确认整票收口并授权发布；[本轮确认与实测](../assets/model-catalog-confirmation-2026-10-12.md)保存原话、交互选择、修订范围与证据限度，[发布前历史](../assets/model-catalog-before-publication-2026-10-12.md)保留旧恢复点与局部政策。以下是迁移设计，不是生产实现。

## Question

确定官方模型计价覆盖、OpenCode Go token-only 名单、精确匹配与未知模型行为、集中数据维护、价格表达、费用结构参考占比以及 Codex catalog 缺价策略；完整探索见源票。本结果不提供新的模型调用权限、Go 额度能力或生产迁移。

## Discussion

### 精确 provider／Model ID 覆盖

按宿主提供的 provider 身份和精确 Model ID 共同匹配，不由 base URL、owned_by、名称前缀或模糊别名升级分类。

| provider | 精确 Model ID | 模式／计价档 |
| --- | --- | --- |
| deepseek | deepseek-v4-pro | 官方人民币计价，pro |
| deepseek | deepseek-flash | 官方人民币计价，flash |
| opencode-go | deepseek-v4-pro | token-only |
| opencode-go | deepseek-flash | token-only |
| opencode-go | deepseek-v4-flash | token-only |
| opencode-go | deepseek-v4.1-flash | token-only |
| opencode-go | deepseek-v4-flash-vision-exp | token-only |

Codex 沿既定 openai-codex provider 进入额度模式，模型价格经 framework catalog 提供，不受上表 DeepSeek 白名单限制。其余 Go 模型、未收录官方 DeepSeek ID 与其他第三方 provider 默认 hidden；hidden 不阻止宿主调用模型，也不授权按当前主模型过滤已取得且应累计的其他消费。

本轮明确旧到新：官方旧四 ID 改为鉴权 /models 实际返回并获用户限定的两个；取消官方旧 v4-flash／vision-exp 默认支持。旧任意非官方 provider 的 pro／v4-flash token-only 通配改为仅 opencode-go 的上述五 ID。没有自动别名、未来新模型自动套 flash、全部 38 个 Go 模型或 Zen/PAYG 金额接入。确认来源见本轮证据；以前源码的覆盖仅为历史。

### token-only 是用量模式，不是订阅额度模式

token-only 保留可取得的 input／output／CacheR／CacheW token、缓存命中率与 Sum、上下文条／既定预算告警、实际 Effort、Session 累计、正常连续活动的轻量 Round 以及既定 detail 代理树展示。所有五个 Go 模型都是 DeepSeek 家族，沿既定 DeepSeek 450K 显示预算，不新增用户可调预算或不同家族预算；宿主上下文窗口事实与扩展预算不是一回事。

这些请求没有扩展金额统计口径：不按官方价格计费、不计算自身人民币 Cost／美元 Ref 或费用结构参考占比，不显示官方峰谷／holiday 计价与余额；不新增 Go 额度查询、重置时间、Codex 双窗口／ratio／left。token-only 不是免费、不是未知金额，也不是已掌握订阅额度。混合会话树里其他渠道已取得的 Cost／Ref 继续按[展示权威](08-presentation.md)保留，不能因当前 Go 模式删掉其他真实累计。命令适用条件仍由[命令权威](07-command-state.md)持有，不扩大 holiday／clear 入口。

### 一个扩展数据文件：模型映射、谷价与峰价系数

扩展以单一集中数据文件维护官方模型映射、Go token-only 名单、pro／flash 两套谷价与共用峰价系数，不需要用户 YAML 维护，不新增第二套配置机制。具体文件名、依赖注入与 exports 由[装配票](../decision/10-assembly-layout.md)落实；此处冻结数据职责和内容，不创建生产文件。

当前谷价（CNY／百万 token）与峰价系数：

| 计价档 | input（非缓存输入） | cacheRead | output |
| --- | ---: | ---: | ---: |
| pro | 4.5 | 0.15 | 13.5 |
| flash | 1 | 0.02 | 4 |

共用 peakMultiplier=2；峰价各项由谷价乘系数生成，不另存峰价表。旧扩展虽直接写两套价格，当前各项恰好共同两倍；此次只简化数据表示，不改变实际价格。DeepSeek 不另计 CacheWrite；保留北京时间工作日 09:00–12:00、14:00–18:00 含端点峰价，其他时段／周末谷价、holiday 强制谷价、请求开始锚价，不在本轮增加节假日自动识别。

若未来价格不再各项同比例变化，必须显式更新价格表示与维护规则，不能强行乘共同系数或猜测未来价格。名单更新必须显式写入精确 ID；本轮冻结的两个官方 ID 不因发现结果将来变化自动扩大。

### 模型发现只辅助开发维护

开发维护时使用 GET https://api.deepseek.com/models，鉴权 Bearer key 只用于该次请求，不提交／打印秘密；记录响应获取时点、精确 ID、来源和必要模型映射，再显式维护集中数据。该接口提供发现元数据，不提供价格或 pro／flash 计价档；价格来源仍是[官方模型与价格文档](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)，不是根据模型名称猜价格。

Go 开发维护参考[第一方文档](https://opencode.ai/v2/docs/console/go)和 GET https://opencode.ai/zen/go/v1/models；发现名单、文档名单与 catalog 可以不一致，精确 provider 身份与更新证据要分开记录。当前 38 个发现 ID 不等于 38 个获批 token-only ID，也不证明用户账户逐模型可调用。

维护操作及来源应进入实施时的维护文档；扩展运行期不调用这些 /models 接口、不自动抓价、不依赖发现接口成功。数据随扩展维护更新，后续启动使用更新版，不引入运行期价格热更新或用户覆盖机制。实际价格更新不补算、不重新估算历史已锚价金额。

### 模型计价比例：由价格派生，宿主价格事实经 framework

原局部“扩展维护比例表／固定相对权重”的表述，按本轮 Q9 明确修订为：shared logic 按 provider／model 从已有价格数据派生权重与比例，不维护第二套比例配置。DeepSeek 直接用对应档谷价；共用系数同乘各项，归一化结果不因峰谷／holiday 改变。更新版价格改变相对结构时，参考比例随当前价格变化，但仍不是历史真实分项。

各项参考值=相应范围 token×对应模型单价；费用结构参考占比=各项参考值／参考值总和。DeepSeek 项为缓存读取／输入／输出，Codex 使用适用的 input／cacheRead／cacheWrite／output 价格；单价单位相同的缩放在归一化中抵消。只有数据完整且参考值总和大于零才形成有意义比例；总和为零或资料缺失显示不可用，不猜默认零比例。

相应范围按[展示权威](08-presentation.md)：当前查看 Session 自身／当前模型的累计，或 detail 该模型行，不把多模型拼成一张比例。DeepSeek 使用扩展价格数据；Codex 从 framework 提供的对应 provider／model 宿主 catalog 单价派生，adapter 映射原生事实；shared logic／widget 不直接读取原生 ctx.model.cost，也不新增远端计价 API。

请求费用与参考比例不同：每个请求按开始时价格快照锚价，已算 costCny／referenceCostUsd 累计不随当前价格、模型、峰谷或数据更新重估，不保存历史价格账本／历史费用分项，不补算曾缺价消费；[消费 JSON schema](06-local-storage.md)不扩充。旧 token 占比替代与当前价格重算历史总值的候选继续不采用。Codex 美元 Ref 不进入人民币计费金额。

### catalog 查询与缺失处理

Codex turn_start 使用当时可靠可取的对应模型 catalog 价格快照，消费[观察契约](03-observation-contract.md)；缺价仍累计可靠 token，提示并跳过该次参考费用、不补算，不改变额度渠道与额度读取。

当前展示或恢复后非当前模型行须按该行 provider／model 取得可用 catalog 单价，经 framework 公共模型事实查询，而不是借当前另一个模型的单价。查不到时仅该比例不可用，不从 token 或已保存 Ref 总值倒推出价格。已累计 Ref 正常保留，不因当前 catalog 缺失被删除。具体查询接线是装配票现有接口职责，未因本设计被实现或认证。

支持的官方模型若适用数据缺失，沿[数据权威](12-state-data-contract.md)保留 token、提示并跳过费用；未收录模型与已支持模型缺价不同。token-only／hidden 无金额口径，不因无价格报缺价错误。

### 单元测试与验证职责

价格与名单经常更新；计价、匹配、峰谷系数、缺失处理与参考比例的单元测试注入自造模型／价格数据验证规则，不固定断言真实业务名单、真实单价或复制当前数据做快照。不能因业务数据更新而反复重钉旧预期。真实模型覆盖与真实链路的验收由[验收与切换票](../decision/11-acceptance-cutover.md)决定；测试 green、模型发现或纯数学计算不替代生产账单／TUI／原生链路验证。

## Decision

官方两个精确 ID 人民币计价、仅 OpenCode Go 五个 DeepSeek ID token-only；集中扩展数据保存谷价与共用峰价系数，比例从价格派生，发现只用于维护。Codex 保持 framework catalog 来源与缺价退化，历史金额不重算；本票设计收口，生产装配与验收继续由其原票承担。

## User stories

1. As a 维护者, I want 模型映射与价格集中在一份扩展数据中, so that 更新模型与价格不用改分类／计价算法或要求用户维护配置。
2. As a 用户, I want 官方计价与 Go token-only 按精确 provider／模型区分, so that 不会把第三方订阅用量冒充官方人民币消费或默认免费。
3. As a 用户, I want 参考占比从当前价格派生而历史金额保持请求锚价, so that 能比较各 token 项的等额消耗而不改写已算消费。
4. As a 扩展作者, I want 按对应模型经 framework 获取 Codex catalog 价格并明确缺失, so that 不直接依赖原生 UI 接口或错误借用其他模型价格。
5. As a 开发者, I want 单元测试用自造价格／名单验证规则, so that 频繁业务数据更新不会使算法测试依赖陈旧常量。

## Preconditions

- [行为与归属](02-accounting-ownership.md)定义计费／额度／无口径，可靠请求 usage、开始价格锚点与本周期自身桶由[观察](03-observation-contract.md)／[数据](12-state-data-contract.md)提供。
- [展示](08-presentation.md)拥有 Total／Round／detail 范围；[存储](06-local-storage.md)拥有 token 四桶与锚价总额；不添加价格历史或费用分项。
- [DeepSeek 发现研究](14-deepseek-model-discovery.md)及[Go 发现研究](15-opencode-go-models.md)和本轮实际请求提供名单／API 证据；发现响应不是模型调用或账户权益认证。
- framework 的价格快照与按 provider／model 查询必须由[装配](../decision/10-assembly-layout.md)接入；设计输入不等于生产能力已实现。

## Postconditions

- 可实施模型映射／价格职责与明确缺失策略已定；两个官方旧别名不继续沿用，任意第三方通配不继续沿用。
- 不新增运行期发现请求、用户 YAML、独立比例配置、Go 额度功能、全部 provider 金额支持或真实常量单元快照。
- 维护文档、数据文件与查询接线／消费者迁移由装配／实施落实，真实验收由验收票落实；本票没有生成生产实现。

## Invariants

- 模型事实由 adapter 映射、framework 公共接口交付，业务计价／聚合／比例归 model-cost shared logic；不以业务数据冒用 framework State，不建立第二套框架、配置或原生 import 通路。
- provider＋精确模型为映射键；无口径／缺价／确认零保持领域区别，展示模式不过滤其他已取得且应累计的消费。
- 参考比例与已锚价金额分开，不补算、不重价、不混币种；同倍率假设仅用于当前批准数据表达，不承诺未来价格恒定。
- 模型发现只辅助维护，秘密不进入证据、代码或日志；支持基线与生产验证要求未变。
