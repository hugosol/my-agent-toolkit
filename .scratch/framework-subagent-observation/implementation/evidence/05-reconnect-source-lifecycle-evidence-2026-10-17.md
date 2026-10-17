# 05 证据：重连恢复快照，失效撤销读数但保留身份

环境：Windows 10.0.26200 x64，Bun 1.4.2，仓库 worktree `hyper/framework-subagent-observation/05-reconnect-source-lifecycle-b03b39-e98ea402077c`（基线 = 已合入 01/02/03/04/10 的 `hyper-tdd` 合并树）。真实进程用例使用 `bun` 子进程 + 真实命名管道（本机接入），不使用付费模型调用，不改写操作者真实数据。

## 交付的行为

- 观察**来源**（`ObservationSource`）：服务端进程为自己的每个已接受连接按接受顺序编号；接收入口由裸函数改为 `SessionObservationSink { adopt(source, reading), lost(source) }`（`framework/core/protocol.ts`、`framework/modules/local-access.ts`）。
- 读数按来源归属（`framework/core/observations.ts`）：活动与上下文各自记录「陈述它的最新来源」；比该来源更旧的词既不能覆盖也不能撤销；某来源结束时只撤销**它**陈述过的实时读数，保留会话身份、直接父关系与已保存消费；被撤销字段的来源戳保留，旧来源无法复活它。来源结束时的撤回本身不推断 Idle/失败/完成（`read()` 不再返回活动或上下文，且不新增伪造事件）。
- 失效对消费者的表达：新语义事件 `session_unobserved`（含 `SessionUnobservedDelivery`、handler 类型），由 binding 在来源失效时按会话投递；活动轴同时忘记该会话已投递读数，使重连后**同一读数**会再次投递给订阅者（`framework/behaviors/binding.ts`、`session-activity.ts`、`session-context.ts`）。
- 接收侧自行观察连接结束：`#accepted` 的 `close`（正常释放、进程退出、被 kill 都收敛为它）向 sink 陈述该来源结束，不依赖即将退出进程成功发出任何收尾帧。
- 受影响消费者：model-cost 的 `session_unobserved` → 忘记本实例自己的活动读数并重绘（`extensions/model-cost/shared-logic/runtime.ts`、`presentation/session-activity.ts`）；detail 行失去 Working 强调与 `Ctx:`，行、位置、树总量与消费文档不变。
- 文档：`framework/GLOSSARY.md`（新增 Observation source）、`framework/docs/framework-capabilities.md`、`extensions/model-cost/GLOSSARY.md`、`extensions/model-cost/README.md`。

## 验收项与证据

| 票据验收项 | 证据（测试） |
|---|---|
| 断开期间状态变化后重连，立即接收最新快照，无额外 Turn/Round/计费生命周期交付 | S1：`tests/framework/session-observation-access.test.ts`「a source that reaches the seat again restores what was withdrawn…」（同一活动值再次投递，投递序列恰为 activity/context/unobserved/activity/context）；S3：`tests/model-cost/detail-tree-live-sessions.test.ts`「a source that reaches the seat again restores…」（重连后 detail 重新显示 Working 与 `Ctx: …50,000/450.0K`，文档字节不变） |
| 真实进程 + 可控交付顺序验证重复、迟到、旧来源退出；新来源给定读数保持，不以 sleep 保证顺序 | S2：`tests/framework/local-access-observation.test.ts`「two real processes' words about one session are ordered…」（两个真实子进程、重复词、迟到词、旧连接 release；断言每个词所属来源与 `lost` 只属于旧来源，顺序由子进程应答链与 `until` 有界等待保证，无固定 sleep）；S3：`detail-tree-process-sources.test.ts`「an earlier process's end takes none of a later process's readings…」 |
| 正常释放与真实子进程异常退出分别触发所属来源不可用；共同 interface 读取不可用，实际 detail 不残留 Working 或实时上下文 | S2：「a real process releasing its access ends one source, with nothing said to the seat about it」「a real process ended abruptly ends one source just as well」（release / `kill()` 两条路径都向 sink 陈述同一来源结束）；S3：「a killed process's reading is withdrawn and the row keeps its place…」（绘制行丢掉 `Ctx:`，行模型 `nameEmphasis` 为 undefined，身份与深度保留） |
| 不可用不能冒充 Idle、任务失败或完成，不伪造计费生命周期 | S1 同一套用例断言订阅者在该次失效中收到的投递种类恰为 `[session_activity, session_context, session_unobserved]`（无 round/turn/session 事件）；S3 两个真实进程用例断言消费文档字节不变 |
| 对照断连前后树与消费：可靠身份、直接父关系、已保存消费均保留；仅实时登记未提交的身份在本 Owner 运行中保留，不新增磁盘持久化 | S1：「the readings a source's end withdraws are gone for a reader, and its identity is not」（`read`/`snapshot` 仍含 `session` 与 `owner`）；S3：两个真实进程用例在失效后仍读到同名同深度行与不变文档，且行数不变（无新增登记行或持久化） |
| 旧连接关闭不清除新连接的活动或上下文；资源正常撤销不依赖即将退出的进程成功发送最后一条通知 | S1：「a word a later source stated survives the earlier source's end, and a late word does not overwrite it」；S2 两个真实进程用例（旧连接 release / kill 后新来源读数保持；被 kill 的进程未发任何收尾帧仍被观察为结束） |
| 受控时序测试、真实关闭/异常退出、实际 detail 观察，覆盖分区与消费者；TypeScript 变化 typecheck；保存可归因日志与限制 | 见下「执行的命令」。分区：`tests/framework`、`tests/model-cost` |

