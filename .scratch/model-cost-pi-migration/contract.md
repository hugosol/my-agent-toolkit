# Contract — model-cost 在 pi 上的完整功能迁移

Source: [model-cost 在 pi 上的完整功能迁移 spec](spec.md)
Acceptance mode: Rapid iteration
Approval: approved

本契约记录三个外部 seam、可观察承诺及验证责任，不规定构建顺序或内部实现。需求叙述、完整范围和上游政策来源由 spec 拥有；职责、版本、公开事实优先级、Round 路线、耗时粗估及兼容取舍均继承 spec，不重新批准。

## Promises

### 覆盖约定

- **S1**：扩展消费 framework 的公共 interface。
- **S2**：实际加载后的 model-cost 操作 interface。
- **S3**：存储根的持久化文档 interface。
- 每行 Coverage 都是必需检查，除明确标为人类验收者外由 Agent 执行。可控输入和失败注入服务于确定性验证；涉及原生事实、第三方接入和实际装配时，必须补真实宿主路径，不能用 mock 结果替代。
- 期望值来自 spec、独立字面量或手算例，不用同一计费、汇总或格式化实现生成期望。身份、父链、启动快照和 context 的事实来源须与独立取得的可靠宿主事实对照，不能仅凭展示值相符证明来源真实。
- “一次记账”约束已观察请求的准入与重复累计，不承诺崩溃后所有未保存请求不丢。恢复以成功保存的 Session 聚合为准；不新增持久化请求账本或离线补账。
- 承诺不设人工维护的完成状态。只有交付工作完成、全部所需检查通过且人类检查获确认，才视为完成。交付工作关联由 `/to-tickets` 补入对应承诺；当前尚未拆票不是验收缺省通过。

**Complete implementation and all assigned automated checks before the human-led acceptance round. Planned human-led checks do not pause otherwise executable work. At the final handoff, report the remaining checks together with their prepared evidence; they remain unverified until the user confirms them. Report genuine blockers when encountered.**

