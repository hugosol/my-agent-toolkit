# 15：整文档归档与有条件周期重置（P35、P36、P37）

本票把周期重置的**既有公共规则**（`period-switch.ts` / `consumption-store.reset` / `consumption-archive.ts`，规则级覆盖在
`tests/model-cost/period-switch.test.ts`）落到**实际 pi 入口**上，并补上唯一发现的生产缺口：pi adapter 的命令面不读
「宿主不上报活动状态」这一事实，而是直接调用 `ctx.isIdle()`，导致该情形以 `TypeError` 崩溃，而不是按契约拒绝。

## 生产改动

| 文件 | 改动 | 理由 |
|---|---|---|
| `framework/adapters/pi.ts` | 命令交付的 `canAcceptInput` 由 `() => ctx.isIdle()` 改为「函数在场才调用，否则经 `reportMissingFact("idle fact (isIdle)")` 回答 `undefined`」 | 框架把 `canAcceptInput()` 定义为三值查询（`undefined` = 本宿主不上报活动状态），OMP adapter（`canAcceptInputOf`）与 pi 自己的 round 映射（`adapters/pi/round.ts` 的 `quiescent`）都按此实现；命令面漏了同一保护。P37 要求「活动未知」立即拒绝，缺该保护时该路径不是拒绝而是崩溃。 |
| `scripts/pi-model-cost-smoke.ts` | 新增 Phase 10（真实 pi 进程的周期重置）；新增共用的 `commandNotices` / `periodCommand` 帮助；Phase 6 的 `/budget clear` 改经 `periodCommand` | 真实宿主入口证据；并修掉 Phase 6 的一处既有竞态（见下） |

**红→绿证据（P37「活动未知」）**：改动前 `tests/model-cost/pi-period-reset.test.ts` 的
`an entry whose surface reports no idle fact is refused as an error, once, and nothing is guessed` 失败于
`/budget holiday failed: ctx.isIdle is not a function.`；改动后同一用例通过，并在非模型通道报告
`modelCost: this harness reports no idle fact (isIdle); the framework answers nothing rather than inventing one`（每次绑定一次）。

**Phase 6 竞态**：首次真实运行中 Phase 6 的 `/budget clear` 被真实宿主按既定规则拒绝，通知原文
`/budget clear 未执行：当前入口的消费保存尚未收口；本命令不排队，请稍后重试。`，其后的 `savedDocument` 15s 超时导致整轮停在 Phase 6。
原因是该步的等待条件 `sessionsOf(document).length > 0` 可被共享根里**更早 run 留下的记录**满足，于是命令在该 entry 自身保存尚未收口时就被敲入。
`periodCommand` 只对这一条「保存未收口」通知做有界重敲（≤3 次、每次 250ms），其它任何回答（含其它拒绝）原样返回，重敲时打印 `note` 行。
本轮（第 3 次）运行未触发重敲，日志中无 `note` 行。

## 本票拥有的证据

命令与环境（均在本 worktree，Windows x64，pi 1.2.0 已安装 CLI）：

**被测源状态**：本票在本票据分支上的唯一提交（主题行 `15: pi 上的整文档归档与有条件周期重置（P35、P36、P37）`，即分支 tip）的工作树内容；证据记录与该提交之间未再改任何源码。**host patch 条件**：本票的 pi 真实运行不需要任何 host patch
（周期重置路径不经由 13 号票为 OMP Codex 响应边界打的补丁；smoke 的 Codex phase 用的是它自己的脚本化账户答案 fixture）。被测宿主为已安装的
`@earendil-works/pi-coding-agent` 1.2.0（`resolvePiCli` 解析到 `D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`），
OMP 基线工件与版本未被本票触碰，也未在本票运行。

