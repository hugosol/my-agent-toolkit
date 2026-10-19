# 确定 Command 扩展交付的收窄与运行时隔离

Type: grilling
Status: open
Assignee: unassigned
Blocked by: 01, 02, 03, 04
Parent: ../map.md

## Handoff

- 已确认的努力范围与限制见地图 Notes；本票尚无 Lighthouse，没有具体设计获批。
- 当前恢复点：从下方 Question 开始；依赖票存在时，先读取其已发布 Lighthouse，并确认其结果满足前置条件。
- 候选方案与源码事实不是政策批准；只读调研不能替代实际行为验收。
- 证据入口：framework/core/protocol.ts:527-635；framework/behaviors/control.ts:112-145；framework/behaviors/actions.ts:79；core/assembly.ts:52-79；connect-bot command 与 model-cost period-switch。本对话 Bun 探针观察 directed delivery 同时拥有 state、capability、persist、markers；仅证明可达性，不证明删除后的行为。
- 本票只作决策，不修改生产代码；发布遵循 Wayfinder，普通讨论先留在对话，整票完成或暂停/保存/切换时再发布。

## Question

如何把 Command 声明、命令实现与扩展 delivery 集中到 canonical interface，同时阻止扩展绕过 State seam 直接使用底层持久化和未批准的 Marker transport？

- CommandInvocation / BoundCommand 与 CommandDelivery / ActionDelivery 的扩展可见范围分别是什么？哪些类型应留在内部 port？
- persist 如何从扩展契约与实际对象退出；markers 按 Prompt 与 Marker 的已发布裁决处理，不在这里复制另一份政策。
- 运行时 delivery 如何避免通过 spread 或把 invocation 原样传递而泄漏内部属性；retained capability 仍只从授权交付取得。
- DirectedDirective、RecognizedDirective 与内部解析结果如何区分；哪些 public 导出无真实调用且可删除？
- 保持 toggle / directed / actions 的 owner 限制、写入/持久化/发布顺序、重复执行、未知参数、help 和异步等待/错误规则。
- 哪些 extension 消费者及实际 harness 加载场景证明收窄不损害现有功能？

## Comments

尚未认领或开始访谈。
