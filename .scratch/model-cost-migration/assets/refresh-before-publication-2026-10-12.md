# 刷新生命周期发布前历史

> 本次整票发布前的工作票、部分 Lighthouse 与地图快照；仅供溯源，现行结果以 [刷新生命周期权威](../lighthouse/09-refresh-lifecycle.md) 为准。

## .scratch/model-cost-migration/decision/09-refresh-lifecycle.md

```markdown
# 额度与余额在何时刷新，异步效果怎样跟随会话生命周期？

Type: grilling
Status: claimed
Assignee: hugos（本会话 agent 协助刷新生命周期讨论）
Blocked by: 01, 03, 04, 05, 12
Prerequisites: [完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md)；[framework 如何提供请求、响应、Turn／Round 与模型事实观测？](03-observation-contract.md)；[账户凭据、provider 地址和代理如何跨 seam 提供？](04-provider-access.md)；[framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](05-http-capability.md)；[model-cost 的哪些数据进入 framework State，如何声明与读取？](12-state-data-contract.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Trace handoff from data Lighthouse

- [数据归属与账户周期决议](../lighthouse/12-state-data-contract.md)将最新余额／双窗口、获取时间、加载／请求错误保留为账户级内存缓存，holiday／quota estimate 继续持久化；来源成对与跨账户隔离保留，调度 TTL／single-flight 仍由本票决定。
- 旧在途消费在目标账户 clear 后主动丢弃，不等于所有迟到远端测量也一律丢弃；远端余额／额度读数不是消费累计。区分账户周期 reset、会话／模型切换、原账户测量与当前展示，决定哪些响应／timer 仍可更新什么，不让旧实例覆盖新实例。
- 不从 render 发请求、创建 timer 或更新权威业务态，不借新通用 State 替代扩展业务缓存。

## Handoff from storage Q13 / Q14

[存储局部决议](../lighthouse/06-local-storage.md)Q14 的暂停限于消费统计／保存，独立余额／额度功能不因此自动停用；不据此取消原刷新责任或反向恢复消费后台探测。下一次正常会话初始化的消费恢复依赖观察／装配，刷新规则仍按本票收口。

## Question

将请求 headers 即时更新、assistant 完成的 30s TTL 主动刷新、旧原生 agent_end 强制刷新、session／原生 agent_start 开始 stale 拉取、模型切换预取与峰谷边界 timer 映射为精确业务调度。明确单源 TTL 与两源预取当前差异、single-flight、API/header 先后覆盖及失败是否保留旧值。

调度业务规则应归 model-cost；通用生命周期／取消能力由 framework 提供。会话或模型／账户切换时，旧响应与 timer 是否还能写新状态，效果如何解绑？未返回的请求是否阻塞 agent loop／退出？render 不驱动副作用。契约确定后为仍不清楚的竞态开新票，不凭经验加重试。

## Handoff from behavior-contract

[完整保留哪些业务行为，统计单位如何命名？](01-behavior-contract.md) 确认事件驱动更新；更新后按当前 UI 需要请求刷新。本票决定触发事件、请求合并／防抖／节流与 TTL 的不同语义、时间参数通过现有 YAML 配置读取、是否跨模型同时刷新两个数据源、无 UI 的远端刷新策略。不得把现有 30s、独立 TTL 或只刷新当前模型写成既定新契约。Q9 的窗口／估计行为全部保留；主动读数与 header 时序、同源成对测量的接入必须覆盖。

## Handoff from accounting-ownership

来源：[消费归属决议](../lighthouse/02-accounting-ownership.md)。用户已确认业务约束；以下接口、机制与展示问题仍待本票决策，本交接不代表它们已解决。

- 已确认约束：请求与子任务的消费归属固定；旧子代理的新消费按原启动关系进入本周期聚合、不污染当前轮；不恢复已放弃的历史 Round，也不补已跳过请求或目标账户 clear 前在途响应。账户额度及缓存不因换会话清空，换账户选择各自范围；同源成对读数不可拼接跨时间、跨来源窗口。
- 待决定：旧会话请求、header、API fetch、timer 在模型／账户／tree 切换后，哪些仍可更新原账户的测量／本周期聚合，哪些不得覆盖当前展示视图？测量缓存不是 framework 业务 State，也不要求持久化历史请求记录。怎样提供身份／代际关联而不把迟到数据一律丢弃？多个独立主会话共享账户时，single-flight、读数先后、错误及 estimate 更新按什么范围协调？
- Codex 额度不能分摊或换算为 Session 消费；render 不能决定消费事实是否入账。旧回调污染新会话这一 fog 已精确交给本票，不另建重复并发票。

```

