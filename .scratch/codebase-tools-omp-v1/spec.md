# 首版语义扩展框架与 codebase-tools 完整迁移（OMP 适配）

Status: ready-for-agent
Feature: codebase-tools-omp-v1
Tracker: `.scratch/codebase-tools-omp-v1/`
Contract: [contract.md](contract.md)（已批准；Acceptance mode: Rapid iteration）
来源: [map.md](map.md)（Destination / Notes / Decisions so far / Out of scope）、8 张 resolved 决策票及其 lighthouse、[acceptance-plan.md](acceptance-plan.md)

---

## Problem Statement

用户（框架维护者，同时是 codebase-tools 的使用者）目前只有一个直接绑定 OMP 原生 ExtensionAPI 的 codebase-tools 扩展实现：开关、init/reminder 注入、隐藏持久化消息、会话/分支恢复、子代理实时跟随、marker/notify 等业务行为与 OMP 原生语义钩子、State 存储和 UI 调用直接耦合。它既无法在保持行为的前提下迁移，也没有一套可复用的框架来承载第二个扩展。

要解决的问题是：**在没有框架源代码、没有迁移后的扩展、也没有可运行验收证据的情况下，首版语义扩展框架无法落地。** 决策虽已在 map 中锁定，但还没有一份可供实施与验收的规格；同时用户明确要求：

- 只能通过 extension 实现能力，不允许修改 Agent 源码，不允许 monkey-patch Agent 运行时内部实现；
- 只在明确验收的精确 Agent 运行时组合上承诺行为，不承诺普遍兼容；
- Agent 运行时不满足必要语义时必须显式拒绝，而不是静默降级或用弱语义替代。

## Solution

在 my-agent-toolkit 内交付首版**语义扩展框架**的共享源码，并用它完整迁移 codebase-tools 到 OMP：

- **框架源码**：宿主无关的语义核心（extension definition、State 模型、控制/注入提示词/反馈协议、准入与确定性规则）、**行为库（behavior library）**，以及唯一接触 OMP 原生 API 的 OMP adapter。
- **codebase-tools 扩展**：声明式 extension definition + 共享逻辑 + OMP runtime assembly。
- **薄入口**：每个扩展一个只 re-export OMP assembly 的入口，作为 Agent 运行时唯一的发现点。
- **精确支持基线（Supported agent-runtime baseline）**：本地源码 checkout `oh-my-pi@9348320`（= 18.5.0）+ Windows x64 + Bun 1.4.2；运行/验收产物 = 隔离精确安装 `@oh-my-pi/pi-coding-agent@18.5.0`。
- **两套测试分目录**：codebase-tools 扩展验收（消费者可见行为）+ 框架能力测试（C1–C15，兼 Agent 运行时升级回归警报）。
- **文档与脚本**：文档索引 + 升级 runbook、能力与选项清单、四状态支持记录、隔离升级脚本。

用户最终得到的是：codebase-tools 在验证过的 OMP 组合上保持原有消费者可见行为（默认关闭、命令切换、init/reminder 注入、隐藏持久化、恢复、子代理实时跟随、marker/notify），共享行为由框架承载，Agent 运行时不满足必要语义时被显式拒绝。

**持久化兼容（两个方向）已由用户显式放弃**：新实现只读写 `{enabled}`，不读旧 `{on}`，旧会话恢复为 off，用户需重新 toggle；数据转换、导入与回退均不提供。

## User Stories

### 框架与作者面

1. 作为框架维护者，我想要一份仓库内的共享框架源码，以便业务行为与 OMP 原生 API 解耦，且未来扩展复用同一框架而不复制代码。
2. 作为扩展作者，我想要只写一份声明式 extension definition、不接触原生 Agent 运行时 API，以便宿主差异、生命周期与持久化由框架承担。
3. 作为扩展作者，我想要框架的公共入口足够小（`defineExtension` + OMP adapter 装配），以便不必理解整个原生 ExtensionAPI 就能定义扩展。
4. 作为框架维护者，我想要 extension definition 覆盖 `id`、`displayName`、`state`、`commands`、`prompts`、`marker`，以便 codebase-tools 的全部行为都能声明式表达。
5. 作为框架维护者，我想要 v1 只实现 command toggle 且 `type` 为封闭判别联合，以便未来控制 kind 是增量扩展、永不退化为原生 API 包装。
6. 作为框架维护者，我想要框架核心与行为库不 import Agent 运行时类型，以便共享逻辑可以跨 Agent 运行时移植。
7. 作为框架维护者，我想要清晰的职责分层（语义核心 / 行为库 / OMP adapter / 扩展 runtime assembly），以便 Agent 运行时差异有唯一归属、业务规则不落错层。
8. 作为框架维护者，我想要原生 escape hatch（`pi.pi`、原生 UI）只出现在 OMP adapter 与扩展 runtime assembly，以便共享逻辑保持宿主无关。
9. 作为扩展作者，我想要受约束的纯 TS 后门被明确延后而不是半成品放出，以便首版不引入无消费者的抽象。
10. 作为人类或 agent，我想要一份能力与选项清单文档，以便快速找到 `defineExtension` / OMP adapter 的能力入口，而不必先读实现。

