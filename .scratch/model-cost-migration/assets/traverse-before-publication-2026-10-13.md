# Traverse 审阅发布前原文

这些原文只作历史，不能覆盖本次确认后的唯一权威。确认来源见 [Traverse 确认](traverse-confirmation-2026-10-13.md)。

## .scratch/model-cost-migration/map.md

~~~~~~~~markdown
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

- 本轮[刷新生命周期](lighthouse/09-refresh-lifecycle.md)获整票确认并结案；[确认与实验限度](assets/refresh-confirmation-2026-10-12.md)、[发布前历史](assets/refresh-before-publication-2026-10-12.md)及[工作票 Handoff](decision/09-refresh-lifecycle.md#handoff)可恢复。新结果不改其他票的问题／claim，不把查询与边界探针当生产或多窗口问题已修复。

- 本轮[完整组织与装配](lighthouse/10-assembly-layout.md)获 Q19 整票确认；[确认链与证据限度](assets/assembly-confirmation-2026-10-13.md)、[发布前历史](assets/assembly-before-publication-2026-10-13.md)及[工作票 Handoff](decision/10-assembly-layout.md#handoff)可恢复。独立兼容性验证在[原 support 主题](../../framework/docs/harness-support.md#independent-compatibility-verification)修订，源码架构在 ADR-0002 明确旧到新；这是规划出版，不是迁移、宿主补丁或新版本认证。

- 本轮[验收与切换](lighthouse/11-acceptance-cutover.md)获 Q14 整票确认；[确认来源与证据限度](assets/acceptance-confirmation-2026-10-13.md)、[发布前历史](assets/acceptance-before-publication-2026-10-13.md)及[工作票 Handoff](decision/11-acceptance-cutover.md#handoff)可恢复。Backtracer 未发现新 gap／冲突；决策收口不等于生产完成，下一阶段在独立 implementation 工作流进行，不改正式 OMP 环境或自动升级支持记录。

## Decisions so far

- [完整保留哪些业务行为，统计单位如何命名？](lighthouse/01-behavior-contract.md)： 保留请求锚价、公共 Turn／工具／Round 与 Codex 额度；当前基线消费 provider 单一统计范围、整文件 clear 与预算修改移除，不扩大所有 provider 展示。

- [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](lighthouse/02-accounting-ownership.md)： framework 每 provider 单账号；取消账号／凭据统计身份与自动替换隔离，按 provider 单一范围聚合；多 CLI 正常并发、去重与直接父 Session 汇总保留。

- [model-cost 的哪些数据进入 framework State，如何声明与读取？](lighthouse/12-state-data-contract.md)： Session 自身与父子关系持久化；Round 仅推断，正常连续对话可看上一 Round，resume/tree 只要求 Session 恢复；业务不升级 framework State。

- [framework 如何提供独立存储、原子更新与跨进程协调？](lighthouse/06-local-storage.md)： 已结案；harness 优先／Session 扁平 list／provider-model 自身桶、周期与快照版本、起止元数据；单活动 JSON／独立归档与 estimate，安全异步更新与失败政策保留。

- [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](lighthouse/03-observation-contract.md)：已按正常数据流、最小必要事实与异常基本原则收束；公共逻辑优先 framework、adapter 必要桥接，尽量统一 round_end；宿主可先 idle／接受新输入，公共 handler 等待自身异步保存，具体装配与生产验收仍未实施。

- [账户凭据、provider 地址和代理如何跨 seam 提供？](lighthouse/04-provider-access.md)： 按 framework 每 provider 单账号支持前提，adapter 提供当前认证确需资料／地址，不生成持久统计身份；业务查询留 shared logic，秘密不落盘。

- [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](lighthouse/05-http-capability.md)：已结案；直接导入单一 request、原生 response、共享代理配置与逐请求选择、业务优先的可配置有限超时；显式选代理缺配置失败，model-cost／connect-bot 统一传输，业务留 shared logic，不预建主动取消。

- [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](lighthouse/09-refresh-lifecycle.md)：已结案；CLI 单次两源预取，运行期 DeepSeek usage TTL／Codex headers，窗口独立与估计成对，无 UI 同后端、结束不等网络，单一 UI 边界 timer。

- [/budget 的参数、操作与状态如何在新框架表达？](lighthouse/07-command-state.md)： 已结案；actions 路由／等待／反馈，detail 入口偏好；holiday／clear 限当前 DeepSeek idle／保存收口，首次 holiday 自动完整归档并切新周期，已开启幂等；不把规划当生产实现。

- [动态 widget 如何分层，无 UI 时哪些业务仍需更新？](lighthouse/08-presentation.md)：已确认旧视觉／共享后端与宿主前端、混范围 Total、静态 detail 树、子代理 brief 与轻量 Round；无 UI 记账和错误可见，远端调度只见刷新权威。

- [确定的新能力与 model-cost 如何组织、声明和装配？](lighthouse/10-assembly-layout.md)：已确认完整源码分层、公共工厂／初始化／清理、范围订阅与展示 Seam、独立验证及消费者切换；公开查看出口先行，实际版本／证据／切换由验收收口。

- [官方计价与 token-only 模型名单如何确定、配置和维护？](lighthouse/13-model-catalog-policy.md)：已结案；官方两 ID／Go 五 ID、集中扩展谷价＋峰价系数、价格派生参考比例与 Codex 缺价退化；发现只辅助维护，历史金额不重算。

- [DeepSeek 模型发现 API 提供哪些资料，能否支持集中维护？](lighthouse/14-deepseek-model-discovery.md)：研究与真实鉴权发现已完成；当前两 ID、无价格字段，文档样例／接受别名／实际名单分别记录。

- [OpenCode Go 当前支持哪些模型及其精确 ID？](lighthouse/15-opencode-go-models.md)：研究与匿名发现已完成；独立 provider、38 个发现 ID／五个 DeepSeek ID，不把公开发现当账户调用认证。

- [什么证据才算完整迁移，如何安全验收并切换？](lighthouse/11-acceptance-cutover.md)：本次文档优先、永久测试 mock 网络、真实 OMP 脚本尽力且隔离、少量自主冒烟与人工最终验收分开；冻结补丁组合，轻量记录，人类手动切换与回退。

- [观察契约的 Handoff](decision/03-observation-contract.md#handoff)记录本轮收束、证据限度及下游职责；不恢复异常情景树或父 Round 分配，不把规划结案／临时探针当生产实现。

## Not yet specified

当前没有已知且尚不能具体表述的规划问题。此前宿主能力与消费者影响的条件性 signpost，已由完整装配和验收的决议／实施前置覆盖，不因尚未实现继续列作 fog。若实际实施暴露新的具体能力缺口或文档冲突，按验收权威记录并请求裁决；不预先扩建假想决策票。

## Out of scope

- framework 每 provider 多账号选择／轮换／管理、统计账号识别／持久化分区、账号替换自动隔离或重置、跨进程账号登记检测；支持范围与取舍见[消费归属的账户主题](lighthouse/02-accounting-ownership.md#账户隔离多会话与额度)；只有当前认证资料随宿主实际生效，不承诺替换统计隔离。

- 多台机器通过网络共享盘／云同步共同写入统计的正确性保证、分布式锁或同步冲突合并；[本地协调范围决议](lighthouse/06-local-storage.md)限定本机本地文件系统，不取消同机多进程安全共享。

- 实现或认证 pi adapter；只考虑契约是否把 OMP 原生细节泄漏给共享代码，不宣称 pi 能力对等。
- 导入旧统计、继续旧基线或要求新旧统计文档双向兼容；用户允许从空统计开始，旧数据保留。
- 图内执行生产迁移；决策规格完成后进入独立 implementation 工作流，整体迁移目标不取消。
- Codex 会话消耗与账户额度之间的转换或分摊；[消费归属决议](lighthouse/02-accounting-ownership.md)确认不做此换算，账户级双窗口／ratio／left 与参考费用继续保留。

~~~~~~~~

## .scratch/model-cost-migration/lighthouse/03-observation-contract.md

~~~~~~~~markdown
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
| Session／父子事实 | 稳定 harness 标识（非版本）、实际原生 sessionId 与同 harness 内直接父实际 Session 的可靠关系；Owner 只用于效果作用域，不代替会话身份，不用名字层级或 parentId 字符串冒充父 sessionId | 每个回调的 sessionManager.getSessionId、ctx.agent 身份及正常启动关系；[子代理调查](../assets/omp-subagent-round-findings.md)证明身份和关系线索，稳定映射由 adapter／framework 装配落实；harness＋sessionId 命名空间见[存储 Q25](06-local-storage.md)，仅预留 pi，不认证 pi；确认原话见[本轮存储 schema 确认来源](../assets/storage-schema-confirmation-2026-10-12.md)，修订前原文见[发布前快照](../assets/storage-schema-before-publication-2026-10-12.md)。 |
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

~~~~~~~~

## .scratch/model-cost-migration/lighthouse/06-local-storage.md

~~~~~~~~markdown
# framework 如何提供独立存储、原子更新与跨进程协调？：Lighthouse

> Question and discussion: [framework 如何提供独立存储、原子更新与跨进程协调？](../decision/06-local-storage.md)
>
> 本轮无账号键 schema 已获用户最终确认；当前文档为存储规划权威，文件 module、宿主接线、生产迁移与验收尚未实现。确认原话见[本轮存储 schema 确认来源](../assets/storage-schema-confirmation-2026-10-12.md)，修订前原文见[发布前快照](../assets/storage-schema-before-publication-2026-10-12.md)。

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
- 锁文件年龄超过等待预算视为陈旧并回收，避免崩溃后永久卡死；为满足 ADR-0002“不静默替换他人已完成更新”，被误回收的存活写入者在发布前校验锁所有权（内容 token），发现自己已失去锁则放弃本次写入并按失败返回，而不是用 rename 覆盖他人结果。代价是极慢写入者的未保存更新被丢弃，属已接受的少量损失；真实跨进程／崩溃／原子读契约由验收票验证。
- 协调键用目标目录规范化路径（已存在父目录的 realpath）+ 文件名，避免同一文件的不同写法绕过锁；路径别名统一。
- 留在 model-cost：JSON schema、消费统计周期／版本校验、按会话合并、归档与 estimate 业务规则。

明确不采用：把旧 OMP native file-lock 或惰性原生 import 带进共享代码；只锁最终写入而不在协调范围内重读；后台任务队列／自动重试；同步 interface（本次只确认安全异步更新）。本能力实现时补进 `framework/docs/framework-capabilities.md`（该文档目前只覆盖 config 只读 YAML）。

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
- start 是周期开始时间。start_bal 为可选的 DeepSeek 人民币边界余额，可靠读数缺失则省略，不填0。Session name 是展示名称，不作身份。最新余额缓存继续仅内存；起止边界读数是旧文件已有历史信息，不因此持久化一般远端读数。
- archives/<archiveId>.json 使用 crypto.randomUUID()，已存在拒绝覆盖；保存锁内最新完整有效活动 JSON，另加 end 和可选 end_bal。本次同一可靠余额用作旧归档 end_bal 与新活动 start_bal，无可靠读数两者均省略；余额差不要求等于已算消费。时间用 ISO 字符串，归档保留旧 periodId／start／holiday／所有 harness Session。余额获取与可用性组织消费刷新／装配票，字段存在不证明远端请求已验收。
- 零消费也归档。普通 clear 新活动含 schemaVersion、全新 periodId、start、可选 start_bal、holiday=false、harnesses={}；首次开启 holiday 复用同一安全归档／重置流程，新活动 holiday=true，不先 clear(false) 再第二次 setHoliday。已开启幂等，不重复切周期。完整消费 reset 涉及所有 harness／provider，已有归档、独立 Codex estimate 与入口 detail 不清。动作触发和条件只在[命令原主题](07-command-state.md#holiday-与-clear当前入口适用条件)持有；Q13 先归档再实际提交、失败终止仍有效。

### Q26：同会话多执行者靠版本冲突收口

用户同意不新增执行者检测（租约／心跳／每会话锁）。`saveVersion`、Q8 旧版本不覆盖、Q12 同版本不同内容拒绝，加上失败按 Q6 丢弃并从磁盘重初始化，已经防止两个进程同时运行同一会话时静默覆盖或重复计费；代价是冲突实例的未保存段丢失、保存交替失败，属已接受的少量损失。明确：同会话同时双执行者不支持，只在保存时通过版本冲突发现。

## Decision

消费活动数据集中存于一个本地 JSON，历史归档及 Codex 估计文件独立；model-cost 以唯一自身聚合派生统计，round_end 保存 Session 自身累计与直接父关系，Round 只运行期推断。framework 提供公共 Session／Round／response 事实与可复用的安全文件更新机制，不规定扩展业务持久化模型；普通消费保存失败反馈而不打断主流程，丢弃未保存部分并从磁盘有效快照初始化，接受少量损失，不增后台重试；同文件更新采用轻量进程内 FIFO，跨进程互斥而不承诺全局顺序；按会话记录合并并校验消费统计周期／保存版本；取得权限前有限等待／可取消，开始更新后等待实际结果；协调等待默认 15 秒可由调用方覆盖，同版本不同内容拒绝并报告；resume 与失败后初始化均以磁盘有效完整快照为基线；clear 先归档再提交活动重置，失败终止；无有效基线暂停消费统计／保存至下一次正常初始化；clear 仅归档锁内最新已保存数据，不排空内存并丢弃未落盘消费。

用户级共享且目录可配置，storageDir 的 ~/ 特指用户 .omp 主目录；初始 ~/cost-archive 复用旧目录，由用户切换前手动备份清空；初始化读取、修改重启，不热切换或自动迁移。该根下固定 consumption.json、codex-usage-estimate.json 与 archives/ 独立归档文件，不另设各文件路径配置。

文件协调的本次保证限定本机本地文件系统，同机跨进程安全共享；不承诺网络盘／云同步的跨机器共同写入。

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

## Preconditions

- 复用旧目录前由用户手动备份、清空旧统计并完成新旧加载切换；原新实现加载互斥与回退步骤由验收票收口，不将此规划当已经完成的用户动作。

- [数据归属与账户周期决议](12-state-data-contract.md)提供本周期 Session 自身聚合、运行期 Round 推断、父子关系及接受的未保存损失边界。
- [观察契约](../decision/03-observation-contract.md)仍需提供可靠响应、Round、会话与父子身份事实；[账户访问](../decision/04-provider-access.md)提供当前认证资料，不提供持久化统计身份。
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

- [装配规格](../decision/10-assembly-layout.md)把 Q24 协调读-改-发布能力暴露为 framework 公共能力（实现时同步 `framework/docs/framework-capabilities.md`），不把 schema／周期／版本／合并规则放进 framework；[验收](../decision/11-acceptance-cutover.md)验证真实跨进程互斥、锁内重读、原子读、损坏不覆盖、陈旧锁回收且不静默替换存活写入者，以及 Q25 恢复／归档与 Q26 版本冲突。
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
- 锁只保证互斥与发布安全；被误回收的存活写入者必须放弃写入而不是覆盖他人已完成更新（对齐 [ADR-0002 shared-file concurrency scope](../../../docs/adr/0002-semantic-extension-framework.md)）。
- 旧统计文档不兼容（地图 Out of scope 已确认）；程序不自动迁移、清空或合并旧数据。

~~~~~~~~

## .scratch/model-cost-migration/lighthouse/09-refresh-lifecycle.md

~~~~~~~~markdown
# 额度与余额在何时刷新，异步效果怎样跟随会话生命周期？：Lighthouse

> Question and discussion: [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](../decision/09-refresh-lifecycle.md)
>
> 整票由用户 Q21「确定」确认；[本轮原话、替代分支及运行证据](../assets/refresh-confirmation-2026-10-12.md)。本文件取代此前初始化部分稿，旧内容与恢复点保留在[发布前历史](../assets/refresh-before-publication-2026-10-12.md)。规划结案，不是生产实现、真实远端认证或多窗口问题已修复。

## Question

确定 CLI 启动两源预取、实际 provider 响应驱动的更新、成功读数 TTL 与查询合并、Codex 窗口／估计采样、实例与查看切换、无 UI、退出和峰谷自动重绘的最小业务调度。具体公共 interface、原生接线和生产验收分别由装配／验收决定。

## Discussion

### CLI 启动初始化与首次模型请求

初始化节点是 CLI 启动，不是每个 Round 的 agent_start 或普通会话切换。adapter／framework 提供启动时认证资料已可读取的公共入口；优先复用当前 `session_start(reason: initial)` 语义。现有源码提供入口线索，实际订阅、异步接线与首次请求等待仍由[装配](../decision/10-assembly-layout.md)落实。

每个 CLI 运行实例建立自身 provider 级内存缓存，并一次性并行查询已配置的 DeepSeek 余额与 Codex 额度；未配置的不查询，不依赖当前模型／首次消息选择来源。同一 CLI 内子代理不分别全量初始化；独立 CLI 有自己的缓存与初始化，不新增跨进程网络请求合并。重启／建立新运行实例重新初始化。

首次模型请求前等待初始化查询成功、失败或超时收口，可以先输入文字；查询失败不阻断模型执行、不显示为零。该等待延续[先前 filename 定向确认](../assets/provider-access-confirmation-2026-10-12.md)，不恢复首请求之后懒加载，也不扩张成所有运行阶段等待网络。普通切模型、切会话、查看子代理或 /tree 不清缓存、不重新全量预取。

### 运行期只有响应驱动的网络更新

用户理由：usage 返回是 provider 刚发生消费的自然更新时机，请求已绑定 provider，故无需全量刷新或其他主动触发。消费触发不等于查询接口必成功；读数可能有服务端延迟，失败按下述简单规则处理，不为此扩建机制。

- DeepSeek：usage 返回时按请求所属 provider 检查余额缓存 TTL，过期且无在途查询才后台查询余额。
- Codex：运行期仅接纳模型响应 headers 的额度测量，额度 API 只负责 CLI 启动初始化。

不因活动开始、Round 结束、模型／会话切换额外查询，不建立定期网络轮询；render 不请求、建 timer、落盘或更新权威业务态。主／子代理根据真实请求 provider 进入同一实例的刷新入口，不按当前查看模型过滤或顺带查询另一 provider。

旧 → 新：旧会话／agent_start stale 拉取、原生 agent_end 强制查询、模型命令两源预取退役；曾讨论的 Codex runtime TTL API 兜底也由 Q11「采用」明确替代。不是每次 usage 都无条件发 HTTP，而是响应驱动检查；不添防抖、重试队列或 TTL 到期 timer。

### DeepSeek TTL、在途合并与失败

DeepSeek 默认 TTL=30000ms，独立业务配置通过既有扩展 YAML 机制读取；具体字段名字由装配收口，不建立平行配置解析。成功取得并接纳余额后重置 TTL；TTL 到期本身不查询，下一次 usage 再检查。

同一 CLI 运行实例的 DeepSeek 查询在途时，多个 usage 触发复用这次查询，不重复请求、不在完成后补发。成功则更新时间与读数；失败保留旧值和原获取时间，不重置 TTL、不设置失败冷却、不自动重试。之后的 usage 可以再次触发过期检查。接受此简单取舍，不以“模型请求成功”推断独立查询不可能失败。

本轮先前提出 DeepSeek 30s／Codex 20s 可分别配置；Q11 取消 Codex 运行期 API 后，其 20s API 限频配置也明确取消。headers 不增加网络查询，不用 TTL 节流有效读数更新。DeepSeek 5s、Codex 初始化 10s 的业务 HTTP 预算沿用[HTTP 权威](05-http-capability.md#超时预算与按需取消)，其可覆盖有限超时与无主动取消 interface 不变。

### Codex 窗口独立更新与成对估计

API 初始化与运行期 headers 都进入 model-cost 的额度 module，source／获取时间用于解释读数，不建立两份互相竞争的权威。初始化在首请求前收口后，正常运行期不再有 API／headers 覆盖竞赛，也不需要为在途 runtime API 增缓存版本保护。

5h／7d 按实际报告窗口时长识别，不以 primary／secondary 位置或套餐名硬编码。此次有有效 5h 就更新 5h，有有效 7d 就更新 7d，不等待另一个窗口。缺失窗口保留已有成功值与其原获取时间；没有则不可取得，不写零、不推断无限或 Pro 必定不适用。不同窗口可以分别展示已有读数，但不将它们伪装为同一次成对测量。

ratio／left 的新采样仍只使用同一次来源报告里的双窗口，不拼 API/header、新旧时刻或不同响应；单窗口报告不产生新估计、不触发 API 补查。已持久化估计的寿命、采纳阈值、窗口变化规则和文件协调消费[行为](01-behavior-contract.md#保留功能与已确认修剪)／[数据](12-state-data-contract.md#最小逻辑数据布局与查询路径)／[存储](06-local-storage.md)原权威，本票不更改估计算法或写入节流。

headers 按接收顺序处理，不建立跨来源绝对时序系统、不声称服务端测量时间可严格排序。运行期 headers 缺失／不合格时不清掉最近成功读数、不 API 兜底；初始化失败后可等有效 headers 建立读数。这是轻量设计的明确代价。

撤回的提案：完整双窗口才能更新展示（Q15 明确接受独立更新）；headers 不刷新 API TTL 且按 TTL 必查、headers/API 共享 TTL 的 runtime 兜底（均被 Q11 的 API-only-init 替代）。来源和理由见确认资产，不保留为并行政策。

### 业务运行实例、当前查看会话与退出

测量是 provider 级内存数据，不是 Session 消费累计或 framework State。普通切会话／模型／tree、消费 clear 不使仍有效实例的 DeepSeek 查询失效；成功可更新其 provider 缓存。消费 clear 的周期／在途丢弃与保存规则仅由数据／存储／命令权威持有，余额更新不复活已清消费，也不新增账号替换识别／隔离。

有 UI 时更新通知当前前端，由它读取[公共当前查看会话](10-assembly-layout.md#当前查看-session-的通用事实与状态投影)；不捕获取数开始时的旧 ctx 作为重绘目标。业务数据和 UI 目标的寿命分开，切换不取消 provider 缓存，当前查看不变更记账归属或 Owner 外部效果。

运行期远端查询不阻塞下一模型请求、工具执行或宿主 idle。运行实例销毁后停止接纳旧结果，不写缓存／新实例、不反馈或重绘；CLI 结束不等待余额／额度网络查询，不为此增加公共 HTTP 主动取消。已发查询仍受既定有限超时约束。该取舍不撤销消费保存或命令操作的等待／失败规则。

### 无 UI 使用同一业务逻辑与既有错误承载

用户 Q13 明确批准无 UI／RPC 运行相同业务后端：CLI 初始化两源、DeepSeek usage TTL 查询、Codex headers 与 estimate 继续；只是不创建 widget 前端、不执行仅用于绘制的布局／颜色／文本格式化。初始化收口例外保留，运行期网络仍非阻塞。

失败承载只消费[展示原权威](08-presentation.md#无-ui-记账与公共错误反馈)：有 UI 的余额／额度请求错误在 widget 显示、不弹通知；无 UI 通过 framework Extension feedback 输出 stderr，不进入模型上下文。没有 UI 不等于没有错误报告，不新增打印系统。普通消费保存暂停不自动停用独立余额／额度功能；实例销毁后的旧结果不越过退役效果权限。

### CLI UI 实例级单一峰谷边界 timer

用户要求跨界自动重绘且不愿轮询；最终采用每个 CLI UI 实例一个下一峰谷边界的一次性 timeout。UI 初始化安排，触发时通知当前前端重绘，再按实际当前时间安排下一未来边界。切模型／会话／tree 不取消重建这份 timer，子代理不分别 arm 或抢 timer；回调不保留旧会话 ctx，前端读取当前查看事实。

该 timer 只驱动时段相关展示，不查询远端、不写文件、不改变消费统计或切换计费状态。无 UI 不创建，UI／实例销毁清理；不同 CLI 各自拥有 UI timer，无跨窗口共享时钟要求。

请求计价始终按请求开始时真实时间与 holiday 锚定，timer 不改变已锚费用。既定北京时间峰谷含端点规则不变；端点后重绘，休眠／事件循环阻塞时不承诺精确准点，恢复执行按当前时间纠正并安排未来边界，不补播错过的切换。

撤回取消 timer、固定 1s 轮询建议；保留自动到点重绘，以实例归属／当前 UI 目标替代旧会话级 re-arm 和 ctx 捕获。用户报告多窗口不稳定，但旧闭包错位只是源码支持的调查方向，尚未复现实际根因或修复；由验收证明新路径，不扩建异常时钟系统。

## Decision

CLI 启动一次性并行预取已配置两源并在首请求前收口；运行期 DeepSeek usage 按可配置成功 TTL 合并查询，Codex 只接纳 headers 且窗口独立更新、估计同报告成对。无 UI 运行相同业务，网络不阻塞运行或结束；峰谷以 CLI UI 实例级单一边界 timer 自动重绘当前视图。

## User stories

1. As a 用户, I want CLI 启动时预取已配置两源并有限等待, so that 第一条模型请求前有读数或明确失败且不依赖先选模型。
2. As a 用户, I want usage 按真实 provider 驱动 DeepSeek TTL 查询、Codex 直接使用 headers, so that 避免不必要的全量刷新与重复网络请求。
3. As a 用户, I want 查询失败保留最近成功读数并独立接纳可用窗口, so that 单窗口可用时仍能看见信息且错误不会被解释成零或无限。
4. As a 用户, I want 成对额度估计只消费同一次报告, so that 新旧／不同来源窗口不会被拼成错误 ratio／left。
5. As a 用户, I want 运行期与退出不等展示网络并使用当前 UI 目标, so that agent 不被展示拖住且切会话后不会重绘旧视图。
6. As a 用户, I want 无 UI 保留同一后端及错误反馈, so that RPC 仍能记账和维护额度估计而不依赖 widget。
7. As a 用户, I want 一个 UI 实例级边界 timer 自动重绘, so that 空闲跨峰谷界线仍更新图标且无需轮询或各会话争用 timer。

## Preconditions

- [行为](01-behavior-contract.md)、[消费归属](02-accounting-ownership.md)、[数据](12-state-data-contract.md)提供 provider 单账号／单一范围、内存测量与持久 estimate、请求锚价、真实 provider 和成对估计基线，不恢复账号分区或多账号管理。
- [观察](03-observation-contract.md)提供逐实际 Session／请求 usage 与 headers、原请求 provider 和公共生命周期；用户批准不等于这些接口已实施。
- [账户访问](04-provider-access.md)提供启动及每次操作当前认证资料；[HTTP](05-http-capability.md)提供共享传输／代理／有限超时与无主动取消；model-cost 持有 provider 查询与 parser。
- [展示](08-presentation.md)、[装配局部权威](10-assembly-layout.md)提供共享后端／宿主前端、当前查看事实与反馈 seam；CLI 级实例创建销毁、启动等待、配置字段、原生公开出口及 UI 通知仍待装配。
- [存储](06-local-storage.md)提供 estimate 的独立文件及协调；[验收](../decision/11-acceptance-cutover.md)承担固定支持基线、真实查询／TUI／RPC／并发生命周期证据，不以 fixture 当账单或新实现证明。

## Postconditions

- 源票全 scope 已决定，无需继续 TTL／全量刷新／API runtime 兜底／失败冷却／轮询或配对门槛访谈；具体 interface 与落地工作不使该决策票保持未决。
- 装配消费本权威落实启动入口与首次请求等待、CLI 级缓存／查询合并、provider 响应映射、headers 解析、DeepSeek YAML TTL、失效实例隔离与当前 UI 目标、单一边界 timer；不新建复杂 widget／State／配置体系。
- 验收需覆盖初始化失败不阻断、无 UI 同后端、DeepSeek TTL／在途合并／失败旧值、Codex 初始化后无 API／单窗口／成对采样、会话切换／clear 不清测量、多 CLI UI 自动跨界及退出迟到结果。实际窗口缺失理由和多窗口根因不得凭本次源码猜测认证。
- 下游原问题／状态／claim 不因本票发布被改写；尚未决定模型名单和完整装配／验收仍由各原票持有。没有生产迁移、远端查询或支持版本升级。

## Invariants

- 遵循 [Happy flow 优先原则](03-observation-contract.md#happy-flow-优先的设计推进原则)：正常流程先收口，具体必要缺口再重审，不因假想失败扩建机制。
- model-cost shared logic 拥有调度、缓存、parser 与 estimate；framework 提供公共事实／配置／HTTP／反馈，native access 留 adapter／extension harness seam，遵守 ADR-0002，不透传 ctx 给 shared logic。
- 复用 framework 现有 YAML／公共 exports／Extension feedback／当前查看接口；不建立第二套配置、状态或 UI 系统，不扩大 connect-bot 等 Owner 外部效果。
- 缺失／失败／旧读数不等于零或无限；独立窗口不伪装为配对报告，成对 estimate 不拼时间或来源。
- render 只读；网络、timer、持久化副作用由相应业务／实例路径驱动。展示 timer 不改请求锚价或消费文件。
- 不新增运行期 Codex API 兜底、网络轮询、失败冷却、自动重试、主动取消、账号替换隔离或跨进程网络合并。
- CLI／UI／Session／Owner 寿命不混同；有效 provider 读数不因普通查看切换清空，销毁后的旧效果不进入新实例。
- 源码与隔离实验不是生产链路证明；支持基线仍 18.5.0，不认证 pi，不宣称多窗口问题已修复。

~~~~~~~~

## .scratch/model-cost-migration/lighthouse/10-assembly-layout.md

~~~~~~~~markdown
# 确定的新能力与 model-cost 如何组织、声明和装配？：Lighthouse

> Question and discussion: [确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)
>
> 用户在 Q19「确认」授权整票发布；[本轮确认链与证据限度](../assets/assembly-confirmation-2026-10-13.md)、[发布前完整历史](../assets/assembly-before-publication-2026-10-13.md)可恢复。本文件取代原局部稿，原已批准宿主专属实现／Viewed session／marker 职责保留。以下为组织与装配规划，不是生产实现、宿主补丁或新支持基线认证。

## Question

将已定业务与公共能力契约落实到源码职责、authoring Interface、依赖注入、生命周期、公共观察、原生接入与消费者切换；让新增 harness 的维护者知道代码落点，而不复制业务或另建 framework。完整探索见源票。

## Discussion

### Source layout and dependency direction

Q1／Q2 确认下面职责落点。只创建实际需要的 Module，不按图创建空目录；内部复杂时按概念拆分，不能以浅转发链冒充 Depth。

```text
framework/
  core/                       # 公共定义／协议／配置／State 等
  behaviors/                  # 公共语义、绑定与派发
  modules/
    http.ts                   # 通用传输／代理／超时
    files.ts                  # 通用文件协调读改发布
  adapters/
    omp.ts                    # OMP 公共原生映射
  public.ts                   # 小型 authoring 与基础能力公共入口
extensions/model-cost/
  definition.ts               # 纯声明
  config.yaml
  shared-logic/
    runtime.ts                # 业务实例、公共 handler／命令接线
    accounting/               # 锚价／去重／自身累计／关系／轻量 Round
    consumption-store.ts      # schema／加载／提交／归档切周期
    providers/                # 业务协议／parser／缓存／刷新
    quota-estimate/           # Codex 估计与独立持久化
    presentation/             # 只读查询／展示计算／更新订阅
    model-data.ts             # 集中模型映射／谷价／峰价系数
  harnesses/
    omp.ts                    # 薄宿主装配入口
    omp/
      widget.ts               # OMP 专属绘制
entrypoints/omp/model-cost.ts  # 只导出宿主装配入口
```

新增 pi 时对应 framework adapter、extensions/<id>/harnesses/pi/ 专属实现、harnesses/pi.ts 装配与 entrypoints/pi/<id>.ts；这说明将来接入位置，不批准本次实现／认证 pi。公共语义不在每个 adapter 重写；原生 import 只在既有 framework/adapters/** 与 extension harnesses/** seam，不扩大 allow-list，不透传原生 ctx／modelRegistry。

framework/modules/ 与 harness adapter 无依赖，其他扩展可直接使用，不经 Session／Owner delivery 转发；HTTP／文件详细契约分别消费 [HTTP](05-http-capability.md)／[存储](06-local-storage.md)原权威，不在这里复制。framework 不依赖具体 extension，shared logic 不依赖某个 adapter；根 package.json／bun.lock 统一依赖，YAML 复用已有配置 Module，HTTP／文件优先目标 Bun／Node 内建能力。若真实协议／平台验证证明必须加第三方依赖，再记录来源／用途，不预建 native helper 或第二套配置。

### Authoring Interface and implementation factory

Q3／Q5 确认把 actions、公共事件订阅、开发／验证契约描述、configBaseDir 等通用装配信息从 OMP 专属类型中独立，公共类型沿 framework/public.ts 导出；只把真正宿主专属接入留在 adapter。沿 defineExtension 的纯声明＋注入实现模式，不增注册器、扫描、autodetect 或 DI 容器，也不把 HarnessPort、StateStore、内部派发器公开给 extension。

公共绑定提供实现工厂：必要配置读取／值检查通过后调用，提供已校验配置与所需公共事实 Interface；extension 工厂创建 shared logic 业务实例并连接所选宿主专属实现，交付命令实现、事件订阅、初始化／清理入口。创建阶段不发远端、不启动 timer。绑定失败收口已创建资源并报告；业务错误与配置错误的运行承接保留。

旧 Q5 提案里的运行时能力准入被 Q10a 显式替换。独立兼容性验证规则的唯一原权威是 [harness support](../../../framework/docs/harness-support.md#independent-compatibility-verification)；requiredSemantics 若保留仅作开发／验证描述，不作运行时开关。公共装配没有新 capability 协商、版本门禁、报告门禁或完整性探测。

### Public facts and observation scopes

Q4／Q6／Q15 确认按订阅组一次声明 Owner 或逐实际 Session 范围，两种范围使用同一公共派发 Module。Owner 订阅只接主会话效果；逐实际 Session 订阅按真实主／子／孙身份观察，不用 Owner key、名字或 agent 层级代替 sessionId／直接父关系。观察扩大不授予 Owner 写入／外部效果权限；State follow／none 不变。

| 能力 | Interface 形态 | 约束 |
| --- | --- | --- |
| 当前查看 Session／模型／Effort／上下文 | 只读快照＋变化订阅 | 当前状态，通知后重读；不保留旧 ctx |
| Viewed session 的有效 State／marker | framework 只读投影＋变化通知 | 非新 State Owner；不能靠查看取得写权限 |
| 对应 provider／model catalog | 按需公共查询 | 无运行期 catalog 热更新需求，不预建订阅 |
| 当前认证访问资料 | 每次操作读取 | OAuth／native 访问隐藏在 adapter，秘密不广播／持久化 |
| Request／Turn／Round | 事件当时 delivery | 身份／顺序／请求锚点不被最新快照替代 |
| 一次性初始化／销毁 | 公共生命周期入口 | 有调用、等待／清理约束 |
| HTTP／安全文件更新 | 公共操作及结果 | 不包装为事实订阅，业务 schema 不进 framework |
| 命令 | 动作与完成结果 | 复用 [命令权威](07-command-state.md)，不冒用激活 State |

请求开始固定对应 Session／Round／provider／model／时间／可用 catalog 价格快照；结束交付同一身份、可靠 usage 与 HTTP metadata，详细字段与缺失规则消费 [观察权威](03-observation-contract.md)。实时认证／catalog／查看读取通过小公共事实 Interface，不注入任意 native 属性读取函数，不镜像完整宿主对象。读取与修改分开；不自动配 setter，model-cost 无修改模型／Effort 需求，不因 native setModel／setThinkingLevel 存在升级公共控制能力。

### Initialization, binding lifetime and asynchronous dispatch

Q8／Q9／Q16 确认 framework 管完整绑定生命周期。认证已可读的初始节点调用一次初始化入口；优先复用 initial session_start 原生位置，由 adapter 兑现真正请求前的可等待位置，framework 管初始化完成。业务内容／预算／局部失败由 extension 管，CLI 两源预取及成功／失败／超时收口消费 [刷新权威](09-refresh-lifecycle.md)。同 CLI 子代理共用初始化，不每个 Round、Session 切换或首消息重建；工厂创建不提前请求。

正常切模型／Session／tree／查看只改变所需业务视图／恢复目标，不销毁 CLI 业务实例、provider 缓存、detail 或单一 UI timer。统计恢复只加载现行 [数据](12-state-data-contract.md)／[存储](06-local-storage.md)当前周期有效 Session 聚合与关系，不扫描宿主历史、不恢复放弃的 Round 账本。运行期请求关联／已处理标记绑定观察实例，不在 round_end 清空；旧实例回调不得进入新实例。

framework 先处理公共身份／生命周期，再有序调用 handler；同步异常／Promise rejection 都有承接。未完成 round_end 保存不阻塞整 Session 后续事件或宿主下一输入。extension handler 开始捕获稳定快照、提交安全更新、处理独立逻辑，并在本 handler 返回前等结果；业务 runtime 记录未收口保存用于命令门控，不把宿主 idle 当保存完成。文件提交顺序与跨进程协调消费原存储 Module，不增派发层存储队列。首次初始化与命令是明确等待位置，不把一般异步事件改成裸 fire-and-forget。

绑定结束／失败／卸载或重载／CLI 结束由 framework 停交付、解除公共订阅、使旧公共访问失效并调用单一 extension 清理入口，避免重复清理。extension 使业务实例失效、停止接纳迟到网络结果，前端解除展示订阅／释放 widget 并清 timer。生命周期职责覆盖销毁，不代表本轮认证热 reload；现有正式 reload 支持条件仍未升级。结束不等余额／额度网络，不增加 HTTP 主动取消；不自动保存、补账或退出排空，已开始的保存不能假报取消成功，仍遵守实际结果契约。

### Business Modules and presentation Seam

Q7／Q11 确认 runtime 隐藏 handler／命令／业务 Module 组合，宿主装配不组织计价、缓存与归档步骤。accounting 拥有自身累计与轻量 Round；消费存储 Module 暴露业务加载、稳定 Session 快照提交、归档切周期，隐藏 schema／记录合并／周期版本校验／阶段结果。普通保存失败后的丢弃、有效磁盘初始化或暂停仍由 runtime 按原权威处理，不自行重试／补账；同 Session 双执行者按存储 Q26 的版本冲突取舍，不新建检测／租约系统。

providers 不知道 widget、不改消费累计；quota-estimate 独立沿已定采样与文件组织；presentation 只读同一源，承担字段选择、金额／token／比例格式与树数据，不持有第二套累计。model-data.ts 按 [模型权威](13-model-catalog-policy.md)持有精确映射、谷价与共用系数，不是用户 YAML，算法测试注入自造数据，不固定真实名单／价格快照。

前端 Seam 为只读展示结果＋更新订阅：累计、有效余额／额度、detail、峰谷边界等通知后重读当前目标与展示结果。public 查看变化也触发重读；render 无网络／timer／文件或权威数据修改。扩展宿主前端只处理原生 widget／主题／颜色／布局／树缩进／宽度；不接管 TTL、计价或保存。无 UI 不建前端／绘制订阅、不执行仅为绘制的格式化，同业务后端／错误承载沿刷新与展示原权威。后端 seam 集中测试业务，前端仍要绘制／接线验证，不以单元测试替代真实 UI。

storageDir 使用 [存储路径原权威](06-local-storage.md)：字段局部 ~/ 语义与普通相对路径解析在 model-cost 配置／装配入口，再传绝对路径给文件 Module，不把 .omp 目录策略固化成通用能力；固定根内文件／schema／版本／归档沿存储原文。

### Codex integration, network selection and oracle

Q12／Q13／Q17 确认旧 my-omp-toolkit oracle 固定 fd3b507f99d11f8a68b63446c45aa911f0ee5c84，检查时工作区干净。原源代码、视觉和业务算法是对照，不胜过新契约，不实时跨仓库 import，不自动随 HEAD 移动；更新基线须记录差异。

Codex endpoint、认证 headers 组织、业务预算、API／headers parser、窗口识别、测量与估计归 shared logic；adapter 只提供当次认证和响应事实，framework HTTP 执行。适用纯逻辑复用前核对来源／许可证，不保留 OMP usage helper、proxy wrapper、惰性 native import 或专属查询桥接，也不整包搬迁宿主实现。

业务固定逐请求选择：DeepSeek 余额 proxy:false、Codex 启动额度 proxy:"codex"、connect-bot proxy:false。共享配置可改 codex URL，但删配置不是直连指令；改为直连需改集中业务选择。显式缺配置按 HTTP 原权威失败，不自动重发／直连，不加 balanceProxy／usageProxy，不接管宿主推理或 OAuth 网络。

### Public Viewed session prerequisite

Q14／Q15 允许 OMP 补齐最小公开只读查看出口与变化订阅，先宿主、再 adapter、再公共 Interface／marker 与 extension 接线。概念 Interface 是 readViewedSession 与 subscribeViewedSessionChanged（返回解除订阅），字段名按公共协议落实，不冻结成第二套 native 镜像。

快照提供对应实际 Session 身份／名称／必要关系、provider／model、实际生效 Effort、上下文占用／窗口；不可取得明确表达，不猜主会话。通知覆盖目标切换、同目标模型／Effort／上下文变化、目标失效；不是只有焦点切换才更新。framework 按该身份的有效 State 投影唯一 Marker area，消费 [展示权威](08-presentation.md)的主／子内容范围；查看不改变记账、Owner、继承或外部效果。

现有公开 ExtensionContext／ExtensionUIContext 未提供完整出口，内部 controller 探针不等于公共能力。不上私有字段／UI 文本，不默认最新版本可用，也不把 18.5.0 当已满足；允许宿主公开出口补丁是已定实施前置，最终 patched revision／支持版本／独立验证与切换由 [验收票](../decision/11-acceptance-cutover.md)决定。规划题已决不等于原生工作已完成。

### Consumer migration and behavior tests

Q18 确认完整迁移公共接入，不留旧装配类型、owner-only 通用派发、原始 fetch／无独立职责 PushTransport 或兼容副本。

- connect-bot 切公共工厂／生命周期、Owner 订阅、清理、HTTP；注册协议、心跳、失败预算、working／idle／awaiting-input、Owner 效果权限不改。
- codebase-tools 切受影响公共接线；prompt、历史保护、激活 State、follow／none 不改。不强迫简单 extension 模拟 model-cost 内部结构。
- Marker area 接当前查看有效 State，仍唯一，不按扩展另造 marker。
- 独立验证入口／测试使用新公共 Interface；有效命令／协议／转换／效果场景保留，旧 transport／double 等必要接线迁移，内部转发、旧形状、已被替代政策断言删除，不重钉旧预期，不保留旧生产路径迁就测试。

明确对称约束：connect-bot「子代理结束不能驱动主会话效果」继续成立；「所有扩展都收不到子代理事件」不得作通用断言。Owner 与逐 Session 两组分别验证。现有真实 loader／请求捕获／JSONL 和 wire 行为测试可作回归依据，绿色 framework 局部套件不能单独认证 extension 或真实远端／视觉／存储链路。

### Publication and implementation limits

Q19 完整确认覆盖本票全部规划范围。部署源码组织／生命周期的架构修订见 [ADR-0002](../../../docs/adr/0002-semantic-extension-framework.md#model-cost-assembly-revision)；能力／版本验证原规则已在其 [support 原主题](../../../framework/docs/harness-support.md#independent-compatibility-verification)显式修订。工厂、scope、异步派发、public 查看、HTTP／文件／配置与消费者迁移均待生产实施。固定支持基线记录未修改，不宣称 pi、多窗口修复、真实余额／额度或新安全文件能力已认证。

本轮证据、原话与被拒分支仅见确认资产，之前局部结果与恢复全文只作链接历史。验收／切换的未答问题留原票，不在此替它选择最终版本、执行脚本或正式切换。

## Decision

采用公共语义／adapter／独立基础 Module、共享业务／宿主专属实现／薄装配的源码组织，framework 统一实现工厂与完整生命周期、按范围派发及小型事实 Interface；业务、展示与测试跨 harness 复用。消费者完整迁移，兼容性验证独立执行，可靠宿主公开查看出口先行；本票规划收口，生产与最终验收仍未执行。

## User stories

1. As a 新 harness 接入者, I want 明确 adapter、专属实现与薄装配落点, so that 新代码位置清楚且不重复公共语义或业务。
2. As a 扩展作者, I want 小公共装配 Interface 与工厂, so that 不学习内部校验／注册／失败清理顺序。
3. As a 扩展作者, I want framework 统一初始化与清理, so that 首请求顺序、旧实例失效与资源寿命不散落在装配入口。
4. As a 用户, I want Owner 效果隔离与逐实际 Session 观察同时成立, so that 子代理正常记账而不驱动主会话面板效果。
5. As a 用户, I want 当前查看的可靠公共快照与通知, so that Hub 子代理的 Effort／上下文／有效 marker 不沿用主会话。
6. As a 开发者, I want shared logic 的只读展示 Seam, so that 业务测试集中在后端且宿主前端只负责绘制与接线。
7. As a 用户, I want 异步保存有承接而不阻塞后续事实, so that 下一轮继续执行且命令不把 idle 当已保存。
8. As a 维护者, I want 独立验证报告与稳定源码 oracle, so that 支持声明有可恢复的版本／环境／覆盖证据而不污染启动流程。
9. As a 维护者, I want 现有消费者完整迁移并复用行为测试, so that 不维护双轨架构且重构不悄改既有业务。

## Preconditions

- [行为](01-behavior-contract.md)、[归属](02-accounting-ownership.md)、[数据](12-state-data-contract.md)、[存储](06-local-storage.md)提供保留需求、自身聚合／寿命／关系／物理与失败政策；装配不重开账本、多账号或单执行者检测。
- [观察](03-observation-contract.md)、[认证](04-provider-access.md)、[HTTP](05-http-capability.md)、[命令](07-command-state.md)、[展示](08-presentation.md)、[刷新](09-refresh-lifecycle.md)、[模型](13-model-catalog-policy.md)提供本票消费契约；设计输入不要求先已生产实现。
- 已确认宿主补齐公开 Viewed session 出口是实施前置，最终实际 patched revision／版本须在验收决定并执行独立验证，当前支持记录不因本票升级。
- 配置机制、公共入口、既有 native import seam 与可复用消费者行为场景继续有效；所选 oracle 与许可证／来源是复用依据，不是 production import。

## Postconditions

- 后续规格／实施按本职责与 seam 接线，不增第二套配置、通用 State、注册、焦点或业务传输机制，不保留旧生产兼容路径。
- [验收与切换](../decision/11-acceptance-cutover.md)是下一决策提供票；需消费宿主公开出口、独立验证、消费者行为回归等已定输入，并决定最终支持／证据／用户切换步骤，不重复本票架构访谈。
- Q19 授权规划出版，不授权生产迁移、正式配置／凭据／旧数据改动或宿主补丁。实际实现完成不能由本票 resolved 推导。

## Invariants

- 延续 defineExtension＋公共绑定与 framework/public.ts seam；只发布实际需要的 authoring Interface，不暴露 HarnessPort／StateStore／派发器作为 extension 组装任务。
- ADR-0002 原生 import 责任测试保持；基础 Module 无 adapter 依赖，shared logic 无 harness 原生依赖，framework 无 extension 业务依赖。
- State／Owner／follow／none、唯一 Marker area、Extension feedback 继续复用；查看与观察不扩大 Owner 权限。
- HTTP／文件详细规则、消费 schema／失败取舍、刷新与视觉口径仅消费原权威；不借组织规格扩张保存、重试、取消、轮询、账号管理或账本。
- Owner handler 不被子事件驱动；逐 Session handler 不被 blanket gate 漏掉；同步／异步结果有承接，不新增全局保存屏障。
- 测试跨调用方同一 seam 验证可见行为，保留有效场景，迁移必要接线，删除实现细节／已失效政策断言，不用测试通过自动声明支持。
- 规划／源码检查／文档 smoke／隔离 native 探针与新生产链路认证严格区分，旧 supports record 不自动延伸。

~~~~~~~~

