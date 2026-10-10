# framework 如何提供请求、响应、Turn／Round 与模型事实观测？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 02, 12, 06
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Handoff from storage Q5

[存储局部决议](../lighthouse/06-local-storage.md)已确认：model-cost 的 round_end handler 捕获稳定快照后提交非阻塞安全更新，继续不依赖保存结果且不写同一文件的独立逻辑，完成前 await 收口保存任务，包括提前返回／异常路径；不是 fire-and-forget。本票需核对实际派发／异步 handler 的完成映射，不由此决定全部生命周期 callback 必须等待所有远端刷新。存储错误与协调仍未决，整票依赖尚未解除。

## Handoff from storage Q6

[存储局部决议](../lighthouse/06-local-storage.md)Q6 已确认普通 round_end 保存失败不因此中止代理主流程；Q5 的 handler 返回前收口仍成立，不因允许失败而 fire-and-forget。反馈承载交展示票，独立业务错误与保存错误同时发生仍待存储票，不据 Q6 吞掉非保存错误。

## Handoff from storage Q8 / Q9

Q8／Q9 的确认来源为[存储局部决议](../lighthouse/06-local-storage.md)：旧周期提交不能重绑定到新周期；等待取协调权限时可取消，取消后不迟到写入，更新开始后等待实际结果。本票决定实际实例／生命周期的取消信号映射，不因统计拒绝取消真实模型执行或伪造 Round 结束。

## Handoff from revised failure policy

当前有效失败策略以[存储局部决议](../lighthouse/06-local-storage.md)修订 Q6／Q11 为准：用户已接受所有普通消费保存失败后丢弃未保存部分、从磁盘有效完整快照初始化，不自动重试／修复／补账；读不到有效磁盘则报告并停止这次保存，不猜零覆盖。此交接替代本票旧“保留内存／不回滚／下次带上未保存消费”措辞，不改变正常并发／账户隔离／去重，clear 与 estimate 失败仍分别未决。 不清 sessionId + turnId 已处理标记、不重新计入已丢弃响应，不伪造 framework 生命周期结束。

## Handoff from storage Q13 / Q14

[存储局部决议](../lighthouse/06-local-storage.md)Q14 已确认失败初始化无有效磁盘基线时暂停本实例消费统计／保存，不取消模型执行、不伪造 Round 结束；到下一次正常会话初始化加载，不主动探测／补算。本票提供该初始化事实与实例关联；已处理身份不因暂停清空，独立余额／额度不自动停用。

## Question

设计 framework 拥有且由 OMP adapter 映射的观测契约：请求开始时刻与身份、HTTP 响应 headers/metadata、assistant 完成的 token usage、响应计费事实、工具执行、Round 边缘分别何时派发、如何关联？模型／provider／catalog cost、实际 Effort、上下文 tokens、会话累计／orchestration 统计与会话身份以什么小接口提供？

确定顺序、异常／中止／无 usage、模型在 Round 内切换、每请求价格锚定及不可用观测的含义。不把原生 payload 整体透传，也不让 provider-specific Codex header parser 进入语义 core。审查已有 requiredSemantics、owner 门控、生命周期与异步 handler 支持是否适用；缺失能力不得伪造成功。按选定基线核对原生映射并要求实际链路证据。

## Handoff from aggregate-data discussion

- [数据讨论当前有效决定](12-state-data-contract.md)将聚合及其取舍放在 model-cost shared logic；本票提供 harness-independent Turn／response usage／Round 与身份事实，不反向要求完整业务账本。
- 用户已收窄缺 usage 处理：不记录计数或补账记录，正常完成却缺 usage 则打印提示并跳过；失败／取消有可靠 usage 则累计，无 usage 则跳过并接受少计，不承诺补齐。具体替代范围以正式数据 Lighthouse 为准；旧 Lighthouse 有效正文已按用户要求同步，修订前版本保留快照；正常响应一定有 usage 不是所有 provider 已认证的事实，adapter 不得伪造 usage 或确认零。

## Trace handoff from data Lighthouse

追踪记录：[数据决议 Backtracer 报告](../assets/state-data-backtrace.md)。

- 一致性核对仍待本票收口：本票旧“迟到 usage 补原 Turn／Round”不能被解释为 model-cost 仍需给已按缺 usage 跳过的请求补账；这项业务义务已由数据 Lighthouse 收窄。旧子代理新请求的迟到消费与已处理同一 Turn 的 usage 修正要区分，framework 是否另保留通用修正能力仍未批准。
- 旧消费归属决议要求已知冲突保留证据／标记不完整；新业务只留已处理身份并不维护持续完整性状态。需要明确可信来源、终结交付与冲突处理在有限关联方案中的边界，不能当普通重复通知静默推导为任意覆盖或自动取消旧约束。此为本票未决问题，不在本次替用户批准新机制。

- 数据票已 resolved，存储仍是本票未满足前置。最终事实／运行期处理约束来源为[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)，不再按旧数据票暂停入口重问。
- 请求详情处理后释放，已处理 sessionId + turnId 仅内存保留到观察实例销毁，不在 round_end 清空，不按任意 TTL 淘汰；缺 usage 已跳过也视为处理完毕，不补账。需确定可靠身份、旧实例回调隔离与正常重复结束通知防重，不以持久账本解决。
- 账户 clear 使该账户旧在途关联失效；结束不因找不到旧 ID 被重绑定新轮。旧子代理之后的新请求正常统计并能重新取得真实启动关系，不清 framework Round／活动事实。开放 Round 跨账户 reset 的快照、重用子会话不同启动的分段、混账户父子关系映射仍待明确，不造新的生命周期边缘。
- 当前 Round 子消费只能按启动关系筛选，不能用含所有后代的 Session 总差值。正常缺 usage／价格的提示和跳过是已确认边界，所有 provider 的可靠来源认证并未完成。

## 当前恢复入口：先建立数据／存储心智模型

- 用户指出原顺序缺少实现前提：Turn 数据放在哪里、谁读写、何时持久化尚未确定，却要求选择回调同步／异步。Q10 原提议与修订提议均未获确认，暂停，不视为新接口契约。
- 本次对话进一步选择聚合实现作为起点，具体取舍、tree 运行证据和新对话入口以[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)前部交接为准；本票的细粒度观测／身份方案须与该实现需求核对，不反过来强制逐 Turn 持久化。数据票已 resolved；本票仍 open、未认领，等待存储前置。
- 本票释放认领并依赖数据／State 与存储票；[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)已完成数据布局；先处理[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)，得到具体发布／失败／等待方案后返回本票。此入口优先于下方旧暂停交接。
- 已确认业务要求、原生事实与局部接口决定保留；不因路线修正自动撤销用户已确认的选择。未结案接口要在具体实现中核对适用性，必要修订带理由再确认；用户已要求旧 Lighthouse 当前正文同步最新决策，修订前版本保留历史快照。
- 严格区分内存读写、历史查询、持久化／锁等待、远端刷新、渲染，各自说明执行路径和失败／等待影响后再作决定。不把 callback 是否 async 当作统一的读写策略。

## 当前有效决策（续聊优先读取）

本节是用户已确认的当前讨论结果；下方 Comments 保留推导过程及已替代提议。它不是整票结案或最终 lighthouse；未决问题不得据此视为已批准。

