# 03 证据：子进程启动即安全登记并交付当前观察（P1、P13、P25、P26）

平台：Windows 10.0.26200（win32 x64）；bun 1.4.2；pi CLI 1.3.0（`pi --version`）；TypeScript 7.0.2。
所有命令在本 worktree（温度目录）内运行；未改动其他票据或工作流报告。

## 实现（做了什么）

**S2 —— `framework/modules/local-access.ts`：同一个 seat 补上 child → Owner 的观察方向。**

- `OwnerAccessPublisher.receive(target, sink)`：为一个 seat 接收"别的进程运行的会话"交付的读数；
  `OwnerAccessPublisher.offer` 仍只负责声明值。两个半边各自独立存活，seat / 定位记录 / endpoint 随
  最后一个半边释放；同一 seat 上再次 offer 保留该 access 原有的 verification（已读过记录的读取方不会
  被锁在门外）。
- `OwnerAccessCaller.deliver(reading)`：连接侧把一条读数交给 serving 进程，无应答、无返回值。
- 线上的新帧只有 `{t:"observed", session, owner, activity?, context?}`，且**只在一个已被 hello 接纳的
  连接上受理**。帧的每个成员都在两端严格解码（`factsOf`/`ownerOf`/`startupOf`/`contextOf`/`readingOf`），
  不是本模块读得懂的形状即 refuse 并断开，绝不解释。
- **观察范围校验**：`observed` 帧所报的 owner 必须是该 seat 自己的 owner（且 `kind: "inherited"`），
  否则 refuse —— 一个连接只能进入"完整目标 + 有效接入"允许的观察范围，一个 seat 永远不会承载另一个
  owner 的会话。没有声明观察半边的 seat 收到 `observed` 也一律 refuse。
- 定位记录仍然只有 `{extension, owner, endpoint, verification, pid}`：读数不过记录，也不落任何文件。
- `createObservationDeliverer`：交付半边的通用实现（adapter 用）。每个 owner 只 reach 一次；**接入后的
  第一句话就是本进程当前持有的全部读数**（`readingsFor(owner)`，因此 reach 期间到达的读数不会丢），
  之后每条读数直接写在既有的连接上；一次 reach 失败不自行重试（下一次真实读数再次尝试）；已结束的连接
  会被丢弃以便下一次读数重新 reach；"owner 还没到"不报告，"runtime directory 无法声明"按配置失败报告。

**S1 —— framework 公共消费面。**

- `framework/core/protocol.ts`：新增 `ObservedSession`（一条会话观察：facts + owner + activity?/context?）、
  `SessionObservationAccess`（`receive` / `deliver`）与 `HarnessPort.sessionObservationAccess?`（可选；
  同进程宿主不提供，也就不会建立端点）。
- `framework/core/observations.ts`：`handOverReading(handOver, reading)` 是**唯一**的"哪些读数跨进程"规则
  —— 只有 `owner.kind === "inherited"` 且本进程不服务该 owner 的读数才交付；`SessionObservations.readingsFor(owner)`
  提供交付半边接入时的"当前可用读数"。
- `framework/behaviors/binding.ts`：服务一个 owner 时 `receive(owner.key, adoptReading)`（随该 owner 的
  生命撤销、随绑定失败/会话 dispose 撤销）；`adoptReading` 把到达的读数写进本进程的观察源并走与本地
  采集**同一套**轴（`activityAxis` / `contextCollection`）派发，不驱动任何 Round/Turn/计费；本进程观察到的
  读数在 session 交付、round 边界、context 采集三处按同一条规则交付（`handOverReading`）。
- `framework/adapters/pi.ts`：assembly 声明 `childEntry` 即建立两半载体（不再要求 `follow`）；声明值半边
  仍只在 `follow` 字段存在时提供。交付半边与 `session_shutdown(quit|reload)` 一起释放。

## 验收对照

| 票据条目 | 证据 | 结果 |
|---|---|---|
| 首轮结束前在 Owner 观察中可见、身份与宿主事实一致 | `scripts/pi-subagent-smoke.ts --background-only` 的 background 阶段：子进程第一个请求被 capture fixture 扣住（`answerDelayMs`）期间读 Owner 进程的观察探针行 | 见下方真机段 |
| 真实跨进程活动/上下文通知携带独立给定值；采用不需读文件 | `tests/framework/local-access-observation.test.ts`（真子进程交付，读数逐个比对给定字面值 / 记录文件字节不变）；`session-observation-access.test.ts` 的 adopt 用例断言订阅者拿到 delivery 本身的读数与值，且进程观察源随即持有它 | pass |
| 两端校验完整 extension/Owner/接入；错误扩展、错误 Owner、旧接入被拒；两个并发 Owner 不串接 | 同上 S2 用例：错误的 owner 帧 → 连接被 refuse/关闭且 sink 空；旧 verification（改写定位记录）→ 真子进程 `LocalAccessUnavailableError`；同一进程两个 seat 并发各自只收到自己的读数；refusal 文本与子进程 stderr 均不含 verification | pass |
| 诊断不泄漏接入校验材料；只允许声明方向/操作 | 上述断言 + `speak()` 直连协议：未声明的帧 / 畸形读数一律 `refused`，且不含 verification 与业务值 | pass |
| 定位记录只承载发现信息；不是文件消息队列/目录扫描 | 记录键集合恰为 `{endpoint, extension, owner, pid, verification}`，读数前后记录字节完全相同、runtime 目录文件数不变、记录文本不含会话 id 与读数 | pass |
| 缺失/非法 runtime directory 明确失败、不回退 | 配置无 `runtimeDir`：serving 半边与 delivering 半边各报告一次该配置失败（文本含配置文件路径与 runtime directory），cwd/.runtime 与配置指向目录都不出现；真子进程报告 `LocalAccessConfigurationError` | pass |
| 复用既有载体与资源寿命，不另建通信栈 | 复用 `modules/local-access.ts`（同一 endpoint/记录/verification/释放路径），新增只有同一连接上的一个帧类型；seat 随 owner 生命释放（`tests/framework/local-access.test.ts` 的 pi assembly 用例） | pass |

