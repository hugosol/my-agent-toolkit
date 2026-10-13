# model-cost 完整迁移规格：通用能力分层与 OMP 适配

Labels: ready-for-agent

Contract: [已批准的承诺、seams 与验收覆盖](contract.md) — Rapid iteration；人工检查范围见合同各承诺的 Coverage。

## Problem Statement

用户需要在 OMP 中继续可靠地查看模型用量、请求费用、余额与 Codex 额度，并了解主会话及子代理的消费。旧 model-cost 将计价、累计、原生事件、认证、HTTP、文件锁与 TUI 接线混在宿主实现中，难以迁入当前语义扩展框架，也难以让未来其他 Harness 复用业务规则。

直接搬运旧代码会延续旧 Turn 标签与公共 Turn／Round 的混淆、子代理消费归属不清、展示与副作用耦合，以及传输和存储的双轨实现。反过来，为准确性默认建立完整账本、多账号管理或大量异常恢复机制，又会超出用户需要的轻量统计范围。

本规格将已收口的 Wayfinder 决议合成为实施需求：保留批准的完整业务范围，落实明确批准的删改，以正常流程顺畅为原则接受已确认的边界损失，不能把规划结案、局部探针或绿色测试当作生产迁移完成。

## Solution

将 model-cost 迁移为基于当前语义扩展框架的扩展：共享业务逻辑负责请求锚价、实际 Session 自身聚合、余额／额度业务、命令和展示计算；framework 提供公共宿主事实、语义生命周期、配置、反馈、HTTP 与安全文件更新；OMP adapter 映射宿主事实，OMP 专属前端负责绘制。

用户继续获得熟悉的上下文条、实际 Effort、峰谷价格、余额告警、累计分段条、Codex 双窗口与 ratio／left，同时获得正确的主／子／孙 Session 聚合、正常连续对话的轻量 Round 展示，以及静态代理树 detail。无 UI／RPC 使用同一业务后端，错误可见但不进入模型上下文。

消费只保存当前周期 Session 自身聚合与直接父关系，支持同机多个 CLI 安全共享。用户通过 `/budget detail`、`/budget holiday`、`/budget clear` 管理展示和周期；新统计从空开始，不自动迁移旧数据。完整交付包括受影响现有消费者的统一接入、隔离验证、人工视觉与真实服务验收，以及用户手动切换／回退清单。

## User Stories

