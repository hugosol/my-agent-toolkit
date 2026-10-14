# model-cost：会话时间持久化与 detail 展示优化

Status: ready-for-agent
Labels: ready-for-agent
Contract: [approved contract](./contract.md)

## Problem Statement

model-cost 已按实际 Session 聚合消费并在 detail 中展示 Agent tree，但用户仍无法回答两个时间问题：一个主对话在物理时间上持续了多久，以及一个子代理实际运行了多久。现有消费 JSON 没有对应的时间记录，不利于重启后查看或以后做统计。

Total、Round 和 detail 的 Sum 列增加了展示负担。子代理行通常显示 agent 定义类别 `task`，而非任务的命名句柄；也缺少模型和思考强度信息。各行直接拼接字段，名称长短不同导致字段横向位置不同，降低同一层级子代理之间的可比较性。

需求限定在本仓库实现，不允许修改 omp 源码或为本需求新增宿主补丁。

## Solution

提供两种明确区分的时间指标：

- **Session span（会话跨度）**用于主会话：从该 Session 在适用消费周期内的首条新用户输入到最近一次已观察到的 Round 结束，包含本周期内轮次之间的空闲以及同一 Session 恢复前的间隔。Total 展示该主会话跨度，不累加子代理时间。
- **Subagent runtime（子代理运行耗时）**用于子代理：直接复用 omp 提供的运行耗时，同一子代理 Session 的多次执行累计在一行中。原生执行结束更新可用耗时，时间只随既有消费提交顺带保存到同一 JSON，以便恢复及后续统计；不新增时间专属写入。

精简 Total、Round 和 detail，移除 Sum 展示列。detail 的子代理行显示正确的任务名称、启动时的实际模型及有效思考强度、自身累计运行耗时，以及原有保留字段。

保留静态 Agent tree，按树深度分别对齐：主会话的子代理使用一套列宽，孙代理使用另一套，更深层级依此类推。同一深度的代理即使属于不同父代理，也属于同一对齐组。长文本和窄终端优先保证对齐与可读性，可省略显示文本，必要时使用组内统一的续行布局。

## User Stories

