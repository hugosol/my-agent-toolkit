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
