# 06: 用什么证据证明迁移等价且框架边界成立: Lighthouse

> Question and discussion: [06: 用什么证据证明迁移等价且框架边界成立](../decision/06-acceptance-contract.md)

## Question

前述设计确定后，需要哪些验收证据，才能认定 connect-bot 迁移及新增框架能力满足本次验收范围？

按《保留哪些行为，以及以哪个原实现版本为准》确定的收窄口径，证据分两层：(1) 新引入的框架能力在 **framework 层** 验收——connect-bot 若只是复用框架既有行为则不重复测试；(2) 扩展层可独立测试的行为用**隔离测试**验收，**允许 mock**，不要求与 omp-bot 集成。

真实 OMP × 真实 omp-bot 的接入、状态变化、心跳、断开、切会话、失联及恢复，**由用户在迁移后手动执行**，作为人工观察项报告，不作为自动化验收门；本票为其产出一份可执行观察清单（前置、每步观察点与预期）。

形成原行为到设计责任层及验收证据的映射，区分确定性可自动验证的边界与需要现场观察的场景。覆盖多会话隔离、与 codebase-tools 共存、框架原有行为不回退、新旧装载互斥和配置切换，明确源版本及运行时基线的记录要求。只定义验收标准，不执行迁移或在本票据中补做未决定的接口设计。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

## 承接约束