1. As an OMP 用户, I want 迁移后保留已批准的 model-cost 功能, so that 不因架构重构丢失日常消费与额度信息。
2. As an OMP 用户, I want 每个可观察模型请求按开始时模型与价格计费, so that 模型切换或跨峰谷响应不会改写该请求费用。
3. As an OMP 用户, I want 有可靠 usage 的失败或取消请求也计入消费, so that 已发生的消耗不被误认为免费。
4. As an OMP 用户, I want 工具返回不单独计费且后续模型请求独立计费, so that 不重复计算工具活动。
5. As an OMP 用户, I want 重复结束通知只统计一次, so that 用量与费用不会因重复事件膨胀。
6. As an OMP 用户, I want 相同内容的新模型调用仍单独统计, so that 去重不会吞掉真实新消费。
7. As an OMP 用户, I want 缺 usage 或价格时明确提示并保留可取得指标, so that 未知信息不会伪装成零或完整账单。
8. As an DeepSeek 用户, I want 官方支持模型按人民币计价, so that 能查看适用的请求费用与消费累计。
9. As an DeepSeek 用户, I want 北京时间工作日峰谷与手动 holiday 生效, so that 价格与请求开始时的实际时段一致。
10. As an DeepSeek 用户, I want 余额、低余额告警与消费分段条保留, so that 可以继续观察可用资金与消费节奏。
11. As an Codex 用户, I want 美元参考费用与人民币消费分开, so that 不把参考估算当成订阅实付或人民币金额。
12. As an Codex 用户, I want 同时查看 5h／7d 额度、时间比例、节奏条与重置时间, so that 可以安排后续使用。
13. As an Codex 用户, I want 窗口根据报告时长识别而非固定 primary／secondary, so that 套餐或返回位置变化不误标额度。
14. As an Codex 用户, I want 单个有效窗口也能独立更新, so that 不因另一个窗口缺失丢掉可靠读数。
15. As an Codex 用户, I want ratio／left 只由同报告成对读数估计, so that 不把不同时间与来源拼成假测量。
16. As an Codex 用户, I want 估计尚未形成时显示 estimating…, so that 不会把没有估计误解为没有可用额度。
17. As an OpenCode Go 用户, I want 获批 DeepSeek 模型显示 token-only 用量, so that 能看 usage 而不冒充官方计费或 Go 订阅额度。
18. As an OMP 用户, I want 未收录模型保持 hidden 且不阻止调用, so that 展示覆盖不会改变宿主模型权限。
19. As an OMP 用户, I want 当前显示模式不抹掉其他渠道已取得的真实消费, so that 混合模型任务的总数仍完整保留已知贡献。
20. As an OMP 用户, I want 固定上下文预算只用于显示和告警, so that 扩展不会限制请求、输出或压缩行为。
21. As an OMP 用户, I want Effort 显示实际生效值且未知为 ?, so that 不把配置意图冒充实际模型状态。
22. As an OMP 用户, I want 各实际 Session 分别累计自身请求, so that 主／子／孙代理不会混为一个 Owner 统计。
23. As an OMP 用户, I want 主会话含后代累计只汇总每笔请求一次, so that 父总数与子自身不会重复叠加。
24. As an OMP 用户, I want Round 只包含本实际会话自身消费, so that 不需要维护父 Round 的子消费分配账本。
25. As an OMP 用户, I want 正常连续对话可以看到最近一 Round（进行中或刚结束）, so that 了解最近一轮活动的消费。
26. As an OMP 用户, I want resume 恢复本周期已保存 Session 累计, so that 重启后不从零重复计算历史。
27. As an OMP 用户, I want tree 导航不回滚真实 Session 消费, so that 对话分支选择不会撤销已经发生的费用。
28. As an OMP 用户, I want 不可恢复的历史 Round 隐藏而不是猜零, so that 展示如实反映轻量持久化边界。
29. As an OMP 用户, I want fork 新实际会话自身从零且保留原会话统计, so that 复制消息不会成为新消费或回滚旧消费。
30. As an OMP 用户, I want 正常切模型／会话／查看不销毁业务实例与 provider 缓存, so that 视图切换不重复初始化或污染记账归属。
31. As an OMP 用户, I want Total 的当前模型结构与主树总消费分开, so that 同时分析当前模型行为和完整任务花费。
32. As an OMP 用户, I want Cost 与 Ref 分单位显示, so that 人民币费用与美元参考不会被换算混加。
33. As an OMP 用户, I want detail 显示静态代理树和根模型明细, so that 可以定位各代理自身消费而不增加查询交互。
34. As an OMP 用户, I want Session 最新名称持续更新但不改变身份, so that 代理树可读且改名不会生成另一份消费。
35. As an OMP 用户, I want 费用结构参考占比按对应模型价格派生, so that 可比较各 token 项的等额消耗而不误称历史账单分项。
36. As an Hub 用户, I want 查看子代理时切换其 Effort、上下文与当前模型自身字段, so that 不继续看到主会话事实。
37. As an Hub 用户, I want 子代理 brief 保留主树总数与 provider 全局测量, so that 不误认为子代理独享余额或额度。
38. As an Hub 用户, I want 子代理有效 State 驱动唯一 Marker area, so that 查看不会复制主会话全部标记或取得写权限。
39. As an OMP 用户, I want `/budget` 空参数帮助与非法参数错误一致, so that 不会因缩写或额外参数误执行操作。
40. As an OMP 用户, I want `/budget detail` 直接切换入口偏好, so that 普通切会话保留选择而重启恢复 brief。
41. As an DeepSeek 用户, I want 首次 holiday 自动归档并开始假日周期, so that holiday 边界与统计周期一致。
42. As an DeepSeek 用户, I want 已开启 holiday 的重复命令幂等, so that 不重复清统计或切换为关闭。
43. As an DeepSeek 用户, I want clear 归档完整已保存消费并关闭 holiday, so that 开始新的统计段且保留旧记录。
44. As an OMP 用户, I want clear 不删除旧归档、Codex estimate 或 detail, so that 不相关业务资料不会被消费重置清掉。
45. As an OMP 用户, I want 工作中或保存未收口时拒绝周期命令, so that 不建立迟到执行的 pending 操作。
46. As an OMP 用户, I want 命令只有实际提交成功才报告成功, so that 归档已生成但重置失败不会被误报。
47. As an DeepSeek 用户, I want 周期边界锁外尝试一次余额查询, so that 起止余额可读且网络失败不阻止统计重置。
48. As an OMP 用户, I want CLI 启动并行预取已配置两源并在首请求前有限收口, so that 首次使用有读数或明确失败。
49. As an DeepSeek 用户, I want usage 按成功 TTL 合并在途余额查询, so that 不通过轮询或多代理重复发起网络请求。
50. As an Codex 用户, I want 运行期只接纳响应 headers 更新额度, so that 不新增 TTL API 兜底或重复查询。
51. As an OMP 用户, I want 运行期查询不阻塞模型、工具或退出, so that 辅助统计不会拖住工作流程。
52. As an OMP 用户, I want 峰谷到点自动重绘当前视图, so that 不靠 render 副作用或每秒轮询更新时段。
53. As an RPC 用户, I want 无 UI 仍执行观察、记账、保存与远端测量, so that 后端行为不依赖 widget 存在。
54. As an RPC 用户, I want 业务错误通过 stderr 可见且不进入模型上下文, so that 可以诊断问题而不污染请求内容。
55. As an 多终端用户, I want 同机同目录多个 CLI 正常并发不覆盖已保存更新, so that 各项目共享消费统计。
56. As an 多终端用户, I want 旧周期与旧版本提交被拒绝, so that clear 后旧实例不能复活旧消费。
57. As an OMP 用户, I want 普通保存失败报告后从有效磁盘基线继续, so that 少量统计损失不会停止模型执行。
58. As an OMP 用户, I want 损坏数据不被猜成空数据覆盖, so that 已有统计与恢复线索得到保护。
59. As an OMP 用户, I want 失效锁有恢复路径且一次失败不堵死后续写入, so that 正常流程不会长期无法保存新数据。
60. As an OMP 用户, I want 一个可配置共享存储根和固定文件组织, so that 不必维护每个文件的路径配置。
61. As an OMP 用户, I want 认证只用于当次操作且不写日志或统计, so that 密钥与账号资料不会泄漏。
62. As an 扩展作者, I want framework 提供可复用 HTTP、文件与 actions 能力, so that 不在各扩展重复实现基础设施。
63. As an 扩展作者, I want Owner 效果和逐实际 Session 观察分开, so that 子代理可记账而不驱动主会话面板效果。
64. As an 维护者, I want connect-bot 与 codebase-tools 完整迁移受影响公共接线, so that 不维护旧新双轨或改变原业务契约。
65. As an 维护者, I want 模型名单与价格集中显式维护, so that 更新数据不改分类算法或引入运行期发现依赖。
66. As an 维护者, I want 独立兼容性验证而非启动门禁, so that 支持声明由精确版本证据决定而不污染正常运行。
67. As an 维护者, I want 自动测试与 OMP 脚本在隔离环境运行, so that 不触碰正在调度实现工作的正式 OMP。
68. As an OMP 用户, I want 真实服务与视觉效果由人工最终验收, so that mock 或 RPC 不冒充实际可用证明。
69. As an OMP 用户, I want 手动备份、互斥加载、切换和回退清单, so that 可以从空统计安全迁移并保留故障排查资料。
70. As an 维护者, I want 实施发现具体缺口时带证据请求裁决, so that 不静默删功能或扩建假想异常机制。

## Implementation Decisions

以下是已确认决定的合成，不在本阶段新增 seam。细节、理由与修订历史由 Further Notes 链接的原 Lighthouse／ADR 持有；若实施发现冲突，不用代码现状覆盖批准需求。

