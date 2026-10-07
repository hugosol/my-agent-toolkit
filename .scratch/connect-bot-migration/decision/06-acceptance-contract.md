# 用什么证据证明迁移等价且框架边界成立

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: resolved
Blocked by: 03, 04, 05, 07

## Question

前述设计确定后，需要哪些验收证据，才能认定 connect-bot 迁移及新增框架能力满足本次验收范围？

按《保留哪些行为，以及以哪个原实现版本为准》确定的收窄口径，证据分两层：(1) 新引入的框架能力在 **framework 层** 验收——connect-bot 若只是复用框架既有行为则不重复测试；(2) 扩展层可独立测试的行为用**隔离测试**验收，**允许 mock**，不要求与 omp-bot 集成。

真实 OMP × 真实 omp-bot 的接入、状态变化、心跳、断开、切会话、失联及恢复，**由用户在迁移后手动执行**，作为人工观察项报告，不作为自动化验收门；本票为其产出一份可执行观察清单（前置、每步观察点与预期）。

形成原行为到设计责任层及验收证据的映射，区分确定性可自动验证的边界与需要现场观察的场景。覆盖多会话隔离、与 codebase-tools 共存、框架原有行为不回退、新旧装载互斥和配置切换，明确源版本及运行时基线的记录要求。只定义验收标准，不执行迁移或在本票据中补做未决定的接口设计。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

---

## 承接约束（来源：backtracer，据 [01 lighthouse](../lighthouse/01-behavior-baseline.md)）

