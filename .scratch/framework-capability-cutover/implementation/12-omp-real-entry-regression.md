# 12: 完成 OMP 三入口真实回归

**What to build:** 在当前稳定组合中，OMP 实际 loader 加载三个已有 discovery 入口，操作者的 control、请求、显示及保存/结束行为得到可归因的真实运行证明。

**Delivers:** P46 的 OMP 分区；P47 的 OMP 真实 Session 分区；P52 的本票分区

**Test owner for:** P46（OMP 三入口）；P47（OMP Session 场景）；P52（12 交接）

**Blocked by:** [11: 退役旧入口并完成全局封装验收](11-legacy-retirement-verification.md)（获批串行前置；须先完成该票迁移、验证与交接）

**Status:** ready-for-agent

## 验收条件

- [ ] 使用隔离、显式 entry 集、冻结安装和既有 patch 条件实际加载 codebase-tools、connect-bot、model-cost，不修改正式加载配置；记录精确 harness 版本和 patch，替身/历史记录不代替当前 loader。
- [ ] codebase-tools 验证 toggle、State 恢复/继承、Prompt、Feedback、Marker 共存及 Viewed session 投影，核对具体请求/历史及标记集合。
- [ ] connect-bot 验证 directed/unrecognized、初始化、State/retained Feedback、退出及原定时器/注册生命周期；现有 dock 若缺真实交付观察，用临时实际路径 smoke 补足，不增加业务功能。
- [ ] model-cost 验证 actions、初始化、provider/catalog、Session 保存/recordCommit、headless Feedback 与 presentation 内容；候选验证命令不单独代替全部扩展场景。
- [ ] OMP 适用 Session 保存、结束及子代理场景验证实际提交和内容，保持只读观察/读数隔离、单 dispatch、scope 与 close-out；和 11 的 framework 覆盖不互相替代。
- [ ] 复用适用 consumer-regression、session-recovery、viewed-marker、binding-lifecycle、model-cost dock；按需候选检查或 serial warm/资源诊断，核对实际覆盖而非仅列脚本名。
- [ ] 保存供 P48 判断的实际终端 Marker、通知及 model-cost 画面/录制，内容与布局字段先由代理核对，关联 01 基线和适用宽度；最终人工判断交给 14。
- [ ] 所有必需场景有当前运行证据；真实凭据/TUI/环境缺失明确为未验证和阻塞，不以测试绿色宣称支持认证或本票完成。

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

## 跨票覆盖分区：P46、P47

| Promise | Coverage item | Ticket | 测试 owner |
|---|---|---|---|
| P46 | OMP/codebase-tools：loader、toggle、恢复/继承、Prompt、Feedback、Marker 共存/投影 | [12: 完成 OMP 三入口真实回归](12-omp-real-entry-regression.md) | 12 |
| P46 | OMP/connect-bot：loader、directed/unrecognized、initialize、State/retained Feedback、退出及定时器/注册 | [12: 完成 OMP 三入口真实回归](12-omp-real-entry-regression.md) | 12 |
| P46 | OMP/model-cost：loader、actions、initialize、provider/catalog、Session/保存/commit、headless Feedback、presentation | [12: 完成 OMP 三入口真实回归](12-omp-real-entry-regression.md) | 12 |
| P46 | pi/codebase-tools：loader、toggle、恢复、Prompt/History、Feedback/Marker、适用子代理继承 | [13: 完成 pi 两入口真实回归](13-pi-real-entry-regression.md) | 13 |
| P46 | pi/model-cost：loader、actions、initialize、provider/catalog、Session/保存、适用子代理 | [13: 完成 pi 两入口真实回归](13-pi-real-entry-regression.md) | 13 |
| P47 | framework：只读观察、读数隔离、recordCommit、单 dispatch、scope、close-out | [11: 退役旧入口并完成全局封装验收](11-legacy-retirement-verification.md) | 11 |
| P47 | OMP 实际 Session 保存、结束及适用子代理：提交与内容、观察/隔离/dispatch/scope/close-out 保持 | [12: 完成 OMP 三入口真实回归](12-omp-real-entry-regression.md) | 12 |
| P47 | pi 实际 Session 保存、结束及适用子代理：提交与内容、观察/隔离/dispatch/scope/close-out 保持 | [13: 完成 pi 两入口真实回归](13-pi-real-entry-regression.md) | 13 |

同一票内各入口/场景按独立案例归属该票；11 的 framework 覆盖和 12/13 的真实宿主覆盖不互为替代。此前每批仍承担本批回归，不能把 harness-facing 验证拖到这里。
