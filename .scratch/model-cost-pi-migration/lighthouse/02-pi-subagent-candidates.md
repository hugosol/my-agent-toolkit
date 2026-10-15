# pi 子代理扩展的接口证据与覆盖对照：Lighthouse

> Question and discussion: [pi 子代理扩展的接口证据与覆盖对照](../decision/02-pi-subagent-candidates.md)

## Question

在完整 OMP 子代理能力基线下，哪些 pi 扩展提供可消费的原生事实，哪些仅有部分公开接口、需补提供方出口或证据不足？本题发布事实比较，不替用户选择提供方、组织方案或验收降级。

## Discussion

### 权威、授权与证据范围

- 用户本次指令“请开始ticket02”授权完成 AFK 研究。本发布是固定来源的事实结论，不把研究发现视为用户批准依赖、fork、私有接口或费用支出。
- 当前研究入口为 [修订研究与候选摘要](../research/02-candidate-comparison-corrected.md)，逐项证据在其链接的两份复核附件。它们覆盖既有主候选与三个分组，记录 pin、安装方式、许可、公开/私有边界、覆盖分类及限制。
- 原研究分支 `research/pi-subagent-candidates` / 交付提交 `b5c903f` 是历史证据快照；推送状态沿用旧记录，本次没有重新核对远端。旧报告覆盖表和绝对结论由本次修订取代，不能脱离勘误引用。元数据、市场发现数与查询范围沿用 2026-10-15 快照，不宣称重新抓取或穷尽市场。
- 宿主源码为 pi `4a5d37291531ad48b8e536c892557877d219463c` / `pi-coding-agent@1.2.0`。候选复核是源码/类型/文档/tarball 级；无安装、构建、RPC 实际往返、真实 provider 或 Windows 运行通过证据。旧 pin 无法与现有检出对应时，附件显式保留限制。

### 按原生事实比较，而非要求第三方重建公共语义

沿用 [已发布能力基线](01-capability-baseline.md) 的完整 F-/O-/N-/P-/G- 行，不缩成 model-cost 消费子集。

- Turn 身份、Round 开闭合成、请求锚价和 State/效果权限继续由已有 framework/shared-logic 拥有。候选不直接输出这些最终语义，不等于必须改上游。
- 真正需要核验的是 actual session、直接父链、Owner 所需记账、启动证明、有效 provider/model/effort、逐请求边界与可靠用量、活动/继续/排队/后台工作事实，以及每 execution 测量和查看席位出口。
- 累计 usage 或 provider 计价不是单请求可靠读数与请求锚价；私有字段存在不是公开消费保证。标签、深度或 root id 不能替代直接父链。
- 提供方执行器测得的单次 execution 区间可作为原生耗时，不要求 pi core 生成；时间戳、session span、lastActivity 或工具总时长则不能自动认定满足该轴。续跑的每次区间与 actual session 归因须分开验证。

### 撤销旧报告的过强结论

撤销理由与源码锚点统一存于修订研究，不把旧结论保留为另一份现行规则：

- pi 已有 `input` 和 `after_provider_response{status,headers}`；assistant message 也公开可选 `responseId`。JSON 事件表未列字段不证明全部公开面缺失；每 transport 和候选桥接是否可达仍待验证。
- 默认每 ResourceLoader 一份 EventBus 只说明不自动共享；构造参数可注入。既不能断言 session scope 被结构性堵死，也不能因此宣称所有子会话已能观察。
- `exports` 不是公开契约唯一形态：文档化 RPC、版本化事件/邮箱和 CLI/文件协议均须分别审查；模型工具文本与私有实现则另列。
- `--no-session` 关闭持久化而不是取消内存 session 身份；可取不等于候选已经读取/公开。pi header `parentSession` 的来源语义也不能自动等同委派直接父链。
- viewer/transcript 不等于 Viewed session 的只读席位与订阅；resume/follow-up/generation 不天然等于 OMP keep-alive；需逐路线观察事实。

### tintinweb 与主要候选的比较边界

tintinweb、nicobailon 的同名包是不同项目，gotgenes 是 tintinweb 的独立分叉，接口不可混用。