- **（a）保留项 ↔ 面板 S2 对照表**：产出「01 的九项保留行为」与面板侧 `contract.md` 的 S2 承诺（P1–P11）逐条对照，标明每项由扩展契约、框架能力还是面板契约承担；P3/P7 的 `offline` 表述按 02/04 的词形决策标为失效并对齐为 `off`。
- **（b）loader 装载冒烟的归属**：原 L2 冒烟（真 omp loader 装载）与 ADR 0002「必须用真实安装的 loader 验证 entrypoint 从发现目录之外导入」的要求，在 01 收窄后归属未定——本票须明确它是自动化验收项，还是并入用户手动验收轮。
- **（c）新增框架能力清单**：汇总 02/03/04 各自判定的「新引入的框架行为」，形成本票 framework 层验收可直接消费的清单。
- **（d）02 引入的框架能力与既有扩展不回退**（来源：[02 lighthouse](../lighthouse/02-command-state-ownership.md)）：验收清单须覆盖 `directed` 控制类别、per-field `persistence: "memory"`、per-field 继承开关（默认不继承）、handler State 写接缝、每次 `enabled` 写入后发布 marker；并确认 codebase-tools 显式声明「可继承」后原有子代理跟随行为不回退，以及 `tests/framework/owner-inheritance.test.ts` 与 ADR 0002 §Subagent State inheritance 已同步。
- **（e）03 引入的框架能力**（来源：[03 lighthouse](../lighthouse/03-lifecycle-effects.md)）：验收清单须覆盖语义生命周期模型——`session_start`/`session_end`（含 reason）、`round_start`/`round_end`（quiescence、`round_end` 无 payload）、`canAcceptInput()`、框架优先于扩展 handler 的分发顺序、owner-gate（子代理事件不送达 owner 订阅）、缺语义 `required-semantics` fail-soft、session 边界刷新 marker，以及 adapter 的原生→语义合成契约（OMP quiescence 合成规则）。OMP-qualified 项（managed timer、async job snapshot、agent identity/子代理 gate）须在 [docs/agent-runtime-support.md](../../docs/agent-runtime-support.md) 的能力差异表中可见。
- **（f）04 引入的框架能力**（来源：[04 lighthouse](../lighthouse/04-interaction-native-boundary.md)）：验收清单须覆盖统一 `info | error` 反馈接缝（命令 + 语义事件 handler 都可用、无 UI 落 stderr）、delivery 上的 `hasUI` 事实、所有 handler delivery 的声明值写接缝（auto-disarm 写 `enabled=false`）、`directed` 命令不自动反馈、`runCommandToggle` 反馈走统一通道且 codebase-tools 文案保持 `codeBaseTools enabled/disabled` 不变。
- **（g）connect-bot 验收项**（来源：同上）：marker 文本 `◈ connectBot`（enabled 才显示、auto-disarm 清除）、文案表 A–J（除 `offline`→`off` 外原文保留）、`selectFeedback` 纯函数全路径（mock）、OMP-qualified allow-list（managed timer + 真实 sessionId/cwd/model）在 [docs/agent-runtime-support.md](../../docs/agent-runtime-support.md) 可见。
- **（h）05 引入的框架能力 Extension configuration**（来源：[05 lighthouse](../lighthouse/05-configuration-cutover.md)）：验收清单须覆盖 `definition.config`（`path`/`fields` 纯数据声明）、binding 时读取 `extensions/<id>/config.yaml`、纯 JS `yaml` 包解析（零外部依赖，parser 可注入；core 不依赖 `Bun.YAML`/agent-runtime 专有 API）、required 与 `string | non-empty-string | number | boolean` 校验、缺文件/坏 YAML/顶层非对象/键缺失/类型不符 → `BindingFailure { kind: "config" }` + `reportDiagnostic` error 且扩展不加载、**无代码级默认值**；`getConfig(definition)` / `readConfig(path)` / `ExtensionConfigError`；connect-bot 的 `config.yaml` 默认 endpoint 与 `non-empty-string` 声明。并覆盖新旧装载互斥与配置切换：endpoint 值从旧 `config.json` 手工搬入 `config.yaml`、无自动迁移；旧行按面板 30s 过期保留、切换前 `/connect-bot off` best-effort 清理。并验证声明级校验与既有控制类别同等：`config.fields` 的类型名超出封闭词汇表、`config.path` 非非空字符串等按 configuration 错误拒绝，而非静默忽略。`docs/framework-capabilities.md` 的公开符号索引与相关能力表在实现时同步（属实现承接，不在本票执行）。
- **（i）07 引入的框架能力与后台效果回调**（来源：[07 lighthouse](../lighthouse/07-effect-callback-capabilities.md)）：验收清单须覆盖 owner-scoped 可保留能力句柄（声明值写 + 统一反馈；arm 时由 handler delivery 取得、存入扩展自持记录，供 heartbeat/outbox 回调复用）、句柄随 owner retire 失效（迟到回调写 no-op、不重建 State/不重发 marker、反馈丢弃）、session_end 本次投递的一次性反馈口仍可发 G、auto-disarm 经该句柄写 `enabled=false` 并清 marker、E/F 经统一反馈口；以及 `session_end(transferred|disposed)` 以 `owner.key` 给出正在结束的 owner、`previousOwnerKey` 已移除、transferred 先同步停本地再 best-effort unregister 旧真实 sessionId（沿用 1.5s 超时）、disposed 只停本地不通知、owner 未解析 no-op。并确认 codebase-tools 默认（session-entry）持久化行为不回退：session 边界从目标分支 payload seed（branch/fork 携带条目、switch/resume 取目标 session 自己的值）。本结论同时修订 03 的 adapter 原生边界 invariant 与 04 §8b / user story 15。

---

## 讨论结果（2026-10-07）

### 1. 验收口径、产物形态与 loader 归属

- 遵循 wayfinder 规范：本票**不另建验收资产**；Question 与承接约束 (a)–(i) 全部由本票据逐条回答，`lighthouse/06` 由 lighthouse 技能产出，作为 `/to-spec` 的可消费输入；大方向覆盖由 `/to-contract` 指导。
- 证据分三层：
  - **F 层（framework）**：新引入的框架能力，落 `tests/framework/`，沿用现有 in-process `OmpExtensionApi` double 模式。
  - **E 层（extension）**：connect-bot 专属、可独立测试的行为，落 `tests/connect-bot/`，沿用原 L1 模式（fake ExtensionAPI/CommandContext + `__setPushClientForTest` + `vi.useFakeTimers()`），允许 mock、不连 omp-bot、不真等 wall-clock。
  - **M 层（manual）**：真实 OMP × 真实 omp-bot 集成，用户执行观察清单，**不作为自动化验收门**。
