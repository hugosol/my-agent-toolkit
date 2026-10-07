# connect-bot 迁移到语义扩展框架（OMP 适配）

Status: ready-for-agent
Feature: connect-bot-migration
Tracker: `.scratch/connect-bot-migration/`
Contract: [contract.md](contract.md)（已批准；Acceptance mode: Rapid iteration）
来源: [map.md](map.md)（Destination / Notes / Decisions so far / Not yet specified / Out of scope）、8 张 resolved 决策票及其 [lighthouse/](lighthouse/)（01–08）、面板侧契约 [contract.md](../../../archive-docs/omp-bot/omp-connect-bot/contract.md)

---

## Problem Statement

用户在本机 OMP 会话里执行 `/connect-bot`，希望这个会话出现在 omp-bot 面板上（在线/离线、空闲/工作中/等待用户输入），并且面板重启、失联、切会话、退出等情形都有确定行为。当前唯一的 connect-bot 实现直接绑定 OMP 原生 ExtensionAPI：命令、心跳、出站队列、失败预算、三值状态机、配置读取与原生事件/UI/timer 直接耦合。

要解决的问题是：**在没有规格、也没有框架侧所需能力的情况下，connect-bot 无法按新框架迁移，框架也无法承载第二个扩展。** 决策虽已在 map 中锁定，但还没有一份可供 `/to-contract`、`/to-tickets` 与实施消费的规格；同时框架还缺少这次迁移所依赖的 additive 能力——定向开关控制、per-field memory 持久化与默认不继承、运行时无关的语义生命周期事件、统一 `info | error` 反馈与 `hasUI`、Extension configuration、owner-scoped 后台效果能力。

用户已确认的范围约束：

- **OMP 是唯一功能验收目标**；不实现 pi 支持，也不宣称 pi 已验证。
- **omp-bot 面板与通信协议保持不变**；迁移后的扩展对接现有面板，保持单向上报、单向只读桥。
- **业务行为默认保留，差异逐项裁定**；允许按新框架重写实现，不逐行移植。
- 框架按本次需求扩展，**不顺带补齐远期能力**；能力归属按语义契约判断，不按使用者数量判断。

## Solution

在 my-agent-toolkit 内交付两部分：

- **框架 additive 能力**（ADR 0002 additive-only）：`directed` 控制类别与 per-field State 生命周期（`session-entry`/`memory` × `follow`/`none`）；运行时无关语义生命周期事件（`session_start`/`session_end`、`round_start`/`round_end`、`canAcceptInput()`）与 owner 作用域；统一 `info | error` **Extension feedback** 接缝与 `hasUI` 事实；所有 handler delivery 的声明值写接缝；owner-scoped 可保留能力句柄；**Extension configuration**（`config.yaml`）。
- **connect-bot 扩展**：声明式 extension definition + 运行时无关共享逻辑 + OMP runtime assembly。marker 文本 `◈ connectBot`；`extensions/connect-bot/config.yaml` 携带默认 endpoint；心跳 timer、出站队列、失败预算、三值 agent 状态与面板 HTTP 协议仍由扩展承担。
- **薄入口**：OMP 入口只 re-export 该扩展的 OMP assembly。
- **两层自动验收 + 一层人工**：framework 层验新框架能力，扩展层以 mock + fake timers 验 connect-bot 可隔离行为，真实 OMP × omp-bot 由用户按观察清单手动执行。
- **文档与 runbook**：两份能力文档随符号落地同步；README §H3 扩写 connect-bot 的新旧切换/回退步骤。
- **精确支持基线**：OMP `@oh-my-pi/pi-coding-agent@18.5.0` + Windows x64 + Bun 1.4.2；面板 `omp-bot@d50e35c`；行为基线 = 开发期冻结的 `my-omp-toolkit`。

## User Stories

### 框架：定向控制与 per-field State 生命周期（02）

1. 作为 connect-bot 用户，我想要 `/connect-bot` 重复执行时重发 register 而不是 no-op，以便面板重启后能立刻重连，不必等约 30 秒自动 disarm。
2. 作为 connect-bot 用户，我想要用 `/connect-bot off` 断开且不再支持 `offline`，以便命令表面只有一个词形、不会因别名产生歧义。
3. 作为 connect-bot 用户，我想要未接入时输入 `off` 是静默 no-op（不发请求、不通知），以便不产生多余网络动作。
4. 作为扩展作者，我想要框架提供「重复执行重复动作」的 `directed` 控制类别，以便表达「再执行一次操作」而不被框架去重或短路。
5. 作为扩展作者，我想要命令能插入自定义 TS（由 assembly 注入），以便 register/unregister 的 HTTP 与协议留在扩展里。
6. 作为框架维护者，我想要 definition 保持纯数据、handler 在 assembly 注入，以便声明仍可检查、与运行时适配器解耦。
7. 作为扩展作者，我想要 `enabled` 的值由动作结果决定，以便 register 失败时不会显示「已接入」。
8. 作为扩展作者，我想要 handler 在 State 写入前运行并拥有写，以便 offline 过滤读的是调用前的 `enabled`。
9. 作为扩展作者，我想要框架不去重、不串行化命令，以便并发/迟到回执的守卫留在扩展业务逻辑。
10. 作为 connect-bot 用户，我想要连接状态由框架 marker 常驻显示并从 `enabled` 派生，以便一眼看出是否已连接。
11. 作为框架维护者，我想要 per-field `persistence: "memory"`，以便连接状态不写 session entry、不随 restore 复活。
12. 作为框架维护者，我想要 per-field 继承开关默认不继承，以便子代理不会继承连接状态、不会发心跳/注册、不会显示 owner 的 marker。
13. 作为 codebase-tools 维护者，我想要显式声明「可继承」，以便既有的「子代理跟随 main 激活值」行为被保留且可见。
14. 作为迁移实施者，我想要 agent 工作状态留在扩展业务逻辑，以便框架 State 不被过度泛化。
15. 作为框架维护者，我想要「控制类别 × 持久化 × 继承」是 per-field 正交轴、控制与会话行为都按字段策略分支，以便 codebase-tools 与 connect-bot 组合出不同策略而不互伤。

