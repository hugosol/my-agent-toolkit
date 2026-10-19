# 08: 切换文件更新入口并验证跨进程协调

**What to build:** 扩展经最小 updateFile interface 协调本机文档更新，多进程不丢已完成更新，读者只见完整旧/新文档，等待和业务错误保持原语义。

**Delivers:** P39–P42；P01、P49、P51、P52 的本票分区

**Test owner for:** P01、P49、P51（文件分区）；P52（08 交接）

**Blocked by:** [07: 切换 HTTP 最小入口并验证真实交换](07-http-interface-cutover.md)（获批串行前置；须先完成该票迁移、验证与交接）

**Status:** ready-for-agent

## 验收条件

- [ ] 仅公开 updateFile、SafeFileUpdateOptions、SafeFileUpdateError、SafeFileUpdateFailureKind，公开错误类为内部抛出的同一身份；锁、队列、恢复和临时发布机制内部化。
- [ ] 真实临时本机目录及独立子进程竞争，updater 在锁内看到最新业务值，独立计数/内容证明已完成更新不丢失，不用进程内模拟锁代替。
- [ ] 真实读写竞争及适用中断场景中，读者只见完整旧文档或完整新文档；updateFile 返回已发布 next，不能只看最终文件。
- [ ] 预算同时覆盖进程内排队和跨进程锁获取；分别验证等待超时、等待时 signal 取消、更新开始后取消仍按既有方式完成且不回滚。
- [ ] 分别触发 timeout/cancelled/io/corrupt 并核对 kind/detail/公开类身份；updater 同步或异步业务错误保留原身份，不包装为协调错误。
- [ ] 迁移全部本批消费者及 model-cost 存储，退出旧公开声明和文件实现 legacy 例外；复用文件覆盖与 storage-processes，按影响运行数据 smoke，保证真实跨进程机制证据。

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
