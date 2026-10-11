# 用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse

> Question and discussion: [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)
>
> 当前有效版本：按用户要求与[数据归属与账户周期决议](12-state-data-contract.md)同步，并于 2026-10-12 在原账户主题修订单账号支持和 DeepSeek 凭据身份取舍，确认来源见[账户访问原话](../assets/provider-access-confirmation-2026-10-12.md)。原题与[此前批准版本／评论](../assets/contract-history-before-sync.md)保留历史，不将已取消的补账／历史查询作为当前要求。framework 身份及已知冲突／局部清理的批准范围见[观察局部决议](03-observation-contract.md)；可信来源和原生映射仍未完成。

## Question

确定费用、token 基线、额度成对读数与缓存的归属：request／turn／round／session／owner／provider account／进程分别承担什么？主会话、子代理及 orchestration 如何计入展示与累计，怎样避免 session 统计与单请求统计双计？fork/resume/switch/tree 的基线与未结算请求如何处理？

现有 framework session/round 订阅只对 owner 派发，直接复用可能漏掉子代理观测。不能把激活 State 继承规则当成本归属规则。新统计允许从空开始，但新系统恢复和多进程并发仍需确定行为；多 main 同进程要显式决定支持或拒绝，不能顺手承诺。依据[现状调查](../assets/current-state.md)及源 daily-tracker、quota-estimate-store 确认去重与身份需求。

## Discussion

### 请求消费与自身聚合

每个可观察请求在开始时关联实际发起会话、Turn／Round、provider 账户、模型与锚价。可观察新调用／重发是新消费，即使内容相同；SDK 内隐藏传输重试不单独承诺身份／费用。归属不因模型／账户／会话切换改变，Owner State 不能替代实际会话或账户。

按可靠响应 usage 逐次计算并在内存累计，以实际会话 × 账户 × 模型的自身聚合为消费源，不保留完整历史请求账本。正常重复结束通知不再次累计；在途详情结束处理后释放，sessionId + turnId 已处理标记仅内存留至观察实例销毁，不在 round_end 清空、不按任意 TTL 淘汰、不持久化。framework 身份的批准范围见[观察局部决议](03-observation-contract.md)；具体原生关联与实例隔离仍未完成。

工具返回、Round 结束发布和 task／orchestration 汇总不产生第二笔消费。旧消息实际进入新请求时计新响应 usage，恢复读取旧消息不重新计费。

### 主会话、子代理与迟到消费

实际代理各自累计自身，可查询主自身、各子自身／含后代、主含后代；UI 三口径及展开布局仍由展示票决定。保存直接父实际会话关系，恢复沿链汇总 Session 口径；每笔请求一次，不只保存 Owner 总数，不从父总数反推子消费。

本次观察票 Q27 已修订父 Round 分配，唯一取舍及确认来源见[数据归属决议的逐代理主题](12-state-data-contract.md)：子消费只汇总到父 Session，Round 为各实际会话自身口径；不再要求启动父 Round 标签或复用子会话消费分段。关系仍随聚合发布，不加启动即落盘；直接父身份、恢复与发布仍需原生／存储契约落实；账户范围按下方已修订单账号主题，不把历史混账号场景恢复为多账号管理要求。修订前原文见 [本次修订前原文](../assets/observation-revisions-before-pause-2026-10-11.md)。

### 金额口径、缺失与冲突边界

DeepSeek 是当前计费渠道，已知请求费用计入金额；Codex 是额度渠道，美元只参考不进消费金额；token-only／hidden 无金额口径。不同性质不被解释为实际免费，不混人民币／美元为单一消费金额，也不按当前主模型过滤其他真实消费。上下文、账户测量和消费三维正交。

未知／确认零／额度消费／无口径／按指标完整性继续是领域概念，当前不要求逐请求状态记录、缺失计数或汇总持续完整性标记。正常缺 usage 提示跳过；失败／取消有可靠 usage 则计、无则跳过；有 usage 缺价仍计 token，只跳过费用并提示，不保留补账／补算状态。Codex 参考缺价不影响额度，无金额口径不因缺价报错。

已知矛盾数据不能相加或任意最后覆盖。2026-10-11 用户确认的冲突丢弃／局部清理与不提供结束后修正能力，唯一细则及确认原话见[观察局部决议](03-observation-contract.md)。此前持续标不完整／保留冲突账本分支不采用，历史保留于已链接快照；可信 usage 来源与原生关联仍需观察票验证。

### 本账户周期的 Session／Round、tree 与恢复

Session 累计限于适用账户当前周期，跨该会话各 Round；Round 累计仅本实际会话自身，子代理汇总范围以[数据归属决议](12-state-data-contract.md)本次 Q27 修订为准。只保存最近轮开始／结束快照，和 round_end 聚合同次发布／覆盖旧轮，不建立历史 Round 列表、历史位置索引或跨周期 Session lifetime total。费用快照来自已锚价累计，不以 token 差分乘当前价重算。

