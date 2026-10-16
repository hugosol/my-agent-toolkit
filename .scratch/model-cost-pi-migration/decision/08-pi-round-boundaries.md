# pi 原生事实到 Round 边界的映射

Type: grilling
Status: resolved
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)
Blocked by: 01, 07

Prerequisites: [OMP 子代理能力基线与 model-cost 迁移差距](01-capability-baseline.md)；[nicobailon 子代理扩展的本机隔离验证](07-nicobailon-runtime-validation.md)。
Related: [选择 pi 子代理扩展及缺口处理路线](03-subagent-provider-choice.md)；[第三方能力适配的集中组织与公共语义复用](04-third-party-adapter-organization.md)；[model-cost 完整迁移的职责落点与验收路线](05-complete-migration-plan.md)。

## Handoff

- 已确认结果唯一权威：[pi 原生事实到 Round 边界的映射](../lighthouse/08-pi-round-boundaries.md)。用户在本票会话确认简化原生事件主干（Q6）、装配注入（Q8）、遵循既有保活标准（Q7 最终回答）、简单取消及终态失败原则（Q9/Q10），最后对 Q11 验收清单回答“采用”，进入完成发布边界。
- 本票已无待访谈问题，发布及追溯已完成；下一就绪问题属于 [model-cost 完整迁移的职责落点与验收路线](05-complete-migration-plan.md)：结合全部已发布前置，形成逐项职责落点、实现范围与真实宿主验收。此链接不构成认领或开启下一票。
- 后续必须消费 [完整能力基线](../lighthouse/01-capability-baseline.md)、[选型权威](../lighthouse/03-subagent-provider-choice.md)、[集中组织权威](../lighthouse/04-third-party-adapter-organization.md)及 [nicobailon 真实验证](../lighthouse/07-nicobailon-runtime-validation.md)；本票补充具体 Round 映射，不复制这些主题的政策。
- 保留的理由/被拒分支：用户要求避免复杂状态机；Q5 逐通知/逐请求证明结果被读取未获批准并被简化路线取代；不再要求 Round 专用上游接口；遵循公开保活标准也接受其已有唤醒超时，不自行增加延长/超时机制。详细确认来源与替代关系保存在本票 Lighthouse，不把旧候选当现行约束。
- 证据：[本轮源码核查与模块 smoke](../research/08-round-boundary-facts.md)。真实 parent-wake 模块的注入时钟/宿主回调 smoke exit 0，覆盖既有唤醒期限、取消只追加及下次执行解除 hold；不是公开协议注册、真实 pi/framework Round 或 model-cost 计费保存的集成通过。固定版本的既有真实验证不能替代新适配验收。
- 保留事项：实际会话各自 Round、父子结果归属、未来 schedules 不挂轮、取消/终态失败与晚到结果、恢复截断/未知、接入失败与正常 false 的区别，按 Lighthouse 及已确认清单实现。不执行生产代码/安装切换，不复用旧付费预算。
- Backtracer 已完成：按下方记录追溯基线、选型、集中组织及真实验证。OMP/普通 framework 终止分支差异的已确认复核问题已加入 [完整迁移方案的 Handoff](05-complete-migration-plan.md)，保留其其他恢复上下文及 open/未认领状态；本票不默默扩大 OMP 修改。无其他未归属的确认缺口，无待用户裁决的上游政策冲突。

## Question

如何以 pi 的原生公开事件及状态事实，结合必要的子代理提供方公开事实，为每个实际会话映射 framework 已定义的 Round 起止、持续及截断边界？

明确自动继续、排队输入、前后台委派与完成通知、取消/失败、重载/恢复的判据与事件顺序，指出无法仅靠现有事实解决的缺口及其处理路线，并给出可观察的验收场景。公共 Round 语义保持在 framework；具体模块组织由适配组织票承接，完整迁移票消费本票结果。不得把“事件存在”当作完整映射已成立，也不以缺失事实推断空闲或完成。

## Comments

### 完成发布与 Backtracer

- 用户确认来源与候选取舍由 [Lighthouse Discussion](../lighthouse/08-pi-round-boundaries.md) 唯一维护；本票保留恢复点与证据导航，不复制完整规则。Q5 未批准，Q7 原“可能补上游接口”的提议被用户最终选择现有公开保活标准取代。
- 追溯来源：新 Round Lighthouse 及其 User stories/Invariants，结合 [完整基线](../lighthouse/01-capability-baseline.md)、[提供方选择](../lighthouse/03-subagent-provider-choice.md)、[集中组织](../lighthouse/04-third-party-adapter-organization.md)、[固定工件真实验证](../lighthouse/07-nicobailon-runtime-validation.md) 和地图当前问题范围。
- Intent 信号：同轮归属/保存、取消与未来调度不挂轮、第三方变化集中处理、每实际会话及真实宿主验收；提供者分别由现有 framework/基线、选型与组织、实际验证提供设计或证据输入，剩余生产交付/验收由完整迁移方案拥有，不能以已解决规划替代运行通过。
- Pattern/层信号：OMP 原生事件主干/延后重检、公共 Round、adapter 私有第三方接入、同/独立进程、shared-logic 复用。新映射遵循这些 seam；没有把 nicobailon 协议上移到业务或公共 Round 定义，也没有复制其内部队列。
- 对等差异：现有 OMP/framework 普通路径缺显式终止豁免；Q11 已确认交后续复核，具体 unanswered question 已追加到完整迁移票 Handoff。该问题已有合适 owner，不新增重复决策票，不自动批准 OMP 修改。
- 冲突检查：本票对既有保活标准的接受是当前会话简化修订，未改写历史研究事实；选型/组织允许依赖公开事实，本票没有私有 API、额外付费或长期 fork。耗时精度策略仍由组织权威拥有，不因 Round 规则被放宽。
- 追溯结论：确认缺口均已归属；无未归属新票、无未决上游政策裁决。没有足够新问题需要把地图剩余 fog 再切票；完整迁移方案仍是下一前沿。

