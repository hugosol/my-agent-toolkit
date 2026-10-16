# 19：峰谷边界无副作用重绘（记录）

**本文件是本票交付的验证记录**：P45（S2、S3）完整覆盖，以及 P57 中「P45：峰谷重绘无请求/记账/写盘」这一条 Coverage。本文件不改承诺、不改 seam，也不重复认领后续票的条目。

- **入口（可重跑）**：
  - `bun test tests/model-cost/pi-season-boundary.test.ts`（本票新增的 S2/S3 分区，10 例）
  - `bun test tests/model-cost/boundary-timer.test.ts`（OMP 侧同一规则的既有分区，9 例；本票补强末例）
  - `bun test tests/model-cost`（所属分区；39 files / 453 pass）
  - `bun test tests/framework`（共同契约消费者；38 files / 481 pass）
  - `bun run typecheck`
  - `bun scripts/pi-model-cost-smoke.ts --pi D:\nvm4w\nodejs\pi.cmd`（真实宿主入口）
- **源状态**：分支 `hyper/model-cost-pi-migration/19-season-boundary-4d587a-411dc288ea83`，本票提交 `067c8fa`（起点 `df00a19`，即 18 的合入点）。改动：`extensions/model-cost/harnesses/boundary-timer.ts`（自 `harnesses/omp/` 移出）、`harnesses/omp.ts`、`harnesses/omp/widget.ts`、`harnesses/pi.ts`、`harnesses/pi/widget.ts`、`tests/model-cost/boundary-timer.test.ts`、新增 `tests/model-cost/pi-season-boundary.test.ts`、`tests/model-cost/support/{pi-host,ui-timer}.ts`、9 个 pi 测试的调用点与 `extensions/model-cost/GLOSSARY.md`、`framework/docs/harness-support.md`。**本票未改** `framework/core/**`、`framework/adapters/**`、其他扩展与工作流报告。
- **环境**：win32 10.0.26200 / x64 / bun 1.4.2；真实宿主 pi 1.2.0（`D:\nvm4w\nodejs\pi.cmd` → `@earendil-works/pi-coding-agent@1.2.0`）、第三方工件 `pi-subagents@0.78.0`（仓库固定依赖）；本票不涉及 OMP 补丁条件（未跑 OMP dock，见 §6）。无 provider 凭据、无付费调用：smoke 的模型请求由本机捕获端点回答。

## 1. 交付的行为（本票实现）

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| 一份等待，两个 harness | `harnesses/boundary-timer.ts` | OMP 与 pi 共用同一模块；模块只按注册方给出的 `BoundaryTimerHost` 排一次单次等待，自己不命名原生 timer、harness、赛季或钟面。 |
| pi 侧的载体 | `harnesses/pi/widget.ts`（`OWNED_ONE_SHOT`） | pi 的 context 不发布 timer（固定宿主实测 `ctx.setTimeout`/`ctx.clearTimer` 为 `undefined`），前端自持平台单次 `setTimeout`，句柄随前端释放 `clearTimeout`，并 `unref()` 以免空转的等待拖住进程退出；宿主已处置的 ctx 同样释放登记。 |
| 每 UI 一个等待 | `harnesses/pi.ts`（`uiBoundaryTimer`）、`harnesses/omp.ts` | 装配层各组合本进程唯一的一个等待（读 `runtime.presentation.period()`），交给每个前端；同一进程的 spawned 会话 binding 共用它而不新建。 |
| 只对发布 UI 的会话登记 | `harnesses/pi/widget.ts` | `session_start` 时先释放本 binding 上一次的登记再登记：无 UI（含 spawned 会话自己的 binding）不建等待、不绘制；reload 重新 start 只是替换同一个登记。 |
| 每次重绘后按当下重算 | `harnesses/pi/widget.ts`（`render` 末尾 `timer.sync()`） | holiday 打开、进程阻塞错过边界等情形都在下一次重绘时按当下钟面重算，不重放错过的边界。 |
| 释放与失效保护 | `harnesses/pi.ts`（`releasingFrontendsOnCleanup`） | 每个 binding 的前端释放（widget、context 观察、边界等待登记）都收进实例唯一的一次 `cleanup`，而不是只保留最后一个句柄；释放后旧登记不再产生任何效果。 |

