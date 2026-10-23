# Pi adapter：按能力来源与原生结构组织的重构方案

Status: 讨论结论已整理；尚未实施重构

日期：2026-10-23

来源：Pi 源码专题第 12 课讨论，以及对本仓库 adapter、port 和静态接入检查实现的定向阅读。

本文用途：保存设计动机、已达成共识、目标结构、预期收益和验证要求，供后续设计细化与实施使用。本文不是已完成重构报告，不是完整代码审计，也不声明用户已经完成第 12 课。创建本文不改变现有实现或公共契约。

## 1. 核心结论

**framework 与 adapter 的统一收束已经发生在 `HarnessPort` / `PI_PORT`；adapter 的内部文件结构不必继续镜像 framework 的能力 domain。**

计划将 Pi adapter 改为：

1. 先按能力来源区分 Pi 核心与第三方 extension。
2. 在各来源内部，以相关原生源码结构、机制归属和执行接缝作为组织坐标。
3. 重新聚合完整的适配职责，而不是只给现有文件换目录。
4. 继续由 `PI_PORT` 汇总实际 bindings，供 framework 使用，也作为静态能力供给分析的核心入口。
5. 保留 extension 对统一原语的依赖，不把原生来源差异泄漏给 extension。

两个视角各司其职：

- **来源侧审查：** 原宿主提供了什么，adapter 保留、组合、转换、收窄或没有接入什么。
- **消费侧检查：** adapter 收束后的能力是否满足某个 extension 的 framework 契约需求。

目录对应提高语义审查的可追踪性；它本身不能证明原生语义正确。静态接入检查验证结构供给；它本身也不能证明映射语义正确。

## 2. 背景与问题

### 2.1 框架的产品目标

`my-agent-toolkit` 为 extension 提供统一的语义原语，通过 adapter 对接不同 harness。当前已有 Pi 与 oh-my-pi 两个 adapter。

用户明确的设计取舍是：优先维持公共原语在目标 harness 上的统一含义与插件可移植性，而不是暴露每个宿主的全部能力。

讨论中的假设例子：

- Harness A 的动作前 hook 会等待回调，并允许通过返回值否决动作。
- Harness B 的动作前 hook 只发出通知，不等待异步处理，也不处理否决结果。
- 若公共原语定义为动作前通知，A 的 adapter 可以不暴露否决权，并按原生协议放行，以兑现与 B 一致的公共承诺。

这是主动收窄能力，不是实现遗漏。共同能力也不是同名 API 的机械交集：只要多个原生机制可以组合出同一保证，就可能成为公共原语。

需要区分两件事：

- 随框架设计演进，显式修订原语并迁移调用者。
- 在既定原语下，根据当前宿主偷偷改变运行语义。

前者可以是合理演进；后者会破坏统一契约。已发布原语的保证若因新增较弱宿主而降低，属于需要显式处理的契约变更，不能通过 adapter 静默降级。

**与当前实现的区别：** 现有检查器仍支持 required / optional 契约，并且实际报告中存在允许缺失的可选项。上述通用性目标不等于当前所有 port 成员都已成为所有 harness 的必需能力。本次目录重构不负责删除可选机制，也不重新定义能力政策。

### 2.2 当前组织引发的疑问

用户观察到 adapter 按 domain 分类后，既有非常短的文件，也有数百行文件，担心文件边界来自分类模板，而不是来自完整职责。

这不是仅靠行数就能判定的缺陷。真正需要检查的是：

- 同一个原生机制的转换是否散落在多个 framework domain。
- 一个完整协议的读、写、命名和生命周期是否被人为拆开。
- 是否存在只为连接这些拆分而公开的 helper、类型、转发或中间数据形状。
- 对照原生源码时，是否必须跨多个文件重新拼出执行顺序和不变量。
- Pi 核心能力与第三方 extension 能力是否因通用领域命名而混在一起。

现有架构文档本身已经说明 capability 不应是 adapter domain 的目录镜像。因此，本方案不是否定所有现有原则，而是检查实现组织是否真正体现了这些原则。

## 3. 关键概念与架构位置

这里只使用讨论所需的概念，不新增或替换仓库现有术语表。

