# framework 如何提供独立存储、原子更新与跨进程协调？：Lighthouse

> Question and discussion: [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)
>
> 本轮无账号键 schema 已获用户最终确认；当前文档为存储规划权威，文件 module、宿主接线、生产迁移与验收尚未实现。确认原话见[本轮存储 schema 确认来源](../assets/storage-schema-confirmation-2026-10-12.md)，修订前原文见[发布前快照](../assets/storage-schema-before-publication-2026-10-12.md)。

> 本次 Traverse 补齐 Q24 锁回收／后续可写及 Q25 名称／余额边界；[Traverse 确认来源](../assets/traverse-confirmation-2026-10-13.md)。既有 resolved 状态与其他范围保留，仅规划出版。

## Question

确定 model-cost 的本地数据组织、单一消费源与通用安全写入的职责：保存完成／失败、跨进程协调、clear 一致性、路径／平台条件，以及物理 schema 与 framework 文件能力边界。以下 Discussion 是唯一有效规则，源票保留探索记录与证据限制。

## Discussion

### 本轮批准修订与来源

按账号定点归档／重置改为完整消费 JSON 归档／重置，取消 accounts／providerAccountId，零消费走相同流程；多 CLI 事实保留跨进程锁。旧 Q25 账号布局曾被撤销；本轮替代结构已显式批准，见当前 Q25。 批准来源：[命令票本轮确认来源](../assets/command-confirmation-2026-10-12.md)（Q13–Q16、Q17–Q20）。此前账号键／身份分区和定点 clear 的政策仅为已被替代历史；不要求认证秘密落盘。非本轮替代范围继续有效，规划不等于实现。

### 单个消费活动文件与独立历史归档

