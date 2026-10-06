# 确定扩展定义、行为组合与 OMP 适配接口

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 04, 05
Lighthouse: [06-framework-interface](../lighthouse/06-framework-interface.md)

## Question

用什么小而完整的公共接口，把已决定的 State、控制、恢复、指令贡献与基础反馈组织成一个真正使用框架的 codebase-tools 扩展，而不包装或复制整个原生 ExtensionAPI？

需要决定：

- extension definition 的必要声明，以及哪些内容留在共享 TypeScript 逻辑；以 codebase-tools 的完整定义示例检验作者体验，不提前实现其他扩展的配置语言。声明面须覆盖多贡献槽位（如首次启用轮 / 每启用轮）各自的内容与激活条件配置。
- 语义核心、可复用 behaviors、OMP adapter 和扩展 agent-runtime assembly 的职责与依赖方向。共享业务逻辑不导入 Agent 运行时类型，框架不依赖具体扩展。
- State 的读与更新面、恢复/持久化/贡献提交的调用顺序、错误传播与初始化失败清理。将前置契约落实为接口，而非留下实现时自行决定的关键语义。
- command toggle、通知与 above-editor 标记如何由 State 驱动；首次加载、恢复、每轮重设、关闭清除和无 UI 路径如何表达。复杂原生 UI 不升格为通用布局语言。
- 开放哪些原生 escape hatch、哪些属于框架管理的历史影响面，以及能实际执行的保护机制与限制。任意进程内 TypeScript 不宣称被沙箱约束。
- 能力缺失/拒绝的显式反馈：当 Agent 运行时不满足某项必须语义时，如何通过 Agent 运行时通道向用户显式提示（不得写入模型指令或会话历史），以及触发条件、去重与 per-agent-runtime 传输；传输实现属 OMP agent-runtime assembly，不在本票声称跨 Agent 运行时可用。
- 公开接口必须附带一份“能力与选项清单”文档作为入口索引（细节指向源码），供人类与 agent 快速理解能力入口。
- 注册顺序、行为冲突和 State 更新竞争的最小确定性规则；不引入无消费者的 scheduler、通用插件总线或空壳 pi adapter。

### 追加约束（来自 [02 决策](../lighthouse/02-candidate-support.md)，backtracer 2026-10-06）

- C14 反馈通道有**两个不同触发**，不得混同：
  1. **必须语义不满足**（历史保护等；角色部分已被 [05](../lighthouse/05-contribution-contract.md) 改为 agent-runtime-qualified、不作门槛）→ 显式拒绝该能力；
  2. **未列 Agent 运行时版本** → 一次用户可见通知，说明未验证，然后**继续运行**（02 的准入政策），不声明支持。
- 02 已定：支持集是**精确版本枚举**（不是范围）；检查在扩展装载/绑定、注册命令与贡献之前；去重为每次会话一次。
- 未决问题：通知的确切文案、去重键（会话 vs 进程）、无 UI/无头模式下的传输方式，以及“未列版本继续运行”与“必须语义不满足拒绝”在运行时的判定先后。（本票已定，见下方讨论结论。）

本票使用 codebase-design、grilling、domain-modeling。允许接口示例作为讨论资产，不提交运行时实现。若需要交互原型才能判断，另建 prototype 决策票，而不把草稿当成已验收实现。

### 追加约束（来自 [04 State 归属决策](../lighthouse/04-state-ownership.md)，2026-10-06）

- 接口须覆盖 owner 解析 seam：Agent 运行时原生 `ctx.agent.parentId` + `pi.pi.AgentRegistry` 递归到 main；共享逻辑不得 import Agent 运行时类型，`pi.pi` escape hatch 限定在 OMP agent-runtime assembly，由本票明确"开放哪些原生 escape hatch"。
- 接口须覆盖 State 读面：子代理按 owner cell 只读、无写面；会话边界 seed 与界内 Map 权威的分工。

---

## 讨论结论

本票使用 codebase-design + grilling + domain-modeling。最终收敛的接口如下；每节记录决定、理由与被否决项。

### 1. 作者面与四层职责

- 作者面 = **声明式 `defineExtension` 定义 + 纯函数**；不提供命令式 capability API，不提供通用 handler / 插件总线 / 无消费者 scheduler。
- **v1 只实现 `commandToggle`**；`type` 是封闭判别联合，未来 kind 由框架按真实消费者增加，不开放自定义 kind。
- 四层职责与依赖方向：
  - `framework/core`：宿主无关；定义类型、State 模型、控制/贡献/反馈协议、准入、确定性规则。
  - `framework/behaviors`：宿主无关的可复用实现（`commandToggle`、first/every-enabled-run、marker、owner 跟随）。
  - `framework/adapters/omp`：**唯一**接触原生 API 的层；事件映射、owner 解析、持久化、UI 传输、版本探测。
  - `extensions/<ext>/definition.ts`：声明；不 import 宿主。
  - `extensions/<ext>/runtimes/omp.ts`：runtime assembly；复杂 UI 可直用原生 UI，State 写必须经框架。
  - `entrypoints/omp/<ext>.ts`：薄 re-export。