| 概念 | 本次讨论中的含义 | 项目对应 |
| --- | --- | --- |
| Seam | 可以在不修改该处使用方的情况下替换行为的位置 | framework 与 harness 适配实现的交接位置，以及宿主提供的原生扩展接缝 |
| Interface | 双方需要遵守的完整契约，包括类型、时序、错误、身份与生命周期 | `HarnessPort` 及相关交付契约；面向 extension 的能力 interface 是另一层 |
| Adapter | 在该位置兑现 interface 的具体实现 | `adapters/pi/`、`adapters/omp/` |
| Port assembly | 将具体实现汇总到框架契约的实际组装 | `PI_PORT = defineAdapterPort<PiPortContext>(...)` |

将 Pi seam 放到 adapter 中的准确解释是：**adapter 的组织与表达以 Pi 原生接缝为坐标。接缝的实际执行权仍由 Pi 提供，并不是把 Pi 的内部机制复制进 adapter。**

依赖关系保持为：

```text
Extension
    │ 使用统一原语
framework/interface
    │
framework 共享行为
    │ 依赖统一契约
HarnessPort
    ▲
PI_PORT 实际组装
    ▲
按能力来源、原生机制组织的适配实现
    │
Pi 核心 / 第三方 extension
```

统一的是契约，不是目录形状。Pi 与 OMP adapter 可以有不同的内部布局。

## 4. 已达成的设计方向

### 4.1 以来源侧为 adapter 的主要组织轴

framework 继续按统一原语与公共能力组织；adapter 则优先按原生机制组织。

| 组织方式 | 优先回答的问题 |
| --- | --- |
| framework capability / domain | extension 能依赖什么？框架如何提供该能力？ |
| 原生源码与接缝归属 | Pi 的这项机制被如何接入？哪些原生保证发生了变化？ |
| `PI_PORT` | 这些原生适配最终兑现哪些统一能力？ |

不能把“按原生结构组织”误解为“每个 hook 单独一个文件”。多个事件共同构成一个原生生命周期时，可以留在同一个完整 module 中。

也不要求机械复制 Pi 整个目录树。只映射本 adapter 真正依赖的原生机制与源码归属；原生内部没有被适配的细节，不需要建立空目录或纯转发镜像。

### 4.2 Pi 核心与第三方 extension 分开

当前 adapter 不只对接 Pi 核心，还对接 `nicobailon/pi-subagents`。

| 来源 | 契约依据 | 主要变化来源 |
| --- | --- | --- |
| Pi 核心 | 原生扩展契约、会话机制、UI 等 | Pi 的版本与行为变化 |
| 第三方 extension | 提供者的注册接口、协议、启动信息、运行读数等 | 该 extension 的版本、安装与协议变化 |

第三方集成按具体提供者命名，例如 `pi-subagents`，而不是只叫 `subagent`。前者指出契约去哪里查，后者只描述大致功能。

需要分清：Pi 原生不提供、adapter 尚未接入、第三方未安装、具体 assembly 未启用，以及第三方协议失败。这些状态不能互相替代。

### 4.3 按事实来源分，不按 subagent 等功能词整体搬运

- 从 Pi session header、branch 读取原生事实，属于 Pi 核心适配。
- 读取 `pi-subagents` 专有启动标记、注册接口或消息协议，属于第三方集成。
- 需要两侧事实才能形成结果的逻辑，必须明确协调位置和输入，不得让两侧相互穿透内部实现。

例如，Round 观察消费第三方后台工作读数，不意味着整个 Round module 都属于第三方目录。它可以消费集成输出的明确读数，而不解析第三方协议。

### 4.4 重组职责，而不只是移动文件

允许现有文件边界消失；不要求保留现有拆分数量。

- 紧密维护同一个协议或不变量的逻辑，可以合并。
- 短小、独立的函数可以共存于同一 module，不必每个函数一个文件。
- 不同公开契约可以共享一个原生适配 module，不必因此合并其语义。
- 大 module 如果维护一个完整生命周期，不以行数为理由机械拆分。
- 纯转发、无额外语义的包装只在确认没有价值后移除；不能把有初始化、资源或生命周期职责的工厂当成多余包装。

## 5. 目标目录草案

以下是组织方向，不是已冻结的逐文件迁移清单，也不是对 Pi 原始目录的精确复刻：