- **（a）保留项 ↔ 面板 S2 对照表**：产出「01 的九项保留行为」与面板侧 `contract.md` 的 S2 承诺（P1–P11）逐条对照，标明每项由扩展契约、框架能力还是面板契约承担；P3/P7 的 `offline` 表述按 02/04 的词形决策标为失效并对齐为 `off`。
- **（b）loader 装载冒烟的归属**：原 L2 冒烟（真 omp loader 装载）与 ADR 0002「必须用真实安装的 loader 验证 entrypoint 从发现目录之外导入」的要求，在 01 收窄后归属未定——本票须明确它是自动化验收项，还是并入用户手动验收轮。
- **（c）新增框架能力清单**：汇总 02/03/04 各自判定的「新引入的框架行为」，形成本票 framework 层验收可直接消费的清单。
- **（d）02 引入的框架能力与既有扩展不回退**（来源：[02 lighthouse](./02-command-state-ownership.md)）：验收清单须覆盖 `directed` 控制类别、per-field `persistence: "memory"`、per-field 继承开关（默认不继承）、handler State 写接缝、每次 `enabled` 写入后发布 marker；并确认 codebase-tools 显式声明「可继承」后原有子代理跟随行为不回退，以及 `tests/framework/owner-inheritance.test.ts` 与 ADR 0002 §Subagent State inheritance 已同步。
- **（e）03 引入的框架能力**（来源：[03 lighthouse](./03-lifecycle-effects.md)）：验收清单须覆盖语义生命周期模型——`session_start`/`session_end`（含 reason）、`round_start`/`round_end`（quiescence、`round_end` 无 payload）、`canAcceptInput()`、框架优先于扩展 handler 的分发顺序、owner-gate（子代理事件不送达 owner 订阅）、缺语义 `required-semantics` fail-soft、session 边界刷新 marker，以及 adapter 的原生→语义合成契约（OMP quiescence 合成规则）。OMP-qualified 项（managed timer、async job snapshot、agent identity/子代理 gate）须在 `docs/agent-runtime-support.md` 的能力差异表中可见。
- **（f）04 引入的框架能力**（来源：[04 lighthouse](./04-interaction-native-boundary.md)）：验收清单须覆盖统一 `info | error` 反馈接缝（命令 + 语义事件 handler 都可用、无 UI 落 stderr）、delivery 上的 `hasUI` 事实、所有 handler delivery 的声明值写接缝（auto-disarm 写 `enabled=false`）、`directed` 命令不自动反馈、`runCommandToggle` 反馈走统一通道且 codebase-tools 文案保持 `codeBaseTools enabled/disabled` 不变。
- **（g）connect-bot 验收项**（来源：同上）：marker 文本 `◈ connectBot`（enabled 才显示、auto-disarm 清除）、文案表 A–J（除 `offline`→`off` 外原文保留）、`selectFeedback` 纯函数全路径（mock）、OMP-qualified allow-list（managed timer + 真实 sessionId/cwd/model）在 `docs/agent-runtime-support.md` 可见。
- **（h）05 引入的框架能力 Extension configuration**（来源：[05 lighthouse](./05-configuration-cutover.md)）：验收清单须覆盖 `definition.config`（`path`/`fields` 纯数据声明）、binding 时读取 `extensions/<id>/config.yaml`、纯 JS `yaml` 包解析（零外部依赖，parser 可注入；core 不依赖 `Bun.YAML`/agent-runtime 专有 API）、required 与 `string | non-empty-string | number | boolean` 校验、缺文件/坏 YAML/顶层非对象/键缺失/类型不符 → `BindingFailure { kind: "config" }` + `reportDiagnostic` error 且扩展不加载、**无代码级默认值**；`getConfig(definition)` / `readConfig(path)` / `ExtensionConfigError`；connect-bot 的 `config.yaml` 默认 endpoint 与 `non-empty-string` 声明。并覆盖新旧装载互斥与配置切换：endpoint 值从旧 `config.json` 手工搬入 `config.yaml`、无自动迁移；旧行按面板 30s 过期保留、切换前 `/connect-bot off` best-effort 清理。并验证声明级校验与既有控制类别同等：`config.fields` 的类型名超出封闭词汇表、`config.path` 非非空字符串等按 configuration 错误拒绝，而非静默忽略。`docs/framework-capabilities.md` 的公开符号索引与相关能力表在实现时同步（属实现承接，不在本票执行）。
- **（i）07 引入的框架能力与后台效果回调**（来源：[07 lighthouse](./07-effect-callback-capabilities.md)）：验收清单须覆盖 owner-scoped 可保留能力句柄（声明值写 + 统一反馈；arm 时由 handler delivery 取得、存入扩展自持记录，供 heartbeat/outbox 回调复用）、句柄随 owner retire 失效（迟到回调写 no-op、不重建 State/不重发 marker、反馈丢弃）、session_end 本次投递的一次性反馈口仍可发 G、auto-disarm 经该句柄写 `enabled=false` 并清 marker、E/F 经统一反馈口；以及 `session_end(transferred|disposed)` 以 `owner.key` 给出正在结束的 owner、`previousOwnerKey` 已移除、transferred 先同步停本地再 best-effort unregister 旧真实 sessionId（沿用 1.5s 超时）、disposed 只停本地不通知、owner 未解析 no-op。并确认 codebase-tools 默认（session-entry）持久化行为不回退：session 边界从目标分支 payload seed（branch/fork 携带条目、switch/resume 取目标 session 自己的值）。本结论同时修订 03 的 adapter 原生边界 invariant 与 04 §8b / user story 15。

## Discussion

### 1. 验收口径、产物形态与 loader 归属

- 本票**不另建验收资产**；Question 与承接约束 (a)–(i) 由决策票据与本文档承载，作为 `/to-spec` 的输入；大方向覆盖由 `/to-contract` 指导。
- 证据分三层：**F 层（framework）** 新框架能力，落 `tests/framework/`，沿用 in-process `OmpExtensionApi` double；**E 层（extension）** connect-bot 专属可隔离行为，落 `tests/connect-bot/`，沿用原 L1 模式（fake ExtensionAPI/CommandContext + `__setPushClientForTest` + `vi.useFakeTimers()`），允许 mock、不连 omp-bot、不真等 wall-clock；**M 层（manual）** 真实 OMP × 真实 omp-bot，用户观察，不作自动化门。
- 归属规则：不重复测试框架既有能力，只测「新框架能力」+「新 extension 能力」。
- loader/admission 按 codebase-tools/deployment 先例自动化：既有 `tests/framework/deployment.test.ts`（真实隔离 OMP loader、out-of-dir import）+ 新增 connect-bot admission 断言；原 L2 不作独立人工步骤，只作人工轮自动化前置；真实面板集成交 M 层。