### State、Owner 与子代理

11. 作为主会话用户，我想要 State 是按 extension、按 owner 作用域的当前值来源，以便不同会话/扩展之间互不污染。
12. 作为 owner 主会话，我想要成为激活 State 的唯一写者，以便子代理不能悄悄改变 owner 的意图。
13. 作为子代理会话，我想要每轮实时跟随所属 owner 的当前激活值，以便主会话切换后下一轮即生效、无需重启。
14. 作为用户，我想要每个会话各自按自己的 branch 推导 init 进度，以便 resume 或 `/tree` 在缺少注入提示词时恰好重新 init。
15. 作为框架维护者，我想要 owner 解析复用 Agent 运行时原生的 parent 链与注册表，以便框架只维护一个活动映射、不重新实现 agent 图。
16. 作为框架维护者，我想要 owner 键是 owner 会话身份（main 会话身份，而非进程级标签），以便嵌套子代理逐级上溯到同一个 root owner。
17. 作为用户，我想要 resume/switch/fork 时从目标 branch 的持久化 State 恢复激活值，以便之前开着的会话恢复后仍然开着。
18. 作为用户，我想要 `/tree` 导航不改变激活值、只重算 init 进度，以便 State 表现为会话全局变量而非 branch 内容的投影。
19. 作为用户，我想要 owner 缺失/不可解析时降级为 off 且不可 toggle，而不是臆造或串扰，以便多会话隔离永不泄露另一个 owner 的 State。
20. 作为用户，我想要 owner 不可解析时有一次可选 best-effort 提示（无 UI 走 stderr），以便我知道为什么命令不可用，而这不属于准入拒绝通道。
21. 作为框架维护者，我想要 State 持久化为 owner 会话 JSONL 中的非 LLM custom entry，以便保留原持久化介质、无需通用存储封装。
22. 作为用户，我想要持久化失败不阻塞命令反馈与同进程读取（内存当前值权威），以便 best-effort 语义明确、不被当作 durability 承诺。
23. 作为用户，我想要新版只读写 `{enabled}`、不读旧 `{on}`，以便迁移放弃持久化兼容后语义自洽。
24. 作为用户，我想要新写 `{enabled}` 后经重启/resume 读回 `{enabled}`，以便新实现自身的持久化往返被验证。
25. 作为框架维护者，我想要首版只支持单 main，并把同进程多 main 的已知限制记录在案，以便未支持场景不被静默宣称。

### 控制与反馈

26. 作为用户，我想要 `/codebase-tools` 翻转 owner 作用域的激活值，以便从命令面控制扩展。
27. 作为用户，我想要 toggle 后收到 `${displayName} enabled` / `${displayName} disabled` 通知，以便对当前状态有明确反馈。
28. 作为用户，我想要 marker 出现在框架统一区域、按扩展 `id` 稳定排序，以便扩展不抢 widget、顺序可预期。
29. 作为用户，我想要 marker 在每启用轮重设、off 时清除，以便状态显示与 State 一致。
30. 作为用户，我想要 `hasUI:false` 时 marker 整体 no-op、通知走 stderr，以便无头/无 UI 路径不崩溃。
31. 作为框架维护者，我想要命令转移 → 持久化 → marker/notify 的顺序确定，以便控制反馈路径可预测、可测试。
32. 作为框架维护者，我想要命令按声明顺序注册、同名命令显式配置错误，以便行为不依赖 Agent 运行时注册顺序。
33. 作为框架维护者，我想要每个 State 字段恰好一个声明写者、第二个写者显式报错，以便写竞争在配置期暴露。
34. 作为框架维护者，我想要初始化失败时放弃 binding、不留部分注册，以便失败可诊断且无残留状态。

### 注入提示词与历史保护