| 命令 | 结果 |
|---|---|
| `bun test tests/model-cost/pi-period-reset.test.ts` | 15 pass / 0 fail（117 expect） |
| `bun test tests/model-cost` | 415 pass / 0 fail（34 files） |
| `bun test tests/framework`（改了 pi adapter） | 481 pass / 0 fail（38 files） |
| `bun run typecheck` | 无输出（通过） |
| `bun scripts/pi-model-cost-smoke.ts`（解析已安装 pi，本机 `pi.cmd` → `@earendil-works/pi-coding-agent` 1.2.0 的 `dist/bundle/cli.js`） | **97 checks passed, none failed**，exit 0；28 个隔离 run；成功即删除 run root（无 `kept for inspection`） |

日志：`evidence/logs/15-period-reset.log`（通过的那轮，全文 129 行）、`evidence/logs/15-period-reset-run2.log`（Phase 10 断言笔误那轮，含归档会话清单）。
第 1 轮（Phase 6 竞态）的日志在本票过程中被第 2 轮覆盖，其关键事实（拒绝通知原文、`savedDocument` 超时）以引文形式保留在上面。

- **S1**：`pi-period-reset.test.ts` 经**真实 pi adapter** + 真实 definition + 真实 runtime 绑定，只用 pi 原生交付驱动（`session_start` / `input` / `agent_start` / `before_provider_request` / `message_end` / `agent_settled` 及表面自身阅读的 `isIdle`/`model`/registry），命令经 pi 自身 `registerCommand` 的路径进入；框架公共绑定与框架自己的 `/${cmd} {action} failed:` 上报同在生产路径上。
- **S2**：观察面就是操作面——pi 命令入口、`ui.notify` 通知、`setWidget` 帧、read-only 展示结果；真实宿主另由 smoke 的 16 项检查（真实进程 + RPC）覆盖。
- **S3**：每个用例自持 storage root，归档/活动文档/独立估计都用普通文件系统调用读回；smoke 的同一 storage root 由两个真实 pi 进程共享。

## 承诺 → 证据

### P35（S2、S3）

| 检查 | 用例 |
|---|---|
| 两 harness/provider/session 混合文档整份归档 | 套件 `clear archives both harnesses' saved activity…`（pi+omp 桶、deepseek+codex provider、主+子会话，归档与 `TREE` 全等）；smoke `clear archives the whole file it closes: both harnesses, both providers and every session of them` |
| 有效零 | 套件 `a saved period of confirmed zero consumption is closed and archived as it is` |
| 并发（同进程第二个 writer 已提交的记录在归档内） | 套件 `a record another writer committed into the file is inside the archive and not in the new period`（归档里 `saveVersion 4`、`0.0395`＝0.031+0.0085 人工求和，而该实例自身视图仍是 0.031）；跨进程由 smoke `the record the other process committed is inside the archive rather than lost to this entry's own view`（第二个真实 pi 进程先提交，归档 5 条含两个 live 会话） |
| 并发（在途发布被等待而非抢读） | 套件 `a publication still on its way is waited for, and the document it publishes is what the archive holds` |
| 归档失败 | 套件 `an archive that could not be written leaves the activity alone and reports one error`（文件字节不变，错误含「归档未生成」） |
| 发布失败（归档已生成、新活动未提交） | 套件 `an archive that landed while the new activity did not keeps its stage, and no success is reported`（保留归档、文件不变、错误同时含「归档已生成」「未提交」；该用例用真实时钟走完框架的发布等待预算） |
| 新 period / start=end / 同次余额 | 套件控制用例（`start` = 归档 `end`、`start_bal` = `end_bal` = 本次 7.75，而启动预取是 12.50 → 证明用的是本次独立读取而非缓存）；smoke `the new period is ordinary, starts at the instant the archive ended and carries the same balance reading` |
| 余额失败不补缓存/零 | 套件 `a boundary read that failed leaves both balance fields out, keeps the reading it held, and still closes the period`（`end_bal`/`start_bal` 均缺席、展示仍持 12.5、旧归档与独立估计字节不变） |
| 不改旧归档/独立估计，不从归档读回 | 套件上一行 + `the entry's own unsaved work is dropped rather than carried…`（新周期只有新一次的 0.0085，`saveVersion 1`，不含旧周期记录）；smoke `the reset left the independent estimate document exactly as it was`、`the new period holds only its own consumption, from the session's own first version` |
| 旧周期未保存/在途数据不入新周期，且不强制提交其他会话 | 套件 `the entry's own unsaved work is dropped rather than carried, and no session is forced to save for the switch`（归档全等 `TREE`——未被强推保存的头版记录 `saveVersion` 仍是 2；旧周期开着的 Round 结束时一个字都没写） |
| 先归档再发布 | 套件控制用例与发布失败用例的归档/新文档成对断言；smoke 由 RPC 命令完成后再读盘 |

