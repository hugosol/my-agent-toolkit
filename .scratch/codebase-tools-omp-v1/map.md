# 首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配

Labels: wayfinder:map

## Destination

厘清首版语义扩展框架完整迁移 codebase-tools 所需的实现契约：仅通过 extension 在明确验收的 OMP 运行组合上保持业务行为，并确定实施与验收所需的全部决策。终点是可供后续规格与实施票使用的决策记录，不是框架代码或已认证的发行版。

> 2026-10-07 traverse 重划：用户显式放弃旧→新与新→旧持久化兼容。新实现以 `{enabled}` 持久键自洽；旧 `{on}` 会话恢复为 off，需重新 toggle。原「旧→新的向前持久化兼容」不再是 destination 要求，相关验证条目移入 Out of scope，见 [05](decision/05-contribution-contract.md)。

## Notes

### 本次范围与用户确认

- 用户在本次绘图讨论中确认：仅交付 OMP 适配；保留 Agent 运行时无关设计，但不实现空壳 pi adapter，也不宣称跨 Agent 运行时验证完成。
- 仅完整实现 codebase-tools 实际需要的框架能力：State、命令切换、会话存储与恢复、指令贡献、基础反馈以及 OMP 内建子代理路径的激活值实时跟随。不能只是把旧扩展包一层而绕过框架。
- 用户明确要求：不允许修改任何 agent 源代码，只能通过 extension 实现能力。不能补丁化、替换或 monkey-patch Agent 运行时内部实现来绕过该限制；验证工具可观察 Agent 运行时，但产品能力必须经扩展接口实现。
- 首版采用明确支持集，选择并验证具体 OMP 版本、运行模式、provider 协议及相关模型能力条件；不承诺普遍兼容。候选环境不等于支持声明。
- 这是整体架构的首个交付范围，不废弃整体 ADR 中其他扩展需要的能力。

### 每次工作所需上下文

- 先阅读 [领域术语](../../GLOSSARY.md)、[框架架构决策](../../docs/adr/0002-semantic-extension-framework.md)、[Agent 运行时支持与证据](../../docs/agent-runtime-support.md)。整体延期研究仍由 [框架研究待办](../../docs/semantic-extension-framework-backlog.md) 管理，不复制到本地图。
- 讨论使用 grilling、domain-modeling；接口设计同时使用 codebase-design。每次只解决一张非 research 决策票，先按 tracker 认领。
- 票据结果必须经过 lighthouse 的用户确认与记录，再设为 resolved；随后执行 backtracer。resolved 不表示代码已经实现。
- 业务契约以 [原扩展说明](../../../my-omp-toolkit/extensions/codebase-tools/README.md)、[原扩展术语](../../../my-omp-toolkit/extensions/codebase-tools/GLOSSARY.md)、[原扩展注入决策](../../../my-omp-toolkit/docs/adr/0001-codebase-tools-extension.md) 和选定源码为依据。这里只链接，不另存持久化 schema。
- 原扩展仓库保持独立，不向其写入框架迁移文件。本次不修改全局 Agent 运行时配置、不替用户安装或升级 Agent 运行时。
- 当前绘图只建票，不认领或解决票据。运行证据准备是一张阻塞设计的 task，不是提前实现框架；没有新建 research 票，因当前源材料已调查，接下来首先需要选择候选条件并执行真实验证，而非重复阅读。

## Decisions so far

<!-- 仅收录已 resolved 决策票的名称、lighthouse Decision 摘要与链接。绘图范围确认在 Notes，不伪造已解决票。 -->