## 运行的命令与结果

- `bun run typecheck` → exit 0（多次，最终一次在文档与导出改动之后）。
- `bun test tests/framework` → **538 pass / 0 fail**（含新增 `session-observation-access.test.ts` 7 个、
  `local-access-observation.test.ts` 9 个；改动前的基线是本票改到一半时的 527 pass / 11 fail）。
- `bun test tests/framework/local-access-observation.test.ts` → 9 pass / 0 fail（真子进程 + 真 named pipe）。
- `bun test tests/framework/session-observation-access.test.ts` → 7 pass / 0 fail。
- `bun install --frozen-lockfile` → 13 packages installed（worktree 原本没有 `node_modules`，真机 smoke 需要
  `node_modules/pi-subagents`）。
- `bun test tests/model-cost`（受影响消费者：它读本进程观察源、并按 `session_activity`/`session_context`
  重绘）→ **466 pass / 0 fail**。
- 变异注入（每条注入后还原并复测绿）：观察范围校验去掉 → S2 refuse 用例失败；`handOverReading` 去掉
  `serves` 判断 → "服务于本进程的 owner 不交付"用例失败；`adoptReading` 不写源 → adopt 用例失败；交付半边
  不发快照 → "第一句话带当前读数"用例失败；owner 生命结束不撤 seat → seat 寿命用例失败。五条都被捕获。

## 真机（S3）

命令：`bun scripts/pi-subagent-smoke.ts --background-only --expect-pi-version 1.3.0`
（pi 1.3.0 / `D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`；
日志：`implementation/evidence/logs/03-pi-subagent-smoke-background.log`）。

该阶段的改动：载入新探针 `tests/harness-dock/fixtures/pi-subagent-observation/`（session 作用域订阅
`session_activity`/`session_context`，同时打印本进程观察源当时持有的读数），并把该 run 的每个请求都扣住
4 秒（capture fixture 自己的 `answerDelayMs`）——**回答被扣住期间，spawned 进程既不可能结束一轮，也不可能
保存任何东西**，因此"先于首轮结束可见"是可证的而不是竞态。

结果（本轮实际输出）：

- `ok  the spawned session registered with the owner's process before its first Round ended` —— 探针在 Owner
  进程里报出该子会话的读数，且此刻消费文档里还没有它的记录（`record: undefined`）。
- `ok  the identity it registered with is the one the host's own session file states` —— 登记行的
  `id`/`kind=sub`/`parent`/`owner=inherited:main:<父 session id>` 与 smoke 独立读出的子会话文件 header 一致。
- `ok  the owner's own observation source holds the reading that arrived` —— 该行的 `held_activity` 与 delivery
  携带的 `activity` 相同，即读数确实落在本进程的观察源里。
- 其后该阶段在**既有已知失败**处停住：`the asynchronous child's consumption is saved`（子进程在 runner
  处置会话前没有机会确认 round_end，因此自身消费未落盘）。这正是 spec 已记录的失败场景（P27，属票据 05），
  与本票新增路径无关；本票的三条新断言在该失败之前已全部通过，其后（上下文读数）的断言因此未被执行。

**限制（未验证项，不当作通过）**：只在本机 Windows 10.0.26200 + pi 1.3.0 上运行真机场景；POSIX 载体
（socket 文件）与其他 pi/宿主版本未运行。OMP 同进程路径由 `tests/framework` 既有用例（port double 不提供
access 时不建立任何 seat/记录/端点）证明，未另跑真机 OMP。子会话上下文读数到达 Owner 进程的断言（探针
`held_tokens == tokens`）未能执行，因为该阶段在它之前就停在上述既有失败上。第一次真机运行（日志同一路径，
已被覆盖）暴露的是探针接线问题：观察按 extension 归属，探针必须与子会话加载的条目同一 extension，已按
`pi-subagent-observation` entry 写入运行自身布局（`writeObservationProbeEntry`）修正。
