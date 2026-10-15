# model-cost 迁移到 pi：决策地图

Labels: wayfinder:map

## Destination

为 model-cost 在 pi 上实现现有完整功能确定可交接的迁移方案：明确子代理依赖选型、OMP 能力基线覆盖、缺口补齐、职责落点与验收路径，使实现阶段无需再作关键设计或依赖取舍。
最终产品目标是完成迁移；本地图默认只做规划，不执行生产迁移。

## Notes

- 遵循 [Extension 开发地图](../../framework/docs/extension-development-map.md)：复用同一份 extension definition 与 shared-logic；公共语义留在 framework，宿主机制留在 adapter 或 extension harnesses，装配保持薄。
- 子代理能力基线是当前 OMP adapter 的全部子代理相关语义，不以 model-cost 当前消费子集替代。调研另行标识消费子集。
- 依赖 pi 第三方扩展的适配代码须集中在一个文件或目录管理；具体组织及接线尚未决定。
- 允许考虑补第三方接口、向上游贡献；长期 fork 不是已批准路线。候选选择及所有取舍由用户最终决定，研究结论不能代替批准，也不能默默降低基线。
- 上述范围与偏好由建图对话中用户对 Q1、Q2、Q3 的回答确认；不代表后续具体设计已获批准。
- 每次会话按需读取 grilling、domain-modeling；设计适配组织时读取 codebase-design；外部调研读取 research。发布结论使用 lighthouse，追溯使用 backtracer。
- 本地参考源码：`E:/Developer/myhub/oh-my-pi`、`E:/Developer/myhub/pi`；市场：<https://pi.dev/packages>。

## Decisions so far

- [OMP 子代理能力基线与 model-cost 迁移差距](lighthouse/01-capability-baseline.md)：已发布固定修订的源码事实基线、model-cost 消费标注与 pi 缺口分类；不含提供方选择、组织批准或运行通过结论。
- [pi 子代理扩展的接口证据与覆盖对照](lighthouse/02-pi-subagent-candidates.md)：已发布修订的候选公开事实对照与覆盖边界；取代旧报告过强分类，不批准提供方，也不代表实际运行或完整覆盖通过。
- [tintinweb 子代理扩展的本机隔离验证](lighthouse/06-tintinweb-runtime-validation.md)：已发布真实运行结论——公开总线支撑“自 spawn 顶层代理”的发现/启动/终态/停止；嵌套需 agent 定义 opt-in，且嵌套与 workflow 子代理在公开总线不可见；逐请求与查看席位无公开出口；取消运行无费用读数；未覆盖项已标注；不批准提供方选择。

## Decision tickets

- [OMP 子代理能力基线与 model-cost 迁移差距](decision/01-capability-baseline.md)：research；已正式发布并完成追溯，研究范围已解决；证据与后续问题归属见 Handoff。
- [pi 子代理扩展的接口证据与覆盖对照](decision/02-pi-subagent-candidates.md)：research；已修订覆盖分类、发布 Lighthouse 并完成追溯，研究范围已解决；不含选型批准或运行通过结论。
- [选择 pi 子代理扩展及缺口处理路线](decision/03-subagent-provider-choice.md)：grilling；能力基线、候选对照与本机隔离验证均已发布，前置已满足，下一步由用户选择提供方与缺口处理路线。
- [第三方能力适配的集中组织与公共语义复用](decision/04-third-party-adapter-organization.md)：grilling；等待能力基线与提供方选择。
- [model-cost 完整迁移的职责落点与验收路线](decision/05-complete-migration-plan.md)：grilling；等待能力基线、提供方选择与适配组织决定。

- [tintinweb 子代理扩展的本机隔离验证](decision/06-tintinweb-runtime-validation.md)：task；已按批准限额完成固定版本隔离真实运行验证，Lighthouse 与 Backtracer 均已发布，状态 resolved；结论见 Decisions so far。

## Not yet specified

- 候选实际接口及缺口揭示后，是否需要上游协作、专门的接口补充决策或可运行原型，尚无法确定具体问题。
- 完整功能差距明确后，复杂交互或绘制是否需要独立原型，以及哪些验收细节需要单独决策，尚不明确。

## Out of scope

- 本轮生产实现、实际迁移交付、正式安装与切换；后续通过 implementation tickets 执行。
- 借此次迁移复制 shared-logic、重建 framework 已有语义，或顺带建立面向任意第三方扩展的通用插件系统。