### P36（S2、S3）

| 检查 | 用例 |
|---|---|
| 普通 clear 为 `holiday=false` | 套件控制用例（新文档全等目标形状）；smoke 的 clear 通知含 `holiday=false` 且文档 `holiday === false` |
| 首次 holiday 直接发布 `true` | 套件 `the first holiday publishes a holiday period directly, in the one commit its archive precedes`（归档 = 关闭的那个普通周期，新文档一次即为 `holiday: true`）；smoke `the first holiday opens a holiday period directly, in the one commit its own archive precedes` |
| 已有 holiday 幂等 | 套件 `a holiday asked of a period that already is one…`（文档逐字节不变、0 归档、余额查询只有启动预取）；smoke `a holiday asked of a period that already is one archives nothing, switches nothing and queries nothing`（归档仍 2、文档全等、余额调用仍 +2） |
| 不做先 clear 再改字段两步发布 | 断言「一次命令 → 一个新 periodId + 恰一个归档 + 归档内容是该周期原样」，中间态文档无处可藏；smoke 同形 |
| 归档数量与周期身份 | 套件 `an earlier archive is never replaced by a later switch` 由共享套件拥有；本套件断言归档数与周期身份一致 |

### P37（S1、S2、S3）

| 检查 | 用例 |
|---|---|
| 非 DeepSeek（另一 provider / 宿主不上报当前模型） | 套件 `an entry running another provider — and one whose model pi reports nothing for — is warned and nothing is written`；smoke `a period action on an entry running another provider is refused at once and writes nothing` + `the refused action asked the provider nothing` |
| 忙碌 | 套件 `a working entry is warned, and the later end of its Round does not run the refused action`（随后 Round 结算/结束，文件、归档、通知一律不变） |
| 活动未知 | 套件 `an entry whose surface reports no idle fact is refused as an error, once, and nothing is guessed`（本票新增的生产修复） |
| 自身保存未收口 | 套件 `a save this entry started and has not seen land refuses the switch, and the switch is not queued behind it`（在途保存其后落盘为 `saveVersion 4`、`0.0395`，周期不变、0 归档）；真实宿主侧由 Phase 6 第 1 轮的拒绝通知原文佐证 |
| 成功对照 | 上述各失败用例各自都有同条件的成功用例（控制用例、holiday 首/次、无效零等） |
| 入口偏好不受重置影响 | 套件 `the entry's own display preference is the entry's, not the switch's`；smoke `the entry's own display preference does not move with the period: it was still the detail form the operator set` |

## 未覆盖与限制（不声称通过）

- **余额与账户**：边界余额读的是 capture endpoint（本机受控第三方），不是真实账户；真实账户侧核对属 P53/票据 24。无付费调用。
- **「活动未知」在真实 pi 上不可生产**：pi 只在自身空闲时把命令交给扩展，且其 context 始终发布 `isIdle`。该拒绝因此只由进程内套件覆盖（smoke Phase 10 头注释与收尾 limitations 行都记了这一分工）。
- **「忙碌」同理**：真实宿主不会在忙碌时交付命令。
- **发布失败用例**用的是本平台的「目标名不可替换」（Windows 上 chmod 只读）注入；POSIX 分支沿用共享套件写法但本机未运行。
- **TUI 可读性**（P52）、**效率/复杂度判断**（P51）、**真实账户**（P53）仍是人类验收项，本票不涉及。
- **本轮真实运行只对已安装 pi 1.2.0（`@earendil-works/pi-coding-agent`）与 OMP 侧未改动的现状成立**；未按版本推广，未在 POSIX/跨用户上取证。
- 本票的 `tests/model-cost/pi-period-reset.test.ts` 用假时钟；其中「归档已生成但新活动未提交」一例切回真实时钟，因为框架的发布等待预算按真实时间计（假时钟下该预算不可推进）。这一点写在用例注释里。

