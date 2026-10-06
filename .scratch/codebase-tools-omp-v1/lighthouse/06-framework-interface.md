# 06: 确定扩展定义、行为组合与 OMP 适配接口: Lighthouse

> Question and discussion: [06: 确定扩展定义、行为组合与 OMP 适配接口](../decision/06-framework-interface.md)

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

### 追加约束（来自 [02 决策](02-candidate-support.md)，backtracer 2026-10-06）

- C14 反馈通道有**两个不同触发**，不得混同：
  1. **必须语义不满足**（历史保护等；角色部分已被 [05](05-contribution-contract.md) 改为 agent-runtime-qualified、不作门槛）→ 显式拒绝该能力；
  2. **未列 Agent 运行时版本** → 一次用户可见通知，说明未验证，然后**继续运行**（02 的准入政策），不声明支持。
- 02 已定：支持集是**精确版本枚举**（不是范围）；检查在扩展装载/绑定、注册命令与贡献之前；去重为每次会话一次。
- 未决问题：通知的确切文案、去重键（会话 vs 进程）、无 UI/无头模式下的传输方式，以及“未列版本继续运行”与“必须语义不满足拒绝”在运行时的判定先后。（本票已定，见讨论。）

### 追加约束（来自 [04 State 归属决策](04-state-ownership.md)，2026-10-06）

- 接口须覆盖 owner 解析 seam：Agent 运行时原生 `ctx.agent.parentId` + `pi.pi.AgentRegistry` 递归到 main；共享逻辑不得 import Agent 运行时类型，`pi.pi` escape hatch 限定在 OMP agent-runtime assembly，由本票明确"开放哪些原生 escape hatch"。
- 接口须覆盖 State 读面：子代理按 owner cell 只读、无写面；会话边界 seed 与界内 Map 权威的分工。

## Discussion

### 1. 作者面与四层职责

作者面 = 声明式 `defineExtension` 定义 + 纯函数；**v1 只实现 `commandToggle`**，`type` 为封闭判别联合，未来 kind 由框架按真实消费者增加。职责与依赖方向：`framework/core`（宿主无关：定义类型/State 模型/控制·贡献·反馈协议/准入/确定性）→ `framework/behaviors`（宿主无关可复用实现）→ `framework/adapters/omp`（唯一接触原生 API：事件映射、owner 解析、持久化、UI 传输、版本探测）；`extensions/<ext>/definition.ts` 只声明，`extensions/<ext>/runtimes/omp.ts` 做 runtime assembly，`entrypoints/omp/<ext>.ts` 只 re-export。公共入口 = `framework/public.ts`（`defineExtension` + 配置类型）+ `framework/adapters/omp.ts`（`ompAdapter`）；声明用纯数据对象，不用 builder。codebase-tools 不创建 `logic.ts`，「共享 TS 逻辑」= framework core/behaviors。否决 plan/effect-descriptor 统一原语（过度设计）与 raw handler 后门（退化为原生 API 包装）。

### 2. State、命令与写路径

State 为 owner 作用域（04）；`enabled` 是框架默认 boolean 字段（默认 false，落盘 `${id}:state`），`state` 可整体省略。命令：

```ts
commands: [{ type: "toggle", name: "codebase-tools", state: "enabled" }]
```

写路径（同步、单写者）：命令事件 → adapter 匹配 command → 在 owner cell 应用转移 → 持久化 owner session entry（best-effort，不可观测）→ 由新 State 驱动 marker/notify；renderer 只读。贡献路径：adapter 提供 owner 当前 State + branch + Env → 框架纯函数决定槽位 → 返回 contribution 交宿主提交；hook 内不写进度。失败契约：准入只 warn；持久化 best-effort；评估/注册错误显式失败、不静默降级；初始化失败 → 放弃 binding，不留部分注册；不维护进程级可变注册表。

### 3. 指令贡献

```ts
prompts: [
  { tag: "init",     strategy: "first-enabled-run", content: init },
  { tag: "reminder", strategy: "every-enabled-run", content: reminder },
]
```

`tag` 必填，落盘 `${id}:${tag}`；branch 扫描按它推导 init 进度（05）并识别旧数据。`strategy` 是 per-extension 槽位的激活规则；一槽位一规则（05），多规则 → 显式配置错误，组合/优先级延后 backlog。`display` / `attribution` 由框架固定为隐藏 + `attribution:"agent"` + 尾部追加，不暴露参数。

### 4. marker 统一区

```ts
marker: { text: "◈ codeBaseTools" }
```

