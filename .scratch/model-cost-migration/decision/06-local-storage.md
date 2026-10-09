# framework 如何提供独立存储、原子更新与跨进程协调？

Type: grilling
Status: open
Assignee:
Blocked by: 01, 02, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](02-accounting-ownership.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- 数据布局已由[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)收口；本票不再等待数据票，也不恢复旧逐 Turn 账本／历史 Round／补账要求。
- 设计实际会话 × 账户 × 模型自身聚合、父子启动关系、最近 Round 快照、账户周期／归档、holiday 与 quota estimate 的物理组织；runtime 请求去重标记不落盘。最近快照同 round_end 聚合发布；迟到子消费发布时机仍待决定。
- 账户 clear 归档目标账户全部会话已知聚合、重置活动累计、关闭 holiday；无消费也可关闭 holiday。既有归档、其他账户、Codex estimate、入口 detail 保留。普通 resume 仅加载活动周期，不扫描消息／合并归档。
- 需确定归档／重置／关闭 holiday 的一致完成／失败条件，旧缓存／排队保存／其他进程不复活已清数据的最小代际／原子机制，以及混账户父子关系中其他账户查询所需关系如何保留；这些是本票未决机制，不是新批准 schema。
- round_end 保存完成／等待／失败、发布幂等及同账户多会话不丢不重仍需收口；未落盘强杀损失已接受，不借此增加退出排空／崩溃恢复系统。

## Handoff from latest state-data discussion

- [数据讨论的当前有效决定与新对话交接](12-state-data-contract.md)优先于下方历史交接：采用扩展自有聚合，round_end 保存累计与最近 Round 快照，不建立历史 Round／Turn 列表；接受异常退出未落盘损失，缺 usage／价格只提示并跳过对应指标，不维护缺失计数或补算记录。不能沿历史交接重新要求完整账本或缺失恢复系统。
- 会话／账户隔离、正常有 usage 消费去重、逐代理自身／含后代汇总、同账户多会话不丢失／重复／覆盖仍保留。最新余额／额度读数仅内存，holiday／quota estimate／归档保留既定持久化要求。
- 数据布局已由正式 Lighthouse 收口；本票可继续讨论保存完成／失败、有限幂等发布、迟到子消费时机及跨进程协调。不泛问整个 callback 同步／异步，不预建正常离开的额外保存钩子。

## Discussion approach

以数据／State 票给出的具体记录和读写路径为前提，先比较实际存储方案及调用方式，再决定操作级的同步／异步、锁与恢复。不泛问“整个回调等待不等待”，不把存储实现推迟到观察接口已冻结之后。至少走通一次正常消费写入和一次多会话同账户更新，说明当前内存值、持久化确认、故障后恢复各依赖什么。

## Handoff from clear reset decision

来源：[数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)。只保留账户级 clear：归档目标账户全部会话的已知活动聚合，重置累计并关闭该账户 holiday；空消费也可结束 holiday。不提供会话树级 clear，不清其他账户、旧归档、Codex estimate 或入口 detail。clear 前在途消费丢弃，之后旧子新请求正常统计；不取消真实执行或改 framework 生命周期。

Session／Round 累计限于适用账户当前周期；resume 只恢复已保存活动聚合，不扫描历史消息重估或合并旧归档，不维护跨周期 Session 总数。归档／reset／关闭 holiday 的一致成功／失败、跨进程旧缓存不复活、混账户关系保留与运行条件仍待决定；单一 DeepSeek 活动会话仅是讨论假设，不取消多会话支持。旧范围／交接文字见[同步前历史快照](../assets/contract-history-before-sync.md)，不再作为当前要求。

## Question

新统计允许从空开始；确定新存储根目录、扩展／账户／provider namespace 与路径配置，且不删除或改写旧 ~/.omp/cost-archive。哪些通用文件能力进入 framework，哪些 JSON schema、合并／归档及 estimate 采纳规则留在 model-cost？

确定读缓存新鲜度、锁内重读／update、原子发布、跨进程锁、等待／取消／错误与损坏不覆盖契约，并讨论平台条件。旧 OMP native file-lock 不能作为 harness-independent implementation 偷渡进共享代码。保留当前已确认的账户周期聚合／归档／holiday 与 quota estimate 业务能力；不照搬旧完整账本或补齐要求。从空起步不等于取消本周期持久化、已保存值恢复或正常并发安全。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 的 Q10 确认现有累计与归档作为需求基线：账户周期、会话自身聚合、归档／reset／关闭 holiday 的业务边界已由数据 Lighthouse 明确；本票承接物理组织、原子发布、恢复确认与失败／协调机制，不重复决定旧业务范围。最新余额／窗口读数只存内存，不取消累计与 quota estimate 持久化。任何业务删改均需说明差异、理由并由用户确认，不得以实现取舍默删。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：可靠消费开始时关联实际会话、Turn／Round、账户、模型与锚价，内存逐响应计算、自身聚合并保存父子关系；不保存历史逐请求账本、不补已跳过的缺 usage／价格。普通重复防重与已知冲突处理需区分，可信来源／有限保留由观察票决定，不默新增持久冲突记录。支持同进程及跨进程多独立会话，账户累计不得丢失、重复或覆盖其他会话贡献。汇总视图不是第二笔消费。
- 待决定：聚合／父子关系／最近快照／账户周期如何组织与原子发布、普通恢复已成功保存值如何不重计、重复保存与损坏如何处理？接受崩溃未落盘损失，tree Round 不可用，不要求未入账恢复日志、补账或任意历史 Round 查询。不能用恢复时当前价格重算历史。
- 未知／额度消费／无统计口径是领域性质，不意味着实际免费；运行时不维护缺失计数、补算记录或持续完整性标记。最新余额／窗口读数仍只存内存；estimate 基线与采纳值按账户持久化，同源成对样本不可跨来源拼接。
- 待决定：账户周期已由账户级 clear 定义；归档／reset／关闭 holiday 与迟到新消费发布的原子性、旧在途丢弃及旧缓存不复活；同一 session 单执行者的协调与退出恢复由何种通用能力承接？不在本交接决定锁或文件格式。