## 执行的命令与结果

| 命令 | 结果 | 日志 |
|---|---|---|
| `bun run typecheck` | exit 0 | `logs/05-typecheck.log` |
| `bun test tests/framework` | exit 0，563 pass / 0 fail（46 files，62.45s） | `logs/05-framework-partition.log` |
| `bun test tests/model-cost` | 第一次 exit 1（482 pass / 1 fail），重跑 exit 0，483 pass / 0 fail（44 files，17.13s） | `logs/05-model-cost-partition-first-run.log`、`logs/05-model-cost-partition.log` |
| `bun test tests/model-cost/pi-disposal-round-close.test.ts` | 单独 exit 0（5 pass） | 见上表说明 |
| 基线对照：`git worktree add ../tc05-baseline HEAD`（未含本票改动）后 `bun test tests/model-cost` | exit 0，478 pass / 0 fail | 已在本票执行后删除该 worktree |

故障注入（临时改坏实现 → 观察测试变红 → 复原 → 观察变绿，逐项进行，均未保留）：

1. binding 不调用 `withdrawSource` → S1 三个用例红。
2. `observeActivity` 去掉来源新旧判定 → S1「later source / late word」红。
3. 去掉 `activityAxis.forget` → S1 重连恢复用例红。
4. `#accepted` 的 close 不陈述来源结束 → S2 四个真实进程用例全部超时红。
5. model-cost 的 `sessionActivity.forget` 缺失 → S3 两个文件各红一例。

## 未完成 / 未验证

- **第一次 model-cost 分区运行出现 1 例失败**（非本票断言）：`pi-disposal-round-close.test.ts`「leaving a session for another one closes no Round…」报 `no record for pi-disposal-child was published`。该文件单独运行、与本票新增文件三者合跑、以及整个分区重跑都通过；基线 worktree 同分区也通过。判定为本票新增的多个真实子进程文件带来的并行负载下，该用例自身「等待依赖真实 macrotask 的保存」的时序假设被放大的偶发失败，未被本票修改，也未在本票修复。日志两份都在（first-run 红、rerun 绿）。
- **未在真实 harness（pi / OMP）上运行**：本票的真实进程证据是「真实 bun 子进程 + 真实命名管道 + 生产前端与详情模型」，未执行 `bun scripts/pi-subagent-smoke.ts` 等真机 smoke，也未在 OMP 上做回归观察。真实宿主的来源失效（子进程退出后 Owner 观察到 `session_unobserved`）因此仍属未验证，需由集成阶段或有真机环境的票据补齐。
- **POSIX 未验证**：仅 Windows 证据；命名管道与套接字文件差异未取得运行证据。
- 本票未改动 `framework/adapters/*`、`round-events.ts` 的既有语义；`session_unobserved` 为新增事件种类，既有扩展声明不受影响（`tests/framework`、`tests/model-cost` 全绿，`tests/codebase-tools`、`tests/connect-bot`、`tests/harness-dock` 未在本票范围内运行）。
