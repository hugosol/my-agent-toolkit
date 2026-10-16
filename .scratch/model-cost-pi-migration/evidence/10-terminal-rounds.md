# 10：两端终止、晚到与恢复边界（记录）

**本文件是本票交付的验证记录**：取消与终态失败在本地原生活动最终结算后结束 Round、不被后台保活阻挡（P21）、已结束轮不重开而真正执行才开新轮（P22）、恢复/重载不伪造轮边界（P23）的实现、自动与真实宿主证据。本文件不改承诺、不改 seam，也不重复认领其它票的条目。

- **入口（可重跑）**：
  - `bun test tests/framework/round-events.test.ts`（公共合成规则，S1 的适配器契约面）
  - `bun test tests/framework/round.test.ts`（OMP adapter 映射 + 合成，S1）
  - `bun test tests/framework/pi-background-rounds.test.ts`（pi adapter 映射 + 提供方保活，S1）
  - `bun test tests/model-cost/pi-terminal-rounds.test.ts`（生产 pi 装配的 S1/S2/S3 分区）
  - `bun test tests/framework`、`bun test tests/model-cost`（所属分区 + 共同契约消费者）
  - `bun test tests/connect-bot`（另一 OMP 消费者；见 §5 的环境性失败）
  - `bun test tests/harness-dock/round-facts.test.ts`（OMP 真实宿主 dock：本轮语义的对应文件）
  - `bun run typecheck`
  - `bun scripts/pi-terminal-round-smoke.ts [--keep] [--pi <path>]`（真实宿主入口；见 §3）
- **源状态**：分支 `hyper/model-cost-pi-migration/10-terminal-rounds-2756dc-411dc288ea83`，起点 `8a631cb`（09 合入后的集成分支）。本票改动：`framework/core/protocol.ts`、`framework/behaviors/round-events.ts`、`framework/adapters/pi/round.ts`、`framework/adapters/pi/turn.ts`（导出既有 outcome 映射）、`framework/adapters/omp/round.ts`、`framework/adapters/omp/turn.ts`（同上）、`framework/docs/harness-support.md`（两行：`work.async-job-snapshot`、`work.pending-message-visibility`）、`tests/framework/round.test.ts`、`tests/framework/round-events.test.ts`、`tests/framework/pi-background-rounds.test.ts`、`tests/framework/support/harness-port-double.ts`、`tests/connect-bot/support/omp-double.ts`（消费者适配新原生订阅）、新增 `tests/model-cost/pi-terminal-rounds.test.ts`、新增 `tests/harness-dock/fixtures/pi-terminal-rounds/{entrypoint,prefix}.ts`、新增 `scripts/pi-terminal-round-smoke.ts`、本文件。**本票未改** `extensions/model-cost/**`、`entrypoints/**`、`framework/adapters/pi.ts` 与 `omp.ts` 的装配代码（两侧装配的 `frame`/`background` 注入形状无需改变）。
- **环境**：win32 10.0.26200 / x64 / bun 1.4.2 / node v24.18.0；真实宿主 pi 1.2.0（`D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`）、第三方工件 `pi-subagents@0.78.0`（本仓库 `node_modules/pi-subagents`）。无 provider 凭据、无付费调用：所有模型请求都由本机 OpenAI 兼容捕获端点回答。OMP 侧真实宿主为 `tests/harness-dock` 的隔离安装。

## 1. 交付的行为（本票实现）

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| 活动结局事实 | `framework/core/protocol.ts` | `RoundSignal` 的 `settled` 增加可选 `outcome`（复用既有 `TurnOutcome` 三值词汇）。它是**内部信号**，不是公共 round edge 的字段：`RoundEvent`/`RoundDelivery` 仍然只有 `kind`。缺省表示该面没有确立结局，且**不等于** completed。 |
| 静止条件的拆分 | 同上 `RoundObservation` | `quiescent()` 收窄为**本 run 自身的静止**（idle、无排队、自身工作已收），新增 `heldWork()` 表示**run 之外仍持有本会话的工作**（派发中的委派、会唤醒它的异步 job）：`false` 才允许普通 settle 关轮，`true` 与 `undefined` 都不允许。 |
| 终止原则的公共合成 | `framework/behaviors/round-events.ts` | 候选重检先读 `quiescent()`；**仅当**该 settle 的结局是 `cancelled`/`failed` 时，本地静止即足以确认结束（不再读 `heldWork()`）；其余 settle 必须得到 `heldWork() === false`。结局本身不触发任何边，仍由候选 + 本地实读确认。 |
| pi 结局读取 | `framework/adapters/pi/round.ts` | 每会话记录当前活动结局：`agent_settled.aborted` → `cancelled`，否则取最后一条 finalized assistant message 的 `stopReason`（与 Turn 轴同一个 `outcomeOf`）；`agent_start` 清空，避免旧结局串到新活动。 |
| OMP 结局读取 | `framework/adapters/omp/round.ts` | 同上：从 `message_end` 的最终 assistant 消息取结局（与 Turn 轴同一个 `outcomeOf`），`agent_start` 清空。 |
| 两台适配的静止拆分 | 两个 `round.ts` | pi：`quiescent` = `isIdle && !hasPendingMessages`，`heldWork` = 提供方 `isActive()` 的 holds/clear/unread 三态；OMP：`quiescent` 同上，`heldWork` = `getAsyncJobSnapshot().running` 非空。 |
| 说明与消费者同步 | `framework/docs/harness-support.md`、`tests/connect-bot/support/omp-double.ts` | 两行 documented fact 补上终止规则；connect-bot 的原生面 double 记录 round 轴新订阅的 `message_end`（公共映射新增订阅的受影响消费者）。 |

