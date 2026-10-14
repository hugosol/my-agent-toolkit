# Contract — model-cost 会话时间与 detail 展示

Source: [spec](./spec.md)
Acceptance mode: Rapid iteration
Approval: approved — seam selection、约束审查及 acceptance mode 均已获用户明确批准。

本合同以源 spec 的最终修订为准。Promise 的完成情况由交付工作及验收证据派生，不维护逐项状态列。Delivering work 由 /to-tickets 建立并关联，不在这里预切任务。

**Complete implementation and all assigned automated checks before the human-led acceptance round. Planned human-led checks do not pause otherwise executable work. At the final handoff, report the remaining checks together with their prepared evidence; they remain unverified until the user confirms them. Report genuine blockers when encountered.**

## Promises

Coverage 中“自动”均由 agent 负责；真实宿主证据不能由受控 adapter 的结果冒充。期望值使用下述独立示例或 spec，不从实现反算。只有 P33 的可读性判断保留给人，其他列位置、数值及完整性检查仍自动执行。

|#|Promise (one observable result)|Coverage|Source|Seam|
|---|---|---|---|---|
|P1|主会话起点取本 Session、适用消费周期内的首条新用户输入，而非会话创建或首个模型请求时刻。|自动：创建 09:50、输入 10:00、请求 10:00:05 时，起点必须为 10:00；受控输入与真实宿主取证。|[stories 2, 40](./spec.md#user-stories)|S1、S3|
|P2|宿主可靠认定为用户发起的 skill 等输入可建立主会话起点。|自动：没有普通 user 条目、只有用户调用的 skill 输入时，取得其真实输入时间；实际宿主验证。|[story 3](./spec.md#user-stories)|S1、S3|
|P3|fork 的新 Session 不以复制历史中的输入建立起点。|自动：源会话 10:00 输入，11:00 fork，11:10 新输入；新起点为 11:10，新输入前为不可用。|[story 6](./spec.md#user-stories)|S1、S2、S3|
|P4|主会话 Session span 是首条输入到最近已观察到的 round_end 的物理时间差。|自动：10:00 输入、10:05 第一轮结束、11:03 第二轮结束，对应 300,000 ms 与 3,780,000 ms，含中间空闲。|[stories 1, 4, 7](./spec.md#user-stories)|S2、S3|
|P5|主会话缺少已观察到的终点时显示“—”，不显示零或实时经过时间。|自动：首轮未结束、fork 尚无新输入、历史终点缺失三种场景均观察输出。|[stories 8, 21](./spec.md#user-stories)|S2|
|P6|后续 Round 进行中，主会话时间保持上次已结束轮次的读数。|自动：第二轮执行中推进受控时钟，读数仍为首轮结束的 300,000 ms 所对应显示，直到真实 round_end。|[story 9](./spec.md#user-stories)|S2|
|P7|同一消费周期内 resume 保留已保存的主会话起点。|自动：重新加载同一存储并继续 Session；恢复后结束时间含关闭程序的间隔，不重新起算。|[stories 5, 18](./spec.md#user-stories)|S1、S2、S3|
|P8|未观察到 round_end 的取消、失败或退出不补造主会话终点。|自动：无结束交付时保留旧终点；已有结束交付时正常刷新，不新增退出补存。|[Implementation Decisions：主会话时间](./spec.md#implementation-decisions)|S1、S2、S3|
|P9|Total 的时间只代表主会话跨度，不把子代理耗时相加。|自动：主跨度 600,000 ms、两个并行子代理各 360,000 ms，Total 仍表示 600,000 ms。|[story 10](./spec.md#user-stories)|S2|
|P10|子代理耗时读取 omp 原生运行耗时，不以自建计时器或 Hub 物理跨度替代。|自动：以原生最终 360,000 ms 与不同物理跨度作可区别输入，观察实际采用值；真实 omp 事件证据。|[stories 11, 22, 37](./spec.md#user-stories)|S1、S2、S3|
|P11|同一子代理 Session 的多次执行仍在一行中累计运行耗时。|自动：两次原生执行 360,000 ms、120,000 ms，且均在既有提交前取得；一行累计 480,000 ms。|[stories 12, 13](./spec.md#user-stories)|S2、S3|
|P12|同一执行的多次进度及重复结束观察不重复贡献耗时。|自动：同次进度 100,000、200,000 ms 后最终 210,000 ms，重复最终通知，再执行 90,000 ms；累计为 300,000 ms，而非进度之和。|[stories 14, 15](./spec.md#user-stories)|S1、S2、S3|
|P13|子代理时间采集或提交不改变主／子 Session 的消费归属和既有 Round 语义。|自动：子代理原生执行结束但其 Round 仍有自动继续时，不伪造 round_end、不提前消费结算；保存时间不覆盖其他 Session 的 own 消费。|inferred — required to fulfill stories 11, 16, 24；继承聚合 ADR 的消费归属与观察权限|S1、S3|
|P14|时间与消费共用既有 JSON 提交，不增加时间专属文件或额外写入。|自动：消费提交前可用的时间随同一文档提交可见；仅进度／原生结束／等待时间／关闭过程不增加时间写入；观察实际文件操作与正常消费路径。|[stories 16, 39](./spec.md#user-stories)|S1、S3|
|P15|时间采集缺失或时间数据无效会报错，但不阻止请求、消费统计、既有消费提交或其他展示。|自动：缺原生来源及无效时间读数，捕获明确错误输出，同时用预定消费值证明请求／消费提交可继续；正常“尚无首轮终点”不冒充有效时长。|[story 38](./spec.md#user-stories)|S1、S2、S3|
|P16|没有可靠时间来源的指标保持不可用，不填零或推测历史值。|自动：缺源显示“—”；可靠报告的 0 ms 与缺失可区分；旧记录不使用最后 transcript 时间伪造终点。|[stories 21, 22](./spec.md#user-stories)|S1、S2、S3|
|P17|晚于消费提交到达的最终耗时不触发补写或要求消费等待。|自动：消费先提交、最终耗时后到；无后续既有提交时磁盘不补写，有后续提交时可保存已取得的可靠值；不把未保存值声明为已落盘。|[story 39 与最终保存取舍](./spec.md#user-stories)|S1、S3|
|P18|成功提交的子代理累计耗时在 JSON 中是可统计的数值毫秒，不只是显示文本。|自动：两次原生耗时示例提交后读取 480,000 的数值毫秒累计及其实际 Session 归属，而非“8分钟”字符串。|[story 17](./spec.md#user-stories)|S3|
|P19|同一消费周期内，重新加载恢复成功提交的时间与启动快照。|自动：新 runtime／进程从同一文档恢复起止时刻、480,000 ms 子代理累计及完整启动事实；仅内存晚到值不视为已恢复。|[stories 18, 27–30](./spec.md#user-stories)|S2、S3|
|P20|clear 与首次 holiday 重置在既有归档／新周期提交中一并清除活动时间。|自动：分别重置并重新加载；新文档不携带旧时间，消费原有归档／重置结果保持；已处于 holiday 时不再次重置。|[story 19 与最终重置取舍](./spec.md#user-stories)|S2、S3|
|P21|消费重置后，主会话从下一条新输入起算，子代理只累计新的执行。|自动：重置前输入 10:00、重置后新输入 11:00、结束 11:03，跨度为 180,000 ms；旧原生执行迟到结束不带回已清除的耗时，新执行 120,000 ms 则新累计为 120,000 ms。|[story 40](./spec.md#user-stories)；迟到旧执行隔离为 inferred — required to fulfill 已批准重置规则|S1、S2、S3|
|P22|旧消费文档缺少新增时间／启动字段，不因此丢失或暂停原本有效的消费数据。|自动：已有 tokens、cost、parent 的有效旧文档正常恢复并继续提交；缺失新字段保持未知，不将其认作消费损坏。|[stories 20, 30, 38](./spec.md#user-stories)|S3|
|P23|Total、Round 和所有相关 detail 行都不再展示 Sum 列。|自动：实际 widget 输出验证 brief／detail、多模式、主会话 model 行及后代 Session 行；验证用户可见字段集，而非固定整行空格。|[story 23](./spec.md#user-stories)|S2|
|P24|移除 Sum 和增加时间不改变保留字段的业务数值及消费算法。|自动：独立给定 Cache、费用、参考费用、上下文与自身／含后代累计期望值，验证与既有合同一致；不把金额与耗时互换。|[story 24](./spec.md#user-stories)|S2、S3|
|P25|Round 不新增时间列。|自动：brief 下实际 Round 输出字段验证，与 Total 的主会话时间区分。|[Implementation Decisions：主会话时间](./spec.md#implementation-decisions)|S2|
|P26|子代理显示可靠任务命名句柄，且尊重明确 Session 名称，不将 agent 类别当作任务名称。|自动：类别 task、句柄“检索定价”、后续明确 Session 名称“定价核查”的来源映射和实际输出；以 scout 等非 task 类别验证不是字符串特判。|[stories 25, 26](./spec.md#user-stories)|S1、S2、S3|
|P27|子代理展示可可靠证明的启动实际模型及有效思考强度。|自动：启动 model-A / high，原生来源映射与输出对应该组合；auto 情况仅采用可可靠取得的初始有效强度；真实宿主证据。|[stories 27, 28](./spec.md#user-stories)|S1、S2、S3|
|P28|后续切模型、改强度或追加执行不改写子代理原有启动快照。|自动：启动 model-A / high，后续 model-B / medium，显示与成功保存的快照仍为原组合；当前值不反推启动值。|[story 29](./spec.md#user-stories)|S1、S2、S3|
|P29|无法证明的历史启动模型／强度显示“?”，不以当前设置补造。|自动：旧文档没有快照、只有当前 model-B / medium 的情况下，相应启动字段保持未知。|[story 30](./spec.md#user-stories)|S1、S2、S3|
|P30|子代理字段在同一树深度内纵向对齐，各深度独立列宽。|自动：同深度不同名称长度、同深度不同父代理、不同深度分别观察字段起始显示列；保留树形关系与一 Session 一行的逻辑记录。|[stories 31, 32](./spec.md#user-stories)|S2|
|P31|缺失字段保留列槽，后续字段不因缺失左移。|自动：同一深度交错缺模型、强度、耗时或上下文，比较后续字段的终端显示列。|[story 33](./spec.md#user-stories)|S2|
|P32|列对齐按实际终端显示宽度处理中文及颜色包装。|自动：中文、ASCII 混合名称与有／无主题颜色的实际输出，观察显示列而非字符串长度；真实终端输出证据。|[story 34](./spec.md#user-stories)|S2|
|P33|长文本／窄屏采用同深度组内一致的省略或续行，保持对齐与可读性且不改变完整数据。|自动：统一续行、列位置、完整保存值和 resize 结果；**human-led**：仅判断实际终端省略／续行是否易读。agent 准备中文／长名称／长模型、多层级、缺失字段、宽窄终端的实际输出证据并列出观察宽度；用户确认前该判断仍未验证。|[stories 35, 36](./spec.md#user-stories)|S2、S3|
|P34|本需求不要求修改 omp 源码或新增宿主补丁。|自动：使用支持范围内现有宿主运行采集与展示 smoke；交付差异不得包含本需求的宿主源代码／新补丁改动。已有支持前提不等于本需求新增补丁。|[story 37](./spec.md#user-stories)|S1、S2|
|P35|共享存储中的时间合并不丢失其他 Session 的成功提交，也不重复计入同一次执行。|自动：真实多进程／文件协调场景，独立 Session 写入及同执行重复观察；最终时间与 own 消费符合独立给定值，不能靠最后写入者覆盖证明正确。|inferred — required to fulfill stories 14–18；继承聚合 ADR 的并发正确性|S1、S3|
|P36|整个消费 JSON 的既有提交失败或消费文档本身不可用时，沿用原有拒绝／报告规则。|自动：真实协调提交失败、有效消费中仅时间无效、消费本体损坏三类分开；不以时间非阻塞为由吞掉整体消费保存错误或覆盖损坏文档。|[Implementation Decisions：持久化与消费周期](./spec.md#implementation-decisions)；继承 Storage baseline 与聚合 ADR|S2、S3|

## Seam decisions

|Seam|Exposes|Hides|Alternatives considered|Reversibility|
|---|---|---|---|---|
|S1 — 宿主事实观察 interface|实际 Session 身份及输入归属、已有语义 Round 交付、可靠名称、启动事实、原生运行耗时及其所属执行；对缺失事实的明确表达与错误报告。复用已有事实／交付 interface，在本仓库公共契约及 omp adapter 中小型增补。|原生事件对象、消息存储细节、采集订阅方式、执行识别构造、去重实现及其他 internal seams；不向业务透传完整宿主对象。|仅从 widget 验值无法区别自造计时与原生时长，故拒绝；以原生对象直接进入业务违背已确认分层；无需为每个字段新增外部 interface。|公共事实语义若变化需要同步消费者与 adapter；增加有明确缺失语义的事实可局部演进。真实 omp 与受控 adapter 都兑现同一可观察事实，而不是仅有一个 adapter 的假想 seam。|
|S2 — /budget 操作与 widget 输出 interface|操作结果、用户可见字段、数值、树结构、同深度列布局、缩略／续行及错误输出；复用现有命令和宿主绘制 interface。|布局算法、内部显示类型、缓存、颜色包装与宽度计算实现；不把 private helpers 写进验收承诺。|逐 helper 测试会把内部构造固定，故拒绝；整个 widget 单一 seam 不足以证明时间数据来源及落盘质量，需与 S1／S3 分开观察。|实现和格式可调整，只要语义、显示列及已批准可读性承诺继续成立。确切标题、单位文本和省略阈值不是固定合同。|
|S3 — 持久化 JSON 与重新加载 interface|现有 Storage root 中同一消费 JSON 的实际数据及其重新加载结果：按 harness／实际 Session 归属的可选时间数据、可验证的数值毫秒、可靠启动快照、旧文档可读性、消费重置与协调提交结果。只在既有消费提交中顺带保存可用时间。|内存组织、聚合与合并实现、具体锁和调度、去重标记组织、schema 的内部构造；不引入逐执行业务明细账或时间专属写入。已有消费字段及版本识别不能被随意破坏。|独立时间 JSON 被用户拒绝：增加写入与竞态；同 JSON 跨周期保留区也被用户以干净新文件和简化重置为由拒绝。选择同文档、同提交、随周期清除，并接受晚到时间可能未持久化。|若未来要求每次原生结束立即落盘或时间跨 clear／holiday 保留，需要重新批准保存／重置契约，并改动 schema 与恢复验证；不能静默补写或搬运旧时间。当前推荐维持已批准取舍。|

### 已批准的依赖与验证约束

- **In-process**：统计与布局通过上述 interface 观察；内部实现与 internal seams 保持自由，不以 helper 调用次数等细节作业务承诺。
- **Local-substitutable**：本地文件及协调写入；普通场景使用隔离本地存储，P35 的并发及 P36 的真实提交失败必须有实际文件／进程证据，不能以纯内存 adapter 代替文件协调。
- **True external**：omp。受控 adapter 可验证可区别的输入场景，但 P1／P2／P10／P27／P34 的宿主来源承诺还需要支持范围内真实 omp 证据。不存在本需求新增的 Remote but owned 依赖。
- 不增加实时轮询、时间专属写入、外部请求或存储根配置。时间只按 Session 聚合；执行区分／去重所需的内部标记不等于新增逐执行消费明细账。

### 约束审查结果

六个 surface 均已走查；以下是覆盖结论而非新的 scope：

- **Entry**：已有 /budget、Session 输入和 widget 观察由 S1／S2 覆盖；不新增命令入口。
- **Data and state**：同消费 JSON、可选新增事实、旧数据恢复及周期清除由 S3 覆盖。原有消费文档不可用与仅时间缺失必须区分。
- **External dependencies**：omp、时钟事实和本地文件由 S1／S3 覆盖；供应商网络查询、随机标识的外部行为未因本需求改变，不提出新保证。
- **Errors and failure**：时间缺失／无效非阻塞且报错、晚到不补写、原有整体消费提交失败由 P15／P17／P36 覆盖；不新增重试、超时或退出码契约。
- **Output and observability**：时间值、缺失占位、字段精简、分层对齐与可见错误由 S2 覆盖；无新增报告、metrics 或模型上下文内容。
- **Resources and concurrency**：无额外时间写入、不因时间等待消费、实际 Session 归属及共享存储正确性由 P13／P14／P17／P35 覆盖，附着于现有 seams，不另建资源 seam。

Inferred 承诺均已标明来源及分类：P13、P21 的旧执行隔离部分、P35 是兑现已批准承诺所必需；internal choices 留在实现中；改变行为的保存／重置取舍已由用户批准并同步到 spec，没有未获批准的新行为。

## Not yet specified

- **无阻塞批准的未决选择。** 三个决策关卡已完成。
- 不预先固定具体时间字段拼写、可选数据的内部组织、执行识别／去重方式、确切显示标题、宽度阈值或构造顺序。这些是 seams 背后的实现自由，不是遗漏的外部行为保证；最终 JSON 必须能按实际 Session 读出数值毫秒及可靠快照，并且旧消费格式继续可读。
- 不预先切分交付工作。/to-tickets 应关联每个 promise 的 delivering work 和 Coverage，不能把 P33 的人工判断转移成遗漏实现。

## Out of scope

继承 [spec 的 Out of Scope](./spec.md#out-of-scope)，合同不另加排除项。特别是已获批准的最终取舍：不改 omp、不新增宿主补丁、不做逐执行明细账、不新增时间文件／写入／补存、不跨消费重置保留或重建时间、不保证无后续既有提交时的晚到耗时持久化。