## .scratch/model-cost-migration/lighthouse/09-refresh-lifecycle.md

```markdown
# 额度与余额在何时刷新，异步效果怎样跟随会话生命周期？：Lighthouse

> Question and discussion: [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)
>
> 部分发布：只确认初始化两源预取及首次模型请求前的收口条件；来源为[账户访问会话的 filename 定向确认](../assets/provider-access-confirmation-2026-10-12.md)。本票仍 open、未认领，Question、依赖、Handoff 与其他问题不变。

## Question

明确余额／额度的初始化、响应后更新、TTL、来源覆盖、single-flight、切换／timer／退出调度；此处只发布初始化确认，不替余下调度作答。

## Discussion

### 初始化两源预取与首次模型请求

用户要求「在发出第一条信息前，agent初始化的时候，已经要获取余额和额度信息」，并对明确归属 `09-refresh-lifecycle.md` 的提案回答「同意，非常准确」。会话初始化时，对已配置的单个 DeepSeek 账号与单个 Codex 账号并行查询余额和额度，不依赖当前模型／首次消息触发；未配置的 provider 不发查询。

首次模型请求执行前，等待初始化查询成功、失败或超时收口；可以在等待期间输入文字，不要求禁止输入。远端不可用不能保证取得数值，但必须有确定失败／超时结果；查询失败不阻断模型执行、不显示为零余额或零额度。访问资料的独立失败规则由[账户访问权威](04-provider-access.md)提供，不在此重新决定。

这不是首次模型请求之后再懒加载，也不是仅初始化当前模型的数据源。旧 onInit await 按当前模型初始化是源码事实参照，不证明新的两源预取／首请求屏障已实现。具体 hook／入口绑定、请求合并和 timeout／取消由本票与 HTTP／装配继续收口，不自行冻结旧 5s／10s 或 30s。

### 未确认范围

其他阶段的 TTL／single-flight、API 与 header 覆盖顺序、失败旧值保留、模型／会话／账号切换、迟到响应与 timer、运行期刷新等待／退出、headless 的完整调度与提示仍未决定；不能用本次初始化等待推导「所有生命周期都等待全部网络效果」。

## Decision

初始化并行预取已配置的 DeepSeek 余额与 Codex 额度，并在首次模型请求前等待查询成功／失败／超时；查询失败不阻断模型执行，输入可先进行。其余刷新生命周期与具体接线仍待本票。

## User stories

1. As a 用户, I want 初始化已尝试取得两源余额／额度, so that 第一条模型请求前就有读数或明确失败而不依赖先发消息。
2. As a 用户, I want 查询有失败／超时收口且允许先输入, so that 网络问题不会无限阻止 agent 启动或把失败伪装成零。
3. As a 开发者, I want 初始化预取独立于当前模型, so that 切换模型不成为首次取得另一 provider 读数的前提。

## Preconditions

- [账户访问](04-provider-access.md)需在初始化取得宿主当前已生效的单账号访问资料；不依赖模型请求选择账号。
- [HTTP 部分决议](05-http-capability.md)提供代理原则，其完整 timeout／取消 interface 尚未决定。
- 公共初始化事件与首次模型请求执行的等待接线由[装配决策](../decision/10-assembly-layout.md)落实，固定基线真实路径由[验收决策](../decision/11-acceptance-cutover.md)验证。

## Postconditions

- 后续不能恢复「只查询当前模型」或「首次模型请求后才预取」的初始化方案。
- 查询成功／失败／超时收口与消费保存、宿主 idle、framework Round 的完成分别处理；本确认不撤销观察权威的不设全局保存屏障。
- 原票仍未完成，其他调度问题保留；没有新增生产初始化屏障或真实远端运行证明。

## Invariants

- model-cost 调度与业务读数由 shared logic 管理，render 不请求远端、不建 timer 或更新权威态。
- 余额／额度仍是账户级内存读数，同源成对；初始化不建立第二套持久读数权威。
- 缺失／失败不等于零；局部失败不取消另一 provider 的查询，不改变宿主模型认证策略。
- 不将初始化网络等待泛化为所有观察 handler 等待全部效果，也不把输入 UI 的可用性与模型请求执行混同。
```

