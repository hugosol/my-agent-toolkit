# 静态接入检查（integration check）

`check:integrations` 和 `generate:integrations` 是**离线源码诊断与受限生成**工具。它们从 extension 源码推导接入需求，再从目标 adapter 的实际组装读取供给，不导入或执行 extension、adapter、业务构造函数或 handler，不读取 extension 配置，也不运行行为测试。入口脚本是 [`scripts/check-adapter-integrations.ts`](../../scripts/check-adapter-integrations.ts) 和 [`scripts/generate-adapter-integrations.ts`](../../scripts/generate-adapter-integrations.ts)，分析与生成实现位于 `scripts/integrations/`。本页是这两个命令的用法、输出、状态语义、生成边界和限制的唯一权威；版本与行为验证属于另一条检查链，见 [版本检查运行手册](harness-support.md#version-verification)。

<a id="integration-boundary"></a>
## 检查边界

工具回答的是：**在它能静态解析的范围内，extension 声明/使用的 framework 契约是否都能在目标 adapter 的组装中找到结构对应物。** 它不回答：

- 原生映射是否正确，空函数或错误映射是否冒充了实现；
- provider 是否真的注册、子代理是否真的加载、TUI 是否真的可读；
- harness 版本是否受支持，或任何行为场景是否通过；
- 生成的代码是否已经能编译。

通过只表示“需求分析与供给分析完成，且必需契约在结构上为 `provided`”。结构检查、编译成功、行为正确、版本支持是四种不同状态，不能相互替代。

检查不改变 extension 的运行时加载，也不新增启动门禁、能力协商或报告读取。`--json` 报告固定带有 `behaviorTestsRun: false`，因为该命令从不执行行为测试。

<a id="command-and-exit-codes"></a>
## 命令、选项与退出码

在仓库根目录执行。`--root <directory>` 可把根切到另一个项目或 fixture；以下所有相对路径都相对于该根。

### `check:integrations`

```sh
# 默认：分析 extensions/* 与 adapters/* 的所有组合
bun run check:integrations

# 只列需求，不需要 adapter 或 discovery entry
bun run check:integrations --extension model-cost --demand-only

# 指定 extension 与 adapter，输出 JSON
bun run check:integrations --extension model-cost --adapter omp --json

# 也可以用目录或源文件选择；普通文件会归到其所属的 extension/adapter
bun run check:integrations --extension extensions/model-cost/harnesses/omp.ts --adapter adapters/omp/index.ts

# 多声明业务目录示例：检查全部独立角色，或只检查一个声明模块
# role-pair 是示例目录名；替换为实际业务目录及声明文件
bun run check:integrations --extension extensions/role-pair --adapter omp --json
bun run check:integrations --extension extensions/role-pair/manager-definition.ts --adapter omp --json
```

| 选项 | 含义 |
| --- | --- |
| `--extension <id-or-source-path>` | 不指定时分析 `extensions/` 下每个目录及其中每个独立声明。裸名称先按项目根解析，根下不存在时再按 `extensions/<id>` 解析；不按声明 ID 跨目录搜索。目录选择检查其中全部声明；源文件先归到其所属 extension 目录，若该文件包含 canonical definition，则在多声明目录中只选该文件的声明及其角色源码/装配，否则检查所属目录的全部声明。树外独立源文件只分析该文件。 |
| `--adapter <name-or-source-path>` | 不指定时分析 `adapters/` 下每个目录。裸名称按 `adapters/<name>` 解析；含路径分隔符或绝对路径时按项目根解析，并取其所属的 `adapters/<name>/` 目录。相对路径要包含 `adapters/` 前缀（如 `adapters/omp/port.ts`）；选择必须落在 `adapters/` 树下。 |
| `--demand-only` | 只做需求侧分析，不读取任何 adapter。**不能与 `--adapter` 同时使用。** |
| `--json` | 只向 stdout 输出 JSON 报告；解析/调用错误也以 JSON 输出。 |
| `--root <directory>` | 指定项目根；默认仓库根。 |
| `--help`, `-h` | 打印用法并退出 0。 |

没有位置参数；未知选项、重复选项、选项缺值、根目录不存在，都会使命令以 **2** 退出。默认发现模式下没有 extension 目录，或（未用 `--demand-only` 且）没有 adapter 目录，也以 **2** 退出。

**退出码：**

| 退出码 | 含义 |
| --- | --- |
| `0` | 报告 `complete: true`：没有诊断，所有必需契约均 `provided`，且没有 `unresolved`。显式可选契约的缺失允许存在。 |
| `1` | 报告 `complete: false`：必需契约存在 `missing`/`unavailable`/`conditional`，或任一契约（包括可选契约）为 `unresolved`，或需求/供给分析产生了诊断。 |
| `2` | 调用或基础设施失败：选项错误、根目录不存在、默认发现不到 extension/adapter、无法开始分析等。 |

选出不存在或无法静态解析的 extension/adapter 时，通常会形成 `demand/*` 或 `supply/*` 诊断并以 **1** 返回；只有命令本身无法建立参数或根上下文时才是 **2**。

### `generate:integrations`

```sh
# 预览：只打印将写入的文件，不修改源码
bun run generate:integrations --extension codebase-tools --adapter new-harness --dry-run --json

# 写入缺失接线的引用
bun run generate:integrations --extension codebase-tools --adapter new-harness
```

| 选项 | 含义 |
| --- | --- |
| `--extension <id-or-source-path>` | **必需。** 需求来源；解析规则同 `check:integrations`。 |
| `--adapter <name-or-source-path>` | **必需。** 生成目标；必须落在 `adapters/` 树下。越界目标是 `supply/adapter-target` 分析诊断（退出 1），不写文件；只有选项本身无法解析才是调用错误（退出 2）。 |
| `--dry-run` | 只分析并打印 `WOULD WRITE`/JSON 结果，不写任何源码。 |
| `--include-optional` | 把已知可选缺口也纳入生成候选；默认只处理必需缺口。 |
| `--json` | 输出 JSON。 |
| `--root <directory>` | 指定项目根。 |
| `--help`, `-h` | 打印用法并退出 0。 |

**退出码：**

| 退出码 | 含义 |
| --- | --- |
| `0` | 分析完成，生成/预览结果无诊断。`0 missing contracts selected` 也是成功。 |
| `1` | 预检未完成（需求/供给诊断、`unresolved`、条件工厂、歧义或不能安全定位的结构），或生成过程产生诊断；此时不应假定文件已按计划写入。预检失败不写任何计划文件。 |
| `2` | 调用失败：选项错误、根目录不存在、未给 `--extension`/`--adapter` 等。 |

生成成功**不代表代码可编译**。生成器不创建 `missing-implementations` 模块，也不生成函数体、空函数、抛错占位或 `declare`；它只在真实组装中引用缺失实现的导出。只要写入了缺失引用，生成的代码就会因该模块/导出缺失而编译失败（历史 smoke 中为 TS2307），必须由人或 agent 补齐真实实现后再运行 `bun run typecheck`。生成器自身不调用 `tsc`。

<a id="demand-analysis"></a>
## 需求如何从源码推导

`check:integrations` 使用 TypeScript 程序与 authoring 检查器共用的静态解析器分析选中的 extension 源文件，不执行模块。它恢复 `defineExtension`、`defineImplementation` 的声明结构，并跟踪 framework 接口使用：

- 条件分支**不按运行值裁决**；两支的源码使用都可能贡献契约。报告的是“可到达的接入义务”，不是“每次运行都会走的路径”。
- 不读取用户配置，不展开运行时分支组合；业务函数体不要求是静态表达式，但其对 framework 能力的调用会被追踪到有界深度。
- provider 查询等“可能没有事实”的能力是契约中的可选事实，不等同于 extension 的业务必需项。
- 不需要已成功接线的参考 harness，也不需要目标 discovery entry；`--demand-only` 甚至不需要 adapter。

### 同业务目录内的独立声明

一个业务目录可包含多个独立 `defineExtension` ID。命令按声明输出各自的需求、供给和诊断；JSON 的 `results` 为每个声明/adapter 组合保留独立项，文本标题使用真实声明 ID。不会把两个 ID 合并，也不会只检查首个声明。任一角色不完整，整体 `complete` 为 `false`、退出 **1**，另一个角色的结果仍保留。例如，只有 node 的必需 `onTurn` 不可用时，输出包含：

```text
manager-chat / fixture: COMPLETE
node-chat / fixture: INCOMPLETE
  UNAVAILABLE port:onTurn (required) — fixture lacks onTurn
```

多声明时，源码归属通过本地静态 `import` / `export ... from` 依赖确定：每个角色的独立装配模块关联自己的声明和 authored implementation，可继续导入两者共用的 helper。分析只将能单独到达该声明的模块及其依赖纳入该角色，另一个角色的实现和 adapter assembly witness 不会被复用。汇总导入两个角色的 barrel 本身不是任一角色的装配证据。不依赖文件名猜角色；找不到任何单角色依赖关系的 authored implementation 会产生 `demand/implementation-owner`，而非遗漏需求后宣称通过。请保留独立角色装配，或用可静态解析的模块导入关系明确归属。

单声明目录沿用原来的全目录分析。生成命令一次只处理一个声明；多声明目录需用具体声明源文件选择，目录歧义退出 **1**，不写文件。无论单声明还是双声明，静态 `provided` **都不是运行兼容认证**；实际角色加载、工具、Prompt、Session 生命周期与 HTTP 行为仍需独立运行验证。

每个契约属于一个家族：

| 家族 | 含义 | 例子 |
| --- | --- | --- |
| `port:*` | 对 `HarnessPort` 成员的义务。 | `port:onSession`、`port:modelPrices` |
| `delivery:*` | 对某个交付回调/payload 路径的义务。 | `delivery:round.feedback.notify`、`delivery:command.canAcceptInput` |
| `framework:*` | framework 语义义务，展开为一个或多个 port/delivery 前置条件。 | `framework:extension-loading`、`framework:session-facts`、`framework:state-follow` |

每个契约记录 `requirement`（`required`/`optional`）、来源位置 `origins` 和一条依赖路径 `path`（以 `extension:<id>` 开头）。

**必需/可选由源码使用与 framework 规则决定，不从 port 成员的 `?` 推断。** 同一契约只要有一处按必需使用，最终就是 `required`。当前明确按可选处理的包括：

- 模型价格查询与 provider access（`port:modelPrices`、`port:providerAccess`，以及对应的 framework 语义）；
- `initialization.subagents` / `subagents.*` 这类条件子代理交付字段；
- `round.closeOut.remaining` 这类只在 disposal 边存在的义务。

其余被追踪到的契约默认为 `required`。任何需求分析诊断都使报告 `complete: false`，不能把“分析没做完”当作通过：

| 诊断前缀 | 触发条件 |
| --- | --- |
| `demand/source` | 选中的源中没有 TypeScript 文件，或源程序无法建立。 |
| `demand/authoring` / `demand/definition` | 找不到 canonical definition/implementation，或 definition id、多个 definition 无法确定。 |
| `demand/implementation-owner` | 多声明源码中的 authored implementation 无法通过独立角色装配的本地导入关系归属；不能跳过该实现或猜测所属 ID。 |
| `demand/analysis-bound` | framework 使用追踪超过支持深度，需求分析不完整。 |
| `demand/dynamic-capability-member` | 在受跟踪的 framework 能力对象上使用动态成员名，无法解析契约。普通业务数据的动态索引不受此限制。 |
| `demand/unmapped-capability-member` | 使用了分析器没有依赖规则的 context/Session 成员。 |
| `demand/event` / `demand/command` / `demand/implementation` | 订阅事件、命令控制种类或注入实现的结构无法静态确定。 |

此外，authoring 解析器自身的规则诊断会以 `demand/<ruleId>` 出现。选中范围未必等于 `check:authoring` 的默认全仓范围，两个命令的通过不能互相替代。

<a id="supply-analysis"></a>
## 供给如何从 adapter 推导

供给分析读取目标 adapter 的 `defineAdapterPort<Context>({...})` 实际组装及其可达的 adapter 局部工厂；**不导入、执行或实例化 adapter、extension、native host 或 delivery**。

- `defineAdapterPort` 的 `bindings` 是供给来源，不是另一份人工清单。每个成员必须写成可静态解析的属性/方法；spread 必须能解析到对象字面量，计算属性名、循环 spread 或动态 bindings 会产生诊断。
- 绑定工厂必须是可定位的函数/箭头函数，形状必须符合 `HarnessPort` 工厂契约，返回类型不能是 `any`/`unknown`。不执行工厂体。
- adapter 已有源文件但没有 `defineAdapterPort` 组装会形成 `supply/no-definition`；多个组装会形成 `supply/ambiguous-definition`。此时契约无法得到可证明的供给。
- 一个 adapter 根只应有一个模块级 port 组装；详情见 [框架能力索引的 adapter 导航](framework-capabilities.md#adapter-implementation-navigation)。

对 delivery 义务，分析沿绑定工厂的调用图寻找可达的 canonical `defineAdapterDelivery(kind, payload)` 构造：

- 只接受与契约对应的规范 delivery 种类；kind 是动态值、调用图超过静态上限或没有可达构造，都会形成 `unresolved`/`missing`，而不是猜测“应该存在”。
- payload 的必需字段来自规范 `AdapterDeliveryMap` 类型，不维护第二份字段清单。任一可达构造缺少必需字段 → `missing`；字段类型为 optional 或可能为 `undefined` → `conditional`；字段在每个可达构造中都存在且必需 → `provided`。
- 一个 extension 只订阅 Round、并不直接读取 feedback 时，所选 port 的规范 payload 仍要检查 framework 需要的回调字段；不能因为 extension 没直接读就跳过。
- 边界情况：`framework:state-follow` 即使 `onSession` 工厂存在，如果规范 session payload 不能重建它需要的 typed state payloads，会报告 `unresolved`，不会因为“port 在”就算 `provided`。

当 framework 语义有多条可接受实现路线时（例如 persistence/marker 可由 session 或 command 路径承担），分析会合并这些投影：任一 `provided` 即可；否则按 `conditional` → `unresolved` → `missing` → `unavailable` 的顺序取第一个可用状态。这个合并只表达“结构路线存在”，不证明路线被运行时选中。

<a id="session-facts-field-report"></a>
### SessionFacts 字段报告

当需求契约包含 `framework:session-facts` 时，供给结果额外携带一份**独立的** `sessionFacts` 字段报告。它只读取所选 adapter 中一个可解析到 canonical `framework/runtime/adapter-authoring.ts` 的 `defineSessionFactsMapping<Input>({...})` 声明，用字段级证据回答“这个 adapter 声明了哪些 session 事实”：

- 字段集合来自 canonical `SessionFacts` 类型（`framework/interface/session/details/facts.ts`），不维护第二份手写字段清单。
- 映射函数 → `mapped`，即使该函数在运行时可能返回 `undefined`（可选事实仍然是 mapped，不产生条件状态或语义警告）；`unavailable` 键本身也是这样的映射函数，同样报告为 mapped；canonical `unavailableFact(reason)` → `unavailable` 并保留原因；对象里缺少该键 → `missing`；spread、动态属性名、多个 mapping 声明或无法解析为对象字面量的 bindings → `unresolved`。
- 每个字段都带源码位置；`unavailable` 定位到 `unavailableFact(...)` 调用，`missing` 定位到最近的 mapping 声明。
- 不扫描映射函数体，不追踪 session-facts 消费方，不执行 adapter，也不判断映射是否符合原生语义；没有逐字段修改建议。
- 该报告是补充数据：不改变契约 `supply` 状态、可选事实政策、`complete`/退出码，也不进入生成器的缺失契约处理。adapter 没有 canonical mapping 时报告 `mapping: "missing"`，不会静默显示为 mapped；需求不含 `framework:session-facts` 的 extension/fixture 完全不会生成这份报告。

<a id="supply-statuses"></a>
## 供给状态与完成判定

| 状态 | 含义 | 对 `required` 契约 | 对 `optional` 契约 |
| --- | --- | --- | --- |
| `provided` | port 工厂可定位，且其关联的可达 delivery 构造（若有）携带全部必需字段；或 delivery 在每个可达构造中都携带全部必需字段。 | 通过 | 通过 |
| `unavailable` | adapter 用 `unavailablePortMember(reason)` 明确声明不提供；或具体 assembly 输出明确不含该成员。描述的是 adapter 接入，不断言 harness 原生没有该功能。 | **失败** | 允许，仅报告风险 |
| `conditional` | 可选工厂可能返回 `undefined`；多个具体 assembly 的选择不一致；payload 字段 optional；或义务只存在于条件边（如 close-out）。 | **失败** | 允许，仅报告风险 |
| `missing` | 静态组装里没有该绑定；绑定被静态 `undefined`；生成的实现导出仍缺失；没有可达 delivery 构造，或构造缺少必需 payload 字段。 | **失败** | 允许，仅报告风险 |
| `unresolved` | 无法完成分析：动态 bindings、canonical port 读不到、成员不在 `HarnessPort`、framework 语义没有 adapter prerequisite、工厂返回 `any`/`unknown`、动态 delivery kind、调用图超界，或选中 extension 源中条件成员的具体 assembly witness 无法分析（没有选中源时保留通用 `conditional`）等。 | **失败** | **失败**：任何 `unresolved` 都会使整体不完整 |

完成判定是：

```text
complete =
    没有 diagnostics
    且 每个契约的 supply 未定义（demand-only）或 requirement 为 optional 或 status 为 provided
    且 没有任何契约的 status 为 unresolved
```

由此：

- `--demand-only` 的 `COMPLETE` 只表示**需求分析完成**，不代表任何 adapter 能供给。该模式没有 supply，报告中的契约状态显示为 `REQUIRES`。
- `unavailable` 不等于 `missing`：前者是明确声明不提供，后者是组装里找不到/没有实现。`conditional` 是“可能提供”，不是“已提供”；必需契约的 `conditional` 仍然失败。
- 可选契约的 `missing`/`unavailable`/`conditional` 不使命令失败，但仍会出现在报告里作为风险。
- 运行时某次查询没有事实（例如 provider 暂不可用、子代理未配置）不等于查询实现缺失；结构分析只判断供给是否存在，不把一次业务查询结果当成供给状态，也不探测 provider 注册或子代理加载。
- `provided` 是结构状态。空函数、返回占位值、错误映射仍可能满足类型并得到 `provided`。

### 输出形状

控制台报告逐组合打印；以下只说明字段形状，不是某次运行的真实输出：

```text
<extension> / <adapter>: COMPLETE|INCOMPLETE
  PROVIDED|UNAVAILABLE|CONDITIONAL|MISSING|UNRESOLVED <contract-id> (<required|optional>)[ — <reason>]
    extension:<id> → ... → <contract-id>
    source <file>:<line>:<column>
    implementation <file>:<line>:<column>
    session-facts mapping DECLARED|MISSING|UNRESOLVED <file>:<line>:<column>[ — <reason>]
      MAPPED|UNAVAILABLE|MISSING|UNRESOLVED <field>[ — <reason>] (<file>:<line>:<column>)
  <file>:<line>:<column> [<diagnostic-code>] <message>
    <suggestion>
Structural integration analysis only; native semantics are not certified and runtime loading is unchanged.
```

- `--demand-only` 的组合标题是 `<extension> / demand`，状态行以 `REQUIRES` 开头。
- `implementation` 行只在有可定位的供给实现时出现。
- 最后一行固定提示结构分析边界。

`--json` 顶层为：

- `stage: "integration-contracts"`、`behaviorTestsRun: false`、`complete`、`results`；
- 每个 result：`extension`、可选 `adapter`、`complete`、`contracts`、`diagnostics`，以及可选 `sessionFacts`（仅当需求含 `framework:session-facts`；含 `mapping`、可选 `declaration`/`reason` 和 `fields`，字段条目含 `field`、`status`、可选 `reason` 与源码位置）；
- 每个 contract：`id`、`kind`（`port`/`delivery`/`framework`）、`member`、可选 `delivery`、`requirement`、`origins`、`path`，以及可选 `supply`（`contractId`、`status`、可选 `reason`/`implementation`）；
- 每个 diagnostic：`file`、`line`、`column`、`code`、`message`、`suggestion`。

调用失败时（退出码 2），JSON 为 `{ stage, complete: false, error }`；`check:integrations` 的 stage 是 `integration-contracts`，`generate:integrations` 的是 `adapter-generation`。

<a id="assembly-output-contract"></a>
## 具体 assembly 的工厂输出契约

通用 port 工厂可能在某些组装输入下返回可选成员。检查器不能把这种通用可选性当成每个具体 extension 的“未确定”，但也不能把泛型返回类型直接当成 `provided`。解决方式是把检查点放在 adapter 声明的具体工厂出口：

- `framework/runtime/adapter-authoring.ts` 中的 `AdapterFactory<Port, Factory>` 保留 native 工厂的可调用形状，并携带**纯类型**的 `AdapterFactoryOutput<Port>` 输出凭据。它不创建运行时属性、第二份能力清单或加载决策。
- 只有写入选中的 extension 源文件、且解析到的声明位于所选 adapter 目录内的实际调用，才是候选 assembly 证据。普通 native API 调用（例如事件订阅）不是 assembly。
- 候选调用的 resolved 返回类型必须携带 canonical `AdapterFactoryOutput` 声明；凭据按声明身份识别，不按属性名猜测。`any`/`unknown`、无法读取的输出、可能不返回 assembly 的工厂都保持 `unresolved`。
- 该证据只收窄原本为 `conditional` 的 port 成员，不能把 `missing`、`unavailable`、`unresolved` 洗成 `provided`，也不能掩盖缺失实现、错误类型或 delivery payload 缺口。
- 多个实际调用/多个 union 输出之间：全部 `provided` → `provided`；全部 `unavailable` → `unavailable`；任一 `unresolved` → `unresolved`；其余分歧 → `conditional`。
- 没有 witness 时，保留 adapter 分析的通用答案（通常是 `conditional`），不推断某个具体组装一定提供或一定不提供。

pi 的重载把 `childEntry` 与具体输出关联：

| 组装输入 | 声明的 port 输出 | 该成员的具体供给 |
| --- | --- | --- |
| `childEntry: string` | 必有 `subagentIntegration` 函数 | `provided` |
| 省略或显式 `undefined` | 无 `subagentIntegration` 成员 | `unavailable`（有意不选） |
| 一般 `PiAssembly`，含 `string \| undefined` | 可选 `subagentIntegration` | `conditional` |

因此 `framework:extension-loading` 的具体结论取决于 extension 实际写下的 assembly 调用，而不是只看通用 port 工厂。历史记录中 model-cost/pi 与 codebase-tools/pi 显式提供 `childEntry`，其加载供给为 `provided`；这不是 provider 注册、子代理成功加载或原生行为正确的证明。witness 的正确性由 adapter 作者保证，最终仍由独立行为验证负责。

<a id="check-division"></a>
## 与 `check:authoring`、`typecheck`、`generate:integrations` 的分工

| 命令 | 检查内容 | 不检查 | 通过意味着 |
| --- | --- | --- | --- |
| `bun run check:authoring` | extension authoring 表达式的静态语言边界；默认扫描 `extensions/` 下的 TypeScript 源，可给文件或 `--root`；使用 AST/符号解析，不执行模块。 | adapter 供给、业务行为、harness 版本。 | 扫描范围内满足已实现的 authoring 规则；不是完整接入检查。 |
| `bun run typecheck` | 显式 TypeScript 7 `tsc --noEmit`，随后运行 `check:authoring`。 | `check:integrations`、行为测试、harness 版本。 | 仓库类型检查与 authoring 门禁通过；不证明 adapter 接线完整。 |
| `bun run check:integrations` | 源码推导 extension 需求，对比具体 adapter 的静态组装与 delivery 构造。 | 全仓类型检查、生成代码的编译、执行/行为/版本。 | 对照 adapter 时，受支持静态分析范围内必需契约结构为 `provided` 且没有 unresolved；`--demand-only` 只要求需求分析完成。 |
| `bun run generate:integrations` | 只补充缺失接线的真实导出引用；默认只处理必需缺口，`--include-optional` 才纳入可选缺口。 | 不实现函数体，不创建缺失实现模块，不运行 `tsc`。 | 缺失引用已写入/预览；若有写入，随后编译**应失败**，直到补上真实导出。 |

典型顺序是：`check:authoring` 或 `typecheck` 先保证 authoring 结构可解析 → `check:integrations` 找必需结构缺口 → 补齐/生成引用并实现 → 再 `typecheck` 与 `check:integrations` → 最后运行行为测试与版本验证。这个顺序是诊断便利，不是运行时门禁；任何一步通过都不能替代后面的语义/行为证据。

`check:integrations` 复用 authoring 静态解析器，所以 authoring 规则不满足时会以 `demand/<ruleId>` 报告；但它是按选中 extension 分析，而 `check:authoring` 默认可扫描整个 `extensions/`。两者不能互相冒充。版本/行为验证则完全不在这些命令内，见 [版本检查运行手册](harness-support.md#version-verification)。

<a id="generator"></a>
## 生成器：只生成真实缺失的引用

生成器读取同一份 demand/supply 分析，不做第二次独立猜测。

- 预检：需求诊断、供给诊断或任一 `unresolved` 存在时，生成器**不写任何文件**并以 1 退出。它不会用生成结果覆盖无法解析、条件或歧义结构。
- 目标：新 adapter 默认在 `adapters/<harness>/port.ts` 生成完整的私有 port 组装引用，并从同目录的 `missing-implementations` 引用真实导出，不再创建 `internal/port.ts`。已有 adapter 的源码仍按实际位置定位，包括嵌套来源目录；其确定缺失绑定或可定位的 delivery 属性会被补上对缺失实现的导入。明确写成 `unavailablePortMember(...)` 的必需成员若需求要求它，也可能被替换为待实现导入；可选缺口默认不处理。
- 安全性：只修改能定位的现有组装/对象字面量；已有实现、错误值、嵌套只部分存在、动态或歧义结构都拒绝并给出诊断。重复运行不重复插入导入，不覆盖已有实现文件。
- 生成内容：只引用 `missing-implementations` 模块中的真实导出和规范类型；不创建该模块，不写空函数、抛错函数、`declare` 或第二份框架签名。生成失败不是“运行时拒载”，生成后编译失败是**有意保留的开发状态**。
- 生成之后：由人或 agent 提供符合类型与组装约束的导出；先 `bun run typecheck` 确认编译，再 `bun run check:integrations` 确认结构。编译通过仍不证明原生语义正确。

`--dry-run` 不写源码，控制台打印 `WOULD WRITE <file>`；实际写入打印 `WROTE <file>`。`--json` 的成功结果包含 `stage: "adapter-generation"`、`complete`、`dryRun`、`adapter`、`files`、`generatedContracts`、`diagnostics`。预检失败时 JSON 只含分析结果和空文件列表，不包含计划写入。

<a id="limits"></a>
## 结果解读与限制

- **结构 ≠ 语义。** 空实现、错误映射、no-op 回调都可能通过类型与结构检查；原生 provider 注册、子 agent 加载、请求/账户行为仍由独立行为验证负责。
- **只分析可达义务。** 源码分支不会被求值；被运行时条件永久关闭的路径仍可能贡献契约，这是有意的保守偏向。它不是“每次运行都会需要”的断言。
- **无法解析必须显式。** 动态能力成员、未映射的 context/Session 成员、超出函数/调用图追踪上限、动态 assembly/delivery 都会产生诊断并阻止 `complete`。普通业务数据的动态索引不属于此类。
- **不追踪所有代码。** 直接调用 harness 的原生 widget、一般 HTTP/files/config 模块不会自动成为 adapter 契约；业务函数体也不用于猜测原生行为。
- **不安装、不运行、不读配置、不读验证报告。** 它不执行 extension/adapter，不启动 harness，不调用 provider，也不把 `check:integrations` 的结果写入任何支持记录。
- **不认证版本。** 版本成员关系、候选回归、真实宿主 smoke 和 TUI 验收在 [版本检查运行手册](harness-support.md#version-verification)；适配器结构完整也不代表某个 harness 版本受支持。
- **不保证未来源码。** 报告只对应被执行时的源码、选中的 extension/adapter 与静态分析范围。源码或 harness 改变后必须重新运行；历史记录不能当作当前结论。

<a id="related-records"></a>
## 相关记录

- [静态 authoring 表达式检查](static-authoring-check.md) — extension 作者表达式的规则与修复循环。
- [框架能力索引的 adapter 导航](framework-capabilities.md#adapter-implementation-navigation) — 从契约定位 adapter 模块的约定。
- [版本检查运行手册](harness-support.md#version-verification) — OMP baseline/candidate、pi smoke、provider/TUI 限制和证据判定。
- [能力接口架构](capability-interface-architecture.md) — 三层证据与运行时边界的背景。
