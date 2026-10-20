# 接入契约架构重构汇总

日期：2026-10-20  
状态：接入结构重构、静态 authoring 门禁、源码依赖检查与缺失实现引用生成已实现。行为正确性仍由审阅与独立验证负责。

## 1. 背景与目标

原有 `check:integrations` 只比较 extension 的子代理需求声明与 adapter 的供给声明，无法自动分析 extension 使用的全部 framework 功能，也无法据此追溯目标 adapter 缺少的实现。

后续希望建立这样的分析路径：

```text
extension 对 interface 的调用、声明、订阅、读取
    → framework 的语义依赖
    → 最小接入契约
    → HarnessPort 及 delivery 的接入义务
    → 目标 adapter 的实际实现与接线
    → 缺口、依据和无法解析的部分
```

本轮最初先重构架构，使接入结构可检查、依赖规则可复用；完整需求提取、供给比较与生成随后在 §3.7 记录的工作中实现。本节保留当时的阶段背景，当前用法见[静态接入检查](integration-check.md)。

## 2. 架构边界保持不变

- `framework/interface` 仍是 extension 使用的框架接口。
- `framework/runtime/port.ts` 中的 `HarnessPort` 仍是 framework 定义的共同 adapter 契约。
- `adapters/omp/internal/port.ts`、`adapters/pi/internal/port.ts` 负责组装各自实现；原生映射仍由 adapter 的 domain 模块承担。
- framework 内部负责语义合成、状态维护和事件交付，不是将 extension 调用简单转发给原生 harness。
- 不新增按 extension 划分的 port、运行时能力注册表或第二层 adapter 接口。
- extension 的原生 widget 等直接对接 harness 的定制功能，不纳入后续框架能力清单。

## 3. 已完成的代码变更

### 3.1 提取 framework 共享接入规划

新增 [`framework/behaviors/integration-plan.ts`](../behaviors/integration-plan.ts)，以普通结构化使用信息为输入，输出运行时处理路径、port 接入义务及其原因。

[`binding.ts`](../behaviors/binding.ts) 已使用这份规划选择相应注册路径，避免未来检查器再独立复制一套条件判断。

本轮保留的既有关系包括：

- Turn、Activity、Context 或 Round 相关订阅会选择 Round bookkeeping。
- Context、Turn、用户输入分别选择相应的事实接入。
- Prompt、Marker、初始化或清理入口会影响请求前处理位置的注册。
- Marker 的 viewed-session 接入仅在相应 outlet 可用时使用。

这是对现有运行时行为的提取，不是对所有依赖关系重新作语义裁决。规划中也记录了可选接入，但不能据此直接推断任意 extension 的业务必需性。

**边界（本阶段）：** 规划本身仍只负责运行时注册路径，不承担 interface 全量依赖分析。当时尚未覆盖的观察读取、Provider 使用和 delivery 内部回调，后来由 §3.7 的 demand/supply 分析补齐；见[静态接入检查](integration-check.md)。

### 3.2 引入统一的实现编写入口

根 authoring 入口 [`framework/interface`](../interface/index.ts) 新增 `defineImplementation`，其类型与物化逻辑位于 [`details/implementation.ts`](../interface/details/implementation.ts)。

新的结构将两部分分开：

| 部分 | 职责 |
| --- | --- |
| `create(context)` | 在配置验证后，懒创建业务状态 |
| `subscriptions` | 声明观察范围、事件键及处理函数 |
| `commands` | 声明命令实现及动作处理函数 |
| `initialize` / `cleanup` | 声明生命周期处理函数 |
| `catalog` | 从业务状态取得模型价格查询 |

事件 handler 的形式改为 `(state, delivery)`；其他处理入口也按各自契约接收业务状态与参数。

`defineImplementation` 返回的值提供 `.declaration`：无需执行 `create`，即可检查订阅、命令和生命周期结构。运行时也从同一份结构生成处理函数，因此没有另外维护一份重复的人工需求清单。

