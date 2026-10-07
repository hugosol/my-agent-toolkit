# connect-bot 迁移与框架能力边界

Labels: wayfinder:map

## Destination

明确 `/connect-bot` 迁入新框架的行为契约、框架与扩展的职责边界、自定义代码的能力边界及验收标准，使后续能够据此编写规格与实施票据，无需再做关键设计决定。
地图完成代表迁移决策完备，不代表代码已迁移。

## Notes

- 本次为规划，不执行迁移。决策票据放在 `decision/`，使用 `open` → `claimed` → `resolved`；实施票据另行生成。
- 用户已确认的范围：OMP 是功能验收目标；设计时明确运行时无关逻辑与 OMP 专属集成的边界，不实现 pi 支持，也不宣称 pi 已验证。
- 业务行为默认保留，差异逐项决策；允许按新框架重写实现，不逐行移植。提示文案与标记位置已由 02 讨论授权变更（逐条归 04）；配置文件位置仍可单独讨论，不默认获得变更授权。
- omp-bot 面板及通信协议保持不变；迁移后的扩展对接现有面板，保持单向上报。
- 框架按本次需求扩展，不以最少修改框架为目标，也不顺带补齐远期能力。能力归属按语义契约判断，不按使用者数量判断。
- 每次讨论使用 grilling 与 domain-modeling；涉及模块接口和职责划分时使用 codebase-design。每次最多解决一个非 research 决策票据；解决后必须经过 lighthouse 用户确认和 backtracer。
- 原功能权威来源：[原扩展说明](../../../my-omp-toolkit/extensions/connect-bot/README.md)、[原扩展源码](../../../my-omp-toolkit/extensions/connect-bot/)。这些是可变工作区引用；兼容基线票据需选定可追溯版本，不能将文档描述当成已运行验证。
- 现有约束：[框架架构决策](../../docs/adr/0002-semantic-extension-framework.md)、[领域词汇](../../GLOSSARY.md)。架构已允许扩展的运行时专属实现直接调用原生能力；这不是绕过框架契约的无限许可。框架规划中描述的能力不等于已实现能力。
- 接入状态、面板 keepAlive、agent 工作状态是不同概念，不混为单个“在线”值。正式术语变更在对应讨论中确认。
- 本次 charting 不解决决策票据，Decisions so far 保持为空。开放子票据以 `decision/` 中的状态和依赖查询为准；无原生依赖能力，使用 `Blocked by`。
- 本次没有独立 research 票据：现有决策问题可直接明确，已有本地资料足以开始讨论；后续如出现需要外部事实才能作出的选择，再创建具体 research 问题，不用泛化调研票据代替决策。
- 面板侧契约已完成且可读：[面板侧 spec](../../../archive-docs/omp-bot/omp-connect-bot/spec.md) 与 [contract.md](../../../archive-docs/omp-bot/omp-connect-bot/contract.md)（扩展 `connection.ts` 引用的 `spec.md §心跳与失败` 出处）；实现于本机 [omp-bot](../../../omp-bot)（`d50e35c`）。面板行为是固定外部契约，只以「扩展必须满足的前提」形式进入扩展契约，S2 承诺（P1–P11）与保留项逐条对齐。
- 基线冻结：本需求开发期间 `my-omp-toolkit` 的 extension 代码与文档不变；任何票据不得以「原实现可能变化」为前提。
- 冲突仲裁：代码 / README / 既有测试 / 面板 spec 不一致时，逐条登记为差异项交用户判断，不设自动优先级。
- **实施期文档同步必须进待办**：`docs/framework-capabilities.md`（已实现符号索引，逐符号引源码行）与 `docs/agent-runtime-support.md`（OMP-qualified 能力差异表）不是运行时 promise、也没有可观测 seam，因此不会被 `to-tickets` 自动切成票（该技能要求每票交付 contract promise 或作为 enabling）；它们必须作为相关实施票据的 acceptance criteria 落地——符号落地时同步 capability index、OMP-qualified 原生落地时同步能力差异表。`/to-spec` 须把这两条写进 Implementation Decisions/Testing Decisions，`/to-contract` 作为对应 promise 的 coverage；来源：06 承接约束 (e)(g)(h)、07/08 Postconditions。
- **实施期 runbook 承接（backtracer 2026-10-07）**：connect-bot 的新旧切换/回退步骤须扩写进 `README.md` §H3（现仅 codebase-tools），作为相关实施票据的 acceptance criteria 落地；与上一条文档同步义务同类（来源：05 决策与 backtracer Layer gap）。

