# 确定统一 interface 所有权与 authoring 迁移原则

Type: grilling
Status: resolved
Assignee: unassigned
Parent: ../map.md

## Handoff

- 已确认结果的唯一权威：[统一 interface 原则 Lighthouse](../lighthouse/01-shared-interface-policy.md)。用户在本票访谈 Q13 后明确回答「同意，可以发布」；各主题确认与理由见该文档。
- 本票全部问题已有共同规则，无待答问题或下一轮访谈；具体 capability 成员、错误类、消费者、验收及整合排程不由本票代决。下一张按序可开始的是 [确定 State 完整契约与授权保持规则](02-state-interface-cutover.md)，开始前需另行认领并读取本 Lighthouse。
- 关键取舍：capability 声明唯一归属；整体契约由 interface 根入口组织，可拆到其拥有的公开 details 文件（在「确定 Feedback、Host facts 与 authoring 契约归属」访谈 Q15 / Q17 获批修订，见原 Lighthouse）；按复杂度组织，不增加 definition/assembly 运行时层、extension.ts 或纯分类 context 包装；interface 封装优先，原有 internal seam 尽量不动。完整政策只存 Lighthouse。
- 发布前只读证据：framework/public.ts、core/definition.ts、core/assembly.ts、interface/session/index.ts；extensions/codebase-tools/definition.ts 与 model-cost/harnesses/omp.ts 的真实定义/factory 形式。公开入口与实际字段证据只说明现状，不证明切换后行为或零调用者。
- 已读取地图及全部后续决策票的 Question 做覆盖追溯；最终追溯结果与发布核验见 Comments。原架构文档的目录/context 候选不是需另行翻转的既有批准；已完成 Session 规则保持。
- 本票仅规划，不修改生产代码，不运行生产测试，不声明任一 harness 或 capability 验证通过。

## Question

五项重构共同遵守哪些公开契约规则？如何区分扩展可见声明、adapter-facing 契约、内部实现与 authoring 组合声明，使各 capability 不重复拥有同一类型？

- definition / assembly 的 canonical 声明如何组合各 capability；哪些 helpers、闭合集、校验与生命周期规则保持内部？不在本票设计具体函数形状。
- 扩展获得的运行时对象是否必须与收窄后的静态契约一致；哪些属性的可达性需要作为验收对象？
- interface 运行时入口的精确例外如何限定（defineExtension、request、updateFile、getConfig 及必要错误类），避免 blanket 允许内部依赖或循环依赖？
- ImplementationContext 是否按 capability 分组？分组本身不增加 depth，不默认扩展 Session 的对象形态。
- runtime/port 的路径迁移是否纳入本轮，或保持现有内部位置？不能把“暂不预拆 HarnessPort”误写为已批准完整 runtime 重组。
- 旧入口如何随迁移关闭；共享入口尚有其他 capability 时如何阻止已迁移契约从旧路径再导出？

## Comments

### 已确认并发布

- 用户逐轮确认共同规则，并对完整结论回答「同意，可以发布」；已发布 [统一 interface 原则 Lighthouse](../lighthouse/01-shared-interface-policy.md)。未采纳的分类目录、extension.ts 与机械 context 分组及理由归档在该权威，不作为待执行设计。
- Backtracer 已依据地图、全部后续票的 Question 和 ADR-0002 Session cutover 约束核对 intent、pattern、dependency、peer 与 layer：未发现新的无主问题或需用户裁决的上游冲突。State / Prompt-Marker / Feedback-Host facts / Command / General 各票覆盖自身声明和可见范围；整合票覆盖残余声明、port 归属、消费者迁移、旧入口关闭、导入检查、文档/ADR 及验证矩阵。开放票是后续决策提供者，不是已经完成的实现。
- 首票已提供这些后续票所需的共同前提；State、Prompt / Marker、Feedback / Host facts、General 成为可认领的决策 frontier。Command 与整合票保留原 blockers。无新 gap，因此不修改其他票的 Question、Handoff、状态或认领，也不新增票。
- 仅发布规划文档；未执行生产修改、测试或 harness smoke。Bun 发布核验已通过：地图、本票与 Lighthouse 共 17 个本地链接存在，本票为 resolved / unassigned，实际 frontier 为 State、Prompt / Marker、Feedback / Host facts、General。该检查不代替未来的运行时验收。