### 3.3 切换公共 assembly 契约

公共 assembly 从旧的 `factory` 选项切换为 `implementation`，接收统一 authoring 入口产生的值。

- 通过私有类型品牌约束正常的 TypeScript 使用，且 assembly 擦除业务状态类型后仍保留品牌要求。
- 不保留旧的公共 raw-factory 兼容入口。
- 已解析的运行时实现及 resolver 不再作为根 authoring 入口的公开类型导出。
- framework 内部和低层绑定测试保留必要的内部 resolver seam；这不是第二条公共 authoring 路径。

类型品牌不是安全沙箱，也不能禁止类型断言、动态构造或任意代码绕过。

### 3.4 迁移 extension 与其他消费者

- **model-cost**：共享 [`modelCostImplementation`](../../extensions/model-cost/shared-logic/runtime.ts) 组织静态订阅、命令和生命周期入口；业务 runtime 提供相应方法，不再返回动态 implementation map。OMP、pi assembly 继续注入各自的构造信息和原生前端清理逻辑。
- **connect-bot**：使用统一 authoring 入口，保留 owner 范围订阅及定向命令语义。
- **codebase-tools**：无需业务实现的 assembly 继续省略 implementation。
- 受影响的 framework 测试、model-cost 测试、真实宿主 fixtures 和辅助脚本均已迁移。
- 删除了一项绑定旧代码表达形式的源码断言，没有将旧表达重新固定到新写法上。

### 3.5 Adapter 侧可检查组装（后续已完成）

新增内部 authoring 辅助 [`framework/runtime/adapter-authoring.ts`](../runtime/adapter-authoring.ts)，没有增加第二套 adapter 接口。共同契约仍是 `HarnessPort`，原生映射仍按各自 `domain/` 分类组织。

- OMP、pi 的 `internal/port.ts` 分别导出 `OMP_PORT`、`PI_PORT`，由 `defineAdapterPort<Context>({...})` 定义实际组装。
- 组装必须明确列出全部 `HarnessPort` 成员，包括可选项。必需成员只能提供符合契约的工厂；静态不提供的可选项使用 `unavailablePortMember(reason)`，不使用空函数冒充实现。
- `bindings` 是 `.create(context)` 真正消费的工厂集合，不是平行的人工供给清单。定义创建时不执行工厂；每次 native binding 创建时，按定义顺序调用工厂。原生上下文、tracker、State entry、诊断与订阅的生命周期仍由原来的 adapter/domain 实现管理。
- 条件可用性不等于静态不支持：例如 pi 未配置子代理 integration 时，其工厂返回 `undefined`，物化结果不含该可选成员；已提供的查询在某次调用时读不到事实，也不等于缺少查询实现。
- 不提供的原因描述当前 adapter 接入，不应据此推断 harness 原生功能一定不存在。
- Session、Round、Turn、Context、Input、Run、Command 及 pi Disposal 的原生最终交付构造使用 `defineAdapterDelivery(kind, payload)`。该入口引用原有规范类型，使 delivery 内的效果与查询回调有明确的构造落点；不复制、冻结或改变 payload，也不增加第二次分发。
- 保留所有既有 domain 目录和原生语义，不按“事件／查询／效果”等交互方式重排目录，不为每个方法创建独立模块。

**检查边界：** TypeScript 约束组装的完整键集合、工厂结果及 delivery 类型。供给分析器识别静态组装键、可定位工厂、明确可用性及可达 delivery 构造；无法解析的结构必须报告，不能猜测。工厂和原生业务函数体仍是普通 TypeScript。`check:authoring` 仍只约束 extension authoring，不能据其通过声称 adapter 已通过检查；`check:integrations` 才消费 adapter 的静态结构。交付构造标记和类型符合都不证明原生语义实现正确。

### 3.6 生成器的完成度边界