## 2. 自动证据（本票分区，真实运行）

```
$ bun run typecheck                      # tsc --noEmit，无输出
$ bun test tests/model-cost              # 453 pass / 0 fail（39 files, 2475 expect）
$ bun test tests/model-cost/pi-season-boundary.test.ts   # 10 pass / 0 fail
$ bun test tests/model-cost/boundary-timer.test.ts       # 9 pass / 0 fail
$ bun test tests/framework               # 481 pass / 0 fail（38 files, 2250 expect）
```

`pi-season-boundary.test.ts` 的接缝是生产的一半以上都不是本文件的替身：真实 `definition` + 真实 framework pi adapter + `createModelCostRuntime`（注入时钟、真实存储根）+ 真实 `attachModelCostWidget` + 与装配同形的进程唯一等待；timer 队列用 `vi` 假时钟驱动，所以「等待被 arming 到哪个瞬间」是可观察量（差 1ms 不重绘、多 1ms 重绘一次）。

- **P45 端点与相邻窗口**：11:00（+08:00）在午高峰窗口内 → 恰好一个等待、arm 到 12:00:00.001（1 小时 +1ms）；12:00:00.000 读数本身仍为峰，arm 到 +1ms，重绘后下一个等待是 14:00:00.000（2 小时 −1ms，窗口开边包含）。
- **阻塞后重算、不重放**：钟面被推到 13:30、随后回调才跑 → 重绘显示当下（谷）季，下一个等待是从实际钟面起的 30 分钟；推进 30 分钟 −1ms 不重绘、+1ms 重绘为峰。
- **holiday**：`start` 时仅按日历 arm 了一个等待（`timersArmed=1`）；周期文档载入后 holiday=true（每个瞬间都是谷）→ 等待被撤销（0），标记为 🏖️，此后 6 小时不重绘。
- **无 UI**：`ctx.hasUI=false` 的会话既无绘制帧也无等待（0/0），推进 6 小时仍为 0。
- **主子**：spawned 会话自己的 binding（同进程、hasUI=false）0 帧 0 等待，全进程仍只有 1 个等待；边界只重绘终端所在会话的 binding。
- **处置**：前端释放（生产上由实例唯一 `cleanup` 抵达）后等待数归 0、widget 被清、此后 6 小时不再重绘；`cleanup` 组合顺序为「先放各前端、再收口实例自身」。

## 3. 负向证据（P57 的 P45 项）

同一个用例先证明这次边界**确实重绘过**（帧数 +1、行首标记由 🔥 变 🌙、且该行除标记外逐字节与上次相同、其余行完全一致），再做外部效果对照：

| 对照面 | 本票观察 | 敏感性对照（证明不是「什么都看不到」） |
| --- | --- | --- |
| 网络 | 出站请求计数 0（runtime 的 `httpRequest` 计数） | 同计数在既有余额/额度用例中随真实查询增长 |
| 记账 | `runtime.view.own("session-main")` 前后逐字段相同（该读数由载入文档的自身记录给出，为 0.05 CNY 的真实值） | 同用例随后结算一个 Turn，该读数随之改变 |
| 文件发布计数 / 内容 | 存储根的条目集合、文档字节、写入时刻（mtime）三者在边界前后完全相同（发布是一次同目录改名替换，因此任一次真实发布都会动这三者之一） | 同用例随后由「另一个进程」写入一份文档，该对照立即报出不同 |
| 同一 UI 是否只有一个等待 | `vi.getTimerCount()` = 1（跨 start/reload/spawned binding 仍是 1）；OMP 侧 `log.armed` 长度 1 且 `log.cancelled` 为空 | 见 §5 注入 A/B |