### 架构、公共装配与生命周期

- 采用公共语义 core／behaviors、adapter-independent 基础 Modules、Harness adapter、扩展 shared logic、宿主专属实现、薄宿主装配与薄加载入口的分层。只创建实际需要的 Module，不生成无用途目录或浅转发链。
- framework 不依赖具体扩展，HTTP／文件 Modules 不依赖 adapter，shared logic 不导入宿主原生类型。原生 import 保持既定 adapter／扩展宿主专属边界，不扩大允许范围，不透传 ctx、modelRegistry、authStorage 或完整原生对象。
- 沿 `defineExtension` 纯声明＋注入实现模式。actions、订阅组、开发／验证描述和配置基准等公共 authoring 信息从 OMP 专属类型中独立，使用既有公共入口；内部 HarnessPort、StateStore、派发器不成为扩展组装接口。不增 DI 容器、扫描、自动发现或注册系统。
- framework 完成必要配置读取／校验后调用实现工厂。工厂接已校验配置与所需小型公共事实 Interface，创建业务实例、连接选定宿主前端并返回命令实现、订阅与初始化／清理入口；创建阶段不发远端请求、不启动 timer。绑定失败收口已创建资源。
- 公共绑定拥有完整生命周期：认证可读节点一次初始化、首次模型请求等待初始化收口、停止交付／解绑订阅／旧访问失效／单次清理。普通模型／Session／tree／查看变化不销毁 CLI runtime、provider 缓存、detail 或单一 UI timer。
- 按订阅组声明 Owner 或逐实际 Session 范围，使用同一公共派发机制。Owner 订阅只接主会话效果；逐 Session 订阅保留真实主／子／孙身份和直接父关系。观察扩大不授予 Owner 写入或外部效果权限，State follow／none 不变。
- framework 先处理公共身份／生命周期，再有序调用 handler，承接同步异常与 Promise rejection。一般保存不构成整 Session 事件或下一输入屏障；初始化和命令是明确等待位置，不将一般事件变为裸 fire-and-forget。
- 清理使业务实例失效、停止接纳旧结果、解除前端订阅、释放 widget 与 timer；旧实例回调不得进入新实例。退出不等余额／额度网络、不增加主动 HTTP 取消、自动保存、补账或退出排空；已开始的文件更新仍等待真实结果，不能假报取消。
- 业务 runtime 隐藏计价、保存、provider 缓存、估计、命令与生命周期组合。消费存储隐藏 schema、合并、周期／版本和分阶段结果；provider 业务不操作 widget 或消费累计；presentation 只读同一权威源。此为已批准模块职责，不在本规格冻结新函数签名。

### 公共事实、Turn 与 Round

- Request 是一次可观察 provider 调用；Turn 是其请求／响应周期，工具执行在 Turn 外。可观察的新调用／重发使用新身份，隐藏 SDK 传输重试不单独观测，不增传输拦截。旧 widget Turn 改名 Round，不改公共 Turn 含义。
- framework 拥有公共身份、在途关联、通用去重／冲突处理、Round 开闭与结束候选复查；adapter 提供原生订阅、字段／信号映射和必要可靠桥接；计价、峰谷、聚合、Codex parser 与保存政策不进入公共语义 core。
- `turn_start` 固定不透明 turnId、实际 Session／所属 Round、开始时间、provider／model 与可靠可取的 catalog 价格、币种和单位。业务同时固定原统计周期、holiday 与价格锚点，不能用结束时最新模型替换。
- `turn_end` 一次交付同一身份、结束时间／结果、可靠 input／output／cache usage 与可取得 HTTP status／headers／metadata；provider request／response ID 仅参考，不假定相等，不作为公共 Turn 身份。不等工具结果，不照搬含工具执行的原生 turn_end。
- 关联、正常去重与逐响应内存更新在观察处理返回前完成，不等待锁或远端刷新。释放完整在途详情后保留已处理 Session＋Turn 身份至观察实例销毁；round_end 不清标记，不按任意 TTL 淘汰，不落盘。缺 usage 已跳过的请求也视为已处理，不提供事后补账。
- 缺失事实显式不可取得。不能可靠匹配时报告并丢弃，不按当前会话／模型或到达顺序猜归属，不补造开始；无法判断有效源的最终 usage 冲突按不可用处理，正常流式更新不算冲突。没有持久冲突账本、结束后修正或历史重算。
- Round 按每个实际 Session 的连续活动定义，工具、已知自动续跑、排队输入消费、专门交互及会驱动该会话继续的子代理等待保持同轮；子结束不能关闭父轮。Round 不等于语义任务完成或所有后台任务归零。
- OMP 无开放 Round 的活动开始开轮；已知 willContinue 延续；新开始可截断缺少结束证据的旧轮，恢复／重载也可截断。信号缺失的极端组合允许拆轮或不及时结束，不冒充正常完成、不补发完成证据。
- 非续跑原生结束先提交候选并返回，让宿主进入 idle；framework 在下一任务轻量复查同一实际 Session 是否静止且无已知续跑，满足才派发公共 round_end，否则等新事实复查。不轮询、不用超时猜结束；正常结束、明确取消和终止失败尽量使用同一结束位置。
- 活动事实与保存完成独立；未知活动不默认 idle，宿主 idle／RPC 完成不等于已保存。connect-bot 的 working、未见结束的 idle、真实结束后的 awaiting-input 和完成证据继续保持，不因统计清理或截断误报。
- 实际 Session 身份、直接父关系和最新名称由 adapter 映射，framework 覆盖主／子／孙持续交付，不仅当前查看。名称不作身份；不可取得不猜名称或覆盖已知名称，可用可区分的 Session ID 展示。按身份更新内存和展示，随下次正常消费保存写入，不独立增加保存触发。

### 模型覆盖、锚价与指标语义