- 归属规则（用户确认）：**不重复测试框架既有能力**；只测「新引入的框架能力」+「新 extension 的能力」。connect-bot 只是复用框架既有行为的部分不写新测试。
- 先例（用户确认）：参考 codebase-tools 的自动化做法——容易测试且不依赖真实面板的部分用 test case 保证，依赖真实面板/真实时序的集成交给人类。
- **承接约束 (b) loader 冒烟归属**：沿用 codebase-tools/deployment 的自动化模式，由既有 `tests/framework/deployment.test.ts`（真实隔离 OMP loader、out-of-dir import）+ 新增 connect-bot admission 断言覆盖，作为自动化 gate；原 L2 smoke 不再作为独立人工步骤，只作为人工轮的自动化前置。真实面板集成交 M 层。

### 2. 新框架能力验收清单（F 层；承接约束 c/d/e/f/h/i）

| 能力（来源） | 验收点 | 证据落点 |
|---|---|---|
| 02 `directed` 控制 | 写死空参=on、`off`=off；重复执行重复动作（不幂等化）；directed 命令不自动反馈 | `tests/framework/control.test.ts` 新增用例 |
| 02 per-field `persistence:"memory"` | memory 字段不写 session entry、不从 branch payload seed、owner 替换时重置；session-entry 字段行为不变 | `tests/framework/session.test.ts` |
| 02 per-field 继承开关 | 默认不继承；显式 `follow` 才跟随；owner 不能解析时降级 | `tests/framework/owner-inheritance.test.ts` 更新（02 postcondition 点名） |
| 02 handler State 写接缝 + marker | handler 在 State 写入前运行并拥有该写；每次 `enabled` 写后发布 marker | `tests/framework/control.test.ts` / `marker.test.ts` |
| 03 语义生命周期 | `session_start`/`session_end(reason)`、`round_start`/`round_end`（quiescence、`round_end` 无 payload）、`canAcceptInput()`、框架行为先于扩展 handler、owner-gate（子代理事件不送达 owner 订阅）、缺语义 `required-semantics` fail-soft、session 边界刷 marker | `tests/framework/session.test.ts` + 新增 lifecycle 用例 |
| 03 adapter 原生→语义合成 | OMP `agent_end(willContinue)` + `isIdle` + 无 async job/pending 消息 → quiescence→`round_end`；OMP-qualified | in-process double 用例；真实原生路径由 M 层 + OMP-qualified 行承载 |
| 04 统一反馈与写接缝 | 统一 `info | error` 接缝（命令 + 语义事件 handler 都可用；无 UI 落 stderr）；`hasUI` 在 delivery 上；所有 handler delivery 的声明值写接缝（auto-disarm 写 `enabled=false`）；`runCommandToggle` 走统一通道且 codebase-tools 文案 `codeBaseTools enabled/disabled` 不变 | `tests/framework/control.test.ts` / `marker.test.ts` / `admission.test.ts` |
| 05 Extension configuration | `definition.config` 纯数据；binding 读 `extensions/<id>/config.yaml`；纯 JS `yaml`（parser 可注入）；required + `string | non-empty-string | number | boolean` 校验；缺文件/坏 YAML/顶层非对象/键缺失/类型不符 → `BindingFailure{kind:"config"}` + `reportDiagnostic` error + 不加载 + 无代码级默认值；`getConfig`/`readConfig`/`ExtensionConfigError` | 新增 `tests/framework/config.test.ts` |
| 07 owner-scoped 效果句柄与清理 | 句柄可从 handler delivery 取得、存入扩展自持记录并复用；owner retire 后写 no-op、反馈丢弃；`session_end` 以 `owner.key` 给出结束 owner；`previousOwnerKey` 移除；transferred 先停本地再 best-effort unregister 旧真实 sessionId（1.5s）；disposed 只停本地；owner 未解析 no-op | `tests/framework/session.test.ts` + 新增 effect 用例 |
| 08 原生边界 | `framework/adapters/**` 与 `extensions/<id>/runtimes/**` 之外不出现原生类型 | `tests/framework/import-boundary.test.ts`（已存在，保持 green） |

