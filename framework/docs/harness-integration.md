# Harness 接入指南：从公共语义到 adapter

**读者：** 为 framework 新增或维护 `adapters/<harness>/` 的 adapter 开发者。

**这份文档回答：** 应该先读什么公共语义、怎样比较 native 行为、何时可以映射或必须声明不可用、adapter 怎样组织与装配、静态检查能证明什么、最后怎样用真实运行补齐语义验证。

**不负责：**

- extension 的职责划分与落点，见 [extension 开发地图](extension-development-map.md)；
- 公共符号、参数和源码索引，见[能力索引](framework-capabilities.md)；
- 静态接入检查的命令、选项与结果状态，见[静态接入检查](integration-check.md)；
- harness 版本是否受支持、支持记录与升级决定，见 [harness 支持基线](harness-support.md#version-verification)；
- 具体 native API 教程。native 源码与已安装产物才是 native 行为的事实来源。

**当前状态：** `omp` 与 `pi` 两个 adapter 已实现。本文描述接入方法与判断原则，不是版本支持声明，也不表示所有领域都已对每个 harness 提供。历史证据段落描述记录时点的范围；当前 adapter 的映射集合以源码和静态检查为准，不从历史段落外推。

**术语：** host program 是 **harness**，`adapters/<harness>` 是它在 framework 里的公共映射；驱动测试的装置是 **harness dock**，不是 harness。完整定义见 [ADR-0003](../../docs/adr/0003-harness-terminology.md)。

## 0. 工作顺序

```text
读公共语义
   ↓
比较 native 行为
   ↓
决定：直接映射 / 接受差异 / 声明不可用
   ↓
按实际来源组织 adapter
   ↓
装配 port 与 delivery
   ↓
静态检查（authoring / typecheck / integration check）
   ↓
真实运行验证
```

顺序不能倒过来。先从熟悉的 native 方法名出发，最容易把“方法仍存在”误当作“语义仍成立”。

## 1. 先读公共语义

先读 extension 实际消费的契约，再读 adapter 要实现的 port。至少读这几处：

| 要读 | 为什么 |
| --- | --- |
| [`framework/interface/README.md`](../interface/README.md) | 公共 capability 的边界、入口和阅读顺序 |
| 目标 capability 的 interface 入口，例如 [`session/index.ts`](../interface/session/index.ts) | extension 看到的事实、声明与交付；这些才是 adapter 要兑现的语义 |
| [`framework/runtime/port.ts`](../runtime/port.ts) 的 `HarnessPort` | adapter 唯一需要实现的框架侧契约 |
| [能力索引的 adapter 导航](framework-capabilities.md#adapter-implementation-navigation) | 每个能力领域当前由哪些源码承接；这里只引用，不复制全量路径 |
| [contract-driven agent pre-review](harness-support.md#contract-driven-agent-pre-review) | 版本升级时逐项核对语义假设的完整清单 |

读 `HarnessPort` 时不要只看签名。每个成员都要读出它的**交互协议**：

- 谁在什么时机调用；
- 是事实上报还是效果执行；
- 返回值由谁应用；
- 是否 await，await 覆盖到哪一步；
- 同一事实会不会重复到达；
- 身份、作用域和寿命属于谁；
- 失败、取消和关闭时还欠什么。

框架已经把综合规则放在 runtime/behaviors 中。例如 Round 的开合、Turn 的身份与去重、State 的持久化、implementation 的复用与清理，都不是 adapter 的职责。adapter 只提供 native 事实、执行 native 效果，并把它们翻译成框架语义。

### 1.1 先写“语义义务卡”，再看 native

在打开 native 源码前，先用几句话写下目标契约：

```text
契约：<capability / axis / delivery>
框架承诺：<触发条件、顺序、await、身份、数据含义、重复、寿命、失败>
adapter 义务：<必须上报的事实 / 必须执行的效果 / 可省略的出口>
不属于 adapter：<框架综合、业务策略、版本支持>
```

这张卡就是后面的比较基准。没有它，比较很容易退化成“native 里有没有同名事件”。

## 2. 比较 native 行为

### 2.1 事实来源

比较必须来自实际源码、调用点、派发路径和 teardown 路径，而不是 release notes 或方法名。需要检查 native 的：

- 事件触发点与覆盖路径；
- handler 是否被 await，结果由谁应用；
- 身份（session、parent、owner、进程）与作用域；
- 数据单位、时间基准、缺失值/未知值/零值的区别；
- 重复交付、重试、排队、自动继续；
- 注册/释放、dispose、资源所有权；
- 成功、取消、失败、中断后的最终事实。

把观察到的 source change 与推断出的 semantic risk 分开写。无法取得源码或无法检查的路径要标成 review limitation，不能补一个理由。

### 2.2 比较清单

对每个受影响的最小契约，逐项问：

| 维度 | 要回答的问题 |
| --- | --- |
| 触发与覆盖 | 事实在何时发出？哪些 native 路径会发出？旧路径是否被遗漏？ |
| 顺序、等待与结果 | handler 是否 await？前后各发生什么？谁应用结果？所需资源是否活到完成？ |
| 身份与作用域 | 实际 session、parent、Owner、进程拓扑是什么？是观察权限还是效果权限？ |
| 数据含义 | 测量基准、单位、时间戳、完整性、缺失/未知与已知零是否可分？ |
| 重复与继续 | 会不会重复交付、重试、排队、自动继续？去重依据是什么？ |
| 寿命 | 何时注册、何时释放？disposal、binding 替换、资源归谁？ |
| 失败与取消 | 错误怎样传播？成功、取消、终态失败、中断后各留下什么事实与清理？ |

### 2.3 语义对比记录模板

每个映射都留下可复核的记录：

```text
契约：<名称 / axis / delivery>
框架承诺：
  - 触发：...
  - 顺序与 await：...
  - 身份与作用域：...
  - 数据含义：...
  - 重复与继续：...
  - 寿命：...
  - 失败与取消：...
native 事实 / 机制：
  - <事件、查询或效果>，源码位置 ...
映射决定：直接映射 | 接受差异 | 不可用
接受差异（如有）：
  - 差异：...
  - 适用条件：...
  - 为什么仍满足承诺：...
  - 被否决的替代方案：...
  - 会使假设失效的变化：...
证据：
  - source review：...
  - 已执行行为：...
  - 未覆盖 / 未验证：...
```

最后两行很重要。静态可定位不等于语义正确；一次本地捕获也不等于真实服务接受。

### 2.4 例子：同名事件不等于同一语义

| 契约 | native 差异 | 接入结论 | 为什么 |
| --- | --- | --- | --- |
| Round 的 settle | `pi` 的 `agent_end` 在自动重试、compaction、排队输入等继续项被决定之前就触发；`agent_settled` 才表示 run 已完全静止。`omp` 的 `agent_end` 自带 `willContinue` 标志。 | `pi` 映射 `agent_start` + `message_end` + `agent_settled`；`omp` 映射 `agent_start` + `message_end` + `agent_end`，并传递 continuation 标志。 | 框架的 Round 结束条件由自己的静止检测与晚读决定。把 `pi` 的 `agent_end` 当结束会提前截断 Round。映射的是**run-cycle 的语义边界**，不是同名事件。 |
| Turn 的结束 | 两个 harness 都有 native `turn_end`，但它在请求的工具执行完之后才触发；框架的 Turn 在一次模型响应结算时结束。 | 映射 provider request、response boundary 与 finalized assistant message，不把 native `turn_end` 当作 Turn 结束。 | 工具执行在 Turn 之外。方法名相同，时间边界不同。 |
| 扩展标签 | `pi.setLabel` 标注的是 history entry，不是 extension；`omp` 的 native label 可用于扩展。 | `omp` 调 native；`pi` 把诊断前缀留在 adapter 自己的 binding 状态中，不误用无关的 native 操作。 | 找到“名字里带 label”的方法不是映射依据。 |
| session disposal | `pi` 的 `session_shutdown` 是可 await 的退出位置；`omp` 的 `session_shutdown` 已作为 `session_end` 上报，没有额外的可 await 退出点。 | `pi` 提供 `onDisposal`；`omp` 用 `unavailablePortMember(reason)` 静态声明不可用，Round 仍由它已经发布的 session 事实关闭。 | 不能为了“接齐”而发明一个不存在的关闭边；显式缺失是诚实的供给状态。 |
| usage 读数 | 两个 adapter 都观察到：provider 未上报 usage 时，message 仍可能带全零对象。 | 全零不能区分为“真实的零”时，不作为读数上报；只有非零读数才传递。 | 默认值与真实测量不可区分时，不能把它当成事实。 |
| 持久化注入角色的可见性 | 同一条隐藏持久化消息，在 `deepseek/openai-completions` 路径记录为 `user`，在 `openai-codex-responses` 的 shape-only 捕获中位于 `developer` input item。 | 按 provider path 记录，不把某个路径的角色当成跨 harness 的普遍保证。 | 这是已记录事实，不是激活条件或版本门禁；shape-only 捕获也不证明真实服务接受。 |

一个按模板填写的片段（pi 的 Round settle）：

```text
契约：Round 的结束候选（run-cycle settle）
框架承诺：
  - 触发：adapter 上报 activity_started / settled 的事实，由框架综合 Round 的开合；
  - 顺序与 await：settle 之后框架在宿主的下一个 task 上重新读取静止状态，不轮询；
  - 身份与作用域：事实属于该 binding 服务的实际 session；
  - 重复与继续：自动重试、compaction、排队输入等继续项仍属于同一 Round；
  - 失败与取消：cancelled / failed outcome 随 settle 上报，终态失败后清理归框架；
  - 寿命：Round 由框架关闭，adapter 不自行截断。
native 事实 / 机制：
  - pi 的 agent_start（activity 开始）；
  - message_end（只取最终 assistant message 的 outcome）；
  - agent_settled（pi 声明没有继续项，run 已静止）；
  - pi 的 agent_end 在继续项被决定之前触发，因此不使用它作为结束。
映射决定：接受差异（使用 agent_settled，而不是同名更早的 agent_end）
适用条件：pi 的 agent_settled 确实只在没有自动重试、compaction 或排队输入时触发；
  框架仍在自己的 nextTask 上做晚读确认，adapter 不把 native settle 直接当作 Round 结束。
为什么仍满足：框架要的是“是否还有继续项”的语义，而 agent_settled 正是 pi 对这件事的陈述；
  agent_end 的时间边界早于该陈述，会截断 Round。
被否决的替代方案：把 agent_end 映射为结束；或在 adapter 中模拟继续项检测。
失效触发：pi 改变 agent_settled 的触发条件，或在 settle 之后仍可能排入继续项。
证据：source review（adapters/pi/mixture/round.ts）；
  行为场景见 harness-support 的 pi 证据与 dock；本地捕获不证明真实 provider 路径。
未覆盖 / 未验证：其他 pi 版本、其他 provider、未执行的真实服务路径仍为 unverified。
```

这些例子的共同点：**先判断语义承诺是否被满足，再决定用哪个 native 事实。** 一个 native 事实可以服务多个框架能力；一个框架能力也可能需要多个 native 事实共同满足。

已知差异及其条件集中登记在 [Capability-difference register](harness-support.md#capability-difference-register)。本指南只示范判断方法；新增差异应先按本节模板记录，再决定是否进入登记表，不复制一份并行清单。

## 3. 决定：直接映射、接受差异、声明不可用

### 3.1 直接映射

只有当 native 行为的触发、顺序、身份、数据、重复、寿命和失败语义都能满足框架承诺时，才是直接映射。仍然要记录适用条件和证据；直接映射不是“无需解释”。

### 3.2 接受差异

以下情况可以接受差异：

- native 的表达方式不同，但在框架承诺的作用域内语义等价；
- 已知的近似不会破坏消费者依赖的边界，并且条件明确；
- 替代方案会引入第二套身份、第二套派发或无法维护的翻译层。

记录必须包括：差异是什么、在哪些条件下成立、被否决的替代方案、什么变化会让假设失效。不要让“当前没出问题”代替理由。

### 3.3 声明不可用

不可用不是失败，也不是伪造实现。按 port 成员的 required/optional 和框架规划处理：

- **可选出口**：用 `unavailablePortMember(reason)` 静态记录。构造时写明当前 adapter 的缺失原因，不写“native 永远做不到”。
- **必需事实缺失**：让 integration check 报出 missing，不要用空查询、全零读数、空字符串或 no-op handler 掩盖。
- **无法读取的单个事实**：在模型上下文之外报告一次诊断（stderr 或宿主 UI），并明确这是缺失，不是零值。
- **可选能力缺失**：`when-available` 的缺失是报告风险，不是绑定拒绝；不要把它升级成启动门禁。

显式缺失描述的是**当前 adapter 的供给**，不是 native harness 的能力上限，也不是版本支持结论。

## 4. 按实际来源组织 adapter

### 4.1 公共入口与私有 port 独立

```text
adapters/<harness>/
  index.ts      # 公共装配入口；消费方只 import 此入口
  port.ts       # 私有 per-binding HarnessPort 装配
  native/       # 宿主拥有的契约，包含实际使用的可选宿主补丁
  thirdParty/   # 仅在有职责时存在；Pi 的 pi-subagents 协议
  mixture/      # 仅在必须组合 native 与第三方事实／操作时存在
```

这是来源导航，不是每个 harness 的必备目录模板。OMP 只有 native，不为对称创建空来源分组。
笼统的 `internal/` 已移除；原生类型和加载支持归到描述的契约，Pi 的公共入口安装原生 Node
文本加载支持，extension 不 import 私有 loader。当前源码坐标的唯一完整导航在
[能力索引](framework-capabilities.md#adapter-implementation-navigation)；组织决定见
[ADR-0002](../../docs/adr/0002-semantic-extension-framework.md#source-aligned-adapter-organization-2026-10-24)。

### 4.2 先确定契约来源

判断协议由谁拥有，而非只看数据经过哪里：

- native：Pi session-manager 的会话文件 ancestry、State branch 读写、extension API 和 model registry；
  OMP 使用自身 extension、session manager、model registry 和 agent registry 契约。
- thirdParty：Pi 的 pi-subagents 注册、版本与身份、RPC、启动信息和后台 liveness 协议。
  它们使用 Pi event bus，并不会因此变成 Pi 原生协议；也不成为独立公共 adapter。
- mixture：Pi 的原生 session 转移与 child requirement、原生身份/startup 与 provider launch name、
  原生 settle/quiescence 与 provider-held work 的必要解释。多个 native 事件或复杂度本身不构成 mixture。
- OMP 的 Viewed-session 可选补丁属于 native variant；不把它称作第三方 provider，也不声称未补丁上游已提供。

来源名称只是实现组织，不增加业务术语。Session/Turn/Round、Context、Subagent、Provider、Control、
Prompt、Feedback、Marker 的框架语义归属不变，不按消费它们的 extension 复制公共映射。

### 4.3 按完整协议和生命周期划分

省略上游公共 package/source 前缀，保留能识别实际契约的坐标，但不机械逐文件镜像。
例如 UI 映射跟随 extension UI 契约，而非最终绘制它的 interactive-mode 实现。
State 的命名、branch 恢复和 append 放在一起；完整多事件生命周期不因单个 hook 拆散。
简单职责可保持单文件；没有职责的来源、空目录、只转发的兼容入口和无用的上游镜像都不创建。

- 事件 delivery 的 canonical 构造靠近映射，不留给 port 逐项拼装；
- 共享类型、诊断、状态和释放仍靠近其真实寿命拥有者，迁移目录不改变 binding 资源寿命。

### 4.4 来源之间的依赖

native 不依赖 pi-subagents 特定协议或 mixture；thirdParty 可以使用必要 Pi 原生契约，但不依赖
mixture。mixture 消费两方显式事实／操作，完成解释后才交给 `HarnessPort`；两方不反向依赖它。
port 只连接这些结果，不再解释跨来源语义；消费方不需要知道能力来源。

身份、当前读数、观察来源、Owner 关系、访问权限与资源释放都保留单一事实／寿命拥有者，
不在多个来源重复映射，也不在 port 组装处重新实现来源已经拥有的规则。
既有 import-boundary 检查保护来源方向与消费方公共入口，结构审查仍须对照实际协议，不能只看目录名。

### 4.5 装配保持薄

adapter 的公共入口创建 binding、把 port 交给框架，并导出 native loader 调用的 factory。它连接来源映射，但不解释跨来源协议或承载 extension 业务，不解释 extension 的业务数据，也不把完整 native context、registry 或第三方对象泄漏给 extension。

用 deletion test 检查每个新 module：删除它以后，完整职责的复杂度会散回多个调用者，才有存在的深度；否则只是一个浅转发层。

不要为了某个 harness 在 framework 内部增加 native 条件分支。映射、接受差异和显式不可用都留在 adapter；如果公共语义本身需要改变，按维护者的接口变更流程处理，而不是让一个 adapter 的特例泄漏进共享 module。

**Extension 的 presentation 不在公共 adapter 分类下。** 某个 extension 如何使用宿主 widget 绘制自己的界面，属于该 extension 的 harness 实现；框架的 Marker area、Feedback 等公共映射仍由 adapter 负责。

## 5. 装配 port 与 delivery

### 5.1 adapter 入口

以现有两个 adapter 为参照：

- [`adapters/omp/index.ts`](../../adapters/omp/index.ts) 的 `ompAdapter`；
- [`adapters/pi/index.ts`](../../adapters/pi/index.ts) 的 `piAdapter`。

两者都使用 `createAssemblyBinding`，各自创建一个 port，返回 native loader 调用的 factory。这个 factory 的每次调用服务一个 binding；框架负责 observation ownership、State store、implementation 复用与生命周期。adapter 不复制这些行为。

### 原生 runtime 重建不等于进程启动

宿主可能在同一进程的 Session 切换中销毁并重建 extension runtime。新的 binding 不应因此再次消费 auto 启动默认值。内部 `SessionDelivery.processStart` 由 adapter 在知道原生事实时提供：Pi 的 native `startup` 为 `true`，`new`／`resume`／`fork`／`reload` 为 `false`；持有跨 Session binding 的 adapter 可省略，保留首次 owner start 的规则。该事实只控制是否应用启动策略，不屏蔽已保存 State 的恢复，也不等同于工具注册或工具可用性。首次 CLI 启动并恢复原会话仍是进程启动，不可仅凭公共 `resume` 名称阻止其启动默认值。

### 5.2 port 是模块级、完整、惰性的

用 `defineAdapterPort<Context>` 定义模块级 `OMP_PORT` / `PI_PORT`。它有三个性质：

1. **完整键集合**：`HarnessPort` 的每个成员都要出现。必需成员给 factory；可选成员给 factory，或用 `unavailablePortMember(reason)` 明确声明不可用。不要靠条件展开让键时有时无。
2. **惰性**：构造定义时不执行 native factory；`.create(context)` 在每次 binding 时按需求值。
3. **唯一来源**：这个定义就是实际装配来源，不另写 capability manifest、requirement 数组或全局 registry。

适配器可以收窄暴露的 port 类型（例如 `pi` 对有无 subagent integration 的重载），但收窄的是类型证据，不是第二套运行时装配。

### 5.3 delivery 标记实际构造点

`defineAdapterDelivery(kind, payload)` 标在 native 事实被翻译成最终协议 payload 的位置，包括内嵌的效果和晚查询。它使用已有的 canonical 类型，不改变 payload 身份、求值时机或回调时序。它给静态分析一个可定位的构造点，不是第二套派发机制。

### SessionFacts 的单点字段映射

每个 adapter 在 Session queries 中定义一个模块级 `defineSessionFactsMapping<Input>({...})`，并由实际的会话事实构造函数调用它。对象必须显式列出 canonical `SessionFacts` 的全部字段；新增字段后，编译器要求每个 adapter 重新考虑其映射。

- 有原生读取的字段使用映射函数；函数本次返回 `undefined` 不改变“已映射”的接线状态。
- 明确未接入的可选字段使用 `unavailableFact(reason)`；运行时省略该字段，并把原因加入事实的 `unavailable`。
- `unavailable` 字段的函数保留本次位置解析等动态缺失，其他字段的读取也可向该列表追加原因。
- 这份对象是实际运行来源，不另写字段能力清单。字段检查只读取此处，不追踪映射函数体；映射正确性由 harness 接入者保证。

字段状态、源码定位与报告边界见 [SessionFacts 字段报告](integration-check.md#session-facts-field-report)。

### 5.4 extension 侧装配不携带 harness 词汇

`ExtensionAssembly` 只包含 `implementation` 和 `configBaseDir`。adapter 原样消费它；一个 assembly 不声明某个 harness，也不新增 “required semantics” 列表。需求由实际 authoring 与 interface 使用推导，见[静态接入检查](integration-check.md)。

`pi` 的 `childEntry` 等字段是 extension 自己的 harness assembly 对 adapter 的补充，不是 framework 的通用 assembly 词汇。新增 harness 时，先判断事实是否属于 extension 的宿主实现，不要把它塞进公共 `ExtensionAssembly`。具体 assembly 的输出凭据、overload 与 witness 规则见[assembly 输出契约](integration-check.md#assembly-output-contract)。

### 5.5 装配检查

写完 adapter 后至少确认：

- [ ] 每个 `HarnessPort` 成员都有 factory 或明确的 `unavailablePortMember(reason)`；
- [ ] 没有一个可选成员用假实现“看起来接齐”；
- [ ] 每个 factory 只依赖本次 binding 的 context，不共享跨 binding 的可变错误状态；
- [ ] delivery 在 native 构造点标记，port 不重新拼装业务 payload；
- [ ] 框架拥有的综合、去重、持久化、生命周期没有在 adapter 复制；
- [ ] 领域归属与[能力导航](framework-capabilities.md#adapter-implementation-navigation)一致。

## 6. 静态检查

静态检查按目的分开，不能互相冒充：

| 检查 | 证明什么 | 不证明什么 |
| --- | --- | --- |
| `typecheck` | 完整 assembly 键集合、factory 结果和 delivery 类型符合 `HarnessPort` | 运行时是否真的接上、语义是否正确 |
| `check:authoring` | extension authoring 使用受支持的静态表达 | adapter 已接齐，或业务行为正确 |
| `check:integrations` | 从源码推导的 demand 与目标 adapter 的静态 supply 对比；`provided` / `missing` / `unavailable` / `conditional` / `unresolved` 分开 | handler 行为、原生语义、版本支持 |
| 行为测试 / 真实运行 | 特定场景在特定组合下成立 | 其他版本、其他 provider、其他模式自动成立 |

使用顺序：

1. 先让 extension 的 authoring 通过它自己的静态规则；
2. 再让 `typecheck` 检查 adapter 的完整键集合与类型；
3. 再运行 `check:integrations` 比较 demand 与 supply；
4. 最后运行行为测试和真实 harness 场景。

命令、选项、退出码和结果解读只在[静态接入检查](integration-check.md#command-and-exit-codes)维护。`generate:integrations` 只补真实 assembly 引用，不生成 native 实现或假 stub。

**边界：**

- 静态分析是受限的、有界的；任意动态结构是 unresolved，不能算 clean；
- `unavailable` 是当前供给事实，不是 native 能力或版本结论；
- 结构完整不是行为证明，`provided` 也不是“语义已实现”；
- 检查失败不改变运行时加载；不要为了清零而删除必需功能、放 no-op 或用断言隐藏结构。

## 7. 真实运行验证

静态检查通过后，仍需验证 adapter 在真实宿主上的语义。验证对象是**场景**，不是方法名或文件清单。

### 7.1 最低场景集

- 真实 loader 发现并加载真实 extension entry，而不是直接 import adapter factory；
- 每个已映射的 axis 至少有一个成功场景，且覆盖它承诺的触发、顺序、身份和数据；
- 取消、失败、中断、session disposal 各有一个场景；
- 有跨进程或 subagent 模式时，分别验证，不从 in-process 结果外推；
- 可选出口缺失时，验证框架的 fallback 行为，而不是把它当失败；
- provider 路径单独记录；本地捕获只证明序列化，不证明真实服务接受；
- 需要人眼判断的 TUI/视觉项单独列为 human-only，不自动声称通过。

现有 `omp`/`pi` 的 smoke 和 dock 是参照，不是通用模板：它们证明了特定版本、特定 artifact、特定 provider 路径和特定场景下的行为。未覆盖的路径仍是 `unverified`。

### 7.2 证据记录

每个验证场景记录：

```text
source revision / clean tree:
harness package / exact artifact / version:
platform / runtime / Bun:
extension entry and adapter:
isolation: temporary agent state / session / cwd / capture
scenario and assertions:
executed command:
result (pass/fail/blocked, counts):
limits: local capture? shape-only? human-only? other provider paths?
```

不要只写“smoke passed”。没有版本、artifact、场景和限制的通过记录，不能用于维护者判断。

### 7.3 通过之后

- 一次通过是**告警或输入**，不是支持声明；
- 版本支持由 [harness-support.md](harness-support.md#version-verification) 的四态记录和显式维护者决定管理；候选验证使用哪些脚本、隔离条件与证据记录，也只在该[版本检查运行手册](harness-support.md#version-verification)维护；
- 新增或替换版本时，按 [contract-driven agent pre-review](harness-support.md#contract-driven-agent-pre-review) 检查旧映射假设是否仍成立；
- 真实运行、静态结构和版本支持是三个独立结论，不能互相替代。

## 8. 接入完成的标准

一个 adapter 接入可以被认为完成，需要同时满足：

- 每个目标契约都有语义对比记录，直接映射、接受差异和不可用三类决定都有理由；
- port 键集合完整，可选缺失显式，未用假实现填充；
- 领域归属符合能力导航，装配薄，没有复制框架综合规则；
- 在声明范围内 `typecheck` 与 `check:integrations` 没有未解释的 missing/unresolved；
- 真实运行场景覆盖承诺的 axis、失败/取消、生命周期和可用的跨进程模式；
- 未覆盖路径、本地捕获限制、human-only 项都记录为 `unverified`；
- 没有把静态通过或单次 smoke 写成版本支持或语义认证。

常见错误：

| 错误 | 后果 |
| --- | --- |
| 按 native 方法名映射 | 同名事件的时间边界或数据含义不同，消费者收到错误事实 |
| 用 no-op、空查询或全零读数填补缺失 | 缺口变成静默错误，比显式缺失更难发现 |
| 在 adapter 复制 Round/Turn/State 规则 | 两套权威，行为随 adapter 漂移 |
| 按原生数据来源或第三方名称分领域 | 领域与扩展消费的能力脱节，路径难以导航 |
| 把 extension 业务或 presentation 放进公共 adapter | framework 依赖业务，跨 harness 复用失效 |
| 把 `check:integrations` 通过当作语义证明 | 结构完整掩盖行为错误 |
| 在 startup 增加版本门禁 | 支持是记录与决定，不是运行时列表 |

**一句话：先读公共语义，比较 native 的真实边界，明确映射或缺失，按能力领域组织薄装配，用静态检查找结构缺口，再用真实场景验证语义；任何一层通过都不能替代下一层。**
