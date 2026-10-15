# 第三方能力适配的集中组织与公共语义复用

Type: grilling
Status: open
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)
Blocked by: 01, 03

Prerequisites: [OMP 子代理能力基线与 model-cost 迁移差距](01-capability-baseline.md)；[选择 pi 子代理扩展及缺口处理路线](03-subagent-provider-choice.md)。

## Handoff

- 已确认：依赖 pi 第三方扩展的适配代码集中在一个文件或目录管理。
- 具体路径、模块接口、原生/第三方适配接线、第三方未安装或不兼容时的行为尚未决定。
- 下一就绪问题：选定提供方后，什么最小接口能隐藏其机制，同时兑现现有框架契约？

## Question

选定第三方提供方后，依赖其能力的 adapter 如何集中组织，并与 pi 原生机制共同实现 framework 公共契约？明确代码职责、依赖方向、公开/私有接口、装配、订阅清理和缺失/不兼容依赖的可见行为。

遵循 Extension 开发地图：不复制 shared-logic，不在 adapter 重建 framework 公共语义，不向业务泄漏第三方 context/registry，不无依据新增通用插件系统。扩展专属绘制与接线仍留在 extension harnesses。目录与接口方案必须经用户确认。