- OMP-qualified 项（managed timer、async job snapshot、agent identity/子代理 gate、真实 sessionId/cwd/model allow-list）必须在 `docs/agent-runtime-support.md` 能力差异表可见；对应真实运行时测试落地前保持 `source-inspected; not runtime-exercised`，落地后改为已验证。

### 3. connect-bot 扩展层验收清单（E 层；承接约束 g）

- marker：文本 `◈ connectBot`（enabled 才显示；auto-disarm 清除；位于框架统一 marker 区、按 id 排序）。
- 文案表 A–J（除 `offline`→`off` 外原文保留），集中为单一 `selectFeedback` 纯函数；用 mock 覆盖全部路径。
- 命令解析与守卫：空参=on、`off`=off、重复执行重复动作、未知参数报错且状态不变；仅 main + `hasUI===true` 可接入；无 UI 落 stderr。
- 连接与心跳：register ≤1s、heartbeat 10s、push/unregister 1.5s、连续 3 次失败 auto-disarm + 通知、失败段首次通知一次、任一成功复位、出站队列（单 flusher、保序、上限 ≤16、满时丢最旧 heartbeat、不重试）；全部用 `vi.useFakeTimers()` 驱动，不真等 wall-clock。
- 状态三值机：只在真变化时 push；heartbeat 不迁移状态、不重复通知。
- 会话切换与清理：changed id → 旧 best-effort unregister + 本地断开 + 通知 + 清；unchanged id 彻底 no-op；transferred/disposed 按 07；owner 未解析 no-op。
- 配置：connect-bot `config.yaml`（`endpoint: http://omp-bot.local:8787`，`non-empty-string`）；加载失败经框架统一错误路径。
- 原生 allow-list：只有 `extensions/connect-bot/runtimes/omp.ts` 使用 managed timer 与真实 sessionId/cwd/model；共享 logic 不 import 原生。
- 7 类兜底终态：abort + 无 assistant 可 M 层复现；其余 5 类由 E 层 `agent_end` shape 用例覆盖（沿用原 L1 用例口径，不新增人工步骤）。

### 4. 原行为 → 责任层 → 证据映射（承接约束 a）

| 保留行为 | 责任侧 | 面板 S2 | 验收证据 |
|---|---|---|---|
| 接入回执与重复注册 | extension 契约 | P1/P2 | E：register ≤1s、成功文案、重复 re-register 不 unregister；M：卡片一张、不闪 |
| 立即本地断开 | extension 契约 | P3 | E：`off` 立即清 timer/状态、best-effort unregister；M：行立即消失 |
| 未接入零网络/定时动作 | extension 契约 | P6 | E：无请求、无 timer、无状态写 |
| 主会话与 UI 门槛 | extension 契约 | P5 | E：subagent/no-UI 拒绝、no-UI stderr 文案 |
| 三类状态的区分 | extension（接入开关）+ panel（keepAlive） | P8/P9 | E：三值机只在变化时 push、heartbeat 不改状态；M：卡片灯/状态 |
| 状态上报与心跳 | extension 契约 | P7 | E：10s/3 次/超时/队列；M：≥35s 静置不弹题、面板失联 |
| 失联停止接入且不自动重连 | extension 契约 | P7 | E：失败预算 auto-disarm；M：停面板 |
| 会话切换与同身份导航 | extension 契约 | P6 | E：changed id 断开、unchanged no-op；M：切会话 |
| 退出后面板过期 | panel（外部前提） | S1 P14 | 不作为扩展验收对象；M 观察 30–35s 转离线 |

- P3/P7 的 `offline` 表述按 02/04 词形决策标注为失效，统一为 `off`。

### 5. 确定性 vs 现场观察边界

