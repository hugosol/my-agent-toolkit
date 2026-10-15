# pi 子代理扩展的接口证据与覆盖对照：修订研究

Source: [pi 子代理扩展的接口证据与覆盖对照](../decision/02-pi-subagent-candidates.md)。研究日期：2026-10-16。

## 权威与取证范围

本报告及其两份逐候选复核附件取代原报告的覆盖分类、候选排序措辞与接口补充建议；原报告仅保留为发现范围、元数据与原始证据快照，不再作为当前覆盖结论。

- [原始市场发现及元数据报告](E:/Developer/myhub/wt/pi-subagent-candidates/.scratch/model-cost-pi-migration/research/02-pi-subagent-candidates-report.md)：2026-10-15 快照，pi.dev 的 `name` 查询 subagent/delegate/orchestrat/worker/fleet/swarm/agent，929 个去重包、521 个焦点包；agent 查询只抓前 450/3137 条，非穷尽市场。计数沿用原研究，并非本次重新抓取。
- [完整能力基线的发布口径](../lighthouse/01-capability-baseline.md)及其链接的 F-/O-/N-/P-/G- 行是比较依据；model-cost 消费子集不得缩小基线。
- 主候选逐项证据：[公开服务、RPC 与工作流候选复核](02-primary-candidates-correction.md)。
- 其他候选逐项证据：[后台任务、舰队与进程候选复核](02-other-candidates-correction.md)。
- 宿主固定修订：pi `4a5d37291531ad48b8e536c892557877d219463c`，`@earendil-works/pi-coding-agent@1.2.0`；本次 `git rev-parse HEAD` 输出与原研究一致。
- 本次不安装、不构建、不调用模型，不验证 Windows 运行兼容性；固定源码存在与字段流可读不代表消费端实际收到，也不构成最终依赖批准。
- 主会话运行只读源码断言，五项均为 `true`：InputEvent 含 source、AfterProviderResponse 含 status/headers、公开 response 订阅存在、AgentSettledEvent 存在、EventBus 可注入。它复核宿主勘误，不是运行时接口或行为测试。

## 分类规则

按一个具体事实或具体通道分类，不把候选整包标为完整 covered：

1. **已证实覆盖（静态）**：公开通道的源码及字段流证明该具体原生事实存在；不是端到端完整契约通过。
2. **可经适配覆盖**：公开事实足够，仍需本项目归一身份、状态或接入现有公共语义；不批准具体适配组织。
3. **需修改提供方**：所需事实只在内部存在或公开通道明确过滤/丢失；要通过当前路线取得该事实，需要新增/公开接口。可向候选或宿主贡献，但路线尚未选择；不等于必须长期 fork。
4. **未覆盖**：当前候选路线明确不产出该项事实或不支持相应操作。
5. **证据不足**：缺少可复查公开契约或字段流；不可用推断补成 covered，也不升级成全市场不可能。

模块 `exports`、文档化 EventBus RPC/事件、文档化 CLI/文件协议都可能是公开契约。缺少 `exports` 不能推导无公开 API；工具结果可作宿主工具事件观察的数据源，但模型文本、私有 registry 或任意文件不是自动获承诺的跨扩展契约。

## 宿主分层修正与直接证据

本节源码均相对于 `E:/Developer/myhub/pi`，固定修订如上；以下类型与事件总线构造已由本次主会话直接复读。