35. 作为用户，我想要注入提示词在 TUI 不可见但持久化进历史，以便 resume 时被重放且不占界面。
36. 作为用户，我想要 on 后的首个启用轮恰好注入一条 init，以便提示词时机与原行为一致。
37. 作为用户，我想要之后每个启用轮恰好注入一条 reminder，以便不被 init 进度干扰。
38. 作为扩展作者，我想要贡献决策只依赖持久化 State 与当前 branch 内容，以便同一轮重入、pre-commit 取消和 `/tree` 回溯下不会漏注入或重复注入。
39. 作为框架维护者，我想要 init 进度由“当前 branch 是否已有该槽位的注入提示词身份”推导，以便回退删除消息后语义自洽。
40. 作为用户，我想要 State 只持久化 `{enabled}` 这个会话级开关，以便不必为 init 维护第二个冗余标志。
41. 作为框架维护者，我想要首版每个注入提示词槽位恰好一条规则、多命中显式报错，以便不依赖 Agent 运行时注册顺序。
42. 作为框架维护者，我想要注入提示词身份为 `${id}:${tag}`、策略为 first-enabled-run / every-enabled-run，以便 init 与 reminder 是独立槽位。
43. 作为用户，我想要注入提示词隐藏、尾部追加、归属 agent，且历史只追加不改写/不重排，以便历史保护成立。
44. 作为框架维护者，我想要交付角色是 agent-runtime-qualified capability、由 OMP adapter 按 provider 路径记录实际 wire 角色，以便支持声明不把内部角色当成跨 Agent 运行时权威。
45. 作为用户，我想要 deepseek 与 openai-codex 路径的实际出站角色被记录为验收事实，以便迁移不声称未被证明的 developer 权威。
46. 作为框架维护者，我想要其他 Agent 运行时的贡献角色/权威语义保持未决、首版不承诺，以便不静默弱化必要语义。

### 支持基线与拒绝反馈

47. 作为框架维护者，我想要支持集是精确版本枚举（`supportedVersions: ["18.5.0"]`）而非范围，以便支持声明与实测证据一致。
48. 作为用户，我想要未列 Agent 运行时版本收到一次明确通知后继续可用，以便小版本升级不打断日常使用，也不被误当作已支持。
49. 作为用户，我想要 Agent 运行时不满足必须语义时被显式拒绝（放弃 binding、不留部分注册），以便不会静默降级或用弱语义替代。
50. 作为框架维护者，我想要“未列版本”与“必须语义缺失”是两个独立触发、不得混同，以便准入策略可审计。
51. 作为用户，我想要拒绝/告警反馈走非模型通道（通知或 stderr），以便不写入模型指令或会话历史。
52. 作为框架维护者，我想要通知去重为每个 main 会话一次，以便重复装载/重入不会刷屏。
53. 作为框架维护者，我想要 platform/runtime 只记录、不作准入门槛，以便支持声明精确但不阻断准入。

### 部署、装载与升级

54. 作为框架维护者，我想要装载点是一个按扩展拆分的薄入口目录（非聚合工厂、无根 `index.ts`），以便 Agent 运行时只发现薄入口。
55. 作为用户，我想要开发/验收期用 explicit-only 干净运行新扩展，以便不触碰默认配置与旧实现即可测试新版。
56. 作为用户，我想要验收通过后再做永久 cutover（删除旧 codebase-tools + 加新根目录条目 + 重启），以便验收失败时默认环境与旧实现完好。
57. 作为框架维护者，我想要防双注册靠装载来源互斥而非扩展名探测，以便同名新旧实现绝不双载。
58. 作为用户，我想要只有整进程重启才生效、不依赖热重载或模块缓存，以便切换/验证语义明确。
59. 作为框架维护者，我想要固定修订锚点（本地 checkout）、运行/验收产物（隔离精确安装）与依赖 lockfile，以便验收证据同源。
60. 作为框架维护者，我想要升级触发为按需、默认/CI 只跑固定 18.5.0，以便小版本更新不拖累开发基线。
61. 作为维护者，我想要候选版本经运行期参数在隔离前缀安装并跑框架能力套件，以便不影响日常运行的 Agent 运行时与它 spawn 的子代理。
62. 作为维护者，我想要绿灯只作回归警报、人工 TUI 抽查通过后才由维护者显式替换单一支持版本，以便未验证版本不会自动获得支持声明。
63. 作为用户，我想要升级触及扩展可见面（marker 渲染、命令、注入顺序/角色、恢复）时追加一次人工 TUI 抽查，以便 TUI 视觉回归不被自动套件盲区漏掉。
64. 作为用户，我想要日常未列版本作为真实隔离验收场景，以便准入分支有真实证据且支持声明只写 18.5.0。

