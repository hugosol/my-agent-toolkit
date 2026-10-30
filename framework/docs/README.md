# Framework 文档导航

按读者分成三条路径，再把两种检查各自集中维护。先选自己的角色，不必通读所有架构历史。

## 1. Extension 开发者

**入口：[Extension 开发地图](extension-development-map.md)**

解决：framework 已经提供什么、接口从哪里读、扩展代码应该放在哪一层。

推荐顺序：

1. [公共 interface 阅读地图](../interface/README.md)：允许消费的 capability 入口与不应穿透的内部实现。
2. [框架能力索引](framework-capabilities.md)：声明、参数、事件和效果的含义及源码位置；具体契约以引用的 canonical interface 为准。
3. [Extension 开发地图](extension-development-map.md)：definition、shared logic、公共 adapter、扩展宿主实现与发现入口的职责。
4. [model-cost 分层实例](capability-layering.md)及其 [README](../../extensions/model-cost/README.md#shared-logic-architecture)：business、foundation、presentation 和 runtime 如何协作，不要求简单扩展复制目录。
5. [Integration check](integration-check.md)：开发完成后，扫描实际源码，检查目标 adapter 是否接齐该扩展所依赖的 framework 能力。

## 2. Harness 接入者

**入口：[Harness / adapter 接入指南](harness-integration.md)**

解决：怎样对照 framework 语义理解 native 行为、决定映射方式，以及通过 adapter 接入同一份 framework。

推荐顺序：公共能力语义 → [`HarnessPort`](../runtime/port.ts) → 原生行为对比 → adapter 领域实现与装配 → [静态接入检查](integration-check.md) → [版本与真实行为验证](harness-support.md#version-verification)。

- [能力到 adapter 实现的导航](framework-capabilities.md#adapter-implementation-navigation)只负责查找源码，不是一份独立供给清单。
- [Harness 差异登记](harness-support.md#capability-difference-register)维护已知语义差异与条件，不以原生方法同名作为契约满足的证据。
- Extension 原生 widget 等专属实现仍属于该 extension 的 `harnesses/`，不纳入公共 adapter 的静态能力清单。

## 3. Framework 维护者

**入口：[Framework 分层与可检查性原则](capability-interface-architecture.md)**

解决：公共 interface、runtime port、内部语义 implementation 与 adapter 如何分层，以及如何让源码结构可被检查而不执行业务代码。

推荐顺序：分层原则 → [目录与运行入口](../README.md) → 受影响的 interface / runtime / implementation → [静态 authoring 规则](static-authoring-check.md)与 [integration check](integration-check.md) → [测试约定](../../docs/agents/testing.md)。

架构理由与变更决策保存在 [ADR 0002](../../docs/adr/0002-semantic-extension-framework.md)；当前接入契约与工具边界见[静态接入检查](integration-check.md)。

## 两个检查专题：分别证明什么

| 专题（唯一操作入口） | 输入 / 方法 | 能回答 | 不能据此声称 |
| --- | --- | --- | --- |
| [Integration check](integration-check.md) | 静态扫描 extension 对 interface 的使用、声明与订阅，对比目标 adapter 实际组装和交付 | 源码可证明的需求是否有对应实现与接线；哪里缺失、条件可用或无法解析 | 原生行为符合公共语义、真实 harness 版本可用、TUI 或 provider 已验收 |
| [Harness 版本检查](harness-support.md#version-verification) | 固定/候选版本、行为测试、真实宿主 smoke 与必要的人工观察 | 哪个精确版本组合、哪些功能和条件有运行证据 | 测试通过自动升级支持状态，或未覆盖路径同样可用 |

`check:authoring` 是静态表达门禁，不是上述两种验证的替代；`typecheck` 包含该门禁，但不隐含执行 `check:integrations` 或真实 harness 场景。

## 文档归属与维护规则

| 内容 | 集中维护的位置 |
| --- | --- |
| 扩展职责与代码落点 | [Extension 开发地图](extension-development-map.md)；model-cost 特有协作细节在[分层实例](capability-layering.md) |
| 公共能力、参数和源码导航 | [能力索引](framework-capabilities.md)；canonical interface 定义实际契约 |
| Adapter 接入方法与组织原则 | [Harness 接入指南](harness-integration.md) |
| Framework 分层与可检查性原则 | [架构指南](capability-interface-architecture.md) |
| 静态接入检查命令、诊断、生成和能力限制 | [Integration check](integration-check.md) |
| Harness 版本状态、检查脚本、兼容证据与升级条件 | [Harness support](harness-support.md)；机器基线在 [harness-baseline.json](harness-baseline.json) |
| 运行、人工验收与 cutover 入口 | [Framework README](../README.md)与各 extension README；版本检查流程不再在此复制 |
| 领域术语、决策、历史研究与未决事项 | [Glossary Map](../../GLOSSARY-MAP.md)、[ADRs](../../docs/adr/)、[research/](research/)、[backlog](semantic-extension-framework-backlog.md) |

角色指南引用权威专题，不复制命令全集、兼容状态或证据。历史记录中的版本、测试数量与执行结果只描述当时的源码和环境，不能当作当前工作树的验证结果。
