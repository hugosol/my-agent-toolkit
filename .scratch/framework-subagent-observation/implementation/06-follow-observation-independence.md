# 06: State follow 与会话观察独立运行

**What to build:** 同进程和跨进程子会话均在语义使用时取得 Owner 当前权威 State，而非永久启动快照。观察与 follow 独立声明和管理，没有 follow 字段仍能观察；brief/detail 只是展示偏好，不建立或拆除观察来源。观察和 follow 都不赋予远端写 Owner State 的能力。

**Delivers:** P21, P22, P23

**Blocked by:** 04 — detail 展示未提交会话、嵌套后代与续跑身份。

**Status:** in-progress — 实现已随集成提交 `2bbf22b75e8dcee080215e43318d4c78320178c4` 合入 `hyper-tdd`（宿主已把该提交合回本分支，故本分支 HEAD 即该提交，其 tree 等于本票实现 head 的 tree），本轮集成验收在同一 HEAD 完成（`bun run typecheck` exit 0、归一检出 + `OMP_BOT_BINARY` + 本机环境判定链下全仓 `bun run test` → 1311 pass / 0 fail / exit 0），本轮无源码修复，本记录提交尚未合入 `hyper-tdd`。

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P21–P23 全部 coverage 与测试，复用现有 State 缺值默认与恢复政策，不增加新的 State 权威。

- [ ] 两种进程模式分别验证初始读取及 Owner 值从 true 改 false 后的后续语义读取；实际跨进程使用取得 false，不能把不可达时默认值计为成功读取。
- [ ] 一次语义处理内相关读取使用所取得的一致快照，不要求每个 getter 分别通信；同进程直接读取，跨进程复用 framework Local access。
- [ ] 读取及观察更新后 Owner 的独立给定值不被修改；错误方向、未声明操作及远端 State 写入被拒绝。
- [ ] 无 follow 字段扩展在实际进程中仍可完成登记与更新，观察启用不依赖 follow 字段存在。
- [ ] brief 期间更新后切 detail，实际表面显示最新读数；重复切换不重复来源、不停止采集、不重建观察连接。
- [ ] 按仓库测试规范覆盖 State 消费者、真实进程读取和实际展示切换，执行所属分区；TypeScript 变化执行 typecheck。记录读到权威值的证据与未验证限制。

## Comments

### 2026-10-17 执行记录（P21、P22、P23）

实现与证据见 [证据文件](evidence/06-follow-observation-independence-evidence-2026-10-17.md) 与
[分区日志](evidence/logs/06-partition-framework.log)、[model-cost 分区日志](evidence/logs/06-partition-model-cost.log)。
要点：

- **一处源码修复（P21 的进程模式不一致）**：进程内被跟随的读取走 `openOwnerAccess` 的 `directCaller`，而它的
  `ended()` 只在自身 `dispose()` 时置位，于是 Owner 生命结束（cell 退休、offer 撤回）或同一 owner 被重新进入后，
  这条 access 仍回答**旧生命的值**（永久快照的另一形态）。跨进程不受影响：seat 半边都释放后 host 销毁连接，
  远端调用方自行失效并重连。修复（`framework/modules/local-access.ts`，3 处）：`directCaller(target, seat,
  source)` 增加 target，`ended()` 补充「本进程为该 seat 提供的 values 半边已不是当初的 source」；调用点传
  `options.target`。afterwards 两条路径含义一致：退休 seat 只答声明默认值，新生命读取取得新生命当前值。
- P21–P23 其余语义由既有实现承载（`state.ts` 的 `followed`/`view`、`followed-owners.ts` 的读取半边、
  `binding.ts` 的 owner seat 接收、`observations.ts` 的进程观察源）；未新增 State 权威、公开接口或来源存储。
- S1／S2：新增 `tests/framework/follow-observation-independence.test.ts`（4 例）——进程内 follow 直读
  （读取指向不存在的配置文件仍读得 Owner 真值，证明确实走进程内 seat）、Owner true→false→true 的后续语义读取、
  access 随 Owner 生命耗尽且新生命数值可读、无 follow 字段的真实子进程（真 record／端点）登记与后续更新、
  远端读数采纳后 Owner 独立给定值不变。
- S2／S3：新增 `tests/model-cost/form-observation-independence.test.ts`（1 例）——`MODEL_COST` 声明
  `inheritance: none`，真实交付进程 + 生产前端：brief 期间读数已采集但不画树，切 detail 后行显示
  `Ctx: 10% (45,000/450.0K)`；detail 期间再更新与重复切换后分别显示 `90,000`／`120.0K`；会话行恒为 1 行，
  交付进程 `reached: true`、`ended: false`，三条读数都经同一接入送达（未重建连接、未停止采集）。
- 判定：`bun run typecheck` exit 0；`bun test tests/framework` **559 pass / 0 fail**；
  `bun test tests/model-cost` **479 pass / 0 fail**；既有两个进程证据套件
  （`owner-follow.test.ts`、`owner-follow-processes.test.ts`、`session-observation-access.test.ts`）
  **22 pass / 0 fail**。三处变异注入（丢弃接入推送变化 → 退回启动快照；观察 seat 只在有值半边时接收；
  进程内 access 一律报耗尽）各自被对应用例捕获，还原后全绿；修复自身的红为修复前的新用例 2。