- **确定性（F/E 层自动）**：全部新框架能力；connect-bot 纯逻辑、文案、命令解析、连接/心跳/队列/状态机（fake timers + fake push + mock delivery）。
- **现场观察（M 层）**：真 loader 装载（作为自动 loader/admission 测试通过后的人工前置确认）；真实面板 SSE/卡片/30s 过期/「可能已经过期」；真实 OMP 事件时序（quiescence、abort、切会话）；多会话隔离；与 codebase-tools 共存；新旧装载互斥；配置切换。
- 不做脚本化 pty；M 层结果不作自动化门。

### 6. 人工观察清单（M 层，本票要求的「可执行观察清单」）

**前置**

- 源基线冻结：`my-omp-toolkit` extension 代码/文档开发期不变；记录 branch + commit（01 = `master@34d7c40`，extension 唯一提交 `d3648a0`）。
- 运行时基线：OMP `@oh-my-pi/pi-coding-agent@18.5.0`（与 `docs/agent-runtime-baseline.json` 一致）；记录 `bun --version` 与 lockfile。
- 面板基线：`omp-bot@d50e35c` 运行中；`listen_addr` 与 connect-bot `config.yaml` 的 `endpoint` 一致；浏览器打开面板。
- 自动化前置：`bun run test` 全绿 + 自动 loader/admission 测试绿（替代原 L2）。
- 装载方式：explicit-only root（`--no-extensions -e my-agent-toolkit/entrypoints/omp`）；旧实现不并行。
- 记录物：run record（各基线 commit/版本/lockfile、`config.yaml` 内容、每步结果、截图/日志）。

**步骤（操作 → 观察点 → 预期）**

- **A 面板就绪**：打开面板 → 标题 `omp-bot`，tab 为 `控制面板`/`会话列表`，空态无卡片。
- **B 接入成功**：`/connect-bot` → 框架 marker 区出现 `◈ connectBot`；瞬时通知 `已接入 omp-bot 面板（当前 N 个在线会话）`；面板 1s 内出现一张卡片，在线灯亮，会话名/cwd/model/agent 状态正确（新会话为 `空闲`）。
- **C 幂等重注册**：再执行 `/connect-bot` → N 不变、卡片仍只有一张、不闪、不新增行。
- **D 轮次结束**：发一句自然结束的 prompt → 状态 `工作中`→`等待用户输入`；卡片置顶高亮、tab 圆点、组头 `1 个刚结束轮次` + 「知道了」；点「知道了」后计数清除但圆点保留；静置 ≥35s 状态不迁移、不重复提示。
- **E 兜底终态**：长任务中 Esc（abort）、以及产出 assistant 消息前中断 → 均进入 `等待用户输入`，不卡 `工作中`。
- **F 主动离线**：`/connect-bot off` → 通知 `已断开 omp-bot 面板`；marker 消失；面板行**立即消失**（不是转离线）。
- **G 崩溃离线行**：重新接入后直接杀 omp 进程 → 面板行保留，自最后心跳起 30–35s 转 `已离线` 并下沉。
- **H 面板失联与不自动恢复**：停掉 omp-bot → 下一次失败通知 `与 omp-bot 面板连接中断；若持续失败将自动断开`；≈30s（连续 3 次失败）后通知 `与 omp-bot 连接中断，已断开；重新执行 /connect-bot 可重连`，marker 消失；重启面板不自动恢复；面板已停时 `off` → `omp-bot 面板未响应`。
- **I 守卫**：`--no-ui` 下 `/connect-bot` → stderr `当前模式无 UI，不支持接入面板`，不发请求、状态不变；未知参数 `/connect-bot foo` → `未知参数「foo」；用法：/connect-bot（接入 omp-bot 面板）或 /connect-bot off（断开）。`，状态不变（注意 `off` 现在合法）。
- **J 多会话隔离**：两个 OMP 实例各自 `/connect-bot` → 两行独立，名称/状态/keepAlive 互不影响；子代理事件不产生新行、不误改父状态。
- **K 与 codebase-tools 共存**：同一 entrypoint 装载两扩展 → 两个 marker 同区按 id 排序；`/codebase-tools` 与 `/connect-bot` 互不干扰；`codeBaseTools enabled/disabled` 文案与行为不变。
- **L 新旧装载互斥**：确认旧实现未被发现；回退路径可用。
- **M 配置切换**：`/connect-bot off` → 停旧、装新、endpoint 从旧 `config.json` 手工搬入 `config.yaml`、整进程重启 → 重新接入；旧行 30–35s 过期；回退对称。