1. **Round 采用连续活动周期（A）**，不按每条普通用户消息或输入消费批次切轮，不分析任务语义。工具、自动重试／续跑、排队消息消费、专门批准／交互都可留在同一 Round。普通文本澄清若代理已结束并等待输入，回答触发的新执行才开启新 Round。
2. **按原生 start 与已知续跑开轮／补救**：没有开放 Round 时 agent_start 开新轮；已观测上次 agent_end.willContinue === true 时后续 start 继续旧轮；否则后续 start 即使旧轮未关闭，也以漏 end 截断旧轮并开新轮。补救截断不冒充正常完成，不产生面板 awaiting-input；如果连续跑通知也丢失，允许一次连续活动被拆为多轮。此用户确认规则替代早先“只要已有开放 Round 就忽略后续 start”的无条件去重。
3. **终轮不能直接照搬每个 agent_end**：仅在宿主确认连续活动终止、不再继续当前活动时，关闭已开放 Round 并派发一次 round_end。用户确认最小 OMP 映射方向：willContinue === true 保持同轮，否则辅以本会话 idle／pending-message 事实判断结束，不额外要求全部后台 running jobs 归零。pi 映射方向为 agent_settled。确认方向不等于所有判定／链路已验证。
4. **正常结束、明确取消与终止失败均能终轮**；请求／工具失败后仍有自动处理则不终轮。后到事实仍关联原 Turn／Round，不重新开启生命周期；model-cost 已按缺 usage 跳过的请求不补账，通用后到修正能力是否提供仍待本票决定。结束原因需要有事实依据；事件载荷与异常归因规则尚未定型。
5. **framework 主活动轴为 idle／working**。working 包含工具、重试、续跑和开放 Round 内的专门交互；idle 表示当前活动已停止、没有待续执行，等待新输入。无法可靠观测不默认 idle；未知是事实可用性问题，不是第三种已批准的业务活动状态。
6. **connect-bot 保留既有三态协议与业务**。公共 idle／working 与“本次接入后是否已观测 Round 结束”是不同事实：工作时报 working；空闲且尚未观测结束时报面板 idle；观测结束后的空闲时报 awaiting-input。保留 omp-bot 的监控／自动关机语义，不将其整体二态化，也不在本地图执行生产修改。
7. **证据先于抽象**：先查宿主事件／派发位置／可用事实，再定契约；分别注明源码可见、实际链路可用与运行验证。观察面不能伪造请求身份、统计完整性或等待状态。实际会话身份与 State Owner 不混用；逐请求／逐子代理及多 main 的需求继续受[消费归属决议](../lighthouse/02-accounting-ownership.md)约束。

8. **恢复／重载允许截断轮次**：用户确认关闭此前未完成 Round，原因是恢复／重载截断，不冒充正常完成、取消或已确认失败，不作为 connect-bot 的活动结束证据。恢复后已知 working 则开启新 Round；idle 则等实际执行才开轮。可靠的新消费仍按原启动关系归属，已跳过请求及账户 clear 前在途响应不补回；哪些操作构成恢复／重载及旧实例隔离仍待明确。
9. **等待子代理结果的父 Round 保持开放**：用户确认阻塞等待、后台结果将自动回传并驱动父继续、以及父正在处理子结果时，父均保持 working／同一 Round。只有子已脱离当前活动、没有自动续跑且父实际停止，父才可结束；子自身 start/end 不关闭父轮。按实际 session 隔离开闭，消费按启动关系归属，不因某个子处于 running 就强制所有父轮等待。此规则满足用户日常场景，Round 基础定义与最小信号表收口，不再展开任务语义推断。

10. **Turn 身份命名**：用户提出用 Turn ID 表达 framework 的请求／响应关联身份，沿用既有“一次 Request 与对应 Assistant response 构成 Turn”的概念；本轮采用 Turn identity／turnId，不另造同义的 framework Request ID。provider 返回的请求 ID 与它不是同一概念。此命名不证明宿主已能可靠关联重试与响应，也不视为用户已确认上一轮 Q1 的全部关联方案；身份建立时点与失败／取消时的表达已由下文 Q3 确认；具体宿主关联、生成方式与唯一性范围仍待明确。
11. **请求观察只读**：用户确认新请求开始观察接口不兼任 payload 修改入口；本次只提供所需观察事实，其他 framework 能力以后按需扩展，不顺带设计或实施通用 payload 修改能力。

12. **Turn 从请求开始即存在**：用户确认 Q3；可靠观测到请求开始时建立 Turn、分配 turnId，并固定该次请求归属与计价所需事实。后续可可靠关联的响应元数据、assistant response 与 usage 关联同一 turnId。取消、失败或没有完整响应不删除该 Turn，也不伪造响应完成；可观察的新调用／重发是新 Turn，重复观测／迟到 usage 属原 Turn。宿主内部隐藏传输重试的粒度已由 Q8 收口为同一可观察调用；其他重试路径是否可逐次识别仍依链路证据，不按每次钩子盲目生成身份。Turn glossary 已据此明确可能未完成的周期。

13. **公共 Turn 观察收敛为开始／结束**：用户确认修订 Q4；采用 turn_start／turn_end 两个公共生命周期观察，不分别暴露响应元数据到达和 usage 到达事件。adapter 内部收集宿主事实，turn_end 尽力提供结束时已有的响应元数据、headers 与 usage，缺失明确缺失；正常完成／取消／失败作为结束结果而非独立公共事件。用户明确接受 Codex 响应头读数由旧 after_provider_response 即时更新，改为 Turn 结束时交付并更新，保留额度解析与估计功能。不为提前显示额度增加第三事件。model-cost 不补已按缺 usage 跳过的请求；framework 是否另提供通用后到事实修正、宿主支持与交付方式仍待本票决定，不先建额外事件。

14. **Turn 开始／结束最小载荷**：用户确认 Q5；turn_start 提供 turnId、实际发起 sessionId、所属 roundId、请求开始时间、该次 provider／模型身份；turn_end 提供同一 turnId、结束时间、结束结果，以及已取得的 usage、HTTP status／headers、provider request ID。开始时归属与模型事实固定，结束不读当前模型替代；缺失明确缺失，不伪造零。不透传原生 payload、消息历史或宿主 context。framework 提供源事实，model-cost 拥有价格锚定、金额计算与 Codex header 解析。账户身份取得由账户访问票承接；catalog 价格快照及实际 Effort／上下文只读事实的语义已由后续讨论确认，字段、可靠来源和原生验证仍未完成。此为载荷语义，字段命名细节与原生映射／运行证据未冻结。

15. **请求时固定 catalog 价格**：用户确认 Q6；turn_start 模型快照附带可可靠取得的 catalog 价格与明确币种／单位，供该 Turn 使用，不在结束时重查或用当前价格补猜。framework 只提供事实；DeepSeek 峰谷／holiday 锚价仍归 model-cost，Codex catalog 价格只用于参考费用，不参加消费金额累计。
16. **当前会话事实采用只读快照**：用户确认 Q7；以一个小的只读接口提供当前模型、可确认的实际 Effort、上下文占用与窗口大小。读取不发请求、不写统计、不更新业务态；无法确认实际 Effort 则未知，不以配置值冒充。当前快照与 Turn 固定历史事实分开，上下文占用不等于 Session 累计 token。具体刷新时机交刷新生命周期票；原生映射和实际生效值验证未因此获批或完成。