### 框架：语义生命周期与 owner 作用域（03/07）

16. 作为扩展作者，我想要框架定义运行时无关的 `session_*`/`round_*` 语义事件，以便一套共享逻辑管理各阶段而不必读各 runtime 源码。
17. 作为扩展作者，我想要 adapter 把原生事件合成为语义事件，以便我的逻辑永不命名原生事件。
18. 作为扩展作者，我想要 `round_end` 只在真正 quiescence 触发且无 payload，以便工具循环/自动续跑不会中途把面板翻成「等待输入」。
19. 作为扩展作者，我想要 `canAcceptInput()` 作为独立查询，以便 arm 初值不依赖事件 payload。
20. 作为 connect-bot 用户，我想要面板在 agent 真正开始/结束时切到「工作中」/「等待用户输入」，以便面板反映真实状态。
21. 作为 connect-bot 用户，我想要会话切换时停旧会话上报并 best-effort 注销旧 id，以便心跳不会泄漏进新会话。
22. 作为 connect-bot 用户，我想要退出/崩溃交给面板 30s 过期，以便扩展保持单向只读桥。
23. 作为框架维护者，我想要框架行为先于扩展 handler 分发，以便扩展运行时 State 已一致。
24. 作为框架维护者，我想要 session 边界刷新 marker，以便切换后不显示陈旧 marker。
25. 作为框架维护者，我想要 owner 订阅只收 owner 自己的事件（子代理事件不送达），以便子代理事件不驱动 owner 效果。
26. 作为框架维护者，我想要缺语义按 `required-semantics` fail-soft，以便不支持的 runtime 拒绝能力而非静默降级。
27. 作为扩展作者，我想要后台 timer/outbox 回调复用 arm 时取得的 owner 能力句柄，以便 auto-disarm 能写 `enabled=false` 并清 marker、E/F 通知走统一反馈口。
28. 作为框架维护者，我想要该句柄随 owner retire 失效（写 no-op、反馈丢弃），以便迟到回调不会重建已结束会话的 State 或重发 marker。
29. 作为 connect-bot 用户，我想要切会话后不再收到旧会话的 E/F 通知，以便不出现与 G 矛盾的误导提示。
30. 作为扩展作者，我想要 session_end 本次投递自带一次性反馈口，以便切换提示不因 retire 而丢失。
31. 作为扩展作者，我想要 `session_end.owner.key` 直接给出正在结束的 owner，以便查自持记录、先停本地再 best-effort 注销旧真实 sessionId。
32. 作为框架维护者，我想要移除冗余的 `previousOwnerKey`，以便语义投递只有一个 owner 事实、拆分后的 session_end/session_start 不产生歧义。
33. 作为 connect-bot 用户，我想要 disposed（退出/崩溃）只停本地、不通知、交面板 30s 过期，以便单向上报桥保持不变。

### 框架：统一反馈、marker 与声明值写（04/07）

34. 作为 connect-bot 用户，我想要命令反馈按 `info`/`error` 分级经同一条框架通道发出，以便反馈的视觉严重程度与实际情况一致。
35. 作为框架维护者，我想要一个运行时无关、带 `info | error` 的扩展反馈接缝，以便扩展共享逻辑不必 import 原生类型。
36. 作为框架维护者，我想要无 UI 时反馈自动落 stderr，以便 no-UI 会话仍有可观测的拒绝与失败提示。
37. 作为扩展作者，我想要框架在 invocation/delivery 上暴露忠实的 `hasUI`，以便共享逻辑能执行 `main + hasUI` 门槛并用 mock 测试。
38. 作为扩展作者，我想要只有扩展的 OMP runtime assembly 能直连原生能力，以便共享逻辑保持运行时无关。
39. 作为迁移实施者，我想要真实 sessionId/cwd/model 由 OMP assembly 原生读取并作为纯数据传入，以便线上协议不依赖框架的不透明 owner key。
40. 作为 connect-bot 用户，我想要已接入时 marker 显示 `◈ connectBot`、off 时消失，以便一眼看出连接状态。
41. 作为框架维护者，我想要 marker 的摆放/行序/发布/清除由框架所有，以便多扩展 marker 共存不互相覆盖。
42. 作为 connect-bot 用户，我想要除 `offline`→`off` 外的全部提示文案保持不变，以便迁移不引入未授权的用户可见变更。
43. 作为扩展作者，我想要反馈判断树是一个吃既有归一化产物的纯函数，以便全部反馈路径可用 mock 覆盖。
44. 作为框架维护者，我想要 `directed` 命令不产生框架自动反馈，以便扩展 handler 的文案不与框架生成文案重复。
45. 作为 codebase-tools 用户，我想要 enabled/disabled 提示经统一通知通道发出，以便框架新通知通道对既有扩展零成本生效。
46. 作为扩展作者，我想要框架在所有 handler delivery 提供声明值写接缝，以便 auto-disarm 能写 `enabled=false` 并让 marker 清除。
47. 作为扩展作者，我想要扩展自持 owner-scoped 的 typed 效果记录，以便效果数据与效果生命周期一致、不被框架提前清理。
48. 作为框架维护者，我想要 `enabled` 是唯一进入框架 State 的 connect-bot 声明值，以便不出现第二个「当前值」权威。

### 框架：Extension configuration（05）