## 2. S1/S2/S3 自动证据（真实运行）

```
$ bun run typecheck                                                    # tsc --noEmit，无输出
$ bun test tests/framework                                              # 482 pass / 0 fail（37 files, 2216 expect, 39.5s）
$ bun test tests/model-cost                                             # 405 pass / 0 fail（33 files, 2085 expect, 8.1s）
$ bun test tests/harness-dock/round-facts.test.ts                        # 2 pass / 0 fail（OMP 真实宿主 dock）
$ bun test tests/connect-bot                                             # 137 pass / 5 fail（见 §5：真实 omp-bot 面板二进制缺失，环境性）
```

- **P21（S1，公共合成）**：`tests/framework/round-events.test.ts` 新分区以 port double 直接驱动公共观测：`cancelled`/`failed` + `heldWork: true` 关轮；`completed` + `heldWork: true` 不关轮、`heldWork: false` 才关轮；未确立结局的 settle 不算取消；`quiescent: false` 时即使结局是 cancelled 也不关轮（结算前不关轮）。
- **P21（S1，两台适配的真实映射面）**：
  - OMP（`tests/framework/round.test.ts`）：会话仍有 running job 时，aborted/errored 活动照常关轮；同一 running job 下普通回答仍保持开轮直到 job 排空；**会重试的错误**（`willContinue: true`）根本不成为候选，重试后的回答仍按 job 判定；关轮不向宿主新增任何注册（`nativeCalls()` 前后相等，"不为关轮额外停子或清队列"的负向证据）。
  - pi（`tests/framework/pi-background-rounds.test.ts`）：提供方 `isActive()` 恒真时，aborted/errored 活动关轮；普通回答仍保持开轮直到提供方答复 clear；重试中的 `agent_end` 不产生候选；无轮在开的 settle 不关任何轮。
- **P22（S1）**：两个适配面都覆盖"已结束轮不重开"：取消后再次到来的 settle 只关空、不重开；真正开始执行（`agent_start`）才开新轮，且新活动不继承旧结局。
- **P23（S1）**：`agent_start`/`agent_settled` 之外的恢复路径：无轮在开时的 settle 不产生任何边（两个分区皆有）；`tests/framework/pi-round-mapping.test.ts` 既有的"恢复会话不伪造完成"用例仍绿。
- **P21/P22/P23（S2/S3，生产 pi 装配）**：`tests/model-cost/pi-terminal-rounds.test.ts`（4 例）用真实 pi adapter + 真实 definition/runtime/前端 + 本 run 自己的 `config.yaml` 绑定受控原生面，并注册固定提供方的公开保活：
  - 中断的活动在提供方仍报"持有"时结束该轮，该轮的边界把**真正完成的那次请求**存进 `pi` 分区（1 次请求的用量；被中断的那次请求 `usage=<none>` 不计入，也不伪造为零）；
  - 同一持有下普通回答保持开轮、文档不写，提供方 clear 后才关轮并保存；
  - 失败的轮结束后：结果追加（非模型最终消息）不重开轮、文档逐字节不变；用户随后的真正执行开新轮、以新轮边界累加到已保存记录（`saveVersion` 递增，桶与金额为手算字面量）；
  - 第二个装配（同存储根）读回的就是已保存 Session 的累计，`roundTotals` 为 `undefined`（不猜 Round 零值）；给它一个它没见过的 settle 不产生任何轮、文档逐字节不变；记录里没有历史轮明细字段。

**故障注入（每条注入后立即还原并复跑绿）**

| 注入 | 结果 |
| --- | --- |
| 公共合成改回"任何 settle 都要 `heldWork() === false`"（即取消豁免被去掉） | 4 个分区共 **12 条**失败：`round-events.test.ts` 2 条、`round.test.ts` 4 条、`pi-background-rounds.test.ts` 3 条、`pi-terminal-rounds.test.ts` 2 条（对比用例仍绿，说明对照片段不是同义反复） |

## 3. 真实宿主事实（本机实测，源不变）

`bun scripts/pi-terminal-round-smoke.ts` 一次运行（隔离 home/agent/session/work 目录 + 捕获端点 + 运行自带 layout；不写操作者真实存储根），pi 1.2.0 + `pi-subagents@0.78.0`，17 项观察全部成立（约 91 s）：