### 2. 新框架能力验收清单（F 层）

- 02：`directed` 控制（空参=on、`off`=off、重复动作、无自动反馈）、per-field `persistence:"memory"`、per-field 继承开关默认不继承、handler State 写接缝、每次 `enabled` 写后发 marker；落 `tests/framework/control.test.ts` / `session.test.ts` / `owner-inheritance.test.ts` / `marker.test.ts`。
- 03：`session_start`/`session_end(reason)`、`round_start`/`round_end`（quiescence、无 payload）、`canAcceptInput()`、框架先于扩展 handler、owner-gate、`required-semantics` fail-soft、session 边界刷 marker、adapter 原生→语义合成；落 `tests/framework/session.test.ts` + 新增 lifecycle 用例。
- 04：统一 `info | error` 反馈（命令 + 语义事件 handler、无 UI 落 stderr）、delivery `hasUI`、声明值写接缝、`directed` 不自动反馈、`runCommandToggle` 走统一通道且 codebase-tools 文案不变；落 `tests/framework/control.test.ts` / `marker.test.ts` / `admission.test.ts`。
- 05：Extension configuration（纯数据声明、binding 读 `config.yaml`、纯 JS yaml、必填/类型校验、`BindingFailure{kind:"config"}` + diagnostic + 不加载 + 无默认值、`getConfig`/`readConfig`/`ExtensionConfigError`）；落新增 `tests/framework/config.test.ts`。
- 07：owner-scoped 可保留句柄、retire 后 no-op、`session_end` 以 `owner.key` 给出 owner、`previousOwnerKey` 移除、transferred/disposed 清理；落 `tests/framework/session.test.ts` + 新增 effect 用例。
- 08：`framework/adapters/**` 与 `extensions/<id>/runtimes/**` 之外无原生类型；`tests/framework/import-boundary.test.ts` 已存在，保持 green。
- OMP-qualified 项须在 `docs/agent-runtime-support.md` 能力差异表可见；真实运行时测试落地前保持 `source-inspected; not runtime-exercised`，落地后改为已验证。

### 3. connect-bot 扩展层验收清单（E 层）

- marker `◈ connectBot`（enabled 才显示、auto-disarm 清除、框架 marker 区按 id 排序）；文案表 A–J（除 `offline`→`off` 外原文保留）集中为 `selectFeedback` 纯函数并用 mock 覆盖全路径。
- 命令解析与守卫（空参=on、`off`=off、重复动作、未知参数报错、main + `hasUI` 门槛、no-UI stderr）；连接与心跳（register ≤1s、heartbeat 10s、push/unregister 1.5s、3 次失败 auto-disarm、首次失败通知、成功复位、队列 ≤16 丢最旧 heartbeat、不重试）；状态三值机只在真变化 push；会话切换/transferred/disposed；配置声明 `endpoint: non-empty-string`；OMP-qualified allow-list 仅 `runtimes/omp.ts`。
- 全部用 `vi.useFakeTimers()` 驱动；abort + 无 assistant 可 M 层复现，其余 5 类终态由 E 层 `agent_end` shape 用例覆盖。

### 4. 原行为 → 责任层 → 证据映射