### 7. 版本与运行时基线记录要求

- 每次验收 run 的 run record 顶部记录：`my-omp-toolkit` 冻结 branch + commit；`omp-bot` commit；OMP 版本 + `bun --version` + lockfile；`my-agent-toolkit` commit + lockfile；`config.yaml` 内容；执行者与日期。
- 换用非 pinned OMP 版本时，须先跑 `scripts/verify-omp-candidate.ts` 或显式记录 `verified-unlisted`，不得默认等价。
- 自动化计数基线：`docs/agent-runtime-support.md:33` 的 `framework 78 / extension 24 / harness 9` 在迁移后更新为实际计数。

### 8. 全量回归与旧断言更新规则（用户确认）

- release gate：`bun run test`（framework + codebase-tools + harness）在 pinned baseline 上全绿。
- 历史约束被有意修改时（例：连接标识/footer 通知移到框架通用 marker 区与统一反馈口；`offline`→`off`；缺文件由「默认 + 告警」改为「error + 不加载」），**必须同步修改原有 test case / README / lighthouse 适配**，不允许留旧断言红或弱化断言。
- 已知需适配的旧断言：原 README L3 步骤 17（`off` 视为未知参数）→ `off` 合法；footer marker 断言 → 框架 marker 区；L1 文案断言按新词形更新；session-entry 持久化断言保持并新增 memory 字段反例。

### 9. 文档同步（用户确认）

- `docs/framework-capabilities.md`、`docs/agent-runtime-support.md` 在对应代码 ticket **完成后同步更新即可**；本票不设独立验收产物、不建机械完整性测试。
- framework-capabilities 按符号落地补索引；agent-runtime-support 在真实运行时测试落地后把 OMP-qualified 行由 `source-inspected` 更新为已验证（含 06(g) 的 managed timer + 真实 sessionId/cwd/model allow-list 行）。

### 10. 非证据 / 反模式

- mock 自证、源码文本断言、pty 脚本、README/spec 声明、顺带默认值、重复测试框架既有能力，均不算验收证据。

---

## Decision

迁移验收采用三层证据：**F 层** 在 `tests/framework/` 以 in-process `OmpExtensionApi` double 验收全部新引入的框架能力（02 directed/`memory`/默认不继承/写接缝、03 语义生命周期与 owner-gate、04 统一 `info | error` 反馈与 `hasUI`、05 Extension configuration、07 owner-scoped 效果句柄与 `session_end` 清理；08 由既有 `import-boundary.test.ts` 保持 green），不重复测试框架既有能力；**E 层** 在 `tests/connect-bot/` 沿用原 L1 模式（fake ExtensionAPI/ctx + `__setPushClientForTest` + `vi.useFakeTimers()`）验收 connect-bot 专属可隔离行为（marker 文本、A–J 文案与 `selectFeedback`、命令解析/守卫、连接/心跳/队列/状态机、会话切换、配置声明、OMP-qualified allow-list），允许 mock、不连 omp-bot；**M 层** 由用户按可执行观察清单执行真实 OMP × omp-bot 集成（接入/重注册/状态/心跳/失联/切会话/恢复 + 多会话隔离 + codebase-tools 共存 + 新旧装载互斥 + 配置切换），不作自动化门。loader/admission 按 codebase-tools/deployment 先例自动化（原 L2 不再独立人工）；全量 `bun run test` 在记录的源/运行时基线上全绿是 release gate，历史约束被有意修改时同步修改旧 test case 适配；`docs/framework-capabilities.md` 与 `docs/agent-runtime-support.md` 在对应代码 ticket 完成后同步更新。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