```text
adapters/pi/
├─ index.ts
├─ internal/
│  └─ port.ts                 # PI_PORT 汇总与绑定支持
├─ native/                    # Pi 核心适配
│  └─ 按相关原生源码归属与机制组织
└─ integrations/              # 第三方 extension 适配
   └─ pi-subagents/
      └─ 注册、协议、读数、生命周期等
```

`native/`、`integrations/` 是建议名称；最终子目录和跨来源协调位置，需要在建立实际源码对应表后确定。

现有文档曾约束 adapter 根为 `index.ts`、`internal/`、`domain/` 三项。采用此草案意味着需要同步调整该布局约定及相关检查，不能只搬文件而保留旧说明。已经核查的静态接入分析器不依赖 `domain/` 路径；其他 authoring 检查、生成器、测试或脚本是否约束布局，仍须在实施前核实。

本次优先目标是 Pi adapter。OMP 可以保留原有布局，除非后续明确决定扩大范围；不为追求表面对称自动重构 OMP。

## 6. 已读代码中的候选与反例

以下仅是局部阅读得到的候选，不是完整审计或已验证的重构收益。

### 6.1 候选：持久化读写协议集中

现状：

- `domain/session/queries.ts` 定义 `piStateEntryType`，并读取和筛选 State 记录。
- `domain/session/effects.ts` 定义 `PiStatePersistence`，通过绑定 entry 类型后调用 `pi.appendEntry(...)` 写入。

两侧共同维护 entry 命名、写入与恢复协议。

**[推断]** 可评估将命名、读取和写入放进同一个原生持久化适配 module，减少跨文件理解和不必要的公开符号。但写入工厂绑定 extension 身份的作用仍需保留，不能简单删除。

### 6.2 候选：小型 UI 映射归并

现状：

- `domain/marker.ts` 主要将 Marker 输出映射到 `ctx.ui.setWidget(...)`。
- `domain/feedback.ts` 将两类通知映射到 `ctx.ui.notify(...)`，无 UI 时使用 stderr。

**[推断]** 这些函数可以在同一个 Pi UI 适配 module 中保持各自契约，而不必每种 framework 能力一个文件。

不得因合并而丢失 UI 缺失时的行为、widget 身份、清除规则、输出不进入模型上下文等现有语义。

### 6.3 反例：不能按事件名机械拆散上下文采集

`domain/context.ts` 在 `session_start`、`message_end`、`agent_settled` 三个原生时机执行同一种读数采集与交付。

如果强制拆成三个事件文件，会把同一采集职责再次拆散。按原生结构组织仍应保留这类完整适配职责。

### 6.4 反例：生命周期复杂度不会因移动目录消失

已读的 Round 适配涉及真正结束的原生事实、取消/失败结果、session 关闭后的查询约束，以及后台工作状态。

第三方集成涉及 provider 加载、注册、协议版本、身份和资源释放。

这些至少部分属于兑现语义所需的真实复杂度。重构可以改善局部性，但不能为了缩短代码删除必要判断，或把“未知”改成“成功/空闲/没有能力”。

## 7. `PI_PORT` 与 extension 依赖检查：当前实现核查

### 7.1 执行链

当前命令入口：`scripts/check-adapter-integrations.ts`。

```text
checkIntegrations()
    ├─ analyzeDemand(extension)
    │    从 extension 源码推导 framework 契约需求
    └─ analyzeSupply(adapter, contracts, assemblyFiles)
         读取实际 port 组装、可达交付构造、具体 assembly 输出凭据
    ↓
compareDemand()
    比较 required / optional 与供给状态
```

需求包含 `port:*`、`delivery:*` 和 `framework:*` 三类契约。

### 7.2 实际组装是供给来源，不是另一份手工清单

供给分析器识别 canonical `defineAdapterPort` 调用，读取实际 bindings。Pi 中该调用赋值给 `PI_PORT`。

分析器不依赖变量必须叫 `PI_PORT`；它依赖声明身份和可静态解析的组装结构。每个 adapter 应只有一个可识别的模块级 port 组装。

因此，`PI_PORT` 是供给分析的核心入口，而不是单独维护的能力目录。

### 7.3 不只检查成员名

分析器还会：

