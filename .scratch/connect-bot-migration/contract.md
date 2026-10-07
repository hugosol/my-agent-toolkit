# Contract — connect-bot 迁移到语义扩展框架（OMP 适配）

Source: [spec.md](spec.md)
Acceptance mode: **Rapid iteration**

<!-- 一个事实一个家：spec 拥有叙事与范围；contract 拥有 promise 与 seam；tickets 拥有切片。此处只引用 spec 与故事编号，不复制。 -->

## Promises

| # | Promise (one observable result) | Coverage | Source | Seam |
|---|---|---|---|---|
| P1 | 框架公开少量 runtime-neutral 接口（`defineExtension` 声明 + `AgentRuntimePort`/deliveries + `bindExtension` 绑定）；共享源 import 图不含 Agent 运行时类型 | F18 | story 5,6,16,17,35,38,57,61 | S2 |
| P2 | 新增 `directed` 控制类别：空参=on、`off`=off，每次执行重复副作用，框架不去重/不短路，幂等由扩展保证 | F1 | story 4,62,63,69 | S2 |
| P3 | `enabled` 用 per-field `persistence:"memory"`：不写 session entry、不从分支 seed、owner 被替换归 default、同身份导航保持；控制类别 × 持久化 × 继承是 per-field 正交轴，控制/会话行为按字段策略分支 | F2 | story 11,15 | S2 |
| P4 | per-field 继承开关默认 `none`（子代理读声明 default），除非字段声明 `follow`；codebase-tools 显式 `follow`，既有子代理跟随不回退 | F3 | story 12,13 | S2 |
| P5 | handler 在 State 写入前运行并拥有写；声明只表达字段所有权；每次写后框架发布 marker | F4 | story 6,7,8,10,46 | S2 |
| P6 | 三值 agent 状态不进框架 State；`enabled` 是唯一 connect-bot 声明值，不出现第二个「当前值」 | F4 | story 14,48 | S2 |
| P7 | `session_start`(initial\|new\|resume\|fork) 与 `session_end`(transferred\|disposed) 对称一对；switch/branch/fork = end(transferred)+start；同身份导航不发事件 | F5 | story 16,17,21,74,77 | S2 |
| P8 | `round_start`/`round_end` 边沿触发，`round_end` 在 quiescence 且无 payload；error/abort 也发 `round_end` | F6 | story 18,20,74 | S2 |
| P9 | `canAcceptInput()` 为独立查询（= idle），用于 arm 初值，不作事件 payload | F6 | story 19,74 | S2 |
| P10 | 框架行为先于扩展 handler 分发、错误互相隔离；session 边界刷新 marker 区 | F7,F9 | story 23,24 | S2 |
| P11 | owner 订阅只收 owner 自身事件（子代理不送达）；缺语义按 `required-semantics` fail-soft 拒绝 | F8 | story 25,26 | S2 |
| P12 | arm handler delivery 提供 owner-scoped 可保留能力句柄（声明值写 + 统一反馈），供 heartbeat/outbox 回调复用；句柄不带 `hasUI` | F13 | story 27,47 | S2 |
| P13 | 句柄随 owner retire 失效：写 no-op（不重建 State、不重发 marker）、反馈丢弃；`session_end` 本次投递自带一次性反馈口 | F13 | story 28,29,30 | S2 |
| P14 | `session_end(transferred\|disposed)` 以 `owner.key` 给出正在结束的 owner；`previousOwnerKey` 移除 | F15 | story 31,32 | S2 |
| P15 | transferred = 同步停本地 → 经本次投递反馈口发通知 → best-effort unregister 旧真实 sessionId（1.5s 超时）→ 删记录；disposed = 只停本地/删记录，不注销不通知；`owner.kind !== "owner"` no-op | F15 | story 21,31,33,77 | S2（S1 佐证） |
| P16 | 统一 `info \| error` Extension feedback 通道（命令 + 语义事件 handler），有 UI→UI 通知、无 UI→stderr，永不进 model context；`runCommandToggle` 走统一通道且 codebase-tools 文案不变；`directed` 不产生框架自动反馈 | F10,F14 | story 34,35,36,44,45 | S2 |
| P17 | delivery/invocation 暴露忠实 `hasUI`；`main + hasUI` 门槛由扩展共享逻辑执行 | F11 | story 37,66 | S2 |
| P18 | marker 区框架所有（摆放/行序/发布/清除），扩展只提供文本；marker 由 `enabled` 派生 | F12 | story 10,40,41 | S2 |
| P19 | `config` 纯数据声明（`path` 覆盖 + `fields` 四种类型），约定 `extensions/<definition.id>/config.yaml`；binding 时注册前读取校验；纯 JS `yaml`（零外部依赖、parser 可注入）；`getConfig` 供共享逻辑、`readConfig` 唯一实现、`ExtensionConfigError` 仅表示已绑定后误用 | F16,F17 | story 49,50,51,52,53,54,55 | S2 |
| P20 | 所有加载期配置错误 → `BindingFailure{kind:"configuration", violation:{kind:"config",detail}}` + `reportDiagnostic` error + 该扩展不加载、其它继续；无代码默认值；未知键忽略；无 env/CLI 覆盖；整机唯一一份；改动需整进程重启 | F16 | story 50,52 | S2 |
| P21 | connect-bot 提交 `config.yaml`（默认 endpoint）+ 声明 `endpoint: "non-empty-string"` | E1 | story 80 | S1/S2 |
| P22 | 原生 escape hatch 固定 `framework/adapters/**` 与 `extensions/<id>/runtimes/**`；共享源不 import 原生类型、不注册原生 hook；`import-boundary.test.ts` 机械执行（词法、原则权威）；公开接口 additive-only，放宽/绕过属非 additive 须 ADR 0002 决策；ADR 0002 与 02/04/07 已决项一致 | F18,D4 | story 57,58,59,60,61 | S2（文档面） |
| P23 | `/connect-bot`（空参）注册当前 main 会话（面板可达），成功回带在线会话数、marker 出现 | E2 | story 62 | S1 |
| P24 | 重复 `/connect-bot` 幂等重注册：不新增行、不闪烁 | E3 | story 63 | S1 |
| P25 | arm 失败（reject/超时）报错、保持未接入、无残留定时器/网络动作 | E4 | story 64 | S1 |
| P26 | 未接入零动作（无请求/无 timer/无状态写）；offline 后归零 | E5 | story 65 | S1 |
| P27 | 仅 main 且 `hasUI` 可执行（含 off）；子代理静默拒绝；no-UI 走 stderr；不改状态、不发请求 | E6 | story 66 | S1/S2 |
| P28 | `off` 先本地立即断开（停心跳、清状态与队列）再尽力 unregister；面板可达（含 404）→「已断开」，reject/超时→「面板未响应」 | E7 | story 67,68 | S1 |
| P29 | 未知参数报错且状态不变；`off` 合法 | E8 | story 69 | S1 |
| P30 | 10s 心跳携带当前状态；面板 keepAlive 30s 过期由面板承担，扩展侧无 30s 逻辑 | E9 | story 70 | S1 |
| P31 | 连续 3 次推送失败（≈30s）auto-disarm + 通知、不自动重连；失败段首次失败通知一次；任一成功复位计数与首次标志 | E10 | story 71,72 | S1 |
| P32 | 出站队列单 flusher 保序、上限 16、满时丢最旧 heartbeat、不重试；register ≤1s、push/unregister ≤1.5s 超时 | E11 | story 73 | S1 |
| P33 | 三值状态机：arm 按 idle 事实取「空闲/工作中」；`round_start`(main)→「工作中」；`round_end`→「等待用户输入」；稳态只在真变化 push；arm/re-arm 无条件上报一次 | E12 | story 74,75,76 | S1/S2 |
| P34 | 会话切换/分支 id 变化 → 旧 id best-effort unregister、本地断开、通知，新会话保持未接入；同身份导航（`/reload`、同文件 `/resume`、`/clear`、`/tree`）no-op | E13 | story 77 | S1 |
| P35 | 不直接 hook 原生 `session_shutdown`；退出/被杀/失活交面板 30s 过期（行转「已离线」并保留） | E14 | story 78 | S1 |
| P36 | marker 文本 `◐ connectBot`（enabled 才显示；off/auto-disarm 清除）；**2026-10-08 用户授权修订**：connect-bot 用 `◐`，codebase-tools 保持 `◈`（选型经 `☰`/`⌁`、`◆`/`●` 两轮回退后定稿；两者同属 Geometric Shapes 且 EAW=A），以区分两个扩展 | E15 | story 40 | S1 |
| P37 | 文案 A–J 除未知参数 `offline`→`off` 外原文保留，集中在 `selectFeedback` 纯函数，不按数字状态码分支 | E16 | story 42,43,69 | S1 |
| P38 | 面板协议不变：固定事件路径 + `{proxy:false}` + `{sessionId,kind,data}` 信封；404/非 2xx 计为推送失败 | E17 | story 79 | S1 |
| P39 | connect-bot 的 OMP assembly 原生读取 managed timer + 真实 sessionId/cwd/model，作为纯数据/能力注入共享逻辑；共享逻辑不 import 原生类型 | E18,F18 | story 38,39,61 | S1/S2 |
| P40 | 扩展工作数据（armed sessionId/health/outbox/三值）由扩展自持 owner-scoped 记录，在 arm/off/auto-disarm/session_end 自建自清 | E18 | story 47 | S2/S1 |
| P41 | 基线冻结：行为基线 `my-omp-toolkit`（扩展 `d3648a0`、仓库 `master@34d7c40`）；面板 `omp-bot@d50e35c`；支持基线 OMP `18.5.0` + Windows x64 + Bun 1.4.2 | L1 | story 85,88 | S1/S2 |
| P42 | loader/admission 自动化（真实隔离 loader + out-of-dir import + connect-bot admission）；新旧装载互斥（旧/新永不同载）；原 L2 不再独立人工 | L2 | story 81,82,89 | S1 |
| P43 | F/E 套件 + `bun run test` 在记录基线上全绿 = release gate；被有意修改的历史约束只在迁移侧/移植后产物同步断言（原仓库冻结） | F1–F18,E1–E18,L2 | story 90,91 | S1/S2 |
| P44 | 文档同步：`docs/framework-capabilities.md`（符号落地 + `ConfigurationViolationKind` 补 `"config"`）、`docs/agent-runtime-support.md`（OMP-qualified 差异表 + subagent State inheritance 对齐 02）、`README.md` §H3 runbook | D1,D2,D3 | story 93,94 | S1/S2（文档面） |
| P45 | 非证据清单排除（mock 自证/源码文本/pty/README 声明/重复测试框架既有能力） | F1–F18,E1–E18 | story 95 | S1/S2 |
| P46 | M 层真实 OMP × omp-bot 集成由用户按清单执行、不作自动门；run record 记录各基线 | H1 | story 84,88,96 | S1（人工） |
| P47 | 永久切换/回退由用户执行（agent 准备步骤、回退修订与冒烟清单） | H2 | story 83,84 | S1（人工） |
| P48 | 维护者最终判断（接受/回退/范围） | H3 | — | S1/S2（人工） |

