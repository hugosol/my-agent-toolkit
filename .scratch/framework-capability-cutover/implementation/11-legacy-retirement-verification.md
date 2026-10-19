# 11: 退役旧入口并完成全局封装验收

**What to build:** 维护者能够确认全仓仅剩获准公开契约，旧入口和七类 legacy 例外全部退出，真实交付及读数无封装旁路，已完成 Session 的 framework 语义未回退。

**Delivers:** P01、P05、P51 的全局完成分区；P47 的 framework 分区；P52 的本票分区

**Test owner for:** P47（framework 只读/commit/dispatch/scope/close-out 分区）；P52（11 交接）

**Blocked by:** [10: 统一内部 port 并保持离线检查独立](10-internal-port-cutover.md)（获批串行前置；须先完成该票迁移、验证与交接）

**Status:** ready-for-agent

## 验收条件

- [ ] 全仓重核 framework、adapter、extension、script、test 消费者及公开声明实际依赖；P01 各能力归属已完成，整体 authoring 不重复拥有或汇总全部 capability；不是仅同名声明可编译。
- [ ] 独立复核实际 initialize、directed run/unrecognized、actions、State/retained、Host facts 及 Session 公开可达操作和返回读数，不可取得内部引擎或修改 framework 保留值；配置仅保留获准有限例外，不扩大为安全沙箱验收。
- [ ] 复用 Session capability/observation/lifecycle 覆盖，验证只读 reader、不获写权、返回读数隔离、recordCommit、单 dispatch、owner/session scope 与 close-out；真实宿主保存/结束/子代理分区分别由 12、13 承担。
- [ ] 删除旧混合公开入口和无用旧声明；七类例外（旧混合入口、整体 assembly、definition、配置实现、integration 清单、HTTP 实现、文件实现）全部清零，不留兼容 alias、re-export 或转发壳；内部仍有职责的实现不误删。
- [ ] 此前各批已经完成自身全部消费者、实际对象、导出及例外退出；本票只处理残余/全局验证，发现遗漏先修复对应范围，不能以本票为前批延期理由。
- [ ] 更新现有 README、能力索引、扩展开发导航、架构说明和 ADR 非兼容公开契约切换记录；修正未采用的 definition/assembly 层、context.hostFacts、General capability、公开 Marker transport 候选，保留历史语境，不新增无收益文档。
- [ ] 通过既有静态检查、typecheck、相关 framework 和消费者分区与实际路径观察；静态退役与行为保持分别提供证据，不新增源文本/布局永久测试。

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

## 跨票覆盖分区：P01、P05、P49、P51

下列每行是独立范围；票号同时是测试/检查 owner。各票仅写本范围的必要行为测试或执行既有静态检查，不共同认领同一案例；promise 必须全部分区通过才完成。

### P01

| Coverage item | Ticket | 测试／检查 owner |
|---|---|---|
| State 公开声明与消费者归属 | [01: 切换 State 唯一契约并保持 Owner 语义](01-state-interface-cutover.md) | 01 |
| Prompt/Marker 公开声明与消费者归属 | [02: 收窄 Prompt 与 Marker 并保持请求和区域显示](02-prompt-marker-cutover.md) | 02 |
| Feedback 公开声明与消费者归属 | [03: 统一实际 Feedback 输出并保持有效期](03-feedback-output-cutover.md) | 03 |
| Host facts 公开声明与消费者归属 | [04: 归并 Host facts 查询并保持取值时点](04-host-facts-cutover.md) | 04 |
| Subagent/整体 authoring/requirement 声明归属 | [05: 切换 authoring 与 Subagent 初始化契约](05-authoring-subagent-cutover.md) | 05 |
| Command 声明与消费者归属 | [06: 收窄实际 Command 交付并保持三种 control](06-command-delivery-cutover.md) | 06 |
| HTTP 函数/类型/错误身份归属 | [07: 切换 HTTP 最小入口并验证真实交换](07-http-interface-cutover.md) | 07 |
| 文件函数/类型/错误身份归属 | [08: 切换文件更新入口并验证跨进程协调](08-files-interface-cutover.md) | 08 |
| 配置入口/错误身份归属 | [09: 切换配置入口并退出内部诊断依赖](09-config-diagnostics-cutover.md) | 09 |
| 全仓唯一来源和依赖关系；根 authoring 不重复拥有或汇总所有 capability | [11: 退役旧入口并完成全局封装验收](11-legacy-retirement-verification.md) | 11 |

### P05