1. 宿主是固定版本、固定工件在位；
2. 后台委派真的启动，提供方自己的 async 工件说它仍在运行；
3. **取消真的发生**：pi 自己的最终结算帧报 `aborted: true`（经 RPC `abort` 命令，即在运行中触发）；
4. **被中断的轮在提供方仍报"持有"时结束**：公共边为 `round_start,round_end`，而此刻提供方自己的 async 工件仍说该委派 live——普通回答会用这条事实继续挂轮，被取消的活动不会；
5. **该轮的关轮边界把本会话真正完成的请求存进了文档**（本会话 1 次计入 = 捕获端点用量；探针只记到 1 条 `usage=reported`，被中断的那条 `usage=<none>`）；
6. **晚到结果只追加不开轮**：委派进入终态后，提供方把结果**追加**到会话（会话 journal 出现 `customType=subagent-notify` 的 `custom_message`），3 s 观察窗内探针没有任何新 Turn、没有新轮，文档逐字节不变；
7. **真正执行才开新轮**：用户随后的 prompt 开出**另一身份**的新轮（`round=…#1` → `…#2`，旧轮的 Turn 仍标 `#1`），该轮正常开闭并把新增请求累加到已保存记录；
8. **恢复不伪造**：第二个进程用 `--session <原会话文件>` 恢复同一会话（同一个 session id），在任何活动前**没有产生任何 round 边**，文档与首个进程留下的一致；它自己的活动正常开闭一轮，并把新增量累加到读回的记录上。

两条如实记录、不当作通过：本次运行里被委派的子会话**自己的**记录未出现在文档里（`other sessions' records: []`，与 [08 记录](08-session-accounting.md) §3.2 的跨进程子记账缺口一致，非本票范围）；本宿主以 RPC 模式驱动，而该模式**发布 UI 通道**，因此提供方对"被取消会话的唤醒"的 `hasUI` 条件在此生效——观察到的是"通知被追加、唤醒未自行启动执行"，这既是本票要覆盖的"仅追加不开轮"，也说明该 `hasUI` 条件不能泛化为所有 RPC/headless 路径。真实交互终端与窄宽度观感属 P52。

## 4. 归属与复用

- **复用（已复核有效）**：`tests/framework/round.test.ts`（F6/P8 的 OMP 合成先例）、`tests/framework/pi-round-mapping.test.ts`（pi 的 start/settle/恢复先例）、[09 的保活登记仪式](09-background-rounds.md)（`tests/framework/support/pi-surface-double.ts` 的提供方注册）与 [08 的生产 pi 装配先例](08-session-accounting.md)（`tests/model-cost/pi-session-accounting.test.ts` 的绑定与文档读回形状）。本票在其上补的是**终止结算后的关轮**、**晚到/真正执行的区分**与**恢复不伪造**，并新增公共合成这一层的规则测试。
- **未认领**：P18 的正常继续与 P19/P20 的保活接续属 [09]（本票只在其场景上补两端终止）；P24–P27 的子代理耗时属 [11]；P50/P51 的完整两端回归与效率判断属相应票（本票只跑本变更的对应消费者与一个 OMP dock 文件）。

## 5. 未验证 / 未覆盖

1. **OMP 真实宿主的取消/终态失败路径**：本轮只运行了 `tests/harness-dock/round-facts.test.ts`（该文件覆盖普通继续与关轮保存）；OMP 的显式取消/失败真实路径未驱动（dock 无对应用例，且本票范围不新建 OMP 执行器）。OMP 侧的证据为 S1 的适配器合成用例 + 公共合成用例。
2. **`tests/connect-bot` 的 5 条失败**：`panel-registration-lifecycle.test.ts` 的 3 例与 `frozen-protocol`/`exit-budget` 的 2 例需要真实 omp-bot 面板二进制（`C:\Users\hugos\AppData\Local\Temp\omp-bot\backend\target\release\omp-bot.exe`），本机缺失即报错退出，与本票改动无关（同一失败在改动前即由该二进制缺失触发；未运行改动前基线以作对照，仅按错误签名与本票未触及该二进制的事实归类）。同分区的其余 137 例绿，含本票适配过的 `support/omp-double.ts`。
3. **交互终端（UI）路径**：本票的真实宿主运行是 pi 的 RPC 模式。该模式的进程**发布** UI 通道，因此提供方对"被取消会话的唤醒"的 `hasUI` 条件在此生效（见 §3），但真实交互终端的观感与窄宽度仍属 P52 的人类验收，本票不作断言。
4. **本轮运行前的基线对照**：§2 的故障注入只覆盖公共合成的终止豁免一行；未做逐字段全量变异测试。
5. **POSIX**：所有运行都在 win32；POSIX 未运行。
6. **操作者真实存储根**：本票只读核对（未写入、未清理）。
