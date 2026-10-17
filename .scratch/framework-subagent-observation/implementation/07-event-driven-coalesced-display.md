# 07: 观察按事件去重，展示合并采用最新值

**What to build:** 会话采集和观察发布按承诺事件发生，相同读数不重复发布；静止或流式响应期间不新增持续轮询或逐 token 流量。多会话、多字段的同批可合并观察更新及时采用到内存，并以合并重绘呈现各自最新值。

**Delivers:** P14, P15

**Blocked by:** 04 — detail 展示未提交会话、嵌套后代与续跑身份。

**Status:** in-progress — 已在本分支与集成提交 `d139d18`（`Merge: 89ebaa2 b4b1d69`，无冲突、git 自动合并）同步，本轮集成验收在同一合并树加一处合并树修复 `0a58716` 上完成（`bun run typecheck` exit 0；归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` → **1337 pass / 0 fail / exit 0**）；修复与记录提交尚未合入 `hyper-tdd`（合入由宿主排队执行）。

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P14、P15 全部 coverage 与测试。01–04 的正常交付证据不是本票通信频率与绘制成本验收的替代。

- [ ] 固定事件序列和独立给定重复值下，记录实际发布／通知，相同读数不重复发布；启动快照与有效重连仍满足其当前观察语义。
- [ ] 在静止窗口和实际流式响应中记录通知，证明没有新增持续轮询、逐 token 发布或运行耗时持续跳动，不从最终截图推断通信频率。
- [ ] 受控交付多个会话、多个字段更新，各最新值均保留，且存在可观测的合并重绘，不要求每条消息独立绘制。
- [ ] 合并只影响展示请求，不丢弃本地影响结算的生命周期事实，不延后内存采用直至绘制时才处理。
- [ ] 在实际终端观察最新结果并测量通知与绘制次数／成本，分开记录采集、通信和绘制；不宣称未经测量的零开销或最优效率。
- [ ] 按仓库测试规范执行受控事件与合并边界测试、所属分区和展示消费者，TypeScript 变化执行 typecheck；取得实际进程与终端证据并标注环境。

---

## 实现与证据（本票据分支）

- 实现：`extensions/model-cost/shared-logic/presentation/coalesced-redraw.ts`（display 的合并重绘）+
  `runtime.ts` 的观察两通道改走它（结算与 provider 发布路径不变），并在 `cleanup` 释放。
- 证据：见 [evidence/07-event-driven-coalesced-display-evidence-2026-10-17.md](evidence/07-event-driven-coalesced-display-evidence-2026-10-17.md)，
  运行日志见 `evidence/logs/07-dock-normalized.log`、`07-pi-subagent-smoke-background.log`、`07-pi-tui-acceptance.log`。
- 摘要：`bun run typecheck` exit 0；`bun test tests/model-cost` 491 pass / 0 fail；`bun test tests/framework`
  555 pass / 0 fail；归一冻结文件 + `OMP_BOT_BINARY` 下 `bun test tests/harness-dock` 107 pass / 0 fail；
  真机 pi 1.3.0 后台 smoke 10/10；真终端 pi TUI 捕获 34 ok / 1 failed（脚本自钉 `pi 1.2.0` 的既有环境不符）。
  未验证项（POSIX、控制台设备 smoke、单帧成本）在该证据文件末尾标注。

## 集成轮记录（2026-10-17，接管本票 worktree / branch 完成同步与验收）

- **同步结果（本 worktree 即现场）**：worktree `C:\Users\hugos\AppData\Local\Temp\hyper-ticket-HXXVq1`，分支
  `hyper/framework-subagent-observation/07-event-driven-coalesced-displa-cac1cc-e98ea402077c`，HEAD = 集成提交
  `d139d18`（`Merge: 89ebaa2 b4b1d69`，即宿主把集成提交合回本分支的结果），起点 `git status --short` 无输出。
  **本轮无冲突**：`git status` 无未合并路径、`git rev-parse -q --verify MERGE_HEAD` 无、全树 `git grep` 无冲突标记；
  逐文件核对本票内容与集成侧内容并存——`extensions/model-cost/shared-logic/runtime.ts` 同时有本票的两条观察通道
  走 `redraw.request()`、`cleanup` 里的 `redraw.dispose()`，以及集成侧票据 05 的 `session_unobserved`；
  `GLOSSARY.md` / `README.md` 与实现提交的差异只是集成侧另加的段落，本票新增的 `Merged redraw` 词条与行为说明俱在。
  参考：集成分支 `hyper-tdd` 本轮已推进到 `bc550a2`（后续票据的合入，与本票无接触面），其与本分支的 merge-base 即 `d139d18`。
- **本轮修复（提交 `0a58716`，唯一源码改动：5 行、仅测试）**：合并把本票的「turn 级合并重绘」与集成侧新增的
  P5–P8 describe（票据 05）放进同一文件 `tests/model-cost/detail-tree-live-sessions.test.ts`，后者三例在交付后
  **立即**读帧，读到的是上一帧，故 516 / 563 / 596 行三例红。修复是在该 describe 的**五处**帧读前各加一行
  `await readingTurnEnded();`（与本票实现轮在文件其他帧读处所加的相同），无断言、fixture 或产品源码改动。
- **本轮集成验收（HEAD = `0a58716`）**：
  - `bun run typecheck`（`tsc --noEmit`）→ **exit 0**（无诊断；日志 `C:\Users\hugos\AppData\Local\Temp\integrate-07\typecheck.log`、`typecheck-2.log`）。
  - 归一检出（`core.autocrlf=true` 的 CRLF 检出；三份行尾敏感文件临时还原为已提交 LF blob 字节——`bun.lock`
    `a5d37ab2…`、`host-patches/omp-18.5.0-viewed-session/patch.diff` `66195465…`、
    `host-patches/omp-18.5.0-codex-response-boundary/patch.diff` `4ec9ad0d…`，运行前工作区 sha256 与
    `git cat-file blob HEAD:<path>` 逐一相等）+ `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`
    （本机既有 release 构建，2026-10-09，非本轮构建或安装产物）下：
    `bun run test` → **1337 pass / 0 fail / 7491 expect() calls / 148 files / 437.62s / exit 0**（`(fail)` 行 0 条；
    日志 `C:\Users\hugos\AppData\Local\Temp\integrate-07\fulltest-normalized-2.log`）。
  - 修复前、同一合并树、同一条件下第一次运行：**1326 pass / 11 fail / 7417 expect() calls / 1337 tests / 148 files /
    838.09s / exit 1**（日志 `…\integrate-07\fulltest-normalized.log`）。11 例逐条归因：**3 例**即上述帧读
    （`detail-tree-live-sessions.test.ts` 516 / 563 / 596：前两处读到 `undefined`、第三处读到上一帧
    `"└─ 子代理A  ?(?)  Run: —"`）；**8 例**为并发满载下的既有实时限类——`tests/harness-dock/model-cost-modes.test.ts`
    四例在 `tests/harness-dock/run-root.ts:40` 的 `dispose()` 报 `EBUSY: resource busy or locked, rm '<run root>'`
    （本机单跑该文件 **6 pass / 0 fail / 22.69s**），`tests/model-cost/pi-runtime-gaps.test.ts`（3 例）与
    `tests/model-cost/pi-session-span.test.ts`（1 例）为 `savedDocument` 等待期限与一处实测区间值
    （两文件本机单跑 **11 pass / 0 fail / 220ms**）。这 8 例都落在本票未触碰的文件上，与 15 / 21 / 23 轮记录的
    `savedDocument`／锁与磁盘时序类同源（当时两次同类记录在随后运行均通过），本轮修复后全仓运行零复现。
  - 计数归因：修复轮与修复前同为 **1337 tests / 148 files**，即修复未增删用例；148 等于树内 `tests/**/*.test.ts`
    文件数（工作区与 `HEAD` 一致），即无文件在文件级失败后被跳过注册。
  - 独立复核：票据 11 的集成轮在其分支（`bc550a2` + 与本轮逐字相同的五处等待，提交 `a433b5a`）同条件归一全仓 →
    **1345 pass / 0 fail / 150 files / 491.02s / exit 0**；其比本轮多出的 8 例 / 2 文件正是票据 11 自己新增的
    `tests/framework/close-out-deadline.test.ts` 与 `tests/model-cost/close-out-deadline.test.ts`。
  - 运行后状态：三份文件已按字节还原为运行前的 CRLF 检出（sha256 `e7ed487b…` / `057e01f6…` / `294b3727…` 与运行前
    逐一相同，CR 字节数 `83` / `599` / `44`），`git status --short` 只余本轮修复与记录改动。
- **本次绿只陈述**「合并树在归一检出 + 本机既有面板二进制下无失败」，不构成实现报告未验证项（POSIX 平台、
  真 Windows 控制台设备 smoke、`scripts/pi-tui-acceptance.ts` 的版本检查）的通过；本轮**未**重跑实现轮记录过的
  真机 pi smoke 与真终端捕获——复杂脚本、实机 smoke 与跨票据整体验收归最后独立门禁。集成工作区
  （`E:/Developer/myhub/my-agent-toolkit`）未操作、未切换分支、未新建 worktree、未 reset 丢弃工作、未调用 retro，
  也未自行合入 `hyper-tdd`（合入由宿主排队执行）。