tintinweb 固定版本存在文档化 v2 ping/spawn/stop/consume RPC、顶层生命周期、累计 Usage 与单次 duration；不是“无公开 API”。但事件不带 actual session/parent，嵌套和 workflow 被顶层过滤，spawn 覆写观察回调，registry 无枚举，公开 RPC/registry 无 resume/steer，且没有可订阅 Viewed 席位。方法文档存在不代表返回 record/session 字段已获稳定类型承诺。现成公开面不足以证明完整基线覆盖。

nicobailon 的版本化 RPC/导出/artifact、gotgenes 的类型化服务与子会话生命周期实现、workflows 的 run/agent 记录，以及其他候选的服务、CLI、邮箱、日志均提供不同的部分事实；精确版本/字段/分类以研究附件为准。不公布“某候选现成完整覆盖”的结论，也不把接口宽度当选型批准。

### 未决问题和下游使用

- [tintinweb 子代理扩展的本机隔离验证](../decision/06-tintinweb-runtime-validation.md)提供固定工件、Windows、公开消费者与最小真实运行证据。既有静态证据可直接使用；其旧 Handoff 关于能力基线未发布的描述已落后，应以地图与当前发布为准，不需为此重写其恢复上下文。
- [选择 pi 子代理扩展及缺口处理路线](../decision/03-subagent-provider-choice.md)仍等待隔离验证，由用户选择提供方、版本及缺口处理路线；此研究不批准长期 fork、私有 API 依赖、能力降级或真实调用预算。
- [第三方能力适配的集中组织与公共语义复用](../decision/04-third-party-adapter-organization.md)决定桥接、事实归一、实例/订阅寿命、集中位置及失败可见行为。
- [model-cost 完整迁移的职责落点与验收路线](../decision/05-complete-migration-plan.md)决定全部功能的职责和验收；关轮静默、Viewed session、目录价/provider access、绘制及入口不能被累计 tokens 的部分覆盖替代。

## Decision

发布修订后的固定来源候选事实比较，替代旧报告中过强的覆盖判断，作为真实验证、用户选型和适配规划的输入。本发布完成研究范围，不批准任何提供方或生产迁移，也不证明完整基线已在 pi 上运行通过。

## User stories

1. 作为迁移决策者，我需要区分原生事实与公共语义的候选比较，以便基于完整能力范围选择依赖及缺口处理路线，而不被旧表的过强结论误导。
2. 作为适配方案设计者，我需要知道公开契约、私有字段和缺失事实的边界，以便复用既有 framework/shared-logic 并确定集中适配、权限及寿命接线。
3. 作为验证执行者，我需要固定版本、工件、许可、平台与证据限制，以便在隔离宿主中检验消费者真正收到的事实，而不把源码推断当作运行保证。

## Preconditions

- 完整能力基线及其支持形状有效；来源修订或工件变化时应重核受影响事实。
- 本研究及原始证据可取；元数据快照与未验证网络/运行事实不得升级为当前保证。
- 已有独立隔离验证、选型、组织和完整方案决策票继续承担各自范围；研究完成不满足尚未完成的依赖。

## Postconditions

- 下游有可复查的候选对照与逐轴索引；旧报告的绝对分类不再用作现行依据。
- 部分可适配、需补公开出口、明确不支持与证据不足保持分开，累计值不冒充请求/执行完整读数。
- 仅解除本研究所提供的事实前置；真实兼容性、选型批准和实现仍未完成。

## Invariants

- 对齐 `framework/docs/extension-development-map.md`：公共语义在 framework，业务复用同一份 extension definition/shared-logic，宿主机制在 adapter 或 extension harness，装配保持薄；本票不裁定具体模块接口。
- `framework/core/protocol.ts` 中 actual session、直接父、Owner、Turn、Round、runtime 和 Viewed session 保持各自含义；观察不是 State 写权或外部效果授权。
- Unknown、不适用、确认零与已知小计不可混同；`unavailable` 不是默许完整覆盖豁免。
- 不超出现有单 main 支持形状，不把可注入总线或进程级服务槽当作多 main 已获支持，也不将静态证据提升为运行证据。
