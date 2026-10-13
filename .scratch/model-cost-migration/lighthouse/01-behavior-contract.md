# 完整保留哪些业务行为，统计单位如何命名？：Lighthouse

> Question and discussion: [完整保留哪些业务行为，统计单位如何命名？](../decision/01-behavior-contract.md)
>
> 当前有效版本：按用户要求，与[数据归属与账户周期决议](12-state-data-contract.md)及观察票已确认的公共术语同步。原题保留为提问历史；此前批准版本及评论完整保存在[同步前历史快照](../assets/contract-history-before-sync.md)。未决接口不因正文修正获批，生产迁移尚未实施。

## Question

基于[现状调查](../assets/current-state.md)，逐项确认 DeepSeek／Codex／token-only／hidden、预算与 Effort、峰谷和 holiday、请求计价、余额、累计与分段条、双窗口节奏、ratio/left、预算命令、刷新和故障显示哪些原有行为要原样保留，哪些有意改变？用户已确认全量保留基线，不得默删 README 未记载的额度估计。

明确 Request、Assistant response、Turn、Round、Agent activity state、Total、旧 UI 的 Turn 及 orchestration 的业务含义；旧 agent_end 结算不能仅因名称接近就映射 round_end。讨论两源预取 TTL 表述与实现不一致、render 更新业务态的耦合，以及 UI 标签是否改名。输出一份用户确认的行为契约和场景；本票不决定框架接口，也不迁移代码。

## Discussion

### 本轮批准修订与来源

