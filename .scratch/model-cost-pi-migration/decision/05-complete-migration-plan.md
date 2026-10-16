# model-cost 完整迁移的职责落点与验收路线

Type: grilling
Status: resolved
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)
Blocked by: 01, 03, 04, 08

Prerequisites: [OMP 子代理能力基线与 model-cost 迁移差距](01-capability-baseline.md)；[选择 pi 子代理扩展及缺口处理路线](03-subagent-provider-choice.md)；[第三方能力适配的集中组织与公共语义复用](04-third-party-adapter-organization.md)；[pi 原生事实到 Round 边界的映射](08-pi-round-boundaries.md)。

## Handoff

- 完整规划已发布至 [完整迁移方案 Lighthouse](../lighthouse/05-complete-migration-plan.md)。确认来源、逐功能落点、数据兼容、验收及效率门槛以该权威为准；不在本票重复政策。
- 本票范围无剩余待决定问题。下一步可拆分 implementation tickets，不在本地图执行生产迁移。真实宿主/provider、人工界面及效率验收尚未执行；后续实施须记录证据，不能以本票 resolved 代表迁移通过。
- 原 Round 差异交接已处理：用户确认统一语义，将必要 framework/OMP adapter 调整和两端回归纳入实现范围，限取消/终态失败结算后的终止原则；不重做 OMP 执行器、不构造复杂状态机。[原差异证据](../research/08-round-boundary-facts.md) 仍是静态输入。
- 被拒绝/修正分支：不把全部历史耗时一律标为不完整；不改变路径解释；跨宿主汇总不删除身份来源分区；不将宿主专属接线或 provider 业务上移到 framework；不要求像素一致。精确理由与用户原话见 Lighthouse。
- 证据限制：直接核对 shared-logic/consumption-document.ts 的可选 runtimeMs、harness+id 身份、父链、saveVersion 及严格字段校验，storage-root.ts 的 ~/ 特殊规则；其余完整功能以已发布基线和 Round 证据为输入。未启动宿主/模型/provider，未执行生产代码测试或付费调用。
- Backtracer（2026-10-16）：沿完整基线、提供方、组织、Round 权威追溯完整功能、身份/聚合、自身计费、旧数据、共同路径、终止和验收信号。事实来源由基线与既有固定工件验证提供，组织/生命周期由组织及 Round 权威提供，本票补齐完整交接与验收范围。未发现需新增决策票的缺口或上游政策冲突；现有实现缺失转入实施与验证，不作为新的未决设计。无独立原型或上游修改的已证决策阻塞，未来若集成失败按选型重评规则返回，不虚构现在已通过。

## Question

在已选子代理提供方及已确认适配组织下，model-cost 全部现有功能如何迁移到 pi？逐项明确复用的声明/shared-logic/framework、必要的公共 pi adapter 映射、extension harnesses 专属实现及薄装配/发现入口，并确定真实宿主验收路径、兼容性前提和可交接实现范围。

方案须覆盖研究揭示的所有功能差距，不以子代理选型完成代替迁移路线完成。验收区分静态接口证据、可运行验证及需要后续实现才能验证的条件；不得宣称仅凭测试或源码阅读已经完成迁移。