OMP 侧同一规则的分区（`boundary-timer.test.ts`）本票做了两点补强：末例的文件对照由「仅文档字节」扩为「条目 + 字节 + mtime」，并加了「外部发布会被该对照看见」的对照；其余用例沿用（端点、阻塞后重算、holiday、无 UI、主子共用一个等待、处置取消）。

## 4. 真实宿主事实与已执行的真实路径

1. **pi 不发布 timer（本票实现依据，复用已有真实记录）**：迁移自身的固定宿主 preflight（`.scratch/model-cost-pi-migration/research/07-runtime-validation/raw/preflight-3.observer.jsonl`，pi 1.2.0 + 隔离 agent/session/work/home）记录 `nativeCapabilities.timer: "undefined"`、`clearTimer: "undefined"`；`framework/docs/harness-support.md` 的 `execution.managed-timer` 行同样把 pi 记为「context 没有任何 timer API，扩展自持原生 timer 并在会话资源释放时收口」。本票据此把 pi 侧等待实现为前端自持的单次等待，并把该事实与消费写回该行的证据列。
2. **真实 pi 加载路径仍成立**（本票改动命中装配与前端）：`bun scripts/pi-model-cost-smoke.ts --pi D:\nvm4w\nodejs\pi.cmd` → `PI MODEL-COST SMOKE SUMMARY: pi 1.2.0 — 100 check(s) passed, none failed`（28 个隔离 run，RPC 模式、真实加载入口、真实存储根与命令路径）。RPC 模式的 `hasUI` 为真，因此这 28 个真实进程里前端确实登记了新的边界等待且进程正常退出（与 `unref()` 的取舍一致）。脚本自身记录的限制里含「峰谷边界的定时重绘不在此覆盖」。
3. **没有执行的真实路径**：真实终端里「等到一个真实峰谷边界自动重绘」需要按北京时间整点等真实时刻（09:00/12:00/14:00/18:00），本票未以真实时钟等待；该行为由 §2 的可控时钟 + 真实前端/生命周期覆盖，真实终端观感属人类验收（P52，另票）。spawned 会话 in-process binding 的 `hasUI=false` 本票以「pi 的子会话 binding 不绑 UI 上下文」这一宿主事实建模，未在真实前台委派里复验该假定的每一环（05/18 记录的真实前台委派会替换父 ctx，其阻塞与后果不在本票）。

## 5. 故障注入（每条注入后立即还原并复跑绿）

| 注入 | 结果 |
| --- | --- |
| A：前端不再登记等待（`if (live(ctx)) leaveTimer = undefined`） | 10 例中 8 例失败（端点、下一窗口、阻塞后重算、holiday、主子、reload、处置、负向证据），仅「无 UI」与「cleanup 顺序」两例仍通过（它们不以等待存在为前提） |
| B'：无 UI 也登记且 `!live` 的绘制路径不再撤销登记 | 「无 UI 不画不建」1 例失败（等待数 0 期望、1 实测） |

B（只去掉 `if (live(ctx))` 这一层、保留绘制路径的撤销）不产生失败：该错误被同一次 start 的绘制路径撤销所中和，两处共同维持「无 UI 不留下等待」这一不变量；注入 B' 即去掉第二处后由用例捕获。

## 6. 未覆盖与限制

- **真实边界的自动重绘未实测**（见 §4.3）；`scripts/pi-model-cost-smoke.ts` 自身也把该项列为限制。
- **OMP 真实宿主（dock）回归本 worktree 无法启动**：`tests/harness-dock/*` 在本 worktree 因 `host-patches/omp-18.5.0-viewed-session/patch.diff` 被检出为 CRLF 而报 `patch.diff touches no file`（`tests/harness-dock/host-patch-artifact.ts`）。该文件本票未改动，属既有环境条件；本票对 OMP 侧的证据是同一模块的 hermetic 分区（`boundary-timer.test.ts`，宿主管理 timer 的记录式替身）与 typecheck，未把 dock 通过算作已得。
- **pi 前端把登记标为 UI 自己的那个会话**（`attach(render, host, true)`）：pi 的 context 不发布会话 kind，框架的 kind 也不到扩展自己的原生半边；本票据「只有发布 UI 的 binding 才登记、而 spawned 会话的 context 不发布 UI」这一宿主事实如此标注，未新增按名称/深度/句柄推断身份的路径。若将来 pi 出现第二个发布 UI 的会话，该标注需要按新的宿主事实重新评估。
- **人工/外部确认**：真实终端可读性（P52）与真实账户（P53）不在本票；本票无凭据、许可或平台缺口。