| 操作 | 当前有效行为 |
| --- | --- |
| resume | 读取本周期已保存活动聚合，可明确展示最近 Round；不重估宿主历史、不自动合并旧归档 |
| switch | 选择目标会话本周期视图，已开始请求仍归原身份（账户 clear 的丢弃是显式例外） |
| tree | 不回滚本周期 Session；该历史位置 Round 隐藏或不可用，不冒充零／最近轮 |
| fork | 新实际会话自身从零，复制消息不是新消费；原会话本周期统计不被 fork 回滚 |
| 账户 clear | 归档目标账户全部会话已成功保存聚合，重置本周期并关闭 holiday；输入范围按[存储局部决议](06-local-storage.md)Q15，旧值只在归档中 |

正常从历史位置继续触发新的实际活动按 framework Round 规则归属，不查询或恢复已经放弃的历史 Round。开放 Round 跨 clear 的统计快照映射尚未定型，不能伪造新轮。

### 恢复损失与账户重置例外

只恢复成功保存的聚合；强杀／崩溃的未发布内存消费可丢，不要求可靠未入账记录补账／恢复日志，不自动重发以补账、不以当前价猜收费。round_end 触发保存；不预建退出／切换／重载独立排空钩子。落盘幂等、等待／失败及多进程发布仍需存储票确定。

仅保留账户级 clear：归档后重置目标账户活动累计及相关业务关联，成功关闭 holiday，空消费也可关闭。clear 前开始未入账的该账户请求之后丢弃，旧缓存／排队保存不能复活它；clear 后新请求正常计，包括旧子代理重新利用真实关系的消费。不清其他账户、已有归档、Codex estimate 或入口 detail，不取消真实执行或改 framework 活动态。

### 账户隔离、多会话与额度

账户在领域上仍是 provider 计费／额度身份，不是 Owner、进程或当前主会话；本次实现的支持范围于 2026-10-12 明确收窄为 DeepSeek／Codex 各自一个当前配置账号，允许前后替换，不实现多账号选择、自动轮换或逐请求账号追踪。Codex 发现多账号配置时报告不支持并跳过额度查询，不阻断模型执行；这不是新增账号管理 interface。原「主子可同时使用不同账号／需要多账号选择」不再是本次验收要求；主子使用不同 provider／模型仍支持，同账号多会话／子代理／跨进程协调不取消。

Codex 使用可靠 provider 账号身份；DeepSeek 接受按当前有效凭据的稳定、非秘密标识划分统计范围，不能把宿主本地 credentialId 当跨进程平台账号 ID。同账号换 Key 也视为新范围，不自动识别／合并旧累计或 holiday、不删旧数据；代价是无法连续统计同账号的不同 Key，收益是不增加远端账号查询或人工映射。换身份使用自己的周期／读数／estimate，不将旧值当新身份值；保留文件中的旧身份记录与查询所需关系不被当前操作顺带删除。具体稳定标识及 native 映射交装配落实，不冻结算法。

旧要求 → 新取舍的确认来源：[账户访问会话原话](../assets/provider-access-confirmation-2026-10-12.md)（单账号范围、Q3 凭据身份 tradeoff、Q12 结案确认）；此前真实平台账号／混账号全面支持要求仅作被替代历史，见[旧批准历史](../assets/contract-history-before-sync.md)。当前访问资料 interface 与替换生效限制只在[账户访问 Lighthouse](04-provider-access.md)，本主题持有统计身份／支持范围唯一政策。

支持同／跨进程多个独立 main，同一 session 单执行者，拒绝并发驱动；检测／实现层待定。正常同账户并发不得丢失、重复或覆盖其他会话贡献，不把已接受的异常退出／缺事实／clear 损失扩张成忽略并发正确性。讨论 clear 时单一 DeepSeek 活动会话只是推演假设，不是已取消的支持范围。

最新余额／双窗口、获取时间、加载／错误是账户级内存，换会话不自动清账户测量基线；换账户读自己的值。quota estimate 基线／采纳值持久化，读数同源成对、不拼跨来源窗口；不做 Codex 会话消费与账户额度分摊／换算。

## Decision

在本次单账号支持及已确认统计身份范围内，以可观察请求的可靠消费为输入、实际会话 × 统计身份 × 模型自身聚合为源，沿父子启动关系无重复汇总，身份隔离和正常同账号并发正确性保留。累计限于账户当前周期，历史只保留最近 Round／归档；缺事实不补账、未保存损失可接受，账户 clear 是显式重置，不按恢复时当前价重算历史。

