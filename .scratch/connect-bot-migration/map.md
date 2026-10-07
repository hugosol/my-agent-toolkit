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

## Decisions so far

- [保留哪些行为，以及以哪个原实现版本为准](decision/01-behavior-baseline.md)：基线 = 本机 my-omp-toolkit 最新代码（开发期冻结）；契约只覆盖新引入的框架行为（framework 层测试）与扩展层可独立测试的行为（允许 mock），真实集成由用户手动验证；心跳 10s / 失败 3 次 / 超时 1s、1.5s / 出站队列机制全保留；提示文案与 `offline` 词形已由《接入命令与会话状态由框架和扩展如何共同管理》修订（`off`、框架 marker 承载连接状态、文案集合重开，见 [lighthouse](lighthouse/01-behavior-baseline.md) 修订节）；冲突逐条交用户判断。
- [接入命令与会话状态由框架和扩展如何共同管理](decision/02-command-state-ownership.md)：新增「定向开关」控制类别（写死空参=on、`off`=off，重复执行重复动作，幂等由扩展保证）；`enabled` 为 in-memory、默认不继承的 State 字段，其值由扩展 handler 的动作结果决定、handler 在 State 写入前运行并拥有写；连接标识由框架 marker 从 `enabled` 派生；agent 工作状态与 HTTP/协议/心跳留扩展；文案集合与 hasUI 门槛移交 04。细节见 [lighthouse](lighthouse/02-command-state-ownership.md)。

## Not yet specified

- 职责划分还可能在其它跨能力组合中暴露所有权/执行顺序冲突；第一个已毕业（State 继承 × 持续效果/marker → 02 决定 per-field 继承开关默认不继承，约束移交 03/04）。其余待具体证据出现再形成问题；不预设需要新的通用编排层。
- 原实现基线已定（01），但其使用的 5 个 omp 事件（`agent_start`、`session_stop`、`agent_end`、`session_switch`、`session_branch`）与 `ctx.*` 原生调用相对**当前** OMP 支持基线的对照尚未做；可能暴露已有事件假设失效或框架契约冲突。已知兼容要求由现有票据覆盖；尚未识别的冲突待证据出现后展开。

## Out of scope

- 本地图不编写迁移代码，不生成或执行实施票据；目的地是设计决策完备。
- pi 适配实现及 pi 功能验收；本次只划清未来适配的边界。
- 修改 omp-bot 面板或通信协议，新增双向控制、多面板等业务能力。
- 为未知扩展建设通用 UI 语言、完整原生 API 包装层或补齐所有框架远期能力。
- 迁移其他扩展，或修改原 `my-omp-toolkit` 仓库以使其依赖本框架。