| 保留行为 | 责任侧 | 面板 S2 | 验收证据 |
|---|---|---|---|
| 接入回执与重复注册 | extension 契约 | P1/P2 | E：register ≤1s、成功文案、重复 re-register 不 unregister；M：卡片一张、不闪 |
| 立即本地断开 | extension 契约 | P3 | E：`off` 立即清 timer/状态、best-effort unregister；M：行立即消失 |
| 未接入零网络/定时动作 | extension 契约 | P6 | E：无请求、无 timer、无状态写 |
| 主会话与 UI 门槛 | extension 契约 | P5 | E：subagent/no-UI 拒绝、no-UI stderr |
| 三类状态的区分 | extension（接入开关）+ panel（keepAlive） | P8/P9 | E：三值机只在变化 push、heartbeat 不改状态；M：卡片灯/状态 |
| 状态上报与心跳 | extension 契约 | P7 | E：10s/3 次/超时/队列；M：≥35s 静置不弹题、面板失联 |
| 失联停止接入且不自动重连 | extension 契约 | P7 | E：失败预算 auto-disarm；M：停面板 |
| 会话切换与同身份导航 | extension 契约 | P6 | E：changed id 断开、unchanged no-op；M：切会话 |
| 退出后面板过期 | panel（外部前提） | S1 P14 | 不作扩展验收对象；M 观察 30–35s 转离线 |

P3/P7 的 `offline` 表述按 02/04 词形决策标为失效，统一为 `off`。

### 5. 确定性 vs 现场观察边界

- 确定性（F/E 层自动）：全部新框架能力；connect-bot 纯逻辑、文案、命令解析、连接/心跳/队列/状态机（fake timers + fake push + mock delivery）。
- 现场观察（M 层）：真 loader 装载（自动化 loader/admission 测试通过后的人工前置确认）；真实面板 SSE/卡片/30s 过期/「可能已经过期」；真实 OMP 事件时序；多会话隔离；与 codebase-tools 共存；新旧装载互斥；配置切换。
- 不做脚本化 pty；M 层结果不作自动化门。

### 6. 人工观察清单（M 层）

**前置**：源基线冻结（`my-omp-toolkit` branch + commit，01 = `master@34d7c40`，extension 唯一提交 `d3648a0`）；运行时 OMP `@oh-my-pi/pi-coding-agent@18.5.0` + `bun --version` + lockfile；面板 `omp-bot@d50e35c` 运行中、`listen_addr` 与 `config.yaml` 的 `endpoint` 一致、浏览器打开；自动化前置 `bun run test` 全绿 + loader/admission 测试绿；装载 explicit-only root（`--no-extensions -e my-agent-toolkit/entrypoints/omp`）；run record（各基线 commit/版本/lockfile、`config.yaml`、每步结果、截图/日志）。

**步骤（操作 → 观察点 → 预期）**：

- A 面板就绪 → 标题 `omp-bot`、tab `控制面板`/`会话列表`、空态无卡片。
- B 接入成功 `/connect-bot` → marker 区 `◈ connectBot`、通知 `已接入 omp-bot 面板（当前 N 个在线会话）`、卡片 1s 内出现且字段正确（新会话 `空闲`）。
- C 幂等重注册 → N 不变、卡片仍一张、不闪、不新增行。
- D 轮次结束 → `工作中`→`等待用户输入`、卡片置顶高亮、tab 圆点、`1 个刚结束轮次` + 「知道了」；点「知道了」清计数但保留圆点；静置 ≥35s 不迁移、不重复提示。
- E 兜底终态 abort / 无 assistant → 均进入 `等待用户输入`，不卡 `工作中`。
- F 主动离线 `/connect-bot off` → 通知 `已断开 omp-bot 面板`、marker 消失、行立即消失。
- G 杀进程 → 行保留、30–35s 转 `已离线` 并下沉。
- H 面板失联 → 首次失败通知 `与 omp-bot 面板连接中断；若持续失败将自动断开`；≈30s 后 `与 omp-bot 连接中断，已断开；重新执行 /connect-bot 可重连`、marker 消失、不自动恢复；面板已停时 `off` → `omp-bot 面板未响应`。
- I 守卫 → `--no-ui` stderr `当前模式无 UI，不支持接入面板`、不发请求；未知参数 `/connect-bot foo` 报错且状态不变（`off` 现在合法）。
- J 多会话隔离 → 两个 OMP 实例两行独立；子代理事件不产生新行、不误改父状态。
- K 与 codebase-tools 共存 → 两 marker 同区按 id 排序、两命令互不干扰、`codeBaseTools enabled/disabled` 不变。
- L 新旧装载互斥 → 旧实现未被发现、回退路径可用。
- M 配置切换 → `/connect-bot off`、停旧装新、endpoint 从旧 `config.json` 手工搬入 `config.yaml`、整进程重启、重新接入；旧行 30–35s 过期；回退对称。