49. 作为 connect-bot 用户，我想要端点配置集中在一个扩展目录下的 `config.yaml`，以便换 omp-bot 地址只改一个文件、不必在代码里找默认值。
50. 作为 connect-bot 用户，我想要配置文件缺失或非法时扩展直接不加载并给出明确 error，以便不会静默连错地址或看到假的「已接入」。
51. 作为扩展作者，我想要框架提供运行时无关的 Extension configuration 能力，以便不必自己写文件 io、YAML 解析与错误处理。
52. 作为扩展作者，我想要在 definition 里以纯数据声明需要的配置键与类型，以便配置错误在 binding 时统一暴露、扩展代码不写校验。
53. 作为扩展作者，我想要共享逻辑通过 `getConfig(definition)` 拉取已校验值，以便 OMP 装配层完全不接触配置、共享逻辑保持运行时无关。
54. 作为框架维护者，我想要读取/解析/校验集中在框架 config 模块且 parser 可注入，以便所有扩展共享同一错误语义且框架层可单测。
55. 作为框架维护者，我想要配置文件用 YAML、解析用跨运行时的纯 JS `yaml` 包，以便人手写配置可写注释且 framework core 不绑 Bun/agent runtime。
56. 作为未来维护者，我想要 Extension configuration 的命名与文件形态为 Configuration switch 预留，以便后续 switch 可直接进同一文件而不必重画目的地。

### 框架：原生边界与 ADR（08）

57. 作为框架维护者，我想要原生边界有 ADR 级执行契约（逃生舱两处 + 测试作为执行点），以便后续实现者知道哪些目录能碰原生、边界由什么守住。
58. 作为框架维护者，我想要「放宽/绕过原生边界 = 非 additive 架构变更」写成规则，以便 agent 或人不能以实现细节为名偷偷扩宽边界。
59. 作为框架维护者，我想要 ADR 写明测试是词法、尽力而为、原则权威，以便不会把「测试通过」误当成边界成立。
60. 作为未来维护者，我想要 ADR 0002 与 02/04/07 的已决项一致（含继承表述修正），以便读 ADR 就拿到正确的当前架构而非 02 之前的旧默认。
61. 作为扩展作者，我想要我的 extension `runtimes/` 是唯一原生入口，以便共享 logic 保持运行时无关、可 mock 验证。

### connect-bot：命令、连接与心跳（01/02/03/04）

62. 作为 connect-bot 用户，我想要 `/connect-bot`（空参）在 omp-bot 可达时注册当前 main 会话并回带在线会话数，以便确认接入成功。
63. 作为 connect-bot 用户，我想要已接入时重复 `/connect-bot` 幂等重注册：不新增行、不闪烁，以便面板重启后立即重连。
64. 作为 connect-bot 用户，我想要 arm 失败（register reject/超时）报错并保持未接入、无残留定时器/网络动作。
65. 作为 connect-bot 用户，我想要未接入零动作，以便没执行过 `/connect-bot` 的会话不产生任何网络或定时动作，offline 后同样归零。
66. 作为 connect-bot 用户，我想要仅 main 且 `hasUI === true` 可执行（含 off）；子代理静默拒绝、no-UI 走 stderr，且不改状态、不发请求。
67. 作为 connect-bot 用户，我想要 `/connect-bot off` 先本地立即断开（停心跳、清状态与队列）再尽力 unregister，以便面板行立即消失。
68. 作为 connect-bot 用户，我想要 off 在面板可达（含 omp-bot 重启后的 404）时提示已断开、不可达/超时时提示未响应，以便知道远端是否清干净。
69. 作为 connect-bot 用户，我想要未知参数报错且状态不变（`off` 现在合法），以便不会因拼错命令而静默改状态。
70. 作为 connect-bot 用户，我想要 10s 心跳携带当前状态，以便面板 keepAlive（30s 过期）成立。
71. 作为 connect-bot 用户，我想要连续 3 次推送失败（≈30s）自动解除接入并通知，且不自动重连，以便失联行为可预期。
72. 作为 connect-bot 用户，我想要失败段首次失败与最终 auto-disarm 各通知一次，任一成功推送复位失败计数与首次标志。
73. 作为 connect-bot 用户，我想要出站队列单 flusher 保序、上限 16、满时丢最旧 heartbeat、不重试，以便旧 heartbeat 不会盖过较新状态。
74. 作为 connect-bot 用户，我想要 arm 后按 idle 事实取「空闲/工作中」，`round_start` → 「工作中」、`round_end` → 「等待用户输入」，且稳态下只在真变化时 push，以便面板反映真实状态。
75. 作为 connect-bot 用户，我想要 arm/re-arm 无条件上报一次状态，以便重连后面板立即拿到当前状态。
76. 作为 connect-bot 用户，我想要心跳不迁移状态、不重复提示，以便静置不产生噪音。
77. 作为 connect-bot 用户，我想要会话切换/分支且 id 变化时对旧 id best-effort unregister、本地断开并通知，新会话保持未接入；同身份导航（`/reload`、同文件 `/resume`、`/clear`、TUI `/branch`、`/tree`）是彻底 no-op。
78. 作为 connect-bot 用户，我想要扩展不直接 hook 原生 `session_shutdown`，退出/被杀/失活统一由面板 30s 过期兜底（行转「已离线」并保留）。
79. 作为面板（既定外部契约），我想要扩展继续写死事件路径与 `{proxy: false}`、沿用既有信封、把 404/非 2xx 计为失败，以便面板与协议无需改动即可继续工作。

### connect-bot：配置与新旧切换（05）

80. 作为 connect-bot 用户，我想要扩展目录提交 `config.yaml` 带默认 endpoint、definition 声明 `endpoint: "non-empty-string"`，以便端点唯一来源是文件、无代码级默认值。
81. 作为迁移实施者，我想要新实现测试只挂新入口、旧实现永不与新实现同载（load-source mutual exclusion），旧实现仅作冻结基线与回退路径。
82. 作为迁移实施者，我想要切换步骤 = 移除旧发现入口 + 加入新根 + 整进程重启，以便不出现新旧同时激活或热重载假设。
83. 作为 connect-bot 用户，我想要端点值手工从旧 `config.json` 搬到新 `config.yaml`、无自动转换与状态迁移。
84. 作为 connect-bot 用户，我想要切换/回退前面板旧行有确定可见结果与清理建议（建议先 `/connect-bot off`；旧行 >30s 转离线并保留），以便知道会发生什么。