- 按 provider＋精确 Model ID 匹配，不按 base URL、owned_by、前缀或模糊别名分类。官方 `deepseek` 支持 `deepseek-v4-pro`（pro）和 `deepseek-flash`（flash）；旧官方其他 ID 不继续默认支持。
- `opencode-go` 的 token-only 白名单为 `deepseek-v4-pro`、`deepseek-flash`、`deepseek-v4-flash`、`deepseek-v4.1-flash`、`deepseek-v4-flash-vision-exp`。其他 Go 模型、未收录 DeepSeek 与其他第三方默认 hidden。`openai-codex` 按 provider 进入额度模式，不受 DeepSeek 白名单限制。
- 单一扩展数据 Module 集中维护模型映射、名单、pro／flash 谷价与共同峰价系数，不由用户 YAML 配置、不建比例副本。当前谷价单位 CNY／百万 token：pro input=4.5、cacheRead=0.15、output=13.5；flash input=1、cacheRead=0.02、output=4；peakMultiplier=2，峰价派生，不另存一张表。DeepSeek 不另计 cacheWrite。
- 北京时间工作日 09:00–12:00、14:00–18:00 含端点为峰，其他时段／周末为谷，holiday 强制谷；不自动识别法定节假日。每个请求按开始时真实时间与 holiday 锚价，保存的是已算费用，不因当前价格／模型／时段／数据更新重估或补算。
- Codex 请求价格从对应 provider／model 的 framework catalog 开始快照取得，美元 `referenceCostUsd` 仅参考；DeepSeek `costCny` 是当前计费金额。Codex 对人民币金额合计贡献为零，不抹掉 token 或 Ref，不把混合会话金额归零，不混币种、不将会话消费转换或分摊为账户额度。
- 正常、失败或取消均按可靠 usage 累计；无 usage 提示并跳过，全零但不能区分真实零与宿主默认零按未知处理。有 usage 缺适用价格仍加 token，只跳过金额并提示。token-only／hidden 无金额口径，不因无价报缺价错误。没有持久缺失计数、补账、补算或持续完整性标记；已知小计不承诺完整账单，跳过不代表免费。
- token-only 保留可靠四类 token、命中率、Sum、上下文、实际 Effort、Session、正常轻量 Round 与既定 detail。没有自身 CNY／USD 费用或结构参考比例、官方峰谷／holiday 价格与余额、Go 额度接口、Codex 双窗口／ratio／left；不借当前模式删除混合树的其他 Cost／Ref。
- 固定显示预算 DeepSeek 450K、Codex 272K；五个 Go 模型沿 DeepSeek 450K。预算只显示与告警，不改变宿主上下文窗口或限制执行。数字／K／0 修改预算取消。Effort 必须是实际生效值，未知 `?`，只给值着色。
- 费用结构参考占比用相应模型 token×适用当前单价后归一化，不是 token 比例或历史实付分项。DeepSeek 使用谷价（共同比例不受峰谷影响），Codex 使用对应 catalog 的 input／cacheRead／cacheWrite／output。资料完整且总参考值大于零才可算；缺失或全零显示不可用，不借另一模型或保存 Ref 反推价格。已累计费用仍保留。
- 模型发现仅用于开发维护，记录时点、精确 ID、来源与映射后显式更新；发现接口不提供价格、不能证明逐模型调用权限。运行期不请求发现、不抓价、不热更新、不自动接受未来模型。未来价格不再同比例时须显式改变表达，不强套当前系数。

### 自身聚合、寿命与恢复

- 唯一消费源为 harness＋实际 Session×provider×model 自身聚合。自身、子代理、含后代、全局总数是派生视图，不是额外消费；task／orchestration 报告不再次入账。上下文占用、provider 测量与消费正交。
- 每个主／子／孙 Session 各自累加并保存直接父 Session。沿父链汇总 Session，每份自身贡献一次；不按 Owner、名称或层级猜关系，不从父总数反推子消费。
- 子消费只归父 Session 汇总，不归父 Round，不保存父 Round 启动标签、实例标签或消费归属段。迟到子消费增加自身及祖先 Session，不回填父 Round；子本身仍有 Turn／Round 和 round_end 保存。
- Session totals 限当前 Accounting period，跨该会话各 Round；不维护跨周期 lifetime。普通 resume 读取已保存聚合与版本，switch 选目标视图，tree 不撤销真实消费，fork 新实际 Session 自身从零。复制／读取旧消息不产生新消费；不扫描宿主历史或合并归档。
- Round 仅运行期：进行中的当前自身累计减开始快照，已结束的结束减开始快照，按可靠同 Session／同周期边界与已算金额推断。正常连续对话须显示最近一 Round（进行中优先，否则刚结束）；恢复、tree 或重载缺所需记录时隐藏，不猜零、不冒充任意文件差值为 Round，不存 recentRound 或历史索引。
- 最新余额、窗口、获取时间、加载与请求错误是 CLI provider 级内存缓存；detail 是入口内存偏好，普通切会话／tree 保留、重启／重载回 brief、入口互不影响、不按账号／Session 持久化或子继承。holiday 和 estimate 按各自业务持久化。
- framework 每 provider 单账号，共享统计根的实例须使用同 provider 账号；不实现账号列表、识别、选择、轮换或持久分区，不做凭据指纹和跨进程账号登记。允许前后替换但不检测统计隔离／重置，用户须自行开始新数据，不能把旧消费或 estimate 当新账号专属。
- 成功保存前的崩溃／强杀内存损失被接受，不增加逐 Turn 落盘、崩溃日志、退出排空或补账；正常去重和同机多独立会话并发仍必须成立。

### 存储 schema、安全发布与失败政策

