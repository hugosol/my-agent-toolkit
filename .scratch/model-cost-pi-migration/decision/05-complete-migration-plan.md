# model-cost 完整迁移的职责落点与验收路线

Type: grilling
Status: open
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)
Blocked by: 01, 03, 04

Prerequisites: [OMP 子代理能力基线与 model-cost 迁移差距](01-capability-baseline.md)；[选择 pi 子代理扩展及缺口处理路线](03-subagent-provider-choice.md)；[第三方能力适配的集中组织与公共语义复用](04-third-party-adapter-organization.md)。

## Handoff

- 终点是可交给实现的完整迁移方案，最终产品目标为 pi 上保留 model-cost 现有完整功能。
- 不预设只需子代理适配；以能力差距报告核对其他原生事实、绘制、入口和装配等实际缺口。
- 下一就绪问题：依赖和模块组织明确后，所有功能分别复用或补在哪里，什么可观察证据才构成迁移成功？

## Question

在已选子代理提供方及已确认适配组织下，model-cost 全部现有功能如何迁移到 pi？逐项明确复用的声明/shared-logic/framework、必要的公共 pi adapter 映射、extension harnesses 专属实现及薄装配/发现入口，并确定真实宿主验收路径、兼容性前提和可交接实现范围。

方案须覆盖研究揭示的所有功能差距，不以子代理选型完成代替迁移路线完成。验收区分静态接口证据、可运行验证及需要后续实现才能验证的条件；不得宣称仅凭测试或源码阅读已经完成迁移。