| Coverage item | Ticket | 测试／检查 owner |
|---|---|---|
| 实际 State writer/retained 操作及 boolean 读数无内部存储旁路 | [01: 切换 State 唯一契约并保持 Owner 语义](01-state-interface-cutover.md) | 01 |
| 实际四类交付移除 markers 与区域 transport | [02: 收窄 Prompt 与 Marker 并保持请求和区域显示](02-prompt-marker-cutover.md) | 02 |
| 实际公开 Feedback 操作无内部输出管理旁路 | [03: 统一实际 Feedback 输出并保持有效期](03-feedback-output-cutover.md) | 03 |
| 公开 Host facts 操作和事实读数不暴露引擎或可变保留引用 | [04: 归并 Host facts 查询并保持取值时点](04-host-facts-cutover.md) | 04 |
| 实际 initialize/context 除配置有限例外外无内部能力旁路 | [05: 切换 authoring 与 Subagent 初始化契约](05-authoring-subagent-cutover.md) | 05 |
| 实际 run/unrecognized/actions 的完整成员及嵌套操作收口 | [06: 收窄实际 Command 交付并保持三种 control](06-command-delivery-cutover.md) | 06 |
| Session 公开读数隔离和跨公开面可达性最终复核；配置有限例外明确排除 | [11: 退役旧入口并完成全局封装验收](11-legacy-retirement-verification.md) | 11 |

### P49

| Coverage item | Ticket | 测试／检查 owner |
|---|---|---|
| State canonical 引用与本批导入边界 | [01: 切换 State 唯一契约并保持 Owner 语义](01-state-interface-cutover.md) | 01 |
| Prompt/Marker canonical 引用与本批导入边界 | [02: 收窄 Prompt 与 Marker 并保持请求和区域显示](02-prompt-marker-cutover.md) | 02 |
| Feedback canonical 引用与本批导入边界 | [03: 统一实际 Feedback 输出并保持有效期](03-feedback-output-cutover.md) | 03 |
| Host facts canonical 引用与本批导入边界 | [04: 归并 Host facts 查询并保持取值时点](04-host-facts-cutover.md) | 04 |
| authoring/Subagent/requirement canonical 引用与 defineExtension 精确连接 | [05: 切换 authoring 与 Subagent 初始化契约](05-authoring-subagent-cutover.md) | 05 |
| Command canonical 引用及内部解析可见性边界 | [06: 收窄实际 Command 交付并保持三种 control](06-command-delivery-cutover.md) | 06 |
| HTTP canonical 引用与 request 精确连接 | [07: 切换 HTTP 最小入口并验证真实交换](07-http-interface-cutover.md) | 07 |
| 文件 canonical 引用与 updateFile 精确连接 | [08: 切换文件更新入口并验证跨进程协调](08-files-interface-cutover.md) | 08 |
| 配置 canonical 引用与 getConfig 精确连接 | [09: 切换配置入口并退出内部诊断依赖](09-config-diagnostics-cutover.md) | 09 |
| 单一 port、全局获准依赖、原生访问范围、无扩展业务反向依赖及静态告警限制 | [10: 统一内部 port 并保持离线检查独立](10-internal-port-cutover.md) | 10 |

### P51

| Coverage item | Ticket | 测试／检查 owner |
|---|---|---|
| 旧 State 声明和导出退出 | [01: 切换 State 唯一契约并保持 Owner 语义](01-state-interface-cutover.md) | 01 |
| 旧 Prompt/Marker 声明和导出退出 | [02: 收窄 Prompt 与 Marker 并保持请求和区域显示](02-prompt-marker-cutover.md) | 02 |
| 旧 Feedback 声明、导出和无用输出入口退出 | [03: 统一实际 Feedback 输出并保持有效期](03-feedback-output-cutover.md) | 03 |
| 旧 Host facts 声明和无用查询实现入口退出 | [04: 归并 Host facts 查询并保持取值时点](04-host-facts-cutover.md) | 04 |
| 旧 authoring/Subagent 声明及本批 assembly/definition/integration 等例外退出 | [05: 切换 authoring 与 Subagent 初始化契约](05-authoring-subagent-cutover.md) | 05 |
| 旧 Command 声明/导出及无用 CommandActions 退出 | [06: 收窄实际 Command 交付并保持三种 control](06-command-delivery-cutover.md) | 06 |
| 旧 HTTP 公开声明/导出及实现 legacy 例外退出 | [07: 切换 HTTP 最小入口并验证真实交换](07-http-interface-cutover.md) | 07 |
| 旧文件公开声明/导出及实现 legacy 例外退出 | [08: 切换文件更新入口并验证跨进程协调](08-files-interface-cutover.md) | 08 |
| 旧配置公开声明/导出、实现例外和消费者内部诊断依赖退出 | [09: 切换配置入口并退出内部诊断依赖](09-config-diagnostics-cutover.md) | 09 |
| 旧交互声明/调用路径退出，迁空内部文件删除 | [10: 统一内部 port 并保持离线检查独立](10-internal-port-cutover.md) | 10 |
| 覆盖所有消费者的最终零残余、旧混合入口删除、七类例外清零及无兼容壳 | [11: 退役旧入口并完成全局封装验收](11-legacy-retirement-verification.md) | 11 |

