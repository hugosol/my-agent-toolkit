# 01 共同上下文观察与首次快照 — 验收证据（2026-10-17）

本票（P4、P11、P12）的实现由上一轮代理完成并留在此工作树；本轮接手只做三件事：第一手重跑验证、把上一轮
未决的 pi 实际宿主问题查清、提交工作树。**本轮未改动任何产品源码**（唯一新增的仓库文件是本证据记录与其日志，
另有一次临时实验性断言已还原，见「未验证项」）。

## 环境

| 项 | 值 |
| --- | --- |
| 系统 | win32 10.0.26200（x64） |
| 运行时 | bun 1.4.2 |
| 分支 / 树 | `hyper/framework-subagent-observation/01-shared-context-observation-1e4c81-8e524a3be3ca`，基线 `bf4c291`，工作树 `C:\Users\hugos\AppData\Local\Temp\hyper-ticket-k68hox` |
| pi 实际宿主 | pi 1.3.0（`D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`） |
| OMP 实际宿主 | OMP 18.5.0，隔离前缀 `.cache/omp-baseline/18.5.0-viewed-session` + 冻结补丁 |
| POSIX | 未运行；本文所有观察只覆盖 win32。 |

## 验证（本轮第一手重跑）

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `bun run typecheck` | exit 0（干净） | `logs/01-takeover-typecheck.log` |
| `bun test tests/framework` | 507 pass / 0 fail，2326 expect，41 文件，39.5s | `logs/01-takeover-partition-framework.log` |
| `bun test tests/model-cost` | 465 pass / 0 fail，2537 expect，41 文件，7.4s | `logs/01-takeover-partition-model-cost.log` |
| `bun test tests/harness-dock` | 104 pass / 0 fail，1161 expect，27 文件，217.4s（实际 OMP 宿主） | `logs/01-takeover-harness-dock.log` |
| `bun test tests/codebase-tools` | 24 pass / 0 fail，7 文件，47.0s（框架 adapter/`bindExtension` 的受影响消费者） | `logs/01-takeover-partition-codebase-tools.log` |
| `bun scripts/pi-subagent-smoke.ts --foreground-only --expect-pi-version 1.3.0` | exit 0，14 observations held，17.0s（实际 pi 宿主、真实委派、隔离 agent state） | `logs/01-takeover-pi-subagent-smoke.log` |

`tests/connect-bot` 本轮未重跑：与本票无接触面（不订阅任何上下文读数），且上一轮已记录其中 5 例因缺失环境
前置（`omp-bot.exe` 不存在）而失败。

## 验收标准对照

1. **首次接入即读到当前观察（P4）** — `tests/framework/session-context-observation.test.ts` › 「a consumer
   attaching after the session was already working (P4)」两例：第二个消费者在会话已 Working、上下文已采集之后
   接入，读 `snapshot()` 得到 `{session, owner, activity: "working", context}`，且该消费者 `deliveries` 为空
   （没有第二次状态转换，也没有为它补发任何边）。活动读数来自框架自身 Round 记账（边派发处写入），扩展不自行
   判定 Round。
2. **采集点与两宿主映射一致（P11）** — 同文件：「the same given sequence leaves the same observation on either
   harness (P11)」把 pi 面的 `session_start`/`message_end`/`agent_settled` 与 OMP 面的 `session_start`/
   `message_end`/`agent_end` 各自驱动一遍，两侧在框架源里留下同一个 `{tokens, provider, model}` 并互相比对；
   「a count the host did not state is no reading on either harness」（pi 的 `null` 与缺失计数都不算读数）；
   「the reading is collected at the promised facts only」（另一处原生事实不移动读数）。
   `tests/model-cost/pi-session-context.test.ts` 用真实 pi adapter + 真实 MODEL_COST 定义核对逐会话读数。
