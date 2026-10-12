# 用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？：Lighthouse

> Question and discussion: [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](../decision/02-accounting-ownership.md)
>
> 当前有效版本：按用户要求与[数据归属与账户周期决议](12-state-data-contract.md)同步，并于 2026-10-12 在原账户主题修订单账号支持和 DeepSeek 凭据身份取舍，确认来源见[账户访问原话](../assets/provider-access-confirmation-2026-10-12.md)。原题与[此前批准版本／评论](../assets/contract-history-before-sync.md)保留历史，不将已取消的补账／历史查询作为当前要求。framework 身份及已知冲突／局部清理的批准范围见[观察局部决议](03-observation-contract.md)；可信来源和原生映射仍未完成。

## Question

确定费用、token 基线、额度成对读数与缓存的归属：request／turn／round／session／owner／provider account／进程分别承担什么？主会话、子代理及 orchestration 如何计入展示与累计，怎样避免 session 统计与单请求统计双计？fork/resume/switch/tree 的基线与未结算请求如何处理？

现有 framework session/round 订阅只对 owner 派发，直接复用可能漏掉子代理观测。不能把激活 State 继承规则当成本归属规则。新统计允许从空开始，但新系统恢复和多进程并发仍需确定行为；多 main 同进程要显式决定支持或拒绝，不能顺手承诺。依据[现状调查](../assets/current-state.md)及源 daily-tracker、quota-estimate-store 确认去重与身份需求。

## Discussion

### 本轮批准修订与来源

本轮持久身份为 harness＋实际 sessionId，物理命名空间与 list 只在[存储 Q25](06-local-storage.md)；Round 恢复与首次 holiday 行为消费[数据](12-state-data-contract.md#最近-roundtree-与恢复展示)和[命令](07-command-state.md#holiday-与-clear当前入口适用条件)原权威。确认原话见[本轮存储 schema 确认来源](../assets/storage-schema-confirmation-2026-10-12.md)，修订前原文见[发布前快照](../assets/storage-schema-before-publication-2026-10-12.md)。

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

Session 累计限于当前消费统计周期，跨该会话各 Round；Round 累计仅本实际会话自身，子代理汇总范围以[数据归属决议](12-state-data-contract.md)本次 Q27 修订为准。Round 寿命与恢复仅消费[数据原主题的 Session-only 修订](12-state-data-contract.md#最近-roundtree-与恢复展示)：Round 不落盘，正常连续对话可看上一 Round，resume/tree 不要求恢复 Round；Session 持久累计仍可恢复，不建立历史索引或跨周期 lifetime，不以当前价重算。

| 操作 | 当前有效行为 |
| --- | --- |
| resume | 恢复本周期 Session 活动聚合，不要求恢复 Round；不重估宿主历史、不自动合并旧归档 |
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
- [存储协调](../decision/06-local-storage.md)决定物理 Session 聚合／关系、发布／归档／reset／holiday 切周期、幂等／锁／失败；[模型覆盖](../decision/13-model-catalog-policy.md)决定适用计价与名单。
- [展示](../decision/08-presentation.md)、[刷新](../decision/09-refresh-lifecycle.md)、[命令](../decision/07-command-state.md)、[装配](../decision/10-assembly-layout.md)、[验收](../decision/11-acceptance-cutover.md)仍各自未决，不把来源交接当生产实现。

## Postconditions

- 普通消费保存失败的当前取舍及已确认损失范围以[存储局部决议](06-local-storage.md)修订 Q6／Q11 为唯一权威；此处不将正常并发正确性或仅异常退出的旧描述用于否定该显式修订，业务布局与普通 resume 结论不变。

- 后续按扩展自有聚合、有限运行期关联、父子关系与本周期恢复设计，不要求历史 Turn／Round 留存、缺失补齐或跨周期 Session 总数。
- 自身／含后代、账户／渠道口径可派生，实际请求不重复；无金额贡献不代表实际零消费。
- 验收覆盖可靠响应、重发／重复、正常连续对话上一 Round／tree／resume 的 Session 恢复、整文件 clear／首次 holiday 切周期、父子与多会话正常并发及已确认损失边界，不按原旧验收恢复已取消要求。
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