### 迁移、验收与文档（01/06）

85. 作为迁移实施者，我想要以本机 `my-omp-toolkit` 开发期冻结代码为唯一行为基线（扩展唯一提交与仓库修订记录在案），以便迁移有唯一可对照的原点。
86. 作为迁移实施者，我想要代码/README/既有测试/面板 spec 不一致时逐条登记交用户判断，以便每一处不一致都得到显式裁定而非被自动优先级吞掉。
87. 作为迁移实施者，我想要契约只覆盖新引入的框架行为与扩展层可独立测试的行为（允许 mock），真实集成由用户手动验证。
88. 作为用户，我想要真实 OMP × omp-bot 集成由我按可执行观察清单手动执行，以便验收不依赖脆弱的 pty 脚本。
89. 作为迁移实施者，我想要 loader/admission 按 codebase-tools/deployment 先例自动化，以便 ADR 0002 的真 loader 要求在自动化内满足、原 L2 不再单独人工。
90. 作为迁移实施者，我想要全量 `bun run test` 在记录的源/运行时基线上全绿作为 release gate，以便框架既有行为与 codebase-tools 不回退。
91. 作为迁移实施者，我想要历史约束被有意修改时在迁移侧/移植后产物同步断言（原仓库 `my-omp-toolkit` 冻结），以便迁移后测试描述现状、回退基线仍描述旧实现。
92. 作为迁移实施者，我想要 run record 记录源/运行时/面板/框架基线，以便每次验收可复现、可追溯。
93. 作为迁移实施者，我想要两份能力文档在对应代码 ticket 完成后同步（符号落地时同步 capability index、OMP-qualified 原生落地时同步能力差异表，含把 subagent State inheritance 对齐 02 的 per-field 默认 `none` + codebase-tools 显式 `follow`），以便公开符号与能力差异可见。
94. 作为迁移实施者，我想要 connect-bot 的新旧切换/回退步骤扩写进 README §H3，以便 runbook 覆盖第二个扩展的迁移。
95. 作为迁移实施者，我想要非证据清单（mock 自证/源码文本/pty/README 声明）被显式排除，以便验收不被假信号通过。
96. 作为迁移实施者，我想要多会话隔离/codebase-tools 共存/新旧互斥/配置切换被观察清单覆盖，以便迁移的集成风险被显式检查。

## Implementation Decisions

以下为 map 中已锁定的决策。**seam（模块内部接口与 promise 位置）留给 `/to-contract`，本规格不在此选择 seam**；仅记录已定的架构与行为契约，以及对话中已确定的运行时事实注入 seam（§9）。

### 1. 分层与依赖方向（架构决策）

- 四层职责：**语义核心**（宿主无关：definition 类型、State 模型、控制/反馈/生命周期协议、准入与确定性规则）→ **behavior library**（宿主无关可复用实现）→ **OMP adapter**（唯一接触原生 API 的位置：事件映射、owner 解析、持久化、UI 传输、版本探测）→ **扩展 runtime assembly**。
- connect-bot 一份声明式 definition + 一份共享逻辑 + 一份 OMP assembly；OMP 薄入口只 re-export assembly，不含逻辑。
- 共享逻辑永不 import Agent 运行时类型；原生 escape hatch 固定为 `framework/adapters/**` 与 `extensions/<id>/runtimes/**` 两处。
- 框架公开接口只做 additive 变更；非 additive 变更必须在 ADR 0002 显式决策。

### 2. 定向控制与 per-field State 生命周期（02）

- 新增控制类别 **Directed control**：命令显式命名目标值（空参 = on、`off` = off），每次执行重复副作用，框架**不**去重、不短路；幂等由扩展保证。它与 `toggle`、以及延后的 Mode selection / Configuration switch / Command action 是不同类别。
- connect-bot 的控制轴 = `directed` + `persistence: "memory"` + 继承 `none`；codebase-tools = `toggle` + `session-entry` + `follow`。
- `enabled` 是唯一进入框架 State 的 connect-bot 声明值：`persistence: "memory"` ⇒ 不写 session entry、不从分支 seed、owner 被替换归 default `false`、同身份导航保持。
- 写入权威不变：扩展 handler 在 State 写入**之前**运行并拥有写，声明只表达字段所有权。arm 不设 `enabled` 过滤（重复 arm 重发 register）；off 受过滤（未接入 no-op）；并发/迟到回执守卫归扩展。
- 新增 per-field 继承开关，**默认 `none`**（子代理读声明 default）；codebase-tools 显式声明 `follow` 以保留既有子代理跟随；`tests/framework/owner-inheritance.test.ts` 与 ADR 0002 §Subagent State inheritance 需对应更新。
- 框架在每次写 `enabled` 后发布 marker（从 `enabled` 派生）。
- 三值 agent 工作状态不进框架 State；不制造第二个当前值。

### 3. 语义生命周期模型（03）

| 事件 | 含义 | reason | 框架行为 | 扩展 |
|---|---|---|---|---|
| `session_start` | 某 session 成为 current owner | `initial`/`new`/`resume`/`fork` | seed State + 刷新 marker | 可选订阅 |
| `session_end` | current owner 不再 current | `transferred`/`disposed` | retire State + 清 marker | 停本地效果；`transferred` 时 best-effort unregister 旧 id |