- 从绑定工厂沿 adapter 内可达调用关系寻找 canonical `defineAdapterDelivery(kind, payload)`。
- 检查所需 delivery 种类及 payload 字段结构。
- 对条件 port 成员，结合 extension 实际 assembly 调用的输出类型凭据进行收窄。

例如 `childEntry` 对 `subagentIntegration` 的影响不能仅通过通用 `PI_PORT` 判定；具体 assembly 也是证据的一部分。

### 7.4 目录改造与分析器兼容性的依据

已读的 `inspectAdapterSource` 从所选 `adapters/<name>/` 收集源码；`findDefinitions` 在这些文件中定位 `defineAdapterPort`；交付可达性分析追踪该 adapter 目录内的函数。

这部分分析不硬编码 `domain/session/` 等布局。

**[推断]** 保持代码位于 `adapters/pi/` 分析范围、更新所有引用并保留可解析组装形式，按原生结构重组应可继续使用现有接入检查。尚未实际移动文件，此结论不是重构后的验证结果。

需要保留：

1. canonical port、delivery、assembly 声明的身份。
2. 可静态定位的工厂和 bindings。
3. 分析器支持范围内的调用图。
4. 条件能力的具体 assembly 输出凭据。
5. 明确的 unavailable / missing / conditional / unresolved 区分。

不能为了新的目录结构引入动态注册表，导致原来可检查的显式接线变得不可分析。

### 7.5 证据边界

静态接入检查回答的是：**在受支持的源码分析范围内，extension 的必需契约能否找到结构对应物。**

它不证明：

- adapter 对原生事实的解释正确。
- 空函数或错误映射没有伪装成提供能力。
- 实际 provider 已安装、注册、可达。
- 子代理真的加载了 extension。
- 代码已完成全仓编译检查。
- 当前 harness 版本通过行为验证或被正式支持。

它也不是运行时加载门禁，不执行 adapter 或 extension。

## 8. 对话期间实际运行的检查基线

在重构前，实际执行：

```sh
bun run check:integrations --adapter pi --json
```

结果汇总：

| Extension | 结果 | 契约总数 | 必需契约数 | 必需项全部 provided | 全部状态分布 |
| --- | --- | ---: | ---: | --- | --- |
| codebase-tools | COMPLETE | 13 | 11 | 是 | 11 provided，2 unavailable |
| connect-bot | COMPLETE | 22 | 19 | 是 | 20 provided，2 unavailable |
| model-cost | COMPLETE | 41 | 29 | 是 | 39 provided，1 conditional，1 unavailable |

顶层 `complete: true`，`behaviorTestsRun: false`。三个结果均无 diagnostics、无 unresolved。

非 provided 项全部为可选：

- codebase-tools、connect-bot：`port:sessionObservationAccess` 和 `port:viewedSession` 为 unavailable。
- model-cost：`port:sessionObservationAccess` 为 unavailable；`delivery:round.closeOut.remaining` 为 conditional。

这里的 unavailable 描述 adapter 的接入状态，不自动等于 Pi 原生不支持。可选缺口并未被当成已实现能力。

这份表是本次对话读取工作树时的运行摘要，不是固定 commit 的正式支持记录。未通过该命令运行行为测试，也未在本次核查中运行全仓 typecheck、全量测试或真实 Pi 执行场景。后续源码变化后应重新运行，不能直接沿用此结果作为完成证据。

## 9. 预期收益与不应承诺的结果

### 9.1 明确预期收益

| 收益 | 原因 |
| --- | --- |
| 原生语义更易对照 | 原生机制与适配实现使用相近的组织坐标，减少跨 domain 拼装 |
| 能力来源更清晰 | Pi 核心与具体第三方提供者分离 |
| 升级影响范围更明确 | Pi 升级与第三方协议升级可分别定位适配职责 |
| 收窄与错误更易区分 | 同处观察原生保证和 framework 输出，而不是只看到目标能力 |
| 更好的局部性 | 同一协议、生命周期和不变量集中维护 |
| 保留自动依赖检查 | `PI_PORT` 继续收束统一能力，检查器从实际组装读取供给 |
| 可能减少连接代码 | 聚合职责后，部分跨文件导出、类型和纯转发可转为内部细节或消失 |

### 9.2 不承诺必然大幅减少行数

讨论认为存在简化机会，但没有完成全仓复杂度审计或重构实验，不能给出代码减少比例。