17. **接受隐藏传输重试的观测范围**：用户确认 Q8，并理解重试可在 harness／provider SDK 内部处理、不暴露给框架所接的扩展钩子。本次以可观察模型调用周期定义 Request／Turn；隐藏 HTTP 尝试不独立生成 turnId，使用可观察开始时刻锚价和可靠取得的最终 usage，不承诺隐藏尝试逐次身份、usage、锚时或完整费用。本次不新增底层传输拦截。可观察的新调用仍独立记录，包括取消修改后重发、工具后请求、暴露出新请求开始的重试；不将所有自动重试都合为同一 Turn。该决定明确收窄此前“实际重发独立记录”的覆盖范围；历史 lighthouse 保留，最终本票 lighthouse 必须交代修订及支持范围。

18. **观察回调失败隔离**：用户确认 Q9；turn_start／turn_end 观察回调出错不阻断模型请求、工具或后续代理执行，报告故障，不静默吞掉异常或把失败统计更新标成功。同步异常与异步回调失败均受此规则约束；本次不顺带增加观察回调自动重试。此决定不取消同一 session 单执行者及必要宿主能力前置条件，也不决定存储损坏的业务恢复策略。异步处理是否等待／如何排序仍待明确。

### 已确认的最小信号表

| 本会话观测 | 处理 |
| --- | --- |
| agent_start，无开放轮次 | 开新 Round |
| 上次已观测 agent_end.willContinue=true，随后 agent_start | 继续旧 Round |
| 其他 agent_start，旧轮仍开放 | 以漏 end 补救截断旧轮，开新轮 |
| agent_end.willContinue=true | 不终轮，记录已知续跑 |
| 其他 agent_end | 结束候选；实际静止后终轮，不能仅在同步回调检查一次 |
| 恢复／重载 | 截断旧轮；已知 working 开新轮，idle 等实际执行 |

补救／恢复截断不冒充正常完成，不制造面板 awaiting-input。续跑通知本身缺失时允许拆轮，不靠任务语义猜测。表按实际会话应用；子／孙代理观测与父 Round 消费归属证据见[OMP 子代理 Round 信号与归属调查](../assets/omp-subagent-round-findings.md)。

**替代关系**：Q4 的逐普通消息开轮已由 A 替代；Q6 的输入批次方案未被采纳。Q1 的普通文本澄清“只要仍属同一语义任务就留旧轮”不是现行规则，专门批准／交互例外保留。旧 lighthouse 是先前已确认决议的来源，本票最终 lighthouse 必须说明这些修订，而不是修改历史记录冒充从未改变。

## 新对话交接

- 用户本次再次要求保存决策并在新对话继续 grilling。**Round 基础规则、最小信号表、恢复／重载截断和子代理等待时父 Round 保持开放已确认并收口**；请求／响应观测及公共接口尚未完成。本票释放认领回 open，Assignee 清空，不标记 resolved。下次先认领同一票，不新建重复票。
- 用户强调：从实际宿主信号与日常使用场景出发，优先采用简单可识别的规则，再为丢失信号补救；不要重新展开抽象 Round 定义，不追求用任务语义完美还原边界。用户已接受：已知续跑保持同轮；否则下一次 start 可截断未关闭旧轮，即使丢失续跑通知使一次活动被拆成多轮。
- **存储前置满足后从 Request／响应观测继续**：核对 before_provider_request → after_provider_response → message_end 的真实关联、重试／取消及逐子代理支持，再 grilling 接口。前部当前有效决策和最小信号表是续聊基线，不把历史 Comments 的旧提议当现行规则。
- 读取顺序：tracker 约定 → [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md) → 本节与当前有效决策 → 前置 lighthouse／事实资产按需展开。不要把下方历史 Comments 中的旧方案作为当前定义。
- 调用 grilling 与 domain-modeling；接口设计咨询 codebase-design。保持地图规划模式，不进行生产实现。最终整票完成时仍须用户确认 lighthouse 草案、写文档再 resolved，随后 backtracer；此次暂停不执行结案流程。

### 尚待解决（不是已确认接口）

- Round 基础规则、最小信号表与等待子代理的父轮行为已由用户确认并收口。尚需确定结束候选复查／防迟到载荷机制，并在实施验收覆盖取消、重试、尾部排队与丢事件；不再重新展开已确认的业务含义，也不要求全部 running jobs 归零。
- 观察按实际会话隔离并覆盖子代理，connect-bot 效果仍 owner-scoped；具体载荷、并发独立 main 的观察机制及迁移仍未完成。现有 roundOpen 和 owner-only 派发不是新契约已实现的证明。
- 恢复／重载截断已确认，不再讨论延续旧开放轮的部分观察方案。具体操作范围、session 切换／tree／fork 的生命周期与历史关联，以及新轮身份仍待接口与恢复映射决定。
- Request／Turn／Round 的身份与关联、实际重发与重复观测的区分、取消／迟到／乱序／恢复重放、冲突 usage 的可信来源。
- 请求发起时刻、模型／账户／锚价关联；headers／metadata／usage／模型价格／实际 Effort／上下文占用的公共观察接口与 OMP 原生支持。provider-specific Codex parser 仍归 model-cost。
- 活动／交互观测的可用性与状态读取契约；connect-bot 如何消费统一事实并保持原有协议；requiredSemantics、异步 handler 及必要消费者迁移职责。当前只有公共二态语义被确认，没有生产接口载荷或实现。

**当前续聊起点**：Round 基础规则与子代理常见场景已收口，数据布局已 resolved，存储前置仍未满足；之后讨论 Request／响应身份、可信来源、后到事实与冲突处理。先核对宿主实际钩子，再确定公共接口，不重问 Round 定义或已接受的漏 end 取舍。原始暂停交接与历史 Comments 留作溯源，不覆盖当前有效决策。

### 证据与验证边界