生成器只生成共享契约的类型约束及实际组装所需的实现引用，不生成具体原生实现，也不生成空函数、抛出未实现错误的函数或伪造的声明来满足契约。生成后的代码必须因缺少实现而无法通过编译；后续由人类或 agent 提供所需实现及导出，并满足类型和组装约束。优先引用现有规范类型，不复制一套接口签名。

这里的编译失败是生成结果的有意开发状态，不是新增运行时能力拒载机制。仅声明一个未被使用的 interface 不会产生该效果；生成的约束和引用必须进入被检查的实际组装路径，不能用 `declare`、仅类型声明或类型断言冒充存在的实现。

检查器负责可静态确定的需求、契约覆盖、类型与结构接线，不负责根据函数体猜测原生功能是否真正实现。后续代码即使通过编译和结构检查，也可能仍是空实现或错误映射；实际语义接入与逻辑正确性由人类和 agent 审阅，并结合行为验证负责。生成后缺少实现、结构契约满足、行为正确是不同状态，不能把后两者混为一谈。

### 3.7 源码检查与生成命令

命令、选项、退出码、报告字段、需求推导、供给状态、具体 assembly 输出契约、生成器行为和限制已集中到[静态接入检查](integration-check.md)，这里不再维护第二份操作说明。本节只保留重构达成的工作假设与边界：

- 检查默认分析所有 extension/adapter 目录组合，不要求已有目标 discovery entry 或成功运行的参考 harness；`--root` 支持独立源码根。extension/adapter 源路径都归到其所属目录，生成目标不得越出 `adapters/` 树。
- 分析复用 authoring 静态解析器、共享 framework 规划与显式语义规则，不导入或执行 extension/adapter，不读配置，不展开运行时分枝。动态能力成员、未映射的 context/Session 成员和超出追溯界限必须报告分析未完成；普通业务数据动态索引不受限。
- 需求来自实际结构，不再维护旧的 `subagentRequirements`、assembly `requiredSemantics`、公开的重复 requirement 类型、adapter inventory 或旧声明比较器；扩展作者不需要同步第二份列表。内部行为验证词汇保留，不变成加载政策。
- 生成器只补真实缺失接线的引用，保留已有实现，不生成实现体、空函数或声明桩，不创建 `missing-implementations` 模块；生成后编译失败是有意状态。检查与生成都不改变运行时加载或版本支持。

历史命令与验证结果保留在 §7.2/§7.3；当前用法以[静态接入检查](integration-check.md)为准。

## 4. 保持的运行时行为

- 配置先验证，业务状态再创建；声明本身不启动定时器或远程请求。
- 业务实例仍按原有 process/assembly 生命周期复用，处置后再创建新实例。
- 保留原有订阅范围、普通事件异步处理方式、初始化等待、异步命令等待及清理顺序。
- 原生 adapter 映射、widget 所有权和前端清理边界保持不变。
- 不新增启动时兼容性扫描、报告读取、能力协商或拒载机制。

## 5. 检查器工作的设计目标（已实现）

以下条目记录本阶段的设计目标；已实现的当前行为、状态语义和命令见[静态接入检查](integration-check.md)。详细计划见 [refactor spec](../../.scratch/integration-contract-refactor/spec.md)。

1. 提取 extension 对 framework 的全部可能依赖，不执行用户配置，也不展开运行时分支组合。
2. 结合 framework 明确维护的语义依赖规则，展开最小接入契约及其实现义务。
3. 支持只列需求，以及对照指定 adapter；不要求已有成功接入的参考 harness 或目标 discovery entry。
4. 检查真实实现与组装接线，而非只检查方法名存在。
5. 增加静态 authoring 表达约束：允许的入口、静态事件键、引用与组合形式，以及动态或无法解析结构的诊断。业务函数体不因此受到同样限制。
6. 区分明确必需、明确可选与无法判定；不单凭 port 上的 `?` 推断业务政策。
7. 必需项缺失或分析未完成返回非零；仅明确可选项缺失时报告风险但返回成功。检查结果不改变 extension 加载，风险由开发者衡量。

### 静态表达检查的规则与诊断（已实现）