应区分：

```text
不可避免的原生语义转换复杂度
+
人为拆分产生的连接复杂度
```

本方案主要减少后者。更可信的收益指标是公开符号减少、理解路径缩短、重复状态减少和变更局部性改善，而不是文件大小均匀或总代码行数下降。

仅移动现有文件、保留所有包装和跨文件依赖，可能只有导航改善，没有实现简化。

## 10. 建议实施步骤

以下是后续实施方案，不表示已经执行。

### 阶段 A：建立来源与转换对应表

围绕当前 `PI_PORT` 的实际 bindings，逐项记录：

| 项目 | 需要回答的问题 |
| --- | --- |
| 原生来源 | Pi 核心还是某个第三方 extension？准确源码与版本在哪里？ |
| 原生机制 | 依赖哪些事件、查询、操作及生命周期？ |
| 保留语义 | 保留了哪些时序、身份、结果或控制权？ |
| 转换语义 | 做了哪些组合、数据转换、过滤、收窄或未接入选择？ |
| 框架输出 | 兑现哪些 port / delivery 契约？ |
| 状态与资源 | 谁创建、谁共享、何时释放？ |
| 验证依据 | 哪些已有测试或真实场景证明它？哪些仍未验证？ |

此表是重构分析材料，不引入运行时能力清单，也不能取代实际 bindings 作为检查器事实来源。

### 阶段 B：确定完整职责与目标位置

1. 按来源区分 Pi 核心和 `pi-subagents`。
2. 对照原生源码确定相关机制的合理归属。
3. 标记应合并的协议、读写或 UI 映射，以及应保留的完整生命周期 module。
4. 明确跨来源组合在哪里发生、双方交换什么事实。
5. 逐项评估删除连接包装是否真的减少复杂度，而不是把职责散回调用方。
6. 在修改前核对受影响导出符号的引用，使用可用的语言服务器完成导航与安全迁移。

### 阶段 C：迁移实现，保持公共契约

- 保持 extension-facing interface、`HarnessPort` 语义及实际能力供给不变。
- 保留 `PI_PORT` 显式、可静态检查的真实组装。
- 更新受影响的 imports、调用者、测试与生成/检查路径。
- 将无独立价值的跨文件导出收回为局部细节；保留真正有职责的工厂、类型与资源管理。
- 完成后删除被替代的旧实现和过时路径，不长期保留双实现或兼容转发层。
- 若发现必须改变运行语义或公共原语，独立说明并决策，不把它混入目录重构。

### 阶段 D：验证结构与语义保持

按仓库测试规范选择受影响测试、真实 harness 场景及最终回归。重点包括：

- 静态接入需求与供给仍可解析；不能以减少被检查的需求掩盖缺口。
- required 契约仍 provided，已有可选缺口的含义不被改变。
- 命令、prompt contribution、State 恢复与写入、UI 输出保持行为。
- Round/Turn 的开始结束、取消、失败、session 关闭和后台工作关系不变。
- 第三方缺失、未启用、拒绝、协议错误、身份不匹配及释放路径仍被区分。
- 具体 assembly 的条件能力仍有正确的输出凭据。

验证完成后，同步布局文档、能力导航、旧路径引用和相应变更记录。本文是规划文档，不替代权威架构文档。

## 11. 验收标准

### 11.1 结构与可读性

- [ ] Pi 核心与第三方 extension 适配有清楚、独立的目录归属。
- [ ] 第三方目录明确提供者名称，不把第三方专有协议伪装成 Pi 核心能力。
- [ ] 对关键原生机制，可以定位完整适配职责，不必跨多个目标 domain 才理解其时序与转换。
- [ ] 同一机制的必要组合仍完整；未机械按单个事件拆文件。
- [ ] 未机械复制无关的原生目录或增加纯转发包装层。
- [ ] 一份真实 `PI_PORT` 继续汇总能力；没有第二份需要人工同步的供给清单。

### 11.2 契约与检查

- [ ] 公共原语、port 与 delivery 承诺未因组织调整而被静默改变。
- [ ] `bun run check:integrations --adapter pi --json` 分析完成且必需项无新增缺口。
- [ ] 条件 assembly 与第三方能力状态仍被正确表达。
- [ ] 不把结构 provided 当成原生语义已验证。
- [ ] 布局相关的其他检查、生成器和测试已核对并按需更新。

