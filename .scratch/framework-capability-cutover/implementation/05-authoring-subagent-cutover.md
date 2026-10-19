# 05: 切换 authoring 与 Subagent 初始化契约

**What to build:** 扩展沿用 defineExtension、factory、ImplementationContext 编写形式，通过最小实际初始化对象取得稳定 Subagent 接入结果，并保持构造、初始化、转移与清理时序。

**Delivers:** P04、P06、P33–P35；P01、P05、P49、P51、P52 的本票分区

**Test owner for:** P01、P05、P49、P51（authoring/Subagent 分区）；P52（05 交接）

**Blocked by:** [04: 归并 Host facts 查询并保持取值时点](04-host-facts-cutover.md)（获批串行前置；须先完成该票迁移、验证与交接）

**Status:** ready-for-agent

## 验收条件

- [ ] 根 authoring 选择性提供 defineExtension 和整体 definition/implementation 契约，不汇总全部 capability；落实 ExtensionDefinition、配置声明、assembly/factory/context/implementation/initialize 和 DeclarableRequiredSemantic 的获准归属。
- [ ] ImplementationContext 保留 config、可选 modelPrices/providerAccess 和 session，不新增 context.hostFacts 或 builder；既有扩展编译并实际构造。
- [ ] 实际 initialize 只提供 owner、hasUI、feedback、subagents，经过 framework 构造观察无 markers、内部引擎或 transport 旁路；获准操作可用。
- [ ] Subagent 仅公开 SubagentIntegration、SubagentIntegrationFailure、SubagentCapability；分别驱动 subagents、正常 none 和 failed，初始化后改变子代理数量不改变接入结果，不公开执行模式。
- [ ] 配置校验成功后才调用 factory，校验拒绝不构造；factory 无远程请求和定时器，一次 initialize 完成先于首模型请求，不按 Session 重复初始化。
- [ ] 验证绑定失败后的 cleanup、普通转移不 disposal、实际 disposal 清理后不再交付、后续绑定使用新实例而非复用 disposed 实例。
- [ ] 仅保留原两项可声明生命周期要求，完整 RequiredSemantic 与 framework 自身要求留内部，History preservation 不成为作者可选项或启动 gate。
- [ ] 迁移 framework、adapter、三个扩展、脚本和测试的本批消费者，退出对应旧导出与例外；复用 implementation-lifecycle、subagent、binding 覆盖和适用真实 binding-lifecycle/初始化 dock。

## 承诺与测试归属

本票独立承诺的测试/观察由本票负责；共享承诺只认领列明的能力或运行分区。分区完成不表示整项 promise 完成。

- P01/P05/P49/P51 分区见 [11: 退役旧入口并完成全局封装验收](11-legacy-retirement-verification.md)；P46/P47 分区见 [12: 完成 OMP 三入口真实回归](12-omp-real-entry-regression.md)；P52 分区及最终人工交接见 [14: 完成最终整合与可读性验收交接](14-final-integration-handoff.md)。

## 执行与验证约束

- 依据获批 [Contract](../contract.md)、[Spec](../spec.md) 及 Spec 链接的七项 Lighthouse 实施；遇到必须改变既有领域语义或公开范围的冲突，先携具体证据重新取得决定，不能自行扩范围。
- 严格串行。Blocked by 包含获批排程和共享运行资源约束，不暗示前后两个通用模块存在业务调用依赖。前票要求的消费者迁移、对象收窄、相关验证与交接未完成，不能推进本票掩盖失败；P48 的人工确认仅在最后统一保留。
- 本票迁完 framework、adapter、extension、script、test 的全部相关消费者，收紧既有导入限制，确认无调用后移除本批旧声明/导出/相关例外；共享入口仅为尚未迁移的真实内容暂留，不保留兼容 alias、re-export 或转发壳。不新增生产 seam、通用 delivery 工厂、扫描工具或无依据 prefactor。
- 迭代使用受影响测试；TypeScript 改动运行 `bun run typecheck`。票完成运行所属分区及跨分区受影响消费者，harness-facing 改动运行对应真实宿主 dock/smoke；最终五入口回归不能替代本票运行。采用仓库现有脚本和测试分层约定，先核对覆盖缺口。
- 真实交付必须经实际 framework 构造；HTTP、文件竞争、宿主加载等必须使用相应真实机制。必要 internal seam 可保留；替身与类型检查不能替代实际机制证据。永久测试只补消费者可见行为、边界、错误或生命周期缺口，不为路径、目录、转发、接线或声明搬家新增永久测试。
- 更新受影响的现有说明，不提前声称目标已实现；最终导航/ADR 一致性由 11 复核。先故障注入并恢复，再回归；昂贵/full/dock/真实宿主运行协调 quiet window，保持被测源码和 fixtures 稳定。

## 本票交接证据（P52）

- [ ] 逐条记录本票验收案例、所对应 promise/coverage item、实际命令和退出状态，以及通过、失败、未验证和真实阻塞范围。
- [ ] 记录被测源码/fixtures、依赖与 lockfile、适用 harness 精确版本/patch、环境和实际运行产物；复用证据仅限相关输入未变化，说明原运行和适用范围。
- [ ] 不把局部绿色、静态声明完整、历史运行或计划完成冒称全仓行为通过或支持认证；必需验收缺证据即未完成，P48 人工判断不提前计为通过。
