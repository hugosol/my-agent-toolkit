# 第三方能力适配的集中组织与公共语义复用

Type: grilling
Status: resolved
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)
Blocked by: 01, 03

Prerequisites: [OMP 子代理能力基线与 model-cost 迁移差距](01-capability-baseline.md)；[选择 pi 子代理扩展及缺口处理路线](03-subagent-provider-choice.md)。

## Handoff

- 当前结果：[集中组织与公共语义复用 Lighthouse](../lighthouse/04-third-party-adapter-organization.md)。本次组织范围已决定、发布并完成追溯；尚未执行生产迁移。
- 恢复入口：直接读取上述权威的现行主题与确认来源表，不从早期访谈中间提案恢复。最终 Q31 是 State 获取不到时默认值兜底并自动恢复，不是 extension 不可用；最终 Q32 是活动时长粗估，不是精确 execution 测量；Q33 要求显式目录配置、无代码兜底；最终 Q34 是本机 IPC，文件仅持久化/定位。
- 已决定的其余范围及理由在权威中唯一维护：第三方机制放 framework adapter，公共子代理上下文按同进程/独立进程集成，harnesses 对称薄装配，统一 JSON 提交/只读同步，稳定接入模式与 detail 闸门，订阅成对清理，不新增子代理回收机制。
- 没有保留等待本票继续选择的候选。不能以“具体实现尚未运行”误认组织问题仍未决定，也不能以规划完成声称接口已实现。
- 剩余输入有现成归属：[pi 原生事实到 Round 边界的映射](08-pi-round-boundaries.md) 决定活动/计费边界；[model-cost 完整迁移的职责落点与验收路线](05-complete-migration-plan.md) 决定完整功能、旧记录处理及 OMP/pi 共同新路径的验收与实现交接。实现须证明目标等价、效率无明显退化、复杂度无显著增加。
- 下一就绪问题应转到独立 Round 票：哪些 pi 公开事实及顺序足以开始、持续、结束或截断各实际会话的 Round？不得借粗估耗时降低计费 Round 的正确性。
- 证据资产：[State](../research/04-state-follow-facts.md)、[刷新/提交](../research/04-refresh-trigger-facts.md)、[执行边界](../research/04-execution-boundary-facts.md)、[本机载体](../research/04-local-transport-facts.md)。前三者是静态核对及既有实测引用；载体研究含 Windows Node/Bun 四组合基础探针，不是 State、身份安全或 framework 集成通过。研究任务记录已清理临时程序与进程；没有新模型调用、安装或生产配置修改。
- 旧停止点“选型后再讨论最小接口”和部分发布时“源票未认领”已失效。Q19 独立 execution 轴、Q27 extension 因 State 缺值不可用、Q28 等重载恢复等中间分支均已由后续明确选择取代，不再作为候选。

- 发布后追溯（2026-10-16）：公共关系/业务复用、单次计费、JSON 协调、State/目录、模式及耗时信号分别回查完整基线、选型权威和固定工件验证；Round 事实仍由独立边界票提供，完整功能及共同新路径的效率/复杂度验收由完整迁移票当前 Question 承接。上游事实不是新实现通过证明；本权威的旧政策已按用户后续确认修订。未发现需要另立或转交的无主 gap、未决冲突或新的越层要求，未改动其他决策票的状态、认领或 Handoff。

## Question

选定第三方提供方后，依赖其能力的 adapter 如何集中组织，并与 pi 原生机制共同实现 framework 公共契约？明确代码职责、依赖方向、公开/私有接口、装配、订阅清理和缺失/不兼容依赖的可见行为。

遵循 Extension 开发地图：不复制 shared-logic，不在 adapter 重建 framework 公共语义，不向业务泄漏第三方 context/registry，不无依据新增通用插件系统。扩展专属绘制与接线仍留在 extension harnesses。目录与接口方案必须经用户确认。