维护完整的规则说明，包含稳定规则标识、适用范围、原因、允许与不允许的示例、修复建议、可能影响和行为保留约束。这些说明服务于维护者理解和演进规则，不要求扫描结果重复输出全文。

扫描结果保持精简，提供规则标识、文件及行列、具体问题和针对该位置的修复建议，并能关联完整规则说明。agent 可据此循环修改、重新运行检查；本次不要求检查器自动改写代码。

静态表达检查作为开发期门禁：被检查的最终源码必须满足启用的规则，无法解析的接入结构不能静默算作通过。通过仅表示检查范围内满足这些静态表达约束，不证明业务语义、完整接入依赖或行为兼容性；修复不能通过删除必要功能、隐藏结构或压制诊断来冒充完成，相关行为仍需验证。该门禁不改变 extension 的运行时加载行为。

`bun run check:authoring` 现已通过 AST 和符号解析检查这些约束；支持静态常量、导入引用、可解析展开和受限共享包装，不执行 extension 模块。`--json` 提供精简诊断，`--rules` 输出同一份完整规则库。`bun run typecheck` 在原 TypeScript 7 类型检查后运行该门禁。检查失败不会改变运行时加载。使用方式、支持边界及 agent 修复循环见[静态表达检查指南](static-authoring-check.md)。上述静态门禁、完整需求提取、供给比较及生成命令均已实现；当前用法见[静态接入检查](integration-check.md)。

`bun run check:integrations` 已从旧的子代理声明匹配切换到源码推导；通过只表示受支持的静态分析范围内契约与结构满足，不表示原生逻辑正确。

已实现的生成仅创建契约引用，不生成具体原生实现。本轮不包含编辑器插件、自动升级审阅工具、语义兼容认证或多版本 interface 管理。

## 6. 契约与语义漂移审阅