1. As a model-cost user, I want to see the main session’s wall-clock Session span, so that I can understand how long the conversation has actually lasted.
2. As a model-cost user, I want the main session’s clock to start at its first user input rather than session creation, so that time spent before the conversation begins is excluded.
3. As a model-cost user, I want user-invoked skill inputs to count as user input, so that starting a conversation through a skill does not leave its start time unavailable.
4. As a model-cost user, I want idle gaps between Rounds included in Session span, so that the figure represents physical elapsed conversation time rather than execution time.
5. As a model-cost user, I want resuming the same Session to retain its original start, so that interruptions and restarts do not silently start a new clock.
6. As a model-cost user, I want a forked Session to start at its own first new user input, so that copied historical messages do not inflate the new conversation’s span.
7. As a model-cost user, I want Session span to refresh only when an existing round_end is observed, so that the figure has a stable, understandable boundary.
8. As a model-cost user, I want an unfinished first Round to show an unavailable time marker, so that lack of an end time is not mistaken for zero duration.
9. As a model-cost user, I want later in-progress Rounds to retain the previous completed time reading, so that the main session’s span does not grow continuously between refreshes.
10. As a model-cost user, I want Total to show only the main session’s span, so that parallel subagent work does not inflate elapsed conversation time.
11. As a model-cost user, I want each subagent’s row to show native runtime rather than wall-clock span, so that idle gaps are not counted as execution.
12. As a model-cost user, I want multiple executions of one subagent Session to remain on one detail row, so that the existing session-based consumption view stays compact.
13. As a model-cost user, I want that row to accumulate the native runtimes of its executions, so that follow-up work is represented instead of replacing earlier runtime.
14. As a model-cost user, I want repeated progress updates from one execution not to be added repeatedly, so that the runtime total remains accurate.
15. As a model-cost user, I want duplicate completion delivery not to charge runtime twice, so that observing an event more than once does not corrupt later statistics.
16. As a model-cost user, I want available subagent runtime persisted with existing consumption commits, so that time tracking adds no extra file writes or write races.
17. As a model-cost user, I want persisted runtime expressed as a numeric millisecond duration, so that future statistical tools can consume it without parsing display text.
18. As a model-cost user, I want saved time readings restored after a restart, so that completed observations remain available later.
19. As a model-cost user, I want clear and the first holiday accounting reset to clear time records together with consumption, so that the new period starts with a clean document and simple reset semantics.
20. As a model-cost user, I want existing consumption records retained when new fields are introduced, so that enabling time statistics does not discard accumulated usage and cost.
21. As a model-cost user, I want missing historical end times left unavailable until a real round_end is observed, so that the extension does not fabricate historical completion times.
22. As a model-cost user, I want subagents without a reliable native runtime source to show an unavailable marker, so that a different timing metric is not silently substituted.
23. As a model-cost user, I want Sum removed from Total, Round and every detail row, so that the display contains fewer redundant fields.
24. As a model-cost user, I want Cache, cost, reference cost and context readings to retain their existing meanings, so that field simplification does not change accounting behavior.
25. As a model-cost user, I want subagent rows to show task naming handles rather than agent categories such as task, so that I can identify the work each row represents.
26. As a model-cost user, I want an explicitly reported Session name respected, so that naming a Session remains useful.
27. As a model-cost user, I want a subagent’s startup model displayed, so that I can identify which model it began work with.
28. As a model-cost user, I want its effective startup thinking level displayed, so that the row communicates the actual initial reasoning setting.
29. As a model-cost user, I want that model and thinking-level snapshot to remain fixed after startup, so that the feature stays simple rather than maintaining a history of setting combinations.
30. As a model-cost user, I want unverifiable historical startup model or thinking-level facts shown as unknown, so that current settings are not misrepresented as startup settings.
31. As a model-cost user, I want sibling-depth subagent rows to align matching fields vertically, so that I can compare their consumption and runtime quickly.
32. As a model-cost user, I want grandchildren and deeper descendants aligned within their own depth groups, so that alignment does not flatten the tree or force unrelated depths into one grid.
33. As a model-cost user, I want missing values to preserve their column position, so that subsequent fields do not shift left unpredictably.
34. As a model-cost user, I want alignment to account for Chinese names and terminal display width, so that equal character counts do not produce visually unequal columns.
35. As a model-cost user, I want long names and model identifiers abbreviated when needed, so that a narrow terminal remains readable without changing stored full values.
36. As a model-cost user, I want any required continuation layout applied consistently within a depth group, so that wrapping does not destroy field alignment.
37. As a model-cost user, I want these improvements without changing omp itself, so that they remain extension-toolkit changes rather than a new host-maintenance obligation.
38. As a model-cost user, I want missing or invalid time facts reported without blocking requests, consumption accounting or consumption saves, so that optional time statistics do not disrupt existing functionality.
39. As a model-cost user, I want late time facts held only for a later existing commit, so that the extension does not add catch-up writes or waits solely to preserve timing data.
40. As a model-cost user, I want time restarted from new input or new executions after a reset, so that cleared timing data is not silently reconstructed from old history.

## Implementation Decisions

### 已确认的职责约束

- 沿用 Extension 开发地图的分层：宿主原生事实由本仓库 framework adapter 映射，model-cost shared logic 拥有业务累计、业务持久化和展示计算，扩展宿主绘制层负责主题、树形缩进、列宽、缩略及续行。
- 不修改 omp 源码，不为本需求新增宿主补丁。不将完整宿主对象泄漏给业务层，也不在 shared logic 中猜测宿主私有字段。
- 上述是访谈中已确认的职责约束，不是本 spec 新选定的接口。具体公共事实形状、交付方式、数据恢复接口及测试 seams 留给 /to-contract。

### 主会话时间

- Session span 的起点是该主 Session 自己的首条用户输入，不是会话文件创建时间，也不是第一笔模型请求的开始时间。
- 用户输入包括宿主可靠认定为用户发起的输入；不能只检查普通 role=user 而遗漏用户调用的 skill 等输入。
- 同一消费周期内，同一 Session 的 resume 保留起点，包含中间关闭程序的间隔。fork 创建新 Session，其复制历史中的输入不构成新起点；等待新 Session 的首条新用户输入。消费重置后从下一条新用户输入重新起算，不扫描旧历史带回已清除的起点。
- 终点只保留最近一次已观察到的 framework round_end 的时间，不建立逐 Round 时间明细。在该边界更新读数，并随既有消费写入顺带保存可用主会话时间；不能仅因时间变化另行触发提交。
- 只使用已有 round_end 路径；不新增取消、失败或进程退出的补记机制。已有路径若交付结束就记录，未交付则保留上次终点。用户接受因此少一次时间刷新。
- 尚无已观察到的终点时显示“—”；后续执行中沿用上一轮的读数，不实时增长。缺失起点同样不能伪装为零。
- Total 的时间只代表主会话 Session span，不累加子代理时间。Round 不新增时间列。