## Decisions so far

- [保留哪些行为，以及以哪个原实现版本为准](decision/01-behavior-baseline.md)：基线 = 本机 my-omp-toolkit 最新代码（开发期冻结）；契约只覆盖新引入的框架行为（framework 层测试）与扩展层可独立测试的行为（允许 mock），真实集成由用户手动验证；心跳 10s / 失败 3 次 / 超时 1s、1.5s / 出站队列机制全保留；提示文案与 `offline` 词形已由《接入命令与会话状态由框架和扩展如何共同管理》修订（`off`、框架 marker 承载连接状态、文案集合重开，见 [lighthouse](lighthouse/01-behavior-baseline.md) 修订节）；冲突逐条交用户判断。
- [接入命令与会话状态由框架和扩展如何共同管理](decision/02-command-state-ownership.md)：新增「定向开关」控制类别（写死空参=on、`off`=off，重复执行重复动作，幂等由扩展保证）；`enabled` 为 in-memory、默认不继承的 State 字段，其值由扩展 handler 的动作结果决定、handler 在 State 写入前运行并拥有写；连接标识由框架 marker 从 `enabled` 派生；agent 工作状态与 HTTP/协议/心跳留扩展；文案集合与 hasUI 门槛移交 04。细节见 [lighthouse](lighthouse/02-command-state-ownership.md)；backtracer 2026-10-07 收口：`Control kind` / `Directed control` / `State persistence` / `Subagent State inheritance` 已登记 GLOSSARY，`Owner` 措辞对齐 per-field 默认不继承。
- [生命周期映射与持续上报由哪一层负责](decision/03-lifecycle-effects.md)：框架新增运行时无关的**语义生命周期模型**——会话轴 `session_start`/`session_end`（对称一对，带 reason）、运行轴 `round_start`/`round_end`（`Round` = user-prompt 级活动段，`round_end` 在 quiescence 触发、无 payload），配独立查询 `canAcceptInput()`；框架行为先于扩展 handler 分发，adapter 把 OMP/pi 原生事件合成为语义事件、缺语义按 `required-semantics` fail-soft；心跳 timer/outbox/失败预算/HTTP/三值业务仍留扩展，扩展只消费语义事件；owner 订阅默认只收 owner 自身事件（子代理不送达，标 OMP-qualified）。修订 01（框架提供 `session_end` ≠ 扩展 hook `session_shutdown`）；细节见 [lighthouse](lighthouse/03-lifecycle-effects.md)。
- [自定义交互和原生能力可以越过哪些边界](decision/04-interaction-native-boundary.md)：统一扩展反馈为运行时无关、带 `info | error` 的框架接缝（命令与语义事件 handler 都可用，无 UI 落 stderr），框架在 delivery 暴露 `hasUI` 由扩展执行 no-UI 门槛；connect-bot marker 改为 `◈ connectBot`（enabled 才显示），文案表除 `offline`→`off` 外全部保留并集中为单一 `selectFeedback` 纯函数；直连 OMP 原生仅限 `runtimes/omp.ts` 的 managed timer 与真实 sessionId/cwd/model；框架在所有 handler delivery 提供声明值写接缝（auto-disarm 写 `enabled=false`），扩展工作数据由扩展自持 owner-scoped 记录，不引入 State 的 opaque extra_data 区。细节见 [lighthouse](lighthouse/04-interaction-native-boundary.md)。

- [配置、装载与新旧实现切换如何保持兼容](decision/05-configuration-cutover.md)：新增框架能力 **Extension configuration**——框架按 `extensions/<id>/config.yaml` 约定、definition 以纯数据 `config.path`/`config.fields` 声明路径覆盖与必填键/类型，在 binding 时以纯 JS `yaml` 包读取校验；缺文件/坏 YAML/非对象/键缺失/类型不符 → `BindingFailure { kind: "config" }` + `reportDiagnostic` error，该扩展不加载，无代码级默认值；共享 logic 经 `getConfig(definition)` 拉取值，OMP 装配层不接触配置。connect-bot 改用 `config.yaml`（默认 endpoint、`non-empty-string`）；新旧切换/回退复用 codebase-tools 的 load-source mutual exclusion（测试只挂新实现，旧实现仅作冻结基线与回退路径），endpoint 值手工搬运、无状态迁移；切换前建议 `/connect-bot off`，旧行按面板 30s 过期保留。这是对 01 P10 缺文件/坏格式行为的显式修订。细节见 [lighthouse](lighthouse/05-configuration-cutover.md)。