### 验收与测试

65. 作为框架维护者，我想要一份验收矩阵把 10 条行为 oracle、C1–C15 与负例映射到场景/真实路径/证据/执行者，以便实施不在验收定义上临时决定。
66. 作为框架维护者，我想要两套测试分目录、分责任，以便消费者可见行为与框架不变量互不掩盖。
67. 作为用户，我想要 codebase-tools 的可见行为在真实交互 TUI 由我亲自验收，以便 marker/notify/命令切换按真实使用面确认。
68. 作为框架维护者，我想要真实内建子代理路径（非 mock）验证实时跟随与独立 init 进度，以便继承契约有真实依据。
69. 作为框架维护者，我想要对实际消息顺序、角色、历史不变性和工具续轮做出站/存储观察，以便事务与提交语义不靠猜测。
70. 作为框架维护者，我想要 mock 不冒充 provider、task 或 TUI 证明，以便证据等级不越级。
71. 作为框架维护者，我想要 openai-codex 出站证据分两层（层1 本地 probe shape-only、层2 真凭据真实送达），以便角色/顺序按 provider 路径记录为事实。
72. 作为用户，我想要 wizard 在隔离 agent dir 提供 openai-codex 凭据且 secret 不进上下文，以便真实捕获安全可重复。
73. 作为框架维护者，我想要永久测试只断言消费者可见行为/必须语义、不 pin 文案/布局/转发实现/测试后门，以便测试稳定且不锁死实现。
74. 作为框架维护者，我想要临时探针与最终回归责任分离，以便探针证据不冒充永久回归。
75. 作为框架维护者，我想要未验证/已知不支持用统一四状态记录，以便支持声明与证据等级不混淆。
76. 作为框架维护者，我想要长期升级标准只覆盖框架能力，以便具体扩展能力不成为长期标准的耦合项。
77. 作为框架维护者，我想要 C14 拒绝路径用可注入测试 adapter 真跑，以便「必须语义缺失 → 拒绝」是被验证的能力而非声明。

### codebase-tools 行为 oracle（迁移后必须保持）

78. 作为用户，我想要干净会话加载时默认关闭、无贡献、无 marker、出站无 init/reminder。
79. 作为用户，我想要两次 `/codebase-tools` 分别写 `{enabled:true}` / `{enabled:false}` 并给出对应 notify 与 marker 状态。
80. 作为用户，我想要开启后首个启用轮恰好一条 init、`display:false`、`attribution:"agent"`、尾部追加。
81. 作为用户，我想要之后每个启用轮恰好一条 reminder，不被 init 进度干扰。
82. 作为用户，我想要注入随轮落盘，resume 后历史重放仍含该消息，且 customType/可见性/归属/位置正确。
83. 作为用户，我想要 marker 每启用轮重设、off 清除、无 UI 时整体 no-op。
84. 作为用户，我想要 off 后再启用轮无注入，且历史与 init 进度不被清除；再开启走 reminder（进度保留）。
85. 作为用户，我想要 resume 恢复激活值；无 entry 或非法数据（含旧 `{on}`）回落 off；`new`/`fork` 为 off；`/tree` 只重算 init、不改激活值。
86. 作为用户，我想要内建子代理实时跟随 owner 当前激活值（非创建快照）、各自 init 进度；enabled 且无 init → init，enabled 且有 init → reminder，off → 静默。
87. 作为用户，我想要两个提示词资源独立按文本加载，且不自动探测/启用 MCP 或 LSP、不按子代理工具裁剪。
88. 作为用户，我想要同一启用轮内 `before_agent_start` 重入不重复注入；pre-commit 取消后 branch 无 init 则重新 init。

## Implementation Decisions

以下为 map 中已锁定的决策。**seams（模块内部接口与 promise 位置）留给 `/to-contract`，本规格不在此选择 seam；** 仅记录已定的架构与行为契约。

### 1. 分层与依赖方向（架构决策）

