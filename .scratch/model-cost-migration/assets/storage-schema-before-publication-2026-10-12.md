# 存储 schema 修订前快照

本文件只保存本轮发布前原文，不是现行政策。原权威当前正文优先；代码和生产统计未修改。

## .scratch/model-cost-migration/map.md

```markdown
# model-cost 完整迁移：通用能力分层与 OMP 适配

Labels: wayfinder:map

## Destination

逐项确认 model-cost 的完整需求、extension／framework 通用能力／harness adapter 的归属、能力契约、源码组织及验收标准，形成可直接实施的完整迁移规格。地图清晰后进入单独跟踪的实施，最终完成 OMP 上的迁移与验收；地图本身不承载生产实施。

## Notes

- 2026-10-09 用户确认：先决策，再完整实施；OMP 落地，业务逻辑与通用契约保持 harness-independent，不在本次实现 pi adapter。
- 用户确认以现有功能全量保留为讨论基线；逐项讨论后才允许有意删改。以实际代码、业务 ADR 和 glossary 为证，不把 README 当完整清单。
- 用户允许全新统计：不要求导入旧统计文件、延续旧统计基线或新旧文档读写兼容。保留旧数据、不自动删除或改写；新存储根目录、账户隔离、归档格式和正式切换另行决策。
- 用户确认按三层开票：model-cost 拥有业务规则；HTTP／文件及并发协调纳入 framework 通用能力；宿主事实与语义映射由 framework adapter 提供。具体接口并未确认；widget、命令和认证／代理的 seam 单独讨论。
- 现有 ADR-0002 的责任测试与 native import 边界继续约束本次设计。backlog 对 HTTP 曾持扩展自有方向，本次明确讨论升级为 framework 能力；最终决策须同步其唯一权威文档，不能并存两套政策。
- 2026-10-09 用户选择以旧实现“聚合为主”为基础，先检验具体极端场景，只有发现不能满足的必要场景才取舍是否升级。/tree 优先保证 Session 累计正常，历史 Turn 累计可能不可取得可以接受；最小 framework 能力由选定实现需要倒推，而非先造完整账本／框架接口。该局部取舍不自动取消其他功能，正式修订范围由当前数据决策记录。
- 2026-10-09 用户要求重新评估“按 Turn 记录”的成本收益：逐响应计价／累加、运行期关联与长期明细留存不是同一要求，不把完整逐 Turn 账本或准确性最大化作为默认迁移目标。数据讨论先用旧代码和实际场景验证最小必要记录粒度；此前决定可据此提出修订，但未确认的修订不改变当前有效契约；已确认修订按用户要求同步旧 Lighthouse 与决策票正文，修订前版本保留历史快照，不自动缩减其他功能。
- 2026-10-09 用户要求纠正讨论顺序：先用旧源码、具体数据结构和一条端到端数据流建立实现心智模型，再讨论逻辑／接口取舍；未说明数据在哪里、谁读写、何时持久化前，不泛问同步／异步。当前先做数据归属／寿命／查询，再做存储与协调，随后收口观察处理约束和刷新调度。装配草图可以提前作为讨论材料，最终装配规格仍在契约明确后收口。保持地图规划模式，可用隔离探针支持决定，不做生产迁移。
- 后续设计讨论遵循[Happy flow 优先的设计推进原则](lighthouse/03-observation-contract.md#happy-flow-优先的设计推进原则)：先建立原则，再在原则内推进具体设计，避免用假想极端组合反复推翻主线；确认来源与重审条件在该权威主题。
- 每次咨询 grilling、domain-modeling；设计接口咨询 codebase-design；决策落地依次使用 lighthouse、backtracer。HITL 决策须由用户确认。每次工作只解决一个非 research 决策票，chart 会话不关闭票。
- [现状调查与功能证据](assets/current-state.md) 是事实资产，不是已批准的契约。它也记录调查 smoke 的实际输出；远端余额／额度、动态 TUI、完整 OMP 原生链路均未在本次调查运行。
- 框架当前仅实现 OMP adapter，支持基线为 18.5.0；本机安装版本不等于支持基线。迁移验收版本是否改变必须显式决定。
- 子票存放于 decision/；按编号扫描 open、无未满足依赖、未认领的票选 frontier。开始工作前先写 Status: claimed 和 Assignee。开放票不在地图正文重复列出。
- [数据归属与账户周期决议](lighthouse/12-state-data-contract.md)已正式结案；最终取舍与历次暂停溯源只在 Lighthouse。后续按已定数据流推进存储与协调，再返回观察处理约束；不重问聚合／明细账、不恢复观察票旧 Q10，不把本票结案视为存储或原生观测已实现。继续工作时按 tracker 查询 frontier，或使用用户明确指定的票。

- 本轮[命令决议](lighthouse/07-command-state.md)与其[确认来源](assets/command-confirmation-2026-10-12.md)已发布；账号／凭据身份隔离和定点 clear 在原权威修订。存储 Q25 的账号布局被取消，替代物理结构尚未批准；用户 Q21 已授权恢复存储原题，仅对 Q25 布局重审，现 open、未认领；其余存储原则不重开，装配不猜字段。

## Decisions so far

- [完整保留哪些业务行为，统计单位如何命名？](lighthouse/01-behavior-contract.md)： 保留请求锚价、公共 Turn／工具／Round 与 Codex 额度；当前基线消费 provider 单一统计范围、整文件 clear 与预算修改移除，不扩大所有 provider 展示。

- [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](lighthouse/02-accounting-ownership.md)： framework 每 provider 单账号；取消账号／凭据统计身份与自动替换隔离，按 provider 单一范围聚合；多 CLI 正常并发、去重与直接父 Session 汇总保留。

- [model-cost 的哪些数据进入 framework State，如何声明与读取？](lighthouse/12-state-data-contract.md)： 扩展自有逐响应聚合，实际会话 × provider × 模型；子代理仅 Session 汇总、Round 为本会话自身；整文件 clear，入口 detail 寿命保留，不存统计账号身份。

- [framework 如何提供独立存储、原子更新与跨进程协调？](lighthouse/06-local-storage.md)： 单活动 JSON／独立归档与 estimate，安全异步发布、FIFO／跨进程锁、周期／版本拒绝旧提交；clear 完整归档／重置且零消费同流程，取消账号键；Q25 替代物理布局已授权定点重审，源票 open，其余已定协调与失败政策保留。

- [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](lighthouse/03-observation-contract.md)：已按正常数据流、最小必要事实与异常基本原则收束；公共逻辑优先 framework、adapter 必要桥接，尽量统一 round_end；宿主可先 idle／接受新输入，公共 handler 等待自身异步保存，具体装配与生产验收仍未实施。

- [账户凭据、provider 地址和代理如何跨 seam 提供？](lighthouse/04-provider-access.md)： 按 framework 每 provider 单账号支持前提，adapter 提供当前认证确需资料／地址，不生成持久统计身份；业务查询留 shared logic，秘密不落盘。

- [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](lighthouse/05-http-capability.md)：已结案；直接导入单一 request、原生 response、共享代理配置与逐请求选择、业务优先的可配置有限超时；显式选代理缺配置失败，model-cost／connect-bot 统一传输，业务留 shared logic，不预建主动取消。

- [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](lighthouse/09-refresh-lifecycle.md)：部分确认初始化两源并行预取、首次模型请求前收口；其余调度未决。

- [/budget 的参数、操作与状态如何在新框架表达？](lighthouse/07-command-state.md)： 已发布一层 actions 路由、统一等待／异常报告与 warning；沿用 budget，detail 跟随旧入口偏好，holiday／clear 仅 DeepSeek 且当前入口 idle／保存收口；命令票已 resolved；存储物理布局跟进已交原题，不把命令结案当生产实施完成。

- [观察契约的 Handoff](decision/03-observation-contract.md#handoff)记录本轮收束、证据限度及下游职责；不恢复异常情景树或父 Round 分配，不把规划结案／临时探针当生产实现。

## Not yet specified

- 原生宿主缺失尚未具体暴露的观测能力时，其降级／拒绝与诊断如何衔接，遇到具体路径再展开；账户访问的局部查询失败原则已由账户访问权威持有，提示承载由现有展示票决定，不在此重复开雾。
- 非 HTTP 新增通用能力对 connect-bot 等既有消费者的复用或收口影响，待具体能力暴露后再判断，避免制造第二套机制或扩大业务范围。

## Out of scope

- framework 每 provider 多账号选择／轮换／管理、统计账号识别／持久化分区、账号替换自动隔离或重置、跨进程账号登记检测；支持范围与取舍见[消费归属的账户主题](lighthouse/02-accounting-ownership.md#账户隔离多会话与额度)；只有当前认证资料随宿主实际生效，不承诺替换统计隔离。

- 多台机器通过网络共享盘／云同步共同写入统计的正确性保证、分布式锁或同步冲突合并；[本地协调范围决议](lighthouse/06-local-storage.md)限定本机本地文件系统，不取消同机多进程安全共享。

- 实现或认证 pi adapter；只考虑契约是否把 OMP 原生细节泄漏给共享代码，不宣称 pi 能力对等。
- 导入旧统计、继续旧基线或要求新旧统计文档双向兼容；用户允许从空统计开始，旧数据保留。
- 图内执行生产迁移；决策规格完成后进入独立 implementation 工作流，整体迁移目标不取消。
- Codex 会话消耗与账户额度之间的转换或分摊；[消费归属决议](lighthouse/02-accounting-ownership.md)确认不做此换算，账户级双窗口／ratio／left 与参考费用继续保留。

```

## .scratch/model-cost-migration/lighthouse/01-behavior-contract.md

```markdown
# 完整保留哪些业务行为，统计单位如何命名？：Lighthouse

> Question and discussion: [完整保留哪些业务行为，统计单位如何命名？](../decision/01-behavior-contract.md)
>
> 当前有效版本：按用户要求，与[数据归属与账户周期决议](12-state-data-contract.md)及观察票已确认的公共术语同步。原题保留为提问历史；此前批准版本及评论完整保存在[同步前历史快照](../assets/contract-history-before-sync.md)。未决接口不因正文修正获批，生产迁移尚未实施。

## Question

基于[现状调查](../assets/current-state.md)，逐项确认 DeepSeek／Codex／token-only／hidden、预算与 Effort、峰谷和 holiday、请求计价、余额、累计与分段条、双窗口节奏、ratio/left、预算命令、刷新和故障显示哪些原有行为要原样保留，哪些有意改变？用户已确认全量保留基线，不得默删 README 未记载的额度估计。

明确 Request、Assistant response、Turn、Round、Agent activity state、Total、旧 UI 的 Turn 及 orchestration 的业务含义；旧 agent_end 结算不能仅因名称接近就映射 round_end。讨论两源预取 TTL 表述与实现不一致、render 更新业务态的耦合，以及 UI 标签是否改名。输出一份用户确认的行为契约和场景；本票不决定框架接口，也不迁移代码。

## Discussion

### 本轮批准修订与来源

功能保留基线消费新的 provider 单一统计范围与整文件 clear；详情命令沿用旧入口偏好，不隐式扩大所有 provider 的展示覆盖。 批准来源：[命令票本轮确认来源](../assets/command-confirmation-2026-10-12.md)（Q13–Q16、Q17–Q20）。此前账号键／身份分区和定点 clear 的政策仅为已被替代历史；不要求认证秘密落盘。非本轮替代范围继续有效，规划不等于实现。

### 公共术语与活动边界

Request／Turn 采用可观察模型调用周期；Turn 从请求开始，可以完成、失败或取消而没有完整响应，隐藏传输重试不拆成独立可观察 Turn。工具执行独立于 Turn、属于 Round；工具结果只有实际进入后续模型请求时，才由该请求 usage 计费。公共词义以[framework glossary](../../../framework/GLOSSARY.md)为准。

Round 是实际会话的连续活动周期，工具、已知自动续跑、排队输入消费、专门交互以及会驱动父继续的子代理等待不随意切轮。明确结束与漏信号／恢复截断不同；framework 活动轴 idle／working 与 connect-bot 面板协议分开。具体原生映射、候选复查及接口仍由[观察契约](../decision/03-observation-contract.md)收口，本票不替它结案。

### 请求锚价、聚合与展示口径

保留请求开始锚价、逐响应可靠 usage 计价，内存累计与 Round 生命周期分离。工具结果、Round 结束和父子汇总不产生第二笔消费。逐响应计算不等于逐响应落盘；本次以 round_end 发布聚合和最近 Round 快照，接受成功保存前的异常退出损失，不预建独立排空钩子或崩溃日志，详见[数据决议](12-state-data-contract.md)。

Session totals 是当前消费统计周期内该会话跨各 Round 的累计；Round totals 是其中某一轮，不是整个周期。自身／子代理／整体为 Session 视图，Round 仅本实际会话自身；子代理口径按[数据归属决议](12-state-data-contract.md)本次 Q27 修订，不再提供父 Round 含子汇总；只保留最近轮快照，tree 后该位置 Round 不可用、不显示成零，Session 本周期累计不随 tree 回滚。普通 resume 读取已保存活动聚合，不按宿主历史 token 用当前模型／费率重算，不自动合并旧归档。历史旧 UI Turn 指原生结算差分，不等于新 Turn 或完整 Round。

用户观察旧计价基本对应官网是保留算法的依据，不是独立账单认证。[旧聚合探针](../assets/old-accounting-granularity-smoke.md)的两次峰／谷请求累计为 13.5 元，按结束时谷价重算为 9 元；[旧 clear／resume 调查](../assets/old-clear-resume-smoke.md)区分 Total 显示重估与 Accrued 落盘，不宣称新生产能力已通过验收。

### 保留功能与已确认修剪

provider 的 Codex／官方 DeepSeek／token-only／hidden 分层保留，具体 model ID、名单和维护来源由[模型覆盖票](../decision/13-model-catalog-policy.md)决定。framework 单账号支持与不识别统计身份的修订按[消费归属当前修订](02-accounting-ownership.md#账户隔离多会话与额度)，访问职责按[账户访问决议](04-provider-access.md)；不由全量旧功能基线恢复多账号管理或 DeepSeek 平台账号识别。

固定 DeepSeek 450K、Codex 272K 上下文预算显示／告警保留，只显示不限制执行；数字／K／0 修改预算功能已取消，不再把旧最高 1000K 的可调预算入口作为迁移要求。Effort 取实际生效值、未知为 ?、只给值着色。

保留北京时间工作日 09:00–12:00、14:00–18:00 含端点峰价，其他时段／周末谷价；holiday 手动谷价、不追溯，持续到成功 clear。每请求锚价、DeepSeek 不另计 cacheWrite 继续生效。

Codex 双窗口、按报告时长识别、节奏／重置、ratio／left、同源成对测量及窗口变化规则保留；5h 增量至少 50pp、双窗口正增量且未饱和才采纳估计，无估计 estimating… 的既有业务基线不因此取消。

累计／session 分段条（≤20 元 fine、>20 元 coarse）、detail／holiday／整文件 clear、费用／余额告警及故障反馈保留。clear 归档锁内最新已保存完整消费 JSON 后重置活动统计并关闭 holiday；有效零消费也走相同流程。不清已有归档、独立 Codex estimate 或入口 detail，不收集进程未保存内存；具体操作与失败语义由[存储权威](06-local-storage.md)持有。clear 前旧周期未保存／在途消费允许丢弃，之后新请求正常统计，不取消执行；provider／入口活动限制由[命令权威](07-command-state.md)持有。

正常有 usage 则累计；失败／取消有可靠 usage 也累计，无 usage 跳过。缺 usage／适用价格只提示，不建立缺失计数、补账或补算状态；有 usage 缺价仍累计 token、只跳过费用。Codex 参考缺价不影响额度，token-only／hidden 无金额口径不因缺价报错。新策略不等于全部 provider 源事实已认证，不承诺官网费用完全一致。

### 数据寿命、业务归属与更新

model-cost shared logic 管理自身聚合、父子关系、当前／最近轮和provider 业务缓存；不升级通用业务 State，不把 boolean 激活 State 当业务容器。UI 只读同一视图。最新 DeepSeek 余额／Codex 窗口与获取时间、加载／错误仅 provider 级内存；累计／归档／holiday／quota estimate 持久化，具体物理组织由存储票决定。

detail 是入口级内存偏好：普通切会话／tree 保留，重载／重启回 brief，其他入口互不影响，不按账户共享、不按会话持久化或子代理继承。

更新由事件驱动，更新后按 UI 需要刷新；render 不请求远端、建 timer、落盘或改权威值。初始化预取已由[刷新原权威的部分结果](09-refresh-lifecycle.md)确认，不能恢复只按当前模型／首请求后预取；时间参数沿用既有 YAML，其他 TTL／防抖／single-flight、API／header 来源、无 UI 完整调度与提示承载仍未決，不推定任一候选方案已批准。

## Decision

保留请求锚价、逐响应计价、provider 分层与 Codex 额度功能，并采用最新已确认的扩展自有聚合、消费统计周期 Session／Round 和整文件归档重置。数字预算修改移除，子代理汇总仅 Session 口径、Round 为本会话自身，缺事实只提示／跳过，历史 Round 不查询；已批准修剪之外的功能不得由实施者自行删改。

## User stories

1. As a 用户, I want 保留逐请求锚价, so that 跨峰谷消费仍可按既定算法对照 provider 后台。
2. As a 用户, I want 区分本周期 Session 与单轮 Round, so that 理解消费所属范围而不把最近轮或旧归档当当前累计。
3. As a 用户, I want 累加已算请求费用而非当前价重估, so that 模型／时间切换不重解释历史。
4. As a 用户, I want 保留双窗口、ratio／left 与成对测量, so that 判断 Codex 节奏及剩余预算。
5. As a 用户, I want 保留 detail／holiday／整文件 clear／归档／分段条和反馈并移除预算修改, so that 明确的简化不默删其他操作能力。
6. As a 开发者, I want framework 统一 Turn／Round／活动词义, so that model-cost 与 connect-bot 不各自推断生命周期。
7. As a 开发者, I want 事件驱动更新与既有 YAML, so that 调度不由 render 次数驱动也不建立第二套配置。
8. As a 维护者, I want 修订有用户确认及历史来源, so that 最新契约不会与旧正文并列成矛盾要求。
9. As a 用户, I want 固定预算告警、真实 Effort 与 provider 分层, so that 切模型仍有明确上下文和计价提示。
10. As a 用户, I want 最新读数内存与必要业务持久化分开且旧文件不改, so that 从新统计起步并恢复已成功保存的本周期聚合。

## Preconditions

- [数据归属与账户周期决议](12-state-data-contract.md)已明确当前修订，优先于本票原功能基线；本票不重新决定其布局／寿命。
- [消费归属决议](02-accounting-ownership.md)承接实际会话／账户／父子消费原则；[观察契约](../decision/03-observation-contract.md)收口原生身份、usage 来源、结束／恢复与未决冲突处理。
- [账户访问](../decision/04-provider-access.md)、[HTTP](../decision/05-http-capability.md)、[存储协调](../decision/06-local-storage.md)提供当前认证资料、传输与聚合发布；[命令](../decision/07-command-state.md)、[展示](../decision/08-presentation.md)、[刷新](../decision/09-refresh-lifecycle.md)决定未决交互／调度。
- [装配](../decision/10-assembly-layout.md)、[验收与切换](../decision/11-acceptance-cutover.md)、[模型覆盖](../decision/13-model-catalog-policy.md)仍未结案。支持基线与 source oracle 须显式核验，不凭事件同名宣称完成。

## Postconditions

- 后续工作采用当前功能清单与明确已批准修剪，不重新要求预算修改、历史 Round 账本、缺失补算或跨周期 Session 总数。
- 价格算法、额度基线、固定预算、反馈及数据寿命继续约束后续票；最小逻辑布局由数据 Lighthouse 提供，不另造通用 State。
- 原生接口、发布完成／失败、最终 UI、TTL 与无 UI 策略仍由对应 open 票决定。本次同步不改变票状态或交付生产行为。
- 原题、先前批准稿和评论可查历史快照；当前正文不再要求读者靠“后续已替代”自行消解旧承诺。

## Invariants

- 每个正常可靠响应仅计算一次；工具、Round 发布和汇总不再收费，已确认缺失／clear／未落盘损失是显式边界。
- 延续原 turn-cost 请求锚价，不用结束／恢复时当前价重估历史。
- Round 公共含义与 connect-bot 协议分开；统计 clear 不伪造生命周期结束。
- framework／model-cost glossary 与 ADR 分工清楚；概念存在不强迫完整性计数或恢复系统。
- 沿用 framework 配置和 native import 边界，不建立第二套 YAML／框架。
- 不自动改旧统计文件；新活动聚合和旧归档不同，普通 resume 不把归档并回来。
- 调度限频不主动丢正常应统计消费；已批准的缺事实、未成功保存及 clear 前在途损失不被描述成零消费。
- 模型覆盖、原生能力、冲突来源和失败策略未获批准的部分保持未决；实施者不自行扩大或缩减。

## Historical ticket body

同步前的批准版本及原有票体／评论完整见[历史快照](../assets/contract-history-before-sync.md)。历史只作溯源，不覆盖当前契约。


```

## .scratch/model-cost-migration/lighthouse/02-accounting-ownership.md

```markdown
# 用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse

> Question and discussion: [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)
>
> 当前有效版本：按用户要求与[数据归属与账户周期决议](12-state-data-contract.md)同步，并于 2026-10-12 在原账户主题修订单账号支持和 DeepSeek 凭据身份取舍，确认来源见[账户访问原话](../assets/provider-access-confirmation-2026-10-12.md)。原题与[此前批准版本／评论](../assets/contract-history-before-sync.md)保留历史，不将已取消的补账／历史查询作为当前要求。framework 身份及已知冲突／局部清理的批准范围见[观察局部决议](03-observation-contract.md)；可信来源和原生映射仍未完成。

## Question

确定费用、token 基线、额度成对读数与缓存的归属：request／turn／round／session／owner／provider account／进程分别承担什么？主会话、子代理及 orchestration 如何计入展示与累计，怎样避免 session 统计与单请求统计双计？fork/resume/switch/tree 的基线与未结算请求如何处理？

现有 framework session/round 订阅只对 owner 派发，直接复用可能漏掉子代理观测。不能把激活 State 继承规则当成本归属规则。新统计允许从空开始，但新系统恢复和多进程并发仍需确定行为；多 main 同进程要显式决定支持或拒绝，不能顺手承诺。依据[现状调查](../assets/current-state.md)及源 daily-tracker、quota-estimate-store 确认去重与身份需求。

## Discussion

### 本轮批准修订与来源

取消按账号／非秘密凭据标识隔离，把每 provider 单账号提升为 framework 支持前提；保留多 CLI 并发，整文件 clear 的输入与重置范围由存储权威承接。 批准来源：[命令票本轮确认来源](../assets/command-confirmation-2026-10-12.md)（Q13–Q16、Q17–Q20）。此前账号键／身份分区和定点 clear 的政策仅为已被替代历史；不要求认证秘密落盘。非本轮替代范围继续有效，规划不等于实现。

### 请求消费与自身聚合

每个可观察请求在开始时关联实际发起会话、Turn／Round、provider、模型与锚价。可观察新调用／重发是新消费，即使内容相同；SDK 内隐藏传输重试不单独承诺身份／费用。归属不因模型／账户／会话切换改变，Owner State 不能替代实际会话或账户。

按可靠响应 usage 逐次计算并在内存累计，以实际会话 × provider × 模型的自身聚合为消费源，不保留完整历史请求账本。正常重复结束通知不再次累计；在途详情结束处理后释放，sessionId + turnId 已处理标记仅内存留至观察实例销毁，不在 round_end 清空、不按任意 TTL 淘汰、不持久化。framework 身份的批准范围见[观察局部决议](03-observation-contract.md)；具体原生关联与实例隔离仍未完成。

工具返回、Round 结束发布和 task／orchestration 汇总不产生第二笔消费。旧消息实际进入新请求时计新响应 usage，恢复读取旧消息不重新计费。

### 主会话、子代理与迟到消费

实际代理各自累计自身，可查询主自身、各子自身／含后代、主含后代；UI 三口径及展开布局仍由展示票决定。保存直接父实际会话关系，恢复沿链汇总 Session 口径；每笔请求一次，不只保存 Owner 总数，不从父总数反推子消费。

本次观察票 Q27 已修订父 Round 分配，唯一取舍及确认来源见[数据归属决议的逐代理主题](12-state-data-contract.md)：子消费只汇总到父 Session，Round 为各实际会话自身口径；不再要求启动父 Round 标签或复用子会话消费分段。关系仍随聚合发布，不加启动即落盘；直接父身份、恢复与发布仍需原生／存储契约落实；账户范围按下方已修订单账号主题，不把历史混账号场景恢复为多账号管理要求。修订前原文见 [本次修订前原文](../assets/observation-revisions-before-pause-2026-10-11.md)。

### 金额口径、缺失与冲突边界

DeepSeek 是当前计费渠道，已知请求费用计入金额；Codex 是额度渠道，美元只参考不进消费金额；token-only／hidden 无金额口径。不同性质不被解释为实际免费，不混人民币／美元为单一消费金额，也不按当前主模型过滤其他真实消费。上下文、账户测量和消费三维正交。

未知／确认零／额度消费／无口径／按指标完整性继续是领域概念，当前不要求逐请求状态记录、缺失计数或汇总持续完整性标记。正常缺 usage 提示跳过；失败／取消有可靠 usage 则计、无则跳过；有 usage 缺价仍计 token，只跳过费用并提示，不保留补账／补算状态。Codex 参考缺价不影响额度，无金额口径不因缺价报错。

已知矛盾数据不能相加或任意最后覆盖。2026-10-11 用户确认的冲突丢弃／局部清理与不提供结束后修正能力，唯一细则及确认原话见[观察局部决议](03-observation-contract.md)。此前持续标不完整／保留冲突账本分支不采用，历史保留于已链接快照；可信 usage 来源与原生关联仍需观察票验证。

### 本账户周期的 Session／Round、tree 与恢复

Session 累计限于当前消费统计周期，跨该会话各 Round；Round 累计仅本实际会话自身，子代理汇总范围以[数据归属决议](12-state-data-contract.md)本次 Q27 修订为准。只保存最近轮开始／结束快照，和 round_end 聚合同次发布／覆盖旧轮，不建立历史 Round 列表、历史位置索引或跨周期 Session lifetime total。费用快照来自已锚价累计，不以 token 差分乘当前价重算。

| 操作 | 当前有效行为 |
| --- | --- |
| resume | 读取本周期已保存活动聚合，可明确展示最近 Round；不重估宿主历史、不自动合并旧归档 |
| switch | 选择目标会话本周期视图，已开始请求仍归原身份（整文件 clear 的丢弃是显式例外） |
| tree | 不回滚本周期 Session；该历史位置 Round 隐藏或不可用，不冒充零／最近轮 |
| fork | 新实际会话自身从零，复制消息不是新消费；原会话本周期统计不被 fork 回滚 |
| 整文件 clear | 归档完整活动 JSON 的已保存聚合并重置，关闭 holiday；零消费也归档，旧值只在归档中，具体范围见[存储权威](06-local-storage.md) |

正常从历史位置继续触发新的实际活动按 framework Round 规则归属，不查询或恢复已经放弃的历史 Round。开放 Round 跨 clear 的统计快照映射尚未定型，不能伪造新轮。

### 恢复损失与账户重置例外

只恢复成功保存的聚合；强杀／崩溃的未发布内存消费可丢，不要求可靠未入账记录补账／恢复日志，不自动重发以补账、不以当前价猜收费。round_end 触发保存；不预建退出／切换／重载独立排空钩子。落盘幂等、等待／失败及多进程发布仍需存储票确定。

clear 改为整份消费活动 JSON 归档／重置，不提供会话树或目标账号选择；成功关闭 holiday，零消费也走相同归档流程。只操作锁内已成功保存数据，不收集其他进程内存；clear 前旧周期未保存／在途提交丢弃，旧缓存不得复活，之后新请求正常累计。不清已有归档、独立 Codex estimate 或入口 detail，不取消真实执行。具体操作顺序与失败语义由[存储权威](06-local-storage.md)持有，入口 provider／Round 限制由[命令权威](07-command-state.md)持有。

### 账户隔离、多会话与额度

本主题保留原标题供既有链接定位，当前政策已改为 provider 单一统计范围，不承诺账号身份隔离。framework 每个 provider 只支持一个使用中的账号；不提供账号列表、选择、轮换或持久化统计身份识别。共享同一统计目录的实例必须使用同一 provider 账号；多账号混用超出支持范围，不新增跨进程账号登记或检测系统。此限制是 framework 支持约束，不只是 model-cost 局部取舍。

model-cost 不按 DeepSeek Key、凭据指纹或 Codex 账号身份分区统计／holiday／estimate，不生成或持久化账号统计标识。同账号换 Key 不自动开始新范围；真正换账号也不自动识别、隔离或重置旧数据，用户需自行开始新数据，不能把旧消费或 estimate 当新账号专属结果。provider 计费账户的领域含义不变；认证查询在运行期需要的账号字段仍由访问 seam 提供，不因此写入统计文件。

旧 → 新：原“各 provider 单账号但按账号／非秘密凭据身份隔离、替换身份使用自己的周期与数据”被“provider 单一范围、不自动处理替换”取代。旧政策并未要求保存 API Key 原文；修订理由是常见单账号场景优先、取消额外身份处理代码，不是承认原政策允许泄漏。批准原话及范围见[命令票本轮确认来源](../assets/command-confirmation-2026-10-12.md)（Q13、Q14、Q15）。

支持同／跨进程多个独立 main 和子代理；同一实际会话仍按既有单执行者／保存版本冲突取舍处理，不新增执行者检测。用户确认最常见的是多个 CLI 启动多个 agent；[OMP](../assets/omp-session-process-model.md)与[pi](../assets/pi-session-process-model.md)探针也证明独立实例有不同 PID，因此不能以单账号取消跨进程协调。正常并发不得丢失、重复或覆盖其他会话贡献，已接受的缺事实／保存失败／clear 损失边界不被扩大。

最新余额／双窗口、获取时间、加载／错误按 provider 保存在内存，换会话不自动清测量基线；持久 quota estimate 只有一份 Codex 范围。读数同源成对、不拼来源；不做 Codex 会话消费与 provider 额度分摊／换算。认证访问资料的具体 interface 与宿主替换生效限制由[账户访问权威](04-provider-access.md)持有。

## Decision

framework 每 provider 单账号、model-cost 按 provider 单一范围聚合，不识别或持久化账号统计身份；实际会话 × provider × 模型自身聚合与直接父 Session 汇总不重复计费。多 CLI 正常并发仍支持，消费累计限于当前统计周期，整文件 clear 为显式重置例外，旧归档不自动恢复；各处详细规则以上述原主题为准。

## User stories

1. As a 用户, I want 区分主自身与各子消费, so that 理解任务成本来源。
2. As a 用户, I want 按直接父 Session 链查看含后代本周期累计, so that 嵌套请求不重复收费且不维护父 Round 消费分配。
3. As a 用户, I want 请求归属与锚价固定, so that 当前模型／账户切换不重解释旧消费。
4. As a 用户, I want tree 的历史位置 Round 不可用且 Session 本周期不回滚, so that 不把最近轮伪装成历史查询。
5. As a 用户, I want 领域概念区分未知／额度／无口径／确认零而运行时简化, so that 跳过金额不被解释成免费且不强迫完整性状态系统。
6. As a 用户, I want 可靠 usage 按身份累计、重复不计、缺 usage 跳过, so that 取消重发的正常消费正确且不引入补账日志。
7. As a 用户, I want 多会话同账户正常并发正确, so that 跨终端累计不丢不重而无需账号分区。
8. As a 用户, I want Codex 额度与参考费用不当现金消费, so that 不误做会话额度换算或混币种总额。
9. As a 开发者, I want 唯一自身聚合与只读派生视图, so that renderer／父子汇总不会成为第二份权威消费。
10. As a 用户, I want 明确缺失跳过与已知冲突丢弃边界, so that 不猜补费用也不把已知矛盾数据随意覆盖。

## Preconditions

- [行为契约](01-behavior-contract.md)提供仍保留的功能与计价基线；[数据归属与账户周期决议](12-state-data-contract.md)明确最新布局／寿命及有意简化，不重新决定完整账本。
- [观察契约](../decision/03-observation-contract.md)提供可靠 Turn／实际会话／usage 与结束交付原则；[账户访问决议](04-provider-access.md)提供当前访问资料，当前访问资料只用于认证，不生成统计身份；provider 未知不能猜成 DeepSeek。
- [存储协调](../decision/06-local-storage.md)决定物理聚合／关系／最近快照、发布／归档／reset／关闭 holiday、幂等／锁／失败；[模型覆盖](../decision/13-model-catalog-policy.md)决定适用计价与名单。
- [展示](../decision/08-presentation.md)、[刷新](../decision/09-refresh-lifecycle.md)、[命令](../decision/07-command-state.md)、[装配](../decision/10-assembly-layout.md)、[验收](../decision/11-acceptance-cutover.md)仍各自未决，不把来源交接当生产实现。

## Postconditions

- 普通消费保存失败的当前取舍及已确认损失范围以[存储局部决议](06-local-storage.md)修订 Q6／Q11 为唯一权威；此处不将正常并发正确性或仅异常退出的旧描述用于否定该显式修订，业务布局与普通 resume 结论不变。

- 后续按扩展自有聚合、有限运行期关联、父子关系与本周期恢复设计，不要求历史 Turn／Round 留存、缺失补齐或跨周期 Session 总数。
- 自身／含后代、账户／渠道口径可派生，实际请求不重复；无金额贡献不代表实际零消费。
- 验收覆盖可靠响应、重发／重复、最近轮／tree／resume、整文件 clear、父子与多会话正常并发及已确认损失边界，不按原旧验收恢复已取消要求。
- 冲突丢弃／局部清理及身份已批准范围以[观察局部决议](03-observation-contract.md)为准；可信来源、宿主实例隔离、物理发布、调度和最终 UI 尚需具名票收口，文档不代表能力已实现。

## Invariants

- 一个可观察请求在同一范围最多贡献一次，汇总不是新消费；隐藏尝试不承诺独立完整观测。
- 请求开始的实际归属和锚价不随当前会话／模型／账户改变，不用当前价重估。
- 未知／额度／无口径不等于免费；不据概念要求缺失计数或补账状态。
- Session 本周期不因 tree／删改消息／fork 回滚；成功整文件 clear 是显式重置例外，旧归档不自动并回。
- 聚合不改 framework Turn／Round 活动含义；旧子新请求与同一 Turn 后到 usage 修正分开，后者不提供修正能力，已知冲突处理见[观察局部决议](03-observation-contract.md)。
- Owner State 继承不决定消费；通用词义归 framework，消费词义归 model-cost glossary。
- 按本票 provider 单一范围、正常请求去重与同账号多会话并发同时成立；不据此要求已取消的多账号选择／轮换，已批准损失边界不被默扩张。
- 上下文、账户测量和消费保持正交，不累加子上下文为主预算，不换算 Codex 账户额度为 Session 消费。

## Historical ticket body

同步前批准版本及原有票体／评论完整见[历史快照](../assets/contract-history-before-sync.md)。当前正文已同步，不要求读者把历史补账／完整性／历史 Round 条款当有效承诺。


```