### 11.3 运行与交付

- [ ] 按 [测试规范](../../docs/agents/testing.md) 完成所需 typecheck、受影响测试和最终回归。
- [ ] 对实际受影响的 harness 路径有运行观察，覆盖关键生命周期与第三方集成分支；记录不能验证的外部前提。
- [ ] 旧实现、旧路径及失效文档引用完成迁移；无双轨实现。
- [ ] 收益以具体职责聚合、连接代码减少或理解路径改善说明，不只报告移动文件数量。

## 12. 非目标与尚待决定事项

### 非目标

- 不重新设计 framework 公共原语，不增加原生特有能力入口。
- 不把所有可选能力强制改成必需项。
- 不修改 Pi 或 `pi-subagents` 源码以迎合目录方案。
- 不自动扩大为 OMP adapter 的同步重构。
- 不新增通用插件加载器、动态注册系统或第二层 adapter 抽象。
- 不以此次结构检查提升任何 harness 版本的正式支持状态。

### 尚待决定

- `native/` 与 `integrations/` 的最终命名及具体子目录。
- 按真实源码归属确定的逐文件迁移表。
- 跨来源协调逻辑的准确归属与最小输入契约。
- 哪些 helper、类型和工厂应局部化或移除。
- 哪些大型 module 的复杂度可以进一步减少，哪些必须保留。
- 除已核查的供给分析器外，其他工具对旧布局的依赖。

以上事项必须通过源码与调用关系核对，不以目录美观替代设计依据。

## 13. 证据与阅读入口

### 现有原则与操作文档

- [项目 README](../../README.md)：当前 adapter 布局约定与检查入口。
- [能力接口架构](../../framework/docs/capability-interface-architecture.md)：interface、adapter seam、port 和能力组织原则。
- [Harness 接入指南](../../framework/docs/harness-integration.md)：语义义务、原生行为对照、映射与缺失处理。
- [静态接入检查](../../framework/docs/integration-check.md)：需求、供给、状态、assembly 输出凭据及证据边界。
- [能力索引](../../framework/docs/framework-capabilities.md)：现有实现导航。
- [测试规范](../../docs/agents/testing.md)：测试层级与真实运行证据要求。
- [本地规划约定](../../docs/agents/issue-tracker.md)：本文件所在路径的约定。

### 本次读取的关键实现

- [Pi adapter 入口](../../adapters/pi/index.ts)：具体 assembly 与输出契约。
- [Pi port 组装](../../adapters/pi/internal/port.ts)：`PI_PORT`、条件集成、显式缺失成员与绑定上下文。
- [HarnessPort](../../framework/runtime/port.ts)：framework 与 adapter 之间的契约。
- [检查入口](../../scripts/check-adapter-integrations.ts)：命令调用与结果输出。
- [需求供给比较](../../scripts/integrations/check.ts)：`checkIntegrations`、`compareDemand`。
- [供给分析](../../scripts/integrations/supply.ts)：`findDefinitions`、`inspectAdapterSource`、`collectDeliveryReachability`、条件 port 评估。
- [Prompt 映射](../../adapters/pi/domain/prompt.ts)、[上下文采集](../../adapters/pi/domain/context.ts)、[命令映射](../../adapters/pi/domain/control.ts)。
- [Marker 映射](../../adapters/pi/domain/marker.ts)、[Feedback 映射](../../adapters/pi/domain/feedback.ts)。
- [Session 查询与持久化读取](../../adapters/pi/domain/session/queries.ts)、[持久化写入](../../adapters/pi/domain/session/effects.ts)、[Round 观察](../../adapters/pi/domain/session/round.ts)。
- [第三方子代理集成](../../adapters/pi/domain/subagent/integration.ts)：提供者协议与生命周期归属。

以上路径描述重构前状态，实施时需要同步更新相关导航；本文不得作为重构后路径仍有效的保证。

## 14. 最终原则

> **framework 按统一语义组织，adapter 按真实来源与原生机制组织，port 负责统一收束。**
>
> **重构的目标不是换一套目录，而是让完整职责聚合、语义转换可审查、能力供给可检查，并消除没有价值的连接复杂度。**
