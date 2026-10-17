# 07 证据：观察按事件去重，展示合并采用最新值（P14、P15）

平台：Windows 10.0.26200（win32 x64）；bun 1.4.2；TypeScript 7.0.2；pi 1.3.0。所有命令在本 worktree 内运行。

## 实现（做了什么）

**P14 —— 采集与发布按事件发生、相同读数不重复发布、不新增逐 token 或持续轮询流量。**
本轮核对既有采集点与去重，未发现需要新增或修改的采集路径：两个 adapter 都只在承诺的三个宿主事实上采集上下文
（OMP：`session_start` / `message_end` / `agent_end`；pi：`session_start` / `message_end` / `agent_settled`），
`SessionObservations.observeContext` / `observeActivity` 对未变化的读数返回 `false`，因而框架不派发、不跨进程交付、
extension 也不收到。OMP 的 `message_update` 只映射 Turn 轴的 `usage_streamed`（且按相同读数去重），不产生任何
extension 交付。本轮的交付是把这三条以**实际计数**钉住（见下），并证明"合并重绘"没有引入轮询或逐 chunk 流量。

**P15 —— 同一批可合并的观察更新使展示采用最新结果，不要求每条消息独立绘制。**
新增 `extensions/model-cost/shared-logic/presentation/coalesced-redraw.ts`：display 的**合并重绘**。

- 移动的读数只**请求**重绘，不自己重绘：一个 turn 里的第一次请求把重绘安排在**该 turn 结束时**（微任务边界），
  同一 turn 里的后续请求并入同一次，重绘时读取当时的最新值。
- **采用不延后**：读数在交付返回时就已经进入 framework 的观察源与 extension 的 registries，等待的只有绘制。
- **已被本 turn 的发布覆盖的请求会作废**：`published` 订阅本实例的只读结果发布（`accounting.view.subscribe`），
  任何本 turn 已发生的发布都让读者读到了这些读数，因此该 turn 欠下的重绘被它花掉——这既避免同一批读数画两次，
  也保证结算类发布仍然**就地立即**发生（Round 边界、Turn settle、会话快照保存都不经过合并）。
- 不是窗口、不是轮询、不是帧预算：没有时长、没有 timer、没有重复尝试；静止进程既不欠也不安排任何重绘。
- `runtime.ts`：观察两个通道（`session_activity` 移动时、`session_context`）改走 `redraw.request()`；
  `cleanup` 里 `redraw.dispose()`。结算与 provider 读数发布路径不变。
- 受影响的既有消费者：`tests/model-cost/detail-tree-live-sessions.test.ts`（票据 04）在读取**帧**之前增加
  `await readingTurnEnded()`（读源与展示结果的地方不变）——一个 turn 的重绘发生在该 turn 结束时。

## 验收对照

见文末"运行的命令与结果"小节中的实测数字。

| 票据条目 | 证据 | 结果 |
|---|---|---|
| 固定事件序列与独立给定重复值下记录实际发布／通知，相同读数不重复发布；启动快照与有效重连语义不变 | `tests/model-cost/observation-notice-frequency.test.ts`：pi 真 adapter 的四个采集点（1000 / 1000 / 2000 / 2000）只发布 `[1000, 2000]`；extension 侧同一形状只通知 1 次／变化 | pass |
| 静止窗口与实际流式响应中记录通知，无新增持续轮询、逐 token 发布或运行耗时跳动 | 同文件：OMP 真 adapter 上 40 个 chunk 事实（每 chunk 的宿主读数都在增长）零发布、零 Turn 边；1 分钟宿主时钟内（伪时钟）零发布零绘制；变异注入（每 chunk 采集 / 轮询 interval）均被捕获 | pass |
| 受控交付多会话、多字段更新，各最新值保留且存在可观测的合并重绘 | `tests/model-cost/observation-redraw-merge.test.ts`：3 会话 × 2 轴共 6 次交付 → 1 帧，行上分别是最新 10,000 / 20,000 / 30,000；`...-processes.test.ts`：真子进程经真 named pipe 交付 3 条读数 → 实测 2 帧 | pass |
| 合并只影响展示请求：不丢弃影响结算的生命周期事实，不延后内存采用 | 同文件：读数交付后**同步**断言观察源与 activity registry 已持有；Round 边界与 Turn settle 在同一 turn 立即处理并发布，且带读数与不带读数的对照帧数相等 | pass |
| 在实际终端观察最新结果并测量通知／绘制次数与成本，分开记录采集、通信、绘制 | 真 pi TUI 终端捕获（`--widths 120,80`，pty 真 TUI）：34 ok，唯一失败是脚本自钉的 `pi 1.2.0` 与本机 1.3.0 不符（环境限制）；真 patched OMP host 的 dock 分区（含 `efficiency-effects` 对空闲窗口 0 效应与帧数不增的断言）；计数见下"三个计数分开记录" | pass（限制见末） |
| 按仓库测试规范执行受控事件与合并边界测试、所属分区与展示消费者，TypeScript 变化执行 typecheck | 见下 | pass |

