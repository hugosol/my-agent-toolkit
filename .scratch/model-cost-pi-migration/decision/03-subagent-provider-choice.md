# 选择 pi 子代理扩展及缺口处理路线

Type: grilling
Status: open
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)
Blocked by: 01, 02, 06

Prerequisites: [OMP 子代理能力基线与 model-cost 迁移差距](01-capability-baseline.md)；[pi 子代理扩展的接口证据与覆盖对照](02-pi-subagent-candidates.md)；[tintinweb 子代理扩展的本机隔离验证](06-tintinweb-runtime-validation.md)。

## Handoff

- 等待完整能力基线、修订后的候选比较与 tintinweb 本机隔离验证，再向用户提出最终取舍。用户已确认验证是独立前置任务；不因需先选型才能测试而制造循环依赖。其他候选若进入最终比较，其尚无运行证据的限制须显式呈现，不自动扩大本轮安装范围。
- 已允许评估补接口/向上游贡献；未批准某个候选、长期 fork、私有接口依赖或能力降级。
- 下一就绪问题：基于事实，选哪一个提供方及何种缺口补齐方式，承担哪些外部前提？

## Question

哪一个 pi 子代理扩展及其版本/接口路线应作为迁移依赖？若没有现成完整覆盖者，用户选择何种补接口、上游协作或其他路线，其约束与重新评估条件是什么？

必须逐项处理 OMP 基线缺口；不得将 model-cost 子集当作完整覆盖。候选、修改范围、外部依赖与取舍均由用户确认；没有可接受路线时如实保持未决，不擅自实施或降级。