## 顺带修好的既有缺陷（非本票承诺）

`scripts/pi-model-cost-smoke.ts` Phase 6 的等待条件可被共享根里更早 run 的记录满足，从而在 entry 自身保存未收口时敲入 `/budget clear`（第 1 轮真实复现）。
已按上面的 `periodCommand` 有界重敲修好；本票与 Phase 10 共用同一帮助函数。除此之外脚本其它 phase 未改行为（本轮 97 项全通过）。

## 集成同步与合并后全仓回归（本轮由集成 helper 执行）

**同步**：宿主把本票分支合进 `pi-adapter`（集成提交 `5581010f5fd5f91276897e766224b7815c44fbf0`）后把该提交合回本票分支，故本分支 HEAD 即 `5581010`（父提交 `5aeefe2` ＝合并前的集成 tip、`94651a9` ＝本票实现提交），与 `pi-adapter` tip 同一提交。**无冲突可解**：本 worktree 的 gitdir 内没有 `MERGE_HEAD`/rebase/cherry-pick 状态，`git ls-files -u` 空（0 条未合并路径），`git status --porcelain` 空。**合入内容逐项核对**：`git diff --stat 5aeefe2 HEAD` 正好是本票 7 个文件（`framework/adapters/pi.ts`、`scripts/pi-model-cost-smoke.ts`、`tests/model-cost/pi-period-reset.test.ts`，加本票证据、两份日志与票据文件）；`git diff 94651a9 HEAD -- framework/adapters/pi.ts scripts/pi-model-cost-smoke.ts tests/model-cost/pi-period-reset.test.ts` 为空，即合并没有改写本票交付面。

**按检出原样运行**（本 worktree 的工具 shell＝Git Bash；日志 `logs/15-period-reset-integration.log`）：`bun run test` → **1101 pass / 18 fail**（1119 tests / 120 files / 5879 expect() calls / 243.47s / exit 1）。18 例全为本机环境前置项，且都落在本票合入**未触碰**的文件上（`tests/harness-dock/**`、`tests/connect-bot/**`、`framework/modules/files.ts` 均不在上面 7 个文件内），与 [01](01-efficiency-baseline.md)/[04](04-shared-storage.md)/[07](07-owner-state.md) 各集成轮记录的类别一致：

| 类 | 例数 | 文件 | 事实 |
| --- | --- | --- | --- |
| 缺真实面板二进制 | 5 | `budget-regression`、`harness-exit-budget`、`panel-registration-lifecycle` ×3 | 本 worktree 位于 `%TEMP%`，`tests/connect-bot/support/omp-bot.ts` 的默认同级路径 `…\omp-bot\backend\target\release\omp-bot.exe` 不存在（抛点在 `startOmpBot`） |
| CRLF 使补丁物化失败 | 10 | `codex-response-artifact`、`combined-host-artifact`、`detail-tree`、`model-cost-codex-quota`、`model-cost-modes`、`model-cost-persistence`、`viewed-marker`、`viewed-session-host`、`viewed-session-total`、`viewed-session` | `host-patches/omp-18.5.0-{viewed-session,codex-response-boundary}/patch.diff touches no file`（`tests/harness-dock/host-patch-artifact.ts` 的 `patchTouchedFiles` 按 LF 切行） |
| 锁文件 sha 按 LF 录制 | 2 | `baseline.test.ts`、`session-driver.test.ts` | 记录值 `a5d37ab2…` 逐字节等于 `HEAD:bun.lock` 的已提交 LF blob；工作区是同一内容的 CRLF 检出（`e7ed487b…`） |
| 真实宿主保存期限 | 1 | `session-recovery.test.ts`（`navigating the session's own tree does not roll back its consumption`） | 满仓并行负载下 20s 保存期限内没等到该次保存（21.97s 后超时）；同类在 [01](01-efficiency-baseline.md) 的集成轮也出现过，单独重跑即绿 |

