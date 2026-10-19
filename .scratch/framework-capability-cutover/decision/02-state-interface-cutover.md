# 确定 State 完整契约与授权保持规则

Type: grilling
Status: resolved
Assignee: unassigned
Blocked by: 01
Parent: ../map.md

## Handoff

- 已确认结果的唯一权威：[State 完整契约与授权保持规则 Lighthouse](../lighthouse/02-state-interface-cutover.md)。本轮用户最终回答「Q13 Q14 同意，请进入下一步」；逐项确认、范围和取舍见该文档。
- 本票全部问题已决定，无待答分支或恢复访谈；下一张按序可开展的是 [确定 Prompt 与 Marker 的最小扩展可见范围](03-prompt-marker-exposure.md)，须在后续会话另行认领。本会话不继续解决其他非 research 票。
- 关键取舍：完整操作原有 Owner 场景的声明值，不新增逐字段权限或通用 Owner 查询；保留操作对象、生命周期与既有组合，不交付内部存储。早期将完整访问理解为新增细粒度隔离的建议未采用；用户没有授权任意 Owner 或生命周期结束后的写入。
- 紧凑证据：framework/interface/state/index.ts；core/definition.ts、state.ts、protocol.ts；behaviors/control.ts:112-138、session-events.ts:70-145；扩展 State 使用面；framework/GLOSSARY.md；ADR-0002 的 Owner-scoped effect capabilities / One State module。当前源码支持 read/write 对象、实时读取、回调组合与子代理写入丢弃；不是迁移后运行时验收证明。
- Backtracer：已核对共同原则 Lighthouse、既有 ADR 约束及全部后续票的当前 Question。声明/对象封装、后台效果、恢复继承、效果组合和旧入口退役均有既有权威或下游范围承接；未发现新无主 gap 或上游冲突。Command / Marker / Feedback / 整合仍有未决问题，不因本票解决而自动完成；无须改写其他票的 Handoff 或新增票。
- 本票仅规划文档发布，不修改生产代码，不运行行为测试或 harness smoke；发布链接、状态与实际 frontier 另作文档检查。

## Question

StateDeclaration、StatePersistence、StateInheritance 与现有 OwnerReference、DeclaredValueSeam、OwnerCapabilityHandle 如何集中为一个扩展侧 State interface，同时保持已有 State module 的 depth？

- 哪些 owner-scoped read 是真实扩展需要，哪些 view、store、access 类型仅属于内部？不得因为目录迁移新增按 Owner key 获取 writer 的能力。
- 如何保持交付写入、retained capability 撤销、旧句柄读值、session-entry / memory 恢复及 follow / none 语义？
- State 对 Feedback 和 Marker 效果的依赖哪些是公开声明依赖，哪些保持内部注入？
- 应迁移哪些 authoring 和内部 import，如何确认 State 已从旧入口完整退出？
- 通过扩展实际取得的 seam 应覆盖哪些行为；哪些内部生命周期/接入测试需要保留？

## Comments

### 完成发布

- 用户确认 Q1、Q4–Q6、Q10–Q14 的范围与取舍，最终明确批准进入发布；Q7–Q9 的澄清已在 Q11、Q12 与最终确认中收敛。完整规则与确认原话只存 Lighthouse。
- 已解释 capability.state 返回 read/write 操作对象，不返回内部 State；子代理按原语义行为上只读；持久化与 Marker 继续外部实现、回调组合，不新增复杂度。Q10 的实时读取为现有实现，只修正歧义说明。
- 发布后 Backtracer 追溯：扩展唯一入口与实际对象封装由共同原则提供；Owner life、恢复继承及组合由既有 ADR/State module 提供；Command 票已有 persist 与实际 delivery 泄漏问题，Prompt / Marker 票已有 transport 可见性，Feedback 票已有通道生命周期，整合票已有消费者、旧入口与真实 harness 验收矩阵。没有新 gap、peer asymmetry、layer violation 或需用户裁决的冲突。
- State 已提供 Command 所需的授权保持设计输入，但 Command 仍等待 Prompt / Marker 与 Feedback / Host facts；整合票仍等待其他 capability。地图 fog 未因本票形成可单独命名的新问题，保留原有范围，不新增票、不修改其他票的 claim 或 recovery context。
- 本轮不执行生产变更或生产行为验收。Bun 文档发布检查已通过（exit 0）：地图、本票与本 Lighthouse 的 22 个本地链接均存在；本票实际状态为 resolved / unassigned；实际 frontier 为 Prompt / Marker、Feedback / Host facts、General。此检查不证明未来生产行为或 harness 兼容性。
