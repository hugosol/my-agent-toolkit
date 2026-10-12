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