- 运行轴：`round_start`（边沿）→ running；`round_end`（边沿、quiescence、**无 payload**）→ awaiting-input。自动续跑/queued drain 留在 round 内部；error/abort 也发 `round_end`。
- `canAcceptInput()` = `isIdle()`，独立查询，用于 arm 初值；不作为事件 payload。
- switch/branch/fork = `session_end(transferred)` + `session_start(new)`；同身份导航不发事件（判据 = owner key 是否变化）。
- OMP 原生映射：`session_switch`/`session_branch`/`session_shutdown`；OMP 的 `session_start` 不能当每转换边界（host-init、无 reason、子代理也触发）。
- 分发顺序：框架行为先（session/State/marker），扩展 handler 后；错误互相隔离。
- owner 订阅只收 owner 自身事件（子代理 `round_*`/`session_*` 不送达）；缺语义按现有 `required-semantics` fail-soft。
- session 边界必须刷新 marker 区（补 02 的 session-switch 清 marker 缺口）。
- v1 不暴露 model-response 级 `turn_*`。

### 4. 统一反馈、`hasUI`、marker 与声明值写接缝（04）

- 新增运行时无关 **Extension feedback** 通道，每个通知带 `info | error` severity；命令 handler 与语义事件 handler 都可用；适配器在有 UI 时映射为 UI 通知、无 UI 时落 stderr；**永不进入 model context**（不是注入提示词、会话记录或工具输出）。框架内部 admission/session warning 通道不合并。
- delivery 暴露忠实的 `hasUI: boolean`；`main + hasUI` 门槛由扩展共享逻辑执行，拒绝文案经统一反馈口发出（`!hasUI` 自然落 stderr），不改状态、不发请求；子代理静默拒绝仍归框架 owner 范围。
- marker 文本 `◈ connectBot`，`enabled=true` 才显示、off 不显示；摆放/行序（按扩展 id）/发布/清除由框架所有，与 codebase-tools 的 marker 同区共存。
- 所有注入 handler（命令 + 语义事件）获得「声明值写接缝」；框架在写后发布 marker。auto-disarm 经它写 `enabled=false`。
- connect-bot 的 OMP assembly 允许直连 OMP 原生：managed timer（10s 心跳）与真实 `sessionId`/cwd/model（作为纯数据交给共享逻辑）。共享逻辑不 import 原生类型、不注册原生 hook、不直调原生 UI。
- connect-bot 反馈集中在单一纯函数 `selectFeedback(input) → { level, message } | undefined`：输入 = 现有归一化产物（`readRegisterOutcome` 的 `{onlineCount}|undefined`、off 的 try/catch 结果、`recordFailure` 的 `FailureAction`）加 `trigger`/`enabledBefore`/`hasUI`；树内**不按数字状态码分支**，不新造「语义结果」类型。
- 文案集合 A–J 十行全部保留，唯一改动是未知参数提示里的 `offline` → `off`（不含别名）；非 2xx（面板可达）归「已断开」成功文案，只有 reject/超时归「面板未响应」；`!hasUI` 走 stderr、子代理静默。
- `runCommandToggle` 的 enabled/disabled 反馈改由统一通道发出（文本保持 `codeBaseTools enabled/disabled`）；codebase-tools 无需改 definition。**`directed` 命令不产生框架自动反馈。**
- 扩展工作数据（armed sessionId、health、outbox、三值 state）由扩展自持 owner-scoped typed 记录，在 arm/off/auto-disarm/session_end 自建自清；**不引入** State 的 opaque `extra_data` 区。

### 5. 后台效果能力句柄与 `session_end` 清理（07）

- 后台效果回调**不新增框架 API**：handler delivery 提供一个 owner-scoped 可保留能力句柄（声明值写 + 统一反馈），扩展在 arm 时存入自持记录，供 heartbeat/outbox 回调复用。
- 句柄只在 owner 存活期间有效：owner retire 后写为 no-op（不重建 State、不重发 marker）、反馈被丢弃；`session_end` **本次投递**自带仅本次可用的反馈口，扩展 session_end handler 仍能发切换通知。
- 句柄不带 `hasUI`（后台回调路径不需要）。
- `session_end(transferred|disposed)` 的 `owner.key` = **正在结束的 owner**；冗余的 `previousOwnerKey` 从语义投递移除。
- 清理序列：`transferred` = 同步停本地 effects → 经本次投递反馈口发切换通知（info）→ 对记录中的真实 sessionId best-effort unregister（沿用 1.5s 超时，本地停止先于远端）→ 删记录；`disposed` = 同步停本地 → 删记录，不注销、不通知，交面板 30s 过期；`owner.kind !== "owner"` → no-op。
- `session_end` 不写 `enabled`（框架 retire 已归默认、marker 已清）。
- 扩展在 session_end handler 顶部**同步**停本地 timer（先于任何 await）；扩展自持记录/守卫是第二道防线。

### 6. Extension configuration（05）

- 新增框架能力 **Extension configuration**：按 `extensions/<definition.id>/config.yaml` 约定（`config.path` 可覆盖），definition 以纯数据 `config.fields: Record<string, "string" | "non-empty-string" | "number" | "boolean">` 声明必填键与类型；opt-in，未声明 `config` 的扩展无感。
- 在 binding 时、注册任何东西之前读取校验；解析用纯 JS **`yaml` 包**（零外部依赖、ISC、YAML 1.2），parser 留可注入 seam 供框架层单测；framework core 不依赖 `Bun.YAML`。
- 所有加载期配置错误——`config` 声明形状非法（`config` 非对象、`fields` 非非 null 对象、类型名超出四种、`path` 非非空字符串），以及缺文件/坏 YAML/顶层非对象/required 键缺失/类型不符——统一产生：

  ```ts
  // BindingFailure 联合中该成员的形状
  type ConfigurationBindingFailure = {
    kind: "configuration";
    violation: { kind: "config"; detail: string };
  };
  ```

  （`ConfigurationViolationKind` additive 新增单个 `"config"` 成员，`detail` 逐类可区分；经 `reportDiagnostic`（非模型通道）报确定性 error 文案；该扩展不加载，其它扩展继续）`ExtensionConfigError` 保持独立：只表示已绑定扩展误用 `getConfig`，不并入加载期 `BindingFailure`。