## 7. 集成同步与合并后全仓回归（本轮由集成 helper 执行）

**同步状态**：宿主把本票分支合进 `pi-adapter`（集成提交 `1ccc44300ef99d7d9f73569aa59f9f60a8895fd9`）后把该提交合回本票开发分支，故本分支 HEAD 即 `1ccc443`，
且 `git rev-parse HEAD pi-adapter` 同为该提交、两侧 tree 同为 `a76b095a01425e1417ce1e5a565f1543df131efd`（`git diff --stat pi-adapter HEAD` 空、`git rev-list --left-right --count pi-adapter...HEAD` = `0 0`）。
提交关系：`1ccc443` 的父为 `140a88c`（合并前的集成 tip，即 18 的集成提交）与 `d060b8d`（本票末提交，父链 `de33c99` → `067c8fa` → `df00a19`）。

**无冲突可解**：`git ls-files -u` 0 条未合并路径；本 worktree 的 gitdir（`E:/Developer/myhub/my-agent-toolkit/.git/worktrees/hyper-ticket-FdwVJ9`）内没有 `MERGE_HEAD`／rebase／cherry-pick 状态。

**合入内容逐项核对**：`git diff --stat 140a88c HEAD` = **22 files / 818 insertions / 77 deletions**，与 `git diff --stat df00a19 d060b8d`（本票实现自身的改动）**逐项相同**；
反方向 `git diff --stat d060b8d HEAD` 只有 18 轮在本分支之外记录的集成记录（`evidence/18-native-presentation.md` 与其三份日志、`implementation/18-native-presentation.md`），
且 `git diff d060b8d HEAD -- extensions framework tests scripts entrypoints package.json tsconfig.json` **为空** —— 合入树里本票那 22 个文件的字节与本票分支逐一相同，本票的实现没有在合入时被改写。

**按检出原样运行**（命令 `bun run test`，日志 `logs/19-season-boundary-integration.log`）：
**1141 pass / 17 fail**（126 files / 1158 tests / 6201 expect() calls / 229.92s / exit 1）。17 例全为本机检出/布局前置项，且都落在本票合入**未触碰**的文件上
（`tests/connect-bot/**`、`tests/harness-dock/**` 与本票 22 个文件交集为空），与 [17](17-budget-actions.md)、[18](18-native-presentation.md) 各集成轮记录的类别逐条一致：

| 类 | 例数 | 文件 | 事实 |
| --- | --- | --- | --- |
| 缺真实面板二进制（未设 `OMP_BOT_BINARY`） | 5 | `budget-regression`、`harness-exit-budget`、`panel-registration-lifecycle` ×3 | 本 worktree 位于 `%TEMP%`，`tests/connect-bot/support/omp-bot.ts` 的默认同级路径 `…\Temp\omp-bot\backend\target\release\omp-bot.exe` 不存在（抛点在 `startOmpBot`） |
| CRLF 检出使补丁物化失败 | 10 | `codex-response-artifact`、`combined-host-artifact`、`detail-tree`、`model-cost-codex-quota`、`model-cost-modes`、`model-cost-persistence`、`viewed-marker`、`viewed-session-host`、`viewed-session-total`、`viewed-session` | `host-patches/omp-18.5.0-{viewed-session,codex-response-boundary}/patch.diff touches no file`（`tests/harness-dock/host-patch-artifact.ts` 的 `patchTouchedFiles` 按 LF 切行） |
| 锁文件 sha 按 LF 录制 | 2 | `baseline.test.ts`、`session-driver.test.ts` | 记录值 `a5d37ab2…` 逐字节等于 `HEAD:bun.lock` 的已提交 LF blob（11131 B）；工作区是同一内容的 CRLF 检出（`e7ed487b…`） |

