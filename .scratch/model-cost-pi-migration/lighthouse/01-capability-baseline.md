# OMP 子代理能力基线与 model-cost 迁移差距：Lighthouse

> Question and discussion: [OMP 子代理能力基线与 model-cost 迁移差距](../decision/01-capability-baseline.md)

## Question

为全部当前 OMP 子代理相关语义建立可供 pi 候选逐项对照的事实基线，额外标注 model-cost 的消费子集及完整迁移缺口。不选择提供方、不批准适配设计、不交付生产迁移。

## Discussion

### 权威、确认来源与证据

- 用户在建图时确认“全部当前 OMP 子代理能力是验收基线，model-cost 子集只是额外标注”；来源为源票 Comments 及地图 Notes。用户本次指令“请开始ticket01”授权继续本票，不构成任何下游设计的批准。
- 本票发布的是 AFK 研究事实，不把研究结论冒充用户选择。逐项证据唯一存于 [事实基线报告](E:/Developer/myhub/wt/omp-capability-baseline/.scratch/model-cost-pi-migration/research/omp-subagent-capability-baseline.md)，研究分支 `research/omp-capability-baseline`，交付提交 `9ff584c`（分支推送状态为源票记录，本次未重新检查远端）。此 Lighthouse 规定如何使用该基线，不复制整张证据表。
- 报告的稳定行标识包括 F-* 框架语义 22 行、O-* adapter 映射 28 行、N-* OMP 原生事实 19 行、M-* model-cost 消费/直连/绘制装配 23 行、P-* pi 原生事实 17 行及 G-* 迁移缺口 17 行。本次程序核验行数一致，32 个报告引用的仓库路径均存在；另直接复读当前 pi adapter 及 pi 原生输入、响应、settlement 类型，确认相关“存在但未映射”分类仍适用。这不是全部行的运行复验。

### 比较基线与分层

比较对象同时包含会话身份、直接父链和 Owner、生命周期、session/owner 观察范围、Turn 请求及用量、Round、每次 execution 耗时、保活后的后续执行、State 继承与 Viewed session。精确语义以报告 A/B/C 段所引用的 framework 契约及源码为准。

- framework 的 Turn/Round 身份及开闭合成、观察范围分发、State 与生命周期机制继续由 framework 拥有；候选要提供这些机制所需的原生事实，不要求第三方重新实现相同的最终语义。
- Session 身份、直接父会话与 Owner 是不同事实；展示名、进程标签、嵌套深度不能代替身份或父链。每 execution 耗时不等于工具调用总耗时、会话跨度或进度读数之和。
- model-cost 的消费子集只是附加标注，不能据此删掉完整子代理基线；未知用量、已知零与 unavailable 不可混同。

### 缺口分类与复用边界

报告 E/F 段区分：原生事实不存在、存在但 adapter 尚未映射、以及扩展宿主实现需要处理的差异。

- 在报告固定的 pi 检出中，子代理身份/注册表、直接父链及每 execution 宿主测量耗时没有原生事实源；第三方候选是否补足，由后续对照与真实验证回答。
- pi 原生已有 `input`、`before_provider_request`、`after_provider_response`、assistant 消息及用量相关事件；现有 pi adapter 对 user-input/Turn/Round/runtime 尚拒绝支持。不得将“尚未映射”写成“所有 pi 公开接口都没有事实”。
- pi 有 `agent_settled`、`isIdle`、`hasPendingMessages`，但没有 OMP 的 `getAsyncJobSnapshot`；这不自动批准等价的关轮判据，也不能直接断言无法等价适配。
- 完整迁移还涉及目录价格、provider access、改名/startup 映射、Viewed session、context usage 形状、会话托管定时器、绘制模式差异、生命周期及 discoverable 入口。shared-logic 的会计、布局与其他公共语义应复用，不重建第二套业务。
- 报告 H 段的问题及 G-ASSEMBLY 中涉及具体落点的条件性描述只是设计输入，不是已批准的组织方案。是否提升公共能力、代码究竟落在公共 adapter 还是 extension harness、怎样接线，由后续决策票决定；不能由报告一句措辞越过地图约束。

### 版本、补丁与验证边界