- [后台效果与 session_end 清理如何取得框架能力与 owner 事实](decision/07-effect-callback-capabilities.md)：后台效果回调不新增框架 API——handler delivery 提供可保留的 owner-scoped 能力句柄（声明值写 + 统一反馈），扩展存入自持记录供 timer/outbox 复用；句柄随 owner retire 失效（写 no-op、反馈丢弃），session_end 本次投递自带一次性反馈口供其 handler 发 G；`session_end` 以 `owner.key` 给出正在结束的 owner 并移除冗余 `previousOwnerKey`，transferred 先停本地再 best-effort 注销旧真实 sessionId、disposed 只停本地交面板过期；新增 GLOSSARY `Extension feedback`，并把「adapter 是唯一命名原生 API 的模块」改写为 import-boundary 测试的实际规则。细节见 [lighthouse](lighthouse/07-effect-callback-capabilities.md)。

- [原生边界规则与执行契约如何写入 ADR 0002](decision/08-native-boundary-adr.md)：不新开 ADR，把原生边界的执行契约作为 ADR 0002 的 additive 小节——逃生舱固定为 `framework/adapters/**` 与 `extensions/<id>/runtimes/**`，由 `tests/framework/import-boundary.test.ts` 机械执行（词法、尽力而为；ADR 原则权威），放宽/绕过属非 additive 架构变更须 ADR 显式决策；并一并补齐 ADR 0002 与 02/04/07 的漂移（含修正 §Framework-owned capabilities 的继承表述）。文档在决策时即更新，不推迟到实现期。细节见 [lighthouse](lighthouse/08-native-boundary-adr.md)。

- [用什么证据证明迁移等价且框架边界成立](decision/06-acceptance-contract.md)：三层验收——F 层 `tests/framework/` in-process double 验收全部新框架能力（02/03/04/05/07，08 由既有 import-boundary 保持 green），E 层 `tests/connect-bot/` 沿用原 L1（fake api/ctx + `__setPushClientForTest` + `vi.useFakeTimers()`）验收 connect-bot 专属可隔离行为，M 层真 OMP×omp-bot 由用户按可执行观察清单（前置 A–M、每步观察点与预期）手动执行、不作自动化门；不重复测试框架既有能力；loader/admission 按 codebase-tools/deployment 先例自动化（原 L2 不再独立人工）；全量 `bun run test` 在记录的源/运行时基线上全绿为 release gate，历史约束被有意修改时同步改旧 test case；两份能力文档在对应代码 ticket 完成后同步。细节见 [lighthouse](lighthouse/06-acceptance-contract.md)。

## Not yet specified

- 职责划分还可能在其它跨能力组合中暴露所有权/执行顺序冲突；第一个已毕业（State 继承 × 持续效果/marker → 02 决定 per-field 继承开关默认不继承，约束移交 03/04）。其余待具体证据出现再形成问题；不预设需要新的通用编排层。
- Configuration switch 语义在《配置、装载与新旧实现切换如何保持兼容》中显式 deferred：本次只让文件形态与命名可承载它，不顺带实现；未来要做时另行发起（见 [05 lighthouse](lighthouse/05-configuration-cutover.md)、[ADR 0002](../../docs/adr/0002-semantic-extension-framework.md)）。

## Out of scope

- 本地图不编写迁移代码，不生成或执行实施票据；目的地是设计决策完备。
- pi 适配实现及 pi 功能验收；本次只划清未来适配的边界。
- 修改 omp-bot 面板或通信协议，新增双向控制、多面板等业务能力。
- 为未知扩展建设通用 UI 语言、完整原生 API 包装层或补齐所有框架远期能力。
- 迁移其他扩展，或修改原 `my-omp-toolkit` 仓库以使其依赖本框架。
- 框架开设 owner-scoped、memory-only 的 opaque 扩展数据区（`extra_data`）等远期框架能力：本目的地不需要——04 已判定扩展工作数据由扩展自持 owner-scoped 记录；未来若出现「无效果但需 owner 生命周期清理」的数据，按重画目的地另行发起（见 [04 lighthouse](lighthouse/04-interaction-native-boundary.md) §8）。
