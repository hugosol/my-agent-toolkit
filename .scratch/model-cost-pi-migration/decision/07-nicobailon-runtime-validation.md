# nicobailon 子代理扩展的本机隔离验证

Type: task
Mode: AFK；模型、执行次数、费用上限与异常停止策略需 HITL 批准后才可真实调用
Status: resolved
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)

## Handoff

- 本票真实验证已完成并发布 [运行事实 Lighthouse](../lighthouse/07-nicobailon-runtime-validation.md)。详细场景、全部 F-/O-/N- 稳定行去向、同轴比较及未覆盖项见 [真实运行报告](../research/07-runtime-validation/report-live.md)，零费用预检见 [阶段报告](../research/07-runtime-validation/report-nofee.md)。本票完成只提供选型事实，不批准最终依赖或生产迁移。
- 授权来源（2026-10-16）：用户先要求“请开始ticket07”，随后对四项授权回答“全部同意”：`deepseek/deepseek-flash`；凭据只从 `E:/Developer/pi-playground/dskey.txt` 注入隔离进程；≤16次 execution（含嵌套、续跑、失败与重试）；≤¥5软限额含根与自动继续；费用缺失只重读一次、仍未知则停止后续真实调用。实际14次 execution、59次 provider请求，pi报告费用 $0.015280488，无未知费用请求；不复用旧 tintinweb 额度，也不自动授权后续付费重放。
- 固定运行对象：npm `pi-subagents@0.78.0`（实际 JS入口）+ pi CLI 1.2.0 + Node v24.18.0，本机 Windows。源码参考 pin `a4c8ced69a8176cdf4179b127feddc8875e3418f` 与宿主来源 `4a5d37291531ad48b8e536c892557877d219463c` 沿用原输入；发布工件独立核对，不静默升级。元数据、integrity、命令在 [环境记录](../research/07-runtime-validation/preflight-environment.json)。
- 已取得模型自主前后台、并发 workflow、两种父进程位置的 opt-in 嵌套、同 session 续跑、新 session fork、一次性定时、在途取消和 follow-up 证据；required-child-extensions 实际加载观察探针。续跑 run/进程变化不等于新 session；PI_SUBAGENT_CHILD 只守卫候选自身，不能当所有前台子的身份事实；直接父由实际委派路径、父文件 header 与 run meta 交叉核对，不从 depth/名字/时间猜测。
- 汇集证据：[独立会话核对](../research/07-runtime-validation/reconciliation.json) 59请求逐项匹配，无缺失/mismatch；排除18条fork继承响应，重复回放不改总账。每进程/session独立JSONL及离线归并可行，不代表生产共享主JSON的锁、原子提交、崩溃恢复或增量订阅已实现。候选cost快照少两条嵌套叶及调度叶，差额见 [范围对照](../research/07-runtime-validation/cost-scope-comparison.json)，不能直接当完整owner账本。
- 保留边界：Viewed出口缺失；关轮完整quiescence、runtime running读数/全执行器同口径、根导航/改名、生产根专用initialize/cleanup、State及其他公共端口未验证或未实现；未测HTTP流式中途取消、recurring调度、其他provider/平台。原始失败（代理工具清单格式、resume model override、schedule mission参数）均保留，不作为候选不兼容或允许任意重试的理由。
- 政策输入继续为 [完整基线](../lighthouse/01-capability-baseline.md)、[候选事实](../lighthouse/02-pi-subagent-candidates.md)、[选型部分确认](../lighthouse/03-subagent-provider-choice.md)、[内置观察组织原则](../lighthouse/04-third-party-adapter-organization.md)。背景比较保留 [产品与维护](../research/03-product-maintenance-comparison.md)、[adapter缺口](../research/03-adapter-gap-comparison.md)；其nicobailon“未运行”是历史证据边界，当前运行结果以本票Lighthouse为准，不改原研究历史。与 [tintinweb运行权威](../lighthouse/06-tintinweb-runtime-validation.md) 分开，不将它未测的自观察说成不可实现。
- Backtracer（2026-10-16）：追溯本票及完整基线、候选事实、选型/观察组织的部分权威和tintinweb对照。选型/缺口处置由 [选择 pi 子代理扩展及缺口处理路线](03-subagent-provider-choice.md) 承接；事实归一、跨进程生产汇集、scope/实例/订阅及根专用寿命由 [第三方能力适配的集中组织与公共语义复用](04-third-party-adapter-organization.md) 承接；Viewed、Round、runtime及全功能验收由 [model-cost 完整迁移的职责落点与验收路线](05-complete-migration-plan.md) 承接。cost范围差异和自测区间不足没有无主问题，也未与上游已批准政策冲突；不新建重复票、不修订他票政策或claim。
- 收尾证据：[清理记录](../research/07-runtime-validation/cleanup.json)。最后0 active/无排队消息、无活动调度、宿主exit0、已观测worker/runner均退出；日常agent文件快照未变。隔离目录与本轮7个Temp async目录已删除；168个脱敏文件封存为 [原始证据](../research/07-runtime-validation/raw/runtime-evidence.zip)，含真实session、观察、元数据和配置输入，另有驱动及核对入口。凭据不在封存或日志中。
- 下一就绪问题：回到 [选择 pi 子代理扩展及缺口处理路线](03-subagent-provider-choice.md)，依据两候选真实证据与完整基线，最终选择哪一提供方/版本，各剩余缺口接受哪条补齐路线、外部前提和重评条件？本会话不开始或解决第二张票。