- 本地 JSON：一个活动消费文档、独立 Codex estimate 文档、每次独立历史归档，固定组织且仅配置一个 storageDir。默认选用户 `.omp` 主目录中的 cost-archive；仅该字段的 `~/` 以用户 `.omp` 主目录为基准，普通相对路径以配置所在目录为基准，绝对路径直接使用，不随 cwd。初始化读取、重启生效；改根不自动搬迁／合并。实施操作路径由原存储权威规定，本节不新增源码落点。
- 活动根字段为 `schemaVersion=1`、`periodId`、ISO `start`、可选人民币 `start_bal`、`holiday`、`harnesses`。格式版本不随普通保存或重置递增；periodId 每次成功完整 reset 更新。未知／缺失／损坏格式不猜零、不兼容旧文档。
- `harnesses.<harness>.sessions` 是扁平 list；记录为 `id`、`name`、`parent`、`saveVersion`、`own`。同 harness id 唯一，完整身份为 harness＋原生 sessionId；parent 是同 harness 直接父 ID，主为 null。按 ID 替换／追加并保留其他记录，不按数组位置；不要求父先保存、不造占位父节点、不创建空 pi 桶。
- `own.<provider>.<model>` 保存 `tokens.input/cacheRead/cacheWrite/output` 和适用的 `costCny`／`referenceCostUsd`，input 与缓存按公共 usage 区分不重复。缺价保留 token 不后补金额；不存账号键、totalCost／totalTokens、宿主 last 基线、Round／Turn 列表、最近轮快照、历史价格或费用分项。
- saveVersion 作用域是 periodId＋harness＋sessionId；恢复已保存版本，新快照递增，同快照重交保持版本。旧版本拒绝、同版本同内容幂等、同版本不同业务字段明确冲突，保留磁盘不相加／最后覆盖／逐字段取最大；不按 JSON 排版或键顺序判断内容。
- round_end 捕获稳定 Session 聚合与关系，提前提交安全异步更新，继续不依赖结果且不再写同文件的独立逻辑，在本 handler 返回前等待实际结果，各退出／异常路径均承接。底层必须非阻塞 I/O，不以同步操作包 Promise 代替。
- framework 已批准单一异步安全更新入口，接绝对路径和业务更新函数；按规范化现有父目录 realpath＋文件名统一协调键。进程内同键 FIFO、不同文件独立、空闲键释放，失败不阻断后续；跨进程锁文件原子排他取得互斥，不承诺跨进程全局 FIFO。
- 同进程排队＋跨进程取锁默认合计 15 秒，调用方可覆盖，model-cost 用默认且无专属配置。等待阶段超时／取消失败并保证不迟到写入；开始读改发布后等实际结果，不承诺整次更新硬总时限或假取消。
- 权限内重读最新文档并解析，再交业务更新函数，按记录合并／周期版本校验由 model-cost 持有；framework 不理解消费 schema。临时文档同目录原子替换，读者只见完整旧／新文；损坏时不调用更新函数、不覆盖，返回可判别超时／取消、IO、损坏或业务拒绝结果。无后台重试、持久队列、同步第二入口或 native file-lock 依赖。
- 锁年龄不证明退出，不能凭年龄抢占可能存活的持有者；可靠确认退出才回收，不能可靠确认本次有限失败。失效锁必须有恢复路径、释放自身资源、失败不堵后续，不因遗留状态长期无法写新数据；不能仅用发布前 token 检查＋rename 宣称解决竞争。不增复杂恢复或 Session 执行者检测，按正常顺畅优先及已接受极端损失落实。
- 普通保存只合并负责记录，不用旧内存覆盖整份磁盘；周期不符拒绝，不把旧消费重新绑定新周期。日常使用内存周期／holiday，不每请求读盘、不轮询；另一 CLI reset 可至下次保存才发现，允许最多一轮未保存消费丢失。
- 普通消费保存失败报告但不阻断代理；丢弃受影响未保存消费，从当前完整有效磁盘快照恢复周期、Session 与版本，不清磁盘／holiday，不清已处理标记、不重交丢弃段。无有效基线时暂停本实例消费统计／保存到下次正常会话初始化，不猜零覆盖、不自动探测或补写；独立余额／额度不自动停用。此政策不自动用于命令或 estimate。
- 同实际 Session 同时双执行者不支持；用版本冲突与失败重初始化收口，允许冲突实例未保存段丢失或交替保存失败，不增租约、心跳或每 Session 检测。
- 完整 reset 在协调权限内先归档最新有效完整已保存活动 JSON，再原子提交新活动；归档唯一随机标识且已有拒覆盖，新增 ISO `end` 和可选 `end_bal`。同一次可靠余额用于旧 end_bal 与新 start_bal，无读数两处省略，不填零、不用旧缓存；余额差不要求等于消费。
- 归档失败不 reset；归档成功但活动发布失败保留归档、报告具体阶段，不自动补做或恢复、不加事务日志。只有新活动实际提交才算成功，有效零消费也归档。新周期普通 clear 为 holiday=false，首次 holiday 为 true，harnesses 为空；旧归档、estimate、detail 不清。
- reset 不收集其他进程内存、不强制保存／终轮／补账；未保存和旧在途消费允许丢弃，旧提交不得复活；之后新请求正常累计、可靠父关系可重建。统计重置不取消实际执行，不清 framework Round／Owner 或误导 connect-bot 完成。
- 支持同机本地文件系统、同实际目录的多项目／终端／进程安全共享，可用另一块本地磁盘；不承诺网络共享盘、云同步或多机器协调。

### 认证、HTTP 与 provider 调度