### 7. 版本与运行时基线记录要求

- run record 顶部记录：`my-omp-toolkit` branch + commit、`omp-bot` commit、OMP 版本 + `bun --version` + lockfile、`my-agent-toolkit` commit + lockfile、`config.yaml` 内容、执行者与日期。
- 非 pinned OMP 版本须先跑 `scripts/verify-omp-candidate.ts` 或显式记录 `verified-unlisted`；自动化计数基线 `docs/agent-runtime-support.md:33`（`framework 78 / extension 24 / harness 9`）迁移后更新为实际计数。

### 8. 全量回归与旧断言更新规则

- release gate：`bun run test`（framework + codebase-tools + harness）在 pinned baseline 上全绿。
- 历史约束被有意修改时（连接标识/footer 通知移到框架 marker 区与统一反馈口、`offline`→`off`、缺文件由默认+告警改为 error+不加载），**必须同步修改原有 test case / README / lighthouse 适配**，不允许留旧断言红或弱化断言；已知需适配：原 L3 步骤 17、footer marker 断言、L1 文案断言，并保持 session-entry 持久化断言、新增 memory 字段反例。

### 9. 文档同步

- `docs/framework-capabilities.md`、`docs/agent-runtime-support.md` 在对应代码 ticket 完成后同步更新即可；本票不设独立验收产物、不建机械完整性测试。
- framework-capabilities 按符号落地补索引；agent-runtime-support 在真实运行时测试落地后把 OMP-qualified 行由 `source-inspected` 更新为已验证（含 managed timer + 真实 sessionId/cwd/model allow-list 行）。

### 10. 非证据 / 反模式

- mock 自证、源码文本断言、pty 脚本、README/spec 声明、顺带默认值、重复测试框架既有能力，均不算验收证据。

---

## Decision

迁移验收采用三层证据：**F 层** 在 `tests/framework/` 以 in-process `OmpExtensionApi` double 验收全部新引入的框架能力（02 directed/`memory`/默认不继承/写接缝、03 语义生命周期与 owner-gate、04 统一 `info | error` 反馈与 `hasUI`、05 Extension configuration、07 owner-scoped 效果句柄与 `session_end` 清理；08 由既有 `import-boundary.test.ts` 保持 green），不重复测试框架既有能力；**E 层** 在 `tests/connect-bot/` 沿用原 L1 模式（fake ExtensionAPI/ctx + `__setPushClientForTest` + `vi.useFakeTimers()`）验收 connect-bot 专属可隔离行为（marker 文本、A–J 文案与 `selectFeedback`、命令解析/守卫、连接/心跳/队列/状态机、会话切换、配置声明、OMP-qualified allow-list），允许 mock、不连 omp-bot；**M 层** 由用户按可执行观察清单执行真实 OMP × omp-bot 集成（接入/重注册/状态/心跳/失联/切会话/恢复 + 多会话隔离 + codebase-tools 共存 + 新旧装载互斥 + 配置切换），不作自动化门。loader/admission 按 codebase-tools/deployment 先例自动化（原 L2 不再独立人工）；全量 `bun run test` 在记录的源/运行时基线上全绿是 release gate，历史约束被有意修改时同步修改旧 test case 适配；`docs/framework-capabilities.md` 与 `docs/agent-runtime-support.md` 在对应代码 ticket 完成后同步更新。