## Question

固定 nicobailon 发布工件能否在本机 Windows + pi 1.2.0 隔离环境中满足用户的子代理使用需求，并让 model-cost 内置观察取得、归因和汇集完整基线所需的事实？哪些项真实通过、失败、缺失或仍未覆盖，结果如何改变与 tintinweb 的选型比较？

### 验证范围

1. **零费用预检与隔离**：独立 agent/config/session/project 目录，显式扩展集，不更改日常安装与配置；核对工件、运行入口、工具加载/发现、RPC 和必需子扩展登记。无凭据时不得读出或输出秘密；真实凭据仅在获准调用阶段通过隔离进程环境传递。
2. **用户执行能力**：真实模型按任务调用子代理工具；前台/后台、并发、嵌套、完成后续跑、在途取消。确认嵌套 opt-in、深度和预算配置，记录受支持路径；不能只用 root RPC spawn 代替模型自主调用证据。比较续跑的 task/run/agent/session 身份，不能因新 child 记录就认定新 actual session，也不能把 resume/fork 自动当作 OMP keep-alive 等价。
3. **加分功能**：至少一个最小真实 workflow；一个短延迟定时触发并观察实际执行与结果投递。必要时另测一次重复触发以检查重复记账，须纳入批准限额；不留下活跃定时任务。若预算或环境不允许，显式记为未覆盖，不静默缩范围或判通过。
4. **内置观察最小探针**：用 model-cost 可采用的加载入口，而非独立生产观察产品，验证探针在根、前台子、后台子、嵌套及 workflow/调度所创子会话中的加载与身份识别；允许登记 required child extension。优先公开身份事实，不足时按已批准路线启用子会话持久化。将真实 session id、直接父、Owner 解析与第三方 task/run/agent handle 分开；必须能排除 fork 来源歧义，不能用名字、时间或深度猜父链。
5. **请求与汇集**：观察请求开始、实际 provider/model、响应边界、可靠逐请求 usage、失败/取消时读数及输入来源；验证独立临时 JSON 在跨进程并发、嵌套、续跑/重新绑定下归因与去重。以可核对的原始会话/请求事实作独立对照，不用探针回显证明自己正确；子请求不能重复计入父自身累计，未知与确认零分开。
6. **其余基线与寿命**：记录首次开始/恢复及有效 model/effort 的证据；活动、排队、后台等待、自动继续和 settle 所提供的关轮输入；子绑定不得触发根专用业务初始化/清理。尝试自行测量 execution 区间，核对续跑间空闲；不可行可记录耗时例外，但不能自动放宽其他项。检查当前查看会话是否有可消费真实出口；缺失如实记录，不以 viewer 或 JSON 保存代替。逐轴映射 F-/O-/N- 稳定标识，不能将只验证其中几项说成完整覆盖。

### 完成与交接

- 每项范围有实际场景、来源/工件、结果和证据等级；失败、事实缺失、未覆盖分开。必要场景无法执行时，完成可达调查并记录具体原因及对选型的影响，不伪造通过。
- 结果保存于 `research/07-runtime-validation/`：精简报告、脱敏原始观测、复现入口、固定环境、命令、实际执行计数与费用/未知费用。凭据不进入日志、repo 或命令行。
- 汇总与 tintinweb 的同轴比较：产品使用、身份/父链、子会话观察、跨进程汇集、生命周期及未解决的 Viewed/关轮事实。验证结果不替用户批准提供方、fork、私有接口或功能降级。
- 结束时停止代理、后台 runner、定时任务并释放登记/订阅；核对日常配置未变，清理临时凭据/隔离安装，留下脱敏证据和可重建入口；不能清掉证据后宣称可恢复。
- 依 Wayfinder 通过 Lighthouse 发布结果并追溯后才 `Status: resolved`；清空本票 claim。最终选择回到 [选择 pi 子代理扩展及缺口处理路线](03-subagent-provider-choice.md)。
