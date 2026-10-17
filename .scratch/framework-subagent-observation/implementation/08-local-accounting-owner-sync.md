# 08: 子会话自行记账，Owner 按成功提示或重连同步

**What to build:** 响应 usage 只由实际执行会话累计并保存；Owner 的远端观察和重连不重复计费或代写。确认提交成功后发送提示，Owner 只读采用消费文件实际内容；丢失提示后，有效重连仍触发只读同步恢复记录。

**Delivers:** P16, P17, P19

**Blocked by:** 05 — 重连恢复快照，失效撤销读数但保留身份。

**Status:** in-progress — 本票实现、测试与证据已完成并提交在本分支（`hyper/framework-subagent-observation/08-local-accounting-owner-sync-a9eed4-e98ea402077c`，基于集成分支 `hyper-tdd` 的 `89ebaa2`）；宿主已把集成提交 `267a13bd50e75fca36f87d5ddbc1ee1331989baa` 合回本分支（冲突解决 `47e1f47`、测试时序修复 `a21e160`），本轮集成验收在同一 HEAD 完成（`bun run typecheck` exit 0；归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` → 1355 pass / 0 fail / exit 0）；实现与本轮记录提交尚未合入 `hyper-tdd`（合入由宿主排队执行），故不置 `closed`。

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P16、P17、P19 全部 coverage 与测试，保持活动消费文档为唯一消费权威，不通过 IPC 累计快照建立第二套账。

- [x] 使用独立给定的两会话 usage 算例核对 Direct session totals 与 Inclusive session totals，每笔请求仅计一次；远端观察、快照和重连不产生重复累计。
- [x] 实际子进程提交证据与 Owner 同步行为共同证明写者归属，Owner 不代写子记录。
- [x] 阻止 Owner 自身消费提交后，子会话保存仍使 Owner 看到新记录；Owner 接收成功提示只读采用文件内容，不采用提示携带的消费累计，不产生写入。
- [x] 失败保存不发送成功提示；成功提示只在确认提交后发生，不把开始保存或停止等待当作成功。
- [x] 丢弃一次成功提交提示，断开再接入；Owner 无自身消费或提交仍能通过只读同步看到文件中的新记录。
- [x] 只读同步复用存储基线与既有失败政策，不变成初始化、强制保存或轮询，不为观察或重连重放 Turn／Round。
- [x] 按仓库测试规范执行计费、存储及受影响消费者分区，TypeScript 变化执行 typecheck；通过真实进程、存储访问／提交证据和实际 Owner 表面验收并记录限制。

## 本票执行记录（2026-10-17，实现完成后交集成复核）

本票补齐的缺口是**提交成功提示的发布与接收**：既有实现已有自身协调提交（`ConsumptionStore.commit`）、
只读同步（`runtime.synchronize`）与 Round 结束按自身身份保存（`save()`），但没有任何一方把「某会话自己的写入
真的落地」告诉服务其 Owner 的进程。

实现：框架新增提交轴（`ObservedSession.commits`/`SessionObservation.commits`、`session_commit` 事件与交付类型、
`SessionObservations.observeCommits`/`recordCommit`、观测帧编解码、`ImplementationContext.recordSessionCommit`
与 binding 的记录＋转交＋派发），model-cost 在确认提交后发提示并把 `session_commit` 接到只读同步
（`save()` 的 `saved`/`unchanged` 分支、`runtime.ts` 的处理器、pi/omp 装配接线），并同步四份文档
（`framework/GLOSSARY.md`、`framework/docs/framework-capabilities.md`、`extensions/model-cost/GLOSSARY.md`、
`extensions/model-cost/README.md`）。

证据与逐项对照：见 [evidence/08-local-accounting-owner-sync-evidence-2026-10-17.md](evidence/08-local-accounting-owner-sync-evidence-2026-10-17.md)
（`bun run typecheck` exit 0；`bun test tests/model-cost` 488 pass / 0 fail；`bun test tests/framework` 573 pass / 0 fail；
六个变异注入逐项变红后还原为绿；真实子进程提交 + 插桩写入证据 + 文件字节比对；`tests/connect-bot` 的 5 个失败
为缺少真实 omp-bot 面板二进制的环境前置，与本票无关）。

未验证：真实宿主 CLI（OMP/pi）与 `tests/harness-dock`、POSIX 载体、其他宿主/提供方版本；提示合并与周期保护属票据 09。

## 集成轮记录（2026-10-17，接管本票 worktree / branch 完成同步与验收）

- **同步结果（本 worktree 即现场）**：分支 `hyper/framework-subagent-observation/08-local-accounting-owner-sync-a9eed4-e98ea402077c`，实现 head `10fa407`；宿主已把集成提交 `267a13bd50e75fca36f87d5ddbc1ee1331989baa`（携带 07 的合并重绘、11 的有界处置收口与 06 的集成记录）合回本分支，合并基 `89ebaa2`。**冲突三处，全部是「两侧各自新增」的文档/注释**，解决取并集、不改产品语义：
  - `extensions/model-cost/README.md`：处置段保留 11 的收口等待陈述，其后保留本票新增的「消费提交提示」条目。
  - `extensions/model-cost/shared-logic/request-accounting.ts`：`save()` 的文档并存两段——本票「落地后才告知」与 11 的 `closeOut` 等待（补一段 ` *` 空行分隔）。
  - `framework/docs/framework-capabilities.md`：`RoundEvent` 行取 11 的版本（含 `CloseOutWait`），`SemanticEvent` 行取本票的「七轴」版本。
  - 冲突解决提交 `47e1f47`（父 `10fa407`、`267a13b`）。
- **两侧文本零丢失（逐行核对，不靠推断）**：把 `89ebaa2→267a13b` 与 `89ebaa2→10fa407` 各自新增的行逐条在本合并树中按整行 `grep -F` 校验，九个相关路径（`extensions/model-cost/{README.md,GLOSSARY.md,shared-logic/request-accounting.ts}`、`framework/{GLOSSARY.md,docs/framework-capabilities.md,modules/local-access.ts,core/protocol.ts,core/observations.ts,behaviors/binding.ts}`）**缺失行均为 0**。
- **本轮集成验收**：
  - `bun run typecheck`（`tsc --noEmit`）→ **exit 0**（冲突解决后与修复后各一次；日志 `C:\Users\hugos\AppData\Local\Temp\integrate-08\typecheck.log`、`…\typecheck-after-fix.log`）。
  - 第 1 次全仓（归一检出 + `OMP_BOT_BINARY`）→ **1352 pass / 3 fail / 7610 expect() / 1355 tests / 151 files / 484.70s / exit 1**（日志 `…\integrate-08\fulltest-normalized.log`）。3 例全在同一文件的 05 用例组 `tests/model-cost/detail-tree-live-sessions.test.ts`「a source's end withdraws what the detail was drawn from, and nothing else (P5–P8)」。
  - **修复（提交 `a21e160`，只改测试时序、不改产品语义）**：该组三例在投递后同步读取**已绘制的帧**，而 07 的合并重绘把帧推到 turn 结束——同文件另三处用例已带 `await readingTurnEnded()`，其注释即写明「读帧的用例在 turn 之后读」。补上同样的等待后，单文件 `bun test tests/model-cost/detail-tree-live-sessions.test.ts` → **9 pass / 0 fail / 67 expect()**。
  - 归因证据：本票对 `runtime.ts`/`binding.ts` 的增量与 `redraw`/`session_context`/`adoptReading`/`announceChanged` 无交集（`git diff 267a13b HEAD` 按这些词过滤为空）；该用例组文本在 `267a13b` 与合并树逐字相同（合并树仅多出这三处等待），测试双击与 `presentation/coalesced-redraw.ts` 亦相同。据此**推定**这三例在集成尖端即为红（未在另一端树上单独运行，属依据上述证据的推断）。
  - 第 2 次全仓（同一 HEAD、同一环境）→ **1355 pass / 0 fail / 7622 expect() / 151 files / 421.75s / exit 0**（`(fail)` 行 0；日志 `…\integrate-08\fulltest-normalized-2.log`）。
  - 计数归因：运行的 151 files 等于树内 `tests/**/*.test.ts` 数（`git ls-tree -r --name-only HEAD -- tests` 亦为 151；集成尖端为 150，差集正是本票的 `tests/model-cost/local-accounting-owner-sync.test.ts`），无文件在文件级失败后被跳过注册。
  - 现场前置（非仓库内容）：三份行尾敏感文件为 `core.autocrlf=true` 的 CRLF 检出（sha256 `e7ed487b…` / `057e01f6…` / `294b3727…`），运行期间临时还原为已提交 LF blob 字节（`a5d37ab2…` / `66195465…` / `4ec9ad0d…`），运行后按字节还原（sha256 与运行前逐一相同）；本 worktree 默认面板路径 `%TEMP%\omp-bot\backend\target\release\omp-bot.exe` 不存在，故以 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`（本机既有 release 构建，2026-10-09，非本轮构建或安装产物）显式给名；运行进程含 `TYPESAFE_API_KEY`（06 记录的判定链前置）。
  - 运行后 `git status --porcelain` 空；未改产品源码，本轮只产生合并提交与测试时序修复。
- **本次绿只陈述**「合并树在归一检出 + 本机既有面板二进制 + 本机判定链环境下，全仓 `bun run test` 无失败」，不构成实现报告未验证项（真实 pi / OMP 宿主表面、POSIX、其他宿主/提供方版本、跨票据整体验收）的通过；复杂脚本、实机 smoke 与跨票据整体验收归最后独立门禁。集成工作区未操作、未切换分支、未新建 worktree、未 reset 丢弃工作、未调用 retro，也未自行合入 `hyper-tdd`（合入由宿主排队执行）。