## User stories

1. As a 迁移实施者, I want 新引入的框架能力在 `tests/framework/` 用 in-process double 验收, so that 不依赖真实 OMP 也能证明框架边界成立。
2. As a 迁移实施者, I want connect-bot 专属可隔离行为在 `tests/connect-bot/` 用 mock + fake timers 验收, so that 不连 omp-bot 也能证明扩展行为等价。
3. As a 迁移实施者, I want 不重复测试框架既有能力, so that 测试量只与新引入能力成正比。
4. As a 用户, I want 真实 OMP × omp-bot 集成由我按观察清单手动执行, so that 验收不依赖脆弱的 pty 脚本。
5. As a 用户, I want 一份含前置/操作/观察点/预期的人工观察清单, so that 我能可重复地报告集成结果。
6. As a 迁移实施者, I want loader/admission 按 codebase-tools 先例自动化, so that ADR 0002 的真 loader 要求在自动化内满足、原 L2 不再单独人工。
7. As a 迁移实施者, I want 全量 `bun run test` 在记录的基线上全绿作为 release gate, so that 框架既有行为与 codebase-tools 不回退。
8. As a 迁移实施者, I want 历史约束被有意修改时同步修改旧 test case, so that 测试描述现状而不是旧行为。
9. As a 迁移实施者, I want run record 记录源/运行时/面板/框架基线, so that 每次验收可复现、可追溯。
10. As a 迁移实施者, I want 两份能力文档在对应代码 ticket 完成后同步更新, so that 公开符号与 OMP-qualified 能力在文档可见。
11. As a 迁移实施者, I want 非证据清单（mock 自证/源码文本/pty/README 声明）被显式排除, so that 验收不被假信号通过。
12. As a 迁移实施者, I want 多会话隔离/codebase-tools 共存/新旧互斥/配置切换被清单覆盖, so that 迁移的集成风险被显式检查。

## Preconditions

- 02/03/04/05/07 的 lighthouse 已确认（本票四个 blocker，均已 `resolved`）。
- 01 的收窄口径成立：真实集成手动、不要求自动化。
- codebase-tools 自动化测试与 harness 可运行，pinned OMP `18.5.0` 可用。
- 面板 `omp-bot@d50e35c` 与 `archive-docs/omp-bot/omp-connect-bot/contract.md` 可读/可运行。
- 原扩展 L1/L3 基线可读（开发期冻结）。
- connect-bot 新实现尚不存在——本票只定验收方式，证据在实施期产生。

## Postconditions

- `/to-spec` 可据本票写 Testing Decisions：F/E 层测试清单 + M 层观察清单 + 基线记录要求。
- `/to-contract` 可据本票做大方向覆盖；不新增框架既有能力的重复测试。
- 相关实施票据的 acceptance 含 F/E 测试、旧断言适配、文档同步；M 层作为人工验收项。
- OMP-qualified 行在真实运行时测试落地后由 `source-inspected` 更新为已验证。
- 本票不产生代码。

## Invariants

- 不重复测试框架既有能力；只测新框架能力 + 新 extension 能力。
- 沿用既有测试模式：`tests/framework/` in-process `OmpExtensionApi` double；`tests/connect-bot/` 原 L1（fake api/ctx + `__setPushClientForTest` + `vi.useFakeTimers()`）。
- 真实 OMP × omp-bot 集成永不进自动化门；不做 pty 脚本。
- codebase-tools 既有行为（命令文案、session-entry 持久化、子代理继承）不回退；有意变更则同步改旧断言。
- `framework/adapters/**` 与 `extensions/<id>/runtimes/**` 之外不出现原生类型（`import-boundary.test.ts` 机械执行）。
- 文档在对应代码 ticket 完成后同步，不建机械完整性测试。
