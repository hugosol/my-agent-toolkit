# 模型覆盖、集中价格数据与参考比例：确认来源

本文件保存本轮 Wayfinder 访谈的确认链与证据限度，政策只在[模型覆盖 Lighthouse](../lighthouse/13-model-catalog-policy.md)。本轮没有修改生产代码、正式配置、用户 key 文件或统计文件。

## 可恢复的用户确认

来源为本会话用户原话与交互选择；不将未选候选当确认。

- Q1／Q2：用户希望参数集中维护，主要使用 deepseek-v4-pro／deepseek-flash；“价格维持现在两套pro/flash，峰谷逻辑都维持和旧extension一致”；第三方当前只有 OpenCode Go，选择 token-only 而非官方统计。
- Q3：“不自动支持未收录deepseek模型，必须显示配置价格表才能开启所有功能”。结合后续 Q4，显式配置指扩展内数据，不要求用户 YAML。
- Q4：“扩展单一数据文件，一般不需要用户维护，但是单元测试时不要依赖具体数据测试，因为价格会经常调整”。
- Q5：“希望包含https://api.deepseek.com/models中能获取的所有模型的精确ID，计价方面除了pro之外的模型都按flash”。这曾是待真实响应验证的集合，不代表运行时自动发现或未知模型自动套 flash。
- Q6：“模型发现 API 是否只辅助开发和维护，可以记录到文档中，但扩展目前没有功能需要依赖这个接口”。
- 用户授权实际使用其本地 key 文件发起 GET /models；key 只在请求进程内读入，不打印、不持久化到仓库。成功返回的两个 ID 随后获用户明确限定：“模型范围限定在这两个id中，不再支持其他id”。因此官方当前名单严格为 deepseek-v4-pro／deepseek-flash，不补入旧别名。
- Q8：“同意”。对应建议：Codex 请求缺价保留 token／额度，提示并跳过本次参考费用、不补算；展示缺相应模型权重则参考占比不可用，不借其他模型价格；已累计 Ref 保留。
- Q9：用户要求从价格表计算比例，“不写死配置”，随后指出峰谷同比例时无需重复价格表。解释旧扩展实际存两套表、当前全部峰价恰为谷价两倍后，交互明确选择“谷价＋峰价系数”；提问内容为 pro／flash 各一套谷价＋共用峰价系数 2，计算派生峰价与参考占比，不另存峰价表或比例表。未来非同比例调价须显式修改数据表达，不能静默套共同系数。
- Q10：解释 token-only 的用量／上下文／Effort／Total／Round／detail 能力，以及不计金额、不查询余额／Go 额度／Codex 双窗口后，交互明确选择“五个 DeepSeek ID”。不是全部 38 个 Go 模型，也不是仅两个；仅 provider opencode-go 生效。
- 整票确认：展示八项完整收口摘要（两官方 ID／五 Go ID／其他第三方 hidden／集中数据／谷价与系数／开发维护发现／比例与历史分离／缺价与自造测试数据），用户选择“确认收口并发布”。批准发布、追踪并结案，不批准生产迁移。

## 旧到新与候选处置

- 官方旧四个精确 ID → 仅真实 /models 返回的两个 ID；官方不再支持 deepseek-v4-flash／deepseek-v4-flash-vision-exp。
- 旧任意第三方 provider 下 pro／v4-flash token-only → 仅 opencode-go 的五个显式 ID；全部 Go 38 个模型与任意第三方同名通配候选不采纳。
- 旧峰／谷两套硬编码价格 → 两套谷价＋共用峰价系数 2；当前实际价格、峰谷时间、holiday、请求锚价及 CacheWrite 不单独计费不变。
- 原局部“维护比例表／固定权重” → 从当前价格数据计算权重与比例，不维护第二套比例配置；真实累计不重估。原生 catalog seam 及参考占比非历史分项的约束保留。
- 用户 YAML 覆盖、运行期 /models 请求、远端抓价、未知 ID 自动支持、Go 额度接入、历史价格账本及价格热更新均未采纳。若未来价格不再共同比例或覆盖范围改变，重新显式决定；不猜未来价格。

## 本会话执行证据

### DeepSeek 实际响应

