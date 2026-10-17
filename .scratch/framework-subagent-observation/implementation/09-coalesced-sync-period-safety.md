# 09: 合并同步不漏更新，并保护周期与在途累计

**What to build:** 多个消费提交提示合并为必要的只读同步；同步期间新提示仍保留后续刷新需求，最终采用文件最新记录。同周期同步保护本地未提交累计，外部更换统计周期后丢弃旧周期在途消费，不将其带入新周期。

**Delivers:** P18, P20

**Blocked by:** 08 — 子会话自行记账，Owner 按成功提示或重连同步。

**Status:** in-progress — 本票实现、测试与证据已完成并提交在本分支（`hyper/framework-subagent-observation/09-coalesced-sync-period-safety-ef5a9e-e98ea402077c`，实现 head `1a9b74f`）；宿主已把集成提交 `3b0a1f7c2cd892516af163ff1f5d191a48ea9759` 合回本分支（父 `0fd2ef8` + `1a9b74f`，无冲突；合并树与实现 head tree、`hyper-tdd` 尖端 tree 相同）。本轮集成验收在同一 HEAD 完成（`bun run typecheck` exit 0；归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` → 1361 pass / 0 fail / exit 0）。实现与本轮记录提交尚未合入 `hyper-tdd`（合入由宿主排队执行），故不置 `closed`。

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P18、P20 全部 coverage 与测试，不增加周期账本、消费 schema 迁移、轮询或额外自动重试。

- [x] 多个可合并提交提示减少实际同步次数，同时最终采用独立给定的最新记录；分别记录提示和同步次数，不只检查最终画面。
- [x] 受控暂停一次同步，期间另一个实际进程再次提交并通知，恢复后最终新记录可见，不因清理刷新标志永久漏掉后到提示。
- [x] 独立给定同周期本地未提交累计及外部记录，刷新只采用磁盘基线，不提交、丢弃或重复累计本地在途量。
- [x] 独立给定旧／新周期与本地旧周期在途量，外部切周期后同步仅保留新周期允许记录，迟到提示不把旧累计带回。
- [x] 只读同步不取得写锁、不创建临时提交、不修改消费文档；复用既有缺失／无效文档与存储基线政策，不重跑初始化。
- [x] 按仓库测试规范执行受控并发和周期边界测试、所属存储／计费分区及受影响消费者，TypeScript 变化执行 typecheck；取得真实进程写入与 Owner 可见结果的证据。

## Comments

- 2026-10-17：实现与测试已落在本票据分支，待集成合并。`session_commit` 的只读同步改为合并：同 turn 的提示共用一次读取，读取期间到达的提示触发下一次读取而不丢失。证据见
  [09 evidence](evidence/09-coalesced-sync-period-safety-evidence-2026-10-17.md) 与 `evidence/logs/09-*.log`
  （focused 6 pass；`tests/model-cost` 509 pass；`tests/framework` 579 pass；typecheck exit 0；4 项变异注入均被对应用例检出后还原）。
- 未完成/限制：未运行真实 pi/OMP 宿主端到端会话（不属于 P18/P20 的消费提示轴）；仅 Windows 证据；全仓 `bun run test` 留给集成阶段。

## 集成轮记录（2026-10-17，接管本票 worktree / branch 完成同步与验收）

- **同步结果（本 worktree 即现场）**：分支 `hyper/framework-subagent-observation/09-coalesced-sync-period-safety-ef5a9e-e98ea402077c`，HEAD `3b0a1f7`（集成提交）。父为 `0fd2ef8`（本票分支基点）与 `1a9b74f`（实现 head）；`git diff 1a9b74f 3b0a1f7` 为空，`git diff --stat 0fd2ef8 3b0a1f7` 只含本票 9 个文件（`extensions/model-cost/shared-logic/runtime.ts`、`extensions/model-cost/README.md`、`tests/model-cost/coalesced-sync-period-safety.test.ts`、票面与证据）；工作区无冲突标记，**无冲突、无冲突解决**，合并树 == `1a9b74f` tree == `hyper-tdd` 尖端 tree。
- **本轮集成验收**：
  - `bun run typecheck`（`tsc --noEmit`）→ **exit 0**。
  - 第 1 次全仓（归一检出 + `OMP_BOT_BINARY`）→ **1359 pass / 2 fail / 7677 expect() / 1361 tests / 152 files / 596.95s / exit 1**（日志 `C:\Users\hugos\AppData\Local\Temp\hyp-integ-09\fulltest-normalized.log`）。两例均为已记录的并发/负载时序类，且都落在本票未触碰处：
    - `tests/codebase-tools/outbound-role.test.ts`「the delivered role is a recorded fact…」codex dock 在 harness 自身 HTTP 层 120 s 超时（`DockSessionError … prompt_result for h2`，stderr `[DOMException [TimeoutError]]`）；与 `integrate-9f367cf5` 记录的同一签名并行负载 flake 相同。
    - `tests/model-cost/pi-disposal-round-close.test.ts`「leaving a session for another one closes no Round…」`no record for pi-disposal-child was published`；票据 05 证据已把同例记为并行负载 flake。
    - 单独重跑：`bun test tests/model-cost/pi-disposal-round-close.test.ts` → **5 pass / 0 fail**；`bun test tests/codebase-tools/outbound-role.test.ts` → **3 pass / 0 fail**。
  - 第 2 次全仓（同一 HEAD、同一环境）→ **1360 pass / 1 fail / 7685 expect() / 1361 tests / 152 files / 421.77s / exit 1**：`tests/framework/files.test.ts`「republishing a document never shows a reader a partial one」的 inode 断言（`stat(target).ino` 与更新前相等，NTFS 文件索引回收）。该文件单独连续运行 **5 次均 17 pass / 0 fail**。
  - 第 3 次全仓（同一 HEAD、同一环境）→ **1360 pass / 1 fail / 7683 expect() / 1361 tests / 152 files / 460.74s / exit 1**：`tests/harness-dock/model-cost-modes.test.ts`「one session's two channels keep both currencies across a model switch (P7)…」`savedSession` 18.4 s 期限未等到记录；该文件单跑 **6 pass / 0 fail / 20.36s**。票据 07 记录已把该文件四例列为并发满载下的既有实时限类。
  - 第 4 次全仓（同一 HEAD、同一环境）→ **1361 pass / 0 fail / 7686 expect() / 1361 tests / 152 files / 434.92s / exit 0**（`(fail)` 行 0；日志 `…\hyp-integ-09\fulltest-normalized-4.log`）。
  - 计数归因：运行的 152 files 等于树内 `tests/**/*.test.ts` 数，1361 tests 与 `(pass)+(fail)` 合计一致，无文件在文件级失败后被跳过注册；差集（相对上一轮 151 files）正是本票新增的 `tests/model-cost/coalesced-sync-period-safety.test.ts`。
  - 现场前置（非仓库内容）：三份行尾敏感文件为 `core.autocrlf=true` 的 CRLF 检出（sha256 `e7ed487b…` / `057e01f6…` / `294b3727…`），运行期间临时还原为已提交 LF blob 字节（`a5d37ab2…` / `66195465…` / `4ec9ad0d…`），每次运行后按字节还原（sha256 与运行前逐一相同）；本 worktree 默认面板路径 `%TEMP%\omp-bot\backend\target\release\omp-bot.exe` 不存在，故以 `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`（本机既有 release 构建，2026-10-09，非本轮构建或安装产物）显式给名；运行进程含 `TYPESAFE_API_KEY`（06 记录的判定链前置）。运行后 `git status --porcelain` 空。
- **本轮无源码/测试修复、无冲突解决**：三次红色失败均落在本票未触碰的文件上，且在单跑或第 4 次全仓中未复现；本票增量（`runtime.ts` 的提示合并，共 48 行）与 codex dock HTTP 超时、P29 保存记录、P7 dock `savedSession` 期限、`framework/modules/files.ts` 的 inode 断言均无交集。未改产品代码或测试。
- **本次绿只陈述**「合并树在归一检出 + 本机既有面板二进制 + 本机判定链环境下，全仓 `bun run test` 无失败」，不构成实现报告未验证项（真实 pi / OMP 宿主端到端会话、POSIX、其他宿主/提供方版本）的通过；复杂脚本、实机 smoke 与跨票据整体验收归最后独立门禁。集成工作区未操作、未切换分支、未新建 worktree、未 reset 丢弃工作、未调用 retro，也未自行合入 `hyper-tdd`（合入由宿主排队执行）。