| 稳定基线 | 已确认的 pi 原生事实 | 当前判定与候选比较边界 |
| --- | --- | --- |
| P-INPUT / F-INPUT / G-INPUT | `packages/coding-agent/src/core/extensions/types.ts:1170-1187` 定义 `InputEvent`，含 `source: interactive/rpc/extension` | 撤销“pi 无用户输入事件”。是否被子会话消费者观察及怎样过滤 extension 来源，要按候选桥接路径核验。 |
| P-TURN-FACTS / F-TURN / G-TURN | 同文件 `:900-921,1625-1637` 有 `before_provider_request` 和 `after_provider_response{status,headers}` 及公开订阅 | 撤销“pi 所有公开接口无 HTTP status”。JSON 导出流没字段不代表进程内 extension API 没字段；每 provider/transport 是否触发仍需验证。 |
| F-TURN / G-CATALOG | 框架生成 Turn 身份并锚定请求时刻的目录价；pi `ctx.modelRegistry` 与当前 `ctx.model` 已存在（`types.ts:335-346`；基线 P-MODEL） | 不是要求第三方输出 Turn id 或最终锚价。须核对真实请求开始时刻、actual session、provider/model、可靠 usage、响应及失败/取消事实是否可达。provider `usage.cost` 不能代替请求锚价。 |
| F-ROUND-EDGE / P-SETTLED / G-ROUND | `types.ts:1027-1037` 有 `agent_before_settle` 与 `agent_settled`；`:347-356` 有 `isIdle/hasPendingMessages` | 撤销“候选没有 Round 就必需上游新增 Round”。Round 身份及开闭由 framework 拥有；候选需提供 run-cycle 与自动继续/排队/后台工作的可信事实。`agent_settled` 不能单独证明所有第三方后台工作静默。 |
| F-SCOPE / G-SCOPE-SESSION | `packages/coding-agent/src/core/resource-loader.ts:375-379`：`this.eventBus = options.eventBus ?? createEventBus()` | 默认实例隔离、不自动共享；允许注入 bus。撤销“进程内路线结构上无法观察子会话”。须另证桥接、注册表、父链、过滤边界及释放；不批准任意全局总线或跨 main 支持。 |
| F-SESSION-FACTS / F-OWNER / G-SUBAGENT-IDENTITY | `types.ts:325-360` 的 context 没有 OMP `agent`/registry | pi 的普通 session 身份不等于第三方子代理身份。actual session、直接父会话、Owner、agent id 与任务 handle 分开检查；私有 record 或 root id 不足以自动补全直接父链。 |
| F-RUNTIME / F-RUNTIME-SCOPE | framework 要求提供方测得的一次 execution 耗时，而不是 session span 或工具总时长 | 重命名 execution id、归一状态可以适配；只有启动/结束时间戳、lastActivity 或会话跨度时，不得擅自合成为已测得 runtime。续跑还要证明每次 execution 分界和归属。 |
| F-VIEWED / P-NO-VIEWED / G-VIEWED | 已发布基线未找到 pi 等价的公开当前查看席位出口 | 撤销“有 viewer/可读 transcript 即覆盖 Viewed session”。当前显示目标的只读读取、变更/marker 订阅及 Owner 解析需独立证据；已有 UI 仅证明人可查看。 |
| N-KEEPALIVE / O-RUNTIME-IDENTITY | 基线明确 OMP 在既有会话中由 peer/IRC 触发后续执行并重新发 started | resume、follow-up、重新派发或生成新 generation 都只是候选机制。逐项检查实际会话身份延续、触发方式及重复 execution，不认定某一种命名机制天然等价。 |

## 原报告不再有效的判断

- “只有 nicobailon 与 gotgenes 有可导入或版本化公开契约”：撤销。公开契约不以可导入模块为唯一条件；tintinweb RPC、background 服务、herdsman 邮箱及 durable CLI 必须按各自协议审查。
- “所有候选都需上游新增 turnId、Round、请求锚价”：撤销。公共语义继续由 framework/shared-logic 拥有；真正待补的是所选路线缺少的原生事实或公开出口。
- “同进程多个 ResourceLoader 事先堵死 session scope”：撤销。默认 bus 不共享只是接线前提，不是不可实现证明。
- “有 conversation viewer 或 transcript 就 covered Viewed session”：撤销。查看能力与可消费的席位事实不同。
- “有 startedAt/endedAt 或 active 字段就 covered 每 execution runtime”：撤销。必须确认测量口径、重复执行边界和实际会话归因。
- “durable follow-up generation 与 OMP keep-alive 同构且其他续跑不等价”：撤销。未做真实身份延续与重复执行验证，只能逐路线列事实。
- “pi 不公开 responseId”：撤销。公开 `AssistantMessage.responseId?` 及 `message_end` 传输路径存在，值取决于 provider 是否提供；候选是否保留并公开仍是另一问题（其他候选复核 §3.2，pi `packages/ai/src/types.ts:576-577`、`modes/json-event.ts:48-51`）。
- “`--no-session` 不可能有 session id”：撤销。它关闭持久化而非取消内存会话身份；JSON 首帧仍含 session header id，RPC 可以查询 state。候选是否读取/公开要单独判断，不把宿主可取误写成候选已暴露（其他候选复核 §3.4，pi `session-manager.ts:1061-1071,1804-1806`、`modes/print-mode.ts:122-127`）。
- pi header `parentSession` 本身是 fork/clone/显式创建来源，不是宿主保证的子代理直接父链。候选有意用它记账时仍须核对写入语义；没有该字段也不排除等价的可靠 sidecar 父链。