### 子代理时间

- Subagent runtime 直接使用 omp 提供的原生运行耗时，不自行重建运行计时器。原生运行耗时与 Hub 持久化的创建到最后记录的物理跨度是不同指标，后者不能作为替代。
- 现有 Agent tree 每个 descendant Session 一行；保留该结构，因此同一 Session 的多次执行耗时累计到该行，不新增逐执行行。
- 同一执行的原生进度更新是替换读数，而非累加多个进度值；不同执行才贡献新的运行耗时。重复观察结束不能重复计入。
- 每次子代理执行结束时，取得可靠原生最终耗时并更新可用累计读数；只在既有消费提交时顺带保存，不因子代理结束另行触发写入。
- JSON 保存可统计的数值毫秒累计值，而非仅保存格式化字符串；不新增逐执行耗时明细账。
- 成功随消费提交保存的时间记录在同一消费周期内重启后可恢复，并在后续执行时继续累计。最终耗时晚于消费提交到达且没有后续提交时，允许该耗时未落盘；不保证每次结束立即持久化。
- 没有可靠原生运行耗时来源时显示“—”，不填零、不改用物理跨度、不增设自有计时器。

### 持久化与消费周期

- 主会话时间与子代理时间随 Accounting period 重置：clear 与首次开启 holiday 的既有归档／重置提交同时清除时间记录，新活动文档不携带旧时间数据。已经处于 holiday 时沿用不再次重置的既有规则。主会话从下一条新用户输入起算；子代理只累计重置后新的执行，不从旧历史、迟到的旧执行读数或归档恢复已清除时间。
- 保留旧消费数据。旧文档缺少新时间或启动快照字段不等于文档损坏，也不意味着允许清空已累计消费。
- 不从最后一条 transcript 记录推导历史 round_end。能可靠恢复的事实可复用；缺失历史主会话终点显示“—”，下一次真实 round_end 后才产生新终点。
- 旧子代理缺少可靠耗时证据时保留为不可用；缺少启动模型／强度证据时显示“?”，不将当前设置补写为启动事实。
- 延续现有协调写入和消费聚合原则，不改变消费归属、金额计算或已有消费存储失败策略。时间与消费使用同一 JSON、同一次既有提交，不增加独立时间文件、定时保存、退出保存或补存写入。
- 时间采集缺失或时间数据无效时打印明确错误，保持最后有效已保存时间或不可用状态，不阻止请求执行、消费统计、消费提交和其他字段展示；不把缺失填成零。时间读数到达不要求消费等待，整个 JSON 的既有写入失败仍按原消费保存失败规则处理。具体扩展字段与 schema 演进的 interface 契约由 /to-contract 记录，内部实现不由本 spec 预先固定。

### 字段与身份

- 从 Total、Round 及 detail 的所有相关行移除 Sum 展示列。Sum 的内部计算若仍被保留字段依赖，不因隐藏展示而无条件删除。
- 其余原有字段保留原有业务含义，不借此重定义消费金额、参考费用、Cache 或上下文使用率。
- `task` 等 agent 定义名称是类别，不是任务命名句柄。正确显示宿主已报告的任务名称／命名句柄；有明确 Session 名称时尊重它。
- 修正事实映射或名称选择，不通过对字符串 task 的特判隐藏问题。名称仍是显示数据，不作为 Session 身份或父子关系键。
- 子代理行新增启动时实际模型和有效思考强度快照；后续切换模型、调整强度或追加执行不更新该启动快照。
- 不追踪实际使用过的多模型／多强度组合。存在 auto 等动态强度时，只要求可可靠取得的初始有效强度；无法证明的值保持“?”。
- 完整名称、模型标识及需要恢复的启动事实不能只存在于被缩略的显示文本中。

### detail 布局

- 保留静态 Agent tree、已有父子关系及深度，不新增展开操作、查询命令或聚合节点。
- 按 depth 分组计算子代理列宽。同一深度共用一套列宽，不同深度独立；不按每个直接父节点再拆成不同对齐组。
- 对齐名称、模型、思考强度、运行耗时及原有保留统计字段；缺失字段保留其列槽和占位，不造成后续字段错位。
- 根据终端实际显示宽度处理中文等宽字符差异和颜色包装，不能只使用字符串字符数保证对齐。
- 窄终端优先对齐与可读性：可缩略名称／模型等文本并标识省略，但不改变保存的完整值。
- 缩略仍不能容纳时使用同一深度组内统一的续行布局，不让每行自行换行造成列错位。
- 不要求不同深度、Total 与子代理列表、主会话 model 行与子代理行共用同一列宽。