- [pi 原生循环调查](../assets/pi-loop-findings.md)与[pi 扩展观测调查](../assets/pi-observation-findings.md)：pi HEAD a276dabe57911253350bffb93cb7d7aff6a73261。资产中的早期“每条 user 消息作为 Round 边界”等建议不是已确认决议，以本票当前有效决策为准。
- [pi 队列 smoke](../assets/pi-queue-smoke.md)：真实 Agent + 真实事件流，确定性模型流，8 场景通过；不是 TUI／完整扩展链路，未访问远端模型／凭据。
- connect-bot 真实状态机 + outbox 隔离探针已运行，end/start 会报告 awaiting-input/working；面板真实前端分类函数也已运行，在线 idle 不算 awaiting-input。一次性探针均已删除。
- omp-bot HEAD b0dc22413e6b3c5f7ee14b68f5d6e001ea9d79c6 的自动关机判据来自源码；没有运行真实关机链路，没有修改该仓库。
- [OMP 真实扩展结束时序探针](../assets/omp-end-timing-smoke.md)：普通完成及工具后续跑已运行；最终 agent_end 回调内 idle 可为 false，下一任务才变 true。因此不能一次同步检查后丢掉结束候选；采样延迟不是已批准的生产调度策略。
- [OMP 子代理 Round 信号与归属调查](../assets/omp-subagent-round-findings.md)：真实 task／yield／扩展链路，单子、并发兄弟、嵌套孙、后台自动回传四场景有证据；父后台 willContinue=true 后自动 start 已观测，工具调用到子身份的启动关联也已观测。模型为本地确定性 fixture，usage 为零，不证明真实账单或新 framework 契约已交付。所有一次性 probe 源码及临时目录已清理，事实资产保留。
- 没有验证完整 OMP／pi Round 异常／恢复／多 main／丢事件原生链路，不改变框架支持基线，不实现或认证 pi adapter。现有 framework 仍有旧 start 去重与子代理 owner gate；必须在实施阶段落实本票确定的观察面，不能冒充新增需求已交付。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 修订公共术语：Turn 是一次 LLM Request 与对应 Assistant response，不含工具执行；不再将 Run 作为公共单元／状态。framework 统一 Round 与代理活动状态，model-cost 逐响应 usage 入账、按统一 Round 聚合，不等待或依赖原生 agent_end 才计费。本票重审旧 Question 中的 Run 结算／run 内切换，改用新术语设计；明确 Idle 与等待输入的差别、connect-bot 公共生命周期语义与面板协议的边界，并验证自动续跑、工具、异步任务、异常／中止的真实 Round 结束条件。不在本票执行消费者迁移。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：逐请求身份必须区分重复通知与实际重发；请求归属绑定发起会话、Turn／Round、账户、模型与锚价。需要逐子代理身份、父子启动关系、orchestration 独立请求／汇总区别，以及当前／最近 Round 和 tree 导航后的可用性事实，不要求历史 Round 位置索引。Owner 门控或 State follow 不得替代消费归属。
- 待决定：OMP 在选定基线能否暴露这些事实；取消、迟到、乱序、恢复重放、同一请求冲突 usage 的可信来源是什么？缺失事实怎样明确不可用并提示／跳过，不能伪造身份、usage 或确认零；不要求持续完整性标记或缺失补账记录。已知冲突的可信来源和有限处理仍未决。支持多个独立 main；同一 session 单执行者的事实／检测与 adapter 责任是什么？
- 价格与 token 观测供业务使用；计费／额度／无统计口径及 provider-specific 解析由 model-cost 拥有。公共 Round 不因后到事实重新开启；model-cost 不补已跳过请求，framework 通用修正能力未决。

## Comments

以下为带日期的历史讨论，可能包含已替代的迟到补齐、轮次划分与接口提议。当前契约以前部有效决定、已同步 Lighthouse 和明确的未决交接为准，不能把历史评论当新增补账／历史查询要求。

### 第一轮：用户确认 Q1（2026-10-09）

- 区分工作完成后等待新输入与未完成工作等待用户批准／澄清。前者结束 Round；后者保留当前 Round，只改变活动状态，用户回应后继续原 Round。
- 已同步 framework/GLOSSARY.md 的 Round 与 Agent activity state 定义；未冻结状态枚举或 OMP 检测机制。不能仅凭没有模型输出或出现用户交互断定 Round 已结束。
- 本票仍 claimed；取消、失败、自动续跑、原生观测映射及其验证等尚待决策。

### 第二轮：用户确认 Q2／Q3，并提出简化边界（2026-10-09）

- Q2：明确停止当前活动结束 Round，原因为取消；之后修改输入或要求继续开启新 Round。迟到 usage 补旧 Round，不重新开启。单个请求取消不必然结束仍在自动继续的 Round。
- Q3：请求或工具失败后若仍有自动重试／后续处理，保持当前 Round；最终无待续工作且不在等待批准／澄清时结束，区分完成、取消与失败。
- 用户提出按用户输入划分 Round：有输入开始下一 Round，否则仍属同一 Round。尚需澄清是否替代 Q1 的批准／澄清例外，以及 Round 统计分组与活动结束是否分离；未将此提议写为已确认定义。

### 第三轮：用户确认 Q4，修订 Round 的公共含义（2026-10-09）

- 用户确认采用技术上可明确分辨的交互轮次，不按内容语义判断是否属于同一任务。Round 表示一轮用户与 agent 交互，服务于统计及当前轮活动结束后等待输入的判断，不代表整个业务任务。
- 每条被接受用于驱动执行的普通用户消息开启新 Round，普通文本澄清也不例外。专门的工具批准／交互回应不另开 Round，前提是明确关联已有待处理交互。自动续跑／重试／工具执行不另开 Round。键盘输入、命令操作及仅排队消息不因此启动 Round。
- 本决定替代 Q1 中普通文本澄清留在旧 Round 的规则，以及 Q3 对此例外的引用；保留专门批准／交互的例外。不能依据内容中的问句、任务是否相同或主观完成度推断边界。
- 活动完成／取消／终止失败与统计归属分离：Round 活动可先结束，最近统计仍可见，迟到用量补原 Round。用户强调等待输入状态的重要性；其技术检测及执行中输入切换／排队的细则仍须确定。
- 已同步 framework/GLOSSARY.md；旧 lighthouse 中生命周期定义与本次修订的差异，留待本票正式决议确认及 backtracer 追踪，不直接改写历史决议。

### 第四轮：Q5 的跨宿主映射问题（2026-10-09）

- 用户经验：OMP 用户消息入队，当前 assistant_message 返回后发送队列消息，可将此消费时点视为新 Round；用户询问其他宿主差异是否影响 framework，未确认全部队列／steering 细则。
- 源码核对：framework/adapters/omp.ts 的 onRound（755–786）目前以 agent_start／agent_end 和 roundOpen 合并活动；willContinue 或不满足 quiescent 时不关闭 Round。quiescent（657–671）要求 isIdle、无 pending messages、无 running async jobs。该旧映射不能原样表达本次按用户输入消费切轮的定义。
- 隔离 18.5.0 基线的 pi-agent-core/src/agent-loop.ts（1756–1762）在收尾取 late steering／aside／follow-up，将其设为 pendingMessages 并继续内部循环；另有 steering 及 live steering 消费路径（1213、1726、1849–1850）。不能概括为所有输入都只在 assistant_message 结束后消费，也不能把每次 assistant_message 结束直接等同 Round 结束。
- 此次证据为源码检查，没有执行队列／steering 原生链路 smoke，不声称已验证 extension surface 可以可靠暴露每个消费边界。
- 待确认建议：framework 固定交互轮次语义，由 adapter 映射实际消费输入的时点；Round 切换与整体等待输入状态分别观测。缺少必要原生事实时明确能力缺口，不能按文本语义猜测。其他 harness 具体队列行为未调查，本次不扩大为 pi adapter 实现。

### 第五轮：用户要求核对本地 pi 源码（2026-10-09）

- 用户要求检查 E:/Developer/myhub/pi 的队列处理以决定公共抽象。调查 HEAD a276dabe57911253350bffb93cb7d7aff6a73261，未修改 pi 源码／正式配置，未实现 pi adapter。
- 事实资产：[pi 原生循环与队列](../assets/pi-loop-findings.md)、[pi 扩展观测表面](../assets/pi-observation-findings.md)、[真实 Agent 隔离 smoke](../assets/pi-queue-smoke.md)。这些是事实及建议，不是本票最终决议。
- 确认生产 coding-agent 使用 packages/agent 的真实 Agent，不以实验 durable 路径代替。steering 在工具批结束后的续跑点消费；follow-up 在当前自动工具／steering 工作即将停止时消费。两者可以在同一次原生 run 内继续，不产生新的 agent_start。
- 用真实 Agent + 真实 AssistantMessageEventStream、确定性模型流跑了 8 场景（steer/followUp × one-at-a-time/all × 有无工具），全部通过；消费产生 user message_start/end、位于下一模型请求之前。探针已删除。不访问网络／凭据／正式存储／TUI；扩展 handler 链与 AgentSession 重试／settled 的观测结论来自源码，未跑其完整集成 smoke。
- 新发现：all 模式可在同一次请求前消费 B、C 多条用户消息；one-at-a-time 分别驱动后续请求。Q4 的逐消息分轮在批量消费下会产生零请求轮次或需要额外归属规则。建议按一次实际消费的输入批次开 Round，但此修订必须用户确认，尚未修改 glossary。
- 扩展可见 input 是提交／处理输入阶段，早于可能失败的校验，不可当成功消费事实。message_start(role=user) 是更接近消费的信号，但 user 消息无稳定 submission id/origin，不能靠 role 或文本精确区分人类输入、扩展注入与自动续跑；关联能力缺口须显式保留。
- 整体静止可观察 agent_settled 与 isIdle／pending facts；agent_end 仅结束低级 run，之后仍可能自动重试／压缩／继续。Round 因新输入消费切换不意味着 agent 曾等待用户。
- 待确认：公共输入消费／活动状态分离的契约、批量消息分轮、扩展注入是否构成新交互，以及缺少身份／来源的支持策略。本票仍 claimed，不关闭或改写旧 lighthouse。