GET https://api.deepseek.com/models：无鉴权调用返回 HTTP 401；用户授权本地读取 key 后，PowerShell Invoke-RestMethod 成功返回 object=list、以下两个 data[].id：

| id | name | context_window | max_output_tokens | input_modalities |
| --- | --- | --- | --- | --- |
| deepseek-flash | DeepSeek-V4.1-Flash | 1048576 | 393216 | text, image |
| deepseek-v4-pro | DeepSeek-V4-Pro | 1048576 | 393216 | text |

两者 object=model、owned_by=deepseek、output_modalities=[text]、effort.supported_levels=[low,high,max]、default_level=high。anthropic_messages.system_prompt_update 分别为 in-history／leading-only。响应没有价格／币种／峰谷或计价家族字段，也没有另外两个旧别名。本证据仅代表这次凭据／时点的发现响应，不认证模型调用、账单或所有未来账号结果。请求失败处理不输出 credential，最终成功输出未包含 key／Authorization。

### OpenCode Go 实际发现

主会话再次 GET https://opencode.ai/zen/go/v1/models 成功返回 object=list、38 个条目；其中 DeepSeek ID 正好为 deepseek-v4-pro、deepseek-flash、deepseek-v4-flash、deepseek-v4.1-flash、deepseek-v4-flash-vision-exp。未使用凭据；不证明本用户订阅逐模型可调用。发现字段 owned_by=opencode 不等于接入 provider ID；provider 身份由第一方文档与 catalog 映射为 opencode-go，和 Zen/PAYG 的 opencode 分开。

完整 38-ID 快照、文档／catalog 差异与源引用保存在[OpenCode Go 调研分支资产](https://github.com/hugosol/my-agent-toolkit/blob/1fd3c76b2c2c47b39504d7a11de4255ba8651d00/research/opencode-go-models.md)。调研分支已 push，无 PR、未合并。

### 旧源码与数学证据

旧 model-mode 分类函数实际运行：官方四 ID deepseek；普通第三方仅 pro／v4-flash token-only，flash／vision-exp hidden；openai-codex 不按此名单限制。旧 cost-calc 直接保存两套价格：pro 谷价 input=4.5、cacheRead=0.15、output=13.5，峰价=9／0.30／27；flash 谷价=1／0.02／4，峰价=2／0.04／8，单位 CNY/1M。峰／谷所有项共同乘 2，归一化比例相同。旧源码路径为 E:/Developer/myhub/my-omp-toolkit/extensions/model-cost/{model-mode,cost-calc,index}.ts；旧源码 revision 的正式冻结由装配票负责，活工作树不是冻结 oracle。

[DeepSeek 第一方调研资产](https://github.com/hugosol/my-agent-toolkit/blob/aa51b5e/research/deepseek-model-discovery.md)的“未做鉴权请求”仅限定其隔离调研方法；本文件上面的后续主会话鉴权实测已补全实际名单，不能沿用其当时 missing evidence 作为本票当前 blocker。

## 证据边界

已执行模型发现与旧分类，不等于生产请求计价、TUI、Go 额度、模型调用或多进程存储已通过验收。未创建生产数据文件、未新增永久测试。后续集成／端到端证明由[验收与切换票](../decision/11-acceptance-cutover.md)决定，业务数据更新不靠固定真实价格／名单的单元断言兜底。

## 发布后检查

Backtracer 按本轮模型覆盖／集中数据／价格派生比例／缺价／开发维护与测试信号追踪，观察、数据、归属、展示、命令、装配及验收的既有 scope 均有提供者；具体 catalog 查询与生产测试仍未实现，但已经在装配／验收问题范围内，不另开重复决策票。没有发现需要新用户 ruling 的上游冲突；原 fog 不被发现接口证据消除。

本轮实际执行 tracker 导航 smoke：三个发布决策票为 resolved、assignee 空；各自唯一 Handoff 在 Question 前；发布文件与地图的 92 个本地导航链接存在。重新按 status／claim／blocking 扫描全部决策票，仅装配票是 open、未认领且全部前置满足；验收票仍被装配阻塞。只验证决策存储与导航，不宣称生产迁移完成。