## 运行的命令与结果

### 类型与分区

- `bun run typecheck` → **exit 0**（多次；最终树一次）。
- `bun test tests/model-cost` → **491 pass / 0 fail**（47 files；改前 478，本票新增 13 例：合并用例 7 + 事件/频率用例 4 + 真进程用例 2）。
- `bun test tests/framework` → **555 pass / 0 fail**（46 files）。
- 真宿主分区（归一冻结文件 + `OMP_BOT_BINARY=E:/Developer/myhub/omp-bot/backend/target/release/omp-bot.exe`
  `bun test tests/harness-dock`）→ **107 pass / 0 fail**（28 files，278s，exit 0；日志
  `logs/07-dock-normalized.log`）。逐字未归一时同分区为 105 pass / 2 fail，两处都是 `bun.lock` 的**检出换行**
  与基线记录哈希不符（`baseline.test.ts`、`session-driver.test.ts`），与逐字归一后同为票据 02/03/04/10 记录的既有
  环境问题：`host-patches/*/patch.diff` 与 `bun.lock` 在本 worktree 被 `core.autocrlf=true` 检出为 CRLF。
  证据记录按既有做法把这三处工作区文件**临时**归一为 LF（未提交，内容与 `git cat-file blob HEAD:<path>` 相同）后运行；
  运行结束已还原为检出态，提交中不含这些换行变化。
- 受影响消费者：`tests/model-cost/detail-tree-live-sessions.test.ts`（票据 04）在读取**帧**处增加一个 turn 的等待
  （读观察源与展示结果的地方不变），本票内已更新并复跑绿。

### 真机与真终端（S3）

- `bun scripts/pi-subagent-smoke.ts --background-only --expect-pi-version 1.3.0` → **exit 0，10/10 观察项通过**
  （25.4s；日志 `logs/07-pi-subagent-smoke-background.log`）。其中与本票直接相关的是
  `the owner's own observation source holds the reading that arrived` 与
  `the child's context reading reached the owner's process with the model it was read at`：真 pi 1.3.0 上，
  另一个进程的子会话读数按既有路径发布，本票改动不改变交付，也不增加每次 chunk 的流量。
  **一次未复现的失败需记录**：本票首次运行在该阶段更早的既有断言
  `the spawned session registered with the owner's process before its first Round ended` 上失败（细节显示该子会话
  当时已经有落盘记录），随后同树连跑两次均 10/10 通过；在**未含本票改动**的 `git archive HEAD` 干净副本上
  同样 10/10 通过（控制运行）。该断言读的是"读到第一行观察时子会话尚未提交"，其成立与否取决于另一个进程的提交与本
  进程读取的先后，属既有测试的时序竞争，与本票改动无因果关系（本票只把**绘制**移到一个 turn 的末尾，结算与保存
  路径未触碰）。
- `bun scripts/pi-tui-acceptance.ts --widths 120,80 --out <temp>` → **34 ok / 1 failed**（12.7s；日志
  `logs/07-pi-tui-acceptance.log`）。唯一失败为 `the run drove the pi version this acceptance states — pi reported
  1.3.0, expected 1.2.0`：脚本自钉 1.2.0，本机安装的是 1.3.0（既有环境不符，本票不改这个脚本）。所有内容检查
  通过：真 pi TUI 在 120/80 两列宽、brief 与 detail 两形态下都画出各会话自己的金额、`Run:` 标记、`?(?)` 未证明
  起点、三级缩进与 Total 行，收窄后金额与运行标记保持完整——即**实际终端**上读到的是最新读数。