3. **实际宿主读数与显示预算** — OMP：`bun test tests/harness-dock` 全绿，其中
   `tests/harness-dock/detail-tree.test.ts` 从宿主自己的 `setWidget` 帧读出真实委派子会话的行，断言
   `Ctx: <n>% (<tokens>/450.0K)`，即该渠道自己的显示预算而**非**宿主 context window。pi：实际宿主运行
   （smoke）走通「扩展观察读数轴 → adapter 注册三个采集点 → 框架记录并投递 → 扩展 handler 触发重绘」这条共同
   interface 路径；显示预算一侧由真实 pi adapter 的确定性用例断言（`tests/model-cost/detail-widget.test.ts`
   的 `Ctx: 85% (381.5K/450.0K)`，其宿主 `contextWindow` 为 1,000,000，`tests/model-cost/pi-session-context.test.ts`
   同场景）。**限制**见下节：pi 实际宿主下 detail 的子代理行本轮未取到 Ctx 字段。
4. **移除并行原生采集（P12）** — `extensions/model-cost/harnesses/{omp,pi}.ts` 中已无
   `observeSessionContext`、无 `pi.on(...)`、无 `getContextUsage`（本项目本轮 `grep` 复核，两文件只剩把
   `context.sessionObservations` 交给 runtime）；扩展 shared logic 只读 `SessionObservations` /
   `SessionContextDelivery`。框架只在某个组观察读数时才注册采集点
   （`tests/framework/session-context-observation.test.ts` › 「an assembly that observes no reading asks the
   harness to collect none」），因此不存在重复采集。widget 前端仍保留绘制时对**被显示会话**的
   `getContextUsage()` 原生读（这是绘制期读，不是对被覆盖原生事件的订阅；统一到框架源属显示票 04/07）。
5. **测试规范** — 见上表：确定性分区、受影响消费者、typecheck、实际宿主与消费表面证据齐备，环境/命令/结果/未验证项
   记录于本文与 `logs/`。

## 未验证项与限制

1. **pi 实际宿主下 detail 子代理行不含 Ctx 字段（新增发现，已定性为非本票引入）**。
   `logs/01-takeover-pi-subagent-smoke.log` 的实际 pi 运行里，真实委派子会话的行是
   `  subagent-scout-…  deepseek/deepseek-flash(off)  Cost: ¥0.0018  Run: 26ms` —— 没有 `Ctx:` 单元格。
   而 `extensions/model-cost/shared-logic/presentation/display.ts` 只在 `sessionContext.read(child.sessionId)`
   有读数且该渠道有显示预算时才写出该字段，所以这一现象等价于「父会话的观察源里没有这个子会话的读数」。
   **A/B 实验（证明非本票引入）**：把同一份 smoke（仅额外加一条断言：子行须带 `Ctx: n% (…/450.0K)`）拿到
   `git worktree add --detach <temp> HEAD`（基线 `bf4c291`，即本票改动之前）上运行：
   - 改动后（本工作树）：行同上，无 `Ctx` → 断言失败。
   - 改动前（基线树）：行同上，同样无 `Ctx` → 断言同样失败（`logs/01-experiment-prechange-child-row-ctx.log`；
     该树首次运行的另一个失败见 `logs/01-experiment-prechange-first-run.log`，是该树一次性的既有不稳定性，重跑即过）。
   **成因（源码证据）**：OMP 侧的装配是模块级单例（`extensions/model-cost/harnesses/omp.ts` 的模块级
   `const bindModelCost = ompAdapter(...)`），而 dock 的 OMP 运行让父子会话都经宿主自己的加载器加载**本仓库发行的**
   `entrypoints/omp/model-cost.ts`（`tests/harness-dock/detail-tree.test.ts` 的 `MODEL_COST_ENTRYPOINT`），
   于是父、子共用一个 adapter ⇒ 一个观察源 ⇒ dock 能断言到子行读数（实测全绿）。pi 侧 `modelCostPiHarness(root)`
   **每次调用**都新建自己的一份 adapter 与观察源，而 pi smoke 的父子走的是两份不同的 entry 模块：父会话用 dock
   fixture entry（`tests/harness-dock/fixtures/pi-model-cost/entrypoint.ts`），派生子会话按装配声明的 `childEntry`
   加载运行根下由 smoke 写出的 `<configRoot>/entrypoints/pi/model-cost.ts`（`scripts/pi-subagent-smoke.ts` 的
   `writeChildEntry`，同样是 `modelCostPiHarness(<run root>)` 的新一次调用）⇒ 两个 adapter ⇒ 两个观察源，
   父会话的显示看不到子会话的读数。这是该 dock 形态的装配配对问题，不是本票的行为回归。
   [INFERENCE] 生产形态下父子会话加载的是同一个发行 entry 模块（模块实例只求值一次、默认导出只建一次装配），二者
   应共用一个 adapter 与一个源；本文未取得该形态的实际运行证据（发行 entry 的存储根无法在不写真实用户数据的前提下
   隔离），故不据此计为通过。
   **处置**：不在此处改动。把一份观察源跨装配/进程共享，正是 `framework/core/observations.ts` 文档所指「跨该边界的
   携带属 local access 的职责」，即票 03（跨进程接线）与显示票 04/07 的范围；若后续要按生产形态取得 pi 子行读数，
   最小改动是让父子走同一 entry 模块或让同一进程内的同一定义共享一份源（后者会让同进程内的确定性套件互相串读，
   需一并设计）。本票只记录，不静默降低范围，也不在共享 smoke 脚本上留下会让其他票变红的断言（实验断言已还原，
   `git status` 中该文件无改动）。
