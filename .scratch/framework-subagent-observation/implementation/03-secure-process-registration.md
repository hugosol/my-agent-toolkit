# 03: 子进程启动即安全登记并交付当前观察

**What to build:** 实际后台子会话取得可靠身份后即向 Owner 登记并提供当前活动与上下文，无须等待第三方完成通知。复用 framework Local access 补足 child 到 Owner 的声明值交付，Owner 直接采用读数；连接只能进入完整目标和有效接入所允许的观察范围。

**Delivers:** P1, P13, P25, P26

**Blocked by:** 01 — 共同上下文观察与首次快照；02 — Round 驱动的活动观察与切换保护。

**Status:** in-progress — 实现已随集成提交 `cf2303a940538ff24a1c3903c3b7fe26a5a44dcc` 合入 `hyper-tdd`，宿主已把该提交合回本分支，故本分支 HEAD 即该提交（与 `hyper-tdd` 同 tree `2cb5228e033d165747e19e61c0b899e0c16509f7`，亦等于本票实现提交 `c54622a` 的 tree）；本轮集成验收在同一 HEAD 完成（`bun run typecheck` exit 0、归一检出 + `OMP_BOT_BINARY` 下全仓 `bun run test` 1277 pass / 0 fail / exit 0），本轮无源码修复，本记录提交尚未合入 `hyper-tdd`。

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有所列 promises 全部 coverage 与测试；不得只交付协议定义或进程内模拟。身份只能来自宿主可靠事实，不能从 PID、名称或目录形状猜测。

- [ ] 实际 pi 后台会话在首轮结束及第三方完成通知之前已在 Owner 观察中可见，身份与独立宿主会话事实一致。
- [ ] 真实跨进程活动和上下文通知携带独立给定当前值；消费文档未变化时 Owner 仍采用这些值，并通过消费存储访问记录证明采用更新不需要读取文件。
- [ ] 两端校验完整 extension、Owner 和接入有效性；真实进程的错误扩展、错误 Owner、旧接入均被拒绝，两个并发 Owner 的给定值不串接。
- [ ] 诊断不泄漏接入校验材料；仅允许声明方向和操作，不扩展为任意 RPC、消息总线或远端 State 写入。
- [ ] 定位记录只承载发现所需信息，不含观察值或 State；通过实际文件内容及变动观察证明不是文件消息队列或目录扫描接收。
- [ ] 缺失或非法 runtime directory 明确失败，不回退到 cwd、临时目录或消费存储根；复用既有本机载体和资源寿命，不另建 harness 专属通信栈。
- [ ] 按仓库测试规范执行真实进程隔离场景、对应宿主 smoke、所属分区及受影响消费者；TypeScript 变化执行 typecheck，记录命令、平台、版本和证据限制。

## Comments

### 2026-10-17 执行记录（P1、P13、P25、P26）

实现与证据见 [证据文件](evidence/03-secure-process-registration-evidence-2026-10-17.md) 与
[真机日志](evidence/logs/03-pi-subagent-smoke-background.log)。要点：

- S2：`modules/local-access.ts` 在同一个 seat 上补出 child → Owner 的观察方向（`receive`/`deliver`、
  `observed` 帧、两端严格解码、按 seat 的 owner 校验观察范围、seat 记录与 endpoint 的既有寿命），
  并给出 adapter 用的 `createObservationDeliverer`（接入第一句话带"当前可用读数"，之后按变化写）。
- S1：`HarnessPort.sessionObservationAccess`（可选）+ `handOverReading` 唯一跨进程规则 +
  `binding.ts` 的 `receive`/`adoptReading`（写入本进程观察源并走同一套轴派发，不驱动计费生命周期）；
  `pi.ts` 声明 `childEntry` 即建载体，声明值半边仍只在 `follow` 存在时提供。
- 判定：`bun run typecheck` exit 0；`bun test tests/framework` 538 pass / 0 fail（新增 16 个用例）；
  `bun test tests/model-cost`（受影响消费者）466 pass / 0 fail；
  五处变异注入均被对应用例捕获后还原；真机 `pi-subagent-smoke.ts --background-only` 的三条新断言
  （首轮结束前登记、身份与宿主事实一致、读数落在 Owner 观察源）在本机 pi 1.3.0 上通过，随后停在
  既有已知失败（子进程自身消费未落盘，P27／票据 05），未越权修复。
- 未验证：POSIX 载体、其他 pi/宿主版本、真机 OMP；子会话上下文读数到达 Owner 的断言因上述既有失败
  未能执行（不当作通过）。

### 2026-10-17 集成同步与合并树验收（本轮由集成 helper 执行）