- `bun run smoke:model-cost-detail-layout-terminal`（真 Windows 控制台设备）：本 shell 无控制台设备，脚本按设计
  拒绝运行（提示需在真终端或 `wt.exe` 新窗口中运行）。**未运行，计为限制**；真终端观察由上面的 pi TUI 捕获（真
  PTY）承担。

### 变异注入（每条注入后还原并复跑绿）

| 注入 | 结果 |
|---|---|
| 合并重绘改为立即重绘（`request()` 直接 `redraw()`） | `observation-redraw-merge.test.ts` 7 例中 5 例红（6 次交付 → 7 帧，逐条绘制） |
| 去掉"本 turn 已发布即花掉欠下的重绘"（`published` 不再清 owed） | 1 例红（带读数 2 帧 vs 不带读数 1 帧） |
| 框架去重取消（`observeContext` 永远视作变化） | 三个新文件共 5 例红（重复读数被重复发布／重绘，含真进程重复交付） |
| OMP adapter 增加每 chunk 采集（`pi.on("message_update", …collect)`） | 流式用例红（40 个 chunk 被发布 40 次） |
| runtime 里加 5s 轮询发布 | 静止窗口用例红（宿主时钟 1 分钟内 15 帧） |

### 三个计数分开记录（采集 / 通信（发布·通知）/ 绘制）

均为本票用例中**被测实现之外**的计数（框架交付、extension 通知、宿主帧），不是实现自报的数字：

- **采集**：一个流式响应 40 个 chunk 事实 → 只在声明的三个宿主事实上采集到 **2** 次读数（`1000` 于会话开始、
  `2000` 于 message_end；随后的 `agent_end` 读到同一读数、不产生新采集值）。真 pi 后台 smoke 上，子会话的上下文
  读数到达 Owner 进程并被观察源持有（见上）。
- **通信（发布／通知）**：固定序列 4 个采集点（1000 / 1000 / 2000 / 2000）→ **2** 次发布；重复读数 → **0**；
  流式响应 40 chunk → **0** 次发布、**0** 个 Turn 边；extension 侧同一形状 → 每变化 **1** 次通知；静止窗口（宿主
  时钟 1 分钟）→ **0** 次发布、**0** 次通知。真宿主上既有 `efficiency-effects` 的断言在真实 OMP host 的空闲窗口
  内也要求帧数与效应都不增加（本次分区运行通过）。
- **绘制**：同一 turn 内 3 会话 × 2 轴共 6 次交付 → **1** 帧（三行分别是最新 10,000 / 20,000 / 30,000）；同一会话
  同 turn 两次读数 → **1** 帧且画最新值；不同 turn → 各自 **1** 帧；真子进程经真 named pipe 交付 3 条读数（6 次
  交付）→ 实测 **2** 帧（载体按自己的方式合并该进程的写入，故用例断言的是上界 ≤ 读数条数，实测值记录在此）；静止
  窗口 1 分钟 → **0** 帧。
- 未测量而**不作声明**的：单帧 CPU／内存成本、跨平台开销、其他宿主版本的开销。本票不声称"零开销"或最优效率，
  只声称上述计数。

## 未验证项与限制

- 平台：只覆盖 Windows 10.0.26200；POSIX 载体、其他 pi／OMP 版本未运行。
- 真 Windows 控制台设备 smoke 未运行（本 shell 无控制台设备）；真终端观察由 pi TUI 捕获（真 PTY）承担。
- `scripts/pi-tui-acceptance.ts` 自钉 `pi 1.2.0`，与本机 1.3.0 不符，该脚本的版本检查项失败属既有环境不符，
  不是内容失败；本票不改该脚本。
- 一次性未复现的 smoke 时序竞争见上（同树复跑与干净 HEAD 对照均通过）。
- 本票不覆盖其他票据的承诺；01–04 的交付证据不替代本票的通信频率与绘制成本验收，本票也不为它们背书。
- 合入 `hyper-tdd` 由独立集成子代理完成；本记录只陈述本票据分支上的实际运行结果。