### 第六轮：从实际消费者逆推 Round 定义（2026-10-09）

- 用户担忧 message_start 难以可靠标识 Round，要求检查除 model-cost 之外的现有用途，先从用途逆推；未接受 Q6 的输入批次方案，不冻结该方案。
- 通过 RoundEvent 的 LSP references、applyRoundEdge references 与 extensions/framework 显式事件检索确认：当前唯一直接生产业务订阅者为 connect-bot，位于 extensions/connect-bot/harnesses/omp.ts:200–206；model-cost 在本 repo 当前只有 glossary，统计用途仍是迁移规划，不是已落地消费者。
- connect-bot 的 applyRoundEdge（shared-logic/session/state-machine.ts:67–77）只把 round_start 映为 working，round_end 映为 awaiting-input，并对重复状态去重；reportState（52–56）通过本 owner outbox 发 state。heartbeat.startHeartbeat（panel/heartbeat.ts:32–43）发送同一 session.state。它不计 Round 数、不保存 Round id，也不关联某条用户消息。初始 idle 来自注册时 canAcceptInput 的采样（panel/registration.ts:262），面板在线／离线是心跳轴，不由 Round 开闭决定。
- framework binding.ts:235–250 只在有人订阅时注册 Round hook；没有 Round 内部 State 恢复／持久化动作。round-events.ts:37–57 负责 owner 门控与错误隔离。提示注入／marker 走另一个 onRunInitiation hook，不是 Round 开闭；codebase-tools 没有 Round 订阅。
- 已跑真实 connect-bot 状态机 + BotSessionStore + OutboxFlusher 的隔离探针；sender 记录输出后显式拒绝联网。start/start/end/start/end/end 实际只发 working → awaiting-input → working → awaiting-input，重复边缘被去重。capability getter 和 heartbeat cancellation 设为越界即抛错且未触发：Round 路径没有写 declared State 或取消心跳。探针已删除；未连接真实面板／宿主，不声称完整 UI 链路已验收。
- 观察说明：若将纯统计切轮 end/start 原样送给现有 connect-bot，会在连续工作时报告一次 awaiting-input；这是新定义直接套入旧消费者的风险，不是已修改生产代码的故障。
- 待用户选择的两条路线：A，Round 是从开始执行到真正等待新输入／取消／终止失败的连续活动周期，期间排队输入不另开 Round；B，Round 按普通输入消费分组，另设公共活动状态信号给 connect-bot。A 的统计粒度更粗，但无需逐消息/批次关联；B 保留每次输入统计，但必须处理批量、来源和对应身份。本票尚未选定，不自动替代 Q4 或改 glossary。

### 第七轮：用户确认 A 与有源码依据的开轮策略（2026-10-09）

- 用户明确选 A，并强调决议的价值在于找到可用的 agent_start 信号和开轮去重规则，有实际代码支持，而不是仅靠概念推演。
- 已确认：Round 表示一段连续活动周期。没有开放 Round 时，观测 agent_start 开启 Round；已有 Round 时，后续 agent_start 继续当前 Round，不另开轮。排队普通输入（单条或批量）、工具、自动续跑／重试及专门批准都不因其自身出现而开新 Round。
- 此决定替代 Q4 的每条普通消息开轮，以及尚未接受的 Q6 输入消费批次方案。普通文本澄清若代理已结束活动并等待新输入，其回答触发新的执行／Round；不判断任务语义。源码事件名和映射记录在本票，不写入 glossary 的概念定义。
- 源码依据：framework/adapters/omp.ts:755–786 已实现 roundOpen 门控的 agent_start → round_start；OMP 18.5.0 的 extensibility/shared-events.ts:201–203 定义 AgentStartEvent，session/agent-session.ts:4773–4775 转发给扩展。pi HEAD a276dabe 的 packages/agent/src/agent-loop.ts:117 与 :146 分别在初始／continue 执行派发 agent_start，AgentSession._emitExtensionEvent 将其转发。另有本票链接的真实 pi Agent smoke。
- 证据限度：可用启动信号与现有开轮门控有源码依据，pi 基础循环已 smoke；不据此声称 OMP／pi 完整 Round 结束、恢复与并发观测契约已经验证。当前 OMP adapter 的 roundOpen 是 binding 内布尔变量；已确认多 main／逐子代理需求要求后续按实际会话维护，不把现有实现泛化为多会话正确性证明。
- 已同步 framework/GLOSSARY.md 的 Round 与 Agent activity state。旧 lighthouse 保留历史决议，本票最终正式决议需说明替代关系。
- standing preference：此票后续观测设计先找宿主事实与派发路径，再确定语义映射和不可用状态；以场景运行证据区分源码可见、真实链路可用与已经验证。
- round_end 的完整原生映射、启动前已在执行的恢复／初始化、请求身份／usage／价格／headers／活动状态等仍未全部解决。本票仍 claimed。

### 第八轮：用户确认最终结束信号与低级结束的区分（2026-10-09）

- 用户确认 round_end 不直接一对一映射所有 agent_end。只在宿主确认当前连续活动终止、不会继续当前活动时，关闭已开放 Round 并派发一次 round_end；中途 agent_end 保留开放状态，以保障后续 agent_start 的去重规则。
- 确认映射方向：OMP 从 agent_end 观察，结合 willContinue 及实际静止／待续事实过滤；pi 使用扩展可见的 agent_settled 作为整段活动结束的重要信号。framework 统一语义，不强制各 adapter 使用相同原生事件名。
- 源码依据：OMP 18.5.0 extensibility/shared-events.ts:206–214 定义 agent_end.willContinue，framework/adapters/omp.ts:775–784 已有过滤；pi AgentSession._runAgentPrompt（1775–1804）在低级 run 返回后循环 _handlePostAgentRun／agent.continue，最终才 _emitAgentSettled；_handlePostAgentRun（1806–1844）检查重试、压缩和排队消息。
- 本次确认的是公共结束规则和宿主映射方向，不代表 OMP 当前 quiescent 的所有 async-job 判定均已批准，也不代表最终信号的取消、后台唤醒、恢复和多会话完整链路已经验证；不实现或认证 pi adapter。
- 下一开放问题：framework 主活动状态轴是否只区分工作中与等待新输入，不把 connect-bot 注册时的 idle 当成第三种公共活动状态；专门交互保留在开放 Round 内，另提供交互事实。connect-bot 的 closed wire enum 不因公共定义讨论自动改变。本票仍 claimed。