## 候选比较摘要

以下均是部分原生事实的静态结论，不是完整基线通过；版本与完整 pin、安装/许可细节见逐候选附件。没有依据把某个候选宣布为现成完整覆盖者，也不作优先级或提供方批准。

| 候选/版本 | 已证实的可消费面与适配输入 | 明确缺口或证据边界 |
| --- | --- | --- |
| nicobailon `pi-subagents@0.78.0` | 版本化 RPC（含 resume/cost）、导出子路径、文档化 artifact；后台 step 的实际测量 duration 与身份标签 | 前台完成事件不带 duration；聚合 usage 不等于逐请求；完整嵌套/实际 session 父链仍需逐路径核验。git TS 与 npm JS 入口不同，不能混称相同工件。 |
| tintinweb `@tintinweb/pi-subagents@0.22.0` | 文档化协议 v2 的 ping/spawn/stop/consume；顶层 started/终态事件含累计 Usage 与本次 duration；registry 有 waitForAll/hasRunning/spawn/getRecord | 无公开枚举/resume RPC；事件无 actual session/直接 parent，嵌套/workflow 被过滤；spawn 覆写观察回调；缺公开逐请求和 Viewed 席位。内部 resume 重置 duration 起点而不清累计 usage。 |
| gotgenes `@gotgenes/pi-subagents@23.4.0` | 类型化服务含 list/getRecord/resume；子会话生命周期实现发布 sessionId/parentSessionId；可读 outputFile | 部分 child 通道非稳定导出类型；累计 usage 缺 cacheRead/cost，不是完整请求读数；服务槽覆盖风险仅静态推断，未运行证明。 |
| `@quintinshaw/pi-dynamic-workflows@3.14.0` | run 生命周期、持久记录与 agent session 路径；用量区分 metered/estimated | run 区间非单个子代理 execution；逐请求与查看席位未覆盖；npm tarball 有 LICENSE，但旧研究仓库 404 本次未重新联网确认，dist/source 对应未验证。 |
| `pi-background-tasks@2.6.10` / `pi-better-subagents@0.18.0` | 前者版本化任务服务；后者元数据/日志工具面；均有部分身份、状态及结果用量 | 前者明确不重跑 agent 任务；后者 steer 只限存活期。时间戳不自动满足测量 runtime。background 的 peer 范围不包含当前 pi 1.2.0，需明确兼容证据。 |
| `pi-durable-subagents@1.0.40` | 文档化 CLI/公开事件日志、持久身份与 follow-up/resume | 私有 journal 的 time/usage 不等于公开日志保证；实际会话延续、排除 idle 的 execution 读数出口须分开核验。已知测试平台不是 Windows。 |
| `pi-herdsman@0.27.0` / `pi-agents@0.32.2` / `@arhen/pi-core-subagent@1.3.68` | 版本化 mailbox/bootstrap、版本化 state 频道、或 sidecar/具名事件分别提供部分身份与持久化输入 | herdr 平台前提；state 频道刻意不带 usage；arhen 无版本事件不是稳定类型 API。活性/时间戳/转录不等于 execution 测量或 Viewed 席位。 |
| 其余进程候选及分叉 | ptc、henryqw、bacnh85、d3ara1n、zhushanwen 与 esso/rhinos 的具体接口证据见附件；保留工具结果和私有字段的边界 | 临时会话有 id 不代表候选已公开；d3ara1n 旧 pin 与现有检出不一致，当前包工件对应证据不足；部分 LICENSE/仓库缺失、旧 peer 区间或 herdr 依赖必须在选型前呈现。 |

安装命令在附件或原始快照中仅是说明，不是本票已执行。最终实际安装必须固定版本并核对宿主隔离方式；manifest 的宽泛 peer 范围不能替代 Windows 真实运行证据。

## 完整基线的逐轴比较入口

下列索引与逐候选附件共同使用；旧报告的 S-/R-/T- 临时分类名不替代正式稳定行标识。