## .scratch/model-cost-migration/lighthouse/03-observation-contract.md

```markdown
# framework 如何提供请求、响应、Turn／Round 与模型事实观测？：Lighthouse

> Question and discussion: [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](../decision/03-observation-contract.md)
>
> 2026-10-11 按用户「只需要给出一些基本的原则……确保happy flow功能正常」「可以，请按这个方向收束」收口。确认原话、Q28、撤回的 Q29 与本轮正常链路探针见[收束确认与证据](../assets/observation-happy-flow-convergence-2026-10-11.md)。本文件是规划契约，不表示生产 framework、完整 provider 适配或迁移已实现。先前确认来源见[暂停证据](../assets/observation-pause-evidence-2026-10-11.md)，收束前完整问题与权威见[历史快照](../assets/observation-before-happy-flow-convergence-2026-10-11.md)。

## Question

为 model-cost 确定正常请求／响应、工具后续、Round 结束、正常子代理消费所需的小型宿主事实契约及三层职责。收束标准为正常数据流、必要事实的含义和交付位置、固定基线关键源事实／时序的可行性证据；不以穷举异常、冻结每个函数签名或证明所有恢复组合为结案条件。

## Discussion

### 收束范围与旧问题的替代

原题不断扩展到缺信号、重放、恢复、混账户与并发组合，用户明确否定这种设计流程。现改为：正常功能成立，以基本原则约束异常，允许极端情况下出错或少计；只有实际出现可复现且影响目标的必要缺口、或者解决成本需要取舍，才重新讨论。此前的笼统「仍须验证全部原生关联／恢复／各来源／最终接口才结束本票」不再是本票结案门槛。

这不是概括撤销正常去重、消费归属原权威的当前支持范围、逐实际会话观察、旧插件效果隔离或已批准的文件协调，也不是宣称所有 provider／异常已认证。具体 ID 算法、原生关联实现、字段命名、capability 声明／requiredSemantics、实例装配与 exports 由[装配决策](../decision/10-assembly-layout.md)依本契约确定；生产证明与旧插件回归由[验收决策](../decision/11-acceptance-cutover.md)确定。技术实现工作不再伪装成本票未答的用户政策选择。

### Happy flow 优先的设计推进原则

确认来源：用户在本票收束后明确「原则上应该是，先用happy flow确定基本原则，然后在尽量不推翻原则的情况下推进设计。如果一直用极端情况考验happy flow的原则，反而无法积极推进设计」，随后要求「请把这个原则也记录到lighthouse」。这是对已有正常路径收束的进一步明确，适用于本地图后续设计讨论，不重开本票或撤销已批准的功能约束。

1. **先用正常流程建立原则**：以常用功能、完整数据流和职责为设计主线；基本原则是推进设计的支点，不必等待所有极端情况检验通过。
2. **优先在原则内完成设计**：技术细节选择符合原则的简单方案；环境事实由 agent 调查，不把每个实现问题都升级为用户政策选择。
3. **具体边界局部处理**：遇到真实问题时尽量沿用已有机制，允许已接受范围内的不准确或损失；不默认扩建恢复系统，也不因构造出假想极端组合而反复推翻 happy flow 原则。
4. **有必要证据才重审原则**：只有具体证据表明原则阻碍常用功能，或落实成本明显不合适，才提出修改并说明影响与取舍；修改仍须用户裁决，不由 agent 静默撤销。

核心区别：**用边界情况完善具体设计，而不是用不断构造的极端情况，让基本原则永远无法成立。** 这不等于忽略已经发现的常用功能缺陷，也不把本轮证据限度解释为生产能力已经完成。

### 正常数据流与最小事实契约

```text
本实际会话开始活动 → framework 开启 Round
→ 可观察模型请求开始 → turn_start，固定身份／模型／请求时事实
→ HTTP 响应及 assistant 响应完成 → turn_end，交付当时可取得的事实
→ model-cost 按请求时锚点计算一次并更新自身累计
→ 工具执行／已知自动续跑仍属本 Round，后续模型请求是新 Turn
→ 本会话活动结束候选 → 轻量事实复查 → round_end
→ model-cost 提交稳定聚合快照，异步保存，handler 返回前等待结果
```

下表规定语义，不规定 TypeScript 名字或原生 payload 的镜像结构。缺失事实显式不可取得，不伪造默认零；消费者只收到所需事实，不读取 OMP context 或原生历史。

| 交付／读取 | 最小必要事实与约束 | 正常源事实／证据 |
| --- | --- | --- |
| turn_start | framework 不透明 turnId、实际 sessionId、所属 roundId、开始时刻、provider／模型身份；当时可靠可取得的 catalog 价格及币种／单位快照。开始事实固定，不被结束时当前模型替换 | OMP before_provider_request 的模型与实际会话 context；[请求探针](../assets/omp-request-observation-smoke.md) |
| turn_end | 同一 turnId、结束时刻／结果、可取得的 input／output／cache usage、HTTP status／headers／metadata、provider request／response ID 参考事实；当时一次交付，不等工具结果，不拆字段事件 | after_provider_response 收集 HTTP 事实，assistant message_end 交付响应 usage；外部 requestId 与 responseId 不假定相等；原生 turn_end 含工具结果，不能照搬 |
| Round／活动 | 按实际会话独立的 Round 身份、开始／结束语义；本会话活动／待续事实可重读；不是全后台任务归零或语义任务完成判断 | agent_start／agent_end.willContinue、同会话 idle／待续事实；[结束时序](../assets/omp-end-timing-smoke.md)及[本轮正常链路](../assets/observation-happy-flow-convergence-2026-10-11.md) |
| Session／父子事实 | 实际 sessionId 与直接父实际 Session 的可靠关系；Owner 只用于效果作用域，不代替会话身份，不用名字层级或 parentId 字符串冒充父 sessionId | 每个回调的 sessionManager.getSessionId、ctx.agent 身份及正常启动关系；[子代理调查](../assets/omp-subagent-round-findings.md)证明身份和关系线索，稳定映射由 adapter／framework 装配落实 |
| 只读当前会话快照 | 当前模型、可确认的实际 Effort、上下文占用／窗口大小及可取得的宿主统计；上下文不是消费累计。读取不发请求、不写统计、不更新业务态；无法确认的 Effort 不以配置冒充 | 当前会话查询；既有请求探针证明快照会随宿主处理阶段变化，读取／刷新时点归[刷新决策](../decision/09-refresh-lifecycle.md)，具体接线及生产验证归装配／验收 |

framework 不提供新的消费账本，也不将宿主累计作为 model-cost 已批准自身聚合的第二权威。当前认证资料由[账户访问决策](../decision/04-provider-access.md)提供，统计范围消费[归属原权威](02-accounting-ownership.md#账户隔离多会话与额度)；官方名单、价格覆盖与维护由[模型覆盖决策](../decision/13-model-catalog-policy.md)确定；不是本票顺带冻结的名单或账户规则。

### 分层与逐实际会话观察

按 Q17 已批准修订：能统一语义的身份管理、在途关联、通用去重／冲突处理机制、Round 开闭和结束候选复查尽量归 framework。OMP adapter 负责原生订阅、字段／信号映射、能力与可靠关联线索，允许必要桥接函数，不要求全是配置表。不将原生 payload 整体透传，不把 DeepSeek 峰谷／holiday、计价、Codex header parser、聚合、保存政策移入 framework。

本次允许重构旧 onRound／quiescent 与仅交付过滤后边缘的 HarnessPort seam，以旧插件行为回归约束。逐实际会话消费不能被旧 blanket owner gate 丢弃；connect-bot 等 owner-scoped 效果仍不被子会话事件驱动。正常父／子／兄弟／孙各有自身身份，父自动续跑不因子结束切轮。

子消费只汇总到父 Session，Round 仅本实际会话自身；唯一业务权威为[数据归属决议](12-state-data-contract.md)。旧父 Round 启动标签／消费分段及 Q24–Q26 已退役，不恢复。

### 连续活动 Round 与统一结束原则

Round 是实际会话的连续活动，不按普通消息、输入批次或任务语义切轮。工具、已知自动续跑、排队输入消费、专门交互及会驱动本会话继续的子代理等待保持同轮；已结束并等待普通输入后，下一次执行开新轮。子自身事件不关闭父轮；不要求所有后台 running jobs 归零。

OMP 最小映射沿用既有决定：无开放 Round 的 agent_start 开轮；上次已观测 agent_end.willContinue=true 则延续；否则新开始可截断遗漏结束的旧轮。续跑信号也丢失时允许拆轮，不为极端信号组合承诺完美准确。恢复／重载可截断未完成 Round；可靠 working 时可建立新轮，idle 时等实际执行，不从历史重放消费。

非续跑 agent_end 是结束候选，framework 安排一次下一任务复查；确认同一实际会话静止、无已知续跑才终轮。条件不满足保留候选，等相关事实输入再次核验；新活动／观察实例变化使旧检查失效。不持续轮询、不用超时猜结束，接受没有后续可用信号时不能及时终轮。

尽量让正常结束、明确取消与终止失败都走同一 round_end；请求／工具失败但仍继续不终轮。此前 Q19 的统一方向保留，不追加异常状态机。缺可靠结束证据不冒充正常完成、取消或已确认失败，也不产生 connect-bot 完成证据；本轮 Q29「统一静默退役、不发通知」提案被撤回，没有批准它或缺信号补发／原因枚举／截断保存。上述原则足以约束实现，不再逐个异常组合开决策题。

framework 活动轴 idle／working 与面板完成历史分开，不可靠观测不默认 idle。connect-bot 保留 working、接入后未见结束的 idle、真实结束后空闲的 awaiting-input；不以遗漏信号／截断触发自动关机。

### Q28：原生回调、公共 handler 与保存完成分离

用户已接受：原生 agent_end 回调提交结束候选后先返回，让宿主进入 idle；framework 在下一任务复查并派发公共 round_end。宿主可先报告结束并接受下一次输入，不新增全局输入屏障或统一等待所有异步效果。

model-cost 的公共 round_end handler 捕获稳定聚合快照，提前提交安全异步更新，继续不依赖成功且不再写同文件的独立逻辑，在自身返回前等待成功／失败。framework 接收延后派发的同步异常和异步拒绝，报告但不阻断代理、不假报保存成功；不是裸 fire-and-forget，也不把同步 I/O 包 Promise 当非阻塞。

保存、同进程同文件 FIFO、跨进程互斥与失败规则仍只由[存储决议](06-local-storage.md)持有。本票澄清等待位置，不撤销同机本地多进程协调，不承诺主线程零延迟、磁盘性能或所有故障安全。clear 的入口条件仍只在[命令局部权威](07-command-state.md)，不因宿主 idle 就当已保存。

### Turn 身份、轻量处理与异常基本原则

Q10–Q16 的已批准轻量原则保持：framework 为新可观察调用建立不透明 turnId，各实际会话独立管理，不跨观察实例／重载复用。provider requestId／responseId 是参考，不作为公共身份、不假定相等。Turn 包含可失败／取消的模型调用周期，不含工具执行；隐藏 SDK 传输重试不拆新 Turn、不承诺逐隐藏尝试锚时，不新增底层传输拦截。

请求开始在内存固定会话／Round、原消费统计周期、模型与业务锚价；响应结束在观察处理返回前完成关联、正常去重和逐响应内存累计，不等待 consumption.json 文件锁或远端刷新。处理后释放完整在途详情，sessionId + turnId 已处理标记仅内存留至观察实例销毁，不在 round_end 清空、不用任意 TTL 淘汰、不落盘。不提供结束后事实修正／后到 usage 补账，不从宿主历史重算。

不能可靠匹配的事实报告后丢弃，不按当前会话／模型或不可靠到达顺序猜归属、不临时补造开始、不自动补救。已知最终 usage 冲突且不能判定有效源时按不可用处理，不相加或任意覆盖；正常流式更新不是冲突。局部清理不清其他 Turn、既有累计或去重标记，不建长期冲突账本／全局损坏／持续完整性状态。

缺 usage／适用价格依[数据决议](12-state-data-contract.md)提示并跳过对应指标；有 usage 缺价仍保留 token。无法区分 provider 真零与宿主默认零的全零 usage 按未知处理，不因成功结束认定零；不为此增加复杂来源恢复。失败／取消有可靠 usage 也累计，无 usage 只跳过该 Turn，不撤销同 Round 已完成消费；取消仍可收口 round_end，不依赖最后一份 usage。没有消费证据的最近轮不自动冒充确认零，具体显示由[展示决策](../decision/08-presentation.md)处理。

单 Turn 故障不等于普通保存失败后的磁盘基线初始化；后者仍归存储权威。Session 各上下文分支已发生消费不回滚；跨入口 clear 的周期有效性、业务视图与命令反馈由既有数据／存储／命令／展示范围衔接，不新增完备恢复系统。

### 可行性证据与实施限度

[请求探针](../assets/omp-request-observation-smoke.md)运行正常、工具后续、隐藏 503 重试、RPC 取消，证明正常非零 response usage、headers、会话／模型事实可取得；证明原生 turn_end 含工具结果以及外部两个 ID 不相等。[子代理调查](../assets/omp-subagent-round-findings.md)运行正常主子、兄弟、嵌套和后台自动续跑，证明逐实际会话身份及直接父关系线索。旧资产的父 Round 分配建议已被数据修订替代。

[本轮正常链路](../assets/observation-happy-flow-convergence-2026-10-11.md)在 OMP 18.5.0 的普通回复／工具后续两条真实原生链路中，验证原生回调先返回、下一任务可读到 idle、探针模拟公共结束并等待异步保存；第一项保存人为暂缓时第二轮正常完成，两项实际写入串行，各 handler 均在自身保存完成后返回。

新探针的公共派发／FIFO 是临时模拟而非当前 framework，gate 是可控等待而非磁盘性能测试；没有验证完整安全文件更新／跨进程锁、所有 provider、实际 Effort／账单、混账户／多 main／恢复／TUI／自动关机。旧 framework／connect-bot 测试基线也不是新实现认证。本票的规划结案不改变这些限制。

## Decision

先以 happy flow 建立基本原则，再尽量在原则内推进设计，以具体边界完善实现而非无限重审原则；本票以正常请求／响应、工具／已知续跑、正常逐代理消费及 Round 异步保存为主线，确定必要宿主事实与公共分层；以轻量、不猜账、不补账和统一 round_end 的基本原则处理异常，不穷举极端组合。原生结束与公共 handler／保存完成分离、宿主不设全局保存屏障；具体装配与生产验收在已有决策票完成，不以其尚未实现阻止本规划票结案。

## User stories

1. As a 用户, I want 正常请求到 Round 保存的数据流清晰, so that 正常统计可以实施而无需逐一裁决假想极端场景。
2. As a 开发者, I want 必要宿主事实和公共身份／生命周期由 framework 提供、adapter 保留必要桥接, so that 接入新 harness 不重复状态机且业务不依赖 OMP payload。
3. As a 用户, I want 正常主子会话各自观察并按真实关系汇总, so that 不漏子消费、不双计且不让子事件改变父面板效果。
4. As a 用户, I want 请求只做轻量内存累计、Round 保存用非阻塞 I/O, so that 代理继续执行不被文件等待设置全局屏障。
5. As a 用户, I want 公共 round_end handler 返回前收口保存结果, so that 不假报已保存且同文件更新仍受既定协调保护。
6. As a 用户, I want 缺事实／冲突时局部报告跳过、取消仍保留可靠消费, so that 不猜账、不补账且一次异常不阻断代理。
7. As a 用户, I want 尽量统一 round_end 并区分活动和真实完成证据, so that 不因异常机制膨胀或不可靠截断触发自动关机。

8. As a 用户, I want 先从 happy flow 建立原则、再在原则内推进设计, so that 设计可以积极前进而不被不断构造的极端情景反复推翻。

## Preconditions

- [行为](01-behavior-contract.md)、[消费归属](02-accounting-ownership.md)、[数据](12-state-data-contract.md)、[存储](06-local-storage.md)提供保留功能、自身聚合／Session-only 子汇总、有限关联、消费统计周期与保存／协调规则；这些是已定设计，不是已实施能力。
- 当前认证资料、官方模型与价格名单、刷新时点仍分别由账户访问、模型覆盖与刷新决策提供；本票不假装它们已解决。
- 固定 OMP 18.5.0 已有上述正常源事实与时序证据；当前 framework 的 adapter 过滤、owner gate 和同步 handler 仍需按本契约重构。

## Postconditions

- [装配决策](../decision/10-assembly-layout.md)依据最小事实契约确定实际接口／capability、ID 与原生关联、实例／直接父映射、async 派发及消费者迁移；不复制完整原生 API，不引入第二套框架或业务 State。
- [验收决策](../decision/11-acceptance-cutover.md)确定生产正常链路和旧插件回归证明，证据区分原生事实探针、临时公共模拟与生产实现；只因想象到极端组合不得自动扩大恢复／测试系统。
- 展示、命令、账户、模型覆盖与刷新仍消费各自已有范围；本票不批准新的布局／命令／名单或缺信号政策。

- 本地图后续设计讨论采用上述 happy flow 优先原则：已有装配／验收及各功能决策负责落实具体设计，只有带证据的必要取舍才请求修订原则，不追加无穷异常门槛。

## Invariants

- 正常可观察 Turn 只累计一次；工具结果、发布和父子汇总不产生第二笔消费；缺失不等于零，不以当前价格重估历史。
- framework 公共语义／身份／生命周期、adapter 必要原生桥接、model-cost 业务计价／聚合／parser／保存政策三层分工保持；正常逐实际会话观察与 owner-scoped 效果隔离均保留。
- 已处理标记只留本观察实例内存，局部故障不清其他关联；不补账、不新增持久逐 Turn 历史或完备异常状态机。
- 宿主 idle／RPC 完成不等于统计已保存；公共 handler 等待自身保存，不额外全局阻塞代理入口；文件协调仍按存储原权威。
- 异常可以导致极端情况下少计或不及时终轮，但不把不可靠结束当真实完成，不撤销消费归属原权威的当前支持范围／文件安全要求。

```

## .scratch/model-cost-migration/lighthouse/06-local-storage.md