- **无代码级默认值/回退**：仓库 `config.yaml` 即默认值；字段值语义（`non-empty-string`）由框架 config 模块完成。未知键忽略；无 env/CLI 覆盖；整机唯一一份；改动需整进程重启。
- 读取 API：底层 `readConfig(path)`（唯一读/解析/校验/抛错实现，可注入 reader/parser）；上层 `getConfig(definition): Readonly<Record<string, unknown>>` 供共享逻辑拉取已校验值。
- connect-bot 提交 `extensions/connect-bot/config.yaml`（默认 `endpoint: http://omp-bot.local:8787`）并声明 `fields: { endpoint: "non-empty-string" }`；不再有 `config.json` / 扩展自读。这是对 01 P10 缺文件/坏格式两条的显式修订（缺文件「默认+告警」→「error + 不加载」；坏格式「mount 抛错」→「框架 config BindingFailure + error + 不加载」）。
- **Configuration switch 语义保持 deferred**：本规格只让文件形态与命名可承载它，不顺带实现。

### 7. 原生边界执行契约（08）

- 不新开 ADR；ADR 0002 的 additive 小节「Enforcement of the native boundary」记录：逃生舱固定为 `framework/adapters/**` 与 `extensions/<id>/runtimes/**`，由 `tests/framework/import-boundary.test.ts` 机械执行（词法扫描、`require(...)`/拼接/别名可绕，**原则权威、测试是机械警报**）。
- 放宽 escape hatch、加等价旁路、把原生访问移出两处目录，均属**非 additive 架构变更**，必须在 ADR 0002 显式决策。
- ADR 0002 与 02/04/07 的漂移在决策时即已补齐（含修正 §Framework-owned capabilities 的继承表述），不推迟到实现期。`docs/framework-capabilities.md` 与 `docs/agent-runtime-support.md` 不写未实现符号（见 §10）。

### 8. connect-bot 行为契约（01/02/03/04/05）

保留行为按责任侧划分（面板为固定外部契约，只以「扩展必须满足的前提」进入本契约）：

| 保留行为 | 责任侧 | 面板 S2 |
|---|---|---|
| 接入回执与重复注册 | extension 契约 | P1/P2 |
| 立即本地断开 | extension 契约 | P3 |
| 未接入零网络/定时动作 | extension 契约 | P6 |
| 主会话与 UI 门槛 | extension 契约 | P5 |
| 三类状态区分 | extension（接入开关 + agent 三值）+ panel（keepAlive） | P8/P9 |
| 状态上报与心跳 | extension 契约 | P7 |
| 失联停止接入且不自动重连 | extension 契约 | P7 |
| 会话切换与同身份导航 | extension 契约 | P6 |
| 退出后面板过期 | panel（外部前提） | S1 P14 |

- 命令词形：`/connect-bot`（空参）= on；`/connect-bot off` = off；`offline` 不保留别名；未知参数报错且状态不变。
- 数值契约全部保留：心跳周期 `10s`；连续失败预算 `3` 次（≈30s）；register 超时 `1s`；push/unregister 超时 `1.5s`；出站队列单 flusher 保序、上限 `16`、满时丢最旧 heartbeat、不重试。
- 面板 keepAlive 30s 过期（最迟 `last_seen` 起 ≤35s，死亡最坏约 45s）由面板承担；扩展侧不实现 30s 逻辑。
- 三值状态机：arm 成功按 idle 事实取「空闲/工作中」；`round_start`(main) → 「工作中」；`round_end` → 「等待用户输入」；稳态只在真变化时上报，**arm/re-arm 无条件上报一次**。
- 会话切换：id 变化 → 对旧 id best-effort unregister、本地断开、通知；新会话保持未接入。同身份导航 no-op。
- 退出/崩溃：不 hook 原生 `session_shutdown`，由面板过期兜底。
- marker 文本 `◈ connectBot`；off 与 auto-disarm 清除。
- 面板侧 P3/P7 的 `offline` 表述在本规格中标为**失效**，统一为 `off`；不改面板代码/协议。

### 9. 运行时事实/能力注入 seam（已定事实）

- OMP runtime assembly 原生读取并**以纯数据/能力形式注入**共享逻辑的运行时事实：managed timer（`ctx.setInterval`，10s 心跳）、真实 `sessionId`/cwd/model。
- `canAcceptInput()` 是共享逻辑可用的框架查询，用于 arm 初值；不依赖事件 payload。
- arm/re-arm 无条件上报一次状态；「只在真变化时 push」限定为稳态。
- 精确签名与容器形态留给 `/to-contract`。

### 10. 实施期文档同步与 runbook 义务（必须作为实施票据的 acceptance criteria）

这些义务没有可观测 seam、也不是运行时 promise，`/to-tickets` 不会自动切成独立票；必须随相关实现票落地：

- **`docs/framework-capabilities.md`（已实现符号索引）**：符号落地时逐符号补索引并引源码行；`ConfigurationViolationKind` 枚举补 `"config"`；`framework/core/violations.ts`/`protocol.ts` 中 `ConfigurationViolation`/`"configuration"` 的注释从「竞争性声明」泛化为「配置规则（声明 + 文件）」。
- **`docs/agent-runtime-support.md`（OMP-qualified 能力差异表）**：OMP-qualified 原生落地时同步能力差异表（managed timer、真实 sessionId/cwd/model、async job snapshot、agent identity/子代理 gate），真实运行时测试落地后把 `source-inspected` 更新为已验证；并把 §Planned agent-runtime-qualified capability: subagent State inheritance 对齐 02 的 per-field 默认 `none` + codebase-tools 显式 `follow` opt-in。
- **`README.md` §H3（永久切换与 cutover 冒烟）**：扩写 connect-bot 的新旧实现切换/回退步骤（移除旧发现入口、加入新根、整进程重启、endpoint 手工搬运、旧行 30s 过期），作为相关实施票据的 acceptance criteria。
- `/to-contract` 须把上述两条文档同步义务与 runbook 作为对应 promise 的 coverage。