### 第九轮：用户提出 idle／working 二态，核对面板业务影响（2026-10-09）

- 用户提出 framework 直接使用 idle／working 两态，并指出可能影响 connect-bot；该命名方向正在讨论，尚未确认是否同时改变面板协议／业务。
- 本 repo 的 AgentState LSP references 确认状态机、BotSession、reportState 是消费处；框架两态与 connect-bot 的三态 wire enum 是不同契约，不应直接覆盖。
- 扩展本身的 idle 是接入时空闲，awaiting-input 是观测到 Round 结束。此前“主要是初始化／历史差别”的描述只覆盖本 repo 扩展，不能推断外部面板没有业务依赖。
- 新核对 omp-bot HEAD b0dc22413e6b3c5f7ee14b68f5d6e001ea9d79c6：backend/src/sessions.rs:136–143 明确定义 Idle 为接入后未观察到轮次结束，AwaitingInput 为轮次已结束；backend/src/countdown.rs:334–376 的 judge_locked 要求监听集合非空、全部成员在线且状态为 AwaitingInput，才形成自动关机安排。Idle 不满足这个条件。set_monitoring（218–295）只允许在线 Working 加入监控。
- 前端也不等价：frontend/src/sessionOrdering.ts:12–31 将等待组置顶，isAwaitingOnline 只接受 awaiting-input；SessionsPanel.tsx:202–226 的监控反馈也使用 awaiting-input。
- 安全 smoke：直接运行真实 frontend isAwaitingOnline，在线 idle → false，在线 awaiting-input → true，断言通过。仅纯状态分类，不启动面板／监控／关机，不执行真实关机链路；后端判定依据为源码。未修改 omp-bot。
- 待确认建议：framework 主活动轴为 idle／working；connect-bot 把“当前是否空闲”与“本次接入后是否已观测到 Round 结束”作为不同事实，继续产生既有三态 wire 值，保留关机监控语义。若用户希望面板也整体二态化，则需显式决定其监控完成判据并跟踪相应跨 repo 变更，不把它当作无行为影响的改名。暂不修改 glossary 或生产接口。本票仍 claimed。

### 第十轮：用户确认 Q9 并请求新对话续聊（2026-10-09）

- 用户确认推荐方向：framework idle／working 二态，connect-bot 保留既有三态协议及监控语义，以独立的 Round 结束观测完成业务映射。没有授权 omp-bot 整体二态化或修改自动关机规则。
- 用户要求将已做决策保存，再在新对话继续 grilling。已在本票前部整理“当前有效决策”与“新对话交接”，保留历史和调查来源；同步公共与 connect-bot glossary。
- 本票讨论未完成；为新对话重新认领而回到 open、清空 Assignee。没有生成最终 lighthouse、没有 resolved、没有改地图 Decisions so far、没有执行生产实现。

### 第十一轮：恢复认领，核对 OMP 后台唤醒事实（2026-10-09）

- 重新认领本票，沿新对话交接继续；不重问已确认的连续活动 Round 和公共二态／面板三态分层。
- 固定基线证据来自隔离安装 `.cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/src/session/agent-session.ts`，不是当前 checkout 版本的推定。`#hasPendingAsyncWake`（2702–2717）按 agentId 过滤：未抑制投递的 running job、pending delivery 或尚待注入的 async-result 任一存在，均视作待唤醒；仅有已抑制投递的 running job 不足以构成待唤醒。
- 原生结束路由（4209–4220）对待唤醒发出 willContinue: true、awaitingAsyncWork: true；`#settleAgentEnd`（4682–4704）先发低级 idle，再发会话事件，扩展通知（4707–4713）仅传 messages 与 willContinue，不暴露 awaitingAsyncWork／isTerminal／yielded。因此低级 idle 不能单独证明公共 idle，扩展不能假定已取得全部后台分类字段。
- 当前 framework quiescent（framework/adapters/omp.ts:657–671）无差别要求 running.length 为零；此判据与原生按自动投递判断并不等价，不能作为已批准契约。
- 隔离探针执行从固定基线读取的原生待唤醒方法，仅去除返回类型并放入小型接收者；manager／yieldQueue 为确定性替身。5 场景实际输出：auto-waking running job=true、suppressed running job=false、pending delivery=true、no pending work=false、queued result=true；ownerId 过滤亦断言通过。只验证该判据，不是 AgentSession／扩展／TUI 完整链路，未访问远端或修改生产实现，无落盘探针。
- 下一待确认问题 Q10：后台工作是否只在宿主确认它会自动继续本会话当前活动时保持该会话 Round；已脱离且无自动待续的后台工作不独立阻止父 Round 结束，其迟到 usage 仍按启动关系补旧账。此为建议，不是已确认决定；结束时序、取消与可用观察面仍待验证。

### 第十二轮：用户强调同轮与简单判断（2026-10-09）

- 用户对 Q10 表达：按其理解应该属于同一 Round，关键是有没有简单判断方法。确认自动后台续跑留在同轮的方向；不把这句话扩大为对所有脱离后台工作或具体接口的批准。
- 固定基线 shared-events.ts:206–214 的 agent_end.willContinue 是扩展可见的自动续跑信号；基线 agent-session.ts:4215–4217 将后台待唤醒映为 willContinue: true，4707–4713 把该字段送给扩展。无需让公共消费者重新枚举 async jobs 或推断工作内容。
- 建议 OMP adapter 首先用 willContinue === true 排除终轮；否则再核对本会话 isIdle 与 hasPendingMessages。不用全部 running jobs 归零作为额外必要条件；这是建议映射方向，尚待用户确认，并须核对取消、尾部排队竞态和完整扩展链路，不能声称仅靠 willContinue 缺省即可可靠终轮。没有生产修改。

### 第十三轮：用户确认 Q11，实测普通完成的扩展时序（2026-10-09）

- 用户确认最小 OMP 映射方向：willContinue 保持同轮，否则辅以本会话 idle／pending-message 事实，不要求全部后台 running jobs 归零。已更新当前有效决策；确认的是方向，不是已交付机制。
- [OMP 真实扩展结束时序探针](../assets/omp-end-timing-smoke.md)：固定 18.5.0 RPC CLI + 真实扩展 + 本地模型 endpoint。普通完成（1 请求）与 bash 工具后续跑（2 请求）均 completed、sessionSettled=true、stderr 为空；两场景最终 agent_end 回调 idle=false、pending=false，下一任务及 25ms 后 idle=true。因此一次同步检查 false 就丢弃会漏终轮；不能把 fixed delay 25ms 当已验证生产策略。
- adapter 的结束候选需要后续核验真实静止，并防止旧候选关闭后来活动；具体调度、取消、尾部排队及并发机制仍待设计／验证。hasPendingMessages 是 displayable／pending-next-turn 队列的投影，不足以单独证明自动续跑；取消时有队列残留的路径仍待实测。不改宿主或生产实现。
- 下一独立待决问题 Q12：初始化／恢复／中途接入时若已在 working 但未观测到原始 Round 开始，是否以起点未知的部分观测表示，不伪造开轮时刻或完整轮次统计；能可靠恢复身份则关联既有轮次。身份和恢复机制本身尚未批准。

### 第十四轮：用户提出恢复／重新加载截断 Round（2026-10-09）