```markdown
# framework 如何提供独立存储、原子更新与跨进程协调？：Lighthouse

> Question and discussion: [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)
>
> 已确认结果；源票已按 Q23–Q26 收口。以下是规划约束，不表示文件能力、原生观察或生产迁移已经实现。物理 schema、framework 文件 interface、锁机制与同会话多执行者策略已由 Q23–Q26 确认；实现与验收仍由装配／验收票承担。

## Question

确定 model-cost 的本地数据组织、单一消费源与通用安全写入的职责：保存完成／失败、跨进程协调、clear 一致性、路径／平台条件，以及物理 schema 与 framework 文件能力边界。以下 Discussion 是唯一有效规则，源票保留探索记录与证据限制。

## Discussion

### 本轮批准修订与来源

按账号定点归档／重置改为完整消费 JSON 归档／重置，取消 accounts／providerAccountId，零消费走相同流程；多 CLI 事实保留跨进程锁。旧 Q25 布局被撤销，替代字段结构不由此次命令讨论隐式批准。 批准来源：[命令票本轮确认来源](../assets/command-confirmation-2026-10-12.md)（Q13–Q16、Q17–Q20）。此前账号键／身份分区和定点 clear 的政策仅为已被替代历史；不要求认证秘密落盘。非本轮替代范围继续有效，规划不等于实现。

### 单个消费活动文件与独立历史归档

用户选择本地 JSON，消费活动数据集中在一个文件，归档各自独立，不引入数据库、不按账号预拆文件。本轮取消 accounts／统计账号身份分区：framework 每 provider 单账号，model-cost 不识别替换，消费 clear 整文件备份／重置；provider 支持政策只在[消费归属原权威](02-accounting-ownership.md#账户隔离多会话与额度)持有。用户最常见为多个 CLI 同时运行，正常同机跨进程安全更新仍是支持范围。

旧 daily-tracker 的活动／归档分离作为组织参照；旧算法和新业务并非必须逐字段相同。用户级共享目录及配置解析由 Q16–Q20 确认；文件组织与名称由 Q21 确认；旧 Q25 账号键布局已撤销，替代 schema 尚待该主题定点收口。程序不自动清除旧统计，用户切换版本时手动备份并清空后复用旧目录。

### 独立的 Codex 估计文件

用户明确 codex-usage-estimate 是估算 5h／7d 额度转换关系的独立功能持久化文件，保持独立，复用 framework 的安全写入 module。本票不展开其业务算法；这不是移除估计功能，也不是将其合并到消费活动文件。原有效估计与调度要求仍由既有行为／数据结论及刷新票约束。

### 一个消费计算来源与 Session／最近 Round

用户确认前轮展示的模型，具体 JSON schema 由 Q25 冻结：消费只保留适用账户当前周期的会话自身累计和最近一轮开始／结束累计快照，不保存历史 Turn／Round 列表。每个可靠响应只在扩展 shared logic 中计价并累加一次。当前轮动态状态在内存，运行中同时持有恢复并持续更新的会话累计；这不意味着每次响应重读磁盘或只在内存留下轮次值。

Round 自身消耗从同一累计的开始／结束快照派生；费用快照已经逐响应锚价计算，不再次以当前价格重估。round_end 将自身累计、最近快照及必要父子关系同次保存，覆盖旧最近轮。账户总数和父子合计从自身聚合派生，不另维护差分更新的第二套权威消费累计。磁盘是聚合的已保存快照，不是另一个独立计费来源。

上轮“沿旧 token 基线差分并把费用也改差分”的提议不作为最终模型；保留旧方案安全读改写组织，不要求复制其第二套累计维护。提交顺序由下节 Q7 确认，旧快照／消费统计周期有效性方向由 Q8 确认；版本恢复细节由 Q11 确认，同 session 单执行者由 Q26 收口，clear 一致性由 Q13／Q15／Q24 确认。

父子 Session 合计按直接父链派生，Round 只作本实际会话自身累计的差分；依据[数据归属决议本次 Q27 修订](12-state-data-contract.md)，不再按启动父 Round 筛选子消费或保存父 Round 消费分段。子记录 parent 字段按下文 Q25 裁剪；跨账户遍历、直接父恢复与跨 clear 自身快照仍待对应契约，不因简化自动解决。

### Extension 模型与 framework 基础能力

用户进一步澄清：Session、Round、Request／Assistant response 的公共字段、身份、生命周期与可取得的 usage 等源事实属于 framework 提供的能力，由 adapter 映射宿主。extension 组合这些能力，选择业务统计与不同精度的持久化，不自行重复定义宿主观测。前文“计算与模型归 extension”限定为消费业务计价、聚合组合及持久化模型，不把源事实生成转移到 extension。公共逻辑／必要原生桥接的分层按[观察分层修订](03-observation-contract.md)，公共字段细节与累计事实是否提供仍由观察票决定，不因本澄清冻结新载荷或承诺不存在的宿主统计。

用户明确该聚合／最近轮／保存频率模型是 model-cost extension 的实现取舍，不是 framework 的通用持久化模型。framework 提供可靠本地文件安全更新，隐藏同进程／跨进程协调和发布细节，业务层拥有格式与合并规则。其他 extension 可以复用同一基础能力采用不同数据结构、寿命和保存时机，不要求使用 Session／Round。

用户曾在旧 extension 踩过多会话写入坑，明确不希望每个扩展重复实现底层协调。此理由支持可靠的通用 module，而非扩大成通用账本或业务 State。

### 文件 interface 与协调归 framework

用户明确同步／异步文件写入应经 framework 提供的 interface，同文件加锁或必要队列也归 framework，不让 extension 自己实现协调。锁／队列是达到安全更新的机制，不自动批准后台队列或两套公开 Sync／Async 方法。本次确认安全异步更新 interface；不要求另加同步 interface。model-cost 的等待位置由下节 Q5 收口，其他 extension 自行选择调用组织。旧实现调用方直接 await 保存 Promise，但锁内使用同步 read／write／rename；Promise 不意味着同步文件代码可与同线程其他代码并行执行。

### Q5：提前提交，handler 返回前等待

用户明确确认：捕获稳定的 Session 累计／最近 Round 快照，提交 framework 安全异步更新，继续不依赖保存成功、且不再写同一文件的独立逻辑，handler 完成前 await 保存结果。framework 底层采用非阻塞文件操作，不只是给同步 I/O 包 Promise；不是 fire-and-forget、不新增退出后排空系统。

所有正常返回／提前返回／异常路径都需收口该保存任务，并及时接住保存拒绝；普通 round_end 保存失败策略已由下节 Q6 确认；具体反馈承载由展示票 08 收口，业务拒绝与保存失败的可判别结果由 Q24 确认。实际 I/O 是否已开始及性能收益取决于协调与运行条件，不宣称已有测量。本决定替代 agent 先前立即 await 的推荐，后者从未作为用户批准约束。

### Q6：普通消费保存失败丢弃未保存部分并重新初始化

用户在本轮明确确认修订：所有普通消费保存失败（包括业务不一致与临时 I/O／协调失败）都报告失败，但不因此停止代理主流程、不假报持久化成功；丢弃受影响消费状态的未保存部分，重新从磁盘当前有效完整快照初始化周期、累计、最近 Round 与版本。不将已有磁盘累计置零，不执行账户 clear，不重置磁盘周期／holiday。不清已处理请求的去重标记，避免旧通知重新计费。

读不到有效磁盘数据时，按 Q14 报告并暂停本实例消费统计／保存至下一次正常会话初始化，不猜零覆盖，不新增自动重试、修复、补账、持久恢复日志或后台补写。后续新消费只从有效初始化基线开始，不重交已经丢弃的消费。

修订理由与确认来源：用户担心冲突内存导致持续保存失败，认为这些极端边界不值得复杂恢复，明确接受少量未保存消费丢失。此策略替代先前“失败后保留内存、下次正常保存带上未保存累计”，修订前原文保留于源票 Comments，仅作历史。

该策略是 model-cost 普通消费保存的业务取舍，不自动套给 clear、holiday 命令、独立 Codex estimate 或其他 extension。framework 的正常多会话安全更新、账户隔离、损坏文件不覆盖仍保留。clear 的成功／失败须以实际活动文件提交为准，内存初始化不能伪装 clear 成功。

### Q7：轻量进程内 FIFO 与跨进程互斥

用户在了解复杂度后明确同意轻量方案：framework 按同一文件的协调键维护内存 Promise 尾链，在同进程内按进入 interface 的提交顺序串行处理更新。前一次成功或失败后才启动下一次，失败不阻断后续；每次调用取得自己的结果，空闲键清理，不同文件独立。获得协调权限后重读最新文档、执行业务更新并原子发布。

跨进程保证互斥安全更新，不承诺全局 FIFO；具体锁由 Q24 确认，平台条件由 Q22 限定为本机本地文件系统。该内存串行不引入持久任务队列、worker、定时器、后台重试或退出排空，不改变 Q5 的 handler 返回前等待。用户希望低复杂度；本选择以局部轻量机制满足顺序需求，不取消正常多会话并发正确性。路径别名统一由 Q24 确认；clear 提交边界由 Q13 确认，归档输入由 Q15 确认，跨进程新周期可见性由 Q23 收口；等待／取消边界由 Q9 确认，旧快照／消费统计周期有效性方向由 Q8 确认，FIFO 不能替代这些检查。隔离 Promise 探针的运行结论与验证范围记录在源票，不表示生产文件 module 已实现。

### Q8：按记录合并、消费统计周期与保存版本校验

用户明确同意：在协调权限内重读最新文档，只合并本次负责的会话记录，保留本次提交不负责的其他会话／provider 记录，不以旧内存整份文档覆盖。提交携带消费统计周期标识，与当前磁盘周期不符则拒绝，不能重绑定为新周期消费；会话快照携带递增保存版本，旧版本不覆盖，相同版本的同一快照重复提交不追加消费。

框架拥有协调与安全更新，model-cost 拥有业务有效性／合并规则。只增加少量标识，不建立历史 Turn／Round 列表或消费日志。resume 版本接续由 Q11 确认；同 Session 单执行者由 Q26 收口，跨周期内存刷新由 Q23／Q6 收口；clear 提交边界由 Q13 确认；同版本不同内容冲突由 Q12 确认；版本校验不等于已解决这些机制。

### Q9：取得权限前有限等待／可取消，更新开始后等待结果

用户明确同意：同进程排队与跨进程取锁合计采用有限等待预算，默认值由 Q10 确认为 15 秒。在等待阶段超时或被取消，返回失败／取消并确保该调用以后不能迟到开始写入。普通消费保存按修订 Q6 报告失败、丢弃未保存部分并从磁盘有效快照初始化，不因此中止代理主流程。

开始执行读改写／发布后等待实际结果，不用表面 Promise 超时／取消让调用方以为结束而真实写入继续；本轮不设计强制中断正在发布的文件操作，不承诺整次更新的硬总耗时上限。不新增自动重试／后台补写；取消来源按各调用方，具体锁实现由 Q24 确认，默认预算与调用方覆盖由 Q10 确认。

### Q10：默认协调等待预算 15 秒

用户接受 Q10 提议，并询问是否超时取不到锁就报错放弃写入。默认从提交起，同进程排队＋跨进程取锁合计最多等待 15 秒；framework 文件 interface 允许调用方显式覆盖，model-cost 暂用默认，不新增专属 YAML 配置项。到期仍未取得协调权限则本次失败并放弃，后来权限可用也不能迟到写入。不是开始文件更新后的硬超时；实际错误 interface 形状由 Q24 定为可判别失败结果，普通 round_end 捕获并按 Q6 反馈，不以未处理异常中止代理。

### Q11：完整快照恢复与失败后的重新初始化

普通重启／resume 没有运行中的内存状态时，读取当前消费统计周期内已保存的完整会话快照，一起恢复累计、最近 Round 与保存版本，新快照从恢复版本继续递增，同一快照正常重交保持原版本；新周期没有该会话记录时才从初始版本开始。不扫描历史消息、不合并旧归档、不以当前价重算旧消费。

本轮按用户确认修订运行中失败分支：保存失败后不再保留较新未保存消费，按 Q6 丢弃并从磁盘当前有效完整快照重新初始化。版本只在同消费统计周期、同会话内比较，旧周期版本再大也不覆盖新周期；现有磁盘记录缺必要字段不是普通无内存版本，不据此猜值或兼容旧统计。同 Session 单执行者检测由 Q26 收口，clear 后运行态由 Q23／Q6 收口。普通 resume 契约未改变，仅“运行中保存失败不回滚”被明确替代；修订前原文见源票历史。

### Q12：同版本不同内容拒绝并报告冲突

用户明确同意：同周期同会话同保存版本却不同快照内容时，保留磁盘内容，返回明确冲突并报告，不相加、不最后覆盖、不逐字段取最大值，也不新增持久冲突账本。区别于同版本同一快照的正常重复，不假报保存成功；普通 round_end 按 Q6 不因此中止主流程。业务快照相等的具体判断随 schema 收口。

### Q13：clear 先归档再重置，失败终止

clear 当前入口的执行条件见[命令局部决议](07-command-state.md)；本节只持有归档／重置一致性，不以入口结束替代跨进程周期校验。

用户明确同意简化方案：先发布完整活动 JSON 的独立归档，再原子发布整个活动范围的新周期／累计重置／holiday 关闭。零消费也走同一流程。归档失败不重置；重置未提交就报告失败，不自动重试、恢复、补做或合并失败归档。允许残留本次归档，但只有活动文件确实提交重置才算成功；归档成功而重置失败须保留阶段信息，交[命令权威](07-command-state.md)的统一失败反馈承载。

已有归档、独立 estimate 与 detail 的保护不变；原“保留活动文件中其他账号”保护按 Q13 单账号修订取消。两文件不天然组成事务，不增加事务日志或复杂恢复；归档输入为锁内最新完整已保存 JSON，协调／发布机制仍沿 Q24。

### Q14：无有效磁盘基线则暂停消费统计／保存

用户明确同意：失败后的初始化读不到有效磁盘基线时，报告并暂停本实例消费统计与保存，不影响模型执行；下一次正常会话初始化再加载，不自动探测恢复、不猜零覆盖、不补算暂停期间消费。独立余额／额度功能不因此自动停用。这是 extension shared logic 的业务失败处置，不取消真实执行／framework 生命周期，不把暂停期间未统计消费描述为确认零。

### Q15：clear 只归档最新已保存活动数据

在协调权限内读取最新有效活动文件，归档完整已成功保存的 JSON，再执行 Q13 整文件重置。不收集任何进程未落盘内存，不触发强制保存／Round 结束／排空或补账。响应已完成但尚未保存的消费同样不进入归档，随旧周期结束丢弃。用户 Q20 明确批准有效零消费也统一生成归档／重置；损坏／读失败不是空消费，仍沿 Q14 报告并不覆盖。

用户再次强调 clear 尽量简单，不设计很多边界恢复逻辑。此确认将旧“全部已知／已取得聚合”的歧义收窄为“锁内最新已保存数据”，明确接受比仅旧在途请求更宽的未落盘损失。成功／失败仍按 Q13，已有归档与独立 estimate 的保护及正常并发正确性不变；账号保护已被本轮单账号修订取消。本题决定归档输入，不宣称跨进程新周期可见性或物理锁已实现。

### Q16：用户级共享目录，目录由配置指定

用户明确回答“同意共享目录，另外目录地址请参考旧的extension，我需要文件目录可由配置指定”。同一操作系统用户各项目／终端共享可配置目录，实际共享以访问同一目录为前提。本轮不再按账号身份保存旧分区；实际会话隔离、周期／版本拒绝旧提交和整文件 clear 仍由本权威的当前规则持有。当前认证资料不存于消费文件。

旧 model-cost 的 archiveDirectory 实际写死 os.homedir() 下的 .omp/cost-archive，没有目录配置参数；只读 Bun 调用 archiveDirectory／archiveDocumentPath 得到旧目录及消费／estimate 文件路径，未创建目录或读写统计文件。源码证据：[旧 archive-store](../../../../my-omp-toolkit/extensions/model-cost/archive-store.ts)。该调查时尚未批准复用旧地址；后续 Q17–Q20 已批准在用户手动备份、清空后复用目录，不导入旧文档。

后续确认见 Q17–Q20；早期 ~/.my-agent-toolkit/data/model-cost/ 与 ~/.my-agent-toolkit/cost-archive 候选均未采纳。沿现有 framework 配置机制落实，不新增第二套配置体系，不声称目录能力已实现。

### Q17–Q20：复用旧统计目录与字段局部路径语义

确认来源：用户要求“直接放在旧extension目录，切换版本时会手动备份后清空”，随后澄清“Q19 是的，指.omp主目录”，并对 Q20 的完整解释回答“同意”。复用操作系统用户主目录下 .omp/cost-archive，而非 OMP 程序安装根或 extension 源码目录。切换版本前由用户手动备份并清空旧统计；新实现不负责自动备份、清空、搬迁、合并或旧格式兼容。本次仅记录规划，没有执行清理。

model-cost config.yaml 的 storageDir 初始配置为 "~/cost-archive"。仅此字段的 ~/ 以操作系统用户主目录下 .omp 为基准，因此解析到 用户主目录/.omp/cost-archive；不是通常的用户主目录/cost-archive，也不改变 framework 其他字段的 ~ 语义。绝对路径直接使用。Q18 其余已同意约定保留：普通相对路径以配置文件所在目录为基准、不随项目 cwd 变化；初始化读取、修改后重启、不热切换；改变根只是选择另一份存储、不自动搬迁或合并。各实例访问同一实际根才共享，不同根独立。

同一个 storageDir 覆盖消费活动、归档与独立 Codex estimate；文件组织与名称已由 Q21 确认，物理 schema 由 Q25 确定。这个字段局部解析是 model-cost 配置约定，不把 OMP 目录策略固化为 framework 通用文件 module。旧文件残留的识别／有效性仍受损坏和不兼容文件不猜零覆盖约束，不因手动清空承诺批准自动删除。

### Q21：固定文件组织，一个可配置根

用户对完整文件组织提议回答“同意”。storageDir 下固定 consumption.json 存放完整消费活动聚合／周期／holiday／会话自身累计／直接父关系／最近 Round；本轮取消账号分区，不改文件名。codex-usage-estimate.json 独立保存唯一 Codex 范围估计，消费 clear 不清它；archives/<本次归档唯一标识>.json 每次独立保存完整活动 JSON，不覆盖旧归档。取消账号键后的具体字段布局须按 Q25 定点收口，不新增各文件路径配置。

只配置根目录，不分别配置这三个位置。活动文件名不再沿用 deepseek-cost.json，因为新活动数据包括多账户／多模型；不增加第二套权威聚合。失败归档备份仍按 Q13 保留但不自动恢复／合并，不把文件存在当 clear 成功。文件名及组织已确认，JSON 字段／schema 版本／唯一归档标识由 Q25 确定，锁／协调键及原子发布契约由 Q24 确定（实现仍未开始）；没有创建目录或业务文件。

### Q22：本机本地文件系统的协调范围

用户对 Q22 完整运行条件提议回答“同意”。本次保证同一台机器、本地文件系统上的同目录安全共享：不同项目、终端与 OMP 进程正常并发不得互相覆盖；storageDir 可指向另一块本地磁盘。不承诺多台机器通过网络共享盘或云同步共同写入的正确性，不为此增加分布式锁或冲突合并。共享是本机跨进程，而非跨机器复制或同步。

验收沿用已有 OMP 18.5.0／Windows x64／Bun 1.4.2 基线，不因 harness-independent 契约声称其他操作系统或网络文件系统已认证；是否正式改变基线仍由验收票决定。此范围不取消正常多会话安全更新、独立 estimate 或已定的数据保护，也不表示具体锁、路径别名协调与原子发布实现已确认或验证。

### Q23：不做请求前读取，周期可见性由保存时校验收口

用户要求不对 clear 边界设计复杂机制、取尽量简单的实现，并同意取消“每请求前读取最新 consumption.json”的候选。普通运行期间实例使用内存中的消费统计周期与 holiday，不在每个可观察请求前读取文件；renderer 只读内存，不新增定时轮询或空闲刷新。

跨进程 clear 的周期可见性在保存时收口：round_end 提交携带内存记录的 period，磁盘周期已变按 Q8 拒绝；该失败按 Q6 报告、丢弃未保存部分并从磁盘当前有效快照（新周期）重新初始化。代价是 clear 后最多一轮未保存消费丢失、发现延迟到保存时，与 Q13／Q15“clear 尽量简单、接受未落盘损失”一致。

先前 Q23 候选（每请求前异步读最新文件、先固定消费统计周期／holiday／锚点）及其读失败、空闲刷新、读／clear 交错、开放 Round 跨周期快照等后续问题不再展开。读取一律发生在协调范围内的安全更新与正常初始化：锁内读即最新。属于观察／展示的其他问题不在本题。

### Q24：framework 通用文件能力的接口、锁与发布契约

ADR-0002 已要求 framework 提供协调读-改-发布与读端安全的原子发布，且最新磁盘值必须在协调范围内读取；Q5–Q22 已定 handler 返回前等待、进程内 FIFO、跨进程互斥、按会话合并与周期／版本校验、15 秒等待预算、开始更新后等实际结果。用户同意以下最简落地契约：

- 单一异步入口：调用方提供已解析的绝对路径与业务更新函数；framework 按规范化绝对路径作为协调键，进程内 FIFO 串行，跨进程用一个锁文件以 O_EXCL 原子创建互斥；合计等待不超过默认 15 秒或调用方覆盖值，等待阶段超时／取消即失败且保证不迟到写入。
- 取得协调权限后，framework 重读最新文件并解析，把当前文档交给更新函数；framework 不认识 schema，不做消费统计周期、版本或业务合并判断，只负责协调与发布。
- 发布用同目录临时文件 + rename 原子替换；读方只看到完整旧文或完整新文；解析失败或文档损坏时不调用更新函数、不覆盖原文件，返回可判别的损坏失败。
- 失败用可判别结果（超时／取消、IO、损坏；业务拒绝由更新函数返回），不抛未处理异常、无重试或后台队列。
- 锁文件年龄超过等待预算视为陈旧并回收，避免崩溃后永久卡死；为满足 ADR-0002“不静默替换他人已完成更新”，被误回收的存活写入者在发布前校验锁所有权（内容 token），发现自己已失去锁则放弃本次写入并按失败返回，而不是用 rename 覆盖他人结果。代价是极慢写入者的未保存更新被丢弃，属已接受的少量损失；真实跨进程／崩溃／原子读契约由验收票验证。
- 协调键用目标目录规范化路径（已存在父目录的 realpath）+ 文件名，避免同一文件的不同写法绕过锁；路径别名统一。
- 留在 model-cost：JSON schema、消费统计周期／版本校验、按会话合并、归档与 estimate 业务规则。

明确不采用：把旧 OMP native file-lock 或惰性原生 import 带进共享代码；只锁最终写入而不在协调范围内重读；后台任务队列／自动重试；同步 interface（本次只确认安全异步更新）。本能力实现时补进 `framework/docs/framework-capabilities.md`（该文档目前只覆盖 config 只读 YAML）。

### Q25：consumption.json 的物理 schema、归档与版本

用户同意以下最小结构；token 分桶键名与缺价口径以行为／消费契约为准，装配时落定：

- 原 Q25 的 accounts／providerAccountId 键与每账号分区已按本轮 Q13–Q15 批准取消，不得继续实现凭据指纹或账号 ID 持久化。
- 仍保留 schemaVersion、周期拒绝旧提交、会话 saveVersion、唯一 own（provider／模型／token／费用口径）、recentRound 与直接父 parent 的需求；本次不重新引入父 Round 标签／归属段。
- 只存当前活动范围；archives/<archiveId>.json 使用 crypto.randomUUID()，已存在拒绝覆盖，内容为锁内最新完整有效活动 JSON；零消费同样归档。
- 未知／缺失／损坏 schemaVersion 按 Q14，不猜零、不自动迁移旧 deepseek-cost.json。
- **待定点收口**：取消账号键之后，provider 分桶与 periodId／holiday／sessions 的具体物理位置尚未获批；旧 Q25 不能作为完成冻结的替代 schema。整文件 reset 的跨 provider 表示也应在同一次收口确认。此次发布只撤销被用户明确取消的账号布局，不替用户选择新字段结构；用户在命令票 Q21 已回答“可以”，授权该原题仅对这项物理布局定点重审；源存储票已恢复 open、未认领，替代 schema 仍未决定。其他 Q5–Q24／Q26 不重开。来源见[命令确认原话](../assets/command-confirmation-2026-10-12.md#q21-定点重审授权)。

### Q26：同会话多执行者靠版本冲突收口

用户同意不新增执行者检测（租约／心跳／每会话锁）。`saveVersion`、Q8 旧版本不覆盖、Q12 同版本不同内容拒绝，加上失败按 Q6 丢弃并从磁盘重初始化，已经防止两个进程同时运行同一会话时静默覆盖或重复计费；代价是冲突实例的未保存段丢失、保存交替失败，属已接受的少量损失。明确：同会话同时双执行者不支持，只在保存时通过版本冲突发现。

## Decision

消费活动数据集中存于一个本地 JSON，历史归档及 Codex 估计文件独立；model-cost 以唯一自身聚合派生统计，round_end 保存 Session 累计和最近 Round 快照。framework 提供公共 Session／Round／response 事实与可复用的安全文件更新机制，不规定扩展业务持久化模型；普通消费保存失败反馈而不打断主流程，丢弃未保存部分并从磁盘有效快照初始化，接受少量损失，不增后台重试；同文件更新采用轻量进程内 FIFO，跨进程互斥而不承诺全局顺序；按会话记录合并并校验消费统计周期／保存版本；取得权限前有限等待／可取消，开始更新后等待实际结果；协调等待默认 15 秒可由调用方覆盖，同版本不同内容拒绝并报告；resume 与失败后初始化均以磁盘有效完整快照为基线；clear 先归档再提交活动重置，失败终止；无有效基线暂停消费统计／保存至下一次正常初始化；clear 仅归档锁内最新已保存数据，不排空内存并丢弃未落盘消费。

用户级共享且目录可配置，storageDir 的 ~/ 特指用户 .omp 主目录；初始 ~/cost-archive 复用旧目录，由用户切换前手动备份清空；初始化读取、修改重启，不热切换或自动迁移。该根下固定 consumption.json、codex-usage-estimate.json 与 archives/ 独立归档文件，不另设各文件路径配置。

文件协调的本次保证限定本机本地文件系统，同机跨进程安全共享；不承诺网络盘／云同步的跨机器共同写入。

framework 提供 harness-independent 的协调读-改-发布能力：单一异步入口、规范化路径协调键、进程内 FIFO、锁文件跨进程互斥、15 秒等待预算、锁内重读最新文档、调用方更新函数、同目录临时文件 + rename 原子发布、损坏不覆盖、陈旧锁回收且被误回收的写入者放弃覆盖；framework 不解释业务 schema。model-cost 拥有 consumption.json 物理 schema 的剩余约束（schemaVersion／无账号键的活动统计范围及会话 saveVersion／own／recentRound／parent；具体替代布局尚待 Q25 定点收口）与 `archives/<uuid>.json` 归档命名。读新鲜度以锁内读取为准，不做每请求读取，跨进程 clear 由保存时周期校验按 Q8／Q6 收口；同会话多执行者不引入租约，靠版本与冲突检测收口。

## User stories

1. As a 用户, I want 一个消费活动文件与独立历史归档, so that 当前单账户使用不承担预拆文件复杂度且保留明确的消费统计周期恢复。
2. As a 用户, I want Session 累计与最近 Round 来自同一消费聚合, so that 展示、保存和恢复不维护两套消费算法或重复计费。
3. As a extension 开发者, I want framework 封装多会话安全更新, so that 不在每个扩展重复实现文件协调并能选择自己的持久化模型。
4. As a 用户, I want Codex 转换估计保持独立持久化, so that 消费归档／clear 不误改另一功能的数据。
5. As a 用户, I want 提前提交非阻塞保存并在 handler 完成前等待, so that 独立业务逻辑可与 I/O 重叠但不会留下脱离本次处理的保存任务。

6. As a 用户, I want 普通消费保存失败报告而不打断代理并丢弃未保存部分、从磁盘有效快照初始化, so that 失败内存不导致持续冲突且无需复杂恢复，代价是接受少量消费丢失。

7. As a extension 开发者, I want 同文件轻量进程内 FIFO、失败后继续及不同文件独立, so that 无需复杂后台队列或调用方重复协调便能获得确定提交顺序。

8. As a 用户, I want 按会话记录合并并拒绝旧周期／旧版本提交, so that 多会话保存不覆盖他人且 clear 前消费不被旧缓存复活。
9. As a 用户, I want 取得协调权限前有限等待／可取消且取消后不迟到写入, so that 锁竞争不无限挂住 handler，也不会收到失败后又悄悄改动文件。

10. As a 用户, I want 默认协调等待预算明确为 15 秒且可由调用方覆盖, so that 异常竞争能有限失败而无需新增扩展配置系统。
11. As a 用户, I want 同版本不同内容保留磁盘并报告冲突, so that 序号复用或双执行者错误不会被猜测合并掩盖。

12. As a 用户, I want resume 与失败后的初始化恢复完整磁盘快照并接续版本, so that 新消费有明确有效基线，不靠猜零或复杂补账继续保存。

13. As a 用户, I want clear 先归档后提交重置、失败就终止, so that 不先清掉未备份消费，也无需自动补做／恢复流程。
14. As a 用户, I want 无有效磁盘基线时暂停消费统计／保存至下一次正常初始化, so that 不猜零覆盖、不阻断模型且无需后台恢复，接受期间少计。

15. As a 用户, I want clear 只归档已保存消费而不收集内存或强制排空, so that 实现简单、不设计跨进程恢复，接受未落盘消费丢失。

16. As a 用户, I want 跨项目共用且可配置的持久化目录, so that 不拆散同 provider 累计并能选择文件存放位置。

17. As a 用户, I want 活动消费、独立估计和归档采用固定且清楚的文件组织, so that 只配置一个根且消费 clear 不误清 estimate 或已有归档。

18. As a 用户, I want 在本机本地磁盘安全共享统计而不引入跨机器协调, so that 多终端正常并发可靠且保持实现简单。
19. As a 用户, I want 不做请求前读取而由保存时发现跨进程周期变化, so that clear 相关实现保持简单并接受最多一轮未保存损失。
20. As a extension 开发者, I want framework 提供带锁、锁内重读与原子发布的通用文件能力, so that 多进程安全更新不在每个扩展重复实现。
21. As a 用户, I want consumption.json 一个最小且唯一的物理 schema, so that 恢复、归档与展示读取同一权威。
22. As a 用户, I want 同会话双执行者靠版本冲突而非租约收口, so that 不引入额外仲裁机制且不静默覆盖。

## Preconditions

- 复用旧目录前由用户手动备份、清空旧统计并完成新旧加载切换；原新实现加载互斥与回退步骤由验收票收口，不将此规划当已经完成的用户动作。

- [数据归属与账户周期决议](12-state-data-contract.md)提供本周期自身聚合、最近快照、父子关系及接受的未保存损失边界。
- [观察契约](../decision/03-observation-contract.md)仍需提供可靠响应、Round、会话与父子身份事实；[账户访问](../decision/04-provider-access.md)提供当前认证资料，不提供持久化统计身份。
- Q23／Q24／Q26 已确认安全更新 interface、完成／失败结果、旧提交拒绝、锁与平台、路径、clear 归档／重置一致性及读新鲜度契约；这些仍是规划，不代表 framework 文件能力已实现。实现需 node:fs 等运行时文件 API（与 config 读取一致），不再要求统计账号身份格式；取消账号键后的物理 schema 尚待 Q25 定点收口，落地点由装配票决定。

## Postconditions

- [装配规格](../decision/10-assembly-layout.md)不得把消费 schema、计价或 Session／Round 保存规则放入 framework 基础文件 module。
- [展示](../decision/08-presentation.md)读取同一自身聚合及派生视图；[验收](../decision/11-acceptance-cutover.md)覆盖恢复与多会话保存，不恢复历史明细账要求。
- [命令](../decision/07-command-state.md)的 clear 依赖本票已确认的 clear 一致性机制（Q13／Q15／Q24），实施由命令／验收票收口；[刷新](../decision/09-refresh-lifecycle.md)保留独立 estimate 的调度责任。

- [展示](../decision/08-presentation.md)确定普通 round_end 保存失败在 UI／headless 的反馈承载；[装配](../decision/10-assembly-layout.md)及[验收](../decision/11-acceptance-cutover.md)采用修订 Q6 的不阻断、丢弃未保存部分／磁盘有效基线初始化及明确接受少量损失，不按旧失败保留内存要求验收、不默增后台重试。

- [装配规格](../decision/10-assembly-layout.md)把 Q7 串行与跨进程协调留在 framework 文件 module；[验收](../decision/11-acceptance-cutover.md)验证同文件 FIFO、失败后继续、不同文件独立及跨进程安全更新，不要求全局 FIFO。

- [观察](../decision/03-observation-contract.md)、[命令](../decision/07-command-state.md)承接消费统计周期拒绝与实际取消／反馈映射；[装配](../decision/10-assembly-layout.md)、[验收](../decision/11-acceptance-cutover.md)采用 Q8 的按记录合并与版本校验、Q9 的等待阶段终止后无迟到写入，不宣称 clear 多文件事务或整操作硬超时已解决。

- [装配规格](../decision/10-assembly-layout.md)承接可配置共享目录的配置与注入；[验收](../decision/11-acceptance-cutover.md)承接跨项目共享、配置生效与旧文件保护；采用 Q17–Q20 的字段局部解析与用户手动备份清空的切换前置；采用 Q21 的固定文件组织；schema／锁及归档唯一标识契约已由 Q24／Q25 确认，实现由装配／验收票承接。

- [装配规格](../decision/10-assembly-layout.md)不得为本范围新增分布式锁／云同步冲突合并；[验收](../decision/11-acceptance-cutover.md)在已声明本地平台／运行基线上证明同机并发，不推定其他 OS 或网络盘已支持。

- [装配规格](../decision/10-assembly-layout.md)把 Q24 协调读-改-发布能力暴露为 framework 公共能力（实现时同步 `framework/docs/framework-capabilities.md`），不把 schema／周期／版本／合并规则放进 framework；[验收](../decision/11-acceptance-cutover.md)验证真实跨进程互斥、锁内重读、原子读、损坏不覆盖、陈旧锁回收且不静默替换存活写入者，以及 Q25 恢复／归档与 Q26 版本冲突。
- [展示](../decision/08-presentation.md)读同一自身聚合；不做请求前读取或定时轮询，不因本能力新增第二种消费来源。

## Invariants

- storageDir 的 ~/→用户 .omp 主目录是 model-cost 字段局部语义，不改变 framework 其他字段路径规则；程序不代替用户自动备份／清空旧统计。

- 会话自身累计是唯一消费聚合源；工具、Round 发布、账户与父子汇总不产生第二笔消费。
- 延续旧 daily-tracker 的本地 JSON 活动／历史分离思路，不要求照搬旧 token 差分／费用增量算法。
- 持久化模型归 extension；framework 的基础文件 module 不认识 holiday、业务计价、本消费统计周期消费累计或最近 Round 持久化 schema，不升级 boolean 激活 State 为业务容器。
- 原生 file-lock 不直接泄漏到 shared logic；安全协调按现有 harness-independent 分层决定。
- clear 不改 framework 活动态，不清已有归档或独立 Codex estimate；账号分区与“其他账号保留”要求取消；本票局部确认不移除其余既定数据寿命。

- framework 文件能力不认识 holiday、消费统计周期、会话版本或最近 Round 业务 schema；schema／合并／归档规则归 model-cost，能力只负责协调、锁与发布。
- 读新鲜度：锁内读取即最新；普通运行不做每请求磁盘读、无定时轮询、无空闲刷新。
- 锁只保证互斥与发布安全；被误回收的存活写入者必须放弃写入而不是覆盖他人已完成更新（对齐 [ADR-0002 shared-file concurrency scope](../../../docs/adr/0002-semantic-extension-framework.md)）。
- 旧统计文档不兼容（地图 Out of scope 已确认）；程序不自动迁移、清空或合并旧数据。

```