- 四层职责：**语义核心**（宿主无关：definition 类型、State 模型、控制/注入提示词/反馈协议、准入与确定性规则）→ **行为库（behavior library）**（宿主无关的可复用实现）→ **OMP adapter**（唯一接触原生 API 的位置：事件映射、owner 解析、持久化、UI 传输、版本探测）→ **扩展 runtime assembly**。
- 每个扩展一份共享 definition + 共享逻辑 + 各自的 runtime assembly；Agent 运行时入口只 re-export 对应 assembly，不含逻辑。
- 共享逻辑永不 import Agent 运行时类型；`pi.pi` escape hatch 与原生 UI 仅限 OMP adapter / 扩展 runtime assembly。
- codebase-tools 不需要独立的 feature logic 文件：其“共享逻辑”即框架核心与行为库的组合。
- 公共入口收敛为两个：定义入口（`defineExtension` + 配置类型）与 OMP 装配入口（`ompAdapter`）。声明式纯数据对象，不引入 builder、通用插件总线、scheduler 或 raw handler 后门。

### 2. Extension definition 形状

| 键 | 含义 | codebase-tools 取值 |
|---|---|---|
| `id` | 扩展稳定身份，贡献身份前缀 | `codebase-tools` |
| `displayName` | 反馈文案来源 | `codeBaseTools` |
| `state` | 声明式 State 字段；字段名即持久键，默认 boolean `false`；可整体省略 | 默认 `enabled` |
| `commands` | 命令声明；v1 仅 `type: "toggle"`（对某 State 字段的转移） | `{ type: "toggle", name: "codebase-tools", state: "enabled" }` |
| `prompts` | 注入提示词槽位：`tag` + `strategy` + `content`；策略 = `first-enabled-run` / `every-enabled-run` | init → first-enabled-run；reminder → every-enabled-run |
| `marker` | 框架统一状态区文本；key/placement/排序/生命周期由框架拥有 | `{ text: "◈ codeBaseTools" }` |

- v1 控制面只有 command toggle；`type` 为封闭判别联合。
- 注入提示词身份 = `${id}:${tag}`（codebase-tools 即 `codebase-tools:init` / `codebase-tools:reminder`）。
- `display` 固定为 false、`attribution` 固定为 `"agent"`、尾部追加，均不由扩展作者配置。

### 3. State 模型与持久化

- State 是 owner 作用域的单一当前值来源；codebase-tools 的 State 只有 boolean `enabled`（默认 false）。
- 读面与写面分离：renderer 只读；写只经框架单写者写路径；子代理无写面、只读实时跟随。
- 持久介质 = owner 会话 JSONL 中 agent-runtime-owned、非 LLM 的 `custom` entry `codebase-tools:state`，payload `{ enabled: boolean }`。
- 框架只维护一个活动 `Map<ownerKey, StateCell>`；ownerKey = owner 会话身份（`kind: "main"` + sessionId，用可移植 correlate），不使用进程级标签 `"Main"`。
- 会话边界（session start / switch new|resume|fork / branch 新身份）从目标 branch 末条 state entry seed 激活值（无则 off）并退役旧 cell；同一会话存续期内 Map 权威、不重读；`/tree`（同 sessionId、仅 leaf 变）不 seed `enabled`，只重算 init 进度。
- 非法/未知 state 数据回落 off。落盘失败 best-effort：扩展侧无法观测落盘失败；命令反馈与同进程读取以内存当前值为准，不承诺 durability。

### 4. Owner 解析与子代理继承

- owner = 沿 parent 链上溯遇到的最近一个 top-level main 会话（main 的 owner 是它自己）；parent agent 仅在 depth 1 时等于 owner。
- 解析使用 Agent 运行时原生 `ctx.agent.parentId` + 官方注入的 `pi.pi.AgentRegistry` 递归到 `kind === "main"`；不得用 depth 或进程全局推断。
- 子代理对 owner State 只读、每轮实时读取（live following），不是整份拷贝、创建时快照或共享写。
- 嵌套子代理逐级上溯，最终跟随 root owner；后台 fork（无 `before_subagent_spawn`）沿用同一跟随规则，解析得到则跟随、否则 off。
- owner 不可解析/不存在 → off 且不可 toggle；有通道时一次可选 best-effort 提示（无 UI 走 stderr），不属于准入/拒绝触发。
- 会话私有值（如 init 进度）不继承；子代理不持久化自己的激活值。
- 首版仅支持单 main；同进程多 main（ACP/cmux/embedded 或 `/new` 后旧子代理存活）不在支持集，native 解析可能取错 owner，记录为已知限制。

### 5. 注入提示词与语义钩子