### Coverage legend

- **F（framework，S2）**：F1 `directed` 控制语义；F2 per-field `memory` + 正交轴分支；F3 继承默认 `none` + codebase-tools `follow` 不回退；F4 handler 先于写 + 声明值写接缝 + 写后发 marker；F5 语义 session 事件与边界；F6 `round_*` + `canAcceptInput()`；F7 框架优先分发 + 错误隔离；F8 owner-gate + `required-semantics` 拒绝；F9 session 边界刷 marker；F10 统一反馈语义；F11 `hasUI` + 门槛；F12 marker 所有权/派生；F13 owner 句柄 + retire 失效；F14 toggle 反馈走统一通道 + `directed` 无自动反馈；F15 `session_end.owner` + `previousOwnerKey` 移除 + 清理序列；F16 Extension configuration 声明/读取/校验/失败；F17 `getConfig`/`readConfig`/`ExtensionConfigError`；F18 import-boundary + additive-only。
  - 归派（第 2 道门）：**框架通用语义**（F4–F18 的非原生部分）以 **runtime-neutral test adapter**（`AgentRuntimePort` + `bindExtension`）为主观察；**OMP 原生合成/映射**（F5/F6/F9 的原生侧、F15 的 transferred、F16 的路径/文件）以 **`ompAdapter` + `OmpExtensionApi` double** 观察，S1 真 loader 佐证。