v1 即建统一区：单一 key + placement 由框架拥有；行按扩展 `id` 稳定排序。enabled → 显示；off → 移除；每启用轮重设；区域为空 → 清除；`hasUI:false` 整体 no-op。toggle 的 notify 由框架从 `displayName` 派生 `${displayName} on/off`。不引入通用布局语言；复杂 UI 归 `<ext>/runtimes/omp.ts`。

### 5. 准入（C14）

```ts
ompAdapter(definition, { supportedVersions: ["18.5.0"] })
```

唯一准入检查 = 版本；未列 → 每个 main 会话一次 `ctx.ui.notify(..., "warning")`，无 UI → stderr 一行；然后继续运行，**不阻止加载**。`platform` / `runtime` 不检查、不告警，作为已验证环境记录在 [agent-runtime-support.md](../../../docs/agent-runtime-support.md)。角色（`user`）只记录、不作门槛（05 取代 C9 的角色硬触发）；历史保护仍是框架级必须语义，OMP 已验证、v1 不触发。文案 v1 用固定英文模板（`displayName` + 实际版本 + 支持集），覆盖留后。

### 6. escape hatch 与保护

| 位置 | 允许 | 禁止 |
|---|---|---|
| `framework/core` + `behaviors` | 宿主无关逻辑 | import 宿主类型 |
| `framework/adapters/omp` | 独占原生 API：事件映射、owner 解析（`ctx.agent.parentId` + `pi.pi.AgentRegistry`）、持久化（`getBranch`/`appendEntry`）、UI 传输（`ctx.ui`）、版本探测 | 承担扩展语义 |
| `<ext>/definition.ts` + shared logic | 声明与纯函数 | import 宿主类型 |
| `<ext>/runtimes/omp.ts` | 复杂 UI 可直用原生 UI；State 写必须经框架 | 直接写 State、直接 append 历史 |
| `entrypoints/omp/<ext>.ts` | 只 re-export | 任何逻辑 |

保护机制 = 类型/模块边界 + import-boundary 测试；**不宣称沙箱**；框架管理的历史面 = 只有 contribution API 能追加历史。`private`/`protected`/`readonly` 仅编译期可见性，`#private` 运行时封装但仅 class；接口不给作者 State 句柄，read 侧只给 read view。

### 7. 确定性规则

命令按声明顺序注册，同名命令 → 显式配置错误；每个 State 字段恰好一个 declared writer，第二个 writer → 显式配置错误；所有更新经框架写路径串行，边界 seed 原子替换 cell，子代理只读；任何行为不得依赖宿主注册顺序，marker 按 `id` 排序。

### 8. 后门与延后项

未来自定义逻辑 = 受约束纯 TS：框架只给 State `read()` / `update()`（更新经框架写路径），框架外 I/O（如 HTTP）由扩展自担，宿主原生 API 只进 runtime assembly；**v1 不 ship 此入口**。延后：其他 control kind（mode-selection / configuration-switch / parameter-setting / command-action）、mixed control、同槽位多规则/优先级、复杂 UI、pi adapter、同进程多 main、配置化持久化后端、required-semantics 声明接口、C15 正文。

---

## Decision

用一份声明式 `defineExtension`（v1 仅 `commandToggle`）加 `ompAdapter(definition, { supportedVersions })` 组成小而完整的公共接口：State 为 owner 作用域、单写者、命令式转移；贡献按 `${id}:${tag}` + strategy 由 State+branch 纯函数决定；marker 进框架统一区；准入只对版本做一次通知后继续；复杂逻辑只以受约束纯 TS 预留，不引入通用插件总线。

## User stories