本轮功能基线消费[数据原主题的 Session-only 修订](12-state-data-contract.md#最近-roundtree-与恢复展示)与[命令原主题的首次 holiday 切周期](07-command-state.md#holiday-与-clear当前入口适用条件)，不再要求最近 Round 落盘／恢复。确认原话见[本轮存储 schema 确认来源](../assets/storage-schema-confirmation-2026-10-12.md)，修订前原文见[发布前快照](../assets/storage-schema-before-publication-2026-10-12.md)。

功能保留基线消费新的 provider 单一统计范围与整文件 clear；详情命令沿用旧入口偏好，不隐式扩大所有 provider 的展示覆盖。 批准来源：[命令票本轮确认来源](../assets/command-confirmation-2026-10-12.md)（Q13–Q16、Q17–Q20）。此前账号键／身份分区和定点 clear 的政策仅为已被替代历史；不要求认证秘密落盘。非本轮替代范围继续有效，规划不等于实现。

本次展示访谈 Q33 已批准[展示原主题](08-presentation.md)的视觉保留与显式统计／detail 修订；这替代旧 detail 字段展开及尚未确定 UI 标签／布局的描述，不恢复旧 UI 的重价或逐 Turn 解释。确认原话与旧→新范围见[展示来源](../assets/presentation-confirmation-2026-10-12.md)，发布前正文见[历史](../assets/presentation-before-publication-2026-10-12.md)。展示规则只在该 Lighthouse 持有；未批准的远端调度与具体接线仍未决。

### 公共术语与活动边界

Request／Turn 采用可观察模型调用周期；Turn 从请求开始，可以完成、失败或取消而没有完整响应，隐藏传输重试不拆成独立可观察 Turn。工具执行独立于 Turn、属于 Round；工具结果只有实际进入后续模型请求时，才由该请求 usage 计费。公共词义以[framework glossary](../../../framework/GLOSSARY.md)为准。

Round 是实际会话的连续活动周期，工具、已知自动续跑、排队输入消费、专门交互以及会驱动父继续的子代理等待不随意切轮。明确结束与漏信号／恢复截断不同；framework 活动轴 idle／working 与 connect-bot 面板协议分开。具体原生映射、候选复查及接口仍由[观察契约](../decision/03-observation-contract.md)收口，本票不替它结案。

### 请求锚价、聚合与展示口径

保留请求开始锚价、逐响应可靠 usage 计价，内存累计与 Round 生命周期分离。工具结果、Round 结束和父子汇总不产生第二笔消费。逐响应计算不等于逐响应落盘；本次以 round_end 发布 Session 聚合，Round 仅运行期推断，接受成功保存前的异常退出损失，不预建独立排空钩子或崩溃日志，详见[数据决议](12-state-data-contract.md)。

Session totals 是当前消费统计周期内该会话跨各 Round 的累计；Round totals 是其中某一轮，不是整个周期。自身／子代理／整体为 Session 视图，Round 仅本实际会话自身；子代理口径按[数据归属决议](12-state-data-contract.md)本次 Q27 修订，不再提供父 Round 含子汇总；正常连续对话须显示最近一 Round（进行中或刚结束）；不持久化轮次快照，resume/tree 不要求恢复 Round，不把不可用显示成零，Session 本周期累计不随 tree 回滚。普通 resume 读取已保存活动聚合，不按宿主历史 token 用当前模型／费率重算，不自动合并旧归档。历史旧 UI Turn 指原生结算差分，不等于新 Turn 或完整 Round。

用户观察旧计价基本对应官网是保留算法的依据，不是独立账单认证。[旧聚合探针](../assets/old-accounting-granularity-smoke.md)的两次峰／谷请求累计为 13.5 元，按结束时谷价重算为 9 元；[旧 clear／resume 调查](../assets/old-clear-resume-smoke.md)区分 Total 显示重估与 Accrued 落盘，不宣称新生产能力已通过验收。

### 保留功能与已确认修剪

provider 的 Codex／官方 DeepSeek／token-only／hidden 分层保留，具体 model ID、名单和维护来源由[模型覆盖票](../decision/13-model-catalog-policy.md)决定。framework 单账号支持与不识别统计身份的修订按[消费归属当前修订](02-accounting-ownership.md#账户隔离多会话与额度)，访问职责按[账户访问决议](04-provider-access.md)；不由全量旧功能基线恢复多账号管理或 DeepSeek 平台账号识别。

固定 DeepSeek 450K、Codex 272K 上下文预算显示／告警保留，只显示不限制执行；数字／K／0 修改预算功能已取消，不再把旧最高 1000K 的可调预算入口作为迁移要求。Effort 取实际生效值、未知为 ?、只给值着色。

保留北京时间工作日 09:00–12:00、14:00–18:00 含端点峰价，其他时段／周末谷价；holiday 手动谷价、不追溯，持续到成功 clear；首次开启的整文件归档／切周期修订只消费[命令原主题](07-command-state.md#holiday-与-clear当前入口适用条件)。每请求锚价、DeepSeek 不另计 cacheWrite 继续生效。

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
- [账户访问](../decision/04-provider-access.md)、[HTTP](../decision/05-http-capability.md)、[存储协调](../decision/06-local-storage.md)提供当前认证资料、传输与聚合发布；[命令](07-command-state.md)与[展示](08-presentation.md)已确认本轮交互范围；[刷新](../decision/09-refresh-lifecycle.md)继续决定未决远端调度。
- [装配](../decision/10-assembly-layout.md)、[验收与切换](../decision/11-acceptance-cutover.md)、[模型覆盖](../decision/13-model-catalog-policy.md)仍未结案。支持基线与 source oracle 须显式核验，不凭事件同名宣称完成。

## Postconditions

- 后续工作采用当前功能清单与明确已批准修剪，不重新要求预算修改、历史 Round 账本、缺失补算或跨周期 Session 总数。
- 价格算法、额度基线、固定预算、反馈及数据寿命继续约束后续票；最小逻辑布局由数据 Lighthouse 提供，不另造通用 State。
- 最终 UI 与无 UI 记账／错误可见范围由[展示权威](08-presentation.md)持有；原生接口、TTL 与无 UI 远端刷新仍由对应 open 票决定。规划发布不交付生产行为。
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

