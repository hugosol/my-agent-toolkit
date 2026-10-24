# 能力接口架构（framework 维护者指南）

**状态：** Session、State、Prompt/Marker、Feedback、Provider、Subagent、根 authoring 契约、Command 与 General 均已实现；2026-10-19 的 full-capability cutover 完成了非增量的接口切换。2026-10-20 的可检查 authoring/assembly 与源码推导接入分析已落地。本文记录当前方向、维护原则和仍有意的未决项，不逐文件报告完成度。

**范围：** `framework/`、`adapters/`、`extensions/` 之间的依赖 seam、capability 深度、单一路运行时规划与可检查性。

**决策状态：** ADR-0002 的 Session 修正接受第一个完整 capability，Command 修正接受下一个，[full-capability cutover 修正](../../docs/adr/0002-semantic-extension-framework.md#full-capability-interface-cutover-2026-10-19)记录已完成的切换。本文描述的是已实现方向；§9 保留仍未决定的事项和被明确否决的候选。

## 0. 读者与文档边界

| 读者 | 要回答的问题 | 先读 |
| --- | --- | --- |
| framework 维护者 | 改动应放在哪一层？interface 是否仍然足够深？运行时是否只有一条规划与派发路径？静态检查能证明什么？ | 本文；具体符号查[能力索引](framework-capabilities.md) |
| extension 开发者 | 扩展能看见什么、能依赖什么、业务应放在哪里？ | [extension 开发地图](extension-development-map.md)；[能力索引](framework-capabilities.md) |
| adapter 开发者 | native 行为怎样满足公共语义、何时可以映射或声明不可用？ | [harness 接入指南](harness-integration.md)；[`runtime/port.ts`](../runtime/port.ts) |

本文拥有：分层与依赖规则、interface 深度判断、单一运行时与集成规划、静态可检查性的边界、变化时的维护闭环、架构理由与历史。

本文不拥有：

- 每个符号、参数和源码位置的完整索引 → [framework-capabilities.md](framework-capabilities.md)；
- 静态接入检查的命令、选项、结果状态与修复循环 → [integration-check.md](integration-check.md) 与 [static-authoring-check.md](static-authoring-check.md)；
- harness 版本支持记录、四态判定与升级流程 → [harness-support.md](harness-support.md#version-verification)；
- extension 内部的 business/foundation/presentation 分层 → [capability-layering.md](capability-layering.md)。

同一主题只保留一个权威副本。本文引用这些文档，不复制它们的操作说明。

## 1. 目标

framework 是一份共享源码，被多个 harness 复用。架构要同时成立三件事：

- extension 开发者看到一个小而稳定的 capability 接口，不需要理解 framework 内部或 native harness API；
- adapter 开发者看到 framework 定义的一个 port，native 翻译留在 adapter 树内；
- framework 维护者看到深 module 及它们的组合，extension 业务逻辑不泄漏进 framework。

```text
native harness
      │  native API
      ▼
adapters/<harness>/native + thirdParty/mixture（仅有实际职责时）→ port.ts
      │  框架语义事实与效果
      │  (HarnessPort)
      ▼
framework/runtime + 内部深 module
      │  capability interface
      ▼
framework/interface
      │
      ▼
extension
```

语义只向下流动。任何一层都不能反向穿透：

- framework 不得 import extension 代码；
- framework 不得命名 native harness package；
- extension 不得 import framework runtime 或内部 module；
- adapter 不得 import extension 业务代码。

每一层只知道上一层交给它的语义，并向下一层提供更小的接口。

## 2. 原则

### 2.1 能力优先，不是目录镜像

第一等单元是 **capability**：framework 定义并提供给 extension 的东西，或 extension 通过 framework 定义的表面积贡献的东西。

capability 不是 adapter domain 的目录镜像。adapter domain 是按 native 映射形成的导航分组；一个 framework capability 可以接收多个 adapter domain 的事实，一个 adapter domain 也可以服务多个 capability。capability 清单由 extension 实际消费的东西推导，不按当前文件布局推导。

### 2.2 interface 是 extension 的整个世界

`framework/interface/` 是唯一面向 extension 的 framework 层。extension 源码只读/import 这一层、选定的 adapter assembly entry，以及自己的文件。

interface 是 extension-facing 类型的 canonical 来源，不是内部 module 的 re-export barrel。运行时值只限于少数必须可调用的入口（`defineExtension`、`defineImplementation`、`request`、`updateFile`、`getConfig`、`reportDiagnostic`）及其错误类；实现仍在 interface 后面。`general/http.ts`、`general/files.ts`、`general/config.ts`、`general/diagnostics.ts` 是四个直接入口，没有聚合的 `general/index.ts`。

### 2.3 复杂度藏在 interface 后面

一个 capability interface 隐藏一个深实现。extension 不需要知道哪个内部 module 实现它、身份怎样生成、读数怎样去重、transport 怎样选择、capability 在 session 边界怎样协调。

内部 module 可以小、可单独测试、可独立替换；它们是 capability 的实现细节，不是额外的 extension-facing capability。

**deletion test：** 删除一个 module 后，完整职责的复杂度会散回多个调用者，才说明它有深度；如果只是把同一份转发搬来搬去，就不值得保留。interface 是 test surface，测试优先穿过 interface 和 port double，而不是为每个内部文件造镜像测试。

### 2.4 adapter 已经翻译，framework 不再抽象一次

`adapters/<harness>/native/` 以及实际需要的 `thirdParty/`、`mixture/` 把各自来源的事实和效果翻译成 framework 语义事实和效果；顶层私有 `port.ts` 只绑定映射，公共 `index.ts` 保留原 assembly 用法。来源方向和完整协议划分见[接入指南](harness-integration.md#4-按实际来源组织-adapter)，实际路径见[adapter 导航](framework-capabilities.md#adapter-implementation-navigation)。等 framework runtime 收到它们时，已经是框架形状：`SessionDelivery`、`RoundObservation`、`TurnSignal`、`ProviderAccess`、`CatalogPriceSource`、`ViewedSessionPort`、`SubagentIntegration` 等。

`HarnessPort` 是 adapter 实现的 framework 定义 port，不是第二层翻译。另加一个 `framework/adapter.ts` 抽象只会把类型搬到另一个路径，不会减少 adapter 工作、增加 extension leverage 或集中复杂度。它过不了 deletion test。

adapter seam 因此保持小而内部：framework runtime 里一个 port module，由每个 adapter 实现，只被 adapter 和 framework-runtime 代码 import。

### 2.5 不需要第二个 adapter 层

`adapters/<harness>` 就是 adapter。它在 adapter seam 上满足 `HarnessPort`；`HarnessPort` 是 interface，不是另一个 adapter。

独立的顶层 adapter 抽象会：

- 不改变 port 的宽度或 adapter 的翻译工作；
- 不增加新 capability，也不加深已有 capability；
- 造出第二条需要维护和文档化的 adapter 路径；
- 暗示 framework 翻译了两次 native 语义，而 adapter 已经翻译过。

如果未来 port 对真实消费者太宽，正确方向是在现有 seam 上按 capability 拆分，而不是在它上面再加一层。这个决定仍开放。

## 3. 分层与依赖规则

| 层 | 拥有 | 不拥有 |
| --- | --- | --- |
| `framework/interface/` | 已封装 capability 的 canonical extension-facing 契约；根 authoring 入口与公开 `details/` | 内部引擎、adapter 代码、extension 业务 |
| `framework/runtime/port.ts` | 唯一的 framework/adapter 内部 port 及框架形状的交付/观察事实 | extension-facing capability 声明（引用 interface，不重述） |
| `framework/core/` | 尚属内部的契约与宿主无关语义 implementation | native API、adapter 装配 |
| `framework/behaviors/` | 基于公共契约实现的可复用行为：绑定、组装、生命周期、派发、集成规划 | 具体 extension 业务 |
| `framework/modules/` | 不依赖宿主与具体 extension 的通用基础能力（HTTP、文件协调、local access） | 某个 extension 的协议或策略 |
| `adapters/<harness>/` | native 事实、触发位置与能力到框架契约的映射 | extension 业务、framework 综合规则 |
| `extensions/<id>/harnesses/` | 本 extension 的宿主专属实现与薄装配 | 公共框架映射、其他 extension 的业务 |
| discovery entrypoint | 供宿主发现并导出对应 extension 装配 | 业务、装配过程 |

依赖规则由 [`tests/framework/import-boundary.test.ts`](../../tests/framework/import-boundary.test.ts) 保护：

| 来源 | 可以 import | 不得 import |
| --- | --- | --- |
| `extensions/**/shared-logic/**`、extension `definition.ts` | `framework/interface`、extension 本地文件 | `framework/runtime`、`framework/core`、`framework/behaviors`、`framework/modules`、adapter 内部 |
| `extensions/**/harnesses/**` | `framework/interface`、`adapters/<harness>` assembly entry、native escape hatch | 其他 framework 内部、其他 extension 业务 |
| `adapters/**` | native harness package、`framework/interface` 交付事实、`framework/runtime/port` | extension 业务代码 |
| `framework/runtime/**`、`framework/core/**`、`framework/behaviors/**`、`framework/modules/**` | `framework/interface`、`framework/runtime`、framework 内部 module | adapter、extension 代码 |
| `framework/interface/**` | interface 本地文件；`request` / `updateFile` / `getConfig` / `reportDiagnostic` 的小型 runtime entry | 内部引擎、adapter 代码、extension 代码 |

`framework/interface` 的 runtime re-export 是**有意的例外**：capability 入口是公开的，实现留在 interface 后面。它应当是 thin re-export，不是第二个实现。每条例外只允许精确的入口文件与 specifier；例如 `general/diagnostics.ts` → `../../core/diagnostics` 不允许其他入口或整个 core 树越界。

依赖边界测试是这套架构的升级告警。没有它，`framework/interface` 只是约定，extension 代码会继续 import 内部 module。

## 4. capability interface 的深度

### 4.1 capability 清单

| Capability | extension 看到 | 隐藏的实现 | adapter 来源 |
| --- | --- | --- | --- |
| **State** | 声明轴、owner reference、declared-value seam、retained capability | store、cells、owner lives、persistence、followed-owner read、访问寿命 | session 边界与 subagent 关系 |
| **Session** | `SessionCapability`、`SessionObservationReader`、confirmed-write、Session/Round/Turn/Activity/Context/Input/Commit/Unobserved 事件、disposal | session 身份、Round 综合、Turn 关联/去重、activity 推导、context 收集、订阅派发、观察来源、跨进程访问、close-out | Session、Context、Subagent 领域 |
| **Command** | command 声明、invocation 事实、action delivery、directed implementation | toggle/directed/actions 路由、State transition、feedback | Control 领域 |
| **Prompt** | prompt 声明与 strategy | run 事实、contribution 结果、选择规则、branch-progress 匹配 | Prompt 领域 |
| **Marker** | marker 声明文本 | marker area transport、进程级 area、行序、viewed-session 投影、发布触发 | Marker 领域 |
| **Feedback** | notification level 与 feedback transport | delivery wiring；没有独立 behaviour module | Feedback 领域 |
| **Provider** | provider access、catalog price、provider HTTP 事实 | factory hand-over 与 adapter 查询映射；没有 framework 策略 | Provider 领域 |
| **Subagent** | 初始化后稳定的接入结果（`subagents` / `none` / `failed`）与需求词汇 | 执行模式、adapter 覆盖清单、provider 协议与注册 | Subagent 领域 |
| **General**（导航分组，不是 adapter-backed capability） | `request`、`updateFile`、`getConfig`、`reportDiagnostic` 及其选项/错误类型 | HTTP transport、协调文件更新、配置文档读取、非模型诊断输出 | 无 |

根 `index.ts` 与公开 `details/` 是 authoring 层，不是 capability 本身；它们描述 extension 如何声明 capability 并提供 implementation，并组合 capability 声明而不重新发布它们。具体符号和源码位置只查[能力索引](framework-capabilities.md)。

### 4.2 Session 是一个 capability，不是一个 module

Session 是深 capability。extension 只看到：

- 一个读取实际 session 当前 observation 的读表面积；
- 一个承载 session-scoped 事件种类的订阅表面积；
- 现有的 session-end 与 Round close-out 契约；adapter 的 disposal 事实不是新的 extension 事件。

Round、Turn、Activity、Context、Input、Commit、Unobserved 的事实与交付是 `session/details/` 下的公共领域契约，经 Session 入口导出；它们的处理、观察来源、访问与 close-out 协调是 interface 后面的实现 module。这些内部 module 在规则、寿命和测试不同时继续分开，extension 不 import 它们。

这与 State 形状一致：extension 看到 declared-value seam 和 retained capability；`StateStore`、owner lives、persistence、followed-owner read、access 都藏在后面。

### 4.3 不应出现在 `framework/interface` 的东西

以下是实现或 adapter-facing 类型，MUST NOT 从 `framework/interface` 导出：

- `HarnessPort`、`RoundObservation`、`TurnSignal`、`TurnSignalFacts`；
- `SessionObservationAccess`、`SessionObservationSink`、`ObservationSource`；
- `BindingResult`、`BindingFailure`、`describeBindingFailure`；
- `StateStore`、具体 `SessionObservations` 类、`SubagentAccess`、`FollowedOwners`；
- `LocalAccess*`、`OwnerAccess*`；
- `ConfigSource`、`ConfigReader`、`readConfig`、`readConfigDocument`；
- 内部 guard、closed set 和 validation helper。

它们的缺席是 interface 的一部分。extension 如果需要其中某一个，要么是在使用一个应被有意提升的内部 seam，要么是越过了它真正需要的 capability。

### 4.4 目录是导航，边界是 capability

`framework/interface/` 按 capability 组织，不按当前 `core` / `behaviors` / `modules` 实现桶组织。目录名是导航；capability 边界才是重要的。一个 capability 可以移动到另一个文件或目录，而不改变 extension 知道的东西。不要求每个 capability 一个目录；一个文件或几个 module 都可以，取决于真实实现。

## 5. 单一运行时与集成规划

### 5.1 一个 port，一条装配路径

framework runtime 只拥有一个 adapter-facing port module：

```text
framework/runtime/
  port.ts          # HarnessPort 与 adapter-facing framework facts
framework/
  core/            # 宿主无关契约与引擎
  behaviors/       # binding、assembly、lifecycle、dispatch、capability behaviors
```

port 是一个 module，不是 runtime 目录树。组合留在真实职责所在处：`behaviors/binding.ts` 把 definition 接到 port，`behaviors/assembly.ts` 拥有每个 assembly 的 State store、observation source 与 implementation 复用，`behaviors/lifecycle.ts` 拥有一次性初始化与清理。没有再拆出 `runtime/binding`、`runtime/assembly`、`runtime/lifecycle`；那只是搬名字，不改变 adapter seam。

同一个 assembly 只有一个 State store、一个 observation source 和一次 implementation 复用寿命：第一个足够远的 binding 调用 `create` 后，后续 binding 复用这个业务实例；一次 `cleanup` 会消耗它，下一次 binding 才重建，而不是把已关闭的资源交给以为自己在重新开始的 extension。新 session、subagent 或 view change 都不制造第二个业务实例。

`port.ts` 只放框架形状的事实，不放 native 类型：

- `HarnessPort`；
- adapter-to-framework 观察，例如 `RoundObservation`、`TurnSignal`；
- 跨进程 observation access，例如 `SessionObservationAccess`、`SessionObservationSink`；
- binding 结果，例如 `BindingResult`、`BindingFailure`。

adapter import：

- `framework/interface/`，用于构造语义交付事实；
- `framework/runtime/port`，用于实现 port；
- adapter escape hatch 内的 native harness package。

extension 完全不 import `framework/runtime`。

### 5.2 规划只有一个来源

[`behaviors/integration-plan.ts`](../behaviors/integration-plan.ts) 拥有纯选择规则。`planIntegration(usage)` 接收声明的结构事实，返回 binding 需要选择的 axis、port obligation 与原因。它不读 definition、不调用 factory、不执行 handler、不命名 native API。

当前分组规则由这个纯 module 定义，runtime binding 和离线分析器消费同一份结果：

- **session** 无条件存在：每个 binding 都要记录实际 session，并在边界应用框架 State 行为；
- **round machinery** 由 Round 事件、Turn 事件、activity 读数或 context 读数选择。Turn 属于 Round，activity 是同一簿记留下的 transition，context 在当前 binding 中属于同一块；
- **context 收集、Turn hook、input hook** 只由各自的 kind 选择；
- **run initiation** 由 contribution slot、marker 或 lifecycle slot 选择，因为请求要等初始化，marker 也要在那里重新声明；
- **viewed-session 订阅**只有 marker 需要，并且仍受 adapter 可选出口约束；
- **disposal 与跨进程 observation access** 是 `when-available`，不是每个 adapter 都必须满足的 required requirement。

规划描述当前 usage 对框架的要求，不决定 harness 是否提供。可选成员缺席是要报告的事实，不是 binding 拒绝理由。

### 5.3 可检查的 adapter 装配（2026-10-20）

单一 `HarnessPort` 仍是 seam；[`runtime/adapter-authoring.ts`](../runtime/adapter-authoring.ts) 增加的是内部构造约定，不是第二套翻译 interface。每个 adapter 的模块级 `OMP_PORT` / `PI_PORT` 用 `defineAdapterPort<Context>` 定义，完整键集合覆盖每个 port 成员：

- 必需成员提供 factory；
- 可选成员提供 factory（可以为 assembly-disabled 路径返回 `undefined`），或用 `unavailablePortMember(reason)` 明确记录不可用；
- factory 是真实运行时装配来源，暴露为 `bindings`，只由 `.create(context)` 按 native binding 求值；
- 不引入并行的 capability manifest 或全局 registry。

native 翻译与生命周期仍属于现有 domain module。`defineAdapterDelivery(kind, payload)` 标记最终协议 payload 的构造点，包括内嵌效果和晚查询；它使用已有 canonical 类型，不改变 payload 身份或回调时序。领域分组是语义分组，不按 event/query/effect 的交互模式拆目录。

编译器检查完整装配键集合与契约类型；后续 supply analyzer 检查有界静态装配与 delivery 构造。任意动态结构是 unresolved，handler 行为或语义正确性不被证明。extension-only 的 `check:authoring` 不得被说成 adapter 验证。显式缺失描述当前 adapter 供给，不证明 native harness 不可用。运行时加载、可选 fallback 和独立行为验证不变。实现与执行证据见[重构摘要](integration-contract-refactor.md#35-adapter-侧可检查组装后续已完成)。

## 6. 可检查性

### 6.1 三种证据层级

| 证据层级 | 含义 | 由谁提供 | 离线可算？ |
| --- | --- | --- | --- |
| **Declared** | extension 的 authoring 声明了哪些能力需求；adapter 的 assembly 声明了哪些 port 供给 | extension/adapter 作者 | 否，这是意图 |
| **Structural** | 源码中存在使用或装配的证据；工具从静态结构推导需求与供给 | 工具从源码结构推导 | 大部分可以 |
| **Verified** | 行为测试或 harness dock 证明能力工作 | 独立行为验证 | 否，行为不能从声明推出 |

静态诊断可以比较 **declared** 与 **structural**，但 MUST NOT 把 structural 当成行为证明。**Verified** 独立填写，或者留作 `unverified`。

### 6.2 authoring 的可检查性

assembly 提供 `defineImplementation({ create, subscriptions, commands, initialize, cleanup, catalog })`（或返回该 authored value 的共享 helper），不是裸 `factory`。事件 handler 接收 `(state, delivery)`；lifecycle 和 command handler 同样接收懒创建的业务 state。authored value 的 `.declaration` 暴露 materialization 使用的同一结构，且不调用 `create`。这是唯一 requirement inventory，没有平行需求列表。

当 assembly 擦除 business-state 类型时，私有类型 brand 仍是必需的。resolved implementation 及其 resolver 是内部 runtime 契约，不是根 authoring 导出。

静态源码限制由独立的 `check:authoring` linter 执行，并纳入开发 `typecheck`。它解析 canonical authoring symbol 和有界静态组合，不执行 extension 代码，报告紧凑源码诊断，并提供可阅读的完整规则目录。可静态解析的 computed key 和 spread 被允许；动态或无法解析的集成结构被诊断。业务 handler 体不在表达式规则内。用法与规则见[静态表达检查指南](static-authoring-check.md)。

### 6.3 port 与 delivery 的可检查性

- `defineAdapterPort` 让模块级装配的完整键集合和 factory 结果受 TypeScript 检查；构造定义不执行 native factory。
- `unavailablePortMember(reason)` 把缺失变成显式的、可分析的事实，而不是条件缺键。
- `defineAdapterDelivery` 把最终 payload 构造点标出来，让分析器能在有界静态结构中找到它；不改变运行时语义。
- 分析器只处理受支持的静态范围；无法解析的路径是 unresolved，不能静默算 clean。

### 6.4 integration check 的边界

`check:integrations` 从 extension 的调用、声明、订阅和读取开始，展开 framework-owned 的语义依赖规则，得到最小 integration contract 及 `HarnessPort` obligation，再追踪目标 adapter 的实现与装配接线。它不能给出：handler 行为、native 语义正确性、运行时配置是否满足，或版本支持。

直接 call graph 不够：一次读取可能依赖较早通过 observation source 提供的事实，framework 综合也可能需要多个 port 操作。可靠提取的关系来自代码；仅凭源码调用无法表达的语义依赖由维护者显式定义。条件路径贡献可能依赖，而不依赖某个 live 用户配置。

需求如何推导、供给如何判定、状态名称与完成判定、生成器边界、命令/退出码和结果限制，只在[静态接入检查](integration-check.md)维护：见[需求分析](integration-check.md#demand-analysis)、[供给分析](integration-check.md#supply-analysis)、[供给状态](integration-check.md#supply-statuses)和[结果限制](integration-check.md#limits)。实现所有权在 `scripts/integrations/`：source demand、supply 与 generation；static authoring resolver 被复用，runtime 选择规则仍在 framework planner。**结构完整性不等于语义正确性。**

### 6.5 为什么 interface 让结构证据可靠

- extension import capability-specific 路径，例如 `framework/interface/session`、`framework/interface/command`、`framework/interface/marker`；
- Session 事件 kind 的 import 能区分 Turn、Round、Activity、Context、Commit、Unobserved 的使用；
- implementation context 保留 `context.session` 作为 capability object，并把验证后的 `config`、`modelPrices`、`providerAccess` 作为各自命名的扁平事实传入；按 capability 分组的 `context.provider` / `context.config` 被考虑过但未采纳，因为它会破坏每个 extension factory，却没有隐藏任何东西；
- adapter domain 与 `framework/runtime/port.ts` 在 supply 侧使用同一 capability 词汇。

因此证据模型使用与 interface inventory 相同的 capability 名称。它是 interface 上的工具层，不是 runtime capability registry，不引入运行时协商、启动门禁或第二套 dispatcher。

### 6.6 各类检查的分工

| 检查 | 回答 | 不回答 |
| --- | --- | --- |
| `typecheck` | 类型、完整 assembly 键集合、factory/delivery 契约 | 运行时接线、语义 |
| `check:authoring` | extension authoring 是否在受支持的静态表达内 | adapter supply、行为 |
| `check:integrations` | 源码推导的 demand 与目标 adapter 静态 supply 的结构关系 | 语义、版本、运行时 |
| 行为测试 / dock | 特定组合、特定场景下行为成立 | 其他版本/路径自动成立 |
| 支持记录 | 维护者基于证据选择的受支持组合 | 静态检查或单次运行自动升级 |

这些结论不能互相替代。一次静态通过不能写成“已接齐语义”；一次 smoke 不能写成“版本受支持”。完整命令分工和输出语义见[检查分工](integration-check.md#check-division)。

## 7. 变化时的维护闭环

### 7.1 修改 capability interface

按顺序检查：

1. 变更是否真的属于 extension-facing 语义；如果只是实现细节，留在 interface 后面。
2. canonical 声明是否只在一个入口拥有；不要新增兼容 re-export 或 forwarding shell。
3. 内部 module 是否从 interface import 类型，而不是反向定义。
4. binding、assembly、lifecycle 与 `integration-plan.ts` 是否需要同步；选择规则是否仍只有一个来源。
5. adapter 的 port obligation 与 delivery 构造是否需要更新；不能只改类型让编译通过。
6. integration analyzer 的 framework-owned 规则是否需要更新；unresolved 不能算 clean。
7. 更新[能力索引](framework-capabilities.md)与受影响的 adapter；behavior tests 穿过 interface 和 port double。
8. 用 import-boundary test、typecheck、integration check 和行为测试验证；静态通过不替代行为验证。

### 7.2 修改 adapter 或 native 映射

按顺序检查：

1. 先重读框架语义承诺，不按 native 方法名推断。
2. 用实际源码、调用点、派发、teardown 比较触发、顺序、身份、数据、重复、寿命和失败。
3. 记录直接映射、接受差异或不可用的理由、条件和失效触发点。
4. 更新 domain 映射、port factory/delivery 标记和显式缺失。
5. 更新受影响的 integration rules 和 adapter 导航。
6. 运行静态检查，再运行针对该语义的行为场景。
7. 把未覆盖路径和证据限制写入记录；支持状态不由 adapter 作者单方面提升。

### 7.3 修改 harness 版本

版本问题不在本文件或 adapter 内解决。按[版本检查运行手册](harness-support.md#version-verification)执行候选验证，并按 [contract-driven agent pre-review](harness-support.md#contract-driven-agent-pre-review) 检查旧映射假设是否仍成立。

必须区分：

- 候选版本上的 framework 回归告警；
- extension 自身的行为回归；
- 结构上的 adapter supply 完整；
- 维护者显式替换支持记录。

四者是不同结论。支持记录的四态、条件、升级标准和隔离要求只由 [harness-support.md](harness-support.md) 拥有。

### 7.4 文档维护

| 主题 | 唯一权威 |
| --- | --- |
| extension 职责落点 | [extension-development-map.md](extension-development-map.md) |
| 公共符号与源码位置 | [framework-capabilities.md](framework-capabilities.md) |
| 架构原则、分层、深度、运行时规划 | 本文 |
| adapter 接入方法与语义比较 | [harness-integration.md](harness-integration.md) |
| 静态接入检查 | [integration-check.md](integration-check.md) |
| authoring 表达式规则 | [static-authoring-check.md](static-authoring-check.md) |
| harness 版本支持与升级 | [harness-support.md](harness-support.md) |
| extension 内部分层 | [capability-layering.md](capability-layering.md) |

文档变化与代码变化在同一次交付中完成。移动章节时，修复已知引用；如果无法保留稳定 anchor，在原位置留一个简洁跳转，不复制操作说明。

### 7.5 维护者审阅问题

在合并一项跨层改动前，先回答：

- 这项语义属于公共 capability、adapter 映射，还是某个 extension 的业务？如果只有具体业务能解释它，留在 extension。
- 是否新增了第二份定义、第二套 dispatch、runtime registry 或平行需求/供给清单？如果是，先证明现有 seam 为什么不够。
- interface 是否暴露了实现类型，或只是把内部 module 换个名字转发？用 deletion test 和“consumer 是否需要知道它”判断。
- 依赖方向是否仍然单向？framework 是否开始命名 native package 或 import extension？
- 新结构是否能被现有静态分析定位？不能定位的部分是否显式报告为 unresolved，而不是默认 clean？
- 行为验证是否独立于类型/结构检查？是否有人把一次通过写成版本支持或语义认证？
- 文档是否仍只有一个权威副本？移动的 anchor 是否已修复？

这些问题比“测试是否绿”更早暴露架构退化；测试通过只说明被覆盖的行为仍然成立。

## 8. 当前状态与历史

### 8.1 已完成的 cutover

`framework/interface/session` 拥有 canonical extension-facing 的 Session 事实、事件交付、Subscription group、observation reader 与 confirmed-write 契约。factory 提供 `context.session.observations` 与 `context.session.recordCommit`；旧的顶层 `sessionObservations` / `recordSessionCommit` 字段和公共具体类已移除。reader 是独立 runtime 对象，返回的读数不能写回来源。Session consumer 类型没有来自任何 mixed entry 或内部 `runtime/port.ts` 的兼容 re-export。

State 的 capability interface 拥有自己的声明（`StateDeclaration`、`StatePersistence`、`StateInheritance`）和 managed operations（`OwnerReference`、`DeclaredValueSeam`、`OwnerCapabilityHandle`）；definition entry 引用它们而不重新发布。Prompt/Marker 入口只拥有声明（`PromptDeclaration`、`PromptStrategy`、`MarkerDeclaration`）：run facts、contribution result、选择规则与统一 area 的 transport 保持内部，initialization/directed/action delivery 不再携带 marker transport。Feedback 与 Provider 的 leaf contract 位于 Session 旁边。根 authoring entry 拥有 `defineExtension`、`defineImplementation` 及完整的 definition/implementation contract；`SubagentIntegration`、`SubagentIntegrationFailure` 位于 `framework/interface/subagent.ts`；Command 的声明、实现与交付位于 `framework/interface/command/`。Command 的运行时交付只携带获批成员：adapter persistence callback、marker-area transport 和内部 invocation 对 extension 不可达。General 的 HTTP、safe-file、configuration 由三个直接入口发布。

唯一 adapter port 在 `framework/runtime/port.ts`，引用 canonical interface 声明而不重述它们；原 `core/protocol.ts` 已移除。import check 要求 `framework/` 下每个 extension import 都解析到 `framework/interface`，没有剩余例外列表。没有引入新的 disposal event、第二套 dispatch、runtime registry 或第二套 adapter abstraction。

### 8.2 可检查 authoring 与共享规划（2026-10-20）

<a id="inspectable-authoring-and-shared-planning-2026-10-20"></a>

`defineImplementation` 的 authored declaration 在 `create` 之前可检查，framework 因此可以在不执行 extension 代码的情况下选择 binding 需求。`behaviors/integration-plan.ts` 拥有 runtime binding 消费的纯选择规则，也向离线分析器暴露 port obligation 与 reasons。`runtime/adapter-authoring.ts` 增加可检查的模块级 port 与 delivery 构造约定，不改变 port 宽度或运行时语义。

静态限制由 `check:authoring` 执行；它只约束 extension authoring，不构成 adapter 验证。`check:integrations` 消费同一静态结构和共享规划做源码推导的依赖分析；`generate:integrations` 只创建缺失的 implementation 引用。二者都不增加运行时加载门禁；操作与结果解释见[静态接入检查](integration-check.md)。

### 8.3 源码推导依赖分析与生成（2026-10-20）

源码推导接入分析已实现：从 extension 调用、声明、订阅和读取推导 demand，与目标 adapter 的 assembly 和 delivery supply 比较，并区分明确缺失、显式不可用与无法解析。demand 可以在没有目标 adapter 或 discovery entry 时列出；直接 extension-to-harness 集成（例如 native widget）不在 inventory 内。

`HarnessPort` 仍是共同 adapter seam，extension consumer 继续使用 `framework/interface`。需求推导、供给状态、生成器边界和结果限制见[静态接入检查](integration-check.md#demand-analysis)、[供给分析](integration-check.md#supply-analysis)与[供给状态](integration-check.md#supply-statuses)。这是离线诊断，不是运行时门禁；结构完整性不等于语义正确性。

### 8.4 重构阶段

切换按阶段实现，每阶段都保持仓库 typecheck 和当时测试绿色：

1. **interface 成为 canonical：** extension-facing 类型迁入 `framework/interface/`；内部 module 从 interface import；adapter-facing 类型迁入 `framework/runtime/port.ts`；extension import 迁移到 interface 和 adapter assembly entry；import boundary 规则生效；旧 `framework/public.ts` 移除，无 alias/re-export/forwarding shell。
2. **runtime port：** `runtime/port.ts` 承载框架形状的 adapter 契约；引用 interface canonical 声明，不重述；adapter 从 runtime/port import，extension 不 import。
3. **Session 读表面积：** 只读；具体 observation source 与 mutation 方法保持内部。按 capability 分组整个 implementation context 被考虑但未采纳；`context.session` 保持 capability object，config/modelPrices/providerAccess 保持扁平命名。
4. **深 module：** State、Session 先落到 interface 后面；Round、Turn、Activity、Context、observation、access、disposal 保持内部 Session module；Command、Prompt、Marker、Feedback、Provider、General 跟上；composition 连接 capability 与 port，不拥有 capability 规则。
5. **文档与决策：** `framework/interface/README.md` 承载 capability-to-import map；README、framework-capabilities、extension-development-map 跟随实现；ADR-0002 修正记录接受方向和未采纳候选；旧公共路径与 extension import 例外移除。

完整证据与逐阶段记录见[接入契约重构摘要](integration-contract-refactor.md)。这些记录描述当时的源码和环境，不构成当前工作树的持续保证。

## 9. 未决方向与未采纳候选

以下不是本文件能单方面决定的政策。

### 9.1 未决事项

| 决定 | 当前建议 | 为什么仍开放 |
| --- | --- | --- |
| `HarnessPort` 粒度 | 暂时保持一个 port | 只有真实 adapter 或 test double 需要更窄 port 时，按 capability 拆分才有收益 |
| 内部布局 | 保持 `core` / `behaviors` / `modules` 在 `framework/interface` 后面；interface 稳定后再考虑按 capability 移动 | 接口稳定前的大目录移动只增加 churn，不改变 extension-facing seam |
| `BindingResult` / `BindingFailure` | 留在 `framework/runtime/port.ts` | 它们是 adapter factory 的结果，不是 extension capability 调用 |
| Session observation | 属于 Session capability，但读接口与事件订阅分开 | 读表面积和事件表面积共享 Session 身份，却是两种 interface |
| Coverage tools（已实现） | `check:integrations` 与 `generate:integrations` | source-derived demand、实际 assembly supply 和缺失 implementation 引用共享一个模型 |
| Structural extraction（已实现） | 复用受限 authoring resolver、canonical TypeScript symbols、framework rules 和有界 adapter traversal | 不执行 extension/adapter，不评估配置 |
| Diagnostic policy（已定） | required gaps 与 unresolved 返回非零；显式 optional absence 只报告 | 开发者输出不改变加载 |
| Verified status 来源 | 独立行为验证；绝不从 structural evidence 推断 | 行为正确性仍在 checker 之外 |
| Requirement inventories（已定） | 从实际源码推导；删除重复公共数组和手工 supply catalog | 语义依赖规则仍由 framework 拥有 |

### 9.2 考虑过但未采纳

| 候选 | 为什么不是当前政策 |
| --- | --- |
| 分离的公共 `definition/` 与 `assembly/` 目录层，或纯分类的 `extension.ts` 入口 | authoring contract 是一个根入口加公开 `details/` 文件。分离层重复同一批声明，增加浅 module，不改变 extension leverage。 |
| 按 capability 分组的 implementation context（`context.provider`、`context.config`） | 会为了分类破坏每个 extension factory。context 保持 `session` 加扁平的 `config`、`modelPrices`、`providerAccess`。 |
| General 作为 adapter-backed capability，或聚合 `general/index.ts` | General 是三个独立、宿主无关 module 的导航分组。每个有自己的直接入口；没有 registry、adapter 或聚合入口。 |
| delivery 上暴露公共 Marker transport，或 extension 级 marker-area 操作 | marker area 是进程级、framework-owned。delivery 不携带 transport；extension 只声明文本，并通过 managed State 影响显示。 |
| 在 `HarnessPort` 上再加一层 `framework/adapter.ts` | 不改变 port 宽度或翻译工作，只造第二条路径；见 §2.4。 |
| 运行时 capability registry 或启动时版本门禁 | 需求由源码推导，支持由证据记录和维护者决定；运行时加载不读取版本列表。 |

## 10. 非目标

- 不是 adapter domain 在 framework 目录中的镜像。
- 不是 `HarnessPort` 之上的第二套 adapter 抽象。
- 不是把 extension 业务逻辑搬进 framework。
- 不改变 harness 语义、受支持版本政策或验证范围。
- 不是独立 extension generator、runtime capability registry 或通用依赖注入容器。adapter tooling 只生成 required type/assembly 引用，不生成 native 实现。
- 不承诺每个 capability 一个目录；一个 capability 可以是一个文件或几个 module，取决于真实实现。

## 11. 成功标准

方向成立时：

- extension 开发者只读 `framework/interface/` 和选定的 adapter assembly entry 就能实现新 extension；
- adapter 开发者只读 `framework/runtime/port`、interface delivery facts 和 native harness 就能实现新 harness；
- framework 维护者修改深 module 不需要改变 extension import；
- import-boundary test 会在 extension import framework 内部、或 extension import adapter 代码时失败；
- 同一份 extension definition 和 shared logic 能在两个受支持 harness 上运行，不需要 framework 内部条件分支；
- harness-specific 代码留在 `adapters/<harness>` 与 `extensions/<id>/harnesses`，不进入 interface 或深 module；
- 静态检查、行为验证和版本支持三个结论各自独立，且都不能被另一个冒充。

## 12. 与现有决策的关系

- [ADR-0002](../../docs/adr/0002-semantic-extension-framework.md) 确立共享 framework 源码、adapter/native escape hatch 和按 capability-domain 组织 adapter。本文细化 extension-facing seam 与 adapter port 的位置，不改变 native 边界或所有权规则。
- [ADR-0003](../../docs/adr/0003-harness-terminology.md) 固定 harness 与 harness dock 的术语；本文沿用。
- [framework glossary](../GLOSSARY.md) 是 State、Session observation、Round、Turn、Owner、Local access、Marker area 等领域术语的权威。
- [capability-layering.md](capability-layering.md) 记录 model-cost 的 business/foundation/presentation 方向；那是 extension 侧分层，不复制进 framework capability interface。
- [extension-development-map.md](extension-development-map.md) 是职责落点导航；本文补充 extension-facing capability seam 与按角色的阅读地图。
- [harness-integration.md](harness-integration.md) 是 adapter 接入方法；本文不重复其 native 比较步骤。
- [integration-check.md](integration-check.md) 是静态接入检查的唯一操作权威；本文只保留其证据边界与架构意义。