## .scratch/model-cost-migration/map.md

```markdown
# model-cost 完整迁移：通用能力分层与 OMP 适配

Labels: wayfinder:map

## Destination

逐项确认 model-cost 的完整需求、extension／framework 通用能力／harness adapter 的归属、能力契约、源码组织及验收标准，形成可直接实施的完整迁移规格。地图清晰后进入单独跟踪的实施，最终完成 OMP 上的迁移与验收；地图本身不承载生产实施。

## Notes

- 2026-10-09 用户确认：先决策，再完整实施；OMP 落地，业务逻辑与通用契约保持 harness-independent，不在本次实现 pi adapter。
- 用户确认以现有功能全量保留为讨论基线；逐项讨论后才允许有意删改。以实际代码、业务 ADR 和 glossary 为证，不把 README 当完整清单。
- 用户允许全新统计：不要求导入旧统计文件、延续旧统计基线或新旧文档读写兼容。保留旧数据、不自动删除或改写；新存储根目录、账户隔离、归档格式和正式切换另行决策。
- 用户确认按三层开票：model-cost 拥有业务规则；HTTP／文件及并发协调纳入 framework 通用能力；宿主事实与语义映射由 framework adapter 提供。具体接口并未确认；widget、命令和认证／代理的 seam 单独讨论。
- 现有 ADR-0002 的责任测试与 native import 边界继续约束本次设计。backlog 对 HTTP 曾持扩展自有方向，本次明确讨论升级为 framework 能力；最终决策须同步其唯一权威文档，不能并存两套政策。
- 2026-10-09 用户选择以旧实现“聚合为主”为基础，先检验具体极端场景，只有发现不能满足的必要场景才取舍是否升级。/tree 优先保证 Session 累计正常，历史 Turn 累计可能不可取得可以接受；最小 framework 能力由选定实现需要倒推，而非先造完整账本／框架接口。该局部取舍不自动取消其他功能，正式修订范围由当前数据决策记录。
- 2026-10-09 用户要求重新评估“按 Turn 记录”的成本收益：逐响应计价／累加、运行期关联与长期明细留存不是同一要求，不把完整逐 Turn 账本或准确性最大化作为默认迁移目标。数据讨论先用旧代码和实际场景验证最小必要记录粒度；此前决定可据此提出修订，但未确认的修订不改变当前有效契约；已确认修订按用户要求同步旧 Lighthouse 与决策票正文，修订前版本保留历史快照，不自动缩减其他功能。
- 2026-10-09 用户要求纠正讨论顺序：先用旧源码、具体数据结构和一条端到端数据流建立实现心智模型，再讨论逻辑／接口取舍；未说明数据在哪里、谁读写、何时持久化前，不泛问同步／异步。当前先做数据归属／寿命／查询，再做存储与协调，随后收口观察处理约束和刷新调度。装配草图可以提前作为讨论材料，最终装配规格仍在契约明确后收口。保持地图规划模式，可用隔离探针支持决定，不做生产迁移。
- 后续设计讨论遵循[Happy flow 优先的设计推进原则](lighthouse/03-observation-contract.md#happy-flow-优先的设计推进原则)：先建立原则，再在原则内推进具体设计，避免用假想极端组合反复推翻主线；确认来源与重审条件在该权威主题。
- 每次咨询 grilling、domain-modeling；设计接口咨询 codebase-design；决策落地依次使用 lighthouse、backtracer。HITL 决策须由用户确认。每次工作只解决一个非 research 决策票，chart 会话不关闭票。
- [现状调查与功能证据](assets/current-state.md) 是事实资产，不是已批准的契约。它也记录调查 smoke 的实际输出；远端余额／额度、动态 TUI、完整 OMP 原生链路均未在本次调查运行。
- 框架当前仅实现 OMP adapter，支持基线为 18.5.0；本机安装版本不等于支持基线。迁移验收版本是否改变必须显式决定。
- 子票存放于 decision/；按编号扫描 open、无未满足依赖、未认领的票选 frontier。开始工作前先写 Status: claimed 和 Assignee。开放票不在地图正文重复列出。
- [数据归属与账户周期决议](lighthouse/12-state-data-contract.md)已正式结案；最终取舍与历次暂停溯源只在 Lighthouse。后续按已定数据流推进存储与协调，再返回观察处理约束；不重问聚合／明细账、不恢复观察票旧 Q10，不把本票结案视为存储或原生观测已实现。继续工作时按 tracker 查询 frontier，或使用用户明确指定的票。

- 本轮[存储 schema](lighthouse/06-local-storage.md#q25consumptionjson-的物理-schema归档与版本)已最终确认并结案；Round 持久化与恢复取舍在[数据原主题](lighthouse/12-state-data-contract.md#最近-roundtree-与恢复展示)修订，首次 holiday 自动切周期在[命令原主题](lighthouse/07-command-state.md#holiday-与-clear当前入口适用条件)修订。[确认来源](assets/storage-schema-confirmation-2026-10-12.md)与[发布前历史](assets/storage-schema-before-publication-2026-10-12.md)可恢复；未实施生产迁移，其他存储协调原则保留。

- 本轮[展示确认与证据](assets/presentation-confirmation-2026-10-12.md)获 Q33 收口；[展示权威](lighthouse/08-presentation.md)与[装配](lighthouse/10-assembly-layout.md)／[模型计价](lighthouse/13-model-catalog-policy.md)部分结果分别持有政策。[发布前历史](assets/presentation-before-publication-2026-10-12.md)保留旧恢复点；跨票发布不认领或改变目标票体，不将无 UI 记账推成远端刷新获批，支持基线未变。

## Decisions so far

- [完整保留哪些业务行为，统计单位如何命名？](lighthouse/01-behavior-contract.md)： 保留请求锚价、公共 Turn／工具／Round 与 Codex 额度；当前基线消费 provider 单一统计范围、整文件 clear 与预算修改移除，不扩大所有 provider 展示。

- [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](lighthouse/02-accounting-ownership.md)： framework 每 provider 单账号；取消账号／凭据统计身份与自动替换隔离，按 provider 单一范围聚合；多 CLI 正常并发、去重与直接父 Session 汇总保留。

- [model-cost 的哪些数据进入 framework State，如何声明与读取？](lighthouse/12-state-data-contract.md)： Session 自身与父子关系持久化；Round 仅推断，正常连续对话可看上一 Round，resume/tree 只要求 Session 恢复；业务不升级 framework State。

- [framework 如何提供独立存储、原子更新与跨进程协调？](lighthouse/06-local-storage.md)： 已结案；harness 优先／Session 扁平 list／provider-model 自身桶、周期与快照版本、起止元数据；单活动 JSON／独立归档与 estimate，安全异步更新与失败政策保留。

- [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](lighthouse/03-observation-contract.md)：已按正常数据流、最小必要事实与异常基本原则收束；公共逻辑优先 framework、adapter 必要桥接，尽量统一 round_end；宿主可先 idle／接受新输入，公共 handler 等待自身异步保存，具体装配与生产验收仍未实施。

- [账户凭据、provider 地址和代理如何跨 seam 提供？](lighthouse/04-provider-access.md)： 按 framework 每 provider 单账号支持前提，adapter 提供当前认证确需资料／地址，不生成持久统计身份；业务查询留 shared logic，秘密不落盘。

- [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](lighthouse/05-http-capability.md)：已结案；直接导入单一 request、原生 response、共享代理配置与逐请求选择、业务优先的可配置有限超时；显式选代理缺配置失败，model-cost／connect-bot 统一传输，业务留 shared logic，不预建主动取消。

- [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](lighthouse/09-refresh-lifecycle.md)：部分确认初始化两源并行预取、首次模型请求前收口；其余调度未决。

- [/budget 的参数、操作与状态如何在新框架表达？](lighthouse/07-command-state.md)： 已结案；actions 路由／等待／反馈，detail 入口偏好；holiday／clear 限当前 DeepSeek idle／保存收口，首次 holiday 自动完整归档并切新周期，已开启幂等；不把规划当生产实现。

- [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](lighthouse/08-presentation.md)：已确认旧视觉／共享后端与宿主前端、混范围 Total、静态 detail 树、子代理 brief 与轻量 Round；无 UI 记账和错误可见，远端刷新仍未决。

- [确定的新能力与 model-cost 如何组织、声明和装配？](lighthouse/10-assembly-layout.md)：部分确认扩展宿主专属实现、framework 当前查看会话与有效标记；完整接口、原生出口和装配仍未决。

- [官方计价与 token-only 模型名单如何确定、配置和维护？](lighthouse/13-model-catalog-policy.md)：部分确认 DeepSeek 维护比例表、Codex 权重经 framework 宿主 catalog 派生；具体名单、格式、更新与缺失策略仍未决。

- [观察契约的 Handoff](decision/03-observation-contract.md#handoff)记录本轮收束、证据限度及下游职责；不恢复异常情景树或父 Round 分配，不把规划结案／临时探针当生产实现。

## Not yet specified

- 原生宿主缺失尚未具体暴露的观测能力时，其降级／拒绝与诊断如何衔接，遇到具体路径再展开；账户访问的局部查询失败原则已由账户访问权威持有，提示承载由现有展示票决定，不在此重复开雾。
- 尚未暴露的非 HTTP 新增通用能力对 connect-bot 等既有消费者的影响，待具体能力出现后再判断。已经具体化的当前查看会话／有效标记公共能力与消费者隔离由[装配局部结果](lighthouse/10-assembly-layout.md)及其原 Question 承接，不在此重复作为 fog；其他未知复用影响保留。

## Out of scope

- framework 每 provider 多账号选择／轮换／管理、统计账号识别／持久化分区、账号替换自动隔离或重置、跨进程账号登记检测；支持范围与取舍见[消费归属的账户主题](lighthouse/02-accounting-ownership.md#账户隔离多会话与额度)；只有当前认证资料随宿主实际生效，不承诺替换统计隔离。

- 多台机器通过网络共享盘／云同步共同写入统计的正确性保证、分布式锁或同步冲突合并；[本地协调范围决议](lighthouse/06-local-storage.md)限定本机本地文件系统，不取消同机多进程安全共享。

- 实现或认证 pi adapter；只考虑契约是否把 OMP 原生细节泄漏给共享代码，不宣称 pi 能力对等。
- 导入旧统计、继续旧基线或要求新旧统计文档双向兼容；用户允许从空统计开始，旧数据保留。
- 图内执行生产迁移；决策规格完成后进入独立 implementation 工作流，整体迁移目标不取消。
- Codex 会话消耗与账户额度之间的转换或分摊；[消费归属决议](lighthouse/02-accounting-ownership.md)确认不做此换算，账户级双窗口／ratio／left 与参考费用继续保留。
```