- 公共入口：`framework/public.ts`（`defineExtension` + 配置类型）；`framework/adapters/omp.ts`（`ompAdapter`）。
- 声明用**纯数据对象**（`{ type: "toggle", ... }`），不用 builder。
- codebase-tools 不创建 `logic.ts`；「共享 TS 逻辑」= framework core/behaviors。
- 被否决：plan/effect-descriptor 统一原语（过度设计）；raw handler 后门（会退化成原生 API 包装）。

### 2. State、命令与写路径

- State 为 owner 作用域（04）；`enabled` 是框架默认 boolean 字段（默认 false，落盘 `${id}:state`），`state` 可整体省略。
- 命令声明：

  ```ts
  commands: [{ type: "toggle", name: "codebase-tools", state: "enabled" }]
  ```

- 写路径（同步、单写者）：命令事件 → adapter 匹配 command → 在 owner cell 上应用转移 → 持久化 owner session entry（best-effort，不可观测）→ 由新 State 驱动 marker/notify。renderer 只读。
- 贡献路径：adapter 提供 owner 当前 State + branch + Env → 框架纯函数决定槽位 → 返回 contribution 交宿主提交；hook 内不写进度。
- 失败契约：准入只 warn；持久化 best-effort；评估/注册错误显式失败、不静默降级；初始化失败 → 放弃 binding，不留部分注册；不维护进程级可变注册表。

### 3. 指令贡献

```ts
prompts: [
  { tag: "init",     strategy: "first-enabled-run", content: init },
  { tag: "reminder", strategy: "every-enabled-run", content: reminder },
]
```

- `tag` 必填，落盘为 `${id}:${tag}`；branch 扫描按它推导 init 进度（05）并识别旧数据。
- `strategy` 是 per-extension 槽位的激活规则；一槽位一规则（05），多规则 → 显式配置错误，组合/优先级延后 backlog。
- `display` / `attribution` 由框架固定（隐藏 + `attribution:"agent"` + 尾部追加）；不暴露参数。

### 4. marker 统一区

```ts
marker: { text: "◈ codeBaseTools" }
```

- v1 即建统一区：单一 key + placement 由框架拥有；行按扩展 `id` 稳定排序。
- enabled → 显示；off → 移除；每启用轮重设；区域为空 → 清除；`hasUI:false` 整体 no-op。
- toggle 的 notify 由框架从 `displayName` 派生 `${displayName} on/off`。
- 不引入通用布局语言；复杂 UI 归 `<ext>/runtimes/omp.ts`。

### 5. 准入（C14）

```ts
ompAdapter(definition, { supportedVersions: ["18.5.0"] })
```

- 唯一准入检查 = 版本；未列 → **每个 main 会话一次** `ctx.ui.notify(..., "warning")`，无 UI → stderr 一行；然后继续运行，不阻止加载。
- `platform` / `runtime` 不检查、不告警；作为已验证环境记录在 [agent-runtime-support.md](../../../docs/agent-runtime-support.md)。
- 角色（`user`）只记录、不作门槛（05 取代 C9 的角色硬触发）；历史保护仍是框架级必须语义，OMP 已验证，v1 不触发。
- 文案 v1 用固定英文模板（`displayName` + 实际版本 + 支持集），覆盖留后。

### 6. escape hatch 与保护

| 位置 | 允许 | 禁止 |
|---|---|---|
| `framework/core` + `behaviors` | 宿主无关逻辑 | import 宿主类型 |
| `framework/adapters/omp` | 独占原生 API：事件映射、owner 解析（`ctx.agent.parentId` + `pi.pi.AgentRegistry`）、持久化（`getBranch`/`appendEntry`）、UI 传输（`ctx.ui`）、版本探测 | 承担扩展语义 |
| `<ext>/definition.ts` + shared logic | 声明与纯函数 | import 宿主类型 |
| `<ext>/runtimes/omp.ts` | 复杂 UI 可直用原生 UI；State 写必须经框架 | 直接写 State、直接 append 历史 |
| `entrypoints/omp/<ext>.ts` | 只 re-export | 任何逻辑 |

- 保护机制 = 类型/模块边界 + import-boundary 测试；**不宣称沙箱**；框架管理的历史面 = 只有 contribution API 能追加历史。
- `private`/`protected`/`readonly` 仅编译期可见性；`#private` 运行时封装但仅 class。接口不给作者 State 句柄，read 侧只给 read view。

### 7. 确定性规则

- 命令按声明顺序注册；同名命令 → 显式配置错误。
- 每个 State 字段恰好一个 declared writer；第二个 writer → 显式配置错误。
- 所有更新经框架写路径串行；边界 seed 原子替换 cell；子代理只读。
- 任何行为不得依赖宿主注册顺序；marker 按 `id` 排序。

### 8. 后门与延后项

- 未来自定义逻辑 = 受约束纯 TS：框架只给 State `read()` / `update()`（更新经框架写路径）；框架外 I/O（如 HTTP）由扩展自担；宿主原生 API 只进 runtime assembly。**v1 不 ship 此入口。**
- 延后：其他 control kind（mode-selection / configuration-switch / parameter-setting / command-action）、mixed control、同槽位多规则/优先级、复杂 UI、pi adapter、同进程多 main、配置化持久化后端、required-semantics 声明接口、C15 正文。
