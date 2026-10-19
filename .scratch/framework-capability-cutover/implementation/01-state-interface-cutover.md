# 01: 切换 State 唯一契约并保持 Owner 语义

**What to build:** 扩展从唯一 State interface 取得声明及受管理操作，在原有可写 Owner 场景完整操作自身 boolean 值；全部 State 消费者完成迁移，读取、效果、恢复继承及 retained 生命周期不变。

**Delivers:** P07–P13、P15、P16；P01、P05、P49、P51、P52 的本票分区

**Test owner for:** P01、P05、P49、P51（State 分区）；P52（01 交接）

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 验收条件

- [ ] 在首次相关改动前留存 P48 可比基线：隔离真实入口的 Marker、三级通知及 model-cost 展示，记录源码、配置、终端宽度、harness 版本/patch 与复现方式；材料交给 14 使用，不预判人工可读性。
- [ ] StateDeclaration、StatePersistence、StateInheritance、OwnerReference、DeclaredValueSeam、OwnerCapabilityHandle 由获准 interface canonical 拥有；内部和全部消费者引用同一来源，不公开 store、cell、Map、Owner life 或任意 Owner writer。
- [ ] 经过实际 framework 交付读写：区分两个扩展与不同 Owner，写后读和旧 retained handle 后续读取均为当前值；不新增逐字段权限或普通 delivery writer 撤销规则。
- [ ] 同值重复写入每次仍产生适用持久化和 Marker 效果；先更新当前值，再尝试 session-entry 持久化，最后发布 Marker；memory 不持久化。
- [ ] 分别注入持久化失败和 Marker 发布失败：前者不回滚且仍发布，后者传播错误且不回滚当前值或已完成持久化；独立观察顺序和结果。
- [ ] Owner 结束后旧 retained 写入/反馈无效，不重建 cell，同 key 新生命周期不复活；结束后取得的 handle 从一开始无效，旧 read 不冻结。
- [ ] follow 读取 Owner 当前值，none/unresolved 读取默认值；子代理不获 writer 或 Owner Feedback 权限，观察 scope 不增权；跨进程只验证既有适用路径。
- [ ] session-entry 检查最后 payload 的合法 boolean，否则回退默认；memory 不恢复，同 Owner 导航保持；恢复值不自动恢复定时器或注册。
- [ ] 复用 State、owner-capability、inheritance、declared-value-write 与相关 Session 覆盖，并运行适用消费者及真实恢复/继承场景；旧 State 导出在消费者迁完后退出。

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