- adapter 按需提供当次已生效 provider 凭据／适用 base URL 和认证确需字段，隐藏 OAuth／原生 storage。每次操作读取并固定，不永久使用首次资料；替换不改正在进行请求，不承诺外部文件变更热检测。秘密不广播、不写统计／日志／tracker。
- 凭据缺失、OAuth 更新失败或原生接入不可用只使相应查询明确失败，不借其他凭据、不填零、不影响另一 provider 或宿主模型认证。DeepSeek 使用宿主 base URL，去末尾 `/v1` 后余额路径，缺地址用官方默认；Codex 额度地址／headers／parser 由业务持有，不借推理 base URL，不增 endpoint 覆盖配置。
- framework HTTP 通过既有公共入口直接提供 `request(url, options)`，业务传 method／headers／body／timeoutMs／proxy；method 默认 GET，认证 headers 由业务准备，不增 getJSON、自动 JSON、Bearer 管理或 provider 方法。直接返回原生 response，非 2xx 正常返回供业务解释，传输／超时 reject，正文／JSON 失败由读取 reject，不包装业务 envelope。
- proxy=false 或省略明确直连；命名代理从共享配置 `http.proxies` 选择含 url 的条目，支持 HTTP／HTTPS 代理连接协议。不依赖或修改宿主／全局代理环境变量、不做隐式兜底。显式选代理而配置缺失、条目缺失、非法、不可读或解析失败均配置错误，绝不静默直连；连接失败／超时不直连重发。
- HTTP 复用已有配置读取，修改重启生效；有效正整数 timeoutMs 优先于共享 `http.defaultTimeoutMs`，再内置 30000ms；0 不关闭超时，非法不静默回退。超时涵盖等待响应与正文读取，完整正文后业务计算不在预算内。DeepSeek 5000ms、Codex 初始化 10000ms 是业务预算，connect-bot 沿自身超时。不新增主动取消 signal／controller。
- 业务固定选择 DeepSeek 余额直连、Codex 初始化命名 codex 代理、connect-bot 直连，不增 balanceProxy／usageProxy；删代理配置不成为直连指令。不接管宿主模型推理或原生 OAuth 网络。
- CLI 每运行实例一次并行预取已配置 DeepSeek 余额与 Codex 额度，未配置不查，不依赖当前模型。同 CLI 子代理共用、独立 CLI 各有缓存，不跨进程合并网络。首模型请求前等成功／失败／超时收口，允许先输入；失败不阻断模型。普通切模型／会话／tree／查看不全量预取。
- DeepSeek usage 按真实请求 provider 检查成功缓存 TTL，默认 30000ms，沿扩展现有 YAML 机制可配置；过期无在途才后台查。同实例触发复用在途，不完成后补发；成功重置读数时间，失败保留旧值／旧时间，不冷却、不重试，后续 usage 可再尝试。TTL 到期本身不查，不因活动开始／终轮／切换额外查。
- Codex API 仅启动初始化，运行期仅 response headers；无 runtime API TTL、兜底或缺窗口补查。两来源进入同一业务 Module。窗口按报告时长识别 5h／7d，沿旧 ±5% 规则，不固定 primary；有效窗口独立更新，缺失保留旧成功值与时间，没有则不可用。headers 按接收序处理，不建绝对时序系统。
- ratio／left 新采样仅同次来源报告双窗口，不拼 API／headers 或新旧窗口；保留旧门槛：5h 增至少 50 个百分点、双窗口均正增且未饱和。保留 rollover／过期／时间异常重建 baseline、baseline 即刻持久、ratio 最多每分钟保存、协调合并新 baseline 优先及已知 ratio 不降为 null。独立 estimate 不被消费 clear 清除，不把估计换成账户与 Session 消费分摊。
- 普通 clear／首次 holiday 在入口允许后、文件锁前尝试一次 DeepSeek 5000ms 边界查询，已开启 holiday 不查。成功同值供归档与新周期；失败／超时省略两字段仍继续操作，不用旧缓存、不自动重试、不持锁等网络。动作成功由文件提交决定，非查询成功。
- 运行期网络不阻塞下一模型请求、工具或 idle。切查看不取消 provider 缓存，通知前端重读当前目标、不捕获旧 ctx；销毁后不接纳旧结果、不反馈／重绘／写新实例，结束不等待网络。无 UI 同样初始化、TTL 查询、headers 与 estimate，只不创建前端或做绘制格式化。
- 每 CLI UI 实例只有一个下一峰谷边界的一次性 timeout，通知当前视图后按实际时间安排未来边界。切模型／Session／tree 不反复取消重建，子代理不各自 arm；不发网络、不写文件或改费用，无 UI 不创建，销毁清理。含端点后重绘，休眠或阻塞后按当前时间纠正，不承诺精确准点或补播。

### 命令、展示与反馈

- `/budget` 仅 detail／holiday／clear，一层 actions 声明与实现分离；framework 负责注册、去空白／忽略大小写／完整匹配、帮助、路由和完成承接，业务负责条件与效果。空参数帮助，非法参数 error＋同帮助且不执行；不缩写、不额外参数、不借 directed.unrecognized，不恢复数字／K／0、别名、flags 或多层解析。
- action 可同步返回或 Promise，宿主链必须等待结果。统一捕获未处理同步异常／拒绝并报告一次 error，不自动重试／回滚／通知成功；业务可清理并转换操作背景后交公共通道，不能先打印再抛双报。Extension feedback 复用既有机制补齐 info／warning／error，无 UI stderr，不进入模型上下文。
- detail 只切入口内存偏好并反馈，不检查 provider／Round／保存状态，hidden／无 UI 不强制创建 widget。没有 brief 或 on/off 动作，不给 focused 子代理新增命令路由。
- holiday／clear 仅当前 provider DeepSeek，限制不是清理目标选择。当前入口 Round 中或保存未收口 warning 拒绝，不排队／延期；未知活动 error 拒绝，可靠 idle 初始或历史会话允许，不要求先终轮、不等其他 CLI／子代理全空闲。已开启 holiday info 幂等无 off；首次整文件切新周期 true，普通 clear false，提交后才成功。
- 保留旧布局、字体、颜色、上下文条、Effort 着色、峰谷／holiday、余额 <10／<5 元告警、Accrued／Session 分段条（≤20 元 fine、>20 元 coarse），Codex 20 格节奏、quota／time%、倒计时、绝对重置时间、未知／过期／无效 reset 与宽度降级；5h 分钟、7d 小时精度。统一 CacheR／CacheW、Total／Round 及适用字段格式。
- Total 始终一条记录：Cache／Input／Output／命中率／结构参考占比取当前查看 Session 自身当前 provider／model；Sum、Cost、Ref 取原主会话及全部后代全部模型。纯 Codex 用 Ref 不强加无意义 Cost: ¥0，两种费用适用时分别显示，不因 token-only／hidden 伪造免费。
- 主 detail 保留顶部 Total，在 Round 位置用静态代理树：根名称、根自身 provider／model 分行、子／孙各一条自身累计按直接父缩进；不展开子模型、不加含后代合计节点、不加交互或逐代理查询。模型行不冒充代理节点，各行复用适用字段，不缩成只有金额＋token。
- Hub 查看子代理切其实际 Effort／context／有效 State marker／当前模型自身结构／自身 Round，但 Sum／Cost／Ref 仍原主树；余额、额度、Accrued 与全局信息不伪造子独享。子固定 brief，返回恢复主偏好。查看不改记账、Owner、继承、不重价、不新开 Round。
- shared logic 提供只读展示结果＋更新订阅；通知后重读当前目标和结果。render 无网络、timer、文件或权威数据修改。宿主前端仅原生 widget、主题、颜色、布局、树缩进与宽度；不管 TTL、计价和保存，无 UI 不创建前端或仅绘制格式化。
- 余额／额度失败有 UI 在 widget 显示不弹通知；无 UI 经公共反馈 stderr。缺 usage／适用价、普通保存失败／暂停及命令结果经公共反馈；无 UI 不隐藏错误，反馈不受某扩展 enable 或扩展数量开关限制，也不越过已退役生命周期效果权限。

