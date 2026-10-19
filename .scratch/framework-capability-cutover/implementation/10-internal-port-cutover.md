# 10: 统一内部 port 并保持离线检查独立

**What to build:** framework 与 adapter 经单一内部 port 使用交互契约，公开声明引用 canonical 来源；离线接入检查独立比较声明，不影响正常加载或宣称行为认证。

**Delivers:** P50；P49 的内部 port 与最终依赖分区；P51、P52 的本票分区

**Test owner for:** P49（port 与最终依赖）；P51（交互旧声明退出）；P52（10 交接）

**Blocked by:** [09: 切换配置入口并退出内部诊断依赖](09-config-diagnostics-cutover.md)（获批串行前置；须先完成该票迁移、验证与交接）

**Status:** ready-for-agent

## 验收条件

- [ ] 单一 port 拥有获准 HarnessPort、BindingResult/Failure、StateValues、NoticeTransport、SessionDelivery/Disposal、RoundSignal/Observation、SessionContextObservation、ObservedSession/ObservationSource、SessionObservationSink/Access、MarkerTransport、ViewedSessionPort、RunDelivery、PromptContribution、CommandInvocation、BoundCommand、TurnSignal/Facts。
- [ ] port 引用公开 Session/State/Feedback/Host facts/Subagent/Command/authoring canonical 声明，不复制或兼容再导出；所有 framework、adapter、Local access、script、test 交互消费者迁移，迁空文件删除，有真实职责的内部 helper 保留。
- [ ] 复核扩展只访问获准 interface；harness assembly 保持选定 adapter 公开入口和既有 native escape hatch，不扩大到 domain/internal；framework 不依赖扩展业务或命名原生 harness 包。
- [ ] 仅精确放行 defineExtension/request/updateFile/getConfig 连接实际内部实现，不能 blanket re-export、宽放整个内部目录或制造循环；保留现有导入检查词法覆盖限制，不冒称完整证明。
- [ ] SubagentExecutionMode、HarnessIntegrationDeclaration、ExtensionHarnessEntry 与完整要求保留获准内部归属；离线 checker 分别验证完整与缺失声明的输出/退出结果，不增加工具 module、扫描器或诊断命令。
- [ ] 实际入口正常加载不依赖 checker、不新增启动 gate/降级；History preservation 不成为作者可选要求。
- [ ] 运行 typecheck、既有导入限制、独立接入检查及相关行为/真实宿主路径，完成实际依赖归属审查，不以声明检查代替行为。

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