- 用户提出恢复或重新加载后都当作新 Round，并结束之前未完成 Round，询问是否更简单；这是替代 Q12 部分观测建议的提议，尚未确认精确规则，不修改当前有效决策或 glossary。
- 影响：可免于恢复开放 Round 的运行中状态，但不免除请求去重、旧请求与父子启动关系、历史归属恢复义务；迟到 usage 仍须补旧账。
- 待确认建议：增加恢复／重新加载的明确截断例外，旧 Round 标为因观测边界截断而关闭，不冒充正常完成、取消或已确认失败，不作为 connect-bot 等待输入／监控完成的证据。新 Round 在恢复后的执行开始，或可靠观测当前已在 working 时开启；恢复后空闲不凭空开一个空 Round。具体适用范围（进程重启、扩展 reload、会话 resume／switch／tree）及宿主可用信号仍需后续明确。

### 第十五轮：用户确认恢复截断，要求以日常信号与漏结束补救收敛（2026-10-09）

- 用户确认 Q13 恢复／重载截断例外，已同步当前有效决策和 glossary；不把行政截断当实际活动完成。
- 用户要求从实现可识别的 agent_start／agent_end 出发，避免继续抽象 Round 定义；提出下一次 start 切新轮，以补救遗漏 end，并优先覆盖日常场景。尚未将所有原生 agent_start 一律切轮写成确认决定。
- 固定 OMP 18.5.0 pi-agent-core/src/agent-loop.ts:628 的普通 agentLoop 和 :691 的 agentLoopContinue 都派发 agent_start；continue 没有新增用户消息，源码注明重试用途。因此原生 agent_start 不唯一表示用户开启新活动。此前真实扩展 smoke 只验证普通完成和同一循环内工具续跑，不声称已运行独立 continue／重试完整链路。
- 建议最小漏 end 补救：已收到 willContinue=true 的结束通知时，后续 start 沿用旧 Round；否则新 start 即使旧 Round 未关闭，也截断旧轮并开新轮，旧关闭标记为 inferred／missing-end，不补造完成时刻或面板 awaiting-input。此规则有意在连续跑通知也丢失时允许一次实际活动被拆成两轮，以换取简单恢复；待用户确认这个取舍。
- 开信号可作为订阅正常且实际启动执行时的可靠日常入口，不能承诺任何用户消息都有新 start 或跨崩溃／重载不丢事件。排队消息可由已有循环消费；命令或启动前校验失败也不等于新的代理执行。

### 第十六轮：用户确认最小信号表，核对常见子代理路径（2026-10-09）

- 用户确认表格及漏 end 的取舍，并要求优先复查常见子代理。已更新当前有效开轮规则，明确替代旧的无条件 start 去重，保存信号表并同步 glossary。
- [OMP 子代理 Round 信号与归属调查](../assets/omp-subagent-round-findings.md)记录固定 18.5.0 真实 RPC／task／yield／扩展链路。成功场景：单子代理（2 会话、3 请求）、并发兄弟（3 会话、4 请求）、嵌套孙代理（3 会话、5 请求）、后台自动回传（2 会话、5 请求）；stderr 均为空。usage 为 fixture 的零值，不证明真实计费。
- 后台父事件实际为 start → end(willContinue=true) → 子 yield/end → 父 start → 父最终 end；按已确认表格父保持同轮。子／兄弟／孙均有独立 sessionId、agent.id 和自身 start/end；嵌套 parentId 指直接父代理。
- 实际观察父工具调用 → task:subagent:lifecycle.started/completed 的 parentToolCallId／child id／sessionFile 关联；before_subagent_spawn.spawnKey 在此次 task 场景等于 child id。按[消费归属决议](../lighthouse/02-accounting-ownership.md)固定启动父 Round，结果晚到不依当前父 Round 改归属。当前仍未冻结公共载荷和持久化机制。
- 现有实现缺口：dispatchRoundEvent blanket owner gate 会丢弃子代理订阅，不能作为 model-cost 全量观察；onRound 仍是旧 roundOpen 算法。需要逐实际会话的观察与独立轮次记录，connect-bot owner-scoped 面板效果则继续隔离。子 start/end 不驱动父边缘，任务结果汇总不重复入账。
- 附加非正常报告探针：子代理不 yield 时，executor 的三次提醒会产生共四对子 start/end，扩展 end 不带 willContinue；父仍只有一轮。这说明一次委派可含多个子信号轮，不能假定全部外层续跑都有 willContinue；接受信号粒度分轮，消费仍归同一次父启动 Round，不再扩展任务语义推断。
- 未验证 eval agent／workpool／tan、取消、子会话恢复、多个独立 main、丢事件注入和父结束后脱离后台的迟到补账。表格对常见路径可用，不宣称现有 framework 已实现新观察面或完整生产验收。本票仍 claimed；请求／响应载荷、缺失能力、异步派发等仍未解决。

### 第十七轮：用户确认子代理等待规则满足日常场景（2026-10-09）

- 用户明确确认：刚说明的父 Round 等待阻塞子代理／后台自动回传／处理子结果的规则满足其使用场景，没有问题。已追加当前有效决策并明确 Round 基础讨论收口，同步 Working glossary；不因该局部确认将整票 resolved。
- 当前待解项与续聊入口已整理：下一主题为 Request／响应观测关联，不再反复讨论 Round 定义。保留取消等未运行路径的验证边界，不把它们变成新的概念讨论。
- 下一主题的固定基线初步源码事实：extensions/types.ts:832–840 的 before_provider_request 只有 payload，after_provider_response 继承 ProviderResponseMetadata；pi-ai/src/types.ts:378–383 的 provider requestId 可选，AssistantMessage.responseId 也可选。它们不是已证实贯穿请求发起、headers、usage 的统一身份；具体映射与重试／取消关联仍需链路核对，不能用相同 token／时间戳冒充幂等键。此次没有新的运行验证或生产实现。

### 本次暂停与新对话交接（2026-10-09）

- 用户要求先记录目前决策，在新的对话继续 grilling。已整理前部当前有效决策、用户确认的最小信号表、子代理等待规则、已收口范围、未决项与事实资产链接；更新新对话交接，指定下一主题为 Request／响应身份与关联。
- 用户确认的概念已同步 framework／connect-bot glossary。历史推导与旧提议保留，不覆盖当前有效决策；旧已结案 lighthouse 不改写，新最终 lighthouse 尚未生成。
- 本票部分讨论未完成：释放认领为 open、Assignee 清空，未 resolved，不更新地图 Decisions so far，不执行 lighthouse／backtracer 结案流程。下个会话按 tracker 约定重新认领后继续同一票，保持规划模式。

### Request／响应观测续聊：Turn ID 与只读职责（2026-10-09）

- 用户对 Q1 提出命名问题：“如果框架需要一个对应的请求 id，我们需要定义一个新名词，用 turn id 可以吗”。采用既有 Turn 概念命名其身份为 Turn identity／turnId，避免为一对一请求／响应关联再引入同义身份。已同步 framework glossary；生成方式、唯一性范围、开始时点和重试关联未因此获批。
- 用户确认 Q2：“可以，框架能力以后再按需扩展”。请求观察保持只读，不将原生 payload 修改职责纳入本次观察接口。
- 接下来澄清 Turn 在请求开始时是否即有身份，以及取消／失败而无完整响应时如何表达；不重问已确认的实际重发独立记录、未知不等于零及 Round 基础定义。