## User stories

1. As a 用户, I want 区分主自身与各子消费, so that 理解任务成本来源。
2. As a 用户, I want 按直接父 Session 链查看含后代本周期累计, so that 嵌套请求不重复收费且不维护父 Round 消费分配。
3. As a 用户, I want 请求归属与锚价固定, so that 当前模型／账户切换不重解释旧消费。
4. As a 用户, I want tree 的历史位置 Round 不可用且 Session 本周期不回滚, so that 不把最近轮伪装成历史查询。
5. As a 用户, I want 领域概念区分未知／额度／无口径／确认零而运行时简化, so that 跳过金额不被解释成免费且不强迫完整性状态系统。
6. As a 用户, I want 可靠 usage 按身份累计、重复不计、缺 usage 跳过, so that 取消重发的正常消费正确且不引入补账日志。
7. As a 用户, I want 多会话同账户正常并发正确, so that 跨终端累计不丢不重且其他账户隔离。
8. As a 用户, I want Codex 额度与参考费用不当现金消费, so that 不误做会话额度换算或混币种总额。
9. As a 开发者, I want 唯一自身聚合与只读派生视图, so that renderer／父子汇总不会成为第二份权威消费。
10. As a 用户, I want 明确缺失跳过与已知冲突丢弃边界, so that 不猜补费用也不把已知矛盾数据随意覆盖。

## Preconditions

- [行为契约](01-behavior-contract.md)提供仍保留的功能与计价基线；[数据归属与账户周期决议](12-state-data-contract.md)明确最新布局／寿命及有意简化，不重新决定完整账本。
- [观察契约](../decision/03-observation-contract.md)提供可靠 Turn／实际会话／usage 与结束交付原则；[账户访问决议](04-provider-access.md)提供当前访问资料，统计身份按本节单账号／DeepSeek 凭据范围修订，未知不能并公共默认身份。
- [存储协调](../decision/06-local-storage.md)决定物理聚合／关系／最近快照、发布／归档／reset／关闭 holiday、幂等／锁／失败；[模型覆盖](../decision/13-model-catalog-policy.md)决定适用计价与名单。
- [展示](../decision/08-presentation.md)、[刷新](../decision/09-refresh-lifecycle.md)、[命令](../decision/07-command-state.md)、[装配](../decision/10-assembly-layout.md)、[验收](../decision/11-acceptance-cutover.md)仍各自未决，不把来源交接当生产实现。

## Postconditions

- 普通消费保存失败的当前取舍及已确认损失范围以[存储局部决议](06-local-storage.md)修订 Q6／Q11 为唯一权威；此处不将正常并发正确性或仅异常退出的旧描述用于否定该显式修订，业务布局与普通 resume 结论不变。

- 后续按扩展自有聚合、有限运行期关联、父子关系与本周期恢复设计，不要求历史 Turn／Round 留存、缺失补齐或跨周期 Session 总数。
- 自身／含后代、账户／渠道口径可派生，实际请求不重复；无金额贡献不代表实际零消费。
- 验收覆盖可靠响应、重发／重复、最近轮／tree／resume、账户 clear、父子与多会话正常并发及已确认损失边界，不按原旧验收恢复已取消要求。
- 冲突丢弃／局部清理及身份已批准范围以[观察局部决议](03-observation-contract.md)为准；可信来源、宿主实例隔离、物理发布、调度和最终 UI 尚需具名票收口，文档不代表能力已实现。

## Invariants

- 一个可观察请求在同一范围最多贡献一次，汇总不是新消费；隐藏尝试不承诺独立完整观测。
- 请求开始的实际归属和锚价不随当前会话／模型／账户改变，不用当前价重估。
- 未知／额度／无口径不等于免费；不据概念要求缺失计数或补账状态。
- Session 本周期不因 tree／删改消息／fork 回滚；成功账户 clear 是显式重置例外，旧归档不自动并回。
- 聚合不改 framework Turn／Round 活动含义；旧子新请求与同一 Turn 后到 usage 修正分开，后者不提供修正能力，已知冲突处理见[观察局部决议](03-observation-contract.md)。
- Owner State 继承不决定消费；通用词义归 framework，消费词义归 model-cost glossary。
- 按本票当前统计身份范围隔离、正常请求去重与同账号多会话并发同时成立；不据此要求已取消的多账号选择／轮换，已批准损失边界不被默扩张。
- 上下文、账户测量和消费保持正交，不累加子上下文为主预算，不换算 Codex 账户额度为 Session 消费。

## Historical ticket body

同步前批准版本及原有票体／评论完整见[历史快照](../assets/contract-history-before-sync.md)。当前正文已同步，不要求读者把历史补账／完整性／历史 Round 条款当有效承诺。