1. 作为扩展作者，我想要只写一份声明式 `defineExtension`、不接触原生 API，以便宿主差异、生命周期与持久化由框架承担。
2. 作为框架维护者，我想要 codebase-tools 的全部行为都能声明式表达，以便 v1 不引入消费者缺失的抽象（`logic.ts`、scheduler、插件总线）。
3. 作为扩展作者，我想要命令声明为对某个 State 字段的类型化转移，以便 command↔State 的关联静态可见。
4. 作为框架维护者，我想要 v1 只实现 `commandToggle` 且 `type` 为封闭判别联合，以便未来控制 kind 是增量、且永不包装原生 API。
5. 作为用户，我想要 `/codebase-tools` 翻转 owner 作用域的 `enabled`、子代理只读实时跟随，以便并行子代理不会污染意图。
6. 作为框架维护者，我想要所有 State 写入经框架单写者路径（更新 → 持久化 → 反馈），以便持久化、恢复与竞争规则集中一处。
7. 作为框架维护者，我想要贡献决策是 State+branch 的纯函数、hook 内不写进度，以便重入、取消与 `/tree` 天然幂等。
8. 作为用户，我想要 init/reminder 由 `tag` 身份与 strategy 选择，以便旧数据被识别、branch 推导的进度自洽。
9. 作为用户，我想要 marker 出现在框架统一区域并按 `id` 稳定排序，以便扩展不抢 widget、顺序可预期。
10. 作为用户，我想要 Agent 运行时版本未列时只收到一次明确通知后仍可继续使用，以便小版本升级不被打断。
11. 作为框架维护者，我想要 platform/runtime 与交付角色只记录、不作门槛，以便支持声明精确但不阻断准入。
12. 作为框架维护者，我想要 `pi.pi` 与原生 UI 只出现在 OMP adapter/runtime assembly，以便 shared logic 跨 Agent 运行时保持可移植。
13. 作为框架维护者，我想要确定性规则（声明顺序、单写者、按 `id` 排序、显式冲突错误），以便行为永不依赖宿主注册顺序。
14. 作为扩展作者，我想要未来的复杂逻辑只以受约束纯 TS（State read/update + 自担 I/O）进入，以便框架保留历史与持久化保证。
15. 作为人类或 agent，我想要一份列全 `defineExtension` / `ompAdapter` 各参数含义的能力与选项清单，以便快速找到能力入口而不必读实现。

## Preconditions

- 01 已 resolved：codebase-tools @34d7c40 为需求 oracle；C1–C15；“启用轮” = 一次 agent-run initiation；init/reminder 为两个独立槽位。
- 02 已 resolved：唯一精确组合 OMP 18.5.0（源码 @9348320）+ Windows x64 + Bun 1.4.2；准入检查在注册命令与贡献之前；未列 → 一次通知 + 继续；探针隔离。
- 03 已 resolved：OMP 18.5.0 经扩展接口验证发现/命令/state 持久化/恢复/子代理身份与继承/UI 转发/出站序列化/失败顺序；custom 贡献出站 `user`；子代理 `hasUI:false`。
- 04 已 resolved：owner 作用域 `{on}`（本票起称 `{enabled}`）；子代理只读 live-follow；持久化为 owner 会话 JSONL；owner 解析用 `parentId` + `pi.pi.AgentRegistry`；界内 Map 权威、`/tree` 不刷新 `on`；首版单 main。
- 05 已 resolved：隐藏持久化 `custom_message` + 尾部追加；角色 host-qualified、不作门槛；init 进度按 branch 推导、state 只留 `{on}`；一槽位一规则；贡献决策是 State+branch 纯函数。
- [ADR-0002](../../../docs/adr/0002-semantic-extension-framework.md) 的 `framework/` + `extensions/` + `entrypoints/` 布局与“宿主无关 shared logic”约束成立；[GLOSSARY.md](../../../GLOSSARY.md) 的 Agent runtime / Injected prompt / State / owner 词条成立。

## Postconditions

- 公共接口骨架固定：`defineExtension` 键 = `id` / `displayName` / `state` / `commands` / `prompts` / `marker`；`ompAdapter(definition, { supportedVersions })`。
- v1 控制面只有 `commandToggle`；`type` 封闭判别联合。
- prompts 身份 = `${id}:${tag}`；strategy = `first-enabled-run` / `every-enabled-run`；一槽位一规则。
- marker = 框架统一区、`{ text }`、框架拥有 key/placement/排序(`id`)/生命周期/无 UI。
- 准入 = 仅 `supportedVersions`，未列每个 main 会话一次通知 + 继续；platform/runtime 不检查；角色只记录。
- 确定性规则与 escape hatch 边界固定（见 Invariants）。
- 后门（受约束纯 TS）与其他 control kind 明确延后；C15 文档要求固定为“列全参数含义、不写实现”。
- 07/08 可据此推进：07 采用 adapter/runtime-assembly 分层与薄入口；08 验收须覆盖版本通知、无 UI 传输、角色记录与 marker 生命周期。

## Invariants

- shared logic 永不 import Agent 运行时类型；`pi.pi` 只出现在 OMP adapter。
- State 为 owner 作用域、单写者；子代理只读 live-follow，无写面。
- 不引入通用插件总线、无消费者 scheduler、raw handler、空壳 pi adapter。
- 历史保护：只有 contribution API 能追加历史；隐藏持久化 `custom_message` + 尾部追加；不改写。
- 贡献决策是 State + branch 的纯函数；hook 内不推进进度。
- 确定性不依赖宿主注册顺序；marker 按 `id` 排序；冲突显式报错。
- 术语：Agent runtime（不用 host）、Injected prompt（不用 instruction contribution）、`tag`、`id`/`displayName`。
- 不宣称沙箱：TS 可见性（`private`/`readonly`/`#private`）不是保护机制。