- **E（connect-bot extension，S1）**：E1 config 声明与默认文件；E2 arm 成功；E3 幂等重注册；E4 arm 失败；E5 未接入零动作；E6 main+`hasUI` 门槛；E7 off 本地先断 + 文案；E8 未知参数；E9 10s 心跳；E10 失败预算 auto-disarm + 通知；E11 出站队列与超时；E12 三值状态机 + arm/re-arm 上报；E13 会话切换；E14 无 `session_shutdown` hook；E15 marker 文本/清除；E16 `selectFeedback`；E17 panel 信封/响应码；E18 OMP 原生事实注入 + 扩展自持记录。
- **L（loader/admission）**：L1 基线记录；L2 loader/admission 自动化 + 装载互斥。
- **D（docs/ADR）**：D1 `framework-capabilities.md`；D2 `agent-runtime-support.md`；D3 `README.md` §H3；D4 ADR 0002 一致性。

### Human-led coverage legend

- **H1 真实 OMP × omp-bot 集成**（spec 的 M 层步骤 A–M：接入/重注册/状态/心跳/失联/切会话/恢复 + 多会话隔离 + codebase-tools 共存 + 新旧装载互斥 + 配置切换）。为何人工：需要交互式 OMP 会话、真实面板 + 浏览器、杀进程/停面板与 30s 过期现场时序；pty 脚本脆弱，面板视觉不是自动断言面。Agent 准备：F/E 套件 + loader/admission 全绿、run record（各 commit/版本/lockfile/`config.yaml`）、逐步前置/操作/观察点/预期、截图/日志位。
- **H2 永久切换/回退**（用户真实安装）。为何人工：硬约束不得改用户已安装配置/默认全局安装；需用户判断与执行。Agent 准备：精确步骤、回退修订、cutover 冒烟清单、`/connect-bot off` 清理建议、旧行 30s 过期说明。
- **H3 维护者最终判断**（接受/回退/范围）。Agent 准备：全部自动证据 + H1/H2 结果汇总。

