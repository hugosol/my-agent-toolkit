# 18：两端原生展示与实时 context（P43、P44、P46）

本票要求两端原生绘制同一批业务内容（brief/detail、代理树、费用结构、预算条、Accrued、未知/不完整提示），
context 取自所属会话自己的公开读数，pi 不跟随 inspector、OMP 保留 Viewed 路径。

**本文件当前只记录集成轮的门禁（合入树全仓回归）。** 本票自己的真实宿主验收项——P43/P44/P46 的
真实宿主半、真实 pi TUI 的 component 形态、OMP 消费端回归、`null`／无显示预算／窗口不同于固定预算的
真实对照、docs 更新与 fault-injection 复核——尚未完成，逐条状态见本票实现报告
`implement-c41ff4bb-c707-492a-af7e-edc07bb0aeb7.md`（tdd 会话输出，位于本仓库工作区之外）与
[implementation/18-native-presentation.md](../implementation/18-native-presentation.md) 的 Comments。
自动化侧：本票新增 `tests/model-cost/pi-presentation.test.ts`（12 例）、`tests/model-cost/pi-session-context.test.ts`（3 例）
与共享受控 pi 面 `tests/model-cost/support/pi-host.ts`。

## 集成同步与合并后全仓回归（本轮由集成 helper 执行）

**同步**：宿主把本票分支合进 `pi-adapter`（集成提交 `df00a19c950d115846fe9d2f632d438eaa019ff3`）后把该提交合回本票开发分支，
故本分支 HEAD 即 `df00a19`，且 `git rev-parse HEAD pi-adapter` 同为该提交、两侧 tree 同为
`8a69ece0aa0fd26192b23fb5bd0c1494b0015945`。提交关系：`df00a19` 的父为
`1c543d6`（合并前的集成 tip）与 `acd18d2`（本票实现提交，其自己的父是 `506a445`＝17 轮集成 tip）。

**无冲突可解**：`git ls-files -u` 0 条未合并路径；本 worktree 的 gitdir
（`E:/Developer/myhub/my-agent-toolkit/.git/worktrees/hyper-ticket-FSo4Py`）内没有 `MERGE_HEAD`／rebase／cherry-pick 状态。

**合入内容逐项核对**：`git diff --stat 1c543d6 HEAD` = **6 files / 1995 insertions / 76 deletions**，
与 `git diff --stat 506a445 acd18d2`（本票实现提交自身的改动）**逐项相同** ——

| 文件 | 改动 |
|---|---|
| `framework/adapters/pi.ts` | 44（+）；pi 自己的 run mode 与 widget 的 component 形态（`PiExtensionContext.mode?`、`PiWidgetTheme`、`PiWidgetComponent`、`setWidget` 的 component 重载） |
| `extensions/model-cost/harnesses/pi.ts` | 83（+/-）；`observeSessionContext(pi, runtime)` 让每个 binding 把自己的公开 context 读数写进进程共享 registry，并与 widget 同一 cleanup 释放 |
| `extensions/model-cost/harnesses/pi/widget.ts` | 910（+/-）；pi 前端按 run mode 选择 component／lines 形态并自负布局（列对齐、窄宽度缩写/换行） |
| `tests/model-cost/pi-presentation.test.ts` | 565（+） |
| `tests/model-cost/pi-session-context.test.ts` | 250（+） |
| `tests/model-cost/support/pi-host.ts` | 219（+） |

反方向 `git diff --stat acd18d2 HEAD` 只有其他轮次的记录与一处既有测试改动
（`evidence/17-budget-actions.md`、`evidence/logs/17-*`、`implementation/16-runtime-gaps.md`、`implementation/17-budget-actions.md`、
`tests/harness-dock/model-cost-session-span.test.ts` 7 行，来自 16 轮的去抖修复），本票 6 个文件的字节未变。

**按检出原样运行**（命令 `bun run test`，本 worktree 的工具 shell＝Git Bash；日志 `logs/18-native-presentation-integration.log`）：
**1131 pass / 17 fail**（125 files / 1148 tests / 6154 expect() calls / 246.00s / exit 1）。17 例全为本机检出/布局前置项，
且都落在本票合入**未触碰**的文件上（`tests/connect-bot/**`、`tests/harness-dock/**` 与本票 6 个文件交集为空），与
[17](17-budget-actions.md)、[15](15-period-reset.md) 各集成轮记录的类别逐条一致：