**归一后的全仓回归**（三处工作区文件还原为已提交 LF blob 字节——`bun.lock` `a5d37ab2…`、`viewed-session` `66195465…`、`codex-response-boundary` `4ec9ad0d…`，
三份 sha256 与 `git cat-file blob HEAD:<path>` 逐一相等；并设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`）：
命令 `bun run test` → **1187 pass / 0 fail**（126 files / 6787 expect() calls / 391.09s / **exit 0**，日志 `logs/19-season-boundary-integration-normalized.log`）。
比原样多出的 **29** 例正是那 10 个 dock 文件在文件级失败后未注册的用例（与 17、18 两轮就同一组文件记录的 +29 相同）——
即归一检出下这 10 个 dock 文件不再于文件级失败，其用例全部注册并通过；`.cache/omp-baseline/` 下 `18.5.0-codex-response-boundary`（18:28:39）、`18.5.0-viewed-session-codex-response`（18:28:54）、
`18.5.0-viewed-session`（18:29:09）三个隔离前缀的写入时刻落在本轮运行窗口内（`18.5.0` 目录早于本轮，未被重写）。

`bun run typecheck` → **exit 0**（无诊断，日志 `logs/19-season-boundary-integration-typecheck.log`）。
两次运行期间被测源码与夹具未变：归一只改那三处工作区字节，未动 `extensions/**`、`framework/**`、`tests/**`、`scripts/**`。

**本票新增分区的归属**：两轮 pass 数之差都恰为本票新增的 10 例——原样 1141 = 18 轮 1131 + 10，归一 1187 = 18 轮归一 1177 + 10；两轮中**没有一例失败**来自本票的 22 个文件（17 例失败全部落在上表三类文件上）。

**本轮修复：无源码修复。** 17 例全属本机检出/布局前置项，无一条由本票合入引入；归一后零失败说明没有失败被这些环境例掩盖。
行尾鲁棒的解析或 `.gitattributes` 属装配/宿主验证范围（同类记录见 [17](17-budget-actions.md)、[18](18-native-presentation.md)），不在本票内改动。本轮提交只有本文件、票据更新与三份日志。

**运行后状态**：三处文件按字节恢复原 CRLF 检出状态（sha256 与运行前逐一相同：`bun.lock` `e7ed487b…`、`viewed-session` `057e01f6…`、`codex-response-boundary` `294b3727…`），
`git status` 只余本轮记录改动；未操作集成工作区（`E:/Developer/myhub/my-agent-toolkit`）、未切换分支、未新建 worktree、未 reset、未调用 retro，也未自行合入 `pi-adapter`。

**本轮对 §6 的更正**：§6 记的「OMP 真实宿主（dock）回归本 worktree 无法启动」是 CRLF 检出造成的**物化前置**，不是本票行为的问题——
归一检出下 `tests/harness-dock/**` 的 10 个文件在合并后的树上物化、注册并通过（见上表与 +29）。§6 原文按实现轮记录保留，本轮的更正以本段为准。
但本轮的 dock 通过仍**不构成**峰谷边界等待本身在真实 OMP 宿主上的断言（dock 用例不断言该等待的 arming/取消），本票对该行为的证据仍是
本文 §2 的可控时钟 + 真实前端/生命周期与 `boundary-timer.test.ts` 的记录式托管 timer。

**未因全仓绿而改变的限制**：§4.3 的真实峰谷边界自动重绘未实测、真实 pi TUI 观感（P52）与真实账户（P53）仍属最终独立门禁/人类验收；
本轮的 `OMP_BOT_BINARY` 指向本机既有 release 构建（`E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`），不是本票构建或安装的产物。
本票在合入与合并后回归通过后由集成负责置状态；最终整体验收仍归独立门禁（[25](../implementation/25-evidence-scope-audit.md) 与装配验收票）。