## .scratch/model-cost-migration/lighthouse/07-command-state.md

```markdown
# /budget 的参数、操作与状态如何在新框架表达？：Lighthouse

> Question and discussion: [/budget 的参数、操作与状态如何在新框架表达？](../decision/07-command-state.md)
>
> 本轮命令范围已确认并发布（2026-10-12），确认原话与事实边界见[本轮确认来源](../assets/command-confirmation-2026-10-12.md)。源票已 resolved、清理 claim；Backtracer 的存储 Q25 跟进已获用户授权并恢复原题为 open，尚未解决其字段布局。本文件不是生产实现证明。原先仅确认 clear 执行条件的局部结果已合入当前主题。

## Question

如何用 framework 的最小通用 command 能力表达 `/budget detail/holiday/clear`，并明确命令语法、执行完成、状态寿命、适用条件与结果反馈？统计支持范围由[消费归属原权威](02-accounting-ownership.md#账户隔离多会话与额度)持有，整文件归档／重置与协调由[存储原权威](06-local-storage.md)持有，不在本票复制替代 schema。

## Discussion

### 通用命名动作：framework 路由，shared logic 执行

新增一层命名动作的 `actions` command 类型，沿现有 `defineExtension` 的纯数据声明与注入实现分离模式。配置包括 `type: actions`、命令 `name`、可选命令说明及动作名到说明的动作表；另提供命令名／动作名对应的 shared logic 实现。framework 负责注册装配、参数匹配、帮助、路由、等待完成和通用异常报告；adapter 只映射宿主注册与必要公共事实，不解析预算业务。

示例只说明已批准配置形态，不冻结尚未收口的装配参数名：

```ts
commands: [{
  type: "actions",
  name: "budget",
  description: "费用统计与展示管理",
  actions: {
    detail: "切换简略／详细展示",
    holiday: "开启假日计价",
    clear: "归档并重置统计",
  },
}]
```

动作实现表由 shared logic 提供，例如 `budget: { detail: toggleDetail, holiday: enableHoliday, clear: archiveAndReset }`。通用动作不绑定 framework 激活 State；detail／holiday／统计数据仍归业务逻辑，不升级通用业务 State。模式、活动条件、文件更新及结果文案都由 shared logic 管理；不在配置增加 idleOnly、accountScope、persist 或 archive 等业务规则。不借 `directed.unrecognized` 伪装动作。现有 toggle／directed 的语义不由本票改写；不预建多层命令、flags、数字参数或复杂解析器。

### 命令名与路由

沿用 `/budget`，用户理由是 `/cost` 前缀会与许多单词碰撞；不增加 `/cost` 或兼容别名。数字／K／0 修改预算已被取消，不恢复。

framework 对动作参数去首尾空白、忽略大小写，完整匹配单个动作名；`DETAIL` 可识别，`det`、`detail on` 不识别。只允许命名动作，不缩写、不做模糊匹配、不接受额外参数。空参数根据动作表显示帮助，不执行动作；其他未匹配参数报告 error 并显示同一份帮助，不进入 shared logic。无需重复配置 usage、默认动作或 unrecognized handler。

### 完成语义与统一错误／反馈

action 可以直接返回或返回 Promise；framework 统一等待完成，宿主命令调用链必须传递并等待这一结果。所谓“同步操作”是用户得到结果后再继续，不是阻塞文件 I/O；配置不区分 async，不提供 fire-and-forget 或后台 action 模式，保留已确认的安全异步存储 interface。

framework 捕获未处理的同步抛错与 Promise rejection，经既有公共反馈／诊断通道报告一次 error，不自动重试、回滚、写业务状态或发成功通知。extension 不自行打印错误；如果业务必须清理或将底层失败转换为清楚的操作背景，可在 shared logic 做后重新抛出，不先打印再抛造成双报。存储 module 的可判别失败结果仍由业务 action 转换，不强迫其改成异常 interface。成功通知与正常业务提醒由 shared logic 通过公共反馈通道发出。

公共 Extension feedback 补齐 `info / warning / error`，复用 `FeedbackTransport`、adapter 的 `publishNotice` 和现有 handler 异常报告模式，不新建打印系统。有 UI 时映射通知级别，无 UI 时送 stderr；不进入模型上下文。

### detail：只切换入口偏好，不承诺新增展示覆盖

`/budget detail` 每次在 brief／detail 间切换，并反馈当前模式，不增加 brief 或 detail on/off。入口偏好寿命由[数据归属的 detail 主题](12-state-data-contract.md#holiday预算修改与入口-detail)持有：入口内存、普通切会话／tree 保留，重载／重启回 brief，独立入口互不影响，不按会话持久化或子代理继承。

用户 Q19 授权跟随旧实现；已核对旧命令入口无 provider 限制、DeepSeek／Codex／token-only renderer 使用 detailMode，hidden 返回空 widget。因此 detail 动作不检查 provider，也不加 Round／保存门控；hidden 或无 UI 只更新偏好与公共反馈，不强制创建 widget。此选择不承诺所有 provider 都有 usage UI。具体展示布局／headless 行为由[展示票](../decision/08-presentation.md)决定，provider／模型名单由[模型覆盖票](../decision/13-model-catalog-policy.md)决定，不由命令票扩大。

### holiday 与 clear：当前入口适用条件

二者仅在当前 provider 为 DeepSeek 时可执行；clear 的 provider 检查只是适用限制，不再用于选择账号。holiday 保留幂等开启：已开启提示 info，不反转、不新增 off；成功持久化后反馈开启，不追溯已有消费或已锚价请求。其业务寿命由数据权威持有。

当前入口 Round 未结束，或结束后保存处理尚未收口时，holiday／clear 直接拒绝；不建立 pending 操作、不排队、不在未来 round_end 自动执行。既有历史会话只要当前可靠 idle 且没有待完成保存就允许；刚启动可靠 idle 也允许，不要求先发生 round_end。活动未知不默认 idle。

用户选择禁止 Round 中 holiday 是为简化本入口一轮内的切界；这不是整个 Session 生命周期禁止，不限制宿主切会话／模型。检查只针对当前入口，不保证其他 CLI／子代理都 idle，不新增全局活动登记或等待所有实例。每 provider 单账号支持与多个 CLI 正常使用的范围见消费归属权威；跨进程锁／周期／版本校验继续由存储权威持有。

### 业务反馈与 clear 提交结果

| 情况 | 反馈／操作 |
| --- | --- |
| holiday／clear 的当前 provider 不是 DeepSeek | warning 说明仅 DeepSeek 适用，不执行 |
| 当前入口 Round 中或保存未收口 | warning 提示空闲后重试，不执行、不延后 |
| 不能可靠判断活动状态 | error 拒绝，不猜 idle |
| holiday 已开启且条件允许 | info 已开启，不反转 |
| 无有效存储基线，读取／更新／归档失败 | shared logic 将失败转为带操作背景的错误，framework 报告，不猜零覆盖 |
| 操作完成 | 实际持久化提交后，shared logic 经公共通道发 info；detail 是内存操作，切换后反馈 |
| clear 归档已生成、但重置未提交 | 报告“归档已生成，重置未成功”，不假报 clear 成功、不自动补做／恢复 |

整文件归档／重置、有效零消费同流程、未保存消费丢弃、先归档后提交与独立 estimate／旧归档／detail 保护，只消费[存储原权威](06-local-storage.md)；不将 clear 失败套为普通消费保存的成功，也不借内存初始化伪装已提交。

## Decision

framework 新增声明式一层 `actions` 路由与统一等待／异常报告，补齐 warning，shared logic 持有业务效果。沿用 `/budget`；detail 切换入口偏好，holiday／clear 仅 DeepSeek 且当前入口 idle、保存收口时执行，整文件 clear 语义消费原存储权威。

## User stories

1. As a 用户, I want 沿用 /budget 且一条 detail 命令切换, so that 前缀输入方便且少记命令。
2. As a extension 开发者, I want 动作表声明和 shared logic 实现分离, so that 不重复写解析代码、不泄漏原生宿主对象。
3. As a 用户, I want 空参数帮助和非法参数明确拒绝, so that 不因模糊匹配误执行业务。
4. As a 用户, I want action 完成后再返回结果, so that 文件操作没有后台迟到写入或虚假成功。
5. As a 开发者, I want framework 统一承接错误与三个反馈级别, so that extension 不各自打印或重复报告。
6. As a 用户, I want holiday／clear 在本入口工作中直接拒绝而 idle 时可用, so that 不维护一轮内重置／切界或延期队列，也不要求新建会话。
7. As a 用户, I want detail 跟随旧实现而不强迫所有 provider 新增 UI, so that 展示覆盖仍由自己的决策负责。
8. As a 用户, I want 归档成功但重置失败被准确报告, so that 知道当前活动统计没有清零而不误以为 clear 成功。

## Preconditions

- framework 提供当前 provider、可靠 Round／活动事实，shared logic 知道自身保存是否收口；具体 observation／command delivery 接线消费[观察权威](03-observation-contract.md)，由[装配](../decision/10-assembly-layout.md)落实，不把原生 canAcceptInput 单值冒充全部保存状态。
- [存储权威](06-local-storage.md)提供安全异步读改发布和整文件归档／重置；本轮取消账号布局后的 Q25 物理 schema 仍有定点收口问题，未获批字段结构不由命令示例冻结。
- 每 provider 单账号但多 CLI 同机共享的支持前提由[消费归属原权威](02-accounting-ownership.md#账户隔离多会话与额度)持有；当前运行期认证资料由[账户访问权威](04-provider-access.md)持有。
- 此为迁移规划，支持基线不因本轮 OMP／pi 进程探针改变，不实施 pi adapter。

## Postconditions

- [装配票](../decision/10-assembly-layout.md)把同步／异步 action 的完成与错误从公共入口传到宿主，动作实现放 shared logic；复用既有声明、绑定、adapter 注册和公共反馈路径。
- [验收票](../decision/11-acceptance-cutover.md)覆盖合法／非法输入、Promise 完成与失败、三个反馈级别、无 UI 输出、provider／当前入口门控、零消费归档及归档成功重置失败；生产验收尚未执行。
- 展示与模型覆盖消费入口 detail 偏好，不将此票解释为所有 provider 的新 usage UI；无 UI 远端调度仍由展示／刷新票决定。
- 账号统计隔离政策在原权威修订；命令票只链接，物理 schema 缺口已通过用户 Q21 授权恢复存储原题定点重审，不默选候选；命令范围结案不解除装配的未满足存储依赖。

## Invariants

- framework 负责通用路由／等待／错误反馈；业务状态、provider 条件、计价、文件规则留 shared logic，不升级通用 State 或复制原生 handler。
- 延续 `defineExtension` 的纯数据声明与注入实现分离、binding 与 adapter 分工；不借 directed.unrecognized，不默改 toggle／directed 的行为。
- 复用既有 `FeedbackTransport`／`publishNotice` 和 handler 失败报告模式；通知不进入模型上下文，不新增错误打印系统。
- holiday／clear 不取消模型、不伪造 Round 结束、不维护 pending 操作；当前入口 idle 不代表所有进程静止。
- 不恢复数字预算修改，不新增 /cost 别名、多账号管理、默认动作或复杂参数解析；不把调查资产当生产验证。

```

## .scratch/model-cost-migration/lighthouse/12-state-data-contract.md