- **同步结果（本 worktree 即现场，无需解决冲突）**：分支 `hyper/framework-subagent-observation/03-secure-process-registration-65f635-8e524a3be3ca`，
  HEAD = 集成提交 `cf2303a940538ff24a1c3903c3b7fe26a5a44dcc`。该提交的两个父为 `c7fd3c8`
  （合入前的 `hyper-tdd` 尖端，含 01、02 及其记录）与 `c54622a`（本票实现提交）；
  `git rev-parse refs/heads/hyper-tdd` 同为 `cf2303a…`（宿主已把集成提交合回本分支）。
  `git diff --stat c54622a cf2303a` 为空、`HEAD^{tree}` == `c54622a^{tree}` == `2cb5228e…`，
  而 `git diff c7fd3c8 c54622a` 恰为本票的 24 文件 +2284/−96 —— 即本票改动恰好叠加在集成基线上，
  合并没有改写或丢弃任一侧内容（`git rev-parse -q --verify MERGE_HEAD` 无、`git ls-files -u` 0 条未合并路径）。
- **本轮集成验收（同一 HEAD `cf2303a`）**：
  - `bun run typecheck`（`tsc --noEmit`）→ **exit 0**（无诊断）。
  - 归一检出（`core.autocrlf=true` 的 CRLF 检出，三份行尾敏感文件临时还原为已提交 LF blob 字节：
    `bun.lock` `a5d37ab2…`、`host-patches/omp-18.5.0-viewed-session/patch.diff` `66195465…`、
    `host-patches/omp-18.5.0-codex-response-boundary/patch.diff` `4ec9ad0d…`，三者 sha256 与
    `git cat-file blob HEAD:<path>` 逐一相等）+ `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`
    （本机既有 release 构建，2026-10-09，非本轮构建或安装产物）下：
    `bun run test` → **1277 pass / 0 fail / 7190 expect() / 138 files / 453.25s / exit 0**。
    日志：`C:\Users\hugos\AppData\Local\Temp\integrate-03\fulltest.log`、`integrate-03\typecheck.log`。
  - 计数归因（逐项核对，不靠推断）：运行的 138 files 等于树内全部 `tests/**/*.test.ts` 文件数
    （`git ls-files` 亦为 138，无文件在文件级失败后被跳过注册）。相对 02 轮同环境记录（1253 pass / 135 files）
    多出的 24 例 = **本票新增两个测试文件 16 例**（`tests/framework/local-access-observation.test.ts` 9 例 +
    `tests/framework/session-observation-access.test.ts` 7 例，两者正是本票 diff 中新增的测试文件）
    + **集成基线已含的 1 个文件 8 例**（`tests/framework/session-context-observation.test.ts`，由 01 分支在
    `4e720f42`→`c7fd3c8` 之间加入，非本票内容）。比较区间内 `tests/**` 无文件被删除
    （`comm -23` 两侧均空）。`1253 + 8 + 16 = 1277` 闭合。
  - 本轮未另跑「按检出原样」变体，也未把早前轮次记录的原样失败数当作本轮观察：归一与指认既有面板二进制
    都不减少任何注册用例（归一后注册集合包含原样检出），故原样检出只可能多出已知的行尾／二进制前置失败。
    行尾鲁棒解析、`.gitattributes` 与面板二进制默认定位属装配与宿主验证范围，与前几轮（17/18/19/20/21/23/25）一致，
    不在本轮改动。本 worktree 默认面板路径 `%TEMP%\omp-bot\backend\target\release\omp-bot.exe` 确实不存在。
- **本轮修复：无源码修复。** 合并树 typecheck 干净、归一 + 指认既有面板二进制后全仓零失败，故未改动产品源码；
  另做只读核对：`tests`／`framework`／`extensions` 内无 `.only`／`.skip` 残留，工作树无未跟踪文件，
  无 `MERGE_HEAD`／未合并路径。
- **运行后状态**：三份行尾敏感文件已按字节恢复为运行前的 CRLF 检出（sha256 与运行前逐一相同：
  `e7ed487b216f5580…`、`057e01f615c7a9ed…`、`294b37277539486f…`），`git status` 只余本记录改动。
  未操作集成工作区（`E:/Developer/myhub/my-agent-toolkit`）、未切换分支、未新建 worktree、未 reset、
  未调用 retro，也未自行合入 `hyper-tdd`（合入由宿主排队执行）。
- **未因全仓绿而改变的限制**：实现报告的未验证项原样成立——POSIX 载体未运行；其他 pi/宿主版本与真机 OMP
  未运行；子会话上下文读数到达 Owner 进程的断言仍未执行（其所在 smoke 阶段停在既有已知失败）。
  复杂脚本、实机 smoke 与跨票据整体验收归最后独立门禁。全仓绿只陈述「合并树在归一检出 + 本机既有面板
  二进制下无失败」，不构成任何真实宿主表面的通过。
