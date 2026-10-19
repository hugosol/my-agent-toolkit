# 07: 切换 HTTP 最小入口并验证真实交换

**What to build:** 扩展通过直接 HTTP interface 保持普通请求、标准 Response、命名代理和整次交换超时，不接触 transport 工厂或共享代理表。

**Delivers:** P36–P38；P01、P49、P51、P52 的本票分区

**Test owner for:** P01、P49、P51（HTTP 分区）；P52（07 交接）

**Blocked by:** [06: 收窄实际 Command 交付并保持三种 control](06-command-delivery-cutover.md)（获批串行前置；须先完成该票迁移、验证与交接）

**Status:** ready-for-agent

## 验收条件

- [ ] 仅公开 request、HttpRequestOptions、HttpConfigurationError；options 保持 method、headers、字符串 body、timeoutMs、proxy，错误保留 detail，内部抛出与公开识别为同一类身份。
- [ ] 公开 request 调用真实本机 HTTP，核对 method/headers/body、成功与非成功响应、标准 Response 及 body 读取，不新增响应包装、重试或缓存。
- [ ] 真实目标/代理核对 proxy false/省略直连、命名代理启用/禁用的原规则；命名代理缺失/无效配置在发送前拒绝，目标无意外直连请求，不只断言错误文本。
- [ ] 受控延迟响应头和 body，覆盖原预算选择及代理路径，观察整次交换实际超时/中止；原 transport 故障保持传播，不以传入 timeout 数字替代机制证据。
- [ ] 迁移 connect-bot、model-cost 及 framework/adapter/script/test 全部 HTTP 消费者；内部 transport 工厂与配置 reader 保留必要内部 seam，对应旧导出与例外退出，普通函数连接仅精确放行且无循环。
- [ ] 运行既有 HTTP smoke 并核对上述行为缺口，以本机真实交换补足；运行所属分区及受影响消费者。

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