### 宿主前置、现有消费者与支持声明

- OMP 必须先补最小公共只读 Viewed session 快照与变化订阅，再接 adapter、framework、marker 和扩展。概念能力为读取当前查看与订阅变化／解除；提供实际 Session 身份／名称／必要关系、provider／model、实际 Effort、context 使用／窗口，明确不可取得。覆盖目标切换、同目标事实变化和失效；不读私有 controller 或 UI 文本猜测。
- framework 按 Viewed session 有效 State 投影唯一 Marker area，查看不是新 Owner。不把固定 18.5.0、本机 latest 或内部探针当作公共出口已可用；宿主补丁是已批准实施前置，精确实际 artifact 待实施冻结，不是新的规划访谈。
- connect-bot 完整切公共工厂／生命周期、Owner 订阅、清理与 HTTP，保留注册协议、endpoint／envelope／JSON、心跳、失败预算、working／idle／awaiting-input 与效果权限。失去独立职责的旧 PushTransport 和 assembly fetch 移除，不留兼容副本。
- codebase-tools 切受影响公共接线，保留 prompt、历史保护、激活 State 与 follow／none，不强迫简单扩展模拟 model-cost 内部结构。Marker area、独立验证入口和相关测试一起迁移；不保留旧装配类型、owner-only 通用过滤、双轨传输或旧生产路径。
- 兼容性检查改为独立验证与范围明确报告，不是启动版本／shape／capability／报告门禁，requiredSemantics 若保留仅开发验证描述；必要配置与业务错误处理保留。维护者按证据明确支持，不由绿色测试自动宣布。
- 优先现有 OMP 18.5.0（@9348320）支持基础补公开查看出口，不顺带升级。若必须更换基础版本带证据显式提出；补丁后冻结精确 revision 和可运行 artifact，完整验证及人工验收后明确更新支持声明，不预造 revision，不维持旧新两条生产支持路径。
- 旧 source oracle 冻结 revision `fd3b507f99d11f8a68b63446c45aa911f0ee5c84`；仅作未覆盖需求、算法和视觉对照，批准 Lighthouse 优先，不实时跨仓 import 或随 HEAD 移动。复用纯逻辑先检查来源／许可证，不保留 native usage helper、proxy wrapper 或第二查询桥。

## Testing Decisions

- 需求依据是现行 Lighthouse 及其明确修订的 ADR／项目文档，不要求全量新旧行为对照；文档未覆盖才参考冻结旧实现。发现影响范围的遗漏／冲突明确请求裁决，不能静默删功能或自动恢复被取消行为。
- 复用现有 Bun test、framework 行为场景、connect-bot 注册／状态／生命周期／网络行为、codebase-tools 命令／历史／Owner 行为，以及 Harness dock 的隔离实际 OMP、RPC、Session JSONL、出站捕获与 stderr 模式。原生 import 责任边界继续机械验证；候选兼容性回归与扩展业务验收分开。
- 保留消费者可见协议、命令、转换、效果、状态和失败场景；迁移必要 doubles／transport 接线，删除内部转发、旧类型形状或被替代政策断言，不重钉旧预期，不保留旧生产代码迁就测试。
- 永久 test cases 中网络一律 mock，不访问真实服务。价格／模型匹配／峰谷／缺失／结构比例算法用自造名单和价格数据，不固定真实业务常量、复制当前名单或快照。真实覆盖维护与真实服务认证分开。
- 真实 OMP 接线复用已有 Harness dock 与候选验证脚本，使用冻结 patched artifact；覆盖本次实际事实链路与消费者行为，不能以局部框架套件、源码检查、零 usage fixture 或临时 Promise 模拟证明完整生产。
- 自动测试与脚本使用独立安装／进程、隔离配置和临时工作、Session、数据目录；不改正式 OMP 配置、扩展加载、会话、凭证存储或统计，不重启、发送验证命令或接入当前调度实例。
- OMP 脚本尽力自动化；多次失败或具体实现成本过高可转人工，记录场景、原因、人工步骤与预期，不建立复杂机制死磕。此例外不免除必需 test cases；待人工不算已通过，也不因转换本身算测试失败。
- 可自主少量必要真实接口冒烟获取格式或贯通，不能循环探测、自动反复重试或混入 test cases。只在本地执行进程读取获准凭证并用于鉴权，秘密不打印、不进入模型上下文／对话／日志／证据，素材脱敏；缺失、失效或需正式写回时跳过记录供人工，不执行正式登录／刷新写回。
- 真实服务最终效果与视觉 TUI 由人类在隔离环境验收，RPC、mock、发现 API 或计算通过不能替代。真实 Effort／上下文／查看 marker／brief/detail／宽度降级／峰谷变化、余额及 Codex 各窗口与估计须按原权威实际确认。
- 轻量验收记录包含宿主版本／revision／artifact、framework／extension 源码 revision、依赖／lockfile／环境、test cases、OMP 脚本、真实冒烟通过／失败／跳过、待人工方法与人工结果及切换确认；失败或关键贯通保留够用的脱敏证据，不建证据平台。
- 自动化完成与完整迁移验收分开，所有必需人工项收口才宣称完整验收。当前 Windows x64／Bun 1.4.2 支持记录不因规格生成自动扩大；新组合必须独立验证。
- 本节记录既定验证约束与先例；测试 seam、每个 seam 的承诺及覆盖分配由 `/to-contract` 在既定架构边界内选择／批准，本规格不另造测试合同。