### 11. 基线、支持记录与硬约束

- 行为基线 = 本机 `my-omp-toolkit` 最新代码（开发期冻结）；扩展只存在于提交 `d3648a0`、仓库修订 `master@34d7c40`（与 `extension-framework@df2554c` 逐字节相同）；面板 `omp-bot@d50e35c`。
- 支持基线 = OMP `@oh-my-pi/pi-coding-agent@18.5.0`（checkout `@9348320`）+ Windows x64 + Bun 1.4.2；运行/验收产物 = 隔离精确安装。
- 准入（沿用框架既有策略）：`supportedVersions` 精确枚举；未列版本每个 main 会话告警一次后继续、不声明支持；缺必需语义按 `required-semantics` 显式拒绝、fail-soft。connect-bot 声明 OMP `18.5.0`。
- 硬约束：不修改 Agent 源码、不维护 fork/补丁、不 monkey-patch；不改默认全局安装/正式配置/运行中 agent（探针与验收一律隔离）；原仓库 `my-omp-toolkit` 冻结，旧断言适配只落迁移侧/移植后产物。
- OMP-qualified 能力在真实运行时验证前保持 `source-inspected; not runtime-exercised`。

### 12. 测试结构（结构决策，非 seam）

- 三层证据：**F 层** `tests/framework/`（新框架能力，in-process `OmpExtensionApi` double）；**E 层** `tests/connect-bot/`（connect-bot 可隔离行为，fake API/ctx + 注入 push 端口 + fake timers，允许 mock、不连 omp-bot）；**M 层** 真 OMP × 真 omp-bot 人工观察（不作自动化门）。
- 不重复测试框架既有能力；只测「新框架能力 + 新 extension 能力」。
- loader/admission 按 codebase-tools/deployment 先例自动化（真实隔离 loader + out-of-dir import + connect-bot admission 断言），原 L2 不再独立人工。

## Testing Decisions

（以下为对话中已定的测试前例与约束，**不是 seam 决策**；seams、各 promise 的测试位置与覆盖由 `/to-contract` 决定。）

- **测试前例（prior art）**：原 connect-bot 的既有 L1 测试（`my-omp-toolkit`，fake ExtensionAPI/CommandContext + `__setPushClientForTest` + `vi.useFakeTimers()`）与 README 的 L3 手动清单，搬作扩展层验收与人工清单的出发点；只适配新框架语义，不照搬绑定旧文案/实现形状的断言。
- **F 层覆盖**：`directed` 控制（空参=on、`off`=off、重复动作、无自动反馈）、per-field `memory` 持久化、per-field 继承默认不继承、handler State 写接缝、每次 `enabled` 写后发 marker；语义生命周期事件（`session_start`/`session_end` 含 reason、`round_start`/`round_end` 无 payload、`canAcceptInput()`、框架优先分发、owner-gate、`required-semantics` fail-soft、session 边界刷 marker、adapter 合成）；统一 `info | error` 反馈（命令 + 语义事件、无 UI 落 stderr）、delivery `hasUI`、`runCommandToggle` 走统一通道且 codebase-tools 文案不变；Extension configuration（声明形状 + 必填/类型 + 全部失败路径 → 统一 BindingFailure + diagnostic + 不加载 + 无默认值、`getConfig`/`readConfig`/`ExtensionConfigError`、yaml 解析）；owner-scoped 可保留句柄与 retire 后 no-op、`session_end.owner`、`previousOwnerKey` 移除、transferred/disposed 清理；`import-boundary.test.ts` 保持 green。
- **E 层覆盖**：marker `◈ connectBot`（enabled 才显示、auto-disarm 清除、框架 marker 区按 id 排序）；文案表 A–J（除 `offline`→`off` 外原文保留）集中为 `selectFeedback` 纯函数并以 mock 覆盖全路径；命令解析与守卫（空参=on、`off`=off、未知参数报错、main + `hasUI` 门槛、no-UI stderr）；连接与心跳（register ≤1s、heartbeat 10s、push/unregister 1.5s、3 次失败 auto-disarm、首次失败通知、成功复位、队列 ≤16 丢最旧 heartbeat、不重试）；三值状态机只在稳态真变化时 push、arm/re-arm 无条件上报一次；会话切换/transferred/disposed；配置声明 `endpoint: non-empty-string`；OMP-qualified allow-list 仅 assembly。
- **必须用 `vi.useFakeTimers()` 驱动**，不真等 wall-clock；abort 与无 assistant 终态可在 M 层复现，其余 5 类终态由 E 层的 `agent_end` shape 用例覆盖。
- **loader/admission 自动化**：沿用既有 `tests/framework/deployment.test.ts`（真实隔离 OMP loader、out-of-dir import）先例 + 新增 connect-bot admission 断言；原 L2 只作 M 层人工前置。
- **M 层人工观察清单**（真 OMP × 真 omp-bot；不作自动化门、不做 pty）：前置 = 基线冻结记录 + 面板运行中 + `listen_addr` 与 `config.yaml` endpoint 一致 + `bun run test` 全绿 + explicit-only 装载；步骤 A 面板就绪 / B 接入成功 / C 幂等重注册 / D 轮次结束→等待用户输入 / E 兜底终态（abort、无 assistant）/ F 主动离线 / G 杀进程 30–35s 过期 / H 面板失联自动 disarm / I 守卫（no-UI、未知参数）/ J 多会话隔离 / K 与 codebase-tools 共存 / L 新旧装载互斥 / M 配置切换。每一步的操作、观察点与预期见 [06 lighthouse](lighthouse/06-acceptance-contract.md) §6；本规格以该文档为清单来源。
- **run record**：记录 `my-omp-toolkit` branch + commit、`omp-bot` commit、OMP 版本 + `bun --version` + lockfile、`my-agent-toolkit` commit + lockfile、`config.yaml` 内容、执行者与日期；非 pinned OMP 版本先跑 `scripts/verify-omp-candidate.ts` 或显式记 `verified-unlisted`。
- **release gate**：`bun run test`（framework + codebase-tools + harness）在记录的源/运行时基线上全绿；历史约束被有意修改时（marker/通知移到框架 marker 区与统一反馈口、`offline`→`off`、缺文件由默认+告警改为 error+不加载）在迁移侧/移植后产物同步改断言，不留旧断言红或弱化断言。
- **永久测试断言约束**：只断言消费者可见行为或必须语义；不 pin 文案措辞、文件布局、转发实现、测试后门；不测 wiring/copies/forwarding/mock echoes/源码文本/顺带默认值/套套逻辑/仅不抛错/仅非空；探针证据不当永久回归。
- **非证据清单**：mock 自证、源码文本断言、pty 脚本、README/spec 声明、顺带默认值、重复测试框架既有能力，均不算验收证据。
- **文档同步作为 acceptance criteria**：§10 的两份文档与 runbook 义务落到相关实施票的验收，不建机械完整性测试。
- **arm/re-arm 上报口径**：`arm`/`re-arm` 无条件上报一次状态；「只在真变化时 push」限定为稳态（避免把重连后的状态同步误判为重复上报）。