已补充 [contract-driven agent pre-review](harness-support.md#contract-driven-agent-pre-review)。审阅不仅比较名称和类型，还要求追溯：

- framework 的语义承诺与交互模式；
- 原生映射及已接受的差异；
- 接受该近似的前提、设计取舍与证据；
- harness 更新是否使这些前提失效；
- 待人工确认和需要实际观察的范围。

agent 可以先筛选风险，但不得编造历史理由，也不能把“未发现风险”表述为“已证明兼容”。结构接入完整性、行为验证与支持声明仍然分离。

## 7. 已执行验证

以下是本轮重构完成后的记录，不代表后续源码或 harness 更新自动受支持。

| 验证 | 结果 |
| --- | --- |
| `bun run typecheck` | 退出码 0 |
| `bun run test` | **1446 通过、0 失败**；159 个文件、8559 次断言，包含真实宿主 dock 场景 |
| `bun run check:integrations --json` | 退出码 0；当时 5 个入口的子代理声明匹配通过（旧比较器结果，后被 §3.7 的源码推导检查替换） |
| 独立 authoring/规划 smoke | 检查声明并展开 Turn、Round、请求前处理义务时，业务状态创建次数为 **0** |
| 独立真实 OMP loader/RPC smoke | 配置传入、单实例、初始化等待 **1573 ms**、一次本地 provider 请求、异步动作等待 **252 ms**、一次清理、正常退出 |

中间验证发现并修正了 handler 从单参数改为 state-first 后的调用方迁移错误。首次 serial dock 运行另有两项因本地冻结补丁宿主缓存不完整而无法开始；补齐固定版本依赖并应用已有冻结补丁后，受影响的两个文件共 7 项测试通过，随后全套测试通过。未修改版本基线或冻结补丁记录。

独立 smoke 使用本地 capture provider，不是实际外部服务或视觉 TUI 验收；临时脚本已删除。文档目标路径已检查。

### 7.1 Adapter 组装重构验证（2026-10-20）

在上述 adapter 迁移后的源码上执行：

| 验证 | 结果 |
| --- | --- |
| `bun run typecheck` | 退出码 0；TypeScript 7 与 extension authoring 门禁通过，50 个文件、3 个声明、0 条诊断 |
| `bun run test` | 退出码 0；**1470 通过、0 失败**，161 个文件、8765 次断言，包含现有真实宿主 dock 场景 |
| 独立类型边界 smoke | TypeScript 7 使用 `--ignoreConfig` 编译临时负例；缺必需成员、漏记可选成员、额外成员、把必需项声明为 unavailable、必需工厂返回 undefined，以及 Round 缺 `heldWork` 均被拒绝；合法可选缺失表达通过 |
| 独立真实 OMP loader/RPC smoke | 首个请求等待初始化 **1571 ms**，异步命令等待 **262 ms**，同一业务实例、一次清理、正常退出 |
| 独立真实 pi 1.3.0 loader/RPC smoke | 一次本地 capture 模型请求，观察 Turn 开始与完成交付；异步命令等待 **194 ms**，同一业务实例、一次清理、正常退出 |

两项独立真实宿主 smoke 均使用本地 capture endpoint，不是外部模型服务或视觉 TUI 验收。临时 smoke 与类型负例文件已移除。未新增仅断言包装/转发的永久测试，现有行为套件验证消费方可见行为。

验证限制：原有 `pi-terminal-round-smoke.ts` 默认要求 pi 1.2.0，当前安装为 1.3.0；显式指定 `--expect-pi-version 1.3.0` 后，又在加载前因临时入口生成的 Windows 导入路径 `./E:/...` 无法解析而失败。本轮没有修改该脚本；以上通过的独立 pi smoke 使用仓库内真实临时入口避开此路径问题，不能替代 terminal-round 专项场景的验收。以上是 §7.1 记录时点的限制；完整的静态供给分析与具体 assembly 输出契约随后在 §7.2–§7.3 实现，见[静态接入检查](integration-check.md)。这不把当时未执行的行为验证补成通过。

### 7.2 检查与生成工具最终验证（2026-10-20）

在最终检查器/生成器源码上执行：

| 验证 | 结果 |
| --- | --- |
| `bun run typecheck` | 退出码 0；TypeScript 7 与 authoring 门禁通过，50 个文件、3 个声明、0 条诊断 |
| 集成工具、authoring、规划、startup 与 import-boundary 相关测试 | **94 通过、0 失败**；10 个文件、1065 次断言 |
| `bun run test` | 退出码 0；**1492 通过、0 失败**，165 个文件、8936 次断言，435.48 秒，包含现有真实宿主场景 |
| 默认源码接入检查 | 6 个组合均无解析诊断；3 个 OMP 组合及 connect-bot/pi 结构通过；codebase-tools/pi 与 model-cost/pi 的必需 `framework:extension-loading` 为 conditional，命令按政策退出 1 |
| 新 adapter 的 CLI/TypeScript 7 smoke | 检查先报告缺口；生成实际 port 引用后因缺 `missing-implementations` 模块产生 TS2307；提供符合契约的导出后编译与检查均退出 0；再次生成不写文件 |
| 隐式 delivery 义务的 CLI/TypeScript 7 smoke | extension 只订阅 Round，无直接 feedback 读取；检查仍发现所选 port 的规范 payload 缺字段；生成缺失值引用后 TS2307；补齐导出后编译与检查均退出 0 |
| 分析边界 smoke | 动态能力成员不再静默通过：定位诊断并退出 1；adapter 源文件选择正确解析到已有 adapter；越出 adapters 树的生成请求被拒绝且不写文件 |

临时 smoke 根与实现文件均已移除，没有生成或覆盖仓库中 OMP/pi 的原生实现。编译 smoke
只证明缺失导出与类型/结构完成的转换，不证明 native 行为正确。早期全套运行一次在 300 秒
执行上限中断，后续用于边界修正的运行被主动取消；以上 1492 项结果来自最终固定源码的完整运行。
现有文档中的旧测试计数属于各次重构当时的记录，不覆盖此处最终结果。

### 7.3 具体 assembly 的工厂输出契约（2026-10-20）

前一阶段把 pi 通用 port 工厂的 `undefined` 返回分支直接报告为 conditional，没有结合
具体 extension 已经提供 `childEntry` 的事实。本次将检查点放到 adapter 声明的具体工厂出口，
不要求扫描器证明整个 provider 接入实现，也不把可选接入改成必选。

**本次增量范围：**

- 8 个生产文件：`framework/runtime/adapter-authoring.ts`、`adapters/pi/index.ts`、
  `adapters/pi/internal/port.ts`、`scripts/integrations/model.ts`、
  新增 `scripts/integrations/assembly.ts`、`scripts/integrations/supply.ts`、
  `scripts/integrations/check.ts`、`scripts/generate-adapter-integrations.ts`。
- 4 个测试文件：新增 assembly 输出与 pi 输出契约测试，扩展现有 fixture 与 CLI 验收。
- 更新本汇总及公开工具指南；未修改任何 extension 调用、第三方 provider 实现或运行时接线。

`AdapterFactory<Port, Factory>` 是保留 native 可调用类型的纯类型输出凭据，不创建运行时属性或
第二份 capability 清单。pi 的重载把参数选择关联到具体 port：明确 `childEntry` 对应必有
`subagentIntegration`，明确不提供对应无此成员，宽泛 `PiAssembly` 对应可选成员。
`AdapterPortDefinition.create` 的通用实现仍保留，未为所有 adapter 引入条件类型。

检查器把 demand 的源文件范围传入供给分析，读取实际 adapter 调用的 TypeScript resolved
signature 及规范输出凭据；只收窄原有 conditional 绑定，不能掩盖缺失实现、错误类型或 payload
缺口。无凭据、无法读取的输出、可能不返回 assembly 的工厂均保留 unresolved。普通 native
API 调用不被当作 assembly。生成器仍拒绝覆盖条件工厂，不会因为未选择接入而擅自启用它。

**信任前提：**输出契约由 adapter 作者保证；重载本身不是实现正确性的证明。adapter 的实际
输出有值/无值分支由形状测试验证，provider 注册及真实子代理加载仍由独立行为验证负责。
本次没有增加运行时断言、启动门禁或原生行为检查。

已观察的验证：

- `bun run typecheck` 退出 0，包含输出关联的编译期正反例；authoring 50 个文件、3 个声明、0 条诊断。
- `bun test tests/integrations tests/framework/pi-adapter-output.test.ts`：52 通过、0 失败，7 个文件、325 次断言。
- 最终固定源码的 `bun run test`：退出 0；1508 通过、0 失败，167 个文件、8975 次断言，475.48 秒，包含现有真实宿主场景。
- 实际 `check:integrations --json`：六个组合全部结构通过、退出 0；model-cost/pi 与 codebase-tools/pi 的加载供给为 provided，证据定位到各自 assembly 调用。
- 实际 model-cost/pi 生成预览：退出 0、0 个文件、0 条诊断。
- 使用真实 pi 工厂签名、临时 assembly 源码的独立进程 smoke：明确传入为 provided、不传为 unavailable、`string | undefined` 为 conditional，均无解析诊断；临时源码已移除。
- 补充了“工厂本身可能返回 undefined”的失败前/修复后回归，避免丢弃空 assembly 分支而错误报告 provided。

## 8. 相关记录

- [静态接入检查](integration-check.md) — 当前命令、状态语义、生成边界、限制与历史验证摘要
- [总体架构及本轮重构边界](capability-interface-architecture.md#inspectable-authoring-and-shared-planning-2026-10-20)
- [ADR-0002：共享接入规划与可检查 authoring](../../docs/adr/0002-semantic-extension-framework.md#shared-integration-planning-and-inspectable-authoring-2026-10-20)
- [实施范围、延后事项与验证记录](../../.scratch/integration-contract-refactor/spec.md)
- [领域术语](../GLOSSARY.md)
