# 文档导航地图

这是仓库级文档入口：按你要完成的工作选择阅读路径。这里维护导航，不复制接口契约、检查命令全集、版本支持状态或历史证据。

## 按读者选择入口

| 你是谁 | 首先阅读 | 接着查什么 |
| --- | --- | --- |
| **Extension 开发者** | [Extension 开发地图](framework/docs/extension-development-map.md) | [公共 interface 阅读地图](framework/interface/README.md) → [能力与参数索引](framework/docs/framework-capabilities.md) → [model-cost 分层实例](framework/docs/capability-layering.md) |
| **Harness 接入者** | [Harness / adapter 接入指南](framework/docs/harness-integration.md) | 对照公共语义与 native 行为 → [adapter 实现导航](framework/docs/framework-capabilities.md#adapter-implementation-navigation) → 静态接入检查与真实行为验证 |
| **Framework 维护者** | [分层与可检查性原则](framework/docs/capability-interface-architecture.md) | [目录与运行入口](framework/README.md) → [架构决策](docs/adr/0002-semantic-extension-framework.md) → [测试约定](docs/agents/testing.md) |

完整的 framework 阅读顺序与文档归属见 [Framework 文档导航](framework/docs/README.md)。

## 按检查目标选择专题

| 你想确认什么 | 权威入口 | 结论边界 |
| --- | --- | --- |
| 开发好的 extension 所依赖的 framework 能力，在目标 adapter 中是否已接齐？ | [Integration check](framework/docs/integration-check.md) | 静态扫描需求与实际实现、接线；不证明原生语义正确或 harness 版本可用 |
| 当前或候选 harness 版本是否满足所需功能？应该运行哪些脚本？ | [Harness 版本检查手册](framework/docs/harness-support.md#version-verification) | 固定/候选版本测试、pi smoke、provider 与 TUI 验证；通过不自动提升支持状态 |
| 订阅、命令与生命周期声明能否被静态解析？ | [Static authoring check](framework/docs/static-authoring-check.md) | 静态表达门禁；不替代 integration check 或行为验证 |
| 如何选择测试范围、协调共享工作树中的运行？ | [测试约定](docs/agents/testing.md) | 按影响面选择用例与真实运行场景；文档变更检查链接和示例 |

版本支持状态与证据只在 [Harness support](framework/docs/harness-support.md)维护；机器可检查的固定基线在 [harness-baseline.json](framework/docs/harness-baseline.json)。

## 按 extension 查文档

各 extension 的 README 是其功能、操作、测试与人工验收入口；业务术语由各自的 glossary 定义。

| Extension | 功能与操作入口 | 业务术语 |
| --- | --- | --- |
| codebase-tools | [README](extensions/codebase-tools/README.md) | [GLOSSARY](extensions/codebase-tools/GLOSSARY.md) |
| connect-bot | [README](extensions/connect-bot/README.md) | [GLOSSARY](extensions/connect-bot/GLOSSARY.md) |
| workflow-chat / node-chat | [README](extensions/workflow-chat/README.md)；[部署与故障处置](extensions/workflow-chat/OPERATIONS.md) | [GLOSSARY](extensions/workflow-chat/GLOSSARY.md) |
| model-cost | [README](extensions/model-cost/README.md)；[分层实例](framework/docs/capability-layering.md) | [GLOSSARY](extensions/model-cost/GLOSSARY.md) |

## 术语、决策与历史资料

| 需要查什么 | 去哪里 |
| --- | --- |
| 仓库概览、安装与常用运行命令 | [根 README](README.md) |
| 不同上下文的领域词汇 | [Glossary Map](GLOSSARY-MAP.md) |
| 为什么采用当前架构、哪些方案被接受或否决 | [架构决策目录](docs/adr/) |
| Framework 接入契约的演进与当时的验证结果 | [接入契约重构记录](framework/docs/integration-contract-refactor.md) |
| Prompt contribution 的研究依据 | [Prompt injection research](framework/docs/research/prompt-injection-research.md) |
| 尚未解决的 framework 研究与工作项 | [Framework backlog](framework/docs/semantic-extension-framework-backlog.md) |
| Agent 工作约定与协作流程 | [AGENTS.md](AGENTS.md)；[Agent 文档目录](docs/agents/) |

历史记录只说明记录时点的源码、版本和覆盖范围，不代替当前验证结果。工作票不作为长期接口或运行手册的替代。

## 导航维护

- 新增或移动长期文档时，更新所属上下文的入口；影响跨角色发现时，再更新本地图。
- 本地图负责仓库级路由，[Framework 文档导航](framework/docs/README.md)负责 framework 的详细阅读路径，专题文档负责具体规则与操作。
- 不在多个入口复制兼容状态、完整命令或证据；链接到拥有该内容的文档。