## Out of Scope

- 本次实现或认证 pi adapter；允许未来复用业务不代表本次多 Harness 能力对等。
- 完整逐 Turn／Round 账本、历史轮次查询／恢复、recentRound 持久化、父 Round 子消费分配、跨周期 Session lifetime、历史价格账本／费用分项、补算／补账／崩溃日志、退出排空或持续完整性计数。
- 多账号选择／轮换／管理、凭据统计身份、账户分区、替换自动隔离／重置、跨进程账号登记或执行者租约；共享目录多账号混用与同实际 Session 双执行者不属于支持范围。
- 导入旧统计、延续旧基线、新旧格式双向兼容、程序自动备份／清空／搬迁／合并旧数据。用户手动切换不授权实现期间触碰正式环境。
- 网络盘／云同步的多机共同写入正确性、分布式锁或合并，数据库、事务日志、持久任务队列、自动重试和复杂恢复平台。
- `/cost` 别名、预算数字／K／0 修改、多层动作／flags、holiday off、pending 周期操作、自动归档查询 UI、交互代理树或 focused 子代理 detail 路由。
- 全 provider 金额接入、未来模型自动分类、官方旧别名和任意第三方 token-only 通配、全部 Go 模型、Zen／PAYG 金额、Go 额度、Codex 额度与 Session 消费换算／分摊。
- 运行期模型发现／抓价／热更新、用户价格覆盖、自动节假日识别、纯 token 结构比例替代或历史费用重估。
- 隐式环境变量代理、显式代理失败直连重发、SOCKS／测速／轮换／故障转移、主动 HTTP 取消、接管宿主推理／OAuth 网络。
- 私有宿主字段／UI 文本猜 Viewed session，新增通用业务 State、第二 Marker area、第二配置／注册／框架体系，启动准入或报告门禁、顺带升级支持版本。
- 实现过程中代理执行正式停机、配置变更、扩展切换、凭证写回或旧统计清理；正式切换与回退由用户验收后手动执行。

## Further Notes

### 权威来源与阅读顺序

本规格是已确认要求的实施合成，不替代决策原主题或其修订程序。所有 15 张决策票已 resolved，地图无已知 fog；历史 Handoff 中指向当时未结案下游的问题，不应恢复成新访谈。最新已确认修订优先，候选、旧恢复点与探针不是批准或认证。

- [迁移地图与范围](map.md)
- [行为保留与明确删改](lighthouse/01-behavior-contract.md)
- [消费归属、渠道与单账号支持](lighthouse/02-accounting-ownership.md)
- [正常事实链路、Turn／Round 与 happy flow 原则](lighthouse/03-observation-contract.md)
- [当前认证资料与地址](lighthouse/04-provider-access.md)
- [HTTP、代理、超时与统一消费者](lighthouse/05-http-capability.md)
- [安全文件更新、完整存储 schema 与失败政策](lighthouse/06-local-storage.md)
- [actions 与 budget 命令](lighthouse/07-command-state.md)
- [展示口径、代理树与错误承载](lighthouse/08-presentation.md)
- [CLI 初始化、刷新、边界余额与 timer](lighthouse/09-refresh-lifecycle.md)
- [模块职责、装配、公开查看前置与消费者迁移](lighthouse/10-assembly-layout.md)
- [隔离验收、版本冻结与人工切换](lighthouse/11-acceptance-cutover.md)
- [自身聚合、寿命、恢复与已接受取舍](lighthouse/12-state-data-contract.md)
- [精确模型覆盖、集中价格与缺价](lighthouse/13-model-catalog-policy.md)
- [DeepSeek 模型发现研究](lighthouse/14-deepseek-model-discovery.md)及[OpenCode Go 模型研究](lighthouse/15-opencode-go-models.md)：维护事实资产，不自动扩大白名单或认证可调用性。
- [最新 Traverse 确认与交接](assets/traverse-confirmation-2026-10-13.md)：锁安全／恢复、一次边界余额查询、持续 Session 名称更新及下次正常保存。
- [Framework 领域词汇](../../framework/GLOSSARY.md)、[model-cost 领域词汇](../../extensions/model-cost/GLOSSARY.md)、[框架架构及 model-cost 装配修订](../../docs/adr/0002-semantic-extension-framework.md)、[聚合取舍 ADR](../../docs/adr/0004-model-cost-aggregate-accounting.md)、[独立兼容性验证权威](../../framework/docs/harness-support.md)。

### 当前现状与实施前置

当前仓库已有 framework 配置／State／语义行为／OMP adapter、connect-bot 和 codebase-tools 消费者与 Harness dock。model-cost 目标区域目前只有领域词汇，现有公共 authoring 入口尚未提供本次全部新能力；本规格要求生产实施，不把规划目录、公开查看补丁、HTTP／文件 Module 或新的完整接线当成已存在。

先补可靠宿主公共查看出口并冻结可运行 artifact，再接 adapter 与公共事实／有效 State，完成 model-cost 与受影响消费者切换并执行隔离验证。细化实施顺序和测试合同属于后续流程，不因本规格新增未知 seam 或重新审问已决问题。具体正常功能冲突、不可承受实现成本或需求遗漏须带证据请求裁决，禁止静默缩范围。

### 人工切换与回退

隔离环境完整验收后，用户选择时机停止正式 OMP，手动备份旧配置与统计，准备从空开始的新数据，确保旧新扩展加载互斥，再重启并正式确认。复用旧目录前手动备份清空，程序不执行旧数据迁移或删除。

正式确认失败则停止新实例、保留新数据供排查，恢复旧配置与旧备份后重启，不合并新旧统计。实施者交付清单与轻量验收记录，不在代码实现期间执行正式切换。

合同已获批准：[承诺、seams 与验收覆盖](contract.md)。下一步运行 `/to-tickets .scratch/model-cost-migration/contract.md`，按合同拆分实施工作；实现范围与原决策权威保持不变。