## Testing Decisions

- 既有先例包括 Total 文本、detail widget、viewed-session widget、widget visual、Session 消费持久化与恢复，以及 framework Round 生命周期合成的验证。实施时复用相关测试约定；本 spec 不选择新的测试 seam 或分配各 promise 的覆盖层级。
- 访谈阶段已有只读场景验证：Sum 是四个 token 桶的总和，当前名称选择确实会被 agent 类别覆盖，现有 detail 子代理一 Session 一行且缺少模型／强度列。另有真实 transcript 检查及 Round 合成场景，确认原生物理跨度与需求不同、历史 transcript 没有可靠 round_end 记录。这些是现状证据，不是新功能已通过的证明。
- 后续行为验证必须覆盖已经确认的可见边界：首条输入、首轮未结束、恢复、fork、多次子代理执行、重复进度／结束、同次消费提交保存、晚到耗时无后续提交、时间缺失非阻塞、重启、消费重置清除时间、旧数据缺字段、同深度不同父代理对齐、不同深度独立列宽、中文与窄屏。
- 使用项目测试分层和共享工作树协调规则：迭代运行受影响范围，ticket 完成覆盖所属分区与受影响消费者；TypeScript 变更运行 typecheck；最终集成遵守既有全量验证要求。
- 宿主接入变化需要真实宿主的相应验证；终端展示需实际观察不同名称长度、中文、多层级、长模型标识及窄宽度的输出。测试通过不能替代展示 smoke 证据。
- 验证不允许通过修改 omp 源码或新增宿主补丁绕过本需求限制；必须区分已运行的证据与尚未验证的宿主支持范围。

## Out of Scope

- 修改 omp 源码、新增宿主补丁，或扩展宿主版本支持范围。
- 将主会话时间改为纯运行耗时，或将子代理时间改为首尾物理跨度。
- 将并行子代理时间累加到主会话 Total 时间。
- 主会话实时递增计时，或为取消、失败、退出增设补记机制。
- 没有原生子代理耗时来源时自行造计时器或用另一种时长替代。
- 时间专属文件、写入、定时保存、退出保存、补存重试或为等待耗时而延迟消费提交。
- 消费重置后保留或重建已清除的时间，以及保证晚到最终耗时在没有后续消费提交时仍能持久化。
- 逐 Round／Turn 时间账、逐执行子代理明细行、详细执行日志或新的统计查询 UI。
- 多模型／多思考强度历史组合追踪，或后续持续更新子代理启动快照。
- 用当前设置推测历史启动事实，或从最后 transcript 条目伪造历史轮次终点。
- 删除旧消费数据、改变费用计价及消费归属、重做 clear / holiday 的原有消费语义。
- 全树共用单一列宽、展开式代理树、新聚合节点、重新排序代理或新增按代理查询命令。
- 在本 spec 中确定新的 seam、接口类型或各 seam 的测试覆盖承诺。

## Further Notes

- 本规格综合用户逐轮确认的需求，最终对子代理采用原生运行耗时，而不是最初提出的与主会话相同的首尾跨度。布局最终采用同一深度对齐，而不是整棵树统一对齐。
- 两个时间概念已记录于 model-cost 领域 glossary。Session totals 和时间累计均以适用消费周期为保留范围，但 Session span 仍是含空闲的物理跨度，Subagent runtime 仍是原生执行耗时，两者不可相加或互换。
- 应遵守已接受的“model-cost 采用扩展自有聚合，而不是通用业务账本”ADR：保留 Session 自身聚合、直接父关系及静态派生树，不引入 Round／Turn 明细恢复。合同约束审查中，用户明确以同次消费提交、时间缺失非阻塞、重置后干净新文件为优先，替代原先“子代理结束立即落盘”和“时间跨消费重置保留”的承诺。此修订维持原有整份归档／空周期重置，不建立跨周期时间保留区。
- omp 原生能力核查结论：Hub 的持久 span、live 子代理 duration、状态栏 active time 是不同指标；可复用的是原生输入时间事实与子代理运行耗时，不存在可直接替代本需求的主会话原生 Session span。
- 已通过 /to-contract 形成 [approved contract](./contract.md)，其中记录 promises、seams 与 Rapid iteration 验收分工。下一步对合同执行 /to-tickets；文档批准不表示功能已实现或验收已通过。