### Request／响应观测续聊：用户确认 Q3（2026-10-09）

- 用户回答“是”，确认 Turn 从请求开始即有身份，而非收到完整响应才成立。取消／失败／无完整响应仍保留该 Turn，usage 缺失不伪造完成；可靠迟到信息补原 Turn，实际重发用新 Turn。
- 已同步 framework Turn 定义；未声称 OMP 原生关联、重试逐次识别、请求身份生成或恢复映射已实现／运行验证。
- 下一讨论进入公共观察接口如何区分 Turn 结束与 usage 可用，以支持已确认的取消、缺失与迟到补账规则。票继续 claimed，整票未结案。

### Request／响应观测续聊：用户质疑四种公共观察拆分（2026-10-09）

- 用户提出：是否只需 Turn 开始与结束，结束时尽力记录已有信息；质疑四种公共观察的过度设计。此前 Q4 的四种观察事实拆分未获确认，不作为有效契约。
- 调整提议为仅 turn_start／turn_end 两个公共生命周期观察；adapter 内部收集响应 headers／metadata／usage，在结束时提供已有事实，缺失保持缺失，不将每个原生钩子升级为公共事件。尚待确认，不声称已实现。
- 需明确基线差异：旧 Codex 响应头读数在 after_provider_response 即更新；仅结束时交付会把这种更新推迟至 Turn 结束。此前已确认的可靠迟到 usage 补原 Turn 规则仍保留，具体原生支持与补齐方式待证据核实，不据假设预建额外事件。

### Request／响应观测续聊：用户确认修订 Q4（2026-10-09）

- 用户回答“可以”，接受开始／结束两事件观察方案，并接受 Codex 响应头读数延后到 Turn 结束时交付并更新。此为对现有即时更新基线的有意调整，不取消额度解析、窗口与估计功能。
- 四种公共观察的原提案未采用；metadata／usage 可作为 turn_end 的已有信息，不需要各自的公共生命周期事件。迟到补齐原 Turn 的约束仍保留，具体映射未定。
- 本票仍 claimed；还需核对真实请求关联、结束／重试与缺失支持、公共载荷与处理约束。不因局部接口确认结案。

### Request／响应观测续聊：用户确认 Q5（2026-10-09）

- 用户回答“是”，确认 turn_start／turn_end 最小载荷及固定请求归属／模型、缺失不伪造零、不透传原生 payload／历史／context 的约束。
- 确认基本载荷不等于确认所有额外事实接口；账户取得另票承接，价格／实际 Effort／上下文观测继续讨论。原生关联与结束事实仍需验证，票不结案。

### Request／响应观测续聊：用户确认 Q6／Q7（2026-10-09）

- 用户回答“Q6 可以 Q7 是”，确认请求时固定可用 catalog 价格／币种／单位，以及独立的当前会话只读事实快照。已记录到当前有效决策。
- 两个 Turn 事件不扩张为字段级事件；框架提供事实，业务计价、刷新与持久化仍由其对应票承接。
- 接下来核对 OMP 支持基线真实请求钩子的关联与事实可用性，再讨论缺口，不根据接口意图承诺宿主已经支持。

### Request／响应观测续聊：OMP 18.5.0 真实链路证据（2026-10-09）

- 事实资产：[OMP 请求／响应观测链路探针](../assets/omp-request-observation-smoke.md)。真实 RPC／扩展／本地 SSE 链完成正常、工具后续请求、503 后成功与流式取消四场景；非零 usage 及 request headers 实际可见，不宣称账本或新公共接口已实现。
- 新缺口：503 后自动重试实际发出两次 HTTP 请求，但扩展仅有一次 before／一次最终 after／一次 assistant message_end。不能只凭这些钩子承诺逐网络尝试身份与锚时；可观察模型调用周期与真实网络尝试的关系需要用户确认，尚未修订 Turn 定义或消费归属决议。
- 原生 turn_end 在工具返回之后，不直接作为公共“不含工具执行”的 Turn 结束位置；已有语义要求映射时以 assistant 完成等真实事实为依据。
- 取消时未收到 provider usage chunk，宿主仍输出全零 usage；必须区分缺失与确认零。当前 context 读数也随处理阶段改变，Effort fixture 为 undefined；未把字段存在当作可靠性证明。
- 票继续 claimed；下一 grilling 聚焦隐藏重试的可接受观测范围，其他已确认接口不重开。

### Request／响应观测续聊：用户确认 Q8（2026-10-09）

- 用户回答“可以，也就是说重试在 harness 层被抽象，框架观测不到是吧”，接受以可观察模型调用周期为 Turn，不为隐藏 HTTP 重试增加底层拦截。
- 校准含义：已验证的 503 重试位于扩展钩子以下；并非所有自动重试都隐藏。只要宿主暴露出新的调用／请求开始，就按新 Turn 处理。框架不是不能观察任何重试，而是不保证逐个观察底层网络尝试。
- 已同步 framework Request／Turn 术语与当前有效决策；逐请求记录／锚价承诺限定到可观察调用，不静默声称物理网络尝试级完整性。最终 lighthouse 需说明此对既有消费归属原则的修订，历史决议不改写。

### Request／响应观测续聊：用户确认 Q9（2026-10-09）

- 用户回答“同意”，确认观察回调失败隔离：继续代理执行，报告故障，不将未成功记录的统计标为成功；覆盖同步异常与异步失败，不自动重试观察回调。
- 尚需明确异步回调与事件处理顺序；既有同步 dispatchRoundEvent 的 try/catch 不能被当作已支持 awaited async handler 的证据。票继续 claimed，不修改生产实现。

### Request／响应观测续聊：用户要求沿袭旧扩展无明显延迟体验（2026-10-09）

- 用户询问旧 model-cost 的处理方式，并表示旧扩展基本感受不到延迟，希望沿袭这种体验；未确认 Q10 的“统一等待异步回调完成”提议。该提议不作为有效契约。
- 事实资产：[旧 model-cost 的等待与后台刷新行为](../assets/old-observer-waiting-smoke.md)。源码与实际注册回调探针确认：before_request／message_end 做轻量同步统计，Codex message_end 的额度请求后台进行、30 秒 TTL、single-flight；但缓存过期启动与原生 agent_end 确有 await，不声称旧实现无等待。
- 调整提议：观察按顺序调用，同步部分接收／固定该次事实，耗时异步效果不作为请求／工具继续的等待前置；框架仍捕获并报告 Promise rejection。不引入通用后台观察队列。异步完成顺序、持久化排空／恢复与账户并发由业务及相应存储／刷新契约保障，不能静默取消正确性。尚待用户确认 revised Q10。

### 路线修正：用户指出先决条件缺失（2026-10-09）

- 用户指出票顺序错误，应从具体实现倒推规则与数据结构；在 Turn 信息保存方式未明确前，无法判断所谓同步／异步读写。接受该流程纠正，停止继续 Q10；两个候选均未确认。
- 实际 tracker 依赖原为观察 → 数据／State → 存储，图本身无环，但观察票讨论同步／异步时暗含“数据／存储已知”的反向前提。将数据／State 的观察结案依赖移除，以已确认需求与原生事实作为输入；本票改为依赖数据／State 与存储。
- 本票回 open、Assignee 清空，由[数据／State 决策](12-state-data-contract.md)先建立具体读写与数据寿命模型。保存此前讨论与已确认决定，不将任一票 resolved，不执行 lighthouse／backtracer 结案流程。