- 一次“启用轮” = 一次 agent-run initiation（语义钩子 `before_agent_start`，每用户轮至多一次）；工具续轮与同一 run 内多模型请求不重触发；不触达 provider 的命令轮不计。
- 贡献决策是“持久化 State + 当前 branch 内容”的纯函数；hook 内不推进进度、不写 State。
- init 进度 = 当前 branch 是否已有该槽位的注入提示词身份（`codebase-tools:init`）；不使用 `initInjected` 字段。
- off → 无贡献；enabled + 当前 branch 无 init 消息 → init；enabled + 已有 init 消息 → reminder；子代理按 owner 当前 enabled + 自身 branch 推导。
- 注入提示词是隐藏（`display:false`）+ 持久化 `custom_message` + 尾部追加；`attribution:"agent"`；历史保护：只追加，不重写/重排/删除既有条目、不加取消消息。
- 同一轮重入天然幂等（branch 事实不变，最终 attempt 提交同一条消息）；pre-commit 取消与 `/tree` 回溯自然回到 init。
- 首版每个槽位恰好一条规则；同槽位多规则 = 显式配置错误；组合/优先级延后。
- 不引入 request-only prompt、context filtering 或新的业务提示词。

### 6. 交付角色（agent-runtime-qualified capability）

- 注入提示词的交付角色是 agent-runtime-qualified capability，不是框架共同必须语义；框架不提供跨 Agent 运行时的 developer 保证。
- OMP adapter 按 provider 路径记录实际序列化 wire 角色（deepseek/openai-codex 的 custom message = `user`）；codebase-tools 在 OMP 显式接受该交付。
- 角色作为验收事实记录，不作启用/拒绝门槛；未测路径标 unverified；其他 Agent 运行时保持未决。
- 不得用 system prompt 改写或 user 消息静默替代来伪造角色；也不得框架级删除其他 Agent 运行时可能需要的角色能力。

### 7. 控制、反馈与确定性

- 写路径（同步、单写者）：命令事件 → adapter 匹配 → 在 owner cell 应用转移 → 持久化 owner session entry → 由新 State 驱动 marker/notify；renderer 只读。
- toggle notify 文案 = `${displayName} enabled` / `${displayName} disabled`（codebase-tools ⇒ `codeBaseTools enabled` / `codeBaseTools disabled`）。
- marker 进框架统一区，单一 key + placement 由框架拥有，按扩展 `id` 稳定排序；State true → 显示、false → 移除、每启用轮重设、区域为空 → 清除；`hasUI:false` 整体 no-op。
- 命令按声明顺序注册；同名命令、同字段双写者、同槽位多规则均为显式配置错误，不静默取其一。
- 所有更新经框架写路径串行；边界 seed 原子替换 cell；任何行为不得依赖宿主注册顺序。
- 初始化失败 → 放弃 binding，不留部分注册；不维护进程级可变注册表。

### 8. 准入与拒绝

- 准入检查仅在扩展装载/绑定、注册命令与贡献之前；唯一准入检查 = 版本，`supportedVersions: ["18.5.0"]`（精确枚举，非范围）。
- 未列版本 → 每个 main 会话一次用户可见 `ctx.ui.notify(..., "warning")`（无 UI → stderr 一行），然后**继续运行**、不声明支持、不阻止加载。
- 必须语义缺失（如历史保护无法满足）→ **显式拒绝该能力**、放弃 binding、不留部分注册；拒绝优先于“未列版本继续运行”。
- platform / runtime 不检查、不告警，只作为已验证环境记录。
- 历史保护是框架级必须语义；OMP 18.5.0 已验证，首版不触发拒绝。

### 9. 部署、发现与切换

- 发现根按 Agent 运行时分离，OMP 只扫描 OMP 入口目录；每个扩展一个薄入口，不聚合、无根 `index.ts`。
- loader 必须能解析发现目录之外的共享源码、Markdown 文本资源与裸依赖（03 已证）。
- 防双注册 = 装载来源互斥（开发/验收 explicit-only；永久切换后配置只留新根目录条目），不按扩展名去重、不用 `disabledExtensions`。
- 开发/验收：隔离 agent state + `--no-extensions -e <OMP 入口目录>` + 受控会话，不碰默认配置。
- 永久 cutover（验收通过后由用户执行）：删除旧 codebase-tools 实现 + 配置中加入新根目录条目 + 重启；回退 = 回到原 git 修订。
- 只承诺整进程重启后源码变更生效；代码热重载延后，不作为切换机制。

### 10. 持久化兼容（已放弃）

- 两个方向均放弃：新实现只读写 `{enabled}`，不读旧 `{on}`、不写 `initInjected`；旧会话 resume 后回落 off；不提供转换、导入或兼容 shim。
- 验证收窄为新实现自洽：新写 `{enabled}` → 重启/resume 读回 `{enabled}`。
- ADR-0002 的框架默认双向兼容保留给其他迁移；codebase-tools 记为显式「无持久化兼容」豁免。

