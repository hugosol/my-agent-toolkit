# pi 原生事实到 Round 边界的映射

Type: grilling
Status: open
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)
Blocked by: 01, 07

Prerequisites: [OMP 子代理能力基线与 model-cost 迁移差距](01-capability-baseline.md)；[nicobailon 子代理扩展的本机隔离验证](07-nicobailon-runtime-validation.md)。
Related: [选择 pi 子代理扩展及缺口处理路线](03-subagent-provider-choice.md)；[第三方能力适配的集中组织与公共语义复用](04-third-party-adapter-organization.md)；[model-cost 完整迁移的职责落点与验收路线](05-complete-migration-plan.md)。

## Handoff

- 建票来源：2026-10-16，用户在提供方选型讨论中提出，若完整关轮指通过 pi 原生事件确定 Round 边界，则“我认为需要一个单独的ticket来讨论”。本票只承接该决策，不在创建时认领或解决。
- 权威输入：[完整能力基线](../lighthouse/01-capability-baseline.md)与 [nicobailon 真实验证](../lighthouse/07-nicobailon-runtime-validation.md)。Round、Turn、Working、Idle 的定义沿用 framework/GLOSSARY.md，不重新定义公共语义。
- 已知输入：pi 有 agent_settled、isIdle、hasPendingMessages 等事实；验证未证明所有后台来源及延迟自动继续的完整等价规则。事实存在不等于边界判据已获批准。
- 下一就绪问题：逐项列出 pi 中开始、工具执行、待续、排队、后台完成通知及终止的事实和顺序，哪些证据足以开始、持续、结束或截断一个实际会话的 Round？优先检查 pi 公开事实，不直接假定必须修改第三方。
- 需保留：主会话与子会话各自的 Round；父会话等待或接收子结果的归属；取消、终态失败、reload/恢复及缺失边界；不得把一次响应结束、短暂 idle 或所有子代理存活与否单独当作关轮充分条件。
- 证据限制：既有验证为固定版本及有限场景，尚未形成完整时序证明。本票不执行生产适配、不复用旧付费预算；如需独立验证或原型，先明确范围与授权。

## Question

如何以 pi 的原生公开事件及状态事实，结合必要的子代理提供方公开事实，为每个实际会话映射 framework 已定义的 Round 起止、持续及截断边界？

明确自动继续、排队输入、前后台委派与完成通知、取消/失败、重载/恢复的判据与事件顺序，指出无法仅靠现有事实解决的缺口及其处理路线，并给出可观察的验收场景。公共 Round 语义保持在 framework；具体模块组织由适配组织票承接，完整迁移票消费本票结果。不得把“事件存在”当作完整映射已成立，也不以缺失事实推断空闲或完成。
