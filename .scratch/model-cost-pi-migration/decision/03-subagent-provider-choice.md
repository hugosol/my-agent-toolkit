# 选择 pi 子代理扩展及缺口处理路线

Type: grilling
Status: resolved
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)
Blocked by: 01, 02, 06, 07

Prerequisites: [OMP 子代理能力基线与 model-cost 迁移差距](01-capability-baseline.md)；[pi 子代理扩展的接口证据与覆盖对照](02-pi-subagent-candidates.md)；[tintinweb 子代理扩展的本机隔离验证](06-tintinweb-runtime-validation.md)；[nicobailon 子代理扩展的本机隔离验证](07-nicobailon-runtime-validation.md)。

## Handoff

- 2026-10-16 本票选型与缺口路线范围完成，结果唯一权威：[选型 Lighthouse](../lighthouse/03-subagent-provider-choice.md)。用户本轮 Q1、补齐优先级修正、计费纠正、Q5、Q7 及对 Q10 的“全部同意”构成确认；不是生产迁移或额外付费验证授权。
- 跨票耗时修订唯一权威：[组织 Lighthouse](../lighthouse/04-third-party-adapter-organization.md)。用户以目标文件名确认 Q9，并对计时边界确认 Q8；原先 OMP 耗时路径保持不变及有条件放弃的提案被新方案取代，其他 OMP 路径不因此修改。目标票正文、状态及认领未改变。
- 旧恢复点已失效：两候选真实验证均已发布，不再等待 nicobailon 预检或真实调用。验证结果不等于完整基线通过；主/子逐请求观察和离线归并可行，不证明生产 JSON 并发、崩溃恢复、生命周期、State 或全部 provider 已完成。
- 当前本票没有待回答的选型问题。下一按编号就绪的是 [第三方能力适配的集中组织与公共语义复用](04-third-party-adapter-organization.md)，从本票及其自身已发布权威决定接口、接线和寿命；本轮不认领。已创建且独立就绪的 [pi 原生事实到 Round 边界的映射](08-pi-round-boundaries.md) 承接主/子会话 Round 时序；[完整迁移方案](05-complete-migration-plan.md) 等待组织与 Round 结果。
- 选择理由/未采路线：nicobailon 的公开必需子扩展入口及真实身份/父链、逐请求证据优于 tintinweb 的公开观察范围；workflow/调度为加分而非批准依据。累计 cost 不当账本，私有字段、长期 fork、未知记零及界面选择冒充会话切换均未批准。
- 证据入口：[nicobailon 验证权威](../lighthouse/07-nicobailon-runtime-validation.md)、[tintinweb 验证权威](../lighthouse/06-tintinweb-runtime-validation.md)；旧 [产品维护比较](../research/03-product-maintenance-comparison.md) 与 [逐轴缺口比较](../research/03-adapter-gap-comparison.md) 仅按时间点与版本限制使用，过时的“尚无运行证据”以已发布验证取代。
- 追溯恢复点：本轮发布后追溯记录见下方 Comments；未来若事实/接口变化或后续设计不能满足硬需求，按选型权威的重评条件重新决策，不自行降级。

## Question

哪一个 pi 子代理扩展及其版本/接口路线应作为迁移依赖？若没有现成完整覆盖者，用户选择何种补接口、上游协作或其他路线，其约束与重新评估条件是什么？

必须逐项处理 OMP 基线缺口；不得将 model-cost 子集当作完整覆盖。候选、修改范围、外部依赖与取舍均由用户确认；没有可接受路线时如实保持未决，不擅自实施或降级。当前宿主适用范围与耗时修订以各 Lighthouse 为准，历史事实基线不因此改写。

## Comments

### 2026-10-16 访谈与证据摘要

用户在原有能力基线、两候选验证后选择 nicobailon；纠正计费必须走现有自身实现，并明确公开事实/自身逻辑/修改第三方的顺序。Viewed 从“缺出口即必须补”收敛为按 pi 实际显示路径判断，耗时由“运行读数及可放弃”转为两端结束结算、续跑累计及 JSON 保存。Round 已单独建票，完整能力与验收仍由后续决策承接。

本轮直接核对费用算法与 OMP 接线（`request-price.ts:159`、`request-accounting.ts:397,784`、`runtime.ts:407`），以及固定 `v0.78.0` 文档的 inspector 行为（`docs/observability.md:112-135`，本地 HEAD 核对为 `a4c8ced69a8176cdf4179b127feddc8875e3418f`）。无新增真实 provider/TUI 验证；此前真实验证证据沿用其权威。

### 2026-10-16 Backtracer 发布追溯

- 意图信号：自主委派/嵌套/并发/续跑/取消由两候选验证提供事实；同一计费、逐请求完整性、去重/恢复由既有计费实现与适配组织/完整方案承接。运行事实提供者已 resolved，不把未决的生产设计当作已成立前提。
- 模式与层次：definition/shared-logic、framework 公共语义、adapter/harness 接线和发现入口分别在组织及完整方案问题范围内；不新增第二套 Round 或计费。OMP/pi 耗时的两端组织、可靠执行边界、续跑与恢复由组织权威的未决范围承接，全功能验收由完整方案承接；非仅 pi 的单边承诺。
- Round 独立问题已有命名票，完整方案已依赖它；Viewed 的“不为复制 hub 而新增出口”是用户批准的适用范围修订，不是把缺少事实写成已覆盖。真实切会话/复用显示区域的路径若出现，依重评条件返回，不隐含新增保证。
- 冲突核对：旧选型停止点、旧 OMP 耗时路径限制与旧有条件放弃提案，已在各原权威记录旧到新及确认来源。能力基线和运行报告是固定版本事实，不因需求修订改写。术语已移除“必须由宿主报告 duration”的来源限定；现有生产实现/测试契约保持未修改，新计时尚未交付。
- 结果：未发现无主的新决策问题或仍待用户裁决的政策冲突；不新增重复 ticket，不修改其他票的认领/恢复上下文。地图余下 fog 尚不足以精确建票。下一按编号前沿为组织票，独立 Round 票亦可另会话推进。
