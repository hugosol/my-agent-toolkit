# 官方计价与 token-only 模型名单如何确定、配置和维护？

Type: grilling
Status: resolved
Assignee:
Outcome: [模型覆盖、集中价格数据与参考比例决议](../lighthouse/13-model-catalog-policy.md)
Blocked by: 01, 02, 14, 15
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[DeepSeek 模型发现 API 提供哪些资料，能否支持集中维护？](14-deepseek-model-discovery.md)；[OpenCode Go 当前支持哪些模型及其精确 ID？](15-opencode-go-models.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Handoff

- 整票获用户“确认收口并发布”；全部 Question 已决定，无未决分支或争议 prerequisite。政策只在[模型覆盖权威](../lighthouse/13-model-catalog-policy.md)，不在本票复制完整规则。
- [确认来源与实际请求](../assets/model-catalog-confirmation-2026-10-12.md)保存 Q1–Q10、交互选择、整票确认、旧到新范围、数据维护与测试约束；[发布前历史](../assets/model-catalog-before-publication-2026-10-12.md)保存旧两段交接及原局部 Lighthouse。旧“名单／维护待决定”恢复点已退役。
- [DeepSeek 发现事实](../lighthouse/14-deepseek-model-discovery.md)含主会话后续真实鉴权补证；[OpenCode Go 发现事实](../lighthouse/15-opencode-go-models.md)含匿名发现／静态文档差异。隔离研究已 push、无 PR、未合并；不携带 credential 内容。发现只证明本次名单，不证明推理、账户权益、账单或生产接线。
- 拒绝或撤回的候选及理由在确认来源／Lighthouse：任意第三方同名通配、全部 Go 模型、旧官方别名延续、用户 YAML、运行期发现／抓价、独立比例配置、当前价重算历史以及真实常量单元快照。未来非同比例调价或新增覆盖需显式更新；没有留下本轮需继续采访的候选。
- 本票设计不会把业务聚合升级成 framework State；可靠 token、请求锚价、无补算、Codex 美元不进消费金额等前置继续消费[数据](../lighthouse/12-state-data-contract.md)／[归属](../lighthouse/02-accounting-ownership.md)／[观察](../lighthouse/03-observation-contract.md)权威。
- 下一 ready 工作是[确定的新能力与 model-cost 如何组织、声明和装配？](10-assembly-layout.md)：读取本票权威后决定数据文件位置／注入、按模型 catalog 查询与公共接线；源 oracle revision 仍在其原 scope。验收与切换仍由[什么证据才算完整迁移，如何安全验收并切换？](11-acceptance-cutover.md)承担。本票不修改这些票的正文、status 或 claim，不在本会话认领第二张 HITL 票。
- 发布后 Backtracer 已完成：模型覆盖／价格来源由本票及两张研究提供；请求锚价与缺失由观察／数据／归属、参考比例与 token-only 展示由展示／命令、集中数据位置／按模型 catalog 查询／原生 seam 由现有装配 scope、真实测试与切换由验收 scope 覆盖。维护／查询／测试信号均有既有提供票；未发现本轮新增未覆盖决策或上游冲突，不改下游 Handoff、claim，不创建重复票。未来未知原生出口与消费者影响仍保留地图原 fog。
- tracker 导航 smoke 通过：本轮三个票均 resolved 且 claim 已释放，一个 Handoff 位于 Question 前，92 个发布导航本地链接存在；重算 frontier 后装配票 open、未认领、无未满足依赖，验收票仍等待装配。此结果不是生产功能验收。

## Question

依据行为与消费归属已确认的 Codex／官方 DeepSeek／token-only／hidden 分层，确定迁移覆盖的精确 provider／Model ID、官方人民币价格与模型映射、别名／未知模型行为、Codex catalog 缺价参考展示，以及这些资料的集中组织、维护来源与更新时间。区分 provider 身份与 URL／发现 owned_by，不擅自扩大官方分类。

明确原实现官方四 ID 与普通第三方两个 token-only ID 的覆盖差异是否保留或有意改变；现状不是批准名单。价格和名单是否使用扩展版本化数据、框架 YAML 或宿主 catalog，参考比例怎样派生且不重写历史锚价费用？若需要外部事实另开 research 票。本票产出覆盖与维护契约，不创建生产数据文件、更新运行配置或执行生产迁移。

## Comments

本轮通过实际旧分类、第一方研究、DeepSeek 鉴权 /models 与 Go 匿名 /models 提高讨论依据；用户先决定维护原则，再依据真实两个官方 ID 收窄覆盖，最后选择共同比例数据表达及五个 Go ID，整票摘要获确认。完整结果／理由在 Lighthouse，compact 确认与证据在资产，前轮全文只在链接历史。

计价单元测试使用自造数据的约束不是禁止真实端到端验证；本次发现／数学依据不替代后续真实 OMP 观察、生产计价、视觉 TUI 或跨进程存储验收。原支持基线与单账号／本机范围不变。