```markdown
# model-cost 的哪些数据进入 framework State，如何声明与读取？：Lighthouse

> Question and discussion: [model-cost 的哪些数据进入 framework State，如何声明与读取？](../decision/12-state-data-contract.md)
>
> 用户已确认核心草案及历次暂停记录的补充范围，并要求生成正式 Lighthouse。本文件为本票最终决议，已按本次观察票 Q27 的用户确认修订子代理汇总范围；末尾完整票体快照仅作历史溯源，旧提议、暂停状态及未决措辞不覆盖下列最终结果。此决议不表示生产迁移、原生观察或存储已经实现。

## Question

**当前实现起点：以聚合为主，先验证具体极端场景。** 用户已选择参照旧实现的聚合方案作为基础；只有该方案不能满足实际场景时，才讨论是否升级记录粒度，而非默认长期逐 Turn 明细。用户举例 /tree：Session 累计能正常保留即可，对应历史 Turn 累计可能无法取得可以接受。具体持久化介质、写入时机、有限关联范围与历史 Round 视图的正式替代范围仍待具体实现论证，不由此自动取消所有此前功能。先区分逐响应计算／累加、运行期请求关联、持久化逐 Turn 历史三件事；用旧代码与具体场景比较聚合统计、有限记录和完整明细的成本收益，再决定记录粒度／寿命，以及哪些既有需求需要修订。没有确认粒度前，不先固定 TurnRecord schema、通用账本、State 扩展或同步／异步写入策略。

依据[行为契约决议](../lighthouse/01-behavior-contract.md)，哪些数据进入 framework State，哪些是扩展自有业务数据／缓存／派生展示结果？逐项覆盖最新余额、5h／7d 窗口读数与获取时间／加载／错误状态、Turn usage/cost、Round totals、Session totals、预算／detail／holiday 及 quota estimate。仅存内存不等于不属于 State；明确类型、归属、读写接口及恢复／继承语义，不能把当前 boolean activation 字段当业务容器。

当前已决定不升级通用业务 State：model-cost shared logic 拥有业务聚合，framework 激活 State 不充当业务容器，UI 只读同一业务视图。余下问题是最小数据键／字段与查询路径、运行期有限身份及父子关系的保留／恢复，不重新设计完整账本或缺失计数；最新远端读数仅内存、累计／归档／holiday／quota estimate 的既定寿命保留，预算修改已移除、detail 为入口级内存偏好。存储票决定物理格式与保存完成／失败／协调，刷新票决定调度；本票不设计 TTL、不迁移代码。

## Discussion

### 本轮批准修订与来源

业务逻辑键从实际会话 × 账号身份 × 模型改为实际会话 × provider × 模型；整文件 clear 取代账号定点 clear，取消其他账号隔离，不取消正常多进程与请求去重。 批准来源：[命令票本轮确认来源](../assets/command-confirmation-2026-10-12.md)（Q13–Q16、Q17–Q20）。此前账号键／身份分区和定点 clear 的政策仅为已被替代历史；不要求认证秘密落盘。非本轮替代范围继续有效，规划不等于实现。

### 先由具体数据流找到最小能力

用户选择沿旧实现的聚合方案演化：先看数据在哪里、谁读写、何时保存，再讨论接口与等待策略。区分逐响应计算／累加、运行期请求关联、长期逐 Turn 留存；前两者不自动要求第三者。用具体必要场景验证，只有真实缺口无法满足才重新比较更细粒度方案，不把框架完整性或准确性最大化作为默认目标。

用户希望基本感受不到新增延迟。内存读写、历史读取、落盘／锁等待、远端刷新、渲染分别说明，不泛问整个 callback 同步还是异步，不默增后台队列、审计系统或恢复日志。已有决定可以基于代码证据提出修订，但必须确认；不隐去历史修订；按用户要求同步旧 Lighthouse 的当前有效正文并保留修订前快照，不把未结案的接口提议当不可变实现。

### 业务聚合归 shared logic，不升级 framework State

model-cost 的 harness-independent shared logic 拥有计价、聚合、最近 Round、provider 测量缓存和本次统计 tradeoff；framework 的 boolean 激活 State 不充当业务容器。本次不升级通用业务 State，也不建立第二套框架／配置／能力声明。

framework 提供 Round、可观察 Request／Turn、response usage、实际会话、直接父 Session 关系、模型等宿主事实；其公共逻辑／必要原生桥接分层按[观察契约分层决议](03-observation-contract.md)。shared logic 不读 OMP 原生 context／payload；其他 harness 可复用业务逻辑，本次仍只落地 OMP，不实现或认证 pi adapter。HTTP、文件和并发协调按地图既定分层归 framework 通用能力；DeepSeek 计价、Codex header parser、额度估计与具体业务数据格式不因此进入语义 core。

### 最小逻辑数据布局与查询路径

下表确定逻辑归属／寿命，不冻结物理文件 schema、接口签名或数据库选择。

| 数据 | 逻辑键／用途 | 寿命与读取 |
| --- | --- | --- |
| 实际会话自身累计 | 实际会话 × provider × 模型；只含该会话自己发出的响应 token／已算费用 | shared logic 内存更新；按当前消费统计周期发布并恢复；UI 读只读视图 |
| 父子会话关系 | 子实际会话、直接父实际会话；不含用于父 Round 分配的启动标签／归属段 | 随聚合保存；恢复后沿直接父链查询 Session 自身／子代理／整体，不能猜 Owner 或名字层级 |
| 当前／最近 Round | 本实际会话自身的当前归属、最近一轮开始／结束自身累计快照、当前统计位置是否可用 | 当前态内存；最近快照随本会话 round_end 聚合同次保存并覆盖旧轮 |
| 在途请求 | sessionId／turnId 与provider、Round、模型、请求时锚价 | 运行期保存；结束处理完成后释放完整详情 |
| 已处理请求身份 | sessionId + turnId；防止重复结束通知再累计 | 仅内存，保留到本次观察实例销毁；不在 round_end 清空、不按任意 TTL 淘汰、不落盘 |
| 最新 provider 读数 | provider 维度的余额／双窗口、获取时间、加载／请求错误等测量状态 | 仅内存；重启重新获取，不能跨 provider 或跨来源拼接，不识别账号替换 |
| provider 单一范围业务持久数据 | 当前周期聚合／归档、holiday、quota estimate 的既定基线与采纳值 | 不按账号分区；物理布局／发布／协调由存储权威持有，刷新票收口读缓存新鲜度 |
| detail | 交互窗口／CLI 展示实例的偏好 | 仅入口内存；不是账户偏好、会话持久值或子代理继承 State |

本表的逻辑范围按[消费归属原权威的单账号修订](02-accounting-ownership.md#账户隔离多会话与额度)解释：framework 每 provider 单账号，model-cost 不保存账号身份键，不自动隔离替换。认证资料只在运行期使用，由[账户访问权威](04-provider-access.md)提供；本数据权威不复制支持政策。

自身累计是唯一消费聚合源。自身／子代理合计／整体合计是同一事实的不同口径，不是三份消费；UI 不维护第二套权威累计。账户也不能把父含后代汇总和子自身累计再叠加一遍。币种与渠道口径沿用消费归属决议：Codex 美元只作参考，不混入计费渠道消费金额。

### 逐响应计算、Round 批量保存与可接受损失

每个 Turn 按可靠 response usage 及请求开始时锚价计算，在内存累加；framework round_end 触发聚合保存，不改为逐响应落盘，不保留长期逐 Turn 明细。旧实现逐原生 agent_end 发布仅是近似参照，不与新 Round 完全等价；续跑／等待子结果可拉长内存阶段。

强杀／崩溃发生在聚合成功保存前，可以丢失尚在内存的消费；恢复只读取成功保存值，不以当前价格猜补。为此不引入逐 Turn 持久化、崩溃日志或自动补账。正常退出／切换／重载不预建额外独立排空钩子；只有实际宿主路径暴露不能接受的必要缺口，才带证据重新讨论。普通动作都已安全保存并非全部链路已验证的事实。保存是否等待完成、失败如何处理及重置成功条件由存储票决定。

### 有限请求关联与去重

请求开始固定实际归属、模型和计价锚点。结束已累计或按缺失规则跳过后释放详情，仅记住已处理身份；重复同一结束通知不增加消费，同输入的新调用仍使用新身份独立计价。不保留 headers／usage 等完整历史以防重，不增加持久化请求账本；接受长期运行实例的标记数量随已处理请求增长。

缺 usage 已跳过的请求也视为已处理，不借去重标记重新引入补账。恢复不扫描旧 assistant 消息重新入账，旧观察实例回调不得直接进入新实例。可靠 turnId、原生关联、实例销毁／隔离和观察处理排序留观察票；这里未证明宿主已支持全部异常路径。统计更新的内存去重不等于落盘更新已经幂等，发布版本与并发合并留存储票。

### 逐代理自身累计、恢复关系与迟到子消费

每个实际子／孙会话独立累计自身，保存直接父实际 sessionId；父子关系随聚合发布并供恢复沿链查询 Session 自身、子代理与含后代累计。含后代汇总每笔响应只计一次，不从父总数猜子消费，不把 task／orchestration 汇总报告作为第二笔请求。消费归属不是 Owner activation 或 State follow；父 Round 是否结束与子会话后来是否消费不同。

本轮 Q27 的批准修订：子代理消费只归属父 Session，不再分配到父 Round。Round totals 只统计本实际会话自身请求；子代理／含后代汇总只提供 Session 口径。子代理仍有自己的 Turn／Round 与 round_end 保存，不取消其观察、自身统计或跨进程安全保存。旧子之后的新请求、追加消息或唤醒都增加它自己的累计并沿父 Session 链汇总；不改父 Round，不按到达时间或后代 Session 差值猜本轮子消费。

旧政策要求启动父 Round、启动实例身份、同一子会话复用时的消费归属段；新政策取消这些 model-cost 统计要求，也取消父 Round 子消费汇总。以失去父 Round 含子口径为代价，换取稳定直接父 Session 关系与唯一自身聚合，无须处理归属切换、在途切界、迟到子消费回填父轮或协作消息重新认领。关系仍随聚合发布，不增启动即落盘／长期分段记录；物理 parent 字段的相应裁剪由[存储原 schema 主题](06-local-storage.md)持有。

批准来源：用户提出“不再关心subagent归属于哪个round，只关心它们归属于哪个session”，对“Round 展示本实际会话自身的消费；子代理及含后代的汇总只提供 Session 口径，不作父 Round 消费分配”回答“Q27同意”。原话与此前 Q24／Q25 已被替代的讨论见 [本轮确认来源与证据](../assets/observation-pause-evidence-2026-10-11.md)，修订前完整规则见 [本次修订前原文](../assets/observation-revisions-before-pause-2026-10-11.md)。父 Session 汇总修订不削弱正常去重、多会话并发；账号隔离另由本轮单账号修订取消，不与这次父子关系裁剪混为一谈；仍要求实际直接父身份可靠；整文件 clear 前旧在途丢弃仍是既定例外。

### 最近 Round、tree 与恢复展示

只保存最近一轮开始／结束累计快照，以差值取得最近轮统计；覆盖而不追加历史 Round 列表，和聚合同次保存，不新增发布频率。费用快照来自逐响应锚价后的已算费用，不能把 token 差值按结束时价格重算。当前轮内存态仍受未成功落盘损失边界约束。

/tree 后隐藏 Round 数值或明确该位置轮次数据不可用，不把不可用显示成零，不把最近轮冒充历史当前位置轮次；Session 本周期累计不随树导航回滚。实际开新 Round 后恢复当前轮展示，结束后成为最近轮。普通 resume 可明确显示已保存的最近 Round，但不声称它对应当前位置，不建立历史位置索引。

### 缺 usage／价格只提示，不建立补账状态

正常完成有可靠 usage 是正常支持路径的前提，不是全部 provider 已认证的事实。正常成功却缺 usage 时打印／报告提示并跳过，不造 usage 或确认零。失败／取消有可靠 usage 则累计，无 usage 则跳过并接受少计；不维护缺失计数、补账记录或 UI 持续完整性标记，不承诺后来补齐。

有 usage 而缺适用计费价格时仍累计 token，只不追加相应费用，提示但不维护补算记录，不用之后价格重算。Codex 参考费用缺价不影响 token／额度；token-only／hidden 无金额口径不因没有价格报错。已知小计不代表完整 provider 收费；跳过不等于实际免费。

未知、无统计口径、确认零、指标完整性、已知小计继续作为领域知识保留，不因运行时简化从 glossary 删除，也不要求因此实现枚举、计数器或完整 UI 状态模型。

### 账户周期、整文件 clear、归档与 resume

clear 当前入口的执行条件已于 2026-10-11 批准，唯一权威为[命令局部决议](07-command-state.md)。该入口限制不修改本节账户范围或存储的跨进程周期校验。

消费统计周期限定从何时累计，Session／Round 限定统计哪组消费；累计与最近快照限当前活动统计范围，不恢复跨周期 lifetime。取消账号独立周期与身份 namespace；整文件 clear 不重定义 framework Round，周期／版本校验继续防止旧进程提交复活。取消账号键后的物理布局由[存储原 schema 主题](06-local-storage.md)收口，不由本逻辑表冻结。

clear 改为整份消费活动 JSON 归档并重置，不提供会话树或目标账号选择；只取锁内最新已成功保存的完整活动聚合，不收集内存、强制保存或补账。零消费也统一归档并关闭 holiday。不删除已有归档，不清独立 Codex estimate 或入口 detail；具体顺序和失败语义只在[存储权威](06-local-storage.md)持有。取消“保留活动文件中其他账号”保护，因为不再按账号分区。

归档不等旧在途请求，不建立逐 Turn 明细。成功 clear 后，活动范围 clear 前开始却尚未入账的请求之后即使有可靠 usage，也因旧关联失效而丢弃，不重新绑定当前轮、不猜补；接受丢掉这部分统计，不解释为零消费。旧缓存、排队保存或其他实例持有的旧值不得复活被清记录，具体代际／原子机制待定。

仍运行的旧子／孙代理在 clear 后新开始的请求从零正常计价，利用仍可靠可取得的宿主直接父 Session 事实重建业务汇总关系；不是把整个代理永久排除。clear 不取消真实执行、不清 framework Round／活动状态／Owner、不因统计清理让 connect-bot 误报结束。开放 Round 跨 clear 的快照映射及原生支持留观察／展示票，不伪造新轮边缘。

普通 resume 恢复本周期已成功保存的聚合，不每次从零。clear 成功重置后再 resume，活动数据本周期为零或后来已保存新值；旧值只在归档中，不自动合并旧归档、不扫描宿主历史重新计费，不额外维护跨周期 Session lifetime total，不默认新增归档查询命令。归档保留可查记录不等于已实现自动归档 UI。

用户确认最常见为不同 CLI 启动多个 agent；单账号约束不取消多进程／多会话统计与安全更新，也不新增等待其他会话全部 idle 的机制。进程事实证据见[OMP](../assets/omp-session-process-model.md)与[pi](../assets/pi-session-process-model.md)。

旧版事实：旧 widget Total 从宿主 token 按当前／活动费率显示；Accrued 来自共享周期持久化。旧 clear 重置整个共享周期文件，不具备严格多账户 namespace；旧 resume 把已有 token 设基线、cost 为零，不把历史费用按当前价重写。新方案不沿用 Total 的历史重估来冒充实际已锚价累计，详见证据资产。

### holiday、预算修改与入口 detail

holiday 在唯一 DeepSeek 使用范围内共享并跨重启保存，持续到消费 clear 成功；开启与 clear 的当前入口 DeepSeek／Round／保存收口条件由[命令权威](07-command-state.md)持有。有效零消费同样归档／重置并关闭 holiday；不追溯费用，不清独立 Codex estimate 或 detail。其他账号独立 holiday 的旧要求取消，不自动识别账号替换。

移除数字／K／0 修改或重置预算的子功能，不新增预算偏好保存；不因此取消 DeepSeek 450K、Codex 272K 固定预算显示／告警，预算不限制实际模型执行。detail、holiday、clear 保留，不把预算修改移除解释为整个命令票无必要。具体命令名、校验、模式限制留命令票。

detail 是同一交互窗口／CLI 展示实例的内存偏好：普通会话切换和 tree 保留，重载／重启回 brief；独立入口互不影响，不按账户共享、不按会话持久化，不是子代理继承的消费 State。具体入口绑定留装配票。

### 历史决定的替代关系与文档职责

1. 历史 Round／tree 查询、逐 Turn 持久记录和恢复补齐要求明确收窄为聚合、最近快照、tree Round 不可用与已接受的未保存损失；不是无意漏实现。
2. 缺 usage／价格的持久缺失记录、计数、持续完整性标记与补算系统取消；可靠正常响应归属／去重与账户并发要求保留。
3. 数字预算修改取消；固定预算显示／告警保留。
4. 本轮一度确认的树级 clear 已由整文件 clear 替代；不清 holiday 的提议未采纳；本轮再次批准改为整文件 clear，不恢复账号分区。单会话推演不取消多会话支持。
5. Session lifetime total 改为消费统计周期的会话累计；归档不自动恢复。tree 不回滚仍成立，clear 是显式重置例外。
6. 本次观察票 Q27 再次收窄：父 Round 子消费分配及其启动标签／归属段取消，保留直接父 Session 汇总和各实际会话自身 Round；此前嵌入历史只作溯源，不能恢复该已取消范围。

[行为契约决议](01-behavior-contract.md)与[消费归属决议](02-accounting-ownership.md)的当前有效正文已按用户要求同步最新决定，修订前版本完整保存在[历史快照](../assets/contract-history-before-sync.md)，不伪装成从未改变；本数据决议仍是本次布局／寿命取舍的来源。观察票尚未结案的 Round／Turn 契约留其原票，不因本数据票结束视为接口已交付。

[framework glossary](../../../framework/GLOSSARY.md)定义通用概念与父子关系，[model-cost glossary](../../../extensions/model-cost/GLOSSARY.md)定义消费特化与账户周期，[聚合架构 ADR](../../../docs/adr/0004-model-cost-aggregate-accounting.md)解释业务取舍及代价。本 Lighthouse 是本票最终决定，地图只索引，glossary 不承载 schema／锁／清理策略。

## Decision

model-cost shared logic 按请求锚价逐响应内存聚合，以实际会话 × provider × 模型的自身累计为源，保存直接父 Session 关系与本实际会话自身最近 Round 快照，子代理汇总仅 Session 口径，round_end 发布，不升级通用业务 State 或建立历史明细账。累计限于当前消费统计周期，整文件 clear 归档并重置、关闭 holiday；resume 仅读取已保存活动聚合，接受未落盘／缺事实／clear 前在途的统计损失，不重估历史或自动合并归档。

## User stories

1. As a 用户, I want 沿用聚合为主而非完整明细账, so that 保留近似旧实现的复杂度与交互开销。
2. As a 用户, I want 每份响应按请求开始锚价计算, so that 跨模型／峰谷消费不被结束或恢复时价格重解释。
3. As a 用户, I want 逐子代理独立累计并区分自身／子代理／整体, so that 能知道消费来源且嵌套／orchestration 汇总不重复计费。
4. As a 用户, I want 直接父 Session 关系与聚合一起恢复, so that resume 后仍可正确查询含后代 Session 总累计。
5. As a 用户, I want Round 只统计本会话自身、子代理汇总只在 Session 层提供, so that 不必为追加任务、迟到响应和在途切界维护父 Round 分配或消费归属段。
6. As a 用户, I want round_end 批量保存并接受未保存损失, so that 不为崩溃恢复承担逐请求日志和额外排空机制。
7. As a 用户, I want 只保留最近 Round 快照并明确 tree 不可用, so that 最近轮体验保留而不把历史位置或缺失冒充零。
8. As a 用户, I want 正常 resume 恢复已保存本周期统计, so that 重启不会重复收费或按单一当前模型重估历史。
9. As a 用户, I want 整文件 clear 归档后重新累计, so that 能结束整个账户周期且旧累计不因 resume 自动回来。
10. As a 用户, I want clear 前在途响应丢弃、之后新请求正常统计, so that 重置简单且仍运行的子代理不被永久排除。
11. As a 用户, I want holiday 持续到该账户成功 clear, so that 共享手动谷价周期有明确结束操作且不改写旧费用。
12. As a 用户, I want 最新余额／双窗口与持久 estimate 分开, so that 同源测量与独立估计分开且重启可恢复；不承诺账号替换隔离。
13. As a 用户, I want 缺 usage／价格只提示并跳过相应指标, so that 不猜零、不搭补账系统且有 usage 的 token 仍可累计。
14. As a 用户, I want 固定预算显示／告警保留而移除修改入口, so that 简化操作不取消既有上下文提示。
15. As a 用户, I want detail 是入口内存偏好, so that 切会话保留展示选择、重启回 brief 且独立入口互不影响。
16. As a 开发者, I want 业务读写属于 shared logic、UI 只读, so that 不因 renderer 次数产生请求、落盘或第二套累计。
17. As a 开发者, I want framework 只提供宿主无关事实和通用 IO／协调, so that 接入其他 harness 不重写业务也不泄漏 OMP 类型。
18. As a 维护者, I want 从具体数据流倒推最小接口, so that 不在缺少数据／等待心智模型时冻结抽象或扩大范围。
19. As a 维护者, I want 保留领域概念和明确的修订来源, so that 运行时简化不会被误认为零消费或无意遗漏需求。
20. As a 用户, I want 多 CLI／同 provider 正常并发仍正确, so that 单账号简化不导致跨终端丢失或覆盖其他会话。

## Preconditions

- 本决议依赖已确认的[行为契约](01-behavior-contract.md)和[消费归属决议](02-accounting-ownership.md)，并在上述替代范围修订它们。本票的业务选择不以未结案生产接口为证明。
- 落地需[请求／响应与 Round 观测](../decision/03-observation-contract.md)提供可靠 Turn／实际会话／直接父 Session 关系、usage 来源、实例隔离、跨 clear 原生映射及派发处理约束。
- [账户访问决议](04-provider-access.md)提供当前认证资料／地址 seam，身份解释按[消费归属修订](02-accounting-ownership.md#账户隔离多会话与额度)；不生成统计账号身份；provider 未知不猜 DeepSeek。代理选择与配置只在[HTTP 部分权威](05-http-capability.md)。
- [HTTP 能力](../decision/05-http-capability.md)提供通用传输；[存储与协调](../decision/06-local-storage.md)确定 schema／路径、无账号键的活动统计范围与周期、原子发布／归档／reset、锁、保存确认／失败、并发和迟到发布。
- [命令状态](../decision/07-command-state.md)映射保留命令、成功／失败反馈及运行条件；[展示](../decision/08-presentation.md)决定三口径、最近轮／tree、提示与 headless；[刷新](../decision/09-refresh-lifecycle.md)决定 TTL／single-flight、测量新鲜度、来源成对与生命周期。
- [组织与装配](../decision/10-assembly-layout.md)冻结模块、入口实例与注入 seam；[验收与切换](../decision/11-acceptance-cutover.md)按正式基线验证取舍；[模型与价格覆盖](../decision/13-model-catalog-policy.md)确认名单／数据来源，不重解释历史锚价。
- 原统计文件保留、不自动删除或改写；新统计允许从空开始，不要求导入旧基线。本次不实施或认证 pi adapter。

## Postconditions

- 普通消费保存失败的当前取舍及已确认损失范围以[存储局部决议](06-local-storage.md)修订 Q6／Q11 为唯一权威；此处不将正常并发正确性或仅异常退出的旧描述用于否定该显式修订，业务布局与普通 resume 结论不变。

- 后续票可依赖上述业务归属、逻辑键、寿命、恢复／tree／clear／holiday 和入口偏好，无需重问账本还是聚合。
- 存储票可设计聚合＋关系＋最近快照而非历史逐 Turn 账本；物理文件与发布幂等仍需决定，旧缓存不能复活 clear 数据。
- 观察票提供事实与可靠运行期身份，不能反向强制持久账本、补账或猜 usage；不得把旧在途响应误关联为新请求。
- 展示票消费只读业务视图，Session 区分自身／子代理／整体，Round 仅本实际会话自身；最近 Round 不冒充历史当前位置，本周期 Session 与跨周期 lifetime 不混用。
- 命令票保留整文件 clear／归档／结束 holiday、detail；数字预算修改不迁移，独立 Codex estimate、已有归档与 detail 不被误清。
- 刷新／装配／验收票仍 unresolved；本票不冻结它们的接口、无 UI 远端策略、物理 schema、保存等待或所有恢复映射，不宣称新能力已实现。
- 原题与历次已确认／被替代提议均保留溯源，旧 Lighthouse 当前有效正文按用户要求同步，历史快照保留；地图仍只索引具名决议的一行 gist。

## Invariants

- 同一正常有 usage 请求仅累计一次；重发是新身份，工具结果、task 汇总和父子视图不是另一笔消费。
- 请求开始绑定实际归属与模型／锚价，不以当前模型、State Owner、相同内容或到达时间替代身份；单 session 执行者与正常多进程协调要求不取消；账号隔离已按本轮确认取消。
- 自身累计不含子代理；祖先 Session 汇总每份响应一次。Round 只统计本实际会话自身，不提供父 Round 子消费分配，也不用后代 Session 总差值代替。
- tree／切换／普通恢复不撤销已发生的本周期消费；成功整文件 clear 是显式重置例外，归档不自动并回活动聚合。
- 缺事实不等于确认零；计费／额度／无统计口径保持领域区别，运行时不维护完整性计数或补算状态。Codex 美元参考不入计费金额总计。
- Round 生命周期事实与统计周期／发布完成分离；clear 不取消执行、不清 framework 活动、不让 connect-bot 面板误报结束。
- renderer 只读，不发 API／建 timer／落盘／更新权威业务值；对齐[现有 framework 配置机制与 native import 责任](../../../docs/adr/0002-semantic-extension-framework.md)，不建立第二套配置或框架，不偷渡 OMP 原生锁到 shared logic。
- 旧 turn-cost 的请求锚价原则与 daily-tracker 的聚合／锁内协调是具体参照，不声称其旧 agent_end、共享文件或 Total 重估就是新契约；新同步／异步选择必须展示真实操作路径。
- framework glossary 定义通用词，model-cost glossary 定义消费词，ADR 解释取舍；词存在不强迫实现枚举或恢复系统。本决议只规划，事实资产不等于生产认证。

## Evidence and verification boundaries

- [旧聚合粒度调查](../assets/old-accounting-granularity-smoke.md)：真实旧纯计价函数的跨峰谷和有限状态验证，不含远端账单／文件并发。
- [tree 聚合探针](../assets/omp-tree-aggregate-smoke.md)：tree／恢复位置与累计的证据，不等于全部真实 TUI 恢复路径已验证。
- [旧等待／刷新行为](../assets/old-observer-waiting-smoke.md)：旧等待影响调查，不批准新的 handler／发布调度。
- [OMP 请求观测链路](../assets/omp-request-observation-smoke.md)与[OMP 子代理归属](../assets/omp-subagent-round-findings.md)：固定基线的原生事实证据，不是新 framework 接口已经交付。
- [旧 clear／resume smoke](../assets/old-clear-resume-smoke.md)：实际旧 tracker、临时文件归档、价格显示；隔离 home、锁为串行 test seam，不是完整 RPC／UI／并发／账单认证。
- 本次正式文档发布未进行生产迁移、真实账单、账户并发或完整 UI 验收。既有支持基线保持 18.5.0，不能用本机安装版本替代。

## Historical ticket body

以下完整保留生成时的票体，含历次暂停交接与历史提议。为避免移动目录后把原相对链接解释成新的权威链接，原文置于代码块；可点击的原始来源在文首。最终结果以上述 Discussion／Decision 为准，不以快照中的 claimed、待确认或过时提议覆盖本决议。

~~~~~~~~markdown
# model-cost 的哪些数据进入 framework State，如何声明与读取？

Type: grilling
Status: claimed
Assignee: hugos (本会话 agent 协助讨论)
Blocked by: 01, 02
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## 当前有效决策与思考方向（新对话优先读取）

本节记录本票已确认的方向与未决边界，整票未结案，不是最终 lighthouse。历史 Handoff 不得被当作禁止重新检验实现取舍的前提。

1. **以聚合为主为实现起点**：参考旧实现，先验证具体场景；只有发现必要场景无法满足，才比较有限记录或更细粒度方案，不默认建立完整逐 Turn 明细账。
2. **区分三件事**：逐响应计价／累加、运行期请求关联、长期逐 Turn 留存。前两项不自动要求第三项；代码验证的是具体能力，不以概念一致性代替实现证据。
3. **tree 的优先级已确认**：切换历史位置后 Session 已发生累计保持正常；用户可以接受对应历史 Turn 累计不可取得。不可用不冒充零。此局部取舍不自动取消所有当前 Round、子代理、账户统计或其他原有功能；旧 UI Turn、新 Turn、历史 Round 正式规格差异需准确说明。
4. **代码／数据流先于接口选择**：先展示数据在哪里、谁读写、何时保存，分开内存读写、持久化／锁等待、远端刷新与渲染，再决定具体操作同步／异步。不从“框架应该完整”反推业务数据结构，框架只按选定实现缺少的最小能力扩展。
5. **保留旧体验与现有功能的基线**：用户希望基本感受不到新增延迟；真实代价和能力缺口出现时明确讨论取舍，不默删需求，也不默增后台队列、完整审计／恢复系统。
6. **前面决定允许基于代码重新评估**：[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)及[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)保留作为历史／讨论输入；请求记录粒度与相关接口需要与聚合实现核对，必要修订再确认。历史 lighthouse 不改写，不把未结案接口提议当不可变架构。

7. **逐 Turn 内存累计、round_end 触发落盘**：用户明确选择类似旧方案的聚合节奏：每个 Turn 按实际 response usage 和请求时锚价计算，运行期在内存累加，framework round_end 时触发持久化聚合；用户认为该方案足够。不采用本轮提出的逐响应持久化更新目标，不要求长期逐 Turn 明细。旧实现逐原生 agent_end 发布只是近似参照，并不与新 Round 边界完全等价。异常退出损失及无独立排空钩子的取舍已由下列决定收口；保存完成／失败与正常请求有限去重机制尚待明确，缺 usage 不保留补账记录的规则见后文。

8. **接受异常退出的未落盘损失**：用户确认强杀／崩溃发生在 round_end 聚合成功保存之前时，可以丢失尚在内存中的消费累计；重启只恢复已成功落盘的累计，不保证恢复丢失费用，不用当前价格猜补。为此不引入逐 Turn 持久化或崩溃恢复日志。正常离开不增加独立保存钩子的后续决定见下文；落盘失败策略仍待存储票确认，其他正常请求去重、归属与账户并发要求不变。

9. **不增加独立生命周期保存钩子**：用户确认正常退出／切换／重载不预建额外排空机制，以 round_end 统一触发聚合落盘；只有实际宿主路径出现不能接受的必要缺口才重新讨论。round_end 保存是否等待完成及失败处理留存储票，不以本决定承诺全部正常宿主路径已验证。

10. **子代理独立累计**：用户确认 Q4；每个实际子会话独立累计自身 token／费用，保留父子启动关系，含后代消费按关系聚合，不从父 Round 合计猜子代理消费、不把任务汇总报告再次入账。此选择不要求长期逐 Turn 明细或历史 Round 列表。

11. **仅保留最近 Round 的开始／结束累计值**：用户明确决定不保存历史 Round 数据；保留最近一轮开始／结束的累计快照以求差值，不建立历史 Round 列表或历史逐 Turn 明细。该限制不取消 Session／账户累计、逐子代理聚合、账户归档或额度估计持久化；/tree 不恢复任意历史 Round 统计，Session 累计不回滚。最近快照随 round_end 保存及当前／最近轮次展示已由下列决定收口。费用快照必须来自逐响应锚价计算后的费用累计，不能将 token 差值按结束时价格重算。此为对历史消费归属决议中历史 Round 查询要求的明确修订，最终 lighthouse 交代替代范围，不改写旧 lighthouse。

12. **最近 Round 快照随 round_end 一起持久化**：用户确认 Q5，认为是近乎免费的优化；每个实际 Session 随同一次 round_end 聚合保存最近一轮开始／结束累计快照，覆盖旧轮而不追加历史列表。重启可读取最后一次成功保存的最近轮次快照，不增加落盘频率、独立保存钩子或逐 Turn 明细；在途新轮尚未保存的内容仍受已接受异常退出损失边界约束。具体聚合字段与读取路径仍待收口；展示切换及不维护缺失完整性状态的后续决定见下文。

13. **tree 导航使当前位置 Round 展示失效**：用户确认修订 Q6；/tree 导航后隐藏 Round 数值或标记“该位置轮次数据不可用”，不将已保存最近轮次冒充当前历史位置统计，不把不可用显示成零。Session 累计不回滚；实际开启新 Round 后恢复新轮的累计展示。最近轮次快照仍保留，不增加历史定位索引或历史 Round 存储。恢复读取的最近轮次若展示必须明确为“最近一轮”，不能未经可靠关联当作当前位置这一轮；恢复快照明确称为最近 Round 的后续决定见下文。该决定替代原 Q6 对所有位置无条件显示最近轮次的提议，原 Q6 未整体获批。

14. **恢复快照明确显示为最近 Round**：用户确认 Q7，认为“最近 Round”是准确描述；恢复会话后若有成功保存的快照可显示最近 Round，不声称是当前位置轮次。/tree 导航后 Round 数值仍按已确认规则不可用；实际开启新轮显示当前 Round 累计，结束后成为新的最近 Round。展示称谓与统计寿命分开，不增加历史位置索引。

15. **旧轮子代理迟到消费不污染当前 Round**：用户确认 Q8；迟到消费继续计入实际子会话、正确账户及主会话含后代总累计，不按到达时间计入当前 Round。若启动它的旧 Round 已被最近快照替换，不恢复该历史轮次或重开生命周期；当前 Round 含后代消费须按启动关系筛选，不能直接用包含所有后代的 Session 总累计求差。迟到更新的持久化时机留存储票，未批准额外保存触发。

16. **UI 需区分主会话自身与子代理消费**：用户要求在 UI 体现主会话自身消耗与子代理消耗的区别，并确认主会话自身／子代理合计／整体合计三个统计口径；示例布局及默认逐子展开未因此获批。数据按实际发起会话分别累计，主会话自身不含子代理；子代理汇总含后代时每笔响应只计一次，主会话含后代总累计为这些自身消费的无重复汇总。展示布局及是否默认逐子展开由展示票承接，本票不实施 UI，也不宣称现有 framework 已交付逐子代理观察能力。

17. **业务聚合属于 model-cost shared logic，不升级为通用业务 State**：用户明确选择将聚合、最近 Round 快照及本次针对统计特性作出的 tradeoff 放在 model-cost shared logic，不作为通用 framework 能力；Round、读取 response／usage 等宿主事实由 harness-independent 接口提供，adapter 映射宿主。接入其他 harness 时复用同一业务逻辑，不重写计价／聚合／最近轮次规则。既有 boolean 激活 State 继续承担激活职责，不充当业务容器；HTTP／文件及并发协调继续受地图既定三层归属约束，具体接口另票收口。本次不实现或认证 pi adapter。shared logic 不直接读取 OMP 原生 context／payload，UI 读取其只读业务视图，不建立第二套权威累计。

18. **不维护缺 usage 计数或补账记录，异常只打印提示**：用户确认修订 Q10：“可以，不需要记录计数，显示打印提示即可”。正常完成且有可用 usage 为支持范围内的正常路径前提，不是所有 provider 已认证的事实；正常成功却缺 usage 时报告／打印提示并跳过该份统计，不伪造 usage／零消费、不维护缺失计数或补账记录、不承诺以后补齐。失败／取消有可靠 usage 则累计，无 usage 则跳过并接受少计。UI 累计代表已取得用量的统计，不持续维护 usage 完整性标记。此修订收窄旧消费归属决议的缺 usage 持久记录／可靠补齐义务；并不取消正常有 usage 请求的归属与去重、旧轮子代理后续实际消费的正确归属、计费／额度／无统计口径区分。缺价格规则由下一项决定收口。提示的具体承载方式交展示／观察票，不擅自升级为阻断请求或弹窗。

19. **缺价格只影响对应费用指标，打印提示不保留补算状态**：用户确认 Q11；计费请求有 usage 但缺适用价格时仍累计 token，不追加费用、不猜价格，打印提示，不维护缺失计数或事后补算记录。Codex 参考费用缺价格不影响 token／额度功能，token-only／hidden 无统计口径不因没有价格报错。用户要求“未知／无统计口径”等已梳理概念继续作为文档领域知识，用于分析 extension 简化方案的边界，不因代码不实现对应状态而从文档删除；术语含义与本次运行时实现承诺须明确区分，业务术语与公共 framework 术语按现有多上下文 glossary 归属记录。

20. **通用概念归 framework glossary，具体架构取舍归 ADR**：用户要求框架记录 grilling 定义出的通用设计概念，extension 的 tradeoff 用 ADR 而非 glossary 承载。已在[framework glossary](../../../framework/GLOSSARY.md#facts-and-measurement-semantics)记录未知、无统计口径、确认零、指标完整性、已知小计；model-cost glossary 保留消费领域特化并引用公共定义。[model-cost 聚合架构 ADR](../../../docs/adr/0004-model-cost-aggregate-accounting.md)记录已确认局部选择与理由，不代替本票的最终 lighthouse，不把尚未确认接口当作既定实现。Glossary 解释是什么，ADR 解释为何选择及接受什么代价，概念不强制产生运行时枚举／计数／补账机制。

21. **移除修改预算功能，detail 仅内存**：用户明确修剪需求：“不再需要修改预算功能，detail状态只记内存，可以接受”。不再迁移数字／K／0 参数修改或重置 DeepSeek 自定义预算，不新增预算偏好持久化；既有上下文预算显示／告警及 DeepSeek 450K、Codex 272K 的固定基线不因移除修改入口而自动取消。detail 保留运行期内存状态，重载／重启恢复默认 brief，入口级 detail 作用域由下一项决定收口。/budget 名下 detail／holiday／clear 仍为保留功能，修改预算这个子功能的移除不等于整张命令票已无必要；后续命令名称与参数校验由命令票收口。该需求修订须由最终 lighthouse 交代，旧行为决议不改写。

22. **detail 为交互入口级内存偏好**：用户确认 Q13；同一个交互窗口／CLI 的展示实例内，普通会话切换与 /tree 保留 detail，重载／重启恢复 brief；其他独立交互入口不受影响，不按账户共享，不按每个会话持久化偏好，也不是子代理继承的消费业务状态。具体 harness 展示实例如何绑定由装配票收口。

23. **自身累计是唯一消费聚合源**：用户确认 Q14；以实际会话 × 账户 × 模型组织自身 token／费用累计，父子启动关系提供自身／子代理／整体汇总依据，UI 只读派生业务视图，不持有另一套权威累计。请求关联暂存、当前／最近 Round 快照、账户状态与入口 detail 分开；不将子代理消费复制为父会话自身消费，不把父含后代汇总和子自身累计重复加入账户。此为逻辑布局，不决定物理文件 schema、保存等待／锁／失败策略或请求关联清理寿命，不新增逐 Turn 持久化。

24. **请求详情与去重标记分离，仅运行期保留**：用户接受 Q15；在途请求保存实际归属、模型与计价锚点，结束处理完成（累计或按缺失规则跳过）后释放完整详情，仅保留 sessionId + turnId 的已处理标记至本次观察实例销毁，不在 round_end 清空，不持久化、不按任意 TTL 淘汰。缺 usage 已跳过请求也视为已处理，不借此恢复补账机制；新调用使用独立身份。接受长运行实例的标记数量随请求增长。恢复仅读取已保存聚合，不扫描历史 assistant 消息重新收费；旧实例回调不得直接进入新实例，可靠 turnId 建立与实例隔离机制交观察票验证／收口。本决定不取消迟到子会话的新响应消费归原启动关系，也不决定存储发布幂等。

25. **父子启动关系随聚合保存并供恢复汇总**：用户接受 Q16，并强调这是沿袭此前设计，不是新增业务范围；保存子实际会话、直接父实际会话、启动父 Round 及区分启动实例所需关联身份，恢复后沿直接父链汇总已保存的自身累计，不猜 Owner／名称层级。不保存历史 Round／Turn 明细；父 Round 身份仅为归属标签。关系沿既定 round_end 聚合发布，不新增启动即落盘钩子；原子保存、读取组织与迟到发布时机交存储票。同一子会话若被复用到不同启动，不覆盖旧归属，具体分段按原生证据收口。

26. **clear 以当前主会话树为统计重置范围（已由 Q21 账户级范围替代）**：用户确认修订 Q17；清除当前主会话及全部子／孙会话的 model-cost 消费累计、Round 统计、业务父子关联与在途请求关联，不波及其他独立主会话。clear 前开始但未处理入账的请求之后即使返回可靠 usage，也因旧关联失效而丢弃，不重新绑定当前轮或猜补；此为主动放弃消费统计，不代表实际零费用。它明确修订 clear 范围内 Session 累计保留及旧请求迟到入账要求，不改变 tree／普通切换不回滚的规则。清理仅针对业务统计，不取消真实执行、不清 framework 生命周期／活动状态／Owner。原 Q17 跨周期 Session 累计保留方案未采纳。既有归档与 Codex estimate 不随本决定删除；是否为本次 clear 生成归档及 holiday 操作边界仍需收口。存储票须防旧缓存或排队保存复活已清记录，具体版本／原子机制未定。

27. **clear 后旧子代理的新请求正常统计**：用户确认 Q18；仍在执行的旧子／孙代理，clear 前开始的请求结束丢弃，clear 后新开始的请求从零正常计价／累计。根据 framework 仍可可靠取得的真实父子启动关系重建业务汇总关系，不恢复 clear 前消费、不永久排除旧子代理、不将原启动父 Round 冒充到达时当前 Round；新委派也正常建立关系。原生支持与 clear 跨越开放 Round 时的快照映射交观察／展示契约收口，不伪造 Round 生命周期边缘。

28. **clear 归档是保留需求，作用域重新评估中**：用户确认 Q19，强调归档本来就是需求；clear 前保存已取得的聚合，不等待旧在途请求或建立逐 Turn 明细。用户随后要求重新界定 clear 的当前会话／账户作用域及 resume 行为；Q20 不清 holiday 的建议未获批准。Q17 的已确认树级范围保留为待复审输入，未默改为账户级；不存在其他运行会话目前是讨论假设，不等于已删除多会话支持要求。旧版事实与实际隔离 smoke 见[旧 clear／resume 调查](../assets/old-clear-resume-smoke.md)：旧 Total 当前费率重估与周期落盘累计不是同一口径，旧 resume 不按当前价将历史费用重新落盘。

29. **仅保留账户级 clear，归档后重置活动周期**：用户确认 Q21，认为会话级 clear 意义不大；以目标账户为清理范围，归档其全部会话的活动聚合后重置，不再提供仅当前会话树的 clear。此范围替代 Q17，不影响其他账户，不删除已有归档或 Codex estimate；Q18 的旧在途请求丢弃／新请求正常统计原则应用到被清账户的消费，其他账户的关联不能顺带删除。当前讨论假设执行时只有一个开启 DeepSeek 的会话，不将此假设自动改为多会话支持取消或已验证的运行限制。账户归属、父子混用账户、旧缓存发布隔离与 clear 完成／失败由账户访问及存储票细化；Q20 holiday 仍未获新确认。clear 后 resume 是否在正常展示中读取旧归档累计，是下一待决问题；普通 resume 恢复活动聚合，不以当前模型价格重算宿主历史。

30. **resume 只恢复本账户周期的活动累计，旧消费查归档**：用户确认 Q22，不在普通恢复中自动合并旧归档或按宿主历史 token 重算；不额外维护跨周期 Session lifetime total，不默认新增归档查询命令。Session 累计指实际会话在适用账户当前统计周期内、跨该会话各 Round 的消费；Round 累计指该周期内归属于某一个 Round 的消费，不是该会话整个周期累计。两者均受目标账户上次 clear 边界限制，不把账户周期改成 framework Round 定义；父子及不同账户仍分别按其可靠归属聚合。clear 前在途请求丢弃、后续新请求正常统计继续沿既定规则；开放 Round 跨 clear 的具体快照映射仍待观察处理收口，不伪造新生命周期。已同步 model-cost glossary 的账户统计周期与 Session／Round 累计词义，具体清理／归档策略仍由决策票及 ADR 承载。

31. **holiday 持续到该账户成功 clear 为止**：用户确认 Q23；沿用账户共享、跨重启的 holiday，目标账户成功 clear 时同时关闭，后续请求恢复正常峰谷锚价；无消费可归档时也能通过 clear 结束 holiday。不影响其他账户，不追溯重算归档，不清 Codex estimate 或入口 detail；clear 前在途请求按既定丢弃规则处理。此决定替代未获批准的 Q20 不清 holiday 建议。归档／重置／关闭 holiday 的一致性、失败与反馈交存储／命令票，不默认操作必成功。

## 新对话交接

- **当前正在本票收口。** 本票仍 claimed，由 hugos（本会话 agent 协助）认领，已确认到 Q23；准备 Lighthouse 草案供用户确认，确认并写文档前不得 resolved。不恢复观察票旧 Q10、不新建重复数据票。
- **最新进度**：上方当前有效决定是唯一恢复基线，已确认到 Q18：clear 重置当前主会话及全部后代的统计，不波及其他独立主会话；clear 前在途请求丢弃，仍运行的子代理在 clear 后新请求正常统计并重建真实关系。自身累计、运行期去重寿命与父子关系保存沿用 Q14–Q16。本票仍 claimed。Q19 归档需求与 Q21 账户级 clear 已确认，账户级范围替代 Q17 的会话树级范围，不提供会话级 clear；Q22 已确认 resume 仅恢复本账户周期累计，clear 前旧消费只在归档中查阅，不维护跨周期 Session 总数；Session 跨本周期各 Round，Round 仅该轮，两者不混同。Q23 已确认 holiday 持续到目标账户成功 clear，无消费时也可 clear 关闭；Q20 不清 holiday 建议未采纳。现准备 Lighthouse 草案确认，未 resolved。先读旧 clear／resume 调查资产，不把 UI Total 重估当落盘补账，不把普通 resume 当默认从零；物理 schema、可靠身份与实例隔离实现仍交各对应票。不重问聚合还是账本、逐 Turn 还是逐 Round 落盘、是否允许异常退出未落盘损失、是否保存历史轮次、/tree 展示、子代理是否独立累计、通用 State、缺失 usage／价格计数或预算修改；这些已作明确取舍。历史 Comments 中未采用提案与旧暂停入口只供溯源。
- **下一步不是继续扩展边界状态，而是把选定方案变成最小数据布局／读写草图**：先列明 shared logic 的运行态（实际会话累计、当前请求锚点／关联、父子启动关系、当前／最近轮快照、账户读数缓存、入口 detail）与持久化聚合的字段归属。区分已确认字段寿命与候选物理 schema，不把候选图当作新决定。逐响应计算／内存累计与 round_end 发布分开；UI 只读业务视图，不持有另一套权威。
- **已定逻辑布局与后续交接**：实际会话 × 账户 × 模型自身累计为源，父子启动关系持久化供恢复汇总；在途详情结束处理后释放，已处理身份仅内存保留至观察实例销毁；当前／最近 Round 与账户当前周期视图分开。最新余额／双窗口读数按账户仅内存，holiday 与 quota estimate 按账户持久化，clear 归档／重置目标账户并关闭 holiday，detail 为入口内存。物理 schema、锁／原子保存／失败、账户身份取得、原生关联／清理实例隔离、刷新与展示分别交既有存储、账户访问、观察、刷新及展示票；这些不冒充已实施，也不反向重新要求完整账本。
- **用一条具体正常数据流检验草图**：主会话两份响应、一次子代理委派分别累计，Round 结束保存最近快照与累计，恢复只读已保存聚合；/tree 仅使 Round 展示不可用、Session 不回滚。确有必要缺口时才提出取舍，不先为所有假设场景搭恢复系统。取消／缺 usage 的跳过规则不重问；同账户多会话正确性仍是必要要求。
- **后续顺序不变**：本票数据归属／寿命／查询收口 → [存储与协调](06-local-storage.md) → [观察处理约束](03-observation-contract.md)，随后刷新、展示与装配按依赖推进。保存等待／失败、原子发布、跨进程锁、迟到子消费发布时机属于存储票；不要重新泛问整个 callback 同步／异步。普通正常离开不预建额外保存钩子。
- **文档分工**：[framework glossary](../../../framework/GLOSSARY.md#facts-and-measurement-semantics)定义通用概念，[model-cost glossary](../../../extensions/model-cost/GLOSSARY.md)定义业务特化，[聚合架构 ADR](../../../docs/adr/0004-model-cost-aggregate-accounting.md)记录已确认局部 tradeoff。ADR 不表示整票结案，也不是最终 lighthouse。旧 lighthouse 不改写；最终本票 lighthouse 须交代历史查询、缺失记录／补齐与预算修改的修订范围。
- **证据与验证边界**：[旧聚合粒度](../assets/old-accounting-granularity-smoke.md)、[tree 聚合探针](../assets/omp-tree-aggregate-smoke.md)、[请求观测链路](../assets/omp-request-observation-smoke.md)、[子代理归属](../assets/omp-subagent-round-findings.md)、[旧等待／刷新行为](../assets/old-observer-waiting-smoke.md)是既有事实资产，不是新 shared logic／framework 接口已实现的证明。本次只讨论、修改文档及运行文档链接检查；无生产迁移、远端账单认证或新增完整恢复／并发验收。
- 整票完成时才确认 lighthouse 草案、写文档、resolved，再执行 backtracer；此次暂停不走结案程序，地图 Decisions so far 不追加未结案票。

## Discussion approach

- 用户进一步要求从旧实现演化出的取舍重新评估“按 Turn 记录”是否值得。此前需求与局部决定是 review 输入，不是不能挑战的实现前提；正式替代仍需明确确认和 lighthouse，历史决议保留。先以最低必要记录粒度比较方案，不预设全面逐 Turn 持久化。
- 用户要求修正原先“先冻结观察接口、再决定数据／存储”的讨论顺序。本票先以旧实现的实际数据结构与读写调用链建立心智模型，再比较具体新数据布局；不要求用户在看不到数据放在哪里／谁读写的情况下选择同步／异步。
- 先走通一条可观察 Request：开始固定身份／锚价、完成取得 usage、Turn／Round／Session 视图读取、账户统计持久化。逐步标出哪些操作只是内存读写，哪些读取文件、等待锁、发布文档或请求远端；再讨论取消／重发和恢复。
- [请求观测讨论](03-observation-contract.md)已确认的需求与[OMP 原生请求链路证据](../assets/omp-request-observation-smoke.md)为输入事实，不要求整票已结案才能建数据模型。公开载荷、State 接口和具体同步／异步实现若需修订，带原因返回相应票获用户确认，不默改已确认决定。
- 可先用具体数据布局／伪代码／隔离数据流探针解释候选实现，不交付生产迁移，也不先造新 State 抽象。装配的草图前移作为讨论材料，最终组织／装配规格仍留原票收口。
- 数据归属、寿命与查询方式明确后，[存储协调决策](06-local-storage.md)决定介质与写入／恢复机制；之后再回[观察契约](03-observation-contract.md)决定处理约束。刷新调度不在观察票抢先冻结。

## Question

**当前实现起点：以聚合为主，先验证具体极端场景。** 用户已选择参照旧实现的聚合方案作为基础；只有该方案不能满足实际场景时，才讨论是否升级记录粒度，而非默认长期逐 Turn 明细。用户举例 /tree：Session 累计能正常保留即可，对应历史 Turn 累计可能无法取得可以接受。具体持久化介质、写入时机、有限关联范围与历史 Round 视图的正式替代范围仍待具体实现论证，不由此自动取消所有此前功能。先区分逐响应计算／累加、运行期请求关联、持久化逐 Turn 历史三件事；用旧代码与具体场景比较聚合统计、有限记录和完整明细的成本收益，再决定记录粒度／寿命，以及哪些既有需求需要修订。没有确认粒度前，不先固定 TurnRecord schema、通用账本、State 扩展或同步／异步写入策略。

依据[行为契约决议](../lighthouse/01-behavior-contract.md)，哪些数据进入 framework State，哪些是扩展自有业务数据／缓存／派生展示结果？逐项覆盖最新余额、5h／7d 窗口读数与获取时间／加载／错误状态、Turn usage/cost、Round totals、Session totals、预算／detail／holiday 及 quota estimate。仅存内存不等于不属于 State；明确类型、归属、读写接口及恢复／继承语义，不能把当前 boolean activation 字段当业务容器。

当前已决定不升级通用业务 State：model-cost shared logic 拥有业务聚合，framework 激活 State 不充当业务容器，UI 只读同一业务视图。余下问题是最小数据键／字段与查询路径、运行期有限身份及父子关系的保留／恢复，不重新设计完整账本或缺失计数；最新远端读数仅内存、累计／归档／holiday／quota estimate 的既定寿命保留，预算修改已移除、detail 为入口级内存偏好。存储票决定物理格式与保存完成／失败／协调，刷新票决定调度；本票不设计 TTL、不迁移代码。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：上下文、账户、消费三个维度正交；Owner activation／State 继承不能作为消费归属。源消费记录与当前统计视图区别明确，tree 只选择 Round 视图而不回滚 Session。
- 待决定：请求／逐代理记录、父子关系、账户聚合、选定 Round、自身／含后代汇总及查询入口，哪些是业务事实、持久化数据、State 当前值或派生结果？原始未知不能被汇总零覆盖，未知／额度消费／无统计口径可同时表达，token 与金额完整性分别声明。
- 当前账户余额／窗口缓存与请求绑定身份分开；最新读数仅内存，estimate 按账户持久化。当前模型不应改变历史记录或消除异构子代理信息；不把全部历史账本无论规模都塞进 activation State.

## Comments

### Q17 修订提议：clear 作为统计重置边界（待确认）

- 用户为简化提出：clear 清除当前父／子／孙统计记录和在途请求关联；之后旧请求找不到对应身份则直接丢弃，不再按旧锚点累计。用户尚未确认精确作用域、是否保留既有归档、Codex estimate 及其他独立主会话的影响，不把提议视为正式取代所有历史累计约束。
- 此提议针对 model-cost 业务记录；不等于取消真实请求／子代理或清空 framework 的 Round、活动状态、Owner／宿主事实。观察票需保证旧请求结束不会因缺关联被重新绑定当前轮，clear 后新请求与新委派仍可建立可靠归属。
- Q17 原“Session 累计与账户周期贡献分离”建议未获批准；先明确用户提出的重置边界，再决定是否还需要分段聚合。不提前批准会话累计永不受 clear 影响。
- framework glossary 已有 Parent agent／Owner／State inheritance；本次补齐通用的子代理启动关系与会话祖先链，定义不承载统计删除、持久化字段或 clear 策略。


### 恢复讨论：聚合数据流与恢复缺口（2026-10-09）

- 沿观察票与地图最新交接认领本票；观察票仍受本票及存储票阻塞，不恢复旧 Q10 同步／异步提问。
- 重新核对旧 daily-tracker 的 DailySession／DailyData、ensureSession／recordTurnCost，以及 index 的 onInit／请求／响应／结束处理：运行期费用累加器仅内存，旧原生 agent_end 取出后在锁内重读共享文档，追加费用并以已保存 session token 基线计增量；onInit 清空累加器，不从 token 反算未保存的历史锚价费用。
- 本次 Bun 直接运行旧 turn-cost／cost-calc 纯函数：100 万峰价 input 得到 chargedBeforeSettlement=9，freshRuntimeCost=0，initFinishTurnReturns=9，afterInit=0。证明内存重建／清空不能恢复未保存费用；没有运行实际宿主重启、文件发布或账户并发，不作为持久化实现认证。未创建探针文件。
- 待讨论候选（未批准）：按 session／账户／模型保存 token、已算费用和完整性聚合检查点；当前 Turn 锚点与当前 Round 累加留在运行期，正常恢复读取已保存聚合，fork 新会话从零开始，tree 不回滚。在途关联、迟到补齐与有限去重仍待具体场景验证，不假定这些可一并丢弃。介质／写入调度留存储票。
- 下一问题聚焦保存目标：已取得 usage 并完成计价的响应是否应成为可恢复聚合的最小更新单位，而不是等 Round 结束。响应后／发布前崩溃仍是未决窗口，不将“每响应更新”写成绝不丢失保证；写入等待、合并与原子性尚未批准。

### 首要取舍重审：逐 Turn 留存是否值得（2026-10-09）

- 用户指出此前设计主要从“框架怎么设计”出发，未充分检验旧代码演化中的复杂度取舍；尤其应综合评估是否为准确性引入逐 Turn 记录。此为重审要求，不是已批准取消全部请求身份、历史查询、补账或并发正确性。
- 已将记录粒度设为本票第一问题；不预设长期逐 Turn 明细账。区分逐响应计价、运行期关联和持久化留存，再逐场景验证最小必要数据。
- 事实资产：[旧计价累加与逐 Turn 留存粒度调查](../assets/old-accounting-granularity-smoke.md)。直接运行旧计价函数：两份峰／谷请求费用 9+4.5=13.5 元，无逐 Turn 历史留存；按谷价重算合计则为 9 元。证明这个准确性场景不需要长期明细，不证明全部异常／恢复需求可由旧方案满足。
- 候选范围为聚合为主、聚合加有限关联／索引、完整逐 Turn 明细；收益与复杂度按真实场景比较，不立刻要求用户选择数据 schema 或同步／异步读写。历史已结案决定保留，实际替代须明确确认后记录 lighthouse；本票仍 claimed，未 resolved.

### 用户选择聚合为主及 tree 场景验证（2026-10-09）

- 用户确认以旧实现“聚合为主”为基础，先验证极端场景，不能适配时再取舍是否升级；按照具体实现所需最小能力扩展 framework，不从框架完整性反推业务结构。
- 用户明确 /tree 场景的优先级：Session 累计正常即可，可能获取不到历史 Turn 累计可接受。不将这一让步自动扩大到所有 Round／Session／账户数据取消；旧 UI Turn、新 Turn 与历史 Round 的正式规格修订需精确描述。
- 运行证据：[OMP tree 切换与 Session 聚合累计探针](../assets/omp-tree-aggregate-smoke.md)。真实 18.5.0 导航到历史响应使可见 assistant 数从 2 变 1，宿主 Session tokens 保持 60；从该位置继续请求后为 120。只保留标量聚合、调用旧锚价／计价函数的金额也保持不变并增加新消费，无 extension Turn 明细。不是新 framework／持久化账户账本已实现。
- 下一步按实际场景检查恢复、fork、在途／取消、多会话同账户等，每次先找最小实现的具体缺口，不要求一次性建立完整审计账本。框架能力从实现读写链倒推；存储介质与同步／异步仍未冻结。本票继续 claimed。

### 本次暂停与新对话交接（2026-10-09）

- 用户要求保存当前对话的决策和思考方向，在新对话继续。已整理前部“当前有效决策与思考方向”和“新对话交接”，明确聚合实现起点、tree 让步、实际代码证据、未决项与禁止重问的抽象异步选择。
- 释放本票认领为 open、Assignee 清空；整票未解决，不作 lighthouse／backtracer 结案，不重写旧决议，也不将请求记录重审解释为所有相关功能已取消。
- 下次明确恢复本票，先认领，再展示具体聚合状态／保存路径并验证恢复场景；不要机械按编号回到尚有未满足前置的观察票。

### 用户确认按 Round 批量落盘（2026-10-09）

- 用户明确认为旧方案可近似理解为 Round 前内存累计、结束落盘，并选择新框架每 Turn 按实际 response 计算、round_end 触发落盘，认为此方案足够。已记录为当前有效方向；逐响应持久化的建议不采纳。
- 精确差异保留：旧 handler 对每个原生 agent_end 发布且不检查 willContinue；新方案使用已确认的 framework Round，自动续跑／等待子结果可能拉长内存累计阶段。
- 此轮尚未将该选择扩大为用户已确认所有崩溃损失、切换清空或写入失败策略；随后用户明确接受下述异常退出边界。保持无生产实现、无最终 lighthouse、未 resolved。

### 用户确认异常退出损失边界（2026-10-09）

- 用户回答“接受”：强杀／崩溃时尚未成功落盘的 Round 内存消费可以丢失；恢复只读取已成功保存累计，不按当前价格猜补，不为此增加逐 Turn 持久化或崩溃恢复日志。
- 曾建议正常退出／切换／重载前额外排空；用户指出正常动作通常发生在 round_end 之后，质疑是否值得增加复杂度。助手撤回额外排空建议，用户回答“接受”，确认不预建独立生命周期保存钩子，以 round_end 统一触发保存为基线；只有实际宿主路径暴露不能接受的必要缺口才重新提出取舍。正常动作都在 round_end 后的判断尚不是全部宿主路径已验证的事实；落盘触发不等于已成功保存，写入完成／失败语义仍留存储票。

### 用户确认逐子代理聚合与最近 Round 快照（2026-10-09）

- 用户回答“Q4 可以，子代理单独累计”，明确逐子代理自身消费统计，不靠父 Round 合计近似。依据已有子身份／直接父关系／启动关联调查，不宣称现有 framework 已实现。
- 用户决定“可以只记录最近一round的开始结束值，不需要保存历史数据”。确认不保存历史 Round 列表，最近一轮用开始／结束累计差值表达；Session／账户累计与逐代理统计保留，不将“没有历史数据”扩大为删除账户归档或 quota estimate。
- 用户随后确认“可以，随 round_end 一起保存，这是一个近乎免费的优化”：最近 Round 开始／结束累计快照与累计同次持久化，仅覆盖最近轮次，不新增发布频率。已记录为当前有效决定。
- 原 Q6 提议新 Round 开始后切换至当前轮累计；用户指出 /tree 后无条件展示最后一轮会误导。修订 Q6 为 /tree 后隐藏 Round 数值或明确不可用，Session 累计不回滚，实际开新轮后恢复展示；用户回答“可以”。已记录为当前有效决定，不将原 Q6 的所有细节当作获批。
- 用户追问正常 resume 是否保证位于最近一轮。固定 OMP 18.5.0 session-manager 源码：rebuild 按物理 entries 重建 leaf，branchWithSummary 在选定历史节点下追加导航条目；恢复最新物理条目不等于最近模型活动位置。
- 本次 Bun 实际调用固定基线 SessionManager.open + MemorySessionStorage，两个合成无崩溃会话文档：普通文档 leaf=latest、branch=[old,latest]；追加历史位置 branch_summary 后 leaf=navigation、branch=[old,navigation]，不包含 latest。断言通过。验证真实会话加载器／内存存储，不是 /tree RPC/TUI 或新 model-cost 恢复链路；无磁盘探针文件、无远端模型。
- 因此“排除错误退出”仍不足以证明恢复位置对应最后消费轮次。此时 Q7 的恢复展示规则尚未获批准；若要求自动确认可讨论最近轮结束位置标识的单条关联，不能预先添加历史位置索引。整票仍 claimed，尚不执行结案 lighthouse／backtracer。

### 用户确认最近 Round 的恢复描述（2026-10-09）

- 本对话用户回答“可以，最近round是准确的描述”，确认恢复后已保存快照明确描述为最近 Round，不声称对应当前位置。实际开新轮显示当前累计，结束后成为最近 Round；/tree 后仍按已确认规则不可用。该决定不否认上述恢复位置调查事实，也不要求追加位置索引。
- 已追加当前有效决定；此前“Q7 未获批准”仅作为确认前历史，不能覆盖本次用户确认。当时整票仍 claimed，未执行最终 lighthouse／backtracer。

### 本次暂停：确认入口级 detail 并保存新对话交接

- 用户确认 Q13 入口级 detail 偏好，并要求记录当前决策与思考方向后在新对话继续。本票当前有效决定已更新，交接段替换为本次实际进度，清除旧的已解决问题仍“待确认”的措辞；历史讨论保留。
- 新对话先恢复本票并认领，从最小数据布局／读写草图和有限关联机制继续，不回观察票旧 Q10、不重问已确认聚合取舍，也不开始生产实现。框架通用概念、业务 glossary、聚合 ADR 与证据资产均有链接。
- 同步地图恢复指针、命令票预算裁剪／detail 作用域及存储票的最新数据交接。整票未结案，释放为 open、清空 Assignee；不生成最终 lighthouse、不设置 resolved、不追加地图 Decisions so far、不执行 backtracer。

~~~~~~~~

```

