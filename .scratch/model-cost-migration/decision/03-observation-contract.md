# framework 如何提供请求、响应、Turn／Round 与模型事实观测？

Type: grilling
Status: resolved
Assignee: hugos（本会话 agent 协助收束）
Blocked by: 01, 02, 12, 06
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)；[framework 如何提供独立存储、原子更新与跨进程协调？](06-local-storage.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)
Lighthouse: [观察契约决议](../lighthouse/03-observation-contract.md)
Outcome: [正常数据流、最小语义契约与异常基本原则](../lighthouse/03-observation-contract.md)

## Handoff

- **收束依据**：用户明确「只需要给出一些基本的原则……确保happy flow功能正常」，并确认正常数据流、必要事实／交付位置、固定基线可行性证据这三个完成条件，要求「可以，请按这个方向收束」。本票按这一批准范围 resolved，不表示生产迁移完成。确认原话与本轮探针在[收束确认与证据](../assets/observation-happy-flow-convergence-2026-10-11.md)。
- **唯一权威**：[观察契约决议](../lighthouse/03-observation-contract.md)持有正常链路、必要事实、公共逻辑优先 framework／adapter 必要桥接、轻量候选复查、尽量统一 round_end、Turn 轻量一次处理及 Q28 的异步完成语义；[数据归属决议](../lighthouse/12-state-data-contract.md)持有子消费只归父 Session、Round 仅本实际会话自身；[存储决议](../lighthouse/06-local-storage.md)持有保存、协调与失败规则。政策不复制到消费者票。
- **后续设计方式**：用户要求补记的[Happy flow 优先的设计推进原则](../lighthouse/03-observation-contract.md#happy-flow-优先的设计推进原则)已在原权威记录，后续讨论读取此主题；不重开本票、不修改其他票的 claim。该补充没有新增依赖或功能承诺，沿用下方既有 trace 的提供者与未裁决冲突，不创建重复票。
- **本票下一问题**：没有待用户裁决的规划问题；不恢复旧异常情景树。后续出现具体可复现且影响目标、或解决成本确需取舍的缺口时，带事实讨论，不先补全所有恢复组合。
- **已转为下游技术输入而非未决政策**：Turn ID 算法／原生关联、capability／requiredSemantics、实例绑定与直接父实际 Session 映射、async 派发、具体函数签名／exports 及消费者迁移由[装配决策](10-assembly-layout.md)已有范围承接；生产正常链路、实际 provider／UI 与旧插件回归由[验收决策](11-acceptance-cutover.md)承接。未实施不是观察原则未决定；这也不证明这些下游问题已经解答。
- **其他职责不变**：账户／凭据来源归[账户访问决策](04-provider-access.md)，模型覆盖与价格维护归[模型覆盖决策](13-model-catalog-policy.md)，快照／远端刷新时点归[刷新决策](09-refresh-lifecycle.md)，无消费证据的最近轮展示及跨 clear 视图归[展示决策](08-presentation.md)与[命令决策](07-command-state.md)既有范围。不批量重写下游 Handoff，不改变其他票的状态或 claim。
- **保留原因／退役分支**：不重开长期逐 Turn 账本、补账、持续完整性状态或统一等待所有异步效果。Q24／Q25 父 Round 分配曾临时确认，已由 Q27 替代；Q26 无需恢复。早期单在途槽提案、Q29 静默退役提案均撤回；异常原因枚举、缺信号补发、截断保存和 pending clear 未获批准。普通取消的可靠消费保留，缺 usage 不自动等于零。
- **证据限制**：本轮 OMP 18.5.0 普通／工具正常链路证明回调返回后可复查 idle、临时公共派发可等待保存且新输入可先执行；公共状态／FIFO 只是探针模拟，第一项保存的等待人为控制。没有新的生产 framework、完整文件锁／跨进程证明、全部 provider／实际 Effort／真实账单、混账户／多 main／恢复／TUI／自动关机认证。非零 usage 与正常主子源事实分别见[请求探针](../assets/omp-request-observation-smoke.md)和[子代理调查](../assets/omp-subagent-round-findings.md)，旧资产的父 Round 建议不覆盖现行数据权威。
- **历史与恢复**：[本次收束前原文](../assets/observation-before-happy-flow-convergence-2026-10-11.md)保留完整旧 Handoff、Question、trace 与 Lighthouse；[此前修订前原文](../assets/observation-revisions-before-pause-2026-10-11.md)、[更早快照](../assets/observation-history-before-publication-2026-10-11.md)保留旧理由／确认源。历史不是现行未答清单。当前恢复入口只使用本 Handoff 与原 Lighthouse。
- **已知上游措辞问题保留**：消费归属的「拒绝并发驱动／检测待定」与存储的「不加检测、版本冲突收口」尚无本轮显式裁决；本票不修订这两个原权威。它涉及同一 Session 的双执行者，不妨碍单执行者正常观察契约；若装配需要确定检测要求，沿已有装配问题带具体冲突回顾，不能默增检测或宣称双执行者受支持。

## Question

确定 model-cost 正常请求／响应、工具后续、Round 结束和正常子代理消费所需的最小宿主事实契约：什么事实在请求开始固定、响应结束交付、当前会话只读查询，如何区分实际 Session 与 Owner，以及 framework／adapter／业务三层职责。

以完整正常数据流、必要事实的含义与交付位置、固定 OMP 基线关键事实／时序可行性证据为收束条件。以不猜账、不补账、局部失败不阻断代理、尽量统一 round_end 等基本原则约束异常，接受极端情况下少计或不及时终轮；不穷举异常、不以所有恢复／丢信号／并发组合或完整生产实现为结案门槛。正常账户隔离、去重、逐代理消费与既定文件协调不因此撤销。

## Comments

### 本轮收束

用户确认范围与 Q28 原话、Q29 的拒绝／撤回、实际探针输出和限制见[收束确认与证据](../assets/observation-happy-flow-convergence-2026-10-11.md)。按原主题更新 Lighthouse；此前多次暂停的旧恢复点均已退役，不把历史中的候选当批准政策。

## Trace Report：正常路径收束与异步完成语义

### 覆盖与层次

- 意图「正常统计可以实施」「不逐一裁决假想极端场景」：本票负责必要事实／原则，装配负责具体接线，验收负责生产证据；没有新增完整异常系统的承诺。
- 意图「不重复状态机」「业务不依赖 OMP payload」：公共分层由观察权威提供，装配已有 core／behaviors／adapter seam 与原生 import 约束；业务数据／计价仍由数据和行为权威提供。
- 意图「不漏子消费、不双计、不改变父面板效果」：数据／消费归属提供自身聚合与直接父链，装配提供逐实际会话事实映射及 owner 效果隔离，验收提供正常主子与旧插件证明；不恢复父 Round 分配。
- 意图「代理继续、不假报保存、同文件协调」：存储 Q5／Q7／Q24 提供非阻塞安全更新、FIFO 和互斥，Q28 只澄清公共 handler 等待而非原生回调／全局输入屏障；命令和展示已有保存完成／失败反馈范围。下一轮可执行不是允许同文件同时写入。
- 意图「统一结束、不猜账、不误自动关机」：现行观察原则与旧 connect-bot 语义保持；装配／验收已有消费者迁移与回归范围，未引入静默退役、原因枚举或无信号补发。

### 已有冲突与证据限度

同 Session 双执行者的上游措辞冲突仍按 Handoff 保留，未由本轮裁决，不扩大正常观察支持范围。临时公共派发／文件 gate 不是生产实现或所有异常认证；具体证据不足由已有验收范围承接，不伪装为已完成迁移。

### Gap follow-up

本轮新增信号均有现有问题提供者，无未归属且已确认的新 gap，不创建重复票、不改变其他会话的 claim。旧 trace 中「全部恢复／缺信号未决所以观察票不能结案」的门槛已由用户批准的正常路径收束替代；原文留历史，未批准候选没有变成新政策。