- 未验证：真机 pi CLI 与 OMP 真机（P34／P35 由票据 12 承载，本票未跑 `pi-subagent-smoke` 与 dock 分区，
  避免共享工作树内与同伴票据的运行冲突）；POSIX 载体；pi 1.3.0 之外的版本；「seat 两半边都持有时连接也在
  边界被销毁」为代码推断，未单独取证。
- 合并注意：`local-access.ts` 的 `directCaller` 与票据 05 的同函数改动重叠——取本票的签名、`ended()` 与调用点，
  保留票据 05 的 `nextSource()`／`seat.readings?.adopt(asSource, reading)`，其 `SessionObservationSink`
  不可退回裸函数 sink。

### 2026-10-17 集成同步与合并树验收（本轮由集成 helper 执行）

- **同步结果（本 worktree 即现场，无需解决冲突）**：分支
  `hyper/framework-subagent-observation/06-follow-observation-independen-ed2819-e98ea402077c`，HEAD = 集成提交
  `2bbf22b75e8dcee080215e43318d4c78320178c4`（`git rev-parse HEAD` 与之相等），其两个父为 `e50c574`（合入前的
  `hyper-tdd` 尖端）与 `f0e0d8c`（本票实现 head）。`git diff --name-status e50c574 HEAD` 恰为本票 9 个路径
  （`framework/modules/local-access.ts`、`tests/framework/follow-observation-independence.test.ts`、
  `tests/model-cost/form-observation-independence.test.ts`、票据文件与 5 份证据／日志），无本票之外的路径；
  合并树的 tree `f3adcf1ac6f01e3501d89ab75b6d5c305fd2ca16` 与本票实现 head `f0e0d8c` 的 tree 逐字节相同
  （`git diff f0e0d8c HEAD` 无输出），即合并既未改动、也未丢弃本票任何内容。无冲突残留：
  `git rev-parse -q --verify MERGE_HEAD` 无、`git ls-files -u` 0 条未合并路径、
  `git grep -nE '^(<<<<<<<|>>>>>>>|=======$)'` 无命中。
- **与本票「合并注意」的关系**：票据 05 对同一函数的改动（`SessionObservationSink`、`nextSource`、
  `seat.readings?.adopt`）在本轮合入树中尚不存在（三者 `git grep` 均无命中），因为 05 尚未合入 `hyper-tdd`；
  故 `directCaller(target, seat, source)` 及其调用点本轮无需与 05 组合，那条合并注意留待宿主后续合并 05 时执行。
- **本轮集成验收（同一 HEAD `2bbf22b`）**：
  - `bun run typecheck`（`tsc --noEmit`）→ **exit 0**（无诊断；`C:\Users\hugos\AppData\Local\Temp\integrate-06\typecheck-final.log`）。
  - 归一检出（`core.autocrlf=true` 的 CRLF 检出，三份行尾敏感文件临时还原为已提交 LF blob 字节：
    `bun.lock` `a5d37ab2…`、`host-patches/omp-18.5.0-viewed-session/patch.diff` `66195465…`、
    `host-patches/omp-18.5.0-codex-response-boundary/patch.diff` `4ec9ad0d…`，运行前三者工作区 sha256 与
    `git cat-file blob HEAD:<path>` 逐一相等）+ `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`
    （本机既有 release 构建，2026-10-09，非本轮构建或安装产物）下：`bun run test` →
    **1311 pass / 0 fail / 7342 expect() / 145 files / 424.02s / exit 0**（`(fail)` 行 0 条）。
    日志：`C:\Users\hugos\AppData\Local\Temp\integrate-06\fulltest-normalized-keyed.log`。
    运行期间同期有兄弟票据会话在各自 worktree 运行，本轮未出现真实宿主时序类失败。
  - 计数归因（逐项核对，不靠推断）：运行的 145 files 等于树内 `tests/**/*.test.ts` 数
    （`git ls-tree -r --name-only HEAD -- tests` 过滤 `.test.ts` 亦为 145），无文件在文件级失败后被跳过注册；
    相对 `e50c574` 的 143 恰为本票新增的 2 个测试文件，无删除、无其他测试文件改动；10 轮记录的 141 files 是
    `5bd64ce`（当时 `hyper-tdd` 尚未合入 04），141 + 04 的 2 + 本票的 2 = 145。
  - 本轮未把早前轮次记录的原样失败数当成本轮观察：本轮直接观察到的现场前置是本 worktree 三份文件为 CRLF 检出
    （CR 字节数 `83` / `599` / `44`，sha256 `e7ed487b…` / `057e01f6…` / `294b3727…`）与本 worktree 默认面板路径
    `%TEMP%\omp-bot\backend\target\release\omp-bot.exe` 不存在（`ls` 报 `No such file or directory`）——
    与前几轮（17/18/19/20/21/23/25）记录的类别相同。
