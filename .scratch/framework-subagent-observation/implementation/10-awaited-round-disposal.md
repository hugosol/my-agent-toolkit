# 10: 正常处置等待 Round 收口和自身保存

**What to build:** adapter 在可等待的正常会话处置位置报告实际终止事实，由 framework 完成 Round 结束确认或截断，并等待相关异步 handler 和会话自身保存。成功提示在确认保存后发生，之后才释放观察来源、连接和 binding，最后返回 shutdown；已完成部分不重复执行。

**Delivers:** P27, P28, P29

**Blocked by:** 03 — 子进程启动即安全登记并交付当前观察。

**Status:** in-progress — 实现已随集成提交 `5bd64ce220cd3873ac7aa7126b3dcf1a7b4a7074` 合入 `hyper-tdd`（`git merge-base --is-ancestor 5bd64ce hyper-tdd` 成立；宿主已把该提交合回本分支，故本分支 HEAD 即该提交），本轮集成验收在同一 HEAD 完成（`bun run typecheck` exit 0、归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` → 1299 pass / 0 fail / exit 0），本轮无源码修复，本记录提交尚未合入 `hyper-tdd`。

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P27–P29 全部 coverage 与测试。复用现有本地保存路径，不依赖 08 的 Owner 刷新才能结算；正常完成路径先独立可验，整体截止和故障结果由 11 交付。

- [ ] 先确认真实 pi 后台短寿命失败场景，再证明已有 settled、尚待下一 task 的 Round 在正常处置时完成确认，并在 shutdown 返回前确认自身提交成功。
- [ ] 修复不增加固定 sleep，不发第二次模型请求来促成保存，不由 adapter 或 model-cost 私自伪造 round_end。
- [ ] 无 settled 的 open Round 在处置时按截断收口；使用独立给定已知 usage 和测量缺口，只保存可靠量，公开消费可区分截断，不补算未知量或完整耗时，不声明任务成功。
- [ ] 以可控制完成的异步 handler 证明完成前不清理；完成后顺序为结束／截断、等待 handler 与保存、确认成功提示、释放来源／连接／binding、返回 shutdown。
- [ ] 已结束或已保存部分恰好一次，延后确认回调与重复处置不重复交付、保存或成功提示；失败不冒报成功。
- [ ] 记录真实宿主提交、退出及诊断顺序。普通 transferred／查看切换仍不强制关轮，不能将 disposed 扩大为离开查看位置。
- [ ] 按仓库测试规范执行 Round、异步订阅、计费及受影响消费者分区，TypeScript 变化执行 typecheck；使用隔离本机兼容端点／存储取得实际 pi 后台与截断证据，不访问操作者真实数据或依赖付费调用。

## Comments

### 2026-10-17 集成同步与合并树验收（本轮由集成 helper 执行）

- **同步结果（本 worktree 即现场，无需解决冲突）**：分支 `hyper/framework-subagent-observation/10-awaited-round-disposal-d201a9-8e524a3be3ca`，
  HEAD = 集成提交 `5bd64ce220cd3873ac7aa7126b3dcf1a7b4a7074`（`git rev-parse HEAD` 与之相等）。该提交的两个父为
  `1202f6e`（合入前的 `hyper-tdd` 尖端，含 03 的集成提交与其记录提交）与 `f03e49b`（本票实现提交 head）。
  `git diff --name-status 1202f6e 5bd64ce` 恰为本票 26 个路径（实现报告 `files_changed` 逐条对应：framework 的
  `core/protocol.ts`、`behaviors/{round-events,subscriptions,binding}.ts`、`adapters/pi.ts`、`public.ts`、两份 framework 文档与
  `GLOSSARY.md`、`extensions/model-cost` 四文件、3 个新增测试文件 + 8 个改动测试/support 文件、3 份本票证据文件），
  无本票之外的路径；`git diff f03e49b 5bd64ce` 仅有 `.scratch/.../implementation/03-secure-process-registration.md`
  （03 的记录提交），即合并树 = 本票实现 head 的树 + 03 的记录。
  无冲突残留：`git grep -E '^(<<<<<<<|>>>>>>>|=======)$'` 无命中、`git ls-files -u` 0 条未合并路径、
  `git rev-parse -q --verify MERGE_HEAD` 无。`5bd64ce` 已是 `hyper-tdd`（现尖端 `e23af12`）的祖先。
- **本轮集成验收（同一 HEAD `5bd64ce`）**：
  - `bun run typecheck`（`tsc --noEmit`）→ **exit 0**（无诊断）。
  - 归一检出（`core.autocrlf=true` 的 CRLF 检出，三份行尾敏感文件临时还原为已提交 LF blob 字节：
    `bun.lock` `a5d37ab2…`、`host-patches/omp-18.5.0-viewed-session/patch.diff` `66195465…`、
    `host-patches/omp-18.5.0-codex-response-boundary/patch.diff` `4ec9ad0d…`，运行前三者工作区 sha256 与
    `git cat-file blob HEAD:<path>` 逐一相等）+ `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`
    （本机既有 release 构建，2026-10-09，非本轮构建或安装产物）下：
    `bun run test` → **1299 pass / 0 fail / 7233 expect() / 141 files / 457.00s / exit 0**（`(fail)` 行 0 条）。
    日志：`C:\Users\hugos\AppData\Local\Temp\integrate-10\fulltest-normalized.log`（归一与 typecheck 同轮）。
  - 计数归因（逐项核对，不靠推断）：运行的 141 files 等于树内 `tests/**/*.test.ts` 文件数
    （`git ls-tree -r --name-only HEAD -- tests` 过滤 `.test.ts` 亦为 141，无文件在文件级失败后被跳过注册）。
    相对 1202f6e，测试树文件集合 138 → 141：新增 3 个文件恰为本票的
    `tests/framework/round-disposal.test.ts`（顶层 10 例）、`tests/framework/pi-disposal-round-close.test.ts`（7 例）、
    `tests/model-cost/pi-disposal-round-close.test.ts`（5 例），无文件被删除，且 8 个被改动的测试/support 文件
    顶层用例数逐一未变（两侧逐文件计数比对）。03 轮在同环境同法记录 `1277 pass / 138 files`，
    `1277 + (10 + 7 + 5) = 1299` 闭合。
  - 本轮未另跑「按检出原样」变体，也未把早前轮次记录的原样失败数当作本轮观察：本轮直接观察到的现场前置是
    三份文件为 CRLF 检出（CR 字节数 `83` / `599` / `44`，sha256 `e7ed487b…` / `057e01f6…` / `294b3727…`）
    与本 worktree 默认面板路径 `%TEMP%\omp-bot\backend\target\release\omp-bot.exe` 不存在（`ls` 报
    `No such file or directory`）。归一与指认既有面板二进制都不减少任何注册用例（归一后注册集合包含原样检出），
    故原样检出只可能多出已知的行尾／面板二进制前置失败；行尾鲁棒解析、`.gitattributes` 与面板二进制默认定位属
    装配与宿主验证范围，与前几轮（17/18/19/20/21/23/25）一致，不在本轮改动。
- **本轮修复：无源码修复、无冲突解决**。合并树 typecheck 干净、归一 + 指认既有面板二进制后全仓零失败，故未改动产品源码；
  另做只读核对：`tests/**` 无 `.only`／`.skip`（`git grep` 命中 0）、工作树无未跟踪文件。
- **运行后状态**：三份行尾敏感文件已按字节恢复为运行前的 CRLF 检出（sha256 与运行前逐一相同：
  `e7ed487b216f5580…`、`057e01f615c7a9ed…`、`294b37277539486f…`），恢复后 `git status` 无输出（本记录改动之前）。
  未操作集成工作区（`E:/Developer/myhub/my-agent-toolkit`）、未切换分支、未新建 worktree、未 reset 丢弃工作、
  未调用 retro，也未自行合入 `hyper-tdd`（合入由宿主排队执行）。
- **未因全仓绿而改变的限制**：本票 P27–P29 的行为证据仍是实现轮的证据（本轮只做合并树回归，未重跑真机/复杂脚本）。
  实现报告的未验证项原样成立——真机截断场景（处置时 open Round 无 settle）、`reload` 路径、POSIX 载体、
  其他 pi／宿主版本与真机 OMP 未运行；P30/P31（15 秒收口截止及截止下的故障结果）由票据 11 交付。
  复杂脚本、实机 smoke 与跨票据整体验收归最后独立门禁。本轮的绿只陈述「合并树在归一检出 + 本机既有面板二进制下无失败」，
  不构成任何真实宿主表面的通过；最终整体门禁若在 CRLF 检出下跑全仓，需要同样给 `OMP_BOT_BINARY` 并把三份冻结文件
  置于已提交 LF 字节（该环境提示与前几轮记录一致）。