用户选择本地 JSON，消费活动数据集中在一个文件，归档各自独立，不引入数据库、不按账号预拆文件。本轮取消 accounts／统计账号身份分区：framework 每 provider 单账号，model-cost 不识别替换，消费 clear 整文件备份／重置；provider 支持政策只在[消费归属原权威](02-accounting-ownership.md#账户隔离多会话与额度)持有。用户最常见为多个 CLI 同时运行，正常同机跨进程安全更新仍是支持范围。

旧 daily-tracker 的活动／归档分离作为组织参照；旧算法和新业务并非必须逐字段相同。用户级共享目录及配置解析由 Q16–Q20 确认；文件组织与名称由 Q21 确认；旧 Q25 账号键布局已撤销；替代 schema 现由 Q25 持有。程序不自动清除旧统计，用户切换版本时手动备份并清空后复用旧目录。

### 独立的 Codex 估计文件

用户明确 codex-usage-estimate 是估算 5h／7d 额度转换关系的独立功能持久化文件，保持独立，复用 framework 的安全写入 module。本票不展开其业务算法；这不是移除估计功能，也不是将其合并到消费活动文件。原有效估计与调度要求仍由既有行为／数据结论及刷新票约束。

### 一个消费计算来源与 Session／最近 Round

会话自身的 provider／model 聚合是唯一消费源，逐响应按请求锚价更新，round_end 保存 Session 累计与直接父关系，不保存 Round／Turn 记录、recentRound 或轮次开始／结束快照。Session 自身／子代理／含后代和全局金额均从自身桶派生，不另写 totalCost／totalTokens，不按当前价重估。正常连续对话的上一 Round 推断与恢复取舍只在[数据原主题](12-state-data-contract.md#最近-roundtree-与恢复展示)持有；运行期内存快照允许，不是持久字段。

子代理保存独立自身累计与同 harness 内的直接父 Session ID，父子树在内存派生，不把子消费复制进父 own。理由是用户重新限定轻量文件只记录 Session 级消费，仍要求 Session 恢复。取消已批准的最近 Round 落盘不是取消正常运行的上一 Round 展示或 round_end 保存时机。确认原话见[本轮存储 schema 确认来源](../assets/storage-schema-confirmation-2026-10-12.md)，修订前原文见[发布前快照](../assets/storage-schema-before-publication-2026-10-12.md)。

### Extension 模型与 framework 基础能力

用户进一步澄清：Session、Round、Request／Assistant response 的公共字段、身份、生命周期与可取得的 usage 等源事实属于 framework 提供的能力，由 adapter 映射宿主。extension 组合这些能力，选择业务统计与不同精度的持久化，不自行重复定义宿主观测。前文“计算与模型归 extension”限定为消费业务计价、聚合组合及持久化模型，不把源事实生成转移到 extension。公共逻辑／必要原生桥接的分层按[观察分层修订](03-observation-contract.md)，公共字段细节与累计事实是否提供仍由观察票决定，不因本澄清冻结新载荷或承诺不存在的宿主统计。

用户明确该聚合／最近轮／保存频率模型是 model-cost extension 的实现取舍，不是 framework 的通用持久化模型。framework 提供可靠本地文件安全更新，隐藏同进程／跨进程协调和发布细节，业务层拥有格式与合并规则。其他 extension 可以复用同一基础能力采用不同数据结构、寿命和保存时机，不要求使用 Session／Round。

用户曾在旧 extension 踩过多会话写入坑，明确不希望每个扩展重复实现底层协调。此理由支持可靠的通用 module，而非扩大成通用账本或业务 State。

### 文件 interface 与协调归 framework

用户明确同步／异步文件写入应经 framework 提供的 interface，同文件加锁或必要队列也归 framework，不让 extension 自己实现协调。锁／队列是达到安全更新的机制，不自动批准后台队列或两套公开 Sync／Async 方法。本次确认安全异步更新 interface；不要求另加同步 interface。model-cost 的等待位置由下节 Q5 收口，其他 extension 自行选择调用组织。旧实现调用方直接 await 保存 Promise，但锁内使用同步 read／write／rename；Promise 不意味着同步文件代码可与同线程其他代码并行执行。

### Q5：提前提交，handler 返回前等待

用户明确确认：捕获稳定的 Session 自身累计与直接父关系快照，提交 framework 安全异步更新，继续不依赖保存成功、且不再写同一文件的独立逻辑，handler 完成前 await 保存结果。framework 底层采用非阻塞文件操作，不只是给同步 I/O 包 Promise；不是 fire-and-forget、不新增退出后排空系统。

所有正常返回／提前返回／异常路径都需收口该保存任务，并及时接住保存拒绝；普通 round_end 保存失败策略已由下节 Q6 确认；具体反馈承载由展示票 08 收口，业务拒绝与保存失败的可判别结果由 Q24 确认。实际 I/O 是否已开始及性能收益取决于协调与运行条件，不宣称已有测量。本决定替代 agent 先前立即 await 的推荐，后者从未作为用户批准约束。

### Q6：普通消费保存失败丢弃未保存部分并重新初始化

用户在本轮明确确认修订：所有普通消费保存失败（包括业务不一致与临时 I/O／协调失败）都报告失败，但不因此停止代理主流程、不假报持久化成功；丢弃受影响消费状态的未保存部分，重新从磁盘当前有效完整快照初始化周期、Session 累计与版本。不将已有磁盘累计置零，不执行账户 clear，不重置磁盘周期／holiday。不清已处理请求的去重标记，避免旧通知重新计费。

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

普通重启／resume 没有运行中的内存状态时，读取当前消费统计周期内已保存的完整会话快照，一起恢复 Session 累计与保存版本，新快照从恢复版本继续递增，同一快照正常重交保持原版本；新周期没有该会话记录时才从初始版本开始。不扫描历史消息、不合并旧归档、不以当前价重算旧消费。

本轮按用户确认修订运行中失败分支：保存失败后不再保留较新未保存消费，按 Q6 丢弃并从磁盘当前有效完整快照重新初始化。版本只在同消费统计周期、同 harness、同会话内比较，旧周期版本再大也不覆盖新周期；现有磁盘记录缺必要字段不是普通无内存版本，不据此猜值或兼容旧统计。同 Session 单执行者检测由 Q26 收口，clear 后运行态由 Q23／Q6 收口。普通 resume 契约未改变，仅“运行中保存失败不回滚”被明确替代；修订前原文见源票历史。

### Q12：同版本不同内容拒绝并报告冲突

用户明确同意：同周期同会话同保存版本却不同快照内容时，保留磁盘内容，返回明确冲突并报告，不相加、不最后覆盖、不逐字段取最大值，也不新增持久冲突账本。区别于同版本同一快照的正常重复，不假报保存成功；普通 round_end 按 Q6 不因此中止主流程。业务快照相等按当前 Q25 的已确认 Session 字段内容判断。

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

用户对完整文件组织提议回答“同意”。storageDir 下固定 consumption.json 存放完整消费活动聚合／周期／holiday／Session 自身累计／直接父关系；本轮取消账号分区，不改文件名。codex-usage-estimate.json 独立保存唯一 Codex 范围估计，消费 clear 不清它；archives/<本次归档唯一标识>.json 每次独立保存完整活动 JSON，不覆盖旧归档。取消账号键后的具体字段布局按当前 Q25，不新增各文件路径配置。

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
- 锁年龄不再单独证明持有者已退出，不仅凭年龄回收可能仍由存活进程持有的锁；取得权限的 15 秒等待预算与锁持有者活性分开。可靠确认持有者已退出才回收；无法可靠确认时本次有限失败，不迟到写入。正常并发仍保证锁内重读及不覆盖他人已完成更新，不能以发布前 token 检查与 rename 两步自动宣称已消除回收／发布竞争。实现需提供失效锁恢复路径、释放自身协调资源，单次失败不堵死后续队列；不得因遗留坏锁／不可确认的状态造成一直无法写入新数据。具体机制按本机 happy flow 顺畅优先、允许极端边界丢失数据的原则落实，不扩建复杂恢复或 Session 执行者检测系统。此处是设计要求，不是生产协议已验证；真实互斥、退出后恢复与后续可写由验收确认。
- 协调键用目标目录规范化路径（已存在父目录的 realpath）+ 文件名，避免同一文件的不同写法绕过锁；路径别名统一。
- 留在 model-cost：JSON schema、消费统计周期／版本校验、按会话合并、归档与 estimate 业务规则。

明确不采用：把旧 OMP native file-lock 或惰性原生 import 带进共享代码；只锁最终写入而不在协调范围内重读；后台任务队列／自动重试；同步 interface（本次只确认安全异步更新）。本能力实现时补进 `framework/docs/framework-capabilities.md`（该文档目前只覆盖 config 只读 YAML）。

旧→新：本次 Traverse 撤销“锁年龄超过预算即回收存活写入者，再仅以发布前 token 检查保证安全”的原机制；安全与可继续写入的正常路径约束保留，失败／极端损失仍按既有原则。用户强调“保证happy flow能顺利流畅完成……不要造成一直无法写入新数据的情况”，原话及设计反例见 [Traverse 确认来源](../assets/traverse-confirmation-2026-10-13.md)，旧全文见[发布前历史](../assets/traverse-before-publication-2026-10-13.md)。

### Q25：consumption.json 的物理 schema、归档与版本

用户最终确认以下结构。示例数字和模型名仅解释字段，不是实际价格或源数据；不自动沿用旧格式或账号键。确认原话见[本轮存储 schema 确认来源](../assets/storage-schema-confirmation-2026-10-12.md)，修订前原文见[发布前快照](../assets/storage-schema-before-publication-2026-10-12.md)。

```json
{
  "schemaVersion": 1,
  "periodId": "7e9983ee-6f68-4bb7-8c01-13a48beaf24b",
  "start": "2026-10-12T04:00:00.000Z",
  "start_bal": 99.8,
  "holiday": true,
  "harnesses": {
    "omp": {
      "sessions": [
        {
          "id": "session-main",
          "name": "主会话",
          "parent": null,
          "saveVersion": 2,
          "own": {
            "deepseek": {
              "model-A": {
                "tokens": {
                  "input": 1000,
                  "cacheRead": 500,
                  "cacheWrite": 0,
                  "output": 200
                },
                "costCny": 0.01
              }
            },
            "openai-codex": {
              "model-B": {
                "tokens": {
                  "input": 2000,
                  "cacheRead": 1000,
                  "cacheWrite": 0,
                  "output": 300
                },
                "referenceCostUsd": 0.02
              }
            }
          }
        },
        {
          "id": "session-child",
          "name": "资料核对",
          "parent": "session-main",
          "saveVersion": 1,
          "own": {
            "deepseek": {
              "model-A": {
                "tokens": {
                  "input": 600,
                  "cacheRead": 0,
                  "cacheWrite": 0,
                  "output": 100
                },
                "costCny": 0.005
              }
            }
          }
        }
      ]
    }
  }
}
```

- 文件根：schemaVersion、periodId、start、可选 start_bal、holiday、harnesses。schemaVersion=1 为当前格式门槛，正常保存／重置不递增；未知／缺失／损坏格式按 Q14，不猜零、不自动迁移旧 deepseek-cost.json。
- periodId 是整文件重置代际，不是文件内分桶键。每次成功 clear／首次开启 holiday 切新周期；提交与锁内磁盘周期不同按 Q8 拒绝。它与 start 的可读时间、schemaVersion 的格式门槛、saveVersion 的快照排序各司其职。
- harnesses.<harness>.sessions 为扁平 list，不是 sessions.<harness>、map 或嵌套树。Session 记录为 id、name、parent、saveVersion、own；同 harness 内 id 唯一，更新按 id 找到替换或追加，保留其他记录；不是按数组位置识别。完整身份为 harness＋原生 sessionId，harness 标识不是版本，parent 为同 harness 的直接父 Session ID，主会话为 null。不要求父记录先落盘，不创建占位父节点；恢复按关系派生树／汇总。
- harness／实际 sessionId／直接父身份由 adapter 映射宿主事实，经 framework 公共接口提供；model-cost 不猜 ID 格式、不读原生 context。仅预留未来 pi 桶，不预建空 pi 数据，也不实现或认证 pi；具体接线由装配票落实。
- own.<provider>.<model> 保存自身 token 四桶 input／cacheRead／cacheWrite／output；按公共 usage 口径区分，input 与缓存不重复累计。保存逐响应锚价后的费用；DeepSeek costCny 与 Codex referenceCostUsd 分开。缺价仍保留可靠 token，只不追加对应费用，不用以后价格补算。Codex 对金额合计贡献为0，不抹掉token／美元参考费用，不把混合 Session 的全部金额归零；渠道分类只消费[消费归属原权威](02-accounting-ownership.md#金额口径缺失与冲突边界)。
- 不保存 Session／父含后代／全局 totalCost／totalTokens，不保存 last* 宿主差分基线，不保存 recentRound、Round／Turn 明细或轮次快照。总数从已算桶求和，可缓存内存只读视图；不是当前价重估，render 不读盘或改权威值。
- saveVersion 作用域为 periodId＋harness＋sessionId；恢复已保存版本，新快照递增，同快照正常重交保持原版本。Q8 旧版本拒绝、同版本同内容幂等，Q12 同版本不同业务内容冲突，不相加／最后覆盖。业务相等按已确认记录字段内容比较，不以 JSON 字符串排版或 map 键顺序区分。正常合并只改负责记录，不以旧 list 整份覆盖。
- start 是周期开始时间。start_bal 为可选的 DeepSeek 人民币边界余额，可靠读数缺失则省略，不填0。Session name 是展示名称，不作身份。名称来源与持续事实更新消费[观察原主题](03-observation-contract.md#正常数据流与最小事实契约)：按 harness＋sessionId 更新内存中的同一会话名称，下次正常消费保存时一并更新该记录的 name；不因改名或宿主会话日志写入独立触发 consumption.json 写入，不改变 round_end 保存频率。最新余额缓存继续仅内存；起止边界读数是旧文件已有历史信息，不因此持久化一般远端读数。
- archives/<archiveId>.json 使用 crypto.randomUUID()，已存在拒绝覆盖；保存锁内最新完整有效活动 JSON，另加 end 和可选 end_bal。本次同一可靠余额用作旧归档 end_bal 与新活动 start_bal，无可靠读数两者均省略；余额差不要求等于已算消费。时间用 ISO 字符串，归档保留旧 periodId／start／holiday／所有 harness Session。余额来源消费[刷新原主题的命令边界查询](09-refresh-lifecycle.md#clear首次-holiday-的边界余额查询)，成功查询提供同一边界值，失败／超时则两处省略，不以旧缓存代替该次查询结果；具体接线由装配负责，字段存在不证明远端请求已验收。
- 零消费也归档。普通 clear 新活动含 schemaVersion、全新 periodId、start、可选 start_bal、holiday=false、harnesses={}；首次开启 holiday 复用同一安全归档／重置流程，新活动 holiday=true，不先 clear(false) 再第二次 setHoliday。已开启幂等，不重复切周期。完整消费 reset 涉及所有 harness／provider，已有归档、独立 Codex estimate 与入口 detail 不清。动作触发和条件只在[命令原主题](07-command-state.md#holiday-与-clear当前入口适用条件)持有；Q13 先归档再实际提交、失败终止仍有效。

### Q26：同会话多执行者靠版本冲突收口

用户同意不新增执行者检测（租约／心跳／每会话锁）。`saveVersion`、Q8 旧版本不覆盖、Q12 同版本不同内容拒绝，加上失败按 Q6 丢弃并从磁盘重初始化，已经防止两个进程同时运行同一会话时静默覆盖或重复计费；代价是冲突实例的未保存段丢失、保存交替失败，属已接受的少量损失。明确：同会话同时双执行者不支持，只在保存时通过版本冲突发现。

## Decision

消费活动数据集中存于一个本地 JSON，历史归档及 Codex 估计文件独立；model-cost 以唯一自身聚合派生统计，round_end 保存 Session 自身累计与直接父关系，Round 只运行期推断。framework 提供公共 Session／Round／response 事实与可复用的安全文件更新机制，不规定扩展业务持久化模型；普通消费保存失败反馈而不打断主流程，丢弃未保存部分并从磁盘有效快照初始化，接受少量损失，不增后台重试；同文件更新采用轻量进程内 FIFO，跨进程互斥而不承诺全局顺序；按会话记录合并并校验消费统计周期／保存版本；取得权限前有限等待／可取消，开始更新后等待实际结果；协调等待默认 15 秒可由调用方覆盖，同版本不同内容拒绝并报告；resume 与失败后初始化均以磁盘有效完整快照为基线；clear 先归档再提交活动重置，失败终止；无有效基线暂停消费统计／保存至下一次正常初始化；clear 仅归档锁内最新已保存数据，不排空内存并丢弃未落盘消费。

用户级共享且目录可配置，storageDir 的 ~/ 特指用户 .omp 主目录；初始 ~/cost-archive 复用旧目录，由用户切换前手动备份清空；初始化读取、修改重启，不热切换或自动迁移。该根下固定 consumption.json、codex-usage-estimate.json 与 archives/ 独立归档文件，不另设各文件路径配置。

文件协调的本次保证限定本机本地文件系统，同机跨进程正常安全共享及失败后后续可写；不承诺网络盘／云同步的跨机器共同写入，也不为极端完备性扩大恢复系统。

framework 提供 harness-independent 的协调读-改-发布能力，业务 schema／合并规则归 model-cost；本轮 Q25 已冻结无账号键、harness 优先／Session list／provider-model 自身桶、格式／周期／保存版本与边界元数据。普通保存仅按负责记录更新，完整归档／重置遵循 Q13／Q25；读新鲜度与同 Session 多执行者取舍仍按 Q23／Q26。生产实现与验收尚未完成。

## User stories

1. As a 用户, I want 一个消费活动文件与独立历史归档, so that 当前单账户使用不承担预拆文件复杂度且保留明确的消费统计周期恢复。
2. As a 用户, I want Session 持久累计与运行期上一 Round 推断来自同一消费聚合, so that 展示、保存和恢复不维护两套消费算法或重复计费。
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
23. As a 用户, I want 保留周期时间、DeepSeek 起止余额和 Session 名称, so that 旧统计文件的可读边界信息不丢失。
24. As a 用户, I want harness 优先分层、扁平 Session list 与 provider／model 桶, so that 保存恢复贴近原数据、不同宿主身份不碰撞且模型统计方便。
25. As a 用户, I want 正常写入流畅且失效锁可恢复、失败不堵后续队列, so that 极端少量损失不会演变成一直不能保存新数据。
26. As a 用户, I want 名称在内存持续更新并随下次正常保存写入同一 Session, so that 改名及时可见且不增加消费文件写入频率。

## Preconditions

- 复用旧目录前由用户手动备份、清空旧统计并完成新旧加载切换；原新实现加载互斥与回退步骤由验收票收口，不将此规划当已经完成的用户动作。

- [数据归属与账户周期决议](12-state-data-contract.md)提供本周期 Session 自身聚合、运行期 Round 推断、父子关系及接受的未保存损失边界。
- [观察契约](03-observation-contract.md)提供可靠响应、Round、会话与父子身份及最新名称事实；[账户访问](../decision/04-provider-access.md)提供当前认证资料，不提供持久化统计身份。
- Q23／Q24／Q26 已确认安全更新 interface、完成／失败结果、旧提交拒绝、锁与平台、路径、clear 归档／重置一致性及读新鲜度契约；这些仍是规划，不代表 framework 文件能力已实现。实现需 node:fs 等运行时文件 API（与 config 读取一致），不再要求统计账号身份格式；取消账号键后的物理 schema 已由 Q25 最终确认，落地点由装配票决定。

## Postconditions

- [装配规格](../decision/10-assembly-layout.md)不得把消费 schema、计价或 Session／Round 保存规则放入 framework 基础文件 module。
- [展示](../decision/08-presentation.md)读取同一自身聚合及派生视图；[验收](../decision/11-acceptance-cutover.md)覆盖恢复与多会话保存，不恢复历史明细账要求。
- [命令](../decision/07-command-state.md)的 clear 与首次开启 holiday 消费本票的归档／重置一致性机制（Q13／Q15／Q24／Q25），生产实现与验收由装配／验收票承接；[刷新](../decision/09-refresh-lifecycle.md)保留独立 estimate 的调度责任。

- [展示](../decision/08-presentation.md)确定普通 round_end 保存失败在 UI／headless 的反馈承载；[装配](../decision/10-assembly-layout.md)及[验收](../decision/11-acceptance-cutover.md)采用修订 Q6 的不阻断、丢弃未保存部分／磁盘有效基线初始化及明确接受少量损失，不按旧失败保留内存要求验收、不默增后台重试。

- [装配规格](../decision/10-assembly-layout.md)把 Q7 串行与跨进程协调留在 framework 文件 module；[验收](../decision/11-acceptance-cutover.md)验证同文件 FIFO、失败后继续、不同文件独立及跨进程安全更新，不要求全局 FIFO。

- [观察](../decision/03-observation-contract.md)、[命令](../decision/07-command-state.md)承接消费统计周期拒绝与实际取消／反馈映射；[装配](../decision/10-assembly-layout.md)、[验收](../decision/11-acceptance-cutover.md)采用 Q8 的按记录合并与版本校验、Q9 的等待阶段终止后无迟到写入，不宣称 clear 多文件事务或整操作硬超时已解决。

- [装配规格](../decision/10-assembly-layout.md)承接可配置共享目录的配置与注入；[验收](../decision/11-acceptance-cutover.md)承接跨项目共享、配置生效与旧文件保护；采用 Q17–Q20 的字段局部解析与用户手动备份清空的切换前置；采用 Q21 的固定文件组织；schema／锁及归档唯一标识契约已由 Q24／Q25 确认，实现由装配／验收票承接。

- [装配规格](../decision/10-assembly-layout.md)不得为本范围新增分布式锁／云同步冲突合并；[验收](../decision/11-acceptance-cutover.md)在已声明本地平台／运行基线上证明同机并发，不推定其他 OS 或网络盘已支持。

- [装配规格](../decision/10-assembly-layout.md)把 Q24 协调读-改-发布能力暴露为 framework 公共能力（实现时同步 `framework/docs/framework-capabilities.md`），不把 schema／周期／版本／合并规则放进 framework；[验收](../decision/11-acceptance-cutover.md)验证真实跨进程互斥、锁内重读、原子读、损坏不覆盖、失效锁恢复、正常并发不覆盖他人已完成更新、失败后后续调用仍能写入，以及 Q25 恢复／归档、最新名称随正常保存更新与 Q26 版本冲突；不把极端完备性作为无限扩建机制的门槛。
- [展示](../decision/08-presentation.md)读同一自身聚合；不做请求前读取或定时轮询，不因本能力新增第二种消费来源。

## Invariants

- storageDir 的 ~/→用户 .omp 主目录是 model-cost 字段局部语义，不改变 framework 其他字段路径规则；程序不代替用户自动备份／清空旧统计。

- 会话自身累计是唯一消费聚合源；工具、Round 发布、账户与父子汇总不产生第二笔消费。
- 延续旧 daily-tracker 的本地 JSON 活动／历史分离思路，不要求照搬旧 token 差分／费用增量算法。
- 持久化模型归 extension；framework 的基础文件 module 不认识 holiday、业务计价、本消费统计周期消费累计或 Session 持久化 schema，不升级 boolean 激活 State 为业务容器。
- 原生 file-lock 不直接泄漏到 shared logic；安全协调按现有 harness-independent 分层决定。
- clear 不改 framework 活动态，不清已有归档或独立 Codex estimate；账号分区与“其他账号保留”要求取消；本票局部确认不移除其余既定数据寿命。

- framework 文件能力不认识 holiday、消费统计周期、会话版本或 Session 业务 schema；schema／合并／归档规则归 model-cost，能力只负责协调、锁与发布。
- 读新鲜度：锁内读取即最新；普通运行不做每请求磁盘读、无定时轮询、无空闲刷新。
- 正常锁内读改发布不覆盖他人已完成更新（对齐 [ADR-0002 shared-file concurrency scope](../../../docs/adr/0002-semantic-extension-framework.md)）；不能仅凭年龄夺取可能存活的持有者锁，也不能以两步 token 检查／rename 宣称原子保护。失效锁必须有恢复路径，单次失败不能堵死后续写入；极端边界允许数据损失，不扩建复杂恢复。
- 名称更新只更新运行期信息，随下次正常消费保存按 harness＋sessionId 更新同一记录，不独立触发写入；起止余额查询触发只消费刷新权威。
- 旧统计文档不兼容（地图 Out of scope 已确认）；程序不自动迁移、清空或合并旧数据。