- **首轮 3 例失败已定位为本机环境判定链的前置，不是合并树内容。** 首轮（同一 HEAD、同一归一 + `OMP_BOT_BINARY`，
  但运行进程的环境里没有 `TYPESAFE_API_KEY`）`bun run test` → **1308 pass / 3 fail / 7295 expect() / 145 files /
  511.00s / exit 1**，3 例全在 `tests/harness-dock/session-ownership-tree.test.ts`（本票与 04 的合入都未触碰该文件，
  其工作区字节自 `5bd64ce` 起未变），断言 `expect(run.capture.requests()).toHaveLength(5|7)` 实收 `11|13`，
  每例恰多 6 条。定位与排除（均为本轮实测）：
  1. 临时插桩（用后已还原，`git diff` 对测试文件无输出）打印那 11 条请求：5 条是会话轮次（主、子、孙的开场轮，
     每条带 system-reminder 与工作目录），另 6 条各自只有 system + user 两条消息，其 user 恰是真实宿主
     `task` 子代理 AUTO_THINKING 的判定题（`State: <solution_space>…</solution_space>`、`Answer with exactly one of:
     low/medium/high/xhigh`）——即该分类请求落到了被重定向为 capture 端点的会话模型上。
  2. 把本票唯一的源码改动（`framework/modules/local-access.ts`）临时还原为 `e50c574` 版本 → 该文件仍 3 fail；
     再把 04 合入的两个产品文件（`extensions/model-cost/shared-logic/request-accounting.ts`、`runtime.ts`）
     也还原为 `5bd64ce` 版本 → 仍 3 fail。两者都不是成因；两次临时还原随后已按 HEAD 字节原样恢复。
  3. 同一棵树、同一归一与 `OMP_BOT_BINARY`，改在带本机环境（含 `TYPESAFE_API_KEY`）的进程里运行：该文件单独跑
     **3 pass / 0 fail / 65 expect()**（与 04 轮记录的同一组数逐项相同），全仓 `bun run test` 即上面那轮
     **1311 pass / 0 fail / exit 0**。
  4. 同现象（同 3 例、同 `11|13` vs `5|7`、同 +6、同判定题）已由兄弟线 `hyper/model-cost-pi-migration` 的
     [04-shared-storage](../../model-cost-pi-migration/implementation/04-shared-storage.md) 独立记录，并给出无扩展对照
     （`extensions: []` 下 `requests=6 judge=3`，本仓库代码不在进程内时照样出现）：判定链有 native 候选时分类在该候选上
     结束，链中没有 native 候选时才把会话模型追加为候选并打到 capture 端点。dock 会话继承环境（`tests/harness-dock/env.ts`
     的 `buildSessionEnv` 只剔除解析偏移名），故该环境差异直接决定这 3 例。本机判定链的 native 候选
     `typesafe/jev-latest` 在本机因区域限制失败（本轮另一次无关判定调用给出同一报错），这与「有候选即不落到会话模型」
     一致。**本轮据此把该差异记为本机前置，未为求绿制造 native 候选、未改仓库内容。**
- **本轮修复：无源码修复、无冲突解决。** 合并树 typecheck 干净；归一 + `OMP_BOT_BINARY` + 本机环境判定链下全仓零失败，
  故未改动产品源码（本记录提交只含本文件）。另做只读核对：`tests/**` 无 `.only`／`.skip`（`git grep` 命中 0）、
  无未跟踪文件。
- **运行后状态**：三份行尾敏感文件已按字节恢复为运行前的 CRLF 检出（sha256 与运行前逐一相同：
  `e7ed487b216f5580…`、`057e01f615c7a9ed…`、`294b37277539486f…`），恢复后 `git status --porcelain` 只余本记录改动。
  未操作集成工作区（`E:/Developer/myhub/my-agent-toolkit`）、未切换分支、未新建 worktree、未 reset 丢弃工作、
  未调用 retro，也未自行合入 `hyper-tdd`（合入由宿主排队执行）。
- **未因全仓绿而改变的限制**：本票 P21–P23 的行为证据仍是实现轮的证据（本轮只做合并树回归，未重跑真机／复杂脚本）。
  实现报告的未验证项原样成立——真机 pi CLI 与 OMP 真机（P34／P35 属票据 12）、POSIX 载体、pi 1.3.0 之外的版本、
  「seat 两半边都持有时连接也在 Owner 边界被销毁」的代码推断未单独取证；复杂脚本、实机 smoke 与跨票据整体验收归
  最后独立门禁。本轮的绿只陈述「合并树在归一检出 + 本机既有面板二进制 + 本机环境判定链下无失败」，不构成任何真实宿主
  表面的通过；最终整体门禁若在 CRLF 检出下跑全仓，需要同样给 `OMP_BOT_BINARY`、把三份冻结文件置于已提交 LF 字节，
  并在带有本机判定链配置（`TYPESAFE_API_KEY`）的环境里运行，否则 `tests/harness-dock/session-ownership-tree.test.ts`
  的 3 例会因判定题打到 capture 端点而各多出 6 条请求。