2. **pi 的「实际宿主绘制出的读数」仅到上一条为止**：Ctx 字段在 pi 实际宿主的子代理行上未观察（见上）；
   pi 的显示预算形式由真实 adapter 的确定性用例覆盖（`detail-widget.test.ts`、`pi-session-context.test.ts`）。
3. **POSIX 与其他宿主版本未运行**：全部观察为 win32 / bun 1.4.2 / pi 1.3.0 / OMP 18.5.0；不构成对其他平台或版本的
   认证。
4. **P14/P15（去重治安、合并重绘）不在本票声明内**：采集路径只在读数变化时投递，但该承诺属票 07，本票未测量；
   model-cost 的 `session_context` handler 只触发既有的合并重绘。
5. **`bun test tests/connect-bot` 未重跑**（见「验证」表下说明）。

## 交接说明

- 本票交付面（上一轮实现，本轮只复核）：新增 `framework/core/observations.ts`、`framework/behaviors/session-context.ts`、
  `tests/framework/session-context-observation.test.ts`；改动 `framework/{core/protocol.ts,core/assembly.ts,adapters/{omp,pi}.ts,behaviors/{binding,round-events,subscriptions}.ts,public.ts}`、
  `extensions/model-cost/{harnesses/{omp,pi}.ts,shared-logic/{runtime.ts,presentation/session-context.ts},GLOSSARY.md}`、
  `tests/{framework,model-cost}` 的消费者与替身、`scripts/support/detail-layout-fixture.ts`、两份文档与 glossary。
- `bindExtension` 新增第 4 个必填参数 `observations`；两个 adapter 与 port 替身已更新，仓库内无其他调用点。
- `framework/behaviors/round-events.ts` 内联 `ACTIVITY_OF_EDGE` 是票 02 的占位（文件内已注明）：票 02 的
  `behaviors/session-activity.ts` 落地后应替换为其导入。
- `bun.lock` 与两份 `host-patches/*/patch.diff` 在 `git status` 中显示为已修改但**内容无变化**（`git diff --numstat`
  为空）：机器 `core.autocrlf=true` 会把文本文件检出为 CRLF，使 dock 的补丁/哈希校验失效；上一轮已把这三个工件
  还原为 `framework/docs/harness-baseline.json`、`host-patches/*/record.json` 记录的 LF 字节，其 sha256 与记录一致。
  本轮 dock 全绿即在此状态下取得。