**归一后的全仓回归**（三处工作区文件还原为已提交 LF blob 字节——`bun.lock` `a5d37ab2…`、`viewed-session` `66195465…`、`codex-response-boundary` `4ec9ad0d…`，三份 `tr -d '\r' | sha256sum` 与 `git cat-file blob HEAD:<path>` 逐一相等；并设 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`）：

| 运行 | 结果 |
| --- | --- |
| 第 1 次（`logs/15-period-reset-integration-normalized.log`） | 1147 pass / 1 fail（1148 tests / 120 files / 6474 expect() calls / 386.05s / exit 1） |
| 第 2 次（`logs/15-period-reset-integration-normalized-run2.log`） | **1148 pass / 0 fail**（6475 expect() calls / 366.75s / **exit 0**） |

- 第 1 次唯一失败是 `tests/harness-dock/model-cost-session-span.test.ts:305` 的 `expect(readdirSync(run.storageDirectory).sort()).toEqual(["consumption.json", "consumption.json.lock"])`：收尾时该目录只剩 `consumption.json`，锁目录不在场。`framework/modules/files.ts` 的 `releaseLock` 先按持有者名 unlink 条目再 `rmdir` 锁目录；平台当场拒绝（`EPERM`/`EBUSY` 重试 6×25ms 后 `rmdir` 遇 `ENOTEMPTY`）时目录以 leftover 留下，顺利删除时不留——该断言的结果取决于收尾瞬间平台是否已释放句柄，属本机真实宿主时序，与本票改动无关。单独重跑该文件：`OMP_BOT_BINARY=… bun test tests/harness-dock/model-cost-session-span.test.ts` → **3 pass / 0 fail**（31 expect() calls / 13.38s），第 2 次全仓运行也绿。
- 归一比原样多出的 29 例（1119 → 1148 tests）正是那 10 个 dock 文件在文件级失败后未注册的用例。
- `bun run typecheck` → exit 0（无诊断；`logs/15-period-reset-integration-typecheck.log`）。

**本轮修复：无源码修复。** 18 例全属本机检出/布局前置项，1 例为真实宿主时序；无一条由本票合入引入——本票只改 `framework/adapters/pi.ts`、`scripts/pi-model-cost-smoke.ts`、`tests/model-cost/pi-period-reset.test.ts`，其中 pi adapter 的进程内消费者（`tests/model-cost` 全分区与 dock 的 5 个 pi fixture：`pi-round-facts`、`pi-session-facts`、`pi-terminal-rounds`、`pi-background-rounds`、`pi-codex-quota`）两次运行全绿。归一后零失败说明没有失败被上述环境例掩盖，故不改仓库内容（`.gitattributes` 或行尾鲁棒解析属装配/宿主验证票，见 [04](04-shared-storage.md) §8）。本轮提交只有这份记录、票据更新与本轮日志。

**运行后状态**：三处文件按字节恢复原 CRLF 检出状态（sha256 与运行前逐一相同：`bun.lock` `e7ed487b…`、`viewed-session` `057e01f6…`、`codex-response-boundary` `294b3727…`），`git status` 只余本轮的票据/证据改动；未操作集成工作区（`E:/Developer/myhub/my-agent-toolkit`）、未切换分支、未新建 worktree、未 reset、未调用 retro，也未自行合入集成分支。

**未因全仓绿而改变的限制**：上面「未覆盖与限制（不声称通过）」各条原样成立——真实 pi 上不可生产的「活动未知/忙碌」只由进程内套件覆盖、边界余额读的是本机 capture endpoint（非真实账户）、POSIX 分支的发布失败注入未运行；实机 smoke、跨票据整体验收与 P51/P52/P53 仍属最终独立门禁。