## .scratch/model-cost-migration/decision/06-local-storage.md

```markdown
# framework 如何提供独立存储、原子更新与跨进程协调？

Type: grilling
Status: claimed
Outcome: [存储组织与唯一消费源局部决议](../lighthouse/06-local-storage.md)
Assignee: hugos（本会话 agent 协助讨论）
Blocked by: 01, 02, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Handoff

- 状态：用户在命令票本轮 Q21 回答“可以”，授权仅对 Q25 的无账号键物理布局定点重审；本票现为 open、未认领。原已结案的其他存储决定保持，当前唯一权威为 [存储组织与安全更新局部决议](../lighthouse/06-local-storage.md)；详细规则只在 Lighthouse，本交接只留导航、理由与证据限制。
- 本轮确认：Q23 取最简——不做请求前读取，跨进程 clear 由保存时周期校验（Q8）发现并按失败重初始化（Q6），最多丢一轮未保存消费；Q24 framework 通用文件能力 = 单一异步入口 + 规范化路径协调键 + 进程内 FIFO + 锁文件跨进程互斥 + 15s 预算 + 锁内重读 + 同目录临时文件 rename 原子发布 + 损坏不覆盖 + 陈旧锁回收（被误回收的存活写入者校验锁所有权并放弃覆盖）；原 Q25 的 accounts／providerAccountId 布局已被本轮单账号修订取消，替代布局尚未确定；独立 UUID 归档命名保留；Q26 同会话多执行者不引入租约，靠 saveVersion + Q8 旧版本不覆盖 + Q12 同版本冲突 + Q6 重初始化收口。
- 已定基线（不重问）：消费原 Lighthouse 的当前 Q5–Q24／Q26；单账号、不识别统计身份、整文件 clear 与零消费统一归档已由命令会话批准，不恢复旧账号隔离／定点 clear。安全异步更新、跨进程锁／15s／锁内重读／周期版本、失败策略、固定文件组织与本机本地文件系统范围保留。
- 拒绝／替代：请求前读取候选（含读失败、空闲刷新、读／clear 交错、开放 Round 跨周期快照设计）与同会话租约／心跳均未采纳，理由是最简单实现与已接受的少量损失；Q6／Q11 旧保留内存政策仍以 Lighthouse 当前正文为准，历史仅在下方 Comments。
- 证据限制：[exact 18.5.0 请求观测探针](../assets/omp-request-observation-smoke.md)与旧存储只读探针不证明新 framework 文件能力已实现；真实跨进程锁、崩溃／原子读、陈旧锁回收与路径别名验收由装配／验收票承担。
- 下一 ready 问题：取消 accounts／providerAccountId 后，如何用最小消费活动 JSON 表达 provider／模型口径、periodId／holiday／sessions 及完整归档／reset？先给一份普通 DeepSeek＋Codex 消费数据流／具体 JSON 再 grill；扁平或 provider 分桶均为候选，不擅自采用。本次仅恢复该问题，不重问账号政策、文件协调或异常系统。
- 恢复来源：[命令确认原话](../assets/command-confirmation-2026-10-12.md#q21-定点重审授权)、[Backtracer 缺口与处置](../assets/command-trace-2026-10-12.md)。本次没有认领或处理此票；下一会话先认领，再读取原 Lighthouse Q25 与当前逻辑数据，不消费下方历史“schema 已冻结”来恢复旧账号键。

## Question

**本轮仅重审原 Q25：无账号身份键的消费活动 JSON 物理布局。** framework 每 provider 单账号、统计不识别账号／Key、整份 consumption.json 归档和重置已经批准；不在这里重新选择这些政策。确认 provider／模型记录的位置、periodId／holiday／sessions 的最小层级，以及完整消费 reset 的表示，使恢复、最近 Round、直接父 Session 汇总与旧周期提交拒绝继续使用同一数据源。

schemaVersion、会话 saveVersion／own／recentRound／parent 的已定必要语义和 UUID 归档保留；原 accounts／providerAccountId 不再是可用候选。具体结构尚未批准，不由命令动作配置推断。其余路径、文件组织、IO／锁／等待／取消／失败／损坏不覆盖／协调平台与同会话执行者政策按原 Lighthouse 当前主题保持，不重新开泛化问题树。

原 Question 与发布前 Handoff 见[定点重审前快照](../assets/storage-ticket-before-command-reopen-2026-10-12.md)，探索历史仍在下方 Comments 和原权威历史中；当前授权只恢复上述具体失效部分，不是全票重设计或生产实施。

## Discussion approach

以既定数据记录与读写路径为前提，先看实际组织及调用方式，再决定操作级等待、锁与恢复；保持规划模式，不泛问整个 callback 同步／异步，不预建正常离开的额外保存钩子。

## Comments

### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？（Q23–Q26 收口）

#### Intent gaps
- 无新增无主缺口。Q23–Q26 收口读新鲜度、framework 文件能力与锁、consumption.json schema／归档、同会话多执行者策略；Q23 取简后读失败／空闲刷新／读-clear 交错等不再展开，混账户父子与迟到子发布仍归账户／观察票。装配／验收由 Postconditions 承接实现与真实跨进程／崩溃／原子读验证，无新票。
- Q24 的“不静默替换他人已完成更新”由锁所有权校验约束对齐 [ADR-0002 shared-file concurrency scope](../../../docs/adr/0002-semantic-extension-framework.md)；这是对已批准 Q24 的既有 ADR 约束补全，不是新政策。

#### Layer gaps
- 无新增无主前置。framework 文件能力缺实现（`framework/docs/framework-capabilities.md` 目前只有 config 只读）由装配／验收票承担；账户身份格式由账户访问票 04 提供，Q25 以不透明 id 解耦；observation 细节由观察票 03 承担，本票不代决。

#### Layer violations
- 无新增。协调／锁／原子发布留在 framework，schema／周期／版本／合并／归档留在 model-cost，原生 file-lock 不进入 shared logic。

#### Peer asymmetry
- 无新增。framework 文件能力为通用能力，model-cost 为首个消费者；其他 extension 可自行选择，不强制迁移，符合既有“扩展可以复用同一基础能力采用不同数据结构”的决定。

#### Conflicts
- 无剩余相反现行政策。ADR-0002 已要求协调读-改-发布与读端安全原子发布、最新磁盘值在协调范围内读取；Q24 与之对齐。地图 Out of scope 已确认旧统计不兼容，是 ADR-0002 通用兼容要求对 model-cost 的具名豁免，不改写其他 extension 政策。
- Q23 与 [Lighthouse 12](../lighthouse/12-state-data-contract.md) “读缓存新鲜度留存储票”一致：现决定为锁内读最新 + 无每请求读。

#### Gap follow-up
- 无剩余无主 follow-up，不新增票、不解除其他依赖。本票 resolved 后，[观察契约](03-observation-contract.md) 与 [/budget 命令](07-command-state.md) 的前置 06 已满足，成为 frontier；[装配](10-assembly-layout.md) 仍受未结案票约束。

### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？（本次暂停）

#### Intent gaps
- 无新增无主缺口。已确认 Q16–Q22 的共享可配置根、手动切换、固定文件布局与同机并发由装配／验收当前 Handoff 覆盖；账户 clear／holiday 与独立 estimate 分别仍归命令／刷新，未取消正常多会话安全、账户隔离或原有业务能力。

#### Layer gaps
- 地图、十三张决策票实际状态／当前问题／交接及四份现行 Lighthouse 已读取。请求前源事实、原生异步 handler 映射归观察票；真实账户与模型价格归账户／模型票；本地读新鲜度、锁、协调键、schema、单执行者与跨周期运行态归存储及具名前置；只读 UI 与空闲刷新后果归展示／刷新票。既有未决票是责任位置，不是能力已实现；无新增无主前置。

#### Layer violations
- 无新增。field-local ~/ 是 model-cost 配置约定，不改 framework 其他路径字段；文件协调／非阻塞 IO 归 framework，schema／周期／计价与失败取舍归 extension，宿主派发归 adapter；本暂停不设计第二套配置或生产账本。

#### Peer asymmetry
- 无新增。消费活动／归档与独立 estimate 保留，clear 不误清其他账户／归档／estimate；其他 extension 不被绑到 model-cost schema、故障取舍或局部 ~ 语义。

#### Conflicts
- 本暂停无新用户选择，现有 Lighthouse 和地图结果索引保持已确认 Q22 的范围，不写新的 Lighthouse 决议。Q23 每请求前读最新消费文件、等待时机与代价仍是未回答推荐，不因暂停批准。已有 Q14 无基线暂停不能自动扩展成新请求前读取失败政策。
- 旧源码目录探针与 checkout await handler 源码只提供各自事实；exact 18.5.0 观测证据不认证新 IO 性能或公开异步接口。读取／clear 交错、空闲展示／查询与开放 Round 跨周期仍由源票及观察／展示责任票收口，不能凭 Q23 候选绕过它们。
- 早期新 toolkit 根、标准 home-~ 候选、文件名未定、网络盘支持未定与旧失败保留内存只作历史；现行 Q16–Q22 及存储 Lighthouse 不重开。本次未产生需要改消费者现行结论或处分既有票的新冲突。

#### Gap follow-up
- 无剩余无主 follow-up、代理任务或待新票批次，不新增票、不解除整体依赖、不改变其他会话认领。装配／验收现行 Handoff 已覆盖已确认结果，不重复追加恢复点。
- 唯一恢复点：先核对本票状态、当前 Handoff 与相关现行 Lighthouse，认领后续聊尚未回答 Q23。不能将每请求读取或相应开销／失败政策当已批准；保存后释放本票 claim，整票仍未 resolved。


### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？（本地协调范围）

#### Intent gaps
- 无新增无主缺口。同机多终端正常并发可靠／低复杂度由装配和验收现有范围承接，已在其唯一当前 Handoff 合并 Q22；不把不保证跨机器写入误作取消同机并发。

#### Layer gaps
- 地图、十三票与四份现行 Lighthouse 已读取。具体本地文件锁、规范化路径／协调键、读新鲜度／跨 clear 新请求、单执行者仍由存储及观察／账户前置承担，验证条件由验收收口；覆盖位置不是能力已完成。无新增无主前置。

#### Layer violations
- 无新增。framework 通用本地协调不拥有 model-cost schema／周期；请求前宿主派发映射归观察票，不从本轮源码 await 事实冻结其公开 interface。

#### Peer asymmetry
- 无新增。其他 extension 可复用通用本地文件能力，不绑定消费保存规则或字段局部 ~ 语义；独立 estimate 保留。

#### Conflicts
- Q22 从未决运行条件收口为本机本地文件系统；现有消费归属多进程支持继续有效，不存在已批准跨机器协调的相反义务。地图 Out of scope 记录跨机器网络盘／云同步共同写入保证及分布式机制，无需处分任何既有票，未删除其正常并发前置。
- 支持 baseline 与当前 checkout 源码证据分开；不凭源码 await 推定 exact install 新读取路径或其他 OS 已验证。Q23 请求前读取方案仍为候选，不将其写为 Lighthouse 决议。

#### Gap follow-up
- 无剩余无主批次，不增票、不解除依赖，消费者实际状态／claim 保持。下一轮 Q23 读新鲜度；其后读失败、空闲展示／查询、跨周期快照、路径别名／锁／schema 仍未决，不重开复杂恢复树。


### Q22 已确认：本机本地文件系统

用户明确同意 Q22。最终范围见[存储局部决议](../lighthouse/06-local-storage.md)：本机本地磁盘同目录多进程安全共享，不承诺网络盘／云同步跨机器共同写入，不新增分布式协调。已有 Windows x64／Bun 基线保留，不宣称其他平台已认证。本次未实施锁或生产 IO。

### 下一轮读取候选与证据限制

- Q23 候选：每次可观察请求开始异步读最新 consumption.json 的当前账户周期／holiday，再固定请求身份与价格，renderer 不读盘、不做定时轮询；同周期保留本实例未保存累计，检测换周期按既定 clear 边界丢弃旧未保存消费，不将旧请求重新绑定新周期。该读取机制／等待开销尚未批准；新的读失败策略与空闲展示新鲜度待后续，不默套 Q14。
- 原生事实：已有[请求观测探针](../assets/omp-request-observation-smoke.md)在隔离 18.5.0 观察到 before_provider_request；本轮本地 OMP checkout 的 ExtensionRunner.emitBeforeProviderRequest 源码逐个 await handler，但这不是 exact install 的新 IO 时延或 framework 异步契约验证。正式请求前派发／异步 handler 映射仍归观察票，不把源码可 await 当性能证明。


### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？（固定文件组织）

#### Intent gaps
- 无新增无主缺口。单根配置／固定文件组织由装配票覆盖，消费 clear 不清独立 estimate／已有归档由命令及验收覆盖；已合并装配／验收当前 Handoff，与源 Lighthouse 链接一致。

#### Layer gaps
- 地图、十三票及四份现行 Lighthouse 已加载；固定消费／估计／归档文件是本票输出，账户事实、父子事实与估计业务分别由账户／观察／刷新票提供。schema／唯一归档标识具体生成／锁／读新鲜度／跨周期接续仍在本票，覆盖不代表实现已完成；无无主前置。

#### Layer violations
- 无新增。文件名与业务 schema 归 model-cost，framework 提供通用协调与安全发布，不增加通用 Session 账本。

#### Peer asymmetry
- 无新增。旧活动／归档分离与独立 estimate 保留，多账户活动文件更名 consumption.json 不删功能，不要求其他 extension 跟随该布局。

#### Conflicts
- 原“文件组织／名称未决”被用户 Q21 的明确同意替代，源 Lighthouse 当前正文、源票 Question／Handoff、地图与装配／验收当前交接已同步。旧 deepseek-cost.json 仅是历史文件名，不要求兼容；用户手动备份清空前置不变。
- 归档文件存在不代表 clear 成功，Q13 失败备份不自动恢复／合并仍有效；不将固定布局当多文件事务或锁已批准。

#### Gap follow-up
- 无剩余无主批次，不增票、不解除依赖，不改变消费者状态或 claim。下一 ready 问题是 Q22 本机本地文件系统的协调运行条件；候选未获批准，现有 Windows x64／Bun 1.4.2 支持声明不是网络盘／其他 OS 文件协调认证。


### Q21 已确认：固定文件组织

用户对 consumption.json、独立 codex-usage-estimate.json 与 archives/<本次归档唯一标识>.json 的完整提议回答“同意”。只配置根目录、固定内部文件名，不另配三个路径；活动文件更名因覆盖多账户／多模型，不另建累计源。JSON 字段、版本、归档标识与锁机制尚未决定。唯一规则来源：[存储局部决议 Q21](../lighthouse/06-local-storage.md)。没有创建业务文件或修改正式配置。


### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？（路径与手动切换）

#### Intent gaps
- 无新增无主缺口。复用旧目录／手动备份清空／重启与可配置共享由装配、验收现有范围承担；已合并其当前 Handoff，不增票。

#### Layer gaps
- 十三票与四份现行 Lighthouse、地图已读取。用户 .omp 根的字段局部解析由本票规格与装配提供，不把现成 resolveDeclaredFile 当已实现该语义；切换动作归验收。文件名／schema／锁／读新鲜度／单执行者／跨周期与混账户关系／迟到发布仍由既有票承担，未决不是能力已完成。

#### Layer violations
- 无新增。model-cost 配置入口处理字段例外，framework 通用文件协调接收解析后路径，adapter 仍拥有宿主事实，不全局改变 ~ 或绑定其他 extension。

#### Peer asymmetry
- 无新增。沿旧共享活动／归档／独立 estimate 组织，保留其他 extension 路径语义。

#### Conflicts
- 已确认 old→new：原不复用旧目录候选／地址未定被复用用户 .omp/cost-archive 替代；手动备份清空是用户动作，程序仍不自动清理／兼容。Q20 对“~/ 指用户 .omp 主目录、仅此字段、绝对路径直接使用、修改重启”的解释明确同意，非程序安装目录。源 Lighthouse 当前正文、map gist、源票 Question／Handoff 与装配／验收当前交接已同步；早期候选保留历史。
- 无剩余相反已批准政策。旧统计保护仍指程序不得自动改写旧格式／删除，不禁止用户在切换时手动备份清空；加载互斥、回退及实际备份未执行由验收收口。

#### Gap follow-up
- 无剩余无主批次，不增票、不解除依赖、不改变消费者状态或认领；接续 Q21 文件组织，平台与实际协调证据仍未决定。本票保持 claimed，非结案。


### Q17–Q20 已确认：复用旧目录，~/ 特指用户 .omp 主目录

用户手动备份清空后复用旧统计目录；最后明确同意 storageDir: "~/cost-archive" → 用户主目录/.omp/cost-archive，局部语义仅此字段、绝对路径直接使用、修改后重启，其他 Q18 约定保持。最终规则唯一来源：[存储局部决议](../lighthouse/06-local-storage.md)。早期新 toolkit 目录候选及“地址未定”恢复点仅为历史。没有清空目录、修改正式配置或交付生产路径解析。


### Q16 已确认：共享目录且可配置

- 用户原话：“同意共享目录，另外目录地址请参考旧的extension，我需要文件目录可由配置指定”。已记录[存储局部决议 Q16](../lighthouse/06-local-storage.md#q16用户级共享目录目录由配置指定)；不把此前候选地址当最终确认。
- 旧源码 archiveDirectory 写死 ~/.omp/cost-archive，目录没有配置参数；只读 Bun 探针实际返回旧用户目录及 deepseek-cost.json／codex-usage-estimate.json 路径，没有创建目录或读写统计。现有 connect-bot 的 config.yaml 与 framework 配置读取为参考，不能假定现成配置路径解析支持 ~ 或数据路径语义。
- 下一候选（未批准）：配置 storageDir，示例 ~/.my-agent-toolkit/cost-archive；一个根覆盖活动／归档／estimate，相对路径按扩展配置文件所在目录解析、支持 ~/ 主目录、启动读取不热切换。地址与细节交下一轮，不执行生产修改。

### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？（共享可配置目录）

#### Intent gaps
- 无新增无主缺口。跨项目账户共享与选择文件位置由装配规格的配置／注入及验收票的正式配置／并发／旧文件保护范围覆盖；未决机制仍在本票，不将现有配置能力当数据路径实现。

#### Layer gaps
- 地图、十三票及四份现行 Lighthouse 已读取；源事实仍由观察／账户票提供，物理根／路径解析／协调键由本票，配置装配由装配票，验收由验收票承担。无新增前置票；整体依赖不解除。

#### Layer violations
- 无新增。业务目录选择／文件 schema 留 extension，通用路径与安全文件协调归 framework；不把 OMP .omp 地址作为通用宿主事实，不建立第二套配置体系。

#### Peer asymmetry
- 无新增。参考旧活动／归档／estimate 同根组织；仍保留独立 estimate，不默认其他 extension 必须使用相同业务目录。

#### Conflicts
- 旧实现硬编码目录与新可配置要求是确认的演化，不是旧配置已存在。共享范围已批准，但具体地址未批准；旧 .omp/cost-archive 不得被新统计覆盖，重用旧地址不是自动获批结论。

#### Gap follow-up
- 没有剩余无主批次，不新增重复票。已在 Lighthouse Postconditions 记录装配／验收责任与来源；地址、配置解析、不同配置指向不同根的隔离及协调键仍由本票后续收口。仅记录规划，本票仍 claimed。


### 历史暂停记录：从 Q16 存储目录与共享范围恢复（当前以 Handoff 为准）

- 暂停原因：用户要求暂停 grilling，下一次在新对话继续。本次不结案、不实施、不替用户回答未决问题；此交接优先于下方所有旧恢复点。
- 当前确认结果唯一权威：[存储组织与安全更新局部决议](../lighthouse/06-local-storage.md)（本轮 Q6–Q15）；[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)、[消费归属决议](../lighthouse/02-accounting-ownership.md)、[行为契约决议](../lighthouse/01-behavior-contract.md)仍约束正常统计。已修订输入／失败条款见原 Lighthouse 当前正文与来源指针，不以旧评论恢复旧要求。
- 本轮重点：普通保存失败已由“保留未保存内存”改为“丢弃未保存部分，从磁盘有效完整快照初始化”；无有效基线则暂停本实例消费统计／保存至下一次正常会话初始化，不阻断模型或自动停用独立余额／额度。clear 仅归档锁内最新已保存活动数据，先归档再提交活动重置，失败终止，不收集进程内存、不强制排空／补账；允许未落盘消费（包括已完成响应）丢失。详规只在上述 Lighthouse，不在本交接重建第二份权威。
- 用户理由／背景：极端故障不值得复杂恢复，愿接受少量消费丢失；clear 尤其要求简单。此前主要单 DeepSeek 账户／少多账户的背景保留，但不取消正常多会话／跨进程安全更新、去重、其他账户隔离或独立 estimate。
- 已替代／未采纳：Q6／Q11 旧保留内存与不回滚政策已明确修订，原文留本票历史；不做复杂自动重试／修复／补账／后台恢复、跨进程内存收集或强制排空；不因少计取舍取消 framework 通用安全发布。不重问 Q5 的提前提交＋handler 返回前 join、唯一聚合／最近轮或完整明细账。只有真实需求／证据和用户确认才带理由讨论修订，不自行恢复旧候选。

#### Q16 尚未回答：新持久化路径与跨项目共享范围

- 最后一轮的 agent 推荐是 `~/.my-agent-toolkit/data/model-cost/`，同一操作系统用户的不同项目／终端共享同一存储，内部按真实账户／实际会话隔离，活动 JSON／归档／estimate 分开；不读改删旧 `~/.omp/cost-archive/`，不绑定 OMP 专属目录或仓库。备选为每项目存储，但会拆开同账户累计和 clear 范围。用户在回答前要求暂停，路径、共享范围、文件名和配置／覆盖方式都未确认，没有创建目录。
- 调查：framework/core/config.ts 的 resolveDeclaredFile 只解决配置文件相对声明 baseDir 的解析，不能当现成数据根。framework 文件清单／路径字面检索未见已定义通用持久化根；旧目录事实见[旧存储现状](../assets/current-state.md#存储现状)。Bun 路径算式探针只把用户目录下候选路径算成绝对路径，未创建目录、未改配置、未验证生产读写。
- 其他调查与限制：本票已有纯 Promise FIFO 探针证明基础顺序／失败后继续／不同键独立／清理，以及失败初始化算式探针（120→丢弃未保存 10→新消费 5 得 125）。它们不是原生 handler／实际文件／跨进程／平台锁／性能验证；旧费用重复提交算式不是正常路径必然双计证据。证据与历史索引在本票旧 Comments 及[现状调查](../assets/current-state.md)，按具体歧义再 zoom，不重复探索已定取舍。

#### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？（本次暂停）

##### Intent gaps
- 无新增无主缺口。唯一自身聚合／恢复／最近轮由数据、观察、展示、验收承接；本轮失败丢弃与无基线暂停由观察／展示／装配／验收承接，独立余额／额度继续由刷新票覆盖；简化 clear／已保存输入由命令、装配、验收承接。原票已保存相应交接，不重建重复票。

##### Layer gaps
- 已读取地图、十三张子票实际状态／问题／交接和四份当前 Lighthouse，补读本票末尾现行 Question／依赖。路径／锁／平台／schema／interface、读缓存新鲜度／跨进程周期可见性／单执行者／混账户关系／迟到子发布都仍由本票及已具名前置承担；这些未决票是归属位置，不是能力已完成。无新增无主前置。

##### Layer violations
- 无新增。消费 schema／失败丢弃／clear／暂停归 extension shared logic；底层非阻塞 IO／串行／锁／原子发布归 framework，宿主事实归 adapter，不增加通用业务账本或后台恢复。

##### Peer asymmetry
- 无新增。独立 estimate 保持、不随 clear 删除；其他 extension 可采用自己的业务模型，不因本次故障取舍被绑到 model-cost 的保存政策。

##### Conflicts
- 本暂停没有新的用户选择。Q6／Q11 旧失败保留内存政策、clear 旧“全部已知／已取得”输入已在原 Lighthouse 当前正文同步新批准范围，源票历史保留；消费者观察／展示／命令／刷新／装配／验收已有交接。不要从历史提议复活被替代承诺。
- Q16 的 `~/.my-agent-toolkit/data/model-cost/` 与用户级跨项目共享仍仅为提议，不在 Lighthouse／地图 Decisions 中；目录没有创建，配置没有改变。pause 不表示认可这一路径，也不表示 clear 可任意牺牲正常并发正确性。
- 尚未满足的正常 clear 后新请求周期接入、同 Session 单执行者、关系保留等已在本票／观察／账户／命令／验收记录；不因简单失败政策自行取消，不在暂停中追加采访或生产实现。

##### Gap follow-up / 最终交接
- 无剩余无主 follow-up 或需新票的批次，不新增重复票、不解除整体依赖、不改变其他会话认领。既有 Lighthouse 与地图 gist 保留，无暂停新决定。
- 最终恢复点：新对话先核对状态与最新交接，按 tracker 认领后继续 Q16 的新目录／用户级跨项目共享范围；Q16 未回答。之后再按答案推进正常存储路径／协调契约，不重问 Q6–Q15 已定取舍或复杂 clear 恢复分支。
- 本次交接与追踪写入完成后释放本票 claim（Status: open，Assignee 清空）；整票未 resolved，地图仍规划中，无生产迁移。

#### 新对话恢复顺序

1. 读取地图、本节与当前相关 Lighthouse，比较介入结果／认领状态；先按 tracker 认领本票，再继续讨论。
2. 只继续 Q16 的目录与共享范围，不把候选路径当已批准；之后依答案收口文件命名／必要路径覆盖、平台与锁／协调键、具体 schema／interface。
3. 尚待本票的正常路径问题包括读缓存新鲜度、跨进程 clear 后新请求如何取得新周期、同 Session 单执行者与版本、混账户父子关系保留、迟到子消费发布。保持简单实现取向，不重开复杂 clear 故障恢复树；若输入属于其他票，交给该票而非在本 claim 下代决。
4. 本轮没有新的暂停时选择，Lighthouse 与地图 gist 保持现有确认范围；暂停 trace 完成后保存最终追踪结果，再将本票 open／清空 Assignee。

### Q15 已确认：clear 只归档已保存数据，转向正常存储路径

- 用户明确同意 Q15，并要求 clear 尽量简单、不考虑很多边界恢复。当前结果唯一权威为[存储局部决议](../lighthouse/06-local-storage.md)：仅归档锁内最新已成功保存的活动聚合，不收集内存、不额外强制保存／排空，未落盘消费包括已完成响应也允许丢弃，不补入新周期。
- 已把原数据／消费归属／行为 Lighthouse 当前 clear 输入改为“已成功保存”，补来源指针；原“全部已知／已取得”的宽表述见这些文档历史及本票旧交接，仅作溯源。当前票据正文 clear 输入已同步，历史评论／assets 快照未改。只修订明确输入／损失范围，不取消其他账户、正常并发、去重、独立 estimate。

#### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？

##### Intent gaps
- 无新增无主缺口。简化 clear、无需内存收集／排空及接受未落盘损失由命令／装配／验收覆盖，已追加 Q15。

##### Layer gaps
- 地图、十三票、四份 Lighthouse 已加载。归档原料是本票活动文件；跨进程周期新鲜度／关系保留仍归本票，实际初始化／请求事实归观察票。无新增无主前置，不宣称全部机制已满足。

##### Layer violations
- 无新增。clear 业务输入与损失归 extension，安全协调仍归 framework，不添自动恢复／跨进程内存服务。

##### Peer asymmetry
- 无新增。estimate 不清、不跟随 clear 业务输入规则，其他账户正常聚合仍受保护。

##### Conflicts
- old→new：“归档全部已知／已取得聚合”明确收窄至最新已成功保存聚合；不再仅靠在途丢弃条款推导。源 Lighthouse 正文与实际命令／装配／验收消费者已同步，历史保留；不重开数据票。Q13 简单先归档后提交、Q14 无基线暂停仍成立。无剩余无主 follow-up，不增票、不解除整体依赖；clear 复杂恢复分支不推进。

- 后续恢复点转向 Q16 新持久化路径／跨项目共享范围。已检查 framework/core/config 的声明与 resolveDeclaredFile：它解决扩展配置文件基准路径，不是持久化数据根。framework 文件清单及路径相关字面搜索未见已定义通用数据根；旧路径证据为 ~/.omp/cost-archive，应保留不改。候选新路径 ~/.my-agent-toolkit/data/model-cost/，用户级跨项目共用，独立 active／archives／estimate；未批准，不创建目录。具体文件名／路径覆盖／隔离条件及跨进程周期新鲜度／锁／schema 仍未决。

### Q13／Q14 已确认：继续归档输入范围

- 用户明确回答“Q13 同意、Q14 同意”；结果唯一权威为[存储局部决议](../lighthouse/06-local-storage.md)。clear 先归档再提交活动重置，失败终止不自动恢复；无有效基线暂停本实例消费统计／保存至下一次正常初始化，不影响模型或自动停用独立余额／额度。本节优先于旧 Q13／Q14 未决交接，整票仍 claimed、未实施。

#### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？

##### Intent gaps
- 无新增无主缺口。不先清未备份消费／失败不补做由命令、装配、验收覆盖；暂停不阻断模型／独立测量由观察、展示、刷新、装配、验收覆盖，已追加交接。

##### Layer gaps
- 地图、十三票、四份 Lighthouse 已加载。实际初始化事件归观察／装配；clear 物理协调、归档输入、跨进程周期读取与混账户关系保留继续归本票，不能以提交语义推导具体机制已满足。无新增无主前置。

##### Layer violations
- 无新增。消费暂停／clear 政策属于 extension，不伪造 framework 生命周期，不把其他 extension 或 estimate 绑到本策略。

##### Peer asymmetry
- 无新增。独立余额／额度继续由刷新票覆盖，不因消费故障遗漏功能。

##### Conflicts
- 与数据 Lighthouse 账户 clear 及普通本周期 resume 一致，不把失败残留归档当重置完成或恢复来源。Q14 完成 Q6 的基线不可读运行条件，不恢复旧保留内存政策。
- 归档全部已知聚合是否包含未落盘内存尚不明确，不能只归档磁盘就默认满足旧“全部已知”措辞；下一题由用户明确取舍。提交语义确认不授权吞掉正常并发贡献。无剩余无主 follow-up，不新增票、不解除整体依赖。

- 下一候选 Q15（未批准）：clear 只归档协调范围内读取的最新已保存活动聚合，不收集各进程尚未落盘内存、不额外强制 round_end 保存；未落盘部分随周期结束丢弃。该选择若确认需同步数据／消费归属的 clear 输入范围，不能只用既定在途丢弃条款替用户扩大损失范围。之后再收口跨进程新周期可见性／关系／路径／锁／schema。

### 普通保存失败初始化修订已确认（优先于以下旧讨论）

- 用户明确同意两个澄清范围，并说明极端边界不值得复杂恢复、接受少量数据丢失。当前唯一权威见[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11。所有普通消费保存失败均丢弃未保存部分，从磁盘有效完整快照重新初始化，不自动重试／补账／修复；不清去重标记、不猜零覆盖、不重置账户磁盘周期或 holiday。无法读有效磁盘则报告并停止这次保存流程，后续运行条件未定。
- 修订替代先前 Q6 保留内存／Q11 运行中失败不回滚；普通 resume 完整快照与版本接续不变。clear 成功／失败机制仍未批准，不能按此次内存重置判定成功。

#### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？（失败初始化修订）

##### Intent gaps
- 无新增无主缺口。简化恢复／接受少量损失由修订 Q6／Q11 与装配／验收承接；失败反馈及显示回到有效基线由展示票承接，已更新原交接而非并存旧政策。

##### Layer gaps
- 已重新加载地图、十三票、四份 Lighthouse，并读 ADR-0004。磁盘有效完整快照／版本属于本票及数据契约，框架通用协调与正常并发不撤销；无法读取基线后的运行条件归本票未决，实际生命周期／实例／去重归观察票。无新增无主前置。

##### Layer violations
- 无新增。失败初始化是 model-cost shared logic 的业务取舍，不把所有 extension 或 estimate 都绑到消费模型，也不在 framework 制造业务恢复系统。

##### Peer asymmetry
- 无新增。正常 FIFO、跨进程互斥、按记录合并、损坏不覆盖仍需实现；失败快照丢弃不取消其他会话／账户的正常数据保护。

##### Conflicts
- 明确 old→new：Q6／Q11 先前保留未保存内存／不回滚，与本轮用户要求失败后丢弃并从磁盘初始化相冲突；已在原 Lighthouse 同步 Discussion／Decision／User stories／Postconditions，Q9 联动措辞及地图已更新，旧原文保存在源票历史。
- 实际消费者观察／展示／装配／验收已同步；数据／消费归属 Lighthouse 新增唯一来源指针，不复制新决议或重开已决票。普通 resume、tree 不回滚、正常并发及去重未变；显式扩展的故障损失不会被误作正常并发允许丢失。ADR-0004 已将保存失败边界委托存储票，无相反承诺，不需写第二份失败政策。
- clear 两文件提交点与磁盘基线不可读后的运行条件仍未决，不能据本修订假报 clear 成功或猜零覆盖。无剩余无主 follow-up，不新增重复票、不解除整体依赖，票仍 claimed。

##### Evidence / limits
- 隔离 Eval 算式探针：磁盘 P／v8／120 分，失败内存 P／v9／130 分重置到 120 分，再增加 5 分得到 P／v9／125 分；磁盘原值与已处理标记未被修改。仅验证示例状态转移，不验证生产 handler／文件／并发故障，没有生产实现或故障通过声明。

- 下一恢复点：Q13 简化 clear 的先归档／再发布活动文件、失败终止且不自动恢复；Q14 无法读到有效基线时是否暂停消费统计／保存至下一次正常会话初始化。不再问保留失败内存或展开复杂自动重试树；两题提议未获批准。

#### 修订前 Lighthouse 原文（历史，不再生效）

### Q6：普通 round_end 保存失败不打断主流程

用户明确同意：普通 round_end 保存失败报告错误，但不因此让代理主流程报错或停止；内存自身累计保留、不回滚，不假报持久化成功。具体反馈承载由展示票决定。不新增定时重试或后台补写队列；下次正常保存提交最新累计与最近 Round 快照，若在成功保存前退出，未保存部分可能丢失。

本决定仅针对普通 round_end，不涵盖账户 clear、holiday 命令或独立 Codex estimate 的失败策略，不授权覆盖损坏文件。后续正常保存仍须满足未决的旧快照／账户周期有效性与安全合并条件，不能复活 clear 前数据。

### Q11：完整快照恢复与运行中不回滚

用户在澄清后明确同意按此描述：普通重启／resume 没有运行中的内存状态时，读取当前账户周期内已保存的完整会话快照，一起恢复累计、最近 Round 与保存版本，新快照从恢复版本继续递增，同一快照重交保持原版本。新周期没有该会话记录时才从初始版本开始。不扫描历史消息、不合并旧归档、不以当前价重算旧消费。

运行中的一次保存失败不触发磁盘恢复或版本倒退；保留较新的内存累计／版本，下次正常保存提交最新快照。版本只在同账户周期、同会话内比较，旧周期版本再大也不覆盖新周期。新进程未加载内存版本可以恢复磁盘完整快照；现有磁盘记录缺必要版本字段不是普通恢复，不据此批准猜版本或兼容旧格式，异常／schema 策略待收口。同 Session 单执行者检测、clear 后运行态接续仍未决定；本确认是规划结论，不是生产实施授权。


### 失败策略修订提议：初始化重置而非保留未保存内存

- 用户担心保留冲突内存会导致每次保存持续失败，倾向更保守地直接重置到初始状态，避免无法提交的内存持续存在；接受简化、不要复杂重试的理由已明确。
- 与已确认 Q6“保存失败保留内存累计”存在具体修订需求，不能同时作为有效政策。Q6 在新策略的失败适用范围与“初始状态”含义确认前不改，暂停依赖其不回滚内存的后续收口；不由本轮执行生产修改。
- 待澄清：初始状态是否指重新从当前磁盘有效周期／累计／版本初始化，并丢掉未保存内存消费，而非把已有会话累计设零覆盖磁盘。前者 agent 推荐，可解除旧版本／旧周期内存导致的持续冲突，但无法保证磁盘满／权限／锁故障已消失。磁盘读失败或无效时不得猜零覆盖，停止保存及反馈的具体方案仍待确认；不扩大为自动账户 clear、不重置磁盘周期／holiday、不合并失败归档。
- 下一恢复点：确认重置到磁盘有效初始化基线，还是另有所指；随后再收口适用所有保存失败还是仅业务不一致。新结果若确认，更新本 Lighthouse 原 Q6／Q11 正文并同步相关交接与 Backtracer，不把修订藏在新票或并列旧承诺。

### Q13 简化诉求：不一致直接丢弃，先明确丢弃对象

- 用户要求尽量简单、不要很多重试逻辑，认为 extension shared logic 不需覆盖很多复杂边界，发现数据不一致直接丢弃是期望效果。此为明确设计意图；此前自动恢复／复杂重试候选不推进。Q13 的完整提交方案仍未批准。
- 需澄清“丢弃”是放弃本次写入尝试并保留内存／磁盘，还是连未保存内存消费也删除。前者符合已确认 Q6，后者会修订 Q6，不可默推。agent 推荐前者：不一致返回失败并放弃当前提交、不自动修复／重试，不删除有效磁盘数据；正常不同会话合并不误判为冲突。若 clear 未提交则旧周期／累计／holiday 保持，失败归档备份不自动合并。
- 尚未授权取消 framework 同文件协调、正常同账户多会话不丢不重、账户隔离、旧周期拒绝或损坏文件不覆盖。简化应先作用于 extension 业务失败处置，不用低复杂度意图撤销这些既定要求。下一步只确认丢弃范围，暂不推进重试／恢复树或实施。

### Q13 场景澄清：归档已写但 reset 未提交后的重交

- 用户询问：下次提交是否会因不一致被丢弃？Q13 尚未同意，不写为 Lighthouse 结论。
- agent 澄清候选模型：周期／会话版本校验以活动文件为准，独立归档发布不推进活动周期或保存版本。若 reset 确实未提交，普通保存仍对原周期最新活动记录校验；较新快照可正常合并，同快照重复按 Q8 幂等，同版本异内容仍按 Q12 冲突，不因存在归档备份而拒绝。
- 再次 clear 不能盲用上次备份清掉新增消费；agent 推荐重新取得协调权限、读取当时最新活动数据并发布新的本次归档，再提交 reset。旧失败尝试文件保留但不冒充已完成归档，不扫描它补账／合并。具体备份识别与重试 identity、提交结果未知的核验仍未定，这不是新增已批准机制。
- 下一步请用户确认 Q13 加上上述重试原则；若活动 reset 实际已提交但反馈丢失，则属于另一结果未知场景，不能按未提交重试，之后需单独决定核验／幂等。

### Q11 已澄清确认：继续 clear 的提交边界

- 用户明确回答“同意，按你的描述执行”；按地图规划模式记录[存储局部决议](../lighthouse/06-local-storage.md)Q11，不开始生产迁移。本节替代旧 Q11 待澄清恢复点。普通 resume 恢复完整已保存快照并接续版本，运行中保存失败不回滚较新内存，不批准缺版本记录兼容或跨周期只凭序号择新。

#### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？

##### Intent gaps
- 无新增无主缺口。正常恢复、未保存内存保留及消费不重算由数据／装配／验收覆盖，Q11 已补交接。

##### Layer gaps
- 全图十三票与四份 Lighthouse 已重新加载，地图当前来源已读取。版本恢复方向已满足，本票仍需单执行者检测／clear 运行态／schema 异常，观察票提供实例事实；无新增无主前置，不解除整票依赖。

##### Layer violations
- 无新增。业务恢复属于 model-cost，framework 文件 module 不把 Session／消费版本固化为通用模型。

##### Peer asymmetry
- 无新增。不让 estimate 或其他 extension 承担消费的快照／版本模型。

##### Conflicts
- Q11 与当前数据 Lighthouse 的 resume 活动周期／不读归档／不补账及 Q6 保留内存一致。明确不批准缺字段猜值／兼容旧统计，版本校验不是单执行者证据。无剩余无主 follow-up，不新增票、不结案。

- 下一恢复点：讨论 Q13 账户 clear 两个文件的成功／失败边界。agent 候选：协调范围内先发布独立归档，再原子切换活动文件内目标账户周期／累计／holiday；活动文件发布是提交点，归档失败不重置，重置失败旧活动保持但可能残留本次备份，不将其认作成功 clear／恢复源。只先确定提交语义；归档输入是否涵盖未落盘已完成消费、重试识别／文件 schema、故障恢复和跨进程内存刷新都未批准，需后续展开。

### Q10／Q12 已确认，Q11 先澄清理解

- Q10 用户回答“可以”并询问超过 15 秒取不到锁是否报错并放弃；默认预算／覆盖／不新增 YAML 项已记录到[存储局部决议](../lighthouse/06-local-storage.md)。须说明是从提交起排队＋取锁合计，不是各给 15 秒；普通 round_end 收口错误反馈而不让未处理异常停止代理，具体错误 interface 仍未冻结。
- Q12 用户明确同意，冲突拒绝／保留磁盘／报告已记录 Lighthouse。
- Q11 用户回答同意但询问“优先考虑版本号，以较新版本为准，没有版本号就先恢复磁盘版本？”该理解可能误为缺版本文档自动兼容或内存／磁盘只凭序号任意择新，不能直接批准。本轮先解释版本限定同周期同会话、普通 resume 从磁盘完整快照起步、新快照递增、运行中失败后不能用旧磁盘倒退内存；现有磁盘记录缺必要版本不是普通无内存版本，新记录初始化与损坏策略分开。澄清后的确认是下一恢复点，不推进依赖 Q11 的决定。

#### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？

##### Intent gaps
- 无新增无主缺口。有限失败及免新增配置由装配／验收覆盖；明确冲突而不猜合并由展示／装配／验收覆盖，已交接。

##### Layer gaps
- 地图、十三张票、四份 Lighthouse 已加载。等待结束无迟到写入归本票机制，错误承载归展示；版本恢复／单执行者仍未决，无新增无主前置。

##### Layer violations
- 无新增。framework 负责协调等待，extension 负责业务快照冲突规则；不把 Q12 当通用宿主 usage 冲突机制。

##### Peer asymmetry
- 无新增。调用方可覆盖等待值，不新增配置系统；不默套用消费版本规则到 estimate。

##### Conflicts
- Q10／Q12 与 Q6／Q8／Q9 及本周期恢复一致。Q11 理解差异已留本票澄清，不替用户批准缺版本兼容、仅序号择新或丢弃未保存内存；依赖该前提的新问题暂停。
- 无剩余无主 follow-up，不新开重复票、不结案、不解除整票依赖。

### Q8／Q9 已确认：版本恢复与等待预算待收口

- 用户明确回答“Q8 同意、Q9 同意”；确认范围唯一来源为[存储局部决议](../lighthouse/06-local-storage.md)。Q6 至 Q9 已确认，旧未回答段落仅作历史，不覆盖本节；整票仍 claimed，不实施。
- Q8 已确认按记录合并、账户周期拒绝、更旧保存版本拒绝及相同快照重复不追加；Q9 已确认排队＋取锁的有限等待／取消，终止等待后无迟到写入，更新开始后等待实际结果。尚未批准具体等待值、resume 版本接续、同版本不同内容处理、单执行者机制或 clear 多文件一致性。

#### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？

##### Intent gaps
- 无新增无主缺口。其他会话贡献／账户 clear 不复活由命令、观察、装配、验收票覆盖；有限等待及不迟到写入由观察、装配、验收承接，已追加具名交接。

##### Layer gaps
- 已重新加载地图、十三张票与四份 Lighthouse。实际账户、观察实例与取消信号归原有账户／观察票；本票继续承担版本恢复、锁／预算与 clear 一致性，不把局部决定当已满足前置。无新增无主层级缺口。

##### Layer violations
- 无新增。framework 不识别业务周期／schema，extension 不自行复制底层排队／锁。取消等待不是取消真实模型执行。

##### Peer asymmetry
- 无新增。通用文件协调供其他 extension 使用；消费业务校验不自动成为独立 estimate 的业务规则。

##### Conflicts
- 与数据 Lighthouse 的本周期恢复、不补账、clear 前在途丢弃、多会话正确性及 Q5 handler 收口一致；Q6 对普通 round_end 失败反馈继续有效。Q9 不承诺文件操作硬总超时，也不批准假取消后真实写入继续。
- 同版本不同内容与 resume 序号不是已决结果，归本票继续讨论；clear 成功边界、跨周期旧内存处理仍未决。无剩余无主 follow-up，不新增票、不解除整体依赖。

- 下一轮候选（未批准）：Q10 等待预算默认 15 秒，由 framework 文件 interface 支持调用方覆盖，不新增独立配置系统；Q11 resume 恢复磁盘周期／累计／版本后递增提交；Q12 同版本不同内容返回冲突并保留磁盘内容、不猜取最大值。之后继续单执行者／clear／读缓存／路径与平台。

### Q7 已确认：继续旧提交与等待边界

- 用户明确回答“Q7 同意轻量方案”；确认结果见[存储局部决议](../lighthouse/06-local-storage.md)。本节优先于旧 Q7 未回答交接。用户低复杂度诉求以轻量内存尾链满足，不取消多会话／跨进程安全更新。Q6、Q7 都已确认，整票仍 claimed。

#### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？

##### Intent gaps
- 无新增无主缺口。确定顺序、低复杂度与调用方免重复协调由装配／验收票承接，已追加 Q7 交接。

##### Layer gaps
- 无新增无主前置。全图十三张票、四份 Lighthouse 已重新加载；FIFO 不满足旧快照／clear 周期检查、同 session 单执行者、读缓存新鲜度或平台锁，仍由本票及原有观察／账户／命令前置决定。

##### Layer violations
- 无新增。内存串行及锁归 framework，业务 schema／有效性合并规则归 extension；不引入持久任务队列／后台重试。

##### Peer asymmetry
- 无新增。不同文件独立，其他 extension 复用同一通用协调；不要求消费与 estimate 共用业务模型。

##### Conflicts
- 与 Q5 提前提交／完成前 join、Q6 失败后保留内存及数据 Lighthouse 一致。不承诺跨进程全局 FIFO，不把探针当生产文件可靠性证据。没有需要修订的已决来源或剩余无主 follow-up，不新增重复票，不解除整体依赖。

- 下一轮未决候选：Q8 快照保存只合并该会话负责的记录，并在协调范围内校验账户周期与保存版本，拒绝旧周期／更旧快照，相同版本重复不追加消费；Q9 取得协调权限前采用有限等待／取消，退出等待后不能迟到写入，不对已启动发布做表面超时。都是 agent 提议，尚未批准；同 session 单执行者及具体版本恢复仍待展开。

### 当前续聊进展：Q6 已确认，Q7 等待复杂度取舍

- 用户明确回答“Q6 同意”；普通 round_end 保存失败策略已记录于[存储局部决议](../lighthouse/06-local-storage.md)，不扩展至 clear 或 estimate。此交接优先于旧暂停段落中的 Q6 未回答措辞。
- 用户对 Q7 提问：保证串行是否需要新增队列、是否增加很多复杂度；若很复杂，可考虑暂不实现保证。这是条件性取舍意向，不是批准取消 FIFO 或多会话安全更新。Q7 尚未回答。
- 复杂度分析候选：进程内按规范化文件键维护 Promise 尾链，每个更新在前一更新完成（成功／失败均可）后启动；尾链非拒绝、空闲键释放、操作结果独立返回。这是局部内存串行，不是持久任务队列／worker／后台重试或退出排空。跨进程锁、原子发布、业务旧快照／周期检查仍分别必要；实际平台及锁实现未定，不能用 FIFO 代替这些要求。
- 隔离 smoke（Eval Bun 纯 Promise，无业务文件修改）：A 在 consumption 键等待，随后 B 同键提交，C 在 estimate 键提交。释放 A 前输出 A:start、C:done；A 失败后输出 A:fail、B:start、B:done；剩余键为 0。验证基本顺序、失败后继续、不同键独立及空闲清理，不验证文件 I/O、路径别名、锁、取消／超时、跨进程或平台可靠性，不作为已实现 framework 能力。

#### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？

##### Intent gaps
- 无新增无主缺口。Q6 不阻断主流程与下次正常保存由观察／装配／验收票覆盖；保存失败可观察性由展示票覆盖，已追加具名交接。

##### Layer gaps
- 无新增无主前置。稳定快照、内存累计来自数据决议；身份／handler 映射归观察票；旧快照／周期有效性、安全合并、clear 一致性仍归本票未决。未结案票仅是交接位置，不代表能力已满足。

##### Layer violations
- 无新增。Q6 是 model-cost 普通保存的业务失败策略；framework 返回更新结果，不吞业务错误或实施 model-cost 专属重试。

##### Peer asymmetry
- 无新增。Q6 不成为其他 extension 或 estimate 必须遵循的失败策略，不新增全框架后台队列。

##### Conflicts
- 与数据 Lighthouse 接受未保存退出损失一致。下一次保存需满足当前账户周期，不能复活 clear 前数据；相关未决机制仍由本票决定。Q7 的低复杂度偏好尚非撤销已确认同账户多会话安全更新。
- 已读取地图、十三张票与四份当前 Lighthouse；旧历史提议不作为覆盖承诺。Q6 新故事／后置约束已交观察、展示、装配、验收；无剩余无主 follow-up，不新增票、不解除整体依赖。

- 当前恢复点：先回答 Q7 是否接受轻量进程内 FIFO；之后再展开等待／取消、旧快照／clear、读缓存、路径／平台。保持 claimed，继续本轮 HITL，不实施、不结案。

### 暂停交接：下次从 Q6／Q7 继续

- 暂停原因：用户要求在其他对话继续；本次不结案、不实施、不替用户回答任何未决题。确认结果唯一权威：[存储组织与唯一消费源局部决议](../lighthouse/06-local-storage.md)，以及仍有效的[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)。
- 已确认：所有账户消费活动集中一个 JSON，每次归档另存历史文件；Codex 5h／7d 转换 estimate 独立持久化，不在本票展开业务算法。Session 自身累计和最近 Round 开始／结束快照同次保存，不留历史 Turn／Round 列表，账户／父子合计派生，只有一套消费聚合。内存保留动态当前轮及恢复后持续更新的自身累计。
- 已确认分层：framework 提供 Session／Round／response 公共字段、生命周期与 usage 等源事实，adapter 映射宿主；extension 组合、计价、选择统计与持久化精度。文件读改写、安全协调和必要的锁／队列由 framework 提供，不在每个 extension 重造。其他 extension 不受 model-cost schema 或保存频率限制。
- Q5 已确认：捕获稳定快照，提前提交 framework 非阻塞安全异步更新，继续不依赖保存成功且不再写同文件的独立逻辑，在 handler 完成前 await 结果；所有提前返回／异常路径也要收口任务，不是立即 await 或 fire-and-forget。保存失败反馈尚未决定。
- 用户背景／理由：通常只有一个 DeepSeek 账户，希望 JSON、接近旧方案与低复杂度，真实需求出现后才拆分；旧 extension 多会话写入踩坑，希望框架可靠承接。单账户背景不取消同账户多会话／跨进程并发安全、其他账户隔离或子代理统计。
- 未采纳／被替代提议：预拆每账户文件、不启用数据库；将 estimate 并入消费活动文件已纠正；费用也采用旧保存基线差分维护第二套账户总数的提议被唯一自身聚合模型替代；立即 await 是 agent 推荐而非已批准约束，已被 Q5 替代。只有真实需求或具体场景证明必要时才带理由讨论修订，不能恢复完整账本或历史补算。
- 调查证据：[旧实现现状与存储](../assets/current-state.md#存储现状)及源码 daily-tracker.recordTurnCost、index.ts agent_end、archive-store.readArchiveDocument／publishArchiveDocument／renameWithRetry：旧调用方直接 await Promise，锁内同步读写及 rename。旧 token 用宿主累计与磁盘 last* 求差，费用直接加 turnCost。算式检查相同累计 token 和正费用重复提交：token 第二次差额为零，费用再次增加；这不证明旧原生正常路径必然双计。未运行完整 OMP 多进程竞争、finishTurn 故障／重试链路，未测非阻塞保存性能。

#### 下次第一轮：Q6 与 Q7 都未回答

- **Q6 普通 round_end 保存失败策略**：agent 推荐不打断主要代理业务，保留内存累计，不回滚、不假报成功；报告失败，具体承载交展示票；不加定时重试或后台补写队列，下次正常保存提交最新累计及最近轮，若之前退出则可损失未保存值。备选为保存失败使 handler 报错／阻断。该题不含 clear；推荐未获用户确认，不能自动当作已批准失败政策。
- **Q7 同文件更新排序**：agent 推荐 framework 同进程同文件按进入 interface 的提交顺序串行，协调权限内重读／业务更新／原子发布；一次失败释放资源不阻塞后续，不同文件不统一排队。跨进程互斥但不保证全局 FIFO。备选是更弱排序或跨进程全局排序，尚未选择。锁／队列具体实现未定，旧快照与 clear 前提交仍需业务有效性检查，不能仅靠锁宣称安全。
- 两题独立，可同轮回答。之后依回答展开：有限等待／取消和错误结果、旧快照与 clear 周期拒绝、归档／重置／holiday 一致性、读缓存新鲜度、迟到子消费发布、同 session 单执行者、实际平台与存储路径；具体 schema 尚未冻结。以上均是未决范围，不是新增获批机制。
- 不重问 Q5、聚合还是明细账、Codex estimate 算法；恢复先读本节、当前 Lighthouse 与 intervening tracker 结果，重算 frontier，再认领本票。

#### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？（本次暂停）

- 本次重新加载地图、全部十三张决策票与四份当前 Lighthouse，核对未决／确认／被替代范围。本次暂停没有新的用户决策，既有 Lighthouse 结论保留；Q6／Q7 仅在票内保存提议，不升级为决定。
- **Intent gaps**：无新增无主缺口。账户周期恢复／最近轮／唯一聚合由数据、展示与验收票覆盖；独立 estimate 来源与调度由刷新票覆盖；通用事实／不同持久化模型与非阻塞保存由观察、装配及验收票承接。
- **Layer gaps**：无新增无主依赖。观察票已收到 Q5 异步 handler 完成映射交接；验收票已收到稳定快照／异常收口／拒绝接收交接。安全更新失败／排序／clear 的机制仍归本票未决，不当作已满足能力。账户身份、模型价格与生命周期仍由具名 open 票提供。
- **Layer violations**：无新增。frame 基础文件 module 不包含 model-cost schema／计价／Round 保存规则，extension 不直接消费原生宿主 payload。
- **Peer asymmetry**：无新增缺口。旧活动／归档 JSON 组织作为参照，不强制复制旧差分维护或同步 I/O，不给其他 extension 固定模型。
- **Conflicts**：无新确认冲突。旧立即 await 推荐、estimate 合并提议、差分第二套累计已明确被替代；Q6 的不打断／下次保存与 Q7 的进程内 FIFO 仍未批准。暂停未改变既定 clear、父子、不同账户隔离、异常未保存损失边界。
- **Gap follow-up**：不新增重复票、不解除任何整体前置；未决失败／排序留本票 Q6／Q7，Q5 后续实际派发与验证已交观察和验收票。追踪完成，无需要在本暂停中再采访解决的无主批次。
- **最终恢复点**：先认领本票，直接继续 Q6（普通 round_end 失败策略）和 Q7（同文件排序），两题都尚未回答。之后按答案展开等待／取消、旧快照／clear、迟到子消费、读缓存、路径与平台。暂停写入完成后将本票 open 并清空 Assignee；不更改任何其他会话认领。

### 本轮已确认的存储方向

- 用户选择所有账户集中存储在一个本地 JSON 文件，不按账户预拆分文件；以后有真实需求再讨论拆分。不是取消文件内部账户隔离。
- 用户当前使用背景：主要是 DeepSeek 消耗统计，实际上只会有一个账户，很少多账户同时写文件；此背景不能替代已确认的多会话并发安全要求，也未确认取消 Codex token／参考费用、额度估计持久化等既定功能。
- framework 提供可靠的本地文件写入基础能力，隐藏多会话安全更新的实现细节；扩展调用小 interface 并拥有业务合并规则。旧 extension 曾踩过并发写入坑，用户明确不希望每个扩展重复实现。
- Q3 用户确认：一个当前 JSON 文件集中存所有账户活动数据，每次归档另存一个历史文件，不把历史归档嵌入活动文件。参考旧 extension 活动／历史分离组织；旧 quota estimate 原为另一个文件，不宣称旧实现只有一个活动文件。
- Q4 用户倾向沿旧 extension 算法，尚未确认我提出的累计覆盖方案。源码核对：daily-tracker.recordTurnCost 锁内重读，token 用提交的宿主累计与磁盘 last* 基线求非负差，费用直接累加本次 turnCost；index.ts agent_end 调用 finishTurn 后提交。此算法不同于“所有指标累计覆盖”。算式验证相同输入重复提交时 token 差额为零但正费用再次增加；这不是正常宿主路径必然重复计费的证明。
- 上轮曾提议费用也使用保存基线差分；此提议被后续唯一自身聚合模型替代，不作为已确认机制。旧 finishTurn、故障及重试路径的完整运行未在本轮验证。
- 用户澄清并确认：codex-usage-estimate 是估算 5h／7d 额度转换关系的独立功能持久化文件，继续独立；可复用 framework 安全写入 module，本票不展开其业务算法。这不是取消该功能或把它并入消费活动文件。
- 用户要求只有一个消费计算方式、一个权威来源。Q4 上轮提出的保存差分不是 Round 展示值；它原用于更新另存的账户累计。已有数据决议规定会话自身聚合为唯一源，当前需据此检验是否直接保存自身累计并派生账户合计，避免保留第二套权威累计。后续用户确认模型：保存 Session 自身累计与最后一轮快照，内存维护当前／最近轮动态及持续更新的自身累计，业务计价、聚合组合与持久化模型归 extension；Session／Round／response 公共字段与源事实由 framework 提供，framework 不限制其他 extension 的持久化模型。具体 schema 与安全提交机制尚未批准，最终确认内容见本票 Lighthouse。
- 未决：更新操作形状、重复保存、clear 代际、等待失败与损坏策略、路径、平台条件和具体协调实现。每账户单独活动文档提议不采纳；不启用数据库。

### Trace Report: framework 如何提供独立存储、原子更新与跨进程协调？

本轮全图追踪加载地图、全部十三张决策票和现有 Lighthouse，包括观察票已确认局部结论；追踪源为本票新局部 Lighthouse。

#### Intent gaps
- 无新增无主缺口。单一消费源／恢复／最近轮由数据、观察、展示及验收票覆盖；通用能力可供不同 extension 使用由装配票的公共接口与消费者职责覆盖。

#### Layer gaps
- 无新增无主前置。真实账户由账户访问票提供；请求／Round／父子身份由观察票提供；本票继续承担安全发布、clear 一致性及旧提交拒绝。独立 estimate 调度／来源成对由刷新票承接，不在本票重开算法。未结案票是交接位置，不是能力已实现的证明。

#### Layer violations
- 本轮未发现新增层级违规；Session／Round schema、逐响应计价与保存节奏不能放入 framework 文件 module。此前提议差分维护第二套账户累计已由新确认模型替代。

#### Peer asymmetry
- 未发现新增同类表面缺口。旧 JSON 活动／归档分离仅是组织参照，不要求其他 extension 使用相同 schema，也不要求本次实现额外 harness adapter。

#### Conflicts
- 新确认与数据 Lighthouse 的自身聚合唯一源、round_end 批量保存及最近快照一致，无需重开已决票。内存的当前轮动态与恢复后的持续会话累计并存，不把用户的简述误解为取消内存累计或剩余持久数据。
- Codex estimate 独立文件澄清替代此前并入活动文件提议；既定功能不删，不另建重复票。

#### 后续分层澄清追踪
- 用户明确 Session／Round／response 字段与源事实归 framework，extension 组合与选择持久化精度；与数据 Lighthouse、观察票当前载荷责任一致。修正本 Lighthouse 中过宽的“framework 只提供文件机制”表述，不把文件 module 的业务无关性推广到整个 framework。
- 意图／依赖由观察票与装配票覆盖，无新票；不冻结新字段或把全部业务费用移入 framework。Q5 尚未回答，保存等待策略保持未决。

#### 文件 interface 澄清与追踪
- 用户确认同步／异步写文件由 framework 提供 interface，同文件锁或必要队列在 framework 实现。覆盖位置为本票和装配票，不新增协调票。双 Sync／Async 公共方法与后台队列尚未获批。
- 旧 agent_end 直接 await recordTurnCost，没有提交与 await 之间的业务代码；Promise interface 不是独立线程，锁内同步文件操作不能与同线程业务代码并行。并发调查依据 archive-store 的 readFileSync／writeFileSync／renameSync 及 index.ts 直接 await，未运行完整原生竞争链路。
- Q5 保持未决：先区分是否提供非阻塞异步 interface 与调用方何时等待结果，不能把用户机制归属确认当作保存等待选择。

#### Q5 等待与乱序讨论
- 用户对异步安全更新 interface 表示可以，同时担心后台提交乱序导致旧值覆盖新值，倾向像旧方案一样保存返回再继续；需澄清非阻塞异步 I/O＋立即 await 已能保持这段业务顺序，不必改用阻塞线程的同步 I/O。此轮尚不把疑问视为批准双 Sync／Async interface 或后台提交。
- 建议待确认：model-cost 调用 framework 安全更新后立即 await 结果，同文件读改写由 framework 串行协调并在锁内读最新内容；跨进程锁仍必需。旧业务快照及 clear 前提交拒绝不能仅靠锁推导，留本票随后决定。

#### Q5 新候选：提交后独立工作，返回前 join
- 用户明确希望研究提交安全异步保存后继续本 handler 的独立逻辑，函数退出前再 await；中间不再更新同一文件。这不是 fire-and-forget 或退出后后台排空。此前立即 await 仅是 agent 推荐，不是已批准约束。
- 该模式可实现：稳定快照＋非阻塞 I/O＋提前提交＋完成前 join；所有返回／异常路径也需收口保存结果，异步独立工作期间的保存拒绝需及时挂接处理。await 暂停当前 async 函数，不阻塞整个 JS 线程；同步 I/O 则阻塞线程。实际重叠取决于锁／I/O 是否已开始，不能承诺耗时收益。
- 同文件读改写协调仍由 framework 提供；调用方稍后 await 不解除跨进程互斥、最新文档合并与旧周期／快照拒绝要求。具体 interface、协调和错误策略尚待后续确认。

#### Q5 已确认与增量追踪
- 用户明确确认“提前提交稳定快照 → 独立工作 → handler 完成前 await”方案，结果已写本票 Lighthouse；不是立即 await，也不是 fire-and-forget。非阻塞文件 I/O 与同文件协调归 framework。
- Intent gaps：新“独立逻辑与 I/O 重叠、无脱离任务”意图由观察票的异步 handler／派发与装配、验收票覆盖；无无主缺口。
- Layer gaps：handler 完成前 join 的实际映射由观察票承接，存储 Promise 完成／失败由本票继续收口；无新前置票。
- Layer violations／Peer asymmetry：无新增；业务等待点不提升为所有 extension 的固定持久化模型。
- Conflicts：与既定 round_end 保存、未成功保存损失边界一致；替代 agent 推荐而非修订已批准旧契约。失败、同文件排序、旧快照／clear、路径与平台仍未决。

#### Follow-up and resume point
- Q5 已确认，下一轮决定保存失败策略与同文件更新排序；随后决定旧提交／clear、读缓存、路径与平台，不再重问立即 await 或退出后后台保存。装配／验收消费本票局部结果，但整体依赖不解除。票保持 claimed，不是暂停或结案。

### 历史输入：行为契约交接

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 的 Q10 确认现有累计与归档作为需求基线：账户周期、会话自身聚合、归档／reset／关闭 holiday 的业务边界已由数据 Lighthouse 明确；本票承接物理组织、原子发布、恢复确认与失败／协调机制，不重复决定旧业务范围。最新余额／窗口读数只存内存，不取消累计与 quota estimate 持久化。任何业务删改均需说明差异、理由并由用户确认，不得以实现取舍默删。

### 历史输入：消费归属交接

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：可靠消费开始时关联实际会话、Turn／Round、账户、模型与锚价，内存逐响应计算、自身聚合并保存父子关系；不保存历史逐请求账本、不补已跳过的缺 usage／价格。普通重复防重与已知冲突处理需区分，可信来源／有限保留由观察票决定，不默新增持久冲突记录。支持同进程及跨进程多独立会话，账户累计不得丢失、重复或覆盖其他会话贡献。汇总视图不是第二笔消费。
- 待决定：聚合／父子关系／最近快照／账户周期如何组织与原子发布、普通恢复已成功保存值如何不重计、重复保存与损坏如何处理？接受崩溃未落盘损失，tree Round 不可用，不要求未入账恢复日志、补账或任意历史 Round 查询。不能用恢复时当前价格重算历史。
- 未知／额度消费／无统计口径是领域性质，不意味着实际免费；运行时不维护缺失计数、补算记录或持续完整性标记。最新余额／窗口读数仍只存内存；estimate 基线与采纳值按账户持久化，同源成对样本不可跨来源拼接。
- 待决定：账户周期已由账户级 clear 定义；归档／reset／关闭 holiday 与迟到新消费发布的原子性、旧在途丢弃及旧缓存不复活；同一 session 单执行者的协调与退出恢复由何种通用能力承接？不在本交接决定锁或文件格式。


```