|#|Promise (one observable result)|Coverage|Source|Seam|
|---|---|---|---|---|
|P1|pi 能通过发现入口实际加载 model-cost 并处理主会话操作。|隔离固定版本实际发现并加载入口；执行输入和命令，核对反馈、统计及保存结果，不以直接构造业务实例代替加载证据。|[stories 1, 54](spec.md#user-stories)|S2、S3|
|P2|未启用子代理提供方时，主会话功能保持可用。|无提供方实际运行主请求、统计及适用 provider 功能；不得要求不存在的第三方注册或声称宿主全局无子代理。|[story 3](spec.md#user-stories)|S2|
|P3|真实子代理接入失败不会被报告为正常无子代理模式。|区分未启用与注册失败、身份不匹配、协议不可用；观察明确诊断及接入结果，不把失败等同 false 或成功。|[story 4](spec.md#user-stories)、[Implementation Decisions §3、§8](spec.md#implementation-decisions)|S1、S2|
|P4|无子代理模式的 `/budget detail` 提示后不改变入口偏好或执行后续 detail 效果。|调用前后核对偏好对应输出、provider 请求及存储变化；提前返回不影响其他 budget 动作。|[story 5](spec.md#user-stories)|S2、S3|
|P5|子代理模式中没有子代理记录时仍能正常切换 detail。|实际成功接入但零子记录时执行动作，核对主会话 detail；不能按子代理数量拒绝。|[story 6](spec.md#user-stories)|S2|
|P6|budget 命令保留声明的帮助、参数拒绝及动作效果。|从实际操作 interface 驱动空参数、规范化匹配、非法参数与全部动作；非法参数不触发动作。重置动作的额外条件见 P37。|[story 7](spec.md#user-stories)|S2|
|P7|每次请求按真实开始时固定的请求锚价结算。|独立 usage/价格算例覆盖跨时段、改模型、改目录价、holiday 与周期变化；核对公共请求事实和最终金额。第三方最终 cost 设为与算例不同，仍必须使用自身计算。|[stories 9, 10](spec.md#user-stories)|S1、S2、S3|
|P8|同一已观察请求不会因重复交付、根子观察或文档同步重复累计。|主子、嵌套、并发、续跑及重复事件组合；跨 round 重复交付仍不能重计。合并后读取保存值和新进程恢复值。覆盖范围受本节一次记账约定约束。|[stories 8, 15, 54](spec.md#user-stories)|S1、S2、S3|
|P9|用量和金额按其真实统计口径表达，不把未知、参考费用或无口径当成确认零费用。|独立输入覆盖缺 usage、缺价格、可靠零、计费/额度/无口径及部分已知；核对跳过提示、各指标小计和持久化贡献，Codex 参考美元不进入实际消费金额。|[stories 11, 12](spec.md#user-stories)|S1、S2、S3|
|P10|Round 只累计本实际会话请求，子消费只沿直接父 Session 链参与 Session 汇总。|多 Turn、工具继续、子会话跨父轮续跑和晚到结果；独立列出各请求所属会话与金额，核对自身/含后代 Session 和父子各自 Round。|[stories 13, 14](spec.md#user-stories)|S1、S2、S3|
|P11|主子及嵌套会话保持可靠且互不替代的身份、直接父与 Owner。|同名不同身份、直接父非 Owner、并发/后台/续跑/取消、历史继承及进程变化；对照实际创建关系与公共交付，不以名称、深度、PID 或执行句柄推断。|[stories 15, 16](spec.md#user-stories)|S1、S2、S3|
|P12|会话最新名称能更新到统计展示。|真实改名后核对对应身份的公共事实、展示及下一次既有提交后的记录；不创建新身份、不额外制造消费。|[story 17](spec.md#user-stories)|S1、S2、S3|
|P13|启动快照只保留该实际会话可靠的新启动模型和有效 thinking level。|新建、未知部分、恢复、fork 继承历史、续跑及后续改模型/级别；独立核对启动事实，未知不借当前值，既有快照不覆写，随消费提交保存。|[story 18](spec.md#user-stories)|S1、S2、S3|
|P14|`follow` 在语义使用点取得 Owner 当前权威 State。|同进程和独立进程在子启动后修改 Owner，核对后续公共消费结果；同次语义处理使用一致快照，不用启动或持久化旧值替代。|[story 19](spec.md#user-stories)|S1|
|P15|State 暂时不可得时以声明默认值继续而不写回 Owner。|区分权威 false、读取失败及 inheritance none；核对可见消费和 Owner 值，memory 字段不从旧持久化值恢复，不宣称默认值是成功读取。|[story 20](spec.md#user-stories)、[Implementation Decisions §5](spec.md#implementation-decisions)|S1|
|P16|暂时 State 通信故障恢复后只影响后续读取，不重放已执行操作。|真实独立进程断开/恢复及可控故障；核对操作次数、后续新值、有限等待、同目标合并和有上限退避。健康后无持续恢复轮询，可靠失效/处置后不复活。|[stories 20, 21](spec.md#user-stories)|S1、S2|
|P17|扩大观察范围不授予 State 写权或 Owner 专属效果权限。|Owner/session 两种订阅观察同一子事件；尝试子侧或失效句柄越权操作并核对未生效，Owner 正常操作仍成立。|[story 22](spec.md#user-stories)|S1|
|P18|正常 Round 覆盖工具、自动重试、压缩与原生排队继续，最终结算后才正常结束。|实际宿主驱动普通请求及各继续路径，核对公共开闭序列和保存时刻；候选后延后一 task 重检，不以单次低层结束关轮。|[story 23](spec.md#user-stories)|S1、S2、S3|
|P19|后台结果等待及原生唤醒按公开保活标准接续父会话原 Round。|真实前/后台委派及批量结果；父子独立开闭，不由子终态直接结束父轮；覆盖既有唤醒超时标准与正常静止组合，保活查询不可得不冒充不活动。|[story 24](spec.md#user-stories)、[Implementation Decisions §8](spec.md#implementation-decisions)|S1、S2、S3|
|P20|未来独立任务的登记本身不会保持当前 Round 打开。|按选型批准的调度适用范围核对未来任务、终态历史及订阅不保活；真正触发的执行按其会话处理。不新增 workflow/调度硬功能。|[story 25](spec.md#user-stories)|S1、S2|
|P21|取消或终态失败在对应本地原生活动最终结算后结束 Round，不被后台保活阻挡。|两端真实适用路径覆盖停止前后、重试中错误、最终失败及后续新活动；核对不提前结束、不串用旧结局、不为关轮额外停子或清队列。UI/RPC 保证分开记录。|[story 26](spec.md#user-stories)|S1、S2、S3|
|P22|已结束轮不重新打开，晚到仅追加不开轮，实际新执行才开新轮。|取消/失败后分别制造追加和真正启动，核对公共序列、父子归属及消费保存，避免将追加事件误作执行。|[story 27](spec.md#user-stories)|S1、S2、S3|
|P23|重载或恢复不会把缺失轮边界伪造成正常结束或离线连续活动。|真实恢复与缺失结束场景；核对截断/未知结果、恢复 Session 累计及无可靠快照时 Round 不被猜零或补造。不承诺恢复历史轮明细。|[story 28](spec.md#user-stories)|S1、S2、S3|
|P24|子代理耗时按已观察活动估算，包含模型/工具/委派等待而排除真实 Idle。|受控时间轴给出独立区间算例，对照 Working/Round 与真实宿主场景；不采第三方最终 duration，不要求准备阶段精确时间，不把精度要求施加到执行器。|[story 29](spec.md#user-stories)|S1、S2、S3|
|P25|同周期多次子活动的耗时累计可保存并在新进程恢复。|续跑、正常活动结束以及仅耗时增长而费用不变；读回提交和新进程展示，不能只显示最后一次或因费用未增长漏存。|[story 30](spec.md#user-stories)|S2、S3|
|P26|耗时观测缺口保留可靠小计及本周期不完整性，不补离线时段。|取消/失败有已知活动、缺结束、崩溃恢复、后续成功和周期重置；区分未知与可靠零，验证缺口不因后续成功消失、不跨周期回填。|[story 31](spec.md#user-stories)|S1、S2、S3|
|P27|旧耗时记录保留原值并继续累计，不因缺少新缺口字段变成损坏或一律不完整。|独立旧文档写入后由新版读/更新/恢复；覆盖缺值、合法零、有 runtimeMs 和已知新缺口。不要求旧读取器理解新字段或旧新混跑。|[story 32](spec.md#user-stories)|S2、S3|
|P28|Session span 保留主会话本周期首次输入至最近 Turn 结束的墙钟跨度。|独立时间轴覆盖空闲、工具尾部、同会话恢复、fork 与重置；与两个子代理累计耗时设置明显不同数值，核对不互相替代。|[story 33](spec.md#user-stories)|S1、S2、S3|
|P29|DeepSeek 余额继续遵循当次认证、初始化、TTL、请求触发刷新与失败保留规则。|可控 endpoint 覆盖成功、过期、并发查询、换认证、失败和无可用认证；实际宿主验证接线，余额缺失不伪造零。真实账户侧确认另见 P53。|[story 34](spec.md#user-stories)|S2|
|P30|Codex 两个额度窗口按报告长度识别并各自保留更新状态。|独立报告覆盖位置互换、单窗口、缺读数、重置时刻状态与失败；实际宿主验证接线，不把缺失变零或重定时旧读数。真实账户侧确认另见 P53。|[story 35](spec.md#user-stories)|S2|
|P31|Codex 比例只用同一报告的成对读数测量并独立保存恢复。|独立数字验证阈值、饱和、不配对更新、baseline 与 refinement 保存规则；消费重置后估计不清空，不能把合并后的新旧窗口凑成样本。|[story 36](spec.md#user-stories)|S2、S3|
|P32|并发提交不覆盖他人记录、不丢在途新增量，并保留逐记录裁定。|真实独立进程共用文件及确定性在途交错；核对有效项发布、旧版本/冲突分别拒绝、失败未伪称落盘、不自动重试拒绝项与新进程恢复。不能仅以内存锁证明互斥。|[story 37](spec.md#user-stories)|S2、S3|
|P33|读取刷新只采纳已保存数据且保护本地未提交累计，不强制写出在途消费。|另进程提交、detail 读刷新、同周期本地增量和外部周期切换组合；比较操作前后文件与显示，第三方完成提示不能让未提交记录提前出现。|[story 38](spec.md#user-stories)|S2、S3|
|P34|无有效消费基线时暂停记账/保存并诊断，不覆盖原文件或停用独立 provider 功能。|不可读、损坏、非法 schema 的初始化/运行期场景；核对文件保持、暂停标识、无反复修复、provider 仍可用及下次正常初始化才能重建基线。|[story 39](spec.md#user-stories)|S2、S3|
|P35|周期重置将整份已保存活动文档先归档后发布新周期，不夹带旧周期在途数据。|两 harness/provider/session 混合文档、有效零、归档/发布失败及并发；核对完整归档、新 period、start/end 边界、可选同次余额、不改旧归档/Codex 估计且不从归档读回。|[story 40](spec.md#user-stories)、[Implementation Decisions §12](spec.md#implementation-decisions)|S2、S3|
|P36|clear 与首次 holiday 保留各自新周期标记，已 holiday 不重复重置。|普通 clear 为 false、首次 holiday 为 true、再次 holiday 幂等；核对归档数量、周期身份及消费，不做先 clear 再改 holiday 的两步发布。|[story 40](spec.md#user-stories)|S2、S3|
|P37|非 DeepSeek、忙碌、活动未知或自身保存未收口时，重置动作立即拒绝而不排队。|从命令入口覆盖每项拒绝条件及满足条件的成功对照；之后结算不能自动执行先前拒绝动作，入口偏好不受重置影响。|[story 41](spec.md#user-stories)、[Implementation Decisions §12](spec.md#implementation-decisions)|S1、S2、S3|
|P38|共同存储根的周期总用量、适用费用及 Accrued 包含各 harness 已保存贡献。|两个 harness 提供独立字面量记录，配合当前本地未提交数据对齐；核对总量与分段构成不被当前 harness 过滤，不重复加已观察/已保存记录。|[story 42](spec.md#user-stories)|S2、S3|
|P39|不同 harness 的相同 session id 不合并身份、父链、版本或写权限。|同 id 不同父/版本/消费的共同文档，分别提交与恢复；不影响另一分区，不因共享文件互斥而放松身份规则。|[story 43](spec.md#user-stories)|S2、S3|
|P40|当前会话树与 Session 累计只包含真实所属会话及其后代。|当前树、另一根及另一 harness 的独立记录混放；核对直接父缩进、自身/含后代值及名称回退，不挂入无关会话。|[story 44](spec.md#user-stories)|S1、S2、S3|
|P41|storageDir 保持既有显式路径解释，切换 harness 不自动搬移或复制数据。|绝对、相对、该字段特殊 ~/、不同 cwd/配置位置及新进程改目录；核对解析位置与未配置位置无写入，相同目录为共同数据集、不同目录相互独立。|[story 45](spec.md#user-stories)|S2、S3|
|P42|framework 运行目录缺失、空或非法时明确失败，不回退到隐藏目录或业务存储根。|实际独立进程配置错误、相对值及一致目录定位；观察诊断和实际运行产物，不静默当重连可修复。Windows 管道命名空间与磁盘目录分开，POSIX 执行证据独立记录。|[story 46](spec.md#user-stories)|S1、S2|
|P43|pi 与 OMP 绘制相同业务内容，不因宿主绘制形态丢字段或改变统计。|同一独立业务样例核对 brief/detail、代理树、费用结构、预算条、Accrued、未知/不完整提示，分别运行 component/lines 和适用宽度；不要求像素一致。人类可读性见 P52。|[story 47](spec.md#user-stories)|S2|
|P44|context 表达所属实际会话的公开当前读数，并使用既有固定显示预算。|与独立公开 context 读数及其模型对照；null 未知、模式无预算无字段、当前窗口故意不同于显示预算，核对未从累计推导且不落消费文档。|[story 48](spec.md#user-stories)|S2、S3|
|P45|峰谷边界单次等待只重绘当前展示，不产生网络请求或记账写入。|可控时钟与真实 UI 生命周期覆盖边界包含端点、阻塞后重算、holiday、无 UI、主子和处置；独立观察请求/文件不变，一个 UI 仅一等待，子侧不另建。|[story 49](spec.md#user-stories)|S2、S3|
|P46|pi 不跟随 inspector 改显示目标，OMP 保留原可靠 Viewed 路径。|分别运行适用查看/切换场景，核对目标自身 context/统计与 Owner 不被改写；不按来源或名称推断 Viewed。未覆盖的真实会话切换不得泛化认证。|[story 50](spec.md#user-stories)|S1、S2|
|P47|入口偏好跨普通会话/模型变化保留，重启/重载恢复 brief，子入口不继承。|detail 后普通切换、子会话自身展示和实际新进程/适用重载；核对无存储或 State 偏好字段，子会话固定 brief。无子代理模式例外按 P4。|[story 51](spec.md#user-stories)|S2、S3|
|P48|同进程共享准备与业务，独立子进程不会重复启动根专属预取或 UI。|实际主子和并发准备序列观察初始化前后请求、UI、统计与文件；配置/有效基线/价格准备后才处理相关记账，第一请求等待既有初始化规则。工厂构造阶段无外部效果。|[story 52](spec.md#user-stories)、[Implementation Decisions §4](spec.md#implementation-decisions)|S1、S2、S3|
|P49|所属接入处置后订阅、登记、通信、恢复任务和等待不再产生效果。|实际退出/适用重载、迟到结果、断线恢复与旧定位信息；核对旧句柄无效果、无旧 Owner 误接、无残留任务，Idle/单次活动结束不误清理仍存活实例。|[story 53](spec.md#user-stories)|S1、S2|
|P50|共同路径变更保持 OMP 及受影响扩展的既有消费者行为。|覆盖对应消费者分区与两端真实宿主路径，尤其 State、观察/权限、marker、初始化/清理及取消/失败终止；不以 pi 通过替代 OMP 回归，不测试旧内部接线副本。|[story 55](spec.md#user-stories)|S1、S2、S3|
|P51|统一路径不新增已禁止的重复工作，并满足无明显效率退化和无显著复杂度增加的条件。|Agent 用固定代表性序列采集前后读取/锁/发布/请求/事件成本、同进程无 IPC/逐事件读盘、健康空闲无新增固定轮询及子侧无重复根效果；准备可归属的对照和复杂度变化说明。**人类验收：最终判断明显额外开销与复杂度是否可接受**，不预设百分比，不以绿色测试替代判断。|[story 56](spec.md#user-stories)|S1、S2、S3|
|P52|实际终端中相同业务内容在正常与窄宽度下具有可接受的可读性。|Agent 先完成内容/布局自动检查，准备隔离可运行入口、固定场景、宽度输出及可获得的截图/录屏；无法获取图像如实记录。**人类验收：真实 TUI 的格式、间距、窄宽度与观感**。RPC 不替代此项。|[story 57](spec.md#user-stories)|S2|
|P53|真实账户观察能够核对实际 provider 接入结果，而不以本地模拟冒充账户事实。|Agent 完成自动协议/错误检查及经授权的真实宿主/provider 路径，准备脱敏读数、时间、场景和对照材料。**人类验收：真实账户侧结果核对**；不把余额变化当请求费用真值，不要求 provider 实际收费等于模型参考价。缺凭据/许可是明确阻塞，付费调用另行授权。|[stories 34, 35, 54](spec.md#user-stories)、[Testing Decisions](spec.md#testing-decisions)|S2|
|P54|兼容与验收结论仅覆盖记录的源、版本、工件、环境和已执行路径。|每次真实验证附版本/工件及 OMP 补丁条件、命令/结果/未覆盖项；固定 pi/nicobailon，不混用源码行号或研究实测作为新集成通过。不自动推广未来版本、POSIX、跨用户或全 provider 支持，不新增启动报告门控。|[stories 54, 58](spec.md#user-stories)|S1、S2、S3|
|P55|两端通过同一声明和配置校验获得相同业务规则，错误配置不会静默换规则。|两端加载同一要求，检查有效/非法配置与命令效果；必要差异仅为已批准的宿主接入与绘制。公共组织与干净切换通过实现审查配合行为回归，不以复制文本测试证明。|[story 2](spec.md#user-stories)、[Implementation Decisions §2](spec.md#implementation-decisions)|S1、S2|
|P56|运行中接入只作用于校验过的目标与寿命，且不把通信秘密暴露给模型或日志。|过期定位、错误 Owner、旧端点与处置后连接场景观察无跨 Owner 效果；用合成秘密检查可取得的模型请求/诊断输出，真实凭据不打印。运行消息不依赖业务文档。安全含义限已批准的本机接入范围，不推定未验证的跨用户访问控制。|[Implementation Decisions §6](spec.md#implementation-decisions)|S1、S2|
|P57|验收能够区分“没有副作用”与“没有可见数值变化”。|**inferred — required to fulfill existing promises**：针对 P4、P17、P33、P45、P48、P49、P51，用可控事件与外部效果计数/文件前后对照补足负向证据；不能仅看 widget 不变。观察只用于验证，不新增常驻遥测功能。|[stories 5, 22, 38, 49, 52, 53, 56](spec.md#user-stories)；本会话覆盖检视已确认|S1、S2、S3|

## Seam decisions

|Seam|Exposes|Hides|Alternatives considered|Reversibility|
|---|---|---|---|---|
|S1 — 扩展消费 framework 的公共 interface|公共装配/实现工厂、订阅组的实际会话事实、Turn/Round 交付、State 有效读取与写权、初始化/清理；沿用既有公共消费方式，补齐已批准的子入口声明与只读接入结果。|宿主 registry、第三方协议、本机通信与恢复、公共事实合成的内部组织；不把原生 context 交给业务。|仅用最终 widget 验证被否决：无法区分身份来源、权限或生命周期顺序错误。为每个内部协议建立外部 seam 被否决：增加 interface 数量且暴露内部实现。|内部实现可替换；公共消费语义变化影响两端和消费者，必须先修订契约，不能用 shim 掩盖。|
|S2 — 实际加载后的 model-cost 操作 interface|真实加载、输入/命令、operator feedback、widget component/lines、provider 出站操作及实际退出/重载后的效果；不同观察用于分别证明数据结果与事实/失败机制。|业务内部拆分、原生绘制与定时载体、第三方接线细节；不把测试支撑实现当作产品 interface。|只直接构造业务实例被否决：不能证明发现、必需子扩展加载和真实宿主接线。仅 RPC 被否决为 TUI 替代：不能判断真实终端可读性。|既有操作 interface 优先，内部组织自由；操作/展示含义变化须先修订契约，纯原生绘制变化不必改变 seam。|
|S3 — 存储根的持久化文档 interface|按既定配置定位的活动文档、独立估计、归档及新进程读回的可观察内容；独立进程之间真实共享的结果。|文件锁、原子发布、批处理和业务合并的内部构造。|只看内存或绘制被否决：无法证明实际保存、恢复与并发不覆盖。仅内存互斥替代被否决：不能证明跨进程正确。|格式与路径的后续变化影响保存数据和两个 harness，改动成本高；本次保留旧值及可选字段演进，不承诺未更新旧读取器兼容。|

### 已批准补充与依赖分类

- 三个 seam 都复用现有 interface 形态，不引入单独的提供方 facade 或任意 RPC。子入口/接入结果及后台活动内部注入来自 spec 的既定决定；内部 seam 不进入本契约表，不为每个内部模块单设外部 interface。
- **In-process**：请求计费、累计、周期和展示计算；以独立数据直接验证，无需人为新增 adapter。
- **Local-substitutable**：文件、受控时间和可控本地 endpoint 在需要时提供可控条件；真实文件协调仍运行独立进程。真实本机跨进程通信属于本仓库拥有的机制，不能只由内存替身认证。
- **True external**：pi、OMP、nicobailon 和 provider。可控 mock adapter 用于确定性失败与协议样例；固定真实宿主/第三方和经授权 provider 验证仍是必需证据。已有 adapter 承接事实，不因测试增设公共原生 interface。
- 本功能未引入 **Remote but owned** 的网络服务依赖；本机通信不因此扩大为远端服务或通用 RPC。

### 决策记录与演进代价

确认来源为当前 `/to-contract` 连续对话：用户以“采用”选择三个 seam，以“准确”确认覆盖检视四项发现，随后以“Rapid iteration”选择刚呈现的模式及三项人类验收。四项发现为独立事实/算例、观察期去重而非崩溃不丢账、不同失败语义分开、负向效果观察。

验收模式选择 Rapid iteration 而非 Full automation：保留真实终端观感、真实账户侧核对、效率/复杂度最终判断给人类，Agent 仍承担完整实现和所有分配的自动与真实宿主检查。此选择不删除承诺、不降低兼容要求，也不把整个 provider 或终端功能实现交给人类。

已知演进代价沿用上游而非新增取舍：若未来要求未更新旧读取器读取新增字段或旧新版本共享写入，S3 的读取/写入兼容策略需要重新决定，不能由本契约推导支持；若第三方升级改变子加载、身份、父链或保活含义，S1/S2 相应真实路径需要重验，路线不成立时回到原选型权威，不以调整解析掩盖语义缺口。本次未作新的难逆架构取舍，不新建重复 ADR。

### 六类覆盖检视记录

|Surface|承载位置与结论|
|---|---|
|entry|S1 公共扩展消费与 S2 真实入口/命令/TUI/RPC。均适用；没有新增独立 HTTP 产品入口。|
|data and state|S1 State/权限，S3 schema/配置路径/周期/恢复，S2 展示投影。均适用；不承诺原生会话互通。|
|external dependencies|S1/S2 固定宿主与第三方，S2 provider，S3 真实文件系统；受控时间/随机归档名以独立条件和结果验证，不固定内部算法。均适用。|
|errors and failure|P3、P9、P15–P16、P19、P21–P23、P32–P37、P42、P49 分开表达接入失败、未知、State 默认值、终止、保存拒绝及清理；不新增通用重试策略。适用。|
|output and observability|S1 交付及反馈、S2 展示/诊断/脱敏请求证据、S3 保存读回；P51–P54 保留性能、人工与证据等级。适用；不新增遥测产品。|
|resources and concurrency|附着 S1/S2/S3：Owner/句柄寿命、同目标获取合并、有限等待/恢复、进程互斥、批量提交、根效果去重及健康空闲无新轮询；P51 包含效率判断。适用；无独立资源管理 seam，未授权新增付费额度。|

六类均适用，没有整类被排除。没有从检查中引入未批准的新产品行为；P57 是兑现既有负向保证所需的推论，已标记其分类。内部实现选择留给构建，不作为承诺外加机制。

## Not yet specified

- 无阻塞本契约批准的 seam 或行为决定。所有承诺都有观察 seam；接口签名、内部算法及构建顺序不是这里的未决产品范围。
- 真实 provider 执行所需凭据、付费许可及具体账户验收时段在执行时确认；这是既有执行前提，不能自动继承研究调用限额。缺失时报告真实阻塞，不静默把真实检查改成 mock。
- 具体运行记录和人类验收结论尚未产生；P51、P52、P53 的检查仍须后续执行与确认，不是批准契约时已经通过。
- 未来依赖升级或实际集成揭示既有路线不成立时，带证据返回 spec 的原主题权威并先修订契约；不将未知未来功能提前切成新承诺。

## Out of scope

严格继承 [spec 的 Out of Scope](spec.md#out-of-scope)，本契约不增删范围。尤其不把本次文档批准解释为正式安装/切换、额外付费、外部补丁或用户数据清理授权。Spec 的叙述及上游 Lighthouse 保持原权威；实施票只能切分交付，不另行改写承诺。

## Coverage report

- 每个承诺至少映射一个 seam：P1–P57，例外 **none**。
- 每个 seam 至少承载一个承诺：S1、S2、S3，例外 **none**。
- 六类 surface 均已走查；整类不适用项 **none**，具体未引入形态及理由见检视记录。
- 尚未指定项区分为执行前提、待产生的验收证据及条件式未来重评；批准阻塞决定 **none**。
- Acceptance mode：**Rapid iteration**。人类主导的最终检查仅为 **P51（效率/复杂度判断）、P52（终端可读性）、P53（真实账户侧核对）**；各自准备证据与 Agent 职责只在对应 Coverage 保存。
- 契约批准不代表实施或验收完成。后续运行、人工确认与交付关联用于推导完成情况，不添加人工状态列。

下一步：`/to-tickets .scratch/model-cost-pi-migration/contract.md`。若实现证据推翻 seam 或承诺，先修订本契约，再重新打开受影响实施票，不能让代码与契约静默漂移。
