# 02: 收窄 Prompt 与 Marker 并保持请求和区域显示

**What to build:** 扩展只声明 Prompt 策略和自身 Marker 文本，通过获准 State 影响显示，不能管理区域；模型请求、历史和多扩展区域显示保持既有行为。

**Delivers:** P17–P21；P01、P05、P49、P51、P52 的本票分区

**Test owner for:** P01、P05、P49、P51（Prompt/Marker 分区）；P52（02 交接）

**Blocked by:** [01: 切换 State 唯一契约并保持 Owner 语义](01-state-interface-cutover.md)（获批串行前置；须先完成该票迁移、验证与交接）

**Status:** ready-for-agent

## 验收条件

- [ ] Prompt 仅公开 PromptDeclaration、PromptStrategy，Marker 仅公开 MarkerDeclaration；默认值、选择工具、RunDelivery、PromptContribution 和 MarkerTransport 保持内部。
- [ ] 通过真实 framework 构造调用 initialize、directed run、unrecognized、actions，观察实际对象均无 markers 或区域 transport 旁路；内部发布继续有效。这里只完成 Marker 相关收口，不冒称已完成 06 的 persist 与完整 Command 收口。
- [ ] first-enabled-run/every-enabled-run、slot identity、branch progress、频率、优先、位置、可见性和保留语义保持；使用独立预期贡献次数及内容。
- [ ] 检查真实请求和会话记录：framework 贡献不删除、替换或重排既有历史派生内容，不额外保证缓存命中或跨 harness 相同角色。
- [ ] 两个有 Marker 的扩展与无 Marker 消费者共存，每步核对完整预期行集合；停用一个只移除自身，全部不显示时清空。
- [ ] 全进程唯一区域、既有排序、Viewed session 投影以及初始化/写入/运行/视图变化的发布时机保持；适用重复模块加载仍共用区域，查看位置不授予 Owner 或写权。
- [ ] 迁移全部本批消费者并退出旧声明/导出；复用 injection、marker、viewed-marker、module-duplication 覆盖及相应真实宿主 dock，比较 01 基线的字段内容，人工可读性留给 14。

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