### 11. 基线、支持记录与升级

- 需求 oracle = `codebase-tools @34d7c40`（连 lockfile）；修订锚点 = 本地 `oh-my-pi` checkout `@9348320`（= 18.5.0）；运行/验收产物 = 隔离精确安装 `@oh-my-pi/pi-coding-agent@18.5.0`；平台 Windows x64 + Bun 1.4.2。
- 支持记录统一在 `docs/agent-runtime-support.md`，四状态：`verified-supported` / `verified-unlisted` / `unverified` / `unsupported`，每条带证据与条件。
- 升级纯按需：候选版本经运行期参数（推荐 `OMP_TEST_VERSION=<v>`）在隔离前缀精确安装并跑框架能力套件 = 「基本验证」；默认/CI 只跑固定 18.5.0。
- 绿灯只作回归警报；支持声明是维护者显式决定：候选套件通过 →（触及扩展可见面时）人工 TUI 抽查 → 维护者显式替换单一支持版本 + 更新支持记录 + 重启。
- 日常未列版本（如 18.6.1）不固定，作为「未列版本通知一次 + 继续」的真实隔离场景。

### 12. 测试结构（结构决策，非 seam）

- 两套测试分目录、分责任：扩展验收（消费者可见行为，源自 10 条行为 oracle）与框架能力测试（C1–C15 必须语义，兼 Agent 运行时升级回归警报）。
- 永久测试只保留能捕获消费者可见回归/必须语义的断言；不 pin 提示词文案、文件布局、转发实现或测试后门。
- 临时探针（`.scratch/codebase-tools-omp-v1/assets/03/`）是证据来源，不作永久回归。
- C14 拒绝路径用可注入测试 adapter 真跑，不只验通道存在。
- 真实 provider 证据不得由 mock 冒充；未测路径标 unverified。

### 13. 文档与脚本交付

- 文档索引 + 升级 runbook（隔离安装 → 框架套件 → 扩展套件 → 触及面 TUI 抽查 → 显式替换）。
- 能力与选项清单：列全 `defineExtension` / `ompAdapter` 参数含义、指向源码、不写实现。
- 支持记录四状态文档（见 §11）。
- 升级脚本（如隔离安装 + 跑框架套件并记录结果）。

### 14. 硬约束

- 不修改 Agent 源码、不维护 fork/补丁、不 monkey-patch、不通过绕过 extension 接口改变 Agent 运行时内部行为；只用 extension 接口 + §1 限定的 `pi.pi` escape hatch。
- 不修改默认全局安装、正式配置或运行中 agent；探针/验收一律隔离。
- Agent 运行时不满足必须语义时显式拒绝，不静默降级、不用弱语义替代。

## Testing Decisions

（以下是对话中已定的测试前例与约束，不是 seam 决策；seams、各 promise 的测试位置与覆盖由 `/to-contract` 决定。）

- **测试前例（prior art）**：原 codebase-tools 的既有测试在 `my-omp-toolkit@34d7c40`，搬作扩展验收（消费者可见行为，只适配测试 Agent 运行时），不照搬绑定旧文案/实现形状的断言。
- **两套测试分目录、分责任（结构约束，已定）**：扩展验收目录与框架能力目录分离，框架套件同时充当升级回归警报。
- **必须走真实 Agent 运行时路径**：主会话、真实内建子代理（非 mock）、真实装载；mock 不得冒充 provider、task 或 TUI 证据。
- **隔离约束**：临时 `PI_CODING_AGENT_DIR` + `--no-extensions -e <OMP 入口目录>` + 受控会话；清掉 `OMP_PROFILE`、`XDG_DATA_HOME`、外部 auth-broker，避免解析偏移。
- **C14 拒绝必须真跑**：用可注入测试 adapter 触发「必须语义缺失 → 拒绝」，不能只验通道存在。
- **永久测试断言约束**：只断言消费者可见行为或必须语义；不 pin 提示词措辞、文件布局、转发实现、测试后门；探针证据不当永久回归；不测 wiring/copies/forwarding/mock echoes/源码文本/顺带默认值/套套逻辑/仅不抛错/仅非空。
- **openai-codex 两层证据**：层1 本地 probe（`api="openai-codex-responses"`）捕获 OMP 序列化，标注 shape-only；层2 wizard 在隔离 agent dir 引导 OAuth 或 `auth-broker import`（secret 不进上下文），真实 run `gpt-6-luna` + `providers.openaiWebsockets="off"` + `PI_REQ_DEBUG=1`，录全量请求 JSON；WS 帧无反向代理时记「未独立观察」；凭据/捕获不可得 → unverified，不阻塞、不自动认证。
- **provider 代表**：主 `deepseek/deepseek-flash`（`openai-completions`，已证 custom 出站 user role）；辅 `openai-codex/gpt-6-luna`（`openai-codex-responses`）。
- **升级套件运行方式**：默认/CI 只对固定 18.5.0 跑；候选版本经 `OMP_TEST_VERSION=<v>` 隔离安装后跑框架套件。
- **验收矩阵**：`acceptance-plan.md` 固定 B1–B11 / C1–C15 / N1–N10；本规格引用它作为验收定义，不在此重列场景细节。