## Out of Scope

- pi adapter 的实现与验收；宣称 pi 已验证；广泛覆盖多个 Agent 运行时或 provider。
- 修改 omp-bot 面板或其通信协议；新增双向控制、多面板等业务能力。
- 本规格只完成设计与规格，不实现迁移代码、不生成或执行实施票据。
- 迁移其他扩展（如 codebase-tools 的继续演进或 model-cost），或修改原 `my-omp-toolkit` 仓库以使其依赖本框架。
- 为未知扩展建设通用 UI 语言、完整原生 API 包装层，或补齐所有框架远期能力。
- 框架开设 owner-scoped、memory-only 的 opaque 扩展数据区（`extra_data`）；本次扩展工作数据由扩展自持 owner-scoped 记录。
- **Configuration switch 语义**：本次只让 `config.yaml` 的形态与命名可承载它，不顺带实现；未来要做时另行发起。
- 从旧 `config.json` 的自动转换与一次性导入；端点值由用户手工搬运。
- 代码热重载（extension reload）与进程内 discovery-root 交换；只承诺整进程重启后源码变更生效。
- 跨实现的持久化数据兼容与状态迁移：connect-bot 的接入状态为 in-memory、无业务数据需要转换；旧 `config.json` 的缺文件/坏格式行为不复用（由 Extension configuration 的失败语义取代）。
- 跨能力组合的通用编排层：职责划分若在其它组合中暴露冲突，待具体证据出现再形成问题，不预设需要新的通用编排层。

## Further Notes

- **决策来源**：本规格综合 [map.md](map.md) 与 8 张 resolved 决策票及其 [lighthouse/](lighthouse/)；`resolved` 只表示决策锁定，**不代表代码已实现或测试已通过**。
- **术语**：全程沿用 [GLOSSARY.md](../../GLOSSARY.md) —— Agent runtime（不用 host）、Extension definition、Semantic hook、Semantic lifecycle event、Round、Control kind、Directed control、State、State persistence、Subagent State inheritance、Owner / Parent agent、Extension feedback、Marker area、Extension configuration、Configuration switch、Supported agent-runtime baseline、Behavior library。
- **ADR**：遵循 [ADR-0002](../../docs/adr/0002-semantic-extension-framework.md) —— 仓库内共享源码、目标目录布局、原生边界执行契约、公开接口 additive-only、状态恢复 seam；connect-bot 的 02/04/07 决策已 additive 写入 ADR 0002（决策时完成）。
- **冲突仲裁结果**：scout 对 8 个源文件 + 5 个测试文件逐条比对，代码/README/测试在全部可核对行为上一致，**没有产生行为级差异项**；仅登记三处非行为项——`spec.md` 悬空引用（已解析）、`smoke-omp.ts` 硬编码 omp 路径与 README 不符（测试工具问题）、README 中的面板侧声明在扩展仓库不可验证（由面板侧契约覆盖）。用户明确否决「自动优先级」，若后续发现不一致，逐条登记交用户判断。
- **人工保留项（M 层）**：真实 OMP × 真实 omp-bot 端到端（接入/重注册/状态/心跳/失联/切会话/恢复 + 多会话隔离 + codebase-tools 共存 + 新旧装载互斥 + 配置切换）由用户执行；真实面板 SSE/卡片/30s 过期/「可能已经过期」不作扩展验收对象。
- **未验证项（不阻塞规格/实施）**：真实交互 TUI 视觉观感；OMP 列出的未列版本；pi 路径。按 `source-inspected` / `verified-unlisted` / `unverified` 记录，不升级为支持声明。
- **留给 `/to-contract` 的开放项（本规格不决定）**：模块内部接口与 promise 位置；`directed` 控制类别在 definition 封闭联合中的精确表达与 bound-set 扩展；per-field persistence/继承声明的精确类型形状；语义事件投递类型与 handler 注入接口；owner-scoped 能力句柄的精确签名与生命周期表示；`hasUI`/反馈/声明值写接缝的精确签名；Extension configuration 的 `getConfig`/`readConfig`/`BindingFailure` 精确签名与 `ExtensionConfigError` 边界；各 promise 在哪个 seam 测、覆盖到什么程度；行为库的精确组成（哪些行为进 behavior library、如何组合）。
- **下一步**：`/to-contract` 选择 seam 并批准 promise；随后 `/to-tickets` / `/implement` 按本规格与 lighthouse 推进实施。
