# 11: 退出总截止有界，准确报告保存结果

**What to build:** 正常处置自进入收口起采用默认 15 秒总等待上限，不重置在途预算或追加固定延迟／自动重试。截止时区分可靠取消的未提交与已开始但结果未确认；Owner 不可达或不回应不阻止子会话本地结算和有界退出。

**Delivers:** P30, P31, P32

**Blocked by:** 10 — 正常处置等待 Round 收口和自身保存。

**Status:** in-progress — 实现已随集成提交 `bc550a25d0e4d192405d34404b0bb5fa95f2cf43` 合入 `hyper-tdd`（宿主已把该提交合回本分支，故本分支 HEAD 即该提交）；本轮集成验收在同一 HEAD（加本票记录的测试对齐修复）上完成：`bun run typecheck` exit 0，归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` → 1345 pass / 0 fail / 150 文件 / exit 0。本分支尚未再合回 `hyper-tdd`，该记录提交合入后方可置 `closed`。

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P30–P32 全部 coverage 与测试，遵守已批准的截止取舍：停止等待不是证明更新已取消，不改变通用文件更新的既有取消语义。

- [x] 可控时间验证从进入收口计时的 15 秒总截止、临界点和在途已用预算；已完成路径立即收口，不重置预算、不叠加固定延迟或额外自动重试。→ `tests/framework/close-out-deadline.test.ts`（平台假时钟：`deadline = 进入 + budget`、`remaining()` 随时钟下降且预留观测分辨率、声明只收紧默认 15000、已收口路径回答后 `vi.getTimerCount() === 0`）；真机两次实测 14997ms / 15002ms 对照 15000ms 应用截止。
- [x] 排队／锁等待可可靠取消时，截止诊断为未提交且无成功提示；结合实际文档证明结果，不仅检查超时异常。→ `tests/model-cost/close-out-deadline.test.ts`（真实跨进程持有锁：通知为“没有写入…（timeout：会话处置收口等待 300ms 已到）…未保存的消费已丢弃”、无成功提示、文档中无该会话记录、框架无“未确认”声明）；`tests/framework/close-out-deadline.test.ts` 同场景真实 `updateFile` + 文档；真机阶段 2 同上（15000ms）。
- [x] 已进入实际更新但截止前未确认时，报告保存结果未确认，不声称必然未写、已取消或提交成功；诊断与实际文档共同呈现结果。→ `tests/framework/close-out-deadline.test.ts`（真实 `updateFile` 停在更新内：截止时旧文档仍在、锁未被释放给他人、解除后新文档落盘；框架诊断为“unconfirmed”且明确不声明取消/未写/成功）。
- [x] 不提前释放仍由更新持有的锁，不以停止 await 假装停止写入；其后仍以实际成功发布的完整文档为权威，不增加事务日志、强杀恢复或新存储协议。→ 同上用例（另一写入者在截止后仍 `timeout`；解除后发布的完整文档成为文件内容）；`framework/modules/files.ts` 仅新增 `WAIT_RESOLUTION_MS` 导出，既有取消语义未改。
- [x] 实际子进程在 Owner 缺失、断开及不回应场景下仍能完成本地文件提交与有界退出；保存及 shutdown 无等待 Owner 确认、同步或绘制的依赖。→ `bun scripts/pi-close-out-smoke.ts` 阶段 1：真机 pi 1.3.0 上会话由无人服务的会话文件派生（adapter 沿 pi 自身血缘解析出 `inherited` owner，而服务它的进程不存在），自身请求记账并提交（own input 1000/output 200），关闭进程 12ms 退出 exit 0，无“未写入/未确认”通知。
- [x] 真实故障运行记录等待时间及调度误差，区分应用截止与 OS 调度，不要求毫秒级硬实时，也不把正常处置保证扩张到强杀、崩溃或断电。→ 同脚本阶段 2：锁被另一进程真实持有时，从“告诉 pi 停止”到退出两次实测 14997ms / 15002ms（应用截止 15000ms，差 −3ms / +2ms 即本平台调度与拆卸开销，两侧都出现）；文档同述保证止于正常处置。
- [x] 按仓库测试规范执行受控截止、锁等待与更新中场景，覆盖所属分区和受影响消费者；TypeScript 变化执行 typecheck。取得真实进程、文件及诊断证据，记录命令、环境和限制。→ `bun test tests/framework` 561 pass / 0 fail；`bun test tests/model-cost` 480 pass / 0 fail；`bun test tests/codebase-tools` 24 pass / 0 fail；指明 `OMP_BOT_BINARY` 后 `bun test tests/connect-bot` 142 pass / 0 fail（未指明时 5 例真机面板用例在 setup 处因缺二进制失败，与本改动无关）；`bun run typecheck` exit 0；真机脚本 11/11 观测通过（61.8s，连续两次一致）。

交付与验证记录：[证据文档](evidence/11-bounded-shutdown-outcomes-evidence-2026-10-17.md)（含命令、环境、故障注入、未验证项与限制），运行日志见 `evidence/logs/11-*.log`。

## Comments

### 2026-10-17 集成同步与合并树验收（本轮由集成 helper 执行）

- **同步结果（本 worktree 即现场）**：分支 `hyper/framework-subagent-observation/11-bounded-shutdown-outcomes-4808b2-e98ea402077c`，
  HEAD = 集成提交 `bc550a25d0e4d192405d34404b0bb5fa95f2cf43`（`git rev-parse HEAD` 与之相等）。该提交的两个父为
  `d139d18`（合入前的 `hyper-tdd` 尖端，含 07 的集成提交）与 `b535436`（本票实现 head）。
  `git diff --name-status d139d18 bc550a2` 恰为本票 21 个路径（与本票两条实现提交逐条对应，无本票之外的路径），
  `git diff --stat hyper-tdd HEAD` 为空，即本分支内容与集成分支当前尖端一致：本轮同步无需解决冲突。
  无冲突残留：修复前 `git status --porcelain` 干净、`git ls-files -u` 0 条未合并路径、冲突标记扫描无命中。
- **本轮集成验收（同一 HEAD，加下述测试对齐修复）**：
  - `bun run typecheck`（`tsc --noEmit`）→ **exit 0**（`logs/11-integration-typecheck.log`）。
  - 归一检出（`core.autocrlf=true` 的 CRLF 检出，三份行尾敏感文件临时还原为已提交 LF blob 字节：`bun.lock`
    `a5d37ab2…`、`host-patches/omp-18.5.0-viewed-session/patch.diff` `66195465…`、
    `host-patches/omp-18.5.0-codex-response-boundary/patch.diff` `4ec9ad0d…`，运行前逐一等于
    `git cat-file blob HEAD:<path>` 的 sha256）+ `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`
    （本机既有 release 构建，2026-10-09，非本轮构建产物）下：
    `bun run test` → **1345 pass / 0 fail / 7551 expect() / 150 files / 491.02s / exit 0**
    （`logs/11-integration-fulltest-normalized.log`）。运行后三份文件以 `git checkout --` 还原为检出原样
    （CR 字节数 83 / 599 / 44，工作区仅余本轮的测试修复）。
  - 文件数归因：运行的 150 files 等于树内 `tests/**/*.test.ts` 文件数（`git ls-tree -r --name-only HEAD -- tests | grep -c '\.test\.ts$'` = 150），
    故没有文件在加载失败后被跳过。
  - 未归一检出的同一 HEAD（CRLF 原样，`OMP_BOT_BINARY` 已设）：**1301 pass / 15 fail / 1316 注册用例 / 150 files / 390.11s / exit 1**
    （`logs/11-integration-fulltest-unnormalized.log`）。15 条中 12 条是本仓已知的行尾前置：`bun.lock` 的 CRLF 字节与其在
    `framework/docs/harness-baseline.json` 记录的 LF sha256 不符（`baseline.test.ts`），以及两份 `patch.diff` 的 CRLF 使
    `patchTouchedFiles` 解析不到任何文件（10 个 dock 文件各自在模块加载处中止，`session-driver.test.ts` 的 `verifyLockfile` 同理）。
    差值归因（逐项核对）：1345 − 1316 = 29，正是这 10 个 dock 文件在模块加载中止后未注册的用例数——10 个文件的静态 `test(` 计数合计
    39，等于「29 个未注册用例 + 10 个中止用例本身」。故归一检出只恢复被 CRLF 前置挡住的用例，不改变任何用例的判定。
- **本轮唯一修复（测试对齐，非产品源码）**：`tests/model-cost/detail-tree-live-sessions.test.ts` 的 P5–P8 三例，在五个帧读取处
  （`Ctx: 10% (45,000/450.0K)`、失联后的 `Run: —`、`Ctx: 0% (200/450.0K)`、失联后的 `.not.toContain("Ctx:")`、`Ctx: …50,000/450.0K`）
  各补一行 `await readingTurnEnded();`，共 5 行插入，无断言与产品代码改动。原因：07 合入的合并重绘
  （`extensions/model-cost/shared-logic/presentation/coalesced-redraw.ts`，`request()` 以 `queueMicrotask` 在 turn 末兑现）把帧绘制推迟一个微任务，
  而这三例在投递/失联后同步读帧——07 在同文件其它帧读取处已采用同一 await（`b4b1d69`），这三例是其遗漏；在 `d139d18`（本票合入前）单独运行该文件即为此 3 例红。
  证据：`logs/11-integration-detail-tree-before.log`（修复前 6 pass / 3 fail）、`logs/11-integration-detail-tree-after.log`（修复后 9 pass / 0 fail）。
  该变更与 07 的集成方（integrate-07）在其分支提交的同一处修复逐字节相同（五个插入点逐一对齐、无注释），两侧合并为同一变更，不产生冲突；已在会话中与其确认归属与位置。
- **未验证（留给最终独立门禁）**：本票新增的真机 smoke 脚本、跨票据整体验收与实机门禁未在本轮重复执行（本轮只做全仓测试与必需修复）；POSIX 未运行。