| 正式基线轴 | 每个候选必须回答的事实问题 | 不允许的替代 |
| --- | --- | --- |
| F-SESSION-FACTS / F-OWNER / O-SESSION-FACTS | 实际 sessionId、直接 parent sessionId、agent id/name、task handle、最新名字分别从哪个公开通道获得；Owner 链断怎么办 | 用 owner/root id 当直接 parent；用 UI 名字或深度当身份 |
| F-STARTUP / O-BEGINS-HERE / O-STARTUP | 创建、恢复、fork 是否可区分；开始时的 branch、实际 provider/model、有效 thinking level 是否可读 | 用当前设置回填首次开始；拿启动参数的 auto 当有效 effort |
| F-SCOPE / F-SESSION-DELIVERY / F-SESSION-REASON | 全部实际子会话含嵌套的观察、变更、关闭如何桥接；导航与 owner 转移/销毁怎样区分 | 用能看到部分顶层事件证明全部 session scope |
| F-TURN / O-TURN-MAP / O-TURN-ZERO | 请求起始、响应边界、实际会话、可靠 usage、失败/取消及 provider reference 可达程度 | 用累计 tokens/provider cost 证明请求级完整；无读数记零 |
| F-ROUND-EDGE / O-ROUND-MAP | 活动开始、settle、排队、自动继续及后台任务存活事实是否足够供 framework 重检 | 见 agent_end/工具结束就关轮；另造公共 Round 状态机 |
| F-RUNTIME / F-RUNTIME-SCOPE / O-RUNTIME-IDENTITY | 宿主测量口径、running/ended、同一会话后续 execution 分界与归因 | 用 session span、工具总耗时、lastActivity 或自己累加猜测 runtime |
| N-KEEPALIVE / F-INPUT | 同一会话可否后续执行；来源、实际接收与用户归因是否可观察 | 把扩展自动 prompt 当用户输入；把新 generation 当身份延续证明 |
| F-VIEWED / O-VIEWED-MAP | 当前查看席位的公开只读读取、变化与 marker 订阅、Owner 解析 | 只有 viewer、日志或 transcript 即宣称完整覆盖 |
| F-STATE-INHERIT / F-CAPABILITY / F-LIFECYCLE-IMPL | 可归因的实际会话/Owner、branch 持久化、生命周期/清理事实能否接入已有 framework | 要第三方另实现 State 或把观察扩宽当效果权限；子代理流量触发 main cleanup |
| F-ONE-MAIN / G-MULTI-MAIN | 保持现有单 main 支持形状；实例/会话标签的边界有无证据 | 将 globalThis、机器全局列表或跨 owner 可读自动解释成多 main 已支持 |

提供方执行器拥有真实子代理 execution 时，由它在开始/结束或运行中测得并发布的 `durationMs` 可以是原生测量事实，不要求必须由 pi core 生成；实现使用 `Date.now()` 也不自动失格。仍须核对是否覆盖正确执行区间、排除执行间 idle、是否有公开读数及实际会话归因。反之，adapter 只见时间戳后自行猜出一个值、工具总耗时或会话跨度不构成已证实的 execution 测量。

State 继承、公共 State cell、效果 capability、框架初始化和清理本身不是第三方必须提供的新 API；第三方须提供正确归因和生命周期的原生输入。各候选未证实这些输入完整时，保留“证据不足”，不因公共实现已存在而认定集成完成。

## 后续决策归属

- [tintinweb 子代理扩展的本机隔离验证](../decision/06-tintinweb-runtime-validation.md)：Windows、固定工件/宿主、公开消费者实际收到的事实、最小真实执行及清理。静态结果不替代它；付费调用仍受模型、次数、数值预算约束。
- [选择 pi 子代理扩展及缺口处理路线](../decision/03-subagent-provider-choice.md)：由用户选择提供方、公开接口补充/上游协作及版本策略；没有候选在本票被批准，也不接受暗中降级。
- [第三方能力适配的集中组织与公共语义复用](../decision/04-third-party-adapter-organization.md)：决定集中位置、桥接/注册表/身份归一、权限隔离与退订寿命，不由本研究提前决定。
- [model-cost 完整迁移的职责落点与验收路线](../decision/05-complete-migration-plan.md)：以完整基线决定关轮静默、Viewed session、目录价/provider access、输入、绘制及入口的验收，不仅是累计 token 能否显示。

本研究未发现需要重新选择完整能力范围的理由。保留所有未知项；不得把 `unavailable` 当作满足完整覆盖的自动豁免。
