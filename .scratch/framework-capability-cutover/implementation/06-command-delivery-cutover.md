# 06: 收窄实际 Command 交付并保持三种 control

**What to build:** Directed 与 actions 从 framework 获得显式受限 delivery，保持 toggle、directed、actions 各自的调用范围和执行语义，不能绕过受管理 State 或获得额外权限。

**Delivers:** P02、P03、P22–P27；P01、P05、P49、P51、P52 的本票分区

**Test owner for:** P01、P05、P49、P51（Command 分区）；P52（06 交接）

**Blocked by:** [05: 切换 authoring 与 Subagent 初始化契约](05-authoring-subagent-cutover.md)（获批串行前置；须先完成该票迁移、验证与交接）

**Status:** ready-for-agent

## 验收条件

- [ ] Command 声明、实现、delivery、RecognizedDirective 与 CanAcceptInput 由获准 Command interface canonical 拥有；内部 invocation、绑定、解析、help 与 DirectedDirective 不公开。
- [ ] 实际 run/unrecognized 的 CommandDelivery 仅有 args、owner、hasUI、canAcceptInput、provider、feedback、state、capability；实际 ActionDelivery 仅有前六项，不提供 State writer、retained capability、persist、markers 或嵌套旁路。
- [ ] 显式构造交付，不 spread 完整 invocation 或直接传给 Action；获准 State/retained 操作继续有效，不新增通用 delivery 工厂、过滤框架、Proxy 或撤销体系。
- [ ] toggle 仅 Owner 自身会话反转当前值，连续两次得到独立指定值序列，经原 State 和反馈路径；用 codebase-tools 实际消费者回归。
- [ ] directed 仅 Owner 自身会话执行，空参数 activate、off deactivate，每次重复均执行；分别验证 handler 不写与自行写，framework 不推导或覆盖结果，不改变异步模型。
- [ ] 未知 directed 文本只交可选 unrecognized，保持解析后文本；有/无 handler 均不自动 run、写入、发布或反馈；connect-bot 实际消费者回归。
- [ ] actions 保持自身调用范围，不套用 Owner gate；trim、小写、全词匹配，空参数 info help、未知/缩写 error 同一 help，均不执行 action；model-cost 实际消费者回归。
- [ ] actions 等待受控异步完成，同步抛错和异步拒绝沿既有路径只报告一次错误，无新增重试、回滚或成功提示。
- [ ] 对应执行会话的 CanAcceptInput 每次实时返回 true/false/undefined，framework 不统一 gate，不将 undefined 当空闲；验证原业务分支。
- [ ] 迁移全部本批消费者并复核删除无用 CommandActions；退出旧 Command 声明/导出与相关例外，运行 control/actions 和受影响三扩展覆盖及对应真实宿主路径。

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
