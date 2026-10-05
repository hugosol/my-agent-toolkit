# 首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配

Labels: wayfinder:map

## Destination

厘清首版语义扩展框架完整迁移 codebase-tools 所需的实现契约：仅通过 extension 在明确验收的 OMP 运行组合上保持业务行为、实现可逆持久化兼容，并确定实施与验收所需的全部决策。终点是可供后续规格与实施票使用的决策记录，不是框架代码或已认证的发行版。

## Notes

### 本次范围与用户确认

- 用户在本次绘图讨论中确认：仅交付 OMP 适配；保留宿主无关设计，但不实现空壳 pi adapter，也不宣称跨宿主验证完成。
- 仅完整实现 codebase-tools 实际需要的框架能力：State、命令切换、会话存储与恢复、指令贡献、基础反馈以及 OMP 内建子代理路径的激活值实时跟随。不能只是把旧扩展包一层而绕过框架。
- 用户明确要求：不允许修改任何 agent 源代码，只能通过 extension 实现能力。不能补丁化、替换或 monkey-patch 宿主内部实现来绕过该限制；验证工具可观察宿主，但产品能力必须经扩展接口实现。
- 首版采用明确支持集，选择并验证具体 OMP 版本、运行模式、provider 协议及相关模型能力条件；不承诺普遍兼容。候选环境不等于支持声明。
- 这是整体架构的首个交付范围，不废弃整体 ADR 中其他扩展需要的能力。

### 每次工作所需上下文

- 先阅读 [领域术语](../../GLOSSARY.md)、[框架架构决策](../../docs/adr/0002-semantic-extension-framework.md)、[宿主支持与证据](../../docs/host-support.md)。整体延期研究仍由 [框架研究待办](../../docs/semantic-extension-framework-backlog.md) 管理，不复制到本地图。
- 讨论使用 grilling、domain-modeling；接口设计同时使用 codebase-design。每次只解决一张非 research 决策票，先按 tracker 认领。
- 票据结果必须经过 lighthouse 的用户确认与记录，再设为 resolved；随后执行 backtracer。resolved 不表示代码已经实现。
- 业务契约以 [原扩展说明](../../../my-omp-toolkit/extensions/codebase-tools/README.md)、[原扩展术语](../../../my-omp-toolkit/extensions/codebase-tools/GLOSSARY.md)、[原扩展注入决策](../../../my-omp-toolkit/docs/adr/0001-codebase-tools-extension.md) 和选定源码为依据。这里只链接，不另存持久化 schema。
- 原扩展仓库保持独立，不向其写入框架迁移文件。本次不修改全局宿主配置、不替用户安装或升级宿主。
- 当前绘图只建票，不认领或解决票据。运行证据准备是一张阻塞设计的 task，不是提前实现框架；没有新建 research 票，因当前源材料已调查，接下来首先需要选择候选条件并执行真实验证，而非重复阅读。

## Decisions so far

<!-- 仅收录已 resolved 决策票的名称、lighthouse Decision 摘要与链接。绘图范围确认在 Notes，不伪造已解决票。 -->

- [确定迁移基线、框架能力契约与行为验收边界](decision/01-migration-baseline.md): 锁定 codebase-tools @34d7c40 为需求 oracle；以 C1–C15 框架能力契约定义“完整迁移”，每项声明必须语义、宿主不满足则显式拒绝而非降级；“启用轮”= 每用户轮一次，init/reminder 为两个独立贡献槽位，State 以 owner 关联替代进程全局；扩展验收与框架能力验证分目录成两套测试。
- [选择首版 OMP 候选运行组合与支持准入规则](decision/02-candidate-support.md): 首版只承诺一个精确组合——本地源码基线 `@oh-my-pi/pi-coding-agent@9348320`（=18.5.0，Windows x64 + Bun 1.4.2）；codebase-tools 交互 TUI 验收、框架能力自动化测试；未列版本通知一次后继续但必须语义不满足仍拒绝；探针一律隔离（临时 agent state + explicit-only 扩展根）；代码热重载延后，resume/State 恢复仍属首版。

## Not yet specified

- 真实宿主执行可能暴露 State 恢复、消息提交及子代理生命周期之间尚未看清的耦合。待运行证据与各契约明确后再判断是否需要额外决策；已能明确提问的事项均进入子票，不在此重复列出。

## Out of scope

- 本地图内实施、发布框架或迁移替代扩展；后续由规格与 implementation 票推进。本地图中的临时宿主探针只为解除决策阻塞。
- pi adapter 的实现与验收，以及广泛覆盖多个宿主、版本或 provider 的兼容承诺。
- 代码热重载（extension reload）的支持与验收：首版只承诺进程重启后源码变更生效；验证条目由 [框架 backlog](../../docs/semantic-extension-framework-backlog.md) 持有，不在本图验收范围。
- 修改 agent 源码、维护宿主 fork/补丁、通过绕过扩展接口改变宿主内部行为。
- 其他扩展迁移，以及 codebase-tools 不需要的文件归档、跨进程共享文件协调、其他控制模式、持续性副作用、codemode 集成。
- 改写业务提示词、自动探测/启用 MCP 或 LSP、替代子代理调度器、放宽必要消息角色或历史保护要求。
- 独立 npm 发布、独立扩展生成器、跨宿主会话格式迁移。