## Out of Scope

- pi adapter 的实现与验收，以及广泛覆盖多个 Agent 运行时、版本或 provider 的兼容承诺。
- 代码热重载（extension reload）的支持与验收；首版只承诺进程重启后源码变更生效。
- 修改 Agent 源码、维护 fork/补丁、通过绕过 extension 接口改变 Agent 运行时内部行为。
- 其他扩展迁移（如 model-cost），以及 codebase-tools 不需要的文件归档、跨进程共享文件协调、其他控制模式、持续性副作用、codemode 集成。
- 改写业务提示词、自动探测/启用 MCP 或 LSP、替代子代理调度器、放宽必要消息角色或历史保护要求。
- 独立 npm 发布、独立扩展生成器、跨 Agent 运行时会话格式迁移。
- 持久化兼容（两个方向）：旧 `{on}` 数据转换、一次性导入、新→旧回退、`initInjected` 兼容投影。
- 同进程多 main（ACP/cmux/embedded，或 `/new` 后旧子代理存活）的 owner 消歧：首版仅支持单 main；native 解析可能取错 owner，不承诺支持。
- 配置化 State 持久化后端（内存 / 扩展自有文件 / Agent runtime session entries）：首版只实现 owner 会话 JSONL 映射，保留「当前值 vs 持久化映射」seam。
- 受约束纯 TS 自定义逻辑入口、其余 control kind（mode selection / configuration switch / parameter setting / command action）与 required-semantics 声明接口。
- request-only prompt、context filtering、新的业务提示词、同槽位多规则/优先级、复杂通用 UI 布局语言。
- 绿灯自动认证 Agent 运行时版本升级。

## Further Notes

- **决策来源**：本规格综合 [map.md](map.md) 与 8 张 resolved 决策票及其 lighthouse；`acceptance-plan.md` §12 台账逐项列 C1–C15 + 公共接口 P1–P4，全部 `decided`、无 `blocked`。决策票 `resolved` 只表示决策锁定，**不代表代码已实现或测试已通过**。
- **术语**：全程沿用 [GLOSSARY.md](../../GLOSSARY.md) —— Agent runtime（不用 host）、Extension definition、Semantic hook、Command toggle、State、Subagent State inheritance、Owner / Parent agent、Extension storage、Injected prompt（不用 instruction contribution）、History preservation、Request-only prompt、Supported agent-runtime baseline、Behavior library、Feature template。
- **ADR**：遵循 [ADR-0002](../../docs/adr/0002-semantic-extension-framework.md) —— 仓库内共享源码、无独立发布、目标目录布局、历史保护、agent-runtime-qualified capability、框架验证作升级回归警报；原始扩展保持独立、只单向引用。
- **2026-10-07 traverse**：用户显式放弃持久化兼容；`01`/`02`/`03` lighthouse 已补 `Addendum`，与 `04`–`08` 的覆盖一致。旧 `{on}` 数据不读、旧会话回落 off。
- **未验证项（不阻塞规格/实施）**：openai-codex 层2 真凭据证据、交互 TUI 视觉验收、18.6.1 认证；按规则记 `unverified` 或按需触发升级流程。
- **留给 `/to-contract` 的开放项（本规格不决定）**：模块内部接口与 promise 位置；行为库的精确组成（哪些行为进 behavior library、如何组合）；owner 解析/持久化/UI 传输的接口拆分；各 promise 在哪个 seam 测、覆盖到什么程度；`defineExtension` / `ompAdapter` 的精确函数签名与错误类型。
- **下一步**：`/to-contract` 选择 seam 并批准 promise；随后 `/to-tickets` / `/implement` 按 `acceptance-plan.md` 与灯塔推进实施。
