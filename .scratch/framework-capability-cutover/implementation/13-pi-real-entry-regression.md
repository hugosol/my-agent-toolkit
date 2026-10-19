# 13: 完成 pi 两入口真实回归

**What to build:** 在当前稳定组合中，pi 实际 loader 加载 codebase-tools 与 model-cost，适用请求、子代理继承、存储及 close-out 路径保持现有行为，不扩大入口或模式支持。

**Delivers:** P46 的 pi 分区；P47 的 pi 真实 Session 分区；P52 的本票分区

**Test owner for:** P46（pi 两入口）；P47（pi Session 场景）；P52（13 交接）

**Blocked by:** [12: 完成 OMP 三入口真实回归](12-omp-real-entry-regression.md)（获批串行前置；须先完成该票迁移、验证与交接）

**Status:** ready-for-agent

## 验收条件

- [ ] 隔离显式加载 pi/codebase-tools 与 pi/model-cost 的现有 discovery 入口，使用冻结安装和既有 patch；不添加 connect-bot/pi，不改正式加载配置或扩大版本/执行模式范围。
- [ ] codebase-tools 实际验证 toggle、恢复、Prompt/History preservation、Feedback/Marker 和既有适用子代理继承，真实请求和会话记录核对结果。
- [ ] model-cost 实际验证 actions、初始化、provider/catalog、Session/保存，以及适用子代理路径；无价格、凭据缺失等使用原业务含义。
- [ ] pi 适用 Session 保存、结束、子代理观察/提交及 close-out 场景观察实际文件/会话内容，保持只读观察、隔离、recordCommit、单 dispatch 与 scope；不以历史无子代理运行替代当前要求。
- [ ] 复用既有 pi-codebase-tools、pi-model-cost smoke，按影响覆盖 pi-subagent、background-round、terminal-round、close-out，逐项核对实际场景缺口。
- [ ] 保存实际终端及适用宽度的 Marker、通知、model-cost 输出供 14 比较；代理先核对内容与字段，不能以 RPC/headless 输出替代真实 TUI 可读性判断。
- [ ] 提供当前版本/patch、环境与每项运行证据；必需凭据、TUI 或模式条件缺失时明确未验证和阻塞，不宣称 loader/类型检查等同全部行为通过。

## 承诺与测试归属

本票独立承诺的测试/观察由本票负责；共享承诺只认领列明的能力或运行分区。分区完成不表示整项 promise 完成。

- P01/P05/P49/P51 分区见 [11: 退役旧入口并完成全局封装验收](11-legacy-retirement-verification.md)；P46/P47 分区见 [12: 完成 OMP 三入口真实回归](12-omp-real-entry-regression.md)；P52 分区及最终人工交接见 [14: 完成最终整合与可读性验收交接](14-final-integration-handoff.md)。
- 本票独占 pi 两入口及 pi 真实 Session 场景的测试编写/运行；不与 12 的 OMP 案例混算。

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
