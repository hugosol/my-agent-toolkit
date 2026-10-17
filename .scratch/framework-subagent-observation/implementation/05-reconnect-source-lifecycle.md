# 05: 重连恢复快照，失效撤销读数但保留身份

**What to build:** 有效重连立即恢复当前可用观察，不重放历史 Turn 或 Round。重复、迟到和旧来源关闭不能覆盖或撤销更新有效来源的读数；正常撤销或接收侧观察到关闭／错误后，只撤销所属来源实时活动和上下文，保留可靠身份、父关系和已保存消费。

**Delivers:** P5, P6, P7, P8

**Blocked by:** 04 — detail 展示未提交会话、嵌套后代与续跑身份。

**Status:** in-progress — 已在本分支与集成提交 `2bbf22b75e8dcee080215e43318d4c78320178c4` 合并（冲突解决提交 `4bc3d37`），本轮集成验收在同一 HEAD 完成（`bun run typecheck` exit 0；归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` → **1324 pass / 0 fail / exit 0**），本轮除冲突解决外无源码改动；实现与记录提交尚未合入 `hyper-tdd`（合入由宿主排队执行）。

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P5–P8 全部 coverage 与测试；来源代际及顺序表示可自行选择，但不能新增心跳、轮询或看门狗。

- [x] 断开期间状态变化后重连，立即接收最新快照，无须等待再次变化，且没有额外 Turn／Round 或计费生命周期交付。
- [x] 通过真实进程和可控制交付顺序验证重复、迟到、旧来源退出；新来源给定读数保持，不以概率性 sleep 保证顺序。
- [x] 正常释放与真实子进程异常退出分别触发所属来源不可用；共同 interface 读取不可用，实际 detail 不残留 Working 或实时上下文。
- [x] 不可用不能冒充 Idle、任务失败或完成，不伪造计费生命周期。
- [x] 对照断连前后树与消费，可靠身份、直接父关系和已保存消费均保留；仅实时登记而未提交消费的身份在本次 Owner 运行中保留，不新增磁盘持久化。
- [x] 旧连接关闭不清除新连接的活动或上下文；资源正常撤销不依赖即将退出的进程成功发送最后一条通知。
- [x] 按仓库测试规范执行受控时序测试、真实关闭／异常退出和实际 detail 观察，覆盖所属分区及受影响消费者；TypeScript 变化执行 typecheck，保存可归因日志与环境限制。

## 本票执行记录（2026-10-17，实现完成后交集成复核）

实现：`ObservationSource` 与 `SessionObservationSink`（`framework/core/protocol.ts`）、来源归属与 `withdrawSource`（`core/observations.ts`）、binding 的 adopt/lost 与 `session_unobserved` 投递、活动轴 `forget`、本机接入按连接编号并在连接关闭时陈述来源结束（`modules/local-access.ts`）、model-cost 的不可用处理与重绘。

证据与逐项对照：见 [evidence/05-reconnect-source-lifecycle-evidence-2026-10-17.md](evidence/05-reconnect-source-lifecycle-evidence-2026-10-17.md)（含 `bun run typecheck` exit 0、`bun test tests/framework` 563 pass / 0 fail、`bun test tests/model-cost` 483 pass / 0 fail、故障注入逐项变红复原、以及第一次分区运行中一例与基线对照的非本票失败说明）。

未验证：真实 harness（pi / OMP）与本票新增失效路径的运行证据、POSIX 平台证据；两者在证据文件中显式标注。

## 集成轮记录（2026-10-17，接管本票 worktree / branch 完成同步与验收）

- **同步结果（本 worktree 即现场）**：分支 `hyper/framework-subagent-observation/05-reconnect-source-lifecycle-b03b39-e98ea402077c`，实现 head `874a00c`；宿主已把集成提交 `2bbf22b75e8dcee080215e43318d4c78320178c4`（携带票据 06 的实现、证据与测试）合回本分支，合并基 `e50c574`。**冲突仅一处**：`framework/modules/local-access.ts` 的 `directCaller`——本票在该函数内新增 `const asSource = nextSource()` 并按来源归属投递读数（`seat.readings?.adopt(asSource, reading)`），票据 06 把签名改为 `directCaller(target, seat, source)` 并让 `ended` 在「该座位本次出价已被替换或撤销」时作答。两处意图不互斥，且 06 的判定恰是本票 adopt 路径的前置守卫（旧生命的读数不得落进新座位的接收半）；解决取两侧并集：签名带 `target`、函数体保留 `asSource`，函数文档两段并存（本票「它是与其他来源一样、按同一顺序编号的来源」＋06「生命与其在载波上同一规则，该调用者自己陈述 `ended`」）。
- 其余 8 个路径由 git 自动合并（06 未触碰本票的 `core/protocol.ts`、`core/observations.ts`、`behaviors/*`、`extensions/model-cost/**`）。冲突解决提交 `4bc3d37`。
- 无冲突残留：`git ls-files -u` 0 条未合并路径、`git rev-parse -q --verify MERGE_HEAD` 无、`git grep -nE '^(<<<<<<<|>>>>>>>)'` 无命中。
- **本轮集成验收（同一 HEAD `4bc3d37`）**：
  - `bun run typecheck`（`tsc --noEmit`）→ **exit 0**（无诊断；日志 `C:\Users\hugos\AppData\Local\Temp\integrate-05\typecheck.log`）。
  - 归一检出（`core.autocrlf=true` 的 CRLF 检出，三份行尾敏感文件临时还原为已提交 LF blob 字节：`bun.lock` `a5d37ab2…`、`host-patches/omp-18.5.0-viewed-session/patch.diff` `66195465…`、`host-patches/omp-18.5.0-codex-response-boundary/patch.diff` `4ec9ad0d…`，运行前三者工作区 sha256 与 `git cat-file blob HEAD:<path>` 逐一相等）+ `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`（本机既有 release 构建，2026-10-09，非本轮构建或安装产物）下：
    `bun run test` → **1324 pass / 0 fail / 7424 expect() calls / 145 files / 500.19s / exit 0**（`(fail)` 行 0 条）。
    日志：`C:\Users\hugos\AppData\Local\Temp\integrate-05\fulltest-normalized.log`。
  - 计数归因（逐项核对，不靠推断）：运行的 145 files 等于树内 `tests/**/*.test.ts` 文件数（`git ls-tree -r --name-only HEAD -- tests | grep -c '\.test\.ts$'` 亦为 145），即无文件在文件级失败后被跳过注册；相对合并基 `e50c574`（143）新增的 **2** 个文件恰为 06 的 `tests/framework/follow-observation-independence.test.ts`、`tests/model-cost/form-observation-independence.test.ts`。
  - 本轮现场前置（与前几轮记录一致，非仓库内容）：三份行尾敏感文件为 CRLF 检出（CR 字节数 `83` / `599` / `44`，sha256 `e7ed487b…` / `057e01f6…` / `294b3727…`），且本 worktree 默认面板路径 `%TEMP%\omp-bot\backend\target\release\omp-bot.exe` 不存在（`ls` 报 `No such file or directory`），故真实面板二进制以 `OMP_BOT_BINARY` 显式给名。本轮未另跑「按检出原样」变体，也未把早前轮次记录的原样失败数当作本轮观察。
  - **本轮源码改动只有冲突解决本身**（取两侧并集，非缺陷修复）；归一的三份文件运行后按字节还原为运行前 CRLF 状态（sha256 与运行前逐一相同），`git status` 干净（`git status --short` 无输出）。
- **本次绿只陈述**「合并树在归一检出 + 本机既有面板二进制下无失败」，不构成实现报告中未验证项（真实 pi / OMP smoke、POSIX 平台、跨票据整体验收）的通过；复杂脚本、实机 smoke 与跨票据整体验收归最后独立门禁。集成工作区未操作、未切换分支、未新建 worktree、未 reset 丢弃工作、未调用 retro，也未自行合入 `hyper-tdd`（合入由宿主排队执行）。
