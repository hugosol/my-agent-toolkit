# 确定整合顺序、旧入口退役与验收交接

Type: grilling
Status: open
Assignee: unassigned
Blocked by: 01, 02, 03, 04, 05, 06
Parent: ../map.md

## Handoff

- 已确认的努力范围与限制见地图 Notes；本票尚无 Lighthouse，没有具体设计获批。
- 当前恢复点：从下方 Question 开始；依赖票存在时，先读取其已发布 Lighthouse，并确认其结果满足前置条件。
- 候选方案与源码事实不是政策批准；只读调研不能替代实际行为验收。
- 证据入口：tests/framework/import-boundary.test.ts:108-165；framework/docs/capability-interface-architecture.md §7–12；framework/behaviors/binding.ts:33-84；docs/agents/testing.md；本对话导入扫描结果。
- 本票只作决策，不修改生产代码；发布遵循 Wayfinder，普通讨论先留在对话，整票完成或暂停/保存/切换时再发布。

## Question

如何把全部已发布决定汇成无关键悬案的实施交接计划，按真实依赖串联五项重构并最终关闭旧入口？

- 建立最终公开声明/运行时入口/内部 port 的归属表和消费者迁移清单；definition、assembly、requirements 与 integration checklist 等残余类型必须有落点，不可只完成五个目录。
- 明确每批前置条件、允许修改的共享文件、退出条件、失败时如何在未完成切换前保持可验证；不引入最终保留的兼容 re-export。
- 基于已定设计重新评估类型依赖、运行时效果、共享文件、测试/宿主资源四类冲突。只有全部证明独立的切片才可并行；其余串行。当前证据不足以批准任何生产实施并行。
- public.ts、core/assembly、core/definition、core/config、core/integration、modules/http、modules/files 的 extension legacy 例外如何逐项退役？内部仍可保留原文件，不等于扩展仍可导入。
- 明确静态限制、实际运行时表面、capability 行为、三个真实扩展及两种 harness 的验证矩阵；按 testing.md 区分迭代、完成、集成与真实 smoke，串行协调共享工作树运行。
- 文档/ADR 变更、已完成 Session 的不回退检查、未验证项与实施交接出口如何记录？计划完成不是实现完成，不创建生产 implementation tickets 来冒充决策结论。

## Comments

尚未认领或开始访谈。
