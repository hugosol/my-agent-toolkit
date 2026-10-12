# 确定的新能力与 model-cost 如何组织、声明和装配？：Lighthouse

> Question and discussion: [确定的新能力与 model-cost 如何组织、声明和装配？](../decision/10-assembly-layout.md)
>
> 部分发布：本轮只确认宿主专属实现层，以及当前查看 Session 的通用事实／有效激活标记归属。源票仍 open、未认领；其正文、依赖和未决范围不变。确认来源为[展示访谈的文件名定向确认](../assets/presentation-confirmation-2026-10-12.md) Q3／Q29；未实施生产能力。

## Question

如何组织扩展共享逻辑与各 harness 的不同实现，并在不泄漏原生依赖、不改记账／State Owner 的情况下支持当前查看会话？本局部结果不决定完整模块布局、公共 exports、实例装配或原生接线。

## Discussion

### 扩展的宿主专属实现层

扩展拥有必须按 harness 分别实现的部分；复用业务规则与纯展示计算放 shared logic，宿主原生 UI、主题、布局及必要专有集成放该扩展的宿主专属实现。widget 是明确实例，不把扩展专有组件整体升级为 framework 公用 UI 系统。

framework／adapter 负责根据当前 harness 选择并接入扩展提供的对应实现。具体实现声明、选择方式、实例创建／销毁及文件布局尚未定；不默认运行时 autodetect、自动加载全部分支或第二套注册机制。framework 不依赖个别扩展的业务实现，由装配提供所需实现与依赖。

目的：宿主接口变更影响对应桥接与专属实现，不要求修改整个 extension；共享契约真的改变时仍可修改 shared logic，不承诺任何宿主变更都绝不影响共享契约。

遵守 [ADR-0002 的责任测试与原生 import seam](../../../docs/adr/0002-semantic-extension-framework.md#responsibility-test-for-harness-differences)：framework 自有语义仍由 core／behaviors 与 adapter 分工；扩展宿主实现仍属于扩展，原生访问只在既有 adapter／extension harnesses 位置。本轮认可职责层，不批准扩大 native allow-list 或另开任意 native 目录。

### 当前查看 Session 的通用事实与状态投影

framework 提供宿主无关、只读的当前查看 Session 身份、当前模型、实际 Effort、上下文事实，以及查看切换语义；adapter 映射原生事实与信号，不透传整个宿主 context。这是公共查看能力，不把 model-cost 消费字段纳入 framework 业务 State。

统一 Marker area 按当前查看 Session 的有效 State 投影各扩展激活标记，复用已定 follow／none 继承规则；不是直接复制主会话全部 markers，不额外创建 model-cost 标记系统。查看只改变 UI 目标，不改变记账身份、State Owner、继承值或 owner-scoped 外部效果。各扩展声明及 State 仍是唯一激活来源。

具体接口、订阅／取消、事实不可取得、旧 owner gate 收口、marker 实例与 focused 状态刷新接线、源 oracle 和支持版本仍由本票收口。不能仅添加 TypeScript interface 就假定 OMP 原生可取得事实。本轮允许按需补齐公共能力，但不默认批准访问宿主私有字段、不猜 UI 文字、不静默升级基线；若需要宿主公开出口改动，具体路线与版本仍待核验。

本轮证据与限制见[确认资产](../assets/presentation-confirmation-2026-10-12.md)：OMP 内部 viewSession 与 main 分开；已检查的公开扩展 context 不暴露焦点；真实 focus 控制器的隔离探针仅在安装版 18.9.2、fixture Session／UI 下运行，不是新 framework 或 18.5.0 验收。

### 尚未决定

保留源票全部未决问题：依赖注入、目录与 exports、requiredSemantics／fail-soft、公共实例生命周期、逐会话观察、当前查看事实的可支持原生出口、消费者迁移、oracle revision、依赖来源与验收版本。当前公共模型价格事实消费[观察权威](03-observation-contract.md)与[计价来源局部权威](13-model-catalog-policy.md)，不在此再决定模型名单。

## Decision

确认扩展拥有宿主专属实现、shared logic 拥有复用业务及纯展示逻辑；当前查看 Session 与有效 State 标记投影属于 framework 公共能力、原生映射属于 adapter。完整装配与原生路线仍未决，源票保持 open。

## User stories

1. As a 维护者, I want 宿主专属实现与共享业务分离, so that 宿主改动集中在桥接与专属实现而不牵动整个扩展。
2. As a 用户, I want 通用当前查看会话事实与有效激活标记, so that 在 Hub 查看子代理时不会看到主会话的 Effort／上下文或错误的扩展开关。
3. As a 扩展作者, I want framework 能力通过公共接口取得, so that shared logic 不直接依赖原生 context 或各自重写焦点与 State 规则。

## Preconditions

- [观察契约](03-observation-contract.md)提供逐实际 Session 身份与必要模型／上下文事实；已批准不等于已实现。
- [展示权威](08-presentation.md)定义 widget 数据范围与主／子视图；framework 不复制业务统计。
- 现有 State 继承、Marker area 和 [ADR-0002](../../../docs/adr/0002-semantic-extension-framework.md)约束 owner、native seam 和框架依赖方向。
- 当前 OMP 的可靠公开出口、版本支持、焦点信号与 marker 重绘还需本票具体核验。

## Postconditions

- 后续装配在此职责层内设计，不抽通用复杂 widget、不把计价移入 framework，不创建第二套 native seam。
- 不把“当前查看会话”当命令执行会话或记账所属会话；焦点切换不重置业务状态。
- 源票的正文、status、assignee 与其他未决范围不变；部分确认只在此 authority。

## Invariants

- 遵守 ADR-0002 responsibility test：native access 仅 framework/adapters 与 extension harnesses；framework 不依赖具体扩展业务。
- State 与 Marker area 复用原 Owner／follow／none 语义，查看投影不授予写权限或触发 connect-bot 等 owner 外部效果。
- 组件实现差异不自动决定语义归属；可统一的 framework 语义不复制到每个 adapter／extension。
- 18.9.2 隔离探针不改变已声明 18.5.0 基线，不认证 pi，不实施生产能力。
