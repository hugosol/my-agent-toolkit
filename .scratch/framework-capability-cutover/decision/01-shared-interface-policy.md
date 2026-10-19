# 确定统一 interface 所有权与 authoring 迁移原则

Type: grilling
Status: open
Assignee: unassigned
Parent: ../map.md

## Handoff

- 已确认的努力范围与限制见地图 Notes；本票尚无 Lighthouse，没有具体设计获批。
- 当前恢复点：从下方 Question 开始；依赖票存在时，先读取其已发布 Lighthouse，并确认其结果满足前置条件。
- 候选方案与源码事实不是政策批准；只读调研不能替代实际行为验收。
- 证据入口：framework/docs/capability-interface-architecture.md §2、§7–9；framework/interface/README.md；framework/core/assembly.ts:27-43；tests/framework/import-boundary.test.ts:108-165。
- 本票只作决策，不修改生产代码；发布遵循 Wayfinder，普通讨论先留在对话，整票完成或暂停/保存/切换时再发布。

## Question

五项重构共同遵守哪些公开契约规则？如何区分扩展可见声明、adapter-facing 契约、内部实现与 authoring 组合声明，使各 capability 不重复拥有同一类型？

- definition / assembly 的 canonical 声明如何组合各 capability；哪些 helpers、闭合集、校验与生命周期规则保持内部？不在本票设计具体函数形状。
- 扩展获得的运行时对象是否必须与收窄后的静态契约一致；哪些属性的可达性需要作为验收对象？
- interface 运行时入口的精确例外如何限定（defineExtension、request、updateFile、getConfig 及必要错误类），避免 blanket 允许内部依赖或循环依赖？
- ImplementationContext 是否按 capability 分组？分组本身不增加 depth，不默认扩展 Session 的对象形态。
- runtime/port 的路径迁移是否纳入本轮，或保持现有内部位置？不能把“暂不预拆 HarnessPort”误写为已批准完整 runtime 重组。
- 旧入口如何随迁移关闭；共享入口尚有其他 capability 时如何阻止已迁移契约从旧路径再导出？

## Comments

尚未认领或开始访谈。