- [确定迁移基线、框架能力契约与行为验收边界](decision/01-migration-baseline.md): 锁定 codebase-tools @34d7c40 为需求 oracle；以 C1–C15 框架能力契约定义“完整迁移”，每项声明必须语义、Agent 运行时不满足则显式拒绝而非降级；“启用轮”= 每用户轮一次，init/reminder 为两个独立贡献槽位，State 以 owner 关联替代进程全局；扩展验收与框架能力验证分目录成两套测试。
- [选择首版 OMP 候选运行组合与支持准入规则](decision/02-candidate-support.md): 首版只承诺一个精确组合——本地源码基线 `@oh-my-pi/pi-coding-agent@9348320`（=18.5.0，Windows x64 + Bun 1.4.2）；codebase-tools 交互 TUI 验收、框架能力自动化测试；未列版本通知一次后继续但必须语义不满足仍拒绝；探针一律隔离（临时 agent state + explicit-only 扩展根）；代码热重载延后，resume/State 恢复仍属首版。
- [取得不修改 Agent 运行时的 OMP 扩展路径运行证据](decision/03-extension-path-probes.md): OMP 18.5.0 经扩展接口验证了发现/外置源码与依赖、命令与 state 持久化、启动/切换/恢复、子代理身份与继承、UI 反馈转发、出站序列化与失败顺序；custom 贡献出站为 user role；唯一候选运行阻塞是本地源码 checkout 需先构建 natives。
- [确定指令贡献的时机、提交语义与角色保证](decision/05-contribution-contract.md): 贡献=隐藏持久化 custom_message 尾部追加；交付角色是 agent-runtime-qualified capability（OMP 按 provider 路径记录实际角色、codebase-tools 显式接受 user、其他 Agent 运行时待定；C9/02 角色条款据此重述）；init 进度以当前 branch 是否已有槽位贡献身份为准，state 只留 `{enabled}`；首版一槽位一规则；ADR-0002 双向默认保留给其他迁移，codebase-tools 显式放弃持久化兼容（2026-10-07 traverse）。
- [确定 State 归属、会话恢复与子代理实时跟随契约](decision/04-state-ownership.md): 只有 owner（最近 main 祖先会话）持有 `{enabled}`，子代理只读、每轮实时跟随且不可写；State 以 owner 会话 JSONL 的 `codebase-tools:state` 持久化（best-effort，扩展不可观测落盘失败）；owner 解析用原生 `parentId` + `pi.pi.AgentRegistry`，框架只维护一个活动 `Map<ownerKey, StateCell>`，会话边界从目标 branch seed、界内 Map 权威、`/tree` 不刷新 `enabled`；init 进度按各自 branch 独立推导；首版仅支持单 main，多 main 限制留 roadmap。2026-10-07：持久键改 `{enabled}`，不读旧 `{on}`。
- [确定扩展定义、行为组合与 OMP 适配接口](decision/06-framework-interface.md): 用声明式 `defineExtension`（v1 仅 `commandToggle`）+ `ompAdapter(definition, {supportedVersions})` 固定公共接口；`id`=`codebase-tools`、`displayName`=`codeBaseTools`，State 字段名即持久键（codebase-tools 用默认 `enabled`）；State owner 单写者、贡献按 `${id}:${tag}`+strategy 纯函数决定、marker 进框架统一区、toggle notify=`${displayName} enabled/disabled`、准入只对版本一次通知后继续；受约束纯 TS 后门与其他 control kind 延后。
- [确定共享源码装载与实现切换方案](decision/07-deployment-cutover.md): 修订锚点 = 本地 checkout @9348320，运行/验收产物 = 隔离精确安装 @18.5.0；装载点 = `entrypoints/omp` 目录，防双注册靠装载来源互斥（开发/验收 explicit-only `--no-extensions -e`，永久切换 = 验收通过后删旧 codebase-tools + 加新根目录条目 + 重启）；不做持久化兼容，新版只读写 `{enabled}`（2026-10-07 traverse）；版本升级 = 隔离安装候选 + 运行期参数跑框架能力测试、绿灯仅回归警报、人工 TUI 验收后显式替换单一支持版本。
- [确定首版验收矩阵与实施交接门槛](decision/08-acceptance-handoff.md): 锁定首版验收矩阵与实施交接门槛：两套测试分目录（`tests/codebase-tools/`、`tests/framework/`）、每项行为映射到真实 OMP 路径与证据；openai-codex 分两层证据（层1 本地 probe shape-only、层2 `gpt-6-luna` 真凭据、不可得记 unverified）；长期升级标准只覆盖框架能力、按需触发、触及面人工抽查；显式 blocker 经用户判断后交接到规格与 implementation；持久化迁移验证随 2026-10-07 决策移出首版验收。

## Not yet specified

<!-- 08（验收交接）已 resolved，本图范围内雾已清空：无 live ticket、无待毕业的在范围雾。acceptance-plan 已经用户确认为 08 决策附件；交接台账见 [acceptance-plan.md](acceptance-plan.md) §12（全部 decided，无未决 implementation-blocking 项）。超出 destination 的条目见 Out of scope。 -->

## Out of scope

- 本地图内实施、发布框架或迁移替代扩展；后续由规格与 implementation 票推进。本地图中的临时 Agent 运行时探针只为解除决策阻塞。
- pi adapter 的实现与验收，以及广泛覆盖多个 Agent 运行时、版本或 provider 的兼容承诺。
- 代码热重载（extension reload）的支持与验收：首版只承诺进程重启后源码变更生效；验证条目由 [框架 backlog](../../docs/semantic-extension-framework-backlog.md) 持有，不在本图验收范围。
- 修改 agent 源码、维护 Agent 运行时 fork/补丁、通过绕过扩展接口改变 Agent 运行时内部行为。
- 其他扩展迁移，以及 codebase-tools 不需要的文件归档、跨进程共享文件协调、其他控制模式、持续性副作用、codemode 集成。
- 改写业务提示词、自动探测/启用 MCP 或 LSP、替代子代理调度器、放宽必要消息角色或历史保护要求。
- 独立 npm 发布、独立扩展生成器、跨 Agent 运行时会话格式迁移。
- 持久化兼容（两个方向都已放弃）：codebase-tools 新实现以 `{enabled}` 为唯一持久键，不读取旧 `{on}` 字段；旧会话恢复为 off，用户需重新 toggle。旧写→新读写验证、新→旧回退、数据转换/一次性导入均不在范围内。ADR-0002 的框架默认双向兼容保留给其他迁移，codebase-tools 记为显式豁免。见 [05](decision/05-contribution-contract.md)、[07](decision/07-deployment-cutover.md)。
- 同进程多 main（ACP/cmux/embedded，或 `/new` 后旧子代理存活）的 owner 消歧：首版仅支持单 main，该场景 native 解析可能取到错误 owner、读到错误 State，不承诺支持；跟进项见 [框架 backlog](../../docs/semantic-extension-framework-backlog.md)。见 [04](lighthouse/04-state-ownership.md)。
- 配置化 State 持久化后端（内存 / 扩展自有文件 / agent runtime session entries）：首版只实现 codebase-tools 所需的 owner 会话 JSONL 映射，保留「当前值 vs 持久化映射」seam；配置化延后，见 [框架 backlog](../../docs/semantic-extension-framework-backlog.md)。见 [04](lighthouse/04-state-ownership.md)。
- 受约束纯 TS 自定义逻辑入口、其余 control kind（mode-selection / configuration-switch / parameter-setting / command-action）与面向未来扩展的 required-semantics 声明接口：首版 codebase-tools 不需要，超出本图 destination；见 [框架 backlog](../../docs/semantic-extension-framework-backlog.md)。见 [06](decision/06-framework-interface.md)。