- 框架/扩展来源修订为 `59f36fbf2ab6be22879f3bd5370dd09815352974`；pi 来源为 `4a5d37291531ad48b8e536c892557877d219463c` / `@earendil-works/pi-coding-agent@1.2.0`。
- OMP 原生主证据是冻结发布安装 `18.5.0` 与 `18.5.0-viewed-session-codex-response`；`18.10.4` / `611c189fa2f6b8c9b368559ea6b98062b9b54539` 检出只作交叉确认。不同修订的行号不可混引。
- Viewed session 出口属于补丁门控事实，不能说未打补丁的 OMP 18.5.0 原生提供。Codex response-boundary 的补丁覆盖与 model-cost 是否消费 HTTP 事实也须分别描述。
- 证据等级为源码、类型与已有文档阅读，不是实际会话、provider、TUI 或第三方兼容验证。单进程多 main 是记录在案的不支持形状，不因迁移研究而获得支持。报告没有证明任意未来版本或全部 provider 路径。

### 下游问题的归属

- [pi 子代理扩展的接口证据与覆盖对照](../decision/02-pi-subagent-candidates.md)：按原生事实与公共语义分层修订候选覆盖分类，消费稳定行标识；其现有勘误优先于旧报告概括。
- [tintinweb 子代理扩展的本机隔离验证](../decision/06-tintinweb-runtime-validation.md)：提供 Windows、固定版本、公开消费者的真实运行证据；本票的静态结果不能替代它。
- [选择 pi 子代理扩展及缺口处理路线](../decision/03-subagent-provider-choice.md)：用户决定提供方及缺口处理路线，不因基线发布而自动选用或接受降级。
- [第三方能力适配的集中组织与公共语义复用](../decision/04-third-party-adapter-organization.md)：决定接口边界、公共/宿主职责、集中组织及接线。
- [model-cost 完整迁移的职责落点与验收路线](../decision/05-complete-migration-plan.md)：覆盖完整功能、生命周期/关轮等必要输入的验收与交接，不只覆盖子代理或绘制。

报告 H 段对“是否必须保有全部子代理语义”的提问已由建图约束回答，不重新打开降级选择；对 model-cost 未消费的注入角色事实只保留边界，不新增未来功能承诺。

## Decision

发布固定修订、源码证据级别的完整 OMP 子代理能力基线，以及 model-cost 消费标注和 pi 迁移缺口，作为后续候选对照与规划输入。发布不批准提供方、具体适配组织或能力降级，也不证明迁移已可运行。

## User stories

1. 作为迁移决策者，我需要完整子代理基线及原生事实/公共语义的区分，以便逐项比较候选而不误判缺口或默默降低验收范围。
2. 作为迁移方案设计者，我需要 model-cost 的消费、宿主直连与绘制装配清单，以便复用现有 shared-logic/framework，并把完整功能的职责和验收问题交给对应决策票。
3. 作为验证执行者，我需要版本、补丁条件与证据等级，以便在真实宿主验证中知道哪些结论仍须观察，而不把静态阅读当作运行通过。

## Preconditions

- 报告及其固定来源可取，消费者按其版本和补丁条件解释行标识；不同修订或实现变化需要重新核对相关事实。
- 地图 Destination、Notes 与源票中确认的完整能力范围继续有效。
- 候选覆盖、真实验证、最终选型与组织问题仍由各自未完成的票提供；存在报告不等于这些依赖已经解决。

## Postconditions

- 下游可按稳定行标识引用证据，不需重新发现整套能力基线。
- 事实缺失、未映射、宿主差异及未知/零读数必须分别表达。
- 后续关键设计问题有已有票承接；本发布只完成基线研究范围，不产生生产能力保证。

## Invariants

- `framework/core/protocol.ts` 与 `framework/behaviors/` 拥有公共语义；`framework/adapters/` 提供宿主事实映射，extension shared-logic 不复制公共语义。
- Owner、直接父会话、Viewed session 与 execution 保持框架术语中的不同含义；model-cost 保持请求锚价、Session span 与 Subagent runtime 的区分。
- 遵循地图 Notes 引用的 Extension 开发地图：复用同一份 extension definition/shared-logic，宿主机制归 adapter 或 extension harness，装配保持薄；本票不裁定具体落点。
- 基线不超出已记录的支持形状，不把静态证据升级为运行证据，不把 model-cost 消费子集代替完整子代理基线。