> **协作指令**：Complete implementation and all assigned automated checks before the human-led acceptance round. Planned human-led checks do not pause otherwise executable work. At the final handoff, report the remaining checks together with their prepared evidence; they remain unverified until the user confirms them. Report genuine blockers when encountered.

## Seam decisions

| Seam | Exposes | Hides | Alternatives considered | Reversibility |
|---|---|---|---|---|
| **S1 OMP extension seam** | connect-bot 在真实运行面上的可观察效果：loader 发现/准入、`/connect-bot` 命令执行、统一 marker 区发布、`info\|error` UI 通知 / stderr、managed timer、出站 panel HTTP（端点/信封/kinds/响应处理/超时）、进程退出 | connect-bot 的模块拆分、出站队列/三值状态机/`selectFeedback`/config 模块内部、扩展自持 owner-scoped 记录 | 单 seam（只留 S1）被否决：框架核心不变量、`required-semantics` 拒绝、config 失败、句柄 retire 在活运行时昂贵且无法隔离构造，与 ADR 0002 的可注入 test adapter 要求冲突 | 中 — 行为 promise 绑定 OMP/面板面；日后改观察点成本高 |
| **S2 framework public interface seam**（runtime-neutral port：`defineExtension` + `AgentRuntimePort`/deliveries + `bindExtension`；由 **OMP adapter**、**未来 pi adapter**、**可注入 test adapter** 多个 adapter 满足） | definition 校验、宿主无关的 State/控制/生命周期/反馈语义、确定性写路径与错误模式、版本准入与拒绝逻辑、Extension configuration、owner-scoped 能力句柄语义 | 全部内部实现（core、behaviors、adapter 原生映射、持久化/UI 传输、entity 解析） | 三 seam 拆分（extension / ompAdapter / framework common function）被否决：`ompAdapter` 是 S2 的 adapter、common function 是 S2 的 implementation，二者不独立变化；单列后只有一个 adapter（hypothetical seam），且加 pi 需再加 seam。单 OMP seam 亦被否决（同 S1 行） | 中低 — public API；形状为继承决策；已批准**只允许加法演进** |

### Decision record（三道门）

- **门 1 — seam 布局**：选 **A（两个 seam，继承既有布局）**。否决单 seam（同上）与三 seam 拆分（adapter vs implementation、单 adapter、不随 pi 扩展）。
- **门 2 — 覆盖归派**：框架**通用语义** promise 以 **runtime-neutral test adapter**（`AgentRuntimePort` + `bindExtension`）为主观察（保持 pi/omp/runtime-neutral 三维度可独立测试）；**OMP 原生合成/映射**以 `ompAdapter` + `OmpExtensionApi` double 观察、S1 真 loader 佐证。已包含项：config 失败统一分类、缺文件/坏格式修订、`offline`→`off`、marker 文本、arm/re-arm 无条件上报、`yaml` 零外部依赖、面板 30s 在面板侧、单 main 继承限制、pi out of scope。无需新增 ADR。
- **门 3 — acceptance mode**：选 **Rapid iteration**；否决 Full automation（H1 真实集成与 H2 用户安装切换无法由 agent 产生，会把 spec 已定人工项变成 blocker/unverified）。

## Not yet specified

<!-- 可见但尚不能精确陈述；均非 approval-blocking。 -->

- **Configuration switch 语义**：spec 显式 deferred，只预留 `config.yaml` 的形态与命名；本 contract 不实现。
- **S1 的 pi 实例化与框架是否提供公开的 runtime-neutral bind 入口**：本次 pi out of scope；S1 作为「每 runtime 一个原生实例」可容纳 pi，未来 pi 努力再决定其入口形状。

## Out of scope

完全沿用 [spec.md](spec.md) 的 Out of Scope；contract 不新增。包括但不限于：pi adapter 实现与验收；修改 omp-bot 面板/协议；迁移其他扩展或修改原 `my-omp-toolkit`；通用 UI 语言/完整原生 API 包装/远期框架能力；opaque `extra_data`；Configuration switch 语义；从旧 `config.json` 自动转换/持久化数据兼容/状态迁移；代码热重载；跨能力组合的通用编排层。
