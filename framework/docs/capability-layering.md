# 能力分层：presentation、业务与 foundation

**读者：extension 开发者。** 本页是 [Extension 开发地图](extension-development-map.md)的 model-cost 分层实例，集中维护该实例的职责与保存协作，不定义公共 adapter 接入规则或 harness 支持状态。静态需求推导与 adapter 接线检查已实现，统一见 [integration check](integration-check.md)；它不改变这里的业务归属。

## 1. 三层与外部依赖

```text
presentation                 对外只读展示与操作入口；原生绘制仍在 harnesses/
        ↓
business                     pricing · allowance · context · subagent
        ↓
foundation                   extension 自有的内向支撑能力
        ↓
公共 framework               公共身份、生命周期、观察、HTTP、文件协调等
```

foundation 不是仓库根目录的 framework，也不是零碎代码收容处。它由公共 framework 基本能力按 extension 的需要组成，可以拥有 extension 专有的共享数据和规则，但不接管独立业务功能的计价或额度政策。

业务 × framework 的规则先自然出现在业务 module；出现稳定的共享协作需求后，再考虑抽取到 foundation。适合这个 extension 不代表适合所有 extension，只有跨 extension 的公共语义或基础能力才考虑上移公共 framework。

## 2. 当前职责归属

| 位置 | 拥有的职责 | 不拥有的职责 |
| --- | --- | --- |
| business/pricing | 模型渠道与价格数据、请求锚价及消费贡献、DeepSeek 余额、周期命令的业务条件 | 会话累计的第二份权威、文件锁实现 |
| business/allowance | Codex 额度窗口、配对比例测量、独立估计文档的保存策略 | Session 消费或 token 余额 |
| business/context | 显示预算与会话上下文读数的业务解释 | 宿主 context window 限制、原生采集 |
| business/subagent | 后代会话数据的只读组合，复用自身消费、启动事实、耗时和上下文 | 第二套计价和累计、原生绘制 |
| foundation/session | 会话消费记录、一次应用、Round 差分、身份与父子关系、时间状态、联合快照 | 具体模型计价规则 |
| foundation/storage | 基线、消费文档与归档、周期/版本冲突、协调提交与只读同步所依赖的存储行为 | 通用文件锁或任意业务统一保存政策 |
| foundation/provider-refresh | 余额与额度已实际共享的成功 TTL 和在途查询合并策略 | endpoint、认证协议、结果解释 |
| presentation | 字段选择、文本和显示形式、只读结果与重绘通知 | 权威累计、provider 查询、文件写入 |
| runtime.ts | 创建并连接 module、framework 事件接线与实例初始化/清理 | 新能力注册表或 adapter 需求推导 |

以上是职责分类，不要求一个概念一份文件，也不为目录对称创建转发 module。同一能力同时适合 business 与 foundation 时，业务领域优先；只有确有稳定共享需求的内向支撑才放 foundation。公共 adapter 不镜像 extension 的 business/foundation 目录，extension presentation 也不进入公共 adapter 分类；接入组织原则统一见 [harness 接入指南](harness-integration.md)。业务可以单向组合其他业务能力；禁止的是循环依赖与重复权威，而不是一切业务间协作。foundation 不 import business；business 不 import presentation；公共 framework 不 import extension；原生访问位置仍遵循 ADR-0002。

## 3. 为什么不是只搬目录

- 请求价格与金额贡献由 pricing 拥有，会话记录只负责关联、一次应用与累计。
- 后代关系读取由 foundation 集中；subagent 组合领域数据，presentation 不再自行维护一份子树遍历。
- 显示预算属于 context，不由展示文件顺带决定模型政策。
- 同一实际 Session 的 token/金额、runtime、startup、span 继续组成一份快照，不新增独立写入。

用 deletion test 判断 module 是否值得保留：删除后，完整职责的复杂度会散回多个调用者，才有 depth。interface 是 test surface；复用现有 seam，只有真实变化点才增加 adapter，不因代码形似就做通用抽象。

## 4. 保存协作的范围

首批目标是同一实际 Session、同一消费文档、保存承诺兼容的数据，在既定保存点合成一次协调提交。各实际 Session 仍由运行它的实例提交自身记录，不让父会话代写子会话。

金额、子代理耗时、startup 和 span 共享原有 Session 快照；无变化时不制造保存。保存期间的后续变化不被当作已保存；只有协调提交实际确认后才声明 Consumption commit notice。父 Session 可读含后代累计，父 Round 只含自身消费。

Codex 估计文档继续独立：基线变化立即保存，比例细化保持原节流，失败保留内存测量，消费周期重置不清它。不同文档不强制进入全局队列，也不声称跨文件原子提交。周期重置的即时条件、归档顺序、失败处理和未保存消费处理继续遵循 ADR-0004。

## 5. 测试按职责组织，而非逐文件对称

```text
tests/model-cost/
  business/pricing/          余额与周期业务
  business/allowance/        额度与比例测量
  foundation/session/        请求消费、Round、Session、关系与时间
  foundation/storage/        schema、提交、并发与存储根
  presentation/              只读展示、树、布局与绘制
  integration/               初始化、主子会话、提交同步及跨 module 场景
  harnesses/pi/              pi 接线行为
  support/                   共同的受控宿主和子进程支持
```

原有业务场景、异常路径和行为断言不丢失；允许迁移入口与合并重复场景，不保留只绑定旧 implementation 的断言。组合测试与真实 harness dock 不因 module 拆分而拆没。测试范围与共享工作树协调遵循 [测试约定](../../docs/agents/testing.md)。

## 6. 与静态接入检查的关系

目标是从业务直接需求与所依赖 framework 能力的前置要求，追溯到 adapter 的接入义务；不是把所有矩阵 cell 求并集交给 adapter。

必须区分三类：

1. adapter 需要映射的宿主事实与机制；
2. 公共 framework 的宿主无关 module 已兑现的能力；
3. extension 自有的业务、foundation 与向外展示能力。

presentation 的字段和原生绘制不是 definition.ts 要求 framework adapter 提供的业务能力；其输入所需的公共事实应另外追溯。主/子会话、in-process/cross-process、硬需求/可降级需求需要分别考虑，不可跨模式拼凑供给。

本次分层重构没有引入运行时业务注册表。后续接入检查已改为从静态 authoring、interface 使用与实际 adapter 组装推导契约，不再维护重复的 definition requirements 或 adapter inventory。检查与生成的使用方式统一见 [integration check](integration-check.md)；结构检查不证明业务语义正确。

## 7. 术语与决策归属

- **Foundation（基座）**：extension 自有的、用公共 framework 能力组成的内向支撑能力集合，可拥有本 extension 的共享数据与规则。
- **Business feature（业务功能）**：按设计者的独立功能组织的业务 module；当前为金额、额度、上下文、subagent。
- **Composition（装配）**：连接已选 module 与实现，不收容难归类的业务规则。

这些是架构词汇，不写入消费领域 GLOSSARY。领域术语仍以 [model-cost glossary](../../extensions/model-cost/GLOSSARY.md) 为准；公共与原生职责遵循 [ADR-0002](../../docs/adr/0002-semantic-extension-framework.md)，聚合、周期和提交政策遵循 [ADR-0004](../../docs/adr/0004-model-cost-aggregate-accounting.md)。

## 8. 历史测量的限度

初始过渡布局见 `aac8936`；当时 request-accounting 约 1,380 行、display 约 1,685 行。它们只是审阅线索，不是深浅判据，也不是重构后规模或性能证据。重构不以抽象数量、目录数、行数下降为完成标准；行为保持、职责完整与依赖方向才是标准。
