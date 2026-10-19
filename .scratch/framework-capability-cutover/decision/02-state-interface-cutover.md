# 确定 State 完整契约与授权保持规则

Type: grilling
Status: open
Assignee: unassigned
Blocked by: 01
Parent: ../map.md

## Handoff

- 已确认的努力范围与限制见地图 Notes；本票尚无 Lighthouse，没有具体设计获批。
- 当前恢复点：从下方 Question 开始；依赖票存在时，先读取其已发布 Lighthouse，并确认其结果满足前置条件。
- 候选方案与源码事实不是政策批准；只读调研不能替代实际行为验收。
- 证据入口：framework/interface/state/index.ts；framework/core/definition.ts:23-82；framework/core/state.ts:160-228、268-296；ADR-0002 的 One State module 与 Owner-scoped effect capabilities。
- 本票只作决策，不修改生产代码；发布遵循 Wayfinder，普通讨论先留在对话，整票完成或暂停/保存/切换时再发布。

## Question

StateDeclaration、StatePersistence、StateInheritance 与现有 OwnerReference、DeclaredValueSeam、OwnerCapabilityHandle 如何集中为一个扩展侧 State interface，同时保持已有 State module 的 depth？

- 哪些 owner-scoped read 是真实扩展需要，哪些 view、store、access 类型仅属于内部？不得因为目录迁移新增按 Owner key 获取 writer 的能力。
- 如何保持交付写入、retained capability 撤销、旧句柄读值、session-entry / memory 恢复及 follow / none 语义？
- State 对 Feedback 和 Marker 效果的依赖哪些是公开声明依赖，哪些保持内部注入？
- 应迁移哪些 authoring 和内部 import，如何确认 State 已从旧入口完整退出？
- 通过扩展实际取得的 seam 应覆盖哪些行为；哪些内部生命周期/接入测试需要保留？

## Comments

尚未认领或开始访谈。