## docs/adr/0004-model-cost-aggregate-accounting.md

```markdown
---
status: accepted
---

# model-cost 采用扩展自有聚合，而不是通用业务账本

model-cost 选择在 harness-independent shared logic 中逐响应按请求锚价计算、按实际会话独立聚合，并在 framework `round_end` 触发保存；每个会话只保留最近 Round 的开始／结束累计快照，不建立历史 Round／Turn 明细账。它以无法查询历史轮次、异常退出可能丢失未落盘消费，以及缺 usage／价格时只提示并跳过对应指标、不维护缺失计数或补算记录为代价，换取接近旧方案的复杂度与交互开销；这些是 model-cost 的业务取舍，不是所有 extension 必须采用的框架政策。Round、response usage、实际会话及父子关系通过 framework 的宿主无关接口提供，adapter 映射原生事实，其他 harness 复用同一 shared logic；不为本方案升级通用业务 State，也不让 UI 维护另一套权威累计。

## 子代理汇总的进一步简化

本次用户放弃父 Round 含子消费口径，保留直接父 Session 关系与自身聚合；不再为追加任务、在途切界或迟到响应维护父 Round 启动标签／消费归属段。代价是不能查看某个父 Round 包含哪些子消费，收益是同一子会话持续执行仍可用稳定关系汇总 Session，不需要第二套分配数据。各实际会话自身 Round 与保存行为保留；上下文分支选择不撤销实际发生的 Session 消费。批准修订、唯一规则与原话在[数据归属 Lighthouse 的逐代理主题](../../.scratch/model-cost-migration/lighthouse/12-state-data-contract.md)，旧规则保留在[修订前历史](../../.scratch/model-cost-migration/assets/observation-revisions-before-pause-2026-10-11.md)。

## 账户周期与恢复

只保留账户级 clear：归档目标账户的活动聚合并重置，成功时关闭该账户 holiday。Session 累计为该账户本周期内该会话跨各 Round 的消费，Round 累计仅属于该轮；普通 resume 恢复已保存活动聚合，clear 后不合并旧归档、不按宿主历史 token 以当前模型／费率重算，不维护跨周期 Session lifetime total。旧值保留在归档，clear 前在途消费允许丢弃，后续新请求正常统计；以此换取直接的重置／恢复模型。其他账户、已有归档、Codex quota estimate 与入口 detail 不随该账户消费清理删除。物理更新与成功／失败边界仍由存储及命令票收口。

## 账号接入的进一步简化

本次用户选择按实际单账号需求接入 adapter，而不实现多账号管理，并接受 DeepSeek 凭据身份的限制，以无法自动识别同账号换 Key 为代价减少账号识别机制。唯一支持范围、身份规则与旧到新修订在[消费归属 Lighthouse 的账户主题](../../.scratch/model-cost-migration/lighthouse/02-accounting-ownership.md#账户隔离多会话与额度)，接入 seam 在[账户访问 Lighthouse](../../.scratch/model-cost-migration/lighthouse/04-provider-access.md)，确认原话在[本轮证据](../../.scratch/model-cost-migration/assets/provider-access-confirmation-2026-10-12.md)。本 ADR 不改变 Provider account 的领域定义，不以单账号取消同账号多会话／跨进程协调。

## 概念与实现承诺

[framework glossary](../../framework/GLOSSARY.md#facts-and-measurement-semantics)定义未知、无统计口径、确认零、指标完整性与已知小计，供各 extension 分析边界；术语存在不要求实现对应枚举、计数或恢复机制。[model-cost glossary](../../extensions/model-cost/GLOSSARY.md)只定义消费领域的专有含义，不用词义定义承载本次取舍。跳过费用不代表实际免费，已知小计不承诺覆盖 provider 的全部收费。

## 决议范围与溯源

本 ADR 记录用户确认的聚合架构取舍与理由；[数据归属与账户周期 Lighthouse](../../.scratch/model-cost-migration/lighthouse/12-state-data-contract.md)现为本票最终决议及历次暂停的完整溯源。数据票已 resolved，但迁移尚未实现；详细边界、替代关系与未决落地契约以正式 Lighthouse 及其具名交接票为准。它不改变已有账户隔离、正常响应去重、主／子代理分别统计或并发正确性要求；运行期请求详情／去重标记的寿命已确定；存储格式、保存等待／失败、可靠原生身份／实例隔离映射及最终 UI 布局仍由对应票决定。framework 的分层与 native import 责任继续遵循[语义扩展框架 ADR](0002-semantic-extension-framework.md)，本次只落地 OMP，不实现或认证其他 harness adapter。

```