| 类 | 例数 | 文件 | 事实 |
| --- | --- | --- | --- |
| 缺真实面板二进制（未设 `OMP_BOT_BINARY`） | 5 | `budget-regression`、`harness-exit-budget`、`panel-registration-lifecycle` ×3 | 本 worktree 位于 `%TEMP%`，`tests/connect-bot/support/omp-bot.ts` 的默认同级路径 `…\Temp\omp-bot\backend\target\release\omp-bot.exe` 不存在（抛点在 `startOmpBot`） |
| CRLF 检出使补丁物化失败 | 10 | `codex-response-artifact`、`combined-host-artifact`、`detail-tree`、`model-cost-codex-quota`、`model-cost-modes`、`model-cost-persistence`、`viewed-marker`、`viewed-session-host`、`viewed-session-total`、`viewed-session` | `host-patches/omp-18.5.0-{viewed-session,codex-response-boundary}/patch.diff touches no file`（`tests/harness-dock/host-patch-artifact.ts` 的 `patchTouchedFiles` 按 LF 切行） |
| 锁文件 sha 按 LF 录制 | 2 | `baseline.test.ts`、`session-driver.test.ts` | 记录值 `a5d37ab2…` 逐字节等于 `HEAD:bun.lock` 的已提交 LF blob（11131 B）；工作区是同一内容的 CRLF 检出（`e7ed487b…`） |

**归一后的全仓回归**（三处工作区文件还原为已提交 LF blob 字节——`bun.lock` `a5d37ab2…`、
`viewed-session` `66195465…`、`codex-response-boundary` `4ec9ad0d…`，三份 sha256 与 `git cat-file blob HEAD:<path>` 逐一相等；
并设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`）：
命令 `bun run test` → **1177 pass / 0 fail**（125 files / 6740 expect() calls / 408.19s / **exit 0**，
日志 `logs/18-native-presentation-integration-normalized.log`）。比原样多出的 29 例正是那 10 个 dock 文件在文件级失败后未注册的用例
（与 17 轮记录的 +29 相同）。该轮实际物化并校验通过四个隔离前缀：`.cache/omp-baseline/18.5.0`、
`18.5.0-viewed-session`、`18.5.0-codex-response-boundary`、`18.5.0-viewed-session-codex-response`。

`bun run typecheck` → **exit 0**（无诊断，日志 `logs/18-native-presentation-integration-typecheck.log`）。
两次运行期间被测源码与夹具未变：归一只改那三处工作区字节，未动 `extensions/**`、`framework/**`、`tests/**`、`scripts/**`。

**本轮修复：无源码修复。** 17 例全属本机检出/布局前置项，无一条由本票合入引入；归一后零失败说明没有失败被这些环境例掩盖。
本票的进程内消费者（`tests/model-cost` 全分区，含本票新增的 12 + 3 例与既有 pi widget／session-context 相关套件）
在归一后的全仓运行中全绿。行尾鲁棒的解析或 `.gitattributes` 属装配/宿主验证范围（同类记录见 [17](17-budget-actions.md)），
不在本票内改动。本轮提交只有本文件、票据更新与三份日志。

**运行后状态**：三处文件按字节恢复原 CRLF 检出状态（sha256 与运行前逐一相同：`bun.lock` `e7ed487b…`、
`viewed-session` `057e01f6…`、`codex-response-boundary` `294b3727…`），`git status` 只余本轮记录改动；
未操作集成工作区（`E:/Developer/myhub/my-agent-toolkit`）、未切换分支、未新建 worktree、未 reset、未调用 retro，也未自行合入 `pi-adapter`。

**未因全仓绿而改变的限制**：本票自身的真实宿主/真实 TUI/消费端验收、`scripts/pi-native-presentation-smoke.ts`、
docs 更新与 fault-injection 复核均未在本轮执行（它们属实现与最终独立门禁）；实现报告记录的
「装配级夹具在 `pi-session-context.test.ts` 中看不到 identity／period 记录」这一未定性发现原样保留，本票不得据此判为通过。
